import { useEffect, useMemo, useRef, useState } from 'react';
import { OvertimeRecord } from '../types';
import {
  applyFilters,
  buildRows,
  buildSummary,
  EMPTY_FILTERS,
  Filters,
  halves,
  isLeaderRow,
  norm,
  SORT_LABELS,
  SortMode,
  transpLabel,
  turno,
} from '../utils/planning';
import { BRAND } from '../utils/brand';
import { exportPlanningExcel } from '../utils/planningExcel';

// A3 paisagem: 420 x 297 mm a 96 dpi
const A3_W = 1587;
const A3_H = 1123;

type Mode = 'DAY' | 'EACH' | 'COMBINED';

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
  sort,
  group,
  filterNote,
}: {
  title: string;
  recs: OvertimeRecord[];
  showDate: boolean;
  sort: SortMode;
  group: boolean;
  filterNote: string;
}) {
  const s = useMemo(() => buildSummary(recs), [recs]);
  const rows = useMemo(() => buildRows(recs, sort, group), [recs, sort, group]);
  const [r1, r2] = halves(rows);
  const cols = [...(showDate ? ['Data'] : []), '#', 'Chapa', 'Funcionário', 'Peça', 'CC', 'Líder', 'Transporte'];

  const table = (list: typeof rows) => (
    <table className="w-full text-[10.5px] border-collapse self-start">
      <thead style={{ display: 'table-header-group' }}>
        <tr className="border-b-2 text-left" style={{ borderColor: BRAND.blue, color: BRAND.blue }}>
          {cols.map((c) => (
            <th key={c} className="py-0.5 pr-1.5">{c}</th>
          ))}
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
              {showDate && <td className="py-0.5 pr-1.5 tabular-nums">{x.r.data.slice(0, 5)}</td>}
              <td className="py-0.5 pr-1.5 tabular-nums">{x.idx}</td>
              <td className="pr-1.5 tabular-nums">{x.r.chapa}</td>
              <td className="pr-1.5">{x.r.funcionario}</td>
              <td className="pr-1.5">{x.r.motivoHe}</td>
              <td className="pr-1.5">{x.r.cc}</td>
              <td className="pr-1.5">{x.r.lider}</td>
              <td className="pr-1.5">{transpLabel(x.r)}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );

  return (
    <div className="bg-white text-black p-5 font-sans" style={{ width: A3_W, minHeight: A3_H, boxSizing: 'border-box' }}>
      <div className="flex items-end justify-between px-4 py-3 mb-3 text-white" style={{ background: BRAND.blue, borderBottom: `8px solid ${BRAND.yellow}` }}>
        <div>
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

      <Box title={`Lista nominal (${recs.length}) · ${SORT_LABELS[sort]}${group && sort !== 'ALFA' && sort !== 'CHAPA' ? ' · agrupada' : ''}`}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {table(r1)}
          {table(r2)}
        </div>
      </Box>
    </div>
  );
}

const sel = 'rounded-lg bg-slate-800 border border-slate-700 px-2 py-1.5 text-xs text-slate-200 min-w-0';

