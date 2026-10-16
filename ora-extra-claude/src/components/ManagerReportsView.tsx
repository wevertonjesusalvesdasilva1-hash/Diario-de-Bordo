import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertOctagon,
  BarChart3,
  Calendar,
  ChevronDown,
  DoorOpen,
  Download,
  Flame,
  Layers,
  PauseCircle,
  RefreshCw,
  UserX,
  Wrench,
} from 'lucide-react';
import {
  AbsentPieceAction,
  AttendanceStatus,
  OperationalStatus,
  OvertimeRecord,
  ProducedState,
  ShiftGroup,
} from '../types';
import {
  ExecutiveBentoDashboard,
  getRecordStopMinutes,
  getStopOccurrences,
} from './ExecutiveBentoDashboard';

interface ManagerReportsViewProps {
  records: OvertimeRecord[];
  shiftGroups: ShiftGroup[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectEmployee: (empId: string) => void;
  onExportExcel: (scope: string) => void;
  onReloadSimulation: () => void;
}

type ReportScope = 'SELECTED_SHIFT' | 'ALL_WEEKEND';
type StopMetric = 'COUNT' | 'MINUTES';

function normalizeStopCause(rawDescription: string): string {
  const lower = rawDescription.toLowerCase();
  const match = rawDescription.match(/parou\s*\(([^)]+)\)/i);
  const extracted = match ? match[1].trim() : rawDescription.replace(/^parou[:\s-]*/i, '').trim();
  const extLower = extracted.toLowerCase();

  if (extLower.includes('ponte rolante')) return 'Ponte rolante ocupada';
  if (extLower.includes('falta de peça') || extLower.includes('aguardando peça')) {
    return 'Falta de peça / material';
  }
  if (extLower.includes('gás') || extLower.includes('arame') || extLower.includes('insumo')) {
    return 'Troca de gás / arame';
  }
  if (extLower.includes('manutenção') || extLower.includes('máquina')) {
    return 'Manutenção de máquina';
  }
  if (extLower.includes('qualidade') || extLower.includes('inspeção')) {
    return 'Aguardando inspeção / qualidade';
  }
  if (extLower.includes('energia') || extLower.includes('elétrica')) {
    return 'Queda de energia / rede';
  }
  if (lower.includes('ponte rolante')) return 'Ponte rolante ocupada';

  return extracted || 'Parada operacional';
}

export interface StopOccurrenceDetail {
  empId: string;
  funcionario: string;
  chapa: string;
  peca: string;
  cc: string;
  data: string;
  time: string;
  cause: string;
  rawDescription: string;
  delayMinutes: number;
}

export interface GroupedStopAlert {
  cause: string;
  count: number;
  totalMinutes: number;
  uniqueProcesses: string[];
  uniqueEmployees: string[];
  occurrences: StopOccurrenceDetail[];
}

