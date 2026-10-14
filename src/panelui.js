// The dashboard ("Painel"): charts drawn here as inline SVG (no library), all numbers come from core/panel.js.
// Everything is clickable: a click on a slice, a bar, a heat cell or an hour fills the "Detalhes" table beside it.
const SVG = 'http://www.w3.org/2000/svg';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function build(ns, tag, attrs = {}, kids = []) {
  const el = ns ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style') el.style.cssText = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const h = (tag, attrs, ...kids) => build(false, tag, attrs, kids);
const sv = (tag, attrs, ...kids) => build(true, tag, attrs, kids);

const HOURS = Array.from({ length: 24 }, (_, i) => (i + 4) % 24); // the working day starts at 04:00
const hh = (n) => `${String(n).padStart(2, '0')}h`;

// Each chart fills its OWN details table (so one click never replaces another chart's table):
//   motivo → the card beside the donut · cell → under the heat map · machine / turno → under their row · hour → under the area chart
const SLOTS = ['motivo', 'cell', 'machine', 'turno', 'hour'];
const sels = Object.fromEntries(SLOTS.map((k) => [k, null]));
const keyOf = (s) => (s ? [s.t, s.m ?? '', s.v].join('|') : '');
let last = null;       // { P, ctx } of the last render, to reopen the big table
let maxKey = null;     // which table is maximized

export function resetPanelSelection() { for (const k of SLOTS) sels[k] = null; closePanelMax(); }
export const panelMaxKey = () => maxKey;
export function closePanelMax() { document.getElementById('pn-max')?.remove(); document.removeEventListener('keydown', onMaxKey); maxKey = null; }
export function reopenPanelMax(key) { if (last && sels[key]) openMax(key, last.P, last.ctx); }
function onMaxKey(e) { if (e.key === 'Escape') closePanelMax(); }

const hourOf = (s) => (s.t === 'hour' || s.t === 'cell');
function stopsFor(P, s) {
  if (!s) return [];
  const list = P.all.filter((x) => (s.t === 'motivo' ? x.motivo === s.v : s.t === 'machine' ? x.machine === s.v : s.t === 'turno' ? x.turno === s.v
    : s.t === 'hour' ? (x.perHour[s.v] ?? 0) > 0 : x.machine === s.m && (x.perHour[s.v] ?? 0) > 0));
  return list.map((x) => ({ ...x, inHour: hourOf(s) ? x.perHour[s.v] : 0 })).sort((a, b) => (hourOf(s) ? b.inHour - a.inHour : b.min - a.min));
}
const titleOf = (s) => (s.t === 'motivo' ? `Motivo: ${s.v}` : s.t === 'machine' ? `Máquina: ${s.v}` : s.t === 'turno' ? (s.v === '?' ? 'Paradas sem turno' : `Turno ${s.v}`)
  : s.t === 'hour' ? `Paradas às ${hh(s.v)}` : `${s.m} às ${hh(s.v)}`);

// the table (compact inside the cards, complete when maximized)
function tableFor(list, s, ctx, full, sort) {
  const { fmtDur, motColor, who } = ctx;
  const inHour = hourOf(s);
  if (!full) {
    // inside the cards: two lines per stop, so it fits any width without sideways scrolling
    return h('div', { class: 'pn-list' }, list.map((x, i) => {
      const op = who(x.chapa);
      return h('div', { class: 'pn-li', style: `--d:${Math.min(i, 14) * 28}ms` },
        h('div', { class: 'pn-li-top' }, h('b', { class: 'pn-m' }, x.machine), h('span', { class: 'pn-dm' }, h('i', { style: `background:${motColor(x.motivo)}` }), x.motivo),
          h('span', { class: 'pn-li-t' }, h('b', {}, fmtDur(x.min)), h('small', {}, `${x.clock}–${x.fim}${inHour ? ` · ${x.inHour} min na hora` : ''}`)),
          h('button', { type: 'button', class: 'ghost', dataset: { act: 'goto', p: x.page, k: x.table, r: x.ri }, title: 'Ir para a linha desta parada na folha' }, 'Ir para a linha')),
        h('div', { class: 'pn-li-sub' }, h('span', { class: 'pn-op1' }, op || 'sem operador'), h('span', { class: `pn-desc${x.desc ? '' : ' none'}` }, x.desc || 'sem observação')));
    }));
  }
  const cols = full
    ? [['dia', 'Dia'], ['folha', 'Folha'], ['machine', 'Máquina'], ['motivo', 'Motivo'], ['clock', 'Início'], ['fim', 'Fim'], ['min', 'Duração'], ['turno', 'Turno'], ['op', 'Operador'], ['desc', 'Observação'], ['', '']]
    : [['machine', 'Máquina'], ['motivo', 'Motivo'], ['clock', 'Início'], ['min', 'Duração'], ['op', 'Operador'], ['desc', 'Observação'], ['', '']];
  const head = h('div', { class: 'pn-tr pn-th', role: 'row' }, cols.map(([k, t]) => (full && k && sort
    ? h('button', { type: 'button', class: `pn-sort c-${k}${sort.col === k ? ' on' : ''}`, onclick: () => sort.change(k) }, t, sort.col === k ? (sort.dir > 0 ? ' ▲' : ' ▼') : '')
    : h('span', { class: `c-${k}` }, t))));
  const goto = (x) => h('button', { type: 'button', class: 'ghost', dataset: { act: 'goto', p: x.page, k: x.table, r: x.ri }, title: 'Ir para a linha desta parada na folha' }, 'Ir para a linha');
  const rows = list.map((x, i) => {
    const op = who(x.chapa);
    const cell = {
      dia: h('span', {}, x.day ? x.day.slice(0, 5) : '—'), folha: h('span', { class: 'pn-f' }, (x.folha || '').replace(/^.*· /, '') || '—'),
      machine: h('span', { class: 'pn-m' }, x.machine), motivo: h('span', { class: 'pn-dm' }, h('i', { style: `background:${motColor(x.motivo)}` }), x.motivo),
      clock: h('span', {}, x.clock), fim: h('span', {}, x.fim), turno: h('span', {}, x.turno === '?' ? '—' : x.turno),
      min: h('span', { class: 'pn-d' }, fmtDur(x.min), inHour ? h('small', {}, `${x.inHour} min na hora`) : null),
      op: h('span', { class: 'pn-op' }, op || '—', full && x.chapa && op && !op.startsWith('chapa ') ? h('small', {}, `chapa ${x.chapa}`) : null),
      desc: h('span', { class: `pn-desc${x.desc ? '' : ' none'}` }, x.desc || '—'), '': goto(x),
    };
    return h('div', { class: 'pn-tr', role: 'row', style: `--d:${Math.min(i, 14) * 28}ms` }, cols.map(([k]) => { cell[k].classList.add(`c-${k}`); return cell[k]; }));
  });
  return h('div', { class: `pn-table${full ? ' full' : ''}`, role: 'table', style: `--cols:${full ? '64px 150px 90px 170px 64px 64px 96px 56px 190px minmax(240px, 1fr) 128px' : '84px 150px 56px 92px 170px minmax(200px, 1fr) 128px'}` }, head, rows);
}
const textOf = (x, who) => [x.day, x.folha, x.machine, x.motivo, x.clock, x.fim, who(x.chapa), x.chapa, x.desc, x.turno].join(' ').toLowerCase();
const sortVal = { dia: (x) => x.day, folha: (x) => x.folha, machine: (x) => x.machine, motivo: (x) => x.motivo, clock: (x) => x.clock, fim: (x) => x.fim, min: (x) => x.min, turno: (x) => x.turno, op: (x, who) => who(x.chapa) || x.chapa || '', desc: (x) => x.desc || '' };

// the big, complete table (search, sort, totals, copy)
function openMax(key, P, ctx) {
  closePanelMax(); maxKey = key;
  const s = sels[key]; if (!s) return;
  const { fmtDur, who } = ctx;
  const base = stopsFor(P, s), inHour = hourOf(s);
  let q = '', sort = { col: inHour ? 'min' : 'min', dir: -1, change: (c) => { sort.dir = sort.col === c ? -sort.dir : (c === 'min' ? -1 : 1); sort.col = c; draw(); } };
  const body = h('div', { class: 'pn-max-body' }), foot = h('div', { class: 'pn-max-foot' }), search = h('input', { type: 'search', class: 'pn-search', placeholder: 'Filtrar por máquina, motivo, operador, observação…', 'aria-label': 'Filtrar a tabela' });
  const visible = () => {
    let l = base.filter((x) => !q || textOf(x, who).includes(q));
    const f = sortVal[sort.col];
    l = [...l].sort((a, b) => { const va = f(a, who), vb = f(b, who); return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true })) * sort.dir; });
    return l;
  };
  function draw() {
    const l = visible(), tot = l.reduce((a, x) => a + (inHour ? x.inHour : x.min), 0);
    body.replaceChildren(l.length ? tableFor(l, s, ctx, true, sort) : h('p', { class: 'note' }, 'Nenhuma parada com esse filtro.'));
    foot.textContent = `${l.length} parada${l.length === 1 ? '' : 's'}${q ? ` (de ${base.length})` : ''} · ${fmtDur(tot)}${inHour ? ' dentro desta hora' : ' no total'}`;
  }
  const copy = () => {
    const l = visible(), tsv = [['Dia', 'Folha', 'Máquina', 'Motivo', 'Início', 'Fim', 'Duração (min)', 'Turno', 'Operador', 'Chapa', 'Observação'].join('\t'),
      ...l.map((x) => [x.day, x.folha, x.machine, x.motivo, x.clock, x.fim, x.min, x.turno === '?' ? '' : x.turno, who(x.chapa), x.chapa, (x.desc || '').replace(/\s+/g, ' ')].join('\t'))].join('\n');
    (navigator.clipboard?.writeText(tsv) ?? Promise.reject()).then(() => ctx.toast?.('Tabela copiada. Cole no Excel.'), () => ctx.toast?.('Não consegui copiar.'));
  };
  search.addEventListener('input', () => { q = search.value.trim().toLowerCase(); draw(); });
  const box = h('div', { id: 'pn-max', role: 'dialog', 'aria-modal': 'true', 'aria-label': titleOf(s), dataset: { slot: key } },
    h('div', { class: 'pn-max-box' },
      h('div', { class: 'pn-max-head' }, h('div', {}, h('b', {}, titleOf(s)), h('small', {}, 'Tabela completa. Clique no título de uma coluna para ordenar.')), search,
        h('button', { type: 'button', class: 'ghost', onclick: copy }, '⧉ Copiar'), h('button', { type: 'button', class: 'pn-x', 'aria-label': 'Fechar', title: 'Fechar (Esc)', onclick: closePanelMax }, '✕')),
      body, foot));
  box.addEventListener('click', (e) => { if (e.target === box) closePanelMax(); });
  document.body.append(box); document.addEventListener('keydown', onMaxKey); draw(); search.focus({ preventScroll: true });
}

