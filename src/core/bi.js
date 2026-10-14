// BI engine: the data model, relationships and measures of the Power BI reports (RAW and usinagem), over the history records.
// Pure functions (no DOM). Model, copied from the .pbix files:
//   01_Produção  one row per production record      02_Paradas  one row per stop      02_Paradas_resumo  stop hours per (date + machine)
//   Produção ↔ Paradas_resumo : Chave (date + machine)                      — filters both ways
//   Produção ↔ Paradas        : Chave parada (date + machine + chapa final)  — many-to-many, filters both ways
import { spanHours, fmtHM, auditDays, standardByPieceModel } from './history.js';

export const META = 0.88;            // availability goal
export const HORAS_DIA = 18.58;      // productive hours expected per machine per day
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const monthOf = (iso) => MONTHS[+iso.slice(5, 7) - 1] ?? '';
const hm = (h) => (h ? fmtHM(Math.round(h * 60)) : '');   // hours → "HH:MM" (blank when zero), like the TOTAL - nºTURNO columns
const sum = (rows, f) => { let s = 0; for (const r of rows) s += f(r) || 0; return s; };

// ---- tables ------------------------------------------------------------------------------------------------
// base: { prod: [...], stops: [...] } (history records); nameOf(chapa) → operator name or '' (the spreadsheet's REFERENCIAS tab)
export function buildCube(base, nameOf = () => '') {
  const prod = base.prod.map((r) => {
    const t = r.t;
    // "Chapa final": the plate of the turn that finished the piece
    const cf = t === 3 && r.c3 ? r.c3 : t === 2 && r.c2 ? r.c2 : t === 1 && r.c1 ? r.c1 : '';
    const key = r.d + '|' + r.m;
    const o = { m: r.m, d: r.d, mes: monthOf(r.d), p: r.p, o: r.o, pm: `${r.p}-${r.o}`, t: t == null ? '' : String(t), cf, nome: cf ? nameOf(cf) || '' : '',
      h: Number(r.h) || 0, tp: Number(r.tp) || 0, key, keyP: key + '|' + cf, src: r,
      t1: spanHours(r.i1, r.f1) ?? 0, t2: spanHours(r.i2, r.f2) ?? 0, t3: spanHours(r.i3, r.f3) ?? 0 };
    // "hours delivered" (standard hours of the piece): the matrix value of the sheet; else the same piece+model on another machine; else none
    if (o.tp > 0) { o.tpx = o.tp; o.tpSrc = 'matriz'; } else { const e = standardByPieceModel(o.p, o.o, o.m); o.tpx = e; o.tpSrc = e > 0 ? 'estimado' : 'sem'; }
    o.t1s = hm(o.t1); o.t2s = hm(o.t2); o.t3s = hm(o.t3);
    return o;
  });
  const stops = base.stops.map((s) => ({ m: s.m, d: s.d, mes: monthOf(s.d), c: s.c, t: s.t == null ? '' : String(s.t), mo: s.mo, ds: s.ds, i: s.i, f: s.f, h: Number(s.h) || 0, key: s.d + '|' + s.m + '|' + s.c, dm: s.d + '|' + s.m, src: s }));
  const resumo = new Map();
  for (const s of stops) resumo.set(s.dm, (resumo.get(s.dm) || 0) + s.h);
  return { prod, stops, resumo };
}

// columns usable in filters and groups
export const PD = { data: (r) => r.d, mes: (r) => r.mes, m: (r) => r.m, pm: (r) => r.pm, peca: (r) => r.p, t: (r) => r.t, cf: (r) => r.cf, nome: (r) => r.nome, t1: (r) => r.t1s, t2: (r) => r.t2s, t3: (r) => r.t3s };
export const SD = { data: (r) => r.d, mes: (r) => r.mes, m: (r) => r.m, mo: (r) => r.mo, t: (r) => r.t, c: (r) => r.c, ds: (r) => r.ds };

