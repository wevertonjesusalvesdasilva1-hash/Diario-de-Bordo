import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ClipboardList,
  DoorOpen,
  Download,
  FileSpreadsheet,
  Flame,
  FolderUp,
  HelpCircle,
  Info,
  MoreVertical,
  PauseCircle,
  Plus,
  RotateCcw,
  Search,
  Trash2,
  UserCheck,
  UserX,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import LoginScreen from './components/LoginScreen';
import { useCloudSync } from './lib/useCloudSync';
import { getRealFactoryDataset, normalizeOvertimeRecord } from './data/realSampleData';
import {
  AbsentPieceAction,
  AttendanceStatus,
  OperationalStatus,
  OvertimeRecord,
  ProducedState,
  ShiftGroup,
} from './types';
import {
  downloadRawInputTemplate,
  exportOvertimeExcel,
  getWeekdayLabel,
  parseOvertimeExcel,
} from './utils/excelProcessor';
import { downloadStandaloneHtmlFile } from './utils/standaloneHtmlGenerator';
import { ConsolidatedShiftsChart } from './components/ConsolidatedShiftsChart';
import { LeaderGuideModal } from './components/LeaderGuideModal';
import { InteractiveShiftTimeline } from './components/InteractiveShiftTimeline';
import { GeneralDayTimeline } from './components/GeneralDayTimeline';
import { ManagerReportsView } from './components/ManagerReportsView';
import { ExecutiveBentoDashboard } from './components/ExecutiveBentoDashboard';
import { LeaderDirectoryModal } from './components/LeaderDirectoryModal';
import {
  loadLeaderOverrides,
  matchesSelectedLeader,
  normalizePersonName,
  OFFICIAL_LEADERS,
  resolveCollaboratorLeader,
  saveLeaderOverride,
} from './data/leaderDatabase';

const STORAGE_KEY = 'horaextra_diario_records_v4';
const STORAGE_DATE_KEY = 'horaextra_selected_date_v4';
const STORAGE_LEADER_KEY = 'horaextra_selected_leader_v1';
const STORAGE_HIDE_GUIDE_KEY = 'horaextra_hide_onboarding_v1';

const QUICK_ABSENCE_REASONS = [
  'Falta injustificada',
  'Atestado médico',
  'Problema de transporte',
  'Desistiu da HE',
  'Folga / Compensação',
];

const QUICK_EARLY_EXIT_REASONS = [
  'Passou mal / Médico',
  'Compromisso particular',
  'Problema familiar',
  'Liberado pela liderança',
  'Problema de transporte',
];

const QUICK_STOP_REASONS = [
  'Ponte rolante ocupada',
  'Aguardando material',
  'Manutenção máquina de solda',
  'Troca de arame / gás',
  'Inspeção de qualidade',
];

const QUICK_TIMELINE_PRESETS = [
  { label: 'Entrou', desc: 'Entrou no posto de trabalho', type: 'entry' as const },
  { label: 'Parou (ponte rolante)', desc: 'Parou (ponte rolante)', type: 'stop' as const },
  { label: 'Parou (material)', desc: 'Parou (aguardando material)', type: 'stop' as const },
  { label: 'Saiu mais cedo', desc: 'Foi embora mais cedo do turno', type: 'early_exit' as const },
  { label: 'Retomou', desc: 'Retomou produção', type: 'resume' as const },
  { label: 'Peça finalizada', desc: 'Peça finalizada', type: 'finish' as const },
];

