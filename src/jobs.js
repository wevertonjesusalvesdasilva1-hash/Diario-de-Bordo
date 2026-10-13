// Background reading: the browser prepares each sheet and uploads it; the server reads it with Gemini even
// with this tab closed (see api/_worker.js). Here: the upload and the questions "how far did it get?".
import { apiGet, apiSend } from './api.js';

export const newJobId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-7);

const json = async (r) => r.json().catch(() => ({}));

// can the server read in the background? (false when the private storage is not set up)
export async function jobsAvailable() {
  try { const r = await apiGet('/api/jobs?job=probe0000'); return r.ok; } catch { return false; }
}

async function send(body) {
  const r = await apiSend('POST', '/api/jobs', body);
  if (!r.ok) throw new Error((await json(r)).error || `Erro ${r.status} ao enviar a folha`);
}

// one prepared sheet (images and row strips) in pieces small enough for one request each
export async function uploadSheet(job, n, total, prep, hints) {
  await send({ op: 'part', job, n, part: 'ab', data: { A: prep.A, B: prep.B, rowInk: prep.rowInk ?? null, bubble: prep.bubble ?? '', hints } });
  await send({ op: 'part', job, n, part: 'prod', data: prep.strips?.prod ?? [] });
  await send({ op: 'part', job, n, part: 'stops', data: prep.strips?.stops ?? [] });
  await send({ op: 'ready', job, n, total });
}

export async function jobStatus(job) {
  const r = await apiGet(`/api/jobs?job=${job}`);
  return r.ok ? json(r) : null;
}
export async function jobResult(job, n) {
  const r = await apiGet(`/api/jobs?job=${job}&page=${n}`);
  return r.ok ? json(r) : null;
}
export const kickJob = (job) => apiSend('POST', '/api/jobs', { op: 'kick', job }).catch(() => {});
export const cancelJob = (job) => apiSend('POST', '/api/jobs', { op: 'cancel', job }).catch(() => {});
