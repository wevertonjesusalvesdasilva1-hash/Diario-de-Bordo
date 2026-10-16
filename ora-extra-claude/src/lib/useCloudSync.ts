import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

const OPEN_SESSION = {} as Session;
import { OvertimeRecord } from '../types';
import { cloudEnabled, supabase } from './supabase';
import { dedupeRecords, fromRows, toRows } from './mapper';

const SNAP_KEY = 'horaextra_sync_snapshot_v1';
const hash = (t: string) => { let h = 5381; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; return String(h); };
const readSnap = (): Map<string, string> | null => { try { const v = localStorage.getItem(SNAP_KEY); return v ? new Map(Object.entries(JSON.parse(v))) : null; } catch { return null; } };
const writeSnap = (m: Map<string, string>) => { try { localStorage.setItem(SNAP_KEY, JSON.stringify(Object.fromEntries(m))); } catch { /* ignore */ } };

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
  const recordsRef = useRef(records);
  recordsRef.current = records;

  // Importar um Excel SUBSTITUI os dados: apaga do banco o que não está na nova planilha.
  const replaceRef = useRef(false);
  const markReplace = useCallback(() => { replaceRef.current = true; }, []);
  const removeStale = async () => {
    if (!supabase || !replaceRef.current) return;
    replaceRef.current = false;
    const { data } = await supabase.from('he_assignments').select('id');
    const keep = new Set(recordsRef.current.map((r) => r.id));
    const extra = (data ?? []).map((x) => x.id as string).filter((id) => !keep.has(id));
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

  const pull = useCallback(async () => {
    if (!supabase) return;
    setState('syncing');
    const [a, e] = await Promise.all([
      supabase.from('he_assignments').select('*'),
      supabase.from('he_timeline_events').select('*'),
    ]);
    if (a.error || e.error) return setState('error');
    // A nuvem é a fonte da verdade: se estiver vazia (ex.: depois de "Apagar todos os dados"), este aparelho também esvazia.
    const { keep: recs, dropIds } = dedupeRecords((a.data ?? []).map((row) => ({ rec: fromRows(row, e.data ?? []), at: row.updated_at as string })));
    // duplicatas antigas no banco (mesma pessoa/dia/peça com outro código): limpa
    for (let i = 0; i < dropIds.length; i += 100) {
      await supabase.from('he_assignments').delete().in('id', dropIds.slice(i, i + 100)); // precisa de await: a chamada só executa quando aguardada
    }
    // Aparelho que já sincronizou antes: o que o aparelho tem e a nuvem NÃO tem (e não foi editado aqui) foi apagado em outro aparelho -> some.
    if (!snapSeeded.current) {
      snapSeeded.current = true;
      const saved = readSnap();
      snapshot.current = saved ?? new Map(recordsRef.current.map((r) => [r.id, hash(JSON.stringify(r))])); // 1ª vez com esta versão: a nuvem manda
    }
    const local = new Map(recordsRef.current.map((r) => [r.id, r]));
    const isDirty = (r: OvertimeRecord) => snapshot.current.get(r.id) !== hash(JSON.stringify(r)); // editado/criado aqui e ainda não enviado
    const cloudIds = new Set(recs.map((r) => r.id));
    const keepLocal = (r: OvertimeRecord) => local.has(r.id) && isDirty(local.get(r.id) as OvertimeRecord);
    const merged = [...recs.map((r) => (keepLocal(r) ? (local.get(r.id) as OvertimeRecord) : r)), ...recordsRef.current.filter((r) => !cloudIds.has(r.id) && isDirty(r))];
    const prev = snapshot.current;
    snapshot.current = new Map(recs.map((r) => [r.id, keepLocal(r) ? (prev.get(r.id) as string) : hash(JSON.stringify(r))]));
    recordsRef.current = merged; // o push que roda logo depois NÃO pode ler a lista antiga
    writeSnap(snapshot.current);
    setRecords(merged);
    loaded.current = true;
    setState('online');
  }, [setRecords]);

  const push = useCallback(async () => {
    if (!supabase || !loaded.current) return;
    const changed = recordsRef.current.filter((r) => snapshot.current.get(r.id) !== hash(JSON.stringify(r)));
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

  // carga inicial após login; se a nuvem estiver vazia, o 1º push sobe os dados locais
  useEffect(() => {
    if (!session) return;
    loaded.current = false;
    pull().then(() => push());
  }, [session, pull, push]);

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

  // offline-first: reenvia ao voltar o sinal
  useEffect(() => {
    const on = () => session && push();
    const off = () => session && setState('offline');
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, [session, push]);

  return { session: null as Session | null, ready: true, state, needsLogin: false, markReplace, clearAll };
}
