// Analysis of a REVIEWED reading: cross-checks production against stops on one timeline per machine,
// summarises stop time by reason and compares real production time with the standard time.
// Pure functions, no browser APIs.
import { PADRAO } from '../data/padrao.js';
import { aliasKey } from './lists.js';
import { buildCards } from './cards.js';
import { buildQuality } from './quality.js';

export const GAP_MIN = 10;        // minutes without any record that deserve a look
export const GAP_MAX = 6 * 60;    // beyond this the machine is considered not scheduled (night, weekend…)
export const OVERLAP_TOL = 1;     // minutes of tolerance when two records touch
export const OVER_STD = 1.3;      // real time above 130 % of the standard
export const UNDER_STD = 0.6;     // real time below 60 % of the standard (often a wrong time)

const STD = new Map(PADRAO.map(([m, p, mo, h]) => [`${aliasKey(m)}|${aliasKey(p)}|${aliasKey(mo)}`, h]));
export const standardHours = (machine, peca, modelo) => STD.get(`${aliasKey(machine)}|${aliasKey(peca)}|${aliasKey(modelo)}`) ?? null;

const toMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t ?? ''); return m ? +m[1] * 60 + +m[2] : null; };
const dayNum = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5 : null; };

export function fmtDur(min) {
  const m = Math.round(min);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
}
const clock = (abs) => { const m = ((abs % 1440) + 1440) % 1440; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

// ---- events ---------------------------------------------------------------

function segment(date, ini, fim) {
  const d = dayNum(date), a = toMin(ini), b = toMin(fim);
  if (d == null || a == null || b == null) return null;
  const start = d * 1440 + a;
  let end = d * 1440 + b;
  if (end <= start) end += 1440; // crosses midnight
  return { start, end };
}

export function buildEvents(pages) {
  const events = [], skipped = [];
  for (const page of pages) {
    const machine = page.machine || 'SEM MÁQUINA';
    const base = { machine, page: page.id, label: page.label };
    page.prod.forEach((r, ri) => {
      for (const n of [1, 2, 3]) {
        if (!r[`ini${n}`] && !r[`fim${n}`]) continue;
        const seg = segment(r.data, r[`ini${n}`], r[`fim${n}`]);
        if (!seg) { skipped.push({ ...base, table: 'prod', ri, linha: r.linha, text: `Produção da linha ${r.linha || ri + 1}: data ou horário incompleto, ficou fora do cruzamento` }); continue; }
        events.push({ ...base, type: 'prod', table: 'prod', ri, linha: r.linha, turno: n, ...seg, chapa: r[`chapa${n}`], peca: r.peca, modelo: r.modelo });
      }
    });
    page.stops.forEach((r, ri) => {
      if (!r.ini && !r.fim) return;
      const seg = segment(r.data, r.ini, r.fim);
      if (!seg) { skipped.push({ ...base, table: 'stops', ri, linha: r.linha, text: `Parada da linha ${r.linha || ri + 1}: data ou horário incompleto, ficou fora do cruzamento` }); return; }
      events.push({ ...base, type: 'stop', table: 'stops', ri, linha: r.linha, ...seg, chapa: r.chapa, motivo: r.motivo, desc: r.desc });
    });
  }
  return { events, skipped };
}

// ---- cross-check on one machine -------------------------------------------

const KIND = { prod: 'produção', stop: 'parada' };
const describe = (e) => `${KIND[e.type]} ${clock(e.start)}–${clock(e.end)} (linha ${e.linha || e.ri + 1}${e.type === 'stop' && e.motivo ? `, ${e.motivo}` : ''})`;

function crossCheck(events, machine) {
  const issues = [];
  const sorted = [...events].sort((a, b) => a.start - b.start || a.end - b.end);
  let transitions = 0, ok = 0, overlaps = 0, gaps = 0;
  const mk = (sev, kind, text, ev) => ({ sev, kind, machine, text, page: ev.page, label: ev.label, table: ev.table, ri: ev.ri, linha: ev.linha });

  // overlaps: any two records that share time on the same machine
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].start < sorted[i].end - OVERLAP_TOL; j++) {
      const a = sorted[i], b = sorted[j];
      const ov = Math.min(a.end, b.end) - b.start;
      if (ov <= OVERLAP_TOL) continue;
      overlaps++;
      const what = a.type === b.type ? `duas ${KIND[a.type]}s no mesmo horário` : 'parada e produção ao mesmo tempo';
      issues.push(mk('alta', 'sobreposição', `${what}: ${describe(a)} e ${describe(b)} dividem ${fmtDur(ov)}`, b));
    }
  }

  // continuity: each record should start where the previous one ended
  let cover = null; // the record that currently reaches furthest
  for (const e of sorted) {
    if (cover) {
      const gap = e.start - cover.end;
      if (gap > GAP_MAX) { /* machine not scheduled in between */ }
      else if (gap >= 0) {
        transitions++;
        if (gap <= OVERLAP_TOL) ok++;
        else if (gap >= GAP_MIN) {
          gaps++;
          const sev = (cover.type !== e.type) ? 'media' : 'info';
          issues.push(mk(sev, 'lacuna', `${fmtDur(gap)} sem registro entre ${describe(cover)} e ${describe(e)}${cover.type !== e.type ? ': o horário de uma das duas pode estar errado' : ''}`, e));
        } else ok++; // tiny gap, treated as the same moment
      }
    }
    if (!cover || e.end > cover.end) cover = e;
  }
  return { issues, transitions, ok, overlaps, gaps };
}

