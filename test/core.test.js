import test from 'node:test';
import assert from 'node:assert/strict';
import { normTime, normChapa, normTurno, normDate, normPeca, normModelo } from '../src/core/parse.js';
import { buildPage } from '../src/core/rows.js';
import { allRows, toTSV, workbookBytes } from '../src/core/export.js';
import * as XLSX from 'xlsx';

test('horários', () => {
  assert.deepEqual(normTime('7:54'), { value: '07:54', flag: null });
  assert.equal(normTime('5.30').value, '05:30');
  assert.equal(normTime('0300').value, '03:00');
  assert.equal(normTime('25:10').flag, 'hora inválida');
  assert.equal(normTime('abc').flag, 'ilegível');
});

test('chapa: aceita as conhecidas e sinaliza as demais', () => {
  assert.deepEqual(normChapa('11678'), { value: '11678', flag: null });
  const fixed = normChapa('11679');
  assert.equal(fixed.value, '11678', 'corrige quando só uma chapa da lista está a 1 dígito');
  assert.match(fixed.flag, /corrigida de 11679/);
  assert.equal(normChapa('99999').flag, 'chapa desconhecida');
});

test('turno, data, peça, modelo', () => {
  assert.equal(normTurno('2º').value, '2');
  assert.equal(normDate('02-10', 2026).value, '02/10/2026');
  assert.equal(normDate('32/10', 2026).flag, 'data inválida');
  assert.equal(normPeca('lança').value, 'LANÇA');
  assert.equal(normModelo('pc210-10m0').value, 'PC210-10M0');
  const m = normModelo('PC210');
  assert.equal(m.value, 'PC210', 'não troca o valor lido');
  assert.ok(m.flag);
});

const sample = {
  maquina: 'RAW05', data: '02/10',
  producao: [
    { linha: 1, data: '02/10', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: '7910', ini1: '7:54', fim1: '13:08', turno_finalizou: '1' },
    { linha: 2, data: '02/10', peca: 'LANÇA', modelo: 'PC210F-10M0', chapa1: '12273', ini1: '13:25', fim1: '17:30', chapa2: '11678', ini2: '20:40', fim2: '21:20', turno_finalizou: '2' },
  ],
  paradas: [{ linha: 1, data: null, chapa: '7910', ini: '07:45', fim: '07:54', turno: '1', motivo: 'TROCA DE PEÇA', descricao: null, duvidas: ['ini'] }],
};

test('linhas: normaliza, herda data do cabeçalho e marca dúvidas', () => {
  const page = buildPage(sample, { year: 2026, meta: { machineFromBubble: 'RAW05' } });
  assert.equal(page.machine, 'RAW05');
  assert.equal(page.prod[0].ini1, '07:54');
  assert.equal(page.stops[0].data, '02/10/2026');
  assert.equal(page.stops[0].flags.data, 'data do cabeçalho');
  assert.equal(page.stops[0].flags.ini, 'IA em dúvida');
});

test('exportação: texto para colar e planilha', () => {
  const page = buildPage(sample, { year: 2026, meta: { machineFromBubble: 'RAW05' } });
  const { prod, stops } = allRows([page]);
  assert.equal(prod[0].length, 15);
  assert.equal(stops[0].length, 8);
  assert.equal(toTSV(prod).split('\n')[0].split('\t')[0], 'RAW05');
  const wb = XLSX.read(workbookBytes([page]), { type: 'array', cellDates: true });
  assert.deepEqual(wb.SheetNames, ['PRODUÇÃO', 'PARADAS']);
  const ws = wb.Sheets['PRODUÇÃO'];
  assert.equal(ws.B3.v, 'RAW05');
  assert.equal(ws.G3.w, '07:54');
  assert.equal(ws.A3.f, 'CONCATENATE(B3&D3&E3)');
});

test('decodifica códigos HTML do resumo da IA, mesmo sem ponto e vírgula', async () => {
  const { decodeEntities } = await import('../src/core/text.js');
  assert.equal(decodeEntities('sobreposi&ccedil&atilde&o de 2h00 em produ&ccedil&otilde&es'), 'sobreposição de 2h00 em produções');
  assert.equal(decodeEntities('AGUARD. PE&Ccedil;A &mdash; coment&aacute;rio'), 'AGUARD. PEÇA &mdash; comentário');
  assert.equal(decodeEntities('padr&atilde&o e valida&ccedil&atilde&o'), 'padrão e validação');
});

