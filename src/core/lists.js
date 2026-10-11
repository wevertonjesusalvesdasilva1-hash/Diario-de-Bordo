// Lists the sheet is checked against (chapas, peças, modelos) — one set for RAW (solda) and one for
// usinagem (UMC, HMC, NCBZ) — plus corrections the user has taught the app. Stored in the browser.
import { CHAPAS, PECAS, MODELOS, CHAPAS_USI, PECAS_USI, MODELOS_USI } from '../data/vocab.js';

const KEY = 'diario-listas-v2';
const OLD_KEY = 'diario-listas-v1';
let cache = null;
let active = 'raw';

export const GROUPS = { raw: 'RAW (solda)', usi: 'Usinagem' };
export const groupOf = (machine) => (/^(UMC|HMC|NCBZ)/.test(machine ?? '') ? 'usi' : 'raw');

const defaults = () => ({
  raw: { chapas: [...CHAPAS], pecas: [...PECAS], modelos: [...MODELOS] },
  usi: { chapas: [...CHAPAS_USI], pecas: [...PECAS_USI], modelos: [...MODELOS_USI] },
});

function load() {
  const d = defaults();
  let saved = null;
  try { saved = JSON.parse(globalThis.localStorage?.getItem(KEY) || 'null'); } catch { /* ignore */ }
  if (!saved) {
    // first run after the upgrade: whatever was saved before was for RAW
    try {
      const old = JSON.parse(globalThis.localStorage?.getItem(OLD_KEY) || 'null');
      if (old) saved = { raw: { chapas: old.chapas, pecas: old.pecas, modelos: old.modelos }, aliases: old.aliases };
    } catch { /* ignore */ }
  }
  const pick = (g) => ({ ...d[g], ...Object.fromEntries(Object.entries(saved?.[g] ?? {}).filter(([, v]) => Array.isArray(v))) });
  return { raw: pick('raw'), usi: pick('usi'), aliases: { chapa: {}, peca: {}, modelo: {}, ...(saved?.aliases ?? {}) } };
}
const all = () => (cache ??= load());
const persist = () => { try { globalThis.localStorage?.setItem(KEY, JSON.stringify(cache)); } catch { /* ignore */ } };

// The group being read right now (set while a sheet is processed); the normalisers use its lists.
export function setActiveGroup(g) { active = g === 'usi' ? 'usi' : 'raw'; }
export const getActiveGroup = () => active;

export function getLists(group = active) {
  const a = all();
  return { ...a[group === 'usi' ? 'usi' : 'raw'], aliases: a.aliases };
}

export function saveGroupLists(group, patch) {
  const a = all();
  a[group] = { ...a[group], ...patch };
  persist();
}
export function saveAliases(aliases) { all().aliases = aliases; persist(); }

export const aliasKey = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function lookupAlias(field, raw) {
  const v = all().aliases[field]?.[aliasKey(raw)];
  return v ?? null;
}

// Remember "what the model read" → "what the person says it is".
export function learnAlias(field, raw, value) {
  const k = aliasKey(raw);
  if (!k || !value || aliasKey(value) === k) return;
  const a = all();
  a.aliases = { ...a.aliases, [field]: { ...a.aliases[field], [k]: value } };
  persist();
}

export function resetLists(group) {
  const a = all();
  if (group) a[group] = defaults()[group]; else { cache = null; try { globalThis.localStorage?.removeItem(KEY); } catch { /* ignore */ } }
  if (group) persist();
}
