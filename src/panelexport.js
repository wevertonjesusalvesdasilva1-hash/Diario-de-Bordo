// Export of the dashboard ("Painel"): a slide deck as PDF, or an Excel workbook, with a white or a dark background.
// The slides are drawn on a canvas from the same numbers as the screen (core/panel.js), so nothing is estimated.
import { jpegsToPdf } from './core/pdfimg.js';
import { fmtDur } from './core/analysis.js';
import { MOTIVOS_ALL } from './data/vocab.js';
import { injectCharts } from './xlsxcharts.js';

const W = 1920, H = 1080, M = 80;
const FONT = '"Chakra Petch", "Segoe UI", system-ui, -apple-system, sans-serif';
const BODY = '"IBM Plex Sans", "Segoe UI", system-ui, -apple-system, sans-serif';
const HOURS = Array.from({ length: 24 }, (_, i) => (i + 4) % 24);

const THEMES = {
  dark: { bg: '#0b0b12', card: '#16161f', card2: '#1d1d29', ink: '#f2f2f7', muted: '#9d9db3', line: 'rgba(255,255,255,.10)', v: '#8b5cf6', v2: '#c4b5fd', empty: 'rgba(255,255,255,.10)', good: '#7ee34f', bad: '#ff7a5c',
    m: ['#f2b84b', '#ffd93d', '#6bcb77', '#ff6b6b', '#4d96ff', '#c77dff', '#ff9f45', '#2ee6c8', '#9aa5b1', '#ff7ab6', '#d4d4d8'] },
  light: { bg: '#ffffff', card: '#f4f3fb', card2: '#ebe9f7', ink: '#15141c', muted: '#66657a', line: 'rgba(0,0,0,.12)', v: '#6d28d9', v2: '#8b5cf6', empty: 'rgba(0,0,0,.09)', good: '#2e7d1a', bad: '#c0392b',
    m: ['#b9770e', '#a08500', '#2e8b3f', '#c93c3c', '#1f6fd1', '#8a3fc4', '#c4600e', '#078a80', '#6b7683', '#c43b84', '#52525b'] },
};
const motColor = (T, name) => { const i = MOTIVOS_ALL.indexOf(name); return i >= 0 ? T.m[i % T.m.length] : T.muted; };

