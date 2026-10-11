import { OvertimeRecord } from '../types';

export const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export const fixText = (s: string) => (s || '').replace(/N\?O/g, 'NÃO').trim();
export const turno = (r: OvertimeRecord) => (r.de && r.ate ? `${r.de} – ${r.ate}` : 'Sem horário');
export const isLeaderRow = (r: OvertimeRecord) => norm(r.motivoHe) === 'responsavel';
export const needsTransport = (r: OvertimeRecord) => {
  const t = norm(r.transporte);
  return t !== '' && !t.startsWith('outros');
};
export const transpLabel = (r: OvertimeRecord) =>
  fixText(r.transporte).replace('OUTROS MEIOS - NÃO TEM DESCONTO', 'Outros meios');

export function countBy<T>(items: T[], key: (x: T) => string): [string, number][] {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function halves<T>(xs: T[]): [T[], T[]] {
  const n = Math.ceil(xs.length / 2);
  return [xs.slice(0, n), xs.slice(n)];
}

export type SortMode = 'ALFA' | 'PECA' | 'LIDER' | 'CC' | 'CHAPA';
export const SORT_LABELS: Record<SortMode, string> = {
  ALFA: 'Alfabética (nome)',
  PECA: 'Por peça',
  LIDER: 'Por líder',
  CC: 'Por centro de custo',
  CHAPA: 'Por chapa',
};

export interface Filters {
  lider: string[];
  peca: string[];
  cc: string[];
  turno: string[];
  transporte: string; // ALL | COM | SEM
  busca: string;
}
export const EMPTY_FILTERS: Filters = { lider: [], peca: [], cc: [], turno: [], transporte: 'ALL', busca: '' };

/** "Alexandre / Odonei" -> ['Alexandre', 'Odonei'] (um colaborador pode ter mais de um líder). */
export const leaderNames = (r: OvertimeRecord): string[] => {
  const parts = (r.lider || '').split('/').map((x) => x.trim()).filter(Boolean);
  return parts.length ? parts : ['Não identificado'];
};

export function applyFilters(recs: OvertimeRecord[], f: Filters) {
  const q = norm(f.busca);
  const pecas = new Set(f.peca.map(norm));
  return recs.filter(
    (r) =>
      (f.lider.length === 0 || leaderNames(r).some((n) => f.lider.includes(n))) &&
      (pecas.size === 0 || pecas.has(norm(r.motivoHe))) &&
      (f.cc.length === 0 || f.cc.includes(r.cc)) &&
      (f.turno.length === 0 || f.turno.includes(turno(r))) &&
      (f.transporte === 'ALL' || (f.transporte === 'COM') === needsTransport(r)) &&
      (!q || norm(`${r.funcionario} ${r.chapa} ${r.motivoHe}`).includes(q)),
  );
}

export const groupKeyOf = (mode: SortMode, r: OvertimeRecord): string | null =>
  mode === 'PECA' ? r.motivoHe.trim() || '—' : mode === 'LIDER' ? r.lider || 'Não identificado' : mode === 'CC' ? r.cc || 'Sem CC' : null;

export function sortRecords(recs: OvertimeRecord[], mode: SortMode) {
  const byName = (a: OvertimeRecord, b: OvertimeRecord) => a.funcionario.localeCompare(b.funcionario, 'pt-BR');
  const lead = (a: OvertimeRecord, b: OvertimeRecord) => Number(isLeaderRow(b)) - Number(isLeaderRow(a));
  const cmp: Record<SortMode, (a: OvertimeRecord, b: OvertimeRecord) => number> = {
    ALFA: byName,
    PECA: (a, b) => norm(a.motivoHe).localeCompare(norm(b.motivoHe)) || byName(a, b),
    LIDER: (a, b) => (a.lider || '').localeCompare(b.lider || '', 'pt-BR') || lead(a, b) || byName(a, b),
    CC: (a, b) => (a.cc || '').localeCompare(b.cc || '') || lead(a, b) || norm(a.motivoHe).localeCompare(norm(b.motivoHe)) || byName(a, b),
    CHAPA: (a, b) => Number(a.chapa) - Number(b.chapa),
  };
  return [...recs].sort((a, b) => (mode === 'ALFA' || mode === 'CHAPA' ? 0 : 0) || cmp[mode](a, b));
}

export type Row = { kind: 'group'; label: string; n: number } | { kind: 'rec'; r: OvertimeRecord; idx: number };

/** Linhas da lista nominal, já com cabeçalhos de grupo quando pedido. */
export function buildRows(recs: OvertimeRecord[], mode: SortMode, group: boolean): Row[] {
  const sorted = sortRecords(recs, mode);
  const rows: Row[] = [];
  let last: string | null = null;
  let idx = 0;
  const counts = new Map<string, number>();
  if (group) sorted.forEach((r) => { const k = groupKeyOf(mode, r); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); });
  sorted.forEach((r) => {
    const k = group ? groupKeyOf(mode, r) : null;
    if (k && k !== last) {
      rows.push({ kind: 'group', label: k, n: counts.get(k) ?? 0 });
      last = k;
    }
    rows.push({ kind: 'rec', r, idx: ++idx });
  });
  return rows;
}

export function buildSummary(recs: OvertimeRecord[]) {
  const leaders = recs.filter(isLeaderRow);
  const workers = recs.filter((r) => !isLeaderRow(r));
  const transp = recs.filter(needsTransport);
  const pm = new Map<string, { nome: string; cc: Set<string>; people: string[] }>();
  workers.forEach((r) => {
    const k = norm(r.motivoHe);
    const e = pm.get(k) ?? { nome: r.motivoHe.trim(), cc: new Set<string>(), people: [] };
    if (r.cc) e.cc.add(r.cc);
    const parts = r.funcionario.split(' ');
    e.people.push(parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1]}` : parts[0]);
    pm.set(k, e);
  });
  return {
    total: recs.length,
    leaders,
    byTurno: countBy(recs, turno),
    byCc: countBy(recs, (r) => r.cc || 'Sem CC'),
    byLider: countBy(recs, (r) => r.lider || 'Não identificado'),
    byRef: countBy(recs, (r) => fixText(r.refeicao) || 'Sem refeição'),
    byRota: countBy(transp, (r) => fixText(r.transporte)),
    byDia: countBy(recs, (r) => r.data).sort((a, b) => a[0].split('/').reverse().join().localeCompare(b[0].split('/').reverse().join())),
    comTransp: transp.length,
    semTransp: recs.length - transp.length,
    aprovados: recs.filter((r) => norm(r.aprovacao) === 'aprovado').length,
    gestores: [...new Set(recs.map((r) => r.gestor).filter(Boolean))],
    locais: [...new Set(recs.map((r) => r.local).filter(Boolean))],
    pieces: [...pm.values()].sort((a, b) => b.people.length - a.people.length || a.nome.localeCompare(b.nome)),
  };
}
