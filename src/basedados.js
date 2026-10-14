// The "base de dados" screens: submit the validated sheets, import the Excel history, and see/undo what went in.
import { recordsFromPages, mergeRecords, parseHistoryWorkbook, groupOfMachine, dmy, auditDays } from './core/history.js';
import { loadBase, sendRecords, undoBatch, restoreBase, emptyBase } from './historico.js';

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const GNAME = { raw: 'RAW (robôs)', usi: 'Usinagem' };
const nf = (n) => Number(n).toLocaleString('pt-BR');
const fmtAt = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function modal(title, body, { wide = false } = {}) {
  document.getElementById('bd-modal')?.remove();
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { id: 'bd-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: `bd-box${wide ? ' wide' : ''}` }, h('div', { class: 'bd-head' }, h('h3', {}, title), h('button', { type: 'button', class: 'bd-x', 'aria-label': 'Fechar', onclick: close }, '✕')), body));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.append(box); document.addEventListener('keydown', onKey);
  return { close, box };
}

// ---------------------------------------------------------------- submit the validated sheets
// ctx: { pages (the selected sheets), reviewed, flagsOf(page), toast, onDone({ g, batch, pages, result }), goRead() }
export async function openSubmit(ctx) {
  const body = h('div', { class: 'bd-body' }, h('p', { class: 'note' }, 'Conferindo o que vai para a base…'));
  const { close } = modal('Subir para a base de dados', body);
  try {
    if (!ctx.reviewed) { body.replaceChildren(h('p', {}, 'Dê o OK na conferência antes de subir para a base de dados.'), h('button', { type: 'button', class: 'primary', onclick: close }, 'Entendi')); return; }
    const pages = ctx.pages;
    if (!pages.length) { body.replaceChildren(h('p', {}, 'Nenhuma folha selecionada.'), h('button', { type: 'button', class: 'primary', onclick: close }, 'Entendi')); return; }
    const noMachine = pages.filter((p) => !p.machine), withDoubt = pages.filter((p) => ctx.flagsOf(p) > 0);
    if (noMachine.length || withDoubt.length) {
      body.replaceChildren(h('p', { class: 'bd-warn' }, 'Ainda não dá para subir:'),
        h('ul', {}, noMachine.map((p) => h('li', {}, `${p.label}: a máquina não foi escolhida.`)), withDoubt.map((p) => h('li', {}, `${p.label}: ${ctx.flagsOf(p)} célula(s) em dúvida.`))),
        h('p', { class: 'note' }, 'Só entra na base o que está conferido e certo. Corrija e dê o OK de novo.'),
        h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Fechar'), h('button', { type: 'button', class: 'primary', onclick: () => { close(); ctx.goRead(); } }, 'Ir para a conferência')));
      return;
    }
    const groups = ['raw', 'usi'].map((g) => ({ g, pages: pages.filter((p) => groupOfMachine(p.machine) === g) })).filter((x) => x.pages.length);
    const plans = [];
    for (const x of groups) {
      const recs = recordsFromPages(x.pages);
      const base = await loadBase(x.g).catch((e) => { throw new Error(`${GNAME[x.g]}: ${e.message}`); });
      const merged = mergeRecords(base, recs);
      plans.push({ ...x, recs, merged });
    }
    // a machine cannot run more than 24 h in a day: block the envio when the days touched by these sheets would pass it
    const over = plans.flatMap((p) => { const touched = new Set([...p.recs.prod, ...p.recs.stops].map((r) => `${r.d}|${r.m}`)); return auditDays(p.merged.prod, p.merged.stops, (r) => touched.has(`${r.d}|${r.m}`)); });
    if (over.length) {
      body.replaceChildren(h('p', { class: 'bd-warn' }, 'Não dá para subir: estes dias passariam de 24 horas (produção + paradas da mesma máquina).'),
        h('table', { class: 'bd-tab' }, h('thead', {}, h('tr', {}, ['Dia', 'Máquina', 'Produção', 'Paradas', 'Total', 'Por quê'].map((t) => h('th', {}, t)))),
          h('tbody', {}, over.map((r) => h('tr', {}, h('td', {}, dmy(r.d)), h('td', {}, r.m), h('td', {}, `${r.ph.toFixed(1)} h`), h('td', {}, `${r.sh.toFixed(1)} h`), h('td', {}, `${r.tot.toFixed(1)} h`), h('td', {}, r.why))))),
        h('p', { class: 'note' }, 'Confira horários digitados errados, paradas repetidas ou parada lançada no mesmo horário da produção. Corrija na conferência e dê o OK de novo.'),
        h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Fechar'), h('button', { type: 'button', class: 'primary', onclick: () => { close(); ctx.goRead(); } }, 'Ir para a conferência')));
      return;
    }
    const total = plans.reduce((n, p) => n + p.merged.added.prod + p.merged.added.stops, 0);
    const ok = h('input', { type: 'checkbox', id: 'bd-ok' }), go = h('button', { type: 'button', class: 'primary', disabled: true }, 'Sim, subir para a base');
    ok.addEventListener('change', () => { go.disabled = !ok.checked || !total; });
    const skipped = plans.flatMap((p) => p.recs.skipped);
    body.replaceChildren(
      h('p', {}, 'Confira o que vai entrar na base de dados (o histórico usado nos painéis BI):'),
      h('table', { class: 'bd-tab' }, h('thead', {}, h('tr', {}, ['Base', 'Folhas', 'Produção (novas)', 'Paradas (novas)', 'Já estavam na base'].map((t) => h('th', {}, t)))),
        h('tbody', {}, plans.map((p) => h('tr', {}, h('td', {}, GNAME[p.g]), h('td', {}, String(p.pages.length)), h('td', {}, `${p.merged.added.prod} de ${p.recs.prod.length}`), h('td', {}, `${p.merged.added.stops} de ${p.recs.stops.length}`),
          h('td', {}, `${p.merged.dup.prod} produção(ões) · ${p.merged.dup.stops} paradas`))))),
      skipped.length ? h('details', { class: 'bd-skip' }, h('summary', {}, `${skipped.length} linha(s) ficam de fora (sem data ou horário)`), h('ul', {}, skipped.map((s) => h('li', {}, `${s.page}: ${s.why}`)))) : null,
      total ? null : h('p', { class: 'note' }, 'Tudo isso já está na base. Não há nada novo para subir.'),
      h('label', { class: 'bd-check' }, ok, ' Confirmo que o preenchimento destas folhas está finalizado e correto.'),
      h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'), go));
    go.addEventListener('click', async () => {
      go.disabled = true; ok.disabled = true; go.textContent = 'Enviando…';
      const done = [];
      try {
        for (const p of plans) {
          const res = await sendRecords(p.g, { prod: p.recs.prod, stops: p.recs.stops, label: `${p.pages.length} folha(s): ${p.pages.map((x) => x.label.replace(/ · pág\./, ' p.')).slice(0, 3).join(', ')}${p.pages.length > 3 ? '…' : ''}` });
          done.push({ g: p.g, pages: p.pages, result: res });
          ctx.onDone({ g: p.g, batch: res.batch, pages: p.pages, result: res });
        }
        body.replaceChildren(h('p', { class: 'bd-good' }, '✓ Pronto, está na base de dados.'),
          h('ul', {}, done.map((d) => h('li', {}, `${GNAME[d.g]}: ${d.result.added.prod} produção(ões) e ${d.result.added.stops} paradas novas${d.result.dup.prod + d.result.dup.stops ? ` (${d.result.dup.prod + d.result.dup.stops} já estavam)` : ''}.`))),
          h('p', { class: 'note' }, 'Se foi sem querer, use "Desfazer" na tela da base de dados (aba BI).'), h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'primary', onclick: close }, 'Fechar')));
      } catch (e) {
        body.append(h('p', { class: 'bd-warn' }, `Não consegui terminar: ${e.message}`)); go.disabled = false; ok.disabled = false; go.textContent = 'Tentar de novo';
      }
    });
  } catch (e) {
    body.replaceChildren(h('p', { class: 'bd-warn' }, e.message), h('button', { type: 'button', class: 'primary', onclick: close }, 'Fechar'));
  }
}

// ---------------------------------------------------------------- import the Excel history
export function openImport(ctx) {
  const list = h('div', { class: 'bd-files' }), status = h('p', { class: 'note' }, 'Escolha a planilha de controle de RAW e/ou a de usinagem (.xlsx). Dá para escolher as duas juntas.');
  const picker = h('input', { type: 'file', accept: '.xlsx,.xls', multiple: true, hidden: true });
  const items = [];
  const go = h('button', { type: 'button', class: 'primary', disabled: true }, 'Subir para a base');
  const modeAdd = h('input', { type: 'radio', name: 'bd-mode', checked: true }), modeRep = h('input', { type: 'radio', name: 'bd-mode' });
  const sure = h('input', { type: 'checkbox' });
  const refresh = () => { go.disabled = !items.length || (modeRep.checked && !sure.checked); };
  [modeAdd, modeRep, sure].forEach((x) => x.addEventListener('change', refresh));
  picker.addEventListener('change', async () => {
    list.replaceChildren(); items.length = 0; status.textContent = 'Lendo as planilhas…';
    try {
      const XLSX = await import('xlsx');
      for (const f of picker.files) {
        try {
          const r = parseHistoryWorkbook(XLSX, await f.arrayBuffer());
          const days = [...new Set(r.prod.map((x) => x.d))].sort(), machines = [...new Set(r.prod.map((x) => x.m))].sort();
          items.push({ f, r });
          list.append(h('div', { class: 'bd-file' }, h('b', {}, `${f.name} → ${GNAME[r.group]}`),
            h('span', {}, `${nf(r.prod.length)} produções · ${nf(r.stops.length)} paradas · ${days.length} dias (${dmy(days[0])} a ${dmy(days.at(-1))}) · ${machines.join(', ')}`), ...r.warnings.map((w) => h('small', { class: 'bd-warn' }, w))));
        } catch (e) { list.append(h('div', { class: 'bd-file bad' }, h('b', {}, f.name), h('span', {}, e.message))); }
      }
      const groups = items.map((i) => i.r.group);
      if (new Set(groups).size < groups.length) { status.textContent = 'Há duas planilhas do mesmo grupo. Escolha uma de cada.'; items.length = 0; }
      else status.textContent = items.length ? 'Confira os números acima. Eles saem da planilha, linha a linha.' : 'Nenhuma planilha válida.';
    } catch (e) { status.textContent = `Não consegui ler: ${e.message}`; }
    refresh();
  });
  const bar = h('div', { class: 'bd-progress', hidden: true }, h('i', {}));
  const { close } = modal('Importar o histórico (Excel)', h('div', { class: 'bd-body' },
    h('p', {}, 'Traz para a base de dados as produções e as paradas que já estão nas planilhas de controle (abas PRODUÇÃO e PARADAS).'),
    h('div', { class: 'bd-btns left' }, h('button', { type: 'button', class: 'ghost', onclick: () => picker.click() }, '📂 Escolher planilha(s)'), picker), list, status,
    h('div', { class: 'bd-mode' },
      h('label', {}, modeAdd, h('span', {}, h('b', {}, ' Adicionar à base'), h('small', {}, ' (recomendado): só entra o que ainda não está; nada se repete.'))),
      h('label', {}, modeRep, h('span', {}, h('b', {}, ' Substituir tudo'), h('small', {}, ' o que está na base daquele grupo é trocado pela planilha (fica uma cópia para restaurar).'))),
      h('label', { class: 'bd-check' }, sure, ' Entendo que isso troca a base do grupo.')),
    bar, h('div', { class: 'bd-btns' }, go)), { wide: true });
  go.addEventListener('click', async () => {
    go.disabled = true; bar.hidden = false; go.textContent = 'Enviando…';
    try {
      const out = [];
      for (const { f, r } of items) {
        const res = await sendRecords(r.group, { prod: r.prod, stops: r.stops, label: `Histórico importado de ${f.name}`, op: modeRep.checked ? 'replace' : 'append', confirm: modeRep.checked, onProgress: (p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; } });
        out.push(`${GNAME[r.group]}: ${nf(res.added.prod)} produções e ${nf(res.added.stops)} paradas novas${res.dup.prod + res.dup.stops ? ` · ${nf(res.dup.prod + res.dup.stops)} já estavam` : ''}${res.invalid ? ` · ${res.invalid} fora do formato` : ''}`);
      }
      status.replaceChildren(h('b', { class: 'bd-good' }, '✓ Pronto. '), out.join(' | '));
      go.textContent = 'Concluído'; ctx.onDone?.();
    } catch (e) { status.replaceChildren(h('span', { class: 'bd-warn' }, `Não consegui terminar: ${e.message}`)); go.disabled = false; go.textContent = 'Tentar de novo'; }
  });
  return { close };
}

// ---------------------------------------------------------------- status card (what is in the base, and undo)
export async function renderBaseCard(root, ctx) {
  const body = h('div', { class: 'bd-card-body' }, h('p', { class: 'note' }, 'Lendo a base…'));
  root.replaceChildren(h('div', { class: 'bd-card-head' }, h('h3', {}, 'Base de dados'), h('div', { class: 'bd-btns' },
    h('button', { type: 'button', class: 'ghost', onclick: () => openImport({ onDone: ctx.reload }) }, '⤒ Importar histórico (Excel)'), h('button', { type: 'button', class: 'ghost', onclick: ctx.reload }, '↻ Atualizar'))), body);
  const rows = [];
  for (const g of ['raw', 'usi']) {
    let base = emptyBase(), err = '';
    try { base = await loadBase(g); } catch (e) { err = e.message; }
    const days = [...new Set(base.prod.map((r) => r.d))].sort();
    rows.push(h('div', { class: 'bd-grp' }, h('b', {}, GNAME[g]),
      err ? h('span', { class: 'bd-warn' }, err) : h('span', {}, base.prod.length || base.stops.length ? `${nf(base.prod.length)} produções · ${nf(base.stops.length)} paradas · ${days.length} dias${days.length ? ` (${dmy(days[0])} a ${dmy(days.at(-1))})` : ''}` : 'vazia (importe o histórico ou suba uma folha)'),
      base.batches.length ? h('details', {}, h('summary', {}, `${base.batches.length} envio(s)`), h('ul', { class: 'bd-batches' }, [...base.batches].reverse().slice(0, 12).map((b) => h('li', {}, h('span', {}, `${fmtAt(b.at)} · ${b.label} · ${nf(b.nProd)} prod. · ${nf(b.nStops)} par.`),
        h('button', { type: 'button', class: 'ghost', onclick: async (e) => { if (!window.confirm(`Desfazer este envio?\n\n${b.label}\n${b.nProd} produções e ${b.nStops} paradas saem da base.`)) return; e.target.disabled = true; try { const r = await undoBatch(g, b.id); ctx.toast(`Envio desfeito (${r.removed.prod} produções e ${r.removed.stops} paradas removidas).`); ctx.reload(); } catch (er) { ctx.toast(er.message); e.target.disabled = false; } } }, 'Desfazer'))))) : null,
      base.batches.some((b) => /importado/i.test(b.label)) ? h('button', { type: 'button', class: 'linkbtn', onclick: async () => { if (!window.confirm('Voltar a base deste grupo para a cópia feita antes da última substituição completa?')) return; try { await restoreBase(g); ctx.toast('Base restaurada.'); ctx.reload(); } catch (er) { ctx.toast(er.message); } } }, 'restaurar a cópia anterior à substituição') : null));
  }
  body.replaceChildren(...rows);
}

// the base screen as a window (opened from the ⋮ menu): see what is stored, import the Excel history, undo an envio
export function openBaseModal(ctx) {
  const host = h('div', { class: 'bd-card-body' });
  modal('Base de dados', host, { wide: true });
  const reload = () => { renderBaseCard(host, { ...ctx, reload }); ctx.reload?.(); };
  renderBaseCard(host, { ...ctx, reload });
}
