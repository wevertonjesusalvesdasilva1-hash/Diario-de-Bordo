import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCube, slice, M, withP, withS, groupP, groupS, pareto, ganhoTexto, variacaoTexto, corPct, corGanho, selecionado, anomalias, destaques, optionsFor, auditoria24 } from '../src/core/bi.js';

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
  assert.ok(Math.abs(M.target(c) - 18.58 * 2 * 3) < 1e-9);      // como no Power BI: 2 robôs × 3 datas distintas (08-01, 08-02, 09-01)
  assert.ok(Math.abs(M.pct(c) - 30 / (18.58 * 6)) < 1e-9);
  assert.ok(Math.abs(M.target(slice(cube, { p: { m: new Set(['RAW05']) }, s: {} })) - 18.58 * 2) < 1e-9);   // um robô: só as datas dele
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

test('auditoria de 24 h: produção + paradas da mesma máquina, dia de meia-noite a meia-noite', () => {
  const prod = [{ ...P('RAW05', '2026-08-01', 'A', 'X', 1, '100', 20, 8), i1: '00:00', f1: '20:00' }];
  const stops = [{ ...S('RAW05', '2026-08-01', '100', 1, 'SET-UP', 3), i: '10:00', f: '13:00' }];
  const r = auditoria24(buildCube({ prod, stops }), {});
  assert.equal(r.length, 0);                         // 20 h de produção + 3 h de parada = 23 h: não passa de 24 h
  const stops2 = [{ ...S('RAW05', '2026-08-01', '100', 1, 'SET-UP', 5), i: '10:00', f: '15:00' }];
  const r2 = auditoria24(buildCube({ prod, stops: stops2 }), {});
  assert.equal(r2.length, 1); assert.equal(r2[0].tot, 25); assert.match(r2[0].why, /5,0 h de produção e parada no mesmo horário/);
  // o que atravessa a meia-noite é dividido: 22:00–04:00 conta 2 h num dia e 4 h no outro
  const prod3 = [{ ...P('RAW06', '2026-08-01', 'A', 'X', 1, '100', 6, 8), i1: '22:00', f1: '04:00' }, { ...P('RAW06', '2026-08-02', 'B', 'Y', 1, '100', 20, 8), i1: '04:00', f1: '24:00' }];
  assert.equal(auditoria24(buildCube({ prod: prod3, stops: [] }), {}).length, 0);
});


test('entrega: horas padrão das peças x horas reais (uma linha, uma peça)', () => {
  const mk = (m, p, o, h, tp) => ({ ...P(m, '2026-08-01', p, o, 1, '100', h, tp), p, o });
  const c = buildCube({ prod: [mk('RAW05', 'LANÇA', 'PC500LC-10M0', 6, 5), mk('RAW05', 'LANÇA', 'PC500LC-10M0', 6, 5), mk('RAW05', 'PEÇA SEM PADRÃO', 'X1', 4, 0)], stops: [] });
  const s = slice(c, {});
  assert.equal(M.entrega(s), 10);                 // 2 peças × 5 h
  assert.equal(M.realComPadrao(s), 12);           // só as peças que têm padrão
  assert.ok(Math.abs(M.efic(s) - 10 / 12) < 1e-9);
  assert.equal(M.pecasSemPadrao(s), 1); assert.equal(M.horasSemPadrao(s), 4);
});

test('filtro de data/máquina igual nos dois lados (filtro da página) corta cada tabela sozinha e não perde peças sem parada', () => {
  const d = new Set(['2026-08-02']);   // a day with production and no stop
  const solo = slice(cube, { p: { data: d }, s: {} }), espelhado = slice(cube, { p: { data: d }, s: { data: d } });
  assert.equal(M.qtdPecas(espelhado), M.qtdPecas(solo));
  assert.equal(M.horasProd(espelhado), M.horasProd(solo));
  assert.equal(espelhado.S.length, slice(cube, { p: {}, s: { data: d } }).S.length);
});

test('peças sem tempo na matriz (colar do center frame, sub bracket, bracket) usam a média do histórico e ficam sinalizadas', () => {
  const mk = (p, o, h, d = '2026-08-03') => ({ m: 'RAW12', d, p, o, c1: '100', i1: '', f1: '', c2: '', i2: '', f2: '', c3: '', i3: '', f3: '', t: 1, ob: '', h, tp: 0 });
  const c = buildCube({ prod: [mk('SUB BRACKET', 'D99-ZZ', 1), mk('SUB BRACKET', 'D99-ZZ', 2), mk('SUB BRACKET', 'D99-ZZ', 3, '2026-08-04'), mk('BRACKET', 'D99-ZZ', 0.5), mk('OUTRA PEÇA', 'D99-ZZ', 4)], stops: [] });
  const s = slice(c, {});
  assert.equal(M.pecasPorHistorico(s), 4);
  assert.equal(s.P.find((r) => r.p === 'SUB BRACKET').tpx, 2);            // (1 + 2 + 3) / 3
  assert.equal(M.entrega(slice(c, { p: { pm: new Set(['SUB BRACKET-D99-ZZ']) }, s: {} })), 6);
  assert.equal(M.pecasSemPadrao(s), 1);                                       // a peça fora da lista continua sem padrão
  assert.ok(c.hstd.size === 2 && [...c.hstd.values()].some((v) => v.n === 3 && /Média de 3 produções/.test(v.obs)));
});
