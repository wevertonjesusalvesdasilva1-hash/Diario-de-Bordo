// "4 · Plano de ação": what the stops cost (R$), then the actions to take in a vertical timeline, then the quality of the data.
import './plan.css';
import { el, chartBox, PALETTE } from './bicharts.js';
import { loadBase } from './historico.js';
import { buildPlan, buildFinance, brl } from './core/plan.js';
import { dmy } from './core/history.js';
import { getOperators } from './core/operators.js';
import { openRecords, biTable, biVis, biStat, auditoriaBlock } from './biui.js';
import { getValor, getValorText, setValor } from './valorhora.js';

const GROUPS = { raw: 'RAW (robôs)', usi: 'Usinagem' };
const st = { seq: 0, g: 'raw', period: '30', done: {} };
try { const g = localStorage.getItem('bi.g'); if (g === 'raw' || g === 'usi') st.g = g; st.done = JSON.parse(localStorage.getItem('mt-plano-feito') || '{}'); } catch { /* no storage */ }
const save = () => { try { localStorage.setItem('mt-plano-feito', JSON.stringify(st.done)); localStorage.setItem('bi.g', st.g); } catch { /* ignore */ } };
export const setPlanGroup = (g) => { if (GROUPS[g]) st.g = g; };
const f1 = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct0 = (v) => `${Math.round(v * 100)}%`;
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const TONE = { bad: '#fb7185', warn: '#fbbf24', info: '#60a5fa', ok: '#a3e635' };
const RED = '#fb7185';
const section = (title, sub, ...kids) => el('section', { class: 'pl-sec' }, el('header', {}, el('h3', {}, title), sub ? el('p', {}, sub) : ''), ...kids);

