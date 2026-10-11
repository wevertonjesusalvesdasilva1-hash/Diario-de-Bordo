import { OvertimeRecord, TimelineEvent } from '../types';
import { normalizeOvertimeRecord } from '../data/realSampleData';
import { refreshCompositeLeader } from '../data/leaderDatabase';

const toIso = (r: OvertimeRecord) => (r.dataSortKey && /^\d{4}-\d{2}-\d{2}$/.test(r.dataSortKey) ? r.dataSortKey : null);

export function shiftId(r: OvertimeRecord) {
  return `${r.dataSortKey}|${r.local || '-'}`;
}

export function toRows(r: OvertimeRecord) {
  const { timeline, ...rest } = r;
  return {
    employee: { chapa: r.chapa || r.id, nome: r.funcionario, lider: r.lider, gestor: r.gestor },
    shift: { id: shiftId(r), data: toIso(r), local: r.local, cc: r.cc },
    assignment: {
      id: r.id,
      shift_id: shiftId(r),
      chapa: r.chapa || r.id,
      lider: r.lider,
      peca: r.motivoHe,
      de: r.de,
      ate: r.ate,
      presenca: r.status,
      status_operacional: r.operationalStatus,
      qty_planned: r.qtyPlanned,
      qty_actual: r.qtyActual,
      payload: rest,
      updated_at: new Date().toISOString(),
    },
    events: (timeline || []).map((e: TimelineEvent) => ({
      id: e.id,
      assignment_id: r.id,
      hora: e.time,
      tipo: e.type ?? null,
      descricao: e.description,
    })),
  };
}

export function fromRows(a: any, events: any[]): OvertimeRecord {
  const timeline: TimelineEvent[] = events
    .filter((e) => e.assignment_id === a.id)
    .map((e) => ({ id: e.id, time: e.hora, description: e.descricao, type: e.tipo ?? undefined }))
    .sort((x, y) => x.time.localeCompare(y.time));
  return refreshCompositeLeader(normalizeOvertimeRecord({ ...a.payload, id: a.id, timeline }, 0));
}
