import { readFiles, toCanvas, jpegB64, jpegUrl } from './files.js';
import { analyze, detectMachine } from './core/layout.js';
import { analyze as analyseSheets, fmtDur } from './core/analysis.js';
import { inkIn, cropToPaper } from './core/image.js';
import { readSheet } from './core/gemini.js';
import { checkLogin, login } from './api.js';
import { usageText, usageHint, sheetsLeft, sheetRead, nearLimit, getLimit, setLimit, quotaHit, clearQuota } from './usage.js';
import { applyKeywords, mentionsTyorei } from './core/rows.js';
import { inferTurnos } from './core/turno.js';
import { buildPage, reconcile, applyInkMotivo, alignRows, alignJson, collectAsk, applyThirdReading, normMachine } from './core/rows.js';
import { decodeEntities } from './core/text.js';
import { KINDS } from './core/report.js';
import { parseOperatorRows, getOperators, setOperators, clearOperators, operatorName } from './core/operators.js';
import * as XLSX from 'xlsx';
import { recordEdit, recordRemoval, describeEdit } from './core/edits.js';
import { buildPanel } from './core/panel.js';
import { allRows, toTSV, workbookBytes } from './core/export.js';
import { getLists, saveGroupLists, learnAlias, resetLists, setActiveGroup, groupOf as listGroup } from './core/lists.js';
import { saveState, loadState } from './store.js';
import { MOTIVOS, MOTIVOS_ALL, MAQUINAS } from './data/vocab.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k) ?? ''; } catch { return ''; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};

const state = { dismissed: new Set(), pages: [], nextId: 1, batch: 0, busy: false, undo: null, reviewed: false, okAt: null, okSig: '', analysis: null, ai: null, tab: 'read' };
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
    const keep = state.pages.filter((p) => p.status === 'ok' || p.status === 'erro').map(({ id, label, file, batch, status, error, machine, machineFlag, date, include, single, dup, geomWarn, rowWarn, third, crop, prod, stops, edits, removedRows, sheet, sheetGeo }) => ({ id, label, file, batch, status, error, machine, machineFlag, date, include, single, dup, geomWarn, rowWarn, third, crop, prod, stops, edits, removedRows, sheet, sheetGeo }));
    saveState({ dismissed: [...state.dismissed], pages: keep, nextId: state.nextId, batch: state.batch, reviewed: state.reviewed, okAt: state.okAt, okSig: state.okSig, ai: Array.isArray(state.ai) ? state.ai : null });
  }, delay);
}

