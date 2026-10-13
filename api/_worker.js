// Background reading of the sheets of one upload ("job"), so the person can close the tab: the browser prepares
// each sheet and uploads it; this worker reads it with Gemini (passes A, B and, where they disagree, C) and
// stores the raw answers. The browser builds the rows when it opens again. Layout in the private store:
//   jobs/<job>/meta.json            { total, at, host }
//   jobs/<job>/in/<n>.<part>.json   uploaded by the browser: ab (images A/B, rowInk, bubble, hints), prod, stops, ready
//   jobs/<job>/part/<n>.A|B.json    a pass that already answered (so a retry only repeats the missing one)
//   jobs/<job>/out/<n>.json         { A, B, C, ask, models } — the result of one sheet
//   jobs/<job>/err/<n>.json         { error }
//   jobs/<job>/status.json          { ready, done, failed, working, wait, updated } — what the browser polls
import { getStore } from './_store.js';
import { readPass, modelChain } from './_read.js';
import { reconcile, alignJson, collectAsk } from '../src/core/rows.js';
import { setActiveGroup, groupOf } from '../src/core/lists.js';
import { normMachine } from '../src/core/rows.js';

export const JOB_RE = /^[a-z0-9]{8,24}$/;
const MAX_AGE_MS = 48 * 3600_000; // a job nobody could read in 48 hours is given up (the daily quota renews meanwhile)
const PARK_AFTER_MS = 30 * 60_000; // out of quota for this long: stop retrying every few minutes, the daily sweep (api/sweep.js) or the next visit resumes it
const LEASE_MS = 290_000;
const PASS_DEADLINE = 70_000; // one pass; a sheet takes at most A/B (70 s) + C (70 s), so a batch started before 90 s ends before 240 s
const FATAL = new Set([400, 401, 403]);

const path = (job, ...rest) => `jobs/${job}/${rest.join('/')}`;
async function readJson(p) { const t = await getStore().read(p); if (!t) return null; try { return JSON.parse(t); } catch { return null; } }
const writeJson = (p, v) => getStore().write(p, JSON.stringify(v));

export async function jobStatus(job) {
  return (await readJson(path(job, 'status.json'))) ?? { ready: [], done: [], failed: {}, working: false, updated: 0 };
}

