import { readFiles, toCanvas, jpegB64, jpegUrl } from './files.js';
import { analyze, detectMachine } from './core/layout.js';
import { analyze as analyseSheets, compactForAI, fmtDur } from './core/analysis.js';
import { inkIn, cropToPaper } from './core/image.js';
import { readSheet } from './core/gemini.js';
import { apiPost, checkLogin, login } from './api.js';
import { usageText, nearLimit, getLimit, setLimit, quotaHit, clearQuota } from './usage.js';
import { buildPage, reconcile, applyInkMotivo, alignRows, alignJson, collectAsk, applyThirdReading, normMachine } from './core/rows.js';
import { allRows, toTSV, workbookBytes } from './core/export.js';
import { getLists, saveGroupLists, learnAlias, resetLists, setActiveGroup, groupOf as listGroup } from './core/lists.js';
import { saveState, loadState } from './store.js';
import { MOTIVOS, MAQUINAS } from './data/vocab.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = { pages: [], nextId: 1, batch: 0, busy: false, undo: null, reviewed: false, okAt: null, okSig: '', analysis: null, ai: null, tab: 'read' };
const secrets = new Map(); // page id → { images } kept only in memory, for "tentar de novo"

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}

// ---------------------------------------------------------------- persistence

let saveTimer;
function persist(delay = 400) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const keep = state.pages.filter((p) => p.status === 'ok' || p.status === 'erro').map(({ id, label, file, batch, status, error, machine, machineFlag, date, include, single, dup, geomWarn, rowWarn, third, crop, prod, stops }) => ({ id, label, file, batch, status, error, machine, machineFlag, date, include, single, dup, geomWarn, rowWarn, third, crop, prod, stops }));
    saveState({ pages: keep, nextId: state.nextId, batch: state.batch, reviewed: state.reviewed, okAt: state.okAt, okSig: state.okSig, ai: Array.isArray(state.ai) ? state.ai : null });
  }, delay);
}

async function restore() {
  const saved = await loadState();
  if (!saved?.pages?.length) return;
  state.nextId = saved.nextId ?? saved.pages.length + 1;
  state.batch = saved.batch ?? 0;
  for (const p of saved.pages) {
    if (p.status === 'erro') p.error = `${p.error || 'Erro'} (envie o arquivo de novo para repetir)`;
    p.file ??= String(p.label).split(' · pág.')[0];
    p.pending = false;
    state.pages.push(p);
    $('pages').append(h('section', { class: 'card page', id: `page-${p.id}` }));
    renderPage(p);
  }
  if (saved.reviewed && sig() === saved.okSig) {
    state.reviewed = true; state.okAt = saved.okAt; state.okSig = saved.okSig;
    state.analysis = analyseSheets(includedPages());
    state.analysis.ai = Array.isArray(saved.ai) ? saved.ai : null; state.ai = state.analysis.ai;
  }
  updateSummary();
}

// ---------------------------------------------------------------- reading a page

function prepare(imageIn, { photo = false } = {}) {
  const image = photo ? cropToPaper(imageIn) : imageIn;
  let lay = null;
  try { lay = analyze(image, { photo }); } catch (e) { console.warn('layout', e); }
  if (!lay) {
    const full = toCanvas(image, 0, 0, image.width, image.height, 2000);
    return { A: [jpegB64(full, 0.88)], B: [jpegB64(full, 0.9)], strips: { prod: [], stops: [] }, bubble: '', inkMotivo: [], geomOk: false, rowInk: null, crop: null };
  }
  const { img, prodX, prodY, stopX, stopY, scale: sc } = lay;
  const full = toCanvas(img, 0, 0, img.width, img.height, 2000);
  const crop = (xs, ys, headPx, maxW) => toCanvas(img, xs[0] - 8, ys[0] - headPx * sc, xs.at(-1) - xs[0] + 16, ys.at(-1) - ys[0] + headPx * sc + 6, maxW);
  const strip = (xs, ys, i) => jpegUrl(toCanvas(img, xs[0] - 2, ys[i] - 2, xs.at(-1) - xs[0] + 4, ys[i + 1] - ys[i] + 4, 1500), 0.8);
  // which motive column holds the X on each stop row, measured from the pixels
  const inkMotivo = stopY.slice(0, -1).map((_, r) => {
    const inks = MOTIVOS.map((__, i) => inkIn(lay.masks, stopX[6 + i] + 4 * sc, stopY[r] + 4 * sc, stopX[7 + i] - 4 * sc, stopY[r + 1] - 4 * sc));
    const min = 45 * sc * sc;
    const hit = inks.map((v, i) => [v, i]).filter(([v]) => v > min).sort((a, b) => b[0] - a[0]);
    if (!hit.length) return -1;
    return hit.length > 1 && hit[1][0] > hit[0][0] * 0.3 ? [hit[0][1], hit[1][1]] : hit[0][1];
  });
  // which printed rows really hold writing, and whether their turno cell is filled
  const cellInk = (xs, ys, r, cols) => cols.reduce((t, c) => t + inkIn(lay.masks, xs[c] + 3 * sc, ys[r] + 3 * sc, xs[c + 1] - 3 * sc, ys[r + 1] - 3 * sc), 0);
  const min = 40 * sc * sc;
  const rowsOf = (ys, test) => ys.slice(0, -1).map((_, r) => (test(r) ? r : -1)).filter((r) => r >= 0);
  const prodRows = rowsOf(prodY, (r) => cellInk(prodX, prodY, r, [5, 6, 8, 9, 11, 12]) > min);
  // a stain on the reason columns must not count as a row: a real stop always has a chapa or times
  const stopRows = rowsOf(stopY, (r) => cellInk(stopX, stopY, r, [2, 3, 4]) > min);
  const rowInk = lay.geomOk ? {
    prodRows, stopRows,
    prodTurno: prodY.slice(0, -1).map((_, r) => cellInk(prodX, prodY, r, [13]) > min),
    stopTurno: stopY.slice(0, -1).map((_, r) => cellInk(stopX, stopY, r, [5]) > min),
  } : null;
  const meta = (xs, ys) => {
    const x0 = xs[0] - 2, W = xs.at(-1) - xs[0] + 4;
    const rowH = (ys.at(-1) - ys[0]) / (ys.length - 1) + 4;
    return { cols: xs.slice(0, -1).map((x, i) => [(x - x0) / W, (xs[i + 1] - x0) / W]), aspect: W / rowH };
  };
  return {
    crop: lay.geomOk ? { prod: meta(prodX, prodY), stops: meta(stopX, stopY) } : null,
    rowInk,
    // the X column is only trusted when the printed grid was recognised on this sheet
    inkMotivo: lay.geomOk ? inkMotivo : [],
    geomOk: lay.geomOk,
    A: [jpegB64(full, 0.88), jpegB64(crop(prodX, prodY, 62, 2200), 0.9), jpegB64(crop(stopX, stopY, 100, 2200), 0.9)],
    B: [jpegB64(crop(prodX, prodY, 62, 2400), 0.92), jpegB64(crop(stopX, stopY, 100, 2400), 0.92)],
    strips: { prod: prodY.slice(0, -1).map((_, i) => strip(prodX, prodY, i)), stops: stopY.slice(0, -1).map((_, i) => strip(stopX, stopY, i)) },
    bubble: detectMachine(lay).machine ?? '',
  };
}