async function restore() {
  const saved = await loadState();
  if (!saved?.pages?.length) return;
  state.nextId = saved.nextId ?? saved.pages.length + 1;
  state.batch = saved.batch ?? 0;
  state.dismissed = new Set(saved.dismissed ?? []);
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
    state.analysis = analyseSheets(includedPages(), { dismissed: state.dismissed });
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
    return { A: [jpegB64(full, 0.88)], B: [jpegB64(full, 0.9)], strips: { prod: [], stops: [] }, bubble: '', inkMotivo: [], geomOk: false, rowInk: null, crop: null, sheet: jpegUrl(toCanvas(image, 0, 0, image.width, image.height, 1800), 0.72), sheetGeo: null };
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
  const relGrid = (xs, ys) => ({ y: ys.map((y) => y / img.height), x0: xs[0] / img.width, x1: xs.at(-1) / img.width });
  return {
    sheet: jpegUrl(toCanvas(img, 0, 0, img.width, img.height, 1800), 0.72),
    sheetGeo: lay.geomOk ? { prod: relGrid(prodX, prodY), stops: relGrid(stopX, stopY) } : null,
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
    applyKeywords(built);
    sheetRead();
    Object.assign(p, built, { status: 'ok', single, geomWarn: !sec.geomOk, rowWarn: rowWarns.join('; '), crop: sec.crop, sheet: sec.sheet, sheetGeo: sec.sheetGeo });
    for (const r of p.prod) r.strip = sec.strips.prod[r.linha - 1];
    for (const r of p.stops) r.strip = sec.strips.stops[r.linha - 1];
    p.include = true;
    inferTurnos(okPages());
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
    state.pages = []; state.dismissed.clear(); $('pages').replaceChildren();
    toast('Leitura anterior removida. A análise vale só para o arquivo que você enviou agora.');
  }
  discardUndo(); resetReview();
  const st = $('status');
  st.hidden = false;
  let n = 0;
  try {
    for await (const item of readFiles(files)) {
      n++;
      if (item.page === 1 && getLimit() && item.total > sheetsLeft()) toast(`Este arquivo tem ${item.total} folha(s) e cabem só cerca de ${sheetsLeft()} hoje pela cota estimada. A leitura continua e, se a cota acabar, você retoma depois.`);
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
  ['data', 'DATA', 112], ['peca', 'PEÇA', 110], ['modelo', 'MODELO', 120],
  ['chapa1', 'CHAPA', 66, 'num'], ['ini1', 'INÍCIO', 60, 'num'], ['fim1', 'FIM', 60, 'num'],
  ['chapa2', 'CHAPA 2º', 66, 'num'], ['ini2', 'INÍCIO', 60, 'num'], ['fim2', 'FIM', 60, 'num'],
  ['chapa3', 'CHAPA 3º', 66, 'num'], ['ini3', 'INÍCIO', 60, 'num'], ['fim3', 'FIM', 60, 'num'],
  ['turno', 'TURNO FINAL', 52, 'num'], ['obs', 'OBSERVAÇÕES', 160],
];
const STOP_FIELDS = [
  ['data', 'DATA', 112], ['chapa', 'CHAPA', 66, 'num'], ['ini', 'INÍCIO', 60, 'num'], ['fim', 'FIM', 60, 'num'],
  ['turno', 'TURNO', 52, 'num'], ['motivo', 'MOTIVO', 150], ['desc', 'DESCRIÇÃO', 260],
];
const BAD = /inválid|ilegível|desconhecid|sem motivo|falta|iguais|corrigida|duração|parada de|fora da lista/;

// DATA fields: digits only, slashes inserted on the fly (DD/MM/AAAA); DD/MM gets the sheet year on leaving the field
const maskDate = (v) => { const d = String(v).replace(/\D/g, '').slice(0, 8); return d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}` : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d; };
const withYear = (v) => (/^\d{2}\/\d{2}$/.test(v) ? `${v}/${$('year').value || new Date().getFullYear()}` : v);
const dateAttrs = { inputmode: 'numeric', maxlength: 10, placeholder: 'DD/MM/AAAA', autocomplete: 'off' };

const editTitle = (ed) => (String(ed.from ?? '').trim() ? `Alterado por você. A leitura tinha "${ed.from}"` : 'Preenchido por você. Estava em branco na leitura');

function fieldCell(p, kind, ri, row, [key, , , cls]) {
  const flag = row.flags?.[key];
  const bad = flag && BAD.test(flag);
  const attrs = { dataset: { p: p.id, k: kind, r: ri, f: key }, title: flag || row.learned?.[key] ? `${flag ?? ''}${row.learned?.[key] ? ` (aprendido: li "${row.learned[key]}")` : ''}` : false };
  const ed0 = row.edits?.[key], auto0 = row.auto?.[key];
  if (ed0) attrs.title = editTitle(ed0); else if (auto0) attrs.title = auto0;
  const control = key === 'motivo'
    ? h('select', attrs, h('option', { value: '' }, '—'), [...MOTIVOS_ALL, ...(row.motivo && !MOTIVOS_ALL.includes(row.motivo) ? [row.motivo] : [])].map((m) => h('option', { value: m, selected: m === row.motivo }, m)))
    : h('input', { ...attrs, ...(key === 'data' ? dateAttrs : {}), type: 'text', value: row[key] ?? '', spellcheck: false });
  const ed = row.edits?.[key];
  const auto = row.auto?.[key];
  const who = /^chapa/.test(key) ? operatorName(row[key]) : '';
  return h('td', { class: `${cls ?? ''}${flag ? ' flag' : ''}${bad ? ' bad' : ''}${ed ? (String(ed.from ?? '').trim() ? ' edited' : ' edited fill') : ''}${auto && !ed ? ' auto' : ''}` }, control, /^chapa/.test(key) ? h('small', { class: 'opn', dataset: { opn: key } }, who) : null);
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

function markEdited(td, ed) {
  if (!td) return;
  td.classList.toggle('edited', !!ed && !!String(ed.from ?? '').trim());
  td.classList.toggle('fill', !!ed && !String(ed.from ?? '').trim());
  if (ed) td.classList.add('edited');
  const ctl = td.querySelector('input,select');
  if (ctl) ctl.title = ed ? editTitle(ed) : '';
}

document.addEventListener('input', (e) => {
  const d = e.target.dataset;
  if (!d?.f) return;
  const row = pageOf(d.p)?.[d.k]?.[Number(d.r)];
  if (!row) return;
  if (d.f === 'data') e.target.value = maskDate(e.target.value);
  const before = row[d.f];
  row[d.f === 'desc' ? 'desc' : d.f] = e.target.value;
  recordEdit(row, d.f, before, e.target.value);
  markEdited(e.target.closest('td'), row.edits?.[d.f]);
  if (d.f === 'turno' && row.auto?.turno) { delete row.auto.turno; e.target.closest('td').classList.remove('auto'); }
  if (d.f === 'desc' && d.k === 'stops' && mentionsTyorei(e.target.value) && row.motivo !== 'TYOREI' && !row.edits?.motivo) {
    row.motivo = 'TYOREI'; delete row.flags.motivo; row.auto = { ...(row.auto ?? {}), motivo: 'Definido pela palavra "Tyorei" na descrição.' };
    const sel = document.querySelector(`select[data-p="${d.p}"][data-k="stops"][data-r="${d.r}"][data-f="motivo"]`);
    if (sel) { sel.value = 'TYOREI'; sel.title = row.auto.motivo; const td = sel.closest('td'); td.classList.remove('flag', 'bad'); td.classList.add('auto'); }
  }
  if (row.flags?.[d.f]) { delete row.flags[d.f]; e.target.closest('td').classList.remove('flag', 'bad'); }
  updateSummary(); persist();
});

function refreshTurnos(page) {
  inferTurnos(okPages());
  for (const kind of ['prod', 'stops']) page[kind].forEach((row, ri) => {
    const inp = document.querySelector(`[data-p="${page.id}"][data-k="${kind}"][data-r="${ri}"][data-f="turno"]`);
    if (!inp) return;
    inp.value = row.turno ?? '';
    const td = inp.closest('td'); const flag = row.flags?.turno;
    td.classList.toggle('auto', !!row.auto?.turno && !row.edits?.turno);
    td.classList.toggle('flag', !!flag); td.classList.toggle('bad', !!flag && BAD.test(flag));
    inp.title = row.edits?.turno ? editTitle(row.edits.turno) : (row.auto?.turno ?? flag ?? '');
  });
}
document.addEventListener('change', (e) => {
  const d = e.target.dataset;
  if (d?.f && /^chapa/.test(d.f)) { const sm = e.target.closest('td')?.querySelector('.opn'); if (sm) sm.textContent = operatorName(e.target.value); }
  if (d?.f && /^(ini|fim|chapa)/.test(d.f) && d.k) { const pg = pageOf(d.p); if (pg) { refreshTurnos(pg); updateSummary(); persist(); } }
  if (d?.f === 'data') { const v = withYear(e.target.value); if (v !== e.target.value) { e.target.value = v; e.target.dispatchEvent(new Event('input', { bubbles: true })); } }
  if (d?.act === 'machine') { const p = pageOf(d.p); const was = p.machine; p.machine = e.target.value; p.machineFlag = null; if (was !== p.machine) { const pe = p.edits?.machine; p.edits = { ...(p.edits ?? {}), machine: { from: pe ? pe.from : was, to: p.machine } }; if (p.edits.machine.from === p.machine) delete p.edits.machine; } renderPage(p); updateSummary(); persist(); return; }
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
  const fm = e.target.closest('button[data-anamachine]');
  if (fm) { anaMachine = fm.dataset.anamachine; renderAnalysis(); return; }
  const fk = e.target.closest('button[data-anakind]');
  if (fk) { anaKind = fk.dataset.anakind; renderAnalysis(); return; }
  const dis = e.target.closest('button[data-dismiss]');
  if (dis) { state.dismissed.add(dis.dataset.dismiss); refreshAnalysis(); persist(0); toast('Marcado como anotação correta. Dá para desfazer no topo da análise.'); return; }
  if (e.target.closest('button[data-undismiss]')) { state.dismissed.clear(); refreshAnalysis(); persist(0); return; }
  const sw = e.target.closest('.sheetwrap');
  if (sw) { openSheetViewer(sw); return; }
  const flip = e.target.closest('.flip');
  if (flip && !e.target.closest('button, a')) { const on = flip.classList.toggle('flipped'); flip.setAttribute('aria-pressed', String(on)); return; }
  if (e.target.closest('button[data-flip]')) { const f = e.target.closest('.flip'); f.classList.remove('flipped'); f.setAttribute('aria-pressed', 'false'); return; }
  const nav = e.target.closest('button[data-nav]');
  if (nav) { if (nav.dataset.nav === 'undo') $('undook').click(); else showTab('read'); return; }
  const img = e.target.closest('img[data-zoom]');
  if (img) { $('lightbox').replaceChildren(h('img', { src: img.src, alt: 'Linha ampliada' })); $('lightbox').hidden = false; return; }
  if (e.target.closest('#lightbox')) { $('lightbox').hidden = true; return; }
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const { act, p: pid, k, r } = b.dataset;
  const p = pageOf(pid);
  if (act === 'goto') return goToRow(pid, k, r);
  if (act === 'rm') { recordRemoval(p, k, p[k][Number(r)], Number(r)); p[k].splice(Number(r), 1); renderPage(p); updateSummary(); persist(); }
  if (act === 'add') { p[k].push({ linha: 0, flags: {}, raw: {}, learned: {}, added: true }); renderPage(p); updateSummary(); persist(); }
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
  return analyseSheets(pages, { dismissed: state.dismissed });    // a group of the approved sheets
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
  if (!any && state.tab === 'panel') showTab('read');
  $('okbox').hidden = !any;
  $('tab-analysis').disabled = !state.reviewed;
  $('tab-lock').textContent = state.reviewed ? 'aprovada' : 'precisa do OK';
  $('okbox').classList.toggle('done', state.reviewed);
  const at = state.okAt ? new Date(state.okAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
  $('okstate').textContent = state.reviewed
    ? `Aprovado às ${at}. Se você mudar algo, o OK é desfeito.`
    : 'Confira as linhas marcadas. A análise só sai depois do seu OK.';
  if (!$('ok').dataset.sure) $('ok').textContent = 'Revisei tudo · dar OK e gerar análise';
  $('ok').hidden = state.reviewed;
  $('viewanalysis').hidden = !state.reviewed;
  $('undook').hidden = !state.reviewed;
}

function showTab(name) {
  state.tab = name;
  $('view-read').hidden = name !== 'read';
  $('view-analysis').hidden = name !== 'analysis';
  $('tab-read').classList.toggle('on', name === 'read');
  $('tab-analysis').classList.toggle('on', name === 'analysis');
  $('view-panel').hidden = name !== 'panel';
  $('tab-panel').classList.toggle('on', name === 'panel');
  $('tab-panel').setAttribute('aria-selected', String(name === 'panel'));
  $('tab-read').setAttribute('aria-selected', String(name === 'read'));
  $('tab-analysis').setAttribute('aria-selected', String(name === 'analysis'));
  if (name === 'analysis') renderAnalysis();
  if (name === 'panel') renderPanel();
}

function giveOk() {
  const inc = includedPages();
  if (state.busy) return toast('Aguarde a leitura terminar');
  if (!inc.length) return toast('Marque pelo menos uma folha para analisar');
  const flags = inc.reduce((n, p) => n + countFlags(p), 0);
  const btn = $('ok');
  if (flags && btn.dataset.sure !== '1') {
    btn.dataset.sure = '1';
    btn.textContent = `Ainda há ${flags} célula(s) em dúvida. Horário em dúvida NÃO entra na análise. Clique de novo para dar OK mesmo assim`;
    setTimeout(() => { btn.dataset.sure = ''; updateReviewUi(); }, 6000);
    return;
  }
  btn.dataset.sure = '';
  state.reviewed = true; state.okAt = new Date().toISOString(); state.okSig = sig();
  state.analysis = analyseSheets(inc, { dismissed: state.dismissed }); state.ai = null;
  updateReviewUi(); showTab('analysis'); persist(0);
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
const goBtn = (i) => h('button', { type: 'button', class: 'ghost', dataset: { act: 'goto', p: i.page, k: i.table, r: i.ri } }, 'Ir para a linha');
let anaMachine = 'all', anaKind = 'all', showDismissed = false;

// Back of a card: the whole sheet, with the rows that matter outlined. Click it to open the viewer (zoom).
function sheetView(c) {
  const p = pageOf(c.page);
  if (!p?.sheet) return h('p', { class: 'note nosheet' }, 'A imagem desta folha não foi guardada. Envie o arquivo de novo para vê-la aqui.');
  const wrap = h('div', { class: 'sheetwrap', title: 'Clique para abrir a folha e dar zoom' }, h('img', { src: p.sheet, alt: `Folha ${p.label}` }), h('span', { class: 'lupa', 'aria-hidden': 'true' }, '🔍'));
  for (const r of c.refs ?? []) {
    const g = p.sheetGeo?.[r.table]; const n = (r.linha || 0) - 1;
    if (!g || n < 0 || n + 1 >= g.y.length) continue;
    wrap.append(h('i', { class: 'hl', style: `top:${(g.y[n] * 100).toFixed(2)}%;height:${((g.y[n + 1] - g.y[n]) * 100).toFixed(2)}%;left:${(g.x0 * 100).toFixed(2)}%;width:${((g.x1 - g.x0) * 100).toFixed(2)}%` }));
  }
  return wrap;
}

function flipCard(c) {
  const front = h('div', { class: 'face front' },
    h('div', { class: 'ftop' }, h('strong', { class: 'fmachine' }, c.machine), h('span', { class: 'kchip' }, h('i', {}), c.title)),
    c.big ? h('div', { class: 'fbig2' }, h('b', {}, c.big), h('small', {}, c.bigLabel)) : null,
    h('p', { class: 'fbrief' }, c.brief),
    h('div', { class: 'fread' },
      h('strong', {}, 'O que o app leu'),
      (c.lines ?? []).map((l) => h('div', { class: 'fline' }, l)),
      c.fix ? h('div', { class: 'ffix' }, c.fix) : null),
    c.caution ? h('p', { class: 'fcaution' }, '⚠ ', c.caution) : null,
    c.who ? h('p', { class: 'fwho' }, h('span', {}, 'Operador'), c.who) : null,
    h('div', { class: 'ffoot' }, h('span', {}, c.day ? `Folha do dia ${c.day}` : c.label), h('span', { class: 'fhint' }, 'Ver folha ↻')));
  const back = h('div', { class: 'face back' },
    sheetView(c),
    h('div', { class: 'fbtns' }, goBtn(c), h('button', { type: 'button', class: 'ghost ok', dataset: { dismiss: c.key }, title: 'A folha está certa: tira este aviso' }, 'Anotação correta ✓'), h('button', { type: 'button', class: 'ghost', dataset: { flip: '1' } }, 'Virar ↻')));
  return h('article', { class: `flip ${c.sev}`, style: `--kc:${c.color}`, tabindex: '0', role: 'button', 'aria-pressed': 'false', 'aria-label': `${c.machine}: ${c.title}. Clique para ver a folha.` }, h('div', { class: 'flip-in' }, front, back));
}

function renderAnalysis() {
  const root = $('view-analysis');
  const a = state.analysis;
  if (!a) { root.replaceChildren(h('p', { class: 'note' }, 'Dê o OK na aba de conferência para gerar a análise.')); return; }
  const report = a.report ?? [];
  const machines = [...new Set(report.map((c) => c.machine))].sort((x, y) => String(x).localeCompare(String(y), 'pt-BR'));
  if (anaMachine !== 'all' && !machines.includes(anaMachine)) anaMachine = 'all';
  const kindsPresent = KINDS.filter((k) => report.some((c) => c.kind === k.id));
  if (anaKind !== 'all' && !kindsPresent.some((k) => k.id === anaKind)) anaKind = 'all';
  const byMachine = report.filter((c) => anaMachine === 'all' || c.machine === anaMachine);
  const shown = byMachine.filter((c) => anaKind === 'all' || c.kind === anaKind);
  const graves = shown.filter((c) => c.sev === 'alta').length;
  const hidden = report.hidden ?? 0;

  const chipRow = (label, items) => h('div', { class: 'fchips' }, h('span', { class: 'flabel' }, label), items);
  const machineChips = machines.length > 1 ? chipRow('Máquina', ['all', ...machines].map((m) => h('button', { type: 'button', class: `fchip${anaMachine === m ? ' on' : ''}`, dataset: { anamachine: m } }, m === 'all' ? 'Todas' : m))) : null;
  const kindChips = kindsPresent.length > 1 ? chipRow('Tipo', [h('button', { type: 'button', class: `fchip${anaKind === 'all' ? ' on' : ''}`, dataset: { anakind: 'all' } }, 'Todos'),
    ...kindsPresent.map((k) => h('button', { type: 'button', class: `fchip kind${anaKind === k.id ? ' on' : ''}`, style: `--kc:${k.color}`, dataset: { anakind: k.id } }, h('i', {}), k.name, h('em', {}, String(byMachine.filter((c) => c.kind === k.id).length))))]) : null;
  const head = h('section', { class: 'card' },
    h('h2', { class: 'ptitle' }, 'Análise', h('span', { class: 'badge-ai' }, `${a.sheets} folha(s) · OK às ${new Date(state.okAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`)),
    h('div', { class: 'row backrow' },
      h('button', { type: 'button', class: 'ghost', dataset: { nav: 'read' } }, '← Voltar à conferência'),
      h('button', { type: 'button', class: 'ghost', dataset: { nav: 'undo' } }, 'Desfazer o OK e revisar de novo')),
    h('p', { class: 'asum' }, shown.length ? h('span', {}, h('b', {}, `${shown.length} aviso${shown.length === 1 ? '' : 's'}`), graves ? ` · ${graves} grave${graves === 1 ? '' : 's'}` : '', ' · clique em um card para ver a folha') : 'Nenhum aviso para este filtro.',
      hidden ? h('span', { class: 'dism' }, ` · ${hidden} marcado${hidden === 1 ? '' : 's'} como correto${hidden === 1 ? '' : 's'} `, h('button', { type: 'button', class: 'linkbtn', dataset: { undismiss: '1' } }, 'desfazer')) : null),
    machineChips, kindChips);

  const sections = [head];
  for (const k of KINDS) {
    const list = shown.filter((c) => c.kind === k.id);
    if (!list.length) continue;
    sections.push(h('section', { class: 'tier', style: `--kc:${k.color}` }, h('h3', {}, h('i', { class: 'kdot' }), k.name, h('span', { class: 'tcount' }, String(list.length))), h('p', { class: 'khint' }, k.hint), h('div', { class: 'flips' }, list.map(flipCard))));
  }

  // what the person changed after the reading (kept as it was)
  const E = a.edits ?? [];
  const EKIND = { alterado: 'Alterado', preenchido: 'Preenchido', apagado: 'Apagado', 'linha nova': 'Linha nova', 'linha excluída': 'Linha excluída' };
  const eBySheet = new Map();
  for (const e of E) { const k = `${e.machine} · folha do dia ${e.day}`; if (!eBySheet.has(k)) eBySheet.set(k, []); eBySheet.get(k).push(e); }
  sections.push(h('section', { class: 'card' }, h('h2', { class: 'ptitle' }, 'Alterações feitas por você', h('span', { class: 'badge-ai' }, E.length ? `${E.length} alteraç${E.length === 1 ? 'ão' : 'ões'}` : 'nenhuma')),
    E.length ? [h('p', { class: 'note' }, 'Tudo que você mudou, preencheu ou apagou depois da leitura do app. Informação que você colocou e que não estava na leitura merece uma segunda olhada na folha.'),
      ...[...eBySheet].map(([title, list]) => h('div', { class: 'esheet' }, h('h3', {}, title),
        list.map((e) => h('div', { class: `issue edit ${e.kind === 'preenchido' || e.kind === 'linha nova' ? 'fill' : ''}` }, h('span', { class: e.kind === 'preenchido' || e.kind === 'linha nova' ? 'tag bad' : 'tag' }, EKIND[e.kind]),
          h('div', {}, `${e.where}: ${describeEdit(e)}`, e.alert ? h('small', { class: 'stillbad' }, 'Essa linha ainda aparece em um alerta da análise') : null), goBtn(e)))))]
      : h('p', { class: 'note' }, 'Você não alterou nada depois da leitura: os dados estão como o app leu.')));
  root.replaceChildren(...sections);
}

// ---------------------------------------------------------------- visualizador da folha (zoom, arrastar, X)
function openSheetViewer(wrap) {
  const old = $('sheetviewer'); if (old) old.remove();
  const canvas = h('div', { class: 'svcanvas' }, [...wrap.querySelectorAll('img, .hl')].map((n) => n.cloneNode(true)));
  const stage = h('div', { class: 'svstage' }, canvas);
  const close = () => { viewer.remove(); document.removeEventListener('keydown', onKey); };
  const viewer = h('div', { id: 'sheetviewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Folha ampliada' }, stage,
    h('button', { type: 'button', class: 'svx', 'aria-label': 'Fechar a folha', title: 'Fechar (Esc)', onclick: close }, '✕'),
    h('div', { class: 'svtools' }, h('button', { type: 'button', 'data-z': 'out', title: 'Diminuir' }, '−'), h('button', { type: 'button', 'data-z': 'fit', title: 'Ajustar à tela' }, 'Ajustar'), h('button', { type: 'button', 'data-z': 'in', title: 'Aumentar' }, '+')),
    h('div', { class: 'svhint' }, 'Dois cliques: aproxima ou afasta · Arraste para mover · Roda do mouse: zoom'));
  document.body.append(viewer);
  const img = canvas.querySelector('img');
  let s = 1, tx = 0, ty = 0, fitW = 0, fitH = 0;
  const apply = () => { canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`; };
  const limit = () => { // keep part of the sheet on screen
    const W = stage.clientWidth, H = stage.clientHeight, w = fitW * s, hh = fitH * s;
    tx = w <= W ? (W - w) / 2 : Math.min(0, Math.max(W - w, tx));
    ty = hh <= H ? (H - hh) / 2 : Math.min(0, Math.max(H - hh, ty));
  };
  const fit = () => {
    const W = stage.clientWidth, H = stage.clientHeight, ar = (img.naturalWidth || 1400) / (img.naturalHeight || 1000);
    fitW = Math.min(W, H * ar); fitH = fitW / ar;
    canvas.style.width = `${fitW}px`; canvas.style.height = `${fitH}px`;
    s = 1; tx = 0; ty = 0; limit(); apply();
  };
  const zoomAt = (px, py, ns) => { // keep the point under the pointer fixed
    ns = Math.min(8, Math.max(1, ns));
    tx = px - ((px - tx) / s) * ns; ty = py - ((py - ty) / s) * ns; s = ns; limit(); apply();
  };
  const centre = () => ({ x: stage.clientWidth / 2, y: stage.clientHeight / 2 });
  if (img.complete) fit(); else img.addEventListener('load', fit);
  window.addEventListener('resize', fit, { once: true });
  stage.addEventListener('wheel', (e) => { e.preventDefault(); const r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, s * (e.deltaY < 0 ? 1.25 : 0.8)); }, { passive: false });
  stage.addEventListener('dblclick', (e) => { const r = stage.getBoundingClientRect(); if (s > 1.05) { s = 1; limit(); apply(); } else zoomAt(e.clientX - r.left, e.clientY - r.top, 3); });
  let drag = null;
  stage.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, tx, ty }; stage.setPointerCapture(e.pointerId); stage.classList.add('grab'); });
  stage.addEventListener('pointermove', (e) => { if (!drag) return; tx = drag.tx + e.clientX - drag.x; ty = drag.ty + e.clientY - drag.y; limit(); apply(); });
  const end = () => { drag = null; stage.classList.remove('grab'); };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  viewer.querySelector('.svtools').addEventListener('click', (e) => {
    const z = e.target.closest('button')?.dataset.z; if (!z) return;
    const c = centre(); if (z === 'fit') { s = 1; limit(); apply(); } else zoomAt(c.x, c.y, s * (z === 'in' ? 1.5 : 1 / 1.5));
  });
  function onKey(e) { if (e.key === 'Escape') close(); }
  document.addEventListener('keydown', onKey);
  viewer.querySelector('.svx').focus();
}

