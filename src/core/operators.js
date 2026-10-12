// Operators (chapa → name and shift). The names are personal data, so they are NEVER part of the code or
// of the repository: the person imports the REFERENCIAS sheet of the control spreadsheet and the table
// stays only in this browser (localStorage). Nothing here is sent to the server or to the AI.
const KEY = 'mt-operators';
let cache = null;

const read = () => { try { return JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null') ?? {}; } catch { return {}; } };
export const getOperators = () => (cache ??= read());
export function setOperators(map) { cache = map; try { globalThis.localStorage?.setItem(KEY, JSON.stringify(map)); } catch { /* private mode */ } }
export function clearOperators() { cache = {}; try { globalThis.localStorage?.removeItem(KEY); } catch { /* ignore */ } }

const title = (s) => String(s ?? '').toLowerCase().replace(/(^|\s)(\p{L})/gu, (m, sp, c) => sp + c.toUpperCase()).replace(/\b(Da|De|Do|Das|Dos|E)\b/g, (w) => w.toLowerCase());

// rows = the REFERENCIAS sheet as an array of arrays → { '7910': { nome, turno: '1' | '2' | '' } }
export function parseOperatorRows(rows) {
  const norm = (v) => String(v ?? '').trim().toLowerCase();
  const hi = rows.findIndex((r) => r.some((c) => norm(c) === 'chapa') && r.some((c) => norm(c) === 'nome'));
  if (hi < 0) return {};
  const head = rows[hi].map(norm);
  const ci = head.indexOf('chapa'), ni = head.indexOf('nome'), ti = head.indexOf('turno');
  const out = {};
  for (const r of rows.slice(hi + 1)) {
    const chapa = String(r[ci] ?? '').replace(/\D/g, '');
    const nome = String(r[ni] ?? '').trim();
    if (!chapa || !nome) continue;
    const t = norm(r[ti]);
    out[chapa] = { nome: title(nome), turno: /dia|diurn/.test(t) ? '1' : /noit|notur/.test(t) ? '2' : '' };
  }
  return out;
}

export const operatorName = (chapa) => getOperators()[String(chapa ?? '').replace(/\D/g, '')]?.nome ?? '';

// "Francisco Denes da Silva (7910) · 4×" for the chapas that show up most; without a table: "chapa 7910 · 4×"
export function whoText(chapas, max = 2) {
  const count = new Map();
  for (const c of chapas) { const k = String(c ?? '').replace(/\D/g, ''); if (k) count.set(k, (count.get(k) ?? 0) + 1); }
  const top = [...count].sort((a, b) => b[1] - a[1]).slice(0, max);
  if (!top.length) return '';
  const multi = chapas.length > 1;
  return top.map(([k, n]) => `${operatorName(k) ? `${operatorName(k)} (${k})` : `chapa ${k}`}${multi && n > 1 ? ` · ${n}×` : ''}`).join(' · ');
}
