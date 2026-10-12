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
  ALFA: 'Alfabética (dias agrupados)',
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

const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
/** "Sábado · 03/10/2026" */
export const dayLabel = (r: OvertimeRecord) => {
  const m = (r.dataSortKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const wd = m ? DIAS[new Date(+m[1], +m[2] - 1, +m[3]).getDay()] : '';
  return wd ? `${wd} · ${r.data}` : r.data;
};

// ---------- Classificação por colunas (estilo Excel: vários níveis, A→Z / Z→A) ----------
export type ColKey = 'data' | 'chapa' | 'nome' | 'peca' | 'cc' | 'lider' | 'horario' | 'transporte' | 'resp';
export interface SortLevel { col: ColKey; dir: 'asc' | 'desc' }
export const COL_LABELS: Record<ColKey, string> = {
  data: 'Data', chapa: 'Chapa', nome: 'Funcionário', peca: 'Peça', cc: 'CC', lider: 'Líder', horario: 'Horário', transporte: 'Transporte', resp: 'Responsáveis primeiro',
};

/** Ordens rápidas = combinações prontas de níveis. */
export function presetLevels(mode: SortMode): SortLevel[] {
  const up = (...c: ColKey[]): SortLevel[] => c.map((col) => ({ col, dir: 'asc' }));
  switch (mode) {
    case 'ALFA': return up('data', 'nome');
    case 'CHAPA': return up('data', 'chapa');
    case 'PECA': return up('peca', 'data', 'nome');
    case 'LIDER': return up('lider', 'data', 'resp', 'nome');
    case 'CC': return up('cc', 'data', 'resp', 'peca', 'nome');
  }
}
export const levelsKey = (l: SortLevel[]) => l.map((x) => `${x.col}:${x.dir}`).join('|');
export const matchPreset = (l: SortLevel[]): SortMode | null =>
  (Object.keys(SORT_LABELS) as SortMode[]).find((m) => levelsKey(presetLevels(m)) === levelsKey(l)) ?? null;
export const levelsLabel = (l: SortLevel[]) =>
  l.filter((x) => x.col !== 'resp').map((x) => `${COL_LABELS[x.col]} ${x.dir === 'asc' ? '↑' : '↓'}`).join(' › ');

const timeKey = (r: OvertimeRecord) => `${r.de || '99:99'}-${r.ate || '99:99'}`;
const cmpText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const COL_CMP: Record<ColKey, (a: OvertimeRecord, b: OvertimeRecord) => number> = {
  data: (a, b) => (a.dataSortKey || '').localeCompare(b.dataSortKey || ''),
  chapa: (a, b) => (Number(a.chapa) || 0) - (Number(b.chapa) || 0) || cmpText(String(a.chapa), String(b.chapa)),
  nome: (a, b) => cmpText(a.funcionario, b.funcionario),
  peca: (a, b) => cmpText(norm(a.motivoHe), norm(b.motivoHe)),
  cc: (a, b) => cmpText(a.cc || '', b.cc || ''),
  lider: (a, b) => cmpText(a.lider || '', b.lider || ''),
  horario: (a, b) => timeKey(a).localeCompare(timeKey(b)),
  transporte: (a, b) => cmpText(transpLabel(a), transpLabel(b)),
  resp: (a, b) => Number(isLeaderRow(b)) - Number(isLeaderRow(a)),
};

/** Aplica os níveis na ordem; desempate final: dia, depois nome. */
export function sortRecords(recs: OvertimeRecord[], levels: SortLevel[]) {
  return [...recs].sort((a, b) => {
    for (const lv of levels) {
      const c = COL_CMP[lv.col](a, b);
      if (c) return lv.dir === 'asc' ? c : -c;
    }
    return COL_CMP.data(a, b) || COL_CMP.nome(a, b);
  });
}

/** Faixa (grupo) conforme a coluna do 1º nível. Nome/chapa não agrupam. */
export function groupKeyOf(col: ColKey, r: OvertimeRecord): string | null {
  switch (col) {
    case 'data': return dayLabel(r);
    case 'peca': return r.motivoHe.trim() || '—';
    case 'lider': return r.lider || 'Não identificado';
    case 'cc': return r.cc || 'Sem CC';
    case 'horario': return turno(r);
    case 'transporte': return transpLabel(r) || 'Sem transporte';
    default: return null;
  }
}

export type Row = { kind: 'group'; label: string; n: number } | { kind: 'rec'; r: OvertimeRecord; idx: number };

/** Linhas da lista nominal, já com cabeçalhos de grupo quando pedido. */
export function buildRows(recs: OvertimeRecord[], levels: SortLevel[], group: boolean): Row[] {
  const sorted = sortRecords(recs, levels);
  const first = levels[0]?.col;
  const rows: Row[] = [];
  let last: string | null = null;
  let idx = 0;
  const counts = new Map<string, number>();
  if (group && first) sorted.forEach((r) => { const k = groupKeyOf(first, r); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); });
  sorted.forEach((r) => {
    const k = group && first ? groupKeyOf(first, r) : null;
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
