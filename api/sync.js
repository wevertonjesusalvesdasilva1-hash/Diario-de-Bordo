// Shared room: everyone who holds the access code sees the same reading, live.
//   GET  /api/sync?rev=N        → { rev } when nothing changed, or { rev, state }
//   PUT  /api/sync              → body { baseRev, state }; 409 + the current state when someone else saved first
//   GET  /api/sync?asset=ID.sheet|ID.strips        PUT /api/sync?asset=…   → the heavy images of one sheet
// State and images live in a private Vercel Blob store (variable BLOB_READ_WRITE_TOKEN); without it the
// function answers 503 and the app simply works alone, as before.
import { getStore, useStore } from './_store.js';
import { accessRequired, checkAccess } from './_auth.js';

const STATE = 'sala/estado.json';
const ASSET = /^[a-z0-9]{6,24}\.(sheet|strips)$/;
const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);

export { useStore };
const store = new Proxy({}, { get: (_, k) => getStore()[k] });

async function readState() {
  const text = await store.read(STATE);
  if (!text) return { rev: 0, state: null };
  try { return JSON.parse(text); } catch { return { rev: 0, state: null }; }
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  if (!accessRequired()) return send(res, 403, { error: 'A sincronização exige um código de acesso configurado' });
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  if (!store.ok()) return send(res, 503, { error: 'Sincronização não configurada no servidor' });
  const q = req.query ?? {};
  try {
    if (q.asset !== undefined) {
      if (!ASSET.test(q.asset)) return send(res, 400, { error: 'Imagem inválida' });
      const path = `sala/a/${q.asset}`;
      if (req.method === 'GET') { const t = await store.read(path); return t ? res.status(200).setHeader('Cache-Control', 'private, max-age=3600').setHeader('Content-Type', 'application/json').send(t) : send(res, 404, { error: 'Sem imagem' }); }
      if (req.method === 'PUT') { await store.write(path, JSON.stringify(req.body ?? {})); return send(res, 200, { ok: true }); }
      return send(res, 405, { error: 'Método não permitido' });
    }
    if (req.method === 'GET') {
      const cur = await readState();
      if (Number(q.rev) === cur.rev && cur.rev > 0) return send(res, 200, { rev: cur.rev });
      return send(res, 200, cur);
    }
    if (req.method === 'PUT') {
      const { baseRev, state } = req.body ?? {};
      if (!state || typeof state !== 'object' || !Array.isArray(state.pages)) return send(res, 400, { error: 'Estado inválido' });
      const cur = await readState();
      // an empty room has nothing to protect: whoever saves first fills it, whatever revision they knew
      if (Number(baseRev) !== cur.rev && (cur.state?.pages?.length ?? 0) > 0) return send(res, 409, cur);
      const next = { rev: cur.rev + 1, state, at: new Date().toISOString() };
      await store.write(STATE, JSON.stringify(next));
      store.prune?.(new Set(state.pages.map((p) => p.sid).filter(Boolean))).catch(() => {});
      return send(res, 200, { rev: next.rev });
    }
    return send(res, 405, { error: 'Método não permitido' });
  } catch (e) {
    return send(res, 500, { error: `Falha na sincronização: ${String(e.message).slice(0, 120)}` });
  }
}
