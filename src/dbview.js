// "Base de dados": the history as an editable spreadsheet (production, stops and the standard-times matrix).
import './bi.css';
import { el } from './bicharts.js';
import { loadBase, loadMatriz, editRecords } from './historico.js';
import { recordsEditor, matrixEditor } from './dbeditor.js';
import { spanHours, fmtHM, groupOfMachine, dmy, historyStandards, historyStandardOf, standardHours, parseHistoryWorkbook, compareMonth, monthsOf } from './core/history.js';

const sp = (a, b) => { const h = spanHours(a, b); return h == null ? '00:00' : fmtHM(Math.round(h * 60)); };
const GROUPS = { raw: 'RAW (robôs)', usi: 'Usinagem' };
const st = { g: 'raw', sub: 'prod', m: '', from: '', to: '', q: '' };
try { const s = localStorage.getItem('bi.g'); if (s === 'raw' || s === 'usi') st.g = s; } catch { /* no storage */ }
export const setDbGroup = (g) => { if (GROUPS[g]) st.g = g; };

export async function renderDbUI(root, ctx) {
  const toast = ctx.toast ?? ((m) => window.alert(m));
  const wrap = el('div', { class: 'bi pn' }), body = el('div');
  const seg = el('div', { class: 'bi-seg', role: 'group', 'aria-label': 'Grupo' }, Object.entries(GROUPS).map(([g, n]) => el('button', { type: 'button', 'aria-pressed': String(st.g === g), onclick: () => { st.g = st.g === g ? g : g; st.m = ''; try { localStorage.setItem('bi.g', g); } catch { /* ignore */ } ctx.onGroup?.(g); renderDbUI(root, ctx); } }, n)));
  const subs = el('div', { class: 'bi-pages', role: 'group', 'aria-label': 'Tabela' }, [['prod', 'Produção'], ['stop', 'Paradas'], ['mx', 'Matriz de tempos']].map(([id, t]) => el('button', { type: 'button', 'aria-pressed': String(st.sub === id), onclick: () => { st.sub = id; renderDbUI(root, ctx); } }, t)));
  wrap.append(el('h2', { class: 'bi-h2' }, 'Base de dados'), el('div', { class: 'bi-bar' }, seg, subs), body);
  root.replaceChildren(wrap);
  body.append(el('p', { class: 'bi-note' }, 'Lendo a base…'));
  let base;
  try { base = await loadBase(st.g); await loadMatriz(); } catch (e) { body.replaceChildren(el('p', { class: 'bd-warn' }, e.message)); return; }

  const after = async () => { await loadBase(st.g, { force: true }); renderDbUI(root, ctx); };
  if (st.sub === 'mx') {
    const { getMatrix } = await import('./core/history.js');
    // one line per machine + piece + model that has no time in the matrix and is using the average of its history
    const hs = historyStandards(base.prod), prov = new Map();
    for (const r of base.prod) { const v = historyStandardOf(hs, r.p, r.o); if (!v || !(r.h > 0 && r.h < 24) || Number(r.tp) > 0 || standardHours(r.m, r.p, r.o) > 0) continue; const k = `${r.m}|${r.p}|${r.o}`; if (!prov.has(k)) prov.set(k, { machine: r.m, machines: [r.m], piece: r.p, model: r.o, h: v.h, n: v.n, from: v.from, to: v.to, obs: v.obs }); }
    const provisional = [...prov.values()].sort((a, b) => b.n - a.n || (a.piece < b.piece ? -1 : 1));
    body.replaceChildren(matrixEditor({ rows: getMatrix(), group: (m) => groupOfMachine(m) === st.g, toast, onSaved: after, provisional }));
    return;
  }
  const kind = st.sub, all = kind === 'prod' ? base.prod : base.stops;
  const machines = [...new Set(all.map((r) => r.m))].sort(), dates = [...new Set(all.map((r) => r.d))].sort();
  const text = (r) => (kind === 'prod' ? [r.p, r.o, r.c1, r.c2, r.c3, r.ob] : [r.c, r.mo, r.ds]).join(' ').toLowerCase();
  const list = all.filter((r) => (!st.m || r.m === st.m) && (!st.from || r.d >= st.from) && (!st.to || r.d <= st.to) && (!st.q || text(r).includes(st.q)))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : a.m < b.m ? -1 : a.m > b.m ? 1 : String(a.i1 ?? a.i).localeCompare(String(b.i1 ?? b.i))));
  const redraw = () => { slot.replaceChildren(recordsEditor({ g: st.g, kind, title: kind === 'prod' ? 'Produções' : 'Paradas', records: list, toast, onSaved: after, pageSize: 100, empty: 'Nenhum registro com esses filtros.' })); };
  const apply = () => { renderDbUI(root, ctx); };
  const date = (k, t) => el('label', { class: 'vf-d' }, t, el('input', { type: 'date', value: st[k], min: dates[0], max: dates.at(-1), onchange: (e) => { st[k] = e.target.value; apply(); } }));
  const msel = el('select', { 'aria-label': 'Máquina', onchange: (e) => { st.m = e.target.value; apply(); } }, el('option', { value: '' }, 'Todas as máquinas'), ...machines.map((m) => el('option', { value: m, selected: st.m === m ? true : null }, m)));
  const q = el('input', { type: 'search', placeholder: kind === 'prod' ? 'Buscar peça, modelo ou chapa' : 'Buscar motivo, descrição ou chapa', value: st.q, onkeydown: (e) => { if (e.key === 'Enter') { st.q = e.target.value.toLowerCase(); apply(); } }, onchange: (e) => { st.q = e.target.value.toLowerCase(); apply(); } });
  const xl = el('button', { type: 'button', class: 'ghost', onclick: async () => {
    const X = await import('xlsx'), wb = X.utils.book_new();
    const head = kind === 'prod' ? ['Data', 'Máquina', 'Peça', 'Modelo', 'Chapa 1', 'Início 1', 'Fim 1', 'Chapa 2', 'Início 2', 'Fim 2', 'Chapa 3', 'Início 3', 'Fim 3', 'Turno', 'Observação', '1º turno', '2º turno', '3º turno', 'Horas', 'Padrão (h)'] : ['Data', 'Máquina', 'Chapa', 'Início', 'Fim', 'Turno', 'Motivo', 'Descrição', 'Tempo total', 'Horas'];
    const rows = list.map((r) => (kind === 'prod' ? [dmy(r.d), r.m, r.p, r.o, r.c1, r.i1, r.f1, r.c2, r.i2, r.f2, r.c3, r.i3, r.f3, r.t, r.ob, sp(r.i1, r.f1), sp(r.i2, r.f2), sp(r.i3, r.f3), r.h, r.tp] : [dmy(r.d), r.m, r.c, r.i, r.f, r.t, r.mo, r.ds, sp(r.i, r.f), r.h]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([head, ...rows]), kind === 'prod' ? 'PRODUÇÃO' : 'PARADAS'); X.writeFile(wb, `base-${st.g}-${kind === 'prod' ? 'producao' : 'paradas'}.xlsx`); } }, '⬇ Excel');
  const slot = el('div');
  body.replaceChildren(el('p', { class: 'bi-note' }, `${GROUPS[st.g]} · ${all.length.toLocaleString('pt-BR')} registros na base. Edite direto nas células e clique em Salvar: a base é atualizada para todos e os gráficos do Painel BI e do Plano de ação usam os dados novos.`),
    el('div', { class: 'qb dbv-filters' }, el('label', { class: 'vf-d' }, 'Máquina', msel), date('from', 'De'), date('to', 'Até'), el('label', { class: 'vf-d' }, 'Busca', q),
      el('button', { type: 'button', class: 'ghost', onclick: () => { st.m = st.from = st.to = st.q = ''; apply(); } }, 'Limpar filtros'),
      el('div', { class: 'dbv-act' }, el('button', { type: 'button', class: 'ghost', onclick: () => openCompare({ g: st.g, base, toast, onDone: after }) }, 'Comparar com o Excel'), el('button', { type: 'button', class: 'ghost', onclick: () => ctx.openBase?.() }, 'Importar / subir para a base'), xl)), slot);
  redraw();
}