// every page that was uploaded completely, and what became of it
async function scan(job) {
  const names = await getStore().list(path(job, ''));
  const nums = (re) => names.map((n) => n.match(re)?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  return { ready: nums(/\/in\/(\d+)\.ready\.json$/), done: nums(/\/out\/(\d+)\.json$/), failed: nums(/\/err\/(\d+)\.json$/) };
}

async function readOnePage(job, n) {
  const ab = await readJson(path(job, 'in', `${n}.ab.json`));
  if (!ab?.A || !ab?.B) throw Object.assign(new Error('Folha enviada incompleta'), { status: 400 });
  const got = {}, models = [];
  const todo = [];
  for (const pass of ['A', 'B']) {
    const prev = await readJson(path(job, 'part', `${n}.${pass}.json`));
    if (prev) got[pass] = prev.data; else todo.push(pass);
  }
  const results = await Promise.allSettled(todo.map((pass) => readPass({ images: ab[pass], pass, hints: ab.hints }, { deadlineMs: PASS_DEADLINE })));
  let failure = null;
  for (let i = 0; i < todo.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') { got[todo[i]] = r.value.data; models.push(r.value.model); await writeJson(path(job, 'part', `${n}.${todo[i]}.json`), { data: r.value.data }); }
    else failure = r.reason;
  }
  // one pass failed for a reason that may pass (quota, busy): wait and repeat only that pass. Only a fatal error accepts a single reading.
  if (failure && !FATAL.has(failure.status) && !(got.A && got.B)) throw failure;
  const single = !(got.A && got.B);
  if (!got.A && !got.B) throw failure ?? new Error('Sem leitura');
  let C = null, askCount = 0;
  if (!single) {
    setActiveGroup(groupOf(ab.bubble || normMachine(got.A.maquina ?? got.B.maquina)));
    const json = reconcile(got.A, got.B);
    alignJson(json, ab.rowInk);
    const ask = collectAsk(json);
    if (ask.length) {
      const [prod, stops] = await Promise.all([readJson(path(job, 'in', `${n}.prod.json`)), readJson(path(job, 'in', `${n}.stops.json`))]);
      const withStrip = ask.filter((x) => (x.tabela === 'prod' ? prod : stops)?.[x.linha - 1]);
      if (withStrip.length) {
        try {
          const images = withStrip.map((x) => (x.tabela === 'prod' ? prod : stops)[x.linha - 1].split(',')[1]);
          const r = await readPass({ images, pass: 'C', hints: ab.hints, ask: withStrip }, { deadlineMs: PASS_DEADLINE });
          C = r.data.respostas ?? null; askCount = withStrip.length; models.push(r.model);
        } catch (e) { /* the two readings stand; the divergences stay flagged for the person */ }
      }
    }
  }
  return { A: got.A ?? null, B: got.B ?? null, C, ask: askCount, single, models, primary: modelChain(false)[0] };
}

// the list of jobs still being read, so the daily sweep knows what to wake up
const ACTIVE = 'jobs/_active.json';
export async function setActive(job, on) {
  const list = (await readJson(ACTIVE)) ?? [];
  const has = list.includes(job);
  if (on === has) return;
  await writeJson(ACTIVE, on ? [...list, job] : list.filter((j) => j !== job));
}
export const activeJobs = async () => (await readJson(ACTIVE)) ?? [];
export const jobMeta = (job) => readJson(path(job, 'meta.json'));

const retriable = (e) => !FATAL.has(e?.status) && !e?.config;

// Reads what is pending, for about `budgetMs`. → { more, wait } : `more` = something is left, `wait` = seconds to wait before the next try
export async function processJob(job, { budgetMs = 90_000 } = {}) {
  if (!JOB_RE.test(job)) throw new Error('job inválido');
  const store = getStore();
  if (await readJson(path(job, 'cancel.json'))) return { more: false, cancelled: true }; // the person replaced or cleared this upload
  const lease = await readJson(path(job, 'lease.json'));
  if (lease && lease.until > Date.now()) return { busy: true, more: false };
  const t0 = Date.now();
  await writeJson(path(job, 'lease.json'), { until: t0 + LEASE_MS });
  let wait = 0;
  try {
    const meta = (await readJson(path(job, 'meta.json'))) ?? {};
    const expired = meta.at && t0 - meta.at > MAX_AGE_MS;
    let s = await scan(job);
    const prevStatus = (await readJson(path(job, 'status.json'))) ?? {};
    let quota = prevStatus.quota ?? null, quotaSince = prevStatus.quotaSince ?? null, lastModel = prevStatus.lastModel ?? null, primary = prevStatus.primary ?? null;
    const failed = {};
    for (const n of s.failed) failed[n] = (await readJson(path(job, 'err', `${n}.json`)))?.error ?? 'Erro';
    const pending = () => s.ready.filter((n) => !s.done.includes(n) && !s.failed.includes(n));
    const save = (working) => writeJson(path(job, 'status.json'), { total: meta.total ?? null, ready: s.ready, done: s.done, failed, working, wait, quota, quotaSince, lastModel, primary, updated: Date.now() });
    await save(true);
    while (pending().length && Date.now() - t0 < budgetMs && !wait && !(await readJson(path(job, 'cancel.json')))) {
      const batch = pending().slice(0, 2);
      await Promise.all(batch.map(async (n) => {
        try {
          if (expired) throw Object.assign(new Error('A leitura não terminou em 48 horas. Envie o arquivo de novo.'), { status: 400 });
          const out = await readOnePage(job, n);
          await writeJson(path(job, 'out', `${n}.json`), out);
          s.done.push(n); lastModel = out.models?.at(-1) ?? lastModel; primary = out.primary ?? primary; quota = null; quotaSince = null;
        } catch (e) {
          if (retriable(e)) { wait = Math.max(wait, e.status === 429 ? 300 : 90); quota = quotaInfo(e) ?? quota; if (quota && !quotaSince) quotaSince = Date.now(); }
          else { failed[n] = String(e.message).slice(0, 200); await writeJson(path(job, 'err', `${n}.json`), { error: failed[n] }); s.failed.push(n); }
        }
      }));
      await save(true);
    }
    const fresh = await scan(job); // pages uploaded while we were reading
    s = { ready: fresh.ready, done: [...new Set([...s.done, ...fresh.done])], failed: [...new Set([...s.failed, ...fresh.failed])] };
    const left = pending().length > 0;
    // out of quota for the day (or for a long time): park the job instead of retrying every few minutes
    const parked = left && quota && (quota.kind === 'dia' || (quota.kind === 'cota' && quotaSince && Date.now() - quotaSince > PARK_AFTER_MS));
    await save(false);
    await setActive(job, left);
    return { more: left && !parked, wait, parked: !!parked };
  } finally {
    await writeJson(path(job, 'lease.json'), { until: 0 });
  }
}

// What the Gemini answers say when no model could read: is it the daily limit, the per-minute one, or just overload?
export function quotaInfo(e) {
  const t = e?.trace ?? [];
  const q = t.filter((x) => x.status === 429);
  if (!q.length) return t.some((x) => x.status === 503) ? { kind: 'ocupado', detail: 'O Gemini está sobrecarregado (erro 503).' } : null;
  const text = q.map((x) => x.why ?? '').join(' ');
  const metric = text.match(/quotaId\W+([\w-]+)/)?.[1] ?? text.match(/metric:?\s*([\w./-]+)/)?.[1] ?? '';
  const day = /PerDay|per day|daily/i.test(text) || /PerDay/i.test(metric);
  const minute = /PerMinute|per minute/i.test(text) || /PerMinute/i.test(metric);
  return { kind: day ? 'dia' : minute ? 'minuto' : 'cota', detail: metric || 'Limite de uso do plano gratuito do Gemini atingido.', models: [...new Set(q.map((x) => x.model))] };
}
