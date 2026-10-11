// Geometry of the "DIÁRIO DE BORDO – PRODUÇÃO E PARADAS" form.
// REF_* values were measured on an A4 landscape scan at 150 dpi.
import { rotate, rotateSmall, estimateSkew, masks, peaks, colSums, rowSums, inkIn } from './image.js';

const REF = {
  left: 7,
  right: 1702,
  // vertical grid lines of table 1 (15 columns) and table 2 (16 columns)
  prodX: [7, 92.5, 171, 290, 448, 541, 620.5, 700.5, 780, 860, 939.5, 1019, 1099, 1179, 1246.5, 1702],
  stopX: [7, 92.5, 172, 290, 369.5, 448.5, 541, 621, 701, 781, 860, 940, 1020, 1100, 1180, 1247.5, 1326, 1702],
  bar1Bottom: 182, // black "1. REGISTRO DE PRODUÇÃO" bar
  bar2Bottom: 679, // black "2. CONTROLE DE PARADAS" bar
  prodTop: 240, prodPitch: 39.5, prodRows: 10,
  stopTop: 772, stopPitch: 40.6, stopRows: 10,
  bubbles: { x: [313, 503, 690, 880, 1063, 1257], y: 103 },
  bar1Top: 152,
  dateBox: { x0: 95, x1: 440, y0: 113, y1: 150 },
};

export const PROD_COLS = ['n', 'data', 'peca', 'modelo', 'chapa1', 'ini1', 'fim1', 'chapa2', 'ini2', 'fim2', 'chapa3', 'ini3', 'fim3', 'turno', 'obs'];
export const STOP_COLS = ['n', 'data', 'chapa', 'ini', 'fim', 'turno',
  'MECÂNICA', 'ELÉTRICA', 'PREVENTIVA', 'AGUARD. PEÇA', 'PONTE ROLANTE', 'CONSUMIVEIS', 'TROCA DE PEÇA ', 'SET-UP', 'OUTROS', 'FALTA DE PEÇA', 'desc'];
export const MOTIVOS = STOP_COLS.slice(6, 16);
export const RAW_BUBBLES = ['RAW05', 'RAW06', 'RAW09', 'RAW10', 'RAW11', 'RAW12'];

const THICK = 12 / 1754; // minimum bar thickness as a fraction of page width

function darkRowFractions(m) {
  const { bar: dark, width: w, height: h } = m;
  const v = rowSums(dark, w, h, 0, w);
  return v.map((x) => x / w);
}
function darkColFractions(m) {
  const { bar: dark, width: w, height: h } = m;
  const v = colSums(dark, w, h, 0, h);
  return v.map((x) => x / h);
}

function barGroups(profile, minThick) {
  const groups = [];
  let cur = null;
  for (let i = 0; i < profile.length; i++) {
    if (profile[i] > 0.5) {
      if (cur && i - cur.end <= 2) cur.end = i;
      else { cur = { start: i, end: i }; groups.push(cur); }
    }
  }
  return groups.filter((g) => g.end - g.start + 1 >= minThick);
}

// Which clockwise quarter-turn makes the page upright (title bar on top)?
export function detectRotation(img) {
  const m = masks(img);
  const rows = darkRowFractions(m);
  const cols = darkColFractions(m);
  const rev = (a) => Float32Array.from(a).reverse();
  const candidates = [rows, cols, rev(rows), rev(cols)];
  let best = 0, bestScore = -1;
  candidates.forEach((p, q) => {
    const longSide = p.length;
    const bars = barGroups(p, longSide * 0.007);
    const top = bars.filter((g) => g.start < longSide * 0.2).length;
    const bottom = bars.filter((g) => g.start > longSide * 0.85).length;
    const score = bars.length >= 2 && bars.length <= 5 ? bars.length * 2 + top * 3 - bottom * 4 : -1;
    if (score > bestScore) { bestScore = score; best = q; }
  });
  return best;
}

function snap(pred, found, tol) {
  let best = null, bd = tol;
  for (const f of found) {
    const d = Math.abs(f - pred);
    if (d <= bd) { bd = d; best = f; }
  }
  return best ?? pred;
}

