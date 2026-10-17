// "Turno sem anotação": in a working day every machine writes down production and stops in each shift it runs. When a shift has
// nothing in the base (or in the sheets just read) the sheet of that shift may simply not have been digitised. The card says WHICH
// machine, WHICH day and WHICH shift, and what is missing: production, stops, or both (two faces).
//
// Precision over volume: only business days (Mon–Fri) of the last days are judged; only the shifts a machine really runs (learned from its own
// history); a shift whose stops cover most of its length is a machine that was stopped, not a missing sheet; and with no history at all
// nothing is said. The person can mark a card as correct (a holiday, a machine without a shift) and it stays hidden. Pure functions.
import { toMin, pairsOf, groupOfMachine } from './history.js';
import { shiftOfTime } from './turno.js';
import { isWorkingDay } from './holidays.js';

export const GAP_KIND = 'turno sem anotação';
export const GAP_COLOR = '#e8b923';                       // gold
export const TURNOS = {
  1: { name: 'turno do dia', range: '07:30 às 17:30', hours: 10 },
  2: { name: 'turno da noite', range: '20:40 às 05:30', hours: 8.83 },
};
export const WINDOW_DAYS = 14;                            // days looked at, ending yesterday
const LOOKBACK_DAYS = 45, MIN_SHARE = 0.4, MIN_DAYS = 3;  // a machine "runs" a shift when it has records in ≥ 40 % of the working days
const STOPPED_SHARE = 0.5;                                // stops over half of the shift = the machine was stopped (explained)
const WEEK = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const utcDay = (iso) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const isoOf = (day) => new Date(day * 86400000).toISOString().slice(0, 10);
export const isBusinessDay = isWorkingDay;   // Monday to Friday, national holidays out
export const weekdayOf = (iso) => WEEK[new Date(`${iso}T12:00:00Z`).getUTCDay()];
export const ddmm = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const localIso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const shiftAt = (hm) => shiftOfTime(toMin(hm))?.shift ?? null;

// the shifts a production record touches: by the start time of each stretch (after midnight = the night of the same sheet) and the shift that finished it
const prodShifts = (r) => {
  const s = new Set();
  for (const [i] of pairsOf(r)) { const x = shiftAt(i); if (x) s.add(x); }
  if (r.t === 1 || r.t === 2) s.add(String(r.t));
  return s;
};
const stopShift = (r) => (r.t === 1 || r.t === 2 ? String(r.t) : shiftAt(r.i));

// machine + day → which shifts have production / stops, and how many hours of stops each shift has
function coverage(prod, stops) {
  const cov = new Map();
  const at = (m, d) => { const k = `${m}|${d}`; if (!cov.has(k)) cov.set(k, { m, d, p: new Set(), s: new Set(), sh: { 1: 0, 2: 0 } }); return cov.get(k); };
  for (const r of prod) { if (r.m && r.d) for (const t of prodShifts(r)) at(r.m, r.d).p.add(t); }
  for (const r of stops) { if (!r.m || !r.d) continue; const t = stopShift(r); const c = at(r.m, r.d); if (t) { c.s.add(t); c.sh[t] += Number(r.h) || 0; } }
  return cov;
}

// "no turno da noite" · "nos turnos do dia e da noite" (with the hours when asked)
const NAME = { 1: 'do dia', 2: 'da noite' };
export const inTurnos = (list, ranges = false) => {
  const part = (t) => `${NAME[t]}${ranges ? ` (${TURNOS[t].range})` : ''}`;
  return list.length > 1 ? `nos turnos ${list.map(part).join(' e ')}` : `no turno ${part(list[0])}`;
};

