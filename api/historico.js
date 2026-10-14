// The history ("base de dados"): the validated production and stops of RAW and of usinagem, kept in the private Blob.
//   GET  /api/historico?g=raw|usi[&rev=N]    → { rev, prod, stops, batches } (or just { rev } when nothing changed)
//   POST /api/historico  { g, op: 'append', batch, label, prod, stops }   adds records (the same record never goes in twice)
//        /api/historico  { g, op: 'replace', batch, label, prod, stops }  first chunk of a full import: keeps a copy of the old base
//        /api/historico  { g, op: 'undo', batch }                          removes everything a batch brought (a mistaken submission)
//        /api/historico  { g, op: 'restore' }                              brings back the copy made before the last 'replace'
//        /api/historico  { g, op: 'edit', changes: [{ kind: 'prod'|'stop', old, new }] }  edits (old+new), deletes (new null) or adds (old null) single records
//   g = 'matriz': the standard times table  GET → { rev, rows: [[machine, piece, model, hours]] };  POST { g: 'matriz', op: 'set', rows }
// Needs the access code like every other API; without storage (BLOB_READ_WRITE_TOKEN) it answers 503.
import { getStore } from './_store.js';
import { accessRequired, checkAccess } from './_auth.js';

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
const store = new Proxy({}, { get: (_, k) => getStore()[k] });
const path = (g) => `historico/${g}.json`;
const MAX_PER_CALL = 3000;
const MACHINES = { raw: /^RAW\d{2}$/, usi: /^(UMC 0[12]|HMC \d{2}|NCBZ)$/ };

// same keys as src/core/history.js (functions do not import from src/)
const prodKey = (r) => ['P', r.m, r.d, r.p, r.o, r.c1, r.i1, r.f1, r.c2, r.i2, r.f2, r.c3, r.i3, r.f3].join('|');
const stopKey = (r) => ['S', r.m, r.d, r.c, r.i, r.f, r.t ?? '', r.mo].join('|');

const str = (v, n = 160) => (typeof v === 'string' ? v.slice(0, n) : '');
const hm = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : '');
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v < 1000 ? v : 0);
function cleanProd(g, r) {
  if (!r || typeof r !== 'object' || !MACHINES[g].test(r.m) || !/^\d{4}-\d{2}-\d{2}$/.test(r.d)) return null;
  const t = r.t === 1 || r.t === 2 || r.t === 3 ? r.t : null;
  return { m: r.m, d: r.d, p: str(r.p), o: str(r.o), c1: str(r.c1, 12), i1: hm(r.i1), f1: hm(r.f1), c2: str(r.c2, 12), i2: hm(r.i2), f2: hm(r.f2), c3: str(r.c3, 12), i3: hm(r.i3), f3: hm(r.f3), t, ob: str(r.ob, 300), h: num(r.h), tp: num(r.tp) };
}
function cleanStop(g, r) {
  if (!r || typeof r !== 'object' || !MACHINES[g].test(r.m) || !/^\d{4}-\d{2}-\d{2}$/.test(r.d) || !hm(r.i) || !hm(r.f)) return null;
  const t = r.t === 1 || r.t === 2 || r.t === 3 ? r.t : null;
  return { m: r.m, d: r.d, c: str(r.c, 12), i: r.i, f: r.f, t, mo: str(r.mo), ds: str(r.ds, 300), h: num(r.h) };
}