// ---- little canvas helpers
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
function txt(c, s, x, y, { size = 30, weight = 400, color, align = 'left', font = BODY, base = 'alphabetic' } = {}) {
  c.font = `${weight} ${size}px ${font}`; c.fillStyle = color; c.textAlign = align; c.textBaseline = base; c.fillText(String(s), x, y);
}
function fit(c, s, maxW) {
  s = String(s ?? '');
  if (c.measureText(s).width <= maxW) return s;
  while (s.length > 1 && c.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s}…`;
}
function wrap(c, s, maxW, maxLines) {
  const words = String(s ?? '').split(/\s+/).filter(Boolean), lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (c.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = `${lines[maxLines - 1].replace(/…$/, '')}…`; }
  return lines;
}
const hh = (n) => `${String(n).padStart(2, '0')}h`;

function frame(c, T, title, sub, n, total) {
  c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
  const g = c.createLinearGradient(0, 0, W, 0); g.addColorStop(0, T.v); g.addColorStop(1, 'transparent'); c.fillStyle = g; c.fillRect(0, 0, W, 8);
  txt(c, title, M, 112, { size: 52, weight: 700, color: T.ink, font: FONT });
  if (sub) txt(c, sub, M, 158, { size: 26, color: T.muted });
  txt(c, 'Maple Tapping · Diário de Bordo', M, H - 40, { size: 22, color: T.muted });
  txt(c, `${n} / ${total}`, W - M, H - 40, { size: 22, color: T.muted, align: 'right' });
}
function card(c, T, x, y, w, h) { rr(c, x, y, w, h, 28); c.fillStyle = T.card; c.fill(); }

// ---- the slides
function slides(P, opt, T) {
  const out = [];
  const make = (draw) => out.push(draw);
  const who = opt.who ?? ((x) => x);
  const scope = [opt.groupLabel, opt.dayLabel].filter(Boolean).join(' · ');
  const stopsAll = P.all;

  // 1. cover
  make((c, n, t) => {
    c.fillStyle = T.bg; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W * 0.75, H * 0.35, 40, W * 0.75, H * 0.35, 720); g.addColorStop(0, T.v + '55'); g.addColorStop(1, 'transparent'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    txt(c, 'Painel · tempo parado', M + 20, 470, { size: 104, weight: 700, color: T.ink, font: FONT });
    txt(c, scope || 'Todas as máquinas · todos os dias', M + 24, 548, { size: 40, color: T.v2 });
    txt(c, `${opt.sheets ?? ''} folha${opt.sheets === 1 ? '' : 's'} lida${opt.sheets === 1 ? '' : 's'} · ${P.count} parada${P.count === 1 ? '' : 's'} · ${fmtDur(P.stopMin)} parado`, M + 24, 612, { size: 32, color: T.muted });
    txt(c, `Gerado em ${new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}`, M + 24, H - 90, { size: 26, color: T.muted });
    txt(c, 'Maple Tapping · Diário de Bordo', M + 24, H - 52, { size: 26, color: T.muted });
  });

  // 2. indicators + gauge
  make((c, n, t) => {
    frame(c, T, 'Indicadores', scope, n, t);
    const kp = [['Tempo parado', fmtDur(P.stopMin), `${P.pct} % do tempo registrado`, P.pct >= 30 ? T.bad : T.good], ['Produzindo', fmtDur(P.prodMin), 'tempo registrado', T.good],
      ['Paradas', String(P.count), 'registros de parada', T.v2], ['Maior parada', P.longest ? fmtDur(P.longest.min) : '—', P.longest ? `${P.longest.machine} · ${P.longest.motivo}` : '', T.v2]];
    kp.forEach(([lab, val, sub, col], i) => {
      const x = M + (i % 2) * 540, y = 200 + Math.floor(i / 2) * 340;
      card(c, T, x, y, 510, 310);
      txt(c, lab, x + 36, y + 62, { size: 28, color: T.muted });
      txt(c, val, x + 36, y + 170, { size: 92, weight: 700, color: T.ink, font: FONT });
      c.fillStyle = col; rr(c, x + 36, y + 206, 56, 6, 3); c.fill();
      c.font = `400 26px ${BODY}`; txt(c, fit(c, sub, 440), x + 36, y + 258, { size: 26, color: T.muted });
    });
    // segmented gauge
    const gx = 1200, gy = 200; card(c, T, gx, gy, 640, 650);
    txt(c, 'Aproveitamento', gx + 40, gy + 64, { size: 32, weight: 600, color: T.ink, font: FONT });
    const cx = gx + 320, cy = gy + 350, N = 30, filled = Math.round((P.prodPct / 100) * N);
    for (let i = 0; i < N; i++) {
      const a = ((150 + (240 * i) / (N - 1)) * Math.PI) / 180, co = Math.cos(a), si = Math.sin(a);
      c.beginPath(); c.moveTo(cx + 150 * co, cy + 150 * si); c.lineTo(cx + 215 * co, cy + 215 * si);
      c.lineWidth = 20; c.lineCap = 'round'; c.strokeStyle = i < filled ? T.v : T.empty; c.globalAlpha = i < filled ? 0.5 + 0.5 * (1 - i / N) : 1; c.stroke(); c.globalAlpha = 1;
    }
    txt(c, `${P.prodPct}%`, cx, cy + 22, { size: 100, weight: 700, color: T.ink, align: 'center', font: FONT });
    txt(c, 'do tempo produzindo', cx, cy + 66, { size: 23, color: T.muted, align: 'center' });
    txt(c, `${fmtDur(P.prodMin)} produzindo · ${fmtDur(P.stopMin)} parado`, cx, gy + 620, { size: 26, color: T.muted, align: 'center' });
  });

  // 3. reasons: donut + legend
  if (P.byMotivo.length) make((c, n, t) => {
    frame(c, T, 'Tempo parado por motivo', scope, n, t);
    const cx = 520, cy = 560, r = 260, sw = 120;
    let a = -Math.PI / 2;
    for (const x of P.byMotivo) {
      const f = P.stopMin ? x.min / P.stopMin : 0, a2 = a + f * Math.PI * 2;
      c.beginPath(); c.arc(cx, cy, r, a + 0.004, Math.max(a + 0.004, a2 - 0.004)); c.lineWidth = sw; c.lineCap = 'butt'; c.strokeStyle = motColor(T, x.motivo); c.stroke(); a = a2;
    }
    txt(c, fmtDur(P.stopMin), cx, cy + 12, { size: 74, weight: 700, color: T.ink, align: 'center', font: FONT });
    txt(c, 'tempo parado', cx, cy + 56, { size: 28, color: T.muted, align: 'center' });
    const rows = P.byMotivo.slice(0, 11), x0 = 960;
    txt(c, 'MOTIVO', x0 + 56, 214, { size: 22, weight: 600, color: T.muted }); txt(c, '%', x0 + 560, 214, { size: 22, weight: 600, color: T.muted, align: 'right' });
    txt(c, 'TEMPO', x0 + 720, 214, { size: 22, weight: 600, color: T.muted, align: 'right' }); txt(c, 'VEZES', x0 + 880, 214, { size: 22, weight: 600, color: T.muted, align: 'right' });
    rows.forEach((x, i) => {
      const y = 240 + i * 70; rr(c, x0, y, 900, 58, 16); c.fillStyle = i % 2 ? T.bg : T.card; c.fill();
      c.fillStyle = motColor(T, x.motivo); rr(c, x0 + 20, y + 19, 20, 20, 5); c.fill();
      c.font = `600 28px ${BODY}`; txt(c, fit(c, x.motivo, 400), x0 + 56, y + 40, { size: 28, weight: 600, color: T.ink });
      txt(c, `${P.stopMin ? Math.round((x.min / P.stopMin) * 100) : 0} %`, x0 + 560, y + 40, { size: 28, weight: 700, color: T.ink, align: 'right' });
      txt(c, fmtDur(x.min), x0 + 720, y + 40, { size: 28, color: T.ink, align: 'right' }); txt(c, `${x.count}×`, x0 + 880, y + 40, { size: 28, color: T.muted, align: 'right' });
    });
  });

  // 4. machines (stacked by reason) + shifts
  if (P.byMachine.length) make((c, n, t) => {
    frame(c, T, 'Tempo parado por máquina e por turno', scope, n, t);
    const rows = P.byMachine.slice(0, 9), maxMac = Math.max(1, ...rows.map((m) => m.stopMin)), bx = M + 250, bw = 700, rh = Math.min(84, 640 / Math.max(1, rows.length));
    card(c, T, M - 10, 190, 1190, 720);
    rows.forEach((m, i) => {
      const y = 230 + i * rh;
      txt(c, m.name, M + 20, y + 30, { size: 30, weight: 700, color: T.ink }); txt(c, `${m.pct} % parada`, M + 20, y + 58, { size: 22, color: T.muted });
      rr(c, bx, y + 8, bw, 40, 20); c.fillStyle = T.empty; c.fill();
      c.save(); rr(c, bx, y + 8, Math.max(8, (m.stopMin / maxMac) * bw), 40, 20); c.clip();
      let x = bx; for (const s of m.motivos) { const w = (s.min / maxMac) * bw; c.fillStyle = motColor(T, s.motivo); c.fillRect(x, y + 8, w, 40); x += w; } c.restore();
      txt(c, fmtDur(m.stopMin), bx + bw + 20, y + 40, { size: 28, weight: 600, color: T.ink });
    });
    const tx = 1340, maxT = Math.max(1, ...P.byTurno.map((x) => x.min));
    card(c, T, tx - 20, 190, 520, 720); txt(c, 'Por turno', tx + 10, 252, { size: 32, weight: 600, color: T.ink, font: FONT });
    P.byTurno.forEach((x, i) => {
      const y = 300 + i * 120;
      txt(c, x.turno === '?' ? 'Sem turno' : `Turno ${x.turno}`, tx + 10, y + 30, { size: 28, color: T.ink }); txt(c, fmtDur(x.min), tx + 460, y + 30, { size: 28, weight: 600, color: T.ink, align: 'right' });
      rr(c, tx + 10, y + 50, 460, 26, 13); c.fillStyle = T.empty; c.fill();
      const gr = c.createLinearGradient(tx, 0, tx + 480, 0); gr.addColorStop(0, T.v); gr.addColorStop(1, T.v2); rr(c, tx + 10, y + 50, Math.max(10, (x.min / maxT) * 460), 26, 13); c.fillStyle = gr; c.fill();
    });
  });

  // 5. heat map
  if (P.heat.length) make((c, n, t) => {
    frame(c, T, 'Mapa de calor: onde e quando para', `${scope ? `${scope} · ` : ''}minutos parados por máquina e hora do dia (o dia começa às 04h)`, n, t);
    const max = Math.max(1, ...P.heat.flatMap((r) => r.hours)), rows = P.heat.slice(0, 9), lx = M + 10, gx = M + 190, cw = (W - M - gx) / 24, ch = Math.min(62, 600 / Math.max(1, rows.length));
    HOURS.forEach((hr, i) => txt(c, String(hr), gx + i * cw + cw / 2, 228, { size: 22, color: T.muted, align: 'center' }));
    rows.forEach((row, ri) => {
      const y = 250 + ri * (ch + 8);
      c.font = `600 26px ${BODY}`; txt(c, fit(c, row.machine, 170), lx, y + ch / 2 + 9, { size: 26, weight: 600, color: T.ink });
      HOURS.forEach((hr, i) => {
        const v = row.hours[hr], x = gx + i * cw + 3;
        rr(c, x, y, cw - 6, ch, 10);
        if (v) { c.fillStyle = T.v; c.globalAlpha = 0.16 + 0.84 * (v / max); c.fill(); c.globalAlpha = 1; if (cw > 56) txt(c, v >= 60 ? `${Math.floor(v / 60)}h${String(v % 60).padStart(2, '0')}` : `${v}'`, x + (cw - 6) / 2, y + ch / 2 + 8, { size: 19, weight: 600, color: v / max > 0.5 ? '#fff' : T.ink, align: 'center' }); }
        else { c.fillStyle = T.empty; c.globalAlpha = 0.5; c.fill(); c.globalAlpha = 1; }
      });
    });
    const ly = H - 130; txt(c, 'menos parado', gx, ly + 16, { size: 22, color: T.muted });
    const g = c.createLinearGradient(gx + 170, 0, gx + 470, 0); g.addColorStop(0, T.v + '30'); g.addColorStop(1, T.v); rr(c, gx + 170, ly, 300, 18, 9); c.fillStyle = g; c.fill();
    txt(c, `mais parado (${fmtDur(max)} numa hora)`, gx + 490, ly + 16, { size: 22, color: T.muted });
  });

  // 6. by hour
  make((c, n, t) => {
    frame(c, T, 'Paradas ao longo do dia', `${scope ? `${scope} · ` : ''}minutos parados em cada hora (o dia começa às 04h)`, n, t);
    const x0 = M + 40, x1 = W - M - 20, y0 = 250, y1 = 880, max = Math.max(1, ...P.byHour), step = (x1 - x0) / 23;
    const pts = HOURS.map((hr, i) => [x0 + i * step, y1 - (P.byHour[hr] / max) * (y1 - y0 - 40), hr]);
    c.strokeStyle = T.line; c.lineWidth = 1.5; c.setLineDash([8, 10]);
    for (let k = 1; k <= 4; k++) { const y = y1 - (k / 4) * (y1 - y0 - 40); c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); txt(c, fmtDur(Math.round((max * k) / 4)), x0 - 14, y + 7, { size: 20, color: T.muted, align: 'right' }); }
    c.setLineDash([]);
    const path = new Path2D(); path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) { const q = pts[i - 1], p = pts[i], mx = (q[0] + p[0]) / 2; path.bezierCurveTo(mx, q[1], mx, p[1], p[0], p[1]); }
    const area = new Path2D(path); area.lineTo(pts.at(-1)[0], y1); area.lineTo(pts[0][0], y1); area.closePath();
    const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, T.v + 'aa'); g.addColorStop(1, T.v + '00'); c.fillStyle = g; c.fill(area);
    c.lineWidth = 6; c.lineJoin = 'round'; c.strokeStyle = T.v2; c.stroke(path);
    pts.forEach((p, i) => { if (i % 2 === 0) txt(c, String(p[2]), p[0], y1 + 44, { size: 24, color: T.muted, align: 'center' }); });
    const peaks = [];
    for (const p of [...pts].filter((q) => P.byHour[q[2]] > 0).sort((a, b) => P.byHour[b[2]] - P.byHour[a[2]])) if (peaks.length < 3 && peaks.every((q) => Math.abs(q[0] - p[0]) > 190)) peaks.push(p); // labels never overlap
    peaks.forEach((p) => {
      c.beginPath(); c.arc(p[0], p[1], 11, 0, Math.PI * 2); c.fillStyle = T.ink; c.fill(); c.lineWidth = 5; c.strokeStyle = T.v; c.stroke();
      txt(c, `${hh(p[2])}: ${fmtDur(P.byHour[p[2]])}`, Math.min(Math.max(p[0], x0 + 90), x1 - 90), p[1] - 26, { size: 26, weight: 700, color: T.ink, align: 'center' });
    });
  });

  // 7. longest stops
  if (P.top.length) make((c, n, t) => {
    frame(c, T, 'Maiores paradas', scope, n, t);
    P.top.slice(0, 8).forEach((s, i) => {
      const y = 190 + i * 100; rr(c, M, y, W - 2 * M, 88, 20); c.fillStyle = i % 2 ? T.bg : T.card; c.fill();
      const full = stopsAll.find((x) => x.page === s.page && x.table === s.table && x.ri === s.ri) ?? s;
      txt(c, fmtDur(s.min), M + 40, y + 56, { size: 40, weight: 700, color: T.v2, font: FONT });
      c.fillStyle = motColor(T, s.motivo); rr(c, M + 250, y + 30, 18, 18, 5); c.fill();
      txt(c, `${s.machine} · ${s.motivo}`, M + 286, y + 46, { size: 28, weight: 600, color: T.ink });
      txt(c, `${full.day ? `${full.day.slice(0, 5)} · ` : ''}${full.clock ?? ''}${full.fim ? `–${full.fim}` : ''} · ${who(full.chapa) || 'sem operador'}`, M + 286, y + 76, { size: 22, color: T.muted });
      c.font = `400 24px ${BODY}`; const lines = wrap(c, s.desc || 'sem observação', 700, 2);
      lines.forEach((l, k) => txt(c, l, W - M - 40, y + 40 + k * 28 - (lines.length - 1) * 10, { size: 24, color: s.desc ? T.ink : T.muted, align: 'right' }));
    });
  });

  // 8+. annex: all stops, with the observation
  const per = 11, pagesN = Math.ceil(stopsAll.length / per);
  const sorted = [...stopsAll].sort((a, b) => (a.day || '').split('/').reverse().join('').localeCompare((b.day || '').split('/').reverse().join('')) || a.machine.localeCompare(b.machine) || a.ini - b.ini);
  for (let p = 0; p < pagesN; p++) make((c, n, t) => {
    frame(c, T, 'Anexo · todas as paradas', `${scope ? `${scope} · ` : ''}${p * per + 1} a ${Math.min(stopsAll.length, (p + 1) * per)} de ${stopsAll.length}`, n, t);
    const cols = [['Dia', M + 20, 'left'], ['Máquina', M + 130, 'left'], ['Motivo', M + 320, 'left'], ['Início', M + 740, 'left'], ['Fim', M + 850, 'left'], ['Duração', M + 1030, 'right'], ['Operador', M + 1060, 'left'], ['Observação', M + 1330, 'left']];
    cols.forEach(([l, x, al]) => txt(c, l.toUpperCase(), x, 206, { size: 19, weight: 600, color: T.muted, align: al }));
    sorted.slice(p * per, (p + 1) * per).forEach((s, i) => {
      const y = 226 + i * 70; rr(c, M, y, W - 2 * M, 62, 14); c.fillStyle = i % 2 ? T.bg : T.card; c.fill();
      const by = y + 40;
      txt(c, s.day ? s.day.slice(0, 5) : '—', M + 20, by, { size: 24, color: T.ink }); c.font = `700 24px ${BODY}`; txt(c, fit(c, s.machine, 170), M + 130, by, { size: 24, weight: 700, color: T.ink });
      c.fillStyle = motColor(T, s.motivo); rr(c, M + 320, y + 22, 16, 16, 4); c.fill(); c.font = `400 24px ${BODY}`; txt(c, fit(c, s.motivo, 360), M + 346, by, { size: 24, color: T.ink });
      txt(c, s.clock, M + 740, by, { size: 24, color: T.ink }); txt(c, s.fim, M + 850, by, { size: 24, color: T.ink }); txt(c, fmtDur(s.min), M + 1030, by, { size: 24, weight: 700, color: T.ink, align: 'right' });
      c.font = `400 22px ${BODY}`; txt(c, fit(c, who(s.chapa) || '—', 250), M + 1060, by, { size: 22, color: T.ink });
      const d = wrap(c, s.desc || '—', 500, 2); d.forEach((l, k) => txt(c, l, M + 1330, d.length > 1 ? y + 26 + k * 24 : by, { size: 22, color: s.desc ? T.ink : T.muted }));
    });
  });
  return out;
}

