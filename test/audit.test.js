import test from 'node:test';
import assert from 'node:assert/strict';
import { auditData } from '../src/core/audit.js';

const P = (m, d, i, f, c, h, t = 1, p = 'LANÇA', o = 'PC210-10M0') => ({ m, d, p, o, c1: t === 1 ? c : '', i1: i, f1: f, c2: t === 2 ? c : '', i2: '', f2: '', c3: '', i3: '', f3: '', t, ob: '', h, tp: 0 });
const S = (m, d, c, i, f, h, mo = 'SET-UP', t = 1) => ({ m, d, c, i, f, t, mo, ds: '', h });
const find = (res, id) => res.find((c) => c.id === id);

test('duas peças ou paradas no mesmo horário (inclusive virando a meia-noite)', () => {
  const res = auditData({
    prod: [P('RAW05', '2026-08-01', '22:00', '02:00', '100', 4), P('RAW05', '2026-08-02', '01:00', '03:00', '200', 2), P('RAW05', '2026-08-02', '03:00', '05:00', '200', 2)],
    stops: [S('RAW05', '2026-08-01', '100', '10:00', '11:00', 1), S('RAW05', '2026-08-01', '100', '10:30', '11:30', 1), S('RAW05', '2026-08-01', '100', '12:00', '13:00', 1)],
  });
  assert.equal(find(res, 'p-over').count, 1);        // 22:00–02:00 cruza a meia-noite e bate com 01:00–03:00 do dia seguinte; 03:00–05:00 não bate
  assert.equal(find(res, 's-over').count, 1);
  assert.ok(Math.abs(find(res, 's-over').hours - 0.5) < 1e-9);
});

test('chapa final em branco, horário faltando, repetidos e motivo escrito de dois jeitos', () => {
  const res = auditData({
    prod: [P('RAW06', '2026-08-03', '06:00', '08:00', '', 2), P('RAW06', '2026-08-03', '09:00', '', '100', 0), P('RAW06', '2026-08-03', '10:00', '11:00', '100', 1), P('RAW06', '2026-08-03', '10:00', '11:00', '100', 1)],
    stops: [S('RAW06', '2026-08-03', '100', '06:00', '07:00', 1, 'AGUARD. PEÇA'), S('RAW06', '2026-08-03', '100', '08:00', '09:00', 1, 'AGUARDANDO PEÇA'), S('RAW06', '2026-08-03', '100', '', '', 0, '')],
  });
  assert.equal(find(res, 'p-chapa').count, 1);
  assert.equal(find(res, 'p-time').count, 1);
  assert.equal(find(res, 'p-dup').count, 1);
  assert.equal(find(res, 's-mot').count, 1);
  assert.ok(find(res, 's-miss').count >= 2);          // sem horário e sem motivo
});

test('máquina com mais de 24 h no dia e parada sem produção da mesma chapa', () => {
  const res = auditData({ prod: [P('RAW09', '2026-08-04', '00:00', '20:00', '100', 20)], stops: [S('RAW09', '2026-08-04', '100', '20:00', '23:59', 5), S('RAW09', '2026-08-04', '999', '21:00', '22:00', 1)] });
  assert.equal(find(res, 'd-24').count, 1);
  assert.equal(find(res, 's-nolink').count, 1);
});

import { standardByPieceModel } from '../src/core/history.js';
test('padrão de outra máquina só dentro do mesmo grupo (solda x usinagem não se misturam)', () => {
  assert.ok(standardByPieceModel('LANÇA', 'PC360LC-8M2', 'NCBZ') > 0);          // usinagem tem esse padrão
  const raw = standardByPieceModel('LANÇA', 'PC360LC-8M2', 'RAW05');
  assert.ok(raw === 0 || raw > 2, 'o padrão da usinagem (≈0,9 h) não pode valer para o robô');
  assert.equal(standardByPieceModel('PEÇA QUE NÃO EXISTE', 'X', 'RAW05'), 0);
});
