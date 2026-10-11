// Usage: node scripts/check-rows.mjs page.png  — which printed rows hold writing (same rule as the app)
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { analyze } from '../src/core/layout.js';
import { inkIn } from '../src/core/image.js';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const lay = analyze({ width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) });
const { prodX, prodY, stopX, stopY, scale: sc } = lay;
const cellInk = (xs, ys, r, cols) => cols.reduce((t, c) => t + inkIn(lay.masks, xs[c] + 3 * sc, ys[r] + 3 * sc, xs[c + 1] - 3 * sc, ys[r + 1] - 3 * sc), 0);
const min = 40 * sc * sc;
const rows = (ys, f) => ys.slice(0, -1).map((_, r) => (f(r) ? r + 1 : 0)).filter(Boolean);
console.log('prod', rows(prodY, (r) => cellInk(prodX, prodY, r, [5, 6, 8, 9, 11, 12]) > min).join(','), '| stops', rows(stopY, (r) => cellInk(stopX, stopY, r, [2, 3, 4]) > min).join(','), '| turno stops', rows(stopY, (r) => cellInk(stopX, stopY, r, [5]) > min).join(','));
