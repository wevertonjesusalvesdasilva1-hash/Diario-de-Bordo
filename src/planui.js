// "4 · Plano de ação": the actions to take, in a vertical timeline (each action branches off the line), with the cost of the stopped robot.
import './plan.css';
import { el } from './bicharts.js';
import { loadBase } from './historico.js';
import { buildPlan, brl } from './core/plan.js';
import { dmy } from './core/history.js';
import { getOperators } from './core/operators.js';
import { openRecords, biTable } from './biui.js';

const GROUPS = { raw: 'RAW (robôs)', usi: 'Usinagem' };
const st = { seq: 0, g: 'raw', period: '30', money: { raw: '', usi: '' }, done: {} };
try { const g = localStorage.getItem('bi.g'); if (g === 'raw' || g === 'usi') st.g = g; st.money = { raw: '', usi: '', ...JSON.parse(localStorage.getItem('mt-valorhora') || '{}') }; st.done = JSON.parse(localStorage.getItem('mt-plano-feito') || '{}'); } catch { /* no storage */ }
const save = () => { try { localStorage.setItem('mt-valorhora', JSON.stringify(st.money)); localStorage.setItem('mt-plano-feito', JSON.stringify(st.done)); localStorage.setItem('bi.g', st.g); } catch { /* ignore */ } };
export const setPlanGroup = (g) => { if (GROUPS[g]) st.g = g; };
const f1 = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TONE = { bad: '#fb7185', warn: '#fbbf24', info: '#60a5fa', ok: '#a3e635' };

