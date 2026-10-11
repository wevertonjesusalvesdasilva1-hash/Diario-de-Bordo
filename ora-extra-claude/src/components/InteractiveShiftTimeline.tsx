import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Clock,
  DoorOpen,
  PauseCircle,
  Play,
  Plus,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import {
  AbsentPieceAction,
  AttendanceStatus,
  OperationalStatus,
  OvertimeRecord,
  ProducedState,
  TimelineEvent,
} from '../types';

interface InteractiveShiftTimelineProps {
  employee: OvertimeRecord;
  otherAvailableWelders: OvertimeRecord[];
  onUpdateEmployee: (updater: (prev: OvertimeRecord) => OvertimeRecord) => void;
  onSelectAbsentPieceAction: (action: AbsentPieceAction) => void;
  onAssignReplacementWelder: (
    targetWelderValue: string,
    deliveredPriorityPiece?: boolean
  ) => void;
}

const QUICK_STOP_REASONS = [
  'Ponte rolante ocupada',
  'Aguardando material',
  'Manutenção máquina de solda',
  'Troca de arame / gás',
  'Inspeção de qualidade',
];

const QUICK_EARLY_EXIT_REASONS = [
  'Compromisso particular',
  'Passou mal / Médico',
  'Problema familiar',
  'Liberado pela liderança',
  'Problema de transporte',
];

type ActionMode = 'STOP' | 'RESUME' | 'EARLY_EXIT' | 'FINISH';

function parseHHMMToMinutes(hhmm: string): number {
  const [hStr = '0', mStr = '0'] = (hhmm || '06:00').split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 360;
  return h * 60 + m;
}

