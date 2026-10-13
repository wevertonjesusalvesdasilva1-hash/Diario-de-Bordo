// POST /api/extract  { images: [base64 jpeg...], pass: "A" | "B", hints?: { chapas, pecas, modelos } }
// Reads one scanned sheet with Gemini. The API key lives only in the GEMINI_API_KEY environment variable.
import { SCHEMA, buildPrompt, SCHEMA_C, buildPromptC, ASKABLE } from './_shared.js';
import { gemini } from './_gemini.js';
import { checkAccess } from './_auth.js';

const MAX_IMAGE = 2_400_000; // base64 chars per image
const hits = new Map();

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);

function limited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > 40;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, auth: true });
  const ip = String(req.headers['x-forwarded-for'] ?? 'x').split(',')[0].trim();
  if (limited(ip)) return send(res, 429, { error: 'Muitas leituras seguidas, aguarde um minuto' });

  const key = process.env.GEMINI_API_KEY;
  if (!key) return send(res, 500, { error: 'GEMINI_API_KEY não está configurada no projeto da Vercel' });

  const { images, pass = 'A', hints, ask } = req.body ?? {};
  const third = pass === 'C';
  if (!Array.isArray(images) || !images.length || images.length > (third ? 12 : 4) || images.some((i) => typeof i !== 'string' || i.length > MAX_IMAGE)) {
    return send(res, 400, { error: third ? 'Envie de 1 a 12 imagens JPEG em base64' : 'Envie de 1 a 4 imagens JPEG em base64' });
  }
  if (third && (!Array.isArray(ask) || ask.length !== images.length || ask.some((a) => typeof a?.id !== 'string' || a.id.length > 24 || !Array.isArray(a.campos) || !a.campos.length || a.campos.some((c) => !ASKABLE.has(c))))) {
    return send(res, 400, { error: 'Pedido de terceira leitura inválido' });
  }
  const parts = [{ text: third ? buildPromptC(ask, hints) : buildPrompt(pass === 'B' ? 'B' : 'A', hints) }];
  const labels = pass === 'B' ? ['Ampliação da TABELA 1 (produção):', 'Ampliação da TABELA 2 (paradas):'] : ['Folha inteira:', 'Ampliação da TABELA 1 (produção):', 'Ampliação da TABELA 2 (paradas):'];
  images.forEach((b64, i) => {
    parts.push({ text: third ? `Linha ${ask[i].id}:` : (labels[i] ?? `Imagem ${i + 1}:`) });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64.replace(/^data:image\/jpeg;base64,/, '') } });
  });

  const chain = [process.env.GEMINI_MODEL || 'gemini-flash-latest', ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash,gemini-flash-lite-latest').split(',').map((m) => m.trim()).filter(Boolean)];
  // the third reading may use a stronger model when GEMINI_PASS_C_MODEL is set
  const models = [...new Set(third && process.env.GEMINI_PASS_C_MODEL ? [process.env.GEMINI_PASS_C_MODEL, ...chain] : chain)];
  try {
    const { data, model, trace } = await gemini(models, key, parts, third ? SCHEMA_C : SCHEMA);
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    if (!text) return send(res, 502, { error: `O Gemini não devolveu texto (${data?.candidates?.[0]?.finishReason ?? 'sem motivo'})` });
    let parsed;
    try { parsed = JSON.parse(text); } catch { return send(res, 502, { error: 'Resposta do Gemini não era JSON válido' }); }
    return send(res, 200, { data: parsed, model, trace });
  } catch (e) {
    const quota = e.status === 429;
    const busy = e.status === 503 || e.status === 504 || e.status === 500;
    return send(res, quota ? 429 : busy ? 503 : 502, {
      error: quota ? (e.daily ? 'Limite diário do plano gratuito do Gemini atingido. Volta a funcionar amanhã.' : 'Limite do plano gratuito do Gemini atingido. Tente de novo em alguns minutos.')
        : busy ? 'O Gemini está sobrecarregado agora. Tente de novo em alguns minutos.' : e.message,
      trace: e.trace,
    });
  }
}
