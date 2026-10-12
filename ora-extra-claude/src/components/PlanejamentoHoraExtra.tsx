import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { OvertimeRecord } from '../types';
import {
  applyFilters,
  buildRows,
  buildSummary,
  EMPTY_FILTERS,
  Filters,
  halves,
  isLeaderRow,
  leaderNames,
  norm,
  COL_LABELS,
  ColKey,
  levelsKey,
  levelsLabel,
  matchPreset,
  presetLevels,
  SORT_LABELS,
  SortLevel,
  SortMode,
  transpLabel,
  turno,
} from '../utils/planning';
import { OFFICIAL_LEADERS } from '../data/leaderDatabase';
import { BRAND } from '../utils/brand';
import { exportPlanningExcel } from '../utils/planningExcel';

// A3 paisagem: 420 x 297 mm a 96 dpi
const A3_W = 1587;
const A3_H = 1123;

type Mode = 'DAY' | 'EACH' | 'COMBINED';
type Layout = 'EACH' | 'COMBINED';

/** "02/10/2026" + "03/10/2026" -> "02/10 + 03/10/2026" */
const daysTitle = (ds: string[]) =>
  ds.length === 1 ? ds[0] : ds.slice(0, -1).map((d) => d.slice(0, 5)).join(' + ') + ' + ' + ds[ds.length - 1];

const Box = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`border ${className}`} style={{ breakInside: 'avoid', borderColor: BRAND.blue }}>
    <h3 className="text-white text-[11px] font-bold uppercase tracking-wide px-2 py-1" style={{ background: BRAND.blue, borderBottom: `3px solid ${BRAND.yellow}` }}>{title}</h3>
    <div className="p-2">{children}</div>
  </section>
);

