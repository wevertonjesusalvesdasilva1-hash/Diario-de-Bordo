import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/historico.js';
import { useStore } from '../api/_store.js';
import { prodKey, stopKey, prodRecord, stopRecord, recordsFromPages, mergeRecords, toMin, spanHours, prodHours, isoDate, standardHours, parseHistoryWorkbook } from '../src/core/history.js';
import * as XLSX from 'xlsx';

const mkRes = () => { const r = { code: 0, body: null }; r.status = (c) => { r.code = c; return r; }; r.setHeader = () => r; r.json = (b) => { r.body = b; return r; }; return r; };
const mem = () => { const m = new Map(); return { m, ok: () => true, read: async (p) => m.get(p) ?? null, write: async (p, t) => { m.set(p, t); } }; };
let ip = 0;
const call = async (over) => { const r = mkRes(); await handler({ method: 'GET', query: {}, headers: { host: 'app.test', 'x-access-code': 'abc', 'x-forwarded-for': `9.9.9.${++ip % 250}` }, ...over }, r); return r; };

const P = (o = {}) => ({ m: 'RAW05', d: '2026-10-01', p: 'LANÇA', o: 'PC210F-10M0', c1: '12273', i1: '07:00', f1: '09:30', c2: '', i2: '', f2: '', c3: '', i3: '', f3: '', t: 1, ob: '', h: 2.5, tp: 4.7, ...o });
const S = (o = {}) => ({ m: 'RAW05', d: '2026-10-01', c: '12273', i: '10:00', f: '10:45', t: 1, mo: 'SET-UP', ds: 'trocar bico', h: 0.75, ...o });

test('horas: virada do dia, soma dos três turnos e tempo padrão da matriz', () => {
  assert.equal(toMin('07:05'), 425); assert.equal(toMin(0.5), 720); assert.equal(toMin('x'), null);
  assert.equal(spanHours('22:00', '02:30'), 4.5); assert.equal(spanHours('07:00', ''), null); assert.equal(spanHours('08:00', '08:00'), 0);
  assert.equal(prodHours({ i1: '08:00', f1: '12:00', i2: '22:00', f2: '02:00', i3: '', f3: '' }), 8);
  assert.equal(isoDate('01/10/2026'), '2026-10-01'); assert.equal(isoDate(46296), '2026-10-01'); assert.equal(isoDate(''), '');
  assert.equal(prodRecord({ m: 'RAW09', d: '01/10/2026', p: '1° OP LANÇA', o: 'PC360LC-8M2', i1: '08:00', f1: '10:00', t: '1' }).tp, 7);
  assert.equal(standardHours('HMC-16', 'MESA', 'PC360LC-8M2') > 0, true);
  assert.equal(stopRecord({ m: 'HMC-16', d: '01/10/2026', i: '07:50', f: '08:30', mo: ' TROCA DE PEÇA ' }).mo, 'TROCA DE PEÇA');
  assert.equal(stopRecord({ m: 'HMC 16', d: '01/10/2026', i: '07:50', f: '08:30' }).m, 'HMC-16');
});

test('folhas validadas viram registros; linhas sem data ou horário ficam de fora e o mesmo registro não entra duas vezes', () => {
  const page = { label: 'f1 · pág. 1', machine: 'RAW05', date: '01/10/2026',
    prod: [{ linha: 1, data: '01/10/2026', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: '12273', ini1: '07:00', fim1: '09:30', turno: '1' }, { linha: 2, data: '', peca: 'LANÇA', modelo: 'PC210F-10M0', ini1: '', fim1: '' }],
    stops: [{ linha: 1, data: '01/10/2026', chapa: '12273', ini: '10:00', fim: '10:45', turno: '1', motivo: 'SET-UP', desc: 'x' }, { linha: 2, data: '01/10/2026', ini: '11:00', fim: '', motivo: 'OUTROS' }] };
  const r = recordsFromPages([page, { label: 'sem máquina', machine: '', prod: [], stops: [] }]);
  assert.equal(r.prod.length, 1); assert.equal(r.stops.length, 1); assert.equal(r.prod[0].h, 2.5); assert.equal(r.stops[0].h, 0.75);
  assert.ok(r.skipped.length >= 2);
  const base = mergeRecords({ prod: [], stops: [] }, r, 'b1');
  assert.deepEqual(base.added, { prod: 1, stops: 1 });
  const again = mergeRecords(base, r, 'b2');
  assert.deepEqual(again.added, { prod: 0, stops: 0 }); assert.deepEqual(again.dup, { prod: 1, stops: 1 });
  assert.equal(prodKey(P()), prodKey(P({ h: 9 }))); assert.notEqual(stopKey(S()), stopKey(S({ f: '10:50' })));
});