// Returns the upright image plus all the cell rectangles.
export function analyze(imgIn) {
  const q = detectRotation(imgIn);
  const turned = rotate(imgIn, q);
  const skew = estimateSkew(turned);
  const img = rotateSmall(turned, skew);
  const m = masks(img);
  const { width: w, height: h, dark } = m;
  const sc = w / 1754;

  const bars = barGroups(darkRowFractions(m), w * THICK).slice(0, 4);
  // title bar, bar1, bar2 – pick bars from the top of the page
  const bar1 = bars[1] ?? { start: REF.bar1Top * sc, end: REF.bar1Bottom * sc };
  const bar2 = bars[2] ?? { start: (REF.bar2Bottom - 30) * sc, end: REF.bar2Bottom * sc };

  // ---- vertical lines: measured from the page, so other versions of the form (different column
  // widths, e.g. the blue one) work. The page is only trusted when the exact number of lines is found.
  const vBand = (bar) => [bar.end + 110 * sc, bar.end + 360 * sc];
  const vLines = (bar) => {
    const [y0, y1] = vBand(bar);
    return peaks(colSums(dark, w, h, y0, y1), (y1 - y0) * 0.5);
  };
  // Pairs each expected line with a detected one (monotonic, minimum total distance), ignoring
  // spurious lines such as stamps or long strokes. Returns null when a line cannot be found.
  const matchLines = (found, ref) => {
    if (found.length === ref.length) return found; // exactly the expected lines: take them as they are
    if (found.length < ref.length) return null;
    const first = found[0], last = found.at(-1);
    const k = (last - first) / (ref.at(-1) - ref[0]);
    const want = ref.map((x) => first + (x - ref[0]) * k);
    const CAP = 32 * sc, n = want.length, m = found.length;
    const INF = 1e9;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(INF));
    const from = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let j = 0; j <= m; j++) dp[0][j] = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = i; j <= m; j++) {
        const d = Math.abs(found[j - 1] - want[i - 1]);
        const useIt = d <= CAP ? dp[i - 1][j - 1] + d : INF;
        const skip = dp[i][j - 1];
        if (useIt <= skip) { dp[i][j] = useIt; from[i][j] = 1; } else { dp[i][j] = skip; from[i][j] = 0; }
      }
    }
    if (dp[n][m] >= INF) return null;
    const out = [];
    for (let i = n, j = m; i > 0 && j > 0;) {
      if (from[i][j]) { out.unshift(found[j - 1]); i--; j--; } else j--;
    }
    return out.length === n ? out : null;
  };
  const rawProd = vLines(bar1), rawStop = vLines(bar2);
  let prodX = matchLines(rawProd, REF.prodX), stopX = matchLines(rawStop, REF.stopX);
  let geomOk = !!prodX && !!stopX;
  if (!geomOk) {
    // fall back to the template of the grey form, snapped to whatever was found
    const left = snap(REF.left * sc, rawProd, 25 * sc);
    const right = snap(REF.right * sc, rawProd, 25 * sc);
    const sx = (right - left) / (REF.right - REF.left);
    const mapX = (list, found) => list.map((x) => snap(left + (x - REF.left) * sx, found, 7 * sx));
    prodX = prodX ?? mapX(REF.prodX, rawProd); stopX = stopX ?? mapX(REF.stopX, rawStop);
  }
  const left = prodX[0], sx = (prodX.at(-1) - prodX[0]) / (REF.right - REF.left);

  // ---- horizontal lines: rows have a uniform height, so find the bottom border and the pitch that
  // best explains the (incomplete) set of lines found in the N° column.
  // Lines are looked for in several narrow bands and merged, so handwriting in one band does not hide them.
  const collectLines = (bands, from, to) => {
    const all = [];
    for (const [x0, x1] of bands) all.push(...peaks(rowSums(dark, w, h, x0, x1, Math.round(from), Math.round(to)), (x1 - x0) * 0.8));
    all.sort((a, b) => a - b);
    return all.reduce((acc, y) => (acc.length && y - acc.at(-1) < 4 * sc ? acc : [...acc, y]), []);
  };
  // `limits` pins where the table can start/end (header height is fixed on every version of the form).
  const fitRows = (bands, from, to, nRows, limits) => {
    const lines = collectLines(bands, from, to);
    const okTop = (t) => t >= limits.topMin && t <= limits.topMax;
    const okBottom = (b) => b >= limits.bottomMin && b <= limits.bottomMax;
    const aligned = (top, p) => { let n = 0; for (let k = 0; k <= nRows; k++) if (lines.some((l) => Math.abs(l - (top + k * p)) <= 2.5 * sc)) n++; return n; };
    let best = null;
    // the table top line is almost always found; try every pitch a row can have and keep the
    // grid that explains the most of the (incomplete) set of lines
    for (const top of lines) {
      if (!okTop(top)) continue;
      for (let p = 37 * sc; p <= 44 * sc; p += 0.1 * sc) {
        if (!okBottom(top + nRows * p)) continue;
        const n = aligned(top, p);
        if (n >= 5 && (!best || n > best.n)) best = { top, p, n };
      }
    }
    // otherwise: the bottom border plus the pitch that explains most of the other lines
    if (!best) {
      for (const bottom of lines.slice(-3)) {
        for (let p = 37 * sc; p <= 44 * sc; p += 0.1 * sc) {
          const top = bottom - nRows * p;
          if (!okTop(top) || !okBottom(bottom)) continue;
          const n = aligned(top, p);
          if (n >= 6 && (!best || n > best.n)) best = { top, p, n };
        }
      }
    }
    if (!best) return null;
    return Array.from({ length: nRows + 1 }, (_, k) => snap(best.top + k * best.p, lines, 2.5 * sc));
  };
  const nBands = (xs) => { const a = xs[0], b = xs[1], wd = b - a; return [[a + 0.05 * wd, a + 0.35 * wd], [a + 0.65 * wd, b - 0.05 * wd]]; };
  const fitProd = fitRows([...nBands(prodX), [prodX[10] + 4 * sc, prodX[13] - 4 * sc]], bar1.end + 4 * sc, bar2.start - 2 * sc, REF.prodRows,
    { topMin: bar1.end + 30 * sc, topMax: bar1.end + 75 * sc, bottomMin: bar2.start - 16 * sc, bottomMax: bar2.start + 3 * sc });
  const fitStop = fitRows([...nBands(stopX), [stopX[16] + 6 * sc, stopX[17] - 6 * sc]], bar2.end + 4 * sc, h - 2 * sc, REF.stopRows,
    { topMin: bar2.end + 60 * sc, topMax: bar2.end + 115 * sc, bottomMin: bar2.end + 60 * sc + 380 * sc, bottomMax: h });
  const tmplRows = (topRef, pitch, nRows, anchorBottom, anchorRefBottom) =>
    Array.from({ length: nRows + 1 }, (_, i) => anchorBottom + (topRef - anchorRefBottom) * sc + i * pitch * sc);
  const prodY = fitProd ?? tmplRows(REF.prodTop, REF.prodPitch, REF.prodRows, bar1.end, REF.bar1Bottom);
  const stopY = fitStop ?? tmplRows(REF.stopTop, REF.stopPitch, REF.stopRows, bar2.end, REF.bar2Bottom);
  geomOk = geomOk && !!fitProd && !!fitStop;

  const bubbles = REF.bubbles.x.map((x) => ({
    x: left + (x - REF.left) * sx,
    y: bar1.start - (REF.bar1Top - REF.bubbles.y) * sc,
  }));

  const dateBox = {
    x0: left + (REF.dateBox.x0 - REF.left) * sx,
    x1: left + (REF.dateBox.x1 - REF.left) * sx,
    y0: bar1.start - (REF.bar1Top - REF.dateBox.y0) * sc,
    y1: bar1.start - (REF.bar1Top - REF.dateBox.y1) * sc,
  };

  addBlackPen(m, { prodX, prodY, stopX, stopY }, sc);

  return { img, masks: m, rotation: q, skew, scale: sc, prodX, prodY, stopX, stopY, bubbles, dateBox, geomOk, geom: { v: [rawProd.length, rawStop.length], rows: [!!fitProd, !!fitStop] } };
}