function MiniTable({ rows, head }: { rows: (string | number)[][]; head: string[] }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`border-b pb-0.5 font-bold ${i === head.length - 1 ? 'text-right' : 'text-left'}`} style={{ borderColor: BRAND.blue, color: BRAND.blue }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-gray-300">
            {r.map((c, j) => (
              <td key={j} className={`py-0.5 ${j === r.length - 1 ? 'text-right font-bold tabular-nums' : ''}`}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Sheet({
  title,
  recs,
  showDate,
  levels,
  onSortHeader,
  group,
  filterNote,
}: {
  title: string;
  recs: OvertimeRecord[];
  showDate: boolean;
  levels: SortLevel[];
  onSortHeader?: (col: ColKey, additive: boolean) => void;
  group: boolean;
  filterNote: string;
}) {
  const s = useMemo(() => buildSummary(recs), [recs]);
  const rows = useMemo(() => buildRows(recs, levels, group), [recs, levels, group]);
  const [r1, r2] = halves(rows);
  const colDefs: { label: string; key: ColKey | null }[] = [
    { label: 'Data', key: 'data' }, { label: '#', key: null }, { label: 'Chapa', key: 'chapa' }, { label: 'Funcionário', key: 'nome' },
    { label: 'Peça', key: 'peca' }, { label: 'CC', key: 'cc' }, { label: 'Líder', key: 'lider' }, { label: 'Horário', key: 'horario' }, { label: 'Transporte', key: 'transporte' },
  ];
  const cols = colDefs.map((c) => c.label);

  const table = (list: typeof rows) => (
    <table className="w-full text-[10.5px] border-collapse self-start">
      <thead style={{ display: 'table-header-group' }}>
        <tr className="border-b-2 text-left" style={{ borderColor: BRAND.blue, color: BRAND.blue }}>
          {colDefs.map((c) => {
            const lvIdx = c.key ? levels.findIndex((l) => l.col === c.key) : -1;
            return (
              <th
                key={c.label}
                className={`py-0.5 pr-1.5 select-none ${c.key && onSortHeader ? 'cursor-pointer hover:underline' : ''}`}
                title={c.key && onSortHeader ? 'Clique para classificar · Shift+clique para somar outro critério' : undefined}
                onClick={c.key && onSortHeader ? (e) => onSortHeader(c.key as ColKey, e.shiftKey) : undefined}
              >
                {c.label}
                {lvIdx >= 0 && (
                  <span style={{ color: BRAND.blue }}>
                    {' '}{levels[lvIdx].dir === 'asc' ? '▲' : '▼'}
                    {levels.filter((l) => l.col !== 'resp').length > 1 ? <sup>{levels.filter((l) => l.col !== 'resp').findIndex((l) => l.col === c.key) + 1}</sup> : null}
                  </span>
                )}
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {list.map((x, i) =>
          x.kind === 'group' ? (
            <tr key={`g${i}`} className="font-bold" style={{ breakInside: 'avoid', background: BRAND.blueSoft, color: BRAND.blue }}>
              <td colSpan={cols.length} className="px-1 py-0.5">
                {x.label} — {x.n}
              </td>
            </tr>
          ) : (
            <tr key={x.r.id} className={`border-b border-gray-300 ${isLeaderRow(x.r) ? 'font-bold' : ''}`} style={{ breakInside: 'avoid', background: isLeaderRow(x.r) ? BRAND.yellowSoft : undefined }}>
              <td className="py-0.5 pr-1.5 tabular-nums">{x.r.data.slice(0, 5)}</td>
              <td className="py-0.5 pr-1.5 tabular-nums">{x.idx}</td>
              <td className="pr-1.5 tabular-nums">{x.r.chapa}</td>
              <td className="pr-1.5">{x.r.funcionario}</td>
              <td className="pr-1.5">{x.r.motivoHe}</td>
              <td className="pr-1.5">{x.r.cc}</td>
              <td className="pr-1.5">{x.r.lider}</td>
              <td className="pr-1.5 whitespace-nowrap tabular-nums font-semibold">{x.r.de && x.r.ate ? `${x.r.de}–${x.r.ate}` : '—'}</td>
              <td className="pr-1.5">{transpLabel(x.r)}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );

  return (
    <div className="bg-white text-black p-5 font-sans" style={{ width: A3_W, minHeight: A3_H, boxSizing: 'border-box' }}>
      <div className="flex items-center justify-between gap-4 px-4 py-3 mb-3 text-white" style={{ background: BRAND.blue, borderBottom: `8px solid ${BRAND.yellow}` }}>
        <img src="/komatsu-logo-white.png" alt="Komatsu" style={{ height: 48 }} />
        <div className="mr-auto">
          <h1 className="text-3xl font-black tracking-tight">PLANEJAMENTO DE HORA EXTRA</h1>
          <p className="text-sm font-semibold" style={{ color: BRAND.yellow }}>
            {s.locais.join(' / ') || '—'} · Gestor: {s.gestores.join(' / ') || '—'}
          </p>
          {filterNote && <p className="text-xs">Filtros: {filterNote}</p>}
        </div>
        <div className="text-right">
          <p className="text-4xl font-black tabular-nums" style={{ color: BRAND.yellow }}>{title}</p>
          <p className="text-xs">
            {s.aprovados}/{s.total} aprovados
          </p>
        </div>
      </div>

      <div className="grid gap-3 mb-3 items-start" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="border-2 p-2 text-center self-stretch flex flex-col justify-center" style={{ borderColor: BRAND.blue, background: BRAND.yellow, color: BRAND.blue }}>
          <p className="text-[10px] font-bold uppercase">Total</p>
          <p className="text-5xl font-black tabular-nums leading-none">{s.total}</p>
          <p className="text-[10px]">colaboradores</p>
        </div>
        {showDate ? (
          <Box title="Por dia">
            <MiniTable head={['Dia', 'Qtd']} rows={s.byDia.map(([k, v]) => [k, v])} />
          </Box>
        ) : null}
        <Box title="Por turno">
          <MiniTable head={['Horário', 'Qtd']} rows={s.byTurno.map(([k, v]) => [k, v])} />
        </Box>
        <Box title="Por centro de custo">
          <MiniTable head={['CC', 'Qtd']} rows={s.byCc.map(([k, v]) => [k, v])} />
        </Box>
        <Box title="Transporte">
          <MiniTable head={['Tipo', 'Qtd']} rows={[['Com transporte', s.comTransp], ['Sem (outros meios)', s.semTransp]]} />
        </Box>
        {!showDate && (
          <Box title="Refeição">
            <MiniTable head={['Tipo', 'Qtd']} rows={s.byRef.map(([k, v]) => [k, v])} />
          </Box>
        )}
        <Box title="Por líder / contramestre">
          <MiniTable head={['Líder', 'Qtd']} rows={s.byLider.map(([k, v]) => [k, v])} />
        </Box>
      </div>

      <div className="grid gap-3 mb-3 items-start" style={{ gridTemplateColumns: '1fr 2.2fr' }}>
        <div className="space-y-3">
          <Box title={`Líderes / responsáveis em destaque (${s.leaders.length})`}>
            {s.leaders.length === 0 ? (
              <p className="text-[11px]">Nenhum responsável indicado.</p>
            ) : (
              <ul className="text-[12px] space-y-0.5">
                {s.leaders.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 border-b border-gray-300">
                    <span className="font-bold">{r.funcionario}</span>
                    <span className="tabular-nums whitespace-nowrap">
                      {showDate ? r.data.slice(0, 5) + ' · ' : ''}
                      {r.chapa} · {r.cc}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Box>
          <Box title="Transporte por rota">
            <MiniTable head={['Rota', 'Qtd']} rows={s.byRota.map(([k, v]) => [k, v])} />
          </Box>
        </div>
        <Box title={`Quantidade por peça / atividade (${s.pieces.length})`}>
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {halves(s.pieces).map((half, i) => (
              <table key={i} className="w-full text-[11px] border-collapse self-start">
                <thead>
                  <tr className="border-b text-left" style={{ borderColor: BRAND.blue, color: BRAND.blue }}>
                    <th>Peça</th>
                    <th>CC</th>
                    <th>Soldadores</th>
                    <th className="text-right">Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {half.map((pc) => (
                    <tr key={pc.nome} className="border-b border-gray-300 align-top">
                      <td className="font-bold pr-2">{pc.nome}</td>
                      <td className="pr-2">{[...pc.cc].join('/')}</td>
                      <td className="pr-2 text-[10px]">{pc.people.join(', ')}</td>
                      <td className="text-right font-bold tabular-nums">{pc.people.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </Box>
      </div>

      <Box title={`Lista nominal (${recs.length}) · classificada por ${levelsLabel(levels)}${group ? ' · agrupada' : ''}`}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {table(r1)}
          {table(r2)}
        </div>
      </Box>
    </div>
  );
}


/** Colaboradores com mais de um líder na base (ou sem líder): o usuário escolhe o líder certo. */
function LeaderConflicts({ records, onSetLeader }: { records: OvertimeRecord[]; onSetLeader: (chapa: string, nome: string, lider: string) => void }) {
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const m = new Map<string, OvertimeRecord>();
    records.forEach((r) => {
      const multi = (r.lider || '').includes('/');
      const none = !r.lider || norm(r.lider) === 'nao identificado';
      if (multi || none) m.set(r.chapa || r.funcionario, r);
    });
    return [...m.values()].sort((a, b) => a.funcionario.localeCompare(b.funcionario, 'pt-BR'));
  }, [records]);
  const multi = list.filter((r) => (r.lider || '').includes('/')).length;
  if (list.length === 0) return null;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
        <span>
          ⚠ {multi > 0 && `${multi} colaborador${multi > 1 ? 'es' : ''} com mais de um líder cadastrado`}
          {multi > 0 && list.length - multi > 0 && ' · '}
          {list.length - multi > 0 && `${list.length - multi} sem líder`}
        </span>
        <button type="button" onClick={() => setOpen(true)} className="ml-auto rounded-lg bg-amber-500 px-3 py-1 font-bold text-slate-950">
          Resolver agora
        </button>
      </div>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3" onClick={() => setOpen(false)}>
          <div className="max-h-[85vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-700 bg-slate-900 p-4" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-bold">Definir o líder de cada colaborador</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg bg-slate-800 px-3 py-1 text-sm">Fechar</button>
            </div>
            <p className="mb-3 text-xs text-slate-400">
              A base de líderes tem essas pessoas em mais de uma lista. Escolha o líder certo: a escolha é salva neste aparelho e vale para os próximos Excel.
            </p>
            {list.length === 0 && <p className="text-sm text-emerald-300">Tudo resolvido ✓</p>}
            {list.map((r) => {
              const cands = (r.lider || '').includes('/') ? r.lider.split('/').map((x) => x.trim()) : [...OFFICIAL_LEADERS];
              return (
                <div key={r.id} className="border-b border-slate-800 py-2">
                  <div className="text-sm font-semibold">{r.funcionario} <span className="text-xs font-normal text-slate-400">· {r.chapa} · {r.motivoHe} · {r.cc}</span></div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {cands.map((c) => (
                      <button key={c} type="button" onClick={() => onSetLeader(r.chapa, r.funcionario, c)} className="rounded-lg bg-slate-800 px-3 py-1 text-xs font-bold text-slate-100 hover:bg-emerald-600">
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

const sel = 'rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 min-w-0';

function MultiSelect({ label, all, options, value, onChange }: { label: string; all: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) { setQ(''); return; }
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const shown = options.filter((o) => norm(o).includes(norm(q)));
  const toggle = (o: string) => onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  const text = value.length === 0 ? `${label}: ${all}` : value.length === 1 ? `${label}: ${value[0]}` : `${label}: ${value.length} selec.`;
  return (
    <div ref={ref} className="relative min-w-0">
      <button type="button" onClick={() => setOpen(!open)} className={`${sel} w-full text-left truncate ${value.length ? 'border-amber-400 text-amber-200' : ''}`}>
        {text} ▾
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-64 max-h-72 overflow-auto rounded-xl border border-slate-600 bg-slate-900 p-1.5 shadow-xl">
          {options.length > 8 && (
            <input autoFocus className="mb-1 w-full rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs" placeholder={`Buscar ${label.toLowerCase()}…`} value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          <div className="flex justify-between px-1.5 py-1 text-[11px]">
            <button type="button" className="text-amber-300 underline" onClick={() => onChange([...new Set([...value, ...shown])])}>marcar {q ? 'os da busca' : 'todos'}</button>
            <button type="button" className="text-slate-300 underline" onClick={() => onChange([])}>limpar</button>
          </div>
          {shown.map((o) => (
            <label key={o} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-800 cursor-pointer">
              <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} />
              <span className="truncate">{o}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}


export default function PlanejamentoHoraExtra({
  records,
  selectedDate,
  onUpload,
  onSetLeader,
}: {
  records: OvertimeRecord[];
  selectedDate: string;
  onUpload: () => void;
  onSetLeader: (chapa: string, nome: string, lider: string) => void;
}) {
  const dates = useMemo(() => {
    const m = new Map<string, string>();
    records.forEach((r) => m.set(r.data, r.dataSortKey));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([d]) => d);
  }, [records]);

  const [picked, setPicked] = useState<string[]>([selectedDate]);
  const [layout, setLayout] = useState<Layout>('COMBINED');
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [levels, setLevels] = useState<SortLevel[]>(presetLevels('ALFA'));
  const [sortOpen, setSortOpen] = useState(false);
  const [group, setGroup] = useState(true);
  const [busy, setBusy] = useState(false);

  // dias escolhidos (ordem cronológica); se nada válido, usa o primeiro dia
  const days = useMemo(() => {
    const v = dates.filter((d) => picked.includes(d));
    return v.length ? v : dates.slice(0, 1);
  }, [dates, picked]);
  const mode: Mode = days.length === 1 ? 'DAY' : layout;
  const toggleDay = (d: string) =>
    setPicked(days.includes(d) ? (days.length > 1 ? days.filter((x) => x !== d) : days) : [...days, d]);
  const scope = useMemo(() => records.filter((r) => days.includes(r.data)), [records, days]);

  // opções dos filtros (baseadas no escopo atual)
  const opts = useMemo(() => {
    const uniq = (f: (r: OvertimeRecord) => string) => [...new Set(scope.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const pecas = new Map<string, string>();
    scope.forEach((r) => pecas.set(norm(r.motivoHe), r.motivoHe.trim()));
    return {
      lider: [...new Set(scope.flatMap(leaderNames))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      peca: [...pecas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      cc: uniq((r) => r.cc),
      turno: uniq(turno),
    };
  }, [scope]);

  // ao trocar de dia/escopo, remove seleções que não existem mais
  useEffect(() => {
    setFilters((f) => {
      const keep = (v: string[], o: string[]) => v.filter((x) => o.includes(x));
      const n = { ...f, lider: keep(f.lider, opts.lider), peca: keep(f.peca, opts.peca), cc: keep(f.cc, opts.cc), turno: keep(f.turno, opts.turno) };
      return n.lider.length === f.lider.length && n.peca.length === f.peca.length && n.cc.length === f.cc.length && n.turno.length === f.turno.length ? f : n;
    });
  }, [opts]);

  const filtered = useMemo(() => applyFilters(scope, filters), [scope, filters]);
  const filterNote = [
    filters.lider.length > 0 && `Líder: ${filters.lider.join(', ')}`,
    filters.peca.length > 0 && `Peça: ${filters.peca.join(', ')}`,
    filters.cc.length > 0 && `CC: ${filters.cc.join(', ')}`,
    filters.turno.length > 0 && `Turno: ${filters.turno.join(', ')}`,
    filters.transporte !== 'ALL' && (filters.transporte === 'COM' ? 'Com transporte' : 'Sem transporte'),
    filters.busca && `Busca "${filters.busca}"`,
  ]
    .filter(Boolean)
    .join(' · ');

  const sheets: { key: string; title: string; recs: OvertimeRecord[]; showDate: boolean }[] =
    mode === 'DAY'
      ? [{ key: days[0], title: days[0], recs: filtered, showDate: false }]
      : mode === 'EACH'
      ? days
          .map((d) => ({ key: d, title: d, recs: filtered.filter((r) => r.data === d), showDate: false }))
          .filter((x) => x.recs.length > 0)
      : [{ key: 'ALL', title: daysTitle(days), recs: filtered, showDate: true }];

  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  const [zoom, setZoom] = useState<number | null>(null); // null = ajustar à largura
  const scale = zoom ?? fitScale;
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const anchor = useRef<{ px: number; py: number; cx: number; cy: number; old: number } | null>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | null>(null);
  const clampZoom = (z: number) => Math.min(2.5, Math.max(0.2, z));
  const [contentH, setContentH] = useState(A3_H);
  const pages = Math.max(1, Math.ceil(contentH / A3_H - 0.02));

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setFitScale(Math.min(1, (el.clientWidth - 2) / A3_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Ctrl + scroll (ou pinça no trackpad) = zoom ancorado no cursor
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const old = scaleRef.current;
      const next = clampZoom(old * Math.exp(-e.deltaY * (e.deltaMode === 0 ? 0.0012 : 0.04)));
      const r = el.getBoundingClientRect();
      anchor.current = { px: e.clientX - r.left + el.scrollLeft, py: e.clientY - r.top + el.scrollTop, cx: e.clientX - r.left, cy: e.clientY - r.top, old };
      setZoom(next);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    const a = anchor.current;
    if (!el || !a) return;
    el.scrollLeft = (a.px / a.old) * scale - a.cx;
    el.scrollTop = (a.py / a.old) * scale - a.cy;
    anchor.current = null;
  }, [scale]);

  const zoomBy = (f: number) => {
    const el = wrapRef.current;
    if (el) anchor.current = { px: el.scrollLeft + el.clientWidth / 2, py: el.scrollTop + el.clientHeight / 2, cx: el.clientWidth / 2, cy: el.clientHeight / 2, old: scale };
    setZoom(clampZoom(scale * f));
  };

  useEffect(() => {
    const el = sheetsRef.current;
    if (!el) return;
    const count = () => setContentH(el.scrollHeight);
    count();
    const ro = new ResizeObserver(count);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, days, filtered, levels, group]);

  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  // Clique no título da coluna: A→Z, depois Z→A, depois remove. Shift+clique soma critérios (como no Excel).
  const onSortHeader = (col: ColKey, additive: boolean) => {
    setLevels((cur) => {
      const real = cur.filter((l) => l.col !== 'resp');
      const idx = real.findIndex((l) => l.col === col);
      const next = (arr: SortLevel[]) => (arr.length ? arr : presetLevels('ALFA'));
      if (additive) {
        if (idx < 0) return [...real, { col, dir: 'asc' }];
        if (real[idx].dir === 'asc') return real.map((l, i) => (i === idx ? { ...l, dir: 'desc' } : l));
        return next(real.filter((_, i) => i !== idx));
      }
      if (real.length === 1 && idx === 0) {
        return real[0].dir === 'asc' ? [{ col, dir: 'desc' }] : presetLevels('ALFA');
      }
      return [{ col, dir: 'asc' }];
    });
  };
  const exportExcel = async () => {
    setBusy(true);
    try {
      await exportPlanningExcel({
        recs: filtered,
        perDay: mode === 'EACH',
        title: mode === 'DAY' ? days[0] : mode === 'EACH' ? `Dias separados ${daysTitle(days)}` : `Resumo ${daysTitle(days)}`,
        levels,
        group,
        filterNote,
      });
    } finally {
      setBusy(false);
    }
  };

  if (records.length === 0) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-slate-300">Nenhuma planilha carregada.</p>
        <button onClick={onUpload} className="rounded-xl bg-emerald-500 px-4 py-3 font-bold text-slate-950">
          Subir Excel de Hora Extra
        </button>
      </div>
    );
  }

  const chip = (active: boolean) => `rounded-lg px-3 py-1.5 text-xs font-bold whitespace-nowrap ${active ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`;

  return (
    <div className="p-3 space-y-3">
      <style>{`
        @page { size: A3 landscape; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .he-print, .he-print * { visibility: visible !important; }
          .he-print, .he-print * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .he-print { position: absolute; left: 0; top: 0; transform: none !important; width: ${A3_W}px !important; }
          .he-sheet-break { break-after: page; }
        }
      `}</style>

      {/* Cabeçalho: ações */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-lg mr-auto">Planejamento Hora Extra</h2>
        <button onClick={onUpload} className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm font-bold text-emerald-300">
          Subir Excel
        </button>
        <button disabled={busy || filtered.length === 0} onClick={exportExcel} className="rounded-xl border border-sky-500/50 bg-sky-950/40 px-3 py-2 text-sm font-bold text-sky-300 disabled:opacity-50">
          {busy ? 'Gerando…' : 'Baixar Excel formatado'}
        </button>
        <button disabled={filtered.length === 0} onClick={() => window.print()} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
          Imprimir / Salvar PDF (A3)
        </button>
      </div>

      <LeaderConflicts records={scope} onSetLeader={onSetLeader} />

      {/* Dias: marque quantos quiser; com 2+ dias escolha folha separada ou resumo único */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-slate-400 mr-1">Dias:</span>
        {dates.map((d) => (
          <button key={d} aria-pressed={days.includes(d)} onClick={() => toggleDay(d)} className={chip(days.includes(d))}>
            {days.includes(d) ? '✓ ' : ''}{d}
          </button>
        ))}
        {dates.length > 1 && (
          <button onClick={() => setPicked([...dates])} className="rounded-lg px-3 py-1.5 text-xs font-bold bg-slate-700 text-slate-100">
            Todos os dias
          </button>
        )}
        {days.length > 1 && (
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Saída:</span>
            <button aria-pressed={layout === 'COMBINED'} onClick={() => setLayout('COMBINED')} className={chip(layout === 'COMBINED')}>Resumo único</button>
            <button aria-pressed={layout === 'EACH'} onClick={() => setLayout('EACH')} className={chip(layout === 'EACH')}>1 folha por dia</button>
          </span>
        )}
      </div>

      {/* Filtros e ordenação */}
      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <MultiSelect label="Líder" all="todos" options={opts.lider} value={filters.lider} onChange={(v) => setF('lider', v)} />
        <MultiSelect label="Peça" all="todas" options={opts.peca} value={filters.peca} onChange={(v) => setF('peca', v)} />
        <MultiSelect label="CC" all="todos" options={opts.cc} value={filters.cc} onChange={(v) => setF('cc', v)} />
        <MultiSelect label="Turno" all="todos" options={opts.turno} value={filters.turno} onChange={(v) => setF('turno', v)} />
        <select className={sel} value={filters.transporte} onChange={(e) => setF('transporte', e.target.value)}>
          <option value="ALL">Transporte: todos</option>
          <option value="COM">Com transporte</option>
          <option value="SEM">Sem transporte</option>
        </select>
        <select
          className={sel}
          value={matchPreset(levels) ?? 'CUSTOM'}
          onChange={(e) => e.target.value !== 'CUSTOM' && setLevels(presetLevels(e.target.value as SortMode))}
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => <option key={k} value={k}>Ordem: {SORT_LABELS[k]}</option>)}
          {!matchPreset(levels) && <option value="CUSTOM">Ordem: Personalizada</option>}
        </select>
        <div className="relative min-w-0">
          <button type="button" onClick={() => setSortOpen(!sortOpen)} className={`${sel} w-full text-left font-bold ${matchPreset(levels) ? '' : 'border-amber-400 text-amber-200'}`}>
            ⇅ Classificar colunas
          </button>
          {sortOpen && (
            <div className="absolute z-30 mt-1 w-[22rem] max-w-[90vw] rounded-xl border border-slate-600 bg-slate-900 p-3 shadow-xl space-y-2">
              <p className="text-[11px] text-slate-400">Como no Excel: o 1º critério manda; os seguintes desempatam. Também dá para clicar no título da coluna na lista (Shift+clique soma critério).</p>
              {levels.filter((l) => l.col !== 'resp').map((lv, i, arr) => (
                <div key={i} className="flex items-center gap-1.5">
                  <span className="w-20 shrink-0 text-[11px] text-slate-400">{i === 0 ? 'Classificar por' : 'Depois por'}</span>
                  <select className={`${sel} flex-1`} value={lv.col} onChange={(e) => setLevels(arr.map((x, k) => (k === i ? { ...x, col: e.target.value as ColKey } : x)))}>
                    {(Object.keys(COL_LABELS) as ColKey[]).filter((k) => k !== 'resp').map((k) => <option key={k} value={k}>{COL_LABELS[k]}</option>)}
                  </select>
                  <select className={sel} value={lv.dir} onChange={(e) => setLevels(arr.map((x, k) => (k === i ? { ...x, dir: e.target.value as 'asc' | 'desc' } : x)))}>
                    <option value="asc">A → Z</option>
                    <option value="desc">Z → A</option>
                  </select>
                  <button type="button" aria-label="Excluir nível" disabled={arr.length === 1} onClick={() => setLevels(arr.filter((_, k) => k !== i))} className="rounded-md bg-slate-800 px-2 py-1 text-xs disabled:opacity-30">✕</button>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <button type="button" className="text-xs text-amber-300 underline" onClick={() => {
                  const used = new Set(levels.map((l) => l.col));
                  const nextCol = (Object.keys(COL_LABELS) as ColKey[]).find((k) => k !== 'resp' && !used.has(k)) ?? 'nome';
                  setLevels([...levels.filter((l) => l.col !== 'resp'), { col: nextCol, dir: 'asc' }]);
                }}>+ Adicionar nível</button>
                <span className="flex gap-3">
                  <button type="button" className="text-xs text-slate-300 underline" onClick={() => setLevels(presetLevels('ALFA'))}>Restaurar padrão</button>
                  <button type="button" className="text-xs font-bold text-emerald-300" onClick={() => setSortOpen(false)}>Fechar</button>
                </span>
              </div>
            </div>
          )}
        </div>
        <input className={sel} placeholder="Buscar nome / chapa" value={filters.busca} onChange={(e) => setF('busca', e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-slate-300 px-1" title="Cria uma faixa com o subtotal para cada dia (ordem alfabética), peça, líder ou centro de custo (conforme a Ordem escolhida)">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          Separar em faixas
          <span className="text-[10px] text-slate-500">(dia/peça/líder/CC)</span>
        </label>
        <button
          type="button"
          onClick={() => { setFilters(EMPTY_FILTERS); setLevels(presetLevels('ALFA')); setGroup(true); }}
          className="rounded-lg border border-red-400/60 bg-red-950/40 px-2 py-1.5 text-xs font-bold text-red-300 hover:bg-red-950/70"
        >
          Limpar todos os filtros
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>
          {filtered.length} de {scope.length} colaboradores
          {filterNote ? ` · ${filterNote}` : ''}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span>Simulação A3 paisagem · {pages} página{pages > 1 ? 's' : ''}</span>
          <button type="button" aria-label="Diminuir zoom" onClick={() => zoomBy(1 / 1.25)} className="rounded-md bg-slate-800 px-2 py-0.5 text-sm font-bold text-slate-200">−</button>
          <span className="w-12 text-center tabular-nums text-slate-200">{Math.round(scale * 100)}%</span>
          <button type="button" aria-label="Aumentar zoom" onClick={() => zoomBy(1.25)} className="rounded-md bg-slate-800 px-2 py-0.5 text-sm font-bold text-slate-200">+</button>
          <button type="button" onClick={() => setZoom(null)} className={`rounded-md px-2 py-0.5 font-bold ${zoom === null ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'}`}>Ajustar</button>
          <button type="button" onClick={() => setZoom(1)} className="rounded-md bg-slate-800 px-2 py-0.5 font-bold text-slate-200">100%</button>
          <span className="hidden lg:inline text-slate-500">Ctrl + scroll = zoom · arraste para mover</span>
        </span>
      </div>

      {/* Pré-visualização da folha A3 (Ctrl + scroll = zoom; arraste para mover) */}
      <div
        ref={wrapRef}
        className="w-full overflow-auto rounded-lg border border-slate-700 bg-slate-600/30 select-none"
        style={{ maxHeight: '78vh', cursor: zoom !== null ? 'grab' : 'default' }}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('th,button,input,select,label')) return;
          if (zoom === null && contentH * scale <= (wrapRef.current?.clientHeight ?? 0)) return;
          const el = wrapRef.current!;
          drag.current = { x: e.clientX, y: e.clientY, l: el.scrollLeft, t: el.scrollTop };
          el.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = wrapRef.current;
          if (!d || !el) return;
          el.scrollLeft = d.l - (e.clientX - d.x);
          el.scrollTop = d.t - (e.clientY - d.y);
        }}
        onPointerUp={() => { drag.current = null; }}
      >
        <div style={{ width: A3_W * scale, height: contentH * scale }}>
          <div ref={sheetsRef} className="he-print" style={{ width: A3_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {filtered.length === 0 ? (
              <div className="bg-white text-black p-10 text-xl" style={{ width: A3_W }}>Nenhum colaborador com esses filtros.</div>
            ) : (
              sheets.map((x, i) => (
                <div key={x.key} className={i < sheets.length - 1 ? 'he-sheet-break' : ''}>
                  <Sheet title={x.title} recs={x.recs} showDate={x.showDate} levels={levels} onSortHeader={onSortHeader} group={group} filterNote={filterNote} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
