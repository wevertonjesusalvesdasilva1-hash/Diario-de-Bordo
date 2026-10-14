// "4 · BI": the Power BI reports (RAW and usinagem) rebuilt on the history. Numbers come from core/bi.js (the report's own measures).
import './bi.css';
import { buildCube, slice, M, options, optionsFor, anomalias, destaques, withP, withS, groupP, groupS, pareto, ganhoTexto, variacaoTexto, selecionado, META } from './core/bi.js';
import { dmy } from './core/history.js';
import { loadBase } from './historico.js';
import { getOperators, operatorName } from './core/operators.js';
import { el, chartBox, PALETTE } from './bicharts.js';
import * as BI from './core/bi.js';

// the report's color rules are kept, painted with the Painel's palette
const SKIN = { '#81C784': '#a3e635', '#70AD47': '#a3e635', '#FFD966': '#fbbf24', '#E57373': '#fb7185', '#C00000': '#fb7185', '#E6A8A8': '#fb7185', '#4472C4': '#22d3ee' };
const sk = (c) => SKIN[c] ?? c;
const corPctS = (v) => sk(BI.corPct(v)), corGanhoS = (g) => sk(BI.corGanho(g)), corTempoS = (h) => sk(BI.corTempo(h)), corVariacaoS = (v) => sk(BI.corVariacao(v));

