import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

const OPEN_SESSION = {} as Session;
import { OvertimeRecord } from '../types';
import { cloudEnabled, supabase } from './supabase';
import { dedupeRecords, fromRows, hasValidDate, toRows } from './mapper';

const SNAP_KEY = 'horaextra_sync_snapshot_v1';
const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h); };
const readSnap = (): Map<string, string> | null => { try { const v = localStorage.getItem(SNAP_KEY); return v ? new Map(Object.entries(JSON.parse(v))) : null; } catch { return null; } };
const writeSnap = (m: Map<string, string>) => { try { localStorage.setItem(SNAP_KEY, JSON.stringify(Object.fromEntries(m))); } catch { /* ignore */ } };

const PAGE = 1000;
/** Lê a tabela inteira em páginas de 1000 (limite do PostgREST). */
async function fetchAll(table: string, cols: string, order: string) {
  if (!supabase) return { data: [] as any[], error: null as unknown };
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).order(order).range(from, from + PAGE - 1);
    if (error) return { data: [] as any[], error };
    out.push(...((data ?? []) as any[]));
    if (!data || data.length < PAGE) break;
  }
  return { data: out, error: null as unknown };
}
const isPendingLeader = (l?: string) => !l || l === 'Não identificado' || l.includes('/');

export type SyncState = 'local' | 'signed-out' | 'syncing' | 'online' | 'offline' | 'error';

