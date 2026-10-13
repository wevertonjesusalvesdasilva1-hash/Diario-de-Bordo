// "Baixar folha marcada": the sheet image with the card's marks drawn on it, as PDF (default) or PNG.
import { cardMarks } from './core/marks.js';
import { jpegToPdf } from './core/pdfimg.js';

const KEY = 'mt-dlfmt';
const getFmt = () => { try { return localStorage.getItem(KEY) === 'png' ? 'png' : 'pdf'; } catch { return 'pdf'; } };
const setFmt = (f) => { try { localStorage.setItem(KEY, f); } catch { /* private mode */ } };
const safe = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

function loadImage(src) {
  return new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('imagem da folha indisponível')); i.src = src; });
}

// the sheet + a title bar + the card's marks (rows outlined, cells boxed)
async function markedCanvas(card, page) {
  const img = await loadImage(page.sheet);
  const W = img.naturalWidth, H = img.naturalHeight, bar = Math.round(W * 0.045);
  const c = document.createElement('canvas');
  c.width = W; c.height = H + bar;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#111'; g.font = `700 ${Math.round(bar * 0.5)}px sans-serif`; g.textBaseline = 'middle';
  const who = card.people?.[0] ? ` · ${card.people[0].nome || 'chapa ' + card.people[0].chapa}` : '';
  g.fillText(`${card.machine} · ${card.title} · folha do dia ${card.day || '?'}${who}`, Math.round(bar * 0.3), bar / 2);
  g.drawImage(img, 0, bar);
  for (const m of cardMarks(card, page)) {
    const x = m.x * W, y = bar + m.y * H, w = m.w * W, h = m.h * H;
    if (m.kind === 'cell') { g.fillStyle = 'rgba(255,59,59,.14)'; g.fillRect(x, y, w, h); }
    g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 6; g.strokeRect(x, y, w, h); // white halo so the line shows on dark ink
    g.strokeStyle = '#e11d1d'; g.lineWidth = 3;
    g.strokeRect(x, y, w, h);
  }
  return c;
}

export async function downloadMarked(card, page, fmt = getFmt()) {
  const canvas = await markedCanvas(card, page);
  const name = `folha-${safe(card.machine)}-${safe(card.day)}-${safe(card.title)}`;
  let blob;
  if (fmt === 'png') blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
  else {
    const b64 = canvas.toDataURL('image/jpeg', 0.92).split(',')[1];
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    blob = new Blob([jpegToPdf(bytes, canvas.width, canvas.height)], { type: 'application/pdf' });
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${name}.${fmt}`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// split button: [Baixar PDF] [▾ → PDF / PNG]; the chosen format is remembered
export function downloadControl(card, page, h) {
  const main = h('button', { type: 'button', class: 'ghost dlmain', title: 'Baixar a folha com as marcações' }, `⤓ Baixar ${getFmt().toUpperCase()}`);
  const arrow = h('button', { type: 'button', class: 'ghost dlarrow', title: 'Escolher PDF ou PNG', 'aria-haspopup': 'menu' }, '▾');
  const menu = h('div', { class: 'dlmenu', role: 'menu', hidden: true },
    ['pdf', 'png'].map((f) => h('button', { type: 'button', role: 'menuitem', dataset: { fmt: f } }, f === 'pdf' ? 'PDF (padrão)' : 'PNG (imagem)')));
  const busy = async (fn) => { main.disabled = true; try { await fn(); } catch (e) { main.textContent = 'Não consegui gerar'; setTimeout(() => { main.textContent = `⤓ Baixar ${getFmt().toUpperCase()}`; }, 2500); } finally { main.disabled = false; } };
  main.addEventListener('click', () => busy(() => downloadMarked(card, page)));
  arrow.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  menu.addEventListener('click', (e) => {
    const f = e.target.closest('button')?.dataset.fmt; if (!f) return;
    setFmt(f); menu.hidden = true; main.textContent = `⤓ Baixar ${f.toUpperCase()}`;
    busy(() => downloadMarked(card, page, f));
  });
  return h('div', { class: 'dlwrap' }, main, arrow, menu);
}
