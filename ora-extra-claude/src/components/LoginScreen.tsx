import { useState } from 'react';
import { supabase } from '../lib/supabase';

const toEmail = (u: string) =>
  `${u.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9._-]/g, '')}@horaextra.local`;

export default function LoginScreen() {
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setMsg('');
    const { error } =
      mode === 'in'
        ? await supabase.auth.signInWithPassword({ email: toEmail(user), password })
        : await supabase.auth.signUp({ email: toEmail(user), password });
    if (error) setMsg(error.message);
    else if (mode === 'up') {
      const r = await supabase.auth.signInWithPassword({ email: toEmail(user), password });
      if (r.error) setMsg('Conta criada. Entre com usuário e senha.');
    }
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-xl font-bold">Hora Extra</h1>
        <p className="text-sm text-slate-400">Entre com seu usuário para sincronizar o turno em tempo real.</p>
        <input className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2" type="text" required autoCapitalize="none" autoComplete="username" placeholder="Usuário (ex.: joao.silva)" value={user} onChange={(e) => setUser(e.target.value)} />
        <input className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2" type="password" required minLength={6} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
        <button disabled={busy} className="w-full rounded-lg bg-emerald-500 py-2 font-semibold text-slate-950 disabled:opacity-60">
          {mode === 'in' ? 'Entrar' : 'Criar conta'}
        </button>
        {msg && <p className="text-sm text-amber-400">{msg}</p>}
        <button type="button" className="text-sm text-slate-400 underline" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>
          {mode === 'in' ? 'Criar conta' : 'Já tenho conta'}
        </button>
      </form>
    </div>
  );
}
