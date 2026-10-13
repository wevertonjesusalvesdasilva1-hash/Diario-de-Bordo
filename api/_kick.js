// Starts (or continues) the background worker of a job by calling /api/work on the same site.
export const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.vercel\.app$/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function kick(job, host, delaySec = 0) {
  if (!HOST_RE.test(String(host))) return false;
  if (delaySec) await sleep(delaySec * 1000);
  try {
    const r = await fetch(`https://${host}/api/work`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-access-code': process.env.ACCESS_CODE ?? '' },
      body: JSON.stringify({ job, host }),
      signal: AbortSignal.timeout(15_000),
    });
    return r.status === 202;
  } catch { return false; }
}