// an empty Set means "nothing matches" (the callers drop a slicer's filter when it has no selection)
const active = (f) => Object.entries(f ?? {}).filter(([, v]) => v);
// a filter that lists EVERY value of the column filters nothing ("select all" = no filter)
const domSize = (cube, side, col) => { const k = side + col; cube._dom ??= {}; return (cube._dom[k] ??= new Set((side === 'p' ? cube.prod : cube.stops).map((r) => (side === 'p' ? PD : SD)[col](r))).size); };
const activeC = (cube, side, f) => Object.entries(f ?? {}).filter(([k, v]) => v && v.size < domSize(cube, side, k));
const matches = (act, dims, r) => { for (const [k, set] of act) if (!set.has(dims[k](r))) return false; return true; };

// ---- filter context → visible rows (the relationships applied) ---------------------------------------------
// f = { p: { column: Set }, s: { column: Set } }   (p = Produção columns, s = Paradas columns)
export function slice(cube, f = {}) {
  const pa = activeC(cube, 'p', f.p), sa = activeC(cube, 's', f.s);
  const Pd = pa.length ? cube.prod.filter((r) => matches(pa, PD, r)) : cube.prod;
  const Sd = sa.length ? cube.stops.filter((r) => matches(sa, SD, r)) : cube.stops;
  let P = Pd, S = Sd, R = null;
  if (sa.length) { const k = new Set(Sd.map((s) => s.key)); P = Pd.filter((r) => k.has(r.keyP)); }
  if (pa.length) { const k = new Set(Pd.map((r) => r.keyP)); S = Sd.filter((s) => k.has(s.key)); }
  const filtered = pa.length > 0 || sa.length > 0;
  const c = { P, S };
  // Σ of Paradas_resumo (stop hours per date + machine) over the keys that survive on the production side
  Object.defineProperty(c, 'resumo', { get() {
    if (R == null) {
      if (!filtered) R = sum([...cube.resumo.values()], (x) => x);
      else { const keys = new Set(P.map((r) => r.key)); R = 0; for (const k of keys) R += cube.resumo.get(k) || 0; }
    }
    return R;
  } });
  return c;
}
export const withP = (f, col, vals) => ({ p: { ...(f?.p ?? {}), [col]: new Set([].concat(vals)) }, s: f?.s ?? {} });
export const withS = (f, col, vals) => ({ p: f?.p ?? {}, s: { ...(f?.s ?? {}), [col]: new Set([].concat(vals)) } });
export const without = (f, side, col) => { const o = { ...(f?.[side] ?? {}) }; delete o[col]; return { p: f?.p ?? {}, s: f?.s ?? {}, [side]: o }; };

// ---- measures (names as in the model) ----------------------------------------------------------------------
export const M = {
  qtdPecas: (c) => c.P.length,                               // 01_qtde_pecas / SUM(peca_modelo_contagem)
  horasProd: (c) => sum(c.P, (r) => r.h),                    // 03_somatempo_producao / SUM(TEMPO/DEC)
  horasParadas: (c) => sum(c.S, (r) => r.h),                 // 10_Horas Paradas
  horasParadasResumo: (c) => c.resumo,                       // SUM(02_Paradas_resumo[Contagem|Paradas])
  tp: (c) => sum(c.P, (r) => r.tp),                          // SUM(TEMPO PADRÃO BAAN)
  mediaHoras: (c) => (c.P.length ? sum(c.P, (r) => r.h) / c.P.length : null), // AVG(TEMPO/DEC)
  pecasDistintas: (c) => new Set(c.P.map((r) => r.p)).size,  // DISTINCTCOUNT(PEÇA)
  // hours delivered = standard hours of the pieces made (one row = one piece). Efficiency compares them with the REAL hours of the same pieces
  entrega: (c) => sum(c.P, (r) => r.tpx),
  realComPadrao: (c) => sum(c.P.filter((r) => r.tpx > 0), (r) => r.h),
  pecasSemPadrao: (c) => c.P.filter((r) => !(r.tpx > 0)).length,
  horasSemPadrao: (c) => sum(c.P.filter((r) => !(r.tpx > 0)), (r) => r.h),
  pecasEstimadas: (c) => c.P.filter((r) => r.tpSrc === 'estimado').length,
  efic: (c) => { const r = M.realComPadrao(c); return r ? M.entrega(c) / r : null; },
  // 06_tempo_target: 18.58 h × distinct dates, for each machine in view
  target: (c) => { const by = new Map(); for (const r of c.P) { let s = by.get(r.m); if (!s) by.set(r.m, (s = new Set())); s.add(r.d); } let t = 0; for (const s of by.values()) t += HORAS_DIA * s.size; return t; },
  // 07_porcentagem (availability) = hours produced / target
  pct: (c) => { const t = M.target(c); return t ? M.horasProd(c) / t : 0; },
  // 16_% Ganho = (standard − real) / standard ; null (blank) when there is no standard time
  ganho: (c) => { const tp = M.tp(c); return tp ? (tp - M.horasProd(c)) / tp : null; },
};

