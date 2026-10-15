// "4 · BI": the Power BI reports (RAW and usinagem) rebuilt on the history. Numbers come from core/bi.js (the report's own measures).
import './bi.css';
import { buildCube, slice, M, corEfic, options, optionsFor, auditoria24, dayRows, cardsBI, anomalias, destaques, withP, withS, groupP, groupS, pareto, ganhoTexto, variacaoTexto, selecionado, META } from './core/bi.js';
import { dmy, dayLoads, historyStandardOf, spanHours } from './core/history.js';
import { loadBase, matrixRev } from './historico.js';
import { recordsEditor } from './dbeditor.js';
import { getOperators, operatorName } from './core/operators.js';
import { el, chartBox as rawChartBox, PALETTE } from './bicharts.js';
import { auditData } from './core/audit.js';
import { getValor } from './valorhora.js';
import { brl } from './core/plan.js';
import * as BI from './core/bi.js';

// the report's color rules are kept, painted with the Painel's palette
const SKIN = { '#81C784': '#a3e635', '#70AD47': '#a3e635', '#FFD966': '#fbbf24', '#E57373': '#fb7185', '#C00000': '#fb7185', '#E6A8A8': '#fb7185', '#4472C4': '#22d3ee' };
const sk = (c) => SKIN[c] ?? c;
const corEficS = (e) => sk(corEfic(e));
const corPctS = (v) => sk(BI.corPct(v)), corGanhoS = (g) => sk(BI.corGanho(g)), corTempoS = (h) => sk(BI.corTempo(h)), corVariacaoS = (v) => sk(BI.corVariacao(v));

const SEP = '\u0001';
// Cross-highlight like Power BI: when a bar of ANOTHER chart is clicked, a column/bar chart keeps all its bars dim and lights up the part that belongs to the click
let curVid = null;
const hlWrap = (vid, build) => () => {
  const f = build();
  if (!ui.sel || ui.sel.vid === vid || f.kind === 'area' || !f.cats || !f.series) return f;
  ui.noSel = true; let full; try { full = build(); } finally { ui.noSel = false; }
  const idx = new Map(f.cats.map((c, i) => [c.key, i]));
  for (const s of full.series) { const sf = f.series.find((q) => q.name === s.name); s.hl = full.cats.map((c) => { const i = idx.get(c.key); return i == null ? 0 : sf?.vals[i] ?? 0; }); }
  full.hlOn = true;
  return full;
};
const chartBox = (spec, cls) => { const vid = curVid; return rawChartBox(typeof spec === 'function' ? hlWrap(vid, spec) : spec, cls); };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const fileSafe = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 -]+/g, ' ').trim().replace(/\s+/g, '-').slice(0, 60) || 'dados';
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
const PAGES = { raw: [['geral', 'Visão geral'], ['paradas', 'Paradas'], ['entrega', 'Entrega (horas padrão)'], ['pessoas', 'Peças e operadores']], usi: [['geral', 'Visão geral'], ['paradas', 'Paradas'], ['entrega', 'Entrega (horas padrão)'], ['pessoas', 'Peças e operadores']] };

const ui = { t24: { open: false, key: null, only: false }, g: 'raw', page: 'geral', filt: {}, vf: {}, lead: {}, uteis: {}, multi: false, sel: null, cubes: {} };
try { const s = localStorage.getItem('bi.g'); if (s === 'raw' || s === 'usi') ui.g = s; } catch { /* no storage */ }

export { openRecords, table as biTable, fileSafe, vis as biVis, card as biStat };
export const setBiGroup = (g) => { if (GROUPS[g]) { ui.g = g; if (!PAGES[g].some(([id]) => id === ui.page)) ui.page = 'diaria'; ui.sel = null; } };
const cubeFor = (g, base) => {
  const key = `${base.rev}|${Object.keys(getOperators()).length}|${matrixRev()}`;
  if (ui.cubes[g]?.key !== key) ui.cubes[g] = { key, cube: buildCube(base, (c) => operatorName(c) || '') };
  return ui.cubes[g].cube;
};

