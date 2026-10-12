// "Cards" of the analysis: plain-language findings about one sheet (machine + day), the kind a supervisor
// would ask about: producing while a stop was logged, stops longer than usual, time with no record at all.
// Pure functions on the events built by analysis.js.

// How long each reason normally takes, in minutes. Longer than this deserves an explanation (edit freely).
export const LIMITE_PARADA = {
  'TROCA DE PEÇA': 25, 'SET-UP': 45, 'CONSUMIVEIS': 20, 'MECÂNICA': 60, 'ELÉTRICA': 60,
  'PONTE ROLANTE': 20, 'AGUARD. PEÇA': 30, 'FALTA DE PEÇA': 30, 'PREVENTIVA': 120, 'OUTROS': 30, 'TYOREI': 30,
};
const LIMITE_PADRAO = 45;
const GAP_MIN = 10, GAP_MAX = 6 * 60, TOL = 1;

const clock = (abs) => { const m = ((abs % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dur = (min) => { const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const range = (e) => `${clock(e.start)}–${clock(e.end)}`;
const dayOf = (page) => (page.date || '').slice(0, 5) || 'sem data';
const nome = (m) => (m ? m.charAt(0) + m.slice(1).toLowerCase() : 'sem motivo');

// Timeline drawing data for a card: a window of time with coloured segments (prod / stop / conflict / excess / gap).
const clip = (seg, from, to) => (seg.end <= from || seg.start >= to ? null : { ...seg, start: Math.max(seg.start, from), end: Math.min(seg.end, to) });
function viz(segs, pad = 30, big, bigLabel) {
  const from = Math.min(...segs.map((x) => x.start)) - pad, to = Math.max(...segs.map((x) => x.end)) + pad;
  return { from, to, segs: segs.map((x) => clip(x, from, to)).filter(Boolean), big, bigLabel };
}
const S = (kind, e, extra = {}) => ({ kind, start: e.start, end: e.end, label: e.type === 'prod' ? 'Produção' : nome(e.motivo), motivo: e.motivo, ...extra });

export function buildCards(events, pages) {
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const cards = [];
  const add = (sev, kind, e, headline, chips, extra = {}) => {
    const page = pageById.get(e.page);
    cards.push({ sev, kind, machine: e.machine, page: e.page, label: e.label, day: page ? dayOf(page) : '', table: e.table, ri: e.ri, linha: e.linha, text: headline, headline, chips, ...extra });
  };
  const sheet = (e) => `${e.machine} · folha do dia ${dayOf(pageById.get(e.page) ?? {})}`;

  const byMachine = new Map();
  for (const e of events) { if (!byMachine.has(e.machine)) byMachine.set(e.machine, []); byMachine.get(e.machine).push(e); }

  for (const [, list] of byMachine) {
    const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);

    // 1. two records claiming the same time
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end - TOL; j++) {
        const a = sorted[i], b = sorted[j];
        const ov = Math.min(a.end, b.end) - b.start;
        if (ov <= TOL) continue;
        const stop = a.type === 'stop' ? a : b.type === 'stop' ? b : null;
        const prod = a.type === 'prod' ? a : b.type === 'prod' ? b : null;
        if (stop && prod) {
          const why = stop.desc ? ` (${stop.desc})` : '';
          add('alta', 'produzindo parado', stop,
            `${sheet(stop)}: a folha mostra produção das ${range(prod)}, mas também uma parada das ${range(stop)} por ${nome(stop.motivo)}${why}. Nos ${dur(ov)} em comum a máquina aparece produzindo e parada ao mesmo tempo, o que não pode acontecer.`,
            [`Produção linha ${prod.linha || prod.ri + 1}: ${range(prod)}`, `Parada linha ${stop.linha || stop.ri + 1}: ${range(stop)}`, `${dur(ov)} em conflito`],
            { why: 'Ou o operador não parou a produção no horário, ou a parada/produção foi anotada com o horário errado. Vale conferir com ele.',
              brief: `Produção ${range(prod)} e parada ${range(stop)} (${nome(stop.motivo)})`, refs: [{ table: 'prod', linha: prod.linha }, { table: 'stops', linha: stop.linha }],
              viz: viz([S('prod', prod), S('stop', stop), { kind: 'conflict', start: Math.max(a.start, b.start), end: Math.min(a.end, b.end), label: 'Conflito' }], 30, dur(ov), 'em conflito') });
        } else {
          const t = a.type === 'prod' ? 'produções' : 'paradas';
          add('alta', 'registros sobrepostos', b,
            `${sheet(b)}: a folha tem duas ${t} no mesmo horário: uma das ${range(a)} (linha ${a.linha || a.ri + 1}) e outra das ${range(b)} (linha ${b.linha || b.ri + 1}). Elas dividem ${dur(ov)}, e a máquina não faz duas coisas ao mesmo tempo, então um dos horários está errado.`,
            [`Linha ${a.linha || a.ri + 1}: ${range(a)}`, `Linha ${b.linha || b.ri + 1}: ${range(b)}`],
            { brief: `Duas ${t}: ${range(a)} e ${range(b)}`, refs: [{ table: a.table, linha: a.linha }, { table: b.table, linha: b.linha }],
              viz: viz([S(a.type, a), S(b.type, b), { kind: 'conflict', start: b.start, end: Math.min(a.end, b.end), label: 'Conflito' }], 30, dur(ov), 'no mesmo horário') });
        }
      }
    }

    // 2. a stop longer than what the reason normally takes
    for (const s of sorted) {
      if (s.type !== 'stop') continue;
      const d = s.end - s.start;
      const lim = LIMITE_PARADA[s.motivo] ?? LIMITE_PADRAO;
      if (d <= lim) continue;
      const desc = (s.desc || '').trim();
      const sev = !desc || d >= lim * 2 ? 'alta' : 'media';
      add(sev, 'parada longa', s,
        `${sheet(s)}: ${nome(s.motivo)} de ${dur(d)} (${range(s)}); o normal é até ${dur(lim)}. ${desc ? `Ele comentou: "${desc}", mas vale validar se explica todo esse tempo.` : 'Não há comentário explicando.'}`,
        [`Parada linha ${s.linha || s.ri + 1}`, `${dur(d)} contra ${dur(lim)} normal`, desc ? 'com comentário' : 'sem comentário'],
        { brief: `${nome(s.motivo)} ${range(s)} · normal até ${dur(lim)} · ${desc ? 'com comentário' : 'sem comentário'}`, refs: [{ table: 'stops', linha: s.linha }],
          viz: viz([S('stop', { ...s, end: s.start + lim }, { label: `${nome(s.motivo)} (normal)` }), { kind: 'excess', start: s.start + lim, end: s.end, label: 'Passou do normal' }], 30, dur(d), `normal: ${dur(lim)}`) });
    }

    // 3. no record at all between two records of the same shift
    let cover = null;
    for (const e of sorted) {
      if (cover) {
        const gap = e.start - cover.end;
        if (gap >= GAP_MIN && gap <= GAP_MAX) {
          const mixed = cover.type !== e.type;
          add(mixed ? 'media' : 'info', 'sem registro', e,
            `${sheet(e)}: nada foi anotado entre ${clock(cover.end)} e ${clock(e.start)} (${dur(gap)}). Não sabemos se a máquina estava produzindo ou parada${mixed ? '; um dos dois horários pode estar errado' : ''}.`,
            [`Antes: ${cover.type === 'prod' ? 'produção' : 'parada'} até ${clock(cover.end)}`, `Depois: ${e.type === 'prod' ? 'produção' : 'parada'} desde ${clock(e.start)}`, `${dur(gap)} sem registro`],
            { brief: `Nada anotado das ${clock(cover.end)} às ${clock(e.start)}`, refs: [{ table: cover.table, linha: cover.linha }, { table: e.table, linha: e.linha }],
              viz: viz([S(cover.type, cover), { kind: 'gap', start: cover.end, end: e.start, label: 'Sem registro' }, S(e.type, e)].map((x, i, arr) => (i === 1 ? x : x)), 45, dur(gap), 'sem registro') });
        }
      }
      if (!cover || e.end > cover.end) cover = e;
    }
  }
  const RANK = { alta: 0, media: 1, info: 2 };
  return cards.sort((a, b) => RANK[a.sev] - RANK[b.sev]);
}
