import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGapCards, isBusinessDay, inTurnos, GAP_KIND } from '../src/core/gaps.js';
import { KINDS } from '../src/core/report.js';

// today = Fri 2026-10-16 → the window is 02/10 … 15/10; the 14 days before it are the history the card learns from
const TODAY = new Date('2026-10-16T12:00:00');
const dates = (from, to) => { const out = []; for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86400000) out.push(new Date(t).toISOString().slice(0, 10)); return out; };
const P = (m, d, turno) => ({ m, d, i1: turno === 1 ? '08:00' : '21:00', f1: turno === 1 ? '10:00' : '23:00', t: turno, h: 2 });
const S = (m, d, turno, h = 0.5) => ({ m, d, i: turno === 1 ? '12:00' : '00:30', f: turno === 1 ? '12:30' : '01:00', t: turno, h });
// every working day of September and October until `last`, for the machines and shifts given
function base({ machines = ['RAW05', 'RAW09'], turnos = [1, 2], from = '2026-09-01', last = '2026-10-15', skip = () => false } = {}) {
  const prod = [], stops = [];
  for (const d of dates(from, last)) {
    if (!isBusinessDay(d)) continue;
    for (const m of machines) for (const t of turnos) { if (!skip(m, d, t, 'p')) prod.push(P(m, d, t)); if (!skip(m, d, t, 's')) stops.push(S(m, d, t)); }
  }
  return { prod, stops };
}

test('o tipo dourado é o primeiro da lista de tipos de aviso', () => {
  assert.equal(KINDS[0].id, GAP_KIND); assert.match(KINDS[0].color, /^#e8b9/i);
});

test('sem histórico ou com tudo anotado: nenhum card', () => {
  assert.deepEqual(buildGapCards({ prod: [], stops: [], today: TODAY }), []);
  const b = base(); assert.deepEqual(buildGapCards({ ...b, today: TODAY }), []);
});

test('falta só a produção do turno da noite: um card com uma face (produção)', () => {
  const b = base({ skip: (m, d, t, w) => m === 'RAW09' && d === '2026-10-08' && t === 2 && w === 'p' });
  const c = buildGapCards({ ...b, today: TODAY });
  assert.equal(c.length, 1); assert.equal(c[0].machine, 'RAW09'); assert.equal(c[0].day, '08/10'); assert.equal(c[0].weekday, 'quinta-feira');
  assert.deepEqual(c[0].faces.map((f) => f.id), ['prod']); assert.deepEqual(c[0].faces[0].turnos, ['2']);
  assert.match(c[0].faces[0].text, /RAW09.*produção.*turno da noite.*08\/10/); assert.equal(c[0].kind, GAP_KIND); assert.equal(c[0].gap, true);
});

test('falta só a parada: uma face (paradas); faltam as duas: duas faces', () => {
  const b = base({ skip: (m, d, t, w) => (m === 'RAW05' && d === '2026-10-06' && t === 1 && w === 's') || (m === 'RAW09' && d === '2026-10-07' && t === 1) });
  const c = buildGapCards({ ...b, today: TODAY });
  const s = c.find((x) => x.machine === 'RAW05'), two = c.find((x) => x.machine === 'RAW09');
  assert.deepEqual(s.faces.map((f) => f.id), ['stop']); assert.equal(s.day, '06/10');
  assert.deepEqual(two.faces.map((f) => f.id), ['prod', 'stop']); assert.match(two.brief, /produção e paradas no turno do dia/);
  assert.equal(two.faces[0].turnos[0], '1');
});

test('máquina parada o turno todo (paradas cobrem mais da metade) não é folha esquecida', () => {
  const b = base({ skip: (m, d, t, w) => m === 'RAW09' && d === '2026-10-08' && t === 2 && w === 'p' });
  b.stops = b.stops.map((s) => (s.m === 'RAW09' && s.d === '2026-10-08' && s.t === 2 ? { ...s, h: 6 } : s));
  assert.deepEqual(buildGapCards({ ...b, today: TODAY }), []);
});

test('fim de semana não é cobrado; turno que a máquina nunca trabalha não é cobrado', () => {
  const day = base({ machines: ['RAW05', 'RAW09'], turnos: [1] });                    // só turno do dia, o tempo todo
  assert.deepEqual(buildGapCards({ ...day, today: TODAY }), []);                       // o turno da noite não existe para essas máquinas
  const b = base({ skip: (m, d) => d === '2026-10-10' || d === '2026-10-11' });         // sábado e domingo
  assert.deepEqual(buildGapCards({ ...b, today: TODAY }), []);
});

test('dia útil sem nenhuma anotação de nenhuma máquina: um card só para todas', () => {
  const b = base({ skip: (m, d) => d === '2026-10-08' });                               // quinta 08/10 (12/10 é feriado e nem entra na conta)
  const c = buildGapCards({ ...b, today: TODAY });
  assert.equal(c.length, 1); assert.match(c[0].machine, /Todos/); assert.equal(c[0].day, '08/10'); assert.equal(c[0].faces.length, 2);
  assert.match(c[0].faces[0].text, /feriado/);
});

test('o dia de ontem sem folha é pego; hoje e os dias antes da janela ficam de fora', () => {
  const b = base({ last: '2026-10-14' });                                               // quinta 15/10 inteira sem anotação
  const c = buildGapCards({ ...b, today: TODAY });
  assert.ok(c.some((x) => x.day === '15/10'));
  const old = base({ skip: (m, d) => d === '2026-09-10' });                             // antes da janela de 14 dias
  assert.deepEqual(buildGapCards({ ...old, today: TODAY }), []);
});

test('usinagem e RAW são julgados separados', () => {
  const b = base({ machines: ['RAW05', 'UMC 01'], skip: (m, d, t, w) => m === 'UMC 01' && d === '2026-10-13' && t === 1 && w === 'p' });
  const c = buildGapCards({ ...b, today: TODAY });
  assert.equal(c.length, 1); assert.equal(c[0].machine, 'UMC 01'); assert.equal(c[0].group, 'usi');
});

test('frases: um turno ou os dois', () => {
  assert.equal(inTurnos(['2']), 'no turno da noite'); assert.equal(inTurnos(['1', '2']), 'nos turnos do dia e da noite');
  assert.match(inTurnos(['2'], true), /20:40 às 05:30/);
});

import { holidayName, isWorkingDay, easter } from '../src/core/holidays.js';
test('feriados nacionais não são dia útil (12/10 Aparecida, Sexta-feira Santa, fim de semana)', () => {
  assert.equal(holidayName('2026-10-12'), 'Nossa Senhora Aparecida');
  assert.equal(easter(2026), '2026-04-05'); assert.equal(holidayName('2026-04-03'), 'Sexta-feira Santa');
  assert.equal(isWorkingDay('2026-10-12'), false); assert.equal(isWorkingDay('2026-10-13'), true); assert.equal(isWorkingDay('2026-10-17'), false);
  assert.equal(isBusinessDay('2026-09-07'), false);
});
