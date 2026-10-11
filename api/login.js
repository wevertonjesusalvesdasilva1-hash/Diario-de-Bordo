// GET  /api/login            → { required: boolean }
// POST /api/login { code }   → 200 { ok: true } or 401
import { accessRequired, checkAccess } from './_auth.js';

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  if (req.method === 'GET') return send(res, 200, { required: accessRequired() });
  if (req.method !== 'POST') return send(res, 405, { error: 'Use GET ou POST' });
  const auth = checkAccess(req, req.body?.code);
  if (!auth.ok) { await new Promise((r) => setTimeout(r, 400)); return send(res, auth.status, { error: auth.error }); }
  return send(res, 200, { ok: true });
}