test('API do histórico: exige código e armazenamento, grava sem repetir, desfaz um envio e restaura a cópia', async () => {
  delete process.env.ACCESS_CODE; assert.equal((await call()).code, 403);
  process.env.ACCESS_CODE = 'abc';
  useStore({ ok: () => false }); assert.equal((await call({ query: { g: 'raw' } })).code, 503);
  const st = mem(); useStore(st);
  assert.equal((await call({ query: { g: 'xx' } })).code, 400);
  assert.deepEqual((await call({ query: { g: 'raw' } })).body, { rev: 0, prod: [], stops: [], batches: [] });
  let r = await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'b1', label: 'Folha 1', prod: [P(), P({ i1: '13:00', f1: '15:00' })], stops: [S()] } });
  assert.equal(r.code, 200); assert.deepEqual(r.body.added, { prod: 2, stops: 1 });
  r = await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'b2', prod: [P(), P({ d: '2026-10-02' })], stops: [S(), S({ i: '11:00', f: '11:20', h: 0.33 })] } });
  assert.deepEqual(r.body.added, { prod: 1, stops: 1 }); assert.deepEqual(r.body.dup, { prod: 1, stops: 1 });
  r = await call({ method: 'POST', body: { g: 'raw', op: 'append', prod: [{ m: 'UMC 01', d: '2026-10-01' }, { x: 1 }, P({ d: 'ontem' })] } });
  assert.equal(r.body.invalid, 3); assert.deepEqual(r.body.added, { prod: 0, stops: 0 });
  const g = await call({ query: { g: 'raw' } });
  assert.equal(g.body.prod.length, 3); assert.equal(g.body.stops.length, 2); assert.equal(g.body.batches.length, 3);
  assert.deepEqual((await call({ query: { g: 'raw', rev: String(g.body.rev) } })).body, { rev: g.body.rev });
  // undo only the 2nd batch
  r = await call({ method: 'POST', body: { g: 'raw', op: 'undo', batch: 'b2' } });
  assert.deepEqual(r.body.removed, { prod: 1, stops: 1 });
  assert.equal((await call({ method: 'POST', body: { g: 'raw', op: 'undo', batch: 'b2' } })).code, 404);
  // replace needs confirmation, keeps a copy, and restore brings it back
  assert.equal((await call({ method: 'POST', body: { g: 'raw', op: 'replace', prod: [P()] } })).code, 400);
  r = await call({ method: 'POST', body: { g: 'raw', op: 'replace', confirm: true, batch: 'imp', label: 'Importação', prod: [P({ d: '2026-08-01' })], stops: [] } });
  assert.deepEqual(r.body.total, { prod: 1, stops: 0 });
  r = await call({ method: 'POST', body: { g: 'raw', op: 'restore' } });
  assert.deepEqual([r.body.prod, r.body.stops], [2, 1]);
  assert.equal((await call({ method: 'POST', body: { g: 'usi', op: 'append', prod: [P()] } })).body.invalid, 1); // RAW machine on the usinagem base
  assert.equal((await call({ method: 'POST', body: { g: 'raw', op: 'append', prod: new Array(3001).fill(P()) } })).code, 413);
});

