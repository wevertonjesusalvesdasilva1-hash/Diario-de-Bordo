// Client for the serverless reader (/api/extract). The Gemini key never reaches the browser.
import { apiPost } from '../api.js';

const RETRY = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function readSheet({ images, pass, hints, extra }) {
  for (let i = 0; ; i++) {
    let res, body = {};
    try {
      res = await apiPost('/api/extract', { images, pass, hints, ...(extra ?? {}) });
      body = await res.json().catch(() => ({}));
    } catch (e) {
      if (i >= 2) throw new Error('Sem conexão com o servidor de leitura');
      await sleep(4000 * (i + 1)); continue;
    }
    if (res.status === 401) { const e = new Error('Código de acesso necessário'); e.auth = true; throw e; }
    if (res.ok && body.data) { try { window.dispatchEvent(new CustomEvent('gemini-model', { detail: { used: body.model } })); } catch { /* not in a browser */ } return body.data; }
    const hard = /Limite .*Gemini|diário|por dia|GEMINI_API_KEY/i.test(body.error ?? ''); // no point retrying a spent quota
    if (!RETRY.has(res.status) || hard || i >= 3) { const e = new Error(body.error || `Erro ${res.status} no servidor de leitura`); e.quota = res.status === 429 && /Limite .*Gemini/i.test(body.error ?? ''); throw e; }
    await sleep(10000 * (i + 1));
  }
}
