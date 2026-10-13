import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { useStore } from '../api/sync.js';
import { splitForShare, mergeRemote, missingAssets, newSid } from '../src/core/share.js';

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.send = (b) => { r.body = b; return r; };
  return r;
};
const mem = () => { const m = new Map(); return { m, ok: () => true, read: async (p) => m.get(p) ?? null, write: async (p, t) => { m.set(p, t); }, prune: async () => {} }; };
const req = (over = {}) => ({ method: 'GET', query: {}, headers: { host: 'app.test', 'x-access-code': 'abc', 'x-forwarded-for': '2.2.2.' + Math.floor(Math.random() * 250) }, ...over });
const run = async (over) => { const r = mkRes(); await handler(req(over), r); return r; };

test('sincronização: exige código, e sem armazenamento responde 503', async () => {
  delete process.env.ACCESS_CODE;
  assert.equal((await run()).code, 403);
  process.env.ACCESS_CODE = 'abc';
  assert.equal((await run({ headers: { host: 'app.test', 'x-access-code': 'errado', 'x-forwarded-for': '3.3.3.3' } })).code, 401);
  useStore({ ok: () => false });
  assert.equal((await run()).code, 503);
});

test('sincronização: salva, devolve só quando mudou e recusa gravação em cima da alheia', async () => {
  process.env.ACCESS_CODE = 'abc';
  useStore(mem());
  assert.deepEqual((await run()).body, { rev: 0, state: null });
  const s1 = { pages: [{ sid: 'aaaaaa11', status: 'ok' }], dismissed: [] };
  let r = await run({ method: 'PUT', body: { baseRev: 0, state: s1 } });
  assert.equal(r.code, 200); assert.equal(r.body.rev, 1);
  assert.deepEqual((await run({ query: { rev: '1' } })).body, { rev: 1 });
  assert.equal((await run({ query: { rev: '0' } })).body.state.pages[0].sid, 'aaaaaa11');
  r = await run({ method: 'PUT', body: { baseRev: 0, state: s1 } });
  assert.equal(r.code, 409); assert.equal(r.body.rev, 1);
  assert.equal((await run({ method: 'PUT', body: { baseRev: 1, state: { x: 1 } } })).code, 400);
});

test('sincronização: imagens da folha vão e voltam; nome inválido é recusado', async () => {
  process.env.ACCESS_CODE = 'abc';
  const st = mem(); useStore(st);
  assert.equal((await run({ query: { asset: '../estado.json' } })).code, 400);
  let r = await run({ method: 'PUT', query: { asset: 'abc12345.sheet' }, body: { sheet: 'data:image/jpeg;base64,AAA' } });
  assert.equal(r.code, 200);
  r = await run({ query: { asset: 'abc12345.sheet' } });
  assert.match(r.body, /AAA/);
  assert.equal((await run({ query: { asset: 'zzzzzzzz.sheet' } })).code, 404);
});

test('compartilhar: separa as imagens do estado e junta de volta sem perder nada', () => {
  const sid = newSid();
  const pages = [
    { id: 1, sid, status: 'ok', machine: 'RAW05', sheet: 'data:SHEET', prod: [{ linha: 1, chapa1: '7910', strip: 'data:S1' }], stops: [{ linha: 2, chapa: '7910', strip: 'data:S2' }] },
    { id: 2, sid: 'x', status: 'lendo', prod: [], stops: [] },
  ];
  const { lite, assets } = splitForShare(pages);
  assert.equal(lite.length, 1);
  assert.ok(!JSON.stringify(lite).includes('data:'), 'o estado compartilhado não leva imagem');
  assert.equal(assets[sid].sheet, 'data:SHEET');
  const merged = mergeRemote(lite, { [sid]: assets[sid] });
  assert.equal(merged[0].sheet, 'data:SHEET'); assert.equal(merged[0].prod[0].strip, 'data:S1'); assert.equal(merged[0].stops[0].strip, 'data:S2');
  assert.deepEqual(missingAssets(mergeRemote(lite, {})), [sid]);
});
