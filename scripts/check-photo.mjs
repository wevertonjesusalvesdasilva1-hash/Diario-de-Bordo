// Usage: node scripts/check-photo.mjs photo.png — runs the photo path (crop + wider deskew) and prints the result
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { cropToPaper, inkIn } from '../src/core/image.js';
import { analyze } from '../src/core/layout.js';
import { MOTIVOS } from '../src/data/vocab.js';
const png = PNG.sync.read(fs.readFileSync(process.argv[2]));
const raw = { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
const img = cropToPaper(raw);
const lay = analyze(img, { photo: true });
console.log('foto', raw.width + 'x' + raw.height, '→ recortada', img.width + 'x' + img.height, '| giro', lay.rotation, 'inclinação', lay.skew.toFixed(2) + '°', '| grade', lay.geomOk ? 'ok' : 'FORA ' + JSON.stringify(lay.geom));
const { stopX, stopY, scale: sc } = lay;
const out = stopY.slice(0, -1).map((_, r) => {
  const inks = MOTIVOS.map((__, i) => inkIn(lay.masks, stopX[6 + i] + 4 * sc, stopY[r] + 4 * sc, stopX[7 + i] - 4 * sc, stopY[r + 1] - 4 * sc));
  const hit = inks.map((v, i) => [v, i]).filter(([v]) => v > 45 * sc * sc).sort((a, b) => b[0] - a[0]);
  return !hit.length ? '-' : hit.length > 1 && hit[1][0] > hit[0][0] * 0.3 ? '??' : MOTIVOS[hit[0][1]];
});
console.log('motivos:', out.join(' | '));