test('leitura da planilha de controle: colunas por nome, soma de horas e linhas vazias ignoradas', () => {
  const prodRows = [['', '', '', '', '', '1ºTURNO'], ['COD', 'ROBÔ', 'DATA', 'PEÇA ', 'MODELO', 'CHAPA', 'INÍCIO', 'FIM', 'CHAPA2', 'INICIO', 'FIM ', 'CHAPA3', 'INCIO', 'FIM 2', 'TURNO QUE FINALIZOU', 'OBSERVAÇÕES ', '1ºTURNO', '2ºTURNO', '3ºTURNO', 'TEMPO/DEC', 'TEMPO PADRÃO BAAN'],
    ['RAW05LANÇAPC210F-10M0', 'RAW05', 46296, 'LANÇA', 'PC210F-10M0', 12273, 7 / 24, 9.5 / 24, null, null, null, null, null, null, 1, null, null, null, null, 2.5, 4.7],
    ['', 'RAW05', 46296, 'LANÇA']];
  const stopRows = [['', 'ROBÔ', 'DATA', 'CHAPA', 'INICIO ', 'FINAL ', 'TURNO', 'MOTIVO DA PARADA', 'DESCRIÇÃO DA PARADA', 'TTL', 'TEMPO/DEC'],
    ['', 'RAW05', 46296, '12273', 10 / 24, 10.75 / 24, 1, 'SET-UP ', 'x', null, 0.75], ['', null, 46296, '1', 0.1, 0.2, 1, 'X'], ['', 'Total', null, null, null, null, null, null]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodRows), 'PRODUÇÃO'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stopRows), 'PARADAS');
  const r = parseHistoryWorkbook(XLSX, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  assert.equal(r.group, 'raw'); assert.equal(r.prod.length, 1); assert.equal(r.stops.length, 1);
  assert.equal(r.prod[0].d, '2026-10-01'); assert.equal(r.prod[0].i1, '07:00'); assert.equal(r.prod[0].f1, '09:30'); assert.equal(r.prod[0].h, 2.5); assert.equal(r.prod[0].tp, 4.7);
  assert.equal(r.stops[0].mo, 'SET-UP'); assert.equal(r.stops[0].h, 0.75);
  assert.throws(() => parseHistoryWorkbook(XLSX, XLSX.write(XLSX.utils.book_new(), { type: 'array', bookType: 'xlsx', bookSST: false }) ), /./);
});

test('linhas idênticas repetidas na mesma folha entram todas; reenvio não duplica', async () => {
  const { mergeRecords } = await import('../src/core/history.js');
  const s = { m: 'RAW05', d: '2026-10-14', c: '7910', i: 420, f: 450, t: '1', mo: 'SET-UP' };
  const a = mergeRecords({ prod: [], stops: [] }, { prod: [], stops: [s, { ...s }, { ...s }] }, 'b1');
  assert.equal(a.stops.length, 3);
  const b = mergeRecords(a, { prod: [], stops: [s, { ...s }, { ...s }] }, 'b2');
  assert.equal(b.stops.length, 3); assert.equal(b.dup.stops, 3);
});

test('API do histórico: editar, excluir e incluir registros um a um; matriz de tempos compartilhada', async () => {
  process.env.ACCESS_CODE = 'abc';
  const st = mem(); useStore(st);
  await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'b1', prod: [P(), P({ i1: '13:00', f1: '15:00' })], stops: [S()] } });
  const base = (await call({ query: { g: 'raw' } })).body;
  const [p1, p2] = base.prod, s1 = base.stops[0];
  let r = await call({ method: 'POST', body: { g: 'raw', op: 'edit', changes: [
    { kind: 'prod', old: p1, new: { ...p1, f1: '10:30', h: 3.5 } }, { kind: 'prod', old: p2, new: null }, { kind: 'stop', old: s1, new: { ...s1, mo: 'OUTROS' } },
    { kind: 'stop', old: null, new: S({ i: '12:00', f: '12:10', h: 0.17 }) }, { kind: 'prod', old: { ...p1, m: 'RAW99' }, new: null }] } });
  assert.equal(r.code, 200); assert.deepEqual([r.body.edit, r.body.del, r.body.add, r.body.miss], [2, 1, 1, 1]);
  const after = (await call({ query: { g: 'raw' } })).body;
  assert.equal(after.prod.length, 1); assert.equal(after.prod[0].f1, '10:30'); assert.equal(after.prod[0].b, 'b1');
  assert.equal(after.stops.length, 2); assert.equal(after.stops[0].mo, 'OUTROS');
  assert.equal((await call({ method: 'POST', body: { g: 'raw', op: 'edit', changes: [{ kind: 'prod', old: p1, new: { ...p1, m: 'XX' } }] } })).body.miss, 1);
  assert.deepEqual((await call({ query: { g: 'matriz' } })).body, { rev: 0, rows: null });
  r = await call({ method: 'POST', body: { g: 'matriz', op: 'set', rows: [['RAW05', 'LANÇA', 'PC210F-10M0', '4,5'.replace(',', '.')], ['', 'x', 'y', 1]] } });
  assert.equal(r.body.rows.length, 1);
  assert.equal((await call({ query: { g: 'matriz' } })).body.rows[0][3], 4.5);
});

