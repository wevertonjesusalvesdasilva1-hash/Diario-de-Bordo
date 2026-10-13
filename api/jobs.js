// The browser's side of background reading.
//   POST { op: 'part', job, n, part: 'ab'|'prod'|'stops', data }   one piece of a prepared sheet
//   POST { op: 'ready', job, n, total }                            the sheet is complete: the worker may read it
//   POST { op: 'kick', job }                                       wake the worker (e.g. when the page opens again)
//   GET  ?job=ID                 → status ({ total, ready, done, failed, working, wait })
//   GET  ?job=ID&page=N          → the raw answers of one sheet
import { accessRequired, checkAccess } from './_auth.js';
import { getStore } from './_store.js';
import { JOB_RE, jobStatus } from './_worker.js';
import { kick, HOST_RE } from './_kick.js';

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);
const PARTS = new Set(['ab', 'prod', 'stops']);

export default async function handler(req, res) {
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  if (!accessRequired()) return send(res, 403, { error: 'A leitura em segundo plano exige um código de acesso configurado' });
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error });
  const store = getStore();
  if (!store.ok()) return send(res, 503, { error: 'Leitura em segundo plano não configurada no servidor' });
  const host = HOST_RE.test(String(req.headers.host)) ? req.headers.host : null;
  try {
    if (req.method === 'GET') {
      const { job, page } = req.query ?? {};
      if (!JOB_RE.test(String(job))) return send(res, 400, { error: 'job inválido' });
      if (page !== undefined) {
        const n = Number(page);
        if (!Number.isInteger(n) || n < 1 || n > 200) return send(res, 400, { error: 'página inválida' });
        const t = await store.read(`jobs/${job}/out/${n}.json`);
        return t ? send(res, 200, JSON.parse(t)) : send(res, 404, { error: 'ainda sem leitura' });
      }
      return send(res, 200, await jobStatus(job));
    }
    if (req.method !== 'POST') return send(res, 405, { error: 'Método não permitido' });
    const { op, job, n, part, data, total } = req.body ?? {};
    if (!JOB_RE.test(String(job))) return send(res, 400, { error: 'job inválido' });
    if (op === 'kick') { await kick(job, host); return send(res, 200, { ok: true }); }
    if (!Number.isInteger(n) || n < 1 || n > 200) return send(res, 400, { error: 'página inválida' });
    if (op === 'part') {
      if (!PARTS.has(part) || data === undefined) return send(res, 400, { error: 'parte inválida' });
      await store.write(`jobs/${job}/in/${n}.${part}.json`, JSON.stringify(data));
      return send(res, 200, { ok: true });
    }
    if (op === 'ready') {
      const metaPath = `jobs/${job}/meta.json`;
      if (!(await store.read(metaPath))) await store.write(metaPath, JSON.stringify({ total: Number(total) || null, at: Date.now(), host }));
      await store.write(`jobs/${job}/in/${n}.ready.json`, JSON.stringify({ at: Date.now() }));
      await kick(job, host);
      return send(res, 200, { ok: true });
    }
    return send(res, 400, { error: 'operação inválida' });
  } catch (e) {
    return send(res, 500, { error: `Falha: ${String(e.message).slice(0, 120)}` });
  }
}