function hints() {
  const { chapas, pecas, modelos } = getLists();
  return { chapas, pecas, modelos };
}

async function readPage(p) {
  p.status = 'lendo'; p.error = ''; p.pending = false; renderPage(p);
  const sec = secrets.get(p.id);
  if (!sec) { p.status = 'erro'; p.error = 'Envie o arquivo de novo para ler esta folha'; renderPage(p); return; }
  try {
    const [a, b] = await Promise.allSettled([
      readSheet({ images: sec.A, pass: 'A', hints: hints() }),
      readSheet({ images: sec.B, pass: 'B', hints: hints() }),
    ]);
    if (a.status === 'rejected' && b.status === 'rejected') throw a.reason;
    setActiveGroup(listGroup(sec.bubble || normMachine((a.value ?? b.value)?.maquina)));
    const single = a.status === 'rejected' || b.status === 'rejected';
    const json = single ? (a.status === 'fulfilled' ? a.value : b.value) : reconcile(a.value, b.value);
    // third reading, only for the cells where the first two readings disagree on a chapa or a time
    p.third = 0;
    if (!single) {
      alignJson(json, sec.rowInk);
      const ask = collectAsk(json);
      const withStrip = ask.filter((x) => (x.tabela === 'prod' ? sec.strips.prod : sec.strips.stops)[x.linha - 1]);
      if (withStrip.length) {
        try {
          const images = withStrip.map((x) => (x.tabela === 'prod' ? sec.strips.prod : sec.strips.stops)[x.linha - 1].split(',')[1]);
          const c = await readSheet({ images, pass: 'C', hints: hints(), extra: { ask: withStrip } });
          applyThirdReading(json, c.respostas);
          p.third = withStrip.length;
        } catch (e) { /* the two readings stand; the divergences stay flagged */ if (e.quota) state.quotaHit = true; }
      }
    }
    const built = buildPage(json, { year: Number($('year').value) || new Date().getFullYear(), meta: { machineFromBubble: sec.bubble } });
    const rowWarns = alignRows(built, sec.rowInk);
    applyInkMotivo(built, sec.inkMotivo);
    Object.assign(p, built, { status: 'ok', single, geomWarn: !sec.geomOk, rowWarn: rowWarns.join('; '), crop: sec.crop });
    for (const r of p.prod) r.strip = sec.strips.prod[r.linha - 1];
    for (const r of p.stops) r.strip = sec.strips.stops[r.linha - 1];
    p.include = true;
    markDuplicates();
  } catch (e) {
    p.status = 'erro'; p.error = e.message;
    if (e.quota) { state.quotaHit = true; p.pending = true; }
  }
  renderPage(p); updateSummary(); persist(); updateQuotaUi();
}

function signature(p) {
  const r = p.prod[0] ?? p.stops[0];
  return r ? `${p.machine}|${p.date}|${r.ini1 ?? r.ini}|${r.chapa1 ?? r.chapa}` : '';
}
function markDuplicates() {
  const seen = new Map();
  for (const p of state.pages) {
    if (p.status !== 'ok') continue;
    const s = signature(p);
    p.dup = '';
    if (!s) continue;
    if (seen.has(s)) p.dup = `parece repetida (${seen.get(s)})`;
    else seen.set(s, p.label);
  }
  state.pages.forEach((p) => { if (p.status === 'ok') renderPage(p); });
}

async function processFiles(files, { append = false } = {}) {
  if (state.busy) return toast('Aguarde a leitura atual terminar');
  state.busy = true;
  // Only the file being uploaded now is analysed: whatever was loaded before is removed.
  state.quotaHit = false;
  if (state.pages.length && !append) {
    for (const p of state.pages) secrets.delete(p.id);
    state.pages = []; $('pages').replaceChildren();
    toast('Leitura anterior removida. A análise vale só para o arquivo que você enviou agora.');
  }
  discardUndo(); resetReview();
  const st = $('status');
  st.hidden = false;
  let n = 0;
  try {
    for await (const item of readFiles(files)) {
      n++;
      st.replaceChildren(h('div', {}, `Lendo ${item.name}, página ${item.page}${item.total > 1 ? ` de ${item.total}` : ''}… não feche esta aba.`), h('progress', { max: item.total, value: item.page - 1 }));
      await new Promise((r) => setTimeout(r)); // let the browser paint
      const prep = prepare(item.image, { photo: !!item.photo });
      if (item.page === 1) state.batch++;
      const p = { id: state.nextId++, batch: state.batch, file: item.name, label: `${item.name} · pág. ${item.page}`, status: 'lendo', error: '', machine: '', date: '', include: false, prod: [], stops: [] };
      secrets.set(p.id, prep);
      state.pages.push(p);
      $('pages').append(h('section', { class: 'card page', id: `page-${p.id}` }));
      if (state.quotaHit) {
        // the free quota ran out: keep the prepared page and let the person resume later
        p.status = 'erro'; p.pending = true; p.error = 'Aguardando a cota do Gemini voltar. Use "Retomar leitura".';
        renderPage(p); persist();
      } else await readPage(p);
    }
    updateQuotaUi();
    toast(state.quotaHit ? 'A cota do Gemini acabou no meio da leitura. O que faltou ficou aguardando: use "Retomar leitura" quando ela voltar.' : n ? 'Leitura concluída. Confira as células destacadas.' : 'Nenhuma página encontrada nos arquivos');
  } catch (e) {
    toast(`Erro ao abrir arquivo: ${e.message}`);
  } finally {
    state.busy = false; st.hidden = true; updateSummary();
  }
}

