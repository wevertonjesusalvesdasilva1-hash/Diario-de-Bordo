// Live sharing between PCs ("Sincronizar com a equipe"). Whoever changes something saves the light state
// (no images) and, once per sheet, its images; the others look for news every few seconds and update.
// Last save wins: if two people save at the same time the second one receives the first and is told.
import { apiGet, apiSend } from './api.js';
import { splitForShare, mergeRemote, missingAssets } from './core/share.js';

const KEY = 'mt-sync';
export const syncWanted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
const remember = (on) => { try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* private mode */ } };

// h = { getPages(), getMeta(), apply({ pages, meta }), status(kind, text), toast(text), ask(text) → boolean }
export function createSync(h) {
  let on = false, rev = 0, pollT = 0, pushT = 0, working = false, dirty = false, applying = false;
  const uploaded = new Set(), cache = {};

  const fetchJson = async (path) => { const r = await apiGet(path); return { r, body: await r.json().catch(() => ({})) }; };
  const unavailable = (r, body) => {
    if (r.status === 503) { h.status('off', 'Sincronização ainda não foi ligada no servidor'); return true; }
    if (r.status === 401) { h.status('off', 'Digite o código de acesso para sincronizar'); return true; }
    if (!r.ok) { h.status('warn', body.error || `Sem conexão (${r.status})`); return true; }
    return false;
  };

  // local images → cache, so a remote update never throws them away
  const keepLocal = () => {
    const { assets } = splitForShare(h.getPages());
    for (const [sid, a] of Object.entries(assets)) { cache[sid] = a; uploaded.add(sid); }
  };

  async function applyRemote(state, newRev) {
    keepLocal();
    rev = newRev;
    applying = true;
    try {
      let pages = mergeRemote(state.pages ?? [], cache);
      h.apply({ pages, meta: state });
      const missing = missingAssets(pages);
      for (const sid of missing) {
        const [s, t] = await Promise.all([fetchJson(`/api/sync?asset=${sid}.sheet`), fetchJson(`/api/sync?asset=${sid}.strips`)]);
        cache[sid] = { sheet: s.body?.sheet ?? null, strips: t.body?.strips ?? { prod: {}, stops: {} } };
        uploaded.add(sid);
      }
      if (missing.length) { pages = mergeRemote(state.pages ?? [], cache); h.apply({ pages, meta: state }); }
    } finally { applying = false; }
  }

  async function uploadAssets(assets) {
    for (const [sid, a] of Object.entries(assets)) {
      if (uploaded.has(sid)) continue;
      const r1 = await apiSend('PUT', `/api/sync?asset=${sid}.sheet`, { sheet: a.sheet });
      const r2 = await apiSend('PUT', `/api/sync?asset=${sid}.strips`, { strips: a.strips });
      if (!r1.ok || !r2.ok) throw new Error('Não consegui enviar as imagens da folha');
      uploaded.add(sid);
    }
  }

  async function push() {
    if (!on || working) return;
    working = true; dirty = false;
    try {
      h.status('busy', 'Enviando…');
      const { lite, assets } = splitForShare(h.getPages());
      await uploadAssets(assets);
      const r = await apiSend('PUT', '/api/sync', { baseRev: rev, state: { pages: lite, ...h.getMeta() } });
      const body = await r.json().catch(() => ({}));
      if (r.status === 409) {
        await applyRemote(body.state ?? { pages: [] }, body.rev);
        h.toast('Um colega salvou ao mesmo tempo. Atualizei com a versão dele; se sua última alteração sumiu, refaça.');
      } else if (!r.ok) { h.status('warn', body.error || `Erro ${r.status}`); return; }
      else rev = body.rev;
      h.status('ok', 'Sincronizado');
    } catch (e) { h.status('warn', e.message); } finally { working = false; if (dirty) schedulePush(); }
  }
  const schedulePush = () => { clearTimeout(pushT); pushT = setTimeout(push, 1500); };

  async function poll() {
    if (!on) return;
    if (!working && !dirty && !applying && !h.busy?.()) {
      try {
        const { r, body } = await fetchJson(`/api/sync?rev=${rev}`);
        if (!unavailable(r, body)) {
          if (body.state && body.rev !== rev) { await applyRemote(body.state, body.rev); h.status('ok', 'Atualizado agora'); }
          else h.status('ok', 'Sincronizado');
        }
      } catch { h.status('warn', 'Sem conexão'); }
    }
    pollT = setTimeout(poll, document.hidden ? 15000 : 3500);
  }

  return {
    get on() { return on; },
    get applying() { return applying; },
    // called whenever the local state is saved
    changed() { if (on && !applying) { dirty = true; schedulePush(); } },
    async start() {
      if (on) return;
      h.status('busy', 'Conectando…');
      const { r, body } = await fetchJson('/api/sync');
      if (unavailable(r, body)) return false;
      on = true; remember(true);
      const local = h.getPages().filter((p) => p.status === 'ok' || p.status === 'erro').length;
      if (body.state && body.state.pages?.length) {
        if (!local || h.ask(`Já existe uma leitura da equipe (${body.state.pages.length} folha(s)). Usar a da equipe? Isso substitui o que está na sua tela. Cancelar envia a sua.`)) await applyRemote(body.state, body.rev);
        else { rev = body.rev; dirty = true; await push(); }
      } else { rev = body.rev ?? 0; if (local) { dirty = true; await push(); } }
      h.status('ok', 'Sincronizado'); poll();
      return true;
    },
    stop() { on = false; remember(false); clearTimeout(pollT); clearTimeout(pushT); h.status('off', 'Sincronização desligada'); },
  };
}
