// Dashboard numbers: stopped time by motive and by machine, built on the same events as the analysis.
import { buildEvents } from './analysis.js';
import { groupOf } from './lists.js';
import { clockMin, clockOf } from './optime.js';

const dayNum = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s ?? ''); return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) / 864e5 : null; };
const dayKey = (e) => dayNum(e.day) ?? 0;
const dayLabel = (k) => { const d = new Date(k * 864e5); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };

export function buildPanel(pages, { group = 'all', day = 'all' } = {}) {
  const sel = pages.filter((p) => group === 'all' || groupOf(p.machine) === group);
  const { events } = buildEvents(sel);
  const days = [...new Set(events.map((e) => dayKey(e)))].sort((a, b) => a - b).map((k) => ({ key: k, label: dayLabel(k) }));
  const ev = day === 'all' ? events : events.filter((e) => dayKey(e) === +day);

  const machines = new Map();
  const motivos = new Map();
  const byHour = new Array(24).fill(0);
  const turnos = new Map();
  const stops = [];
  const heat = new Map(); // machine → minutes stopped in each clock hour
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
    const tk = e.turno || '?'; turnos.set(tk, (turnos.get(tk) ?? 0) + dur);
    // spread the stop over the hours it covers
    const perHour = {};
    const row = heat.get(e.machine) ?? new Array(24).fill(0);
    heat.set(e.machine, row);
    for (let t = e.start; t < e.end;) {
      const next = Math.min(e.end, t + (60 - (clockMin(t) % 60)));
      const hr = Math.floor(clockMin(t) / 60);
      byHour[hr] += next - t; row[hr] += next - t; perHour[hr] = (perHour[hr] ?? 0) + (next - t);
      t = next;
    }
    stops.push({ machine: e.machine, motivo: mot, min: dur, ini: e.start, clock: clockOf(e.start), turno: e.turno || '?', chapa: e.chapa || '', day: e.day || '', perHour, page: e.page, table: e.table, ri: e.ri, linha: e.linha, desc: e.desc });
  }
  const byMachine = [...machines.values()].map((m) => ({ ...m, motivos: [...m.motivos].map(([motivo, min]) => ({ motivo, min })).sort((a, b) => b.min - a.min),
    pct: m.prodMin + m.stopMin ? Math.round((m.stopMin / (m.prodMin + m.stopMin)) * 100) : 0 })).sort((a, b) => b.stopMin - a.stopMin);
  const prodMin = byMachine.reduce((s, m) => s + m.prodMin, 0), stopMin = byMachine.reduce((s, m) => s + m.stopMin, 0);
  stops.sort((a, b) => b.min - a.min);
  return {
    days, prodMin, stopMin, count: stops.length,
    prodPct: prodMin + stopMin ? Math.round((prodMin / (prodMin + stopMin)) * 100) : 0,
    all: stops,
    heat: byMachine.map((m) => ({ machine: m.name, hours: heat.get(m.name) ?? new Array(24).fill(0) })),
    pct: prodMin + stopMin ? Math.round((stopMin / (prodMin + stopMin)) * 100) : 0,
    longest: stops[0] ?? null,
    byMotivo: (() => { let acc = 0; const list = [...motivos.values()].sort((a, b) => b.min - a.min); return list.map((x) => { acc += x.min; return { ...x, acc: stopMin ? Math.round((acc / stopMin) * 100) : 0 }; }); })(),
    byTurno: [...turnos].sort((a, b) => String(a[0]).localeCompare(String(b[0]))).map(([turno, min]) => ({ turno, min })),
    byMachine, byHour, top: stops.slice(0, 8),
  };
}
