// Editable tables of the history (production, stops and the standard-times matrix). Used inside the 24 h chart and in the "Base de dados" tab.
// Every save goes to the shared base (api/historico.js) and the callers redraw everything that reads it.
import './db.css';
import { el } from './bicharts.js';
import { editRecords, saveMatriz } from './historico.js';
import { PADRAO } from './data/padrao.js';
import { prodRecord, stopRecord, dmy, spanHours, fmtHM, extrasOf } from './core/history.js';
// hh:mm of a time span (the spreadsheet's "1ºTURNO / 2ºTURNO / 3ºTURNO" total columns and the stop's TTL)
const span = (a, b) => { const h = spanHours(a, b); return h == null ? '' : fmtHM(Math.round(h * 60)); };
// 4th to 8th stretch of a piece (new sheet): shown, not edited here; they are kept when the row is saved
const extraText = (d) => extrasOf(d).map((e) => `${e.c ? e.c + ' ' : ''}${e.i}–${e.f}`).join(' · ');
const turnTimes = (d) => [span(d.i1, d.f1) || '00:00', span(d.i2, d.f2) || '00:00', span(d.i3, d.f3) || '00:00'];

const PROD_COLS = [['d', 'Data', 'date'], ['m', 'Máquina', 'm'], ['p', 'Peça', 'w'], ['o', 'Modelo', 'w'], ['c1', 'Chapa 1', 's'], ['i1', 'Início 1', 't'], ['f1', 'Fim 1', 't'], ['c2', 'Chapa 2', 's'], ['i2', 'Início 2', 't'], ['f2', 'Fim 2', 't'],
  ['c3', 'Chapa 3', 's'], ['i3', 'Início 3', 't'], ['f3', 'Fim 3', 't'], ['t', 'Turno', 'n'], ['ob', 'Observação', 'w']];
const STOP_COLS = [['d', 'Data', 'date'], ['m', 'Máquina', 'm'], ['c', 'Chapa', 's'], ['i', 'Início', 't'], ['f', 'Fim', 't'], ['t', 'Turno', 'n'], ['mo', 'Motivo', 'w'], ['ds', 'Descrição', 'w']];
const f2 = (v) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TIME = /^([01]?\d|2[0-3]):[0-5]\d$/;
const norm = (kind, r) => (kind === 'prod' ? prodRecord({ ...r, h: undefined, tp: undefined }) : stopRecord({ ...r, h: undefined }));
const same = (a, b, cols) => cols.every(([k]) => String(a[k] ?? '') === String(b[k] ?? ''));

