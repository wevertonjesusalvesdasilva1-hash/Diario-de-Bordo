// Plano de ação: reads the history and writes the actions that should be taken, in order of impact.
// Days are CLOCK days (midnight to midnight). The hourly cost of a robot (R$/h) turns stopped hours into money.
// Pure functions (no DOM). It only suggests: it never changes the data.
import { dmy, clockParts, standardByPieceModel } from './history.js';
import { auditData } from './audit.js';
import { aliasKey } from './lists.js';
import { META, HORAS_DIA } from './bi.js';

const f1 = (v) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (v) => `${f1(v * 100)}%`;
export const brl = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const sum = (a, f) => a.reduce((s, x) => s + (Number(f(x)) || 0), 0);
const WEEK = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const weekday = (d) => WEEK[new Date(`${d}T12:00:00Z`).getUTCDay()];
const by = (list, key) => { const m = new Map(); for (const x of list) { const k = key(x); (m.get(k) ?? m.set(k, []).get(k)).push(x); } return m; };
// "AGUARD. PEÇA" and "AGUARDANDO PEÇA" are the same reason; MECANICA = MECÂNICA
const motivoKey = (m) => { const k = aliasKey(String(m ?? '').replace(/\bAGUARD\b\.?/gi, 'AGUARDANDO').replace(/AGUARNDANDO/gi, 'AGUARDANDO')); return /FALTADEPECA|AGUARDANDOPECA/.test(k) ? 'FALTADEPECA' : k; };   // waiting for a piece = missing piece

// what to do for each kind of stop reason
const TEMPLATES = [
  [/FALTA.?DE.?PECA|AGUARDANDOPECA/, { owner: 'PCP / Almoxarifado / Compras', steps: ['Listar quais peças ou kits faltaram, em que dia e em qual máquina (use a lista abaixo).', 'Garantir o kit completo na máquina antes de cada turno começar (conferência de abastecimento).', 'Alinhar com o PCP a programação de 24 h para a máquina nunca ficar sem peça.', 'Acompanhar todo dia a meta de zero falta de peça e cobrar quem abastece.'] }],
  [/SETUP|TROCADEPECA|TROCA/, { owner: 'Produção / Engenharia de processo', steps: ['Medir o tempo real de cada troca ou set-up e comparar com o melhor registro.', 'Preparar ferramenta e peça com a máquina ainda produzindo (set-up externo).', 'Padronizar o passo a passo e treinar todos os turnos.', 'Repetir a medição em 15 dias para ver o ganho.'] }],
  [/MECANICA|ELETRICA|PREVENTIVA|CONSUMIVEIS|MANUTENCAO/, { owner: 'Manutenção', steps: ['Abrir a causa raiz das paradas que mais se repetem (tocha, bico, cabo, sensor).', 'Revisar o plano preventivo da máquina e cumprir a data.', 'Manter estoque mínimo das peças críticas de reposição.', 'Acompanhar o tempo médio de reparo e o número de ocorrências por semana.'] }],
  [/PONTEROLANTE/, { owner: 'Logística / Produção', steps: ['Combinar horários fixos de uso da ponte rolante para as máquinas.', 'Avaliar se falta um segundo equipamento de movimentação.', 'Registrar quem estava esperando e por quanto tempo.'] }],
  [/OUTROS|^$/, { owner: 'Supervisor de produção', steps: ['Exigir o motivo detalhado em toda parada (não aceitar "OUTROS" sem descrição).', 'Reclassificar as paradas "OUTROS" já lançadas com o líder de turno.', 'Revisar a lista de motivos e criar os que estão faltando.'] }],
];
const templateFor = (key) => TEMPLATES.find(([re]) => re.test(key))?.[1] ?? { owner: 'Supervisor de produção', steps: ['Investigar a causa raiz com o líder de turno e o operador.', 'Definir uma ação corretiva e quem responde por ela.', 'Acompanhar a recorrência semana a semana.'] };

