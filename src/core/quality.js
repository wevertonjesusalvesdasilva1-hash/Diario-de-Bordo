// Quality of the filling-in of the sheets: who leaves columns empty and which sheets are hard to read.
// Pure functions on the reviewed pages; the results are cards for the analysis tab.

import { whoText } from './operators.js';

const READ = /ilegível|inválid|leitura|diferent|fora da lista|desconhecid|só uma|sem motivo/i;
const NOT_READ = /duração|parada de|turno 3|iguais|data da folha/i;
const MIN_ROWS = 3;      // fewer records than this say nothing about a person's habit
const MIN_SHARE = 0.3;   // share of records with the problem before it is reported
const HARD_CELLS = 6, HARD_SHARE = 0.25;

const day = (p) => (p.date || '').slice(0, 5) || 'sem data';
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const uniq = (a) => [...new Set(a)];

function pageRecords(p) {
  const recs = [];
  p.prod.forEach((r, ri) => {
    for (const n of [1, 2, 3]) {
      if (!r[`ini${n}`] && !r[`fim${n}`]) continue;
      recs.push({ table: 'prod', ri, linha: r.linha, chapa: r[`chapa${n}`], ini: r[`ini${n}`], fim: r[`fim${n}`], data: r.data });
    }
  });
  p.stops.forEach((r, ri) => {
    if (!r.ini && !r.fim && !r.chapa) return;
    recs.push({ table: 'stops', ri, linha: r.linha, chapa: r.chapa, ini: r.ini, fim: r.fim, data: r.data, motivo: r.motivo, stop: true });
  });
  return recs;
}

function handwriting(p) {
  let filled = 0, bad = 0;
  for (const r of [...p.prod, ...p.stops]) {
    for (const [k, v] of Object.entries(r)) {
      if (['flags', 'raw', 'learned', 'alt', 'votos', 'strip', 'linha', 'rowFlag'].includes(k)) continue;
      if (v !== '' && v != null && typeof v !== 'object') filled++;
    }
    for (const msg of Object.values(r.flags ?? {})) if (READ.test(msg) && !NOT_READ.test(msg)) bad++;
    if (r.rowFlag && /só uma/.test(r.rowFlag)) bad++;
  }
  return { filled, bad };
}