// ---------------------------------------------------------------- rendering

const PROD_FIELDS = [
  ['data', 'DATA', 104], ['peca', 'PEÇA', 110], ['modelo', 'MODELO', 120],
  ['chapa1', 'CHAPA', 66, 'num'], ['ini1', 'INÍCIO', 60, 'num'], ['fim1', 'FIM', 60, 'num'],
  ['chapa2', 'CHAPA 2º', 66, 'num'], ['ini2', 'INÍCIO', 60, 'num'], ['fim2', 'FIM', 60, 'num'],
  ['chapa3', 'CHAPA 3º', 66, 'num'], ['ini3', 'INÍCIO', 60, 'num'], ['fim3', 'FIM', 60, 'num'],
  ['turno', 'TURNO FINAL', 52, 'num'], ['obs', 'OBSERVAÇÕES', 160],
];
const STOP_FIELDS = [
  ['data', 'DATA', 104], ['chapa', 'CHAPA', 66, 'num'], ['ini', 'INÍCIO', 60, 'num'], ['fim', 'FIM', 60, 'num'],
  ['turno', 'TURNO', 52, 'num'], ['motivo', 'MOTIVO', 150], ['desc', 'DESCRIÇÃO', 260],
];
const BAD = /inválid|ilegível|desconhecid|sem motivo|falta|iguais|corrigida|duração|parada de|fora da lista/;

function fieldCell(p, kind, ri, row, [key, , , cls]) {
  const flag = row.flags?.[key];
  const bad = flag && BAD.test(flag);
  const attrs = { dataset: { p: p.id, k: kind, r: ri, f: key }, title: flag || row.learned?.[key] ? `${flag ?? ''}${row.learned?.[key] ? ` (aprendido: li "${row.learned[key]}")` : ''}` : false };
  const control = key === 'motivo'
    ? h('select', attrs, h('option', { value: '' }, '—'), [...MOTIVOS, ...(row.motivo && !MOTIVOS.includes(row.motivo) ? [row.motivo] : [])].map((m) => h('option', { value: m, selected: m === row.motivo }, m)))
    : h('input', { ...attrs, type: 'text', value: row[key] ?? '', spellcheck: false });
  return h('td', { class: `${cls ?? ''}${flag ? ' flag' : ''}${bad ? ' bad' : ''}` }, control);
}

const hasDoubt = (row) => !!row.rowFlag || Object.keys(row.flags ?? {}).length > 0;

function tableFor(p, kind, rows, fields) {
  const head = h('tr', {}, fields.map(([, label, w]) => h('th', { style: `min-width:${w}px` }, label)), h('th'));
  const body = [];
  rows.forEach((row, ri) => {
    const cls = hasDoubt(row) ? '' : ' clean';
    if (row.strip || row.rowFlag) {
      body.push(h('tr', { class: `strip${cls}` }, h('td', { colspan: fields.length + 1 },
        h('div', { class: 'rowtag' }, h('b', {}, row.linha ? `linha ${row.linha}` : 'linha nova'), row.rowFlag ? h('span', { class: 'tag bad' }, row.rowFlag) : null),
        row.strip ? h('img', { src: row.strip, alt: `Linha ${row.linha} da folha`, dataset: { zoom: 1 } }) : null)));
    }
    body.push(h('tr', { class: `fields${cls}`, id: `row-${p.id}-${kind}-${ri}` }, fields.map((f) => fieldCell(p, kind, ri, row, f)),
      h('td', {}, h('button', { class: 'rm', type: 'button', title: 'Remover linha', dataset: { act: 'rm', p: p.id, k: kind, r: ri } }, '✕'))));
  });
  return h('div', { class: 'scroll' }, h('table', { class: 'grid' }, h('thead', {}, head), h('tbody', {}, body)));
}

function countFlags(p) {
  return [...p.prod, ...p.stops].reduce((n, r) => n + Object.keys(r.flags ?? {}).length + (r.rowFlag ? 1 : 0), 0);
}

function renderPage(p) {
  const root = $(`page-${p.id}`);
  if (!root) return;
  root.classList.toggle('skipped', p.status === 'ok' && !p.include);
  const flags = p.status === 'ok' ? countFlags(p) : 0;
  const header = h('header', {},
    h('h2', {}, p.label,
      p.status === 'ok' ? h('select', { dataset: { p: p.id, act: 'machine' } },
        h('option', { value: '' }, 'máquina?'), MAQUINAS.map((m) => h('option', { value: m, selected: m === p.machine }, m)),
        p.machine && !MAQUINAS.includes(p.machine) ? h('option', { value: p.machine, selected: true }, p.machine) : null) : null,
      p.status === 'ok' && p.date ? h('span', { class: 'meta' }, p.date.slice(0, 5)) : null,
      p.machineFlag ? h('span', { class: 'tag bad' }, p.machineFlag) : null,
      p.single ? h('span', { class: 'tag bad' }, 'só 1 leitura (a outra falhou)') : null,
      p.geomWarn ? h('span', { class: 'tag' }, 'grade da folha não reconhecida: confira os motivos') : null,
      p.rowWarn ? h('span', { class: 'tag bad' }, p.rowWarn) : null,
      p.third ? h('span', { class: 'tag' }, `3ª leitura em ${p.third} linha(s)`) : null,
      p.dup ? h('span', { class: 'tag bad' }, p.dup) : null,
      p.status === 'ok' ? h('span', { class: 'meta' }, `${p.prod.length} produção · ${p.stops.length} paradas`) : null,
      flags ? h('span', { class: 'tag' }, `${flags} para conferir`) : null),
    h('div', { class: 'page-actions' },
      p.status === 'ok'
        ? h('label', {}, h('input', { type: 'checkbox', checked: p.include, dataset: { p: p.id, act: 'include' } }), ' incluir na exportação')
        : null,
      h('button', { type: 'button', class: 'ghost rm', title: 'Excluir esta folha', dataset: { act: 'delpage', p: p.id } }, 'Excluir folha')));
  const bodyKids = [];
  if (p.status === 'lendo') bodyKids.push(h('p', {}, 'Lendo esta página (duas leituras)…'));
  if (p.status === 'erro') bodyKids.push(h('p', { class: 'err' }, `Não consegui ler: ${p.error}`), h('button', { type: 'button', dataset: { act: 'retry', p: p.id } }, 'Tentar de novo'));
  if (p.status === 'ok') {
    if (!p.machine) bodyKids.push(h('p', { class: 'note' }, 'A máquina desta folha não foi identificada. Escolha acima; se deixar em branco, o Excel sai com a coluna ROBÔ vazia.'));
    bodyKids.push(
      h('h3', {}, 'Produção'), p.prod.length ? tableFor(p, 'prod', p.prod, PROD_FIELDS) : h('p', { class: 'note' }, 'Nenhuma linha de produção preenchida.'),
      h('button', { type: 'button', dataset: { act: 'add', p: p.id, k: 'prod' } }, '+ linha'),
      h('h3', {}, 'Paradas'), p.stops.length ? tableFor(p, 'stops', p.stops, STOP_FIELDS) : h('p', { class: 'note' }, 'Nenhuma parada registrada.'),
      h('button', { type: 'button', dataset: { act: 'add', p: p.id, k: 'stops' } }, '+ linha'));
  }
  root.replaceChildren(header, ...bodyKids);
}