// ---- text and colors (the report's measures) ---------------------------------------------------------------
export const fmtSigned = (v, dec = 0) => `${v < 0 ? '-' : '+'}${Math.abs(v * 100).toFixed(dec)}%`;
export const ganhoTexto = (g) => (g == null ? '' : fmtSigned(g, 0));              // 16_Ganho Texto  "+0%;-0%"
export const variacaoTexto = (pct) => fmtSigned(pct - META, 2);                    // 08_Variacao_Meta_Texto  "+0.00%;-0.00%"
export const corVariacao = (pct) => (pct >= META ? '#70AD47' : '#C00000');         // 09_Cor_Variacao
export const corPct = (pct) => (pct >= META ? '#81C784' : pct >= META * 0.9 ? '#FFD966' : '#E57373'); // 18_Cor %  (≥88% / ≥79,2% / abaixo)
export const corTempo = (horasParadas) => (horasParadas > 2.23 ? '#E6A8A8' : '#4472C4');  // 05_Cor_Tempo
export const corGanho = (g) => (g == null || g === 0 ? '#FFD966' : g < 0 ? '#81C784' : '#E57373');  // 17_Cor TP (RAW)
export const corTPTotal = (real, padrao, group) => { // 17_Cor TP_Total
  if (group === 'raw') { const g = padrao ? (padrao - real) / padrao : null; return corGanho(g); }
  return real <= padrao * 0.9 ? '#81C784' : real <= padrao ? '#FFD966' : '#E57373';
};
// "10 peças selecionadas" cards (19_nome / 19_chapa)
export function selecionado(set, todos = 'Todos', unid = 'selecionados') {
  const n = set?.size ?? 0;
  return n === 0 ? todos : n === 1 ? [...set][0] : `${n} ${unid}`;
}

// ---- group-by (the visuals) ---------------------------------------------------------------------------------
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const natural = (a, b) => (/^\d+$/.test(a) && /^\d+$/.test(b) ? a - b : cmp(a, b));
// rows of a visual that groups by Produção columns: one entry per combination that exists after filtering
export function groupP(cube, f, cols) {
  const { P } = slice(cube, f);
  const seen = new Map();
  for (const r of P) { const vals = cols.map((k) => PD[k](r)); const id = vals.join('\u0001'); if (!seen.has(id)) seen.set(id, vals); }
  return [...seen.values()].sort((a, b) => { for (let i = 0; i < a.length; i++) { const c = natural(a[i], b[i]); if (c) return c; } return 0; })
    .map((vals) => { let g = f; cols.forEach((k, i) => { g = withP(g, k, vals[i]); }); return { vals, c: slice(cube, g), f: g }; });
}
export function groupS(cube, f, cols) {
  const { S } = slice(cube, f);
  const seen = new Map();
  for (const r of S) { const vals = cols.map((k) => SD[k](r)); const id = vals.join('\u0001'); if (!seen.has(id)) seen.set(id, vals); }
  return [...seen.values()].sort((a, b) => { for (let i = 0; i < a.length; i++) { const c = natural(a[i], b[i]); if (c) return c; } return 0; })
    .map((vals) => { let g = f; cols.forEach((k, i) => { g = withS(g, k, vals[i]); }); return { vals, c: slice(cube, g), f: g }; });
}

