import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPanel } from '../src/core/panel.js';

const stop = (linha, data, ini, fim, motivo) => ({ linha, data, chapa: '7910', ini, fim, turno: '1', motivo, desc: '', flags: {} });
const pages = [
  { id: 1, label: 'f1', machine: 'RAW05', prod: [{ linha: 1, data: '02/10/2026', chapa1: '7910', ini1: '08:00', fim1: '12:00', flags: {} }],
    stops: [stop(1, '02/10/2026', '07:30', '08:00', 'MECÂNICA'), stop(2, '02/10/2026', '12:00', '12:30', 'SET-UP')] },
  { id: 3, label: 'f3', machine: 'RAW05', prod: [], stops: [stop(3, '03/10/2026', '09:30', '10:30', 'MECÂNICA')] },
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

test('painel: lista completa das paradas, mapa de calor e disponibilidade batem com os totais', () => {
  const P = buildPanel(pages);
  assert.equal(P.all.length, P.count);
  assert.equal(P.all.reduce((n, x) => n + x.min, 0), P.stopMin);
  // o mapa de calor soma exatamente o tempo parado, e cada parada reparte seus minutos pelas horas
  assert.equal(P.heat.flatMap((r) => r.hours).reduce((n, x) => n + x, 0), P.stopMin);
  for (const x of P.all) assert.equal(Object.values(x.perHour).reduce((n, v) => n + v, 0), x.min);
  assert.equal(P.heat.find((r) => r.machine === 'UMC 01').hours[10], 60);
  assert.equal(P.prodPct, Math.round((P.prodMin / (P.prodMin + P.stopMin)) * 100));
  const x = P.all.find((y) => y.machine === 'UMC 01');
  assert.equal(x.clock, '10:00'); assert.equal(x.chapa, '7910'); assert.equal(x.turno, '1');
});

test('painel: cada parada traz hora de fim, folha e observação para a tabela de detalhes', () => {
  const P = buildPanel([{ id: 9, label: 'f9 · pág. 1', machine: 'RAW05', prod: [], stops: [{ ...stop(1, '02/10/2026', '09:00', '09:45', 'SET-UP'), desc: 'Trocar bico' }] }]);
  const x = P.all[0];
  assert.equal(x.clock, '09:00'); assert.equal(x.fim, '09:45'); assert.equal(x.folha, 'f9 · pág. 1'); assert.equal(x.desc, 'Trocar bico');
});