// ---------------------------------------------------------------- painel
const panelOpt = { group: 'all', day: 'all' };
const MOT_COLOR = Object.fromEntries(MOTIVOS_ALL.map((m, i) => [m, `var(--m${i})`]));
MOT_COLOR['SEM MOTIVO'] = 'var(--muted)';
const motColor = (m) => MOT_COLOR[m] ?? 'var(--muted)';

function renderPanel() {
  const root = $('view-panel');
  const inc = includedPages();
  if (!inc.length) { root.replaceChildren(h('p', { class: 'note' }, 'Suba e leia uma folha para ver o painel.')); return; }
  const P = buildPanel(inc, panelOpt);
  const tile = (lab, val, small, cls = '') => h('div', { class: `tile ${cls}` }, h('span', { class: 'lab' }, lab), h('b', {}, val), h('small', {}, small));
  const sel = (id, opts, cur, fn) => { const el = h('select', { id }, opts.map(([v, t]) => h('option', { value: v, selected: String(v) === String(cur) }, t))); el.addEventListener('change', () => { fn(el.value); renderPanel(); }); return el; };
  const hasRaw = inc.some((p) => listGroup(p.machine) === 'raw'), hasUsi = inc.some((p) => listGroup(p.machine) === 'usi');
  const groups = [['all', 'Todas as máquinas']]; if (hasRaw && hasUsi) groups.push(['raw', 'Só RAW'], ['usi', 'Só usinagem']);
  const filters = h('div', { class: 'row' },
    h('label', {}, 'Grupo ', sel('pn-group', groups, panelOpt.group, (v) => { panelOpt.group = v; panelOpt.day = 'all'; })),
    h('label', {}, 'Dia ', sel('pn-day', [['all', 'Todos'], ...P.days.map((d) => [d.key, d.label])], panelOpt.day, (v) => { panelOpt.day = v; })));
  const note = state.reviewed ? null : h('p', { class: 'note' }, 'Atenção: dados ainda não aprovados com o OK. Os números podem mudar após a conferência.');
  if (!P.byMachine.length) { root.replaceChildren(h('section', { class: 'card' }, h('h2', { class: 'ptitle' }, 'Painel'), filters, h('p', { class: 'note' }, 'Sem horários válidos para este filtro.'))); return; }

  const maxMot = Math.max(1, ...P.byMotivo.map((x) => x.min));
  const maxMac = Math.max(1, ...P.byMachine.map((m) => m.stopMin));
  const maxHour = Math.max(1, ...P.byHour);
  const stack = (m) => h('div', { class: 'stack', style: `width:${Math.round((m.stopMin / maxMac) * 100)}%` },
    m.motivos.map((x) => h('i', { style: `flex:${x.min};background:${motColor(x.motivo)}`, title: `${x.motivo}: ${fmtDur(x.min)}` })));
  const legend = h('div', { class: 'legend' }, P.byMotivo.map((x) => h('span', {}, h('i', { style: `background:${motColor(x.motivo)}` }), x.motivo)));

  root.replaceChildren(
    h('section', { class: 'card' }, h('h2', { class: 'ptitle' }, 'Painel · tempo parado'), filters, note,
      h('div', { class: 'astats' },
        tile('Parado', fmtDur(P.stopMin), `${P.pct} % do tempo registrado`, P.pct >= 30 ? 'warn' : ''),
        tile('Produzindo', fmtDur(P.prodMin), 'tempo registrado'),
        tile('Paradas', String(P.count), 'registros'),
        tile('Maior parada', P.longest ? fmtDur(P.longest.min) : '—', P.longest ? `${P.longest.machine} · ${P.longest.motivo}` : ''))),
    h('section', { class: 'card' }, h('h3', {}, 'Tempo parado por motivo'),
      P.byMotivo.length ? P.byMotivo.map((x) => h('div', { class: 'brow' }, h('span', {}, x.motivo),
        h('div', { class: 'track' }, h('i', { style: `width:${Math.round((x.min / maxMot) * 100)}%;background:${motColor(x.motivo)}` })), h('b', {}, `${fmtDur(x.min)} · ${x.count}× · ${x.acc}% acum.`)))
        : h('p', { class: 'note' }, 'Nenhuma parada registrada.')),
    h('section', { class: 'card' }, h('h3', {}, 'Tempo parado por turno'),
      P.byTurno.map((x) => h('div', { class: 'brow' }, h('span', {}, x.turno === '?' ? 'Sem turno' : `Turno ${x.turno}`),
        h('div', { class: 'track' }, h('i', { style: `width:${Math.round((x.min / Math.max(1, ...P.byTurno.map((y) => y.min))) * 100)}%` })), h('b', {}, fmtDur(x.min))))),
    h('section', { class: 'card' }, h('h3', {}, 'Tempo parado por máquina'), legend,
      P.byMachine.map((m) => h('div', { class: 'brow' }, h('span', {}, m.name, h('small', {}, ` ${m.pct} % parada`)),
        h('div', { class: 'track plain' }, stack(m)), h('b', {}, fmtDur(m.stopMin))))),
    h('section', { class: 'card' }, h('h3', {}, 'Paradas ao longo do dia (por hora)'),
      h('div', { class: 'hours' }, P.byHour.map((v, i) => h('div', { class: 'hcol', title: `${String(i).padStart(2, '0')}h: ${fmtDur(v)}` },
        h('i', { style: `height:${Math.round((v / maxHour) * 100)}%` }), h('small', {}, String(i)))))),
    h('section', { class: 'card' }, h('h3', {}, 'Maiores paradas'),
      P.top.length ? P.top.map((t) => h('div', { class: 'issue' },
        h('span', { class: 'tag' }, fmtDur(t.min)),
        h('div', {}, `${t.machine} · ${t.motivo}`, h('small', {}, t.desc || `linha ${t.linha || '?'}`)),
        h('button', { type: 'button', class: 'ghost', dataset: { act: 'goto', p: t.page, k: t.table, r: t.ri } }, 'Ir para a linha')))
        : h('p', { class: 'note' }, 'Nenhuma parada registrada.')));
}
$('tab-panel').addEventListener('click', () => showTab('panel'));