// opts: { prod, stops, valorHora (R$ per hour of a stopped robot), dates (Set of ISO days) | null, known (Set of plates) | null }
export function buildPlan({ prod, stops, valorHora = 0, dates = null, known = null, today }) {
  const inP = (r) => !dates || dates.has(r.d);
  const P = prod.filter(inP), S = stops.filter(inP);
  const money = (h) => (valorHora > 0 ? h * valorHora : null);
  const machineDays = new Set([...P, ...S].map((r) => `${r.d}|${r.m}`));
  const nMD = machineDays.size, days = [...new Set([...P, ...S].map((r) => r.d))].sort();
  const stopH = sum(S, (s) => s.h), prodH = sum(P, (r) => r.h);
  const out = [];
  const audit = auditData({ prod: P, stops: S, known, today });
  const A = (id) => audit.find((c) => c.id === id);

  // ---- 1. validate the data first: the numbers below are only as good as the records
  const issues = ['d-future', 'd-24', 'p-over', 's-over', 'p-time', 'p-chapa', 's-miss', 'p-dup', 's-dup'].map(A).filter((c) => c && c.count);
  if (issues.length) {
    const double = (A('p-over')?.rows ?? []).reduce((s, r) => s + (+r[4] || 0), 0) + (A('s-over')?.hours ?? 0);
    const perMachine = new Map();
    for (const c of issues) for (const r of c.rows) perMachine.set(r[1], (perMachine.get(r[1]) ?? 0) + 1);
    out.push({ id: 'dados', tone: 'bad', title: 'Validar os tempos lançados', owner: 'Líder de turno + Supervisor', due: 'Esta semana', hours: double,
      why: [`${issues.reduce((s, c) => s + c.count, 0)} registros com problema de horário ou preenchimento no período.`, double > 0 ? `${f1(double)} h estão contadas duas vezes (peças ou paradas no mesmo horário): a produção e as paradas parecem maiores do que são.` : 'Sem horas em dobro, mas há horários faltando ou repetidos.'],
      steps: ['Abrir cada lista abaixo e corrigir as linhas na folha ou no Excel (o app não corrige sozinho).', 'Dias acima de 24 h: conferir horário digitado, parada repetida ou lançada em cima da produção.', 'Preencher horário de início e fim que faltam e a chapa do turno que finalizou.', 'Importar de novo o Excel corrigido e conferir se a lista de problemas zerou.'],
      strata: [{ title: 'Por tipo de problema', head: ['Problema', 'Quantidade'], rows: issues.map((c) => [c.title, c.count]) }, { title: 'Por máquina', head: ['Máquina', 'Registros'], rows: [...perMachine].sort((a, b) => b[1] - a[1]) }],
      records: { title: 'Registros para corrigir', head: ['Problema', 'Dia', 'Máquina', 'Detalhe'], rows: issues.flatMap((c) => c.rows.map((r) => [c.title, r[0], r[1], r[6] ?? r[5] ?? ''])) } });
  }

  // ---- 2. the stop reasons that cost the most hours
  const reasons = [...by(S, (s) => motivoKey(s.mo)).entries()].map(([key, list]) => {
    const names = by(list, (s) => s.mo || '(sem motivo)'), label = key === 'FALTADEPECA' ? 'FALTA DE PEÇA (inclui AGUARDANDO PEÇA)' : [...names].sort((a, b) => b[1].length - a[1].length)[0][0];
    return { key, label, list, h: sum(list, (s) => s.h), md: new Set(list.map((s) => `${s.d}|${s.m}`)).size };
  }).sort((a, b) => b.h - a.h);
  for (const r of reasons.slice(0, 3)) {
    if (!(r.h > 0) || r.h / (stopH || 1) < 0.08) continue;
    const tpl = templateFor(r.key), freq = nMD ? r.md / nMD : 0, constant = freq >= 0.4;
    const perM = [...by(r.list, (s) => s.m)].map(([m, l]) => [m, +sum(l, (s) => s.h).toFixed(1), pct(sum(l, (s) => s.h) / r.h)]).sort((a, b) => b[1] - a[1]);
    const perT = [...by(r.list, (s) => (s.t == null ? 'sem turno' : `turno ${s.t}`))].map(([t, l]) => [t, +sum(l, (s) => s.h).toFixed(1), pct(sum(l, (s) => s.h) / r.h)]).sort((a, b) => b[1] - a[1]);
    const perW = [...by(r.list, (s) => weekday(s.d))].map(([w, l]) => [w, +sum(l, (s) => s.h).toFixed(1)]).sort((a, b) => b[1] - a[1]);
    const worst = [...by(r.list, (s) => s.d)].map(([d, l]) => [dmy(d), +sum(l, (s) => s.h).toFixed(1), [...new Set(l.map((s) => s.m))].join(', ')]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    out.push({ id: `motivo-${r.key}`, tone: constant ? 'bad' : 'warn', title: `${constant ? 'Rever' : 'Atacar'} ${r.label}${constant ? ' (constante)' : ''}`, owner: tpl.owner, due: constant ? 'Esta semana' : 'Este mês', hours: r.h,
      why: [`${f1(r.h)} h paradas (${pct(r.h / stopH)} de todas as paradas) em ${r.list.length} paradas.`, `Aparece em ${r.md} dos ${nMD} dias de máquina (${pct(freq)})${constant ? ': é um problema de todo dia, não um caso isolado' : ''}.`, `A máquina mais afetada é ${perM[0][0]} (${perM[0][2]} das horas deste motivo).`],
      steps: tpl.steps,
      strata: [{ title: 'Por máquina', head: ['Máquina', 'Horas', '% do motivo'], rows: perM }, { title: 'Por turno', head: ['Turno', 'Horas', '% do motivo'], rows: perT }, { title: 'Por dia da semana', head: ['Dia', 'Horas'], rows: perW }, { title: 'Piores dias', head: ['Dia', 'Horas', 'Máquinas'], rows: worst }],
      records: { title: `Paradas de ${r.label}`, head: ['Dia', 'Máquina', 'Chapa', 'Horário', 'Horas', 'Descrição'], rows: [...r.list].sort((a, b) => b.h - a.h).map((s) => [dmy(s.d), s.m, s.c, `${s.i}–${s.f}`, +(+s.h).toFixed(2), s.ds]) } });
  }

  // ---- 3. the machine with the lowest availability (production hours against the goal of the days it worked)
  const mach = [...by(P, (r) => r.m)].map(([m, l]) => { const d = new Set(l.map((r) => r.d)).size, h = sum(l, (r) => r.h), t = HORAS_DIA * d; return { m, p: t ? h / t : 0, h, t, d }; }).sort((a, b) => a.p - b.p);
  if (mach.length > 1 && mach[0].p < META) {
    const w = mach[0], ws = S.filter((s) => s.m === w.m), wh = sum(ws, (s) => s.h);
    const top = [...by(ws, (s) => motivoKey(s.mo))].map(([k, l]) => [[...new Set(l.map((s) => s.mo))][0] || '(sem motivo)', sum(l, (s) => s.h)]).sort((a, b) => b[1] - a[1]);
    out.push({ id: `critica-${w.m}`, tone: w.p < META * 0.9 ? 'bad' : 'warn', title: `Plano de recuperação da ${w.m}`, owner: 'Supervisor + Manutenção + PCP', due: 'Esta semana', hours: wh,
      why: [`${w.m} tem a menor disponibilidade: ${pct(w.p)} (meta ${Math.round(META * 100)}%). Produziu ${f1(w.h)} h de ${f1(w.t)} h possíveis em ${w.d} dias.`, top[0] ? `Parou ${f1(wh)} h; o maior motivo é ${top[0][0]} (${f1(top[0][1])} h).` : 'Sem paradas lançadas: confirme se a máquina realmente trabalhou.'],
      steps: ['Reunião curta com produção, manutenção e PCP só para esta máquina.', 'Atacar primeiro o maior motivo de parada dela (veja a lista).', 'Definir meta semanal de disponibilidade e acompanhar todo dia.', 'Se o problema for falta de programação, reprogramar peças para a máquina.'],
      strata: [{ title: 'Paradas da máquina por motivo', head: ['Motivo', 'Horas'], rows: top.slice(0, 8).map(([m, h]) => [m, +h.toFixed(1)]) }, { title: 'Todas as máquinas', head: ['Máquina', 'Disponibilidade', 'Horas produzidas', 'Dias'], rows: mach.map((x) => [x.m, pct(x.p), +x.h.toFixed(1), x.d]) }], records: null });
  }

  // ---- 4. time nobody wrote down (midnight to midnight)
  { const perMD = new Map();
    const add = (r, pairs) => { const parts = clockParts(r.d, pairs); if (!parts) return; for (const p of parts) { const k = `${p.day}|${r.m}`; (perMD.get(k) ?? perMD.set(k, []).get(k)).push([p.a, p.b]); } };
    for (const r of P) add(r, [[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]]);
    for (const s of S) add(s, [[s.i, s.f]]);
    const covered = (segs) => { const a = segs.map((x) => [...x]).sort((x, y) => x[0] - y[0]); let t = 0, cur = null; for (const sg of a) { if (cur && sg[0] <= cur[1]) cur[1] = Math.max(cur[1], sg[1]); else { if (cur) t += cur[1] - cur[0]; cur = [...sg]; } } return t + (cur ? cur[1] - cur[0] : 0); };
    const perMachine = new Map(); let total = 0, mdN = 0;
    for (const [k, segs] of perMD) { const m = k.split('|')[1], gap = Math.max(0, 1440 - covered(segs)) / 60; total += gap; mdN++; perMachine.set(m, (perMachine.get(m) ?? 0) + gap); }
    if (mdN && total / (mdN * 24) > 0.1) out.push({ id: 'semregistro', tone: 'info', title: 'Apontar o tempo sem registro', owner: 'Líder de turno', due: 'Este mês', hours: total,
      why: [`Contando o dia de meia-noite a meia-noite (24 h), ${f1(total)} h não têm produção nem parada lançada (${pct(total / (mdN * 24))} de ${mdN} dias de máquina).`, 'Pode ser máquina desligada ou sem programação (normal) ou parada que ninguém lançou. Esse tempo some das análises, então vale confirmar.'],
      steps: ['Lançar toda parada, inclusive as curtas.', 'Criar o motivo "SEM PROGRAMAÇÃO" para máquina disponível mas sem peça programada.', 'Conferir no fim do turno se as 8 horas do turno estão todas explicadas.'],
      strata: [{ title: 'Por máquina', head: ['Máquina', 'Horas sem registro'], rows: [...perMachine].map(([m, h]) => [m, +h.toFixed(1)]).sort((a, b) => b[1] - a[1]) }], records: null }); }

  // ---- 5. standard times missing
  { const miss = P.filter((r) => !(r.tp > 0) && !(standardByPieceModel(r.p, r.o, r.m) > 0));
    if (miss.length) { const byPm = [...by(miss, (r) => `${r.p}-${r.o}`)].map(([k, l]) => [k, l.length, +sum(l, (r) => r.h).toFixed(1), [...new Set(l.map((r) => r.m))].sort().join(', ')]).sort((a, b) => b[1] - a[1]);
      out.push({ id: 'padrao', tone: 'warn', title: 'Completar o tempo padrão das peças', owner: 'PCP / Engenharia (matriz BAAN)', due: 'Este mês', hours: sum(miss, (r) => r.h),
        why: [`${miss.length} peças (${f1(sum(miss, (r) => r.h))} h reais) não têm tempo padrão: ficam fora das horas entregues e da eficiência.`, `${byPm.length} combinações de peça e modelo estão faltando na MATRIZ TEMPO.`],
        steps: ['Levantar no BAAN o tempo de cada peça da lista e incluir na MATRIZ TEMPO (por máquina).', 'Corrigir nomes diferentes da matriz (por exemplo "BOOM WA WA" x "BOOM WA").', 'Preencher o COLAR-CENTER FRAME, que está na matriz sem tempo.', 'Atualizar o app com a matriz nova.'],
        strata: [{ title: 'Peças mais frequentes sem padrão', head: ['Peça e modelo', 'Peças', 'Horas reais', 'Máquinas'], rows: byPm.slice(0, 10) }], records: { title: 'Peças sem tempo padrão', head: ['Peça e modelo', 'Peças', 'Horas reais', 'Máquinas'], rows: byPm } }); } }

  // ---- 6. efficiency below the standard (only pieces that have a standard)
  { const withStd = P.map((r) => ({ r, tp: r.tp > 0 ? r.tp : standardByPieceModel(r.p, r.o, r.m) })).filter((x) => x.tp > 0 && x.r.h > 0);
    const ent = sum(withStd, (x) => x.tp), real = sum(withStd, (x) => x.r.h);
    if (real && ent / real < 1) { const perM = [...by(withStd, (x) => x.r.m)].map(([m, l]) => [m, +sum(l, (x) => x.r.h).toFixed(1), +sum(l, (x) => x.tp).toFixed(1), pct(sum(l, (x) => x.tp) / sum(l, (x) => x.r.h))]).sort((a, b) => parseFloat(a[3]) - parseFloat(b[3]));
      const perP = [...by(withStd, (x) => `${x.r.p}-${x.r.o}`)].filter(([, l]) => l.length >= 3).map(([k, l]) => [k, l.length, +sum(l, (x) => x.r.h).toFixed(1), +sum(l, (x) => x.tp).toFixed(1), pct(sum(l, (x) => x.tp) / sum(l, (x) => x.r.h))]).sort((a, b) => parseFloat(a[4]) - parseFloat(b[4])).slice(0, 8);
      out.push({ id: 'eficiencia', tone: ent / real < 0.85 ? 'bad' : 'warn', title: 'Recuperar a eficiência pelo tempo padrão', owner: 'Produção / Engenharia de processo', due: 'Este mês', hours: real - ent,
        why: [`As peças que têm padrão entregaram ${f1(ent)} h pelo padrão gastando ${f1(real)} h reais: eficiência de ${pct(ent / real)}.`, `Ficaram ${f1(real - ent)} h acima do padrão.`],
        steps: ['Começar pelas peças e máquinas com a pior eficiência (listas abaixo).', 'Ver se o padrão da peça está certo antes de cobrar a produção.', 'Se o padrão está certo, comparar o jeito de trabalhar do melhor turno com o pior.', 'Reavaliar em 15 dias.'],
        strata: [{ title: 'Por máquina (pior primeiro)', head: ['Máquina', 'Horas reais', 'Horas entregues', 'Eficiência'], rows: perM }, { title: 'Peças com pior eficiência (3 ou mais peças)', head: ['Peça e modelo', 'Peças', 'Horas reais', 'Horas entregues', 'Eficiência'], rows: perP }], records: null }); } }

  // ---- 7. quality of the notes (the same reason spelled in two ways, "OUTROS", stops without reason)
  { const outros = S.filter((s) => /^OUTROS/.test(String(s.mo).toUpperCase()) || !s.mo), spell = A('s-mot'), semMot = S.filter((s) => !s.mo).length;
    const share = stopH ? sum(outros, (s) => s.h) / stopH : 0;
    if (share >= 0.1 || (spell && spell.count) || semMot) out.push({ id: 'apontamento', tone: 'info', title: 'Melhorar a qualidade do apontamento', owner: 'Supervisor / Líder de turno', due: 'Este mês', hours: sum(outros, (s) => s.h),
      why: [`"OUTROS" ou sem motivo somam ${f1(sum(outros, (s) => s.h))} h (${pct(share)} das paradas): motivo que não ajuda a decidir o que fazer.`, spell && spell.count ? `${spell.count} motivos estão escritos de mais de um jeito (cada jeito vira uma barra no Pareto).` : 'Os motivos estão padronizados.', semMot ? `${semMot} paradas sem motivo.` : ''].filter(Boolean),
      steps: ['Trocar o texto livre por lista fechada de motivos (o app já usa a lista ao ler as folhas).', 'Treinar os turnos para detalhar a descrição quando usar "OUTROS".', 'Revisar a lista de motivos a cada mês.'],
      strata: [{ title: 'Motivos escritos de mais de um jeito', head: ['Variações (quantidade)'], rows: (spell?.rows ?? []).map((r) => [r[4]]) }], records: null });
  }

  // ---- order: the data first (everything depends on it), then by hours at stake
  const rank = (a) => (a.id === 'dados' ? -Infinity : a.id === 'semregistro' || a.id === 'apontamento' ? 1e9 : -a.hours);   // data first, then by hours; the notes about notes last
  out.sort((a, b) => rank(a) - rank(b));
  out.forEach((a, i) => { a.n = i + 1; a.money = ['dados', 'apontamento', 'padrao', 'eficiencia', 'semregistro'].includes(a.id) ? null : money(a.hours); });
  return { actions: out, summary: { dias: days.length, de: days[0] ?? '', ate: days.at(-1) ?? '', stopH, prodH, perda: money(stopH), maquinasDia: nMD } };
}

// ---- money: what the stopped hours cost. Same period rules as the plan. loss = hours × hourly value (R$/h).
export function buildFinance({ prod, stops, valorHora = 0, dates = null }) {
  const P = dates ? prod.filter((r) => dates.has(r.d)) : prod, S = dates ? stops.filter((r) => dates.has(r.d)) : stops, v = valorHora;
  const machines = [...new Set([...P, ...S].map((r) => r.m))].sort();
  const perMachine = machines.map((m) => {
    const pl = P.filter((r) => r.m === m), sl = S.filter((r) => r.m === m), d = new Set(pl.map((r) => r.d)).size;
    const stopH = sum(sl, (r) => r.h), prodH = sum(pl, (r) => r.h), target = HORAS_DIA * d, shortH = Math.max(0, target - prodH);
    return { m, stopH, loss: stopH * v, prodH, target, pct: target ? prodH / target : 0, shortH, shortLoss: shortH * v };
  }).sort((a, b) => b.loss - a.loss);
  const total = sum(S, (r) => r.h), reasons = [...by(S, (s) => motivoKey(s.mo)).entries()].map(([key, list]) => {
    const names = by(list, (s) => s.mo || '(sem motivo)');
    return { key, label: key === 'FALTADEPECA' ? 'FALTA DE PEÇA (inclui AGUARDANDO PEÇA)' : [...names].sort((a, b) => b[1].length - a[1].length)[0][0], h: sum(list, (s) => s.h) };
  }).sort((a, b) => b.h - a.h);
  let acc = 0;
  const perMotivo = reasons.map((r) => { acc += r.h; return { ...r, loss: r.h * v, share: total ? r.h / total : 0, cum: total ? acc / total : 0 }; });
  const dayKeys = [...new Set([...P, ...S].map((r) => r.d))].sort();
  let run = 0;
  const perDay = dayKeys.map((d) => { const h = sum(S.filter((r) => r.d === d), (r) => r.h); run += h; return { d, h, loss: h * v, cumLoss: run * v }; });
  const avgDay = dayKeys.length ? total / dayKeys.length : 0;
  return { total, totalLoss: total * v, avgDayLoss: avgDay * v, projection30: avgDay * 30 * v, days: dayKeys.length, perMachine, perMotivo, perDay, shortLoss: sum(perMachine, (m) => m.shortLoss) };
}