function formatMinutesToHHMM(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(normalized / 60)).padStart(2, '0');
  const mm = String(normalized % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function generateShiftTimeSlots(startHHMM: string, endHHMM: string, existingEvents: TimelineEvent[]): string[] {
  const startMins = parseHHMMToMinutes(startHHMM || '06:00');
  let endMins = parseHHMMToMinutes(endHHMM || '12:00');
  if (endMins <= startMins) {
    endMins += 1440; // overnight shift (e.g. 22:00 -> 04:00)
  }

  const duration = Math.min(Math.max(endMins - startMins, 60), 720);
  const step = duration <= 180 ? 20 : 30;

  const slotSet = new Set<string>();
  slotSet.add(formatMinutesToHHMM(startMins));

  for (let m = startMins + step; m < startMins + duration; m += step) {
    slotSet.add(formatMinutesToHHMM(m));
  }

  slotSet.add(formatMinutesToHHMM(startMins + duration));

  existingEvents.forEach((ev) => {
    if (ev.time) slotSet.add(ev.time);
  });

  const slots = Array.from(slotSet);
  // Sort relative to shift start so overnight shifts stay in proper order
  slots.sort((a, b) => {
    let ma = parseHHMMToMinutes(a);
    let mb = parseHHMMToMinutes(b);
    if (ma < startMins - 60) ma += 1440;
    if (mb < startMins - 60) mb += 1440;
    return ma - mb;
  });

  return slots;
}

export const InteractiveShiftTimeline: React.FC<InteractiveShiftTimelineProps> = ({
  employee,
  otherAvailableWelders,
  onUpdateEmployee,
  onSelectAbsentPieceAction,
  onAssignReplacementWelder,
}) => {
  const shiftStart = employee.de || '06:00';
  const shiftEnd = employee.ate || '12:00';

  const [selectedSlotTime, setSelectedSlotTime] = useState<string | null>(null);
  const [customTimeInput, setCustomTimeInput] = useState<string>('');
  const [actionMode, setActionMode] = useState<ActionMode>('STOP');
  const [stopReason, setStopReason] = useState<string>('Ponte rolante ocupada');
  const [stopDelayMins, setStopDelayMins] = useState<number>(30);
  const [earlyExitReason, setEarlyExitReason] = useState<string>('Compromisso particular');

  const timeSlots = useMemo(
    () => generateShiftTimeSlots(shiftStart, shiftEnd, employee.timeline),
    [shiftStart, shiftEnd, employee.timeline]
  );

  // Map events by time
  const eventsByTime = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    employee.timeline.forEach((ev) => {
      const list = map.get(ev.time) || [];
      list.push(ev);
      map.set(ev.time, list);
    });
    return map;
  }, [employee.timeline]);

  const handleOpenSlot = (time: string) => {
    if (selectedSlotTime === time) {
      setSelectedSlotTime(null);
      return;
    }
    setSelectedSlotTime(time);
    setCustomTimeInput(time);

    if (employee.operationalStatus === OperationalStatus.Parado) {
      setActionMode('RESUME');
    } else {
      setActionMode('STOP');
    }
  };

  const handleConfirmSlotAction = () => {
    const timeToSave = (customTimeInput || selectedSlotTime || shiftStart).trim();
    if (!timeToSave) return;

    if (actionMode === 'STOP') {
      const reason = stopReason.trim() || 'Ponte rolante ocupada';
      const minsToAdd = Math.max(0, Number(stopDelayMins) || 0);

      onUpdateEmployee((prev) => {
        const hasEntry = prev.timeline.some((ev) => ev.type === 'entry');
        const baseTimeline: TimelineEvent[] = hasEntry
          ? prev.timeline
          : [
              {
                id: `ev-entry-${Date.now()}`,
                time: prev.de || '06:00',
                description: 'Entrou no posto de trabalho',
                type: 'entry' as const,
              },
              ...prev.timeline,
            ];

        const nextTimeline: TimelineEvent[] = [
          ...baseTimeline,
          {
            id: `ev-stop-${Date.now()}`,
            time: timeToSave,
            description: `Parou: ${reason}`,
            type: 'stop' as const,
          },
        ].sort((a, b) => a.time.localeCompare(b.time));

        return {
          ...prev,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Parado,
          motivoParadaAtual: reason,
          delayMinutes: (prev.delayMinutes || 0) + minsToAdd,
          productionJustification: `Parada às ${timeToSave}: ${reason}`,
          timeline: nextTimeline,
        };
      });
    } else if (actionMode === 'RESUME') {
      onUpdateEmployee((prev) => {
        const lastStop = [...prev.timeline]
          .reverse()
          .find((ev) => ev.type === 'stop' || ev.description.toLowerCase().startsWith('parou'));
        const diffMins = lastStop
          ? Math.max(0, parseHHMMToMinutes(timeToSave) - parseHHMMToMinutes(lastStop.time))
          : 0;

        const nextTimeline: TimelineEvent[] = [
          ...prev.timeline,
          {
            id: `ev-resume-${Date.now()}`,
            time: timeToSave,
            description: `Retomou produção${diffMins > 0 ? ` (ficou parado ${diffMins} min)` : ''}`,
            type: 'resume' as const,
          },
        ].sort((a, b) => a.time.localeCompare(b.time));

        return {
          ...prev,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Soldando,
          motivoParadaAtual: '',
          timeline: nextTimeline,
        };
      });
    } else if (actionMode === 'EARLY_EXIT') {
      const reason = earlyExitReason.trim() || 'Compromisso particular';
      const entryTime = employee.horaEntradaReal || shiftStart;

      onUpdateEmployee((prev) => {
        const withoutOldExit = prev.timeline.filter((ev) => ev.type !== 'early_exit');
        const hasEntry = withoutOldExit.some((ev) => ev.type === 'entry');
        const nextTimeline: TimelineEvent[] = [
          ...(hasEntry
            ? withoutOldExit
            : [
                {
                  id: `ev-entry-${Date.now()}`,
                  time: entryTime,
                  description: 'Entrou no posto de trabalho',
                  type: 'entry' as const,
                },
                ...withoutOldExit,
              ]),
          {
            id: `ev-exit-${Date.now()}`,
            time: timeToSave,
            description: `Foi embora mais cedo (trabalhou das ${entryTime} às ${timeToSave}) — Motivo: ${reason}`,
            type: 'early_exit' as const,
          },
        ].sort((a, b) => a.time.localeCompare(b.time));

        return {
          ...prev,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.SaiuMaisCedo,
          horaEntradaReal: entryTime,
          horaSaidaReal: timeToSave,
          motivoSaidaAntecipada: reason,
          producedState:
            prev.producedState === ProducedState.NaoIniciado
              ? ProducedState.Parcial
              : prev.producedState,
          productionJustification: `Trabalhou das ${entryTime} às ${timeToSave} (${reason})`,
          timeline: nextTimeline,
        };
      });
    } else if (actionMode === 'FINISH') {
      onUpdateEmployee((prev) => {
        const nextTimeline: TimelineEvent[] = [
          ...prev.timeline,
          {
            id: `ev-finish-${Date.now()}`,
            time: timeToSave,
            description: `Peça finalizada (${prev.motivoHe})`,
            type: 'finish' as const,
          },
        ].sort((a, b) => a.time.localeCompare(b.time));

        return {
          ...prev,
          status: AttendanceStatus.Presente,
          operationalStatus: OperationalStatus.Finalizou,
          motivoParadaAtual: '',
          producedState: ProducedState.Sim,
          qtyActual: prev.qtyPlanned || 1,
          timeline: nextTimeline,
        };
      });
    }

    setSelectedSlotTime(null);
  };

  const handleDeleteEvent = (e: React.MouseEvent, eventId: string) => {
    e.stopPropagation();
    onUpdateEmployee((prev) => ({
      ...prev,
      timeline: prev.timeline.filter((ev) => ev.id !== eventId),
    }));
  };

  return (
    <div className="space-y-3">
      {/* Banner if THIS employee was pulled from his own piece to cover a higher-priority piece */}
      {employee.coveringForEmployee && (
        <section className="rounded-2xl border border-indigo-500/45 bg-indigo-950/30 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-indigo-300">
              Remanejado às {employee.coveringSinceTime || '10:00'} por Prioridade de Produção
            </span>
            <span className="text-[11px] font-mono-tabular font-semibold text-emerald-400">
              Entregou peça: {employee.coveringForPiece}
            </span>
          </div>
          <ul className="space-y-1 text-xs text-slate-200">
            <li>
              • <strong>{employee.coveringForEmployee}</strong> saiu mais cedo às{' '}
              <strong>{employee.coveringSinceTime || '10:00'}</strong> ({employee.coveringReason || 'motivos particulares'}).
            </li>
            <li>
              • <strong>{employee.funcionario}</strong> saiu da sua peça original (
              <strong>{employee.motivoHe}</strong>) às{' '}
              <strong>{employee.coveringSinceTime || '10:00'}</strong> para soldar a peça prioritária{' '}
              <strong>{employee.coveringForPiece}</strong>.
            </li>
            <li className="text-amber-300">
              • A peça que <strong>{employee.funcionario.split(' ')[0]}</strong> iria entregar (
              <strong>{employee.motivoHe}</strong>) atrasou / não foi entregue devido à cobertura da saída de{' '}
              <strong>{employee.coveringForEmployee.split(' ')[0]}</strong>.
            </li>
            <li className="text-emerald-300">
              • <strong>{employee.funcionario.split(' ')[0]}</strong> foi lá e entregou a peça (
              <strong>{employee.coveringForPiece}</strong>) do outro colaborador.
            </li>
          </ul>
        </section>
      )}

      {/* Vertical Interactive Shift Line Container */}
      <div className="rounded-2xl bg-slate-950 border border-slate-800 p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-white">
              Linha do Turno ({shiftStart} até {shiftEnd})
            </h3>
          </div>
          <span className="text-[11px] text-slate-400">
            Toque em um horário para apontar parada ou saída
          </span>
        </div>

        {/* Vertical Timeline Slots */}
        <div className="relative">
          {timeSlots.map((slotTime, index) => {
            const slotEvents = eventsByTime.get(slotTime) || [];
            const isStart = index === 0;
            const isEnd = index === timeSlots.length - 1;
            const isSelected = selectedSlotTime === slotTime;

            const hasStop = slotEvents.some(
              (ev) => ev.type === 'stop' || ev.description.toLowerCase().startsWith('parou')
            );
            const hasResume = slotEvents.some(
              (ev) => ev.type === 'resume' || ev.description.toLowerCase().startsWith('retomou')
            );
            const hasEarlyExit = slotEvents.some(
              (ev) =>
                ev.type === 'early_exit' ||
                ev.description.toLowerCase().includes('embora mais cedo')
            );
            const hasFinish = slotEvents.some(
              (ev) => ev.type === 'finish' || ev.description.toLowerCase().includes('finalizada')
            );

            let dotClass = 'bg-slate-700 border-slate-950';
            let rowBorder = 'border-slate-800/80 bg-slate-900/50 hover:bg-slate-900';

            if (hasStop) {
              dotClass = 'bg-amber-400 border-slate-950 ring-4 ring-amber-500/25';
              rowBorder = 'border-amber-500/40 bg-amber-950/25 hover:bg-amber-950/40';
            } else if (hasEarlyExit) {
              dotClass = 'bg-orange-400 border-slate-950 ring-4 ring-orange-500/25';
              rowBorder = 'border-orange-500/40 bg-orange-950/25 hover:bg-orange-950/40';
            } else if (hasFinish) {
              dotClass = 'bg-emerald-400 border-slate-950 ring-4 ring-emerald-500/25';
              rowBorder = 'border-emerald-500/40 bg-emerald-950/25 hover:bg-emerald-950/40';
            } else if (hasResume) {
              dotClass = 'bg-cyan-400 border-slate-950 ring-4 ring-cyan-500/20';
              rowBorder = 'border-cyan-500/35 bg-cyan-950/20 hover:bg-cyan-950/35';
            } else if (isStart) {
              dotClass = 'bg-emerald-400 border-slate-950';
            }

            return (
              <div key={slotTime} className="flex items-stretch">
                {/* Left Column: Time Label */}
                <div className="w-14 sm:w-16 shrink-0 flex flex-col items-end pr-2 pt-2.5">
                  <span
                    className={`font-mono-tabular text-xs font-bold px-1.5 py-0.5 rounded-md ${
                      isSelected
                        ? 'bg-emerald-500 text-slate-950'
                        : slotEvents.length > 0
                        ? 'bg-slate-800 text-white'
                        : 'text-slate-400'
                    }`}
                  >
                    {slotTime}
                  </span>
                </div>

                {/* Middle Column: Vertical Spine + Node */}
                <div className="w-7 shrink-0 relative flex flex-col items-center">
                  <div
                    className={`w-0.5 h-3.5 ${
                      isStart ? 'bg-transparent' : 'bg-slate-700'
                    }`}
                  />
                  <span
                    className={`w-3.5 h-3.5 rounded-full border-2 shrink-0 z-10 ${dotClass}`}
                  />
                  <div
                    className={`w-0.5 flex-1 ${
                      isEnd ? 'bg-transparent' : 'bg-slate-700'
                    }`}
                  />
                </div>

                {/* Right Column: Interactive Slot Button & Inline Editor */}
                <div className="flex-1 min-w-0 pl-1.5 pb-2">
                  <div
                    onClick={() => handleOpenSlot(slotTime)}
                    className={`rounded-xl border p-2.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-slate-900 shadow-md'
                        : rowBorder
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {slotEvents.length > 0 ? (
                          <div className="space-y-1">
                            {slotEvents.map((ev) => (
                              <div
                                key={ev.id}
                                className="flex items-center justify-between gap-2 text-xs"
                              >
                                <span className="font-semibold text-slate-100">
                                  {ev.description}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteEvent(e, ev.id)}
                                  title="Remover apontamento"
                                  className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/50 shrink-0"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">
                            {isStart
                              ? 'Início do turno — toque para apontar ocorrência'
                              : isEnd
                              ? 'Fim do turno — toque para apontar conclusão ou parada'
                              : '+ Apontar parada, retomada ou saída neste horário'}
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-bold text-emerald-400 shrink-0">
                        {isSelected ? 'Fechar' : 'Apontar'}
                      </span>
                    </div>

                    {/* Inline Action Panel when Slot is Clicked */}
                    {isSelected && (
                      <div
                        onClick={(e) => e.stopPropagation()}
                        className="mt-3 pt-3 border-t border-slate-800 space-y-3"
                      >
                        {/* 4 Action Mode Buttons */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                          <button
                            type="button"
                            onClick={() => setActionMode('STOP')}
                            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              actionMode === 'STOP'
                                ? 'bg-amber-500 border-amber-400 text-slate-950'
                                : 'bg-slate-950 border-slate-800 text-amber-300 hover:bg-slate-800'
                            }`}
                          >
                            <PauseCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>Parou Produção</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActionMode('RESUME')}
                            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              actionMode === 'RESUME'
                                ? 'bg-cyan-400 border-cyan-300 text-slate-950'
                                : 'bg-slate-950 border-slate-800 text-cyan-300 hover:bg-slate-800'
                            }`}
                          >
                            <Play className="w-3.5 h-3.5 shrink-0" />
                            <span>Retomou</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActionMode('EARLY_EXIT')}
                            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              actionMode === 'EARLY_EXIT'
                                ? 'bg-orange-500 border-orange-400 text-slate-950'
                                : 'bg-slate-950 border-slate-800 text-orange-300 hover:bg-slate-800'
                            }`}
                          >
                            <DoorOpen className="w-3.5 h-3.5 shrink-0" />
                            <span>Saiu mais cedo</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setActionMode('FINISH')}
                            className={`min-h-[38px] px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                              actionMode === 'FINISH'
                                ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                                : 'bg-slate-950 border-slate-800 text-emerald-300 hover:bg-slate-800'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Finalizou Peça</span>
                          </button>
                        </div>

                        {/* Exact Time Input */}
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-semibold text-slate-300">
                            Horário exato:
                          </label>
                          <input
                            type="time"
                            value={customTimeInput}
                            onChange={(e) => setCustomTimeInput(e.target.value)}
                            className="min-h-[36px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono-tabular font-bold text-white"
                          />
                        </div>

                        {/* Mode-Specific Controls */}
                        {actionMode === 'STOP' && (
                          <div className="space-y-2">
                            <label className="block text-xs font-bold text-amber-300">
                              Motivo da parada de produção:
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {QUICK_STOP_REASONS.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setStopReason(r)}
                                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                                    stopReason === r
                                      ? 'bg-amber-500 border-amber-400 text-slate-950 font-bold'
                                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                type="text"
                                value={stopReason}
                                onChange={(e) => setStopReason(e.target.value)}
                                placeholder="Digite o motivo da parada..."
                                className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                              />
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-xs text-slate-400">Tempo parado (min):</span>
                                <input
                                  type="number"
                                  min={0}
                                  step={5}
                                  value={stopDelayMins}
                                  onChange={(e) => setStopDelayMins(Number(e.target.value))}
                                  className="w-20 min-h-[38px] px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono-tabular font-bold text-amber-300"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {actionMode === 'EARLY_EXIT' && (
                          <div className="space-y-2.5">
                            <label className="block text-xs font-bold text-orange-300">
                              Motivo da saída antecipada às {customTimeInput}:
                            </label>
                            <div className="flex flex-wrap gap-1.5">
                              {QUICK_EARLY_EXIT_REASONS.map((r) => (
                                <button
                                  key={r}
                                  type="button"
                                  onClick={() => setEarlyExitReason(r)}
                                  className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${
                                    earlyExitReason === r
                                      ? 'bg-orange-500 border-orange-400 text-slate-950 font-bold'
                                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-800'
                                  }`}
                                >
                                  {r}
                                </button>
                              ))}
                            </div>
                            <input
                              type="text"
                              value={earlyExitReason}
                              onChange={(e) => setEarlyExitReason(e.target.value)}
                              placeholder="Motivo da saída mais cedo..."
                              className="w-full min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white"
                            />
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setSelectedSlotTime(null)}
                            className="min-h-[38px] px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-950 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={handleConfirmSlotAction}
                            className="min-h-[38px] px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5"
                          >
                            <Check className="w-4 h-4 stroke-[2.5]" />
                            <span>Salvar às {customTimeInput}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* If Employee Left Early, Show Piece Reallocation Controls */}
      {employee.operationalStatus === OperationalStatus.SaiuMaisCedo && (
        <section className="rounded-2xl border border-orange-500/40 bg-orange-950/25 p-3.5 space-y-2.5">
          <div className="text-xs font-bold text-orange-300">
            Destino da peça ({employee.motivoHe}) após saída às {employee.horaSaidaReal || '--:--'}:
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                AbsentPieceAction.AlocarOutro,
                AbsentPieceAction.ProcessoParado,
                AbsentPieceAction.NaoRealizar,
              ] as const
            ).map((action) => {
              const isSelected = employee.absentPieceAction === action;
              return (
                <button
                  key={action}
                  type="button"
                  onClick={() => onSelectAbsentPieceAction(action)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl border text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-orange-500 border-orange-400 text-slate-950'
                      : 'bg-slate-950 border-orange-500/30 text-slate-200 hover:bg-orange-950/50'
                  }`}
                >
                  {action}
                </button>
              );
            })}
          </div>

          {employee.absentPieceAction === AbsentPieceAction.AlocarOutro && (
            <div className="pt-1.5 space-y-2.5">
              <label className="block text-xs font-semibold text-orange-200">
                Selecione qual soldador saiu da sua peça às {employee.horaSaidaReal || '10:00'} para assumir esta peça prioritária ({employee.motivoHe}):
              </label>

              <select
                value={employee.reallocatedToWelder}
                onChange={(e) => {
                  if (e.target.value) {
                    onAssignReplacementWelder(e.target.value, true);
                  }
                }}
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-950 border border-orange-500/50 text-xs sm:text-sm text-white font-semibold focus:outline-none focus:border-orange-400"
              >
                <option value="">-- Escolha o soldador remanejado da equipe --</option>
                {otherAvailableWelders.map((w) => {
                  const val = `${w.funcionario} (#${w.chapa})`;
                  return (
                    <option key={w.id} value={val}>
                      {w.funcionario} (#{w.chapa}) — Estava na peça: {w.motivoHe}
                    </option>
                  );
                })}
              </select>

              {employee.reallocatedToWelder && (() => {
                const matched = otherAvailableWelders.find(
                  (w) =>
                    `${w.funcionario} (#${w.chapa})` === employee.reallocatedToWelder ||
                    w.chapa === employee.reallocatedToChapa ||
                    employee.reallocatedToWelder.toUpperCase().includes(w.funcionario.toUpperCase())
                );
                const subName = matched ? matched.funcionario : employee.reallocatedToWelder;
                const subShort = subName.split(' ')[0];
                const empShort = employee.funcionario.split(' ')[0];
                const subOriginalPiece = matched ? matched.motivoHe : 'sua peça anterior';
                const exitTime = employee.horaSaidaReal || '10:00';
                const exitReason = employee.motivoSaidaAntecipada || 'motivos particulares';

                return (
                  <div className="rounded-xl border border-emerald-500/35 bg-slate-950/90 p-3 space-y-1.5 text-xs">
                    <div className="font-bold text-emerald-400">
                      Vínculo Automático Registrado nos 2 Colaboradores e no Relatório:
                    </div>
                    <ul className="space-y-1 text-slate-200">
                      <li>
                        • <strong>{subShort}</strong> acabou atrasando a produção da peça{' '}
                        <strong>{subOriginalPiece}</strong> devido à ausência mais cedo de{' '}
                        <strong>{empShort}</strong> ({exitReason}).
                      </li>
                      <li>
                        • <strong>{empShort}</strong> saiu mais cedo às <strong>{exitTime}</strong>.
                      </li>
                      <li className="text-amber-300">
                        • A peça que <strong>{subShort}</strong> iria entregar (
                        <strong>{subOriginalPiece}</strong>) já foi sinalizada às{' '}
                        <strong>{exitTime}</strong> como <strong>Não Entregue</strong> por causa do remanejamento.
                      </li>
                      <li className="text-emerald-300">
                        • <strong>{subShort}</strong> foi lá e entregou a peça prioritária (
                        <strong>{employee.motivoHe}</strong>) de <strong>{empShort}</strong>.
                      </li>
                    </ul>
                  </div>
                );
              })()}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
