import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCube, slice, M, withP, withS, groupP, groupS, pareto, ganhoTexto, variacaoTexto, corPct, corGanho, selecionado, anomalias, destaques, optionsFor } from '../src/core/bi.js';

const P = (m, d, p, o, t, c, h, tp) => ({ m, d, p, o, c1: t === 1 ? c : '', i1: '', f1: '', c2: t === 2 ? c : '', i2: '', f2: '', c3: t === 3 ? c : '', i3: '', f3: '', t, ob: '', h, tp });
const S = (m, d, c, t, mo, h) => ({ m, d, c, i: '08:00', f: '09:00', t, mo, ds: '', h });
const base = {
  prod: [P('RAW05', '2026-08-01', 'A', 'X', 1, '100', 10, 8), P('RAW05', '2026-08-01', 'B', 'Y', 2, '200', 6, 6), P('RAW05', '2026-08-02', 'A', 'X', 1, '100', 9, 10), P('RAW06', '2026-09-01', 'A', 'X', 3, '300', 5, 4)],
  stops: [S('RAW05', '2026-08-01', '100', 1, 'SET-UP', 2), S('RAW05', '2026-08-01', '200', 2, 'OUTROS', 1), S('RAW05', '2026-08-01', '999', 2, 'OUTROS', 1), S('RAW06', '2026-09-01', '300', 3, 'SET-UP', 1), S('RAW06', '2026-09-05', '300', 3, 'MECÂNICA', 2)],
};
const cube = buildCube(base, (c) => ({ 100: 'Ana' }[c] ?? ''));

test('totais, meta e disponibilidade', () => {
  const c = slice(cube, {});
  assert.equal(M.horasProd(c), 30); assert.equal(M.qtdPecas(c), 4);
  assert.equal(M.horasParadas(c), 7); assert.equal(M.horasParadasResumo(c), 7);
  assert.ok(Math.abs(M.target(c) - 18.58 * 3) < 1e-9);          // RAW05: 2 dias, RAW06: 1 dia
  assert.ok(Math.abs(M.pct(c) - 30 / (18.58 * 3)) < 1e-9);
  assert.ok(Math.abs(M.ganho(c) - (28 - 30) / 28) < 1e-9);
  assert.equal(ganhoTexto(M.ganho(c)), '-7%');
  assert.equal(variacaoTexto(0.9), '+2.00%');
});

test('filtro de produção chega às paradas só pelas chapas finais e o resumo pela data e máquina', () => {
  const c = slice(cube, withP({}, 'mes', 'agosto'));
  assert.equal(M.horasProd(c), 25);
  assert.equal(M.horasParadas(c), 3);        // a parada da chapa 999 não tem produção → fora
  assert.equal(M.horasParadasResumo(c), 4);  // 01/08 RAW05 inteiro (2+1+1)
});

test('filtro de paradas corta a produção pelas chapas', () => {
  const c = slice(cube, withS({}, 'mo', 'SET-UP'));
  assert.equal(M.horasProd(c), 15); assert.equal(M.horasParadas(c), 3);
  assert.equal(M.horasProd(slice(cube, withS({}, 'mo', 'MECÂNICA'))), 0);   // a parada de 05/09 não tem produção na mesma data
  const d = slice(cube, withS({}, 'mo', 'OUTROS'));
  assert.equal(M.horasProd(d), 6);           // produção da chapa 200 em 01/08 (a 999 não existe)
});

test('chapa final e nome do operador', () => {
  assert.deepEqual(groupP(cube, {}, ['nome']).map((g) => g.vals[0]), ['', 'Ana']);
  assert.equal(cube.prod[0].cf, '100'); assert.equal(cube.prod[3].cf, '300');
});

test('pareto com acumulado', () => {
  const r = pareto(cube, {});
  assert.deepEqual(r.map((x) => [x.mo, x.h]), [['SET-UP', 3], ['MECÂNICA', 2], ['OUTROS', 2]]);
  assert.deepEqual(r.map((x) => x.rank), [1, 2, 2]);
  assert.ok(Math.abs(r[2].pctAcc - 1) < 1e-9 && Math.abs(r[0].pctAcc - 3 / 7) < 1e-9);
  const f = pareto(cube, withS({}, 'mo', 'OUTROS'));
  assert.equal(f.length, 1); assert.ok(Math.abs(f[0].pctAcc - 1) < 1e-9);   // empate com MECÂNICA (mesma posição) → acumula os dois; a classificação ignora o filtro do próprio motivo
});

test('cores e textos', () => {
  assert.equal(corPct(0.9), '#81C784'); assert.equal(corPct(0.8), '#FFD966'); assert.equal(corPct(0.5), '#E57373');
  assert.equal(corGanho(-0.1), '#81C784'); assert.equal(corGanho(0.1), '#E57373'); assert.equal(corGanho(null), '#FFD966');
  assert.equal(selecionado(new Set()), 'Todos'); assert.equal(selecionado(new Set(['a'])), 'a'); assert.equal(selecionado(new Set(['a', 'b']), 'Todos', 'peças selecionadas'), '2 peças selecionadas');
  assert.equal(groupS(cube, {}, ['t']).length, 3);
});

test('registros suspeitos e destaques', () => {
  assert.equal(anomalias(cube).length, 0);
  const big = buildCube({ prod: [P('RAW05', '2026-08-03', 'A', 'X', 1, '100', 20, 8), P('RAW05', '2026-08-03', 'B', 'Y', 1, '100', 10, 8)], stops: [] });
  assert.equal(anomalias(big).length, 2);
  const d = destaques(cube, {});
  assert.ok(d.some((x) => /Menor disponibilidade: RAW06/.test(x.text)) && d.some((x) => /Maior motivo de parada: SET-UP/.test(x.text)));
});

test('filtros ligados: os dias seguem o mês, o mês não some pelo dia', () => {
  const f = { p: { mes: new Set(['agosto']) }, s: {} };
  assert.deepEqual(optionsFor(cube, 'p', 'data', f), ['2026-08-01', '2026-08-02']);
  const g = { p: { data: new Set(['2026-08-01']) }, s: {} };
  assert.deepEqual(optionsFor(cube, 'p', 'mes', g), ['agosto', 'setembro']);
});
