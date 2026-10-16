import { cloudEnabled, supabase } from './supabase';

/** Memória do sistema: definições do usuário (líderes definidos, classificação padrão...) guardadas no banco. */
export async function loadSetting<T>(key: string): Promise<T | null> {
  if (!cloudEnabled || !supabase) return null;
  try {
    const { data } = await supabase.from('he_settings').select('value').eq('key', key).maybeSingle();
    return (data?.value as T) ?? null;
  } catch {
    return null;
  }
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  if (!cloudEnabled || !supabase) return;
  try {
    await supabase.from('he_settings').upsert({ key, value, updated_at: new Date().toISOString() });
  } catch {
    // offline: a próxima mudança grava de novo
  }
}

/** Lê a linha da nuvem, mescla {...remoto, ...patch}, grava e devolve o objeto mesclado (não perde escolhas de outro aparelho). */
export async function mergeSetting<T extends Record<string, unknown>>(key: string, patch: T): Promise<T> {
  const remote = (await loadSetting<Record<string, unknown>>(key)) ?? {};
  const merged = { ...remote, ...patch } as T;
  await saveSetting(key, merged);
  return merged;
}