export function detectMachine(layout) {
  const { masks: m, bubbles, scale: sc } = layout;
  const r = 15 * sc;
  const inks = bubbles.map((b) => inkIn(m, b.x - r, b.y - r, b.x + r, b.y + r));
  const max = Math.max(...inks);
  const idx = inks.indexOf(max);
  const second = [...inks].sort((a, b) => b - a)[1];
  const found = max > 60 * sc * sc && max > second * 1.8;
  return { machine: found ? RAW_BUBBLES[idx] : null, inks };
}

// Some people write in black. Inside the table bodies everything that is dark and is not a
// long straight run (grid line) is handwriting. The OBS column holds printed labels, so it
// only gets the blue-pen mask.
function addBlackPen(m, g, sc) {
  const { dark, pen, width: w, height: h } = m;
  const hMin = Math.round(40 * sc), vMin = Math.round(30 * sc);
  const apply = (xs, ys, xEnd) => {
    const x0 = Math.max(0, Math.floor(xs[0] - 4)), x1 = Math.min(w, Math.ceil(xEnd)), y0 = Math.max(0, Math.floor(ys[0] - 4)), y1 = Math.min(h, Math.ceil(ys.at(-1) + 4));
    const line = new Uint8Array(w * h);
    for (let y = y0; y < y1; y++) {
      let run = 0;
      for (let x = x0; x <= x1; x++) {
        if (x < x1 && dark[y * w + x]) run++;
        else { if (run >= hMin) for (let k = x - run; k < x; k++) line[y * w + k] = 1; run = 0; }
      }
    }
    for (let x = x0; x < x1; x++) {
      let run = 0;
      for (let y = y0; y <= y1; y++) {
        if (y < y1 && dark[y * w + x]) run++;
        else { if (run >= vMin) for (let k = y - run; k < y; k++) line[k * w + x] = 1; run = 0; }
      }
    }
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        if (!dark[y * w + x] || line[y * w + x]) continue;
        // skip pixels hugging a detected line (anti-aliased edges)
        let near = false;
        for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && xx >= 0 && yy < h && xx < w && line[yy * w + xx]) { near = true; break; }
        }
        if (!near) pen[y * w + x] = 1;
      }
    }
  };
  apply(g.prodX, g.prodY, g.prodX[14]);
  apply(g.stopX, g.stopY, g.stopX[17]);
}
