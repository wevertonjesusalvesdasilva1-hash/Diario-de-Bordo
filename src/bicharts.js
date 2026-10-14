// Small SVG charts for the BI pages (columns, bars, combo with a line on a second axis). No library.
const SVG = 'http://www.w3.org/2000/svg';
export const PALETTE = ['#8b5cf6', '#c4b5fd', '#7ee34f', '#ff7a5c', '#f5b942', '#38bdf8'];   // the Painel's colors

export function el(tag, attrs = {}, ...kids) {
  const ns = attrs.svg === true;
  const e = ns ? document.createElementNS(SVG, tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false || k === 'svg') continue;
    if (k === 'class') e.setAttribute('class', v);
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(3)) if (kid != null && kid !== false) e.append(kid.nodeType ? kid : document.createTextNode(kid));
  return e;
}
const S = (tag, attrs, ...kids) => el(tag, { ...attrs, svg: true }, ...kids);
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// nice axis maximum and ticks
function niceMax(v) {
  if (!(v > 0)) return { max: 1, ticks: [0, 1] };
  const p = 10 ** Math.floor(Math.log10(v)), f = v / p;
  const step = (f <= 1 ? 0.2 : f <= 2 ? 0.5 : f <= 5 ? 1 : 2) * p;
  const max = Math.ceil(v / step) * step, ticks = [];
  for (let t = 0; t <= max + step / 2; t += step) ticks.push(+t.toFixed(10));
  return { max, ticks };
}

