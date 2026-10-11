import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/extract.js';

const mkRes = () => {
  const r = { code: 0, body: null, headers: {} };
  r.status = (c) => { r.code = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
};
const req = (over = {}) => ({ method: 'POST', headers: { host: 'app.test', 'x-forwarded-for': '1.1.1.' + Math.floor(Math.random() * 250) }, body: { images: ['QUJD'], pass: 'A' }, ...over });

test('rejeita método errado, origem estranha e corpo inválido', async () => {
  process.env.GEMINI_API_KEY = 'k';
  let r = mkRes(); await handler(req({ method: 'GET' }), r); assert.equal(r.code, 405);
  r = mkRes(); await handler(req({ headers: { host: 'app.test', origin: 'https://evil.example' } }), r); assert.equal(r.code, 403);
  r = mkRes(); await handler(req({ body: { images: [] } }), r); assert.equal(r.code, 400);
});

test('sem chave configurada devolve erro claro', async () => {
  delete process.env.GEMINI_API_KEY;
  const r = mkRes(); await handler(req(), r);
  assert.equal(r.code, 500); assert.match(r.body.error, /GEMINI_API_KEY/);
});

test('chama o Gemini com a chave no cabeçalho e devolve o JSON', async () => {
  process.env.GEMINI_API_KEY = 'segredo';
  const seen = [];
  globalThis.fetch = async (url, init) => { seen.push({ url, init }); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"producao":[],"paradas":[],"maquina":"RAW05"}' }] } }] }) }; };
  const r = mkRes(); await handler(req({ headers: { host: 'app.test', origin: 'https://app.test', 'x-forwarded-for': '9.9.9.9' } }), r);
  assert.equal(r.code, 200);
  assert.equal(r.body.data.maquina, 'RAW05');
  assert.equal(seen[0].init.headers['x-goog-api-key'], 'segredo');
  assert.ok(!seen[0].url.includes('segredo'), 'a chave não vai na URL');
  assert.equal(JSON.parse(seen[0].init.body).generationConfig.temperature, 0);
});

test('cota diária esgotada vira mensagem amigável e não insiste', async () => {
  process.env.GEMINI_API_KEY = 'k';
  let n = 0;
  globalThis.fetch = async () => { n++; return { ok: false, status: 429, text: async () => 'RESOURCE_EXHAUSTED quota per day PerDay' }; };
  const r = mkRes(); await handler(req({ headers: { host: 'app.test', 'x-forwarded-for': '8.8.8.8' } }), r);
  assert.equal(r.code, 429); assert.match(r.body.error, /diário/);
  assert.equal(n, 1);
});

test('503 de um modelo passa para o modelo reserva', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const used = [];
  globalThis.fetch = async (url) => {
    used.push(decodeURIComponent(String(url).split('/models/')[1].split(':')[0]));
    if (used.length === 1) return { ok: false, status: 503, text: async () => 'high demand' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"producao":[],"paradas":[]}' }] } }] }) };
  };
  const r = mkRes(); await handler(req({ headers: { host: 'app.test', 'x-forwarded-for': '7.7.7.7' } }), r);
  assert.equal(r.code, 200);
  assert.deepEqual(used, ['gemini-flash-latest', 'gemini-2.5-flash']);
  assert.equal(r.body.model, 'gemini-2.5-flash');
});

test('modelo que recusa thinkingConfig é repetido sem ele', async () => {
  process.env.GEMINI_API_KEY = 'k';
  const bodies = [];
  globalThis.fetch = async (url, init) => {
    bodies.push(JSON.parse(init.body));
    if (bodies.length === 1) return { ok: false, status: 400, text: async () => 'Unknown field thinkingBudget thinking' };
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"producao":[],"paradas":[]}' }] } }] }) };
  };
  const r = mkRes(); await handler(req({ headers: { host: 'app.test', 'x-forwarded-for': '6.6.6.6' } }), r);
  assert.equal(r.code, 200);
  assert.ok(bodies[0].generationConfig.thinkingConfig);
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined);
});