// kind: 'prod' | 'stop'; records: the base objects to show; focus: Set of records to highlight; onSaved(): redraw after saving
export function recordsEditor({ g, kind, records, focus = null, spill = null, onSaved, toast = () => {}, pageSize = 100, title = '', empty = 'Nenhum registro.' }) {
  const cols = kind === 'prod' ? PROD_COLS : STOP_COLS;
  const drafts = new Map(), host = el('section', { class: 'dbe' });   // record → edited copy
  let page = 0, last = null;
  const dirty = (r) => { const d = drafts.get(r); return !!d && !same(d, r, cols); };
  const bad = (d) => {
    for (const [k, , ty] of cols) { const v = String(d[k] ?? '').trim(); if (ty === 't' && v && !TIME.test(v)) return `horário inválido (${v})`; }
    if (!d.d) return 'falta a data'; if (!d.m) return 'falta a máquina';
    if (kind === 'stop' && (!d.i || !d.f)) return 'a parada precisa de início e fim';
    return '';
  };
  const hoursOf = (r) => { if (!dirty(r)) return [r.h, r.tp]; const d = drafts.get(r); try { const n = norm(kind, d); return [n.h, n.tp]; } catch { return [r.h, r.tp]; } };
  async function save(list) {
    const ch = [];
    for (const r of list) { const d = drafts.get(r), w = bad(d); if (w) { toast(`${dmy(d.d) || 'Linha'} ${d.m ?? ''}: ${w}.`); return; } ch.push({ kind, old: r, new: norm(kind, d) }); }
    try {
      const res = await editRecords(g, ch);
      if (res.miss) { toast(`${res.miss} linha(s) não foram salvas: a base mudou ou a máquina não é deste grupo. Atualize e tente de novo.`); }
      else toast(`${res.edit} linha(s) salva(s). Os gráficos já usam os dados novos.`);
      last = { g, kind, ch };
      drafts.clear(); await onSaved?.(last);
    } catch (e) { toast(e.message); }
  }
  async function del(r) {
    if (!window.confirm('Excluir esta linha da base de dados? Dá para desfazer logo depois.')) return;
    try { await editRecords(g, [{ kind, old: r, new: null }]); last = { g, kind, undo: [{ kind, old: null, new: r }] }; toast('Linha excluída.'); await onSaved?.(last); } catch (e) { toast(e.message); }
  }
  let adding = null;
  function draw() {
    const list = records;
    const pages = Math.max(1, Math.ceil(list.length / pageSize));
    if (focus?.size && page === -1) { const i = list.findIndex((r) => focus.has(r)); page = i < 0 ? 0 : Math.floor(i / pageSize); }
    page = Math.min(Math.max(page, 0), pages - 1);
    const shown = list.slice(page * pageSize, (page + 1) * pageSize);
    const nDirty = [...drafts.keys()].filter(dirty).length;
    const row = (r) => {
      let tr, sv, hc, tc;
      const inp = ([k, label, ty]) => {
        const d = drafts.get(r) ?? r;
        return el('td', {}, el('input', { class: `c-${ty}`, type: ty === 'date' ? 'date' : 'text', value: d[k] ?? '', 'aria-label': label, placeholder: ty === 't' ? 'hh:mm' : '', inputmode: ty === 'n' ? 'numeric' : null,
          oninput: (e) => { const x = drafts.get(r) ?? drafts.set(r, { ...r }).get(r); x[k] = e.target.value; const dr = dirty(r); tr.classList.toggle('dirty', dr); sv.disabled = !dr; fillSpans(); const [h, tp] = hoursOf(r); hc.textContent = f2(h); if (kind === 'prod') tc.textContent = f2(tp); bar.update(); } }));
      };
      // totals as in the spreadsheet: 1º / 2º / 3º turno (hh:mm) for a production, tempo total (hh:mm) for a stop; they follow the edited times
      const spanCells = kind === 'prod' ? [0, 1, 2].map(() => el('td', { class: 'ro n' })) : [el('td', { class: 'ro n' })];
      const fillSpans = () => { const d = drafts.get(r) ?? r; if (kind === 'prod') turnTimes(d).forEach((v, i) => { spanCells[i].textContent = v; }); else spanCells[0].textContent = span(d.i, d.f); };
      fillSpans();
      hc = el('td', { class: 'ro n' }, f2(hoursOf(r)[0])); tc = kind === 'prod' ? el('td', { class: 'ro n' }, f2(hoursOf(r)[1])) : '';
      sv = el('button', { type: 'button', class: 'dbe-s', disabled: dirty(r) ? null : true, onclick: () => save([r]) }, 'Salvar');
      tr = el('tr', { class: `${focus?.has(r) ? (spill?.has(r) ? 'spill' : 'hit') : ''}${dirty(r) ? ' dirty' : ''}` }, cols.map(inp), ...spanCells, hc, tc, kind === 'prod' ? el('td', { class: 'ro', title: 'Do 4º ao 8º trecho da peça (planilha nova)' }, extraText(r)) : '', el('td', { class: 'act' }, sv, el('button', { type: 'button', class: 'dbe-x', 'aria-label': 'Excluir linha', title: 'Excluir', onclick: () => del(r) }, '🗑')));
      return tr;
    };
    const bar = {
      update: () => { const n = [...drafts.keys()].filter(dirty).length; allBtn.textContent = `Salvar tudo (${n})`; allBtn.disabled = !n; },
    };
    const allBtn = el('button', { type: 'button', class: 'dbe-all primary', disabled: nDirty ? null : true, onclick: () => save([...drafts.keys()].filter(dirty)) }, `Salvar tudo (${nDirty})`);
    const pager = pages > 1 ? el('span', { class: 'dbe-pg' }, el('button', { type: 'button', class: 'ghost', disabled: page === 0 ? true : null, onclick: () => { page--; draw(); } }, '‹'), ` página ${page + 1} de ${pages} `, el('button', { type: 'button', class: 'ghost', disabled: page >= pages - 1 ? true : null, onclick: () => { page++; draw(); } }, '›')) : '';
    const undo = last ? el('button', { type: 'button', class: 'ghost', onclick: async () => { const l = last; const rev = l.undo ?? l.ch.map((c) => ({ kind: c.kind, old: c.new, new: c.old })); try { await editRecords(l.g, rev); last = null; toast('Alteração desfeita.'); await onSaved?.(null); } catch (e) { toast(e.message); } } }, '↶ Desfazer a última alteração') : '';
    const newBtn = el('button', { type: 'button', class: 'ghost', onclick: () => { const d = kind === 'prod' ? { m: records[0]?.m ?? '', d: records[0]?.d ?? '' } : { m: records[0]?.m ?? '', d: records[0]?.d ?? '' }; adding = { ...d }; draw(); } }, '＋ Nova linha');
    const head = el('tr', {}, cols.map((c) => el('th', {}, c[1])), ...(kind === 'prod' ? ['1º turno', '2º turno', '3º turno'] : ['Tempo total']).map((t) => el('th', { class: 'n' }, t)), el('th', { class: 'n' }, 'Horas'), kind === 'prod' ? el('th', { class: 'n' }, 'Padrão (h)') : '', kind === 'prod' ? el('th', {}, 'Trechos 4+') : '', el('th', {}, ''));
    const body = el('tbody', {}, shown.map(row));
    const addBox = adding ? addRow() : '';
    host.replaceChildren(
      el('div', { class: 'dbe-head' }, el('h5', {}, `${title} (${list.length.toLocaleString('pt-BR')})`), el('span', { class: 'dbe-tools' }, pager, newBtn, undo, allBtn)),
      addBox,
      list.length ? el('div', { class: 'dbe-wrap' }, el('table', {}, el('thead', {}, head), body)) : el('p', { class: 'bi-note' }, empty));
    // bring the highlighted line into view inside the table only (the page itself does not move)
    setTimeout(() => { const w = host.querySelector('.dbe-wrap'), h = host.querySelector('tr.hit') ?? host.querySelector('tr.spill'); if (w && h) w.scrollTop = Math.max(0, h.offsetTop - 40); }, 0);
  }
  function addRow() {
    const d = adding, set = (k, v) => { d[k] = v; };
    const f = cols.map(([k, label, ty]) => el('label', { class: `dbe-f c-${ty}` }, label, el('input', { type: ty === 'date' ? 'date' : 'text', value: d[k] ?? '', placeholder: ty === 't' ? 'hh:mm' : '', oninput: (e) => set(k, e.target.value) })));
    return el('div', { class: 'dbe-new' }, el('b', {}, 'Nova linha'), ...f, el('button', { type: 'button', class: 'primary', onclick: async () => {
      const w = bad(d); if (w) { toast(`Nova linha: ${w}.`); return; }
      try { const n = norm(kind, d); const res = await editRecords(g, [{ kind, old: null, new: n }]); if (res.miss) { toast('Não foi possível incluir: confira a máquina e os campos.'); return; } last = { g, kind, undo: [{ kind, old: n, new: null }] }; adding = null; toast('Linha incluída.'); await onSaved?.(last); } catch (e) { toast(e.message); } } }, 'Incluir'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { adding = null; draw(); } }, 'Cancelar'));
  }
  page = focus?.size ? -1 : 0;
  draw();
  host.redraw = draw;
  return host;
}

