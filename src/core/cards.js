// "Cards" of the analysis: findings about a sheet in plain language, the kind a supervisor would ask about.
// Most important first: a production time that includes a stop, two records on the same time, stops longer
// than usual, time with no record at all. Pure functions on the events built by analysis.js.
//
// Precision matters more than volume: every card says exactly what was read (dates and times) so the person can
// judge it against the sheet, and crossings of a few minutes are treated as rounding, not as a wrong note.
import { whoText } from './operators.js';
import { shiftOfTime } from './turno.js';

// How long each reason normally takes, in minutes: about the 90th percentile of the ~2,200 stops in the
// real control spreadsheet (the waiting reasons use a lower point, because long waits are common).
// Longer than this deserves an explanation. Edit freely.
export const LIMITE_PARADA = {
  'TROCA DE PEÇA': 30, 'SET-UP': 40, 'CONSUMIVEIS': 40, 'PONTE ROLANTE': 30, 'TYOREI': 60,
  'MECÂNICA': 120, 'ELÉTRICA': 120, 'OUTROS': 90, 'AGUARD. PEÇA': 150, 'FALTA DE PEÇA': 360, 'PREVENTIVA': 180,
};
const LIMITE_PADRAO = 45;
export const MIN_COVER = 15;      // minutes two records must share before it is called a wrong note (below: rounding)
const CONTAINED_MIN = 5;          // a stop that lies fully inside a production is a wrong note even when short
const MEAL = /almo[cç]o|jant[ae]|jantar|refei[cç]|lanche/i; // a meal break of up to 1h30 is normal, not a long stop
const GAP_MIN = 20, GAP_MAX = 6 * 60;