// Pareto of the stops: reasons ordered by hours, with the cumulative share. Rank and total ignore the "Motivo" slicer (ALL).
export function pareto(cube, f) {
  const all = groupS(cube, without(f, 's', 'mo'), ['mo']).map((g) => ({ mo: g.vals[0], h: M.horasParadas(g.c) }));
  const total = all.reduce((s, x) => s + x.h, 0);
  const rank = (h) => { const hs = [...new Set(all.map((x) => x.h))].sort((a, b) => b - a); return hs.indexOf(h) + 1; }; // dense, descending
  const visible = groupS(cube, f, ['mo']).map((g) => ({ mo: g.vals[0], h: M.horasParadas(g.c) })).filter((x) => x.h > 0);
  return visible.map((x) => {
    const rk = rank(x.h);
    const acc = all.filter((y) => rank(y.h) <= rk).reduce((s, y) => s + y.h, 0);
    return { mo: x.mo, h: x.h, rank: rk, acc, pctAcc: total ? acc / total : 0 };
  }).sort((a, b) => b.h - a.h || cmp(a.mo, b.mo));
}

// distinct values of a column over the whole table (what a slicer lists)
const MORDER = (v) => MONTHS.indexOf(v);
export const options = (cube, side, col) => [...new Set((side === 'p' ? cube.prod : cube.stops).map((r) => (side === 'p' ? PD : SD)[col](r)))].filter((v) => v != null).sort(col === 'mes' ? (a, b) => MORDER(a) - MORDER(b) : natural);

// suspicious records: a machine with more than 24 h produced in one day (impossible), or one record longer than 16 h
export function anomalias(cube, f = {}) {
  const { P } = slice(cube, f), perDay = new Map(), out = [];
  for (const r of P) perDay.set(r.key, (perDay.get(r.key) || 0) + r.h);
  for (const r of P) {
    const day = perDay.get(r.key);
    if (day > 24) out.push({ r, why: `${day.toFixed(1).replace('.', ',')} h no mesmo dia e máquina (o dia tem 24 h)` });
    else if (r.h > 16) out.push({ r, why: `um único registro com ${r.h.toFixed(1).replace('.', ',')} h` });
  }
  return out;
}
// highlights for the top strip of a page: [{ tone: 'bad' | 'warn' | 'ok', text }]
export function destaques(cube, f = {}, { unit = 'Máquina' } = {}) {
  const out = [], c = slice(cube, f);
  const g = groupP(cube, f, ['m']).map((x) => ({ m: x.vals[0], p: pct(x.c) })).filter((x) => Number.isFinite(x.p));
  if (g.length > 1) {
    const worst = [...g].sort((a, b) => a.p - b.p)[0], best = [...g].sort((a, b) => b.p - a.p)[0];
    out.push({ tone: worst.p >= META ? 'ok' : 'bad', text: `Menor disponibilidade: ${worst.m} com ${(worst.p * 100).toFixed(1).replace('.', ',')}% (meta ${Math.round(META * 100)}%).` });
    if (best.m !== worst.m) out.push({ tone: best.p >= META ? 'ok' : 'warn', text: `Maior disponibilidade: ${best.m} com ${(best.p * 100).toFixed(1).replace('.', ',')}%.` });
  }
  const par = pareto(cube, { p: f.p ?? {}, s: f.s ?? {} });
  const tot = par.reduce((s2, x) => s2 + x.h, 0);
  if (par.length && tot) out.push({ tone: 'warn', text: `Maior motivo de parada: ${par[0].mo || '(vazio)'}, ${(par[0].h / tot * 100).toFixed(0)}% das horas paradas (${par[0].h.toFixed(1).replace('.', ',')} h).` });
  if (!out.length && c.P.length) out.push({ tone: 'ok', text: 'Nenhum destaque para os filtros escolhidos.' });
  return out;
}
const pct = (c) => M.pct(c);

