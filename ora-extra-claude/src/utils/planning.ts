import { OvertimeRecord } from '../types';

export const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
export const fixText = (s: string) => (s || '').replace(/N\?O/g, 'NÃO').trim();
export const turno = (r: OvertimeRecord) => (r.de && r.ate ? `${r.de} – ${r.ate}` : 'Sem horário');
/** Contramestres/líderes oficiais: a chapa manda; sem chapa válida, vale o nome (1º nome + sobrenome nas 2 primeiras palavras úteis). */
const LEADER_KEYS: [string, string][] = [
  ['odonei', 'donizete'], ['luiz', 'alves'], ['ronaldo', 'domingos'], ['fabio', 'nunes'],
  ['alexandre', 'goncalves'], ['rogerio', 'araujo'], ['diego', 'domingues'], ['joao', 'oliveira'],
];
const LEADER_CHAPAS: Record<string, string> = {
  '7488': 'odonei', '8264': 'luiz', '6879': 'ronaldo', '8089': 'fabio',
  '8141': 'alexandre', '11342': 'rogerio', '9189': 'diego', '8335': 'joao',
};
const PARTICLES = new Set(['de', 'da', 'do', 'dos', 'das']);
const chapaId = (c?: string | number) => String(c ?? '').replace(/\D/g, '').replace(/^0+/, '');
export const leaderKey = (nome: string, chapa?: string | number) => {
  const byChapa = LEADER_CHAPAS[chapaId(chapa)];
  if (byChapa) return LEADER_KEYS.find(([a]) => a === byChapa);
  const t = norm(nome).split(/\s+/);
  const second = PARTICLES.has(t[1]) ? t[2] : t[1];
  return LEADER_KEYS.find(([a, b]) => t[0] === a && second === b);
};
export const isLeaderName = (nome: string, chapa?: string | number) => !!leaderKey(nome, chapa);
const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
const DISPLAY: Record<string, string> = { fabio: 'Fábio', joao: 'João', rogerio: 'Rogério', goncalves: 'Gonçalves', araujo: 'Araújo' };
const disp = (x: string) => DISPLAY[x] ?? cap(x);

/** Texto do líder canonizado: sem variação de caixa/acento, com o nome oficial ("ODONEI / alexandre" -> "Odonei / Alexandre"). */
export const canonLider = (lider: string) => {
  const parts = (lider || '').split('/').map((x) => x.trim()).filter(Boolean).map((p) => {
    const f = norm(p).split(/\s+/)[0];
    return LEADER_KEYS.some(([a]) => a === f) ? disp(f) : p;
  });
  return parts.length ? parts.join(' / ') : 'Não identificado';
};
export const isRealLeaderName = (nome: string) => !['', 'nao identificado', 'sem lider'].includes(norm(nome));