export function renderPanelUI(root, P, ctx) {
  last = { P, ctx };
  const { fmtDur, motColor, who } = ctx;
  const ui = h('div', { class: 'pn' });
  let n = 0;
  const card = (cls, ...kids) => h('section', { class: `pn-card ${cls}`, style: `--i:${n++}` }, ...kids);

  // ---- tooltip (one for the whole panel)
  const tip = h('div', { class: 'pn-tip', hidden: true });
  ui.addEventListener('pointermove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    if (!t) { tip.hidden = true; return; }
    tip.textContent = t.dataset.tip; tip.hidden = false;
    const r = ui.getBoundingClientRect();
    tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 6)}px`;
    tip.style.top = `${e.clientY - r.top - tip.offsetHeight - 12}px`;
  });
  ui.addEventListener('pointerleave', () => { tip.hidden = true; });

  // ---- selection and the details tables (one per chart)
  const slotEls = {};
  const slotOf = (t) => (t === 'cell' ? 'cell' : t);
  const pick = (s) => { const k = slotOf(s.t); sels[k] = keyOf(s) === keyOf(sels[k]) ? null : s; paintSel(); drawSlot(k, true); };
  const paintSel = () => {
    for (const k of SLOTS) ui.toggleAttribute(`data-selt-${k}`, !!sels[k]);
    for (const el of ui.querySelectorAll('[data-sel]')) { const k = slotOf(el.dataset.sel.split('|')[0]); el.classList.toggle('on', el.dataset.sel === keyOf(sels[k])); }
  };
  function drawSlot(k, animate) {
    const el = slotEls[k], s = sels[k], body = el.body;
    if (k !== 'motivo') el.card.hidden = !s;
    body.classList.remove('in'); void body.offsetWidth;
    if (!s) {
      body.replaceChildren(h('div', { class: 'pn-hint' }, h('div', { class: 'pn-hint-ic' }, '☝'), h('b', {}, 'Escolha algo no gráfico'),
        h('p', {}, 'Clique numa fatia da rosca. A lista das paradas aparece aqui.')));
      el.tools.hidden = true;
      if (animate) body.classList.add('in');
      return;
    }
    const list = stopsFor(P, s), inHour = hourOf(s);
    const total = list.reduce((a, x) => a + (inHour ? x.inHour : x.min), 0);
    const share = P.stopMin ? Math.round((total / P.stopMin) * 100) : 0;
    el.tools.hidden = false;
    body.replaceChildren(
      h('div', { class: 'pn-dhead' }, h('div', {}, h('b', { class: 'pn-dtitle' }, titleOf(s)),
        h('small', {}, `${list.length} parada${list.length === 1 ? '' : 's'} · ${fmtDur(total)}${inHour ? ' dentro desta hora' : ''} · ${share} % do tempo parado`))),
      h('div', { class: 'pn-bar' }, h('i', { style: `--w:${Math.min(100, share)}%` })),
      list.length ? h('div', { class: 'pn-scroll' }, tableFor(list, s, ctx, false)) : h('p', { class: 'note' }, 'Nenhuma parada.'));
    body.classList.add('in');
    if (animate && k !== 'motivo') el.card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'nearest' });
    else if (animate) { const r = el.card.getBoundingClientRect(); if (r.top < 0 || r.top > innerHeight * 0.6) el.card.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' }); }
  }
  // a details card: title, maximize and clear buttons, and the table body
  const slot = (k, title, cls = '') => {
    const body = h('div', { class: 'pn-drill-body' });
    const tools = h('div', { class: 'pn-tools', hidden: true },
      h('button', { type: 'button', class: 'pn-x wide', title: 'Maximizar a tabela para ler com calma', 'aria-label': 'Maximizar a tabela', onclick: () => openMax(k, P, ctx) }, '⤢ Maximizar'),
      h('button', { type: 'button', class: 'pn-x', 'aria-label': 'Limpar seleção', title: 'Fechar esta tabela', onclick: () => { sels[k] = null; paintSel(); drawSlot(k, true); } }, '✕'));
    const c = h('section', { class: `pn-card pn-slot ${cls}`, style: `--i:${n++}`, dataset: { slot: k }, hidden: k !== 'motivo' }, h('div', { class: 'pn-slot-h' }, h('h3', {}, title), tools), body);
    slotEls[k] = { card: c, body, tools };
    return c;
  };

  // ---- numbers that count up
  const counters = [];
  const num = (to, fmt) => { const b = h('b', { class: 'pn-num' }, fmt(to)); counters.push({ b, to, fmt }); return b; };

  // ---- export (minimal button: PDF slides or Excel, white or dark background)
  const expBtn = h('button', { type: 'button', class: 'pn-exp', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, '⤓ Exportar');
  const expMenu = h('div', { class: 'pn-expmenu', role: 'menu', hidden: true });
  const runExport = async (fmt, theme) => {
    expMenu.hidden = true; expBtn.setAttribute('aria-expanded', 'false');
    const old = expBtn.textContent; expBtn.textContent = 'Gerando…'; expBtn.disabled = true;
    try { await ctx.onExport(fmt, theme); } catch (e) { ctx.toast?.(`Não consegui exportar: ${e.message ?? e}`); } finally { expBtn.textContent = old; expBtn.disabled = false; }
  };
  for (const [fmt, label, hint] of [['pdf', 'PDF', 'apresentação em slides'], ['xlsx', 'Excel', 'gráficos e tabelas formatados']]) {
    expMenu.append(h('div', { class: 'pn-expg' }, h('b', {}, label), h('small', {}, hint),
      h('div', { class: 'pn-expb' }, h('button', { type: 'button', class: 'light', onclick: () => runExport(fmt, 'light') }, 'Fundo branco'), h('button', { type: 'button', class: 'dark', onclick: () => runExport(fmt, 'dark') }, 'Fundo escuro'))));
  }
  expBtn.addEventListener('click', (e) => { e.stopPropagation(); expMenu.hidden = !expMenu.hidden; expBtn.setAttribute('aria-expanded', String(!expMenu.hidden)); });
  const closeExp = (e) => { if (!ui.isConnected) { document.removeEventListener('click', closeExp); return; } if (!expMenu.contains(e.target)) { expMenu.hidden = true; expBtn.setAttribute('aria-expanded', 'false'); } };
  document.addEventListener('click', closeExp);

  // ---- filters
  const { groups, days, opt, onChange } = ctx.filters;
  const filters = h('div', { class: 'pn-filters' },
    groups.length > 1 ? h('div', { class: 'pn-seg', role: 'group', 'aria-label': 'Grupo' }, groups.map(([v, t]) => h('button', { type: 'button', class: opt.group === v ? 'on' : '', onclick: () => onChange({ group: v, day: 'all' }) }, t))) : null,
    days.length > 1 ? h('label', { class: 'pn-day' }, 'Dia ', h('select', { onchange: (e) => onChange({ day: e.target.value }) },
      [['all', 'Todos os dias'], ...days.map((d) => [d.key, d.label])].map(([v, t]) => h('option', { value: v, selected: String(v) === String(opt.day) }, t)))) : null,
    h('div', { class: 'pn-expwrap' }, expBtn, expMenu));

  // ---- KPI row
  const maxHour = Math.max(1, ...P.byHour);
  const spark = (() => {
    const w = 120, ht = 36, pts = HOURS.map((hr, i) => [(i / 23) * w, ht - 3 - (P.byHour[hr] / maxHour) * (ht - 8)]);
    const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    return sv('svg', { class: 'pn-spark', viewBox: `0 0 ${w} ${ht}`, 'aria-hidden': 'true' }, sv('path', { class: 'fill', d: `${d} L${w} ${ht} L0 ${ht} Z` }), sv('path', { class: 'line', d, pathLength: 100 }));
  })();
  const kpi = (lab, value, small, extra) => card('pn-kpi', h('span', { class: 'lab' }, lab), h('div', { class: 'pn-kv' }, value, extra), h('small', {}, small));
  const warnCls = P.pct >= 30 ? 'warn' : 'ok';
  const kpis = h('div', { class: 'pn-kpis' },
    kpi('Tempo parado', num(P.stopMin, fmtDur), `${P.pct} % do tempo registrado`, h('span', { class: `pn-badge ${warnCls}` }, `${P.pct} %`)),
    kpi('Produzindo', num(P.prodMin, fmtDur), 'tempo registrado', h('span', { class: 'pn-badge ok' }, `${P.prodPct} %`)),
    kpi('Paradas', num(P.count, (v) => String(Math.round(v))), 'registros de parada'),
    h('section', { class: 'pn-card pn-kpi pn-kpi-wide', style: `--i:${n++}` }, h('span', { class: 'lab' }, 'Paradas ao longo do dia'), spark, h('small', {}, P.longest ? `Maior parada: ${fmtDur(P.longest.min)} · ${P.longest.machine} · ${P.longest.motivo}` : 'Sem paradas')));

  // ---- donut: stopped time by motive
  const donut = (() => {
    const size = 240, cx = 120, cy = 120, r = 82, sw = 30, C = 2 * Math.PI * r, gap = P.byMotivo.length > 1 ? 4 : 0;
    const svg = sv('svg', { class: 'pn-donut', viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': 'Tempo parado por motivo' }, sv('circle', { class: 'track', cx, cy, r, 'stroke-width': sw }));
    const cTitle = h('small', {}, 'tempo parado'), cVal = h('b', {}, fmtDur(P.stopMin));
    let acc = 0;
    const segs = P.byMotivo.map((x, i) => {
      const frac = P.stopMin ? x.min / P.stopMin : 0, len = Math.max(0, frac * C - gap), start = acc * C; acc += frac;
      const c = sv('circle', { class: 'seg', cx, cy, r, 'stroke-width': sw, transform: `rotate(-90 ${cx} ${cy})`, dataset: { sel: keyOf({ t: 'motivo', v: x.motivo }) },
        style: `stroke:${motColor(x.motivo)};stroke-dasharray:0 ${C};stroke-dashoffset:${-start};transition-delay:${i * 90}ms`,
        'data-tip': `${x.motivo}: ${fmtDur(x.min)} · ${x.count}× · ${Math.round(frac * 100)} %` });
      c._to = `${len} ${C}`;
      c.addEventListener('pointerenter', () => { cTitle.textContent = x.motivo; cVal.textContent = `${Math.round(frac * 100)} %`; });
      c.addEventListener('pointerleave', () => { cTitle.textContent = 'tempo parado'; cVal.textContent = fmtDur(P.stopMin); });
      c.addEventListener('click', () => pick({ t: 'motivo', v: x.motivo }));
      return c;
    });
    svg.append(...segs);
    const wrap = h('div', { class: 'pn-donut-wrap' }, svg, h('div', { class: 'pn-donut-c' }, cVal, cTitle));
    wrap._segs = segs;
    return wrap;
  })();
  const legend = h('div', { class: 'pn-legend' }, P.byMotivo.map((x) => h('button', { type: 'button', class: 'pn-lrow', dataset: { sel: keyOf({ t: 'motivo', v: x.motivo }) }, onclick: () => pick({ t: 'motivo', v: x.motivo }) },
    h('i', { style: `background:${motColor(x.motivo)}` }), h('span', { class: 'ln' }, x.motivo), h('span', { class: 'lp' }, `${P.stopMin ? Math.round((x.min / P.stopMin) * 100) : 0} %`), h('span', { class: 'lt' }, `${fmtDur(x.min)} · ${x.count}×`))));
  const cardMot = card('pn-mot', h('h3', {}, 'Tempo parado por motivo'), P.byMotivo.length ? h('div', { class: 'pn-mot-in' }, donut, legend) : h('p', { class: 'note' }, 'Nenhuma parada registrada.'));
  const cardDrill = slot('motivo', 'Detalhes', 'pn-drill');

  // ---- heat map: machine × hour of the day
  const heatMax = Math.max(1, ...P.heat.flatMap((r) => r.hours));
  const heat = card('pn-heat', h('h3', {}, 'Mapa de calor: onde e quando para'),
    h('div', { class: 'pn-hm', style: '--cols:24' },
      h('span', { class: 'pn-corner' }), HOURS.map((hr) => h('span', { class: 'pn-hl' }, hr % 2 === 0 ? String(hr) : '')),
      P.heat.map((row, ri) => [h('span', { class: 'pn-rl', title: row.machine }, row.machine),
        HOURS.map((hr, ci) => { const v = row.hours[hr]; return h('button', { type: 'button', class: `pn-cell${v ? '' : ' empty'}`, disabled: !v, dataset: { sel: keyOf({ t: 'cell', m: row.machine, v: hr }) },
          style: `--a:${(0.14 + 0.86 * (v / heatMax)).toFixed(3)};--d:${(ri * 24 + ci) * 4}ms`, 'aria-label': `${row.machine} às ${hh(hr)}: ${v} min`, 'data-tip': `${row.machine} · ${hh(hr)}: ${v ? fmtDur(v) : 'sem parada'}`,
          onclick: () => pick({ t: 'cell', m: row.machine, v: hr }) }); })])),
    h('div', { class: 'pn-scale' }, h('span', {}, 'menos parado'), h('i', {}), h('span', {}, `mais parado (${fmtDur(heatMax)} numa hora)`)));

  // ---- machines
  const maxMac = Math.max(1, ...P.byMachine.map((m) => m.stopMin));
  const machines = card('pn-mac', h('h3', {}, 'Tempo parado por máquina'),
    h('div', { class: 'pn-rows' }, P.byMachine.map((m, i) => h('button', { type: 'button', class: 'pn-row', dataset: { sel: keyOf({ t: 'machine', v: m.name }) }, style: `--d:${i * 70}ms`, onclick: () => pick({ t: 'machine', v: m.name }) },
      h('span', { class: 'rn' }, m.name, h('small', {}, `${m.pct} % parada`)),
      h('span', { class: 'rt' }, h('span', { class: 'rs', style: `--w:${(m.stopMin / maxMac) * 100}%` }, m.motivos.map((x) => h('i', { style: `flex:${x.min};background:${motColor(x.motivo)}`, 'data-tip': `${m.name} · ${x.motivo}: ${fmtDur(x.min)}` })))),
      h('b', {}, fmtDur(m.stopMin))))));

  // ---- gauge: share of the recorded time spent producing (segmented ring, like a score)
  const gauge = (() => {
    const N = 28, a0 = 150, a1 = 390, r1 = 70, r2 = 92, cx = 110, cy = 110, filled = Math.round((P.prodPct / 100) * N);
    const svg = sv('svg', { class: 'pn-gauge', viewBox: '0 0 220 190', role: 'img', 'aria-label': `${P.prodPct} % do tempo produzindo` });
    for (let i = 0; i < N; i++) {
      const a = ((a0 + ((a1 - a0) * i) / (N - 1)) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
      svg.append(sv('line', { class: `gseg${i < filled ? ' on' : ''}`, x1: cx + r1 * c, y1: cy + r1 * s, x2: cx + r2 * c, y2: cy + r2 * s, style: `--d:${i * 28}ms;--k:${i / N}` }));
    }
    return h('div', { class: 'pn-gauge-wrap' }, svg, h('div', { class: 'pn-gauge-c' }, num(P.prodPct, (v) => `${Math.round(v)}%`), h('small', {}, 'do tempo produzindo')));
  })();
  const cardGauge = card('pn-gau', h('h3', {}, 'Aproveitamento'), gauge, h('p', { class: 'note c' }, `${fmtDur(P.prodMin)} produzindo · ${fmtDur(P.stopMin)} parado`));

  // ---- shifts
  const maxT = Math.max(1, ...P.byTurno.map((x) => x.min));
  const shifts = card('pn-tur', h('h3', {}, 'Tempo parado por turno'),
    h('div', { class: 'pn-rows' }, P.byTurno.map((x, i) => h('button', { type: 'button', class: 'pn-row', dataset: { sel: keyOf({ t: 'turno', v: x.turno }) }, style: `--d:${i * 80}ms`, onclick: () => pick({ t: 'turno', v: x.turno }) },
      h('span', { class: 'rn' }, x.turno === '?' ? 'Sem turno' : `Turno ${x.turno}`),
      h('span', { class: 'rt' }, h('span', { class: 'rs solid', style: `--w:${(x.min / maxT) * 100}%` })), h('b', {}, fmtDur(x.min))))));

  // ---- area chart: stopped minutes by hour of the day
  const area = (() => {
    const W = 900, H = 230, padL = 8, padR = 8, top = 14, base = H - 26, step = (W - padL - padR) / 23;
    const pts = HOURS.map((hr, i) => [padL + i * step, base - (P.byHour[hr] / maxHour) * (base - top), hr]);
    const d = pts.reduce((acc, p, i, a) => {
      if (!i) return `M${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      const q = a[i - 1], mx = (q[0] + p[0]) / 2;
      return `${acc} C${mx.toFixed(1)} ${q[1].toFixed(1)} ${mx.toFixed(1)} ${p[1].toFixed(1)} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    }, '');
    const svg = sv('svg', { class: 'pn-area', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Paradas por hora do dia' },
      sv('defs', {}, sv('linearGradient', { id: 'pnfill', x1: 0, y1: 0, x2: 0, y2: 1 }, sv('stop', { offset: '0%', 'stop-color': 'var(--pv)', 'stop-opacity': '.55' }), sv('stop', { offset: '100%', 'stop-color': 'var(--pv)', 'stop-opacity': '0' }))),
      [0.25, 0.5, 0.75, 1].map((f) => sv('line', { class: 'grid', x1: 0, x2: W, y1: base - f * (base - top), y2: base - f * (base - top) })),
      sv('path', { class: 'fill', d: `${d} L${pts.at(-1)[0]} ${base} L${pts[0][0]} ${base} Z` }),
      sv('path', { class: 'line', d, pathLength: 100 }),
      pts.map((p) => sv('g', { class: 'hc', dataset: { sel: keyOf({ t: 'hour', v: p[2] }) }, 'data-tip': `${hh(p[2])}: ${P.byHour[p[2]] ? fmtDur(P.byHour[p[2]]) : 'sem parada'}`, onclick: () => pick({ t: 'hour', v: p[2] }) },
        sv('rect', { x: p[0] - step / 2, y: 0, width: step, height: H, class: 'hit' }), sv('line', { class: 'guide', x1: p[0], x2: p[0], y1: top, y2: base }), sv('circle', { class: 'dot', cx: p[0], cy: p[1], r: 5 }))),
      pts.filter((_, i) => i % 2 === 0).map((p) => sv('text', { x: p[0], y: H - 6, class: 'ax', 'text-anchor': 'middle' }, String(p[2]))));
    return svg;
  })();
  const cardArea = card('pn-area-c', h('h3', {}, 'Paradas ao longo do dia (por hora)'), area, h('p', { class: 'note' }, 'O dia de trabalho começa às 04h. Clique numa hora para ver as paradas.'));

  // ---- longest stops
  const top = card('pn-top', h('h3', {}, 'Maiores paradas'), P.top.length ? h('div', { class: 'pn-tops' }, P.top.map((t, i) => h('div', { class: 'pn-topi', style: `--d:${i * 50}ms` },
    h('b', {}, fmtDur(t.min)), h('div', {}, h('span', {}, `${t.machine} · ${t.motivo}`), h('small', {}, t.desc || `linha ${t.linha || '?'} · ${t.clock}`)),
    h('button', { type: 'button', class: 'ghost', dataset: { act: 'goto', p: t.page, k: t.table, r: t.ri } }, 'Ir para a linha')))) : h('p', { class: 'note' }, 'Nenhuma parada registrada.'));

  ui.append(card('pn-head', h('h2', { class: 'ptitle' }, 'Painel · tempo parado', ctx.scopeLabel ? h('span', { class: 'pn-scope' }, ctx.scopeLabel) : null), filters, ctx.note ?? ''), kpis,
    h('div', { class: 'pn-grid2' }, cardMot, cardDrill), heat, slot('cell', 'Detalhes do mapa de calor'),
    h('div', { class: 'pn-grid3' }, machines, cardGauge, shifts),
    h('div', { class: 'pn-pair' }, slot('machine', 'Detalhes da máquina'), slot('turno', 'Detalhes do turno')),
    cardArea, slot('hour', 'Detalhes da hora'), top, tip);
  root.replaceChildren(ui);
  paintSel(); for (const k of SLOTS) drawSlot(k, false);

  // entrance: bars grow, the donut draws itself, numbers count up
  const go = () => {
    ui.classList.add('go');
    for (const c of donut._segs ?? []) c.style.strokeDasharray = c._to;
    if (reduced()) return;
    const t0 = performance.now(), D = 1000;
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / D), e = 1 - (1 - k) ** 3;
      for (const c of counters) c.b.textContent = c.fmt(c.to * e);
      if (k < 1) requestAnimationFrame(tick); else for (const c of counters) c.b.textContent = c.fmt(c.to);
    };
    for (const c of counters) c.b.textContent = c.fmt(0);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(() => requestAnimationFrame(go));
}
