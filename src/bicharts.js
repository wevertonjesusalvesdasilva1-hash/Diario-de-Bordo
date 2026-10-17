// Small SVG charts for the BI pages (columns, bars, combo with a line on a second axis). No library.
const SVG = 'http://www.w3.org/2000/svg';
// clean, solid and a bit "engineering": steel blue for production, red ALWAYS for stops and lost production
export const RED = '#ef4444';
export const GREEN = '#16a34a';
export const PALETTE = ['#16a34a', '#3b82f6', '#6366f1', '#94a3b8', '#f59e0b', '#0ea5e9'];

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
// translucent gradient fill (bright edge is the stroke); cached per svg
function paint(svg, color, dir = 'v') {
  const cache = (svg._paint ??= new Map()), key = color + dir;
  if (cache.has(key)) return cache.get(key);
  let defs = svg.querySelector('defs'); if (!defs) { defs = S('defs'); svg.prepend(defs); }
  const id = `bg${Math.random().toString(36).slice(2, 8)}`;
  const [a, b] = dir === 'h' ? [0.62, 0.9] : dir === 'area' ? [0.4, 0.03] : [0.9, 0.62];
  defs.append(S('linearGradient', { id, x1: 0, y1: 0, x2: dir === 'h' ? 1 : 0, y2: dir === 'h' ? 0 : 1 }, S('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': a }), S('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': b })));
  cache.set(key, `url(#${id})`); return `url(#${id})`;
}
const bar = (svg, color, dir, glow, attrs) => S('rect', { ...attrs, rx: 3, fill: paint(svg, color, dir), stroke: color, 'stroke-width': 1, class: 'bar', style: `--c:${color}` });
// smooth curve through the points (Catmull-Rom → Bézier), kept inside [lo, hi] vertically so it never dips below the axis
function smooth(pts, lo, hi) {
  if (pts.length < 2) return `M${pts[0][0]},${pts[0][1]}`;
  const cl = (y) => Math.min(hi, Math.max(lo, y));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${cl(p1[1] + (p2[1] - p0[1]) / 6)} ${p2[0] - (p3[0] - p1[0]) / 6},${cl(p2[1] - (p3[1] - p1[1]) / 6)} ${p2[0]},${p2[1]}`;
  }
  return d;
}
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
export function drawChart(box, full) {
  box.replaceChildren();
  // legend as buttons: click = show only that series (click again = all); Ctrl/⌘ + click adds or removes series
  const only = (box._only ??= new Set()), names = [...full.series.map((s) => s.name), ...(full.line ? [full.line.name] : []), ...(full.marks ? [full.marks.name] : [])];
  for (const n of [...only]) if (!names.includes(n)) only.delete(n);
  const toggle = (name, multi) => { if (multi) { if (only.has(name)) only.delete(name); else only.add(name); } else if (only.size === 1 && only.has(name)) only.clear(); else { only.clear(); only.add(name); } drawChart(box, full); };
  const on = (n) => !only.size || only.has(n);
  const spec = { ...full, series: full.series.filter((s) => on(s.name)), line: full.line && on(full.line.name) ? full.line : undefined, marks: full.marks && on(full.marks.name) ? full.marks : undefined };
  const { cats, series, fmt = String, orient = 'v', stacked = false, line, selected, onPick, tip } = spec;
  if (!cats.length) { box.append(el('p', { class: 'bi-note' }, 'Sem dados para os filtros escolhidos.')); return; }
  const avail = Math.max(box.clientWidth || 360, 240);
  const sel = selected && selected.size ? selected : null;
  const pickAttrs = (c) => (onPick ? { class: `pick${sel && !sel.has(c.key) ? ' dim' : ''}`, tabindex: 0, role: 'button', onclick: (e) => onPick(c.key, e), onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(c.key, e); } } } : { class: sel && !sel.has(c.key) ? 'dim' : '' });
  const lg = (name, color) => el('button', { type: 'button', class: `lg${on(name) ? '' : ' off'}`, 'aria-pressed': String(only.has(name)), title: 'Clique para ver só este; Ctrl + clique para somar', onclick: (e) => toggle(name, e.ctrlKey || e.metaKey) }, el('i', { style: `background:${color}` }), name);
  const legend = full.series.length > 1 || full.line || full.marks ? el('div', { class: 'bi-leg' }, full.series.map((s) => lg(s.name, s.color)), full.line ? lg(full.line.name, full.line.color ?? '#fb7185') : '', full.marks ? lg(full.marks.name, 'rgba(148,163,184,0.75)') : '') : null;

  if (orient === 'h') {
    const rowH = 24 * Math.max(1, stacked ? 1 : series.length) * (series.length > 1 && !stacked ? 0.8 : 1) + 6, labW = Math.min(200, Math.max(60, Math.min(26, Math.max(...cats.map((c) => String(c.label).length))) * 7.6));
    const maxV = Math.max(...series.flatMap((s) => s.vals), 0) || 1, { max } = niceMax(maxV * 1.12);
    const txtW = Math.min(avail * 0.45, Math.max(70, Math.max(...series.flatMap((s) => s.vals.map((v, i) => (fmt(v) + (tip ? ` · ${tip(i)}` : '')).length))) * 6.6 + 10));   // room for the value text after the longest bar
    const W = avail, H = cats.length * rowH + 8, plot = Math.max(60, W - labW - txtW);
    const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
    cats.forEach((c, i) => {
      const y = 4 + i * rowH, bh = (rowH - 6) / (stacked ? 1 : series.length);
      const g = S('g', pickAttrs(c), S('title', {}, `${c.label}\n${series.map((s) => `${s.name}: ${fmt(s.vals[i])}`).join('\n')}${tip ? '\n' + tip(i) : ''}`),
        S('text', { x: labW - 6, y: y + rowH / 2, 'text-anchor': 'end', 'dominant-baseline': 'middle' }, clip(c.label, 26)));
      series.forEach((s, k) => {
        const w = Math.max(0, (s.vals[i] / max) * plot);
        const b0 = bar(svg, c.color ?? s.color, 'h', cats.length * series.length <= 60, { x: labW, y: y + k * bh, width: w, height: bh - 2 });
        g.append(b0);
        if (spec.hlOn && s.hl) { b0.setAttribute('opacity', '0.22'); const hw = Math.max(0, ((s.hl[i] || 0) / max) * plot); if (hw > 0) g.append(bar(svg, c.color ?? s.color, 'h', true, { x: labW, y: y + k * bh, width: hw, height: bh - 2 })); }
        g.append(
          S('text', { x: labW + w + 4, y: y + k * bh + bh / 2 - 1, 'dominant-baseline': 'middle', class: 'mut' }, fmt(s.vals[i]) + (tip ? ` · ${tip(i)}` : '')));
      });
      svg.append(g);
    });
    box.append(svg, legend ?? '');
    return;
  }

  if (spec.kind === 'area') return drawArea(box, spec, avail, legend, sel);
  // vertical columns
  const nS = series.length, bwMin = spec.barW ?? 22, minStep = stacked ? 34 : Math.max(34, nS * bwMin + 10);
  const step = Math.max(minStep, Math.min(90, (avail - 100) / cats.length));
  const hasGroup = cats.some((c) => c.group != null);
  // groups (e.g. one day with a bar per robot) are separated by a gap and an alternating band, so no bar looks like it belongs to the next group
  const GAP = hasGroup ? 18 : 0, gapBefore = []; let gaps = 0;
  cats.forEach((c, i) => { if (hasGroup && i > 0 && c.group !== cats[i - 1].group) gaps++; gapBefore[i] = gaps; });
  // room for the (rotated) category labels: the longer the labels, the taller the bottom margin, and the chart grows by the same amount
  const rotAny = (step < 52 && Math.max(...cats.map((c) => String(c.label).length)) > 3) || cats.some((c) => String(c.label).length > 8), maxLab = Math.min(14, Math.max(...cats.map((c) => String(c.label).length)));
  const bottom = (rotAny ? 26 + maxLab * 6.4 * 0.58 : 34) + (hasGroup ? 16 : 0), left = Math.max(58, String(fmt(Math.max(...cats.map((_, i) => (stacked ? series.reduce((s, x) => s + (x.vals[i] || 0), 0) : Math.max(...series.map((x) => x.vals[i] || 0)))), 0) * 1.2)).length * 6.4 + 14), right = line ? 46 : 12, top = 20;
  const W = Math.max(avail, left + right + cats.length * step + gaps * GAP + GAP), H = (spec.height ?? 250) + (bottom - 46), plotH = H - top - bottom;
  const totals = cats.map((_, i) => Math.max(stacked ? series.reduce((s, x) => s + (x.vals[i] || 0), 0) : Math.max(...series.map((x) => x.vals[i] || 0)), spec.marks?.vals[i] || 0));
  const ref = spec.refLine;
  const rotLab = !stacked && nS > 1 && Math.min(40, (step * 0.7) / nS) < 34;   // side-by-side columns: values are written upright over each bar
  const above = !!(spec.lineAbove && line);   // the line lives in a band over the columns, so the two never overlap
  const { max, ticks } = niceMax(Math.max(Math.max(...totals, 0) * (above ? 1.7 : spec.marks ? 1.22 : rotLab ? 1.38 : 1.1), ref ? ref.value * 1.08 : 0) || 1);
  const xAt = (i) => left + GAP / 2 + i * step + gapBefore[i] * GAP;
  const y = (v) => top + plotH - (v / max) * plotH;
  const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
  (series.length ? ticks.filter((t) => !above || t <= Math.max(...totals, 0) * 1.15) : [0, max]).forEach((t) => svg.append(S('line', { class: 'grid', x1: left, x2: W - right, y1: y(t), y2: y(t) }), series.length ? S('text', { x: left - 5, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'mut' }, fmt(t)) : ''));
  if (ref) svg.append(S('line', { x1: left, x2: W - right, y1: y(ref.value), y2: y(ref.value), stroke: ref.color ?? '#fbbf24', 'stroke-width': 1.6, 'stroke-dasharray': '6 5' }), S('text', { x: W - right - 2, y: y(ref.value) - 5, 'text-anchor': 'end', style: `fill:${ref.color ?? '#fbbf24'};font-size:11px;font-weight:700` }, ref.label ?? String(ref.value)));
  let ly = null, dup = false;
  if (line) {
    // a line that repeats a column series (same numbers) shares the columns' scale and needs no second axis or labels
    dup = series.some((sr) => sr.vals.length === line.vals.length && sr.vals.every((v, i) => v === line.vals[i]));
    const vs = line.vals.filter((v) => v != null);
    let lo = dup ? 0 : (line.min ?? 0), hi = dup ? max : (line.max ?? niceMax(Math.max(...vs, 0) * 1.1).max);
    if (above && vs.length) { const a = Math.min(...vs, line.ref ?? Infinity), b = Math.max(...vs, line.ref ?? -Infinity), sp = Math.max(b - a, 0.25); hi = (sp / 0.16) ; lo = a - 0.78 * hi; hi = lo + hi; }   // line between 78% and 94% of the height
    ly = (v) => top + plotH - ((v - lo) / (hi - lo || 1)) * plotH;
    if (above && line.ref != null) svg.append(S('line', { x1: left, x2: W - right, y1: ly(line.ref), y2: ly(line.ref), stroke: line.color ?? '#fb7185', 'stroke-width': 1, 'stroke-dasharray': '4 4', opacity: 0.55 }), S('text', { x: W - right + 5, y: ly(line.ref), 'dominant-baseline': 'middle', class: 'mut' }, line.refLabel ?? String(line.ref)));
    if (!dup && !above) (line.ticks ?? (lo < 0 && hi > 0 ? [lo, 0, hi] : [lo, (lo + hi) / 2, hi])).forEach((t) => svg.append(S('text', { x: W - right + 5, y: ly(t), 'dominant-baseline': 'middle', class: 'mut' }, (line.fmt ?? String)(t))));
  }
  if (hasGroup) {
    const gr = []; cats.forEach((c, i) => { const l = gr.at(-1); if (l && l.label === c.group) l.end = i; else gr.push({ label: c.group, start: i, end: i }); });
    gr.forEach((q, n) => {
      const xa = xAt(q.start) - GAP / 2, xb = xAt(q.end) + step + GAP / 2 - 1;
      if (n % 2 === 0) svg.append(S('rect', { x: xa, y: top - 4, width: xb - xa, height: H - top - 4, rx: 6, fill: 'rgba(127,140,155,0.12)' }));
      svg.append(S('text', { x: (xa + xb) / 2, y: H - 6, 'text-anchor': 'middle', style: 'font-size:13px;font-weight:700;fill:var(--ink, #e6e9ef)' }, clip(q.label, 12)));
    });
  }
  cats.forEach((c, i) => {
    const x0 = xAt(i), bw = spec.marks ? step * 0.34 : stacked ? step * 0.62 : Math.min(40, (step * 0.7) / nS);
    const g = S('g', pickAttrs(c), S('title', {}, `${c.group ? c.group + ' · ' : ''}${c.label}\n${series.map((s) => `${s.name}: ${fmt(s.vals[i])}`).join('\n')}${line ? `\n${line.name}: ${(line.fmt ?? String)(line.vals[i])}` : ''}${tip ? '\n' + tip(i) : ''}`));
    if (spec.marks) { const mv = spec.marks.vals[i] || 0; if (mv > 0) g.append(S('rect', { x: x0 + step / 2 + 2, y: y(mv), width: bw, height: Math.max(0, y(0) - y(mv)), rx: 4, fill: 'rgba(148,163,184,0.55)', stroke: 'rgba(203,213,225,0.8)', 'stroke-width': 1 })); }   // the planned (meta) as a bar beside the real one
    let acc = 0;
    series.forEach((s, k) => {
      const v = s.vals[i] || 0, bx = spec.marks ? x0 + step / 2 - bw - 2 : stacked ? x0 + (step - bw) / 2 : x0 + (step - bw * nS) / 2 + k * bw;
      const yTop = y(stacked ? acc + v : v), hgt = Math.max(0, (stacked ? y(acc) : y(0)) - yTop);
      const b0 = bar(svg, c.color ?? s.color, 'v', cats.length * nS <= 120, { x: bx, y: yTop, width: Math.max(1, bw - 1), height: hgt });
      g.append(b0);
      // cross-highlight (like Power BI): the whole bar goes dim and the part that belongs to the clicked selection stays bright
      if (spec.hlOn && s.hl) {
        b0.setAttribute('opacity', '0.22');
        const hv = s.hl[i] || 0;
        if (hv > 0) { const yb = stacked ? y(acc) : y(0), yt = stacked ? y(acc + hv) : y(hv); g.append(bar(svg, c.color ?? s.color, 'v', true, { x: bx, y: yt, width: Math.max(1, bw - 1), height: Math.max(0, yb - yt) })); }
      }
      if (v && (bw >= 22 || (cats.length <= 14 && bw >= 14)) && !(stacked && hgt < 12)) g.append(rotLab ? S('text', { x: bx + bw / 2 + 3, y: yTop - 4, 'text-anchor': 'start', transform: `rotate(-90 ${bx + bw / 2 + 3} ${yTop - 4})`, style: 'font-size:10px' }, fmt(v)) : S('text', { x: bx + bw / 2, y: stacked ? yTop + hgt / 2 : yTop - 3, 'text-anchor': 'middle', 'dominant-baseline': stacked ? 'middle' : 'auto', style: 'font-size:10px' }, fmt(v)));
      if (stacked) acc += v;
    });
    if (spec.marks) {   // real total on top of the stack, planned on top of the bar beside it
      const mk = spec.marks, mv = mk.vals[i] || 0, cs = x0 + step / 2 - bw / 2 - 2, cm = x0 + step / 2 + bw / 2 + 2;
      if (series.length) g.append(S('text', { x: cs, y: y(acc) - 6, 'text-anchor': 'middle', style: 'font-weight:700;font-size:12px' }, fmt(acc)));
      g.append(S('text', { x: cm, y: y(mv) - 6, 'text-anchor': 'middle', class: 'mut', style: 'font-size:10px' }, mk.texts?.[i] ?? fmt(mv)));
      if (!mk.noText) g.append(S('text', { x: cm, y: y(mv) - 17, 'text-anchor': 'middle', class: 'mut', style: 'font-size:10px' }, 'meta'));
    } else if (stacked && nS > 1 && acc && (!spec.totalsOnlyAlerts || c.alert)) g.append(S('text', { x: x0 + step / 2, y: y(acc) - 6, 'text-anchor': 'middle', style: `font-weight:700;font-size:11px${c.alert ? ';fill:#fb7185' : ''}` }, (c.alert ? '⚠ ' : '') + fmt(acc)));   // total of the stack on top
    const lab = clip(c.label, 14), rot = rotAny;
    g.append(S('text', rot ? { x: x0 + step / 2, y: H - bottom + 12, 'text-anchor': 'end', transform: `rotate(-35 ${x0 + step / 2} ${H - bottom + 12})`, class: 'mut' } : { x: x0 + step / 2, y: H - bottom + 14, 'text-anchor': 'middle', class: 'mut' }, lab));
    svg.append(g);
  });
  if (line) {
    const pts = cats.map((c, i) => (line.vals[i] == null ? null : [xAt(i) + step / 2, ly(line.vals[i])]));
    const col = line.color ?? '#fb7185';
    const ok = pts.filter(Boolean); if (ok.length) svg.append(S('path', { d: smooth(ok, top, top + plotH), fill: 'none', stroke: col, 'stroke-width': 2.4, 'stroke-linecap': 'round', class: 'glow', style: `--c:${col}` }));
    pts.forEach((p, i) => { if (!p) return; svg.append(S('circle', { cx: p[0], cy: p[1], r: 3.5, fill: '#fff', stroke: col, 'stroke-width': 2 }, S('title', {}, `${cats[i].label}\n${line.name}: ${(line.fmt ?? String)(line.vals[i])}`))); if (cats.length <= 16 && !dup) svg.append(S('text', { x: p[0], y: p[1] - 7, 'text-anchor': 'middle', style: `font-size:10px;fill:${col}` }, (line.fmt ?? String)(line.vals[i]))); });
  }
  box.append(svg, legend ?? '');
}

// a chart box that redraws when its width changes (the page is fluid)
export function chartBox(spec, cls = '') {
  const box = el('div', { class: `bi-ch ${cls}` });
  let last = 0;
  const get = () => (typeof spec === 'function' ? spec() : spec);
  // the horizontal scroll survives redraws (a click, a resize, new filters): the chart stays where the person was looking
  box.addEventListener('scroll', () => { box._left = box.scrollLeft; });
  const run = () => { drawChart(box, get()); if (box._left) box.scrollLeft = box._left; };
  box.getTable = () => specToTable(get());
  queueMicrotask(() => { last = box.clientWidth; run(); });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { const w = box.clientWidth; if (w && Math.abs(w - last) > 24) { last = w; run(); } }).observe(box);
  return box;
}

// the data behind a chart, as a table (for the Excel download)
export function specToTable(spec) {
  const grouped = spec.cats.some((c) => c.group != null);
  const head = [...(grouped ? ['Grupo'] : []), 'Categoria', ...spec.series.map((s) => s.name), ...(spec.line ? [spec.line.name] : [])];
  const rows = spec.cats.map((c, i) => [...(grouped ? [c.group ?? ''] : []), c.label, ...spec.series.map((s) => s.vals[i]), ...(spec.line ? [spec.line.vals[i]] : [])]);
  return { head, rows };
}

// time series: one smooth glowing line per series over a translucent gradient; hovering a day shows a dashed guide and the values
function drawArea(box, spec, avail, legend, sel) {
  const { cats, series, fmt = String, onPick } = spec, n = cats.length;
  const left = Math.max(58, String(fmt(Math.max(...series.flatMap((s) => s.vals), 0) * 1.2)).length * 6.4 + 14), right = 16, top = 16, bottom = 34, H = spec.height ?? 260, plotH = H - top - bottom;
  const step = Math.max(26, (avail - left - right) / Math.max(1, n - 1)), W = Math.max(avail, left + right + (n - 1) * step);
  const { max, ticks } = niceMax(Math.max(...series.flatMap((s) => s.vals), 0) * 1.1 || 1);
  const x = (i) => left + i * step, y = (v) => top + plotH - (v / max) * plotH;
  const svg = S('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: 'img' });
  ticks.forEach((t) => svg.append(S('line', { class: 'grid', x1: left, x2: W - right, y1: y(t), y2: y(t) }), S('text', { x: left - 6, y: y(t), 'text-anchor': 'end', 'dominant-baseline': 'middle', class: 'mut' }, fmt(t))));
  const every = Math.max(1, Math.ceil(36 / step));
  cats.forEach((c, i) => { if (i % every === 0) svg.append(S('text', { x: x(i), y: H - 12, 'text-anchor': 'middle', class: 'mut' }, c.label)); });
  series.forEach((s) => {
    const pts = s.vals.map((v, i) => [x(i), y(v || 0)]), base = top + plotH;
    svg.append(S('path', { d: `${smooth(pts, top, base)} L${x(n - 1)},${base} L${x(0)},${base} Z`, fill: paint(svg, s.color, 'area'), stroke: 'none' }),
      S('path', { d: smooth(pts, top, base), fill: 'none', stroke: s.color, 'stroke-width': 2.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'line', style: `--c:${s.color}` }));
  });
  const guide = S('line', { x1: 0, x2: 0, y1: top, y2: top + plotH, stroke: '#fff', 'stroke-dasharray': '4 4', opacity: 0, 'pointer-events': 'none' });
  const dots = [];   // no ring on the line: the dashed guide and the tooltip are enough
  svg.append(guide, ...dots);
  cats.forEach((c, i) => {
    const hit = S('rect', { x: x(i) - step / 2, y: top, width: step, height: plotH, fill: 'transparent', class: `pick${sel && !sel.has(c.key) ? ' dim' : ''}`, tabindex: 0,
      onmouseenter: () => { guide.setAttribute('x1', x(i)); guide.setAttribute('x2', x(i)); guide.setAttribute('opacity', 0.7); dots.forEach((d, k) => { d.setAttribute('cx', x(i)); d.setAttribute('cy', y(series[k].vals[i] || 0)); d.setAttribute('opacity', 1); }); },
      onmouseleave: () => { guide.setAttribute('opacity', 0); dots.forEach((d) => d.setAttribute('opacity', 0)); },
      onclick: (e) => onPick?.(c.key, e) }, S('title', {}, `${c.label}\n${series.map((s) => `${s.name}: ${fmt(s.vals[i])}`).join('\n')}`));
    svg.append(hit);
  });
  box.append(svg, legend ?? '');
}