// ---- "Comparar com o Excel": shows what differs from the control spreadsheet in a month and puts it back ----------------------
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const monthName = (ym) => `${MESES[+ym.slice(5, 7) - 1]} de ${ym.slice(0, 4)}`;
const descP = (r) => `${r.p} · ${r.o} · chapa ${r.c1 || r.c2 || r.c3 || '—'} · ${[[r.i1, r.f1], [r.i2, r.f2], [r.i3, r.f3]].filter(([a, b]) => a || b).map(([a, b]) => `${a}–${b}`).join(' · ')} · turno ${r.t ?? '—'} · ${(+r.h).toFixed(2)} h`;
const descS = (r) => `${r.mo || '(sem motivo)'} · chapa ${r.c || '—'} · ${r.i}–${r.f} · turno ${r.t ?? '—'} · ${(+r.h).toFixed(2)} h`;
export function openCompare({ g, base, toast, onDone }) {
  document.getElementById('bd-modal')?.remove();
  const close = () => { box.remove(); };
  let excel = null, month = '';
  const body = el('div', { class: 'bd-body' }), file = el('input', { type: 'file', accept: '.xlsx,.xlsm' });
  const box = el('div', { id: 'bd-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Comparar com o Excel' }, el('div', { class: 'bd-box wide' }, el('div', { class: 'bd-head' }, el('h3', {}, 'Comparar com o Excel'), el('span', { class: 'hd' }, el('button', { type: 'button', class: 'bd-x', 'aria-label': 'Fechar', onclick: close }, '✕'))), body));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.append(box);
  const draw = () => {
    const kids = [el('p', { class: 'note' }, 'Escolha a planilha original (a mesma de onde veio a base). O app mostra, mês a mês, o que na base é diferente dela (linhas editadas, incluídas, excluídas) e pode devolver tudo ao que está no Excel.'), file];
    if (excel) {
      const months = monthsOf(base.prod, base.stops, excel.prod, excel.stops); month ||= months.at(-1);
      const cp = compareMonth('prod', base.prod, excel.prod, month), cs = compareMonth('stop', base.stops, excel.stops, month);
      const n = cp.edited.length + cp.onlyBase.length + cp.onlyExcel.length + cs.edited.length + cs.onlyBase.length + cs.onlyExcel.length;
      const sel = el('select', { 'aria-label': 'Mês', onchange: (e) => { month = e.target.value; draw(); } }, months.map((m) => el('option', { value: m, selected: m === month ? true : null }, monthName(m))));
      const line = (t, c) => `${t}: ${c.same} iguais · ${c.edited.length} diferentes no app · ${c.onlyBase.length} só no app · ${c.onlyExcel.length} só no Excel`;
      const rows = [];
      for (const [kind, c, d] of [['Produção', cp, descP], ['Parada', cs, descS]]) {
        for (const x of c.edited) rows.push([`${kind} · diferente`, dmy(x.base.d), x.base.m, d(x.base), d(x.excel)]);
        for (const x of c.onlyBase) rows.push([`${kind} · só no app`, dmy(x.d), x.m, d(x), '—']);
        for (const x of c.onlyExcel) rows.push([`${kind} · só no Excel`, dmy(x.d), x.m, '—', d(x)]);
      }
      const tbl = el('div', { class: 'dbe-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ['Situação', 'Dia', 'Máquina', 'Como está no app', 'Como está no Excel'].map((t) => el('th', {}, t)))),
        el('tbody', {}, rows.slice(0, 300).map((r) => el('tr', {}, r.map((v) => el('td', { class: 'ro' }, v)))))));
      const undo = el('button', { type: 'button', class: 'primary', disabled: n ? null : true, onclick: async () => {
        if (!window.confirm(`Voltar ${monthName(month)} ao que está no Excel? Serão ${n} mudanças na base (linhas editadas voltam, linhas incluídas no app saem, linhas que faltam entram).`)) return;
        const ch = [];
        for (const [kind, c] of [['prod', cp], ['stop', cs]]) { for (const x of c.edited) ch.push({ kind, old: x.base, new: x.excel }); for (const x of c.onlyBase) ch.push({ kind, old: x, new: null }); for (const x of c.onlyExcel) ch.push({ kind, old: null, new: x }); }
        try { let miss = 0; for (let i = 0; i < ch.length; i += 400) { const r = await editRecords(g, ch.slice(i, i + 400)); miss += r.miss || 0; }
          toast(miss ? `Pronto, mas ${miss} linha(s) não puderam ser mexidas (a base mudou). Compare de novo.` : `${monthName(month)} voltou ao que está no Excel (${n} mudanças).`); close(); await onDone?.(); } catch (e) { toast(e.message); } } }, `Voltar ${monthName(month)} ao que está no Excel (${n})`);
      kids.push(el('div', { class: 'qb dbv-filters' }, el('label', { class: 'vf-d' }, 'Mês', sel)),
        el('p', { class: 'bi-note' }, line('Produções', cp)), el('p', { class: 'bi-note' }, line('Paradas', cs)),
        n ? el('p', { class: 'note' }, rows.length > 300 ? `Mostrando as 300 primeiras de ${rows.length} diferenças.` : `${rows.length} diferenças:`) : el('p', { class: 'note' }, 'Nada diferente neste mês: a base está igual ao Excel.'), n ? tbl : '', undo);
    }
    body.replaceChildren(...kids);
  };
  file.addEventListener('change', async () => {
    if (!file.files[0]) return;
    try { const XLSX = await import('xlsx'), r = parseHistoryWorkbook(XLSX, await file.files[0].arrayBuffer());
      if (r.group !== g) { toast(`Esta planilha é de ${r.group === 'usi' ? 'Usinagem' : 'RAW'}, e você está em ${g === 'usi' ? 'Usinagem' : 'RAW'}.`); return; }
      excel = r; month = ''; draw(); } catch (e) { toast(`Não consegui ler a planilha: ${e.message}`); }
  });
  draw();
}
