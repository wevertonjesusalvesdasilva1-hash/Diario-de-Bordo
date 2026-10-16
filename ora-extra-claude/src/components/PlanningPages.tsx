import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { OvertimeRecord } from '../types';
import { BRAND } from '../utils/brand';
import { buildRows, buildSummary, ColKey, isLeaderRow, isRealLeaderName, levelsLabel, mergeLeaderCards, Row, SortLevel, transpLabel } from '../utils/planning';

// A3 paisagem: 420 x 297 mm a 96 dpi
export const A3_W = 1587;
export const A3_H = 1123;
const PAD = 28; // margem interna da folha
const CW = A3_W - PAD * 2; // largura útil
const CH = A3_H - PAD * 2; // altura útil
const TITLE_H = 40; // barra de título das páginas da lista
const K_MAX = 2.3;

export const Box = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`border flex flex-col ${className}`} style={{ breakInside: 'avoid', borderColor: BRAND.blue }}>
    <h3 className="text-white text-[11px] font-bold uppercase tracking-wide px-2 py-1" style={{ background: BRAND.blue, borderBottom: `3px solid ${BRAND.yellow}` }}>{title}</h3>
    <div className="p-2 flex-1 flex flex-col">{children}</div>
  </section>
);

export function MiniTable({ rows, head, stretch = false }: { rows: (string | number)[][]; head: string[]; stretch?: boolean }) {
  return (
    <table className={`w-full text-[11px] border-collapse ${stretch ? 'flex-1' : ''}`} style={stretch ? { height: '100%' } : undefined}>
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

const COLS: { label: string; key: ColKey | null }[] = [
  { label: 'Data', key: 'data' }, { label: '#', key: null }, { label: 'Chapa', key: 'chapa' }, { label: 'Funcionário', key: 'nome' },
  { label: 'Peça', key: 'peca' }, { label: 'CC', key: 'cc' }, { label: 'Líder', key: 'lider' }, { label: 'Horário', key: 'horario' }, { label: 'Transporte', key: 'transporte' },
];

type PageRows = { rows: Row[]; hs: number[]; f: number };

/** Cabeçalho da tabela (reaproveitado na medição e nas páginas). Medidas em "em" para escalar com a fonte. */
function Thead({ levels, onSortHeader }: { levels: SortLevel[]; onSortHeader?: (col: ColKey, additive: boolean) => void }) {
  const real = levels.filter((l) => l.col !== 'resp');
  return (
    <thead>
      <tr style={{ color: '#fff', background: BRAND.blue }}>
        {COLS.map((c) => {
          const idx = c.key ? real.findIndex((l) => l.col === c.key) : -1;
          return (
            <th
              key={c.label}
              className={`text-left font-bold whitespace-nowrap select-none ${c.key && onSortHeader ? 'cursor-pointer' : ''}`}
              style={{ padding: '0.45em 0.7em', borderBottom: `0.25em solid ${BRAND.yellow}` }}
              title={c.key && onSortHeader ? 'Clique para classificar · Shift+clique soma outro critério' : undefined}
              onClick={c.key && onSortHeader ? (e) => onSortHeader(c.key as ColKey, e.shiftKey) : undefined}
            >
              {c.label}
              {idx >= 0 && (
                <span style={{ color: BRAND.yellow }}>
                  {' '}{real[idx].dir === 'asc' ? '▲' : '▼'}
                  {real.length > 1 ? <sup>{idx + 1}</sup> : null}
                </span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

function BodyRow({ row, h, zebra }: { row: Row; h?: number; zebra: boolean }) {
  const style: React.CSSProperties = h ? { height: h } : {};
  if (row.kind === 'group') {
    return (
      <tr style={{ ...style, background: BRAND.blueSoft, color: BRAND.blue }}>
        <td colSpan={COLS.length} className="font-black whitespace-nowrap" style={{ padding: '0.3em 0.7em', borderBottom: `1px solid ${BRAND.blue}` }}>
          {row.label} — {row.n}
        </td>
      </tr>
    );
  }
  const r = row.r;
  const lead = isLeaderRow(r);
  const cell: React.CSSProperties = { padding: '0.25em 0.7em', verticalAlign: 'middle', borderBottom: '1px solid #cbd5e1', whiteSpace: 'nowrap' };
  const clip = (em: number): React.CSSProperties => ({ ...cell, maxWidth: `${em}em`, overflow: 'hidden', textOverflow: 'ellipsis' });
  return (
    <tr style={{ ...style, background: lead ? BRAND.yellowSoft : zebra ? '#f4f6fb' : '#fff', fontWeight: lead ? 800 : 400 }}>
      <td style={cell} className="tabular-nums">{r.data.slice(0, 5)}</td>
      <td style={cell} className="tabular-nums">{row.idx}</td>
      <td style={cell} className="tabular-nums">{r.chapa}</td>
      <td style={{ ...clip(30), fontWeight: lead ? 800 : 600 }} title={r.funcionario}>{r.funcionario}</td>
      <td style={clip(34)} title={r.motivoHe}>{r.motivoHe}</td>
      <td style={cell}>{r.cc}</td>
      <td style={clip(22)} title={r.lider}>{r.lider}</td>
      <td style={{ ...cell, fontWeight: 700 }} className="tabular-nums">{r.de && r.ate ? `${r.de}–${r.ate}` : '—'}</td>
      <td style={clip(34)} title={transpLabel(r)}>{transpLabel(r)}</td>
    </tr>
  );
}

/**
 * Folha A3 paginada que SEMPRE preenche a página:
 *  - página 1: resumo, ampliado até ocupar a altura toda;
 *  - páginas seguintes: lista nominal em largura total, com fonte calculada para caber na largura e
 *    espaçamento entre linhas calculado para preencher a altura de cada página.
 */
export function PagedSheet({
  title, recs, showDate, levels, onSortHeader, group, filterNote,
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
  const routes = useMemo(() => {
    const big = s.byRota.filter(([, v]) => v >= 2);
    const small = s.byRota.filter(([, v]) => v < 2);
    const out: [string, number][] = [...big];
    if (small.length) out.push([`Outras rotas (${small.length})`, small.reduce((a, [, v]) => a + v, 0)]);
    return out;
  }, [s]);
  const cards = useMemo(() => (showDate && s.leaderCards.length > 12 ? mergeLeaderCards(s.leaderCards) : s.leaderCards), [s, showDate]);
  const nLeaders = useMemo(() => new Set(s.leaderCards.filter((c) => isRealLeaderName(c.nome)).map((c) => c.nome)).size, [s]);
  const routeMax = Math.max(1, ...routes.map(([, v]) => v));
  const issued = useMemo(() => new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }), [recs]);
  const rows = useMemo(() => buildRows(recs, levels, group), [recs, levels, group]);
  const sumRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [sumScale, setSumScale] = useState(1);
  const [layout, setLayout] = useState<{ k: number; pages: PageRows[] } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready.then(() => setTick((t) => t + 1));
  }, []);

  // 1) Página do resumo: maior escala que cabe na altura da página; o que sobrar vira espaço entre os blocos.
  useLayoutEffect(() => {
    const el = sumRef.current;
    if (!el) return;
    const apply = (sc: number) => {
      el.style.width = `${CW / sc}px`;
      el.style.minHeight = '0px';
      el.style.transform = 'none';
      return el.offsetHeight * sc;
    };
    let lo = 0.25, hi = 1.35;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (apply(mid) <= CH) lo = mid; else hi = mid;
    }
    el.style.width = `${CW / lo}px`;
    el.style.minHeight = `${CH / lo}px`;
    el.style.transform = `scale(${lo})`;
    setSumScale(lo);
  }, [s, cards, showDate, filterNote, title, tick]);

  // 2) Lista: mede a largura natural (sem quebra de linha), escolhe a fonte e distribui as linhas pelas páginas.
  useLayoutEffect(() => {
    const m = measureRef.current;
    const tbl = m?.querySelector('table');
    if (!tbl || rows.length === 0) { setLayout({ k: 1, pages: [] }); return; }
    const naturalW = (tbl as HTMLElement).offsetWidth;
    const thH = (tbl.tHead as HTMLElement).offsetHeight;
    const rowHs = Array.from((tbl.tBodies[0] as HTMLTableSectionElement).rows).map((r) => r.offsetHeight);
    const k = Math.min(K_MAX, (CW - 4) / naturalW);
    const U = CH - TITLE_H - 8 - thH * k; // altura útil só para linhas, em cada página
    const hs = rowHs.map((h) => h * k);
    const total = hs.reduce((a, b) => a + b, 0);
    const P = Math.max(1, Math.ceil(total / U - 0.001));
    const pages: PageRows[] = [];
    let idx = 0;
    let remaining = total;
    for (let p = 0; p < P; p++) {
      const target = remaining / (P - p);
      const start = idx;
      let acc = 0;
      while (idx < rows.length && (p === P - 1 || (acc + hs[idx] <= U && (acc + hs[idx] / 2 <= target || idx === start)))) {
        acc += hs[idx];
        idx++;
      }
      // faixa (título de grupo) nunca fica sozinha no fim da página
      if (p < P - 1 && idx - 1 > start && rows[idx - 1].kind === 'group') { idx--; acc -= hs[idx]; }
      const pr = rows.slice(start, idx);
      const ph = hs.slice(start, idx);
      pages.push({ rows: pr, hs: ph, f: Math.min(2.2, acc > 0 ? U / acc : 1) });
      remaining -= acc;
    }
    setLayout({ k, pages });
  }, [rows, levels, tick]);

  const nPages = 1 + (layout?.pages.length ?? 0);
  const footer = (n: number) => (
    <div style={{ position: 'absolute', right: PAD, bottom: 6, fontSize: 11, color: '#64748b' }}>
      Planejamento de Hora Extra · Komatsu · {title} · Página {n} de {nPages}
    </div>
  );

  return (
    <>
      {/* Medidor invisível (fonte 10px, sem quebra) */}
      <div ref={measureRef} aria-hidden style={{ position: 'absolute', left: -99999, top: 0, visibility: 'hidden', pointerEvents: 'none' }}>
        <table style={{ fontSize: 10, lineHeight: 1.15, whiteSpace: 'nowrap', borderCollapse: 'collapse', width: 'max-content' }}>
          <Thead levels={levels} />
          <tbody>
            {rows.map((row, i) => <BodyRow key={i} row={row} zebra={false} />)}
          </tbody>
        </table>
      </div>

      {/* Página 1: resumo */}
      <div className="he-page bg-white text-black font-sans" style={{ width: A3_W, height: A3_H, padding: PAD, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
        <div style={{ width: CW, height: CH, overflow: 'hidden' }}>
          <div ref={sumRef} style={{ width: CW / sumScale, minHeight: CH / sumScale, transform: `scale(${sumScale})`, transformOrigin: 'top left', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="flex items-center justify-between gap-4 px-4 py-3 text-white" style={{ background: BRAND.blue, borderBottom: `8px solid ${BRAND.yellow}` }}>
              <img src="/komatsu-logo-white.png" alt="Komatsu" style={{ height: 48 }} />
              <div className="mr-auto">
                <h1 className="text-3xl font-black tracking-tight whitespace-nowrap">PLANEJAMENTO DE HORA EXTRA</h1>
                <p className="text-sm font-semibold" style={{ color: BRAND.yellow }}>
                  {s.locais.join(' / ') || '—'} · Gestor: {s.gestores.join(' / ') || '—'}
                </p>
                {filterNote && <p className="text-xs">Filtros: {filterNote}</p>}
              </div>
              <div className="text-right">
                <p className="text-4xl font-black tabular-nums whitespace-nowrap" style={{ color: BRAND.yellow }}>{title}</p>
                <p className="text-xs">{s.aprovados}/{s.total} aprovados</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-x-8 gap-y-1 flex-wrap px-4 py-2 font-black" style={{ background: BRAND.yellow, color: BRAND.blue, fontSize: 26 }}>
              {s.byTurno.map(([t, n]) => (
                <span key={t} className="tabular-nums whitespace-nowrap">{t.replace(' – ', ' ~ ')}{s.byTurno.length > 1 ? ` (${n})` : ''}</span>
              ))}
              <span className="whitespace-nowrap">· {s.total} {s.total === 1 ? 'pessoa' : 'pessoas'}</span>
              <span className="whitespace-nowrap">· {nLeaders} {nLeaders === 1 ? 'líder' : 'líderes'}</span>
            </div>

            <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: `repeat(5, 1fr)` }}>
              <div className="border-2 p-2 text-center flex flex-col justify-center" style={{ borderColor: BRAND.blue, background: BRAND.yellow, color: BRAND.blue }}>
                <p className="text-[10px] font-bold uppercase">Total</p>
                <p className="text-5xl font-black tabular-nums leading-none">{s.total}</p>
                <p className="text-[10px]">{s.total === 1 ? 'colaborador' : 'colaboradores'}</p>
              </div>
              {showDate ? (
                <Box title="Por dia"><MiniTable head={['Dia', 'Qtd']} rows={s.byDia.map(([k, v]) => [k, v])} /></Box>
              ) : null}
              <Box title="Por turno"><MiniTable head={['Horário', 'Qtd']} rows={s.byTurno.map(([k, v]) => [k, v])} /></Box>
              <Box title="Por centro de custo"><MiniTable head={['CC', 'Qtd']} rows={s.byCc.map(([k, v]) => [k, v])} /></Box>
              <Box title="Transporte"><MiniTable head={['Tipo', 'Qtd']} rows={[['Com transporte', s.comTransp], ['Sem (outros meios)', s.semTransp]]} /></Box>
              {!showDate && <Box title="Refeição"><MiniTable head={['Tipo', 'Qtd']} rows={s.byRef.map(([k, v]) => [k, v])} /></Box>}
            </div>

            <div className="grid gap-3 items-stretch" style={{ gridTemplateColumns: '2.2fr 1fr', flex: 1, minHeight: 0 }}>
              <Box title={`Equipes por líder (${nLeaders} ${nLeaders === 1 ? 'líder' : 'líderes'})`}>
                {cards.length === 0 ? (
                  <p className="text-[11px]">Nenhum líder na lista.</p>
                ) : (
                  <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${cards.length <= 2 ? cards.length : cards.length <= 6 ? 2 : cards.length <= 12 ? 3 : 4}, 1fr)`, gridAutoRows: '1fr' }}>
                    {cards.map((c) => (
                      <div key={c.key} className="border-2 rounded flex flex-col" style={{ borderColor: c.others ? '#64748b' : BRAND.blue, background: c.others ? '#f1f5f9' : BRAND.yellowSoft }}>
                        <div className="px-3 py-1.5 text-white flex items-baseline justify-between gap-2" style={{ background: c.others ? '#64748b' : BRAND.blue }}>
                          <div>
                            <div className="font-black text-[17px] leading-tight">{c.nome}</div>
                            <div className="text-[13px] font-bold tabular-nums" style={{ color: c.others ? '#fff' : BRAND.yellow }}>{showDate ? (c.days ? `${c.days} ${c.days === 1 ? 'dia' : 'dias'}` : c.dia.slice(0, 5)) + ' · ' : ''}{c.turno.replace(' – ', ' ~ ')}</div>
                          </div>
                          <div className="text-right leading-none">
                            <div className="text-4xl font-black tabular-nums">{c.total}</div>
                            <div className="text-[10px] uppercase">equipe</div>
                          </div>
                        </div>
                        <div className="px-3 py-2 flex-1 flex flex-col justify-around gap-1">
                          {c.byCc.map(([k, v]) => (
                            <div key={k} className="flex items-center gap-2 text-[14px]">
                              <span className="w-16 shrink-0 font-bold">CC {k}</span>
                              <div className="flex-1 h-4 bg-white border border-gray-300">
                                <div style={{ width: `${(v / c.total) * 100}%`, height: '100%', background: c.others ? '#64748b' : BRAND.blue }} />
                              </div>
                              <span className="w-8 text-right font-black tabular-nums">{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Box>
              <Box title="Transporte por rota">
                <div className="flex-1 flex flex-col justify-around gap-1">
                  {routes.map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 text-[12px]">
                      <span className="w-40 shrink-0 truncate font-semibold" title={k}>{k}</span>
                      <div className="flex-1 h-3.5 bg-gray-100 border border-gray-300">
                        <div style={{ width: `${(v / routeMax) * 100}%`, height: '100%', background: k.startsWith('Outras rotas') ? '#94a3b8' : BRAND.blue }} />
                      </div>
                      <span className="w-7 text-right font-black tabular-nums">{v}</span>
                    </div>
                  ))}
                </div>
              </Box>
            </div>

            <div className="grid gap-6 pt-2 text-[12px]" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>
              {['Líder / Contramestre', 'Gestor', 'RH'].map((l) => (
                <div key={l} className="text-center">
                  <div style={{ borderBottom: '1.5px solid #000', height: 30 }} />
                  <div className="font-bold mt-0.5">{l}</div>
                </div>
              ))}
              <div className="text-right tabular-nums" style={{ color: '#475569' }}>Emitido em<br /><b>{issued}</b></div>
            </div>
          </div>
        </div>
        {footer(1)}
      </div>

      {/* Páginas da lista nominal */}
      {layout?.pages.map((pg, pi) => {
        let zebraN = 0;
        return (
          <div key={pi} className="he-page bg-white text-black font-sans" style={{ width: A3_W, height: A3_H, padding: PAD, boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
            <div className="flex items-center justify-between text-white font-bold" style={{ height: TITLE_H, padding: '0 14px', background: BRAND.blue, borderBottom: `5px solid ${BRAND.yellow}`, fontSize: 14 }}>
              <span>LISTA NOMINAL ({recs.length}) · classificada por {levelsLabel(levels)}{group ? ' · agrupada' : ''}</span>
              <span style={{ color: BRAND.yellow }}>{title}</span>
            </div>
            <div style={{ height: 8 }} />
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 * layout.k, lineHeight: 1.15, tableLayout: 'auto' }}>
              <Thead levels={levels} onSortHeader={onSortHeader} />
              <tbody>
                {pg.rows.map((row, ri) => {
                  if (row.kind === 'rec') zebraN++;
                  return <BodyRow key={ri} row={row} h={pg.hs[ri] * pg.f} zebra={zebraN % 2 === 0} />;
                })}
              </tbody>
            </table>
            {footer(pi + 2)}
          </div>
        );
      })}

    </>
  );
}
