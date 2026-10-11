import React, { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DoorOpen,
  Flame,
  Layers,
  PauseCircle,
  Sparkles,
  TrendingUp,
  UserCheck,
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

interface ExecutiveBentoDashboardProps {
  records: OvertimeRecord[];
  scopedRecords: OvertimeRecord[];
  shiftGroups: ShiftGroup[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSelectEmployee: (empId: string) => void;
  headerRightControls?: React.ReactNode;
}

type KpiCardFocus = 'ESCALADOS' | 'PRESENTES' | 'AUSENTES' | 'ENTREGA';

function parseTimeToMinutes(timeStr: string): number {
  const [hh = '0', mm = '0'] = (timeStr || '00:00').split(':');
  const h = parseInt(hh, 10);
  const m = parseInt(mm, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export const ExecutiveBentoDashboard: React.FC<ExecutiveBentoDashboardProps> = ({
  records,
  scopedRecords,
  shiftGroups,
  selectedDate,
  onSelectDate,
  onSelectEmployee,
  headerRightControls,
}) => {
  // Progressive disclosure state: which alert item or piece row is expanded ("o texto aparece se eu clicar")
  const [expandedAlertId, setExpandedAlertId] = useState<string | null>(null);
  const [selectedPieceFilter, setSelectedPieceFilter] = useState<string | null>(null);
  const [activeKpiCard, setActiveKpiCard] = useState<KpiCardFocus>('ESCALADOS');
  const [showKpiDetails, setShowKpiDetails] = useState<boolean>(false);

  const handleClickKpiCard = (card: KpiCardFocus) => {
    if (activeKpiCard === card && showKpiDetails) {
      setShowKpiDetails(false);
    } else {
      setActiveKpiCard(card);
      setShowKpiDetails(true);
    }
  };

  // 1. Core KPI metrics for the active scope
  const metrics = useMemo(() => {
    const total = scopedRecords.length;
    const presentes = scopedRecords.filter((r) => r.status === AttendanceStatus.Presente).length;
    const ausentes = scopedRecords.filter((r) => r.status === AttendanceStatus.Ausente).length;
    const pendentes = scopedRecords.filter((r) => r.status === AttendanceStatus.Pendente).length;

    const concluidas = scopedRecords.filter((r) => r.producedState === ProducedState.Sim).length;
    const parciais = scopedRecords.filter((r) => r.producedState === ProducedState.Parcial).length;
    const naoEntregues = scopedRecords.filter(
      (r) =>
        r.producedState === ProducedState.Nao ||
        r.status === AttendanceStatus.Ausente ||
        (r.producedState === ProducedState.NaoIniciado && r.status !== AttendanceStatus.Presente)
    ).length;

    const remanejados = scopedRecords.filter(
      (r) =>
        Boolean(r.coveringForEmployee) ||
        (r.absentPieceAction === AbsentPieceAction.AlocarOutro && Boolean(r.reallocatedToWelder))
    ).length;

    const saiuMaisCedo = scopedRecords.filter(
      (r) => r.operationalStatus === OperationalStatus.SaiuMaisCedo
    ).length;

    const totalPlannedQty = scopedRecords.reduce((acc, r) => acc + (r.qtyPlanned || 1), 0);
    const totalActualQty = scopedRecords.reduce((acc, r) => acc + (r.qtyActual || 0), 0);
    const productionPct =
      totalPlannedQty > 0 ? Math.round((totalActualQty / totalPlannedQty) * 100) : 0;

    const totalDelayMins = scopedRecords.reduce((acc, r) => acc + (r.delayMinutes || 0), 0);

    let stopEventsCount = 0;
    scopedRecords.forEach((r) => {
      r.timeline.forEach((ev) => {
        if (ev.type === 'stop' || ev.description.toLowerCase().startsWith('parou')) {
          stopEventsCount++;
        }
      });
    });

    const presencePct = total > 0 ? Math.round((presentes / total) * 100) : 0;
    const deliveryPct =
      presentes > 0 ? Math.round(((concluidas + parciais * 0.5) / presentes) * 100) : 0;

    // Availability score: based on total present hours vs delay minutes
    const totalAvailableMins = Math.max(presentes * 480, 1);
    const availabilityPct = Math.max(
      0,
      Math.min(100, Math.round(((totalAvailableMins - totalDelayMins) / totalAvailableMins) * 100))
    );

    const overallScore = Math.round(
      presencePct * 0.35 + deliveryPct * 0.4 + availabilityPct * 0.25
    );

    return {
      total,
      presentes,
      ausentes,
      pendentes,
      concluidas,
      parciais,
      naoEntregues,
      remanejados,
      saiuMaisCedo,
      totalPlannedQty,
      totalActualQty,
      productionPct,
      totalDelayMins,
      stopEventsCount,
      presencePct,
      deliveryPct,
      availabilityPct,
      overallScore,
    };
  }, [scopedRecords]);

  // 2. Hourly Rhythm Wave Data (06:00 to 15:00) for Smooth Area Chart (like Images 1, 2, 3, 4)
  const hourlyWaveData = useMemo(() => {
    const slots = [
      { label: '06:00', mins: 360 },
      { label: '07:30', mins: 450 },
      { label: '08:30', mins: 510 },
      { label: '10:00', mins: 600 },
      { label: '11:30', mins: 690 },
      { label: '13:00', mins: 780 },
      { label: '14:32', mins: 872 },
    ];

    return slots.map((slot) => {
      let ativos = 0;
      let ocorrencias = 0;

      scopedRecords.forEach((r) => {
        if (r.status !== AttendanceStatus.Presente) return;
        const entryMins = parseTimeToMinutes(r.horaEntradaReal || r.de || '06:00');
        const exitMins =
          r.operationalStatus === OperationalStatus.SaiuMaisCedo && r.horaSaidaReal
            ? parseTimeToMinutes(r.horaSaidaReal)
            : parseTimeToMinutes(r.ate || '14:32');

        if (slot.mins >= entryMins && slot.mins <= exitMins) {
          ativos++;
        }

        // Count stops or reallocations near this time window
        r.timeline.forEach((ev) => {
          const evMins = parseTimeToMinutes(ev.time);
          if (Math.abs(evMins - slot.mins) <= 45) {
            if (
              ev.type === 'stop' ||
              ev.type === 'early_exit' ||
              ev.type === 'reallocation' ||
              ev.description.toLowerCase().includes('parou') ||
              ev.description.toLowerCase().includes('remanejamento')
            ) {
              ocorrencias++;
            }
          }
        });
      });

      return {
        hora: slot.label,
        Soldando: ativos,
        Eventos: ocorrencias,
      };
    });
  }, [scopedRecords]);

  // 3. Triage Pipeline Alerts (Compact rows that expand on click — "o texto aparece se eu clicar")
  const triageAlerts = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      subtitle: string;
      badge: string;
      badgeTone: 'amber' | 'indigo' | 'rose' | 'emerald';
      metricPrimary: string;
      metricSecondary: string;
      details: string[];
      relatedEmpIds: Array<{ id: string; name: string; piece: string }>;
    }> = [];

    // A) Priority Reallocations (e.g. Airton -> Ademir at 10:00)
    const earlyExitsWithRealloc = scopedRecords.filter(
      (r) =>
        r.operationalStatus === OperationalStatus.SaiuMaisCedo ||
        (r.absentPieceAction === AbsentPieceAction.AlocarOutro && Boolean(r.reallocatedToWelder))
    );

    earlyExitsWithRealloc.forEach((absentEmp) => {
      const subEmp = scopedRecords.find(
        (cand) =>
          cand.coveringForChapa === absentEmp.chapa ||
          (absentEmp.reallocatedToChapa && cand.chapa === absentEmp.reallocatedToChapa) ||
          (absentEmp.reallocatedToWelder &&
            absentEmp.reallocatedToWelder
              .toLowerCase()
              .includes(cand.funcionario.split(' ')[0].toLowerCase()))
      );

      const exitTime = absentEmp.horaSaidaReal || absentEmp.reallocatedAtTime || '10:00';
      const subFirstName = subEmp
        ? subEmp.funcionario.split(' ')[0]
        : absentEmp.reallocatedToWelder || 'Substituto';
      const absentFirstName = absentEmp.funcionario.split(' ')[0];

      items.push({
        id: `realloc-${absentEmp.id}`,
        title: subEmp
          ? `Remanejamento: ${subFirstName} cobriu ${absentFirstName}`
          : `Saída Antecipada: ${absentFirstName}`,
        subtitle: `Peça prioritária: ${absentEmp.motivoHe}`,
        badge: 'PRIORIDADE',
        badgeTone: 'indigo',
        metricPrimary: `Às ${exitTime}`,
        metricSecondary: subEmp ? `Deixou ${subEmp.motivoHe}` : absentEmp.motivoSaidaAntecipada || 'Saiu cedo',
        details: subEmp
          ? [
              `${subEmp.funcionario} acabou atrasando a produção da própria peça (${subEmp.motivoHe}) devido à saída mais cedo de ${absentEmp.funcionario} (${absentEmp.motivoSaidaAntecipada || 'motivos particulares'}).`,
              `O colaborador ${absentEmp.funcionario} saiu mais cedo (trabalhou das ${absentEmp.horaEntradaReal || absentEmp.de} às ${exitTime}).`,
              `A peça que ${subFirstName} iria entregar (${subEmp.motivoHe}) não foi entregue pois ele saiu dela às ${exitTime}.`,
              `O ${subFirstName} assumiu às ${exitTime} e ${absentEmp.producedState === ProducedState.Sim ? 'entregou concluída' : 'deu andamento na'} peça prioritária (${absentEmp.motivoHe}) de ${absentFirstName}.`,
            ]
          : [
              `${absentEmp.funcionario} saiu mais cedo às ${exitTime} (${absentEmp.motivoSaidaAntecipada || 'Não informado'}).`,
              `Destino da peça (${absentEmp.motivoHe}): ${absentEmp.absentPieceAction || 'Não definido'}.`,
            ],
        relatedEmpIds: [
          { id: absentEmp.id, name: absentFirstName, piece: absentEmp.motivoHe },
          ...(subEmp ? [{ id: subEmp.id, name: subFirstName, piece: subEmp.motivoHe }] : []),
        ],
      });
    });

    // B) Bottlenecks by Stop Cause (e.g. Ponte rolante 4x)
    const causeMap = new Map<
      string,
      {
        cause: string;
        count: number;
        minutes: number;
        processes: Set<string>;
        emps: Array<{ id: string; name: string; piece: string; time: string }>;
      }
    >();

    scopedRecords.forEach((r) => {
      r.timeline.forEach((ev) => {
        if (ev.type === 'stop' || ev.description.toLowerCase().startsWith('parou')) {
          const match = ev.description.match(/parou\s*\(([^)]+)\)/i);
          const cause = match ? match[1].trim() : r.motivoParadaAtual || 'Parada operacional';
          const curr = causeMap.get(cause) || {
            cause,
            count: 0,
            minutes: 0,
            processes: new Set<string>(),
            emps: [],
          };
          curr.count += 1;
          curr.minutes += r.delayMinutes > 0 ? Math.round(r.delayMinutes / Math.max(1, curr.count)) : 30;
          curr.processes.add(r.motivoHe);
          curr.emps.push({
            id: r.id,
            name: r.funcionario.split(' ')[0],
            piece: r.motivoHe,
            time: ev.time,
          });
          causeMap.set(cause, curr);
        }
      });
    });

    Array.from(causeMap.values())
      .sort((a, b) => b.count - a.count)
      .forEach((grp) => {
        items.push({
          id: `stop-${grp.cause}`,
          title: grp.cause,
          subtitle: `${grp.processes.size} processo(s) afetado(s)`,
          badge: grp.count >= 2 ? `GARGALO ${grp.count}X` : 'PARADA',
          badgeTone: 'amber',
          metricPrimary: `${grp.count}x paradas`,
          metricSecondary: `Processos: ${Array.from(grp.processes).slice(0, 2).join(', ')}`,
          details: grp.emps.map(
            (e) => `${e.time} · ${e.name} parou na peça "${e.piece}" por ${grp.cause}.`
          ),
          relatedEmpIds: grp.emps.map((e) => ({ id: e.id, name: e.name, piece: e.piece })),
        });
      });

    // C) Absences summary
    const absents = scopedRecords.filter((r) => r.status === AttendanceStatus.Ausente);
    if (absents.length > 0) {
      items.push({
        id: 'absences-group',
        title: `Ausências no Turno (${absents.length})`,
        subtitle: `${absents.filter((a) => a.absentPieceAction === AbsentPieceAction.ProcessoParado).length} peça(s) parada(s) sem cobertura`,
        badge: 'FALTAS',
        badgeTone: 'rose',
        metricPrimary: `${absents.length} ausente(s)`,
        metricSecondary: absents.map((a) => a.funcionario.split(' ')[0]).slice(0, 3).join(', '),
        details: absents.map(
          (a) =>
            `${a.funcionario} (#${a.chapa}) faltou na peça "${a.motivoHe}" — Motivo: ${a.motivoFalta || 'Não informado'} · Destino: ${a.absentPieceAction || 'Pendente'}.`
        ),
        relatedEmpIds: absents.map((a) => ({
          id: a.id,
          name: a.funcionario.split(' ')[0],
          piece: a.motivoHe,
        })),
      });
    }

    return items;
  }, [scopedRecords]);

  // 4. Piece / Process Demographics (like Image 4 "(c) SPECIALTY CARE DEMOGRAPHICS")
  const pieceDemographics = useMemo(() => {
    const map = new Map<
      string,
      {
        piece: string;
        total: number;
        done: number;
        partial: number;
        stoppedOrAbsent: number;
        emps: OvertimeRecord[];
      }
    >();

    scopedRecords.forEach((r) => {
      const pieceName = r.motivoHe || 'Não definida';
      const entry = map.get(pieceName) || {
        piece: pieceName,
        total: 0,
        done: 0,
        partial: 0,
        stoppedOrAbsent: 0,
        emps: [],
      };
      entry.total += 1;
      if (r.producedState === ProducedState.Sim) entry.done += 1;
      else if (r.producedState === ProducedState.Parcial) entry.partial += 1;
      else entry.stoppedOrAbsent += 1;
      entry.emps.push(r);
      map.set(pieceName, entry);
    });

    return Array.from(map.values())
      .map((item) => {
        const rate =
          item.total > 0
            ? Math.round(((item.done + item.partial * 0.5) / item.total) * 100)
            : 0;
        return { ...item, rate };
      })
      .sort((a, b) => b.total - a.total);
  }, [scopedRecords]);

  // 5. Multi-Shift Comparison Data (for Mini Grouped Bar Chart like Image 3)
  const shiftComparisonData = useMemo(() => {
    return shiftGroups.map((g) => {
      const recs = records.filter((r) => r.data === g.data);
      const entregues = recs.filter((r) => r.producedState === ProducedState.Sim).length;
      const parciais = recs.filter((r) => r.producedState === ProducedState.Parcial).length;
      const faltas = recs.filter((r) => r.status === AttendanceStatus.Ausente).length;
      return {
        data: g.data,
        curto: g.weekdayLabel ? `${g.weekdayLabel} ${g.data.slice(0, 5)}` : g.data.slice(0, 5),
        Entregues: entregues,
        Parciais: parciais,
        Faltas: faltas,
      };
    });
  }, [records, shiftGroups]);

  // Proportions for Capacity Mix Bar (like Image 4 "(b) TREATMENT CAPACITY & CARE MIX")
  const totalForMix = Math.max(metrics.total, 1);
  const pctConcluidas = Math.round((metrics.concluidas / totalForMix) * 100);
  const pctParciais = Math.round((metrics.parciais / totalForMix) * 100);
  const pctAusentes = Math.round((metrics.ausentes / totalForMix) * 100);
  const pctAndamento = Math.max(0, 100 - pctConcluidas - pctParciais - pctAusentes);

  const kpiFilteredList = useMemo(() => {
    if (activeKpiCard === 'PRESENTES') {
      return scopedRecords.filter((r) => r.status === AttendanceStatus.Presente);
    }
    if (activeKpiCard === 'AUSENTES') {
      return scopedRecords.filter(
        (r) =>
          r.status === AttendanceStatus.Ausente ||
          r.operationalStatus === OperationalStatus.SaiuMaisCedo
      );
    }
    if (activeKpiCard === 'ENTREGA') {
      return scopedRecords.filter(
        (r) =>
          r.producedState === ProducedState.Sim ||
          r.producedState === ProducedState.Parcial ||
          Boolean(r.coveringForEmployee)
      );
    }
    return scopedRecords;
  }, [scopedRecords, activeKpiCard]);

  return (
    <div className="space-y-4">
      {/* =================================================================
          TOP 4 SPARKLINE GRAPHICAL KPI CARDS (Visão do Gerente & Relatórios)
         ================================================================= */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {/* Card 1: Escalados */}
        <button
          type="button"
          onClick={() => handleClickKpiCard('ESCALADOS')}
          className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            activeKpiCard === 'ESCALADOS'
              ? 'bg-[#151d30] border-cyan-500/60 shadow-lg shadow-cyan-950/30'
              : 'bg-[#111726] border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-start justify-between gap-2 w-full">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Escalados
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-white mt-0.5">
                {metrics.total}
              </div>
            </div>
            {/* Mini Sparkline SVG */}
            <svg className="w-14 h-9 text-cyan-400 shrink-0" viewBox="0 0 60 32" fill="none">
              <path
                d="M2 26 L14 18 L24 22 L36 10 L46 15 L58 4"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="mt-2 w-full">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>
                {selectedDate.startsWith('Consolidado')
                  ? selectedDate
                  : `Turno ${selectedDate.slice(0, 5)}`}
              </span>
              <span className="font-mono-tabular text-cyan-400 font-bold">100%</span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-400 w-full rounded-full" />
            </div>
          </div>
        </button>

        {/* Card 2: Presentes */}
        <button
          type="button"
          onClick={() => handleClickKpiCard('PRESENTES')}
          className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            activeKpiCard === 'PRESENTES'
              ? 'bg-emerald-950/35 border-emerald-500/60 shadow-lg shadow-emerald-950/30'
              : 'bg-[#111726] border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-start justify-between gap-2 w-full">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                Presentes
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-white mt-0.5">
                {metrics.presentes}
              </div>
            </div>
            {/* Mini Bars SVG */}
            <svg className="w-14 h-9 text-emerald-400 shrink-0" viewBox="0 0 60 32" fill="none">
              <rect x="4" y="18" width="6" height="12" rx="2" fill="currentColor" opacity="0.4" />
              <rect x="15" y="14" width="6" height="16" rx="2" fill="currentColor" opacity="0.6" />
              <rect x="26" y="10" width="6" height="20" rx="2" fill="currentColor" opacity="0.75" />
              <rect x="37" y="6" width="6" height="24" rx="2" fill="currentColor" opacity="0.9" />
              <rect x="48" y="3" width="6" height="27" rx="2" fill="currentColor" />
            </svg>
          </div>
          <div className="mt-2 w-full">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>{metrics.concluidas} peças concluídas</span>
              <span className="font-mono-tabular text-emerald-400 font-bold">
                {metrics.presencePct}%
              </span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${metrics.presencePct}%` }}
              />
            </div>
          </div>
        </button>

        {/* Card 3: Ausentes */}
        <button
          type="button"
          onClick={() => handleClickKpiCard('AUSENTES')}
          className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            activeKpiCard === 'AUSENTES'
              ? 'bg-rose-950/35 border-rose-500/60 shadow-lg shadow-rose-950/30'
              : 'bg-[#111726] border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-start justify-between gap-2 w-full">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-400">
                Ausentes
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-white mt-0.5">
                {metrics.ausentes}
              </div>
            </div>
            <svg className="w-14 h-9 text-rose-400 shrink-0" viewBox="0 0 60 32" fill="none">
              <path
                d="M2 22 L14 20 L24 10 L34 24 L46 14 L58 18"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="mt-2 w-full">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>{metrics.saiuMaisCedo} saíram mais cedo</span>
              <span className="font-mono-tabular text-rose-400 font-bold">
                {metrics.total > 0 ? Math.round((metrics.ausentes / metrics.total) * 100) : 0}%
              </span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all"
                style={{
                  width: `${
                    metrics.total > 0 ? Math.round((metrics.ausentes / metrics.total) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </button>

        {/* Card 4: Entrega Turno / Pendentes */}
        <button
          type="button"
          onClick={() => handleClickKpiCard('ENTREGA')}
          className={`p-3.5 rounded-2xl border text-left transition-all flex flex-col justify-between ${
            activeKpiCard === 'ENTREGA'
              ? 'bg-amber-950/35 border-amber-500/60 shadow-lg shadow-amber-950/30'
              : 'bg-[#111726] border-slate-800/90 hover:border-slate-700'
          }`}
        >
          <div className="flex items-start justify-between gap-2 w-full">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                {metrics.pendentes > 0 ? 'Pendentes' : 'Entrega Turno'}
              </span>
              <div className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-white mt-0.5">
                {metrics.pendentes > 0 ? metrics.pendentes : `${metrics.productionPct}%`}
              </div>
            </div>
            <svg className="w-14 h-9 text-amber-400 shrink-0" viewBox="0 0 60 32" fill="none">
              <path
                d="M2 24 C16 24, 20 8, 32 14 C44 20, 48 6, 58 6"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="mt-2 w-full">
            <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
              <span>
                {metrics.totalActualQty}/{metrics.totalPlannedQty} peças
              </span>
              <span className="font-mono-tabular text-amber-400 font-bold">
                {metrics.productionPct}%
              </span>
            </div>
            <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-400 rounded-full transition-all"
                style={{ width: `${Math.min(100, metrics.productionPct)}%` }}
              />
            </div>
          </div>
        </button>
      </div>

      {/* Progressive Disclosure Panel when a KPI Card is clicked */}
      {showKpiDetails && (
        <section className="rounded-2xl bg-[#111726] border border-cyan-500/35 p-3.5 sm:p-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              {activeKpiCard === 'ESCALADOS' &&
                `Todos os Escalados (${kpiFilteredList.length})`}
              {activeKpiCard === 'PRESENTES' &&
                `Colaboradores Presentes (${kpiFilteredList.length})`}
              {activeKpiCard === 'AUSENTES' &&
                `Ausentes & Saídas Mais Cedo (${kpiFilteredList.length})`}
              {activeKpiCard === 'ENTREGA' &&
                `Entregas & Remanejamentos de Peças (${kpiFilteredList.length})`}
            </span>
            <button
              type="button"
              onClick={() => setShowKpiDetails(false)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-semibold text-slate-300"
            >
              Fechar lista
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto pr-1">
            {kpiFilteredList.map((emp) => {
              const isAbsent = emp.status === AttendanceStatus.Ausente;
              const isEarly = emp.operationalStatus === OperationalStatus.SaiuMaisCedo;
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => onSelectEmployee(emp.id)}
                  className="p-2.5 rounded-xl bg-slate-950/90 hover:bg-slate-900 border border-slate-800 text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      {emp.funcionario.split(' ').slice(0, 2).join(' ')}{' '}
                      <span className="font-mono-tabular text-[10px] text-slate-500">
                        #{emp.chapa}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5">
                      {emp.motivoHe}
                      {emp.coveringForPiece ? ` ⇄ ${emp.coveringForPiece}` : ''}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-md shrink-0 ${
                      isAbsent
                        ? 'bg-rose-500/20 text-rose-300'
                        : isEarly
                        ? 'bg-orange-500/20 text-orange-300'
                        : emp.producedState === ProducedState.Sim
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-cyan-500/20 text-cyan-300'
                    }`}
                  >
                    {isAbsent
                      ? 'Falta'
                      : isEarly
                      ? `Saiu ${emp.horaSaidaReal || '10:00'}`
                      : emp.producedState === ProducedState.Sim
                      ? '✓ 100%'
                      : emp.operationalStatus}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* =================================================================
          HERO EXECUTIVE STRIP (Inspired by Image 4 "METRO CENTRAL HEALTH HUB")
         ================================================================= */}
      <section className="rounded-2xl bg-[#111726] border border-slate-800/90 p-4 sm:p-5 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-cyan-400">
              <Activity className="w-3.5 h-3.5" />
              <span>CENTRAL DE INTELIGÊNCIA DE MANUFATURA · TURNO {selectedDate}</span>
            </div>

            {/* Inline Hero Metrics (Big Tabular Numbers + Calm Labels) */}
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mt-2">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-white">
                  {metrics.presentes}
                  <span className="text-slate-500 text-lg font-semibold">/{metrics.total}</span>
                </span>
                <span className="text-xs text-slate-400">operando no turno</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-emerald-400">
                  {metrics.concluidas}
                </span>
                <span className="text-xs text-slate-400">peças 100% entregues</span>
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold font-mono-tabular text-amber-400">
                  {(metrics.totalDelayMins / 60).toFixed(1)}h
                </span>
                <span className="text-xs text-slate-400">
                  tempo parado ({metrics.stopEventsCount}x)
                </span>
              </div>

              {metrics.remanejados > 0 && (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-indigo-400">
                    {metrics.remanejados}
                  </span>
                  <span className="text-xs text-indigo-300/80">remanejados por prioridade</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Team Initials Avatars + Optional Header Controls */}
          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-3">
            {headerRightControls ? (
              headerRightControls
            ) : (
              <>
                <div className="flex -space-x-2 overflow-hidden">
                  {scopedRecords.slice(0, 6).map((emp, i) => {
                    const initials = emp.funcionario
                      .split(' ')
                      .slice(0, 2)
                      .map((n) => n[0])
                      .join('');
                    const colors = [
                      'bg-emerald-500 text-slate-950',
                      'bg-cyan-500 text-slate-950',
                      'bg-indigo-500 text-white',
                      'bg-amber-500 text-slate-950',
                      'bg-rose-500 text-white',
                      'bg-slate-700 text-slate-200',
                    ];
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => onSelectEmployee(emp.id)}
                        title={`${emp.funcionario} (${emp.motivoHe})`}
                        className={`w-8 h-8 rounded-full ring-2 ring-[#111726] text-[11px] font-bold flex items-center justify-center transition-transform hover:scale-110 hover:z-10 ${
                          colors[i % colors.length]
                        }`}
                      >
                        {initials}
                      </button>
                    );
                  })}
                </div>
                <span className="text-[11px] text-slate-400 font-medium hidden sm:inline">
                  equipe do turno
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* =================================================================
          ROW 1 OF BENTO GRID:
          (a) CURVA DE RITMO & EVENTOS DO TURNO (Wave Area Chart - Image 1/2/4)
          (b) MIX DE CAPACIDADE & STATUS DAS PEÇAS (Stacked Bar + 4 Boxes - Image 4)
         ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* (a) Smooth Area Wave Chart */}
        <section className="lg:col-span-7 rounded-2xl bg-[#111726] border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                (a) CURVA DE RITMO OPERACIONAL NO TURNO (06:00 – 14:32)
              </span>
              <p className="text-xs text-slate-500 mt-0.5">
                Soldadores ativos vs. momentos de parada ou remanejamento
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" />
                Operando
              </span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                Paradas/Trocas
              </span>
            </div>
          </div>

          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyWaveData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.45} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="gradAmber" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="hora"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  axisLine={{ stroke: '#1e293b' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={false}
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '12px',
                    fontSize: '12px',
                    color: '#f8fafc',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="Soldando"
                  name="Soldadores Operando"
                  stroke="#22d3ee"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#gradCyan)"
                />
                <Area
                  type="monotone"
                  dataKey="Eventos"
                  name="Paradas / Remanejamentos"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#gradAmber)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 mt-2 border-t border-slate-800/80 text-xs">
            <span className="text-slate-300 font-medium">
              <strong className="font-mono-tabular text-white">{metrics.presencePct}%</strong> de
              presença efetiva na escala
            </span>
            <span className="text-emerald-400 font-mono-tabular font-semibold">
              Pico de troca: 10:00 (Prioridade Tw trave)
            </span>
          </div>
        </section>

        {/* (b) Capacity & Piece Mix Card (Like Image 4 top-right card) */}
        <section className="lg:col-span-5 rounded-2xl bg-[#111726] border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              (b) DISTRIBUIÇÃO DE CAPACIDADE & ENTREGA DE PEÇAS
            </span>

            {/* Legend Row above Proportion Bar */}
            <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold text-slate-400 mt-3 mb-1.5">
              <span>Concluídas</span>
              <span>Parciais</span>
              <span>Operando</span>
              <span>Ausentes</span>
            </div>

            {/* Segmented Horizontal Proportion Bar */}
            <div className="h-8 w-full rounded-xl overflow-hidden flex bg-slate-950 p-0.5 gap-1 border border-slate-800">
              {pctConcluidas > 0 && (
                <div
                  style={{ width: `${Math.max(12, pctConcluidas)}%` }}
                  className="bg-emerald-500 text-slate-950 font-mono-tabular text-xs font-extrabold flex items-center justify-center rounded-lg transition-all"
                >
                  {pctConcluidas}%
                </div>
              )}
              {pctParciais > 0 && (
                <div
                  style={{ width: `${Math.max(10, pctParciais)}%` }}
                  className="bg-amber-400 text-slate-950 font-mono-tabular text-xs font-extrabold flex items-center justify-center rounded-lg transition-all"
                >
                  {pctParciais}%
                </div>
              )}
              {pctAndamento > 0 && (
                <div
                  style={{ width: `${Math.max(10, pctAndamento)}%` }}
                  className="bg-cyan-500/80 text-slate-950 font-mono-tabular text-xs font-extrabold flex items-center justify-center rounded-lg transition-all"
                >
                  {pctAndamento}%
                </div>
              )}
              {pctAusentes > 0 && (
                <div
                  style={{ width: `${Math.max(10, pctAusentes)}%` }}
                  className="bg-rose-500/85 text-white font-mono-tabular text-xs font-extrabold flex items-center justify-center rounded-lg transition-all"
                >
                  {pctAusentes}%
                </div>
              )}
            </div>
          </div>

          {/* 4 Mini Metric Pillars below the bar (Like Image 4) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-4">
            <div className="bg-slate-950/75 border border-slate-800/90 rounded-xl p-3">
              <div className="text-[11px] font-bold text-emerald-400">Entregues</div>
              <div className="text-xl font-extrabold font-mono-tabular text-white mt-1">
                {metrics.concluidas}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Peças 100%</div>
              <div className="text-xs font-mono-tabular font-bold text-emerald-300 mt-0.5">
                {pctConcluidas}% do turno
              </div>
            </div>

            <div className="bg-slate-950/75 border border-slate-800/90 rounded-xl p-3">
              <div className="text-[11px] font-bold text-amber-400">Parciais</div>
              <div className="text-xl font-extrabold font-mono-tabular text-white mt-1">
                {metrics.parciais}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Em andamento</div>
              <div className="text-xs font-mono-tabular font-bold text-amber-300 mt-0.5">
                {pctParciais}% do turno
              </div>
            </div>

            <div className="bg-slate-950/75 border border-slate-800/90 rounded-xl p-3">
              <div className="text-[11px] font-bold text-indigo-400">Trocas Prior.</div>
              <div className="text-xl font-extrabold font-mono-tabular text-white mt-1">
                {metrics.remanejados}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Cobertura</div>
              <div className="text-xs font-mono-tabular font-bold text-indigo-300 mt-0.5">
                100% salvas
              </div>
            </div>

            <div className="bg-slate-950/75 border border-slate-800/90 rounded-xl p-3">
              <div className="text-[11px] font-bold text-rose-400">Ausências</div>
              <div className="text-xl font-extrabold font-mono-tabular text-white mt-1">
                {metrics.ausentes}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">Faltas turno</div>
              <div className="text-xs font-mono-tabular font-bold text-rose-300 mt-0.5">
                {pctAusentes}% escala
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* =================================================================
          ROW 2 OF BENTO GRID (2 CLEAN COLUMNS WITHOUT SPEEDOMETER):
          (c) PIPELINE DE ALERTAS & REMANEJAMENTOS ("O texto aparece se clicar")
          (d) ENTREGA POR PEÇA / PROCESSO (Horizontal Progress Bars + % Pills)
         ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* (c) Triage Pipeline & Priority Alerts (Click to expand details!) */}
        <section className="lg:col-span-6 rounded-2xl bg-[#111726] border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                (c) PIPELINE DE ALERTAS & PRIORIDADES (CLIQUE P/ VER DETALHES)
              </span>
              <span className="text-[11px] font-mono-tabular text-amber-400 font-bold">
                {triageAlerts.length} situação(ões)
              </span>
            </div>

            {triageAlerts.length === 0 ? (
              <div className="rounded-xl bg-slate-950/60 border border-slate-800 p-6 text-center">
                <CheckCircle2 className="w-6 h-6 text-emerald-400 mx-auto mb-1.5" />
                <p className="text-xs font-semibold text-slate-300">
                  Turno operando sem alertas críticos
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/80">
                {triageAlerts.map((alert) => {
                  const isExpanded = expandedAlertId === alert.id;
                  const badgeStyles = {
                    amber: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
                    indigo: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
                    rose: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
                    emerald: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
                  }[alert.badgeTone];

                  return (
                    <div key={alert.id} className="py-2.5 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedAlertId((prev) => (prev === alert.id ? null : alert.id))
                        }
                        className="w-full text-left flex items-center justify-between gap-2 group py-1 rounded-xl hover:bg-slate-800/40 px-2 -mx-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {alert.title}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border shrink-0 ${badgeStyles}`}
                            >
                              {alert.badge}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-xs mt-0.5">
                            <span className="font-mono-tabular font-bold text-amber-300">
                              {alert.metricPrimary}
                            </span>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-400 truncate">{alert.metricSecondary}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 group-hover:text-white shrink-0">
                          <span>{isExpanded ? 'Ocultar' : 'Motivos'}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              isExpanded ? 'rotate-180 text-cyan-400' : ''
                            }`}
                          />
                        </div>
                      </button>

                      {/* Progressive Disclosure: Full Text Appears Only When Clicked */}
                      {isExpanded && (
                        <div className="mt-2 p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2 animate-in fade-in duration-150">
                          <ul className="space-y-1.5 text-xs text-slate-200 leading-relaxed">
                            {alert.details.map((line, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span className="text-cyan-400 font-bold">•</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>

                          {alert.relatedEmpIds.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/80">
                              <span className="text-[10px] text-slate-400 font-semibold">
                                Abrir ficha:
                              </span>
                              {alert.relatedEmpIds.map((emp, idx) => (
                                <button
                                  key={`${emp.id}-${idx}`}
                                  type="button"
                                  onClick={() => onSelectEmployee(emp.id)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-cyan-300 transition-colors"
                                >
                                  {emp.name} ({emp.piece}) &rarr;
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom Summary Callout Box (Like "28.4 Hrs" box in Image 4) */}
          <div className="mt-4 p-3.5 rounded-xl bg-slate-950/90 border border-slate-800/90 flex items-center justify-between gap-3">
            <div>
              <div className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-amber-400">
                {metrics.totalDelayMins} min
              </div>
              <div className="text-xs font-bold text-white">
                Tempo Acumulado de Paradas no Turno
              </div>
              <div className="text-[11px] text-emerald-400 mt-0.5">
                ✓ Todas as peças prioritárias tiveram cobertura
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>
        </section>

        {/* (d) Piece / Process Demographics (Horizontal Progress Bars + % Pills) */}
        <section className="lg:col-span-6 rounded-2xl bg-[#111726] border border-slate-800/90 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                (d) DESEMPENHO POR PEÇA / PROCESSO
              </span>
              <span className="text-[10px] text-slate-400">Toque na peça p/ ver equipe</span>
            </div>

            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {pieceDemographics.slice(0, 7).map((item) => {
                const isSelected = selectedPieceFilter === item.piece;
                const pillTone =
                  item.rate >= 80
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : item.rate >= 50
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40';

                const barTone =
                  item.rate >= 80
                    ? 'bg-emerald-400'
                    : item.rate >= 50
                    ? 'bg-amber-400'
                    : 'bg-rose-400';

                return (
                  <div key={item.piece}>
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedPieceFilter((prev) => (prev === item.piece ? null : item.piece))
                      }
                      className="w-full text-left group"
                    >
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-bold text-slate-200 group-hover:text-cyan-300 truncate">
                          {item.piece}{' '}
                          <span className="text-[11px] font-normal text-slate-500">
                            ({item.done}/{item.total})
                          </span>
                        </span>
                        <span
                          className={`font-mono-tabular text-[11px] font-extrabold px-2 py-0.5 rounded-full border ${pillTone}`}
                        >
                          {item.rate}%
                        </span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${barTone}`}
                          style={{ width: `${Math.max(8, item.rate)}%` }}
                        />
                      </div>
                    </button>

                    {/* Progressive Disclosure: Welders in this piece appear when clicked */}
                    {isSelected && (
                      <div className="mt-1.5 p-2.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5 animate-in fade-in duration-150">
                        {item.emps.map((e) => (
                          <div
                            key={e.id}
                            onClick={() => onSelectEmployee(e.id)}
                            className="flex items-center justify-between text-xs py-1 px-2 rounded-lg hover:bg-slate-900 cursor-pointer"
                          >
                            <span className="font-semibold text-white">
                              {e.funcionario.split(' ').slice(0, 2).join(' ')}{' '}
                              <span className="text-slate-500 font-mono-tabular">#{e.chapa}</span>
                            </span>
                            <span
                              className={`text-[11px] font-bold ${
                                e.producedState === ProducedState.Sim
                                  ? 'text-emerald-400'
                                  : e.status === AttendanceStatus.Ausente
                                  ? 'text-rose-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              {e.coveringForEmployee
                                ? `Cobriu ${e.coveringForPiece}`
                                : e.status === AttendanceStatus.Ausente
                                ? 'Ausente'
                                : e.producedState === ProducedState.Sim
                                ? '✓ Entregue'
                                : e.operationalStatus}
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

          {/* Mini Multi-Shift Comparison Footer (When >1 shifts exist) */}
          {shiftComparisonData.length > 1 && (
            <div className="mt-4 pt-3 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1.5">
                <span className="font-bold uppercase tracking-wider">Comparativo entre Turnos</span>
                <span>Toque na data no topo p/ alternar</span>
              </div>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={shiftComparisonData}
                    margin={{ top: 2, right: 2, left: -28, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="curto"
                      tick={{ fill: '#94a3b8', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis hide />
                    <Tooltip
                      cursor={false}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '10px',
                        fontSize: '11px',
                      }}
                    />
                    <Bar dataKey="Entregues" fill="#10b981" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Parciais" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="Faltas" fill="#f43f5e" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