import { fitToBudget } from '../src/core/fit.js';
test('imagens pesadas são reduzidas até caber em uma requisição', () => {
  // pretend every image weighs 1.6M characters at q 0.9 and scale 1 (heavy, noisy scan), proportional to q and scale²
  const enc = (q, k) => [0, 1, 2].map(() => 'x'.repeat(Math.round(1_600_000 * (q / 0.9) * k * k)));
  const out = fitToBudget(enc, { q: 0.9 });
  assert.ok(out.reduce((n, s) => n + s.length, 0) <= 3_400_000);
  // a light scan is left untouched
  const light = fitToBudget((q) => ['y'.repeat(Math.round(500_000 * q))], { q: 0.9 });
  assert.equal(light[0].length, 450_000);
  // impossible budget: stops at the floor instead of looping forever
  assert.ok(fitToBudget(() => ['z'.repeat(9_000_000)], { q: 0.9 })[0].length === 9_000_000);
});

import { jpegToPdf } from '../src/core/pdfimg.js';
import { cardMarks } from '../src/core/marks.js';
test('PDF de uma imagem: cabeçalho, tabela de posições e fim corretos', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const pdf = jpegToPdf(jpeg, 1800, 1300);
  const txt = new TextDecoder('latin1').decode(pdf);
  assert.ok(txt.startsWith('%PDF-1.4') && txt.trimEnd().endsWith('%%EOF') && txt.includes('/DCTDecode') && txt.includes('/Width 1800'));
  const start = Number(txt.match(/startxref\n(\d+)/)[1]);
  assert.equal(txt.slice(start, start + 4), 'xref');
  const offs = [...txt.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offs.forEach((o, i) => assert.equal(txt.slice(o, o + 7), `${i + 1} 0 obj`));
});
test('marcações do card: linha inteira e células pedidas', () => {
  const page = { sheetGeo: { prod: { y: [0.1, 0.2, 0.3], x0: 0.1, x1: 0.9 } }, crop: { prod: { cols: [[0, 0.1], [0.1, 0.3], [0.3, 0.5], [0.5, 0.6], [0.6, 0.7]] } } };
  const marks = cardMarks({ refs: [{ table: 'prod', linha: 2, fields: ['chapa1', 'zzz'] }] }, page);
  assert.equal(marks.length, 2);
  assert.equal(marks[0].kind, 'row'); assert.ok(Math.abs(marks[0].y - 0.2) < 1e-9);
  assert.equal(marks[1].kind, 'cell'); assert.ok(marks[1].x > 0.1 && marks[1].w < 0.8);
  assert.deepEqual(cardMarks({ refs: [{ table: 'stops', linha: 1 }] }, page), []);
});
test('marcações: o ajuste feito com as setas desloca só a caixa escolhida', () => {
  const page = { sheetGeo: { prod: { y: [0.1, 0.2, 0.3], x0: 0.1, x1: 0.9 } }, markAdj: { 'prod|2|row': [0.01, -0.005] } };
  const [row] = cardMarks({ refs: [{ table: 'prod', linha: 2 }, { table: 'prod', linha: 1 }] }, page);
  assert.ok(Math.abs(row.x - 0.11) < 1e-9 && Math.abs(row.y - 0.195) < 1e-9);
  const other = cardMarks({ refs: [{ table: 'prod', linha: 1 }] }, page)[0];
  assert.ok(Math.abs(other.x - 0.1) < 1e-9 && Math.abs(other.y - 0.1) < 1e-9);
});
import { jpegsToPdf } from '../src/core/pdfimg.js';
test('PDF de várias folhas: uma página por imagem e tabela de posições correta', () => {
  const j = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = jpegsToPdf([{ jpeg: j, w: 1800, h: 1300 }, { jpeg: j, w: 1800, h: 1350 }, { jpeg: j, w: 1800, h: 1300 }]);
  const txt = new TextDecoder('latin1').decode(pdf);
  assert.match(txt, /\/Count 3/);
  assert.equal((txt.match(/\/Type \/Page /g) ?? []).length, 3);
  const start = Number(txt.match(/startxref\n(\d+)/)[1]);
  assert.equal(txt.slice(start, start + 4), 'xref');
  const offs = [...txt.matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  assert.equal(offs.length, 11);
  offs.forEach((o, i) => assert.equal(txt.slice(o, o + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
});
