// A reading request must fit in one HTTP body (the server platform refuses about 4.5 MB). Noisy or very sharp
// scans make heavy JPEGs, so instead of asking the person to shrink the PDF the app lowers the quality a
// little, and then the size, until the images fit. encode(quality, scale) → array of base64 strings.
export const BODY_BUDGET = 3_400_000; // base64 characters for all images of one request
export function fitToBudget(encode, { q = 0.9, budget = BODY_BUDGET, minQ = 0.55, step = 0.07, shrink = 0.85, minScale = 0.45 } = {}) {
  let quality = q, scale = 1, out = encode(quality, scale);
  while (out.reduce((n, s) => n + s.length, 0) > budget) {
    if (quality - step >= minQ) quality -= step;
    else if (scale * shrink >= minScale) { scale *= shrink; quality = Math.max(minQ, q - 0.15); }
    else break; // as small as it gets: let the server decide
    out = encode(quality, scale);
  }
  return out;
}