export const ManagerReportsView: React.FC<ManagerReportsViewProps> = ({
  records,
  shiftGroups,
  selectedDate,
  onSelectDate,
  onSelectEmployee,
  onExportExcel,
  onReloadSimulation,
}) => {
  const [reportScope, setReportScope] = useState<ReportScope>('SELECTED_SHIFT');
  const [stopMetric, setStopMetric] = useState<StopMetric>('COUNT');
  // Progressive disclosure ("o texto aparece se eu clicar")
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  const [expandAllCards, setExpandAllCards] = useState(false);

  const toggleCard = (id: string) => {
    setExpandedCards((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const activeRecords = useMemo(() => {
    if (reportScope === 'ALL_WEEKEND') return records;
    return records.filter((r) => r.data === selectedDate);
  }, [records, reportScope, selectedDate]);

  const stopAnalysis = useMemo(() => {
    const allOccurrences: StopOccurrenceDetail[] = [];

    activeRecords.forEach((emp) => {
      const minsByIndex = new Map(getStopOccurrences(emp).map((o) => [o.index, o.minutes]));
      emp.timeline.forEach((ev, idx) => {
        const descLower = ev.description.toLowerCase();
        if (ev.type === 'stop' || descLower.startsWith('parou')) {
          const cause = normalizeStopCause(ev.description);
          const mins = minsByIndex.get(idx) || 0;
          allOccurrences.push({
            empId: emp.id,
            funcionario: emp.funcionario,
            chapa: emp.chapa,
            peca: emp.motivoHe || 'Peça não informada',
            cc: emp.cc,
            data: emp.data,
            time: ev.time,
            cause,
            rawDescription: ev.description,
            delayMinutes: mins,
          });
        }
      });
    });

    const byCause = new Map<string, StopOccurrenceDetail[]>();
    allOccurrences.forEach((occ) => {
      const list = byCause.get(occ.cause) || [];
      list.push(occ);
      byCause.set(occ.cause, list);
    });

    const grouped: GroupedStopAlert[] = Array.from(byCause.entries())
      .map(([cause, occurrences]) => {
        const uniqueProcesses = Array.from(new Set(occurrences.map((o) => o.peca)));
        const uniqueEmployees = Array.from(new Set(occurrences.map((o) => o.funcionario)));
        const totalMinutes = occurrences.reduce((acc, o) => acc + o.delayMinutes, 0);
        return {
          cause,
          count: occurrences.length,
          totalMinutes,
          uniqueProcesses,
          uniqueEmployees,
          occurrences,
        };
      })
      .sort((a, b) => b.count - a.count || b.totalMinutes - a.totalMinutes);

    const totalStops = allOccurrences.length;
    let totalStopMinutes = 0;
    let stopEstimated = false;
    activeRecords.forEach((emp) => {
      const rec = getRecordStopMinutes(emp);
      totalStopMinutes += rec.minutes;
      if (rec.estimated) stopEstimated = true;
    });

    return {
      grouped,
      totalStops,
      totalStopMinutes,
      stopEstimated,
    };
  }, [activeRecords]);

  const absentRecords = useMemo(() => {
    return activeRecords.filter((r) => r.status === AttendanceStatus.Ausente);
  }, [activeRecords]);

  const weekendAbsenceCountByChapa = useMemo(() => {
    const map = new Map<string, { count: number; dates: string[] }>();
    records.forEach((r) => {
      if (r.status === AttendanceStatus.Ausente) {
        const curr = map.get(r.chapa) || { count: 0, dates: [] };
        curr.count += 1;
        if (!curr.dates.includes(r.data)) curr.dates.push(r.data);
        map.set(r.chapa, curr);
      }
    });
    return map;
  }, [records]);

  const earlyExitRecords = useMemo(() => {
    return activeRecords.filter((r) => r.operationalStatus === OperationalStatus.SaiuMaisCedo);
  }, [activeRecords]);

  const productionByShiftData = useMemo(() => {
    return shiftGroups.map((group) => {
      const groupRecs = records.filter((r) => r.data === group.data);
      const concluidas = groupRecs.filter((r) => r.producedState === ProducedState.Sim).length;
      const parciaisOuAndamento = groupRecs.filter(
        (r) =>
          r.producedState === ProducedState.Parcial ||
          (r.status === AttendanceStatus.Presente &&
            r.producedState === ProducedState.NaoIniciado)
      ).length;
      const paradasOuNaoRealizadas = groupRecs.filter(
        (r) =>
          r.status === AttendanceStatus.Ausente ||
          r.producedState === ProducedState.Nao ||
          r.operationalStatus === OperationalStatus.Parado
      ).length;

      const shortDate = group.data.slice(0, 5);
      const label = group.weekdayLabel ? `${group.weekdayLabel} ${shortDate}` : shortDate;

      return {
        data: group.data,
        label,
        Concluidas: concluidas,
        EmAndamentoParcial: parciaisOuAndamento,
        ParadasOuFalta: paradasOuNaoRealizadas,
        total: groupRecs.length,
      };
    });
  }, [records, shiftGroups]);

  const primaryBottleneck = stopAnalysis.grouped[0] || null;

  return (
    <div className="space-y-4 mb-10">
      {/* =====================================================================
          EXECUTIVE BENTO DASHBOARD (Top 4 Sparkline KPI Cards + Gráficos Executivos)
         ===================================================================== */}
      <ExecutiveBentoDashboard
        records={records}
        scopedRecords={activeRecords}
        shiftGroups={shiftGroups}
        selectedDate={
          reportScope === 'ALL_WEEKEND' ? `Consolidado (${shiftGroups.length} turnos)` : selectedDate
        }
        onSelectDate={onSelectDate}
        onSelectEmployee={onSelectEmployee}
        headerRightControls={
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
              <button
                type="button"
                onClick={() => setReportScope('SELECTED_SHIFT')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  reportScope === 'SELECTED_SHIFT'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Turno {selectedDate}
              </button>
              <button
                type="button"
                onClick={() => setReportScope('ALL_WEEKEND')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                  reportScope === 'ALL_WEEKEND'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {shiftGroups.length} {shiftGroups.length === 1 ? 'turno' : 'turnos'} ({records.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => onExportExcel(reportScope === 'ALL_WEEKEND' ? 'ALL' : selectedDate)}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-emerald-400 flex items-center gap-1.5 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Excel (.xlsx)</span>
            </button>
          </div>
        }
      />

      {/* =====================================================================
          GRÁFICOS ANALÍTICOS COMPLEMENTARES (PARETO DE GARGALOS + COMPARATIVO DE TURNOS)
         ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* CHART A: Pareto de Motivos de Parada */}
        <section className="bg-[#111726] rounded-2xl border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div>
                <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Ranking de Gargalos por Causa</span>
                </h2>
              </div>

              <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setStopMetric('COUNT')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    stopMetric === 'COUNT'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Vezes
                </button>
                <button
                  type="button"
                  onClick={() => setStopMetric('MINUTES')}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    stopMetric === 'MINUTES'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Minutos
                </button>
              </div>
            </div>

            {stopAnalysis.grouped.length === 0 ? (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                Sem apontamentos ainda: nenhuma parada neste período.
              </div>
            ) : (
              <div className="h-52 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stopAnalysis.grouped}
                    layout="vertical"
                    margin={{ top: 4, right: 20, left: 10, bottom: 4 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={true}
                      vertical={false}
                      stroke="#1e293b"
                    />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fill: '#94a3b8', fontSize: 11 }}
                      axisLine={{ stroke: '#334155' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="cause"
                      width={145}
                      tick={{ fill: '#e2e8f0', fontSize: 11, fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        backgroundColor: '#090d16',
                        borderColor: '#334155',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#f8fafc',
                      }}
                    />
                    <Bar
                      dataKey={stopMetric === 'COUNT' ? 'count' : 'totalMinutes'}
                      radius={[0, 8, 8, 0]}
                      maxBarSize={24}
                    >
                      {stopAnalysis.grouped.map((_, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={index === 0 ? '#f59e0b' : '#22d3ee'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>
              Ofensor #1:{' '}
              <strong className="text-amber-300">
                {primaryBottleneck ? primaryBottleneck.cause : 'Nenhum'}
              </strong>
            </span>
            <span className="font-mono-tabular">
              {stopAnalysis.totalStops}x ({stopAnalysis.stopEstimated ? '≈ ' : ''}{stopAnalysis.totalStopMinutes}m)
            </span>
          </div>
        </section>

        {/* CHART B: Resultado das Peças por Turno */}
        <section className="bg-[#111726] rounded-2xl border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2 mb-3">
              <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Comparativo de Entregas por Turno</span>
            </h2>

            {productionByShiftData.every(
              (d) => d.Concluidas === 0 && d.EmAndamentoParcial === 0 && d.ParadasOuFalta === 0
            ) ? (
              <div className="h-52 flex items-center justify-center text-xs text-slate-400">
                Sem apontamentos ainda
              </div>
            ) : (
            <div className="h-52 w-full mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productionByShiftData}
                  margin={{ top: 8, right: 12, left: -18, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#cbd5e1', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#334155' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#94a3b8', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={false}
                    contentStyle={{
                      backgroundColor: '#090d16',
                      borderColor: '#334155',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '6px' }} />
                  <Bar
                    dataKey="Concluidas"
                    name="Concluídas"
                    fill="#10b981"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="EmAndamentoParcial"
                    name="Operando / Parcial"
                    fill="#22d3ee"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={28}
                  />
                  <Bar
                    dataKey="ParadasOuFalta"
                    name="Paradas / Falta"
                    fill="#f43f5e"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={28}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            )}
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span>Histórico consolidado da escala</span>
            <span className="font-mono-tabular text-cyan-400 font-semibold">
              {shiftGroups.length} turnos
            </span>
          </div>
        </section>
      </div>

      {/* =====================================================================
          SECTION 1: CARDS COMPACTOS DE ALERTA (CLIQUE PARA EXPANDIR O TEXTO)
         ===================================================================== */}
      <section className="bg-[#111726] rounded-2xl border border-slate-800/90 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0" />
            <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
              Detalhamento de Alertas por Categoria (Clique no card p/ ver texto completo)
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setExpandAllCards((prev) => !prev)}
              className="min-h-[32px] px-3 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white"
            >
              {expandAllCards ? 'Recolher Textos' : 'Expandir Todos os Textos'}
            </button>

            {stopAnalysis.totalStops === 0 && absentRecords.length === 0 && (
              <button
                type="button"
                onClick={onReloadSimulation}
                className="min-h-[32px] px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recarregar Simulação</span>
              </button>
            )}
          </div>
        </div>

        {/* 1A. EARLY DEPARTURE & PRIORITY REALLOCATION CARDS (Ex: Airton -> Ademir at 10:00) */}
        {earlyExitRecords.length > 0 && (
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <DoorOpen className="w-3.5 h-3.5 text-indigo-400" />
              <span>Remanejamentos de Prioridade & Saídas Antecipadas ({earlyExitRecords.length})</span>
            </div>

            <div className="grid grid-cols-1 gap-2.5">
              {earlyExitRecords.map((emp) => {
                const cardId = `early-${emp.id}`;
                const isExpanded = expandAllCards || Boolean(expandedCards[cardId]);

                const subRecord = activeRecords.find(
                  (r) =>
                    r.id !== emp.id &&
                    (r.coveringForChapa === emp.chapa ||
                      (emp.reallocatedToChapa && r.chapa === emp.reallocatedToChapa) ||
                      (emp.reallocatedToWelder &&
                        `${r.funcionario} (#${r.chapa})` === emp.reallocatedToWelder))
                );

                const subFirst = subRecord
                  ? subRecord.funcionario.split(' ')[0]
                  : emp.reallocatedToWelder
                  ? emp.reallocatedToWelder.split(' ')[0]
                  : '';
                const empFirst = emp.funcionario.split(' ')[0];
                const subOriginalPiece = subRecord ? subRecord.motivoHe : 'sua peça original';
                const exitTime = emp.horaSaidaReal || '10:00';
                const exitReason = emp.motivoSaidaAntecipada || 'motivos particulares';

                return (
                  <div
                    key={emp.id}
                    className="rounded-xl border border-indigo-500/35 bg-indigo-950/15 hover:bg-indigo-950/25 transition-all overflow-hidden"
                  >
                    {/* Compact Visual Header Row (Always visible) */}
                    <button
                      type="button"
                      onClick={() => toggleCard(cardId)}
                      className="w-full p-3.5 text-left flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 shrink-0">
                          <DoorOpen className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-bold text-white">
                              {empFirst} (#{emp.chapa})
                            </span>
                            <span className="text-xs font-mono-tabular font-bold px-2 py-0.5 rounded-md bg-orange-500/20 text-orange-300 border border-orange-500/35">
                              Saiu {exitTime}
                            </span>
                            {subFirst && (
                              <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                                ⇄ Coberto por {subFirst}
                              </span>
                            )}
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/35">
                              ✓ {emp.motivoHe} entregue
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5 truncate">
                            {subFirst
                              ? `${subFirst} pausou "${subOriginalPiece}" às ${exitTime} para priorizar "${emp.motivoHe}"`
                              : `Motivo: ${exitReason}`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-300 shrink-0">
                        <span>{isExpanded ? 'Ocultar' : 'Ver 4 motivos'}</span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        />
                      </div>
                    </button>

                    {/* Expandable Full Explanation ("O texto aparece se eu clicar") */}
                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-1 border-t border-indigo-500/20 space-y-2.5 animate-in fade-in duration-150">
                        {emp.absentPieceAction === AbsentPieceAction.AlocarOutro && subFirst ? (
                          <div className="rounded-xl bg-slate-950/90 border border-slate-800 p-3 space-y-1.5 text-xs">
                            <ul className="space-y-1 text-slate-200">
                              <li>
                                • <strong>{subFirst}</strong> acabou atrasando a produção da sua peça (
                                <strong>{subOriginalPiece}</strong>) devido à ausência mais cedo de{' '}
                                <strong>{empFirst}</strong> por <strong>{exitReason}</strong>.
                              </li>
                              <li>
                                • O <strong>{empFirst}</strong> saiu mais cedo (trabalhou das{' '}
                                <strong className="font-mono-tabular">
                                  {emp.horaEntradaReal || emp.de} às {exitTime}
                                </strong>
                                ).
                              </li>
                              <li className="text-rose-300">
                                • A peça que o <strong>{subFirst}</strong> iria entregar (
                                <strong>{subOriginalPiece}</strong>) <strong>não entregou</strong> (ele
                                saiu dela às <strong className="font-mono-tabular">{exitTime}</strong>
                                ).
                              </li>
                              <li className="text-emerald-300">
                                • O <strong>{subFirst}</strong> foi lá às{' '}
                                <strong className="font-mono-tabular">{exitTime}</strong> e{' '}
                                <strong>entregou a peça prioritária ({emp.motivoHe})</strong> do outro
                                colaborador ({empFirst}).
                              </li>
                            </ul>
                          </div>
                        ) : (
                          <p className="text-xs text-slate-300">
                            Trabalhou das {emp.horaEntradaReal || emp.de} às {exitTime} · Motivo:{' '}
                            {exitReason}.
                          </p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => onSelectEmployee(emp.id)}
                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-orange-300"
                          >
                            Ficha de {empFirst} ({emp.motivoHe}) &rarr;
                          </button>
                          {subRecord && (
                            <button
                              type="button"
                              onClick={() => onSelectEmployee(subRecord.id)}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-indigo-300"
                            >
                              Ficha de {subFirst} ({subOriginalPiece}) &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 1B. REPEATED STOP BOTTLENECK CARDS (Ex: Ponte rolante 4x) */}
        {stopAnalysis.grouped.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 flex items-center gap-1.5">
              <PauseCircle className="w-3.5 h-3.5 text-amber-400" />
              <span>Gargalos de Parada por Causa ({stopAnalysis.grouped.length})</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {stopAnalysis.grouped.map((group) => {
                const cardId = `stop-${group.cause}`;
                const isExpanded = expandAllCards || Boolean(expandedCards[cardId]);
                const isCritical = group.count >= 2;

                return (
                  <div
                    key={group.cause}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isCritical
                        ? 'bg-amber-950/15 border-amber-500/40'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCard(cardId)}
                      className="w-full p-3.5 text-left flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            isCritical
                              ? 'bg-amber-500 text-slate-950'
                              : 'bg-slate-800 text-amber-400'
                          }`}
                        >
                          <PauseCircle className="w-4 h-4 stroke-[2.2]" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {group.cause}
                            </span>
                            <span className="font-mono-tabular text-[11px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 shrink-0">
                              {group.count}x · {group.totalMinutes}m
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                            {group.uniqueProcesses.length} processo(s):{' '}
                            {group.uniqueProcesses.join(' · ')}
                          </div>
                        </div>
                      </div>

                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180 text-amber-400' : ''
                        }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-amber-500/20 space-y-1.5 animate-in fade-in duration-150">
                        {group.occurrences.map((occ, idx) => (
                          <div
                            key={`${occ.empId}-${occ.time}-${idx}`}
                            onClick={() => onSelectEmployee(occ.empId)}
                            className="p-2 rounded-lg bg-slate-950 hover:bg-slate-900 border border-slate-800 flex items-center justify-between text-xs cursor-pointer"
                          >
                            <div className="truncate pr-2">
                              <span className="font-mono-tabular font-bold text-amber-400">
                                {occ.time}
                              </span>{' '}
                              · <strong className="text-white">{occ.funcionario.split(' ')[0]}</strong>{' '}
                              <span className="text-slate-400">({occ.peca})</span>
                            </div>
                            <span className="font-mono-tabular text-[11px] text-amber-300 shrink-0">
                              {occ.delayMinutes > 0 ? `-${occ.delayMinutes}m` : 'sem duração'} &rarr;
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 1C. ABSENCE CARDS (Compact pills, click to expand) */}
        {absentRecords.length > 0 && (
          <div className="space-y-2 pt-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-rose-300 flex items-center gap-1.5">
              <UserX className="w-3.5 h-3.5 text-rose-400" />
              <span>Ausências Registradas ({absentRecords.length})</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {absentRecords.map((emp) => {
                const cardId = `abs-${emp.id}`;
                const isExpanded = expandAllCards || Boolean(expandedCards[cardId]);
                const isStopped = emp.absentPieceAction === AbsentPieceAction.ProcessoParado;

                return (
                  <div
                    key={emp.id}
                    className={`rounded-xl border transition-all overflow-hidden ${
                      isStopped
                        ? 'bg-rose-950/20 border-rose-500/40'
                        : 'bg-slate-950/80 border-slate-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCard(cardId)}
                      className="w-full p-3 text-left flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-white truncate">
                            {emp.funcionario.split(' ').slice(0, 2).join(' ')}
                          </span>
                          <span className="font-mono-tabular text-[10px] text-slate-500">
                            #{emp.chapa}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 truncate">
                            {emp.motivoHe}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                              isStopped
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {isStopped ? 'Parado' : 'Realocado'}
                          </span>
                        </div>
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                          isExpanded ? 'rotate-180 text-rose-400' : ''
                        }`}
                      />
                    </button>

                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2 border-t border-slate-800/80 text-xs space-y-1 text-slate-300 animate-in fade-in duration-150">
                        <div>
                          Motivo: <strong className="text-rose-300">{emp.motivoFalta || 'Não informado'}</strong>
                        </div>
                        <div>
                          Destino: <strong className="text-white">{emp.absentPieceAction}</strong>
                          {emp.reallocatedToWelder ? ` (${emp.reallocatedToWelder})` : ''}
                        </div>
                        <button
                          type="button"
                          onClick={() => onSelectEmployee(emp.id)}
                          className="mt-1 text-[11px] font-bold text-cyan-400 underline"
                        >
                          Abrir ficha &rarr;
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
