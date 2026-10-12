import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPanel } from '../src/core/panel.js';

const stop = (linha, data, ini, fim, motivo) => ({ linha, data, chapa: '7910', ini, fim, turno: '1', motivo, desc: '', flags: {} });
const pages = [
  { id: 1, label: 'f1', machine: 'RAW05', prod: [{ linha: 1, data: '02/10/2026', chapa1: '7910', ini1: '08:00', fim1: '12:00', flags: {} }],
    stops: [stop(1, '02/10/2026', '07:30', '08:00', 'MECÂNICA'), stop(2, '02/10/2026', '12:00', '12:30', 'SET-UP'), stop(3, '03/10/2026', '09:30', '10:30', 'MECÂNICA')] },
  { id: 2, label: 'f2', machine: 'UMC 01', prod: [], stops: [stop(1, '02/10/2026', '10:00', '11:00', 'ELÉTRICA')] },
];

test('painel soma paradas por motivo e máquina', () => {
  const P = buildPanel(pages);
  assert.equal(P.stopMin, 30 + 30 + 60 + 60);
  assert.equal(P.byMotivo[0].motivo, 'MECÂNICA');
  assert.equal(P.byMotivo[0].min, 90);
  assert.equal(P.byMachine.length, 2);
  assert.equal(P.longest.min, 60);
  assert.equal(P.days.length, 2);
});

test('painel filtra por grupo e dia, e reparte a parada por hora', () => {
  assert.equal(buildPanel(pages, { group: 'usi' }).stopMin, 60);
  assert.equal(buildPanel(pages, { group: 'raw' }).byMachine[0].name, 'RAW05');
  const d = buildPanel(pages, { day: buildPanel(pages).days[1].key });
  assert.equal(d.stopMin, 60);
  assert.equal(d.byHour[9], 30); assert.equal(d.byHour[10], 30);
});

test('painel: pareto acumulado e tempo parado por turno', () => {
  const P = buildPanel(pages);
  assert.equal(P.byMotivo.at(-1).acc, 100);
  assert.ok(P.byMotivo[0].acc < 100 && P.byMotivo[0].acc >= P.byMotivo[0].min / P.stopMin * 100 - 1);
  assert.equal(P.byTurno.reduce((s, t) => s + t.min, 0), P.stopMin);
});