function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function App() {
  const [records, setRecords] = useState<OvertimeRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map((item, idx) => normalizeOvertimeRecord(item, idx));
        }
      }
    } catch {
      // ignore storage errors
    }
    return getRealFactoryDataset();
  });

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    try {
      const savedDate = localStorage.getItem(STORAGE_DATE_KEY);
      if (savedDate) return savedDate;
    } catch {
      // ignore
    }
    return '03/10/2026';
  });

  // Main Navigation: 'LEADER' (Visão do Líder) | 'MANAGER' (Visão do Gerente) | 'REPORTS' (Aba de Relatórios & Alertas)
  const [activeView, setActiveView] = useState<'LEADER' | 'MANAGER' | 'REPORTS'>('LEADER');

  // Top-left 3-dots menu state + inline reset confirmation
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const [confirmingResetInline, setConfirmingResetInline] = useState<boolean>(false);

  // Filters in Visão do Líder
  const [statusFilter, setStatusFilter] = useState<'ALL' | AttendanceStatus>('ALL');
  const [shiftWindowFilter, setShiftWindowFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Leader filter & database state ("Relação geral de colaboradores por líder")
  const [selectedLeader, setSelectedLeader] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_LEADER_KEY) || 'ALL';
    } catch {
      return 'ALL';
    }
  });
  const [isLeaderDropdownOpen, setIsLeaderDropdownOpen] = useState<boolean>(false);
  const [isLeaderDirectoryOpen, setIsLeaderDirectoryOpen] = useState<boolean>(false);
  const [leaderOverrides, setLeaderOverrides] = useState<Record<string, string>>(() =>
    loadLeaderOverrides()
  );

  // Filter in Visão do Gerente
  const [managerEmployeeFilter, setManagerEmployeeFilter] = useState<string>('ALL');

  // Active Employee Detail Drawer (when tapping a card in Visão do Líder or Gerente)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  // Progressive disclosure in Leader View ("o texto aparece se eu clicar")
  const [expandedLeaderCardId, setExpandedLeaderCardId] = useState<string | null>(null);
  const [expandedManagerJustId, setExpandedManagerJustId] = useState<string | null>(null);

  // Timeline New Event Inputs inside Employee Detail Drawer
  const [newEventTime, setNewEventTime] = useState<string>(getCurrentTimeHHMM);
  const [newEventDesc, setNewEventDesc] = useState<string>('');
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  // Date selector sheet
  const [isDateSheetOpen, setIsDateSheetOpen] = useState<boolean>(false);

  // Onboarding / Help Guide Modal ("Primeiros Passos" + "Não mostrar novamente")
  const [hideGuideOnStartup, setHideGuideOnStartup] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_HIDE_GUIDE_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_HIDE_GUIDE_KEY) !== 'true';
    } catch {
      return true;
    }
  });

  const handleToggleHideGuideOnStartup = (hide: boolean) => {
    setHideGuideOnStartup(hide);
    try {
      localStorage.setItem(STORAGE_HIDE_GUIDE_KEY, hide ? 'true' : 'false');
    } catch {
      // ignore
    }
  };

  // Toast feedback
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const absenceInputRef = useRef<HTMLInputElement | null>(null);

  // Persist records and selectedDate
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // ignore storage quota errors
    }
  }, [records]);

  const cloud = useCloudSync(records, setRecords);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_DATE_KEY, selectedDate);
    } catch {
      // ignore
    }
  }, [selectedDate]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_LEADER_KEY, selectedLeader);
    } catch {
      // ignore
    }
  }, [selectedLeader]);

  const handleUpdateCollaboratorLeader = (chapa: string, nome: string, newLeader: string) => {
    const cleanChapa = (chapa || '').trim().replace(/^0+/, '');
    const normName = normalizePersonName(nome);
    let updatedOverrides = leaderOverrides;
    if (cleanChapa && cleanChapa !== '—') {
      updatedOverrides = saveLeaderOverride(`chapa:${cleanChapa}`, newLeader);
    }
    if (normName) {
      updatedOverrides = saveLeaderOverride(`nome:${normName}`, newLeader);
    }
    setLeaderOverrides(updatedOverrides);

    setRecords((prev) =>
      prev.map((rec) => {
        const recChapa = (rec.chapa || '').trim().replace(/^0+/, '');
        const recNormName = normalizePersonName(rec.funcionario);
        if (
          (cleanChapa && cleanChapa !== '—' && recChapa === cleanChapa) ||
          (normName && recNormName === normName)
        ) {
          return { ...rec, lider: newLeader };
        }
        return rec;
      })
    );
  };

  // Refresh default time when opening an employee drawer
  useEffect(() => {
    if (selectedEmployeeId) {
      setNewEventTime(getCurrentTimeHHMM());
      setNewEventDesc('');
      setDeletingEventId(null);
    }
  }, [selectedEmployeeId]);

  // Group records by shift date (respecting selectedLeader when active)
  const recordsFilteredByLeader = useMemo(() => {
    if (selectedLeader === 'ALL') return records;
    return records.filter((r) => matchesSelectedLeader(r.lider, selectedLeader));
  }, [records, selectedLeader]);

  const shiftGroups = useMemo<ShiftGroup[]>(() => {
    const sourceRecords = recordsFilteredByLeader.length > 0 ? recordsFilteredByLeader : records;
    const map = new Map<string, OvertimeRecord[]>();
    for (const r of sourceRecords) {
      const list = map.get(r.data) || [];
      list.push(r);
      map.set(r.data, list);
    }

    const groups: ShiftGroup[] = [];
    map.forEach((groupRecords, data) => {
      const presentes = groupRecords.filter((r) => r.status === AttendanceStatus.Presente).length;
      const ausentes = groupRecords.filter((r) => r.status === AttendanceStatus.Ausente).length;
      const pendentes = groupRecords.filter((r) => r.status === AttendanceStatus.Pendente).length;
      const locals = Array.from(new Set(groupRecords.map((r) => r.local).filter(Boolean)));
      groups.push({
        data,
        dataSortKey: groupRecords[0]?.dataSortKey || data,
        weekdayLabel: getWeekdayLabel(data),
        total: groupRecords.length,
        presentes,
        ausentes,
        pendentes,
        locals,
      });
    });

    return groups.sort((a, b) => a.dataSortKey.localeCompare(b.dataSortKey));
  }, [records, recordsFilteredByLeader]);

  useEffect(() => {
    if (shiftGroups.length > 0 && !shiftGroups.some((g) => g.data === selectedDate)) {
      setSelectedDate(shiftGroups[0].data);
    }
  }, [shiftGroups, selectedDate]);

  const dateRecords = useMemo(() => {
    return records.filter((r) => r.data === selectedDate);
  }, [records, selectedDate]);

  // Count collaborators per leader on the selected shift date
  const leaderCountsOnDate = useMemo(() => {
    const counts: Record<string, number> = {
      ALL: dateRecords.length,
      'Não identificado': 0,
    };
    OFFICIAL_LEADERS.forEach((l) => {
      counts[l] = 0;
    });

    dateRecords.forEach((r) => {
      const resolved = r.lider || resolveCollaboratorLeader(r.chapa, r.funcionario, leaderOverrides);
      OFFICIAL_LEADERS.forEach((l) => {
        if (matchesSelectedLeader(resolved, l)) {
          counts[l] = (counts[l] || 0) + 1;
        }
      });
      if (matchesSelectedLeader(resolved, 'Não identificado')) {
        counts['Não identificado'] += 1;
      }
    });

    return counts;
  }, [dateRecords, leaderOverrides]);

  const availableShiftWindows = useMemo(() => {
    const set = new Set<string>();
    dateRecords.forEach((r) => {
      if (r.de || r.ate) set.add(`${r.de} – ${r.ate}`);
    });
    return Array.from(set).sort();
  }, [dateRecords]);

  useEffect(() => {
    if (shiftWindowFilter !== 'ALL' && !availableShiftWindows.includes(shiftWindowFilter)) {
      setShiftWindowFilter('ALL');
    }
  }, [availableShiftWindows, shiftWindowFilter]);

  const scopedRecords = useMemo(() => {
    return dateRecords.filter((r) => {
      if (shiftWindowFilter !== 'ALL' && `${r.de} – ${r.ate}` !== shiftWindowFilter) {
        return false;
      }
      const resolvedLeader =
        r.lider || resolveCollaboratorLeader(r.chapa, r.funcionario, leaderOverrides);
      if (!matchesSelectedLeader(resolvedLeader, selectedLeader)) {
        return false;
      }
      return true;
    });
  }, [dateRecords, shiftWindowFilter, selectedLeader, leaderOverrides]);

  // Summary metrics for current shift
  const summaryStats = useMemo(() => {
    let presentes = 0;
    let ausentes = 0;
    let pendentes = 0;
    let soldando = 0;
    let parados = 0;
    let saiuMaisCedo = 0;
    let finalizados = 0;
    let totalPlannedQty = 0;
    let totalActualQty = 0;

    for (const r of scopedRecords) {
      if (r.status === AttendanceStatus.Presente) presentes++;
      else if (r.status === AttendanceStatus.Ausente) ausentes++;
      else pendentes++;

      if (r.operationalStatus === OperationalStatus.Soldando) soldando++;
      if (r.operationalStatus === OperationalStatus.SaiuMaisCedo) saiuMaisCedo++;
      if (
        r.operationalStatus === OperationalStatus.Parado ||
        r.absentPieceAction === AbsentPieceAction.ProcessoParado
      ) {
        parados++;
      }
      if (
        r.operationalStatus === OperationalStatus.Finalizou ||
        r.producedState === ProducedState.Sim
      ) {
        finalizados++;
      }

      totalPlannedQty += r.qtyPlanned || 1;
      totalActualQty += r.qtyActual || 0;
    }

    const productionPct =
      totalPlannedQty > 0 ? Math.round((totalActualQty / totalPlannedQty) * 100) : 0;

    return {
      total: scopedRecords.length,
      presentes,
      ausentes,
      pendentes,
      soldando,
      parados,
      saiuMaisCedo,
      finalizados,
      totalPlannedQty,
      totalActualQty,
      productionPct,
    };
  }, [scopedRecords]);

  // Visible records in Leader View
  const leaderVisibleRecords = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return scopedRecords.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.funcionario.toLowerCase().includes(q) ||
        r.chapa.toLowerCase().includes(q) ||
        r.motivoHe.toLowerCase().includes(q) ||
        r.cc.toLowerCase().includes(q) ||
        (r.lider || '').toLowerCase().includes(q) ||
        r.operationalStatus.toLowerCase().includes(q)
      );
    });
  }, [scopedRecords, statusFilter, searchQuery]);

  // Currently opened employee in detail drawer
  const activeEmployee = useMemo(() => {
    if (!selectedEmployeeId) return null;
    return records.find((r) => r.id === selectedEmployeeId) || null;
  }, [records, selectedEmployeeId]);

  // Helper to update a single employee record
  const updateEmployee = (id: string, updater: (prev: OvertimeRecord) => OvertimeRecord) => {
    setRecords((prev) => prev.map((item) => (item.id === id ? updater(item) : item)));
  };

  // Quick 1-tap presence button on the left of the card
  const handleQuickPresenceTap = (e: React.MouseEvent, emp: OvertimeRecord) => {
    e.stopPropagation();

    if (emp.status === AttendanceStatus.Pendente) {
      // Mark Presente & Soldando + log entry if timeline is empty
      const entryTime = emp.de || getCurrentTimeHHMM();
      updateEmployee(emp.id, (prev) => ({
        ...prev,
        status: AttendanceStatus.Presente,
        operationalStatus:
          prev.operationalStatus === OperationalStatus.Aguardando ||
          prev.operationalStatus === OperationalStatus.Ausente
            ? OperationalStatus.Soldando
            : prev.operationalStatus,
        timeline:
          prev.timeline.length === 0
            ? [
                {
                  id: `ev-${Date.now()}`,
                  time: entryTime,
                  description: 'Entrou',
                  type: 'entry',
                },
              ]
            : prev.timeline,
      }));
    } else if (emp.status === AttendanceStatus.Presente) {
      // Mark Ausente and open detail panel so leader can enter mandatory absence reason & piece reallocation
      updateEmployee(emp.id, (prev) => ({
        ...prev,
        status: AttendanceStatus.Ausente,
        operationalStatus: OperationalStatus.Ausente,
        producedState: ProducedState.Nao,
        qtyActual: 0,
      }));
      setSelectedEmployeeId(emp.id);
      setTimeout(() => absenceInputRef.current?.focus(), 60);
    } else {
      // Back to Pendente
      updateEmployee(emp.id, (prev) => ({
        ...prev,
        status: AttendanceStatus.Pendente,
        operationalStatus: OperationalStatus.Aguardando,
      }));
    }
  };

  // Set Presence inside the Detail Drawer
  const handleSetPresenceInDrawer = (emp: OvertimeRecord, newStatus: AttendanceStatus) => {
    if (newStatus === AttendanceStatus.Presente) {
      const entryTime = emp.de || getCurrentTimeHHMM();
      updateEmployee(emp.id, (prev) => ({
        ...prev,
        status: AttendanceStatus.Presente,
        operationalStatus:
          prev.operationalStatus === OperationalStatus.Ausente ||
          prev.operationalStatus === OperationalStatus.Aguardando
            ? OperationalStatus.Soldando
            : prev.operationalStatus,
        absentPieceAction: AbsentPieceAction.Nenhum,
        reallocatedToWelder: '',
        timeline:
          prev.timeline.length === 0
            ? [
                {
                  id: `ev-${Date.now()}`,
                  time: entryTime,
                  description: 'Entrou',
                  type: 'entry',
                },
              ]
            : prev.timeline,
      }));
    } else if (newStatus === AttendanceStatus.Ausente) {
      updateEmployee(emp.id, (prev) => ({
        ...prev,
        status: AttendanceStatus.Ausente,
        operationalStatus: OperationalStatus.Ausente,
        producedState: ProducedState.Nao,
        qtyActual: 0,
      }));
      setTimeout(() => absenceInputRef.current?.focus(), 60);
    }
  };

  // Handle Absent Piece Interlinking Rule:
  // "Quando um colaborador é marcado como Ausente, a peça dele continua aparecendo.
  // O líder tem as opções: Alocar outro soldador | Processo parado | Não realizar a peça
  // Se escolher 'Alocar outro soldador', o sistema gera automaticamente a justificativa:
  // 'Peça realocada porque o soldador original estava ausente'"
  const handleSelectAbsentPieceAction = (emp: OvertimeRecord, action: AbsentPieceAction) => {
    const timeNow = emp.horaSaidaReal || getCurrentTimeHHMM();
    const isEarlyExit = emp.operationalStatus === OperationalStatus.SaiuMaisCedo;
    const reasonSuffix = isEarlyExit
      ? `saiu mais cedo (${emp.horaSaidaReal || timeNow})`
      : 'estava ausente';

    let autoJustification = emp.productionJustification;
    let timelineAdditionDesc = '';

    if (action === AbsentPieceAction.AlocarOutro) {
      autoJustification = `Peça realocada porque o soldador original ${reasonSuffix}`;
      timelineAdditionDesc = `Peça (${emp.motivoHe}) realocada porque o soldador original ${reasonSuffix}`;
    } else if (action === AbsentPieceAction.ProcessoParado) {
      autoJustification = `Processo parado porque o soldador titular ${reasonSuffix}`;
      timelineAdditionDesc = `Processo parado na peça (${emp.motivoHe}) (${reasonSuffix})`;
    } else if (action === AbsentPieceAction.NaoRealizar) {
      autoJustification = `Peça não realizada porque o soldador titular ${reasonSuffix}`;
      timelineAdditionDesc = `Peça (${emp.motivoHe}) não será realizada no turno`;
    }

    updateEmployee(emp.id, (prev) => {
      const filteredTimeline = prev.timeline.filter((ev) => ev.type !== 'reallocation');
      const nextTimeline = timelineAdditionDesc
        ? [
            ...filteredTimeline,
            {
              id: `ev-${Date.now()}`,
              time: timeNow,
              description: timelineAdditionDesc,
              type: 'reallocation' as const,
            },
          ].sort((a, b) => a.time.localeCompare(b.time))
        : filteredTimeline;

      return {
        ...prev,
        absentPieceAction: action,
        productionJustification: autoJustification,
        timeline: nextTimeline,
      };
    });
  };

  // Handle Early Departure (e.g. Airton arrived at 06:00 and had to leave at 10:00)
  const handleRegisterEarlyExit = (
    emp: OvertimeRecord,
    exitTime: string,
    exitReason: string,
    entryTimeOverride?: string
  ) => {
    const entryTime = entryTimeOverride || emp.horaEntradaReal || emp.de || '06:00';
    const cleanExitTime = exitTime || getCurrentTimeHHMM();
    const cleanReason = exitReason.trim() || 'Precisou sair antes do término do turno';

    updateEmployee(emp.id, (prev) => {
      // Ensure entry event + early_exit event are in timeline
      const hasEntry = prev.timeline.some((ev) => ev.type === 'entry');
      const withoutOldEarlyExit = prev.timeline.filter((ev) => ev.type !== 'early_exit');

      const nextTimeline = [
        ...(hasEntry
          ? withoutOldEarlyExit
          : [
              {
                id: `ev-entry-${Date.now()}`,
                time: entryTime,
                description: 'Entrou no posto de trabalho',
                type: 'entry' as const,
              },
              ...withoutOldEarlyExit,
            ]),
        {
          id: `ev-exit-${Date.now()}`,
          time: cleanExitTime,
          description: `Foi embora mais cedo (trabalhou das ${entryTime} às ${cleanExitTime}) — Motivo: ${cleanReason}`,
          type: 'early_exit' as const,
        },
      ].sort((a, b) => a.time.localeCompare(b.time));

      return {
        ...prev,
        status: AttendanceStatus.Presente,
        operationalStatus: OperationalStatus.SaiuMaisCedo,
        horaEntradaReal: entryTime,
        horaSaidaReal: cleanExitTime,
        motivoSaidaAntecipada: exitReason,
        producedState:
          prev.producedState === ProducedState.NaoIniciado
            ? ProducedState.Parcial
            : prev.producedState,
        productionJustification:
          prev.productionJustification ||
          `Colaborador trabalhou das ${entryTime} às ${cleanExitTime} (${cleanReason})`,
        timeline: nextTimeline,
      };
    });
  };

  // Two-Way Priority Reallocation Handler:
  // When employee A (e.g. Airton, piece "Tw trave") leaves early at 10:00 or is absent,
  // and employee B (e.g. Ademir, piece "Saw mesa") is reallocated to cover Airton's priority piece:
  // 1) Airton's record is updated with the replacement welder & piece delivery status.
  // 2) Ademir's record is automatically updated at 10:00 showing he left his own piece ("Saw mesa")
  //    to weld Airton's priority piece ("Tw trave"), and that Ademir's own piece ("Saw mesa") was
  //    delayed / not delivered due to Airton's early exit.
  const handleAssignReplacementWelder = (
    sourceEmp: OvertimeRecord,
    targetWelderValue: string,
    deliveredPriorityPiece = true
  ) => {
    const handoverTime = sourceEmp.horaSaidaReal || sourceEmp.de || '10:00';
    const isEarlyExit = sourceEmp.operationalStatus === OperationalStatus.SaiuMaisCedo;
    const exitOrAbsenceReason = isEarlyExit
      ? sourceEmp.motivoSaidaAntecipada || 'motivos particulares'
      : sourceEmp.motivoFalta || 'ausência no turno';

    setRecords((prevRecords) => {
      // Find the target welder on the same shift date
      const targetEmp = prevRecords.find(
        (r) =>
          r.data === sourceEmp.data &&
          r.id !== sourceEmp.id &&
          (`${r.funcionario} (#${r.chapa})` === targetWelderValue ||
            targetWelderValue.includes(`#${r.chapa}`) ||
            r.funcionario.toUpperCase() === targetWelderValue.trim().toUpperCase())
      );

      const targetLabel = targetEmp
        ? `${targetEmp.funcionario} (#${targetEmp.chapa})`
        : targetWelderValue;
      const targetFirstName = targetEmp
        ? targetEmp.funcionario.split(' ')[0]
        : targetWelderValue.split(' ')[0];
      const sourceFirstName = sourceEmp.funcionario.split(' ')[0];
      const targetOriginalPiece = targetEmp ? targetEmp.motivoHe : 'sua peça original';

      return prevRecords.map((item) => {
        // 1. Update Source Employee (e.g. Airton)
        if (item.id === sourceEmp.id) {
          const filteredTimeline = item.timeline.filter(
            (ev) =>
              ev.type !== 'reallocation' &&
              !(ev.type === 'finish' && ev.description.includes('entregue por'))
          );

          const nextTimeline = [
            ...filteredTimeline,
            {
              id: `ev-realloc-${Date.now()}`,
              time: handoverTime,
              description: `Remanejamento de prioridade: ${targetLabel} saiu da peça "${targetOriginalPiece}" às ${handoverTime} para assumir e concluir "${item.motivoHe}"`,
              type: 'reallocation' as const,
            },
            ...(deliveredPriorityPiece
              ? [
                  {
                    id: `ev-fin-sub-${Date.now() + 1}`,
                    time: item.ate || '12:00',
                    description: `Peça prioritária (${item.motivoHe}) concluída e entregue por ${targetLabel}`,
                    type: 'finish' as const,
                  },
                ]
              : []),
          ].sort((a, b) => a.time.localeCompare(b.time));

          return {
            ...item,
            absentPieceAction: AbsentPieceAction.AlocarOutro,
            reallocatedToWelder: targetLabel,
            reallocatedToChapa: targetEmp?.chapa || '',
            reallocatedAtTime: handoverTime,
            producedState: deliveredPriorityPiece ? ProducedState.Sim : ProducedState.Parcial,
            qtyActual: deliveredPriorityPiece ? item.qtyPlanned || 1 : 0,
            productionJustification: isEarlyExit
              ? `${sourceFirstName} saiu mais cedo às ${handoverTime} (${exitOrAbsenceReason}). ${targetLabel} deixou sua peça (${targetOriginalPiece}) às ${handoverTime} por prioridade e entregou a peça (${item.motivoHe}) de ${sourceFirstName}.`
              : `${sourceFirstName} faltou (${exitOrAbsenceReason}). ${targetLabel} deixou sua peça (${targetOriginalPiece}) por prioridade e entregou a peça (${item.motivoHe}) de ${sourceFirstName}.`,
            timeline: nextTimeline,
          };
        }

        // 2. Clean up any previous substitute welder on this shift who was covering for sourceEmp
        if (
          item.data === sourceEmp.data &&
          item.coveringForChapa === sourceEmp.chapa &&
          (!targetEmp || item.id !== targetEmp.id)
        ) {
          return {
            ...item,
            coveringForEmployee: '',
            coveringForChapa: '',
            coveringForPiece: '',
            coveringSinceTime: '',
            coveringReason: '',
            timeline: item.timeline.filter(
              (ev) => !ev.description.includes(sourceEmp.funcionario)
            ),
          };
        }

        // 3. Automatically update Target Substitute Welder (e.g. Ademir)
        if (targetEmp && item.id === targetEmp.id) {
          const cleanTimeline = item.timeline.filter(
            (ev) =>
              ev.type !== 'reallocation' &&
              !ev.description.includes('Remanejado por prioridade') &&
              !ev.description.includes('Entregou a peça prioritária')
          );

          const hasEntry = cleanTimeline.some((ev) => ev.type === 'entry');
          const baseTimeline = hasEntry
            ? cleanTimeline
            : [
                {
                  id: `ev-entry-${Date.now()}`,
                  time: item.de || '06:00',
                  description: `Entrou no posto de trabalho (iniciou peça ${item.motivoHe})`,
                  type: 'entry' as const,
                },
                ...cleanTimeline,
              ];

          const subTimeline = [
            ...baseTimeline,
            {
              id: `ev-sub-leave-${Date.now() + 2}`,
              time: handoverTime,
              description: `Saiu da peça "${item.motivoHe}" às ${handoverTime} — Remanejado por prioridade para soldar a peça "${sourceEmp.motivoHe}" porque ${sourceEmp.funcionario} ${
                isEarlyExit ? `foi embora às ${handoverTime}` : 'faltou'
              } (${exitOrAbsenceReason})`,
              type: 'reallocation' as const,
            },
            {
              id: `ev-sub-deliver-${Date.now() + 3}`,
              time: item.ate || '12:00',
              description: `Entregou a peça prioritária "${sourceEmp.motivoHe}" (de ${sourceEmp.funcionario}). A peça que ${targetFirstName} iria entregar ("${item.motivoHe}") não entregou devido ao remanejamento.`,
              type: 'finish' as const,
            },
          ].sort((a, b) => a.time.localeCompare(b.time));

          return {
            ...item,
            status: AttendanceStatus.Presente,
            operationalStatus: OperationalStatus.Finalizou,
            horaEntradaReal: item.horaEntradaReal || item.de || '06:00',
            producedState: ProducedState.Nao,
            qtyActual: 0,
            delayMinutes: Math.max(item.delayMinutes || 0, 120),
            coveringForEmployee: `${sourceEmp.funcionario} (#${sourceEmp.chapa})`,
            coveringForChapa: sourceEmp.chapa,
            coveringForPiece: sourceEmp.motivoHe,
            coveringSinceTime: handoverTime,
            coveringReason: exitOrAbsenceReason,
            coveredPieceDelivered: deliveredPriorityPiece,
            productionJustification: `${targetFirstName} acabou atrasando e não entregou sua peça (${item.motivoHe}) devido à ${
              isEarlyExit ? `ausência mais cedo de ${sourceEmp.funcionario} às ${handoverTime}` : `falta de ${sourceEmp.funcionario}`
            } por ${exitOrAbsenceReason}. ${targetFirstName} saiu desta peça às ${handoverTime} e entregou a peça prioritária (${sourceEmp.motivoHe}) do outro colaborador.`,
            timeline: subTimeline,
          };
        }

        return item;
      });
    });

    setFeedback({
      type: 'success',
      message: `Remanejamento registrado: ${targetWelderValue} saiu da própria peça às ${handoverTime} para assumir e entregar "${sourceEmp.motivoHe}".`,
    });
    setTimeout(() => setFeedback(null), 5000);
  };

  // Interactive Demo from Help Guide: "Airton arrived at 06:00 and left at 10:00"
  const handleTryAirtonExample = () => {
    // Prefer 03/10/2026 (shift 06:00-12:00) or fallback to any Airton in dataset
    const airton03 = records.find(
      (r) => r.data === '03/10/2026' && r.funcionario.toUpperCase().includes('AIRTON')
    );
    const targetAirton =
      airton03 ||
      records.find((r) => r.funcionario.toUpperCase().includes('AIRTON')) ||
      records[0];

    if (!targetAirton) return;

    setActiveView('LEADER');
    setSelectedDate(targetAirton.data);
    setStatusFilter('ALL');
    setShiftWindowFilter('ALL');
    setSearchQuery('');
    setIsGuideOpen(false);

    handleRegisterEarlyExit(
      targetAirton,
      '10:00',
      'Compromisso particular',
      '06:00'
    );
    handleAssignReplacementWelder(
      {
        ...targetAirton,
        operationalStatus: OperationalStatus.SaiuMaisCedo,
        horaEntradaReal: '06:00',
        horaSaidaReal: '10:00',
        motivoSaidaAntecipada: 'Compromisso particular',
      },
      'ADEMIR DA SILVA NEVES (#11418)',
      true
    );

    setSelectedEmployeeId(targetAirton.id);
    setFeedback({
      type: 'success',
      message: `Simulado carregado: Airton saiu às 10:00 e Ademir (#11418) deixou sua peça (Saw mesa) às 10:00 para entregar a peça prioritária (Tw trave)!`,
    });
    setTimeout(() => setFeedback(null), 6000);
  };

  // Add event to employee timeline
  const handleAddTimelineEvent = (
    emp: OvertimeRecord,
    customDesc?: string,
    customType?: 'entry' | 'stop' | 'resume' | 'finish' | 'early_exit' | 'note'
  ) => {
    const descToUse = (customDesc ?? newEventDesc).trim();
    if (!descToUse) return;
    const timeToUse = newEventTime || getCurrentTimeHHMM();

    updateEmployee(emp.id, (prev) => {
      const updatedTimeline = [
        ...prev.timeline,
        {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          time: timeToUse,
          description: descToUse,
          type: customType || 'note',
        },
      ].sort((a, b) => a.time.localeCompare(b.time));

      // Also sync operationalStatus if preset indicates stop / resume / finish
      let nextOpStatus = prev.operationalStatus;
      let nextMotivoParada = prev.motivoParadaAtual;
      let nextProducedState = prev.producedState;
      let nextQtyActual = prev.qtyActual;

      if (customType === 'stop' || descToUse.toLowerCase().startsWith('parou')) {
        nextOpStatus = OperationalStatus.Parado;
        nextMotivoParada = descToUse;
      } else if (
        customType === 'early_exit' ||
        descToUse.toLowerCase().includes('embora mais cedo') ||
        descToUse.toLowerCase().includes('saiu mais cedo')
      ) {
        nextOpStatus = OperationalStatus.SaiuMaisCedo;
        if (nextProducedState === ProducedState.NaoIniciado) {
          nextProducedState = ProducedState.Parcial;
        }
      } else if (customType === 'resume' || descToUse.toLowerCase().startsWith('retomou')) {
        nextOpStatus = OperationalStatus.Soldando;
        nextMotivoParada = '';
      } else if (
        customType === 'finish' ||
        descToUse.toLowerCase().includes('peça finalizada')
      ) {
        nextOpStatus = OperationalStatus.Finalizou;
        nextProducedState = ProducedState.Sim;
        nextQtyActual = prev.qtyPlanned || 1;
        nextMotivoParada = '';
      } else if (customType === 'entry' && prev.status === AttendanceStatus.Pendente) {
        nextOpStatus = OperationalStatus.Soldando;
      }

      return {
        ...prev,
        status:
          prev.status === AttendanceStatus.Pendente && customType === 'entry'
            ? AttendanceStatus.Presente
            : prev.status,
        operationalStatus: nextOpStatus,
        motivoParadaAtual: nextMotivoParada,
        producedState: nextProducedState,
        qtyActual: nextQtyActual,
        timeline: updatedTimeline,
      };
    });

    if (!customDesc) {
      setNewEventDesc('');
    }
  };

  const handleRemoveTimelineEvent = (empId: string, eventId: string) => {
    updateEmployee(empId, (prev) => ({
      ...prev,
      timeline: prev.timeline.filter((ev) => ev.id !== eventId),
    }));
    setDeletingEventId(null);
  };

  // Excel upload handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsMenuOpen(false);

    try {
      const parsed = await parseOvertimeExcel(file);
      setRecords(parsed);
      const uniqueDates = Array.from(new Set(parsed.map((r) => r.data)));
      if (uniqueDates.length > 0) {
        setSelectedDate(uniqueDates[0]);
      }
      const matchedLeadersCount = parsed.filter(
        (r) => r.lider && r.lider !== 'Não identificado'
      ).length;
      setStatusFilter('ALL');
      setShiftWindowFilter('ALL');
      setSearchQuery('');
      setFeedback({
        type: 'success',
        message: `Planilha importada: ${parsed.length} colaboradores (${matchedLeadersCount} vinculados automaticamente aos Líderes pela Base de Dados).`,
      });
      if (uniqueDates.length > 1) {
        setIsDateSheetOpen(true);
      }
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar planilha Excel.';
      setFeedback({ type: 'error', message: msg });
      setTimeout(() => setFeedback(null), 5000);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Reset current shift inline handler (no window.confirm)
  const handleConfirmResetShift = () => {
    setRecords((prev) =>
      prev.map((r, idx) =>
        r.data === selectedDate
          ? normalizeOvertimeRecord(
              {
                id: r.id,
                data: r.data,
                dataSortKey: r.dataSortKey,
                chapa: r.chapa,
                funcionario: r.funcionario,
                motivoHe: r.motivoHe,
                cc: r.cc,
                local: r.local,
                gestor: r.gestor,
                de: r.de,
                ate: r.ate,
                transporte: r.transporte,
                refeicao: r.refeicao,
                solicitacao: r.solicitacao,
                aprovacao: r.aprovacao,
                dataApv: r.dataApv,
              },
              idx
            )
          : r
      )
    );
    setConfirmingResetInline(false);
    setIsMenuOpen(false);
    setFeedback({
      type: 'success',
      message: `Apontamentos do turno ${selectedDate} foram reiniciados.`,
    });
    setTimeout(() => setFeedback(null), 3500);
  };

  const handleReloadWeekendSimulation = () => {
    const freshData = getRealFactoryDataset();
    setRecords(freshData);
    setSelectedDate('03/10/2026');
    setIsMenuOpen(false);
    setFeedback({
      type: 'success',
      message:
        'Dados de simulação de fim de semana recarregados (4 paradas por ponte rolante, faltas e saídas antecipadas).',
    });
    setTimeout(() => setFeedback(null), 4500);
  };

  // Manager View Computed Data (Real-Time)
  const managerScopedRecords = useMemo(() => {
    if (managerEmployeeFilter === 'ALL') return scopedRecords;
    return scopedRecords.filter((r) => r.id === managerEmployeeFilter);
  }, [scopedRecords, managerEmployeeFilter]);

  const managerStoppedNow = useMemo(() => {
    return managerScopedRecords.filter(
      (r) =>
        r.operationalStatus === OperationalStatus.Parado ||
        r.absentPieceAction === AbsentPieceAction.ProcessoParado
    );
  }, [managerScopedRecords]);

  const managerJustifications = useMemo(() => {
    return managerScopedRecords.filter(
      (r) =>
        r.status === AttendanceStatus.Ausente ||
        r.operationalStatus === OperationalStatus.SaiuMaisCedo ||
        r.delayMinutes > 0 ||
        Boolean(r.productionJustification.trim()) ||
        Boolean(r.absentPieceAction)
    );
  }, [managerScopedRecords]);

  const managerGlobalTimeline = useMemo(() => {
    const events: Array<{
      id: string;
      time: string;
      empId: string;
      funcionario: string;
      chapa: string;
      peca: string;
      cc: string;
      description: string;
      type?: string;
    }> = [];

    managerScopedRecords.forEach((r) => {
      r.timeline.forEach((ev) => {
        events.push({
          id: `${r.id}-${ev.id}`,
          time: ev.time,
          empId: r.id,
          funcionario: r.funcionario,
          chapa: r.chapa,
          peca: r.motivoHe,
          cc: r.cc,
          description: ev.description,
          type: ev.type,
        });
      });
    });

    return events.sort((a, b) => a.time.localeCompare(b.time));
  }, [managerScopedRecords]);

  // Count total alerts in current shift (stops + absences + early exits) for badge
  const shiftAlertCount = useMemo(() => {
    let stopEventsCount = 0;
    dateRecords.forEach((r) => {
      r.timeline.forEach((ev) => {
        if (ev.type === 'stop' || ev.description.toLowerCase().startsWith('parou')) {
          stopEventsCount++;
        }
      });
    });
    return stopEventsCount + summaryStats.ausentes + summaryStats.saiuMaisCedo;
  }, [dateRecords, summaryStats]);

  // Other present welders on the same shift for quick reallocation picker
  const otherAvailableWelders = useMemo(() => {
    if (!activeEmployee) return [];
    return dateRecords.filter(
      (r) => r.id !== activeEmployee.id && r.status !== AttendanceStatus.Ausente
    );
  }, [dateRecords, activeEmployee]);

  const currentShiftGroup = shiftGroups.find((g) => g.data === selectedDate);

  if (cloud.needsLogin) return <LoginScreen />;

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col">
      {cloud.state !== 'local' && (
        <div className="fixed bottom-2 right-2 z-50 rounded-full bg-slate-900/90 border border-slate-700 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
          {{ 'signed-out': '● sem login', syncing: '● sincronizando', online: '● online', offline: '● offline (fila local)', error: '● erro de sync', local: '' }[cloud.state]}
        </div>
      )}
      {/* Hidden File Input for Excel Upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Top Sticky App Bar */}
      <header className="sticky top-0 z-30 bg-[#0B0F19]/92 backdrop-blur-xl border-b border-slate-800/90 pt-safe px-3 sm:px-6 pb-2.5">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2">
            {/* Left Zone: 3-Dots Menu + Brand + View Indicator */}
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen((prev) => !prev);
                  setConfirmingResetInline(false);
                }}
                aria-label="Abrir menu de navegação e ações"
                className="w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 active:scale-95 flex items-center justify-center text-slate-200 transition-all shrink-0"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base sm:text-lg font-bold tracking-tight text-white">
                    HoraExtra
                  </span>
                  <span className="text-emerald-400 font-bold" aria-hidden="true">
                    ·
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveView(
                        activeView === 'LEADER'
                          ? 'MANAGER'
                          : activeView === 'MANAGER'
                          ? 'REPORTS'
                          : 'LEADER'
                      )
                    }
                    className="text-xs sm:text-sm font-semibold text-slate-300 hover:text-white underline decoration-slate-600 underline-offset-4 truncate"
                  >
                    {activeView === 'LEADER'
                      ? 'Visão do Líder'
                      : activeView === 'MANAGER'
                      ? 'Visão do Gerente'
                      : 'Aba de Relatórios'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 truncate">
                  {activeView === 'LEADER'
                    ? 'Diário de bordo por colaborador'
                    : activeView === 'MANAGER'
                    ? 'Acompanhamento e linha do tempo do dia'
                    : 'Cards de alerta, gargalos e gráficos'}
                </p>
              </div>
            </div>

            {/* Right Zone: Help (?) Button + Quick View Switcher + Shift Date Picker */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsGuideOpen(true)}
                aria-label="Como usar o aplicativo e tirar dúvidas"
                title="Guia Rápido: Como usar e tirar dúvidas"
                className="min-h-[44px] px-2.5 sm:px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-950/40 hover:bg-amber-950/70 active:scale-95 text-amber-300 text-xs font-bold flex items-center gap-1.5 transition-all shrink-0"
              >
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="hidden md:inline">Como usar</span>
              </button>

              <div className="hidden sm:flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveView('LEADER')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeView === 'LEADER'
                      ? 'bg-emerald-500 text-slate-950 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Líder
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('MANAGER')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                    activeView === 'MANAGER'
                      ? 'bg-emerald-500 text-slate-950 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Gerente
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('REPORTS')}
                  className={`min-h-[34px] px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                    activeView === 'REPORTS'
                      ? 'bg-amber-500 text-slate-950 shadow-xs'
                      : 'text-amber-300 hover:text-amber-200'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5 shrink-0" />
                  <span>Relatórios ({shiftAlertCount})</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsDateSheetOpen(true)}
                className="min-h-[44px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 active:scale-[0.98] text-slate-100 text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap"
              >
                <span className="font-mono-tabular">
                  {currentShiftGroup?.weekdayLabel
                    ? `${currentShiftGroup.weekdayLabel} · ${selectedDate}`
                    : selectedDate}
                </span>
                <ChevronDown className="w-4 h-4 text-emerald-400 shrink-0" />
              </button>
            </div>
          </div>

          {/* Mobile 3-Tab Bar (visible on small screens so Leader / Manager / Reports are 1 tap away) */}
          <div className="grid grid-cols-3 gap-1.5 mt-2 sm:hidden bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveView('LEADER')}
              className={`min-h-[36px] px-2 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeView === 'LEADER'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              1. Líder
            </button>
            <button
              type="button"
              onClick={() => setActiveView('MANAGER')}
              className={`min-h-[36px] px-2 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
                activeView === 'MANAGER'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              2. Gerente
            </button>
            <button
              type="button"
              onClick={() => setActiveView('REPORTS')}
              className={`min-h-[36px] px-2 py-1 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all whitespace-nowrap ${
                activeView === 'REPORTS'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-amber-300 hover:text-amber-200'
              }`}
            >
              <span>3. Relatórios ({shiftAlertCount})</span>
            </button>
          </div>
        </div>
      </header>

      {/* Top-Left 3-Dots Dropdown Menu */}
      {isMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] overflow-y-auto"
          onClick={() => {
            setIsMenuOpen(false);
            setConfirmingResetInline(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="fixed left-3 sm:left-6 top-[60px] w-[min(20rem,calc(100vw-1.5rem))] max-h-[calc(100dvh-4.5rem)] overflow-y-auto overscroll-contain touch-pan-y bg-slate-900 rounded-2xl border border-slate-700/90 shadow-2xl p-2 pb-4 z-50 text-slate-100"
          >
            <div className="flex items-center justify-between px-3 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Alternar Visão Principal
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsMenuOpen(false);
                  setConfirmingResetInline(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Fechar menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveView('LEADER');
                setIsMenuOpen(false);
              }}
              className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-bold flex items-center justify-between transition-colors ${
                activeView === 'LEADER'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ClipboardList className="w-4 h-4 shrink-0" />
                <span>1. Visão do Líder</span>
              </span>
              {activeView === 'LEADER' && <Check className="w-4 h-4 stroke-[2.5]" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('MANAGER');
                setIsMenuOpen(false);
              }}
              className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-bold flex items-center justify-between mt-1 transition-colors ${
                activeView === 'MANAGER'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 shrink-0" />
                <span>2. Visão do Gerente (Tempo Real)</span>
              </span>
              {activeView === 'MANAGER' && <Check className="w-4 h-4 stroke-[2.5]" />}
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView('REPORTS');
                setIsMenuOpen(false);
              }}
              className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-bold flex items-center justify-between mt-1 transition-colors ${
                activeView === 'REPORTS'
                  ? 'bg-amber-500 text-slate-950'
                  : 'text-amber-300 hover:bg-slate-800'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Flame className="w-4 h-4 shrink-0" />
                <span>3. Aba de Relatórios & Alertas</span>
              </span>
              {activeView === 'REPORTS' && <Check className="w-4 h-4 stroke-[2.5]" />}
            </button>

            <div className="border-t border-slate-800 my-2" />

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsLeaderDirectoryOpen(true);
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-bold text-cyan-300 bg-cyan-950/40 hover:bg-cyan-950/70 border border-cyan-500/35 flex items-center justify-between transition-colors mb-2"
            >
              <span className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Base de Colaboradores por Líder</span>
              </span>
              <span className="text-[11px] font-semibold text-cyan-400">Equipes</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsMenuOpen(false);
                setIsGuideOpen(true);
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-bold text-amber-300 bg-amber-950/40 hover:bg-amber-950/70 border border-amber-500/35 flex items-center justify-between transition-colors mb-2"
            >
              <span className="flex items-center gap-2.5">
                <HelpCircle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Guia Rápido: Como Usar (?)</span>
              </span>
              <span className="text-[11px] font-semibold text-amber-400">Exemplos</span>
            </button>

            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Planilha Excel e Exportação
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <FolderUp className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Importar Excel (.xlsx)</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                exportOvertimeExcel(records, selectedDate);
                setIsMenuOpen(false);
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Exportar Turno ({selectedDate})</span>
              </span>
              <span className="font-mono-tabular text-xs text-slate-400">.xlsx</span>
            </button>

            {shiftGroups.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  exportOvertimeExcel(records, 'ALL');
                  setIsMenuOpen(false);
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-sm font-medium text-slate-200 hover:bg-slate-800 flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2.5">
                  <Download className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>Exportar Todos os Turnos</span>
                </span>
                <span className="font-mono-tabular text-xs text-slate-400">
                  {records.length} reg.
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                downloadRawInputTemplate(getRealFactoryDataset());
                setIsMenuOpen(false);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 flex items-center justify-between transition-colors"
            >
              <span>Baixar Planilha Exemplo Suzano (.xlsx)</span>
              <span className="font-mono-tabular text-slate-500">105 linhas</span>
            </button>

            <button
              type="button"
              onClick={() => {
                downloadStandaloneHtmlFile();
                setIsMenuOpen(false);
              }}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl text-left text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-slate-200 flex items-center justify-between transition-colors"
            >
              <span>Baixar Arquivo Único HTML</span>
              <span className="font-mono-tabular text-slate-500">HoraExtra.html</span>
            </button>

            <div className="border-t border-slate-800 my-2" />

            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Ações de Simulação e Limpeza
            </div>

            <button
              type="button"
              onClick={() => {
                handleReloadWeekendSimulation();
                setIsMenuOpen(false);
              }}
              className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-xs font-semibold text-emerald-300 hover:bg-emerald-950/50 flex items-center gap-2 transition-colors mb-1"
            >
              <RotateCcw className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Recarregar Simulação Realista (Sáb/Dom)</span>
            </button>

            {/* Inline Reset Confirmation (No window.confirm!) */}
            {!confirmingResetInline ? (
              <button
                type="button"
                onClick={() => setConfirmingResetInline(true)}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl text-left text-xs font-semibold text-rose-400 hover:bg-rose-950/50 flex items-center gap-2 transition-colors"
              >
                <RotateCcw className="w-4 h-4 shrink-0" />
                <span>Zerar apontamentos do turno ({selectedDate})</span>
              </button>
            ) : (
              <div className="p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/40">
                <p className="text-xs font-semibold text-rose-200 mb-2">
                  Confirmar limpeza dos apontamentos de {selectedDate}?
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmResetShift}
                    className="flex-1 min-h-[40px] rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                  >
                    Sim, zerar turno
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingResetInline(false)}
                    className="flex-1 min-h-[40px] rounded-lg bg-slate-900 border border-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-6 pt-3 pb-safe">
        {/* Feedback Banner */}
        {feedback && (
          <div
            className={`mb-3 px-4 py-3 rounded-xl border text-sm font-medium flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-950/60 border-rose-500/40 text-rose-200'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="p-1 opacity-70 hover:opacity-100"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Shift Date Quick Pills + Leader Selector Button + Export Button */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {shiftGroups.map((group) => {
              const isSelected = group.data === selectedDate;
              const marked = group.presentes + group.ausentes;
              return (
                <button
                  key={group.data}
                  type="button"
                  onClick={() => setSelectedDate(group.data)}
                  className={`min-h-[42px] px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 shrink-0 transition-all ${
                    isSelected
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm'
                      : 'bg-slate-900 text-slate-300 border-slate-800 hover:bg-slate-800'
                  }`}
                >
                  <span>
                    {group.weekdayLabel ? `${group.weekdayLabel}, ` : ''}
                    {group.data.slice(0, 5)}
                  </span>
                  <span
                    className={`font-mono-tabular text-[11px] ${
                      isSelected ? 'text-slate-900 font-bold' : 'text-slate-400'
                    }`}
                  >
                    {marked}/{group.total}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Controls: Leader Selector Button (Right beside Exportar .xlsx) */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsLeaderDropdownOpen((prev) => !prev)}
                className={`min-h-[42px] px-3.5 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-2 transition-all ${
                  selectedLeader !== 'ALL'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-md shadow-cyan-950/50'
                    : 'bg-slate-900 hover:bg-slate-800 text-slate-100 border-slate-700'
                }`}
              >
                <Users
                  className={`w-4 h-4 shrink-0 ${
                    selectedLeader !== 'ALL' ? 'text-slate-950' : 'text-cyan-400'
                  }`}
                />
                <span>
                  {selectedLeader === 'ALL'
                    ? 'Selecionar Líder'
                    : `Líder: ${selectedLeader} (${scopedRecords.length})`}
                </span>
                <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-80" />
              </button>

              {isLeaderDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setIsLeaderDropdownOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-72 max-h-[80dvh] overflow-y-auto overscroll-contain touch-pan-y z-50 bg-slate-900 rounded-2xl border border-slate-700 shadow-2xl p-2 space-y-1">
                    <div className="px-3 py-1.5 flex items-center justify-between border-b border-slate-800 mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        Filtrar Equipe por Líder ({selectedDate.slice(0, 5)})
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsLeaderDropdownOpen(false)}
                        className="text-slate-400 hover:text-white p-0.5"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeader('ALL');
                        setIsLeaderDropdownOpen(false);
                      }}
                      className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors ${
                        selectedLeader === 'ALL'
                          ? 'bg-cyan-500 text-slate-950'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>Todos os Líderes (Visão Geral)</span>
                      <span className="font-mono-tabular text-[11px]">
                        {leaderCountsOnDate.ALL} colab.
                      </span>
                    </button>

                    <div className="border-t border-slate-800/80 my-1" />

                    {OFFICIAL_LEADERS.map((leader) => {
                      const isSel = selectedLeader === leader;
                      const countOnDate = leaderCountsOnDate[leader] || 0;
                      return (
                        <button
                          key={leader}
                          type="button"
                          onClick={() => {
                            setSelectedLeader(leader);
                            setIsLeaderDropdownOpen(false);
                          }}
                          className={`w-full min-h-[38px] px-3 py-1.5 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors ${
                            isSel
                              ? 'bg-emerald-500 text-slate-950'
                              : 'text-slate-200 hover:bg-slate-800'
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <UserCheck
                              className={`w-3.5 h-3.5 shrink-0 ${
                                isSel ? 'text-slate-950' : 'text-emerald-400'
                              }`}
                            />
                            <span>Líder {leader}</span>
                          </span>
                          <span
                            className={`font-mono-tabular text-[11px] px-2 py-0.5 rounded-md ${
                              isSel
                                ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                                : countOnDate > 0
                                ? 'bg-slate-800 text-emerald-300'
                                : 'bg-slate-950 text-slate-500'
                            }`}
                          >
                            {countOnDate} no turno
                          </span>
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedLeader('Não identificado');
                        setIsLeaderDropdownOpen(false);
                      }}
                      className={`w-full min-h-[36px] px-3 py-1.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                        selectedLeader === 'Não identificado'
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'text-amber-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>Não identificado / Sem líder</span>
                      <span className="font-mono-tabular text-[11px]">
                        {leaderCountsOnDate['Não identificado'] || 0} no turno
                      </span>
                    </button>

                    <div className="border-t border-slate-800 my-1.5" />

                    <button
                      type="button"
                      onClick={() => {
                        setIsLeaderDropdownOpen(false);
                        setIsLeaderDirectoryOpen(true);
                      }}
                      className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/70 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center justify-between transition-colors"
                    >
                      <span>Ver Base Geral de Colaboradores</span>
                      <span className="text-[10px] uppercase tracking-wider text-cyan-400">
                        Tabela A–Z
                      </span>
                    </button>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => exportOvertimeExcel(scopedRecords, selectedDate)}
              className="min-h-[42px] px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-1.5 shrink-0"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span className="hidden xs:inline">Exportar .xlsx</span>
            </button>
          </div>
        </div>

        {/* =========================================================
            1. VISÃO DO LÍDER (VIBE TRANQUILA · ÍCONES · TEXTO AO CLICAR)
           ========================================================= */}
        {activeView === 'LEADER' && (
          <div>
            {/* Compact Status Filter Strip for Leader (No Charts - Direct Access to Team List) */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-2.5">
              <button
                type="button"
                onClick={() => setStatusFilter('ALL')}
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                  statusFilter === 'ALL'
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400 shadow-xs'
                    : 'bg-[#111726] border-slate-800/90 text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>Escalados</span>
                <span
                  className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] ${
                    statusFilter === 'ALL'
                      ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                      : 'bg-slate-900 text-cyan-400'
                  }`}
                >
                  {summaryStats.total}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter === AttendanceStatus.Presente
                      ? 'ALL'
                      : AttendanceStatus.Presente
                  )
                }
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                  statusFilter === AttendanceStatus.Presente
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-xs'
                    : 'bg-[#111726] border-slate-800/90 text-emerald-400 hover:border-emerald-500/40'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>Presentes</span>
                <span
                  className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] ${
                    statusFilter === AttendanceStatus.Presente
                      ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                      : 'bg-slate-900 text-emerald-400'
                  }`}
                >
                  {summaryStats.presentes}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setStatusFilter(
                    statusFilter === AttendanceStatus.Ausente ? 'ALL' : AttendanceStatus.Ausente
                  )
                }
                className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                  statusFilter === AttendanceStatus.Ausente
                    ? 'bg-rose-500 text-white border-rose-400 shadow-xs'
                    : 'bg-[#111726] border-slate-800/90 text-rose-400 hover:border-rose-500/40'
                }`}
              >
                <UserX className="w-3.5 h-3.5 shrink-0" />
                <span>Ausentes</span>
                <span
                  className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] ${
                    statusFilter === AttendanceStatus.Ausente
                      ? 'bg-slate-950/25 text-white font-extrabold'
                      : 'bg-slate-900 text-rose-400'
                  }`}
                >
                  {summaryStats.ausentes}
                </span>
              </button>

              {summaryStats.pendentes > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusFilter(
                      statusFilter === AttendanceStatus.Pendente
                        ? 'ALL'
                        : AttendanceStatus.Pendente
                    )
                  }
                  className={`min-h-[36px] px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 transition-all ${
                    statusFilter === AttendanceStatus.Pendente
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-xs'
                      : 'bg-[#111726] border-slate-800/90 text-amber-400 hover:border-amber-500/40'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 shrink-0" />
                  <span>Pendentes</span>
                  <span
                    className={`font-mono-tabular px-1.5 py-0.5 rounded-md text-[11px] ${
                      statusFilter === AttendanceStatus.Pendente
                        ? 'bg-slate-950/20 text-slate-950 font-extrabold'
                        : 'bg-slate-900 text-amber-400'
                    }`}
                  >
                    {summaryStats.pendentes}
                  </span>
                </button>
              )}
            </div>

            {/* Search & Shift Window Filter */}
            <div className="flex flex-col sm:flex-row gap-2 mb-3.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar colaborador, #chapa ou peça (ex: Airton, Ademir, Tw trave)..."
                  className="w-full min-h-[42px] pl-10 pr-9 py-2 bg-[#111726] border border-slate-800/90 rounded-xl text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-cyan-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-200"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {availableShiftWindows.length > 1 && (
                <select
                  value={shiftWindowFilter}
                  onChange={(e) => setShiftWindowFilter(e.target.value)}
                  className="min-h-[42px] px-3 py-2 bg-[#111726] border border-slate-800/90 rounded-xl text-xs sm:text-sm font-semibold text-slate-200 focus:outline-none focus:border-cyan-500"
                >
                  <option value="ALL">Todos horários ({dateRecords.length})</option>
                  {availableShiftWindows.map((win) => (
                    <option key={win} value={win}>
                      Turno {win}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Collaborator Cards Grid (2 Columns on Desktop · Calm · Icons Only · Click for Text) */}
            {leaderVisibleRecords.length === 0 ? (
              <div className="bg-[#111726] rounded-2xl border border-slate-800 p-8 text-center my-4">
                <p className="text-base font-semibold text-slate-200 mb-1">
                  Nenhum colaborador encontrado
                </p>
                <p className="text-xs text-slate-400 mb-4">
                  Altere o filtro acima ou limpe a busca para ver todos os escalados.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('ALL');
                    setShiftWindowFilter('ALL');
                    setSelectedLeader('ALL');
                    setSearchQuery('');
                  }}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"
                >
                  Mostrar todos os líderes e horários
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-8">
                {leaderVisibleRecords.map((emp) => {
                  const isPresente = emp.status === AttendanceStatus.Presente;
                  const isAusente = emp.status === AttendanceStatus.Ausente;
                  const isParado =
                    emp.operationalStatus === OperationalStatus.Parado ||
                    emp.absentPieceAction === AbsentPieceAction.ProcessoParado;
                  const isSaiuMaisCedo =
                    emp.operationalStatus === OperationalStatus.SaiuMaisCedo;
                  const isFinalizou =
                    emp.operationalStatus === OperationalStatus.Finalizou ||
                    emp.producedState === ProducedState.Sim;

                  const isDetailsExpanded = expandedLeaderCardId === emp.id;

                  // Check if there is rich context to show when clicking "Motivo"
                  const hasExpandableInfo =
                    Boolean(emp.coveringForEmployee) ||
                    isSaiuMaisCedo ||
                    isAusente ||
                    emp.delayMinutes > 0 ||
                    emp.timeline.length > 1 ||
                    Boolean(emp.productionJustification);

                  return (
                    <div
                      key={emp.id}
                      onClick={() => setSelectedEmployeeId(emp.id)}
                      className={`rounded-2xl border p-3.5 transition-all cursor-pointer select-none flex flex-col justify-between ${
                        emp.coveringForEmployee
                          ? 'bg-[#13192E] border-indigo-500/45 hover:border-indigo-400'
                          : isParado || isSaiuMaisCedo
                          ? 'bg-[#161824] border-amber-500/40 hover:border-amber-400'
                          : isAusente
                          ? 'bg-[#1A1320] border-rose-500/40 hover:border-rose-400'
                          : isPresente
                          ? 'bg-[#111726] border-slate-800/90 hover:border-emerald-500/50'
                          : 'bg-[#111726]/80 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Left 44x44px 1-Tap Presence Button */}
                        <button
                          type="button"
                          onClick={(e) => handleQuickPresenceTap(e, emp)}
                          title="Alternar Presença / Falta"
                          aria-label={`Marcar presença de ${emp.funcionario}`}
                          className={`w-11 h-11 min-w-[44px] min-h-[44px] rounded-xl flex items-center justify-center shrink-0 transition-transform active:scale-90 border ${
                            isPresente
                              ? 'bg-emerald-500/20 border-emerald-500/60 text-emerald-400'
                              : isAusente
                              ? 'bg-rose-500/20 border-rose-500/60 text-rose-400'
                              : 'bg-slate-950 border-slate-800 text-slate-500 hover:border-slate-600'
                          }`}
                        >
                          {isPresente ? (
                            <Check className="w-5 h-5 stroke-[2.8]" />
                          ) : isAusente ? (
                            <X className="w-5 h-5 stroke-[2.8]" />
                          ) : (
                            <span className="w-2.5 h-2.5 rounded-full bg-slate-600" />
                          )}
                        </button>

                        {/* Center: Name + Chapa + Compact Visual Badges (Zero Repetitive Sentences) */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-baseline gap-1.5 min-w-0">
                              <h3 className="text-sm sm:text-[15px] font-bold text-white truncate">
                                {emp.funcionario}
                              </h3>
                              <span className="font-mono-tabular text-[11px] text-slate-500 shrink-0">
                                #{emp.chapa}
                              </span>
                            </div>

                            <span className="font-mono-tabular text-[11px] text-slate-400 shrink-0">
                              {emp.horaEntradaReal || emp.de}–
                              {isSaiuMaisCedo && emp.horaSaidaReal ? emp.horaSaidaReal : emp.ate}
                            </span>
                          </div>

                          {/* Compact Icon Pills Row */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            {/* Piece Pill */}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-950/90 border border-slate-800 text-[11px] font-semibold text-slate-200">
                              <Wrench className="w-3 h-3 text-cyan-400 shrink-0" />
                              <span className="truncate max-w-[130px]">{emp.motivoHe}</span>
                            </span>

                            {/* Leader Pill from Database */}
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold ${
                                emp.lider && emp.lider !== 'Não identificado'
                                  ? 'bg-slate-900/90 border-slate-700/80 text-cyan-300'
                                  : 'bg-amber-950/30 border-amber-500/30 text-amber-300'
                              }`}
                            >
                              <Users className="w-2.5 h-2.5 shrink-0" />
                              <span>{emp.lider || 'Não identificado'}</span>
                            </span>

                            {/* Priority Reallocation Pill (e.g. Ademir covering Airton) */}
                            {emp.coveringForEmployee && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-bold text-indigo-300">
                                <ArrowRightLeft className="w-3 h-3 shrink-0" />
                                <span>
                                  {emp.coveringSinceTime || '10:00'} → {emp.coveringForPiece}
                                </span>
                              </span>
                            )}

                            {/* Early Exit Pill (e.g. Airton left at 10:00) */}
                            {isSaiuMaisCedo && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-orange-500/20 border border-orange-500/40 text-[11px] font-bold text-orange-300">
                                <DoorOpen className="w-3 h-3 shrink-0" />
                                <span>Saiu {emp.horaSaidaReal || '10:00'}</span>
                              </span>
                            )}

                            {/* Covered By Pill */}
                            {isSaiuMaisCedo && emp.reallocatedToWelder && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/40 text-[11px] font-bold text-indigo-300">
                                <ArrowRightLeft className="w-3 h-3 shrink-0" />
                                <span>{emp.reallocatedToWelder.split(' ')[0]} assumiu</span>
                              </span>
                            )}

                            {/* Stop / Delay Pill */}
                            {emp.delayMinutes > 0 && !emp.coveringForEmployee && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[11px] font-mono-tabular font-bold text-amber-300">
                                <PauseCircle className="w-3 h-3 shrink-0" />
                                <span>{emp.delayMinutes}m</span>
                              </span>
                            )}

                            {/* Delivery Outcome Icon Pill */}
                            {isAusente ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/20 border border-rose-500/40 text-[11px] font-bold text-rose-300">
                                <span>Ausente</span>
                              </span>
                            ) : isFinalizou ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/35 text-[11px] font-bold text-emerald-300">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>Entregue</span>
                              </span>
                            ) : emp.producedState === ProducedState.Parcial ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/35 text-[11px] font-bold text-amber-300">
                                <span>Parcial</span>
                              </span>
                            ) : emp.producedState === ProducedState.Nao ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/35 text-[11px] font-bold text-rose-300">
                                <span>Não entregue</span>
                              </span>
                            ) : null}

                            {/* Click-to-Expand Reason Button ("O texto aparece se eu clicar") */}
                            {hasExpandableInfo && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedLeaderCardId((prev) =>
                                    prev === emp.id ? null : emp.id
                                  );
                                }}
                                className={`ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] font-bold transition-colors ${
                                  isDetailsExpanded
                                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                                    : 'bg-slate-950 border-slate-700 text-cyan-300 hover:bg-slate-800'
                                }`}
                              >
                                <Info className="w-3 h-3 shrink-0" />
                                <span>{isDetailsExpanded ? 'Ocultar' : 'Resumo'}</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Progressive Disclosure Box: Appears ONLY when user clicks "Resumo" */}
                      {isDetailsExpanded && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className="mt-3 pt-2.5 border-t border-slate-800/90 text-xs space-y-1.5 text-slate-200 animate-in fade-in duration-150"
                        >
                          {emp.coveringForEmployee && (
                            <div className="p-2.5 rounded-xl bg-slate-950 border border-indigo-500/30 space-y-1">
                              <div className="font-bold text-indigo-300">
                                Remanejamento de Prioridade às {emp.coveringSinceTime || '10:00'}:
                              </div>
                              <p className="text-slate-300 leading-relaxed">
                                • Atrasou/pausou a peça original (<strong>{emp.motivoHe}</strong>) às{' '}
                                <strong>{emp.coveringSinceTime || '10:00'}</strong> devido à saída mais
                                cedo de <strong>{emp.coveringForEmployee.split(' ')[0]}</strong>.
                              </p>
                              <p className="text-emerald-300 leading-relaxed">
                                • Assumiu e entregou a peça prioritária (
                                <strong>{emp.coveringForPiece}</strong>).
                              </p>
                            </div>
                          )}

                          {isSaiuMaisCedo && (
                            <div className="p-2.5 rounded-xl bg-slate-950 border border-orange-500/30 space-y-1">
                              <div className="font-bold text-orange-300">
                                Saída Antecipada às {emp.horaSaidaReal || '10:00'}:
                              </div>
                              <p className="text-slate-300">
                                • Motivo: <strong>{emp.motivoSaidaAntecipada || 'Particular'}</strong>
                              </p>
                              {emp.reallocatedToWelder && (
                                <p className="text-emerald-300">
                                  • Peça prioritária ({emp.motivoHe}) assumida e entregue por{' '}
                                  <strong>{emp.reallocatedToWelder}</strong>.
                                </p>
                              )}
                            </div>
                          )}

                          {isAusente && (
                            <div className="p-2.5 rounded-xl bg-slate-950 border border-rose-500/30">
                              Faltou ao turno · Motivo:{' '}
                              <strong className="text-rose-300">
                                {emp.motivoFalta || 'Não informado'}
                              </strong>{' '}
                              · Destino: <strong>{emp.absentPieceAction || 'Pendente'}</strong>
                            </div>
                          )}

                          {emp.timeline.length > 0 && (
                            <div className="space-y-1 pt-0.5">
                              {emp.timeline.map((ev) => (
                                <div key={ev.id} className="flex items-start gap-2 text-[11px]">
                                  <span className="font-mono-tabular font-bold text-cyan-400 shrink-0">
                                    {ev.time}
                                  </span>
                                  <span className="text-slate-300">{ev.description}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="pt-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedEmployeeId(emp.id)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 text-slate-950 font-bold text-[11px]"
                            >
                              Editar Linha do Turno &rarr;
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* =========================================================
            2. VISÃO DO GERENTE (PAINEL EXECUTIVO BENTO · GRÁFICOS · TIMELINE)
           ========================================================= */}
        {activeView === 'MANAGER' && (
          <div className="space-y-4 mb-10">
            {/* Executive Bento Dashboard (Top 4 Sparkline KPI Cards + Wave Chart + Capacity Mix + Triage Pipeline + Process Bars) */}
            <ExecutiveBentoDashboard
              records={records}
              scopedRecords={managerScopedRecords}
              shiftGroups={shiftGroups}
              selectedDate={selectedDate}
              onSelectDate={(date) => setSelectedDate(date)}
              onSelectEmployee={(empId) => setSelectedEmployeeId(empId)}
              headerRightControls={
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <select
                    value={managerEmployeeFilter}
                    onChange={(e) => setManagerEmployeeFilter(e.target.value)}
                    className="w-full sm:w-64 min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-xs font-semibold text-slate-100 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="ALL">
                      Filtrar colaborador ({scopedRecords.length})
                    </option>
                    {scopedRecords.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.funcionario} (#{r.chapa} · {r.motivoHe})
                      </option>
                    ))}
                  </select>
                  {managerEmployeeFilter !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setManagerEmployeeFilter('ALL')}
                      className="min-h-[38px] px-3 rounded-xl border border-slate-700 bg-slate-950 text-xs font-semibold text-slate-300 hover:bg-slate-800 shrink-0"
                    >
                      Limpar
                    </button>
                  )}
                </div>
              }
            />

            {/* Compact Click-to-Expand Justifications & Active Stops Row */}
            <section className="bg-[#111726] rounded-2xl border border-slate-800/90 p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
                    Ocorrências & Justificativas do Turno (Clique no nome p/ expandir motivo)
                  </h2>
                </div>
                <span className="font-mono-tabular text-xs font-bold text-slate-400">
                  {managerJustifications.length} registros
                </span>
              </div>

              {managerJustifications.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">
                  Nenhuma ocorrência registrada neste filtro.
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {managerJustifications.map((r) => {
                    const isExpanded = expandedManagerJustId === r.id;
                    const isAusente = r.status === AttendanceStatus.Ausente;
                    const isSaiuCedo = r.operationalStatus === OperationalStatus.SaiuMaisCedo;

                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-slate-800/90 bg-slate-950/60 hover:bg-slate-950 transition-all overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedManagerJustId((prev) => (prev === r.id ? null : r.id))
                          }
                          className="w-full p-3 text-left flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <span className="text-xs sm:text-sm font-bold text-white truncate">
                              {r.funcionario.split(' ').slice(0, 2).join(' ')}
                            </span>
                            <span className="text-[11px] font-mono-tabular text-slate-500">
                              #{r.chapa}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-cyan-300">
                              {r.motivoHe}
                            </span>
                            {r.coveringForEmployee && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/35">
                                ⇄ Cobriu {r.coveringForPiece}
                              </span>
                            )}
                            {isSaiuCedo && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/35">
                                Saiu {r.horaSaidaReal || '10:00'}
                              </span>
                            )}
                            {isAusente && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/35">
                                Falta
                              </span>
                            )}
                            {r.delayMinutes > 0 && !r.coveringForEmployee && (
                              <span className="text-[10px] font-mono-tabular font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/35">
                                -{r.delayMinutes}m
                              </span>
                            )}
                          </div>

                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                              isExpanded ? 'rotate-180 text-cyan-400' : ''
                            }`}
                          />
                        </button>

                        {isExpanded && (
                          <div className="px-3 pb-3 pt-2 border-t border-slate-800/80 text-xs space-y-1.5 text-slate-300 animate-in fade-in duration-150">
                            {isAusente && (
                              <div>
                                Falta: <strong className="text-rose-300">{r.motivoFalta}</strong> ·
                                Destino: <strong>{r.absentPieceAction}</strong>
                              </div>
                            )}
                            {isSaiuCedo && (
                              <div>
                                Saiu às <strong>{r.horaSaidaReal}</strong> ({r.motivoSaidaAntecipada})
                                {r.reallocatedToWelder
                                  ? ` · Assumido por ${r.reallocatedToWelder}`
                                  : ''}
                              </div>
                            )}
                            {r.productionJustification && (
                              <div className="text-slate-200">{r.productionJustification}</div>
                            )}
                            <div className="pt-1">
                              <button
                                type="button"
                                onClick={() => setSelectedEmployeeId(r.id)}
                                className="text-[11px] font-bold text-cyan-400 underline"
                              >
                                Abrir ficha completa &rarr;
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 4: Enhanced Vertical General Timeline of the Day (Compact & Click-to-Expand) */}
            <GeneralDayTimeline
              events={managerGlobalTimeline}
              selectedDate={selectedDate}
              onSelectEmployee={(empId) => setSelectedEmployeeId(empId)}
            />
          </div>
        )}

        {/* =========================================================
            3. ABA DE RELATÓRIOS, GRÁFICOS E CARDS DE ALERTA
           ========================================================= */}
        {activeView === 'REPORTS' && (
          <ManagerReportsView
            records={recordsFilteredByLeader}
            shiftGroups={shiftGroups}
            selectedDate={selectedDate}
            onSelectDate={(date) => setSelectedDate(date)}
            onSelectEmployee={(empId) => setSelectedEmployeeId(empId)}
            onExportExcel={(scope) => exportOvertimeExcel(recordsFilteredByLeader, scope)}
            onReloadSimulation={handleReloadWeekendSimulation}
          />
        )}
      </main>

      {/* =========================================================
          PAINEL DETALHADO DO COLABORADOR (MODAL / DRAWER)
          Seções: A) Presença | B) Linha Vertical do Turno | C) Peça
         ========================================================= */}
      {activeEmployee && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedEmployeeId(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-slate-800 p-4 sm:p-6 pb-safe shadow-2xl space-y-5 text-slate-100"
          >
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-3.5">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
                  {activeEmployee.funcionario}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400 mt-1 font-mono-tabular">
                  <span className="font-semibold text-emerald-400">#{activeEmployee.chapa}</span>
                  <span>·</span>
                  <span className="font-semibold text-cyan-300">
                    Líder: {activeEmployee.lider || 'Não identificado'}
                  </span>
                  <span>·</span>
                  <span className="text-slate-200">
                    Turno {activeEmployee.de}–{activeEmployee.ate}
                  </span>
                  <span>·</span>
                  <span>CC {activeEmployee.cc}</span>
                  <span>·</span>
                  <span>{activeEmployee.local}</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedEmployeeId(null)}
                className="min-w-[44px] min-h-[44px] px-3 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center justify-center gap-1 shrink-0"
              >
                <span>Fechar</span>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* TOP PRESENCE SWITCH: VEIO PRO TURNO vs FALTOU O TURNO INTEIRO */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() =>
                  handleSetPresenceInDrawer(activeEmployee, AttendanceStatus.Presente)
                }
                className={`min-h-[46px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border-2 transition-all ${
                  activeEmployee.status !== AttendanceStatus.Ausente
                    ? 'bg-emerald-500 border-emerald-400 text-slate-950 shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Check className="w-4 h-4 stroke-[2.5] shrink-0" />
                <span>Veio pro turno ({activeEmployee.de}–{activeEmployee.ate})</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleSetPresenceInDrawer(activeEmployee, AttendanceStatus.Ausente)
                }
                className={`min-h-[46px] px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 border-2 transition-all ${
                  activeEmployee.status === AttendanceStatus.Ausente
                    ? 'bg-rose-600 border-rose-500 text-white shadow-sm'
                    : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <X className="w-4 h-4 stroke-[2.5] shrink-0" />
                <span>Faltou o turno todo</span>
              </button>
            </div>

            {/* IF ABSENT ALL SHIFT -> REASON & PIECE REALLOCATION */}
            {activeEmployee.status === AttendanceStatus.Ausente ? (
              <section className="bg-rose-950/35 rounded-2xl border border-rose-500/35 p-4 space-y-4">
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-rose-200">
                    1. Por que o colaborador faltou ao turno? *
                  </label>
                  <input
                    ref={absenceInputRef}
                    type="text"
                    value={activeEmployee.motivoFalta}
                    onChange={(e) =>
                      updateEmployee(activeEmployee.id, (prev) => ({
                        ...prev,
                        motivoFalta: e.target.value,
                      }))
                    }
                    placeholder="Digite ou selecione abaixo o motivo da falta..."
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 border border-rose-500/40 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-rose-400"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_ABSENCE_REASONS.map((reason) => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() =>
                          updateEmployee(activeEmployee.id, (prev) => ({
                            ...prev,
                            motivoFalta: reason,
                          }))
                        }
                        className={`min-h-[34px] px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                          activeEmployee.motivoFalta === reason
                            ? 'bg-rose-600 border-rose-500 text-white font-semibold'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-rose-500/30 space-y-2.5">
                  <p className="text-xs font-bold text-rose-200">
                    2. O que será feito com a peça planejada dele ({activeEmployee.motivoHe})?
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        AbsentPieceAction.AlocarOutro,
                        AbsentPieceAction.ProcessoParado,
                        AbsentPieceAction.NaoRealizar,
                      ] as const
                    ).map((action) => {
                      const isSelected = activeEmployee.absentPieceAction === action;
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => handleSelectAbsentPieceAction(activeEmployee, action)}
                          className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-rose-500 border-rose-400 text-white'
                              : 'bg-slate-950 border-rose-500/30 text-slate-200 hover:bg-rose-950/60'
                          }`}
                        >
                          {action}
                        </button>
                      );
                    })}
                  </div>

                  {activeEmployee.absentPieceAction === AbsentPieceAction.AlocarOutro && (
                    <div className="pt-1 space-y-2">
                      <label className="block text-xs font-semibold text-rose-300">
                        Qual soldador saiu da própria peça para assumir esta peça prioritária ({activeEmployee.motivoHe})?
                      </label>
                      <select
                        value={activeEmployee.reallocatedToWelder}
                        onChange={(e) => {
                          if (e.target.value) {
                            handleAssignReplacementWelder(activeEmployee, e.target.value, true);
                          }
                        }}
                        className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-950 border border-rose-500/40 text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-rose-400"
                      >
                        <option value="">-- Escolha o soldador substituto da equipe --</option>
                        {otherAvailableWelders.map((w) => {
                          const val = `${w.funcionario} (#${w.chapa})`;
                          return (
                            <option key={w.id} value={val}>
                              {w.funcionario} (#{w.chapa}) — Estava na peça: {w.motivoHe}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  )}
                </div>
              </section>
            ) : (
              /* =========================================================
                 VERTICAL INTERACTIVE SHIFT TIMELINE (START -> END)
                 ========================================================= */
              <>
                <InteractiveShiftTimeline
                  employee={activeEmployee}
                  otherAvailableWelders={otherAvailableWelders}
                  onUpdateEmployee={(updater) => updateEmployee(activeEmployee.id, updater)}
                  onSelectAbsentPieceAction={(action) =>
                    handleSelectAbsentPieceAction(activeEmployee, action)
                  }
                  onAssignReplacementWelder={(targetWelder, delivered) =>
                    handleAssignReplacementWelder(activeEmployee, targetWelder, delivered)
                  }
                />

                {/* COMPACT PIECE SUMMARY AT THE BOTTOM */}
                <section className="bg-slate-950/90 rounded-2xl border border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-100 tracking-wide flex items-center gap-1.5">
                      <Wrench className="w-4 h-4 text-emerald-400" />
                      <span>Resultado da Peça no Turno ({activeEmployee.motivoHe})</span>
                    </h3>
                    <span className="font-mono-tabular text-xs text-amber-400 font-semibold">
                      Atraso acumulado: {activeEmployee.delayMinutes || 0} min
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {([ProducedState.Sim, ProducedState.Parcial, ProducedState.Nao] as const).map(
                      (state) => {
                        const isSelected = activeEmployee.producedState === state;
                        return (
                          <button
                            key={state}
                            type="button"
                            onClick={() =>
                              updateEmployee(activeEmployee.id, (prev) => ({
                                ...prev,
                                status: AttendanceStatus.Presente,
                                producedState: state,
                                qtyActual:
                                  state === ProducedState.Sim
                                    ? prev.qtyPlanned || 1
                                    : state === ProducedState.Nao
                                    ? 0
                                    : prev.qtyActual,
                                operationalStatus:
                                  state === ProducedState.Sim
                                    ? OperationalStatus.Finalizou
                                    : prev.operationalStatus,
                              }))
                            }
                            className={`min-h-[42px] px-3 py-2 rounded-xl border text-xs font-bold transition-all ${
                              isSelected
                                ? state === ProducedState.Sim
                                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                  : state === ProducedState.Parcial
                                  ? 'bg-amber-500 border-amber-400 text-slate-950'
                                  : 'bg-rose-600 border-rose-500 text-white'
                                : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            {state === ProducedState.Sim
                              ? 'Peça Concluída (Sim)'
                              : state === ProducedState.Parcial
                              ? 'Entregue Parcial'
                              : 'Não Produzida'}
                          </button>
                        );
                      }
                    )}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      )}

      {/* Shift Date Selector Bottom Sheet */}
      {isDateSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setIsDateSheetOpen(false)}
        >
          <div
            className="bg-slate-900 w-full max-w-md rounded-t-3xl sm:rounded-3xl border border-slate-800 p-5 pb-safe shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-1.5 bg-slate-700 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-bold text-white">Selecionar Turno (Data)</h2>
                <p className="text-xs text-slate-400">
                  Escolha o dia da escala para visualizar ou apontar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsDateSheetOpen(false)}
                className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {shiftGroups.map((group) => {
                const isSelected = group.data === selectedDate;
                return (
                  <button
                    key={group.data}
                    type="button"
                    onClick={() => {
                      setSelectedDate(group.data);
                      setIsDateSheetOpen(false);
                    }}
                    className={`w-full min-h-[60px] p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
                        : 'bg-slate-950 text-slate-100 border-slate-800 hover:bg-slate-800'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-bold">
                        {group.weekdayLabel ? `${group.weekdayLabel} · ` : ''}
                        {group.data}
                      </div>
                      <div
                        className={`text-xs mt-0.5 font-mono-tabular ${
                          isSelected ? 'text-slate-900 font-semibold' : 'text-slate-400'
                        }`}
                      >
                        {group.total} escalados · {group.presentes} pres. · {group.ausentes} aus.
                      </div>
                    </div>

                    <div
                      className={`text-xs font-mono-tabular font-bold px-2.5 py-1 rounded-lg ${
                        isSelected
                          ? 'bg-slate-950/20 text-slate-950'
                          : 'bg-slate-900 text-slate-300 border border-slate-800'
                      }`}
                    >
                      {group.pendentes === 0 ? 'Concluído' : `${group.pendentes} pend.`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Onboarding & Help Guide Modal ("Primeiros Passos" + "? Como usar") */}
      <LeaderGuideModal
        isOpen={isGuideOpen}
        hideOnStartup={hideGuideOnStartup}
        onToggleHideOnStartup={handleToggleHideGuideOnStartup}
        onClose={() => setIsGuideOpen(false)}
        onTryAirtonExample={handleTryAirtonExample}
      />

      {/* Collaborator-by-Leader General Database Modal */}
      <LeaderDirectoryModal
        isOpen={isLeaderDirectoryOpen}
        onClose={() => setIsLeaderDirectoryOpen(false)}
        records={records}
        selectedLeaderFilter={selectedLeader}
        onSelectLeaderFilter={(leader) => setSelectedLeader(leader)}
        leaderOverrides={leaderOverrides}
        onUpdateCollaboratorLeader={handleUpdateCollaboratorLeader}
      />
    </div>
  );
}