async function renderAll(P, opt, theme) {
  const T = THEMES[theme] ?? THEMES.dark;
  try { await document.fonts?.ready; } catch { /* fonts are optional */ }
  const draws = slides(P, opt, T), canvases = [];
  draws.forEach((draw, i) => {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    draw(cv.getContext('2d'), i + 1, draws.length); canvases.push(cv);
  });
  return canvases;
}

const b64bytes = (url) => { const bin = atob(url.split(',')[1]), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
function save(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function exportPanelPdf(P, opt, theme) {
  const cvs = await renderAll(P, opt, theme);
  const pages = cvs.map((cv) => ({ jpeg: b64bytes(cv.toDataURL('image/jpeg', 0.92)), w: W, h: H }));
  save(new Blob([jpegsToPdf(pages, 841.89)], { type: 'application/pdf' }), `painel-${theme === 'light' ? 'claro' : 'escuro'}-${new Date().toISOString().slice(0, 10)}.pdf`);
  return cvs.length;
}

// Excel: the slides as pictures in the first sheet, then one formatted sheet of data per chart
export async function exportPanelExcel(P, opt, theme) {
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default;
  const T = THEMES[theme] ?? THEMES.dark, hex = (s) => s.replace('#', '').slice(0, 6).toUpperCase();
  const who = opt.who ?? ((x) => x);
  const wb = new ExcelJS.Workbook(); wb.creator = 'Maple Tapping'; wb.created = new Date();
  const fill = (color) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hex(color)}` } });
  const bg = theme === 'light' ? 'FFFFFF' : '0B0B12', cardC = theme === 'light' ? 'F4F3FB' : '16161F', inkC = hex(T.ink), vC = hex(T.v);

  // 1) presentation sheet
  const cvs = await renderAll(P, opt, theme);
  const ws0 = wb.addWorksheet('Apresentação', { views: [{ showGridLines: false }] });
  ws0.properties.tabColor = { argb: `FF${vC}` };
  for (let r = 1; r <= cvs.length * 31 + 2; r++) for (let c = 1; c <= 20; c++) ws0.getCell(r, c).fill = fill(bg);
  cvs.forEach((cv, i) => {
    const id = wb.addImage({ base64: cv.toDataURL('image/jpeg', 0.9), extension: 'jpeg' });
    ws0.addImage(id, { tl: { col: 0.2, row: i * 31 + 1 }, ext: { width: 1120, height: 630 } });
  });

  // 2) data sheets
  const charts = []; // native Excel charts, injected after the workbook is written
  const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const sheet = (name, head, rows, widths, opts = {}) => {
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false, state: 'frozen', ySplit: 1 }] });
    ws.addRow(head); rows.forEach((r) => ws.addRow(r));
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
    const lastRow = rows.length + 1, lastCol = head.length;
    for (let r = 1; r <= lastRow + 6; r++) for (let c = 1; c <= lastCol + 3; c++) ws.getCell(r, c).fill = fill(r === 1 && c <= lastCol ? T.v : r % 2 ? bg : cardC);
    for (let c = 1; c <= lastCol; c++) { const h = ws.getCell(1, c); h.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 }; h.alignment = { vertical: 'middle' }; }
    for (let r = 2; r <= lastRow; r++) for (let c = 1; c <= lastCol; c++) { const cell = ws.getCell(r, c); cell.font = { color: { argb: `FF${inkC}` }, size: 11 }; cell.alignment = { vertical: 'top', wrapText: true }; }
    ws.getRow(1).height = 26;
    if (opts.autoFilter) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: lastCol } };
    for (const bar of opts.bars ?? []) ws.addConditionalFormatting({ ref: `${bar}2:${bar}${lastRow}`, rules: [{ type: 'dataBar', priority: 1, minLength: 0, maxLength: 100, gradient: true, cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: `FF${vC}` } }] });
    if (opts.scale) ws.addConditionalFormatting({ ref: opts.scale(lastRow, lastCol), rules: [{ type: 'colorScale', priority: 2, cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: [{ argb: `FF${theme === 'light' ? 'FFFFFF' : '16161F'}` }, { argb: `FF${vC}` }] }] });
    if (opts.chart && rows.length) { // a 1-pixel picture makes ExcelJS create the drawing part the chart goes into
      ws.addImage(wb.addImage({ base64: PIXEL, extension: 'png' }), { tl: { col: 0, row: 0 }, ext: { width: 1, height: 1 } });
      charts.push({ sheetIndex: ws.id, from: { col: lastCol + 1, row: 1 }, to: { col: lastCol + 11, row: 22 },
        spec: { ...opts.chart, sheet: name, catCol: 1, valCol: opts.chart.valCol ?? 2, firstRow: 2, cats: rows.map((r) => r[0]), vals: rows.map((r) => r[(opts.chart.valCol ?? 2) - 1]), T } });
    }
    return ws;
  };
  const pct = (m) => (P.stopMin ? m / P.stopMin : 0);
  const sum = sheet('Resumo', ['Indicador', 'Valor', 'Observação'], [
    ['Tempo parado', fmtDur(P.stopMin), `${P.pct} % do tempo registrado`], ['Tempo produzindo', fmtDur(P.prodMin), `${P.prodPct} % do tempo registrado`], ['Paradas (registros)', P.count, ''],
    ['Maior parada', P.longest ? fmtDur(P.longest.min) : '—', P.longest ? `${P.longest.machine} · ${P.longest.motivo}` : ''], ['Filtro', opt.groupLabel || 'Todas as máquinas', opt.dayLabel || 'Todos os dias'],
    ['Gerado em', new Date().toLocaleString('pt-BR'), 'Maple Tapping · Diário de Bordo']], [26, 22, 44]);
  sum.getColumn(2).alignment = { horizontal: 'left' };
  const mot = sheet('Por motivo', ['Motivo', 'Tempo parado (min)', 'Tempo', '% do parado', 'Vezes'], P.byMotivo.map((x) => [x.motivo, x.min, fmtDur(x.min), pct(x.min), x.count]), [30, 20, 12, 14, 10], { bars: ['B'], chart: { type: 'doughnut', title: 'Tempo parado por motivo', seriesName: 'Tempo parado (min)', colors: P.byMotivo.map((x) => motColor(T, x.motivo)) } });
  mot.getColumn(4).numFmt = '0.0%';
  sheet('Por máquina', ['Máquina', 'Parado (min)', 'Parado', 'Produzindo (min)', 'Produzindo', '% parada', 'Paradas'], P.byMachine.map((m) => [m.name, m.stopMin, fmtDur(m.stopMin), m.prodMin, fmtDur(m.prodMin), m.pct / 100, m.count]), [18, 14, 12, 18, 14, 12, 10], { bars: ['B'], chart: { type: 'bar', title: 'Tempo parado por máquina (min)', seriesName: 'Parado (min)' } }).getColumn(6).numFmt = '0%';
  sheet('Por turno', ['Turno', 'Parado (min)', 'Parado'], P.byTurno.map((x) => [x.turno === '?' ? 'Sem turno' : `Turno ${x.turno}`, x.min, fmtDur(x.min)]), [16, 14, 12], { bars: ['B'], chart: { type: 'column', title: 'Tempo parado por turno (min)', seriesName: 'Parado (min)' } });
  sheet('Por hora', ['Hora', 'Parado (min)', 'Parado'], HOURS.map((hr) => [hh(hr), P.byHour[hr], fmtDur(P.byHour[hr])]), [10, 14, 12], { bars: ['B'], chart: { type: 'area', title: 'Paradas ao longo do dia (min por hora)', seriesName: 'Parado (min)' } });
  sheet('Mapa de calor', ['Máquina', ...HOURS.map(hh)], P.heat.map((r) => [r.machine, ...HOURS.map((hr) => r.hours[hr] || 0)]), [18, ...HOURS.map(() => 6)], { scale: (lr, lc) => `B2:${String.fromCharCode(64 + lc)}${lr}` });
  const sorted = [...P.all].sort((a, b) => b.min - a.min);
  sheet('Paradas', ['Dia', 'Folha', 'Máquina', 'Motivo', 'Início', 'Fim', 'Duração (min)', 'Duração', 'Turno', 'Operador', 'Chapa', 'Observação'],
    sorted.map((s) => [s.day, s.folha, s.machine, s.motivo, s.clock, s.fim, s.min, fmtDur(s.min), s.turno === '?' ? '' : s.turno, who(s.chapa) === `chapa ${s.chapa}` ? '' : who(s.chapa), s.chapa, s.desc || '']),
    [12, 22, 12, 22, 9, 9, 14, 11, 8, 28, 10, 50], { autoFilter: true, bars: ['G'] });
  let buf = await wb.xlsx.writeBuffer();
  if (charts.length) { const JSZip = (await import('jszip')).default; buf = await injectCharts(JSZip, buf, charts); }
  save(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `painel-${theme === 'light' ? 'claro' : 'escuro'}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  return cvs.length;
}
