// Daily count of readings made from this browser, and the last "quota reached" notice.
// The Gemini API does not report what is left of the free quota, so the remaining count is an
// estimate against a limit the person types in (see aistudio.google.com/usage).
const U = 'mt-usage', L = 'mt-limit', Q = 'mt-quota', A = 'mt-avg';
export const DEFAULT_LIMIT = 250; // guess for the free tier; the person can change it (aistudio.google.com/usage)
const DEFAULT_CALLS_PER_SHEET = 2.5; // pass A + pass B, plus a third reading on some sheets
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const read = (k, fb) => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fb; } catch { return fb; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

export function used() { const u = read(U, null); return u && u.day === today() ? u.n : 0; }
export function bump(n = 1, path = '') {
  write(U, { day: today(), n: used() + n });
  if (path.includes('/api/extract')) { const a = read(A, { calls: 0, sheets: 0 }); write(A, { ...a, calls: a.calls + n }); }
  window.dispatchEvent(new CustomEvent('usage'));
}
// one sheet (a PDF page with production and stops) was read: keeps the average of calls per sheet
export function sheetRead() { const a = read(A, { calls: 0, sheets: 0 }); write(A, { ...a, sheets: a.sheets + 1 }); window.dispatchEvent(new CustomEvent('usage')); }
export function callsPerSheet() { const a = read(A, { calls: 0, sheets: 0 }); return a.sheets >= 5 && a.calls > 0 ? Math.min(4, Math.max(2, a.calls / a.sheets)) : DEFAULT_CALLS_PER_SHEET; }
// Sheets that still fit today (one call is kept for the analysis summary)
export function sheetsLeft() { return Math.max(0, Math.floor((getLimit() - used() - 1) / callsPerSheet())); }
export const getLimit = () => { const v = read(L, null); return v == null ? DEFAULT_LIMIT : Number(v) || 0; };
export function setLimit(n) { write(L, Math.max(0, Math.round(Number(n) || 0))); window.dispatchEvent(new CustomEvent('usage')); }

export function markQuotaHit(msg) { write(Q, { at: new Date().toISOString(), msg }); window.dispatchEvent(new CustomEvent('usage')); }
export function quotaHit() { const q = read(Q, null); return q && Date.now() - new Date(q.at) < 24 * 3600e3 ? q : null; }
export function clearQuota() { write(Q, null); window.dispatchEvent(new CustomEvent('usage')); }

export function usageText() {
  const n = used(), lim = getLimit();
  return lim ? `≈ ${sheetsLeft()} folhas restantes · ${n}/${lim} chamadas` : `Chamadas hoje ${n}`;
}
export function usageHint() {
  const n = used(), lim = getLimit();
  return lim ? `Estimativa neste navegador. Usadas hoje: ${n} de ${lim} chamadas ao Gemini. Cada folha (1 página do PDF com produção e paradas) gasta cerca de ${callsPerSheet().toFixed(1)} chamadas, e o resumo da análise gasta mais 1. O limite real da sua conta está em aistudio.google.com/usage; ajuste o valor em "Listas de conferência".` : 'Informe o limite diário nas configurações para ver quantas folhas ainda cabem.';
}
export const nearLimit = () => { const lim = getLimit(); return lim > 0 && used() >= lim * 0.9; };