$('ok').addEventListener('click', giveOk);
$('viewanalysis').addEventListener('click', () => showTab('analysis'));
$('undook').addEventListener('click', () => { resetReview(false); showTab('read'); toast('OK desfeito. Revise de novo e dê o OK quando terminar.'); persist(0); });
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
      ? h('select', { id: 'qrinput' }, h('option', { value: '' }, '—'), [...MOTIVOS_ALL, ...(row.motivo && !MOTIVOS_ALL.includes(row.motivo) ? [row.motivo] : [])].map((m) => h('option', { value: m, selected: m === row.motivo }, m)))
      : h('input', { id: 'qrinput', type: 'text', value: row[field] ?? '', spellcheck: false, autocomplete: 'off', ...(field === 'data' ? dateAttrs : {}) });
    if (field === 'data') input.addEventListener('input', () => { input.value = maskDate(input.value); });
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
    const value = it.field === 'data' ? withYear((el?.value ?? '').trim()) : (el?.value ?? '').trim();
    const row = it.row, f = it.field;
    const kind = f === 'desc' ? 'desc' : f;
    const before = row[kind];
    row[kind] = value;
    recordEdit(row, kind, before, value);
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

document.title = 'Maple Tapping';

// ---------------------------------------------------------------- theme (claro / escuro)
const currentTheme = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
const themeLabel = () => { $('theme').textContent = currentTheme() === 'dark' ? 'Tema claro' : 'Tema escuro'; };
$('theme').addEventListener('click', () => {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  store.set('mt-theme', next);
  themeLabel();
});
themeLabel();


