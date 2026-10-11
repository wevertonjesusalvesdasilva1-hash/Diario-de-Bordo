import React, { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, Layers, LayoutGrid } from 'lucide-react';
import { AttendanceStatus, OvertimeRecord, ShiftGroup } from '../types';

interface ConsolidatedShiftsChartProps {
  records: OvertimeRecord[];
  shiftGroups: ShiftGroup[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

interface ChartDataPoint {
  key: string;
  label: string;
  fullLabel: string;
  date: string;
  shiftWindow?: string;
  Presentes: number;
  Ausentes: number;
  Pendentes: number;
  total: number;
  presencePct: number;
}

export const ConsolidatedShiftsChart: React.FC<ConsolidatedShiftsChartProps> = ({
  records,
  shiftGroups,
  selectedDate,
  onSelectDate,
}) => {
  const [groupMode, setGroupMode] = useState<'BY_DATE' | 'BY_SHIFT_WINDOW'>('BY_DATE');
  const [isStacked, setIsStacked] = useState<boolean>(false);

  // Global totals across all consolidated shifts
  const globalTotals = useMemo(() => {
    let presentes = 0;
    let ausentes = 0;
    let pendentes = 0;

    for (const r of records) {
      if (r.status === AttendanceStatus.Presente) presentes++;
      else if (r.status === AttendanceStatus.Ausente) ausentes++;
      else pendentes++;
    }

    const total = records.length;
    const marked = presentes + ausentes;
    const presencePct = marked > 0 ? Math.round((presentes / marked) * 100) : 0;
    const coveragePct = total > 0 ? Math.round((presentes / total) * 100) : 0;

    return {
      total,
      presentes,
      ausentes,
      pendentes,
      presencePct,
      coveragePct,
    };
  }, [records]);

  // Build chart data points either grouped by Date or by Date + Shift Window
  const chartData = useMemo<ChartDataPoint[]>(() => {
    if (groupMode === 'BY_DATE') {
      return shiftGroups.map((group) => {
        const shortDate = group.data.slice(0, 5);
        const label = group.weekdayLabel ? `${group.weekdayLabel} ${shortDate}` : shortDate;
        const fullLabel = group.weekdayLabel
          ? `${group.weekdayLabel}, ${group.data}`
          : group.data;
        const presencePct =
          group.total > 0 ? Math.round((group.presentes / group.total) * 100) : 0;

        return {
          key: group.data,
          label,
          fullLabel,
          date: group.data,
          Presentes: group.presentes,
          Ausentes: group.ausentes,
          Pendentes: group.pendentes,
          total: group.total,
          presencePct,
        };
      });
    }

    // Group by Date + Shift Window (e.g., 04/10 01:00–07:00 vs 04/10 06:00–12:00)
    const map = new Map<
      string,
      {
        date: string;
        dataSortKey: string;
        weekdayLabel: string;
        windowLabel: string;
        presentes: number;
        ausentes: number;
        pendentes: number;
        total: number;
      }
    >();

    const weekdayLookup = new Map<string, string>();
    shiftGroups.forEach((g) => weekdayLookup.set(g.data, g.weekdayLabel));

    for (const r of records) {
      const windowLabel = r.de || r.ate ? `${r.de}–${r.ate}` : 'Geral';
      const compositeKey = `${r.data}__${windowLabel}`;
      const existing = map.get(compositeKey) || {
        date: r.data,
        dataSortKey: `${r.dataSortKey}_${windowLabel}`,
        weekdayLabel: weekdayLookup.get(r.data) || '',
        windowLabel,
        presentes: 0,
        ausentes: 0,
        pendentes: 0,
        total: 0,
      };

      if (r.status === AttendanceStatus.Presente) existing.presentes++;
      else if (r.status === AttendanceStatus.Ausente) existing.ausentes++;
      else existing.pendentes++;
      existing.total++;

      map.set(compositeKey, existing);
    }

    return Array.from(map.values())
      .sort((a, b) => a.dataSortKey.localeCompare(b.dataSortKey))
      .map((item) => {
        const shortDate = item.date.slice(0, 5);
        const label = `${shortDate} (${item.windowLabel.split('–')[0]})`;
        const fullLabel = `${item.weekdayLabel ? `${item.weekdayLabel}, ` : ''}${item.date} · Turno ${item.windowLabel}`;
        const presencePct =
          item.total > 0 ? Math.round((item.presentes / item.total) * 100) : 0;

        return {
          key: `${item.date}-${item.windowLabel}`,
          label,
          fullLabel,
          date: item.date,
          shiftWindow: item.windowLabel,
          Presentes: item.presentes,
          Ausentes: item.ausentes,
          Pendentes: item.pendentes,
          total: item.total,
          presencePct,
        };
      });
  }, [groupMode, shiftGroups, records]);

  return (
    <section className="bg-slate-900/90 rounded-2xl border border-slate-800 p-4 sm:p-5 shadow-lg">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Distribuição Consolidada dos Turnos (Acompanhamento Diário)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Comparativo de presença, ausência e pendências em todos os turnos ({globalTotals.total}{' '}
            escalados)
          </p>
        </div>

        {/* View Mode & Stack Controls */}
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              type="button"
              onClick={() => setGroupMode('BY_DATE')}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                groupMode === 'BY_DATE'
                  ? 'bg-slate-800 text-white shadow-xs border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Por Dia
            </button>
            <button
              type="button"
              onClick={() => setGroupMode('BY_SHIFT_WINDOW')}
              className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                groupMode === 'BY_SHIFT_WINDOW'
                  ? 'bg-slate-800 text-white shadow-xs border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Por Horário
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsStacked((prev) => !prev)}
            className="min-h-[36px] px-2.5 py-1 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors whitespace-nowrap"
            title="Alternar entre barras agrupadas e empilhadas"
          >
            {isStacked ? (
              <>
                <Layers className="w-3.5 h-3.5 text-emerald-400" />
                <span>Empilhado</span>
              </>
            ) : (
              <>
                <LayoutGrid className="w-3.5 h-3.5 text-slate-400" />
                <span>Agrupado</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Consolidated Totals Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 pb-3 border-b border-slate-800/80">
        <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-medium">Total Geral</span>
          <span className="text-sm font-bold font-mono-tabular text-slate-100">
            {globalTotals.total}
          </span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
          <span className="text-xs text-emerald-300 font-medium">Presentes</span>
          <span className="text-sm font-bold font-mono-tabular text-emerald-400">
            {globalTotals.presentes} ({globalTotals.coveragePct}%)
          </span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-center justify-between">
          <span className="text-xs text-rose-300 font-medium">Ausentes</span>
          <span className="text-sm font-bold font-mono-tabular text-rose-400">
            {globalTotals.ausentes}
          </span>
        </div>
        <div className="px-3 py-2 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between">
          <span className="text-xs text-amber-300 font-medium">Pendentes</span>
          <span className="text-sm font-bold font-mono-tabular text-amber-400">
            {globalTotals.pendentes}
          </span>
        </div>
      </div>

      {/* Recharts BarChart Container */}
      <div className="h-64 sm:h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 12, left: -16, bottom: 4 }}
            onClick={(state) => {
              if (state && state.activeLabel) {
                const clickedItem = chartData.find((d) => d.label === String(state.activeLabel));
                if (clickedItem?.date) {
                  onSelectDate(clickedItem.date);
                }
              }
            }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#1e293b" />
            <XAxis
              dataKey="label"
              axisLine={{ stroke: '#334155' }}
              tickLine={false}
              tick={{ fill: '#cbd5e1', fontSize: 12, fontWeight: 600 }}
            />
            <YAxis
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#64748b', fontSize: 11 }}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const item = payload[0].payload as ChartDataPoint;
                const presPct =
                  item.total > 0 ? Math.round((item.Presentes / item.total) * 100) : 0;
                const ausPct =
                  item.total > 0 ? Math.round((item.Ausentes / item.total) * 100) : 0;
                const pendPct =
                  item.total > 0 ? Math.round((item.Pendentes / item.total) * 100) : 0;

                return (
                  <div className="bg-slate-950 text-slate-100 rounded-xl p-3 shadow-2xl border border-slate-700 text-xs space-y-1.5 min-w-[200px]">
                    <div className="font-bold text-slate-100 border-b border-slate-800 pb-1.5 flex items-center justify-between gap-3">
                      <span>{item.fullLabel}</span>
                      <span className="font-mono-tabular text-slate-400">
                        {item.total} esc.
                      </span>
                    </div>
                    <div className="space-y-1 font-mono-tabular">
                      <div className="flex items-center justify-between text-emerald-400">
                        <span>Presentes:</span>
                        <span className="font-bold">
                          {item.Presentes} ({presPct}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-rose-400">
                        <span>Ausentes:</span>
                        <span className="font-bold">
                          {item.Ausentes} ({ausPct}%)
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-amber-400">
                        <span>Pendentes:</span>
                        <span className="font-bold">
                          {item.Pendentes} ({pendPct}%)
                        </span>
                      </div>
                    </div>
                    <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400">
                      Toque na barra para filtrar o dia {item.date}
                    </div>
                  </div>
                );
              }}
            />
            <Legend
              verticalAlign="top"
              height={32}
              iconType="circle"
              wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}
            />
            <Bar
              dataKey="Presentes"
              name="Presentes"
              stackId={isStacked ? 'turnos' : undefined}
              fill="#10b981"
              radius={isStacked ? [0, 0, 0, 0] : [6, 6, 0, 0]}
              maxBarSize={44}
              className="cursor-pointer"
            />
            <Bar
              dataKey="Ausentes"
              name="Ausentes"
              stackId={isStacked ? 'turnos' : undefined}
              fill="#f43f5e"
              radius={isStacked ? [0, 0, 0, 0] : [6, 6, 0, 0]}
              maxBarSize={44}
              className="cursor-pointer"
            />
            <Bar
              dataKey="Pendentes"
              name="Pendentes"
              stackId={isStacked ? 'turnos' : undefined}
              fill="#f59e0b"
              radius={isStacked ? [6, 6, 0, 0] : [6, 6, 0, 0]}
              maxBarSize={44}
              className="cursor-pointer"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
};