// → cards in the shape of the other analysis cards, plus faces: [{ id: 'prod' | 'stop', title, text, turnos }]
//   prod, stops: history records ({ m, d: 'YYYY-MM-DD', i1.., t, h }) of the base AND of the sheets read now
//   today: a Date (the window ends yesterday)
export function buildGapCards({ prod = [], stops = [], today = new Date(), days = WINDOW_DAYS } = {}) {
  const cov = coverage(prod, stops);
  if (!cov.size) return [];
  const end = utcDay(localIso(today)) - 1, from = end - days + 1, base0 = end - LOOKBACK_DAYS;
  const out = [];
  for (const group of ['raw', 'usi']) {
    const ofGroup = [...cov.values()].filter((c) => groupOfMachine(c.m) === group);
    // history the judgement is based on: the working days (before the window and inside it) in which the group wrote anything
    const known = ofGroup.filter((c) => utcDay(c.d) >= base0 && utcDay(c.d) <= end && isBusinessDay(c.d));
    const baseDays = new Set(known.map((c) => c.d));
    if (baseDays.size < MIN_DAYS) continue;                                   // not enough history to say what is normal
    const machines = [...new Set(known.map((c) => c.m))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const runs = (m, t) => { const n = known.filter((c) => c.m === m && (c.p.has(t) || c.s.has(t))).length; return n >= MIN_DAYS && n / baseDays.size >= MIN_SHARE; };
    const expected = new Map(machines.map((m) => [m, ['1', '2'].filter((t) => runs(m, t))]));
    const found = [];                                                          // per business day: { day, per machine gaps }
    for (let d = from; d <= end; d++) {
      const iso = isoOf(d);
      if (!isBusinessDay(iso)) continue;
      const day = { iso, rows: [] };
      for (const m of machines) {
        const exp = expected.get(m);
        if (!exp.length) continue;
        const c = cov.get(`${m}|${iso}`) ?? { p: new Set(), s: new Set(), sh: { 1: 0, 2: 0 } };
        const missP = [], missS = [];
        for (const t of exp) {
          const hasP = c.p.has(t), hasS = c.s.has(t);
          if (hasP && hasS) continue;
          if (!hasP && hasS && c.sh[t] >= STOPPED_SHARE * TURNOS[t].hours) continue;   // stopped the whole shift: explained
          if (!hasP) missP.push(t);
          if (!hasS) missS.push(t);
        }
        if (missP.length || missS.length) day.rows.push({ m, missP, missS, hasP: exp.filter((t) => c.p.has(t)), hasS: exp.filter((t) => c.s.has(t)) });
      }
      if (!day.rows.length) continue;
      // every running machine empty in every shift: one card for the whole group (a holiday, or the day not digitised at all)
      const everyone = day.rows.length === machines.filter((m) => expected.get(m).length).length
        && day.rows.every((r) => !r.hasP.length && !r.hasS.length);
      found.push({ ...day, everyone });
    }
    for (const day of found) {
      const label = group === 'usi' ? 'Usinagem' : 'Robôs (RAW)';
      if (day.everyone && day.rows.length > 1) {
        out.push(makeCard({ machine: group === 'usi' ? 'Todas · usinagem' : 'Todos · RAW', iso: day.iso, group, missP: ['1', '2'], missS: ['1', '2'], whole: label, hasP: [], hasS: [] }));
        continue;
      }
      for (const r of day.rows) out.push(makeCard({ machine: r.m, iso: day.iso, group, missP: r.missP, missS: r.missS, hasP: r.hasP, hasS: r.hasS }));
    }
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || String(a.machine).localeCompare(String(b.machine), 'pt-BR', { numeric: true }));
}

function makeCard({ machine, iso, group, missP, missS, hasP = [], hasS = [], whole = '' }) {
  const day = ddmm(iso), wd = weekdayOf(iso);
  const faces = [];
  const who = whole ? 'Todas as máquinas' : machine;
  const face = (id, title, miss) => {
    const what = id === 'prod' ? 'produção' : 'paradas';
    // what the same shift DOES have, so the person sees it is only half of the sheet that is missing
    const other = miss.filter((t) => (id === 'prod' ? hasS : hasP).includes(t));
    const text = whole
      ? `Nenhuma máquina de ${whole} tem anotação de *${what}* no dia *${day}* (${wd}). Pode ser feriado ou as folhas do dia não foram digitalizadas.`
      : `*${machine}* não tem anotação de *${what}* ${inTurnos(miss, true)} no dia *${day}* (${wd}).${other.length ? ` Há ${id === 'prod' ? 'paradas' : 'produção'} anotada ${inTurnos(other)}.` : ''}`;
    faces.push({ id, title, text, turnos: miss, what });
  };
  if (missP.length) face('prod', 'Falta anotação de produção', missP);
  if (missS.length) face('stop', 'Falta anotação de parada', missS);
  const names = [...new Set([...missP, ...missS])];
  const brief = whole ? `Nenhuma anotação de ${faces.length === 2 ? 'produção nem de paradas' : faces[0].what} no dia`
    : faces.length === 2 ? `Faltam produção e paradas ${inTurnos(names)}` : `Falta ${faces[0].what} ${inTurnos(faces[0].turnos)}`;
  const key = `${GAP_KIND}|${machine}|${iso}|${missP.join('')}-${missS.join('')}`;
  const nominal = names.reduce((s, t) => s + TURNOS[t].hours * 60, 0);
  return {
    key, kind: GAP_KIND, tier: 0, title: 'Turno sem anotação', color: GAP_COLOR, sev: 'alta', gap: true, group, machine, day, iso, weekday: wd, page: null, label: `Dia ${day}`,
    table: null, ri: null, linha: null, refs: [], brief, mins: nominal, who: '', people: [], faces,
    story: faces.map((f) => f.text).join(' '), lines: [], fix: 'Confira se a folha desse turno foi digitalizada. Se não houve turno, marque como anotação correta.',
    text: brief, why: '', big: day, bigLabel: wd,
  };
}
