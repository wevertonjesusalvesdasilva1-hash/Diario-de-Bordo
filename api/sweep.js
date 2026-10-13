// Daily safety net (Vercel cron, see vercel.json): wakes up every upload that is still being read, e.g. the ones
// that were parked because the daily Gemini quota ran out. Only Vercel's cron may call it (CRON_SECRET).
import { timingSafeEqual } from 'node:crypto';
import { activeJobs, jobMeta } from './_worker.js';
import { kick } from './_kick.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const got = String(req.headers.authorization ?? '');
  const want = `Bearer ${secret}`;
  if (!secret || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return res.status(401).json({ error: 'não autorizado' });
  const jobs = await activeJobs();
  let woke = 0;
  for (const job of jobs) { const meta = await jobMeta(job); if (meta?.host && await kick(job, meta.host)) woke++; }
  return res.status(200).json({ jobs: jobs.length, woke });
}