test('comparar um mês com o Excel: iguais, editadas, só no app e só no Excel', async () => {
  const { compareMonth } = await import('../src/core/history.js');
  const x = [P(), P({ i1: '13:00', f1: '15:00', h: 2 }), P({ d: '2026-09-30' })], b = [P({ h: 3 }), P({ i1: '13:00', f1: '15:00', h: 2 }), P({ i1: '16:00', f1: '17:00', h: 1 }), P({ d: '2026-09-30', h: 9 })];
  const r = compareMonth('prod', b, x, '2026-10');
  assert.equal(r.same, 1); assert.equal(r.edited.length, 1); assert.equal(r.edited[0].base.h, 3); assert.equal(r.edited[0].excel.h, 2.5);
  assert.equal(r.onlyBase.length, 1); assert.equal(r.onlyExcel.length, 0);                     // outro mês não entra
  assert.equal(compareMonth('prod', b, x, '2026-09').edited.length, 1);
});

// ---- Excel de controle novo ("uma linha = uma peça": até 8 trechos por peça, código do motivo na parada)
const novoXlsx = (maq = 'ROBÔ', extra = {}) => {
  const head = ['COD', maq, 'DATA', 'Nº PEÇA', 'PEÇA', 'MODELO'];
  for (let k = 1; k <= 8; k++) head.push(`CHAPA ${k}`, `INÍCIO ${k}`, `FIM ${k}`);
  head.push('CONTINUA A PEÇA Nº', 'TURNO QUE FINALIZOU', 'OBSERVAÇÕES');
  for (let k = 1; k <= 8; k++) head.push(`TEMPO T${k}`);
  head.push('TEMPO/DEC', 'TEMPO PADRÃO BAAN');
  const row = (o) => head.map((h) => (h in o ? o[h] : null));
  const h = (hh, mm = 0) => (hh + mm / 60) / 24;
  const prodRows = [[], head,
    // 7 trechos: 08:00-09:00, 10:00-11:00, 12:00-13:00, 14:00-15:00, 16:00-17:00, 18:00-19:00, 20:00-21:30 → 7,5 h
    row({ [maq]: extra.m ?? 'RAW09', DATA: 46296, 'Nº PEÇA': 1, 'PEÇA': '1° OP LANÇA', MODELO: 'PC360LC-8M2', 'CHAPA 1': 1001, 'INÍCIO 1': h(8), 'FIM 1': h(9), 'CHAPA 2': 1001, 'INÍCIO 2': h(10), 'FIM 2': h(11), 'CHAPA 3': 1002, 'INÍCIO 3': h(12), 'FIM 3': h(13),
      'CHAPA 4': 1002, 'INÍCIO 4': h(14), 'FIM 4': h(15), 'CHAPA 5': 1003, 'INÍCIO 5': h(16), 'FIM 5': h(17), 'CHAPA 6': 1003, 'INÍCIO 6': h(18), 'FIM 6': h(19), 'CHAPA 7': 1004, 'INÍCIO 7': h(20), 'FIM 7': h(21, 30), 'TURNO QUE FINALIZOU': 2, 'TEMPO/DEC': 7.5 }),
    row({ [maq]: extra.m ?? 'RAW09', DATA: 46296, 'Nº PEÇA': 2, 'PEÇA': 'LANÇA', MODELO: 'PC210F-10M0', 'CHAPA 1': 1001, 'INÍCIO 1': h(22), 'FIM 1': h(2), 'TURNO QUE FINALIZOU': 1 }),   // passa da meia-noite: 4 h
    row({ [maq]: extra.m ?? 'RAW09', DATA: 46296, 'Nº PEÇA': 3, 'PEÇA': 'LANÇA' }),                                                                             // linha preparada, sem horário
    row({})];                                                                                                                                                   // linha preparada, vazia
  const stopHead = [maq, 'Nº DA PEÇA', 'TURNO', 'DATA', 'CHAPA', 'INICIO', 'FINAL', 'CÓD', 'MOTIVO DA PARADA', 'DESCRIÇÃO DA PARADA', 'TTL', 'TEMPO/DEC', 'PEÇA'];
  const stopRows = [stopHead,
    [extra.m ?? 'RAW09', 1, 1, 46296, 1001, h(9), h(10), 5, null, 'sem peça', null, null, null],               // motivo só pelo código (planilha nunca aberta no Excel)
    [extra.m ?? 'RAW09', 1, 1, 46296, 1001, h(11), h(12), 4, 'TROCA DE PEÇA', '', null, null, null],         // nome já calculado
    [extra.m ?? 'RAW09', '—', 1, 46296, 1001, h(7), h(7, 20), 6, null, 'almoço', null, null, null],
    [null, null, null, null, null, null, null, null, null, null, null, null, null]];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(prodRows), 'PRODUÇÃO'); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(stopRows), 'PARADAS');
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
};

