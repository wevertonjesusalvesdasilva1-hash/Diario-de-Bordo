import test from 'node:test';
import assert from 'node:assert/strict';
import { useStore } from '../api/_store.js';
import { useGemini } from '../api/_read.js';
import { processJob, jobStatus } from '../api/_worker.js';
import { SCHEMA_C } from '../api/_shared.js';

const mem = () => { const m = new Map(); return { m, ok: () => true, read: async (p) => m.get(p) ?? null, write: async (p, t) => { m.set(p, t); }, list: async (prefix) => [...m.keys()].filter((k) => k.startsWith(prefix)), del: async () => {}, prune: async () => {} }; };
const answer = (obj) => ({ data: { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }, model: 'fake', trace: [] });
const sheet = (chapa) => ({ maquina: 'RAW05', data: '14/10', producao: [{ linha: 1, data: '14/10', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: chapa, ini1: '12:00', fim1: '15:00' }], paradas: [] });
const upload = (st, job, n) => {
  const put = (part, v) => st.m.set(`jobs/${job}/in/${n}.${part}.json`, JSON.stringify(v));
  put('ab', { A: ['QQ=='], B: ['QQ=='], rowInk: null, bubble: 'RAW05', hints: {} });
  put('prod', ['data:image/jpeg;base64,UFJPRA==']); put('stops', []);
  put('ready', { at: 1 });
  st.m.set(`jobs/${job}/meta.json`, JSON.stringify({ total: 1, at: Date.now() }));
};
process.env.GEMINI_API_KEY = 'k';

test('leitura em segundo plano: duas leituras iguais viram um resultado, sem terceira', async () => {
  const st = mem(); useStore(st); const job = 'job00001';
  upload(st, job, 1);
  let calls = 0;
  useGemini(async () => { calls++; return answer(sheet('7910')); });
  const r = await processJob(job);
  assert.equal(r.more, false); assert.equal(calls, 2);
  const out = JSON.parse(st.m.get(`jobs/${job}/out/1.json`));
  assert.equal(out.A.producao[0].chapa1, '7910'); assert.equal(out.single, false); assert.equal(out.ask, 0);
  assert.deepEqual((await jobStatus(job)).done, [1]);
});

test('leitura em segundo plano: divergência pede a terceira leitura com a faixa da linha', async () => {
  const st = mem(); useStore(st); const job = 'job00002';
  upload(st, job, 1);
  let n = 0, askedC = null;
  useGemini(async (_m, _k, parts, schema) => {
    if (schema === SCHEMA_C) { askedC = parts.length; return answer({ respostas: [{ id: 'P1', campos: [{ campo: 'chapa1', valor: '7910' }] }] }); }
    return answer(sheet(++n === 1 ? '7910' : '7911'));
  });
  await processJob(job);
  const out = JSON.parse(st.m.get(`jobs/${job}/out/1.json`));
  assert.equal(out.ask, 1); assert.equal(out.C[0].id, 'P1'); assert.ok(askedC);
});

test('leitura em segundo plano: cota esgotada não perde a folha, espera e tenta de novo', async () => {
  const st = mem(); useStore(st); const job = 'job00003';
  upload(st, job, 1);
  useGemini(async () => { throw Object.assign(new Error('Gemini 429'), { status: 429 }); });
  const r = await processJob(job);
  assert.equal(r.more, true); assert.equal(r.wait, 300);
  assert.equal(st.m.has(`jobs/${job}/out/1.json`), false); assert.equal(st.m.has(`jobs/${job}/err/1.json`), false);
  // later the quota is back: only now the sheet is read
  useGemini(async () => answer(sheet('7910')));
  const r2 = await processJob(job);
  assert.equal(r2.more, false); assert.ok(st.m.has(`jobs/${job}/out/1.json`));
});

test('leitura em segundo plano: se só uma das duas leituras responde, ela repete só a que faltou', async () => {
  const st = mem(); useStore(st); const job = 'job00004';
  upload(st, job, 1);
  let n = 0;
  useGemini(async () => { if (++n === 2) throw Object.assign(new Error('busy'), { status: 503 }); return answer(sheet('7910')); });
  let r = await processJob(job);
  assert.equal(r.more, true);
  assert.ok(st.m.has(`jobs/${job}/part/1.A.json`) !== st.m.has(`jobs/${job}/part/1.B.json`), 'uma leitura ficou guardada');
  let calls = 0; useGemini(async () => { calls++; return answer(sheet('7910')); });
  r = await processJob(job);
  assert.equal(calls, 1); assert.equal(r.more, false);
});

test('leitura em segundo plano: erro definitivo vira aviso da folha; outro leitor ativo bloqueia', async () => {
  const st = mem(); useStore(st); const job = 'job00005';
  upload(st, job, 1);
  useGemini(async () => { throw Object.assign(new Error('chave inválida'), { status: 403 }); });
  await processJob(job);
  assert.match(JSON.parse(st.m.get(`jobs/${job}/err/1.json`)).error, /chave/);
  st.m.set(`jobs/${job}/lease.json`, JSON.stringify({ until: Date.now() + 60_000 }));
  assert.equal((await processJob(job)).busy, true);
});

test('leitura em segundo plano: envio cancelado não é lido', async () => {
  const st = mem(); useStore(st); const job = 'job00006';
  upload(st, job, 1);
  st.m.set(`jobs/${job}/cancel.json`, JSON.stringify({ at: 1 }));
  let calls = 0; useGemini(async () => { calls++; return answer(sheet('7910')); });
  const r = await processJob(job);
  assert.equal(r.more, false); assert.equal(calls, 0);
});
