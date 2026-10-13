// Shared Gemini caller: tries the configured model, then fallbacks, until the deadline.
const API = 'https://generativelanguage.googleapis.com/v1beta';
const DEADLINE_MS = 270_000; // the function may run up to 300 s (see vercel.json)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One attempt on one model. thinkingBudget keeps transcription fast; models that reject the
// field are retried without it.
async function once(model, key, parts, schema, budgetMs, thinking = true) {
  const generationConfig = { temperature: 0, responseMimeType: 'application/json', responseSchema: schema };
  const budget = Number(process.env.THINKING_BUDGET ?? 1024);
  if (thinking && budget >= 0) generationConfig.thinkingConfig = { thinkingBudget: budget };
  const r = await fetch(`${API}/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig }),
    signal: AbortSignal.timeout(Math.max(5_000, Math.min(budgetMs, 130_000))),
  });
  if (r.ok) return { ok: true, data: await r.json() };
  const text = await r.text();
  if (r.status === 400 && thinking && /thinking/i.test(text)) return once(model, key, parts, schema, budgetMs, false);
  return { ok: false, status: r.status, text: text.slice(0, 400) };
}

// Tries the configured model, then the fallbacks, cycling until the deadline.
// 503 ("high demand") and 429 are usually per model, so switching model is the fastest way out.
export async function gemini(models, key, parts, schema) {
  const start = Date.now();
  const trace = []; // one entry per attempt: which model, what came back, how long it took
  let last = { status: 0, text: 'sem resposta' };
  for (let round = 0; Date.now() - start < DEADLINE_MS; round++) {
    for (const model of models) {
      const left = DEADLINE_MS - (Date.now() - start);
      if (left < 8_000) break;
      const t0 = Date.now();
      try {
        const out = await once(model, key, parts, schema, left);
        trace.push({ model, status: out.ok ? 200 : out.status, ms: Date.now() - t0 });
        if (out.ok) return { data: out.data, model, trace };
        last = out;
        if (out.status === 400 || out.status === 401 || out.status === 403) { const e = new Error(`Gemini ${out.status}: ${out.text}`); e.status = out.status; throw e; }
        if (out.status === 429 && /PerDay|per day/i.test(out.text)) { const e = new Error(`Gemini 429: ${out.text}`); e.status = 429; e.daily = true; throw e; }
      } catch (e) {
        trace.push({ model, status: e.status ?? e.name, ms: Date.now() - t0 });
        if (e.status) { e.trace = trace; throw e; }
        last = { status: 504, text: e.name === 'TimeoutError' ? 'o Gemini demorou demais' : String(e.message) };
      }
    }
    await sleep(Math.min(4_000 * (round + 1), 12_000));
  }
  const err = new Error(`Gemini ${last.status}: ${last.text}`);
  err.status = last.status; err.trace = trace;
  throw err;
}