// ---------------------------------------------------------------- acesso, cota, câmera
function showLock(msg) {
  $('lock').hidden = false;
  $('lockerr').hidden = !msg; $('lockerr').textContent = msg ?? '';
  setTimeout(() => $('lockcode').focus(), 50);
}
$('lockform').addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await login($('lockcode').value.trim());
  if (r.ok) { $('lock').hidden = true; $('lockcode').value = ''; } else showLock(r.error || 'Código inválido');
});
window.addEventListener('need-login', () => showLock('Digite o código de acesso'));
checkLogin().then((st) => { if (st.required && !st.ok) showLock(); });

function updateUsage() {
  $('usage-text').textContent = usageText();
  $('usage').title = usageHint();
  const left = $('sheetsleft'); if (left) left.textContent = getLimit() ? `Ainda cabem cerca de ${sheetsLeft()} folhas hoje (1 página do PDF = 1 folha, com produção e paradas).` : '';
  $('usage').classList.toggle('low', nearLimit());
}
function pendingPages() { return state.pages.filter((p) => p.status === 'erro' && p.pending && secrets.has(p.id)); }
function updateQuotaUi() {
  const q = quotaHit(), pend = pendingPages();
  const show = !!(state.quotaHit || (q && pend.length));
  $('quotabanner').hidden = !show;
  if (!show) return;
  $('quotamsg').textContent = `${q?.msg ?? 'O limite do plano gratuito do Gemini foi atingido.'}${pend.length ? ` ${pend.length} folha(s) aguardando.` : ''} A cota volta sozinha (confira em aistudio.google.com/usage). Depois é só retomar: o que já foi lido não é refeito.`;
  $('resume').hidden = !pend.length;
}
async function resumePending() {
  if (state.busy) return toast('Aguarde a leitura atual terminar');
  const list = pendingPages();
  if (!list.length) return;
  state.busy = true; state.quotaHit = false; clearQuota();
  try { for (const p of list) { await readPage(p); if (state.quotaHit) break; } }
  finally { state.busy = false; updateSummary(); updateQuotaUi(); }
  toast(state.quotaHit ? 'A cota acabou de novo. Tente mais tarde.' : 'Leitura retomada e concluída.');
}
$('resume').addEventListener('click', resumePending);
$('quotaclear').addEventListener('click', () => { clearQuota(); state.quotaHit = false; updateQuotaUi(); });
window.addEventListener('usage', () => { updateUsage(); updateQuotaUi(); });
$('limit').value = getLimit() || '';
updateUsage();
$('limit').addEventListener('change', () => setLimit($('limit').value));
updateUsage();