export interface LeaderCard { key: string; nome: string; turno: string; dia: string; total: number; byCc: [string, number][]; others?: boolean; days?: number }
const dayKey = (d: string) => d.split('/').reverse().join();
/** Um cartão por (dia, turno, líder DA PESSOA): toda a equipe aparece no cartão do seu contramestre, esteja ele na lista ou não. */
export function buildLeaderCards(recs: OvertimeRecord[]): LeaderCard[] {
  const groups = new Map<string, { nome: string; rs: OvertimeRecord[] }>();
  recs.forEach((r) => {
    const first = norm(r.lider).split(/[\s/]+/)[0];
    const key = LEADER_KEYS.find(([a]) => a === first);
    const nome = key ? `${disp(key[0])} ${disp(key[1])}` : (r.lider || 'Sem líder').split('/')[0].trim();
    const k = `${r.data}|${turno(r)}|${nome}`;
    const g = groups.get(k) ?? { nome, rs: [] };
    g.rs.push(r);
    groups.set(k, g);
  });
  return [...groups.entries()]
    .map(([key, g]) => ({ key, nome: g.nome, turno: turno(g.rs[0]), dia: g.rs[0].data, total: g.rs.length, byCc: countBy(g.rs, (r) => r.cc || 'Sem CC') }))
    .sort((x, y) => dayKey(x.dia).localeCompare(dayKey(y.dia)) || x.turno.localeCompare(y.turno) || x.nome.localeCompare(y.nome, 'pt-BR'));
}
/** Capa multi-dia com muitos cartões: junta os dias de cada (turno, líder), somando equipe e CC. */
export function mergeLeaderCards(cards: LeaderCard[]): LeaderCard[] {
  const m = new Map<string, LeaderCard & { cc: Map<string, number>; ds: Set<string> }>();
  cards.forEach((c) => {
    const k = `${c.turno}|${c.nome}`;
    const g = m.get(k) ?? { ...c, key: k, total: 0, byCc: [], cc: new Map<string, number>(), ds: new Set<string>() };
    g.total += c.total;
    g.ds.add(c.dia);
    c.byCc.forEach(([cc, n]) => g.cc.set(cc, (g.cc.get(cc) ?? 0) + n));
    m.set(k, g);
  });
  return [...m.values()]
    .map((g) => ({ key: g.key, nome: g.nome, turno: g.turno, dia: '', days: g.ds.size, total: g.total, byCc: [...g.cc.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])) as [string, number][], others: g.others }))
    .sort((x, y) => x.turno.localeCompare(y.turno) || x.nome.localeCompare(y.nome, 'pt-BR'));
}
export const isLeaderRow = (r: OvertimeRecord) => norm(r.motivoHe) === 'responsavel' || isLeaderName(r.funcionario, r.chapa);
export const needsTransport = (r: OvertimeRecord) => {
  const t = norm(r.transporte);
  return t !== '' && !t.startsWith('outros') && !t.startsWith('nao informado');
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

export type SortMode = 'EQUIPES' | 'ALFA' | 'PECA' | 'LIDER' | 'CC' | 'CHAPA';
export const SORT_LABELS: Record<SortMode, string> = {
  EQUIPES: 'Equipes (data › líder › horário)',
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
    case 'EQUIPES': return up('data', 'lider', 'horario', 'resp', 'nome');
    case 'ALFA': return up('data', 'nome');
    case 'CHAPA': return up('data', 'chapa');
    case 'PECA': return up('peca', 'data', 'nome');
    case 'LIDER': return up('lider', 'data', 'resp', 'nome');
    case 'CC': return up('cc', 'data', 'resp', 'peca', 'nome');
  }
}
export const DEFAULT_LEVELS = (): SortLevel[] => presetLevels('EQUIPES');
/** Preferência salva (aparelho/banco) pode vir corrompida: níveis inválidos são descartados; se nada sobrar, volta ao padrão. */
export function sanitizeLevels(v: unknown): SortLevel[] | null {
  if (!Array.isArray(v)) return null;
  const ok = v.filter((l): l is SortLevel => !!l && typeof l === 'object' && Object.prototype.hasOwnProperty.call(COL_LABELS, (l as SortLevel).col) && ((l as SortLevel).dir === 'asc' || (l as SortLevel).dir === 'desc'));
  return ok.length === 0 && v.length > 0 ? DEFAULT_LEVELS() : ok;
}
/** import() dinâmico que sinaliza "nova versão" quando o chunk não existe mais (deploy novo). */
export const CHUNK_ERROR = 'CHUNK_LOAD';
export const loadChunk = <T,>(load: () => Promise<T>) => load().catch(() => { throw new Error(CHUNK_ERROR); });
export const levelsKey = (l: SortLevel[]) => l.map((x) => `${x.col}:${x.dir}`).join('|');
export const matchPreset = (l: SortLevel[]): SortMode | null =>
  (Object.keys(SORT_LABELS) as SortMode[]).find((m) => levelsKey(presetLevels(m)) === levelsKey(l)) ?? null;
export const levelsLabel = (l: SortLevel[]) =>
  l.filter((x) => x.col !== 'resp').length === 0 ? 'ordem da planilha' : l.filter((x) => x.col !== 'resp').map((x) => `${COL_LABELS[x.col]} ${x.dir === 'asc' ? '↑' : '↓'}`).join(' › ');