// values a slicer can still offer: the ones that exist after the OTHER slicers of the same table (like Power BI's linked slicers)
export function optionsFor(cube, side, col, f = {}) {
  const dims = side === 'p' ? PD : SD, rows = side === 'p' ? cube.prod : cube.stops;
  const others = activeC(cube, side, Object.fromEntries(Object.entries(f[side] ?? {}).filter(([k]) => k !== col && !(col === 'mes' && k === 'data'))));   // days narrow by month, never the other way around
  const set = new Set();
  for (const r of rows) if (matches(others, dims, r)) set.add(dims[col](r));
  return [...set].filter((v) => v != null).sort(col === 'mes' ? (a, b) => MORDER(a) - MORDER(b) : natural);
}

// machine-days over 24 h (production + stops), following the date / machine filters of the page
export function auditoria24(cube, f = {}) {
  const fp = f.p ?? {}, fs = f.s ?? {};
  const ok = (r, dims, a, b) => ['data', 'mes', 'm'].every((k) => { const sets = [a[k], b[k]].filter(Boolean); return sets.every((st) => st.has(dims[k](r))); });
  return auditDays(cube.prod.filter((r) => ok(r, PD, fp, fs)).map((r) => r.src), cube.stops.filter((r) => ok(r, SD, fp, fs)).map((r) => r.src));
}

