import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { OvertimeRecord } from '../types';
import {
  applyFilters,
  buildRows,
  buildSummary,
  CHUNK_ERROR,
  EMPTY_FILTERS,
  exportBaseName,
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
  sanitizeLevels,
  DEFAULT_LEVELS,
  SORT_LABELS,
  SortLevel,
  SortMode,
  transpLabel,
  turno,
} from '../utils/planning';
import { loadSetting, saveSetting } from '../lib/settingsSync';
import { OFFICIAL_LEADERS } from '../data/leaderDatabase';
import { BRAND } from '../utils/brand';
import { exportPlanningExcel } from '../utils/planningExcel';
import { exportPlanningPdf } from '../utils/planningPdf';

import { PagedSheet, A3_W, A3_H } from './PlanningPages';

type Mode = 'DAY' | 'EACH' | 'COMBINED';
type Layout = 'EACH' | 'COMBINED';

/** "02/10/2026" + "03/10/2026" -> "02/10 + 03/10/2026" */
const daysTitle = (ds: string[]) =>
  ds.length === 1 ? ds[0] : ds.slice(0, -1).map((d) => d.slice(0, 5)).join(' + ') + ' + ' + ds[ds.length - 1];

/** Colaboradores com mais de um líder na base (ou sem líder): o usuário escolhe o líder certo. */
function LeaderConflicts({ records, onSetLeader, blocking }: { records: OvertimeRecord[]; onSetLeader: (chapa: string, nome: string, lider: string) => void; blocking?: boolean }) {
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
  const allLeaders = [...OFFICIAL_LEADERS];
  return (
    <div className={`rounded-xl border text-xs ${blocking ? 'border-red-500/60 bg-red-950/40 text-red-200' : 'border-amber-500/40 bg-amber-950/30 text-amber-200'}`}>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <span className="font-bold">
          {blocking ? '⛔ Impressão, PDF e Excel bloqueados até definir o líder de todos: ' : '⚠ '}{multi > 0 && `${multi} colaborador${multi > 1 ? 'es' : ''} com mais de um líder cadastrado`}
          {multi > 0 && list.length - multi > 0 && ' · '}
          {list.length - multi > 0 && `${list.length - multi} sem líder (não estão na base de líderes)`}
        </span>
      </div>
      <div className="border-t border-white/10 px-3 pb-2">
        <p className="py-2 text-[11px] opacity-80">Clique no líder de cada pessoa. A escolha fica guardada no banco e vale para os próximos Excel e para qualquer aparelho.</p>
        {list.length - multi > 1 && (
          <div className="mb-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-black/20 px-2 py-1.5">
            <span className="mr-1 text-[11px] font-bold text-slate-100">Todos os {list.length - multi} sem líder → </span>
            {allLeaders.map((c) => (
              <button key={c} type="button" onClick={() => list.filter((r) => !(r.lider || '').includes('/')).forEach((r) => onSetLeader(r.chapa, r.funcionario, c))} className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-bold text-slate-100 hover:bg-emerald-600">
                {c}
              </button>
            ))}
          </div>
        )}
        {list.map((r) => {
          const cands = (r.lider || '').includes('/') ? r.lider.split('/').map((x) => x.trim()) : [];
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-white/10 py-1.5">
              <div className="min-w-[16rem] flex-1 text-sm font-semibold text-slate-100">{r.funcionario} <span className="text-xs font-normal opacity-70">· {r.chapa} · {r.motivoHe} · {r.cc}</span></div>
              <div className="flex flex-wrap gap-1.5">
                {allLeaders.map((c) => (
                  <button key={c} type="button" onClick={() => onSetLeader(r.chapa, r.funcionario, c)} className={`rounded-lg px-3 py-1 text-xs font-bold text-slate-100 hover:bg-emerald-600 ${cands.includes(c) ? 'bg-amber-600' : 'bg-slate-800'}`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const sel = 'h-9 rounded-lg bg-slate-800 border border-slate-700 px-2 text-xs text-slate-200 min-w-0';

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
  const PREFS_KEY = 'horaextra_planning_prefs_v1';
  const [levels, setLevels] = useState<SortLevel[]>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      const lv = v ? sanitizeLevels(v.levels) : null;
      if (lv) return lv;
    } catch { /* ignore */ }
    return DEFAULT_LEVELS();
  });
  const [sortOpen, setSortOpen] = useState(false);
  const [group, setGroup] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null'); if (v && typeof v.group === 'boolean') return v.group as boolean; } catch { /* ignore */ }
    return true;
  });
  // Memória: a classificação escolhida fica guardada (aparelho + banco) e volta igual na próxima vez.
  const prefsLoaded = useRef(false);
  useEffect(() => {
    void loadSetting<{ levels: SortLevel[]; group: boolean }>('planning_prefs').then((v) => {
      const lv = v ? sanitizeLevels(v.levels) : null;
      if (v && lv) { setLevels(lv); if (typeof v.group === 'boolean') setGroup(v.group); }
      prefsLoaded.current = true;
    });
  }, []);
  useEffect(() => {
    const v = { levels, group };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(v)); } catch { /* ignore */ }
    if (!prefsLoaded.current) return;
    const t = setTimeout(() => void saveSetting('planning_prefs', v), 800);
    return () => clearTimeout(t);
  }, [levels, group]);
  const [busy, setBusy] = useState(false);
  const [exportErr, setExportErr] = useState<{ text: string; reload: boolean } | null>(null);
  const failExport = (e: unknown) =>
    setExportErr(e instanceof Error && e.message === CHUNK_ERROR ? { text: 'Nova versão disponível — recarregue a página.', reload: true } : { text: 'Não foi possível gerar o arquivo. Tente novamente.', reload: false });
  const [pdfJob, setPdfJob] = useState(false);
  const [paper, setPaper] = useState<'A3' | 'A4'>('A3');
  const A4_ZOOM = 792 / A3_H; // A4 = A3 reduzido (mesma proporção); 792px < 793,7px da folha A4 evita página em branco
  const exportRef = useRef<HTMLDivElement>(null);

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
  const [pages, setPages] = useState(1);

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
    const count = () => { setContentH(el.scrollHeight); setPages(Math.max(1, el.querySelectorAll('.he-page').length)); };
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
      const next = (arr: SortLevel[]) => arr;
      if (additive) {
        if (idx < 0) return [...real, { col, dir: 'asc' }];
        if (real[idx].dir === 'asc') return real.map((l, i) => (i === idx ? { ...l, dir: 'desc' } : l));
        return next(real.filter((_, i) => i !== idx));
      }
      if (real.length === 1 && idx === 0) {
        return real[0].dir === 'asc' ? [{ col, dir: 'desc' }] : [];
      }
      return [{ col, dir: 'asc' }];
    });
  };
  const fileName = exportBaseName(days, mode === 'EACH', filterNote !== '') + (paper === 'A4' ? '_A4' : '');
  // Baixar PDF direto: monta as folhas fora da tela, gera o PDF A3 e dispara o download com nome padrão.
  useEffect(() => {
    if (!pdfJob) return;
    let cancelled = false;
    (async () => {
      try {
        await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready;
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        if (!cancelled && exportRef.current) await exportPlanningPdf(exportRef.current, `${fileName}.pdf`, paper === 'A4' ? 'a4' : 'a3');
      } catch (e) {
        if (!cancelled) failExport(e);
      } finally {
        if (!cancelled) setPdfJob(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pdfJob]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportExcel = async () => {
    setBusy(true);
    setExportErr(null);
    try {
      await exportPlanningExcel({
        recs: filtered,
        perDay: mode === 'EACH',
        title: mode === 'DAY' ? days[0] : mode === 'EACH' ? `Dias separados ${daysTitle(days)}` : `Resumo ${daysTitle(days)}`,
        levels,
        group,
        filterNote,
        fileName,
        paper,
      });
    } catch (e) {
      failExport(e);
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

  const pendingLeaders = new Set(
    filtered.filter((r) => (r.lider || '').includes('/') || !r.lider || norm(r.lider) === 'nao identificado').map((r) => r.chapa || r.funcionario),
  ).size;
  const blocked = pendingLeaders > 0;

  return (
    <div className="p-3 space-y-3">
      <style>{`
        @page { size: ${paper} landscape; margin: 0; }
        .he-print .he-page { margin-bottom: 16px; }
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .he-print, .he-print * { visibility: visible !important; }
          .he-print, .he-print * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .he-print { position: absolute; left: 0; top: 0; transform: none !important; width: ${paper === 'A4' ? Math.round(A3_W * A4_ZOOM) : A3_W}px !important; }
          .he-print .he-page { break-after: page; margin: 0 !important; ${paper === 'A4' ? `zoom: ${A4_ZOOM};` : ''} }
          .he-print > :last-child > .he-page:last-child { break-after: auto; }
          .he-print { display: ${blocked ? 'none !important' : 'block'}; }
          ${blocked ? '#root { display: none !important; }' : ''}
          .he-blocked-msg { display: block !important; visibility: visible !important; padding: 48px; font: 700 22px/1.4 sans-serif; color: #b91c1c; }
          .he-blocked-msg * { visibility: visible !important; }
        }
        .he-blocked-msg { display: none; }
      `}</style>

      {/* Cabeçalho: ações */}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-lg mr-auto">Planejamento Hora Extra</h2>
        <button onClick={onUpload} className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm font-bold text-emerald-300">
          Subir Excel
        </button>
        <button disabled={blocked || busy || filtered.length === 0} onClick={exportExcel} className="rounded-xl border border-sky-500/50 bg-sky-950/40 px-3 py-2 text-sm font-bold text-sky-300 disabled:opacity-50">
          {busy ? 'Gerando…' : 'Baixar Excel formatado'}
        </button>
        <span className="flex overflow-hidden rounded-xl border border-slate-600" role="group" aria-label="Tamanho do papel">
          {(['A3', 'A4'] as const).map((pp) => (
            <button key={pp} type="button" aria-pressed={paper === pp} onClick={() => setPaper(pp)} className={`px-3 py-2 text-sm font-bold ${paper === pp ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}>
              {pp}
            </button>
          ))}
        </span>
        <button disabled={blocked || pdfJob || filtered.length === 0} onClick={() => { setExportErr(null); setPdfJob(true); }} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">
          {pdfJob ? 'Gerando PDF…' : `Baixar PDF (${paper})`}
        </button>
        <button disabled={blocked || filtered.length === 0} onClick={() => window.print()} className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-bold text-slate-200 disabled:opacity-50">
          Imprimir ({paper})
        </button>
      </div>

      {blocked && createPortal(
        <div className="he-blocked-msg">
          <p>Impressão bloqueada: há colaborador sem líder ou com mais de um líder.</p>
          <p style={{ fontWeight: 400, fontSize: 16, color: '#000', marginTop: 12 }}>Defina o líder de todos na tela de Planejamento antes de imprimir.</p>
        </div>,
        document.body,
      )}
      {exportErr && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-red-500/60 bg-red-950/40 px-3 py-2 text-xs font-bold text-red-200">
          <span>{exportErr.text}</span>
          {exportErr.reload && <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-red-500 px-3 py-1 text-slate-950">Recarregar</button>}
        </div>
      )}
      <LeaderConflicts records={filtered} onSetLeader={onSetLeader} blocking />

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

      {/* Filtros, ordem e opções (cartão organizado em 3 linhas) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 space-y-2.5">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Filtrar</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <MultiSelect label="Líder" all="todos" options={opts.lider} value={filters.lider} onChange={(v) => setF('lider', v)} />
        <MultiSelect label="Peça" all="todas" options={opts.peca} value={filters.peca} onChange={(v) => setF('peca', v)} />
        <MultiSelect label="CC" all="todos" options={opts.cc} value={filters.cc} onChange={(v) => setF('cc', v)} />
        <MultiSelect label="Turno" all="todos" options={opts.turno} value={filters.turno} onChange={(v) => setF('turno', v)} />
        <select className={`${sel} w-full`} value={filters.transporte} onChange={(e) => setF('transporte', e.target.value)}>
          <option value="ALL">Transporte: todos</option>
          <option value="COM">Com transporte</option>
          <option value="SEM">Sem transporte</option>
        </select>
          </div>
        </div>
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Ordenar e buscar</p>
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <select
          className={`${sel} w-full`}
          value={matchPreset(levels) ?? 'CUSTOM'}
          onChange={(e) => e.target.value !== 'CUSTOM' && setLevels(presetLevels(e.target.value as SortMode))}
        >
          {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => <option key={k} value={k}>Ordem: {SORT_LABELS[k]}</option>)}
          {!matchPreset(levels) && <option value="CUSTOM">{levels.length === 0 ? 'Ordem: Sem classificação' : 'Ordem: Personalizada'}</option>}
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
                  <button type="button" aria-label="Excluir nível" onClick={() => setLevels(arr.filter((_, k) => k !== i))} className="rounded-md bg-slate-800 px-2 py-1 text-xs hover:bg-red-900">✕</button>
                </div>
              ))}
              <div className="flex justify-between pt-1">
                <button type="button" className="text-xs text-amber-300 underline" onClick={() => {
                  const used = new Set(levels.map((l) => l.col));
                  const nextCol = (Object.keys(COL_LABELS) as ColKey[]).find((k) => k !== 'resp' && !used.has(k)) ?? 'nome';
                  setLevels([...levels.filter((l) => l.col !== 'resp'), { col: nextCol, dir: 'asc' }]);
                }}>+ Adicionar nível</button>
                <span className="flex gap-3">
                  <button type="button" className="text-xs text-red-300 underline" onClick={() => setLevels([])}>Excluir todas</button>
                  <button type="button" className="text-xs text-slate-300 underline" onClick={() => setLevels(DEFAULT_LEVELS())}>Restaurar padrão</button>
                  <button type="button" className="text-xs font-bold text-emerald-300" onClick={() => setSortOpen(false)}>Fechar</button>
                </span>
              </div>
            </div>
          )}
        </div>
            <div className="col-span-2">
              <input className={`${sel} w-full`} placeholder="Buscar nome / chapa" value={filters.busca} onChange={(e) => setF('busca', e.target.value)} />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-slate-800 pt-2.5">
          <label className="flex items-center gap-2 whitespace-nowrap text-xs text-slate-300" title="Cria uma faixa com o subtotal para cada dia (ordem alfabética), peça, líder ou centro de custo, conforme a ordem escolhida">
            <input type="checkbox" checked={group} onChange={(e) => setGroup(e.target.checked)} />
            Separar em faixas com subtotal
          </label>
          <button
            type="button"
            onClick={() => { setFilters(EMPTY_FILTERS); setLevels(DEFAULT_LEVELS()); setGroup(true); }}
            className="whitespace-nowrap rounded-lg border border-red-400/60 bg-red-950/40 px-3 py-1.5 text-xs font-bold text-red-300 hover:bg-red-950/70"
          >
            ✕ Limpar todos os filtros
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span>
          {filtered.length} de {scope.length} colaboradores
          {filterNote ? ` · ${filterNote}` : ''}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <span>Simulação {paper} paisagem · {pages} página{pages > 1 ? 's' : ''}</span>
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
                <div key={x.key}>
                  <PagedSheet title={x.title} recs={x.recs} showDate={x.showDate} levels={levels} onSortHeader={onSortHeader} group={group} filterNote={filterNote} />
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {pdfJob && (
        <div ref={exportRef} aria-hidden style={{ position: 'fixed', left: 0, top: 0, width: A3_W, zIndex: -9999, pointerEvents: 'none' }}>
          {sheets.map((x) => (
            <div key={x.key} data-export-sheet>
              <PagedSheet title={x.title} recs={x.recs} showDate={x.showDate} levels={levels} group={group} filterNote={filterNote} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