test('Excel novo: peça com 7 trechos numa linha só, horas somadas, código vira motivo e linhas preparadas ficam de fora', () => {
  const r = parseHistoryWorkbook(XLSX, novoXlsx());
  assert.equal(r.group, 'raw'); assert.equal(r.prod.length, 2); assert.equal(r.stops.length, 3);
  const [a, b] = r.prod;
  assert.equal(a.p, '1° OP LANÇA'); assert.equal(a.i1, '08:00'); assert.equal(a.f3, '13:00'); assert.equal(a.c3, '1002');
  assert.equal(a.xs, '1002|14:00|15:00;1003|16:00|17:00;1003|18:00|19:00;1004|20:00|21:30');
  assert.equal(prodHours(a), 7.5); assert.equal(a.h, 7.5); assert.equal(a.t, 2);
  assert.equal(b.h, 4); assert.equal(b.xs, undefined);                                    // meia-noite; sem trechos extras: registro igual ao de antes
  assert.deepEqual(r.stops.map((s) => s.mo), ['FALTA DE PEÇA', 'TROCA DE PEÇA', 'REFEIÇÃO']);
  assert.deepEqual(r.stops.map((s) => s.h), [1, 1, 1 / 3]);
  assert.equal(r.warnings.length, 0);
});

test('Excel novo da usinagem: coluna MAQUINA e códigos 9 (set-up) e 10 (ferramenta)', () => {
  const wb = XLSX.read(novoXlsx('MAQUINA', { m: 'UMC 01' }), { type: 'array' });
  const S = XLSX.utils.sheet_to_json(wb.Sheets.PARADAS, { header: 1 }); S[1][7] = 9; S[2][7] = 10; S[2][8] = null;
  wb.Sheets.PARADAS = XLSX.utils.aoa_to_sheet(S);
  const r = parseHistoryWorkbook(XLSX, XLSX.write(wb, { type: 'array', bookType: 'xlsx' }));
  assert.equal(r.group, 'usi'); assert.equal(r.prod[0].m, 'UMC 01');
  assert.deepEqual(r.stops.map((s) => s.mo), ['SET-UP', 'CONSUMIVEIS', 'REFEIÇÃO']);
});

