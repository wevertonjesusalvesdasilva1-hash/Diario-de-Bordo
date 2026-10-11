import { useEffect, useMemo, useRef, useState } from 'react';
import { OvertimeRecord } from '../types';

// A3 paisagem: 420 x 297 mm a 96 dpi
const A3_W = 1587;
const A3_H = 1123;

const norm = (s: string) =>
  (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

const fixText = (s: string) => (s || '').replace(/N\?O/g, 'NÃO').trim();
const turno = (r: OvertimeRecord) => (r.de && r.ate ? `${r.de} – ${r.ate}` : 'Sem horário');
const isLeaderRow = (r: OvertimeRecord) => norm(r.motivoHe) === 'responsavel';
const needsTransport = (r: OvertimeRecord) => {
  const t = norm(r.transporte);
  return t !== '' && !t.startsWith('outros');
};

function halves<T>(xs: T[]): [T[], T[]] {
  const n = Math.ceil(xs.length / 2);
  return [xs.slice(0, n), xs.slice(n)];
}

function countBy<T>(items: T[], key: (x: T) => string) {
  const m = new Map<string, number>();
  items.forEach((i) => m.set(key(i), (m.get(key(i)) ?? 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const Box = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`border border-black ${className}`} style={{ breakInside: 'avoid' }}>
    <h3 className="bg-black text-white text-[11px] font-bold uppercase tracking-wide px-2 py-1">{title}</h3>
    <div className="p-2">{children}</div>
  </section>
);

function MiniTable({ rows, head }: { rows: (string | number)[][]; head: string[] }) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={h} className={`border-b border-black pb-0.5 font-bold ${i === head.length - 1 ? 'text-right' : 'text-left'}`}>
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

function Sheet({ date, recs }: { date: string; recs: OvertimeRecord[] }) {
  const leaders = recs.filter(isLeaderRow);
  const workers = recs.filter((r) => !isLeaderRow(r));
  const byTurno = countBy(recs, turno);
  const byCc = countBy(recs, (r) => r.cc || 'Sem CC');
  const transp = recs.filter(needsTransport);
  const byRota = countBy(transp, (r) => fixText(r.transporte));
  const semTransp = recs.length - transp.length;
  const byRef = countBy(recs, (r) => fixText(r.refeicao) || 'Sem refeição');
  const byLider = countBy(recs, (r) => r.lider || 'Não identificado');
  const gestores = [...new Set(recs.map((r) => r.gestor).filter(Boolean))];
  const locais = [...new Set(recs.map((r) => r.local).filter(Boolean))];
  const aprovados = recs.filter((r) => norm(r.aprovacao) === 'aprovado').length;

  const pieces = useMemo(() => {
    const m = new Map<string, { nome: string; cc: Set<string>; people: string[] }>();
    workers.forEach((r) => {
      const k = norm(r.motivoHe);
      const e = m.get(k) ?? { nome: r.motivoHe.trim(), cc: new Set<string>(), people: [] };
      if (r.cc) e.cc.add(r.cc);
      e.people.push(r.funcionario.split(' ')[0] + ' ' + (r.funcionario.split(' ').slice(-1)[0] ?? ''));
      m.set(k, e);
    });
    return [...m.values()].sort((a, b) => b.people.length - a.people.length || a.nome.localeCompare(b.nome));
  }, [workers]);

  const sorted = [...recs].sort(
    (a, b) =>
      Number(isLeaderRow(b)) - Number(isLeaderRow(a)) ||
      (a.cc || '').localeCompare(b.cc || '') ||
      a.motivoHe.localeCompare(b.motivoHe) ||
      a.funcionario.localeCompare(b.funcionario),
  );

  return (
    <div className="bg-white text-black p-5 font-sans" style={{ width: A3_W, minHeight: A3_H, boxSizing: 'border-box' }}>
      {/* Cabeçalho */}
      <div className="flex items-end justify-between border-b-4 border-black pb-2 mb-3">
        <div>
          <h1 className="text-3xl font-black tracking-tight">PLANEJAMENTO DE HORA EXTRA</h1>
          <p className="text-sm font-semibold">
            {locais.join(' / ') || '—'} · Gestor: {gestores.join(' / ') || '—'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-4xl font-black tabular-nums">{date}</p>
          <p className="text-xs">
            {aprovados}/{recs.length} aprovados
          </p>
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid gap-3 mb-3 items-start" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
        <div className="border-2 border-black p-2 text-center self-stretch flex flex-col justify-center">
          <p className="text-[10px] font-bold uppercase">Total</p>
          <p className="text-5xl font-black tabular-nums leading-none">{recs.length}</p>
          <p className="text-[10px]">colaboradores</p>
        </div>
        <Box title="Por turno" className="col-span-1">
          <MiniTable head={['Horário', 'Qtd']} rows={byTurno.map(([k, v]) => [k, v])} />
        </Box>
        <Box title="Por centro de custo">
          <MiniTable head={['CC', 'Qtd']} rows={byCc.map(([k, v]) => [k, v])} />
        </Box>
        <Box title="Transporte">
          <MiniTable
            head={['Tipo', 'Qtd']}
            rows={[['Com transporte', transp.length], ['Sem (outros meios)', semTransp]]}
          />
        </Box>
        <Box title="Refeição">
          <MiniTable head={['Tipo', 'Qtd']} rows={byRef.map(([k, v]) => [k, v])} />
        </Box>
        <Box title="Por líder / contramestre">
          <MiniTable head={['Líder', 'Qtd']} rows={byLider.map(([k, v]) => [k, v])} />
        </Box>
      </div>

      <div className="grid gap-3 mb-3 items-start" style={{ gridTemplateColumns: '1fr 2.2fr' }}>
        <div className="space-y-3">
          <Box title={`Líderes / responsáveis em destaque (${leaders.length})`}>
            {leaders.length === 0 ? (
              <p className="text-[11px]">Nenhum responsável indicado.</p>
            ) : (
              <ul className="text-[12px] space-y-0.5">
                {leaders.map((r) => (
                  <li key={r.id} className="flex justify-between gap-2 border-b border-gray-300">
                    <span className="font-bold">{r.funcionario}</span>
                    <span className="tabular-nums whitespace-nowrap">
                      {r.chapa} · {r.cc}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Box>
          <Box title="Transporte por rota">
            <MiniTable head={['Rota', 'Qtd']} rows={byRota.map(([k, v]) => [k, v])} />
          </Box>
        </div>
        <Box title={`Quantidade por peça / atividade (${pieces.length})`}>
          <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
            {halves(pieces).map((half, i) => (
              <table key={i} className="w-full text-[11px] border-collapse self-start">
                <thead>
                  <tr className="border-b border-black text-left">
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

      {/* Lista nominal */}
      <Box title={`Lista nominal (${recs.length})`}>
        <div className="grid gap-4" style={{ gridTemplateColumns: '1fr 1fr' }}>
          {halves(sorted).map((half, h) => (
            <table key={h} className="w-full text-[10.5px] border-collapse self-start">
              <thead style={{ display: 'table-header-group' }}>
                <tr className="border-b-2 border-black text-left">
                  {['#', 'Chapa', 'Funcionário', 'Peça', 'CC', 'Líder', 'Transporte'].map((c) => (
                    <th key={c} className="py-0.5 pr-1.5">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {half.map((r, i) => (
                  <tr key={r.id} className={`border-b border-gray-300 ${isLeaderRow(r) ? 'font-bold bg-gray-200' : ''}`} style={{ breakInside: 'avoid' }}>
                    <td className="py-0.5 pr-1.5 tabular-nums">{h === 0 ? i + 1 : halves(sorted)[0].length + i + 1}</td>
                    <td className="pr-1.5 tabular-nums">{r.chapa}</td>
                    <td className="pr-1.5">{r.funcionario}</td>
                    <td className="pr-1.5">{r.motivoHe}</td>
                    <td className="pr-1.5">{r.cc}</td>
                    <td className="pr-1.5">{r.lider}</td>
                    <td className="pr-1.5">{fixText(r.transporte).replace('OUTROS MEIOS - NÃO TEM DESCONTO', 'Outros meios')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </Box>
    </div>
  );
}

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

  const [pick, setPick] = useState<string>(dates.includes(selectedDate) ? selectedDate : 'ALL');
  const effective = pick === 'ALL' || dates.includes(pick) ? pick : 'ALL';
  const shown = effective === 'ALL' ? dates : [effective];

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
  }, [shown.join('|'), records]);

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

  return (
    <div className="p-3 space-y-3">
      <style>{`
        @page { size: A3 landscape; margin: 0; }
        @media print {
          html, body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .he-print, .he-print * { visibility: visible !important; }
          .he-print { position: absolute; left: 0; top: 0; transform: none !important; width: ${A3_W}px !important; }
          .he-sheet-break { break-after: page; }
        }
      `}</style>

      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-lg mr-auto">Planejamento Hora Extra</h2>
        <button onClick={onUpload} className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 px-3 py-2 text-sm font-bold text-emerald-300">
          Subir Excel
        </button>
        <button onClick={() => window.print()} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950">
          Imprimir A3
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {[...dates, 'ALL'].map((d) => (
          <button
            key={d}
            onClick={() => setPick(d)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${effective === d ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
          >
            {d === 'ALL' ? 'Todos os dias' : d}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-400">
          Simulação A3 paisagem · {pages} página{pages > 1 ? 's' : ''} · zoom {Math.round(scale * 100)}%
        </span>
      </div>

      {/* Pré-visualização da folha A3 */}
      <div ref={wrapRef} className="w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-600/30">
        <div style={{ height: contentH * scale }}>
          <div
            ref={sheetsRef}
            className="he-print"
            style={{ width: A3_W, transform: `scale(${scale})`, transformOrigin: 'top left' }}
          >
            {shown.map((d, i) => (
              <div key={d} className={i < shown.length - 1 ? 'he-sheet-break' : ''}>
                <Sheet date={d} recs={records.filter((r) => r.data === d)} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
