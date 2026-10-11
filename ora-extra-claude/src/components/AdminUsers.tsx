import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

type Profile = { id: string; email: string; role: string; leader_name: string | null };

/** Painel mínimo do admin: define papel e nome do líder de cada usuário. */
export default function AdminUsers() {
  const [open, setOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rows, setRows] = useState<Profile[]>([]);

  const load = async () => {
    if (!supabase) return;
    const { data } = await supabase.from('he_profiles').select('id,email,role,leader_name').order('email');
    setRows((data as Profile[]) ?? []);
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      const uid = data.user?.id;
      if (!uid) return;
      const me = await supabase!.from('he_profiles').select('role').eq('id', uid).single();
      setIsAdmin(me.data?.role === 'admin');
    });
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open]);

  if (!isAdmin) return null;

  const save = async (r: Profile) => {
    await supabase!.from('he_profiles').update({ role: r.role, leader_name: r.leader_name || null }).eq('id', r.id);
    load();
  };
  const edit = (id: string, patch: Partial<Profile>) => setRows((x) => x.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  return (
    <>
      <button onClick={() => setOpen(true)} className="fixed bottom-2 left-2 z-50 rounded-full bg-slate-900/90 border border-slate-700 px-2.5 py-1 text-[10px] font-semibold text-slate-300">
        Usuários
      </button>
      {open && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end sm:items-center justify-center p-3" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-2xl bg-slate-900 border border-slate-700 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-bold">Usuários e papéis</h2>
            {rows.map((r) => (
              <div key={r.id} className="space-y-1 border-b border-slate-800 pb-2">
                <div className="text-xs text-slate-400">{r.email}</div>
                <div className="flex gap-2">
                  <select className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" value={r.role} onChange={(e) => edit(r.id, { role: e.target.value })}>
                    <option value="leader">líder</option>
                    <option value="manager">gerente</option>
                    <option value="admin">admin</option>
                  </select>
                  <input className="flex-1 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm" placeholder="Nome do líder (como na planilha)" value={r.leader_name ?? ''} onChange={(e) => edit(r.id, { leader_name: e.target.value })} />
                  <button className="rounded bg-emerald-500 px-3 text-sm font-semibold text-slate-950" onClick={() => save(r)}>OK</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