// cards of the Indicadores top row (same idea as the cards of the Análise tab): who/what stands out in the current view.
// Each one: { key, tone, machine, title, people, big, bigLabel, brief, foot, detail: { title, head, rows } }
const f1h = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const topPeople = (c, n = 2) => { const by = new Map(); for (const r of c.P) { if (!r.cf) continue; const x = by.get(r.cf) ?? { chapa: r.cf, nome: r.nome, h: 0 }; x.h += r.h; by.set(r.cf, x); } return [...by.values()].sort((a, b) => b.h - a.h).slice(0, n).map(({ chapa, nome }) => ({ chapa, nome })); };
export function cardsBI(cube, f = {}, { unit = 'Máquina', groupName = 'Todas as máquinas' } = {}) {
  const out = [], c = slice(cube, f), units = unit === 'Robô' ? 'robôs' : 'máquinas';
  if (!c.P.length) return out;
  const gm = groupP(cube, f, ['m']).map((g) => ({ m: g.vals[0], p: M.pct(g.c), c: g.c, h: M.horasProd(g.c), t: M.target(g.c), ent: M.entrega(g.c), real: M.realComPadrao(g.c), e: M.efic(g.c), par: M.horasParadas(g.c) }));
  const pct = M.pct(c), hProd = M.horasProd(c), tgt = M.target(c);
  const toneP = (p) => (p >= META ? 'ok' : p >= META * 0.9 ? 'warn' : 'bad');
  const dispTable = { head: [unit, 'Horas produzidas', 'Meta (h)', 'Disponibilidade', 'Desvio da meta'], rows: [...gm].sort((a, b) => b.p - a.p).map((x) => [x.m, +x.h.toFixed(2), +x.t.toFixed(2), `${f1h(x.p * 100)}%`, variacaoTexto(x.p)]) };
  // 1. availability of everything in view against the goal
  out.push({ key: 'disp', tone: toneP(pct), machine: groupName, title: `Disponibilidade · meta ${Math.round(META * 100)}%`, big: `${f1h(pct * 100)}%`, bigLabel: pct >= META ? 'meta batida' : `${f1h((META - pct) * 100)} pontos abaixo`, brief: `Produziram ${f1h(hProd)} h de ${f1h(tgt)} h possíveis (${M.qtdPecas(c).toLocaleString('pt-BR')} peças).`, foot: `${gm.length} ${units}`, detail: { title: 'Disponibilidade por ' + unit.toLowerCase(), ...dispTable } });
  // 2. delivery by the standard time (the supervisor's "horas entregues") against the real time of the same pieces
  const ef = M.efic(c);
  if (ef != null) out.push({ key: 'entrega', tone: ef >= 1 ? 'ok' : ef >= 0.85 ? 'warn' : 'bad', machine: 'Horas entregues', title: 'Entrega pelo tempo padrão', big: `${f1h(ef * 100)}%`, bigLabel: 'entregue ÷ real', brief: `Entregaram ${f1h(M.entrega(c))} h pelo padrão gastando ${f1h(M.realComPadrao(c))} h reais.${M.pecasSemPadrao(c) ? ` ${M.pecasSemPadrao(c).toLocaleString('pt-BR')} peças sem tempo padrão ficaram fora da conta.` : ''}`, foot: 'Padrão da matriz (BAAN)', detail: { title: 'Entrega por ' + unit.toLowerCase(), head: [unit, 'Horas reais', 'Horas entregues', 'Eficiência'], rows: gm.filter((x) => x.e != null).sort((a, b) => b.e - a.e).map((x) => [x.m, +x.real.toFixed(2), +x.ent.toFixed(2), `${f1h(x.e * 100)}%`]) } });
  // 3. stops: total and the main reason
  const par = pareto(cube, { p: f.p ?? {}, s: f.s ?? {} }), tot = par.reduce((a, x) => a + x.h, 0);
  if (par.length && tot) out.push({ key: 'paradas', tone: 'warn', machine: 'Paradas', title: 'Horas paradas', big: tot >= 1000 ? `${Math.round(tot).toLocaleString("pt-BR")} h` : `${f1h(tot)} h`, bigLabel: `${Math.round((par[0].h / tot) * 100)}% é ${par[0].mo || 'sem motivo'}`, brief: `Maior motivo: ${par[0].mo || 'sem motivo'}, com ${f1h(par[0].h)} h.${par[1] ? ` Depois: ${par[1].mo || 'sem motivo'} (${f1h(par[1].h)} h).` : ''}`, foot: `${par.length} motivos`, detail: { title: 'Paradas por motivo', head: ['Motivo', 'Horas', '% do total', '% acumulado'], rows: par.map((x) => [x.mo || '(vazio)', +x.h.toFixed(2), `${f1h((x.h / tot) * 100)}%`, `${f1h(x.pctAcc * 100)}%`]) } });
  // 4. the most critical machine, with what stops it most
  if (gm.length > 1) {
    const w = [...gm].sort((a, b) => a.p - b.p)[0], pw = pareto(cube, { p: { ...(f.p ?? {}), m: new Set([w.m]) }, s: f.s ?? {} });
    out.push({ key: 'critica', tone: toneP(w.p), machine: w.m, title: `${unit === 'Robô' ? 'Robô mais crítico' : 'Máquina mais crítica'}`, big: `${f1h(w.p * 100)}%`, bigLabel: 'disponibilidade', brief: `Produziu ${f1h(w.h)} h de ${f1h(w.t)} h possíveis.${pw[0] ? ` Mais parou por ${pw[0].mo || 'sem motivo'} (${f1h(pw[0].h)} h).` : ''}`, foot: `Menor entre ${gm.length} ${units}`, detail: { title: 'Disponibilidade por ' + unit.toLowerCase(), ...dispTable } });
  }
  return out;
}
// efficiency colors (provisional: green from 100%, yellow from 85%)
export const corEfic = (e) => (e == null ? '#A5A5A5' : e >= 1 ? '#81C784' : e >= 0.85 ? '#FFD966' : '#E57373');
