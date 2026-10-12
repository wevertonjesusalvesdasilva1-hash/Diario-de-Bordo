// The list of warning cards shown in the Analysis tab. Every kind of finding is its own section with its own
// colour, in priority order, so each thing that happens can be told apart at a glance:
//   the wrong notes of time first (a production that includes a stop, two records on the same time),
//   then big times, then who fills the sheet badly, then the rest, and handwriting always last.
// Cards the person marked as "annotated correctly" are left out (and counted).

export const KINDS = [
  { id: 'em dúvida', color: '#cbd5e1', name: 'Ainda em dúvida (não analisado)', hint: 'Horário ainda marcado como dúvida na conferência. A análise só julga dado conferido.' },
  { id: 'produzindo parado', color: '#dc2626', name: 'Produção inclui parada', hint: 'O tempo de produção cobre uma parada anotada: a máquina parada não produz.' },
  { id: 'registros sobrepostos', color: '#facc15', name: 'Dois registros no mesmo horário', hint: 'Duas produções, ou duas paradas, ocupam o mesmo horário.' },
  { id: 'parada longa', color: '#fb923c', name: 'Parada longa', hint: 'Parada maior do que o normal para o motivo.' },
  { id: 'acima do padrão', color: '#e879f9', name: 'Produção acima do padrão', hint: 'Tempo real de produção bem acima do tempo padrão da peça.' },
  { id: 'sem chapa', color: '#a78bfa', name: 'Chapa em branco', hint: 'O colaborador não preencheu a chapa.' },
  { id: 'turno em branco', color: '#38bdf8', name: 'Turno em branco', hint: 'Coluna de turno vazia; o app preencheu pelo horário e pela chapa.' },
  { id: 'turno incerto', color: '#22d3ee', name: 'Turno incerto', hint: 'Turno em branco e o horário não permite saber qual é.' },
  { id: 'turno diferente do horário', color: '#2dd4bf', name: 'Turno diferente do horário', hint: 'O turno anotado não bate com o horário.' },
  { id: 'horário incompleto', color: '#4ade80', name: 'Horário incompleto', hint: 'Só o início ou só o fim foi anotado.' },
  { id: 'sem data', color: '#a3e635', name: 'Data em branco', hint: 'Registro sem data.' },
  { id: 'sem motivo', color: '#f472b6', name: 'Parada sem motivo', hint: 'Parada sem o motivo marcado.' },
  { id: 'sem registro', color: '#60a5fa', name: 'Tempo sem registro', hint: 'Entre a produção e a parada nada foi anotado.' },
  { id: 'turnos repetidos', color: '#818cf8', name: 'Horário repetido', hint: 'O mesmo horário aparece em duas linhas ou turnos: provável leitura repetida.' },
  { id: 'data diferente', color: '#fb7185', name: 'Data diferente — confira', hint: 'A data da linha é diferente das outras da folha: pode ser anotação ou leitura. O app usou o dia da folha.' },
  { id: 'incompleto', color: '#d6a77a', name: 'Registro incompleto', hint: 'Data ou horário incompleto: o registro ficou fora do cruzamento.' },
  { id: 'abaixo do padrão', color: '#94a3b8', name: 'Produção abaixo do padrão', hint: 'Tempo real bem abaixo do padrão: pode ser horário errado ou peça incompleta.' },
  { id: 'caligrafia', color: '#9ca3af', name: 'Caligrafia difícil', hint: 'Letra difícil de ler. Fica por último.' },
];
const KIND_INDEX = new Map(KINDS.map((k, i) => [k.id, i]));
const RANK = { alta: 0, media: 1, info: 2 };

// stable identity of a finding: the same finding keeps the same key after a new analysis
export const cardKey = (c) => [c.problem ?? c.kind, c.machine, c.page, ...(c.refs ?? []).map((r) => `${r.table}${r.linha}`)].join('|');

export function buildReport(a, dismissed = new Set()) {
  const out = [];
  let hidden = 0;
  const push = (c, kind) => {
    const tier = KIND_INDEX.get(kind);
    if (tier == null) return;
    const key = cardKey({ ...c, kind });
    if (dismissed.has(key)) { hidden++; return; }
    out.push({
      key, tier, kind, title: KINDS[tier].name, color: KINDS[tier].color, sev: c.sev === 'info' ? 'media' : c.sev, machine: c.machine, day: c.day ?? '', page: c.page, label: c.label,
      table: c.table, ri: c.ri, linha: c.linha, refs: c.refs ?? [], brief: c.brief ?? c.text, who: c.who ?? '', people: c.people ?? [], story: c.story ?? c.headline ?? c.text ?? '', lines: c.lines ?? [], fix: c.fix ?? '', caution: c.caution ?? '',
      text: c.headline ?? c.text, why: c.why ?? '',
      big: c.big ?? (c.meter ? `${Math.round((c.meter.part / c.meter.total) * 100)} %` : ''),
      bigLabel: c.bigLabel ?? (c.meter ? `${c.meter.part} de ${c.meter.total}` : ''),
    });
  };
  for (const c of a.cards ?? []) push(c, c.kind);
  for (const q of a.quality ?? []) push(q, q.problem ?? q.kind);
  // checks that are not cards yet (time against the standard, incomplete records, rows without reason)
  const pageDay = new Map();
  for (const c of [...(a.cards ?? []), ...(a.quality ?? [])]) if (c.page != null && c.day) pageDay.set(c.page, c.day);
  const incomplete = new Map(); // one card per sheet for the incomplete rows (they usually come in groups)
  for (const i of a.issues ?? []) {
    if (i.kind === 'incompleto') { if (!incomplete.has(i.page)) incomplete.set(i.page, []); incomplete.get(i.page).push(i); continue; }
    if ((a.cards ?? []).includes(i) || !['acima do padrão', 'abaixo do padrão'].includes(i.kind)) continue;
    push({ ...i, day: pageDay.get(i.page) ?? '', refs: i.table ? [{ table: i.table, linha: i.linha }] : [], lines: [i.text], brief: i.text.replace(/^Linha \d+ /, '').slice(0, 110) }, i.kind);
  }
  for (const [page, list] of incomplete) {
    const first = list[0];
    push({ sev: 'media', machine: first.machine, page, label: first.label, day: pageDay.get(page) ?? '', table: first.table, ri: first.ri, linha: first.linha,
      refs: list.filter((i) => i.table).map((i) => ({ table: i.table, linha: i.linha })), lines: list.map((i) => i.text), brief: `${list.length} linha${list.length === 1 ? '' : 's'} com data ou horário incompleto`,
      big: String(list.length), bigLabel: `linha${list.length === 1 ? '' : 's'} fora do cruzamento`, text: `${first.machine}: ${list.length} registro(s) com data ou horário incompleto ficaram fora do cruzamento de horários.`,
      why: 'Sem os dois horários não dá para cruzar produção com parada.' }, 'incompleto');
  }
  out.sort((x, y) => x.tier - y.tier || RANK[x.sev] - RANK[y.sev] || String(x.machine).localeCompare(String(y.machine), 'pt-BR') || String(x.day).localeCompare(String(y.day)));
  out.forEach((c, i) => { c.id = `c${i}`; });
  out.hidden = hidden;
  return out;
}