// ---- slicers ------------------------------------------------------------------------------------------------
const SLICERS = {
  geral: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm'], ['Turno', 'p', 't']],
  paradas: [['Dia', 's', 'data'], ['Mês', 's', 'mes'], ['@unit', 's', 'm'], ['Motivo', 's', 'mo'], ['Turno', 's', 't']],
  entrega: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['Turno', 'p', 't'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm'], ['Nome do operador', 'p', 'nome']],
  pessoas: [['Dia', 'p', 'data'], ['Mês', 'p', 'mes'], ['Turno', 'p', 't'], ['@unit', 'p', 'm'], ['Peça - Modelo', 'p', 'pm'], ['Nome do operador', 'p', 'nome']],
};
// ONE set of filters per group, shared by every page: the dates, months, machine and shift you pick follow you from page to page.
// The Produção side (p) and the Paradas side (s) keep the same values for the columns they share.
const pageFilter = () => (ui.filt[ui.g] ??= { p: {}, s: {} });
const SHARED = ['data', 'mes', 'm', 't'];
function mirror() {
  const f = pageFilter(), a = ui.page === 'paradas' ? 's' : 'p', b = a === 'p' ? 's' : 'p';
  for (const c of SHARED) { if (f[a][c]) f[b][c] = new Set(f[a][c]); else delete f[b][c]; }
}
const optLabel = (col, v) => (v === '' ? '(vazio)' : col === 'data' ? dmy(v) : col === 't' ? `Turno ${v}` : v);

// Like Power BI: a plain click selects only that item (click it again to clear); Ctrl/⌘ + click (or "Seleção múltipla", for touch screens) adds or removes items; "Selecionar tudo" marks every item of the list
function slicerBox(title, side, col, cube, onChange) {
  const f = pageFilter(), sets = () => f[side];
  const list = el('ul'), search = el('input', { type: 'search', placeholder: 'Buscar', 'aria-label': `Buscar em ${title}` });
  const all = el('button', { type: 'button', title: 'Marca todos os itens da lista (os que aparecem na busca)', onclick: () => { const q = search.value.trim().toLowerCase(); sets()[col] = new Set(optionsFor(cube, side, col, f).filter((v) => !q || optLabel(col, v).toLowerCase().includes(q))); fill(); onChange(); } }, '✓ Selecionar tudo');
  const badge = el('em', { class: 'cnt' });
  const box = el('section', { class: 'bi-slicer' }, el('header', {}, el('span', { class: 'tt' }, title, badge), el('span', { class: 'hd' }, all, el('button', { type: 'button', onclick: () => { delete sets()[col]; fill(); onChange(); } }, '✕ Limpar'))), search, list);
  function pick(v, add) {
    const cur = sets()[col];
    if (add) { const s2 = (sets()[col] ??= new Set()); if (s2.has(v)) s2.delete(v); else s2.add(v); if (!s2.size) delete sets()[col]; }
    else if (cur && cur.size === 1 && cur.has(v)) delete sets()[col];
    else sets()[col] = new Set([v]);
    fill(); onChange();
  }
  function fill() {
    const vals = optionsFor(cube, side, col, f), q = search.value.trim().toLowerCase(), cur = sets()[col];
    badge.textContent = cur?.size ? String(cur.size) : '';
    list.replaceChildren(...vals.filter((v) => !q || optLabel(col, v).toLowerCase().includes(q)).map((v) => el('li', {}, el('label', {}, el('input', { type: 'checkbox', checked: cur?.has(v) || null, onclick: (e) => { e.preventDefault(); pick(v, e.ctrlKey || e.metaKey || ui.multi); } }), optLabel(col, v)))));
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
function vis(title, build, { vid, side = 'p', wide = false, acts = [], filters = true } = {}) {
  VSIDE[vid] = side;
  const box = el('section', { class: `bi-vis${wide ? ' wide' : ''}` }), slot = el('div');
  const max = el('button', { type: 'button', 'aria-label': 'Ampliar', onclick: () => { const on = box.classList.toggle('max'); max.textContent = on ? '✕ Fechar' : '⤢'; } }, '⤢');
  box.vid = vid;
  box.rebuild = () => {
    const old = slot.querySelector('.bi-ch'), keep = old ? old._left ?? old.scrollLeft : 0;
    curVid = vid;
    try { slot.replaceChildren(build()); } finally { curVid = null; }
    const nu = slot.querySelector('.bi-ch'); if (nu && keep) nu._left = keep;
  };
  const barHost = el('div', { class: 'vf-host' }), fkey = `${ui.g}.${ui.page}.${vid}`;
  let open = false;
  const isActive = () => { const t = ui.vf[fkey]; return !!t && (t.m?.size > 0 || !!t.from || !!t.to); };
  const fbtn = el('button', { type: 'button', class: 'vf-btn', 'aria-expanded': 'false', onclick: () => { open = !open; sync(); } }, '⚙ Filtros');
  const sync = () => { const on = isActive(); barHost.hidden = !(open || on); fbtn.classList.toggle('on', on); fbtn.textContent = on ? '⚙ Filtros ●' : '⚙ Filtros'; fbtn.setAttribute('aria-expanded', String(open)); };
  box.rebuildBar = () => { barHost.replaceChildren(visFilterBar(vid, side, changed)); sync(); };
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
    box.rebuild(); sync();
  };
  REG.push(box);
  const xl = el('button', { type: 'button', 'aria-label': 'Baixar em Excel', title: 'Baixar os dados deste gráfico em Excel', onclick: async () => { const t = slot.firstElementChild?.getTable?.(); if (!t) return; const X = await import('xlsx'); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([t.head, ...t.rows]), 'Dados'); X.writeFile(wb, `${fileSafe(title)}.xlsx`); } }, '⬇ Excel');
  box.append(el('header', {}, el('h4', {}, title), el('div', { class: 'acts' }, acts, filters ? fbtn : '', filters ? xl : '', max)), filters ? barHost : '', slot);
  if (filters) box.rebuildBar();
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
  wrap.getTable = () => { let list = rows; if (sortCol != null) { const c = cols[sortCol], k = c.key ?? c.v; list = [...rows].sort((a, b) => { const x = k(a), y = k(b); return (x < y ? -1 : x > y ? 1 : 0) * dir; }); } return { head: cols.map((c) => c.h), rows: list.map((r) => cols.map((c) => { const v = c.v(r); return v && typeof v === 'object' ? '' : v; })) }; };
  return wrap;
}
// a short, plain sentence under a chart title saying what it shows
const explain = (text, build) => () => { const w = el('div', {}), inner = build(); w.getTable = () => inner.getTable?.(); w.append(typeof text === 'string' ? el('p', { class: 'bi-note bi-explain' }, text) : text, inner); return w; };
// explanation of the robot chart, in the same words and colors as its legend
const legendNote = () => {
  const chip = (c, round) => el('i', { class: `ex-chip${round ? ' round' : ''}`, style: `background:${c}` });
  const item = (c, name, text, round) => el('li', {}, chip(c, round), el('b', {}, name), ' — ', text);
  return el('div', { class: 'bi-explain-box' }, el('p', {}, 'Para as mesmas peças de cada máquina:'),
    el('ul', {}, item(PALETTE[0], 'Tempo real gasto (h)', 'quanto tempo a máquina realmente levou, pelos horários da folha.'),
      item(PALETTE[3], 'Tempo que o padrão previa (h)', 'quanto tempo essas peças deveriam levar, segundo a matriz de tempos.'),
      item('#94a3b8', 'Tempo real sem padrão (h) ⚠', 'peças que a matriz ainda não tem: foram produzidas e contam em horas e peças, mas ficam fora da eficiência. Complete a matriz na aba Base de dados.'),
      item('#fb7185', 'Eficiência (previsto ÷ real)', 'acima de 100%: a máquina foi mais rápida que o padrão (barra verde maior que a azul). Abaixo de 100%: demorou mais que o padrão.', true)));
};
const rowsOf = (groups) => groups.map((g) => ({ vals: g.vals, c: g.c }));

// ---- records (modal) ------------------------------------------------------------------------------------------
function openRecords(title, head, rows, note) {
  document.getElementById('bd-modal')?.remove();
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const tbl = table(head.map((h, i) => ({ h, v: (r) => r[i], n: typeof rows[0]?.[i] === 'number' })), rows, { limit: 400 });
  const box = el('div', { id: 'bd-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, el('div', { class: 'bd-box wide' },
    el('div', { class: 'bd-head' }, el('h3', {}, title), el('span', { class: 'hd' }, el('button', { type: 'button', class: 'ghost', onclick: async () => { const t = tbl.getTable(); const X = await import('xlsx'); const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([t.head, ...t.rows]), 'Dados'); X.writeFile(wb, `${fileSafe(title)}.xlsx`); } }, '⬇ Excel'), el('button', { type: 'button', class: 'bd-x', 'aria-label': 'Fechar', onclick: close }, '✕'))),
    el('div', { class: 'bd-body' }, note ? el('p', { class: 'note' }, note) : '', tbl)));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.append(box); document.addEventListener('keydown', onKey);
}
const times = (r) => [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]].filter(([a, b]) => a || b).map(([a, b]) => `${a}–${b}`).join(' · ');
const turnTot = (a, b) => { const h = spanHours(a, b); return h == null ? '00:00' : hhmm(h); };
const prodRow = (r) => [dmy(r.d), r.m, r.pm, r.cf, r.t, times(r.src), turnTot(r.src.i1, r.src.f1), turnTot(r.src.i2, r.src.f2), turnTot(r.src.i3, r.src.f3), +r.h.toFixed(2), +r.tp.toFixed(2)];
const PROD_HEAD = ['Data', 'Máquina', 'Peça e modelo', 'Chapa', 'Turno', 'Horários', '1º turno', '2º turno', '3º turno', 'Horas', 'Padrão (h)'];
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
function cardsRow(x, kind, side = 'p', slim = false) {
  return live(() => {
    const c = slice(x.cube, x.F('cards')), pv = prevSlice(x, side);
    const res = kind === 'resumo' ? M.horasParadasResumo(c) : M.horasParadas(c), pct = M.pct(c);
    const resPrev = pv ? (kind === 'resumo' ? M.horasParadasResumo(pv) : M.horasParadas(pv)) : null;
    const gap = (pct - META) * 100;
    return [card('PRODUÇÃO (peças)', fint(M.qtdPecas(c)), null, pv ? arrow(M.qtdPecas(c) - M.qtdPecas(pv), '', 0) : ''),
      card('HORAS PRODUZIDAS', `${f1(M.horasProd(c))} h`, null, pv ? arrow(M.horasProd(c) - M.horasProd(pv), ' h') : ''),
      card(kind === 'resumo' ? 'HORAS PARADAS (todas do dia e máquina)' : 'HORAS PARADAS (das chapas filtradas)', `${f1(res)} h`, null, resPrev != null ? arrow(res - resPrev, ' h') : ''),
      ...(slim ? [] : [card('DISPONIBILIDADE', fpct(pct), corPctS(pct), `Meta ${Math.round(META * 100)}% · ${gap >= 0 ? '+' : '−'}${f1(Math.abs(gap))} pts${pv ? ' · ' + arrow((pct - M.pct(pv)) * 100, ' pts') : ''}`)]),
      ...(getValor(x.g) > 0 ? [card('PERDA COM PARADA', brl(res * getValor(x.g)), '#fb7185', `${f1(res)} h × ${brl(getValor(x.g))} por hora`)] : [])];
  });
}
// top row: cards like the ones of the Análise tab (machine, chip, who, big number, short story, "Abrir")
const TONE = { bad: '#fb7185', warn: '#fbbf24', ok: '#a3e635' };
function biCard(c) {
  const people = c.people?.length ? el('div', { class: 'oper-id' }, el('span', { class: 'olabel' }, 'Operador'), c.people.map((o) => el('div', { class: 'oname' }, el('b', {}, o.nome || `chapa ${o.chapa}`), o.nome ? el('small', {}, `chapa ${o.chapa}`) : ''))) : null;
  const open = () => (c.detail ? openRecords(c.detail.title, c.detail.head, c.detail.rows) : c.open?.());
  return el('article', { class: 'acard', style: `--kc:${TONE[c.tone]}`, tabindex: 0, role: 'button', 'aria-label': `${c.machine}: ${c.title}. Clique para abrir.`, onclick: open, onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } },
    el('div', { class: 'ftop' }, el('strong', { class: 'fmachine' }, c.machine), el('span', { class: 'kchip' }, el('i'), c.title)),
    people,
    c.big ? el('div', { class: 'fbig2' }, el('b', {}, c.big), el('small', {}, c.bigLabel)) : null,
    el('p', { class: 'tbrief' }, c.brief),
    el('div', { class: 'ffoot' }, el('span', {}, c.foot), el('span', { class: 'fhint' }, 'Abrir ⤢')));
}
function alertsStrip(x) {
  return live(() => {
    const f = x.F('cards'), c = slice(x.cube, f), cards = cardsBI(x.cube, f, { unit: GROUPS[x.g].unit, groupName: GROUPS[x.g].name }), d24 = auditoria24(x.cube, f), bad = anomalias(x.cube, f), sem = M.pecasSemPadrao(c);
    // data to check before trusting the numbers
    const n = d24.length + bad.length + (sem ? 1 : 0);
    if (n) cards.push({ key: 'conferir', tone: d24.length ? 'bad' : 'warn', machine: 'Dados para conferir', title: 'Antes de confiar nos números', big: String(d24.length + bad.length || sem), bigLabel: d24.length + bad.length ? 'dias e registros' : 'peças sem padrão', brief: [d24.length ? `${d24.length} dia(s) de máquina acima de 24 h` : '', bad.length ? `${bad.length} registro(s) com horas fora do normal` : '', sem ? `${sem.toLocaleString('pt-BR')} peça(s) sem tempo padrão` : ''].filter(Boolean).join(' · ') + '.', foot: 'Abrir a lista',
      open: () => openRecords('Dados para conferir', ['Tipo', 'Dia', 'Máquina', 'Detalhe'], [...d24.map((r) => ['Dia acima de 24 h', dmy(r.d), r.m, `${r.ph.toFixed(1)} h produção + ${r.sh.toFixed(1)} h paradas = ${r.tot.toFixed(1)} h · ${r.why}`]), ...bad.map(({ r, why }) => ['Registro suspeito', dmy(r.d), r.m, `${r.pm} · ${r.h.toFixed(1)} h · ${why}`]), ...(sem ? [['Sem tempo padrão', '', '', `${sem} peças (veja a página Entrega, tabela "Peças sem tempo padrão")`]] : [])]) });
    const order = { bad: 0, warn: 1, ok: 2 };
    return cards.length ? [el('div', { class: 'acards bi-acards' }, cards.map(biCard))] : [];
  }, 'bi-alerts');
}
const unitCats = (groups) => groups.map((g) => ({ key: g.vals.join(SEP), label: blank(g.vals.at(-1)) }));

