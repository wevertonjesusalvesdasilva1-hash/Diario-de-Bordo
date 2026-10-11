import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  DoorOpen,
  PauseCircle,
  Play,
  UserCheck,
  UserX,
  Wrench,
} from 'lucide-react';

export interface GlobalTimelineItem {
  id: string;
  time: string;
  empId: string;
  funcionario: string;
  chapa: string;
  peca: string;
  cc: string;
  description: string;
  type?: string;
  data?: string;
}

interface GeneralDayTimelineProps {
  events: GlobalTimelineItem[];
  selectedDate: string;
  onSelectEmployee: (empId: string) => void;
}

type SortOrder = 'RECENT_AT_TOP' | 'OLDEST_AT_TOP';
type EventFilter = 'ALL' | 'STOP' | 'ABSENCE_EXIT' | 'FINISH';

function parseTimeToMinutes(timeStr: string): number {
  const [hh = '0', mm = '0'] = (timeStr || '00:00').split(':');
  const h = parseInt(hh, 10);
  const m = parseInt(mm, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function getEventPriority(item: GlobalTimelineItem): number {
  const desc = item.description.toLowerCase();
  if (item.type === 'finish' || desc.includes('finalizada')) return 5;
  if (item.type === 'early_exit' || desc.includes('embora mais cedo')) return 4;
  if (item.type === 'resume' || desc.startsWith('retomou')) return 3;
  if (item.type === 'stop' || desc.startsWith('parou')) return 2;
  if (item.type === 'absence' || item.type === 'reallocation' || desc.includes('ausente')) return 1;
  return 0;
}

export const GeneralDayTimeline: React.FC<GeneralDayTimelineProps> = ({
  events,
  selectedDate,
  onSelectEmployee,
}) => {
  const [sortOrder, setSortOrder] = useState<SortOrder>('RECENT_AT_TOP');
  const [eventFilter, setEventFilter] = useState<EventFilter>('ALL');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [showAllDetails, setShowAllDetails] = useState(false);

  const filteredAndSortedEvents = useMemo(() => {
    const filtered = events.filter((ev) => {
      if (eventFilter === 'ALL') return true;
      const descLower = ev.description.toLowerCase();
      if (eventFilter === 'STOP') {
        return (
          ev.type === 'stop' ||
          ev.type === 'resume' ||
          descLower.includes('parou') ||
          descLower.includes('parada') ||
          descLower.includes('retomou')
        );
      }
      if (eventFilter === 'ABSENCE_EXIT') {
        return (
          ev.type === 'absence' ||
          ev.type === 'early_exit' ||
          ev.type === 'reallocation' ||
          descLower.includes('ausente') ||
          descLower.includes('faltou') ||
          descLower.includes('embora mais cedo') ||
          descLower.includes('realocada') ||
          descLower.includes('remanejamento')
        );
      }
      if (eventFilter === 'FINISH') {
        return ev.type === 'finish' || descLower.includes('finalizada');
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      const timeComparison = a.time.localeCompare(b.time);
      if (timeComparison !== 0) {
        return sortOrder === 'RECENT_AT_TOP' ? -timeComparison : timeComparison;
      }
      const prioDiff = getEventPriority(b) - getEventPriority(a);
      return sortOrder === 'RECENT_AT_TOP' ? prioDiff : -prioDiff;
    });
  }, [events, sortOrder, eventFilter]);

  const counts = useMemo(() => {
    let stops = 0;
    let absencesAndExits = 0;
    let finishes = 0;
    events.forEach((ev) => {
      const d = ev.description.toLowerCase();
      if (ev.type === 'stop' || d.startsWith('parou')) stops++;
      if (
        ev.type === 'absence' ||
        ev.type === 'early_exit' ||
        ev.type === 'reallocation' ||
        d.includes('ausente') ||
        d.includes('embora mais cedo') ||
        d.includes('remanejamento')
      ) {
        absencesAndExits++;
      }
      if (ev.type === 'finish' || d.includes('finalizada')) finishes++;
    });
    return { stops, absencesAndExits, finishes };
  }, [events]);

  const getEventVisuals = (item: GlobalTimelineItem) => {
    const descLower = item.description.toLowerCase();
    if (item.type === 'stop' || descLower.startsWith('parou')) {
      const match = item.description.match(/parou\s*\(([^)]+)\)/i);
      const shortCause = match ? match[1].trim() : 'Parada';
      return {
        label: shortCause,
        dotClass: 'bg-amber-400 border-slate-950 ring-4 ring-amber-500/25',
        spineColor: 'from-amber-500/70 to-slate-800',
        connectorColor: 'bg-amber-500/40',
        cardBorder: 'border-amber-500/30 bg-amber-950/15 hover:bg-amber-950/30',
        timeBadge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        pillClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        icon: <PauseCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
      };
    }
    if (item.type === 'resume' || descLower.startsWith('retomou')) {
      return {
        label: 'Retomou',
        dotClass: 'bg-cyan-400 border-slate-950 ring-4 ring-cyan-500/20',
        spineColor: 'from-cyan-500/60 to-slate-800',
        connectorColor: 'bg-cyan-500/40',
        cardBorder: 'border-cyan-500/25 bg-cyan-950/15 hover:bg-cyan-950/25',
        timeBadge: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35',
        pillClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35',
        icon: <Play className="w-3.5 h-3.5 text-cyan-400 shrink-0" />,
      };
    }
    if (
      item.type === 'early_exit' ||
      descLower.includes('embora mais cedo') ||
      descLower.includes('saiu mais cedo')
    ) {
      return {
        label: 'Saiu mais cedo',
        dotClass: 'bg-orange-400 border-slate-950 ring-4 ring-orange-500/25',
        spineColor: 'from-orange-500/60 to-slate-800',
        connectorColor: 'bg-orange-500/40',
        cardBorder: 'border-orange-500/30 bg-orange-950/15 hover:bg-orange-950/30',
        timeBadge: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
        pillClass: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
        icon: <DoorOpen className="w-3.5 h-3.5 text-orange-400 shrink-0" />,
      };
    }
    if (
      item.type === 'reallocation' ||
      descLower.includes('remanejamento') ||
      descLower.includes('realocada')
    ) {
      return {
        label: 'Remanejamento Prioritário',
        dotClass: 'bg-indigo-400 border-slate-950 ring-4 ring-indigo-500/25',
        spineColor: 'from-indigo-500/60 to-slate-800',
        connectorColor: 'bg-indigo-500/40',
        cardBorder: 'border-indigo-500/35 bg-indigo-950/20 hover:bg-indigo-950/35',
        timeBadge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        pillClass: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
        icon: <Wrench className="w-3.5 h-3.5 text-indigo-400 shrink-0" />,
      };
    }
    if (item.type === 'absence' || descLower.includes('ausente')) {
      return {
        label: 'Ausência',
        dotClass: 'bg-rose-500 border-slate-950 ring-4 ring-rose-500/25',
        spineColor: 'from-rose-500/60 to-slate-800',
        connectorColor: 'bg-rose-500/40',
        cardBorder: 'border-rose-500/30 bg-rose-950/15 hover:bg-rose-950/30',
        timeBadge: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        pillClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        icon: <UserX className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
      };
    }
    if (item.type === 'finish' || descLower.includes('finalizada')) {
      return {
        label: 'Concluída',
        dotClass: 'bg-emerald-400 border-slate-950 ring-4 ring-emerald-500/25',
        spineColor: 'from-emerald-500/70 to-slate-800',
        connectorColor: 'bg-emerald-500/40',
        cardBorder: 'border-emerald-500/30 bg-emerald-950/15 hover:bg-emerald-950/30',
        timeBadge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        pillClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      };
    }
    return {
      label: 'Entrada',
      dotClass: 'bg-slate-400 border-slate-950 ring-2 ring-slate-700',
      spineColor: 'from-slate-700 to-slate-800',
      connectorColor: 'bg-slate-700',
      cardBorder: 'border-slate-800/90 bg-slate-950/60 hover:bg-slate-900',
      timeBadge: 'bg-slate-900 text-slate-300 border-slate-800',
      pillClass: 'bg-slate-800/80 text-slate-300 border-slate-700',
      icon: <UserCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
    };
  };

  const latestTime =
    filteredAndSortedEvents.length > 0
      ? sortOrder === 'RECENT_AT_TOP'
        ? filteredAndSortedEvents[0].time
        : filteredAndSortedEvents[filteredAndSortedEvents.length - 1].time
      : '--:--';

  const earliestTime =
    filteredAndSortedEvents.length > 0
      ? sortOrder === 'RECENT_AT_TOP'
        ? filteredAndSortedEvents[filteredAndSortedEvents.length - 1].time
        : filteredAndSortedEvents[0].time
      : '--:--';

  return (
    <section className="bg-[#111726] rounded-2xl border border-slate-800/90 p-4 sm:p-5">
      {/* Header & Top-Down Order Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400 shrink-0" />
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-200">
            Linha do Tempo Cronológica ({selectedDate})
          </h2>
          <span className="text-[11px] text-slate-500 hidden sm:inline">
            · Clique em um evento para expandir detalhes
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAllDetails((prev) => !prev)}
            className="min-h-[32px] px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-semibold text-slate-300 hover:text-white"
          >
            {showAllDetails ? 'Modo Compacto (Ícones)' : 'Expandir Todos Textos'}
          </button>

          {/* Order Toggle Buttons */}
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setSortOrder('RECENT_AT_TOP')}
              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all whitespace-nowrap ${
                sortOrder === 'RECENT_AT_TOP'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowDown className="w-3 h-3 stroke-[2.5]" />
              <span>Recentes no Topo</span>
            </button>
            <button
              type="button"
              onClick={() => setSortOrder('OLDEST_AT_TOP')}
              className={`min-h-[30px] px-2.5 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all whitespace-nowrap ${
                sortOrder === 'OLDEST_AT_TOP'
                  ? 'bg-cyan-500 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <ArrowUp className="w-3 h-3 stroke-[2.5]" />
              <span>06:00 no Topo</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Category Filter Bar */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4 pb-3 border-b border-slate-800/80">
        <button
          type="button"
          onClick={() => setEventFilter('ALL')}
          className={`min-h-[32px] px-3 py-1 rounded-xl border text-xs font-semibold transition-all whitespace-nowrap ${
            eventFilter === 'ALL'
              ? 'bg-slate-100 text-slate-950 border-white font-bold'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:bg-slate-800'
          }`}
        >
          Todos ({events.length})
        </button>
        <button
          type="button"
          onClick={() => setEventFilter('STOP')}
          className={`min-h-[32px] px-3 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            eventFilter === 'STOP'
              ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
              : 'bg-slate-950 text-amber-300 border-amber-500/30 hover:bg-amber-950/40'
          }`}
        >
          <PauseCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Paradas ({counts.stops})</span>
        </button>
        <button
          type="button"
          onClick={() => setEventFilter('ABSENCE_EXIT')}
          className={`min-h-[32px] px-3 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            eventFilter === 'ABSENCE_EXIT'
              ? 'bg-indigo-500 text-white border-indigo-400 font-bold'
              : 'bg-slate-950 text-indigo-300 border-indigo-500/30 hover:bg-indigo-950/40'
          }`}
        >
          <span>Trocas & Faltas ({counts.absencesAndExits})</span>
        </button>
        <button
          type="button"
          onClick={() => setEventFilter('FINISH')}
          className={`min-h-[32px] px-3 py-1 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap ${
            eventFilter === 'FINISH'
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-bold'
              : 'bg-slate-950 text-emerald-300 border-emerald-500/30 hover:bg-emerald-950/40'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Entregues ({counts.finishes})</span>
        </button>
      </div>

      {/* Empty State */}
      {filteredAndSortedEvents.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center">
          <p className="text-xs font-semibold text-slate-400">
            Nenhum evento registrado para este filtro.
          </p>
        </div>
      ) : (
        <div className="relative max-h-[460px] overflow-y-auto pr-1">
          {/* Top Chronological Cap */}
          <div className="flex items-center mb-1">
            <div className="w-14 sm:w-16 shrink-0 text-right pr-2">
              <span className="font-mono-tabular text-[11px] font-bold text-cyan-400">
                {sortOrder === 'RECENT_AT_TOP' ? latestTime : earliestTime}
              </span>
            </div>
            <div className="w-7 shrink-0 flex flex-col items-center">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/50 text-cyan-400 flex items-center justify-center">
                <ArrowDown className="w-3 h-3 stroke-[2.5]" />
              </span>
              <div className="w-0.5 h-2.5 bg-cyan-500/50" />
            </div>
            <div className="flex-1 pl-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400/90">
                {sortOrder === 'RECENT_AT_TOP'
                  ? 'Mais recente no topo'
                  : 'Início do turno no topo'}
              </span>
            </div>
          </div>

          {/* Fluid Vertical Timeline Rows (Compact by default, click to expand text!) */}
          <div>
            {filteredAndSortedEvents.map((item, idx) => {
              const vis = getEventVisuals(item);
              const isFirst = idx === 0;
              const isLast = idx === filteredAndSortedEvents.length - 1;
              const isExpanded = showAllDetails || expandedEventId === item.id;

              const prevItem = idx > 0 ? filteredAndSortedEvents[idx - 1] : null;
              const diffMins = prevItem
                ? Math.abs(parseTimeToMinutes(item.time) - parseTimeToMinutes(prevItem.time))
                : 0;

              return (
                <div key={item.id} className="flex items-stretch group">
                  {/* Column 1: Time Marker on Left */}
                  <div className="w-14 sm:w-16 shrink-0 flex flex-col items-end pr-2 pt-2">
                    <span
                      className={`font-mono-tabular text-[11px] font-bold px-1.5 py-0.5 rounded-md border ${vis.timeBadge}`}
                    >
                      {item.time}
                    </span>
                    {!isFirst && diffMins > 0 && (
                      <span className="font-mono-tabular text-[9px] text-slate-600 mt-0.5">
                        {sortOrder === 'RECENT_AT_TOP' ? `-${diffMins}m` : `+${diffMins}m`}
                      </span>
                    )}
                  </div>

                  {/* Column 2: Continuous Vertical Spine & Node */}
                  <div className="w-7 shrink-0 relative flex flex-col items-center">
                    <div
                      className={`w-0.5 h-3.5 ${
                        isFirst ? 'bg-cyan-500/50' : 'bg-slate-800'
                      }`}
                    />
                    <div className="relative z-10 flex items-center justify-center shrink-0">
                      <span
                        className={`w-3 h-3 rounded-full border-2 transition-transform group-hover:scale-125 ${vis.dotClass}`}
                      />
                      <span
                        className={`absolute left-full w-2 h-0.5 ${vis.connectorColor}`}
                        aria-hidden="true"
                      />
                    </div>
                    <div
                      className={`w-0.5 flex-1 ${
                        isLast ? 'bg-slate-800' : `bg-gradient-to-b ${vis.spineColor}`
                      }`}
                    />
                  </div>

                  {/* Column 3: Compact Event Row (Click to toggle text or open employee) */}
                  <div className="flex-1 min-w-0 pl-1.5 pb-2">
                    <div
                      onClick={() =>
                        setExpandedEventId((prev) => (prev === item.id ? null : item.id))
                      }
                      className={`rounded-xl border px-3 py-2 cursor-pointer transition-all ${vis.cardBorder}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          {vis.icon}
                          <span className="text-xs sm:text-sm font-bold text-white truncate">
                            {item.funcionario.split(' ').slice(0, 2).join(' ')}
                          </span>
                          <span className="text-[11px] font-mono-tabular text-slate-500">
                            #{item.chapa}
                          </span>
                          <span className="text-xs font-semibold text-slate-300 bg-slate-900/90 border border-slate-800 px-2 py-0.5 rounded-md inline-flex items-center gap-1">
                            <Wrench className="w-3 h-3 text-cyan-400 shrink-0" />
                            <span>{item.peca}</span>
                          </span>
                          <span
                            className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${vis.pillClass}`}
                          >
                            {vis.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <ChevronDown
                            className={`w-4 h-4 text-slate-400 transition-transform ${
                              isExpanded ? 'rotate-180 text-cyan-400' : ''
                            }`}
                          />
                        </div>
                      </div>

                      {/* Progressive Disclosure: Description + Direct Link only when clicked */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-800/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 animate-in fade-in duration-150">
                          <p className="text-xs text-slate-200 leading-relaxed">
                            {item.description}
                          </p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectEmployee(item.empId);
                            }}
                            className="self-start sm:self-auto shrink-0 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[11px] font-bold text-cyan-300"
                          >
                            Abrir ficha &rarr;
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Chronological Cap */}
          <div className="flex items-center mt-0.5">
            <div className="w-14 sm:w-16 shrink-0 text-right pr-2">
              <span className="font-mono-tabular text-[10px] font-semibold text-slate-500">
                {sortOrder === 'RECENT_AT_TOP' ? earliestTime : latestTime}
              </span>
            </div>
            <div className="w-7 shrink-0 flex flex-col items-center">
              <div className="w-0.5 h-2 bg-slate-800" />
              <span className="w-4 h-4 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
              </span>
            </div>
            <div className="flex-1 pl-2">
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {sortOrder === 'RECENT_AT_TOP'
                  ? `Base · Início (${earliestTime})`
                  : `Base · Fim (${latestTime})`}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