function okPages() { return state.pages.filter((p) => p.status === 'ok'); }
function includedPages() { return okPages().filter((p) => p.include); }

function updateSummary() {
  if (state.reviewed && sig() !== state.okSig) resetReview(true);
  const any = state.pages.length > 0;
  $('exportbar').hidden = !state.pages.some((p) => p.status === 'ok');
  updateReviewUi();
  $('tools').hidden = !any;
  const inc = includedPages();
  const { prod, stops } = allRows(inc);
  const flags = inc.reduce((n, p) => n + countFlags(p), 0);
  const last = lastGroup();
  $('dellast').hidden = !last.length;
  $('dellast').textContent = last.length ? `Zerar última leitura (${last[0].file}) e subir novo arquivo` : 'Zerar última leitura';
  $('undo').hidden = !state.undo;
  const all = okPages().length;
  $('selcount').textContent = all ? `${inc.length} de ${all} folha(s) selecionada(s)` : '';
  $('xlsx').disabled = !inc.length;
  $('quick').textContent = flags ? `Revisão rápida (${flags})` : 'Revisão rápida';
  $('xlsxall').textContent = `Baixar Excel com todas (${all})`;
  const nRaw = groupPages('raw').length, nUsi = groupPages('usi').length;
  $('xlsxraw').hidden = !(nRaw && nUsi); $('xlsxusi').hidden = !(nRaw && nUsi);
  $('xlsxraw').textContent = `Excel só RAW (${nRaw})`; $('xlsxusi').textContent = `Excel só usinagem (${nUsi})`;
  $('s-folhas').textContent = inc.length;
  $('s-prod').textContent = prod.length;
  $('s-stops').textContent = stops.length;
  $('s-flags').textContent = flags;
  const cells = prod.length * 10 + stops.length * 6;
  const pct = cells ? Math.max(0, Math.round(100 - (flags / cells) * 100)) : null;
  $('s-conf').textContent = pct == null ? '—' : `${pct}%`;
  $('ring').setAttribute('stroke-dasharray', `${pct ?? 0} 100`);
  $('summary').textContent = `${inc.length} folha(s) · ${prod.length} linhas de produção · ${stops.length} paradas${flags ? ` · ${flags} célula(s) para conferir` : ' · nada pendente'}`;
}

// ---------------------------------------------------------------- events

const pageOf = (id) => state.pages.find((p) => p.id === Number(id));
const LEARN = { peca: 'peca', modelo: 'modelo', chapa: 'chapa', chapa1: 'chapa', chapa2: 'chapa', chapa3: 'chapa' };

document.addEventListener('input', (e) => {
  const d = e.target.dataset;
  if (!d?.f) return;
  const row = pageOf(d.p)?.[d.k]?.[Number(d.r)];
  if (!row) return;
  row[d.f === 'desc' ? 'desc' : d.f] = e.target.value;
  if (row.flags?.[d.f]) { delete row.flags[d.f]; e.target.closest('td').classList.remove('flag', 'bad'); }
  updateSummary(); persist();
});

document.addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d?.act === 'machine') { const p = pageOf(d.p); p.machine = e.target.value; p.machineFlag = null; renderPage(p); updateSummary(); persist(); return; }
  if (d?.act === 'include') { const p = pageOf(d.p); p.include = e.target.checked; renderPage(p); updateSummary(); persist(); return; }
  if (d?.f && e.target.tagName === 'SELECT') e.target.dispatchEvent(new Event('input', { bubbles: true }));
  // teach the app: what the model read → what the person typed
  if (LEARN[d?.f]) learnFromEdit(pageOf(d.p)?.[d.k]?.[Number(d.r)], d.f, e.target.value.trim());
});

// What the model read → what the person typed: remembered, and applied to the other rows of the sheet.
function learnFromEdit(row, field, value) {
  const kind = LEARN[field];
  const raw = row?.raw?.[field];
  if (!kind || !raw || !value) return;
  if (String(raw).replace(/\s/g, '').toUpperCase() === value.replace(/\s/g, '').toUpperCase()) return;
  const fixed = kind === 'chapa' ? value.replace(/\D/g, '') : value.toUpperCase();
  learnAlias(kind, raw, fixed);
  const same = (x) => String(x ?? '').replace(/\s/g, '').toUpperCase() === String(raw).replace(/\s/g, '').toUpperCase();
  let n = 0;
  for (const pg of state.pages) {
    for (const tbl of [pg.prod, pg.stops]) {
      for (const r of tbl) {
        for (const f of Object.keys(LEARN)) {
          if (LEARN[f] === kind && same(r.raw?.[f]) && r[f] !== fixed) { r[f] = fixed; delete r.flags[f]; n++; }
        }
      }
    }
    if (pg.status === 'ok') renderPage(pg);
  }
  toast(`Aprendi: "${raw}" → "${fixed}"${n > 1 ? `. Corrigi mais ${n - 1} linha(s) igual(is)` : ''}. Da próxima vez corrijo sozinho.`);
  showLearned(); updateSummary(); persist();
}