export function buildQuality(pages) {
  const cards = [];
  const byMachine = new Map();
  for (const p of pages) { const k = p.machine || 'SEM MÁQUINA'; if (!byMachine.has(k)) byMachine.set(k, []); byMachine.get(k).push(p); }

  const problems = [
    { kind: 'sem chapa', test: (r) => !r.chapa, what: 'a chapa', verb: 'não preenche', why: 'Sem a chapa não dá para saber quem operou a máquina nem conferir a leitura contra a lista de chapas.' },
    { kind: 'sem motivo', test: (r) => r.stop && !r.motivo, what: 'o motivo da parada', verb: 'não marca', only: 'stop', why: 'Parada sem motivo não entra na análise de por que a máquina parou.' },
    { kind: 'horário incompleto', test: (r) => !!r.ini !== !!r.fim, what: 'o horário completo (início e fim)', verb: 'não anota', why: 'Com só um dos horários não dá para calcular a duração nem cruzar produção com parada.' },
    { kind: 'sem data', test: (r) => !r.data, what: 'a data', verb: 'não preenche', why: 'Sem data o registro fica fora do cruzamento de horários.' },
  ];

  for (const [machine, ps] of byMachine) {
    const recs = ps.flatMap((p) => pageRecords(p).map((r) => ({ ...r, p })));
    for (const pr of problems) {
      const pool = pr.only === 'stop' ? recs.filter((r) => r.stop) : recs;
      const bad = pool.filter(pr.test);
      if (bad.length < MIN_ROWS || bad.length / pool.length < MIN_SHARE) continue;
      const share = bad.length / pool.length;
      const days = uniq(bad.map((r) => day(r.p)));
      const sheets = uniq(bad.map((r) => r.p.id)).length;
      const first = bad[0];
      cards.push({
        sev: share >= 0.6 ? 'alta' : 'media', kind: 'preenchimento', problem: pr.kind, machine, page: first.p.id, label: first.p.label, day: days[0],
        table: first.table, ri: first.ri, linha: first.linha,
        headline: `${machine}: o colaborador ${pr.verb} ${pr.what} em ${bad.length} de ${pool.length} registros (${pct(bad.length, pool.length)} %)${ps.length > 1 ? `, em ${sheets} de ${ps.length} folhas` : ''}.`,
        text: `${machine}: ${pr.kind} em ${bad.length} de ${pool.length} registros`,
        chips: [`Folhas: ${days.join(', ')}`, ...(pr.kind === 'sem chapa' ? [`Chapas que aparecem: ${uniq(pool.map((r) => r.chapa).filter(Boolean)).slice(0, 4).join(', ') || 'nenhuma'}`] : [])],
        why: pr.why, meter: { part: bad.length, total: pool.length, label: pr.kind }, who: pr.kind === 'sem chapa' ? '' : whoText(bad.map((r) => r.chapa)),
        brief: `${pr.kind === 'sem chapa' ? 'Chapa em branco' : pr.kind === 'sem motivo' ? 'Parada sem motivo' : pr.kind === 'horário incompleto' ? 'Horário incompleto' : 'Data em branco'} em ${bad.length} de ${pool.length} registros`,
        refs: bad.filter((r) => r.p.id === first.p.id).slice(0, 8).map((r) => ({ table: r.table, linha: r.linha })),
      });
    }
  }

  // TURNO column: blank on the sheet (the app filled it from the clock and the chapa) or contradicting the clock
  for (const [machine, ps] of byMachine) {
    const all = ps.flatMap((p) => ['prod', 'stops'].flatMap((table) => p[table].map((r, ri) => ({ r, p, table, ri }))));
    const blank = all.filter((x) => x.r.auto?.turno && !x.r.edits?.turno);
    const clash = all.filter((x) => /indica turno/.test(x.r.flags?.turno ?? ''));
    const unsure = blank.filter((x) => !x.r.turno);
    const mk = (list, problem, sev, headline, why) => {
      const first = list[0];
      cards.push({ sev, kind: 'preenchimento', problem, machine, page: first.p.id, label: first.p.label, day: day(first.p), table: first.table, ri: first.ri, linha: first.r.linha,
        headline, text: headline, who: whoText(list.map((x) => x.r.chapa ?? x.r.chapa3 ?? x.r.chapa2 ?? x.r.chapa1)), brief: problem === 'turno em branco' ? `Turno em branco em ${list.length} de ${all.length} linhas (preenchido pelo app)` : problem === 'turno incerto' ? `Turno incerto em ${list.length} linha(s)` : `Turno não bate com o horário em ${list.length} linha(s)`,
        refs: list.filter((x) => x.p.id === first.p.id).slice(0, 8).map((x) => ({ table: x.table, linha: x.r.linha })), chips: [`Folhas: ${uniq(list.map((x) => day(x.p))).join(', ')}`], why, meter: { part: list.length, total: all.length, label: problem } });
    };
    if (blank.length - unsure.length >= 2) {
      const n = blank.length - unsure.length;
      mk(blank.filter((x) => x.r.turno), 'turno em branco', n / all.length >= 0.6 ? 'alta' : 'media',
        `${machine}: a coluna de turno veio em branco em ${n} de ${all.length} linhas. O app preencheu pelo horário (turno 1: 07:30 às 17:30; turno 2: 20:40 às 05:40) e pela chapa. Os campos estão marcados como "auto".`,
        'Confira os marcados como "auto". Hora extra e chapa nova podem mudar o turno certo. O ideal é o operador preencher a coluna.');
    }
    if (unsure.length) mk(unsure, 'turno incerto', 'media', `${machine}: em ${unsure.length} linha(s) o turno está em branco e o horário (entre 05:40 e 07:30) não permite saber. Preencha à mão.`, 'O horário cai entre os turnos e a chapa ainda não tem histórico para decidir.');
    if (clash.length) mk(clash, 'turno diferente do horário', 'media', `${machine}: em ${clash.length} linha(s) o turno anotado não bate com o horário. Exemplo: ${clash[0].r.flags.turno}.`, 'Pode ser hora extra, ou o turno ou o horário foram anotados errado.');
  }

  for (const p of pages) {
    const { filled, bad } = handwriting(p);
    if (bad < HARD_CELLS || !filled || bad / filled < HARD_SHARE) continue;
    const share = bad / filled;
    cards.push({
      sev: share >= 0.4 ? 'alta' : 'media', kind: 'caligrafia', machine: p.machine || 'SEM MÁQUINA', page: p.id, label: p.label, day: day(p),
      table: p.prod.length ? 'prod' : 'stops', ri: 0, linha: 1,
      headline: `${p.machine || 'Folha'} · folha do dia ${day(p)}: letra difícil de ler. ${bad} de ${filled} células preenchidas (${pct(bad, filled)} %) ficaram ilegíveis, com leituras diferentes ou fora do esperado.`,
      text: `Folha do dia ${day(p)}: ${bad} de ${filled} células de leitura difícil`,
      chips: [`Folha ${p.label}`], why: 'Essas folhas dão mais trabalho na extração. Vale conferir célula a célula e pedir letra mais legível ao colaborador.',
      meter: { part: bad, total: filled, label: 'células difíceis' }, who: whoText([...p.prod.flatMap((r) => [r.chapa1, r.chapa2, r.chapa3]), ...p.stops.map((r) => r.chapa)]), brief: `${bad} de ${filled} células difíceis de ler`, refs: [],
    });
  }
  const RANK = { alta: 0, media: 1 };
  return cards.sort((a, b) => RANK[a.sev] - RANK[b.sev] || b.meter.part / b.meter.total - a.meter.part / a.meter.total);
}