test('analyze: devolve pontos e recusa corpo inválido', async () => {
  const analyze = (await import('../api/analyze.js')).default;
  process.env.GEMINI_API_KEY = 'k';
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"pontos":["Parado 3h20","Conferir horário da linha 4"]}' }] } }] }) });
  let r = mkRes(); await analyze({ method: 'POST', headers: { host: 'app.test' }, body: { resumo: { totais: { parado: '3h20' } } } }, r);
  assert.equal(r.code, 200); assert.equal(r.body.pontos.length, 2);
  r = mkRes(); await analyze({ method: 'POST', headers: { host: 'app.test' }, body: { resumo: 'x'.repeat(30000) } }, r);
  assert.equal(r.code, 400);
  r = mkRes(); await analyze({ method: 'POST', headers: { host: 'app.test', origin: 'https://evil.example' }, body: { resumo: {} } }, r);
  assert.equal(r.code, 403);
});

test('código de acesso: sem variável o app fica aberto; com variável exige o código certo', async () => {
  const login = (await import('../api/login.js')).default;
  const extract = (await import('../api/extract.js')).default;
  delete process.env.ACCESS_CODE;
  let r = mkRes(); await login({ method: 'GET', headers: { host: 'app.test' } }, r);
  assert.deepEqual(r.body, { required: false });
  process.env.ACCESS_CODE = 'k7tq-m4xz2n'; process.env.GEMINI_API_KEY = 'k';
  r = mkRes(); await login({ method: 'GET', headers: { host: 'app.test' } }, r);
  assert.deepEqual(r.body, { required: true });
  r = mkRes(); await login({ method: 'POST', headers: { host: 'app.test', 'x-forwarded-for': '5.5.5.5' }, body: { code: 'errado' } }, r);
  assert.equal(r.code, 401);
  r = mkRes(); await login({ method: 'POST', headers: { host: 'app.test', 'x-forwarded-for': '5.5.5.6' }, body: { code: 'k7tq-m4xz2n' } }, r);
  assert.equal(r.code, 200);
  // a leitura sem o código é recusada antes de gastar a cota
  let called = 0; globalThis.fetch = async () => { called++; return { ok: true, json: async () => ({}) }; };
  r = mkRes(); await extract({ method: 'POST', headers: { host: 'app.test', 'x-forwarded-for': '5.5.5.7' }, body: { images: ['QUJD'] } }, r);
  assert.equal(r.code, 401); assert.equal(called, 0);
  delete process.env.ACCESS_CODE;
});

test('código de acesso: 10 erros seguidos bloqueiam o IP por um tempo', async () => {
  const login = (await import('../api/login.js')).default;
  process.env.ACCESS_CODE = 'segredo-certo';
  let last;
  for (let i = 0; i < 11; i++) { last = mkRes(); await login({ method: 'POST', headers: { host: 'app.test', 'x-forwarded-for': '6.6.6.66' }, body: { code: 'x' + i } }, last); }
  assert.equal(last.code, 429);
  delete process.env.ACCESS_CODE;
});

test('terceira leitura: valida o pedido e devolve as respostas', async () => {
  process.env.GEMINI_API_KEY = 'k'; delete process.env.ACCESS_CODE;
  const bodies = [];
  globalThis.fetch = async (url, init) => { bodies.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: '{"respostas":[{"id":"S10","campos":[{"campo":"fim","valor":"22:58"}]}]}' }] } }] }) }; };
  const call = async (body, ip) => { const r = mkRes(); await handler({ method: 'POST', headers: { host: 'app.test', 'x-forwarded-for': ip }, body }, r); return r; };
  let r = await call({ pass: 'C', images: ['QUJD'], ask: [{ id: 'S10', tabela: 'stops', linha: 10, campos: ['fim'] }] }, '4.4.4.1');
  assert.equal(r.code, 200); assert.equal(r.body.data.respostas[0].campos[0].valor, '22:58');
  assert.match(bodies[0].contents[0].parts[0].text, /fim \(FIM\)/);
  assert.ok(bodies[0].generationConfig.responseSchema.properties.respostas, 'usa o esquema da 3ª leitura');
  r = await call({ pass: 'C', images: ['QUJD'], ask: [{ id: 'S10', tabela: 'stops', linha: 10, campos: ['desc'] }] }, '4.4.4.2');
  assert.equal(r.code, 400, 'campo que não pode ser pedido');
  r = await call({ pass: 'C', images: ['QUJD', 'QUJD'], ask: [{ id: 'S1', tabela: 'stops', linha: 1, campos: ['fim'] }] }, '4.4.4.3');
  assert.equal(r.code, 400, 'número de imagens diferente do pedido');
});