document.addEventListener('click', (e) => {
  const img = e.target.closest('img[data-zoom]');
  if (img) { $('lightbox').querySelector('img').src = img.src; $('lightbox').hidden = false; return; }
  if (e.target.closest('#lightbox')) { $('lightbox').hidden = true; return; }
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { act, p: pid, k, r } = b.dataset;
  const p = pageOf(pid);
  if (act === 'goto') return goToRow(pid, k, r);
  if (act === 'rm') { p[k].splice(Number(r), 1); renderPage(p); updateSummary(); persist(); }
  if (act === 'add') { p[k].push({ linha: 0, flags: {}, raw: {}, learned: {} }); renderPage(p); updateSummary(); persist(); }
  if (act === 'retry') readPage(p);
  if (act === 'goto') goToRow(pid, k, r);
  if (act === 'delpage') removePages([p], `Folha ${p.label} excluída.`);
});

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }, text);
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(`${what} copiado. Cole na primeira célula vazia da coluna B.`);
}

function exportable() {
  const inc = includedPages();
  if (!inc.length) { toast('Nenhuma folha marcada para exportar'); return null; }
  return inc; // folhas sem máquina saem com a coluna ROBÔ vazia
}

$('copyprod').addEventListener('click', () => { const inc = exportable(); if (inc) copy(toTSV(allRows(inc).prod), 'PRODUÇÃO'); });
$('copystop').addEventListener('click', () => { const inc = exportable(); if (inc) copy(toTSV(allRows(inc).stops), 'PARADAS'); });
// the ANÁLISE sheet is added only when the analysed sheets are exactly the ones being exported
function analysisFor(pages) {
  const inc = includedPages();
  if (!state.reviewed || !state.analysis || !pages.length || !pages.every((p) => inc.includes(p))) return null;
  if (pages.length === inc.length) return state.analysis;       // exactly what was approved, with the AI points
  return analyseSheets(pages);                                    // a group of the approved sheets
}
function downloadExcel(pages, tag = '') {
  const blob = new Blob([workbookBytes(pages, analysisFor(pages))], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = h('a', { href: URL.createObjectURL(blob), download: `maple-tapping${tag ? `-${tag}` : ''}-${new Date().toISOString().slice(0, 10)}.xlsx` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
$('xlsx').addEventListener('click', () => { const inc = exportable(); if (inc) downloadExcel(inc); });
// every sheet that was read, whether or not it is ticked
// RAW and machining go to separate files (they live in different bases)
const groupOf = (m) => (/^RAW/.test(m) ? 'raw' : /^(UMC|HMC|NCBZ)/.test(m) ? 'usi' : 'none');
const groupPages = (g) => includedPages().filter((p) => groupOf(p.machine) === g);
$('xlsxraw').addEventListener('click', () => { const l = groupPages('raw'); l.length ? downloadExcel(l, 'RAW') : toast('Nenhuma folha RAW selecionada'); });
$('xlsxusi').addEventListener('click', () => { const l = groupPages('usi'); l.length ? downloadExcel(l, 'usinagem') : toast('Nenhuma folha de usinagem selecionada'); });
$('xlsxall').addEventListener('click', () => {
  const all = okPages();
  if (!all.length) return toast('Nenhuma folha lida para exportar');
  downloadExcel(all);
});
function selectAll(on) {
  for (const p of okPages()) { p.include = on; renderPage(p); }
  updateSummary(); persist();
}
$('selall').addEventListener('click', () => selectAll(true));
$('selnone').addEventListener('click', () => selectAll(false));

// ---------------------------------------------------------------- conferência → OK → análise
// What the person approved: the values of the selected sheets. Any change after the OK withdraws it.
function sig() {
  return JSON.stringify(includedPages().map((p) => [p.id, p.machine,
    p.prod.map((r) => [r.linha, r.data, r.peca, r.modelo, r.chapa1, r.ini1, r.fim1, r.chapa2, r.ini2, r.fim2, r.chapa3, r.ini3, r.fim3, r.turno, r.obs]),
    p.stops.map((r) => [r.linha, r.data, r.chapa, r.ini, r.fim, r.turno, r.motivo, r.desc])]));
}

function resetReview(edited = false) {
  const was = state.reviewed;
  state.reviewed = false; state.okAt = null; state.okSig = ''; state.analysis = null; state.ai = null;
  $('view-analysis').replaceChildren();
  if (state.tab === 'analysis') showTab('read');
  updateReviewUi();
  if (edited && was) { toast('Você alterou os dados depois do OK. Dê o OK de novo para atualizar a análise.'); persist(); }
}

function updateReviewUi() {
  const any = okPages().length > 0;
  $('tabs').hidden = !any;
  $('okbox').hidden = !any;
  $('tab-analysis').disabled = !state.reviewed;
  $('tab-lock').textContent = state.reviewed ? 'aprovada' : 'aguardando seu OK';
  $('okbox').classList.toggle('done', state.reviewed);
  const at = state.okAt ? new Date(state.okAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  $('okstate').textContent = state.reviewed
    ? `Aprovado às ${at}. Se você mudar qualquer dado, o OK é desfeito e a análise precisa ser refeita.`
    : 'Confira cada linha com o recorte da folha. A análise só é feita depois do seu OK.';
  if (!$('ok').dataset.sure) $('ok').textContent = state.reviewed ? 'OK dado · refazer análise' : 'Revisei tudo · dar OK e gerar análise';
}

function showTab(name) {
  state.tab = name;
  $('view-read').hidden = name !== 'read';
  $('view-analysis').hidden = name !== 'analysis';
  $('tab-read').classList.toggle('on', name === 'read');
  $('tab-analysis').classList.toggle('on', name === 'analysis');
  $('tab-read').setAttribute('aria-selected', String(name === 'read'));
  $('tab-analysis').setAttribute('aria-selected', String(name === 'analysis'));
  if (name === 'analysis') renderAnalysis();
}

function giveOk() {
  const inc = includedPages();
  if (state.busy) return toast('Aguarde a leitura terminar');
  if (!inc.length) return toast('Marque pelo menos uma folha para analisar');
  const flags = inc.reduce((n, p) => n + countFlags(p), 0);
  const btn = $('ok');
  if (flags && btn.dataset.sure !== '1') {
    btn.dataset.sure = '1';
    btn.textContent = `Ainda há ${flags} célula(s) marcada(s). Clique de novo para dar OK mesmo assim`;
    setTimeout(() => { btn.dataset.sure = ''; updateReviewUi(); }, 6000);
    return;
  }
  btn.dataset.sure = '';
  state.reviewed = true; state.okAt = new Date().toISOString(); state.okSig = sig();
  state.analysis = analyseSheets(inc); state.ai = 'loading';
  updateReviewUi(); showTab('analysis'); persist(0);
  fetchAI(state.analysis);
}

async function fetchAI(a) {
  try {
    const res = await apiPost('/api/analyze', { resumo: compactForAI(a) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Erro ${res.status}`);
    if (state.analysis !== a) return; // the OK was withdrawn meanwhile
    a.ai = body.pontos; state.ai = body.pontos;
  } catch (e) {
    if (state.analysis !== a) return;
    state.ai = { error: e.message };
  }
  if (state.tab === 'analysis') renderAnalysis();
  persist();
}

function goToRow(pid, table, ri) {
  showTab('read');
  $('onlyflags').checked = false; $('pages').classList.remove('onlyflags');
  const el = document.getElementById(`row-${pid}-${table}-${ri}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('hl');
  setTimeout(() => el.classList.remove('hl'), 2300);
}

const SEV = { alta: ['Alta', 'tag bad'], media: ['Média', 'tag'], info: ['Info', 'tag'] };

function renderAnalysis() {
  const root = $('view-analysis');
  const a = state.analysis;
  if (!a) { root.replaceChildren(h('p', { class: 'note' }, 'Dê o OK na aba de conferência para gerar a análise.')); return; }
  const at = new Date(state.okAt).toLocaleString('pt-BR');
  const tile = (lab, val, small, cls = '') => h('div', { class: `tile ${cls}` }, h('span', { class: 'lab' }, lab), h('b', {}, val), h('small', {}, small));

  const aiBlock = state.ai === 'loading' ? h('p', { class: 'skeleton' }, 'A IA está lendo os números para escrever os pontos importantes…')
    : Array.isArray(state.ai) ? h('ol', { class: 'apoints' }, state.ai.map((t) => h('li', {}, t)))
    : h('p', { class: 'note' }, `Não consegui gerar o resumo da IA (${state.ai?.error ?? 'erro'}). O resumo automático abaixo continua valendo.`);

  const sections = [
    h('section', { class: 'card' }, h('h2', { class: 'ptitle' }, `Análise · ${a.sheets} folha(s) · aprovada em ${at}`),
      h('div', { class: 'astats' },
        tile('Produzindo', fmtDur(a.totals.prodMin), 'tempo registrado'),
        tile('Parado', fmtDur(a.totals.stopMin), `${a.totals.pctStop} % do tempo`),
        tile('Horários que fecham', a.totals.fecham == null ? '—' : `${a.totals.fecham}%`, 'entre produção e paradas'),
        tile('Alertas altos', String(a.totals.alta), 'sobreposições', a.totals.alta ? 'warn' : ''),
        tile('Alertas médios', String(a.totals.media), 'para conferir', a.totals.media ? 'warn' : ''))),
    h('section', { class: 'card' }, h('h3', {}, 'Pontos importantes', h('span', { class: 'badge-ai' }, 'resumo da IA')), aiBlock),
  ];

  for (const m of a.machines) {
    const maxMin = Math.max(1, ...m.motivos.map((x) => x.min));
    sections.push(h('section', { class: 'card' },
      h('h2', { class: 'ptitle' }, `${m.name}${m.dates.length ? ` · ${m.dates.map((d) => d.slice(0, 5)).join(', ')}` : ''}`),
      h('ul', { class: 'apoints' }, m.bullets.map((b) => h('li', {}, b))),
      m.motivos.length ? h('h3', {}, 'Paradas por motivo') : null,
      ...m.motivos.map((x) => h('div', { class: 'brow' }, h('span', {}, x.motivo), h('div', { class: 'track' }, h('i', { style: `width:${Math.round((x.min / maxMin) * 100)}%` })), h('b', {}, `${fmtDur(x.min)} · ${x.count}×`))),
      m.standards.length ? h('h3', {}, 'Produção × tempo padrão') : null,
      m.standards.length ? h('div', { class: 'scroll' }, h('table', { class: 'std' },
        h('thead', {}, h('tr', {}, ['Peça', 'Modelo', 'Linhas', 'Real', 'Padrão', '% do padrão'].map((t) => h('th', {}, t)))),
        h('tbody', {}, m.standards.map((g) => h('tr', {}, h('td', {}, g.peca), h('td', {}, g.modelo), h('td', {}, String(g.rows)), h('td', {}, fmtDur(g.realH * 60)),
          h('td', {}, g.ratio != null ? fmtDur(g.stdH * 60) : 'sem padrão'), h('td', {}, g.ratio != null ? `${Math.round(g.ratio * 100)} %` : '—')))))) : null));
  }

  sections.push(h('section', { class: 'card' }, h('h3', {}, `Alertas para conferir (${a.issues.length})`),
    a.issues.length ? a.issues.map((i) => h('div', { class: 'issue' },
      h('span', { class: SEV[i.sev][1] }, SEV[i.sev][0]),
      h('div', {}, i.text, h('small', {}, `${i.machine} · ${i.label} · linha ${i.linha || '?'}`)),
      h('button', { type: 'button', class: 'ghost', dataset: { act: 'goto', p: i.page, k: i.table, r: i.ri } }, 'Ir para a linha')))
      : h('p', { class: 'note' }, 'Nenhum alerta: os horários fecham entre produção e paradas e nada fugiu do padrão.')));
  root.replaceChildren(...sections);
}

$('ok').addEventListener('click', giveOk);
$('tab-read').addEventListener('click', () => showTab('read'));
$('tab-analysis').addEventListener('click', () => { if (state.reviewed) showTab('analysis'); });

// ---------------------------------------------------------------- excluir / desfazer
function lastGroup() {
  const lastPage = state.pages.at(-1);
  if (!lastPage) return [];
  return state.pages.filter((p) => (lastPage.batch != null ? p.batch === lastPage.batch : p.file === lastPage.file));
}
function rebuildDom() {
  $('pages').replaceChildren(...state.pages.map((p) => h('section', { class: 'card page', id: `page-${p.id}` })));
  state.pages.forEach(renderPage);
}
function discardUndo() {
  if (state.undo) for (const { page } of state.undo) secrets.delete(page.id);
  state.undo = null;
}
function removePages(list, message) {
  if (state.busy) return toast('Aguarde a leitura terminar para excluir');
  if (!list.length) return;
  discardUndo();
  state.undo = list.map((page) => ({ page, index: state.pages.indexOf(page) })).sort((a, b) => a.index - b.index);
  state.pages = state.pages.filter((p) => !list.includes(p));
  rebuildDom(); markDuplicates(); updateSummary(); persist(0);
  toast(`${message} Use "Desfazer exclusão" se foi sem querer.`);
}
// Clears the last file's reading and leaves the app ready for the next file.
$('dellast').addEventListener('click', () => {
  const g = lastGroup();
  if (!g.length || state.busy) return state.busy ? toast('Aguarde a leitura terminar') : undefined;
  removePages(g, `Leitura de ${g[0].file} zerada. Pronto para o próximo arquivo.`);
  $('upload').scrollIntoView({ behavior: 'smooth', block: 'center' });
  $('drop').classList.add('over');
  setTimeout(() => $('drop').classList.remove('over'), 1800);
});
$('undo').addEventListener('click', () => {
  if (!state.undo) return;
  for (const { page, index } of state.undo) state.pages.splice(Math.min(index, state.pages.length), 0, page);
  state.undo = null;
  rebuildDom(); markDuplicates(); updateSummary(); persist(0);
  toast('Exclusão desfeita');
});

$('onlyflags').addEventListener('change', (e) => $('pages').classList.toggle('onlyflags', e.target.checked));
$('clear').addEventListener('click', () => {
  if ($('clear').dataset.sure !== '1') { $('clear').dataset.sure = '1'; $('clear').textContent = 'Clique de novo para apagar tudo'; setTimeout(() => { $('clear').dataset.sure = ''; $('clear').textContent = 'Limpar tudo'; }, 4000); return; }
  state.pages.length = 0; secrets.clear(); state.undo = null; $('pages').replaceChildren(); $('clear').dataset.sure = ''; $('clear').textContent = 'Limpar tudo';
  updateSummary(); persist();
});

const drop = $('drop');
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => processFiles([...e.dataTransfer.files]));
$('files').addEventListener('change', (e) => { processFiles([...e.target.files]); e.target.value = ''; });

// ---------------------------------------------------------------- revisão rápida
const CELLCOL = {
  prod: { data: 1, peca: 2, modelo: 3, chapa1: 4, ini1: 5, fim1: 6, chapa2: 7, ini2: 8, fim2: 9, chapa3: 10, ini3: 11, fim3: 12, turno: 13, obs: 14 },
  stops: { data: 1, chapa: 2, ini: 3, fim: 4, turno: 5, motivo: [6, 15], desc: 16 },
};
const FIELD_NAME = { data: 'DATA', peca: 'PEÇA', modelo: 'MODELO', chapa1: 'CHAPA (1º turno)', ini1: 'INÍCIO (1º turno)', fim1: 'FIM (1º turno)', chapa2: 'CHAPA (2º turno)', ini2: 'INÍCIO (2º turno)', fim2: 'FIM (2º turno)', chapa3: 'CHAPA (3º turno)', ini3: 'INÍCIO (3º turno)', fim3: 'FIM (3º turno)', turno: 'TURNO', obs: 'OBSERVAÇÕES', chapa: 'CHAPA', ini: 'INÍCIO', fim: 'FIM', motivo: 'MOTIVO', desc: 'DESCRIÇÃO' };
const qr = { items: [], i: 0, touched: new Set() };

function reviewItems() {
  const items = [];
  for (const p of includedPages()) {
    for (const kind of ['prod', 'stops']) {
      p[kind].forEach((row, ri) => {
        const keys = Object.keys(row.flags ?? {}).filter((k) => k in (CELLCOL[kind]));
        for (const field of keys) items.push({ p, kind, ri, row, field });
        if (row.rowFlag) items.push({ p, kind, ri, row, field: null });
      });
    }
  }
  return items;
}

function cellView(p, kind, row, field) {
  const meta = p.crop?.[kind];
  const spec = CELLCOL[kind][field];
  if (!row.strip || !meta || spec == null) return null;
  const [c0, c1] = Array.isArray(spec) ? spec : [spec, spec];
  const f0 = Math.max(0, meta.cols[c0][0] - 0.012), f1 = Math.min(1, meta.cols[c1][1] + 0.012);
  const d = f1 - f0;
  const ar = d * meta.aspect;
  return h('div', { class: 'cellzoom', style: `width:min(100%, ${Math.round(150 * ar)}px); aspect-ratio:${ar}; background-image:url(${row.strip}); background-size:${(100 / d).toFixed(2)}% auto; background-position:${((f0 / (1 - d)) * 100).toFixed(2)}% 0` });
}

function suggestionChips(row, field) {
  const out = [];
  const add = (v, label) => { if (v != null && String(v).trim() && !out.some((o) => o.v === String(v))) out.push({ v: String(v), label }); };
  if (row.alt?.[field] != null) add(row.alt[field], `2ª leitura: ${row.alt[field]}`);
  if (/^chapa/.test(field)) for (const m of String(row.flags[field] ?? '').match(/\b\d{4,6}\b/g) ?? []) add(m, m);
  return out.filter((c) => c.v !== String(row[field] ?? ''));
}

function renderQR() {
  const body = $('qrbody');
  const it = qr.items[qr.i];
  $('qrcount').textContent = qr.items.length ? `${Math.min(qr.i + 1, qr.items.length)} de ${qr.items.length}` : '';
  if (!it) {
    body.replaceChildren(h('div', { class: 'qrdone' }, h('p', { class: 'big' }, qr.items.length ? 'Todas as células marcadas foram vistas.' : 'Nenhuma célula marcada para revisar.'),
      h('p', { class: 'note' }, 'Se está tudo conforme a folha, feche e dê o OK para gerar a análise.'), h('button', { type: 'button', class: 'primary', dataset: { qr: 'close' } }, 'Fechar')));
    return;
  }
  const { p, kind, row, field } = it;
  const where = h('div', { class: 'qrwhere' }, `${p.label} · `, h('b', {}, kind === 'prod' ? 'Produção' : 'Paradas'), ` · linha ${row.linha || it.ri + 1}${field ? ' · ' : ''}`, field ? h('b', {}, FIELD_NAME[field] ?? field) : null);
  const why = h('div', { class: 'qrwhy' }, field ? row.flags[field] : row.rowFlag);
  const zoom = field ? cellView(p, kind, row, field) : null;
  const ctx = row.strip ? h('img', { class: 'qrctx', src: row.strip, alt: 'Linha inteira da folha' }) : null;
  let input = null, chips = null;
  if (field) {
    input = field === 'motivo'
      ? h('select', { id: 'qrinput' }, h('option', { value: '' }, '—'), [...MOTIVOS, ...(row.motivo && !MOTIVOS.includes(row.motivo) ? [row.motivo] : [])].map((m) => h('option', { value: m, selected: m === row.motivo }, m)))
      : h('input', { id: 'qrinput', type: 'text', value: row[field] ?? '', spellcheck: false, autocomplete: 'off' });
    const sugg = suggestionChips(row, field);
    chips = sugg.length ? h('div', { class: 'chips' }, h('span', { class: 'note' }, 'Outras leituras:'), sugg.map((c) => h('button', { type: 'button', class: 'chip', dataset: { qr: 'chip', v: c.v } }, c.label))) : null;
  }
  body.replaceChildren(...[where, why, zoom, ctx,
    h('div', { class: 'qrinput' }, input, h('button', { type: 'button', class: 'primary', dataset: { qr: 'ok' } }, field ? 'Confirmar (Enter)' : 'Linha vista (Enter)')),
    chips,
    h('div', { class: 'row qrkeys' }, h('button', { type: 'button', class: 'ghost', dataset: { qr: 'prev' }, disabled: qr.i === 0 }, 'Voltar'), h('button', { type: 'button', class: 'ghost', dataset: { qr: 'skip' } }, 'Pular'),
      h('span', { class: 'note' }, 'Enter confirma · Alt+← volta · Alt+→ pula · Esc fecha'))].filter(Boolean));
  setTimeout(() => $('qrinput')?.focus(), 30);
  $('qrinput')?.select?.();
}

function qrConfirm() {
  const it = qr.items[qr.i];
  if (it?.field) {
    const el = $('qrinput');
    const value = (el?.value ?? '').trim();
    const row = it.row, f = it.field;
    const kind = f === 'desc' ? 'desc' : f;
    row[kind] = value;
    delete row.flags[f];
    if (f === 'motivo' && !value) row.flags.motivo = 'sem motivo';
    learnFromEdit(row, f, value);
    qr.touched.add(it.p.id);
  } else if (it?.row) { delete it.row.rowFlag; qr.touched.add(it.p.id); }
  updateSummary(); persist();
  qr.i++;
  renderQR();
}

function openQR() {
  qr.items = reviewItems(); qr.i = 0; qr.touched = new Set();
  if (!qr.items.length) return toast('Nenhuma célula marcada para revisar');
  $('qr').hidden = false; renderQR();
}
function closeQR() {
  $('qr').hidden = true;
  for (const id of qr.touched) { const p = pageOf(id); if (p) renderPage(p); }
  qr.touched = new Set();
  updateSummary();
}
$('quick').addEventListener('click', openQR);
$('qrclose').addEventListener('click', closeQR);
$('qr').addEventListener('click', (e) => {
  const b = e.target.closest('[data-qr]');
  if (!b) { if (e.target === $('qr')) closeQR(); return; }
  const a = b.dataset.qr;
  if (a === 'close') closeQR();
  if (a === 'ok') qrConfirm();
  if (a === 'skip') { qr.i = Math.min(qr.i + 1, qr.items.length); renderQR(); }
  if (a === 'prev') { qr.i = Math.max(0, qr.i - 1); renderQR(); }
  if (a === 'chip') { const el = $('qrinput'); if (el) { el.value = b.dataset.v; el.focus(); } }
});
document.addEventListener('keydown', (e) => {
  if ($('qr').hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); closeQR(); }
  else if (e.key === 'Enter' && qr.items[qr.i]) { e.preventDefault(); qrConfirm(); }
  else if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); qr.i = Math.min(qr.i + 1, qr.items.length); renderQR(); }
  else if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); qr.i = Math.max(0, qr.i - 1); renderQR(); }
});

// ---------------------------------------------------------------- lists

const lines = (s) => [...new Set(s.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean))];
const listGroupSel = () => $('lgroup').value;
function fillLists() {
  const l = getLists(listGroupSel());
  $('l-chapas').value = l.chapas.join('\n');
  $('l-pecas').value = l.pecas.join('\n');
  $('l-modelos').value = l.modelos.join('\n');
  showLearned();
}
function showLearned() {
  const a = getLists().aliases;
  const n = Object.values(a).reduce((s, o) => s + Object.keys(o).length, 0);
  $('learned').textContent = n ? `${n} correção(ões) aprendida(s)` : '';
}
$('lgroup').addEventListener('change', fillLists);
$('savelists').addEventListener('click', () => {
  saveGroupLists(listGroupSel(), { chapas: lines($('l-chapas').value).map((c) => c.replace(/\D/g, '')).filter(Boolean), pecas: lines($('l-pecas').value), modelos: lines($('l-modelos').value) });
  toast(`Listas de ${listGroupSel() === 'usi' ? 'usinagem' : 'RAW'} salvas. Valem para as próximas leituras.`);
});
$('resetlists').addEventListener('click', () => { resetLists(listGroupSel()); fillLists(); toast('Listas restauradas ao padrão'); });

$('year').value = store.get('year') || new Date().getFullYear();
$('year').addEventListener('change', () => store.set('year', $('year').value));
fillLists();
restore();
