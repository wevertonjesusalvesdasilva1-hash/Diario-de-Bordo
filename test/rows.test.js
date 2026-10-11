import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcile, buildPage, durationMin } from '../src/core/rows.js';
import { normChapa } from '../src/core/parse.js';
import { resetLists, learnAlias } from '../src/core/lists.js';

test('chapa: corrige só quando existe UMA chapa da lista a 1 dígito de distância', () => {
  const r = normChapa('7710');
  assert.equal(r.value, '7910');
  assert.match(r.flag, /corrigida de 7710/);
  assert.equal(normChapa('12213').value, '12273');
  // 11679 está a 1 dígito de 11678 e de 11647? (11647 → 2 dígitos). Só uma vizinha: corrige
  assert.equal(normChapa('11679').value, '11678');
  // sem vizinha única: mantém o lido e avisa
  const far = normChapa('55555');
  assert.equal(far.value, '55555');
  assert.equal(far.flag, 'chapa desconhecida');
});

const A = {
  maquina: 'RAW05', data: '02/10',
  producao: [{ linha: 1, data: '02/10', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: '7710', ini1: '7:54', fim1: '13:08', turno_finalizou: '1' }],
  paradas: [{ linha: 1, data: '02/10', chapa: '7910', ini: '07:45', fim: '07:54', turno: '1', motivo: 'TROCA DE PEÇA' }],
};
const B = {
  maquina: 'RAW05', data: '02/10',
  producao: [{ linha: 1, data: '02/10', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: '7910', ini1: '7:54', fim1: '13:06', turno_finalizou: '1' }],
  paradas: [{ linha: 1, data: '02/10', chapa: '7910', ini: '07:45', fim: '07:54', turno: '1', motivo: 'TROCA DE PEÇA' }, { linha: 2, data: '02/10', chapa: '7910', ini: '09:00', fim: '09:10', turno: '1', motivo: 'OUTROS' }],
};

test('duas leituras: a lista decide a chapa; horário que diverge fica marcado; linha só de uma leitura é sinalizada', () => {
  const page = buildPage(reconcile(A, B), { year: 2026, meta: { machineFromBubble: 'RAW05' } });
  const r = page.prod[0];
  assert.equal(r.chapa1, '7910');
  assert.equal(r.fim1, '13:08', 'mantém a leitura A quando ambas são plausíveis');
  assert.match(r.flags.fim1, /2ª leitura: "13:06"/);
  assert.match(r.flags.chapa1, /2ª leitura: "7710"/);
  assert.equal(page.stops.length, 2);
  assert.equal(page.stops[1].rowFlag, 'só uma das duas leituras viu esta linha');
});

test('checagens: duração absurda e data fora da folha', () => {
  assert.equal(durationMin('21:38', '03:00'), 322);
  const page = buildPage({ maquina: 'RAW05', data: '02/10', producao: [], paradas: [
    { linha: 1, data: '09/10', chapa: '7910', ini: '06:00', fim: '18:00', turno: '1', motivo: 'OUTROS' }] }, { year: 2026 });
  assert.match(page.stops[0].flags.fim, /parada de 12h/);
  assert.match(page.stops[0].flags.data, /diferente da data da folha/);
});

test('aprende correções do usuário', () => {
  resetLists();
  const j = { maquina: 'RAW05', data: '02/10', producao: [{ linha: 1, peca: 'LANÇA', modelo: 'PC210MO', ini1: '07:00', fim1: '08:00' }], paradas: [] };
  assert.ok(buildPage(j, { year: 2026 }).prod[0].flags.modelo);
  learnAlias('modelo', 'PC210MO', 'PC210F-10M0');
  const r = buildPage(j, { year: 2026 }).prod[0];
  assert.equal(r.modelo, 'PC210F-10M0');
  assert.equal(r.flags.modelo, undefined);
  resetLists();
});

test('motivo: a posição do X (pixels) vence a leitura da IA e a divergência fica avisada', async () => {
  const { applyInkMotivo } = await import('../src/core/rows.js');
  const page = buildPage({ maquina: 'RAW12', data: '02/10', producao: [], paradas: [
    { linha: 1, data: '02/10', chapa: '11833', ini: '08:20', fim: '08:50', turno: '1', motivo: 'TROCA DE PEÇA' },
    { linha: 2, data: '02/10', chapa: '11833', ini: '11:05', fim: '11:35', turno: '3', motivo: 'SET-UP' },
    { linha: 3, data: '02/10', chapa: '11833', ini: '12:20', fim: '13:20', turno: '1', motivo: null }] }, { year: 2026 });
  applyInkMotivo(page, [7, 7, 8]); // SET-UP, SET-UP, OUTROS
  assert.equal(page.stops[0].motivo, 'SET-UP');
  assert.match(page.stops[0].flags.motivo, /X está na coluna SET-UP; a IA leu TROCA DE PEÇA/);
  assert.equal(page.stops[1].flags.motivo, undefined, 'IA e pixels concordam: sem aviso');
  assert.equal(page.stops[2].motivo, 'OUTROS');
  assert.match(page.stops[1].flags.turno, /turno 3 é raro/);
});

