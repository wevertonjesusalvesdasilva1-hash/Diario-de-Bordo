// The history in the browser: reads the base (with a local copy so it is not downloaded again if nothing changed) and sends records.
import { apiGet, apiSend } from './api.js';
import { saveHist, loadHist } from './store.js';
import { setMatrix, getMatrix } from './core/history.js';

const mem = { raw: null, usi: null };
const json = async (r) => r.json().catch(() => ({}));
const fail = async (r) => { const b = await json(r); throw new Error(r.status === 503 ? 'A base de dados ainda não foi ligada no servidor (armazenamento).' : r.status === 401 ? 'Digite o código de acesso.' : (b.error || `Erro ${r.status}`)); };

export const emptyBase = () => ({ rev: 0, prod: [], stops: [], batches: [] });

// the base of one group ('raw' | 'usi'): { rev, prod, stops, batches }
export async function loadBase(g, { force = false } = {}) {
  await loadMatriz();
  if (!mem[g]) mem[g] = (await loadHist(g)) ?? null;
  const fixM = (r) => (/^HMC \d{2}$/.test(r.m) ? { ...r, m: r.m.replace(' ', '-') } : r);
  if (mem[g] && g === 'usi' && !mem[g].fixed) { mem[g] = { ...mem[g], prod: mem[g].prod.map(fixM), stops: mem[g].stops.map(fixM), fixed: true }; }
  const cached = mem[g];
  const r = await apiGet(`/api/historico?g=${g}${cached && !force ? `&rev=${cached.rev}` : ''}`);
  if (!r.ok) await fail(r);
  const body = await json(r);
  if (!body.prod) return cached ?? emptyBase(); // unchanged
  mem[g] = body; saveHist(g, body);
  return body;
}
export const cachedBase = (g) => mem[g];

const CHUNK = 1500;
// sends records in chunks small enough for one request each. op: 'append' (default) or 'replace' (the first chunk replaces the base)
export async function sendRecords(g, { prod = [], stops = [], label = 'Envio', batch = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, op = 'append', confirm = false, onProgress } = {}) {
  const total = { added: { prod: 0, stops: 0 }, dup: { prod: 0, stops: 0 }, invalid: 0, batch };
  const chunks = [];
  for (let i = 0; i < Math.max(prod.length, stops.length, 1); i += CHUNK) chunks.push({ prod: prod.slice(i, i + CHUNK), stops: stops.slice(i, i + CHUNK) });
  for (let i = 0; i < chunks.length; i++) {
    const r = await apiSend('POST', '/api/historico', { g, op: i === 0 ? op : 'append', confirm: i === 0 ? confirm : undefined, batch, label, ...chunks[i] });
    if (!r.ok) await fail(r);
    const b = await json(r);
    total.added.prod += b.added.prod; total.added.stops += b.added.stops; total.dup.prod += b.dup.prod; total.dup.stops += b.dup.stops; total.invalid += b.invalid;
    onProgress?.((i + 1) / chunks.length);
  }
  mem[g] = null; // changed: the next read downloads the new base
  return total;
}
export async function undoBatch(g, batch) {
  const r = await apiSend('POST', '/api/historico', { g, op: 'undo', batch });
  if (!r.ok) await fail(r);
  mem[g] = null; return json(r);
}
export async function restoreBase(g) {
  const r = await apiSend('POST', '/api/historico', { g, op: 'restore' });
  if (!r.ok) await fail(r);
  mem[g] = null; return json(r);
}

// edits of single records: changes = [{ kind: 'prod'|'stop', old, new }]  (new null = delete, old null = add)
export async function editRecords(g, changes) {
  const r = await apiSend('POST', '/api/historico', { g, op: 'edit', changes });
  if (!r.ok) await fail(r);
  mem[g] = null; return json(r);
}

// the standard times table (MATRIZ TEMPO), shared by the team; until someone saves it, the one that came with the app is used
let mxRev = 0, mxLoaded = false;
export const matrixRev = () => mxRev;
export async function loadMatriz({ force = false } = {}) {
  if (mxLoaded && !force) return getMatrix();
  try {
    const r = await apiGet('/api/historico?g=matriz');
    if (r.ok) { const b = await json(r); mxRev = b.rev ?? 0; setMatrix(b.rows); mxLoaded = true; }
  } catch { /* offline: the built-in matrix stays */ }
  return getMatrix();
}
export async function saveMatriz(rows) {
  const r = await apiSend('POST', '/api/historico', { g: 'matriz', op: 'set', rows });
  if (!r.ok) await fail(r);
  const b = await json(r); mxRev = b.rev; setMatrix(b.rows); mxLoaded = true; return getMatrix();
}