// ---- per-machine summary ---------------------------------------------------

function summarise(machine, events, pages) {
  const prod = events.filter((e) => e.type === 'prod'), stops = events.filter((e) => e.type === 'stop');
  const sum = (arr) => arr.reduce((s, e) => s + (e.end - e.start), 0);
  const prodMin = sum(prod), stopMin = sum(stops);
  const byMotivo = new Map();
  for (const s of stops) {
    const k = s.motivo || 'SEM MOTIVO';
    const cur = byMotivo.get(k) ?? { motivo: k, min: 0, count: 0 };
    cur.min += s.end - s.start; cur.count++;
    byMotivo.set(k, cur);
  }
  const motivos = [...byMotivo.values()].sort((a, b) => b.min - a.min);
  const longest = [...stops].sort((a, b) => (b.end - b.start) - (a.end - a.start)).slice(0, 3)
    .map((s) => ({ min: s.end - s.start, from: clock(s.start), to: clock(s.end), motivo: s.motivo || 'SEM MOTIVO', desc: s.desc || '', page: s.page, label: s.label, ri: s.ri, linha: s.linha }));

  const issues = [];
  const mk = (sev, kind, text, page, table, ri, linha) => ({ sev, kind, machine, text, page: page.id, label: page.label, table, ri, linha });

  // production rows against the standard time
  const groups = new Map();
  let noStd = 0;
  for (const page of pages) {
    page.prod.forEach((r, ri) => {
      let realMin = 0;
      for (const n of [1, 2, 3]) { const seg = segment(r.data, r[`ini${n}`], r[`fim${n}`]); if (seg) realMin += seg.end - seg.start; }
      if (!realMin || !r.peca) return;
      const std = standardHours(machine, r.peca, r.modelo);
      const key = `${r.peca}|${r.modelo}`;
      const g = groups.get(key) ?? { peca: r.peca, modelo: r.modelo, rows: 0, realH: 0, stdH: 0, withStd: 0 };
      g.rows++; g.realH += realMin / 60;
      if (std != null) { g.stdH += std; g.withStd++; } else noStd++;
      groups.set(key, g);
      if (std != null && !r.obs) { // rows with a note ("parcial", "só o colar"…) are partial runs: no comparison
        const ratio = realMin / 60 / std;
        if (ratio > OVER_STD) issues.push(mk('media', 'acima do padrão', `Linha ${r.linha || ri + 1} (${r.peca} ${r.modelo}): ${fmtDur(realMin)} contra ${fmtDur(std * 60)} de padrão (${Math.round(ratio * 100)} %). Confira os horários`, page, 'prod', ri, r.linha));
        else if (ratio < UNDER_STD) issues.push(mk('media', 'abaixo do padrão', `Linha ${r.linha || ri + 1} (${r.peca} ${r.modelo}): ${fmtDur(realMin)} contra ${fmtDur(std * 60)} de padrão (${Math.round(ratio * 100)} %). Pode ser horário errado ou peça incompleta`, page, 'prod', ri, r.linha));
      }
    });
    page.stops.forEach((r, ri) => {
      if (!r.motivo) issues.push(mk('media', 'sem motivo', `Parada da linha ${r.linha || ri + 1} sem motivo marcado`, page, 'stops', ri, r.linha));
      else if (r.motivo === 'OUTROS' && !r.desc) issues.push(mk('info', 'sem descrição', `Parada "OUTROS" da linha ${r.linha || ri + 1} sem descrição`, page, 'stops', ri, r.linha));
    });
  }
  const standards = [...groups.values()].map((g) => ({ ...g, ratio: g.withStd && g.rows === g.withStd ? g.realH / g.stdH : null })).sort((a, b) => b.realH - a.realH);

  const cc = crossCheck(events, machine);
  issues.push(...cc.issues);

  const dates = [...new Set(pages.map((p) => p.date).filter(Boolean))].sort();
  const pctStop = prodMin + stopMin ? Math.round((stopMin / (prodMin + stopMin)) * 100) : 0;
  const bullets = [];
  bullets.push(`Produzindo ${fmtDur(prodMin)} e parado ${fmtDur(stopMin)} (${pctStop} % do tempo registrado), em ${stops.length} parada${stops.length === 1 ? '' : 's'}.`);
  if (motivos[0] && stopMin) bullets.push(`Motivo que mais parou: ${motivos[0].motivo}, ${fmtDur(motivos[0].min)} (${Math.round((motivos[0].min / stopMin) * 100)} % das paradas).`);
  if (longest[0]) bullets.push(`Maior parada: ${fmtDur(longest[0].min)} das ${longest[0].from} às ${longest[0].to}, ${longest[0].motivo}${longest[0].desc ? ` (${longest[0].desc})` : ''}.`);
  if (cc.transitions) bullets.push(`Horários que fecham entre registros: ${cc.ok} de ${cc.transitions}.${cc.overlaps ? ` ${cc.overlaps} conflito(s) de horário (dois registros no mesmo horário).` : ''}${cc.gaps ? ` ${cc.gaps} intervalo(s) sem registro.` : ''}`);
  const withRatio = standards.filter((g) => g.ratio != null);
  if (withRatio.length) {
    const worst = [...withRatio].sort((a, b) => Math.abs(b.ratio - 1) - Math.abs(a.ratio - 1))[0];
    bullets.push(`Tempo real contra o padrão: ${worst.peca} ${worst.modelo} em ${Math.round(worst.ratio * 100)} % do padrão (maior desvio).`);
  }
  if (noStd) bullets.push(`${noStd} linha(s) de produção sem tempo padrão cadastrado, não comparadas.`);

  return { name: machine, dates, prodMin, stopMin, pctStop, stops: stops.length, motivos, longest, standards, transitions: { total: cc.transitions, ok: cc.ok, overlaps: cc.overlaps, gaps: cc.gaps }, noStd, issues, bullets };
}

