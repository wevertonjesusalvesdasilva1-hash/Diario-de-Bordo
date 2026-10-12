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

const nk = (v: string) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
export const semanticKey = (r: OvertimeRecord) => `${r.dataSortKey}|${String(r.chapa).trim()}|${nk(r.motivoHe)}`;

/** Mesma pessoa + dia + peça com ids diferentes = duplicata. Mantém a mais "trabalhada" (marcações/linha do tempo). */
export function dedupeRecords(items: { rec: OvertimeRecord; at?: string }[]) {
  const best = new Map<string, { rec: OvertimeRecord; at?: string }>();
  const score = (x: { rec: OvertimeRecord }) =>
    (x.rec.status !== 'Pendente' ? 10 : 0) + (x.rec.operationalStatus !== 'Aguardando início' ? 5 : 0) + (x.rec.timeline?.length ?? 0);
  items.forEach((x) => {
    const k = semanticKey(x.rec);
    const cur = best.get(k);
    if (!cur || score(x) > score(cur) || (score(x) === score(cur) && (x.at ?? '') > (cur.at ?? ''))) best.set(k, x);
  });
  const keep = [...best.values()];
  const keepIds = new Set(keep.map((x) => x.rec.id));
  return { keep: keep.map((x) => x.rec), dropIds: items.filter((x) => !keepIds.has(x.rec.id)).map((x) => x.rec.id) };
}
