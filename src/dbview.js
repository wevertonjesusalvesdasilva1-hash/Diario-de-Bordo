// "5 · Base de dados": the history as an editable spreadsheet (production, stops and the standard-times matrix).
import './bi.css';
import { el } from './bicharts.js';
import { loadBase, loadMatriz } from './historico.js';
import { recordsEditor, matrixEditor } from './dbeditor.js';
import { groupOfMachine, dmy } from './core/history.js';

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
    body.replaceChildren(matrixEditor({ rows: getMatrix(), group: (m) => groupOfMachine(m) === st.g, toast, onSaved: after }));
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
    const head = kind === 'prod' ? ['Data', 'Máquina', 'Peça', 'Modelo', 'Chapa 1', 'Início 1', 'Fim 1', 'Chapa 2', 'Início 2', 'Fim 2', 'Chapa 3', 'Início 3', 'Fim 3', 'Turno', 'Observação', 'Horas', 'Padrão (h)'] : ['Data', 'Máquina', 'Chapa', 'Início', 'Fim', 'Turno', 'Motivo', 'Descrição', 'Horas'];
    const rows = list.map((r) => (kind === 'prod' ? [dmy(r.d), r.m, r.p, r.o, r.c1, r.i1, r.f1, r.c2, r.i2, r.f2, r.c3, r.i3, r.f3, r.t, r.ob, r.h, r.tp] : [dmy(r.d), r.m, r.c, r.i, r.f, r.t, r.mo, r.ds, r.h]));
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([head, ...rows]), kind === 'prod' ? 'PRODUÇÃO' : 'PARADAS'); X.writeFile(wb, `base-${st.g}-${kind === 'prod' ? 'producao' : 'paradas'}.xlsx`); } }, '⬇ Excel');
  const slot = el('div');
  body.replaceChildren(el('p', { class: 'bi-note' }, `${GROUPS[st.g]} · ${all.length.toLocaleString('pt-BR')} registros na base. Edite direto nas células e clique em Salvar: a base é atualizada para todos e os gráficos do Painel BI e do Plano de ação usam os dados novos.`),
    el('div', { class: 'qb dbv-filters' }, el('label', { class: 'vf-d' }, 'Máquina', msel), date('from', 'De'), date('to', 'Até'), el('label', { class: 'vf-d' }, 'Busca', q),
      el('button', { type: 'button', class: 'ghost', onclick: () => { st.m = st.from = st.to = st.q = ''; apply(); } }, 'Limpar filtros'), xl, el('button', { type: 'button', class: 'ghost', onclick: () => ctx.openBase?.() }, 'Importar / subir para a base')), slot);
  redraw();
}