const clock = (abs) => { const m = ((abs % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dur = (min) => { const m = Math.round(min); return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`; };
const range = (e) => `${clock(e.start)}–${clock(e.end)}`;
const dayOf = (page) => (page?.date || '').slice(0, 5) || 'sem data';
const nome = (m) => (m ? m.charAt(0) + m.slice(1).toLowerCase() : 'sem motivo');
const andList = (a) => (a.length > 1 ? `${a.slice(0, -1).join(', ')} e ${a.at(-1)}` : a[0] ?? '');
// a time that is implausible for what it is: it may have been misread rather than written wrong
const suspect = (e) => {
  if (e.type !== 'stop') return '';
  const lim = LIMITE_PARADA[e.motivo] ?? LIMITE_PADRAO, d = e.end - e.start;
  const quick = lim <= 60;
  return (quick ? d >= 90 && d >= lim * 2 : d >= lim * 4) ? `A parada ${range(e)} (${dur(d)} de ${nome(e.motivo)}) é muito longa para o motivo: confira se o horário foi lido certo.` : '';
};
const overlap = (a, b) => Math.min(a.end, b.end) - Math.max(a.start, b.start);

// "Produção linha 1 · 05/10/2026 · 12:00–15:00 · chapa 7910": exactly what the reading holds
const evLine = (e) => `${e.type === 'prod' ? 'Produção' : 'Parada'} linha ${e.linha || e.ri + 1} · ${e.data || 'sem data'} · ${range(e)}${e.type === 'stop' ? ` · ${nome(e.motivo)}` : ''}${e.chapa ? ` · chapa ${e.chapa}` : ''}`;
const ref = (e) => ({ table: e.table, linha: e.linha || e.ri + 1 });

// the parts of [a, b] left after taking the cuts out
function subtract(a, b, cuts) {
  const sorted = cuts.map(([x, y]) => [Math.max(x, a), Math.min(y, b)]).filter(([x, y]) => y > x).sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const c of sorted) { const last = merged.at(-1); if (last && c[0] <= last[1]) last[1] = Math.max(last[1], c[1]); else merged.push([...c]); }
  const pieces = []; let at = a;
  for (const [x, y] of merged) { if (x > at) pieces.push([at, x]); at = Math.max(at, y); }
  if (at < b) pieces.push([at, b]);
  return { pieces, cut: merged.reduce((s, [x, y]) => s + (y - x), 0) };
}

export function buildCards(events, pages, offDate = [], doubt = []) {
  const pageById = new Map(pages.map((p) => [p.id, p]));
  const cards = [];
  const add = (sev, kind, e, headline, extra = {}) => {
    const pg = pageById.get(e.page);
    // when the reading of this sheet has warnings, the card says so: the fault may be the reading, not the operator
    const parts = [pg?.rowWarn ? `A leitura desta folha tem aviso de linhas (${pg.rowWarn}). Confirme na folha antes de julgar.` : '', ...(extra.suspects ?? [])].filter(Boolean);
    const caution = parts.join(' ');
    cards.push({ sev, kind, machine: e.machine, page: e.page, label: e.label, day: dayOf(pg), table: e.table, ri: e.ri, linha: e.linha, text: headline, headline, caution, ...extra });
  };
  const sheet = (e) => `${e.machine} · folha do dia ${dayOf(pageById.get(e.page))}`;

  const byMachine = new Map();
  for (const e of events) { if (!byMachine.has(e.machine)) byMachine.set(e.machine, []); byMachine.get(e.machine).push(e); }

  for (const [, list] of byMachine) {
    const sorted = [...list].sort((a, b) => a.start - b.start || a.end - b.end);
    const prods = sorted.filter((e) => e.type === 'prod'), stops = sorted.filter((e) => e.type === 'stop');

    // 1. RED: a production time that includes stops. A machine that is stopped is not producing, so the
    //    real production is the written time minus those stops (one card per production, listing all of them).
    for (const P of prods) {
      const inside = stops.filter((s) => overlap(P, s) >= MIN_COVER || (s.start >= P.start && s.end <= P.end && s.end - s.start >= CONTAINED_MIN));
      if (!inside.length) continue;
      const { pieces, cut } = subtract(P.start, P.end, inside.map((s) => [s.start, s.end]));
      const net = (P.end - P.start) - cut;
      const what = inside.length === 1 ? `uma parada (${range(inside[0])}, ${nome(inside[0].motivo)})` : `${inside.length} paradas (${andList(inside.map(range))})`;
      add('alta', 'produzindo parado', P,
        `${sheet(P)}: a produção da linha ${P.linha || P.ri + 1} foi anotada das ${range(P)} (${dur(P.end - P.start)}), mas há ${what} dentro desse horário. Máquina parada não produz: nesses ${dur(cut)} ela não estava produzindo.`,
        { suspects: inside.map(suspect), brief: inside.length === 1 ? `Produção ${range(P)} cobre a parada ${range(inside[0])} (${nome(inside[0].motivo)})` : `Produção ${range(P)} cobre ${inside.length} paradas`,
          big: dur(cut), bigLabel: 'parado dentro da produção',
          fix: pieces.length ? `Deveria ser ${andList(pieces.map(([x, y]) => `${clock(x)}–${clock(y)}`))}, que dá ${dur(net)} de produção.` : 'A produção inteira está coberta por paradas: um dos registros está errado.',
          why: 'Ou a produção foi anotada sem descontar a parada, ou o horário de um dos registros está errado. Confira na folha.',
          who: whoText([P.chapa, ...inside.map((s) => s.chapa)]), lines: [evLine(P), ...inside.map(evLine)], refs: [ref(P), ...inside.map(ref)] });
    }

    // 2. YELLOW: two records of the same kind on the same time (two productions, or two stops)
    for (const group of [prods, stops]) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length && group[j].start < group[i].end; j++) {
          const a = group[i], b = group[j];
          const ov = overlap(a, b);
          if (ov < MIN_COVER) continue;
          const t = a.type === 'prod' ? 'produções' : 'paradas';
          if (a.start === b.start && a.end === b.end) {
            // exactly the same time twice: almost always a repeated reading, not a wrong note by the operator
            add('media', 'turnos repetidos', b, `${sheet(b)}: o horário ${range(b)} aparece duas vezes (${a.table === b.table && a.ri === b.ri ? `linha ${b.linha || b.ri + 1}, em dois turnos` : `linhas ${a.linha || a.ri + 1} e ${b.linha || b.ri + 1}`}). Parece leitura repetida: confira na folha.`,
              { brief: `Horário ${range(b)} repetido ${a.table === b.table && a.ri === b.ri ? `na linha ${b.linha || b.ri + 1}` : `nas linhas ${a.linha || a.ri + 1} e ${b.linha || b.ri + 1}`}`, big: dur(ov), bigLabel: 'repetido', why: 'Provavelmente o horário foi lido duas vezes. Se estiver assim na folha, é anotação errada.', who: whoText([a.chapa, b.chapa]), lines: [evLine(a), evLine(b)], refs: [ref(a), ref(b)] });
            continue;
          }
          add('alta', 'registros sobrepostos', b,
            `${sheet(b)}: a folha tem duas ${t} no mesmo horário: ${evLine(a).split(' · ').slice(0, 1)[0].toLowerCase()} das ${range(a)} e ${evLine(b).split(' · ').slice(0, 1)[0].toLowerCase()} das ${range(b)}. Elas dividem ${dur(ov)}, e a máquina não faz duas coisas ao mesmo tempo.`,
            { suspects: [suspect(a), suspect(b)], brief: `Duas ${t}: ${range(a)} e ${range(b)}`, big: dur(ov), bigLabel: 'no mesmo horário', why: 'Um dos dois horários está errado. Confira na folha.', who: whoText([a.chapa, b.chapa]), lines: [evLine(a), evLine(b)], refs: [ref(a), ref(b)] });
        }
      }
    }

    // 3. ORANGE: a stop longer than what the reason normally takes
    for (const s of stops) {
      const d = s.end - s.start;
      const lim = LIMITE_PARADA[s.motivo] ?? LIMITE_PADRAO;
      const desc = (s.desc || '').trim();
      if (d <= lim || (MEAL.test(desc) && d <= 90)) continue;
      const quickKind = lim <= 60; // for quick stops a missing comment is serious; waiting reasons are long by nature
      const sev = (quickKind && !desc) || d >= lim * 2 ? 'alta' : 'media';
      add(sev, 'parada longa', s,
        `${sheet(s)}: ${nome(s.motivo)} de ${dur(d)} (${range(s)}); o normal é até ${dur(lim)}. ${desc ? `Ele comentou: "${desc}", mas vale validar se explica todo esse tempo.` : 'Não há comentário explicando.'}`,
        { brief: `${nome(s.motivo)} ${range(s)} · normal até ${dur(lim)} · ${desc ? 'com comentário' : 'sem comentário'}`, big: dur(d), bigLabel: `normal: ${dur(lim)}`,
          who: whoText([s.chapa]), lines: [evLine(s)], refs: [ref(s)] });
    }

    // 4. BLUE: nothing written between a production and a stop (one of the two times may be wrong)
    let cover = null;
    for (const e of sorted) {
      if (cover) {
        const gap = e.start - cover.end;
        const z = (m) => { const c = shiftOfTime(((m % 1440) + 1440) % 1440); return c?.certain ? c.shift : 'x'; };
        // a gap across the change of shift is normal: only gaps inside one shift are worth a card
        if (gap >= GAP_MIN && gap <= GAP_MAX && cover.type !== e.type && z(cover.end) === z(e.start) && z(e.start) !== 'x') {
          add('media', 'sem registro', e, `${sheet(e)}: nada foi anotado entre ${clock(cover.end)} e ${clock(e.start)} (${dur(gap)}). Não sabemos se a máquina estava produzindo ou parada; um dos dois horários pode estar errado.`,
            { brief: `Nada anotado das ${clock(cover.end)} às ${clock(e.start)}`, big: dur(gap), bigLabel: 'sem registro', who: whoText([cover.chapa, e.chapa]), lines: [evLine(cover), evLine(e)], refs: [ref(cover), ref(e)] });
        }
      }
      if (!cover || e.end > cover.end) cover = e;
    }
  }
  // records whose time is still marked as doubtful in the review: not judged, listed so the person can finish checking them
  const doubtBy = new Map();
  for (const d of doubt) { const k = d.page; if (!doubtBy.has(k)) doubtBy.set(k, []); doubtBy.get(k).push(d); }
  for (const [page, list] of doubtBy) {
    const first = list[0];
    const dline = (d) => `${d.type === 'prod' ? 'Produção' : 'Parada'} linha ${d.linha || d.ri + 1} · ${d.data || 'sem data'} · ${d.ini || '??:??'}–${d.fim || '??:??'} · em dúvida: ${andList(d.fields.map((f) => ({ ini: 'início', fim: 'fim', data: 'data' }[f.replace(/\d$/, '')] ?? f)))}`;
    add('alta', 'em dúvida', first, `${first.machine} · folha do dia ${dayOf(pageById.get(page))}: ${list.length} registro(s) estão com o horário ou a data ainda marcados como dúvida na conferência. A análise só julga dado conferido, então eles não foram analisados. Volte à conferência, confirme ou corrija esses horários e dê o OK de novo.`,
      { brief: `${list.length} registro${list.length === 1 ? '' : 's'} com horário ainda em dúvida: não analisado${list.length === 1 ? '' : 's'}`, big: String(list.length), bigLabel: 'não analisado' + (list.length === 1 ? '' : 's'),
        why: 'Confirme o horário na conferência (revisão rápida) para o registro entrar na análise.', who: whoText(list.map((d) => d.chapa)), lines: list.map(dline), refs: list.map((d) => ({ table: d.table, linha: d.linha || d.ri + 1 })) });
  }

  // a row dated on another day than the rest of its sheet
  for (const o of offDate) {
    const pg = pageById.get(o.page);
    const what = o.table === 'prod' ? 'produção' : 'parada';
    add('media', 'data diferente', o, `${o.machine} · folha do dia ${dayOf(pg)}: a ${what} da linha ${o.linha || o.ri + 1} está com a data ${(o.data || '').slice(0, 5)}, mas as outras linhas da folha são do dia ${o.refText}. Para o cruzamento de horários o app usou o dia ${o.refText}. Confira a data na folha (pode ser leitura).`,
      { brief: `Linha ${o.linha || o.ri + 1} de ${what} com data ${(o.data || '').slice(0, 5)}; a folha é do dia ${o.refText}`, big: (o.data || '').slice(0, 5), bigLabel: `folha: ${o.refText}`, why: 'Ou a data foi anotada errada, ou a data foi lida errada. Confira na folha.', who: whoText([o.chapa]), lines: [`${what === 'produção' ? 'Produção' : 'Parada'} linha ${o.linha || o.ri + 1} · ${o.data}`], refs: [{ table: o.table, linha: o.linha || o.ri + 1 }] });
  }
  const RANK = { alta: 0, media: 1, info: 2 };
  return cards.sort((a, b) => RANK[a.sev] - RANK[b.sev]);
}
