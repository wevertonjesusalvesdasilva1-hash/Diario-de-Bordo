// Fills the TURNO columns the operator left blank, from the time of day and from the badge number (chapa).
//   Turno 1 (day):   07:30 – 17:30. Overtime shows up as an early start (from ~05:30) or a late one (until ~18:30).
//   Turno 2 (night): from 18:40 on, until the early morning. A night chapa may start earlier or end later.
// Records that are clearly day or clearly night teach which shift each chapa works; the odd hours
// (05:30–07:30 and 17:30–18:40) follow the chapa. Pure functions; rows get row.auto.turno (why) and
// row.flags.turno (when the cell was written but disagrees with the clock).
import { aliasKey } from './lists.js';

const toMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t ?? ''); return m ? +m[1] * 60 + +m[2] : null; };
const DAY_FROM = 7 * 60 + 30, DAY_TO = 17 * 60 + 30, NIGHT_FROM = 18 * 60 + 40, EARLY_FROM = 5 * 60 + 30;
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// → { shift: '1'|'2', certain } or { shift: null, zone: 'early'|'evening' } for the in-between hours
export function shiftOfTime(m) {
  if (m == null) return null;
  if (m >= DAY_FROM && m < DAY_TO) return { shift: '1', certain: true };
  if (m >= NIGHT_FROM || m < EARLY_FROM) return { shift: '2', certain: true };
  return { shift: null, zone: m < DAY_FROM ? 'early' : 'evening' };
}

// every timed record of a page: { row, table, chapa, ini, col }
function records(page) {
  const out = [];
  page.stops.forEach((row) => { if (row.ini) out.push({ row, table: 'stops', chapa: row.chapa, ini: row.ini, col: 0 }); });
  return out;
}
function prodSegments(row) {
  const segs = [];
  for (const n of [1, 2, 3]) if (row[`ini${n}`] || row[`fim${n}`]) segs.push({ chapa: row[`chapa${n}`], ini: row[`ini${n}`], fim: row[`fim${n}`], col: n });
  return segs;
}

export function chapaShifts(pages) {
  const votes = new Map();
  const vote = (chapa, ini) => {
    const k = aliasKey(chapa); const c = shiftOfTime(toMin(ini));
    if (!k || !c?.certain) return;
    const v = votes.get(k) ?? { 1: 0, 2: 0 }; v[c.shift]++; votes.set(k, v);
  };
  for (const p of pages) {
    for (const r of records(p)) vote(r.chapa, r.ini);
    for (const row of p.prod) for (const s of prodSegments(row)) vote(s.chapa, s.ini);
  }
  const out = new Map();
  for (const [k, v] of votes) { const tot = v[1] + v[2]; if (v[1] / tot >= 0.75) out.set(k, '1'); else if (v[2] / tot >= 0.75) out.set(k, '2'); }
  return out;
}

function decide(ini, chapa, col, shifts) {
  const m = toMin(ini), c = shiftOfTime(m);
  if (!c) return null;
  if (c.certain) return { shift: c.shift, why: `horário ${ini} (${c.shift === '1' ? '07:30 às 17:30' : 'a partir das 18:40 ou madrugada'})`, certain: true };
  const byChapa = shifts.get(aliasKey(chapa));
  if (byChapa) return { shift: byChapa, why: `horário ${ini} fora do normal (hora extra) e a chapa ${chapa} trabalha no turno ${byChapa}`, certain: false };
  if (c.zone === 'evening') return { shift: '1', why: `horário ${ini} logo depois das 17:30: hora extra do turno 1 (chapa sem histórico)`, certain: false };
  if (col) return { shift: col === 1 ? '1' : '2', why: `horário ${ini} antes das 07:30, chapa sem histórico: seguiu a coluna da folha`, certain: false };
  return { shift: null, why: `horário ${ini} entre 05:30 e 07:30 e a chapa não define o turno` };
}

const writable = (row) => !row.edits?.turno && (!row.turno || row.turnoBlank || row.auto?.turno);

// Fills / checks the turno of every row of the pages. Returns how many cells were filled.
export function inferTurnos(pages) {
  const shifts = chapaShifts(pages);
  let filled = 0;
  const apply = (row, d, hint) => {
    if (!d) return;
    const written = row.turno && !row.turnoBlank && !row.auto?.turno;
    if (written) {
      if (d.certain && d.shift && row.turno !== d.shift && row.turno !== '3') row.flags.turno = `anotado turno ${row.turno}, mas o horário ${hint} indica turno ${d.shift}`;
      return;
    }
    if (!writable(row)) return;
    delete row.flags.turno;
    if (d.shift) { row.turno = d.shift; row.auto = { ...(row.auto ?? {}), turno: `Em branco na folha. Preenchido pelo ${d.why}.` }; filled++; }
    else { row.turno = ''; row.auto = { ...(row.auto ?? {}), turno: `Em branco na folha. ${d.why}.` }; row.flags.turno = 'turno incerto, preencha'; }
  };
  for (const p of pages) {
    for (const { row, chapa, ini } of records(p)) apply(row, decide(ini, chapa, 0, shifts), ini);
    for (const row of p.prod) {
      const segs = prodSegments(row).filter((s) => s.ini);
      const last = segs.at(-1);
      if (last) apply(row, decide(last.ini, last.chapa, last.col, shifts), last.ini);
    }
  }
  return filled;
}