// the standard-times matrix: [machine, piece, model, hours]
export function matrixEditor({ rows, group, onSaved, toast = () => {}, provisional = [] }) {
  const host = el('section', { class: 'dbe' });
  let list = rows.map((r) => [...r]), q = '', page = 0, adding = null;
  const orig = rows.map((r) => r.join('|'));
  const dirty = () => list.length !== rows.length || list.some((r, i) => r.join('|') !== orig[i]);
  const PS = 100;
  function draw() {
    const idx = list.map((r, i) => i).filter((i) => group(list[i][0]) && (!q || list[i].slice(0, 3).join(' ').toLowerCase().includes(q)));
    const pages = Math.max(1, Math.ceil(idx.length / PS)); page = Math.min(page, pages - 1);
    const body = idx.slice(page * PS, (page + 1) * PS).map((i) => el('tr', {}, [0, 1, 2].map((k) => el('td', {}, el('input', { class: 'c-w', type: 'text', value: list[i][k], 'aria-label': ['Máquina', 'Peça', 'Modelo'][k], oninput: (e) => { list[i][k] = e.target.value.trim(); mark(); } }))),
      el('td', {}, el('input', { class: 'c-s', type: 'text', inputmode: 'decimal', value: String(list[i][3]).replace('.', ','), 'aria-label': 'Horas padrão', oninput: (e) => { list[i][3] = Number(e.target.value.replace(',', '.')) || 0; mark(); } })),
      el('td', {}, el('input', { class: 'c-obs', type: 'text', value: list[i][4] ?? '', placeholder: 'ex.: média do histórico', 'aria-label': 'Observação', oninput: (e) => { list[i][4] = e.target.value; mark(); } })),
      el('td', { class: 'act' }, el('button', { type: 'button', class: 'dbe-x', title: 'Excluir', 'aria-label': 'Excluir linha', onclick: () => { list.splice(i, 1); mark(); draw(); } }, '🗑'))));
    const save = el('button', { type: 'button', class: 'primary', disabled: dirty() ? null : true, onclick: async () => { try { const r = await saveMatriz(list.filter((x) => x[0] && x[1])); toast('Matriz salva. Os gráficos de entrega já usam os tempos novos.'); await onSaved?.(r); } catch (e) { toast(e.message); } } }, 'Salvar matriz');
    const mark = () => { save.disabled = !dirty(); };
    // how far the saved matrix is from the one that came with the app, and a way back
    const sg = (r) => `${r[0]}|${r[1]}|${r[2]}|${(Number(r[3]) || 0).toFixed(3)}`, orig = new Set(PADRAO.map(sg)), now = new Set(rows.filter((r) => group(r[0])).map(sg));
    const far = [...now].filter((k) => !orig.has(k)).length + PADRAO.filter((r) => group(r[0]) && !now.has(sg(r))).length;
    const reset = far ? el('button', { type: 'button', class: 'ghost', title: 'Descarta as mudanças e volta à matriz que veio com o app', onclick: async () => {
      if (!window.confirm(`A matriz salva tem ${far} diferença(s) da original do app. Voltar tudo à original? As linhas que você cadastrou ou mudou saem.`)) return;
      try { await saveMatriz([]); toast('Matriz voltou à original do app.'); await onSaved?.(null); } catch (e) { toast(e.message); } } }, `Voltar à matriz original (${far})`) : '';
    const search = el('input', { type: 'search', class: 'dbe-q', placeholder: 'Buscar peça, modelo ou máquina', value: q, oninput: (e) => { q = e.target.value.toLowerCase(); page = 0; draw(); const s = host.querySelector('.dbe-q'); s?.focus(); s?.setSelectionRange(q.length, q.length); } });
    const pager = pages > 1 ? el('span', { class: 'dbe-pg' }, el('button', { type: 'button', class: 'ghost', disabled: page === 0 ? true : null, onclick: () => { page--; draw(); } }, '‹'), ` página ${page + 1} de ${pages} `, el('button', { type: 'button', class: 'ghost', disabled: page >= pages - 1 ? true : null, onclick: () => { page++; draw(); } }, '›')) : '';
    const add = adding ? el('div', { class: 'dbe-new' }, el('b', {}, 'Nova linha'), ...['Máquina', 'Peça', 'Modelo', 'Horas'].map((t, k) => el('label', { class: 'dbe-f c-w' }, t, el('input', { type: 'text', value: adding[k], oninput: (e) => { adding[k] = e.target.value; } }))),
      el('button', { type: 'button', class: 'primary', onclick: () => { const [m, p, o, h] = adding; if (!m.trim() || !p.trim()) { toast('Preencha máquina e peça.'); return; } list.push([m.trim(), p.trim(), o.trim(), Number(String(h).replace(',', '.')) || 0, '']); adding = null; draw(); } }, 'Incluir'),
      el('button', { type: 'button', class: 'ghost', onclick: () => { adding = null; draw(); } }, 'Cancelar')) : '';
    host.replaceChildren(el('div', { class: 'dbe-head' }, el('h5', {}, `Matriz de tempos padrão (${idx.length.toLocaleString('pt-BR')})`), el('span', { class: 'dbe-tools' }, search, pager, el('button', { type: 'button', class: 'ghost', onclick: () => { adding = ['', '', '', '']; draw(); } }, '＋ Nova linha'), reset, save)),
      el('p', { class: 'bi-note' }, 'Tempo padrão, em horas, de uma peça e modelo em cada máquina. Salvar vale para todos e muda "horas entregues" e "eficiência" nos gráficos.'), add,
      el('div', { class: 'dbe-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Máquina', 'Peça', 'Modelo', 'Horas padrão', 'Observação', ''].map((t) => el('th', {}, t)))), el('tbody', {}, body))),
      provisionalBlock());
  }
  // times the matrix does not have, taken from the average of each piece's own history: shown apart and always flagged; "Fixar na matriz" copies them in
  function provisionalBlock() {
    if (!provisional.length) return '';
    const todo = provisional.filter((x) => !list.some((r) => r[0] === x.machine && r[1] === x.piece && r[2] === x.model));
    const fix = (xs) => { for (const x of xs) list.push([x.machine, x.piece, x.model, +x.h.toFixed(2), x.obs]); draw(); };
    return el('div', { class: 'dbe-prov' }, el('div', { class: 'dbe-head' }, el('h5', {}, `Tempos provisórios pelo histórico (${provisional.length})`),
      el('span', { class: 'dbe-tools' }, todo.length ? el('button', { type: 'button', class: 'ghost', onclick: () => fix(todo) }, `Fixar todos na matriz (${todo.length})`) : '')),
      el('p', { class: 'bi-note' }, 'Peças que ainda não têm tempo na matriz. O padrão usado nos gráficos é a média das produções delas no histórico. Ao fixar, a linha entra na matriz com a observação; depois clique em "Salvar matriz".'),
      el('div', { class: 'dbe-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Máquinas', 'Peça', 'Modelo', 'Média (h)', 'Produções', 'Período', 'Observação', ''].map((t) => el('th', {}, t)))),
        el('tbody', {}, provisional.map((x) => { const done = !todo.includes(x); return el('tr', {}, el('td', { class: 'ro' }, x.machines.join(', ')), el('td', { class: 'ro' }, x.piece), el('td', { class: 'ro' }, x.model), el('td', { class: 'ro n' }, f2(x.h)), el('td', { class: 'ro n' }, String(x.n)), el('td', { class: 'ro' }, `${dmy(x.from)} a ${dmy(x.to)}`), el('td', { class: 'ro' }, x.obs),
          el('td', { class: 'act' }, done ? el('span', { class: 'ro' }, 'na matriz') : el('button', { type: 'button', class: 'dbe-s', onclick: () => fix([x]) }, 'Fixar na matriz'))); })))));
  }
  draw();
  return host;
}
