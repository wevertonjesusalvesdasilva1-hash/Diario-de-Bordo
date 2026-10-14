import test from 'node:test';
import assert from 'node:assert/strict';
import { maskTime, finishTime, timeProblem, isTimeField } from '../src/core/timemask.js';

test('digitando 1,1,1,1 fica 11:11 e os dois pontos sempre aparecem', () => {
  let v = '';
  const seq = [];
  for (const d of '1111') { v = maskTime(v + d); seq.push(v); }
  assert.deepEqual(seq, ['1', '11:', '11:1', '11:11']);
  assert.equal(maskTime('11111'), '11:11');
  assert.equal(maskTime('1a1b'), '11:');
  assert.equal(maskTime(''), '');
});

test('hora de um dígito (3 a 9) e apagar sem travar nos dois pontos', () => {
  assert.equal(maskTime('9'), '9:'); assert.equal(maskTime('930'), '9:30'); assert.equal(maskTime('245'), '2:45');
  assert.equal(maskTime('11:', { deleting: true }), '11'); assert.equal(maskTime('11:1', { deleting: true }), '11:1');
});

test('ao sair do campo vira sempre HH:MM', () => {
  assert.equal(finishTime('11:11'), '11:11'); assert.equal(finishTime('9:30'), '09:30'); assert.equal(finishTime('11'), '11:00');
  assert.equal(finishTime('9:'), '09:00'); assert.equal(finishTime('9:3'), '09:03'); assert.equal(finishTime(''), ''); assert.equal(finishTime('0730'), '07:30');
  // já formatado não muda mais (não oscila ao reaplicar)
  for (const v of ['07:05', '23:59', '00:00', '09:03']) assert.equal(maskTime(finishTime(v)), v);
});

test('hora fora de 00–23 ou minuto fora de 00–59 é inválido', () => {
  assert.equal(timeProblem('12:30'), null); assert.equal(timeProblem(''), null);
  assert.equal(timeProblem('25:00'), 'hora inválida'); assert.equal(timeProblem('12:60'), 'hora inválida'); assert.equal(timeProblem(finishTime('1260')), 'hora inválida');
  assert.ok(['ini1', 'fim3', 'ini', 'fim'].every(isTimeField)); assert.ok(!['chapa1', 'data', 'turno', 'motivo'].some(isTimeField));
});