const timeKey = (r: OvertimeRecord) => `${r.de || '99:99'}-${r.ate || '99:99'}`;
const cmpText = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { numeric: true });
const COL_CMP: Record<ColKey, (a: OvertimeRecord, b: OvertimeRecord) => number> = {
  data: (a, b) => (a.dataSortKey || '').localeCompare(b.dataSortKey || ''),
  chapa: (a, b) => (Number(a.chapa) || 0) - (Number(b.chapa) || 0) || cmpText(String(a.chapa), String(b.chapa)),
  nome: (a, b) => cmpText(a.funcionario, b.funcionario),
  peca: (a, b) => cmpText(norm(a.motivoHe), norm(b.motivoHe)),
  cc: (a, b) => cmpText(a.cc || '', b.cc || ''),
  lider: (a, b) => cmpText(canonLider(a.lider), canonLider(b.lider)),
  horario: (a, b) => timeKey(a).localeCompare(timeKey(b)),
  transporte: (a, b) => cmpText(transpLabel(a), transpLabel(b)),
  resp: (a, b) => Number(isLeaderRow(b)) - Number(isLeaderRow(a)),
};

/** Aplica os níveis na ordem; desempate final: dia, depois nome. */
export function sortRecords(recs: OvertimeRecord[], levels: SortLevel[]) {
  if (levels.length === 0) return [...recs]; // sem classificação: ordem original da planilha
  return [...recs].sort((a, b) => {
    for (const lv of levels) {
      const c = (COL_CMP[lv.col] ?? COL_CMP.nome)(a, b);
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
    case 'lider': return canonLider(r.lider);
    case 'cc': return r.cc || 'Sem CC';
    case 'horario': return turno(r);
    case 'transporte': return transpLabel(r) || 'Sem transporte';
    default: return null;
  }
}

export type Row = { kind: 'group'; label: string; n: number } | { kind: 'rec'; r: OvertimeRecord; idx: number };

const GROUPABLE: ColKey[] = ['data', 'peca', 'lider', 'cc', 'horario', 'transporte'];
/** Faixa composta pelos níveis iniciais agrupáveis (ex.: Sáb · 03/10 › Odonei › 06:00 – 12:00). */
function groupLabel(levels: SortLevel[], r: OvertimeRecord, multiDay: boolean): string | null {
  const parts: string[] = [];
  for (const lv of levels) {
    if (!GROUPABLE.includes(lv.col) || parts.length >= 3) break;
    if (lv.col === 'data' && !multiDay) continue;
    const k = groupKeyOf(lv.col, r);
    if (k) parts.push(k);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Linhas da lista nominal, já com cabeçalhos de grupo quando pedido. */
export function buildRows(recs: OvertimeRecord[], levels: SortLevel[], group: boolean): Row[] {
  const sorted = sortRecords(recs, levels);
  const multiDay = new Set(recs.map((r) => r.data)).size > 1;
  const rows: Row[] = [];
  let last: string | null = null;
  let idx = 0;
  const counts = new Map<string, number>();
  const keyOf = (r: OvertimeRecord) => (group ? groupLabel(levels, r, multiDay) : null);
  if (group) sorted.forEach((r) => { const k = keyOf(r); if (k) counts.set(k, (counts.get(k) ?? 0) + 1); });
  sorted.forEach((r) => {
    const k = keyOf(r);
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
    leaderCards: buildLeaderCards(recs),
    byTurno: countBy(recs, turno),
    byCc: countBy(recs, (r) => r.cc || 'Sem CC'),
    byLider: countBy(recs, (r) => canonLider(r.lider)),
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

/** Nome padrão dos arquivos baixados: Planejamento_HE_Komatsu_2026-10-03[_a_2026-10-05][_por-dia][_filtrado] */
export function exportBaseName(days: string[], perDay: boolean, filtered: boolean) {
  const iso = (d: string) => d.split('/').reverse().join('-');
  const list = [...days].map(iso).sort();
  const span = list.length === 1 ? list[0] : `${list[0]}_a_${list[list.length - 1]}${list.length > 2 ? `_${list.length}-dias` : ''}`;
  return `Planejamento_HE_Komatsu_${span}${list.length > 1 && perDay ? '_por-dia' : ''}${filtered ? '_filtrado' : ''}`;
}
