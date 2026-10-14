import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan } from '../src/core/plan.js';

const P = (m, d, i, f, c, h) => ({ m, d, p: 'LANÇA', o: 'PC210-10M0', c1: c, i1: i, f1: f, c2: '', i2: '', f2: '', c3: '', i3: '', f3: '', t: 1, ob: '', h, tp: 0 });
const S = (m, d, c, i, f, h, mo) => ({ m, d, c, i, f, t: 1, mo, ds: '', h });
const days = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'];
const prod = days.map((d) => P('RAW05', d, '06:00', '14:00', '100', 8));
const stops = days.flatMap((d) => [S('RAW05', d, '100', '14:00', '17:00', 3, 'FALTA DE PEÇA'), S('RAW05', d, '100', '17:00', '18:00', 1, 'AGUARD. PEÇA'), S('RAW05', d, '100', '18:00', '18:30', 0.5, 'OUTROS')]);

test('plano: falta de peça e aguardando peça viram uma só ação, constante, com perda em reais', () => {
  const r = buildPlan({ prod, stops, valorHora: 100, today: '2026-12-31' });
  const a = r.actions.find((x) => x.id.startsWith('motivo-FALTADEPECA'));
  assert.ok(a, 'ação de falta de peça');
  assert.match(a.title, /FALTA DE PEÇA/); assert.match(a.title, /constante/);
  assert.equal(a.hours, 16);                  // (3 + 1) h × 4 dias
  assert.equal(a.money, 1600);
  assert.equal(a.owner, 'PCP / Almoxarifado / Compras');
  assert.ok(a.strata.length >= 3 && a.records.rows.length === 8);
  assert.equal(r.summary.perda, 100 * 18);    // 18 h paradas no total
});

test('plano: sem valor hora não inventa dinheiro; os dados vêm primeiro quando há erro', () => {
  const bad = [...prod, P('RAW05', '2026-08-03', '07:00', '09:00', '100', 2)];   // duas peças no mesmo horário
  const r = buildPlan({ prod: bad, stops, valorHora: 0, today: '2026-12-31' });
  assert.equal(r.actions[0].id, 'dados');
  assert.ok(r.actions.every((a) => a.money == null));
  assert.equal(r.summary.perda, null);
});

test('plano: período restringe os dias e registro no futuro é apontado', () => {
  const r = buildPlan({ prod, stops, dates: new Set(['2026-08-03']), today: '2026-12-31' });
  assert.equal(r.summary.dias, 1);
  const f = buildPlan({ prod, stops: [...stops, S('RAW05', '2026-12-30', '100', '10:00', '11:00', 1, 'OUTROS')], today: '2026-10-14' });
  assert.equal(f.actions[0].id, 'dados'); assert.ok(f.actions[0].strata[0].rows.some((x) => /data no futuro/.test(x[0])));
});
