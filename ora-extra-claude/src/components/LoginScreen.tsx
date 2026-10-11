import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
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
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password });
    if (error) setMsg(error.message);
    else if (mode === 'up') setMsg('Conta criada. Confirme o e-mail (se exigido) e entre.');
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
        <h1 className="text-xl font-bold">Hora Extra Claude</h1>
        <p className="text-sm text-slate-400">Entre para sincronizar o turno em tempo real.</p>
        <input className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2" type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
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