test('trechos extras: a base guarda, não duplica no reenvio, a chapa final é a do último trecho e a auditoria enxerga todos', async () => {
  const { prod } = parseHistoryWorkbook(XLSX, novoXlsx());
  const { finalChapa, pairsOf, chapasOf } = await import('../src/core/history.js');
  assert.equal(finalChapa(prod[0]), '1004'); assert.equal(finalChapa(prod[1]), '1001');   // 1 trecho, turno 1 → chapa 1
  assert.equal(pairsOf(prod[0]).filter(([i]) => i).length, 7); assert.deepEqual(chapasOf(prod[0]).filter(Boolean), ['1001', '1001', '1002', '1002', '1003', '1003', '1004']);
  assert.notEqual(prodKey(prod[0]), prodKey({ ...prod[0], xs: '1002|14:00|15:00' }));
  assert.equal(prodKey(prod[1]), prodKey({ ...prod[1] }));
  process.env.ACCESS_CODE = 'abc'; const st = mem(); useStore(st);
  let r = await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'n1', prod: prod.map((x) => ({ ...x, t: x.t })), stops: [] } });
  assert.deepEqual(r.body.added, { prod: 2, stops: 0 });
  const got = (await call({ query: { g: 'raw' } })).body.prod.find((x) => x.p === '1° OP LANÇA');
  assert.equal(got.xs, prod[0].xs);
  r = await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'n2', prod, stops: [] } });
  assert.deepEqual(r.body.added, { prod: 0, stops: 0 });                                  // reenviar não duplica
  const bad = await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'n3', prod: [{ ...prod[1], d: '2026-10-05', xs: 'AB|ff:99|;|1;2;3;4;5;6;7;8;9;10' }], stops: [] } });
  const kept = (await call({ query: { g: 'raw' } })).body.prod.find((x) => x.d === '2026-10-05');
  assert.ok(!kept.xs || kept.xs.split(';').length <= 8); assert.ok(!/ff:99/.test(kept.xs ?? ''));   // horário inválido é descartado
  void bad;
});

test('editar uma peça com trechos extras na base não perde os trechos', async () => {
  process.env.ACCESS_CODE = 'abc'; useStore(mem());
  const { prod } = parseHistoryWorkbook(XLSX, novoXlsx());
  await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'e1', prod: [prod[0]], stops: [] } });
  const old = (await call({ query: { g: 'raw' } })).body.prod[0];
  const novo = prodRecord({ ...old, ob: 'conferida', h: undefined, tp: undefined });
  const r = await call({ method: 'POST', body: { g: 'raw', op: 'edit', changes: [{ kind: 'prod', old, new: novo }] } });
  assert.equal(r.code, 200); assert.equal(r.body.miss ?? 0, 0);
  const after = (await call({ query: { g: 'raw' } })).body.prod[0];
  assert.equal(after.ob, 'conferida'); assert.equal(after.xs, prod[0].xs); assert.equal(after.h, 7.5);
});

test('RAW e usinagem nunca se misturam: máquina de um grupo enviada ao outro é recusada', async () => {
  process.env.ACCESS_CODE = 'abc'; useStore(mem());
  const r = await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'x1', prod: [P(), P({ m: 'UMC 01' }), P({ m: 'HMC-16' })], stops: [S(), S({ m: 'NCBZ' })] } });
  assert.deepEqual(r.body.added, { prod: 1, stops: 1 }); assert.equal(r.body.invalid, 3);
  const u = await call({ method: 'POST', body: { g: 'usi', op: 'append', batch: 'x2', prod: [P(), P({ m: 'UMC 01' })], stops: [] } });
  assert.deepEqual(u.body.added, { prod: 1, stops: 0 }); assert.equal(u.body.invalid, 1);
});

test('API do histórico: parada com duas chapas ("12273 / 11647") volta inteira, sem cortar dígitos', async () => {
  process.env.ACCESS_CODE = 'abc';
  useStore(mem());
  const dois = S({ c: '12273 / 11647', mo: 'ELÉTRICA', ds: 'ALARME SHOCKSENSOR' });
  await call({ method: 'POST', body: { g: 'raw', op: 'append', batch: 'b1', prod: [P()], stops: [dois] } });
  const base = (await call({ query: { g: 'raw' } })).body;
  assert.equal(base.stops[0].c, '12273 / 11647');
  assert.equal(base.batches[0].op, 'append');
});