export default function PlanejamentoHoraExtra({
  records,
  selectedDate,
  onUpload,
}: {
  records: OvertimeRecord[];
  selectedDate: string;
  onUpload: () => void;
}) {
  const dates = useMemo(() => {
    const m = new Map<string, string>();
    records.forEach((r) => m.set(r.data, r.dataSortKey));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([d]) => d);
  }, [records]);

  const [mode, setMode] = useState<Mode>('DAY');
  const [pick, setPick] = useState<string>(selectedDate);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortMode>('CC');
  const [group, setGroup] = useState(true);
  const [busy, setBusy] = useState(false);

  const day = dates.includes(pick) ? pick : dates[0];
  const scope = useMemo(() => (mode === 'DAY' ? records.filter((r) => r.data === day) : records), [mode, records, day]);

  // opções dos filtros (baseadas no escopo atual)
  const opts = useMemo(() => {
    const uniq = (f: (r: OvertimeRecord) => string) => [...new Set(scope.map(f).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const pecas = new Map<string, string>();
    scope.forEach((r) => pecas.set(norm(r.motivoHe), r.motivoHe.trim()));
    return {
      lider: uniq((r) => r.lider || 'Não identificado'),
      peca: [...pecas.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      cc: uniq((r) => r.cc),
      turno: uniq(turno),
    };
  }, [scope]);

  const filtered = useMemo(() => applyFilters(scope, filters), [scope, filters]);
  const filterNote = [
    filters.lider && `Líder ${filters.lider}`,
    filters.peca && `Peça ${filters.peca}`,
    filters.cc && `CC ${filters.cc}`,
    filters.turno && `Turno ${filters.turno}`,
    filters.transporte !== 'ALL' && (filters.transporte === 'COM' ? 'Com transporte' : 'Sem transporte'),
    filters.busca && `Busca "${filters.busca}"`,
  ]
    .filter(Boolean)
    .join(' · ');

  const sheets: { key: string; title: string; recs: OvertimeRecord[]; showDate: boolean }[] =
    mode === 'DAY'
      ? [{ key: day, title: day, recs: filtered, showDate: false }]
      : mode === 'EACH'
      ? dates
          .map((d) => ({ key: d, title: d, recs: filtered.filter((r) => r.data === d), showDate: false }))
          .filter((x) => x.recs.length > 0)
      : [{ key: 'ALL', title: dates.length > 1 ? `${dates[0].slice(0, 5)} a ${dates[dates.length - 1]}` : dates[0], recs: filtered, showDate: true }];

  const wrapRef = useRef<HTMLDivElement>(null);
  const sheetsRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [contentH, setContentH] = useState(A3_H);
  const pages = Math.max(1, Math.ceil(contentH / A3_H - 0.02));

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => setScale(Math.min(1, el.clientWidth / A3_W));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = sheetsRef.current;
    if (!el) return;
    const count = () => setContentH(el.scrollHeight);
    count();
    const ro = new ResizeObserver(count);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mode, day, filtered, sort, group]);

  const setF = (k: keyof Filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const exportExcel = async () => {
    setBusy(true);
    try {
      await exportPlanningExcel({
        recs: filtered,
        perDay: mode === 'EACH',
        title: mode === 'DAY' ? day : mode === 'EACH' ? 'Todos os dias (separados)' : 'Resumo consolidado',
        sort,
        group: group && sort !== 'ALFA' && sort !== 'CHAPA',
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

      {/* O que sai: dia, todos separados ou resumo único */}
      <div className="flex flex-wrap items-center gap-1.5">
        {dates.map((d) => (
          <button key={d} onClick={() => { setMode('DAY'); setPick(d); }} className={chip(mode === 'DAY' && day === d)}>
            {d}
          </button>
        ))}
        {dates.length > 1 && (
          <>
            <button onClick={() => setMode('EACH')} className={chip(mode === 'EACH')}>Todos os dias (1 folha por dia)</button>
            <button onClick={() => setMode('COMBINED')} className={chip(mode === 'COMBINED')}>Resumo único (todos os dias)</button>
          </>
        )}
      </div>

      {/* Filtros e ordenação */}
      <div className="grid gap-1.5 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
        <select className={sel} value={filters.lider} onChange={(e) => setF('lider', e.target.value)}>
          <option value="">Líder: todos</option>
          {opts.lider.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select className={sel} value={filters.peca} onChange={(e) => setF('peca', e.target.value)}>
          <option value="">Peça: todas</option>
          {opts.peca.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select className={sel} value={filters.cc} onChange={(e) => setF('cc', e.target.value)}>
          <option value="">CC: todos</option>
          {opts.cc.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select className={sel} value={filters.turno} onChange={(e) => setF('turno', e.target.value)}>
          <option value="">Turno: todos</option>
          {opts.turno.map((o) => <option key={o}>{o}</option>)}
        </select>
        <select className={sel} value={filters.transporte} onChange={(e) => setF('transporte', e.target.value)}>
          <option value="ALL">Transporte: todos</option>
          <option value="COM">Com transporte</option>
          <option value="SEM">Sem transporte</option>
        </select>
        <select className={sel} value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => <option key={k} value={k}>Ordem: {SORT_LABELS[k]}</option>)}
        </select>
        <input className={sel} placeholder="Buscar nome / chapa" value={filters.busca} onChange={(e) => setF('busca', e.target.value)} />
        <label className="flex items-center gap-1.5 text-xs text-slate-300 px-1">
          <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
          Agrupar por ordem
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>
          {filtered.length} de {scope.length} colaboradores
          {filterNote ? ` · ${filterNote}` : ''}
        </span>
        {filterNote && (
          <button className="underline text-amber-300" onClick={() => setFilters(EMPTY_FILTERS)}>
            limpar filtros
          </button>
        )}
        <span className="ml-auto">
          Simulação A3 paisagem · {pages} página{pages > 1 ? 's' : ''} · zoom {Math.round(scale * 100)}%
        </span>
      </div>

      {/* Pré-visualização da folha A3 */}
      <div ref={wrapRef} className="w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-600/30">
        <div style={{ height: contentH * scale }}>
          <div ref={sheetsRef} className="he-print" style={{ width: A3_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            {filtered.length === 0 ? (
              <div className="bg-white text-black p-10 text-xl" style={{ width: A3_W }}>Nenhum colaborador com esses filtros.</div>
            ) : (
              sheets.map((x, i) => (
                <div key={x.key} className={i < sheets.length - 1 ? 'he-sheet-break' : ''}>
                  <Sheet title={x.title} recs={x.recs} showDate={x.showDate} sort={sort} group={group} filterNote={filterNote} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