const SEP = '\u0001';
let slicerFills = [];
const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const r6 = (v) => Math.round((v ?? 0) * 1e6) / 1e6;   // drop floating-point noise before rounding
const f1 = (v) => r6(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f2 = (v) => r6(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fint = (v) => Math.round(v ?? 0).toLocaleString('pt-BR');
const fpct = (v) => `${f1((v ?? 0) * 100)}%`;
const fpct0 = (v) => `${Math.round((v ?? 0) * 100)}%`;
const hhmm = (h) => { const m = Math.round((h || 0) * 60); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const blank = (v) => (v === '' || v == null ? '(vazio)' : v);

const GROUPS = { raw: { name: 'RAW (robôs)', unit: 'Robô', units: 'Robôs' }, usi: { name: 'Usinagem', unit: 'Máquina', units: 'Máquinas' } };
const PAGES = { raw: [['diaria', 'Diária'], ['paradas', 'Paradas'], ['peca', 'Peça produtividade'], ['operador', 'Operador'], ['mensal', 'Mensal']], usi: [['diaria', 'Diária'], ['paradas', 'Paradas'], ['peca', 'Peça produtividade'], ['operador', 'Operador']] };

const ui = { g: 'raw', page: 'diaria', filt: {}, vf: {}, lead: {}, sel: null, cubes: {} };
try { const s = localStorage.getItem('bi.g'); if (s === 'raw' || s === 'usi') ui.g = s; } catch { /* no storage */ }

export const setBiGroup = (g) => { if (GROUPS[g]) { ui.g = g; if (!PAGES[g].some(([id]) => id === ui.page)) ui.page = 'diaria'; ui.sel = null; } };
const cubeFor = (g, base) => {
  const key = `${base.rev}|${Object.keys(getOperators()).length}`;
  if (ui.cubes[g]?.key !== key) ui.cubes[g] = { key, cube: buildCube(base, (c) => operatorName(c) || '') };
  return ui.cubes[g].cube;
};

// ---- slicers ------------------------------------------------------------------------------------------------
const SLICERS = {
  diaria: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm'], ['Turno', 'p', 't']],
  paradas: [['Dia', 's', 'data'], ['Mês', 's', 'mes'], ['@unit', 's', 'm'], ['Motivo', 's', 'mo'], ['Turno', 's', 't']],
  peca: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['Turno', 'p', 't'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm']],
  operador: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['Turno', 'p', 't'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm'], ['Nome do operador', 'p', 'nome']],
  mensal: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm']],
};
const fkey = () => `${ui.g}.${ui.page}`;
const pageFilter = () => (ui.filt[fkey()] ??= { p: {}, s: {} });
const optLabel = (col, v) => (col === 'data' ? dmy(v) : col === 't' ? `Turno ${v}` : v);

function slicerBox(title, side, col, cube, onChange) {
  const f = pageFilter(), sets = () => f[side];
  const list = el('ul'), search = el('input', { type: 'search', placeholder: 'Buscar', 'aria-label': `Buscar em ${title}` });
  const box = el('section', { class: 'bi-slicer' }, el('header', {}, el('span', {}, title), el('button', { type: 'button', onclick: () => { delete sets()[col]; fill(); onChange(); } }, 'Limpar')), search, list);
  function fill() {
    const vals = optionsFor(cube, side, col, f), q = search.value.trim().toLowerCase(), cur = sets()[col];
    list.replaceChildren(...vals.filter((v) => !q || optLabel(col, v).toLowerCase().includes(q)).map((v) => el('li', {}, el('label', {}, el('input', { type: 'checkbox', checked: cur?.has(v) || null, onchange: (e) => {
      const s = (sets()[col] ??= new Set()); if (e.target.checked) s.add(v); else s.delete(v); if (!s.size) delete sets()[col]; onChange();
    } }), optLabel(col, v)))));
  }
  search.addEventListener('input', fill); fill();
  slicerFills.push(fill);
  return box;
}

// ---- generic pieces -----------------------------------------------------------------------------------------
// pieces that redraw in place (no DOM replacement, so the page keeps its scroll) when a filter or a click changes
const REG = [];
function live(fn, cls = 'bi-cards') { const box = el('div', { class: cls }); box.rebuild = () => box.replaceChildren(...[].concat(fn())); REG.push(box); box.rebuild(); return box; }
function card(title, value, color, sub) { return el('div', { class: 'bi-card' }, el('small', {}, title), el('b', color ? { style: `color:${color}` } : {}, value), sub ? el('span', { class: 'sub' }, sub) : ''); }
const VSIDE = {};
let curCube = null;
const dateList = (side) => options(curCube, side, 'data');
// per-chart filters: machine and date range (every chart has them)
function visFilterOf(vid) {
  const st = ui.vf[`${ui.g}.${ui.page}.${vid}`], side = VSIDE[vid];
  if (!st || !side || (!st.m?.size && !st.from && !st.to)) return null;
  const o = {};
  if (st.m?.size) o.m = st.m;
  if (st.from || st.to) o.data = new Set(dateList(side).filter((d) => (!st.from || d >= st.from) && (!st.to || d <= st.to)));
  return { p: {}, s: {}, [side]: o };
}
function visFilterBar(vid, side, rebuild) {
  const key = `${ui.g}.${ui.page}.${vid}`, st = (ui.vf[key] ??= { m: new Set(), from: '', to: '' });
  const machines = options(curCube, side, 'm'), dates = dateList(side);
  const label = el('span', {}), list = el('div', { class: 'vf-pop' });
  const sum = () => { label.textContent = st.m.size ? `${GROUPS[ui.g].unit}: ${st.m.size === 1 ? [...st.m][0] : st.m.size + ' selecionados'}` : `${GROUPS[ui.g].unit}: todos`; };
  list.append(...machines.map((m) => el('label', {}, el('input', { type: 'checkbox', checked: st.m.has(m) || null, onchange: (e) => { if (e.target.checked) st.m.add(m); else st.m.delete(m); sum(); rebuild(); } }), m)));
  sum();
  const dateIn = (k, t) => el('label', { class: 'vf-d' }, t, el('input', { type: 'date', value: st[k], min: dates[0], max: dates.at(-1), 'aria-label': `${t} (data)`, onchange: (e) => { st[k] = e.target.value; rebuild(); } }));
  return el('div', { class: 'vf' }, el('details', { class: 'vf-m' }, el('summary', {}, label), list), dateIn('from', 'De'), dateIn('to', 'Até'),
    el('button', { type: 'button', class: 'vf-x', onclick: (e) => { st.m.clear(); st.from = st.to = ''; e.target.closest('.vf').replaceWith(visFilterBar(vid, side, rebuild)); rebuild(); } }, 'Limpar'));
}
// build(): returns the chart/table DOM using x.F(vid); it runs again whenever this chart's own filters change
function vis(title, build, { vid, side = 'p', wide = false, acts = [] } = {}) {
  VSIDE[vid] = side;
  const box = el('section', { class: `bi-vis${wide ? ' wide' : ''}` }), slot = el('div');
  const max = el('button', { type: 'button', 'aria-label': 'Ampliar', onclick: () => { const on = box.classList.toggle('max'); max.textContent = on ? '✕ Fechar' : '⤢'; } }, '⤢');
  box.vid = vid;
  box.rebuild = () => slot.replaceChildren(build());
  const barHost = el('div');
  box.rebuildBar = () => barHost.replaceChildren(visFilterBar(vid, side, changed));
  // a change here is copied to the other charts of the page (they follow by default, and each one can still be changed on its own)
  const changed = () => {
    const pk = `${ui.g}.${ui.page}`, mine = ui.vf[`${pk}.${vid}`];
    const lead = (ui.lead[pk] ??= { vid: null, own: new Set() });
    if (lead.vid && lead.vid !== vid) { lead.own.add(vid); box.rebuild(); return; }   // someone else leads: this chart now has its own choice
    lead.vid = vid; lead.own.delete(vid);
    const empty = !mine.m.size && !mine.from && !mine.to;
    for (const r of REG) {
      if (!r.vid || r === box || lead.own.has(r.vid)) continue;
      ui.vf[`${pk}.${r.vid}`] = { m: new Set(mine.m), from: mine.from, to: mine.to };
      r.rebuildBar?.(); r.rebuild();
    }
    if (empty) { lead.vid = null; lead.own.clear(); }   // cleared: everything goes back to the default
    box.rebuild();
  };
  REG.push(box);
  const xl = el('button', { type: 'button', 'aria-label': 'Baixar em Excel', title: 'Baixar os dados deste gráfico em Excel', onclick: async () => { const t = slot.firstElementChild?.getTable?.(); if (!t) return; const X = await import('xlsx'); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([t.head, ...t.rows]), 'Dados'); X.writeFile(wb, `${title.replace(/[^\p{L}\p{N} ·-]+/gu, '').trim().slice(0, 60) || 'dados'}.xlsx`); } }, '⬇ Excel');
  box.append(el('header', {}, el('h4', {}, title), el('div', { class: 'acts' }, acts, xl, max)), barHost, slot);
  box.rebuildBar();
  box.rebuild();
  return box;
}
// sortable table. cols: [{ h, v(row) → shown, n: numeric, key(row) → sort value, bg(row) → cell color }]
function table(cols, rows, { totals, order, desc = true, limit = 300 } = {}) {
  let sortCol = order ?? null, dir = desc ? -1 : 1, shown = limit;
  const wrap = el('div'), box = el('div', { class: 'bi-tbl' }), more = el('button', { type: 'button', class: 'bi-more' }, 'Mostrar todas as linhas');
  more.addEventListener('click', () => { shown = Infinity; draw(); });
  function draw() {
    let list = rows;
    if (sortCol != null) { const c = cols[sortCol], k = c.key ?? c.v; list = [...rows].sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; }); }
    const head = el('tr', {}, cols.map((c, i) => el('th', { class: c.n ? 'n' : '', ...(i === sortCol ? { 'aria-sort': dir > 0 ? 'ascending' : 'descending' } : {}), onclick: () => { if (sortCol === i) dir = -dir; else { sortCol = i; dir = c.n ? -1 : 1; } draw(); } }, c.h)));
    const body = list.slice(0, shown).map((r) => el('tr', {}, cols.map((c) => { const bg = c.bg?.(r), shownV = c.v(r); return el('td', { class: c.n ? 'n' : '' }, bg && shownV !== '' ? el('span', { class: 'dot', style: `background:${bg}` }, c.v(r)) : c.v(r)); })));
    box.replaceChildren(el('table', {}, el('thead', {}, head), el('tbody', {}, body), totals ? el('tfoot', {}, el('tr', {}, totals.map((t, i) => el('td', { class: cols[i].n ? 'n' : '' }, t ?? '')))) : ''));
    more.hidden = list.length <= shown;
    more.textContent = `Mostrar todas as ${fint(list.length)} linhas`;
  }
  draw(); wrap.append(box, more);
  wrap.getTable = () => { let list = rows; if (sortCol != null) { const c = cols[sortCol], k = c.key ?? c.v; list = [...rows].sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; }); } return { head: cols.map((c) => c.h), rows: list.map((r) => cols.map((c) => c.v(r))) }; };
  return wrap;
}
const rowsOf = (groups) => groups.map((g) => ({ vals: g.vals, c: g.c }));

