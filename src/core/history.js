// The history ("base de dados"): every validated sheet becomes records, the same ones the Excel control files keep
// (tabela de PRODUÇÃO and tabela de PARADAS). The BI pages read them. Pure functions; no DOM, no network.
import { PADRAO } from '../data/padrao.js';
import { aliasKey } from './lists.js';
import { normMachine } from './rows.js';

// ---- time helpers (minutes, so the sums are exact: MOD(fim − início, 1) × 24 of the spreadsheet)
export const toMin = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { if (!(v >= 0)) return null; return Math.round((v % 1) * 1440) % 1440; } // Excel time = fraction of a day
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v).trim());
  return m ? (+m[1] * 60 + +m[2]) % 1440 : null;
};
export const fmtHM = (min) => (min == null ? '' : `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
// hours between two clock times, crossing midnight (MOD(fim − início, 1) × 24); null when one of them is missing
export function spanHours(ini, fim) {
  const a = toMin(ini), b = toMin(fim);
  return a == null || b == null ? null : (((b - a) % 1440) + 1440) % 1440 / 60;
}
// hours of a production record: the three turn columns added (Q + R + S) × 24
export const prodHours = (r) => [spanHours(r.i1, r.f1), spanHours(r.i2, r.f2), spanHours(r.i3, r.f3)].reduce((s, x) => s + (x ?? 0), 0);

// ---- dates: 'dd/mm/yyyy' (the app) or an Excel serial / ISO string → 'YYYY-MM-DD'
export function isoDate(v) {
  if (v == null || v === '') return '';
  if (typeof v === 'number') { const d = new Date(Math.round((v - 25569) * 86400000)); return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10); }
  const s = String(v).trim();
  let m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}
export const dmy = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// ---- text normalisation (the control spreadsheets carry stray spaces: 'TROCA DE PEÇA ' is 'TROCA DE PEÇA')
const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const chap = (v) => { const s = clean(v); return /^\d+(\.0+)?$/.test(s) ? s.replace(/\.0+$/, '') : s; };
const tnum = (v) => { const n = Number(clean(v)); return n === 1 || n === 2 || n === 3 ? n : null; };
export const groupOfMachine = (m) => (/^(UMC|HMC|NCBZ)/.test(m ?? '') ? 'usi' : 'raw');

// ---- standard time (hours) by machine + piece + model, from the MATRIZ TEMPO
const STD = new Map(PADRAO.map(([m, p, mo, h]) => [`${aliasKey(m)}|${aliasKey(p)}|${aliasKey(mo)}`, h]));
export const standardHours = (machine, peca, modelo) => STD.get(`${aliasKey(machine)}|${aliasKey(peca)}|${aliasKey(modelo)}`) ?? 0;

// ---- records. production: { m, d, p, o, c1, i1, f1, c2, i2, f2, c3, i3, f3, t, ob, h, tp }
//               stop:       { m, d, c, i, f, t, mo, ds, h }          (+ b: the batch that brought it)
export function prodRecord(x) {
  const r = { m: normMachine(x.m) || clean(x.m), d: isoDate(x.d), p: clean(x.p), o: clean(x.o),
    c1: chap(x.c1), i1: fmtHM(toMin(x.i1)), f1: fmtHM(toMin(x.f1)), c2: chap(x.c2), i2: fmtHM(toMin(x.i2)), f2: fmtHM(toMin(x.f2)), c3: chap(x.c3), i3: fmtHM(toMin(x.i3)), f3: fmtHM(toMin(x.f3)),
    t: tnum(x.t), ob: clean(x.ob) };
  r.h = typeof x.h === 'number' && Number.isFinite(x.h) ? x.h : prodHours(r);
  r.tp = typeof x.tp === 'number' && Number.isFinite(x.tp) ? x.tp : standardHours(r.m, r.p, r.o);
  return r;
}
export function stopRecord(x) {
  const r = { m: normMachine(x.m) || clean(x.m), d: isoDate(x.d), c: chap(x.c), i: fmtHM(toMin(x.i)), f: fmtHM(toMin(x.f)), t: tnum(x.t), mo: clean(x.mo), ds: clean(x.ds) };
  r.h = typeof x.h === 'number' && Number.isFinite(x.h) ? x.h : (spanHours(r.i, r.f) ?? 0);
  return r;
}
export const prodKey = (r) => ['P', r.m, r.d, r.p, r.o, r.c1, r.i1, r.f1, r.c2, r.i2, r.f2, r.c3, r.i3, r.f3].join('|');
export const stopKey = (r) => ['S', r.m, r.d, r.c, r.i, r.f, r.t ?? '', r.mo].join('|');

// the validated sheets of the app → records for the base. Rows that cannot be a record (no machine, no date, nothing timed) are listed.
export function recordsFromPages(pages) {
  const prod = [], stops = [], skipped = [];
  for (const p of pages) {
    const machine = p.machine;
    if (!machine) { skipped.push({ page: p.label, why: 'sem máquina' }); continue; }
    for (const r of p.prod ?? []) {
      const rec = prodRecord({ m: machine, d: r.data || p.date, p: r.peca, o: r.modelo, c1: r.chapa1, i1: r.ini1, f1: r.fim1, c2: r.chapa2, i2: r.ini2, f2: r.fim2, c3: r.chapa3, i3: r.ini3, f3: r.fim3, t: r.turno, ob: r.obs });
      if (!rec.d || !(rec.i1 || rec.i2 || rec.i3)) { if (rec.i1 || rec.p) skipped.push({ page: p.label, why: `produção da linha ${r.linha || '?'} sem data ou horário` }); continue; }
      prod.push(rec);
    }
    for (const r of p.stops ?? []) {
      const rec = stopRecord({ m: machine, d: r.data || p.date, c: r.chapa, i: r.ini, f: r.fim, t: r.turno, mo: r.motivo, ds: r.desc });
      if (!rec.d || !rec.i || !rec.f) { if (rec.i || rec.f || rec.mo) skipped.push({ page: p.label, why: `parada da linha ${r.linha || '?'} sem data ou horário` }); continue; }
      stops.push(rec);
    }
  }
  return { prod, stops, skipped };
}

// merge new records into the ones already in the base: nothing is ever counted twice (same key = same record)
export function mergeRecords(existing, incoming, batch) {
  // identical rows repeated inside the incoming list are kept; only copies already in `existing` are skipped
  const pick = (rows, old, kf) => {
    const have = new Map(); for (const r of old) { const k = kf(r); have.set(k, (have.get(k) || 0) + 1); }
    const add = [], seen = new Map(); let dup = 0;
    for (const r of rows) { const k = kf(r), n = (seen.get(k) || 0) + 1; seen.set(k, n); if (n <= (have.get(k) || 0)) { dup++; continue; } add.push(batch ? { ...r, b: batch } : r); }
    return [add, dup];
  };
  const [addP, dupP] = pick(incoming.prod, existing.prod, prodKey), [addS, dupS] = pick(incoming.stops, existing.stops, stopKey);
  return { prod: [...existing.prod, ...addP], stops: [...existing.stops, ...addS], added: { prod: addP.length, stops: addS.length }, dup: { prod: dupP, stops: dupS } };
}

// ---- reading the control workbook (.xlsx) that holds the history: sheets PRODUÇÃO and PARADAS
// XLSX is passed in (the app loads it lazily; the tests use the same library).
const colName = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export function parseHistoryWorkbook(XLSX, data) {
  const wb = XLSX.read(data, { type: 'array', cellDates: false });
  const names = Object.fromEntries(wb.SheetNames.map((n) => [colName(n), n]));
  const rows = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
  const warnings = [];
  if (!names.PRODUCAO || !names.PARADAS) throw new Error('Não achei as abas PRODUÇÃO e PARADAS neste arquivo.');

  // production: headers on the second row; the three turn blocks sit in fixed positions
  const P = rows(names.PRODUCAO), ph = (P[1] ?? []).map(colName);
  const mIdx = ph.findIndex((h) => h === 'ROBO' || h === 'MAQUINA');
  if (mIdx < 0 || ph[mIdx + 1] !== 'DATA') throw new Error('A aba PRODUÇÃO não tem as colunas ROBÔ/MAQUINA e DATA na segunda linha.');
  const group = ph[mIdx] === 'MAQUINA' ? 'usi' : 'raw';
  const at = (name, from = 0) => ph.indexOf(name, from);
  const col = { cod: at('COD'), m: mIdx, d: mIdx + 1, p: at('PECA'), o: at('MODELO'), c1: at('CHAPA'), i1: at('INICIO'), f1: at('FIM'), c2: at('CHAPA2'), i2: at('INICIO', at('CHAPA2')), f2: at('FIM', at('CHAPA2')),
    c3: at('CHAPA3'), i3: at('INCIO'), f3: at('FIM2'), t: at('TURNOQUEFINALIZOU'), ob: at('OBSERVACOES'), h: at('TEMPO/DEC') >= 0 ? at('TEMPO/DEC') : ph.findIndex((x) => x.startsWith('TEMPODEC')), tp: at('TEMPOPADRAOBAAN') };
  const need = ['cod', 'p', 'o', 'c1', 'i1', 'f1', 'c2', 'i2', 'f2', 'c3', 'i3', 'f3', 't'];
  if (need.some((k) => col[k] < 0)) throw new Error(`Faltam colunas na aba PRODUÇÃO: ${need.filter((k) => col[k] < 0).join(', ')}.`);
  const prod = []; let hDiff = 0, hChecked = 0;
  for (let r = 2; r < P.length; r++) {
    const row = P[r];
    if (!row || row[col.cod] == null || clean(row[col.cod]) === '' || String(row[col.cod]).startsWith('#')) continue;
    const m = normMachine(row[col.m]); if (!m) continue;
    const cached = col.h >= 0 && typeof row[col.h] === 'number' ? row[col.h] : null;
    const rec = prodRecord({ m, d: row[col.d], p: row[col.p], o: row[col.o], c1: row[col.c1], i1: row[col.i1], f1: row[col.f1], c2: row[col.c2], i2: row[col.i2], f2: row[col.f2], c3: row[col.c3], i3: row[col.i3], f3: row[col.f3],
      t: row[col.t], ob: col.ob >= 0 ? row[col.ob] : '', tp: col.tp >= 0 && typeof row[col.tp] === 'number' ? row[col.tp] : undefined });
    if (!rec.d) continue;
    if (cached != null) { hChecked++; if (Math.abs(cached - prodHours(rec)) > 0.0105) hDiff++; rec.h = cached; } // the spreadsheet's own number is what the BI used
    prod.push(rec);
  }
  if (hDiff) warnings.push(`${hDiff} de ${hChecked} linhas de produção têm TEMPO/DEC diferente da soma dos horários (mantive o valor da planilha).`);

  // stops: headers on the first row
  const S = rows(names.PARADAS), sh = (S[0] ?? []).map(colName);
  const sc = { m: sh.findIndex((h) => h === 'ROBO' || h === 'MAQUINA'), d: sh.indexOf('DATA'), c: sh.indexOf('CHAPA'), i: sh.indexOf('INICIO'), f: sh.indexOf('FINAL'), t: sh.indexOf('TURNO'), mo: sh.indexOf('MOTIVODAPARADA'), ds: sh.indexOf('DESCRICAODAPARADA'), h: sh.indexOf('TEMPO/DEC') };
  const sneed = ['m', 'd', 'c', 'i', 'f', 't', 'mo'];
  if (sneed.some((k) => sc[k] < 0)) throw new Error(`Faltam colunas na aba PARADAS: ${sneed.filter((k) => sc[k] < 0).join(', ')}.`);
  const stops = []; let sDiff = 0, sChecked = 0;
  for (let r = 1; r < S.length; r++) {
    const row = S[r];
    if (!row) continue;
    const raw = clean(row[sc.m]); if (!raw || /^TOTAL$/i.test(raw)) continue;
    const m = normMachine(raw); if (!m) continue;
    if (row[sc.i] == null || row[sc.f] == null) continue;
    const cached = sc.h >= 0 && typeof row[sc.h] === 'number' ? row[sc.h] : null;
    const rec = stopRecord({ m, d: row[sc.d], c: row[sc.c], i: row[sc.i], f: row[sc.f], t: row[sc.t], mo: row[sc.mo], ds: sc.ds >= 0 ? row[sc.ds] : '' });
    if (!rec.d) continue;
    if (cached != null) { sChecked++; if (Math.abs(cached - rec.h) > 0.0105) sDiff++; rec.h = cached; }
    stops.push(rec);
  }
  if (sDiff) warnings.push(`${sDiff} de ${sChecked} paradas têm TEMPO/DEC diferente do cálculo pelos horários (mantive o valor da planilha).`);
  return { group, prod, stops, warnings };
}

// ---- audit: a machine cannot run more than 24 h in a day. Production hours + stop hours of one machine and date are added up;
// the clock intervals are also compared, because a stop typed over a production period is counted twice.
const segsOf = (i, f) => { const a = toMin(i), b = toMin(f); if (a == null || b == null) return []; return b >= a ? [[a, b]] : [[a, 1440], [0, b]]; };
const unionLen = (arr) => { const a = arr.map((x) => [...x]).sort((x, y) => x[0] - y[0]); let tot = 0, cur = null; for (const sg of a) { if (cur && sg[0] <= cur[1]) cur[1] = Math.max(cur[1], sg[1]); else { if (cur) tot += cur[1] - cur[0]; cur = [...sg]; } } return tot + (cur ? cur[1] - cur[0] : 0); };
export const DAY_HOURS = 24;
// keep(record) → whether a record takes part (default: all). Returns the machine-days over 24 h, biggest first.
export function auditDays(prod, stops, keep = () => true) {
  const days = new Map();
  const get = (m, d) => { const k = `${d}|${m}`; if (!days.has(k)) days.set(k, { m, d, ph: 0, sh: 0, np: 0, ns: 0, P: [], S: [] }); return days.get(k); };
  for (const r of prod) { if (!keep(r)) continue; const x = get(r.m, r.d); x.ph += Number(r.h) || 0; x.np++; x.P.push(...segsOf(r.i1, r.f1), ...segsOf(r.i2, r.f2), ...segsOf(r.i3, r.f3)); }
  for (const r of stops) { if (!keep(r)) continue; const x = get(r.m, r.d); x.sh += Number(r.h) || 0; x.ns++; x.S.push(...segsOf(r.i, r.f)); }
  const out = [];
  for (const x of days.values()) {
    const tot = x.ph + x.sh;
    if (tot <= DAY_HOURS + 1e-4) continue;
    const overlapH = (unionLen(x.P) + unionLen(x.S) - unionLen([...x.P, ...x.S])) / 60, why = [];
    if (x.ph > DAY_HOURS + 1e-4) why.push('só a produção passa de 24 h');
    if (x.sh > DAY_HOURS + 1e-4) why.push('só as paradas passam de 24 h');
    if (overlapH > 0.01) why.push(`${overlapH.toFixed(1).replace('.', ',')} h de produção e parada no mesmo horário (contadas duas vezes)`);
    if (!why.length) why.push('a soma passa de 24 h');
    out.push({ m: x.m, d: x.d, ph: x.ph, sh: x.sh, tot, overlapH, np: x.np, ns: x.ns, why: why.join('; ') });
  }
  return out.sort((a, b) => b.tot - a.tot);
}
