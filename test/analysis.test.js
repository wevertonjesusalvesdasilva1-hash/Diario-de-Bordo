import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, fmtDur, standardHours } from '../src/core/analysis.js';

const prod = (linha, data, extra) => ({ linha, data, peca: 'LANÇA', modelo: 'PC210F-10M0', obs: '', flags: {}, ...extra });
const stop = (linha, data, ini, fim, motivo, extra = {}) => ({ linha, data, chapa: '7910', ini, fim, turno: '1', motivo, desc: '', flags: {}, ...extra });

// Folha 1 do exemplo (RAW05), já conferida
const folha1 = (fim4 = '08:40') => ({
  id: 1, label: 'folha 1', machine: 'RAW05', date: '02/10/2026',
  prod: [
    prod(1, '02/10/2026', { chapa1: '7910', ini1: '07:54', fim1: '13:08' }),
    prod(2, '02/10/2026', { chapa1: '12273', ini1: '13:25', fim1: '17:30', chapa2: '11678', ini2: '20:40', fim2: '21:20' }),
    prod(3, '02/10/2026', { chapa2: '11678', ini2: '21:38', fim2: '03:00' }),
    prod(4, '03/10/2026', { chapa1: '7910', ini1: '05:30', fim1: fim4, chapa2: '11678', ini2: '03:15', fim2: '05:20' }),
  ],
  stops: [
    stop(1, '02/10/2026', '07:45', '07:54', 'TROCA DE PEÇA'),
    stop(2, '02/10/2026', '13:08', '13:25', 'TROCA DE PEÇA'),
    stop(3, '02/10/2026', '21:20', '21:38', 'TROCA DE PEÇA'),
    stop(4, '03/10/2026', '03:00', '03:15', 'TROCA DE PEÇA'),
  ],
});

test('formato de duração', () => {
  assert.equal(fmtDur(45), '45 min');
  assert.equal(fmtDur(125), '2h05');
});

test('tempo padrão vem da matriz da planilha', () => {
  assert.equal(standardHours('RAW05', 'LANÇA', 'PC210F-10M0'), 4.717);
  assert.equal(standardHours('RAW05', 'lança', 'pc210f-10m0'), 4.717);
  assert.equal(standardHours('RAW05', 'XYZ', 'ABC'), null);
});

test('folha conferida: horários fecham entre produção e paradas, sem alertas altos', () => {
  const a = analyze([folha1()]);
  const m = a.machines[0];
  assert.equal(m.name, 'RAW05');
  assert.equal(m.transitions.overlaps, 0);
  assert.equal(a.totals.alta, 0);
  assert.ok(m.transitions.ok >= 7, `fecham ${m.transitions.ok} de ${m.transitions.total}`);
  assert.equal(m.stops, 4);
  assert.equal(m.motivos[0].motivo, 'TROCA DE PEÇA');
  assert.equal(m.stopMin, 9 + 17 + 18 + 15);
});

test('horário errado de uma parada (22:38 em vez de 22:58) aparece como intervalo sem registro', () => {
  const page = {
    id: 2, label: 'folha 7', machine: 'RAW12', date: '02/10/2026',
    prod: [prod(6, '02/10/2026', { peca: 'S-CASE', modelo: 'D61-24', chapa2: '11596', ini2: '21:12', fim2: '22:15' }),
           prod(7, '02/10/2026', { peca: 'S-CASE', modelo: 'D61-24', chapa2: '11596', ini2: '22:58', fim2: '00:10' })],
    stops: [stop(10, '02/10/2026', '22:15', '22:38', 'AGUARD. PEÇA')],
  };
  const a = analyze([page]);
  const gap = a.issues.find((i) => i.kind === 'sem registro' && i.sev === 'media');
  assert.ok(gap, 'deveria apontar a lacuna');
  assert.match(gap.text, /22:38 e 22:58 \(20 min\)/);
});

test('horário final errado (14:00 em vez de 08:40) vira alerta de tempo contra o padrão', () => {
  const certo = analyze([folha1('08:40')]).issues.filter((i) => i.kind === 'acima do padrão');
  assert.equal(certo.length, 0);
  const errado = analyze([folha1('14:00')]).issues.find((i) => i.kind === 'acima do padrão');
  assert.ok(errado);
  assert.equal(errado.linha, 4);
  assert.match(errado.text, /224 %|22\d %/);
});

test('sobreposição entre parada e produção é alerta alto', () => {
  const page = {
    id: 3, label: 'f', machine: 'RAW12', date: '02/10/2026',
    prod: [prod(2, '02/10/2026', { peca: 'ESTRUTURA', modelo: 'D61-24', chapa1: '11833', ini1: '11:30', fim1: '14:10' })],
    stops: [stop(3, '02/10/2026', '11:05', '11:35', 'SET-UP')],
  };
  const a = analyze([page]);
  const ov = a.issues.find((i) => i.kind === 'produzindo parado');
  assert.ok(ov);
  assert.equal(ov.sev, 'alta');
  assert.match(ov.text, /5 min em comum/);
});

