// POST /api/analyze  { resumo: <compact analysis object> }
// Writes the "pontos importantes" of a REVIEWED reading. The model only sees the numbers computed by the
// app (no images) and is told not to invent anything.
import { gemini } from './_gemini.js';
import { checkAccess } from './_auth.js';

const SCHEMA = {
  type: 'OBJECT',
  properties: { pontos: { type: 'ARRAY', items: { type: 'STRING' }, description: 'de 4 a 8 pontos importantes, frases curtas em português' } },
  required: ['pontos'],
};

const PROMPT = `Você é analista de controle de produção de uma fábrica de soldagem e usinagem. Abaixo está um resumo, em JSON, de folhas de Diário de Bordo (produção e paradas de máquina) já conferidas por uma pessoa.
Escreva de 4 a 8 PONTOS IMPORTANTES para o gestor, em português, frases curtas e objetivas, do mais relevante para o menos relevante.
Regras:
- Use SOMENTE os números e fatos do JSON. Não invente causas, nomes, horários nem valores.
- Destaque: o que mais parou a máquina e quanto, paradas longas, desvios de tempo contra o padrão, e horários que não fecham entre produção e paradas (a pessoa deve revisar).
- Se um alerta indicar possível erro de horário, diga que precisa conferir na folha.
- Não repita todos os alertas; resuma.
- Escreva em português do Brasil com a acentuação correta (á, ã, ç, é, ô…) e use os nomes de máquinas, peças e motivos exatamente como aparecem no JSON.
- Escreva texto puro: nunca use códigos HTML como &ccedil; ou &atilde;, nem markdown.
- Evite o termo técnico "sobreposição": diga "dois registros no mesmo horário" ou "aparece produzindo e parado ao mesmo tempo".`;

// the model sometimes answers with HTML entities (&ccedil;); turn them back into letters
const NAMED = { ccedil: 'ç', Ccedil: 'Ç', atilde: 'ã', Atilde: 'Ã', otilde: 'õ', Otilde: 'Õ', aacute: 'á', Aacute: 'Á', eacute: 'é', Eacute: 'É', iacute: 'í', Iacute: 'Í', oacute: 'ó', Oacute: 'Ó', uacute: 'ú', Uacute: 'Ú', acirc: 'â', Acirc: 'Â', ecirc: 'ê', Ecirc: 'Ê', ocirc: 'ô', Ocirc: 'Ô', agrave: 'à', Agrave: 'À', uuml: 'ü', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decodeEntities = (t) => t
  .replace(/&(#x?[0-9a-f]+|[a-z]+);?/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : NAMED[e] ?? m))
  .replace(/([çãõáéíóúâêôàÇÃÕÁÉÍÓÚÂÊÔÀ])&(?=[a-zA-Z])/g, '$1'); // "&ccedil&atilde&o" (no semicolons) → "ção"

const send = (res, status, body) => res.status(status).setHeader('Cache-Control', 'no-store').json(body);

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Use POST' });
  const origin = req.headers.origin;
  if (origin) { try { if (new URL(origin).host !== req.headers.host) return send(res, 403, { error: 'Origem não permitida' }); } catch { return send(res, 403, { error: 'Origem inválida' }); } }
  const auth = checkAccess(req);
  if (!auth.ok) return send(res, auth.status, { error: auth.error, auth: true });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return send(res, 500, { error: 'GEMINI_API_KEY não está configurada no projeto da Vercel' });
  const { resumo } = req.body ?? {};
  const text = JSON.stringify(resumo ?? '');
  if (!resumo || typeof resumo !== 'object' || text.length > 24_000) return send(res, 400, { error: 'Resumo inválido ou grande demais' });
  const models = [...new Set([process.env.GEMINI_MODEL || 'gemini-flash-latest', ...(process.env.GEMINI_FALLBACK_MODELS || 'gemini-2.5-flash,gemini-flash-lite-latest').split(',').map((m) => m.trim()).filter(Boolean)])];
  try {
    const { data } = await gemini(models, key, [{ text: `${PROMPT}\n\nRESUMO:\n${text}` }], SCHEMA);
    const out = data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    const pontos = JSON.parse(out).pontos;
    if (!Array.isArray(pontos) || !pontos.length) return send(res, 502, { error: 'O Gemini não devolveu pontos' });
    return send(res, 200, { pontos: pontos.slice(0, 8).map((p) => decodeEntities(String(p)).slice(0, 400)) });
  } catch (e) {
    return send(res, e.status === 429 ? 429 : 502, { error: e.status === 429 ? 'Limite do plano gratuito do Gemini atingido' : 'Não consegui gerar o resumo agora' });
  }
}
