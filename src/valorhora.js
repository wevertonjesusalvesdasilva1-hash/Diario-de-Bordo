// The hourly cost of a stopped robot / machine (R$ per hour). One value for RAW and one for usinagem, saved only in this browser.
const KEY = 'mt-valorhora';
const read = () => { try { return { raw: '', usi: '', ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { raw: '', usi: '' }; } };
export const getValorText = (g) => String(read()[g] ?? '');
export const getValor = (g) => Number(getValorText(g).replace(',', '.')) || 0;
export const setValor = (g, text) => { const all = read(); all[g] = String(text ?? ''); try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* no storage */ } };