const sameRec = (a, b) => Object.keys(a).every((k) => k === 'b' || (a[k] ?? '') === (b[k] ?? ''));
// matriz (standard times): one small list shared by the whole team
async function matriz(req, res, body) {
  const file = 'historico/matriz.json';
  const text = await store.read(file);
  let cur = { rev: 0, rows: null };
  try { if (text) cur = JSON.parse(text); } catch { /* empty */ }
  if (req.method === 'GET') return send(res, 200, cur);
  if (body.op !== 'set' || !Array.isArray(body.rows) || body.rows.length > 5000) return send(res, 400, { error: 'Operação inválida' });
  const rows = body.rows.map((r) => [str(r[0], 30), str(r[1], 80), str(r[2], 80), Math.max(0, Math.min(999, Number(r[3]) || 0))]).filter((r) => r[0] && r[1]);
  await store.write(file, JSON.stringify({ rev: (cur.rev ?? 0) + 1, rows, at: new Date().toISOString() }));
  return send(res, 200, { rev: (cur.rev ?? 0) + 1, rows });
}
async function read(g) {
  const text = await store.read(path(g));
  if (!text) return { rev: 0, prod: [], stops: [], batches: [] };
  try { const d = JSON.parse(text); return { rev: d.rev ?? 0, prod: d.prod ?? [], stops: d.stops ?? [], batches: d.batches ?? [] }; } catch { return { rev: 0, prod: [], stops: [], batches: [] }; }
}
const write = (g, d) => store.write(path(g), JSON.stringify({ ...d, rev: d.rev + 1, at: new Date().toISOString() }));

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  if (!accessRequired()) return send(res, 403, { error: 'O histórico exige um código de acesso configurado' });
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  if (!store.ok()) return send(res, 503, { error: 'Armazenamento não configurado no servidor' });
  const q = req.query ?? {}, body = req.body ?? {};
  const g = req.method === 'GET' ? q.g : body.g;
  if (g === 'matriz') { try { return await matriz(req, res, body); } catch (e) { return send(res, 500, { error: `Falha na matriz: ${String(e.message).slice(0, 120)}` }); } }
  if (g !== 'raw' && g !== 'usi') return send(res, 400, { error: 'Grupo inválido (use raw ou usi)' });
  try {
    if (req.method === 'GET') {
      const cur = await read(g);
      if (Number(q.rev) === cur.rev && cur.rev > 0) return send(res, 200, { rev: cur.rev });
      return send(res, 200, cur);
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
    const cur = await read(g);
    const { op } = body;
    if (op === 'undo') {
      const b = str(body.batch, 40);
      const prod = cur.prod.filter((r) => r.b !== b), stops = cur.stops.filter((r) => r.b !== b);
      const removed = { prod: cur.prod.length - prod.length, stops: cur.stops.length - stops.length };
      if (!removed.prod && !removed.stops) return send(res, 404, { error: 'Esse envio não está mais na base' });
      const next = { ...cur, prod, stops, batches: cur.batches.filter((x) => x.id !== b) };
      await write(g, next);
      return send(res, 200, { rev: cur.rev + 1, removed });
    }
    if (op === 'restore') {
      const text = await store.read(`historico/${g}.bak.json`);
      if (!text) return send(res, 404, { error: 'Não há cópia anterior para restaurar' });
      const bak = JSON.parse(text);
      await write(g, { ...bak, rev: cur.rev });
      return send(res, 200, { rev: cur.rev + 1, prod: bak.prod.length, stops: bak.stops.length });
    }
    if (op === 'edit') {
      const ch = Array.isArray(body.changes) ? body.changes : [];
      if (!ch.length || ch.length > 500) return send(res, 400, { error: 'Envie de 1 a 500 alterações' });
      const prod = [...cur.prod], stops = [...cur.stops], done = { edit: 0, del: 0, add: 0, miss: 0 };
      const batch = `ed${Date.now().toString(36)}`;
      for (const c of ch) {
        const isP = c?.kind === 'prod';
        if (!isP && c?.kind !== 'stop') { done.miss++; continue; }
        const list = isP ? prod : stops, clean = isP ? cleanProd : cleanStop;
        const nw = c.new ? clean(g, c.new) : null;
        if (c.new && !nw) { done.miss++; continue; }
        if (!c.old) { if (nw) { list.push({ ...nw, b: batch }); done.add++; } continue; }
        const idx = list.findIndex((r) => sameRec(c.old, r));
        if (idx < 0) { done.miss++; continue; }
        if (!nw) { list.splice(idx, 1); done.del++; } else { list[idx] = { ...nw, b: list[idx].b }; done.edit++; }
      }
      if (done.edit + done.del + done.add) await write(g, { ...cur, prod, stops });
      return send(res, 200, { rev: cur.rev + 1, ...done });
    }
    if (op !== 'append' && op !== 'replace') return send(res, 400, { error: 'Operação inválida' });
    const inP = Array.isArray(body.prod) ? body.prod : [], inS = Array.isArray(body.stops) ? body.stops : [];
    if (inP.length > MAX_PER_CALL || inS.length > MAX_PER_CALL) return send(res, 413, { error: `No máximo ${MAX_PER_CALL} registros por envio` });
    const batch = str(body.batch, 40) || `b${Date.now().toString(36)}`;
    const prodNew = inP.map((r) => cleanProd(g, r)), stopsNew = inS.map((r) => cleanStop(g, r));
    const invalid = prodNew.filter((r) => !r).length + stopsNew.filter((r) => !r).length;
    let base = cur;
    if (op === 'replace') {
      if (body.confirm !== true) return send(res, 400, { error: 'Para substituir toda a base é preciso confirmar' });
      await store.write(`historico/${g}.bak.json`, JSON.stringify({ prod: cur.prod, stops: cur.stops, batches: cur.batches }));
      base = { ...cur, prod: [], stops: [], batches: [] };
    }
    // identical rows are kept when they repeat inside the same envio; only copies already in the base (from other envios) are skipped
    const have = (rows, kf) => { const m = new Map(); for (const r of rows) if (r.b !== batch) { const k = kf(r); m.set(k, (m.get(k) || 0) + 1); } return m; };
    const pick = (rows, kf, m) => { const add = [], seen = new Map(); let dup = 0; for (const r of rows) { if (!r) continue; const k = kf(r), n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n <= (m.get(k) || 0)) { dup++; continue; } add.push({ ...r, b: batch }); } return [add, dup]; };
    const [addP, dupP] = pick(prodNew, prodKey, have(base.prod, prodKey)), [addS, dupS] = pick(stopsNew, stopKey, have(base.stops, stopKey));
    const existing = base.batches.find((x) => x.id === batch);
    const batches = existing
      ? base.batches.map((x) => (x.id === batch ? { ...x, nProd: x.nProd + addP.length, nStops: x.nStops + addS.length } : x))
      : [...base.batches, { id: batch, at: new Date().toISOString(), label: str(body.label, 120) || 'Envio', nProd: addP.length, nStops: addS.length }];
    const next = { ...base, prod: [...base.prod, ...addP], stops: [...base.stops, ...addS], batches: batches.slice(-200) };
    await write(g, { ...next, rev: cur.rev });
    return send(res, 200, { rev: cur.rev + 1, batch, added: { prod: addP.length, stops: addS.length }, dup: { prod: dupP, stops: dupS }, invalid, total: { prod: next.prod.length, stops: next.stops.length } });
  } catch (e) {
    return send(res, 500, { error: `Falha no histórico: ${String(e.message).slice(0, 120)}` });
  }
}