// ---- entry point -----------------------------------------------------------

const RANK = { alta: 0, media: 1, info: 2 };

export function analyze(pages) {
  const { events, skipped } = buildEvents(pages);
  const byMachine = new Map();
  for (const p of pages) { const k = p.machine || 'SEM MÁQUINA'; if (!byMachine.has(k)) byMachine.set(k, []); byMachine.get(k).push(p); }
  const machines = [...byMachine.entries()].map(([name, ps]) => summarise(name, events.filter((e) => e.machine === name), ps));
  const cards = buildCards(events, pages);
  // overlaps, gaps and stop durations are now cards; the other checks (standard time, missing reason) stay as issues
  const keep = (i) => !['sobreposição', 'lacuna'].includes(i.kind);
  for (const m of machines) m.issues = m.issues.filter(keep);
  const issues = [...cards, ...machines.flatMap((m) => m.issues), ...skipped.map((s) => ({ sev: 'media', kind: 'incompleto', machine: s.machine, text: s.text, page: s.page, label: s.label, table: s.table, ri: s.ri, linha: s.linha }))]
    .sort((a, b) => RANK[a.sev] - RANK[b.sev]);
  const prodMin = machines.reduce((s, m) => s + m.prodMin, 0), stopMin = machines.reduce((s, m) => s + m.stopMin, 0);
  const tr = machines.reduce((s, m) => ({ total: s.total + m.transitions.total, ok: s.ok + m.transitions.ok }), { total: 0, ok: 0 });
  return {
    generatedAt: new Date().toISOString(),
    sheets: pages.length,
    machines, issues, cards, quality: buildQuality(pages),
    totals: {
      prodMin, stopMin, pctStop: prodMin + stopMin ? Math.round((stopMin / (prodMin + stopMin)) * 100) : 0,
      alta: issues.filter((i) => i.sev === 'alta').length, media: issues.filter((i) => i.sev === 'media').length, info: issues.filter((i) => i.sev === 'info').length,
      fecham: tr.total ? Math.round((tr.ok / tr.total) * 100) : null,
    },
  };
}

// Compact text version for the AI summary (numbers only, no raw images or free text beyond descriptions).
export function compactForAI(a) {
  return {
    folhas: a.sheets,
    totais: { produzindo: fmtDur(a.totals.prodMin), parado: fmtDur(a.totals.stopMin), percentual_parado: a.totals.pctStop, alertas_altos: a.totals.alta, alertas_medios: a.totals.media, horarios_que_fecham_pct: a.totals.fecham },
    maquinas: a.machines.map((m) => ({
      nome: m.name, datas: m.dates, produzindo: fmtDur(m.prodMin), parado: fmtDur(m.stopMin), percentual_parado: m.pctStop,
      paradas_por_motivo: m.motivos.slice(0, 5).map((x) => `${x.motivo}: ${fmtDur(x.min)} em ${x.count}`),
      maiores_paradas: m.longest.map((l) => `${fmtDur(l.min)} ${l.motivo}${l.desc ? ` (${l.desc})` : ''}`),
      producao_vs_padrao: m.standards.filter((g) => g.ratio != null).slice(0, 6).map((g) => `${g.peca} ${g.modelo}: ${Math.round(g.ratio * 100)} % do padrão`),
      conferencia: m.transitions,
    })),
    alertas: a.issues.slice(0, 12).map((i) => `[${i.sev}] ${i.machine}: ${i.text}`),
  };
}
