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
