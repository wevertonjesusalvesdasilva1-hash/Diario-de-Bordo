// POST /api/work { job, host } — runs the background reading of one upload (see _worker.js).
// It answers at once and goes on working after the answer (waitUntil), then calls itself again for the rest, so
// the reading goes on with the browser closed.
import { waitUntil } from '@vercel/functions';
import { checkAccess } from './_auth.js';
import { processJob, JOB_RE } from './_worker.js';
import { kick } from './_kick.js';

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(job, host) {
  const t0 = Date.now();
  try {
    const r = await processJob(job);
    if (r.more) {
      // Gemini is busy or out of quota: wait before trying again, as long as this invocation (300 s) still allows
      if (r.wait) await sleep(Math.max(0, Math.min(r.wait * 1000, 275_000 - (Date.now() - t0))));
      await kick(job, host);
    }
  } catch (e) { console.error('worker', job, e?.message); await kick(job, host, 60).catch(() => {}); }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  const { job, host } = req.body ?? {};
  if (!JOB_RE.test(String(job))) return send(res, 400, { error: 'job inválido' });
  waitUntil(run(job, host));
  return send(res, 202, { ok: true });
}