function pageGeral(x) {
  const u = GROUPS[x.g].unit;
  // one smooth line per machine over the days; the day is the only axis label
  const prodDia = () => { const gr = groupP(x.cube, x.F('v1'), ['data', 'm']); const days = [...new Set(gr.map((g) => g.vals[0]))], ms = [...new Set(gr.map((g) => g.vals[1]))].sort();
    const at = new Map(gr.map((g) => [g.vals[0] + SEP + g.vals[1], M.horasProd(g.c)]));
    return { kind: 'area', cats: days.map((d) => ({ key: d, label: ddmm(d) })), series: ms.map((m, k) => ({ name: m, color: PALETTE[k % PALETTE.length], vals: days.map((d) => at.get(d + SEP + m) ?? 0) })), height: 260, fmt: f1, onPick: x.pick('v1', 'p', ['data']), selected: x.selOf('v1') }; };
  const disp = () => { const gr = groupP(x.cube, x.F('v3'), ['m']).map((g) => ({ g, v: M.pct(g.c) })).sort((a, b) => b.v - a.v); return { cats: gr.map(({ g, v }) => ({ key: g.vals[0], label: g.vals[0], color: corPctS(v) })), series: [{ name: 'Disponibilidade', vals: gr.map((r) => r.v), color: PALETTE[0] }], fmt: fpct, onPick: x.pick('v3', 'p', ['m']), selected: x.selOf('v3') }; };
  const prodPar = () => { const gr = groupP(x.cube, x.F('v4'), ['m']); return { cats: gr.map((g) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Horas produzidas (h)', vals: gr.map((g) => M.horasProd(g.c)), color: PALETTE[0] }, { name: 'Paradas (h)', vals: gr.map((g) => M.horasParadasResumo(g.c)), color: PALETTE[1] }], fmt: f1, onPick: x.pick('v4', 'p', ['m']), selected: x.selOf('v4') }; };
  const turnoMaq = () => { const gr = groupP(x.cube, x.F('v6'), ['m', 't']); const ms = [...new Set(gr.map((g) => g.vals[0]))], ts = [...new Set(gr.map((g) => g.vals[1]))].sort(); return { cats: ms.map((m) => ({ key: m, label: m })), series: ts.map((t, k) => ({ name: t ? `Turno ${t}` : 'Sem turno', color: PALETTE[k], vals: ms.map((m) => M.horasProd((gr.find((g) => g.vals[0] === m && g.vals[1] === t) ?? { c: { P: [] } }).c)) })), stacked: true, fmt: f1, onPick: x.pick('v6', 'p', ['m']), selected: x.selOf('v6') }; };
  // production + stops of each machine and day (midnight to midnight) against the 24 h line: a bar above the line is an error to fix
  let load24 = 'todos';
  const dias24 = () => { const L = dayRows(x.cube, x.F('v8'));
    let rows;
    if (load24 === 'todos') rows = L.slice().sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.m < b.m ? -1 : 1));
    else if (load24 === 'acima') rows = L.filter((r) => r.tot > 24.0001).sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.m < b.m ? -1 : 1));
    else if (load24 === 'pior') { const by = new Map(); for (const r of L) { const o = by.get(r.d); if (!o || r.tot > o.tot) by.set(r.d, r); } rows = [...by.values()].sort((a, b) => (a.d < b.d ? -1 : 1)); }
    else rows = L.filter((r) => r.m === load24).sort((a, b) => (a.d < b.d ? -1 : 1));
    return { cats: rows.map((r) => ({ key: r.d + SEP + r.m, label: load24 === 'todos' ? r.m.replace(/^RAW/, '') : load24 === 'acima' ? `${ddmm(r.d)} ${r.m}` : ddmm(r.d), ...(load24 === 'todos' ? { group: ddmm(r.d) } : {}), alert: r.tot > 24.0001 })), stacked: true, totalsOnlyAlerts: load24 === 'todos', height: 300, refLine: { value: 24, label: 'limite: 24 h', color: '#fbbf24' }, fmt: f1,
      series: [{ name: 'Produção (h)', vals: rows.map((r) => r.ph), color: PALETTE[0] }, { name: 'Paradas (h)', vals: rows.map((r) => r.sh), color: PALETTE[1] }],
      onPick: (key) => { ui.t24.key = ui.t24.key === key ? null : key; v24.rebuild(); }, selected: ui.t24.key ? new Set([ui.t24.key]) : null, rowsOf24: rows,
      tip: (i) => `${rows[i].m} · ${dmy(rows[i].d)} · total ${f1(rows[i].tot)} h${rows[i].tot > 24.0001 ? ' ⚠ passa de 24 h' : ''}${rows[i].overlapH > 0.01 ? ` · ${f1(rows[i].overlapH)} h no mesmo horário` : ''}` }; };
  const sel24 = el('select', { 'aria-label': 'O que mostrar', onchange: (e) => { load24 = e.target.value; v24.rebuild(); } },
    el('option', { value: 'todos' }, `Todos os ${u.toLowerCase()}s, dia a dia`), el('option', { value: 'pior' }, `Só o ${u.toLowerCase()} mais carregado de cada dia`), el('option', { value: 'acima' }, 'Só os dias com erro (passam de 24 h)'), ...options(x.cube, 'p', 'm').map((m) => el('option', { value: m }, `Só ${m}`)));
  // the chart and, under it, the records it is made of (editable); a clicked bar is highlighted in the table
  const tblBtn = el('button', { type: 'button', class: 'vf-btn', 'aria-expanded': 'false', onclick: () => { ui.t24.open = !ui.t24.open; v24.rebuild(); } }, '▦ Abrir tabela');
  const build24 = () => {
    const spec = dias24(), chart = chartBox(() => spec);
    const wrapBox = el('div', {}); wrapBox.getTable = () => chart.getTable?.();
    if (load24 === 'todos') wrapBox.append(el('p', { class: 'bi-note bi-explain' }, `Cada bloco é um dia; dentro dele há uma barra por ${u.toLowerCase()}${x.g === 'raw' ? ' (05 = RAW05, 06 = RAW06…)' : ''}. O número aparece só nas barras que passam de 24 h; passe o mouse para ver os valores.`));
    wrapBox.append(chart);
    tblBtn.textContent = ui.t24.open ? '▦ Fechar tabela' : '▦ Abrir tabela'; tblBtn.setAttribute('aria-expanded', String(ui.t24.open)); tblBtn.classList.toggle('on', ui.t24.open);
    if (!ui.t24.open) { if (ui.t24.key) wrapBox.append(el('p', { class: 'bi-note' }, 'Barra escolhida: ', el('b', {}, ui.t24.key.split(SEP).reverse().join(' · ').replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')), '. Clique em "Abrir tabela" para ver e corrigir os registros dela.')); return wrapBox; }
    const rows = spec?.rowsOf24 ?? [], pickRows = ui.t24.only && ui.t24.key ? rows.filter((r) => r.d + SEP + r.m === ui.t24.key) : rows;
    const hitP = new Set(), hitS = new Set(), spillP = new Set(), spillS = new Set();
    // a record that starts the day before and crosses midnight counts, in part, on the next day: it is shown in amber and named
    rows.filter((r) => r.d + SEP + r.m === ui.t24.key).forEach((r) => { r.PR.forEach((p) => { hitP.add(p); if (p.d !== r.d) spillP.add(p); }); r.SR.forEach((p) => { hitS.add(p); if (p.d !== r.d) spillS.add(p); }); });
    const uniq = (k) => [...new Set(pickRows.flatMap((r) => r[k]))];
    const byTime = (a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.m < b.m ? -1 : a.m > b.m ? 1 : String(a.i1 ?? a.i).localeCompare(String(b.i1 ?? b.i)));
    const sel = ui.t24.key ? el('span', {}, 'Destacado: ', el('b', {}, ui.t24.key.split(SEP).reverse().join(' · ').replace(/(\d{4})-(\d{2})-(\d{2})/, '$3/$2/$1')), ' ',
      el('button', { type: 'button', class: 'bi-more', onclick: () => { ui.t24.only = !ui.t24.only; v24.rebuild(); } }, ui.t24.only ? 'Mostrar todas as linhas' : 'Mostrar só desta barra'), ' ', el('button', { type: 'button', class: 'bi-more', onclick: () => { ui.t24.key = null; v24.rebuild(); } }, 'Limpar'))
      : el('span', {}, 'Clique numa barra do gráfico para destacar aqui os registros dela.');
    const common = { g: x.g, toast: x.toast, onSaved: () => x.refresh() };
    wrapBox.append(el('p', { class: 'bi-note dbe-note-hit' }, 'Edite a célula e clique em Salvar: a base de dados é atualizada e todos os gráficos recalculam. ', sel),
      ...(spillP.size + spillS.size ? [el('p', { class: 'bi-note dbe-note-hit' }, `Linhas em âmbar começam no dia anterior e passam da meia-noite: só a parte depois das 00:00 conta em ${dmy(ui.t24.key.split(SEP)[0])}. São ${fint(spillP.size + spillS.size)} no total.`)] : []),
      recordsEditor({ ...common, kind: 'prod', title: 'Produções', records: uniq('PR').sort(byTime), focus: hitP, spill: spillP, empty: 'Nenhuma produção nestes dias.' }),
      recordsEditor({ ...common, kind: 'stop', title: 'Paradas', records: uniq('SR').sort(byTime), focus: hitS, spill: spillS, empty: 'Nenhuma parada nestes dias.' }));
    return wrapBox;
  };
  const v24 = vis('PRODUÇÃO + PARADAS POR DIA (limite de 24 h)', build24, { vid: 'v8', wide: true, acts: [tblBtn, sel24] });
  const mes = () => { const gr = groupP(x.cube, x.F('v7'), ['mes']); const order = (m) => MESES.indexOf(m); gr.sort((a, b) => order(a.vals[0]) - order(b.vals[0]));
    return { cats: gr.map((g) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Horas produzidas (h)', vals: gr.map((g) => M.horasProd(g.c)), color: PALETTE[0] }, { name: 'Paradas (h)', vals: gr.map((g) => M.horasParadasResumo(g.c)), color: PALETTE[1] }], fmt: f1, onPick: x.pick('v7', 'p', ['mes']), selected: x.selOf('v7') }; };
  const tbl = () => { const rows = rowsOf(groupP(x.cube, x.F('t1'), ['m'])), tot = slice(x.cube, x.F('t1'));
    return table([{ h: u, v: (r) => r.vals[0] }, { h: 'Peças', v: (r) => fint(M.qtdPecas(r.c)), key: (r) => M.qtdPecas(r.c), n: true }, { h: 'Horas (h)', v: (r) => f2(M.horasProd(r.c)), key: (r) => M.horasProd(r.c), n: true }, { h: 'Meta (h)', v: (r) => f2(M.target(r.c)), key: (r) => M.target(r.c), n: true },
      { h: 'Disponib.', v: (r) => fpct(M.pct(r.c)), key: (r) => M.pct(r.c), n: true, bg: (r) => corPctS(M.pct(r.c)) }, { h: 'Desvio', v: (r) => variacaoTexto(M.pct(r.c)), key: (r) => M.pct(r.c), n: true, bg: (r) => corVariacaoS(M.pct(r.c)) },
      { h: 'Paradas (h)', v: (r) => f2(M.horasParadas(r.c)), key: (r) => M.horasParadas(r.c), n: true }], rows, { order: 4, desc: false,
      totals: ['Total', fint(M.qtdPecas(tot)), f2(M.horasProd(tot)), f2(M.target(tot)), fpct(M.pct(tot)), variacaoTexto(M.pct(tot)), f2(M.horasParadas(tot))] }); };
  return [alertsStrip(x), cardsRow(x, 'resumo', 'p', true),
    el('div', { class: 'bi-grid' },
      vis(`PRODUTIVIDADE POR ${u.toUpperCase()} · por dia`, () => chartBox(prodDia), { vid: 'v1', wide: true }),
      vis('DISPONIBILIDADE', () => chartBox(disp), { vid: 'v3' }), vis('HORAS PRODUZIDAS X PARADAS', () => chartBox(prodPar), { vid: 'v4' }),
      v24,
      vis('HORAS PRODUZIDAS POR TURNO', () => chartBox(turnoMaq), { vid: 'v6' }),
      vis('POR MÊS', () => chartBox(mes), { vid: 'v7' }),
      vis(`RESUMO POR ${u.toUpperCase()} · meta ${Math.round(META * 100)}%`, tbl, { vid: 't1', wide: true }))];
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

function pagePessoas(x) {
  const u = GROUPS[x.g].unit, pecasSel = pageFilterSet('pm'), nomeSel = pageFilterSet('nome');
  const t1 = () => { const rows = avgOrder(0, rowsOf(groupP(x.cube, x.F('t1'), ['m', 'pm']))); return table(tpCols([{ h: u, v: (r) => r.vals[0] }, { h: 'Peça e Modelo', v: (r) => r.vals[1] }]), rows, { totals: tpTotals(slice(x.cube, x.F('t1')), ['Total', '']) }); };
  const t2 = () => table(tpCols([{ h: 'Chapa', v: (r) => blank(r.vals[0]) }, { h: 'Nome', v: (r) => blank(r.vals[1]) }]), avgOrder(0, rowsOf(groupP(x.cube, x.F('t2'), ['cf', 'nome']))), { totals: tpTotals(slice(x.cube, x.F('t2')), ['Total', '']) });
  const t3 = () => { const rows = avgOrder(0, rowsOf(groupP(x.cube, x.F('t3'), ['data', 'cf', 'pm', 't1', 't2', 't3'])));
    return table([{ h: 'Data', v: (r) => dmy(r.vals[0]), key: (r) => r.vals[0] }, { h: 'Turno', v: (r) => fint(r.c.P.reduce((s, p) => s + (+p.t || 0), 0)), n: true }, { h: 'Chapa', v: (r) => blank(r.vals[1]) }, { h: 'Peça e Modelo', v: (r) => r.vals[2] },
      { h: 'Tempo (h)', v: (r) => f2(M.horasProd(r.c)), key: (r) => M.horasProd(r.c), n: true }, { h: 'TP Padrão', v: (r) => f2(M.tp(r.c)), key: (r) => M.tp(r.c), n: true },
      { h: '%', v: (r) => ganhoTexto(M.ganho(r.c)), key: (r) => M.ganho(r.c) ?? -9, n: true, bg: (r) => corGanhoS(M.ganho(r.c)) }, { h: '1ºTURNO', v: (r) => r.vals[3] }, { h: '2ºTURNO', v: (r) => r.vals[4] }, { h: '3ºTURNO', v: (r) => r.vals[5] }], rows); };
  const combo = () => { const gr = groupP(x.cube, x.F('v3'), ['cf']).map((g) => ({ g, v: M.horasProd(g.c) })).sort((a, b) => b.v - a.v);
    return { cats: gr.map(({ g }) => ({ key: g.vals[0], label: blank(g.vals[0]) })), series: [{ name: 'Tempo (h)', vals: gr.map((r) => r.v), color: PALETTE[0] }, { name: 'TP Padrão (h)', vals: gr.map((r) => M.tp(r.g.c)), color: PALETTE[1] }],
      line: { name: '% Ganho', vals: gr.map((r) => M.ganho(r.g.c)), fmt: fpct0, color: '#fb7185', min: Math.min(0, ...gr.map((r) => M.ganho(r.g.c) ?? 0)), max: Math.max(0.5, ...gr.map((r) => M.ganho(r.g.c) ?? 0)) }, fmt: f1, onPick: x.pick('v3', 'p', ['cf']), selected: x.selOf('v3') }; };
  const semNomes = !Object.keys(getOperators()).length;
  return [semNomes ? el('p', { class: 'bi-note' }, 'Os nomes vêm da lista de operadores do servidor. Se não aparecerem, recarregue a página; se continuar, a lista ainda não foi configurada e só as chapas aparecem.') : '',
    live(() => [card('PEÇA - MODELO', selecionado(pecasSel, 'Todos', 'peças selecionadas')), card('OPERADOR', selecionado(nomeSel, 'Todos', 'operadores selecionados')), card('HORAS PRODUZIDAS', `${f1(M.horasProd(slice(x.cube, x.F('cards'))))} h`), card('PEÇAS', fint(M.pecasDistintas(slice(x.cube, x.F('cards')))))]),
    el('div', { class: 'bi-grid' }, vis(`${u.toUpperCase()} · PEÇA E MODELO`, t1, { vid: 't1' }), vis('OPERADOR', t2, { vid: 't2' }), vis('TEMPO PRODUZIDO VS PADRÃO (por chapa)', () => chartBox(combo), { vid: 'v3', wide: true }), vis('TEMPO DAS PEÇAS PRODUZIDAS · QTD', () => chartBox(tempoPecas(x, 'v5'), 'vscroll'), { vid: 'v5' }), vis('DETALHE DE CADA PEÇA', t3, { vid: 't3', wide: true }))];
}

// ---- Entrega: horas padrão ("horas entregues") x horas reais. One row = one piece; the standard hours come from the MATRIZ TEMPO (BAAN).
function pageEntrega(x) {
  const u = GROUPS[x.g].unit;
  const cards = () => live(() => {
    const c = slice(x.cube, x.F('cards')), e = M.efic(c), sem = M.pecasSemPadrao(c), est = M.pecasEstimadas(c), hist = M.pecasPorHistorico(c);
    return [card('TEMPO QUE O PADRÃO PREVIA', `${f1(M.entrega(c))} h`, null, 'quanto as peças feitas deveriam levar, pela matriz de tempos'),
      card('TEMPO REAL GASTO', `${f1(M.realComPadrao(c))} h`, null, 'quanto essas mesmas peças realmente levaram'),
      card('EFICIÊNCIA', e == null ? '—' : fpct(e), corEficS(e), 'previsto ÷ real · acima de 100% = mais rápido que o padrão'),
      card('PEÇAS', fint(M.qtdPecas(c)), null, `${fint(sem)} sem tempo padrão (${f1(M.horasSemPadrao(c))} h reais, fora da conta)${est ? ` · ${fint(est)} com padrão de outra máquina` : ''}${hist ? ` · ${fint(hist)} com padrão provisório (média do histórico)` : ''}`)];
  });
  const porDia = () => { const gr = groupP(x.cube, x.F('v1'), ['data']);
    return { kind: 'area', cats: gr.map((g) => ({ key: g.vals[0], label: ddmm(g.vals[0]) })), series: [{ name: 'Tempo que o padrão previa (h)', vals: gr.map((g) => M.entrega(g.c)), color: PALETTE[3] }, { name: 'Tempo real gasto (h)', vals: gr.map((g) => M.realComPadrao(g.c)), color: PALETTE[0] }], height: 280, fmt: f1, onPick: x.pick('v1', 'p', ['data']), selected: x.selOf('v1') }; };
  const porMaq = () => { const gr = groupP(x.cube, x.F('v2'), ['m']);
    return { cats: gr.map((g) => ({ key: g.vals[0], label: g.vals[0] })), series: [{ name: 'Tempo real gasto (h)', vals: gr.map((g) => M.realComPadrao(g.c)), color: PALETTE[0] }, { name: 'Tempo que o padrão previa (h)', vals: gr.map((g) => M.entrega(g.c)), color: PALETTE[3] }, { name: 'Tempo real sem padrão (h) ⚠', vals: gr.map((g) => M.horasSemPadrao(g.c)), color: '#94a3b8' }],
      lineAbove: true, line: { name: 'Eficiência (previsto ÷ real)', vals: gr.map((g) => M.efic(g.c)), fmt: fpct0, color: '#fb7185', ref: 1, refLabel: '100%' }, fmt: f1, onPick: x.pick('v2', 'p', ['m']), selected: x.selOf('v2') }; };
  const porPeca = () => { const gr = groupP(x.cube, x.F('v3'), ['pm']).filter((g) => M.entrega(g.c) > 0).map((g) => ({ g, v: M.entrega(g.c), e: M.efic(g.c) })).sort((a, b) => b.v - a.v);
    return { orient: 'h', cats: gr.map(({ g, e }) => ({ key: g.vals[0], label: g.vals[0], color: corEficS(e) })), series: [{ name: 'Tempo que o padrão previa (h)', vals: gr.map((r) => r.v), color: PALETTE[3] }], fmt: f1, tip: (i) => `real ${f1(M.realComPadrao(gr[i].g.c))} h · ${fpct0(gr[i].e)} · ${fint(M.qtdPecas(gr[i].g.c))} peças`, onPick: x.pick('v3', 'p', ['pm']), selected: x.selOf('v3') }; };
  const porOper = () => { const rows = rowsOf(groupP(x.cube, x.F('t1'), ['cf', 'nome'])).filter((r) => M.entrega(r.c) > 0);
    return table([{ h: 'Chapa', v: (r) => blank(r.vals[0]) }, { h: 'Nome', v: (r) => blank(r.vals[1]) }, { h: 'Peças', v: (r) => fint(M.qtdPecas(r.c)), key: (r) => M.qtdPecas(r.c), n: true },
      { h: 'Real (h)', v: (r) => f2(M.realComPadrao(r.c)), key: (r) => M.realComPadrao(r.c), n: true }, { h: 'Entregue (h)', v: (r) => f2(M.entrega(r.c)), key: (r) => M.entrega(r.c), n: true },
      { h: 'Eficiência', v: (r) => fpct(M.efic(r.c)), key: (r) => M.efic(r.c) ?? -1, n: true, bg: (r) => corEficS(M.efic(r.c)) }], rows, { order: 4, totals: (() => { const c = slice(x.cube, x.F('t1')); return ['Total', '', fint(M.qtdPecas(c)), f2(M.realComPadrao(c)), f2(M.entrega(c)), fpct(M.efic(c))]; })() }); };
  const semPadrao = () => { const rows = rowsOf(groupP(x.cube, x.F('t2'), ['pm'])).filter((r) => M.pecasSemPadrao(r.c) > 0);
    return table([{ h: 'Peça e modelo', v: (r) => r.vals[0] }, { h: u + 's', v: (r) => [...new Set(r.c.P.filter((p) => !(p.tpx > 0)).map((p) => p.m))].sort().join(', ') }, { h: 'Peças sem padrão', v: (r) => fint(M.pecasSemPadrao(r.c)), key: (r) => M.pecasSemPadrao(r.c), n: true }, { h: 'Horas reais', v: (r) => f2(M.horasSemPadrao(r.c)), key: (r) => M.horasSemPadrao(r.c), n: true }], rows, { order: 2 }); };
  // pieces without a standard time are never hidden: they count everywhere except in the efficiency, and this strip says so
  const aviso = live(() => {
    const c = slice(x.cube, x.F('cards')), sem = M.pecasSemPadrao(c);
    if (!sem) return [];
    const rows = rowsOf(groupP(x.cube, x.F('cards'), ['pm'])).filter((r) => M.pecasSemPadrao(r.c) > 0).sort((a, b) => M.horasSemPadrao(b.c) - M.horasSemPadrao(a.c))
      .map((r) => [r.vals[0], [...new Set(r.c.P.filter((p) => !(p.tpx > 0)).map((p) => p.m))].sort().join(', '), M.pecasSemPadrao(r.c), +M.horasSemPadrao(r.c).toFixed(1)]);
    return [el('div', { class: 'bi-warnbar', role: 'status' }, el('span', {}, '⚠ ', el('b', {}, `${fint(sem)} peças (${f1(M.horasSemPadrao(c))} h reais) estão sem tempo padrão.`), ' Elas continuam contando em peças, horas produzidas e em todos os gráficos; só ficam fora da eficiência, porque não há padrão para comparar. '),
      el('button', { type: 'button', class: 'bi-more', onclick: () => openRecords(`Peças sem tempo padrão (${fint(sem)})`, ['Peça e modelo', u + 's', 'Peças', 'Horas reais'], rows, 'Cadastre o tempo na matriz (aba Base de dados → Matriz de tempos) e a eficiência passa a contar essas peças.') }, 'Ver quais'))];
  }, 'bi-alerts');
  // pieces that use the average of their own history as the standard (collar of the center frame, sub bracket, bracket): said plainly, with the numbers behind it
  const infoHist = live(() => {
    const c = slice(x.cube, x.F('cards')), n = M.pecasPorHistorico(c);
    if (!n) return [];
    const rows = rowsOf(groupP(x.cube, x.F('cards'), ['pm'])).filter((r) => r.c.P.some((p) => p.tpSrc === 'histórico')).map((r) => { const p = r.c.P.find((q) => q.tpSrc === 'histórico'), hs = historyStandardOf(x.cube.hstd, p.p, p.o);
      return [r.vals[0], [...new Set(r.c.P.map((q) => q.m))].sort().join(', '), r.c.P.filter((q) => q.tpSrc === 'histórico').length, +p.tpx.toFixed(2), hs ? `${hs.n} produções · ${dmy(hs.from)} a ${dmy(hs.to)}` : '']; }).sort((a, b) => b[2] - a[2]);
    return [el('div', { class: 'bi-warnbar bi-infobar', role: 'status' }, el('span', {}, 'ℹ ', el('b', {}, `${fint(n)} peças usam um tempo padrão provisório.`), ' Para colar do center frame, sub bracket e bracket ainda não há tempo na matriz; o padrão é a média do histórico delas. Por isso a eficiência dessas peças tende a 100%: serve para acompanhar, não para cobrar. '),
      el('button', { type: 'button', class: 'bi-more', onclick: () => openRecords(`Padrão pela média do histórico (${fint(n)} peças)`, ['Peça e modelo', u + 's', 'Peças', 'Padrão usado (h)', 'Base do cálculo'], rows, 'Quando o tempo oficial entrar na matriz (aba Base de dados → Matriz de tempos), ele passa a valer no lugar da média.') }, 'Ver quais'))];
  }, 'bi-alerts');
  return [aviso, infoHist, cards(),
    el('div', { class: 'bi-grid' },
      vis(`TEMPO REAL × TEMPO PADRÃO POR ${u.toUpperCase()}`, explain(legendNote(), () => chartBox(porMaq)), { vid: 'v2', wide: true }),
      vis('POR DIA · tempo padrão × tempo real', explain('Cada dia: o que as peças feitas deveriam levar (padrão) contra o que realmente levaram. Quando a linha do padrão fica acima da real, o dia rendeu mais que o previsto.', () => chartBox(porDia)), { vid: 'v1' }),
      vis('TEMPO PADRÃO POR PEÇA E MODELO (cor = eficiência)', explain('Quanto tempo padrão cada peça e modelo já entregou. Verde = foi feito em menos tempo que o padrão; amarelo/vermelho = demorou mais. Passe o mouse para ver o tempo real.', () => chartBox(porPeca, 'vscroll')), { vid: 'v3' }),
      vis('POR OPERADOR', porOper, { vid: 't1' }),
      vis('PEÇAS SEM TEMPO PADRÃO (completar na matriz)', semPadrao, { vid: 't2' }))];
}

// ---- Auditoria dos dados: everything in the history that a person should look at (the app never changes the data by itself)
export function auditoriaBlock(x) {
  const known = new Set(Object.keys(getOperators()));
  const res = auditData({ prod: x.base.prod, stops: x.base.stops, known: known.size ? known : null });
  const n = (lv) => res.filter((c) => c.level === lv && c.count).reduce((a, c) => a + c.count, 0), k = (lv) => res.filter((c) => c.level === lv && c.count).length;
  const LV = { erro: ['Erro', '#fb7185'], 'atenção': ['Atenção', '#fbbf24'], info: ['Informação', '#60a5fa'] };
  const rows = res.map((c) => ({ c }));
  const xlsx = async () => { const X = await import('xlsx'); const wb = X.utils.book_new();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Nível', 'Área', 'Verificação', 'Quantidade', 'Horas', 'O que significa'], ...res.map((c) => [LV[c.level][0], c.area, c.title, c.count, c.hours == null ? '' : +c.hours.toFixed(1), c.why])]), 'Resumo');
    for (const c of res) if (c.count) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([c.head, ...c.rows]), c.title.replace(/[\[\]\*\?\/\\:]/g, ' ').slice(0, 31));
    X.writeFile(wb, `auditoria-${GROUPS[x.g].name.split(' ')[0].toLowerCase()}.xlsx`); };
  return [el('div', { class: 'bi-cards' }, card('ERROS', fint(n('erro')), '#fb7185', `${k('erro')} tipos de problema`), card('ATENÇÃO', fint(n('atenção')), '#fbbf24', `${k('atenção')} tipos`), card('INFORMAÇÃO', fint(n('info')), '#60a5fa', `${k('info')} tipos`), card('BASE', `${fint(x.base.prod.length)} + ${fint(x.base.stops.length)}`, null, 'produções + paradas verificadas')),
    el('div', { class: 'bi-grid' }, vis('VERIFICAÇÕES (clique em Ver linhas para abrir cada lista)', () => table([
      { h: 'Nível', v: (r) => LV[r.c.level][0], key: (r) => 3 - ['erro', 'atenção', 'info'].indexOf(r.c.level), bg: (r) => LV[r.c.level][1] },
      { h: 'Área', v: (r) => r.c.area }, { h: 'Verificação', v: (r) => r.c.title },
      { h: 'Quantidade', v: (r) => fint(r.c.count), key: (r) => r.c.count, n: true }, { h: 'Horas', v: (r) => (r.c.hours == null ? '' : f1(r.c.hours)), key: (r) => r.c.hours ?? -1, n: true },
      { h: 'O que significa', v: (r) => r.c.why },
      { h: '', v: (r) => (r.c.count ? el('button', { type: 'button', class: 'bi-more', onclick: () => openRecords(`${r.c.title} (${r.c.count})`, r.c.head, r.c.rows, r.c.why) }, 'Ver linhas') : '—') }], rows, { order: 0 }), { vid: 'au', wide: true, filters: false, acts: [el('button', { type: 'button', onclick: xlsx }, '⬇ Auditoria completa (Excel)')] }))];
}

const BUILDERS = { geral: pageGeral, pessoas: pagePessoas, entrega: pageEntrega, paradas: pageParadas };
const pageFilterSet = (col) => pageFilter().p[col] ?? new Set();

// ---- quick date bar (Último dia, 7 dias, 30 dias, mês, De/Até) --------------------------------------------------
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
function quickBar(cube, side, apply) {
  const dates = options(cube, side, 'data');
  if (!dates.length) return '';
  const last = dates.at(-1), f = pageFilter(), box = el('div', { class: 'bi-quick', role: 'group', 'aria-label': 'Período' });
  const pk = ui.g, wk = (d) => { const w = new Date(`${d}T12:00:00Z`).getUTCDay(); return w >= 1 && w <= 5; };
  const U = (ui.uteis[pk] ??= { on: false, prev: null });
  const set = (arr) => { if (U.on) arr = (arr ?? dates).filter(wk); if (arr && arr.length === dates.length && !U.on) arr = null; if (arr) f[side].data = new Set(arr); else delete f[side].data; ui.sel = null; apply(); slicerFills.forEach((fn) => fn()); mark(); };
  const range = (a, b) => dates.filter((d) => d >= a && d <= b);
  const from = el('input', { type: 'date', min: dates[0], max: last, 'aria-label': 'De (data)', onchange: () => custom() }), to = el('input', { type: 'date', min: dates[0], max: last, 'aria-label': 'Até (data)', onchange: () => custom() });
  const custom = () => set(range(from.value || dates[0], to.value || last));
  const btns = [['Tudo', () => set(null)], [`Último dia (${dmy(last).slice(0, 5)})`, () => set([last])], ['7 dias', () => set(range(addDays(last, -6), last))], ['30 dias', () => set(range(addDays(last, -29), last))], ['Mês do último dia', () => set(range(`${last.slice(0, 8)}01`, last))]]
    .map(([t, fn], i) => el('button', { type: 'button', onclick: () => { active = i; fn(); } }, t));
  const multiBtn = el('button', { type: 'button', class: 'uteis', 'aria-pressed': String(ui.multi), title: 'Ligado: cada clique em barra ou item soma ou tira (o mesmo que Ctrl + clique). Útil no celular.', onclick: () => { ui.multi = !ui.multi; multiBtn.setAttribute('aria-pressed', String(ui.multi)); } }, 'Seleção múltipla');
  const uteisBtn = el('button', { type: 'button', class: 'uteis', 'aria-pressed': String(U.on), title: 'Tira sábados e domingos (feriados não são tirados)', onclick: () => {
    if (!U.on) { U.on = true; U.prev = f[side].data ? new Set(f[side].data) : null; set(f[side].data ? [...f[side].data] : null); }
    else { U.on = false; const back = U.prev; U.prev = null; set(back ? [...back] : null); }
    uteisBtn.setAttribute('aria-pressed', String(U.on));
  } }, 'Só dias úteis');
  let active = null;
  function mark() { const n = f[side].data?.size ?? 0; btns.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 0 ? n === 0 : i === active && n > 0))); }
  // three tidy groups: the period buttons (one joined control), the free interval, and the two switches
  const grp = (label, ...kids) => el('div', { class: 'qb-g' }, el('span', { class: 'lbl' }, label), ...kids);
  box.append(grp('Período', el('div', { class: 'qb-seg', role: 'group' }, ...btns)), grp('Intervalo', el('div', { class: 'qb-range' }, el('label', { class: 'vf-d' }, 'De', from), el('span', { class: 'qb-dash' }, '→'), el('label', { class: 'vf-d' }, 'Até', to))), grp('Opções', el('div', { class: 'qb-opts' }, uteisBtn, multiBtn)));
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
  let cube = cubeFor(ui.g, base); curCube = cube;
  const days = [...new Set(base.prod.map((r) => r.d))].sort();
  const x = { cube, g: ui.g, base, toast: ctx.toast ?? ((m) => window.alert(m)),
    // after an edit in a table: read the base again and redraw every visual in place
    refresh: async () => { x.base = await loadBase(ui.g, { force: true }); cube = cubeFor(ui.g, x.base); curCube = cube; x.cube = cube; slicerFills.forEach((fn) => fn()); REG.forEach((r) => r.rebuild()); },
    F: (vid) => mergeF(mergeF(pageFilter(), ui.sel && ui.sel.vid !== vid && !ui.noSel ? ui.sel.f() : null), visFilterOf(vid)),
    selOf: (vid) => (ui.sel?.vid === vid ? ui.sel.keys : null),
    // like Power BI: a click selects only that bar (again = clear); Ctrl/⌘ + click (or "Seleção múltipla") adds or removes bars
    pick: (vid, sd, cols) => (key, ev) => {
      const add = !!(ev?.ctrlKey || ev?.metaKey || ui.multi);
      if (ui.sel?.vid === vid) {
        if (add) { if (ui.sel.keys.has(key)) ui.sel.keys.delete(key); else ui.sel.keys.add(key); }
        else if (ui.sel.keys.size === 1 && ui.sel.keys.has(key)) ui.sel.keys.clear();
        else ui.sel.keys = new Set([key]);
        if (!ui.sel.keys.size) ui.sel = null;
      }
      else ui.sel = { vid, side: sd, keys: new Set([key]), f() { const o = { p: {}, s: {} }; cols.forEach((c, i) => { o[sd][c] = new Set([...this.keys].map((k) => k.split(SEP)[i])); }); return o; } };
      drawMain();
    } };
  slicerFills = [];
  const prune = () => { const f = pageFilter(); for (let k = 0; k < 2; k++) for (const [, sd, col] of SLICERS[ui.page] ?? []) { const set = f[sd][col]; if (!set) continue; const ok = new Set(optionsFor(cube, sd, col, f)); const keep = [...set].filter((v) => ok.has(v)); if (keep.length === set.size) continue; if (keep.length) f[sd][col] = new Set(keep); else delete f[sd][col]; } };
  const slicers = (SLICERS[ui.page] ?? []).map(([t, sd, col]) => slicerBox(t === '@unit' ? GROUPS[ui.g].unit : t, sd, col, cube, () => { mirror(); prune(); mirror(); slicerFills.forEach((fn) => fn()); ui.sel = null; drawMain(); }));
  side.replaceChildren(...slicers);
  const toggle = el('button', { type: 'button', class: 'ghost bi-filters-toggle', onclick: () => side.classList.toggle('open') }, '☰ Filtros');
  const noteHost = el('div', { class: 'bi-notehost' });
  const noteFn = () => noteHost.replaceChildren(...(ui.sel ? [el('p', { class: 'bi-note' }, 'Filtro por clique ativo nos outros gráficos. ', el('button', { type: 'button', class: 'bi-more', onclick: () => { ui.sel = null; drawMain(); } }, 'Limpar clique'), ' ', el('button', { type: 'button', class: 'bi-more', onclick: () => { const c = slice(cube, mergeF(pageFilter(), ui.sel.f())); if (ui.sel.side === 's') openRecords(`Paradas (${c.S.length})`, STOP_HEAD, c.S.map(stopRow)); else openRecords(`Produções (${c.P.length})`, PROD_HEAD, c.P.map(prodRow)); } }, 'Ver registros'))] : []));
  let built = false;
  function drawMain() {
    if (!built) { REG.length = 0; const body = el('div', { class: 'bi-main' }, noteHost, quickBar(cube, ui.page === 'paradas' ? 's' : 'p', () => { mirror(); prune(); mirror(); drawMain(); }), BUILDERS[ui.page](x)); layout.replaceChildren(side, body); built = true; }
    else REG.forEach((r) => r.rebuild());          // like Power BI: the other visuals redraw, the page does not move
    noteFn();
  }
  const layout = el('div', { class: 'bi-layout' });
  main.replaceChildren(el('p', { class: 'bi-note' }, `${GROUPS[ui.g].name} · ${days.length} dias (${dmy(days[0])} a ${dmy(days.at(-1))}) · ${base.prod.length.toLocaleString('pt-BR')} produções · ${base.stops.length.toLocaleString('pt-BR')} paradas. Clique numa barra para filtrar os outros gráficos.`), toggle, layout);
  drawMain();
}