// the money block: loss by robot, by reason, by day, accumulated, and "stops x what was missing to reach the goal"
function financeBlock(fin, unit, valor) {
  const top = fin.perMachine[0], r0 = fin.perMotivo[0];
  const cards = el('div', { class: 'bi-cards' },
    biStat('PERDA COM PARADA', brl(fin.totalLoss), RED, `${f1(fin.total)} h × ${brl(valor)} por hora`),
    biStat('MÉDIA POR DIA', brl(fin.avgDayLoss), null, `em ${fin.days} dias de 00:00 a 24:00`),
    biStat('SE CONTINUAR ASSIM (30 DIAS)', brl(fin.projection30), RED, 'média por dia × 30'),
    biStat(`MAIOR PERDA · ${unit.toUpperCase()}`, top ? top.m : '—', null, top ? `${brl(top.loss)} (${pct0(fin.total ? top.stopH / fin.total : 0)} das horas paradas)` : ''),
    biStat('MAIOR MOTIVO', r0 ? r0.label.replace(' (inclui AGUARDANDO PEÇA)', '') : '—', null, r0 ? `${brl(r0.loss)} (${pct0(r0.share)})` : ''));
  const perM = () => ({ orient: 'h', cats: fin.perMachine.map((m) => ({ key: m.m, label: m.m, color: RED })), series: [{ name: 'Perda (R$)', vals: fin.perMachine.map((m) => m.loss), color: RED }], fmt: brl, tip: (i) => `${f1(fin.perMachine[i].stopH)} h paradas` });
  const perR = () => { const r = fin.perMotivo.slice(0, 8); return { cats: r.map((x) => ({ key: x.key, label: x.label.replace(' (inclui AGUARDANDO PEÇA)', '') })), series: [{ name: 'Perda (R$)', vals: r.map((x) => x.loss), color: RED }], lineAbove: true, line: { name: '% acumulado', vals: r.map((x) => x.cum), fmt: pct0, color: '#fbbf24', ref: 0.8, refLabel: '80%' }, fmt: brl }; };
  const perD = () => ({ kind: 'area', cats: fin.perDay.map((d) => ({ key: d.d, label: dmy(d.d).slice(0, 5) })), series: [{ name: 'Perda por dia (R$)', vals: fin.perDay.map((d) => d.loss), color: RED }], height: 240, fmt: brl });
  const cum = () => ({ kind: 'area', cats: fin.perDay.map((d) => ({ key: d.d, label: dmy(d.d).slice(0, 5) })), series: [{ name: 'Perda acumulada (R$)', vals: fin.perDay.map((d) => d.cumLoss), color: '#fbbf24' }], height: 240, fmt: brl });
  const vs = () => ({ cats: fin.perMachine.map((m) => ({ key: m.m, label: m.m })), series: [{ name: 'Parada (R$)', vals: fin.perMachine.map((m) => m.loss), color: RED }, { name: 'Falta para a meta de 88% (R$)', vals: fin.perMachine.map((m) => m.shortLoss), color: '#fbbf24' }], fmt: brl });
  const grid = el('div', { class: 'bi-grid pl-two' },
    biVis(`PERDA POR ${unit.toUpperCase()} (R$)`, () => chartBox(perM), { vid: 'pl-m', filters: false }),
    biVis('PERDA POR MOTIVO (R$) · Pareto', () => chartBox(perR), { vid: 'pl-r', filters: false }),
    biVis('PERDA POR DIA (R$)', () => chartBox(perD), { vid: 'pl-d', wide: true, filters: false }),
    biVis('PERDA ACUMULADA NO PERÍODO (R$)', () => chartBox(cum), { vid: 'pl-c', filters: false }),
    biVis('PARADA × O QUE FALTOU PARA A META (R$)', () => chartBox(vs), { vid: 'pl-v', filters: false }));
  return section('Quanto está custando', `Horas paradas × ${brl(valor)} por hora. "Falta para a meta" = horas que faltaram para chegar a 88% de disponibilidade × o mesmo valor.`, cards, grid);
}

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
  const vh = el('label', { class: 'pl-vh' }, 'Valor hora do ', st.g === 'raw' ? 'robô' : 'máquina', ' (R$/h) ', el('input', { type: 'number', min: '0', step: '1', inputmode: 'decimal', placeholder: 'ex.: 350', value: getValorText(st.g), 'aria-label': 'Valor hora em reais', onchange: (e) => { setValor(st.g, e.target.value); setTimeout(() => renderPlanUI(root, ctx), 0); } }));
  head.replaceChildren(seg, per, vh);
  if (!base || (!base.prod.length && !base.stops.length)) { if (base) body.replaceChildren(el('div', { class: 'bi-empty' }, el('b', {}, `A base de ${GROUPS[st.g]} está vazia.`), el('span', {}, 'Importe o histórico ou suba folhas conferidas para ver o plano.'), el('button', { type: 'button', class: 'primary', onclick: () => ctx.openBase?.() }, 'Abrir a base de dados'))); return; }

  const allDates = [...new Set([...base.prod.map((r) => r.d), ...base.stops.map((r) => r.d)])].sort();
  const today = new Date().toISOString().slice(0, 10), real = allDates.filter((d) => d <= today), last = real.at(-1) ?? allDates.at(-1);
  const dates = st.period === '0' ? null : new Set(allDates.filter((d) => d >= addDays(last, -(+st.period - 1)) && d <= last));
  const valor = getValor(st.g), unit = st.g === 'raw' ? 'Robô' : 'Máquina';
  const known = new Set(Object.keys(getOperators()));
  const plan = buildPlan({ prod: base.prod, stops: base.stops, valorHora: valor, dates, known: known.size ? known : null, today });
  const sm = plan.summary;

  const cards = el('div', { class: 'bi-cards' },
    biStat('PERÍODO', `${sm.dias} dias`, null, sm.de ? `${dmy(sm.de)} a ${dmy(sm.ate)} · dias de 00:00 a 24:00` : ''),
    biStat('HORAS PARADAS', `${f1(sm.stopH)} h`, null, `${f1(sm.prodH)} h produzidas no período`),
    biStat('AÇÕES', String(plan.actions.length), null, `${plan.actions.filter((a) => st.done[`${st.g}:${a.id}`]).length} concluída(s)`));

  const finance = valor > 0 ? financeBlock(buildFinance({ prod: base.prod, stops: base.stops, valorHora: valor, dates }), unit, valor)
    : section('Quanto está custando', null, el('div', { class: 'bi-empty' }, el('b', {}, 'Informe o valor hora para ver a perda em reais.'), el('span', {}, `Digite o valor da hora do ${st.g === 'raw' ? 'robô' : 'equipamento'} no campo acima. Ele fica salvo neste navegador.`)));

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
  const actions = section('O que fazer, em ordem', 'Da ação mais importante para a menos importante. Marque os passos conforme forem feitos.', plan.actions.length ? line : el('div', { class: 'bi-empty' }, el('b', {}, 'Nenhum problema encontrado no período.'), el('span', {}, 'Quando aparecer algo, o plano mostra aqui o que fazer.')));
  const quality = el('details', { class: 'pl-sec pl-audit' }, el('summary', {}, el('h3', {}, 'Qualidade dos dados (auditoria completa)'), el('p', {}, 'Todas as verificações da base, com a lista de linhas para corrigir e Excel.')), el('div', { class: 'pl-audit-body' }, ...auditoriaBlock({ base, g: st.g })));
  body.replaceChildren(cards, finance, actions, quality, el('p', { class: 'bi-note' }, 'O plano só sugere: ele nunca muda os dados. Os dias são contados de meia-noite a meia-noite. A perda é horas paradas × o valor hora informado.'));
}