// ---- records (modal) ------------------------------------------------------------------------------------------
function openRecords(title, head, rows, note) {
  document.getElementById('bd-modal')?.remove();
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const tbl = table(head.map((h, i) => ({ h, v: (r) => r[i], n: typeof rows[0]?.[i] === 'number' })), rows, { limit: 400 });
  const box = el('div', { id: 'bd-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('div', { class: 'bd-box wide' },
    el('div', { class: 'bd-head' }, el('h3', {}, title), el('button', { type: 'button', class: 'bd-x', 'aria-label': 'Fechar', onclick: close }, '✕')),
    el('div', { class: 'bd-body' }, note ? el('p', { class: 'note' }, note) : '', tbl)));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.append(box); document.addEventListener('keydown', onKey);
}
const times = (r) => [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]].filter(([a, b]) => a || b).map(([a, b]) => `${a}–${b}`).join(' · ');
const prodRow = (r) => [dmy(r.d), r.m, r.pm, r.cf, r.t, times(r.src), +r.h.toFixed(2), +r.tp.toFixed(2)];
const PROD_HEAD = ['Data', 'Máquina', 'Peça e modelo', 'Chapa', 'Turno', 'Horários', 'Horas', 'Padrão (h)'];
const stopRow = (s) => [dmy(s.d), s.m, s.c, s.t, s.mo, s.ds, s.i, s.f, +s.h.toFixed(2)];
const STOP_HEAD = ['Data', 'Máquina', 'Chapa', 'Turno', 'Motivo', 'Descrição', 'Início', 'Final', 'Horas'];

// ---- the pages ----------------------------------------------------------------------------------------------
// ctx: { cube, g, F(vid) → filter for that visual, pick(vid, side, cols) → onPick, selOf(vid) → Set }
// the period right before the selected days (same number of days), for the "vs. período anterior" hint
function prevSlice(x, side) {
  const sel = pageFilter()[side].data;
  if (!sel || !sel.size) return null;
  const all = options(x.cube, side, 'data'), chosen = all.filter((d) => sel.has(d)), i = all.indexOf(chosen[0]), prev = all.slice(Math.max(0, i - chosen.length), i);
  if (!prev.length) return null;
  return slice(x.cube, (side === 's' ? withS : withP)(x.F('cards'), 'data', prev));
}
const arrow = (d, unit, dec = 1) => (Math.abs(d) < 0.05 ? '= igual ao período anterior' : `${d > 0 ? '▲ +' : '▼ −'}${Math.abs(d).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec })}${unit} vs. período anterior`);
function cardsRow(x, kind, side = 'p') {
  return live(() => {
    const c = slice(x.cube, x.F('cards')), pv = prevSlice(x, side);
    const res = kind === 'resumo' ? M.horasParadasResumo(c) : M.horasParadas(c), pct = M.pct(c);
    const resPrev = pv ? (kind === 'resumo' ? M.horasParadasResumo(pv) : M.horasParadas(pv)) : null;
    const gap = (pct - META) * 100;
    return [card('PRODUÇÃO (peças)', fint(M.qtdPecas(c)), null, pv ? arrow(M.qtdPecas(c) - M.qtdPecas(pv), '', 0) : ''),
      card('HORAS PRODUZIDAS', `${f1(M.horasProd(c))} h`, null, pv ? arrow(M.horasProd(c) - M.horasProd(pv), ' h') : ''),
      card(kind === 'resumo' ? 'HORAS PARADAS (todas do dia e máquina)' : 'HORAS PARADAS (das chapas filtradas)', `${f1(res)} h`, null, resPrev != null ? arrow(res - resPrev, ' h') : ''),
      card('DISPONIBILIDADE', fpct(pct), corPctS(pct), `Meta ${Math.round(META * 100)}% · ${gap >= 0 ? '+' : '−'}${f1(Math.abs(gap))} pts${pv ? ' · ' + arrow((pct - M.pct(pv)) * 100, ' pts') : ''}`)];
  });
}
// top strip: what stands out in the current view + suspicious records
function alertsStrip(x) {
  return live(() => {
    const f = x.F('cards'), items = destaques(x.cube, f, { unit: GROUPS[x.g].unit }), bad = anomalias(x.cube, f);
    const out = items.map((d) => el('span', { class: `bi-al ${d.tone}` }, d.text));
    if (bad.length) out.push(el('button', { type: 'button', class: 'bi-al bad act', onclick: () => openRecords(`Registros suspeitos (${bad.length})`, [...PROD_HEAD, 'Motivo'], bad.map(({ r, why }) => [...prodRow(r), why]), 'Confira estas linhas na folha ou no Excel: o horário digitado pode estar errado (por exemplo, hora que atravessa a meia-noite).') }, `⚠ ${bad.length} registro(s) suspeito(s) · ver`));
    return out;
  }, 'bi-alerts');
}
const unitCats = (groups) => groups.map((g) => ({ key: g.vals.join(SEP), label: blank(g.vals.at(-1)) }));

