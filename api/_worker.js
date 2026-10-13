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
import { readPass } from './_read.js';
import { reconcile, alignJson, collectAsk } from '../src/core/rows.js';
import { setActiveGroup, groupOf } from '../src/core/lists.js';
import { normMachine } from '../src/core/rows.js';

export const JOB_RE = /^[a-z0-9]{8,24}$/;
const MAX_AGE_MS = 12 * 3600_000; // a job nobody could read in 12 hours is given up
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
  return { A: got.A ?? null, B: got.B ?? null, C, ask: askCount, single, models };
}

const retriable = (e) => !FATAL.has(e?.status) && !e?.config;

// Reads what is pending, for about `budgetMs`. → { more, wait } : `more` = something is left, `wait` = seconds to wait before the next try
export async function processJob(job, { budgetMs = 90_000 } = {}) {
  if (!JOB_RE.test(job)) throw new Error('job inválido');
  const store = getStore();
  const lease = await readJson(path(job, 'lease.json'));
  if (lease && lease.until > Date.now()) return { busy: true, more: false };
  const t0 = Date.now();
  await writeJson(path(job, 'lease.json'), { until: t0 + LEASE_MS });
  let wait = 0;
  try {
    const meta = (await readJson(path(job, 'meta.json'))) ?? {};
    const expired = meta.at && t0 - meta.at > MAX_AGE_MS;
    let s = await scan(job);
    const failed = {};
    for (const n of s.failed) failed[n] = (await readJson(path(job, 'err', `${n}.json`)))?.error ?? 'Erro';
    const pending = () => s.ready.filter((n) => !s.done.includes(n) && !s.failed.includes(n));
    const save = (working) => writeJson(path(job, 'status.json'), { total: meta.total ?? null, ready: s.ready, done: s.done, failed, working, wait, updated: Date.now() });
    await save(true);
    while (pending().length && Date.now() - t0 < budgetMs && !wait) {
      const batch = pending().slice(0, 2);
      await Promise.all(batch.map(async (n) => {
        try {
          if (expired) throw Object.assign(new Error('A leitura não terminou em 12 horas. Envie o arquivo de novo.'), { status: 400 });
          const out = await readOnePage(job, n);
          await writeJson(path(job, 'out', `${n}.json`), out);
          s.done.push(n);
        } catch (e) {
          if (retriable(e)) wait = Math.max(wait, e.status === 429 ? 300 : 90);
          else { failed[n] = String(e.message).slice(0, 200); await writeJson(path(job, 'err', `${n}.json`), { error: failed[n] }); s.failed.push(n); }
        }
      }));
      await save(true);
    }
    const fresh = await scan(job); // pages uploaded while we were reading
    s = { ready: fresh.ready, done: [...new Set([...s.done, ...fresh.done])], failed: [...new Set([...s.failed, ...fresh.failed])] };
    const more = pending().length > 0;
    await save(false);
    return { more, wait };
  } finally {
    await writeJson(path(job, 'lease.json'), { until: 0 });
  }
}