/** Sincroniza records <-> Supabase. Sem env vars, o app segue 100% local. */
export function useCloudSync(
  records: OvertimeRecord[],
  setRecords: (r: OvertimeRecord[]) => void,
) {
  // Modo aberto: sem login. O acesso anônimo é liberado por RLS (policies he_open_*).
  const session = cloudEnabled ? OPEN_SESSION : null;
  const [state, setState] = useState<SyncState>(cloudEnabled ? 'syncing' : 'local');
  const snapshot = useRef<Map<string, string>>(new Map());
  const snapSeeded = useRef(false);
  const loaded = useRef(false);
  const stateRef = useRef<SyncState>(state);
  stateRef.current = state;
  // eventos da linha do tempo que ESTE aparelho já viu na nuvem: só esses podem ser apagados no push
  const knownEvents = useRef<Map<string, Set<string>>>(new Map());
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const serial = <T,>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.current.then(fn, fn);
    queue.current = p.catch(() => undefined);
    return p;
  };
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // Importar um Excel SUBSTITUI os dados: apaga do banco o que não está na nova planilha.
  const replaceRef = useRef(false);
  const markReplace = useCallback(() => { replaceRef.current = true; }, []);
  const removeStale = async () => {
    if (!supabase || !replaceRef.current) return;
    replaceRef.current = false;
    const { data, error } = await fetchAll('he_assignments', 'id', 'id');
    if (error) { replaceRef.current = true; return; }
    const keep = new Set(recordsRef.current.map((r) => r.id));
    const extra = data.map((x) => x.id as string).filter((id) => !keep.has(id));
    for (let i = 0; i < extra.length; i += 100) await supabase.from('he_assignments').delete().in('id', extra.slice(i, i + 100));
  };

  /** Apaga TODOS os dados do banco (para recomeçar com um Excel novo). Devolve false se algo falhar. */
  const clearAll = useCallback(async () => {
    if (!supabase) return true;
    setState('syncing');
    const tabelas: [string, string][] = [['he_reallocations', 'id'], ['he_timeline_events', 'id'], ['he_assignments', 'id'], ['he_shifts', 'id'], ['he_employees', 'chapa']];
    for (const [t, col] of tabelas) {
      const { error } = await supabase.from(t).delete().neq(col, '');
      if (error) { setState('error'); return false; }
    }
    snapshot.current = new Map();
    replaceRef.current = false;
    setState('online');
    return true;
  }, []);

  const fetchAllEvents = async (assignmentIds: string[]) => {
    const out: { id: string; assignment_id: string }[] = [];
    for (let i = 0; i < assignmentIds.length; i += 100) {
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase!.from('he_timeline_events').select('id,assignment_id').in('assignment_id', assignmentIds.slice(i, i + 100)).order('id').range(from, from + PAGE - 1);
        if (error) return { data: out, error };
        out.push(...((data ?? []) as { id: string; assignment_id: string }[]));
        if (!data || data.length < PAGE) break;
      }
    }
    return { data: out, error: null as unknown };
  };

  const pullImpl = useCallback(async () => {
    if (!supabase) return;
    setState('syncing');
    const [a, e] = await Promise.all([fetchAll('he_assignments', '*', 'id'), fetchAll('he_timeline_events', '*', 'id')]);
    if (a.error || e.error) return setState('error');
    const evByAsg = new Map<string, Set<string>>();
    e.data.forEach((ev) => { const s = evByAsg.get(ev.assignment_id) ?? new Set<string>(); s.add(ev.id as string); evByAsg.set(ev.assignment_id, s); });
    evByAsg.forEach((ids, k) => { const cur = knownEvents.current.get(k) ?? new Set<string>(); ids.forEach((i) => cur.add(i)); knownEvents.current.set(k, cur); });
    // A nuvem é a fonte da verdade: se estiver vazia (ex.: depois de "Apagar todos os dados"), este aparelho também esvazia.
    const localIds = new Set(recordsRef.current.map((r) => r.id));
    const rows = replaceRef.current ? a.data.filter((row) => localIds.has(row.id as string)) : a.data; // importação em andamento: não traz de volta a planilha antiga
    const { keep: recs, dropIds } = dedupeRecords(rows.map((row) => ({ rec: fromRows(row, e.data), at: row.updated_at as string })));
    // duplicatas antigas no banco (mesma pessoa/dia/peça com outro código): limpa
    for (let i = 0; i < dropIds.length; i += 100) {
      await supabase.from('he_assignments').delete().in('id', dropIds.slice(i, i + 100)); // precisa de await: a chamada só executa quando aguardada
    }
    // Aparelho que já sincronizou antes: o que o aparelho tem e a nuvem NÃO tem (e não foi editado aqui) foi apagado em outro aparelho -> some.
    if (!snapSeeded.current) {
      snapSeeded.current = true;
      const saved = readSnap();
      // 1ª vez com esta versão: a nuvem manda; mas se ela está vazia, o que existe aqui ainda não foi enviado e sobe
      snapshot.current = saved ?? (recs.length === 0 ? new Map() : new Map(recordsRef.current.map((r) => [r.id, hash(JSON.stringify(r))])));
    }
    const local = new Map(recordsRef.current.map((r) => [r.id, r]));
    const isDirty = (r: OvertimeRecord) => snapshot.current.get(r.id) !== hash(JSON.stringify(r)); // editado/criado aqui e ainda não enviado
    const cloudIds = new Set(recs.map((r) => r.id));
    const keepLocal = (r: OvertimeRecord) => local.has(r.id) && isDirty(local.get(r.id) as OvertimeRecord);
    const mergeLocal = (r: OvertimeRecord) => {
      const mine = local.get(r.id) as OvertimeRecord;
      // líder já definido na nuvem não é desfeito por uma cópia local velha que ainda o tem pendente
      return isPendingLeader(mine.lider) && !isPendingLeader(r.lider) ? { ...mine, lider: r.lider } : mine;
    };
    const merged = [...recs.map((r) => (keepLocal(r) ? mergeLocal(r) : r)), ...recordsRef.current.filter((r) => !cloudIds.has(r.id) && isDirty(r))];
    const prev = snapshot.current;
    snapshot.current = new Map(recs.map((r) => [r.id, keepLocal(r) ? (prev.get(r.id) as string) : hash(JSON.stringify(r))]));
    recordsRef.current = merged; // o push que roda logo depois NÃO pode ler a lista antiga
    writeSnap(snapshot.current);
    setRecords(merged);
    loaded.current = true;
    setState('online');
  }, [setRecords]);

  const pushImpl = useCallback(async () => {
    if (!supabase || !loaded.current) return;
    const changed = recordsRef.current.filter((r) => hasValidDate(r) && snapshot.current.get(r.id) !== hash(JSON.stringify(r)));
    const replacing = replaceRef.current;
    if (changed.length === 0 && !replacing) return;
    setState('syncing');
    if (changed.length === 0) {
      await removeStale();
      return setState('online');
    }
    const rows = changed.map(toRows);
    const uniq = <T,>(xs: T[], k: (x: T) => string) => [...new Map(xs.map((x) => [k(x), x])).values()];
    const steps = [
      supabase.from('he_employees').upsert(uniq(rows.map((r) => r.employee), (x) => x.chapa)),
      supabase.from('he_shifts').upsert(uniq(rows.map((r) => r.shift), (x) => x.id)),
    ];
    for (const s of steps) if ((await s).error) return setState('error');
    const asg = await supabase.from('he_assignments').upsert(rows.map((r) => r.assignment));
    if (asg.error) return setState('error');
    // evento apagado localmente (lixeira / reiniciar turno) também sai da nuvem; só os que este aparelho já tinha visto
    const ids = changed.map((r) => r.id);
    const remote = await fetchAllEvents(ids);
    if (remote.error) return setState('error');
    const localEv = new Set(rows.flatMap((r) => r.events.map((x) => x.id)));
    const gone = remote.data.filter((x) => !localEv.has(x.id) && knownEvents.current.get(x.assignment_id)?.has(x.id)).map((x) => x.id);
    for (let i = 0; i < gone.length; i += 100) {
      const d = await supabase.from('he_timeline_events').delete().in('id', gone.slice(i, i + 100));
      if (d.error) return setState('error');
    }
    changed.forEach((r) => knownEvents.current.set(r.id, new Set((r.timeline || []).map((x) => x.id))));
    const ev = rows.flatMap((r) => r.events);
    if (ev.length) {
      const r = await supabase.from('he_timeline_events').upsert(ev, { ignoreDuplicates: true });
      if (r.error) return setState('error');
    }
    changed.forEach((r) => snapshot.current.set(r.id, hash(JSON.stringify(r))));
    writeSnap(snapshot.current);
    await removeStale();
    setState('online');
  }, []);

  const pull = useCallback(() => serial(async () => { try { await pullImpl(); } catch { setState(navigator.onLine ? 'error' : 'offline'); } }), [pullImpl]);
  const push = useCallback(() => serial(async () => { try { await pushImpl(); } catch { setState(navigator.onLine ? 'error' : 'offline'); } }), [pushImpl]);
  /** Se a carga inicial ainda não aconteceu, puxa primeiro; depois sempre envia o que está pendente. */
  const resync = useCallback(async () => { await pull(); await push(); }, [pull, push]);

  // carga inicial após login; se a nuvem estiver vazia, o 1º push sobe os dados locais
  useEffect(() => {
    if (!session) return;
    loaded.current = false;
    resync();
  }, [session, resync]);

  // push com debounce a cada mudança
  useEffect(() => {
    if (!session || !loaded.current) return;
    const t = setTimeout(push, 1200);
    return () => clearTimeout(t);
  }, [records, session, push]);

  // tempo real: outro aparelho mudou algo
  useEffect(() => {
    if (!supabase || !session) return;
    let t: ReturnType<typeof setTimeout>;
    const ch = supabase
      .channel('ora-extra-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'he_assignments' }, () => {
        clearTimeout(t);
        t = setTimeout(pull, 600);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'he_timeline_events' }, () => {
        clearTimeout(t);
        t = setTimeout(pull, 600);
      })
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase!.removeChannel(ch);
    };
  }, [session, pull]);

  // offline-first: ao voltar o sinal / reabrir a aba / a cada 30s com erro, puxa e reenvia sem precisar recarregar
  useEffect(() => {
    if (!session) return;
    const on = () => { resync(); };
    const off = () => setState('offline');
    const vis = () => { if (document.visibilityState === 'visible') resync(); };
    const timer = setInterval(() => {
      if (!loaded.current || stateRef.current === 'error' || stateRef.current === 'offline') resync();
    }, 30000);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    document.addEventListener('visibilitychange', vis);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      document.removeEventListener('visibilitychange', vis);
    };
  }, [session, resync]);

  return { session: null as Session | null, ready: true, state, needsLogin: false, markReplace, clearAll };
}
