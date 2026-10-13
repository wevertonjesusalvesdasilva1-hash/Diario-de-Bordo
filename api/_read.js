// One reading pass (A, B or C) of one sheet with Gemini. Used by /api/extract (the browser asks directly)
// and by the background worker (/api/work), so both read exactly the same way.
import { SCHEMA, buildPrompt, SCHEMA_C, buildPromptC } from './_shared.js';
import { gemini } from './_gemini.js';

let impl = gemini; // replaced in the tests
export const useGemini = (fn) => { impl = fn ?? gemini; };

export function modelChain(third) {
  const chain = [process.env.GEMINI_MODEL || 'gemini-flash-latest', ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-3.8-flash,gemini-flash-lite-latest').split(',').map((m) => m.trim()).filter(Boolean)];
  // the third reading may use a stronger model when GEMINI_PASS_C_MODEL is set
  return [...new Set(third && process.env.GEMINI_PASS_C_MODEL ? [process.env.GEMINI_PASS_C_MODEL, ...chain] : chain)];
}

// → { data, model, trace }. Throws with .status / .trace when the model could not answer (429 quota, 503 busy…).
export async function readPass({ images, pass = 'A', hints, ask }, opts = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) { const e = new Error('GEMINI_API_KEY não está configurada no projeto da Vercel'); e.status = 500; e.config = true; throw e; }
  const third = pass === 'C';
  const parts = [{ text: third ? buildPromptC(ask, hints) : buildPrompt(pass === 'B' ? 'B' : 'A', hints) }];
  const labels = pass === 'B' ? ['Ampliação da TABELA 1 (produção):', 'Ampliação da TABELA 2 (paradas):'] : ['Folha inteira:', 'Ampliação da TABELA 1 (produção):', 'Ampliação da TABELA 2 (paradas):'];
  images.forEach((b64, i) => {
    parts.push({ text: third ? `Linha ${ask[i].id}:` : (labels[i] ?? `Imagem ${i + 1}:`) });
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: b64.replace(/^data:image\/jpeg;base64,/, '') } });
  });
  const { data, model, trace } = await impl(modelChain(third), key, parts, third ? SCHEMA_C : SCHEMA, opts);
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) { const e = new Error(`O Gemini não devolveu texto (${data?.candidates?.[0]?.finishReason ?? 'sem motivo'})`); e.status = 502; throw e; }
  let parsed;
  try { parsed = JSON.parse(text); } catch { const e = new Error('Resposta do Gemini não era JSON válido'); e.status = 502; throw e; }
  return { data: parsed, model, trace };
}