function pageDiaria(x) {
  const u = GROUPS[x.g].unit;
  // one group of columns per day, one color per machine (legend below); the day is the only axis label
  const prodDia = () => { const gr = groupP(x.cube, x.F('v1'), ['data', 'm']); const days = [...new Set(gr.map((g) => g.vals[0]))], ms = [...new Set(gr.map((g) => g.vals[1]))].sort();
    const at = new Map(gr.map((g) => [g.vals[0] + SEP + g.vals[1], M.horasProd(g.c)]));
    return { kind: 'area', cats: days.map((d) => ({ key: d, label: ddmm(d) })), series: ms.map((m, k) => ({ name: m, color: PALETTE[k % PALETTE.length], vals: days.map((d) => at.get(d + SEP + m) ?? 0) })), height: 280, fmt: f1, onPick: x.pick('v1', 'p', ['data']), selected: x.selOf('v1') }; };
  const turnoPecas = () => { const gr = groupP(x.cube, x.F('v2'), ['t']); return { cats: gr.map((g) => ({ key: g.vals[0], label: `Turno ${blank(g.vals[0])}` })), series: [{ name: 'Qtde peças', vals: gr.map((g) => M.qtdPecas(g.c)), color: PALETTE[0] }], fmt: fint, onPick: x.pick('v2', 'p', ['t']), selected: x.selOf('v2') }; };
  const disp = () => { const gr = groupP(x.cube, x.F('v3'), ['m']).map((g) => ({ g, v: M.pct(g.c) })).sort((a, b) => b.v - a.v); return { cats: gr.map(({ g, v }) => ({ key: g.vals[0], label: g.vals[0], color: corPctS(v) })), series: [{ name: 'Disponibilidade', vals: gr.map((r) => r.v), color: PALETTE[0] }], fmt: fpct, line: undefined, onPick: x.pick('v3', 'p', ['m']), selected: x.selOf('v3') }; };
  const prodPar = () => { const gr = groupP(x.cube, x.F('v4'), ['m']); return { cats: gr.map((g) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Horas produzidas (h)', vals: gr.map((g) => M.horasProd(g.c)), color: PALETTE[0] }, { name: 'Paradas (h)', vals: gr.map((g) => M.horasParadasResumo(g.c)), color: PALETTE[1] }], fmt: f1, onPick: x.pick('v4', 'p', ['m']), selected: x.selOf('v4') }; };
  const pecas = () => { const gr = groupP(x.cube, x.F('v5'), ['pm']).map((g) => ({ g, v: M.horasProd(g.c) })).sort((a, b) => b.v - a.v); return { orient: 'h', cats: gr.map(({ g }) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Horas', vals: gr.map((r) => r.v), color: PALETTE[0] }], fmt: f1, tip: (i) => `${fint(M.qtdPecas(gr[i].g.c))} peças`, onPick: x.pick('v5', 'p', ['pm']), selected: x.selOf('v5') }; };
  const turnoMaq = () => { const gr = groupP(x.cube, x.F('v6'), ['m', 't']); const ms = [...new Set(gr.map((g) => g.vals[0]))], ts = [...new Set(gr.map((g) => g.vals[1]))].sort(); return { cats: ms.map((m) => ({ key: m, label: m })), series: ts.map((t, k) => ({ name: `Turno ${t}`, color: PALETTE[k], vals: ms.map((m) => M.horasProd((gr.find((g) => g.vals[0] === m && g.vals[1] === t) ?? { c: { P: [] } }).c)) })), stacked: true, fmt: f1, onPick: x.pick('v6', 'p', ['m']), selected: x.selOf('v6') }; };
  return [cardsRow(x, 'resumo'),
    el('div', { class: 'bi-grid' },
      vis(`PRODUTIVIDADE POR ${u.toUpperCase()}`, () => chartBox(prodDia), { vid: 'v1', wide: true }),
      vis('DISPONIBILIDADE', () => chartBox(disp), { vid: 'v3' }), vis('HORAS PRODUZIDAS X HORAS PARADAS', () => chartBox(prodPar), { vid: 'v4' }),
      vis('QTD PEÇAS PRODUZIDAS (por turno)', () => chartBox(turnoPecas), { vid: 'v2' }),
      x.g === 'usi' ? vis('HORAS PRODUZIDAS POR TURNO', () => chartBox(turnoMaq), { vid: 'v6' }) : '',
      vis('TEMPO DAS PEÇAS PRODUZIDAS · QTD', () => chartBox(pecas, 'vscroll'), { vid: 'v5' }))];
}

function pageParadas(x) {
  const u = GROUPS[x.g].unit;
  let showTable = false;
  const porDia = () => { const gr = groupS(x.cube, x.F('v1'), ['m', 'data']); return { cats: gr.map((g) => ({ key: g.vals.join(SEP), label: ddmm(g.vals[1]), group: g.vals[0], color: corTempoS(M.horasParadas(g.c)) })), series: [{ name: 'Horas paradas', vals: gr.map((g) => M.horasParadas(g.c)), color: '#22d3ee' }], fmt: f1, onPick: x.pick('v1', 's', ['m', 'data']), selected: x.selOf('v1') }; };
  const porTurno = () => { const gr = groupS(x.cube, x.F('v2'), ['t']); return { orient: 'h', cats: gr.map((g) => ({ key: g.vals[0], label: g.vals[0] ? `Turno ${g.vals[0]}` : '(sem turno)' })), series: [{ name: 'Horas paradas', vals: gr.map((g) => M.horasParadas(g.c)), color: PALETTE[0] }], fmt: f1, onPick: x.pick('v2', 's', ['t']), selected: x.selOf('v2') }; };
  const par = () => { const r = pareto(x.cube, x.F('v3')); return { cats: r.map((p) => ({ key: p.mo, label: blank(p.mo) })), series: [{ name: 'Horas paradas', vals: r.map((p) => p.h), color: PALETTE[0] }], line: { name: '% Acumulado', vals: r.map((p) => p.pctAcc), fmt: fpct0, max: 1, ticks: [0, 0.5, 1], color: '#fb7185' }, fmt: f1, onPick: x.pick('v3', 's', ['mo']), selected: x.selOf('v3') }; };
  const porMaq = () => { const gr = groupS(x.cube, x.F('v4'), ['m']).map((g) => ({ g, v: M.horasParadas(g.c) })).sort((a, b) => a.v - b.v); return { orient: 'h', cats: gr.map(({ g }) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Horas', vals: gr.map((r) => r.v), color: PALETTE[0] }], fmt: f1, onPick: x.pick('v4', 's', ['m']), selected: x.selOf('v4') }; };
  const tbl = () => { const S = slice(x.cube, x.F('v1')).S; return table([
    { h: 'Data', v: (s) => dmy(s.d), key: (s) => s.d }, { h: 'Motivo', v: (s) => s.mo }, { h: 'Chapa', v: (s) => s.c }, { h: 'Descrição', v: (s) => s.ds }, { h: u, v: (s) => s.m }, { h: 'Turno', v: (s) => s.t },
    { h: 'TTL', v: (s) => hhmm(s.h), key: (s) => s.h, n: true }, { h: 'Início', v: (s) => s.i }, { h: 'Final', v: (s) => s.f }], S, { order: 6, totals: ['Total', '', '', '', '', '', hhmm(S.reduce((a, s) => a + s.h, 0)), '', ''] }); };
  const toggle = el('button', { type: 'button', onclick: () => { showTable = !showTable; toggle.textContent = showTable ? '📊 Ver gráfico' : '📋 Ver tabela'; vh.rebuild(); } }, '📋 Ver tabela');
  const vh = vis('HORAS PARADAS POR DIA', () => (showTable ? tbl() : chartBox(porDia)), { vid: 'v1', side: 's', wide: true, acts: [toggle] });
  return [cardsRow(x, 'paradas', 's'), el('div', { class: 'bi-grid' }, vh, vis('PARADAS POR TURNO', () => chartBox(porTurno), { vid: 'v2', side: 's' }), vis('PARETO DAS PARADAS', () => chartBox(par), { vid: 'v3', side: 's', wide: true }), vis(`HORAS DE PARADAS POR ${u.toUpperCase()}`, () => chartBox(porMaq), { vid: 'v4', side: 's' }))];
}

const tpCols = (lead, tail = []) => [...lead,
  { h: 'Peças', v: (r) => fint(M.pecasDistintas(r.c)), key: (r) => M.pecasDistintas(r.c), n: true },
  { h: 'Tempo (h)', v: (r) => f2(M.horasProd(r.c)), key: (r) => M.horasProd(r.c), n: true },
  { h: 'TP Padrão', v: (r) => f2(M.tp(r.c)), key: (r) => M.tp(r.c), n: true },
  { h: '%', v: (r) => ganhoTexto(M.ganho(r.c)), key: (r) => M.ganho(r.c) ?? -9, n: true, bg: (r) => corGanhoS(M.ganho(r.c)) }, ...tail];
const tpTotals = (c, lead) => [...lead, fint(M.pecasDistintas(c)), f2(M.horasProd(c)), f2(M.tp(c)), ganhoTexto(M.ganho(c))];
const avgOrder = (cols, rows) => rows.sort((a, b) => (M.mediaHoras(b.c) ?? 0) - (M.mediaHoras(a.c) ?? 0));

function tempoPecas(x, vid) {
  return () => { const gr = groupP(x.cube, x.F(vid), ['pm']).map((g) => ({ g, v: M.horasProd(g.c) })).sort((a, b) => b.v - a.v); return { orient: 'h', cats: gr.map(({ g }) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Horas', vals: gr.map((r) => r.v), color: PALETTE[0] }], fmt: f1, tip: (i) => `${fint(M.qtdPecas(gr[i].g.c))} peças`, onPick: x.pick(vid, 'p', ['pm']), selected: x.selOf(vid) }; };
}

function pagePeca(x) {
  const u = GROUPS[x.g].unit, pecasSel = pageFilterSet('pm');
  const c = () => slice(x.cube, x.F('cards'));
  const t1 = () => { const rows = avgOrder(0, rowsOf(groupP(x.cube, x.F('t1'), ['m', 'pm']))); return table(tpCols([{ h: u, v: (r) => r.vals[0] }, { h: 'Peça e Modelo', v: (r) => r.vals[1] }]), rows, { totals: tpTotals(slice(x.cube, x.F('t1')), ['Total', '']) }); };
  const t2 = () => { const rows = avgOrder(0, rowsOf(groupP(x.cube, x.F('t2'), ['cf', 'pm']))); return table(tpCols([{ h: 'Chapa', v: (r) => blank(r.vals[0]) }, { h: 'Peça e Modelo', v: (r) => r.vals[1] }]), rows, { totals: tpTotals(slice(x.cube, x.F('t2')), ['Total', '']) }); };
  const t3 = () => { const rows = avgOrder(0, rowsOf(groupP(x.cube, x.F('t3'), ['data', 'cf', 'pm', 't1', 't2', 't3'])));
    return table([{ h: 'Data', v: (r) => dmy(r.vals[0]), key: (r) => r.vals[0] }, { h: 'Turno', v: (r) => fint(r.c.P.reduce((s, p) => s + (+p.t || 0), 0)), n: true }, { h: 'Chapa', v: (r) => blank(r.vals[1]) }, { h: 'Peça e Modelo', v: (r) => r.vals[2] },
      { h: 'Tempo (h)', v: (r) => f2(M.horasProd(r.c)), key: (r) => M.horasProd(r.c), n: true }, { h: 'TP Padrão', v: (r) => f2(M.tp(r.c)), key: (r) => M.tp(r.c), n: true },
      { h: '%', v: (r) => ganhoTexto(M.ganho(r.c)), key: (r) => M.ganho(r.c) ?? -9, n: true, bg: (r) => corGanhoS(M.ganho(r.c)) }, { h: '1ºTURNO', v: (r) => r.vals[3] }, { h: '2ºTURNO', v: (r) => r.vals[4] }, { h: '3ºTURNO', v: (r) => r.vals[5] }], rows); };
  return [live(() => [card('PEÇA - MODELO', selecionado(pecasSel, 'Todos', 'peças selecionadas')), card('HORAS PRODUZIDAS', `${f1(M.horasProd(c()))} h`), card('PEÇAS', fint(M.pecasDistintas(c())))]),
    el('div', { class: 'bi-grid' }, vis(`${u.toUpperCase()} · PEÇA E MODELO`, t1, { vid: 't1' }), vis('CHAPA · PEÇA E MODELO', t2, { vid: 't2' }), vis('DETALHE', t3, { vid: 't3', wide: true }), vis('TEMPO DAS PEÇAS PRODUZIDAS · QTD', () => chartBox(tempoPecas(x, 'v5'), 'vscroll'), { vid: 'v5' }))];
}

function pageOperador(x) {
  const u = GROUPS[x.g].unit, nomeSel = pageFilterSet('nome');
  const t1 = () => table(tpCols([{ h: u, v: (r) => r.vals[0] }, { h: 'Peça e Modelo', v: (r) => r.vals[1] }, { h: 'Chapa', v: (r) => blank(r.vals[2]) }]), avgOrder(0, rowsOf(groupP(x.cube, x.F('t1'), ['m', 'pm', 'cf']))), { totals: tpTotals(slice(x.cube, x.F('t1')), ['Total', '', '']) });
  const t2 = () => table(tpCols([{ h: 'Nome', v: (r) => blank(r.vals[0]) }]), avgOrder(0, rowsOf(groupP(x.cube, x.F('t2'), ['nome']))), { totals: tpTotals(slice(x.cube, x.F('t2')), ['Total']) });
  const combo = () => { const gr = groupP(x.cube, x.F('v3'), ['cf']).map((g) => ({ g, v: M.horasProd(g.c) })).sort((a, b) => b.v - a.v);
    return { cats: gr.map(({ g }) => ({ key: g.vals[0], label: blank(g.vals[0]) })), series: [{ name: 'Tempo (h)', vals: gr.map((r) => r.v), color: PALETTE[0] }, { name: 'TP Padrão (h)', vals: gr.map((r) => M.tp(r.g.c)), color: PALETTE[1] }],
      line: { name: '% Ganho', vals: gr.map((r) => M.ganho(r.g.c)), fmt: fpct0, color: '#fb7185', max: Math.max(0.5, ...gr.map((r) => Math.abs(M.ganho(r.g.c) ?? 0))), ticks: [0, 0.5] }, fmt: f1, onPick: x.pick('v3', 'p', ['cf']), selected: x.selOf('v3') }; };
  const semNomes = !Object.keys(getOperators()).length;
  return [semNomes ? el('p', { class: 'bi-note' }, 'Os nomes vêm da lista de operadores do servidor, carregada ao abrir o app. Se não aparecerem, recarregue a página; se continuar, a lista de operadores ainda não foi configurada e só as chapas aparecem.') : '',
    live(() => [card('OPERADOR', selecionado(nomeSel, 'Todos', 'operadores selecionados')), card('HORAS PRODUZIDAS', `${f1(M.horasProd(slice(x.cube, x.F('cards'))))} h`)]),
    el('div', { class: 'bi-grid' }, vis(`${u.toUpperCase()} · PEÇA · CHAPA`, t1, { vid: 't1' }), vis('OPERADOR', t2, { vid: 't2' }), vis('TEMPO PRODUZIDO VS PADRÃO (por chapa)', () => chartBox(combo), { vid: 'v3', wide: true }), vis('TEMPO DAS PEÇAS PRODUZIDAS · QTD', () => chartBox(tempoPecas(x, 'v5'), 'vscroll'), { vid: 'v5' }))];
}

function pageMensal(x) {
  const u = GROUPS[x.g].unit;
  const combo = () => { const gr = groupP(x.cube, x.F('v1'), ['mes']); const order = (m) => ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'].indexOf(m); gr.sort((a, b) => order(a.vals[0]) - order(b.vals[0]));
    return { cats: gr.map((g) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Pecas', vals: gr.map((g) => M.horasProd(g.c)), color: PALETTE[0] }], line: { name: 'Horas', vals: gr.map((g) => M.horasProd(g.c)), fmt: f1, color: PALETTE[1] }, fmt: f1, onPick: x.pick('v1', 'p', ['mes']), selected: x.selOf('v1') }; };
  const turno = () => { const gr = groupP(x.cube, x.F('v4'), ['t']); return { cats: gr.map((g) => ({ key: g.vals[0], label: `Turno ${blank(g.vals[0])}` })), series: [{ name: 'Peças', vals: gr.map((g) => M.qtdPecas(g.c)), color: PALETTE[0] }], fmt: fint, onPick: x.pick('v4', 'p', ['t']), selected: x.selOf('v4') }; };
  const tbl = () => { const rows = rowsOf(groupP(x.cube, x.F('t1'), ['m'])), tot = slice(x.cube, x.F('t1'));
    return table([{ h: u, v: (r) => r.vals[0] }, { h: 'Peças', v: (r) => fint(M.qtdPecas(r.c)), key: (r) => M.qtdPecas(r.c), n: true }, { h: 'Horas (h)', v: (r) => f2(M.horasProd(r.c)), key: (r) => M.horasProd(r.c), n: true }, { h: 'Target (h)', v: (r) => f2(M.target(r.c)), key: (r) => M.target(r.c), n: true },
      { h: '%', v: (r) => fpct(M.pct(r.c)), key: (r) => M.pct(r.c), n: true, bg: (r) => corPctS(M.pct(r.c)) }, { h: 'Desvio', v: (r) => variacaoTexto(M.pct(r.c)), key: (r) => M.pct(r.c), n: true, bg: (r) => corVariacaoS(M.pct(r.c)) },
      { h: 'Média horas', v: (r) => f2(M.mediaHoras(r.c)), key: (r) => M.mediaHoras(r.c) ?? 0, n: true }, { h: 'Paradas (h)', v: (r) => f2(M.horasParadas(r.c)), key: (r) => M.horasParadas(r.c), n: true }], rows, { order: 4, desc: false,
      totals: ['Total', fint(M.qtdPecas(tot)), f2(M.horasProd(tot)), f2(M.target(tot)), fpct(M.pct(tot)), variacaoTexto(M.pct(tot)), f2(M.mediaHoras(tot)), f2(M.horasParadas(tot))] }); };
  return [cardsRow(x, 'paradas'), el('div', { class: 'bi-grid' }, vis('PRODUTIVIDADE POR MÊS', () => chartBox(combo), { vid: 'v1', wide: true }), vis('TEMPO POR PEÇA E MODELO', () => chartBox(tempoPecas(x, 'v5'), 'vscroll'), { vid: 'v5' }), vis(`${u.toUpperCase()} · META ${Math.round(META * 100)}%`, tbl, { vid: 't1' }), vis('PEÇAS POR TURNO', () => chartBox(turno), { vid: 'v4' }))];
}
const BUILDERS = { diaria: pageDiaria, paradas: pageParadas, peca: pagePeca, operador: pageOperador, mensal: pageMensal };
const pageFilterSet = (col) => pageFilter().p[col] ?? new Set();

// ---- quick date bar (Último dia, 7 dias, 30 dias, mês, De/Até) --------------------------------------------------
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function quickBar(cube, side, apply) {
  const dates = options(cube, side, 'data');
  if (!dates.length) return '';
  const last = dates.at(-1), f = pageFilter(), box = el('div', { class: 'bi-quick', role: 'group', 'aria-label': 'Período' });
  const set = (arr) => { if (arr) f[side].data = new Set(arr); else delete f[side].data; ui.sel = null; apply(); slicerFills.forEach((fn) => fn()); mark(); };
  const range = (a, b) => dates.filter((d) => d >= a && d <= b);
  const from = el('input', { type: 'date', min: dates[0], max: last, 'aria-label': 'De (data)', onchange: () => custom() }), to = el('input', { type: 'date', min: dates[0], max: last, 'aria-label': 'Até (data)', onchange: () => custom() });
  const custom = () => set(range(from.value || dates[0], to.value || last));
  const btns = [['Tudo', () => set(null)], [`Último dia (${dmy(last).slice(0, 5)})`, () => set([last])], ['7 dias', () => set(range(addDays(last, -6), last))], ['30 dias', () => set(range(addDays(last, -29), last))], ['Mês do último dia', () => set(range(`${last.slice(0, 8)}01`, last))]]
    .map(([t, fn], i) => el('button', { type: 'button', onclick: () => { active = i; fn(); } }, t));
  let active = null;
  function mark() { const n = f[side].data?.size ?? 0; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0 ? n === 0 : i === active && n > 0))); }
  box.append(el('span', { class: 'lbl' }, 'Período'), ...btns, el('label', { class: 'vf-d' }, 'De', from), el('label', { class: 'vf-d' }, 'Até', to));
  mark();
  return box;
}

// ---- shell --------------------------------------------------------------------------------------------------
const mergeF = (a, b) => {
  if (!b) return a;
  const out = { p: { ...a.p }, s: { ...a.s } };
  for (const side of ['p', 's']) for (const [col, set] of Object.entries(b[side] ?? {})) out[side][col] = a[side][col] ? new Set([...set].filter((v) => a[side][col].has(v))) : set;
  return out;
};

export async function renderBiUI(root, ctx) {
  const wrap = el('div', { class: 'bi pn' }), bar = el('div', { class: 'bi-bar' }), title = el('h2', { class: 'bi-h2' }, 'Indicadores'), main = el('div'), side = el('aside', { class: 'bi-side' });
  const seg = el('div', { class: 'bi-seg', role: 'group', 'aria-label': 'Grupo' }, Object.entries(GROUPS).map(([g, v]) => el('button', { type: 'button', 'aria-pressed': String(ui.g === g), onclick: () => { ui.g = g; if (!PAGES[g].some(([id]) => id === ui.page)) ui.page = 'diaria'; ui.sel = null; try { localStorage.setItem('bi.g', g); } catch { /* ignore */ } ctx.onGroup?.(g); renderBiUI(root, ctx); } }, v.name)));
  const tabs = el('div', { class: 'bi-pages', role: 'group', 'aria-label': 'Página' }, PAGES[ui.g].map(([id, label]) => el('button', { type: 'button', 'aria-pressed': String(ui.page === id), onclick: () => { ui.page = id; ui.sel = null; renderBiUI(root, ctx); } }, label)));
  bar.append(seg, tabs);
  wrap.append(title, bar, main);
  root.replaceChildren(wrap);
  main.append(el('p', { class: 'bi-note' }, 'Lendo a base…'));
  let base;
  try { base = await loadBase(ui.g); } catch (e) { main.replaceChildren(el('p', { class: 'bd-warn' }, e.message)); return; }
  if (!base.prod.length && !base.stops.length) {
    main.replaceChildren(el('div', { class: 'bi-empty' }, el('b', {}, `A base de ${GROUPS[ui.g].name} está vazia.`), el('span', {}, 'Importe o histórico do Excel ou suba uma folha conferida pelo botão "Subir para a base de dados".'), el('button', { type: 'button', class: 'primary', onclick: () => ctx.openBase?.() }, 'Abrir a base de dados')));
    return;
  }
  const cube = cubeFor(ui.g, base); curCube = cube;
  const days = [...new Set(base.prod.map((r) => r.d))].sort();
  const x = { cube, g: ui.g,
    F: (vid) => mergeF(mergeF(pageFilter(), ui.sel && ui.sel.vid !== vid ? ui.sel.f() : null), visFilterOf(vid)),
    selOf: (vid) => (ui.sel?.vid === vid ? ui.sel.keys : null),
    pick: (vid, sd, cols) => (key) => {
      if (ui.sel?.vid === vid) { if (ui.sel.keys.has(key)) ui.sel.keys.delete(key); else ui.sel.keys.add(key); if (!ui.sel.keys.size) ui.sel = null; }
      else ui.sel = { vid, side: sd, keys: new Set([key]), f() { const o = { p: {}, s: {} }; cols.forEach((c, i) => { o[sd][c] = new Set([...this.keys].map((k) => k.split(SEP)[i])); }); return o; } };
      drawMain();
    } };
  slicerFills = [];
  const prune = () => { const f = pageFilter(); for (let k = 0; k < 2; k++) for (const [, sd, col] of SLICERS[ui.page] ?? []) { const set = f[sd][col]; if (!set) continue; const ok = new Set(optionsFor(cube, sd, col, f)); const keep = [...set].filter((v) => ok.has(v)); if (keep.length === set.size) continue; if (keep.length) f[sd][col] = new Set(keep); else delete f[sd][col]; } };
  const slicers = (SLICERS[ui.page] ?? []).map(([t, sd, col]) => slicerBox(t === '@unit' ? GROUPS[ui.g].unit : t, sd, col, cube, () => { prune(); slicerFills.forEach((fn) => fn()); ui.sel = null; drawMain(); }));
  side.replaceChildren(...slicers);
  const toggle = el('button', { type: 'button', class: 'ghost bi-filters-toggle', onclick: () => side.classList.toggle('open') }, '☰ Filtros');
  const noteHost = el('div', { class: 'bi-notehost' });
  const noteFn = () => noteHost.replaceChildren(...(ui.sel ? [el('p', { class: 'bi-note' }, 'Filtro por clique ativo nos outros gráficos. ', el('button', { type: 'button', class: 'bi-more', onclick: () => { ui.sel = null; drawMain(); } }, 'Limpar clique'), ' ', el('button', { type: 'button', class: 'bi-more', onclick: () => { const c = slice(cube, mergeF(pageFilter(), ui.sel.f())); if (ui.sel.side === 's') openRecords(`Paradas (${c.S.length})`, STOP_HEAD, c.S.map(stopRow)); else openRecords(`Produções (${c.P.length})`, PROD_HEAD, c.P.map(prodRow)); } }, 'Ver registros'))] : []));
  let built = false;
  function drawMain() {
    if (!built) { REG.length = 0; const body = el('div', { class: 'bi-main' }, noteHost, quickBar(cube, ui.page === 'paradas' ? 's' : 'p', () => { prune(); drawMain(); }), alertsStrip(x), BUILDERS[ui.page](x)); layout.replaceChildren(side, body); built = true; }
    else REG.forEach((r) => r.rebuild());          // like Power BI: the other visuals redraw, the page does not move
    noteFn();
  }
  const layout = el('div', { class: 'bi-layout' });
  main.replaceChildren(el('p', { class: 'bi-note' }, `${GROUPS[ui.g].name} · ${days.length} dias (${dmy(days[0])} a ${dmy(days.at(-1))}) · ${base.prod.length.toLocaleString('pt-BR')} produções · ${base.stops.length.toLocaleString('pt-BR')} paradas. Clique numa barra para filtrar os outros gráficos.`), toggle, layout);
  drawMain();
}