test('parada sem motivo, OUTROS sem descrição e linha sem data são sinalizados', () => {
  const page = {
    id: 4, label: 'f', machine: '', date: '',
    prod: [prod(1, '', { chapa1: '7910', ini1: '07:00', fim1: '08:00' })],
    stops: [stop(1, '02/10/2026', '09:00', '09:10', ''), stop(2, '02/10/2026', '10:00', '10:10', 'OUTROS')],
  };
  const a = analyze([page]);
  assert.equal(a.machines[0].name, 'SEM MÁQUINA');
  assert.ok(a.issues.some((i) => i.kind === 'sem motivo'));
  assert.ok(a.issues.some((i) => i.kind === 'sem descrição'));
  assert.ok(a.issues.some((i) => i.kind === 'incompleto'));
});

test('Excel ganha a aba ANÁLISE só quando há análise; PRODUÇÃO e PARADAS ficam iguais', async () => {
  const { workbookBytes } = await import('../src/core/export.js');
  const XLSX = await import('xlsx');
  const page = folha1('14:00');
  const sem = XLSX.read(workbookBytes([page]), { type: 'array' });
  assert.deepEqual(sem.SheetNames, ['PRODUÇÃO', 'PARADAS']);
  const a = analyze([page]); a.ai = ['Conferir a linha 4 da folha 1'];
  const com = XLSX.read(workbookBytes([page], a), { type: 'array' });
  assert.deepEqual(com.SheetNames, ['PRODUÇÃO', 'PARADAS', 'ANÁLISE']);
  const txt = XLSX.utils.sheet_to_csv(com.Sheets['ANÁLISE']);
  assert.match(txt, /Resumo da IA/);
  assert.match(txt, /acima do padrão/);
  assert.match(txt, /TROCA DE PEÇA/);
  // a base continua igual com ou sem a análise
  assert.equal(XLSX.utils.sheet_to_csv(com.Sheets['PRODUÇÃO']), XLSX.utils.sheet_to_csv(sem.Sheets['PRODUÇÃO']));
});

test('exemplo do almoço: produção das 07:50 às 13:00 com parada de almoço 11:30–12:30', () => {
  const page = {
    id: 4, label: 'f', machine: 'RAW05', date: '14/10/2026',
    prod: [prod(1, '14/10/2026', { chapa1: '7910', ini1: '07:50', fim1: '13:00' })],
    stops: [stop(1, '14/10/2026', '11:30', '12:30', 'OUTROS', { desc: 'almoço' })],
  };
  const a = analyze([page]);
  const c = a.cards.find((x) => x.kind === 'produzindo parado');
  assert.ok(c);
  assert.match(c.headline, /RAW05 · folha do dia 14\/10/);
  assert.match(c.headline, /07:50–13:00/);
  assert.match(c.headline, /11:30–12:30/);
});

test('troca de peça de 40 min sem comentário é apontada; com comentário também, mas como média', () => {
  const mk = (desc) => ({ id: 5, label: 'f', machine: 'RAW05', date: '14/10/2026', prod: [],
    stops: [stop(1, '14/10/2026', '09:00', '09:40', 'TROCA DE PEÇA', { desc })] });
  const sem = analyze([mk('')]).cards.find((x) => x.kind === 'parada longa');
  assert.ok(sem); assert.equal(sem.sev, 'alta'); assert.match(sem.headline, /Não há comentário/);
  const com = analyze([mk('quebrou gabarito')]).cards.find((x) => x.kind === 'parada longa');
  assert.equal(com.sev, 'media'); assert.match(com.headline, /quebrou gabarito/);
  assert.equal(analyze([{ ...mk(''), stops: [stop(1, '14/10/2026', '09:00', '09:20', 'TROCA DE PEÇA')] }]).cards.filter((x) => x.kind === 'parada longa').length, 0);
});

import { recordEdit, recordRemoval, collectEdits, describeEdit } from '../src/core/edits.js';
test('alterações do usuário: guarda o valor lido, desfaz se voltar ao original e aparece na análise', () => {
  const page = { id: 9, label: 'f9', machine: 'RAW05', date: '14/10/2026', prod: [prod(1, '14/10/2026', { chapa1: '7910', ini1: '07:50', fim1: '13:00' })], stops: [] };
  const r = page.prod[0];
  recordEdit(r, 'fim1', r.fim1, '05:40'); r.fim1 = '05:40';
  recordEdit(r, 'fim1', r.fim1, '05:45'); r.fim1 = '05:45';
  assert.equal(r.edits.fim1.from, '13:00'); assert.equal(r.edits.fim1.to, '05:45');
  recordEdit(r, 'obs', r.obs, 'parcial'); r.obs = 'parcial';
  assert.equal(r.edits.obs.from, '');
  const list = collectEdits([page]);
  assert.equal(list.length, 2);
  assert.equal(list.find((e) => e.field === 'Fim (1º turno)').kind, 'alterado');
  assert.equal(list.find((e) => e.field === 'Observações').kind, 'preenchido');
  assert.match(describeEdit(list[0]), /a leitura tinha "13:00", você mudou para "05:45"/);
  recordEdit(r, 'fim1', r.fim1, '13:00'); r.fim1 = '13:00';
  assert.equal(r.edits.fim1, undefined);
  assert.equal(analyze([page]).edits.length, 1);
  recordRemoval(page, 'prod', r, 0);
  assert.equal(collectEdits([page]).at(-1).kind, 'linha excluída');
});