export async function renderPlanUI(root, ctx) {
  const my = ++st.seq;   // only the latest render may touch the page (inputs fire change + blur)
  const head = el('div', { class: 'pl-head' });
  const body = el('div', { class: 'pl-body' }, el('p', { class: 'bi-note' }, 'Montando o plano…'));
  root.replaceChildren(el('h2', { class: 'bi-h2' }, 'Plano de ação'), head, body);
  let base;
  try { base = await loadBase(st.g); } catch (e) { if (my === st.seq) body.replaceChildren(el('p', { class: 'bd-warn' }, e.message)); }
  if (my !== st.seq) return;
  const seg = el('div', { class: 'bi-seg', role: 'group', 'aria-label': 'Grupo' }, Object.entries(GROUPS).map(([g, n]) => el('button', { type: 'button', 'aria-pressed': String(st.g === g), onclick: () => { st.g = g; save(); ctx.onGroup?.(g); renderPlanUI(root, ctx); } }, n)));
  const per = el('div', { class: 'bi-seg', role: 'group', 'aria-label': 'Período' }, [['7', 'Últimos 7 dias'], ['30', 'Últimos 30 dias'], ['0', 'Tudo']].map(([v, t]) => el('button', { type: 'button', 'aria-pressed': String(st.period === v), onclick: () => { st.period = v; renderPlanUI(root, ctx); } }, t)));
  const vh = el('label', { class: 'pl-vh' }, 'Valor hora do ', st.g === 'raw' ? 'robô' : 'máquina', ' (R$/h) ', el('input', { type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'ex.: 350', value: st.money[st.g], 'aria-label': 'Valor hora em reais', onchange: (e) => { st.money[st.g] = e.target.value; save(); setTimeout(() => renderPlanUI(root, ctx), 0); } }));
  head.replaceChildren(seg, per, vh);
  if (!base || (!base.prod.length && !base.stops.length)) { if (base) body.replaceChildren(el('div', { class: 'bi-empty' }, el('b', {}, `A base de ${GROUPS[st.g]} está vazia.`), el('span', {}, 'Importe o histórico ou suba folhas conferidas para ver o plano.'), el('button', { type: 'button', class: 'primary', onclick: () => ctx.openBase?.() }, 'Abrir a base de dados'))); return; }

  const allDates = [...new Set([...base.prod.map((r) => r.d), ...base.stops.map((r) => r.d)])].sort();
  const today = new Date().toISOString().slice(0, 10), real = allDates.filter((d) => d <= today), last = real.at(-1) ?? allDates.at(-1);
  const dates = st.period === '0' ? null : new Set(allDates.filter((d) => d >= addDays(last, -(+st.period - 1)) && d <= last));
  const valor = Number(String(st.money[st.g]).replace(',', '.')) || 0;
  const known = new Set(Object.keys(getOperators()));
  const plan = buildPlan({ prod: base.prod, stops: base.stops, valorHora: valor, dates, known: known.size ? known : null, today });
  const sm = plan.summary;

  const card = (t, v, sub, color) => el('div', { class: 'bi-card' }, el('small', {}, t), el('b', color ? { style: `color:${color}` } : {}, v), sub ? el('span', { class: 'sub' }, sub) : '');
  const cards = el('div', { class: 'bi-cards' },
    card('PERÍODO', `${sm.dias} dias`, sm.de ? `${dmy(sm.de)} a ${dmy(sm.ate)} · dias de 00:00 a 24:00` : ''),
    card('HORAS PARADAS', `${f1(sm.stopH)} h`, `${f1(sm.prodH)} h produzidas no período`),
    card('PERDA COM PARADA', valor > 0 ? brl(sm.perda) : '—', valor > 0 ? `${f1(sm.stopH)} h × ${brl(valor)} por hora` : 'informe o valor hora acima para ver a perda em reais', valor > 0 ? '#fb7185' : null),
    card('AÇÕES', String(plan.actions.length), `${plan.actions.filter((a) => st.done[`${st.g}:${a.id}`]).length} concluída(s)`));

  const line = el('ol', { class: 'plan', 'aria-label': 'Ações em ordem de importância' });
  for (const a of plan.actions) {
    const key = `${st.g}:${a.id}`, color = TONE[a.tone];
    const checks = el('ul', { class: 'pl-steps' }, a.steps.map((s, i) => el('li', {}, el('label', {}, el('input', { type: 'checkbox', checked: st.done[`${key}:${i}`] || null, onchange: (e) => { st.done[`${key}:${i}`] = e.target.checked; st.done[key] = a.steps.every((_, j) => st.done[`${key}:${j}`]); save(); card_.classList.toggle('done', !!st.done[key]); } }), s))));
    const strata = a.strata.length ? el('details', { class: 'pl-strata' }, el('summary', {}, `Estratificação (${a.strata.length})`), el('div', { class: 'pl-strata-grid' }, a.strata.map((t) => el('div', {}, el('h5', {}, t.title), biTable(t.head.map((h, i) => ({ h, v: (r) => r[i], n: typeof t.rows[0]?.[i] === 'number' })), t.rows, { limit: 12 }))))) : '';
    const money = a.money != null ? el('span', { class: 'pl-chip loss' }, `perda ${brl(a.money)}`) : '';
    const card_ = el('article', { class: `pl-card${st.done[key] ? ' done' : ''}`, style: `--kc:${color}` },
      el('header', {}, el('h3', {}, a.title), el('div', { class: 'pl-chips' }, el('span', { class: 'pl-chip' }, `👤 ${a.owner}`), el('span', { class: 'pl-chip' }, `⏱ ${a.due}`), a.hours ? el('span', { class: 'pl-chip' }, `${f1(a.hours)} h`) : '', money)),
      el('div', { class: 'pl-why' }, el('b', {}, 'Por que'), el('ul', {}, a.why.map((w) => el('li', {}, w)))),
      el('div', { class: 'pl-do' }, el('b', {}, 'O que fazer'), checks),
      strata, a.records ? el('button', { type: 'button', class: 'bi-more', onclick: () => openRecords(a.records.title, a.records.head, a.records.rows) }, `Ver registros (${a.records.rows.length.toLocaleString('pt-BR')})`) : '');
    line.append(el('li', { class: 'pl-item', style: `--kc:${color}` }, el('span', { class: 'pl-node', 'aria-hidden': 'true' }, String(a.n)), el('span', { class: 'pl-branch', 'aria-hidden': 'true' }), card_));
  }
  body.replaceChildren(cards, plan.actions.length ? line : el('div', { class: 'bi-empty' }, el('b', {}, 'Nenhum problema encontrado no período.'), el('span', {}, 'Quando aparecer algo, o plano de ação mostra aqui o que fazer.')),
    el('p', { class: 'bi-note' }, 'O plano só sugere: ele nunca muda os dados. Os dias são contados de meia-noite a meia-noite. A perda é horas paradas × o valor hora que você informar (fica salvo só neste navegador).'));
}
