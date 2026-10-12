// GET /api/operadores → { operadores: { "7910": { nome, turno } } }
// The operators table (chapa → name and shift) lives ONLY in the OPERADORES_JSON variable of the Vercel project:
// it is not in the repository. Served only to someone who holds the access code (never when no code is configured).
import { accessRequired, checkAccess } from './_auth.js';

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  if (req.method !== 'GET') return send(res, 405, { error: 'Use GET' });
  if (!accessRequired()) return send(res, 200, { operadores: {} });
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  let operadores = {};
  try { operadores = JSON.parse(process.env.OPERADORES_JSON || '{}'); } catch { /* malformed: no names */ }
  const clean = {};
  for (const [chapa, o] of Object.entries(operadores)) {
    if (/^\d{3,8}$/.test(chapa) && o && typeof o.nome === 'string') clean[chapa] = { nome: o.nome.slice(0, 80), turno: o.turno === '1' || o.turno === '2' ? o.turno : '' };
  }
  return send(res, 200, { operadores: clean });
}
