import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOperatorRows, setOperators, clearOperators, whoText } from '../src/core/operators.js';
import { inferTurnos } from '../src/core/turno.js';
import { buildQuality } from '../src/core/quality.js';

// nomes inventados: o repositório nunca recebe nomes reais
const rows = [
  ['NOMES OPERADORES DO ROBÔ'],
  ['REFERENCIAS', 'Numero', 'Chapa', 'Nome', 'Coluna4', 'Turno', 'Coluna1', 'TURNO2'],
  ['MECÂNICA', 1, 11111, 'FULANO DE TAL SOUZA', 'F34', 'NOITE', '', 1],
  ['ELÉTRICA', 2, 22222, 'BELTRANA DOS SANTOS', 'F34', 'DIURNO', '', 2],
  ['', 3, '', '', '', '', '', ''],
];

test('lê a aba REFERENCIAS: chapa, nome em formato de nome e turno', () => {
  const ops = parseOperatorRows(rows);
  assert.deepEqual(ops['11111'], { nome: 'Fulano de Tal Souza', turno: '2' });
  assert.deepEqual(ops['22222'], { nome: 'Beltrana dos Santos', turno: '1' });
  assert.equal(Object.keys(ops).length, 2);
  assert.deepEqual(parseOperatorRows([['sem cabeçalho']]), {});
});

test('whoText usa o nome quando há tabela e a chapa quando não há', () => {
  clearOperators();
  assert.equal(whoText(['22222', '22222', '33333']), 'chapa 22222 · 2× · chapa 33333');
  setOperators(parseOperatorRows(rows));
  assert.equal(whoText(['22222', '22222', '33333']), 'Beltrana dos Santos (22222) · 2× · chapa 33333');
  assert.equal(whoText([]), '');
});

test('o turno da tabela importada decide as horas de transição e o card mostra quem é', () => {
  setOperators(parseOperatorRows(rows));
  const stop = (l, ini, fim, chapa, extra = {}) => ({ linha: l, data: '02/10/2026', chapa, ini, fim, turno: '', motivo: '', desc: '', flags: {}, ...extra });
  const page = { id: 1, label: 'f', machine: 'UMC 02', date: '02/10/2026', prod: [], stops: [stop(1, '06:00', '06:30', '11111'), stop(2, '06:10', '06:30', '11111'), stop(3, '06:20', '06:40', '11111')] };
  inferTurnos([page]);
  assert.deepEqual(page.stops.map((r) => r.turno), ['2', '2', '2']); // 11111 é NOITE: saindo mais tarde
  const q = buildQuality([page]).find((c) => c.problem === 'sem motivo');
  assert.ok(q); assert.match(q.who, /Fulano de Tal Souza \(11111\)/);
  clearOperators();
});