test('duas leituras com numeração de linha diferente são pareadas pelo conteúdo', () => {
  const mk = (linha) => ({ linha, data: '02/10', chapa: '11833', ini: '08:20', fim: '08:50', turno: '1', motivo: 'SET-UP' });
  const A = { producao: [], paradas: [mk(2)] };
  const B = { producao: [], paradas: [mk(7)] };
  const m = reconcile(A, B);
  assert.equal(m.paradas.length, 1);
  assert.ok(!m.paradas[0].soUma);
});

test('nomes de máquina: RAW, UMC, HMC e NCBZ em qualquer grafia', async () => {
  const { normMachine } = await import('../src/core/rows.js');
  assert.equal(normMachine('RAW5'), 'RAW05');
  assert.equal(normMachine('RAW 12'), 'RAW12');
  assert.equal(normMachine('UMC-01'), 'UMC 01');
  assert.equal(normMachine('umc 2'), 'UMC 02');
  assert.equal(normMachine('HMC16'), 'HMC 16');
  assert.equal(normMachine('NCBZ'), 'NCBZ');
  assert.equal(normMachine('XYZ'), '');
});

test('folha de usinagem: máquina vem do nome escrito quando não há bolinha', () => {
  const page = buildPage({ maquina: 'UMC-01', data: '03/10', producao: [], paradas: [] }, { year: 2026, meta: { machineFromBubble: '' } });
  assert.equal(page.machine, 'UMC 01');
  assert.equal(page.machineFlag, null);
});

test('X na divisa de duas colunas: mantém a leitura da IA se for uma delas, mas avisa', async () => {
  const { applyInkMotivo } = await import('../src/core/rows.js');
  const page = buildPage({ maquina: 'RAW05', data: '02/10', producao: [], paradas: [
    { linha: 1, data: '02/10', chapa: '7910', ini: '08:00', fim: '08:10', turno: '1', motivo: 'SET-UP' },
    { linha: 2, data: '02/10', chapa: '7910', ini: '09:00', fim: '09:10', turno: '1', motivo: 'OUTROS' }] }, { year: 2026 });
  applyInkMotivo(page, [[6, 7], [6, 7]]); // TROCA DE PEÇA ou SET-UP
  assert.match(page.stops[0].flags.motivo, /tinta em duas colunas/);
  assert.match(page.stops[1].flags.motivo, /X entre TROCA DE PEÇA e SET-UP/);
});

test('exportação funciona mesmo sem o nome da máquina', async () => {
  const { allRows, workbookBytes } = await import('../src/core/export.js');
  const page = buildPage({ maquina: null, data: '02/10', producao: [{ linha: 1, data: '02/10', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: '7910', ini1: '07:00', fim1: '08:00', turno_finalizou: '1' }], paradas: [] }, { year: 2026 });
  assert.equal(page.machine, '');
  const { prod } = allRows([page]);
  assert.equal(prod[0][0], '');
  assert.ok(workbookBytes([page]).byteLength > 1000);
});

test('linhas numeradas à mão (1, 2, 9, 10) são realinhadas pela tinta; contagem diferente avisa', async () => {
  const { alignRows } = await import('../src/core/rows.js');
  const mk = (linha, ini) => ({ linha, data: '02/10', chapa: '11997', ini, fim: '23:59', turno: '2', motivo: 'OUTROS' });
  const page = buildPage({ maquina: 'UMC 01', data: '02/10', producao: [], paradas: [mk(1, '07:30'), mk(2, '09:40'), mk(9, '22:20'), mk(10, '00:40')] }, { year: 2026 });
  const warns = alignRows(page, { prodRows: [], stopRows: [0, 1, 3, 4], stopTurno: [false, false, false, true, true] });
  assert.deepEqual(page.stops.map((r) => r.linha), [1, 2, 4, 5]);
  assert.deepEqual(warns, []);
  assert.match(page.stops[0].flags.turno, /não está escrito na folha/);
  assert.equal(page.stops[3].flags.turno, undefined);
  const w2 = alignRows(page, { prodRows: [], stopRows: [0, 1, 2, 3, 4] });
  assert.match(w2[0], /5 parada\(s\) escrita\(s\) e foram lidas 4/);
});
