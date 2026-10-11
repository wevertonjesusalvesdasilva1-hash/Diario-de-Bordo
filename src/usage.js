// Daily count of readings made from this browser, and the last "quota reached" notice.
// The Gemini API does not report what is left of the free quota, so the remaining count is an
// estimate against a limit the person types in (see aistudio.google.com/usage).
const U = 'mt-usage', L = 'mt-limit', Q = 'mt-quota';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export function used() { const u = read(U, null); return u && u.day === today() ? u.n : 0; }
export function bump(n = 1) { write(U, { day: today(), n: used() + n }); window.dispatchEvent(new CustomEvent('usage')); }
export const getLimit = () => Number(read(L, 0)) || 0;
export function setLimit(n) { write(L, Math.max(0, Math.round(Number(n) || 0))); window.dispatchEvent(new CustomEvent('usage')); }

export function markQuotaHit(msg) { write(Q, { at: new Date().toISOString(), msg }); window.dispatchEvent(new CustomEvent('usage')); }
export function quotaHit() { const q = read(Q, null); return q && Date.now() - new Date(q.at) < 24 * 3600e3 ? q : null; }
export function clearQuota() { write(Q, null); window.dispatchEvent(new CustomEvent('usage')); }

export function usageText() {
  const n = used(), lim = getLimit();
  return lim ? `Leituras hoje ${n} de ${lim} · restam ${Math.max(0, lim - n)}` : `Leituras hoje ${n}`;
}
export const nearLimit = () => { const lim = getLimit(); return lim > 0 && used() >= lim * 0.9; };
