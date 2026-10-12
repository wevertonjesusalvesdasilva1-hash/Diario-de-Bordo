// The list of warning cards shown in the Analysis tab: everything that deserves attention, in priority
// order. Wrong notes first (producing while stopped), then big times, then who fills the sheet badly,
// then the rest, and bad handwriting last. Pure function over the analysis result.

export const TIERS = [
  { id: 1, name: 'Anotação errada', hint: 'A folha se contradiz' },
  { id: 2, name: 'Tempo grande', hint: 'Parada ou produção acima do normal' },
  { id: 3, name: 'Preenchimento', hint: 'Colunas em branco ou fora do horário' },
  { id: 4, name: 'Outros pontos', hint: 'Vale uma olhada' },
  { id: 5, name: 'Caligrafia', hint: 'Letra difícil de ler' },
];
const TITLE = {
  'produzindo parado': 'Produzindo e parado ao mesmo tempo', 'registros sobrepostos': 'Dois registros no mesmo horário', 'parada longa': 'Parada mais longa que o normal',
  'sem registro': 'Tempo sem registro', 'acima do padrão': 'Produção acima do tempo padrão', 'abaixo do padrão': 'Produção abaixo do tempo padrão', incompleto: 'Registro incompleto', 'sem motivo': 'Parada sem motivo',
  'sem chapa': 'Chapa não preenchida', 'horário incompleto': 'Horário incompleto', 'sem data': 'Data não preenchida', 'turno em branco': 'Turno em branco', 'turno incerto': 'Turno incerto',
  'turno diferente do horário': 'Turno não bate com o horário', caligrafia: 'Caligrafia difícil',
};
const TIER_OF = {
  'produzindo parado': 1, 'registros sobrepostos': 1, 'parada longa': 2, 'acima do padrão': 2,
  'sem chapa': 3, 'sem motivo agregado': 3, 'horário incompleto': 3, 'sem data': 3, 'turno em branco': 3, 'turno incerto': 3, 'turno diferente do horário': 3,
  'sem registro': 4, 'abaixo do padrão': 4, incompleto: 4, 'sem motivo': 4, caligrafia: 5,
};
const RANK = { alta: 0, media: 1, info: 2 };
const shortDay = (d) => d || '';

export function buildReport(a) {
  const out = [];
  const push = (c, kind, extra = {}) => {
    const tier = TIER_OF[kind];
    if (!tier) return;
    out.push({
      tier, kind, title: TITLE[kind] ?? kind, sev: c.sev === 'info' ? 'media' : c.sev, machine: c.machine, day: c.day ?? '', page: c.page, label: c.label,
      table: c.table, ri: c.ri, linha: c.linha, refs: c.refs ?? [], brief: c.brief ?? c.text, text: c.headline ?? c.text, why: c.why ?? '',
      big: c.viz?.big ?? (c.meter ? `${Math.round((c.meter.part / c.meter.total) * 100)} %` : ''),
      bigLabel: c.viz?.bigLabel ?? (c.meter ? `${c.meter.part} de ${c.meter.total}` : ''), viz: c.viz ?? null, ...extra,
    });
  };
  for (const c of a.cards ?? []) { if (c.sev === 'info') continue; push(c, c.kind); }
  for (const q of a.quality ?? []) push(q, q.problem ?? q.kind);
  // checks that are not cards yet (time against the standard, incomplete records, rows without reason)
  const pageDay = new Map();
  for (const c of [...(a.cards ?? []), ...(a.quality ?? [])]) if (c.page != null && c.day) pageDay.set(c.page, c.day);
  for (const i of a.issues ?? []) {
    if ((a.cards ?? []).includes(i) || !['acima do padrão', 'abaixo do padrão', 'sem motivo'].includes(i.kind) && !/^incompleto$/.test(i.kind)) continue;
    push({ ...i, day: pageDay.get(i.page) ?? '', refs: i.table ? [{ table: i.table, linha: i.linha }] : [], brief: i.text.replace(/^Linha \d+ /, '').slice(0, 110) }, i.kind);
  }
  out.sort((x, y) => x.tier - y.tier || RANK[x.sev] - RANK[y.sev] || String(x.machine).localeCompare(String(y.machine), 'pt-BR') || String(x.day).localeCompare(String(y.day)));
  out.forEach((c, i) => { c.id = `c${i}`; });
  return out;
}
export const summarize = (report) => ({ total: report.length, graves: report.filter((c) => c.sev === 'alta').length, machines: [...new Set(report.map((c) => c.machine))].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR')) });