// spec: { orient: 'v' | 'h', cats: [{ key, label, group?, color? }], series: [{ name, vals, color }], stacked, line: { name, vals, color, fmt, max? },
//         fmt(v) → text, onPick(key), selected: Set<key>, height, tip(i) → extra tooltip text }
export function drawChart(box, spec) {
  box.replaceChildren();
  const { cats, series, fmt = String, orient = 'v', stacked = false, line, selected, onPick, tip } = spec;
  if (!cats.length) { box.append(el('p', { class: 'bi-note' }, 'Sem dados para os filtros escolhidos.')); return; }
  const avail = Math.max(box.clientWidth || 360, 240);
  const sel = selected && selected.size ? selected : null;
  const pickAttrs = (c) => (onPick ? { class: `pick${sel && !sel.has(c.key) ? ' dim' : ''}`, tabindex: 0, role: 'button', onclick: () => onPick(c.key), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c.key); } } } : { class: sel && !sel.has(c.key) ? 'dim' : '' });
  const legend = series.length > 1 || line ? el('div', { class: 'bi-leg' }, series.map((s) => el('span', {}, el('i', { style: `background:${s.color}` }), s.name)), line ? el('span', {}, el('i', { style: `background:${line.color ?? '#ff7a5c'}` }), line.name) : null) : null;

  if (orient === 'h') {
    const rowH = 24 * Math.max(1, stacked ? 1 : series.length) * (series.length > 1 && !stacked ? 0.8 : 1) + 6, labW = Math.min(200, Math.max(60, Math.min(26, Math.max(...cats.map((c) => String(c.label).length))) * 7.6));
    const maxV = Math.max(...series.flatMap((s) => s.vals), 0) || 1, { max } = niceMax(maxV * 1.12);
    const W = avail, H = cats.length * rowH + 8, plot = W - labW - 70;
    const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
    cats.forEach((c, i) => {
      const y = 4 + i * rowH, bh = (rowH - 6) / (stacked ? 1 : series.length);
      const g = S('g', pickAttrs(c), S('title', {}, `${c.label}\n${series.map((s) => `${s.name}: ${fmt(s.vals[i])}`).join('\n')}${tip ? '\n' + tip(i) : ''}`),
        S('text', { x: labW - 6, y: y + rowH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, clip(c.label, 26)));
      series.forEach((s, k) => {
        const w = Math.max(0, (s.vals[i] / max) * plot);
        g.append(S('rect', { x: labW, y: y + k * bh, width: w, height: bh - 2, rx: 2, fill: c.color ?? s.color }),
          S('text', { x: labW + w + 4, y: y + k * bh + bh / 2 - 1, 'dominant-baseline': 'middle', class: 'mut' }, fmt(s.vals[i]) + (tip ? ` · ${tip(i)}` : '')));
      });
      svg.append(g);
    });
    box.append(svg, legend ?? '');
    return;
  }

  // vertical columns
  const nS = series.length, bwMin = spec.barW ?? 22, minStep = stacked ? 34 : Math.max(34, nS * bwMin + 10);
  const step = Math.max(minStep, Math.min(90, (avail - 100) / cats.length));
  const hasGroup = cats.some((c) => c.group != null);
  const left = 58, right = line ? 46 : 12, top = 20, bottom = 46 + (hasGroup ? 16 : 0);
  const W = Math.max(avail, left + right + cats.length * step), H = spec.height ?? 250, plotH = H - top - bottom;
  const totals = cats.map((_, i) => (stacked ? series.reduce((s, x) => s + (x.vals[i] || 0), 0) : Math.max(...series.map((x) => x.vals[i] || 0))));
  const { max, ticks } = niceMax(Math.max(...totals, 0) * 1.1 || 1);
  const y = (v) => top + plotH - (v / max) * plotH;
  const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
  ticks.forEach((t) => svg.append(S('line', { class: 'grid', x1: left, x2: W - right, y1: y(t), y2: y(t) }), S('text', { x: left - 5, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'mut' }, fmt(t))));
  let lmax = 1, ly = null;
  if (line) { lmax = line.max ?? niceMax(Math.max(...line.vals.map((v) => v ?? 0), 0) * 1.1).max; ly = (v) => top + plotH - (v / lmax) * plotH; const lt = line.ticks ?? [0, lmax / 2, lmax]; lt.forEach((t) => svg.append(S('text', { x: W - right + 5, y: ly(t), 'dominant-baseline': 'middle', class: 'mut' }, (line.fmt ?? String)(t)))); }
  let prevGroup = null, gStart = 0;
  const closeGroup = (i) => { if (prevGroup == null || i <= gStart) return; const cx = left + ((gStart + i) / 2) * step; svg.append(S('text', { x: cx, y: H - 6, 'text-anchor': 'middle', class: 'mut' }, clip(prevGroup, 12)), S('line', { class: 'grid', x1: left + i * step, x2: left + i * step, y1: H - bottom + 2, y2: H - 2 })); };
  cats.forEach((c, i) => {
    if (hasGroup && c.group !== prevGroup) { closeGroup(i); prevGroup = c.group; gStart = i; }
    const x0 = left + i * step, bw = stacked ? step * 0.62 : Math.min(40, (step * 0.7) / nS);
    const g = S('g', pickAttrs(c), S('title', {}, `${c.group ? c.group + ' · ' : ''}${c.label}\n${series.map((s) => `${s.name}: ${fmt(s.vals[i])}`).join('\n')}${line ? `\n${line.name}: ${(line.fmt ?? String)(line.vals[i])}` : ''}${tip ? '\n' + tip(i) : ''}`));
    let acc = 0;
    series.forEach((s, k) => {
      const v = s.vals[i] || 0, bx = stacked ? x0 + (step - bw) / 2 : x0 + (step - bw * nS) / 2 + k * bw;
      const yTop = y(stacked ? acc + v : v), hgt = Math.max(0, (stacked ? y(acc) : y(0)) - yTop);
      g.append(S('rect', { x: bx, y: yTop, width: Math.max(1, bw - 1), height: hgt, rx: 2, fill: c.color ?? s.color }));
      if (v && (bw >= 22 || (cats.length <= 14 && bw >= 14)) && !(stacked && hgt < 12)) g.append(S('text', { x: bx + bw / 2, y: stacked ? yTop + hgt / 2 : yTop - 3, 'text-anchor': 'middle', 'dominant-baseline': stacked ? 'middle' : 'auto', style: 'font-size:10px' }, fmt(v)));
      if (stacked) acc += v;
    });
    const lab = clip(c.label, step < 44 ? 6 : 14), rot = step < 52 || String(c.label).length > 8;
    g.append(S('text', rot ? { x: x0 + step / 2, y: H - bottom + 12, 'text-anchor': 'end', transform: `rotate(-35 ${x0 + step / 2} ${H - bottom + 12})`, class: 'mut' } : { x: x0 + step / 2, y: H - bottom + 14, 'text-anchor': 'middle', class: 'mut' }, lab));
    svg.append(g);
  });
  closeGroup(cats.length);
  if (line) {
    const pts = cats.map((c, i) => (line.vals[i] == null ? null : [left + i * step + step / 2, ly(line.vals[i])]));
    const col = line.color ?? '#ff7a5c';
    svg.append(S('polyline', { points: pts.filter(Boolean).map((p) => p.join(',')).join(' '), fill: 'none', stroke: col, 'stroke-width': 2 }));
    pts.forEach((p, i) => { if (!p) return; svg.append(S('circle', { cx: p[0], cy: p[1], r: 3, fill: col }, S('title', {}, `${cats[i].label}\n${line.name}: ${(line.fmt ?? String)(line.vals[i])}`))); if (cats.length <= 16) svg.append(S('text', { x: p[0], y: p[1] - 7, 'text-anchor': 'middle', style: `font-size:10px;fill:${col}` }, (line.fmt ?? String)(line.vals[i]))); });
  }
  box.append(svg, legend ?? '');
}

// a chart box that redraws when its width changes (the page is fluid)
export function chartBox(spec, cls = '') {
  const box = el('div', { class: `bi-ch ${cls}` });
  let last = 0;
  const run = () => drawChart(box, typeof spec === 'function' ? spec() : spec);
  queueMicrotask(() => { last = box.clientWidth; run(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { const w = box.clientWidth; if (w && Math.abs(w - last) > 24) { last = w; run(); } }).observe(box);
  return box;
}