// photo straight from the phone camera: added to the current reading (not replacing it)
$('camera').addEventListener('change', (e) => { processFiles([...e.target.files], { append: true }); e.target.value = ''; });

// botão "voltar ao topo": aparece depois de rolar a página
const toTop = $('totop');
const syncTop = () => { toTop.hidden = window.scrollY < 400; };
window.addEventListener('scroll', syncTop, { passive: true });
toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
syncTop();

$('year').value = store.get('year') || new Date().getFullYear();
$('year').addEventListener('change', () => store.set('year', $('year').value));
fillLists();
restore();

// ---------------------------------------------------------------- ajuda, menu e efeito 3D
const helpEl = $('help');
function openHelp() { helpEl.hidden = false; try { localStorage.setItem('mt-help', '1'); } catch { /* private mode */ } $('helpclose').focus(); }
function closeHelp() { helpEl.hidden = true; }
$('helpbtn').addEventListener('click', openHelp);
$('helpclose').addEventListener('click', closeHelp);
helpEl.addEventListener('click', (e) => { if (e.target === helpEl) closeHelp(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!$('lightbox').hidden) $('lightbox').hidden = true; if (!helpEl.hidden) closeHelp(); closeMenu(); } });

const menuEl = $('menu'), menuBtn = $('menubtn');
function closeMenu() { menuEl.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); const open = menuEl.hidden; menuEl.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); });
document.addEventListener('click', (e) => { if (!e.target.closest('.menuwrap')) closeMenu(); else if (e.target.closest('#menu button')) closeMenu(); });
menuEl.addEventListener('click', (e) => {
  const act = e.target.closest('button[data-menu]')?.dataset.menu;
  if (!act) return;
  if (act === 'help') openHelp();
  if (act === 'lists' || act === 'limit') { $('listsbox').open = true; $('listsbox').scrollIntoView({ behavior: 'smooth', block: 'center' }); if (act === 'limit') setTimeout(() => $('limit').focus(), 400); }
  if (act === 'clear') $('clear').click();
  if (act === 'logout') { try { localStorage.removeItem('mt-code'); } catch { /* ignore */ } location.reload(); }
});

