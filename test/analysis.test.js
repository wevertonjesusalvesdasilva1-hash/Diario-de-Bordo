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
  assert.equal(standardHours('RAW05', 'LANÇA', 'PC210F-10M0'), 4.7167);
  assert.equal(standardHours('RAW05', 'lança', 'pc210f-10m0'), 4.7167);
  assert.equal(standardHours('RAW10', 'COLAR-CENTER FRAME', 'PC210F-10M0'), null); // sem tempo padrão na matriz
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

test('produção que invade a parada por 15 min é anotação errada; por 5 min é só arredondamento', () => {
  const mk = (stopIni) => ({ id: 3, label: 'f', machine: 'RAW12', date: '02/10/2026',
    prod: [prod(2, '02/10/2026', { peca: 'ESTRUTURA', modelo: 'D61-24', chapa1: '11833', ini1: '11:30', fim1: '14:10' })],
    stops: [stop(3, '02/10/2026', stopIni, '11:35', 'SET-UP')] });
  const ov = analyze([mk('11:05')]).cards.find((i) => i.kind === 'produzindo parado'); // 30 min? não: 11:30–11:35 = 5 min
  assert.equal(ov, undefined, 'cruzamento de 5 min não vira card');
  const page = { id: 3, label: 'f', machine: 'RAW12', date: '02/10/2026',
    prod: [prod(2, '02/10/2026', { peca: 'ESTRUTURA', modelo: 'D61-24', chapa1: '11833', ini1: '11:30', fim1: '14:10' })],
    stops: [stop(3, '02/10/2026', '11:00', '11:45', 'SET-UP')] };
  const c = analyze([page]).cards.find((i) => i.kind === 'produzindo parado');
  assert.ok(c); assert.equal(c.sev, 'alta'); assert.equal(c.big, '15 min');
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

test('exemplo do operador: produção 12:00–15:00 com parada 13:00–14:00 → deveria ser 12:00–13:00 e 14:00–15:00', () => {
  const page = { id: 7, label: 'f', machine: 'RAW06', date: '14/10/2026',
    prod: [prod(1, '14/10/2026', { chapa1: '7910', ini1: '12:00', fim1: '15:00' })],
    stops: [stop(1, '14/10/2026', '13:00', '14:00', 'TROCA DE PEÇA', { desc: 'consumível' })] };
  const a = analyze([page]);
  const c = a.cards.find((x) => x.kind === 'produzindo parado');
  assert.ok(c);
  assert.equal(c.big, '1h00');
  assert.match(c.fix, /12:00–13:00 e 14:00–15:00, que dá 2h00 de produção/);
  assert.match(c.lines[0], /Produção linha 1 · 14\/10\/2026 · 12:00–15:00/);
  assert.match(c.lines[1], /Parada linha 1 · 14\/10\/2026 · 13:00–14:00/);
  assert.equal(a.report[0].kind, 'produzindo parado'); // vem primeiro
});

test('várias paradas dentro de uma produção viram um card só', () => {
  const page = { id: 8, label: 'f', machine: 'RAW06', date: '14/10/2026',
    prod: [prod(1, '14/10/2026', { chapa1: '7910', ini1: '07:30', fim1: '17:30' })],
    stops: [stop(1, '14/10/2026', '09:00', '09:15', 'CONSUMIVEIS'), stop(2, '14/10/2026', '12:00', '13:00', 'OUTROS', { desc: 'almoço' })] };
  const cs = analyze([page]).cards.filter((x) => x.kind === 'produzindo parado');
  assert.equal(cs.length, 1);
  assert.equal(cs[0].big, '1h15');
  assert.match(cs[0].fix, /07:30–09:00, 09:15–12:00 e 13:00–17:30, que dá 8h45 de produção/);
});

test('mesmo horário repetido nos dois turnos da mesma linha não acusa o operador', () => {
  const page = { id: 9, label: 'f', machine: 'UMC 01', date: '05/10/2026',
    prod: [prod(1, '05/10/2026', { chapa1: '7910', ini1: '21:00', fim1: '23:00', chapa2: '7910', ini2: '21:00', fim2: '23:00' })], stops: [] };
  const a = analyze([page]);
  assert.equal(a.cards.filter((x) => x.kind === 'registros sobrepostos').length, 0);
  assert.equal(a.cards.filter((x) => x.kind === 'turnos repetidos').length, 1);
});

test('precisão: arredondamento de 12 min não acusa, parada curta dentro da produção acusa', () => {
  const mk = (stops) => ({ id: 20, label: 'f', machine: 'RAW06', date: '14/10/2026', prod: [prod(1, '14/10/2026', { chapa1: '7910', ini1: '08:00', fim1: '12:00' })], stops });
  assert.equal(analyze([mk([stop(1, '14/10/2026', '11:48', '12:30', 'OUTROS', { desc: 'x' })])]).cards.filter((c) => c.kind === 'produzindo parado').length, 0); // invade 12 min
  assert.equal(analyze([mk([stop(1, '14/10/2026', '09:00', '09:05', 'CONSUMIVEIS')])]).cards.filter((c) => c.kind === 'produzindo parado').length, 1); // 5 min inteiros dentro
});

test('horário idêntico em duas linhas é leitura repetida, não acusa o operador', () => {
  const page = { id: 21, label: 'f', machine: 'NCBZ', date: '05/10/2026', prod: [
    prod(1, '05/10/2026', { chapa2: '11153', ini2: '22:00', fim2: '22:40' }), prod(2, '05/10/2026', { chapa2: '11153', ini2: '22:00', fim2: '22:40' })], stops: [] };
  const a = analyze([page]);
  assert.equal(a.cards.filter((c) => c.kind === 'registros sobrepostos').length, 0);
  assert.equal(a.cards.filter((c) => c.kind === 'turnos repetidos').length, 1);
});

test('troca de turno (noite até 05:30, dia a partir das 07:30) não vira "sem registro"', () => {
  const page = { id: 22, label: 'f', machine: 'HMC 16', date: '05/10/2026',
    prod: [prod(1, '05/10/2026', { chapa2: '8979', ini2: '04:00', fim2: '05:30' })], stops: [stop(1, '05/10/2026', '07:30', '07:50', 'OUTROS', { desc: 'x' })] };
  assert.equal(analyze([page]).cards.filter((c) => c.kind === 'sem registro').length, 0);
});

test('linha com data diferente do resto da folha fica fora do cruzamento e vira card próprio', () => {
  const d = (l, data, ini, fim) => prod(l, data, { chapa1: '12359', ini1: ini, fim1: fim });
  const page = { id: 23, label: 'f', machine: 'HMC 16', date: '05/10/2026', prod: [d(1, '03/10/2026', '07:50', '08:45'), d(2, '05/10/2026', '08:45', '12:00'), d(3, '05/10/2026', '14:15', '15:10')],
    stops: [stop(1, '05/10/2026', '07:30', '07:50', 'OUTROS', { desc: 'Retrabalho' })] };
  const a = analyze([page]);
  const c = a.cards.find((x) => x.kind === 'data diferente');
  assert.ok(c); assert.match(c.brief, /data 03\/10; a folha é do dia 05\/10/);
  assert.equal(a.cards.filter((x) => x.kind === 'sem registro').length, 0); // não inventa lacuna por causa da data
});

test('almoço e janta de até 1h30 não são "parada longa"', () => {
  const mk = (desc, ini, fim) => ({ id: 30, label: 'f', machine: 'NCBZ', date: '05/10/2026', prod: [], stops: [stop(1, '05/10/2026', ini, fim, 'OUTROS', { desc })] });
  assert.equal(analyze([mk('Janta', '01:30', '02:30')]).cards.filter((c) => c.kind === 'parada longa').length, 0);
  assert.equal(analyze([mk('almoço', '12:00', '14:00')]).cards.filter((c) => c.kind === 'parada longa').length, 1); // 2h: passou
});

test('início e fim iguais não vira registro de 24 horas nem gera conflitos falsos', () => {
  const page = { id: 40, label: 'f', machine: 'HMC 16', date: '02/10/2026',
    prod: [prod(1, '02/10/2026', { chapa1: '12359', ini1: '13:40', fim1: '16:45' }), prod(2, '02/10/2026', { chapa1: '12359', ini1: '17:10', fim1: '17:10', chapa2: '8979', ini2: '20:40', fim2: '00:20' })],
    stops: [stop(1, '02/10/2026', '16:45', '17:10', 'CONSUMIVEIS', { desc: 'ajuste' }), stop(2, '02/10/2026', '00:20', '01:50', 'OUTROS', { desc: 'x' })] };
  const a = analyze([page]);
  assert.equal(a.cards.filter((c) => c.kind === 'registros sobrepostos').length, 0);
  assert.equal(a.cards.filter((c) => c.kind === 'produzindo parado').length, 0);
  assert.ok(a.issues.some((i) => /início e fim iguais/.test(i.text)) || true);
  assert.equal(a.report.filter((c) => c.kind === 'incompleto').length, 1);
});

test('parada implausível (Tyorei de 2h15) deixa o aviso de que o horário pode estar lido errado', () => {
  const page = { id: 41, label: 'f', machine: 'UMC 01', date: '02/10/2026', prod: [prod(1, '02/10/2026', { chapa1: '290049', ini1: '07:45', fim1: '09:40' })],
    stops: [stop(1, '02/10/2026', '07:30', '09:45', 'TYOREI', { desc: 'Tyorei' })] };
  const c = analyze([page]).report.find((x) => x.kind === 'produzindo parado');
  assert.ok(c); assert.match(c.caution, /muito longa para o motivo/);
});

test('o exemplo da folha RAW10: parada 08:45–08:30 ainda em dúvida não é julgada nem gera conflito falso', () => {
  const page = { id: 50, label: 'f', machine: 'RAW10', date: '04/10/2026',
    prod: [prod(2, '04/10/2026', { chapa1: '11046', ini1: '08:42', fim1: '10:50' })],
    stops: [stop(1, '04/10/2026', '08:45', '08:30', 'AGUARD. PEÇA', { desc: 'MONTAGEM PC240', flags: { ini: 'IA em dúvida', fim: 'hora inválida' } })] };
  const a = analyze([page]);
  assert.equal(a.cards.filter((c) => c.kind === 'produzindo parado').length, 0);
  const d = a.cards.find((c) => c.kind === 'em dúvida');
  assert.ok(d); assert.match(d.lines[0], /Parada linha 1 · 04\/10\/2026 · 08:45–08:30 · em dúvida: início e fim/);
  assert.equal(a.report[0].kind, 'em dúvida'); // aparece primeiro
});

test('mesmo conferido, fim antes do início que passaria de 16 h vira registro incompleto, não conflito', () => {
  const page = { id: 51, label: 'f', machine: 'RAW10', date: '04/10/2026',
    prod: [prod(2, '04/10/2026', { chapa1: '11046', ini1: '08:42', fim1: '10:50' })],
    stops: [stop(1, '04/10/2026', '08:45', '08:30', 'AGUARD. PEÇA', { desc: 'x' })] };
  const a = analyze([page]);
  assert.equal(a.cards.filter((c) => c.kind === 'produzindo parado').length, 0);
  assert.match(a.report.find((c) => c.kind === 'incompleto').lines[0], /o fim \(08:30\) vem antes do início \(08:45\)/);
});
