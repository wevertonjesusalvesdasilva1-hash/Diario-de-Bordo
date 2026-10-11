// Dashboard numbers: stopped time by motive and by machine, built on the same events as the analysis.
import { buildEvents } from './analysis.js';
import { groupOf } from './lists.js';

const dayKey = (start) => Math.floor(start / 1440);
const dayLabel = (k) => { const d = new Date(k * 864e5); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

export function buildPanel(pages, { group = 'all', day = 'all' } = {}) {
  const sel = pages.filter((p) => group === 'all' || groupOf(p.machine) === group);
  const { events } = buildEvents(sel);
  const days = [...new Set(events.map((e) => dayKey(e.start)))].sort((a, b) => a - b).map((k) => ({ key: k, label: dayLabel(k) }));
  const ev = day === 'all' ? events : events.filter((e) => dayKey(e.start) === +day);

  const machines = new Map();
  const motivos = new Map();
  const byHour = new Array(24).fill(0);
  const stops = [];
  for (const e of ev) {
    const m = machines.get(e.machine) ?? { name: e.machine, prodMin: 0, stopMin: 0, count: 0, motivos: new Map() };
    machines.set(e.machine, m);
    const dur = e.end - e.start;
    if (e.type === 'prod') { m.prodMin += dur; continue; }
    const mot = e.motivo || 'SEM MOTIVO';
    m.stopMin += dur; m.count++;
    m.motivos.set(mot, (m.motivos.get(mot) ?? 0) + dur);
    const o = motivos.get(mot) ?? { motivo: mot, min: 0, count: 0 };
    o.min += dur; o.count++; motivos.set(mot, o);
    // spread the stop over the hours it covers
    for (let t = e.start; t < e.end;) {
      const next = Math.min(e.end, (Math.floor(t / 60) + 1) * 60);
      byHour[Math.floor((t % 1440) / 60)] += next - t;
      t = next;
    }
    stops.push({ machine: e.machine, motivo: mot, min: dur, ini: e.start, page: e.page, table: e.table, ri: e.ri, linha: e.linha, desc: e.desc });
  }
  const byMachine = [...machines.values()].map((m) => ({ ...m, motivos: [...m.motivos].map(([motivo, min]) => ({ motivo, min })).sort((a, b) => b.min - a.min),
    pct: m.prodMin + m.stopMin ? Math.round((m.stopMin / (m.prodMin + m.stopMin)) * 100) : 0 })).sort((a, b) => b.stopMin - a.stopMin);
  const prodMin = byMachine.reduce((s, m) => s + m.prodMin, 0), stopMin = byMachine.reduce((s, m) => s + m.stopMin, 0);
  stops.sort((a, b) => b.min - a.min);
  return {
    days, prodMin, stopMin, count: stops.length,
    pct: prodMin + stopMin ? Math.round((stopMin / (prodMin + stopMin)) * 100) : 0,
    longest: stops[0] ?? null,
    byMotivo: [...motivos.values()].sort((a, b) => b.min - a.min),
    byMachine, byHour, top: stops.slice(0, 8),
  };
}
