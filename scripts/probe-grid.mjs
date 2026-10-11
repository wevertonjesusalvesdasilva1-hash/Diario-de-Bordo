// Usage: node scripts/probe-grid.mjs page.png   — prints detected grid lines vs the template
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { rotate, rotateSmall, estimateSkew, masks, peaks, colSums, rowSums } from '../src/core/image.js';
import { detectRotation } from '../src/core/layout.js';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
let img = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
img = rotate(img, detectRotation(img)); img = rotateSmall(img, estimateSkew(img));
const m = masks(img); const { dark, bar, width: w, height: h } = m;
const barRows = rowSums(bar, w, h, 0, w).map((v) => v / w);
const bars = []; let cur = null;
barRows.forEach((v, y) => { if (v > 0.5) { if (cur && y - cur.e <= 2) cur.e = y; else { cur = { s: y, e: y }; bars.push(cur); } } });
console.log('bars', bars.filter((b) => b.e - b.s > 12).map((b) => `${b.s}-${b.e}`).join(' '));
const bb = bars.filter((b) => b.e - b.s > 12);
const [t, b1, b2] = bb;
const rowsLines = (x0, x1, y0, y1) => peaks(rowSums(dark, w, h, x0, x1, y0, y1), (x1 - x0) * 0.8);
for (const [name, from, to] of [['prod', b1.e, b2.s], ['stop', b2.e, h]]) {
  const bandY0 = from + 70, bandY1 = Math.min(to, from + 70 + 330);
  const v = peaks(colSums(dark, w, h, bandY0, bandY1), (bandY1 - bandY0) * 0.5);
  console.log(name, 'V', v.length, v.map((x) => Math.round(x)).join(','));
  const hl = rowsLines(40, 90, from, to - 2);
  console.log(name, 'H(N° col)', hl.length, hl.map((x) => Math.round(x)).join(','));
}
