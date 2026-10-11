import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuality } from '../src/core/quality.js';

const prod = (linha, extra) => ({ linha, data: '02/10/2026', peca: 'MESA', modelo: '130', flags: {}, ...extra });
const umc = {
  id: 1, label: 'f1', machine: 'UMC 02', date: '02/10/2026',
  prod: [prod(1, { ini1: '07:00', fim1: '09:00' }), prod(2, { ini1: '09:00', fim1: '11:00' }), prod(3, { ini1: '11:00', fim1: '13:00', chapa1: '290049' }), prod(4, { ini1: '13:00', fim1: '15:00' })],
  stops: [],
};

test('colaborador que não preenche a chapa é apontado', () => {
  const q = buildQuality([umc]);
  const c = q.find((x) => x.problem === 'sem chapa');
  assert.ok(c);
  assert.match(c.headline, /UMC 02: o colaborador não preenche a chapa em 3 de 4 registros/);
  assert.equal(c.sev, 'alta');
});

test('folha com muitas células difíceis é apontada como caligrafia', () => {
  const flags = { ini1: 'ilegível', fim1: 'hora inválida', chapa1: 'fora da lista' };
  const rows = Array.from({ length: 4 }, (_, i) => prod(i + 1, { chapa1: '7910', ini1: '07:00', fim1: '08:00', flags: { ...flags } }));
  const q = buildQuality([{ id: 2, label: 'f2', machine: 'RAW05', date: '02/10/2026', prod: rows, stops: [] }]);
  const c = q.find((x) => x.kind === 'caligrafia');
  assert.ok(c);
  assert.match(c.headline, /folha do dia 02\/10/);
});

test('folha bem preenchida não gera ponto', () => {
  const rows = Array.from({ length: 4 }, (_, i) => prod(i + 1, { chapa1: '7910', ini1: '07:00', fim1: '08:00' }));
  assert.equal(buildQuality([{ id: 3, label: 'f3', machine: 'RAW05', date: '02/10/2026', prod: rows, stops: [] }]).length, 0);
});
