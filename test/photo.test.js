import test from 'node:test';
import assert from 'node:assert/strict';
import { makeImage, cropToPaper } from '../src/core/image.js';

function scene(w, h, rect, bg = 70, paper = 235) {
  const img = makeImage(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const inside = x >= rect[0] && x < rect[2] && y >= rect[1] && y < rect[3];
    const v = inside ? paper : bg;
    const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  // some ink on the paper so it is not a flat white block
  for (let x = rect[0] + 20; x < rect[2] - 20; x += 40) for (let y = rect[1] + 20; y < rect[3] - 20; y++) { const i = (y * w + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = 20; }
  return img;
}

test('foto: recorta a folha do fundo escuro', () => {
  const out = cropToPaper(scene(1200, 900, [260, 180, 1000, 760]));
  assert.ok(out.width < 900 && out.width > 740, `largura ${out.width}`);
  assert.ok(out.height < 640 && out.height > 580, `altura ${out.height}`);
});

test('foto: imagem que já é só a folha não é alterada', () => {
  const img = scene(800, 600, [0, 0, 800, 600]);
  assert.equal(cropToPaper(img), img);
});

test('foto: sem folha clara reconhecível devolve a original', () => {
  const img = scene(800, 600, [300, 200, 340, 230]); // tiny bright patch
  assert.equal(cropToPaper(img), img);
});
