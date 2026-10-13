// A PDF with one JPEG per page (the sheet with its marks), written by hand: no library needed.
const enc = new TextEncoder();

// pages = [{ jpeg: Uint8Array, w, h }] (pixels); every page is as wide as pageWidthPt, as tall as its image needs
export function jpegsToPdf(pages, pageWidthPt = 595.28) {
  const parts = [], offsets = [];
  let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n${body}\nendobj\n`); };
  push('%PDF-1.4\n');
  const total = 2 + pages.length * 3;
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${pages.length} >>`);
  pages.forEach(({ jpeg, w, h }, i) => {
    const wPt = pageWidthPt, hPt = (pageWidthPt * h) / w, n = 3 + i * 3;
    obj(n, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${wPt.toFixed(2)} ${hPt.toFixed(2)}] /Resources << /XObject << /Im0 ${n + 1} 0 R >> >> /Contents ${n + 2} 0 R >>`);
    offsets[n + 1] = len;
    push(`${n + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
    push(jpeg); push('\nendstream\nendobj\n');
    const content = `q ${wPt.toFixed(2)} 0 0 ${hPt.toFixed(2)} 0 0 cm /Im0 Do Q`;
    obj(n + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const xref = len;
  push(`xref\n0 ${total + 1}\n0000000000 65535 f \n${Array.from({ length: total }, (_, i) => `${String(offsets[i + 1]).padStart(10, '0')} 00000 n \n`).join('')}`);
  push(`trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let at = 0;
  for (const b of parts) { out.set(b, at); at += b.length; }
  return out;
}

export const jpegToPdf = (jpeg, widthPx, heightPx, pageWidthPt = 595.28) => jpegsToPdf([{ jpeg, w: widthPx, h: heightPx }], pageWidthPt);
