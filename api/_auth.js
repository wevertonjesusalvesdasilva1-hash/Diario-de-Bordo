// Optional access code. When ACCESS_CODE is set in the Vercel project, every API call must carry it
// (header x-access-code). Without the variable the app stays open, as before.
import { createHash, timingSafeEqual } from 'node:crypto';

const fails = new Map();
const digest = (s) => createHash('sha256').update(String(s)).digest();

export const accessRequired = () => !!process.env.ACCESS_CODE;

export function checkAccess(req, supplied = req.headers['x-access-code']) {
  const need = process.env.ACCESS_CODE;
  if (!need) return { ok: true };
  const ip = String(req.headers['x-forwarded-for'] ?? 'x').split(',')[0].trim();
  const now = Date.now();
  const recent = (fails.get(ip) ?? []).filter((t) => now - t < 600_000);
  if (recent.length >= 10) return { ok: false, status: 429, error: 'Muitas tentativas. Aguarde alguns minutos.' };
  if (timingSafeEqual(digest(supplied ?? ''), digest(need))) return { ok: true };
  recent.push(now);
  fails.set(ip, recent);
  return { ok: false, status: 401, error: 'Código de acesso inválido' };
}
