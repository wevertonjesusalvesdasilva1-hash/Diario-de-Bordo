import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { OvertimeRecord } from '../types';
import { cloudEnabled, supabase } from './supabase';
import { fromRows, toRows } from './mapper';

export type SyncState = 'local' | 'signed-out' | 'syncing' | 'online' | 'offline' | 'error';

/** Sincroniza records <-> Supabase. Sem env vars, o app segue 100% local. */
export function useCloudSync(
  records: OvertimeRecord[],
  setRecords: (r: OvertimeRecord[]) => void,
) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!cloudEnabled);
  const [state, setState] = useState<SyncState>(cloudEnabled ? 'signed-out' : 'local');
  const snapshot = useRef<Map<string, string>>(new Map());
  const loaded = useRef(false);
  const recordsRef = useRef(records);
  recordsRef.current = records;

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const pull = useCallback(async () => {
    if (!supabase) return;
    setState('syncing');
    const [a, e] = await Promise.all([
      supabase.from('he_assignments').select('*'),
      supabase.from('he_timeline_events').select('*'),
    ]);
    if (a.error || e.error) return setState('error');
    if (a.data && a.data.length > 0) {
      const recs = a.data.map((row) => fromRows(row, e.data ?? []));
      snapshot.current = new Map(recs.map((r) => [r.id, JSON.stringify(r)]));
      setRecords(recs);
    }
    loaded.current = true;
    setState('online');
  }, [setRecords]);

  const push = useCallback(async () => {
    if (!supabase || !loaded.current) return;
    const changed = recordsRef.current.filter((r) => snapshot.current.get(r.id) !== JSON.stringify(r));
    if (changed.length === 0) return;
    setState('syncing');
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
    changed.forEach((r) => snapshot.current.set(r.id, JSON.stringify(r)));
    setState('online');
  }, []);

  // carga inicial após login; se a nuvem estiver vazia, o 1º push sobe os dados locais
  useEffect(() => {
    if (!session) return setState(cloudEnabled ? 'signed-out' : 'local');
    loaded.current = false;
    Promise.resolve(supabase?.rpc('he_ensure_profile')).then(() => pull()).then(() => push());
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

  return { session, ready, state, needsLogin: cloudEnabled && ready && !session };
}