// the drop zone tilts a little with the pointer (3D); skipped for reduced motion
const dropEl = $('drop');
if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
  dropEl.addEventListener('pointermove', (e) => {
    const r = dropEl.getBoundingClientRect();
    dropEl.style.setProperty('--ry', `${(((e.clientX - r.left) / r.width) - 0.5) * 18}deg`);
    dropEl.style.setProperty('--rx', `${(0.5 - ((e.clientY - r.top) / r.height)) * 12}deg`);
  });
  dropEl.addEventListener('pointerleave', () => { dropEl.style.setProperty('--ry', '0deg'); dropEl.style.setProperty('--rx', '0deg'); });
}
// first visit: show the help once
try { if (!localStorage.getItem('mt-help') && $('lock').hidden) setTimeout(() => { if ($('lock').hidden) openHelp(); }, 600); } catch { /* ignore */ }

document.addEventListener('keydown', (e) => {
  const f = e.target.closest?.('.flip');
  if (f && e.target === f && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); f.click(); }
});

// ---------------------------------------------------------------- operadores (nomes só neste navegador)
function showOperators() {
  const n = Object.keys(getOperators()).length;
  $('opinfo').textContent = n ? `${n} operador(es) carregado(s) neste navegador.` : 'Nenhum nome carregado.';
}
function refreshAnalysis() { if (state.reviewed) { state.analysis = analyseSheets(includedPages(), { dismissed: state.dismissed }); if (state.tab === 'analysis') renderAnalysis(); } }
$('opfile').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try {
    const wb = XLSX.read(await file.arrayBuffer());
    const name = wb.SheetNames.find((n) => /referenc/i.test(n));
    const ops = name ? parseOperatorRows(XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' })) : {};
    if (!Object.keys(ops).length) return toast('Não achei a aba REFERENCIAS com as colunas Chapa e Nome nesse arquivo.');
    setOperators(ops); showOperators(); refreshAnalysis(); document.querySelectorAll('input[data-f^="chapa"]').forEach((i) => { const sm = i.closest('td')?.querySelector('.opn'); if (sm) sm.textContent = operatorName(i.value); });
    toast(`${Object.keys(ops).length} operadores carregados. Os nomes ficam só neste navegador.`);
  } catch (err) { toast(`Não consegui abrir a planilha: ${err.message}`); }
});
$('opclear').addEventListener('click', () => { clearOperators(); showOperators(); refreshAnalysis(); document.querySelectorAll('.opn').forEach((n) => { n.textContent = ''; }); toast('Nomes apagados deste navegador.'); });
showOperators();
