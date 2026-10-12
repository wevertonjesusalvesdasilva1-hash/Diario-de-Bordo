import test from 'node:test';
import assert from 'node:assert/strict';
import { shiftOfTime, inferTurnos, chapaShifts } from '../src/core/turno.js';
import { applyKeywords, mentionsTyorei, normMotivo } from '../src/core/rows.js';
import { buildQuality } from '../src/core/quality.js';

const stop = (linha, ini, fim, chapa, extra = {}) => ({ linha, data: '02/10/2026', chapa, ini, fim, turno: '', motivo: 'OUTROS', desc: '', flags: {}, ...extra });
const m = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };

test('faixas de horário dos turnos', () => {
  assert.equal(shiftOfTime(m('07:30')).shift, '1');
  assert.equal(shiftOfTime(m('17:29')).shift, '1');
  assert.equal(shiftOfTime(m('18:40')).shift, '2');
  assert.equal(shiftOfTime(m('03:00')).shift, '2');
  assert.equal(shiftOfTime(m('06:30')).zone, 'early');
  assert.equal(shiftOfTime(m('18:00')).zone, 'evening');
});

test('turno em branco é preenchido pelo horário e a chapa decide as horas extras', () => {
  const page = { id: 1, label: 'f', machine: 'RAW05', date: '02/10/2026', prod: [], stops: [
    stop(1, '09:00', '09:30', '7910'), stop(2, '23:00', '23:30', '11678'),
    stop(3, '05:40', '06:30', '7910'),   // 7910 é do dia: hora extra de manhã → turno 1
    stop(4, '06:00', '07:00', '11678'),  // 11678 é da noite: saindo mais tarde → turno 2
    stop(5, '18:00', '18:20', '7910'),   // logo depois das 17:30, chapa do dia → turno 1
    stop(6, '06:00', '06:30', '9999'),   // chapa sem histórico, horário ambíguo → incerto
  ] };
  const filled = inferTurnos([page]);
  assert.deepEqual(page.stops.map((r) => r.turno), ['1', '2', '1', '2', '1', '']);
  assert.equal(filled, 5);
  assert.match(page.stops[2].auto.turno, /hora extra/);
  assert.match(page.stops[5].flags.turno, /incerto/);
  assert.equal(chapaShifts([page]).get('7910'), '1');
});

test('turno escrito que contradiz o horário só é sinalizado; o escrito não é trocado', () => {
  const page = { id: 2, label: 'f', machine: 'RAW05', date: '02/10/2026', prod: [], stops: [stop(1, '10:00', '10:30', '7910', { turno: '2' })] };
  inferTurnos([page]);
  assert.equal(page.stops[0].turno, '2');
  assert.match(page.stops[0].flags.turno, /indica turno 1/);
});

test('produção: turno de finalização vem do último horário preenchido', () => {
  const row = { linha: 1, data: '02/10/2026', chapa1: '7910', ini1: '08:00', fim1: '13:00', chapa2: '11678', ini2: '20:00', fim2: '23:00', turno: '', flags: {} };
  inferTurnos([{ id: 3, label: 'f', machine: 'RAW05', prod: [row], stops: [] }]);
  assert.equal(row.turno, '2');
});

test('Tyorei na descrição define o motivo TYOREI', () => {
  assert.ok(mentionsTyorei('Tyorei')); assert.ok(mentionsTyorei('tiorei diário')); assert.ok(!mentionsTyorei('almoço'));
  assert.equal(normMotivo('tyorei').value, 'TYOREI');
  const page = { stops: [stop(1, '07:30', '07:45', '7910', { motivo: '', desc: 'Tyorei', flags: { motivo: 'sem motivo' } })] };
  applyKeywords(page);
  assert.equal(page.stops[0].motivo, 'TYOREI');
  assert.equal(page.stops[0].flags.motivo, undefined);
});

test('card avisa quando o app precisou preencher o turno', () => {
  const stops = [1, 2, 3].map((i) => stop(i, `${8 + i}:00`.padStart(5, '0'), `${8 + i}:30`.padStart(5, '0'), '7910'));
  const page = { id: 4, label: 'f', machine: 'UMC 02', date: '02/10/2026', prod: [], stops };
  inferTurnos([page]);
  const c = buildQuality([page]).find((x) => x.problem === 'turno em branco');
  assert.ok(c); assert.match(c.headline, /UMC 02: a coluna de turno veio em branco em 3 de 3 linhas/);
});
