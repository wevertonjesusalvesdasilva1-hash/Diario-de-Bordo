// The "base de dados" screens: submit the validated sheets, import the Excel history, and see/undo what went in.
import { auditData } from './core/audit.js';
import { recordsFromPages, mergeRecords, parseHistoryWorkbook, groupOfMachine, dmy, auditDays, pageSig } from './core/history.js';
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

function modal(title, body, { wide = false, onClose } = {}) {
  document.getElementById('bd-modal')?.remove();
  const close = () => { box.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const box = h('div', { id: 'bd-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: `bd-box${wide ? ' wide' : ''}` }, h('div', { class: 'bd-head' }, h('h3', {}, title), h('button', { type: 'button', class: 'bd-x', 'aria-label': 'Fechar', onclick: close }, '✕')), body));
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  document.body.append(box); document.addEventListener('keydown', onKey);
  return { close, box };
}

// ---------------------------------------------------------------- submit the validated sheets
// ctx: { pages (the selected sheets), reviewed, flagsOf(page), toast, onDone({ g, batch, pages, result }), goRead() }
export async function openSubmit(ctx, force = false) {
  const body = h('div', { class: 'bd-body' }, h('p', { class: 'note' }, 'Conferindo o que vai para a base…'));
  const { close, box: dlg } = modal(force ? 'Subir para a base de dados (mesmo com dúvidas)' : 'Subir para a base de dados', body);
  const anyway = () => h('button', { type: 'button', class: 'ghost', title: 'Sobe mesmo assim, com as dúvidas que ficaram', onclick: () => { close(); openSubmit(ctx, true); } }, 'Subir mesmo assim');
  const risks = [];   // what goes in unconfirmed (only filled when the person chose to go on anyway)
  try {
    if (!ctx.reviewed && !force) { body.replaceChildren(h('p', {}, 'A conferência ainda não recebeu o OK.'), h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'primary', onclick: close }, 'Entendi'), anyway())); return; }
    if (!ctx.reviewed) risks.push('A conferência ainda não recebeu o OK.');
    const pages = ctx.pages;
    if (!pages.length) { body.replaceChildren(h('p', {}, 'Nenhuma folha selecionada.'), h('button', { type: 'button', class: 'primary', onclick: close }, 'Entendi')); return; }
    const noMachine = pages.filter((p) => !p.machine), withDoubt = pages.filter((p) => ctx.flagsOf(p) > 0);
    if (force) { for (const p of noMachine) risks.push(`${p.label}: sem máquina escolhida, fica de fora.`); for (const p of withDoubt) risks.push(`${p.label}: ${ctx.flagsOf(p)} célula(s) em dúvida entram como estão.`); }
    if (!force && (noMachine.length || withDoubt.length)) {
      body.replaceChildren(h('p', { class: 'bd-warn' }, 'Ainda não dá para subir:'),
        h('ul', {}, noMachine.map((p) => h('li', {}, `${p.label}: a máquina não foi escolhida.`)), withDoubt.map((p) => h('li', {}, `${p.label}: ${ctx.flagsOf(p)} célula(s) em dúvida.`))),
        h('p', { class: 'note' }, 'O ideal é corrigir e dar o OK. Se precisar, dá para subir mesmo assim: entra o que está na tela, com as dúvidas.'),
        h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Fechar'), h('button', { type: 'button', class: 'ghost', onclick: () => { close(); ctx.goRead(); } }, 'Ir para a conferência'), anyway()));
      return;
    }
    const groups = ['raw', 'usi'].map((g) => ({ g, pages: pages.filter((p) => groupOfMachine(p.machine) === g) })).filter((x) => x.pages.length);
    const plans = [], same = [];
    const everyone = ctx.allPages ?? pages;
    for (const x of groups) {
      const base = await loadBase(x.g).catch((e) => { throw new Error(`${GNAME[x.g]}: ${e.message}`); });
      // sheets already sent: still equal to what is in the base (nothing to do), or changed since (they replace their old rows), or new
      const sids = [], batches = new Set(), send = [], unchanged = [];
      for (const p of x.pages) {
        if (!p.submitted || p.submitted.g !== x.g) { send.push(p); continue; }
        if (p.submitted.sig) { if (p.submitted.sig === pageSig(p)) unchanged.push(p); else { send.push(p); sids.push(p.sid); } continue; }
        // sent before sheets were tied to their rows: compare the whole old envio with the base
        const b = p.submitted.batch, sib = everyone.filter((q) => q.submitted?.batch === b && q.submitted.g === x.g), rows = { prod: base.prod.filter((r) => r.b === b), stops: base.stops.filter((r) => r.b === b) }, rc = recordsFromPages(sib), mm = mergeRecords(rows, rc);
        if (!mm.added.prod && !mm.added.stops && rows.prod.length === rc.prod.length && rows.stops.length === rc.stops.length) unchanged.push(p);
        else { batches.add(b); for (const q of sib) if (!send.includes(q)) send.push(q); }
      }
      const gone = (r) => (r.s && sids.includes(r.s)) || (!r.s && r.b && batches.has(r.b)), base2 = { ...base, prod: base.prod.filter((r) => !gone(r)), stops: base.stops.filter((r) => !gone(r)) };
      const removed = { prod: base.prod.length - base2.prod.length, stops: base.stops.length - base2.stops.length };
      if (!send.length) { same.push(...unchanged); continue; }
      const recs = recordsFromPages(send), merged = mergeRecords(base2, recs);
      plans.push({ ...x, pages: send, recs, merged, removed, resend: sids.length || batches.size ? { sids: [...sids, ...send.filter((p) => !p.submitted?.sig && p.submitted).map((p) => p.sid)], batches: [...batches] } : null, changed: send.filter((p) => p.submitted).length, unchanged });
    }
    if (!plans.length) { body.replaceChildren(h('p', { class: 'bd-good' }, '✓ Tudo isso já está na base, sem alterações desde o último envio.'), h('p', { class: 'note' }, `${same.length} folha(s) conferidas: o que está nelas é igual ao que foi enviado.`), h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'primary', onclick: close }, 'Fechar'))); return; }
    const resending = plans.some((p) => p.changed);
    if (resending) dlg.querySelector('h3').textContent = force ? 'Subir novamente para a base (com alterações e dúvidas)' : 'Subir novamente para a base (com alterações)';
    // a machine cannot run more than 24 h in a day: block the envio when the days touched by these sheets would pass it
    const over = plans.flatMap((p) => { const touched = new Set([...p.recs.prod, ...p.recs.stops].map((r) => `${r.d}|${r.m}`)); const next = (d) => new Date(Date.parse(`${d}T12:00:00Z`) + 86400000).toISOString().slice(0, 10); return auditDays(p.merged.prod, p.merged.stops, (m, d) => touched.has(`${d}|${m}`) || touched.has(`${new Date(Date.parse(`${d}T12:00:00Z`) - 86400000).toISOString().slice(0, 10)}|${m}`)); });
    if (force && over.length) risks.push(`${over.length} dia(s) de máquina passam de 24 h (produção + paradas): confira depois em Painel BI → Plano de ação.`);
    if (over.length && !force) {
      body.replaceChildren(h('p', { class: 'bd-warn' }, 'Não dá para subir: estes dias passariam de 24 horas (produção + paradas da mesma máquina).'),
        h('table', { class: 'bd-tab' }, h('thead', {}, h('tr', {}, ['Dia', 'Máquina', 'Produção', 'Paradas', 'Total', 'Por quê'].map((t) => h('th', {}, t)))),
          h('tbody', {}, over.map((r) => h('tr', {}, h('td', {}, dmy(r.d)), h('td', {}, r.m), h('td', {}, `${r.ph.toFixed(1)} h`), h('td', {}, `${r.sh.toFixed(1)} h`), h('td', {}, `${r.tot.toFixed(1)} h`), h('td', {}, r.why))))),
        h('p', { class: 'note' }, 'Confira horários digitados errados, paradas repetidas ou parada lançada no mesmo horário da produção. O ideal é corrigir na conferência, mas dá para subir mesmo assim e corrigir depois na aba Base de dados.'),
        h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Fechar'), h('button', { type: 'button', class: 'ghost', onclick: () => { close(); ctx.goRead(); } }, 'Ir para a conferência'), anyway()));
      return;
    }
    // things to look at (they do not stop the envio): the other checks of the audit, only for the machine-days of these sheets
    const warn = plans.flatMap((p) => { const touched = new Set([...p.recs.prod, ...p.recs.stops].map((r) => `${r.d}|${r.m}`)), keep = (r) => touched.has(`${r.d}|${r.m}`); return auditData({ prod: p.merged.prod.filter(keep), stops: p.merged.stops.filter(keep) }).filter((c) => c.count && c.level !== 'info' && !['p-std', 'd-24', 's-nolink', 's-prod', 'p-eff', 's-mot'].includes(c.id)).map((c) => `${GNAME[p.g]}: ${c.count} · ${c.title}`); });
    const total = plans.reduce((n, p) => n + p.merged.added.prod + p.merged.added.stops, 0);
    const ok = h('input', { type: 'checkbox', id: 'bd-ok' }), go = h('button', { type: 'button', class: 'primary', disabled: true }, resending ? 'Sim, subir novamente' : 'Sim, subir para a base');
    ok.addEventListener('change', () => { go.disabled = !ok.checked || !total; });
    const skipped = plans.flatMap((p) => p.recs.skipped);
    body.replaceChildren(
      h('p', {}, 'Confira o que vai entrar na base de dados (o histórico usado nos painéis BI):'),
      h('table', { class: 'bd-tab' }, h('thead', {}, h('tr', {}, ['Base', 'Folhas', 'Produção (novas)', 'Paradas (novas)', 'Já estavam na base'].map((t) => h('th', {}, t)))),
        h('tbody', {}, plans.map((p) => h('tr', {}, h('td', {}, GNAME[p.g]), h('td', {}, String(p.pages.length), p.changed ? h('small', {}, ` (${p.changed} já enviada(s) e alterada(s))`) : ''), h('td', {}, `${p.merged.added.prod} de ${p.recs.prod.length}`), h('td', {}, `${p.merged.added.stops} de ${p.recs.stops.length}`),
          h('td', {}, `${p.merged.dup.prod} produção(ões) · ${p.merged.dup.stops} paradas`))))),
      plans.some((p) => p.removed.prod + p.removed.stops) ? h('p', { class: 'note' }, 'Estas folhas já estavam na base. A versão antiga delas sai e entra a atual (', plans.filter((p) => p.removed.prod + p.removed.stops).map((p) => `${GNAME[p.g]}: troca ${nf(p.removed.prod)} produções e ${nf(p.removed.stops)} paradas`).join(' · '), '). Dá para desfazer pelo Painel BI → Base de dados → Versões.') : '',
      skipped.length ? h('details', { class: 'bd-skip' }, h('summary', {}, `${skipped.length} linha(s) ficam de fora (sem data ou horário)`), h('ul', {}, skipped.map((s) => h('li', {}, `${s.page}: ${s.why}`)))) : '',
      risks.length ? h('details', { class: 'bd-skip', open: true }, h('summary', {}, `Vai subir com dúvidas (${risks.length})`), h('ul', {}, risks.map((w) => h('li', {}, w))), h('p', { class: 'note' }, 'Depois dá para corrigir na aba Base de dados ou desfazer este envio.')) : '',
      warn.length ? h('details', { class: 'bd-skip', open: true }, h('summary', {}, `Para conferir (${warn.length}) — não impede o envio`), h('ul', {}, warn.map((w) => h('li', {}, w))), h('p', { class: 'note' }, 'Veja os detalhes depois, em Painel BI → Auditoria dos dados.')) : '',
      total ? '' : h('p', { class: 'note' }, 'Tudo isso já está na base. Não há nada novo para subir.'),
      h('label', { class: 'bd-check' }, ok, ' ', force ? 'Quero subir mesmo com estas dúvidas.' : 'Confirmo que o preenchimento destas folhas está finalizado e correto.'),
      h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: close }, 'Cancelar'), go));
    go.addEventListener('click', async () => {
      go.disabled = true; ok.disabled = true; go.textContent = 'Enviando…';
      const done = [];
      try {
        for (const p of plans) {
          const res = await sendRecords(p.g, { prod: p.recs.prod, stops: p.recs.stops, resend: p.resend ?? undefined, label: `${p.changed ? 'Reenvio com alterações · ' : ''}${force ? '(com dúvidas) ' : ''}${p.pages.length} folha(s): ${p.pages.map((x) => x.label.replace(/ · pág\./, ' p.')).slice(0, 3).join(', ')}${p.pages.length > 3 ? '…' : ''}` });
          done.push({ g: p.g, pages: p.pages, result: res });
          ctx.onDone({ g: p.g, batch: res.batch, pages: p.pages, result: res });
        }
        body.replaceChildren(h('p', { class: 'bd-good' }, '✓ Pronto, está na base de dados.'),
          h('ul', {}, done.map((d) => h('li', {}, `${GNAME[d.g]}: ${d.result.removed?.prod + d.result.removed?.stops ? `${d.result.removed.prod} produção(ões) e ${d.result.removed.stops} paradas antigas trocadas por ` : ''}${d.result.added.prod} produção(ões) e ${d.result.added.stops} paradas novas${d.result.dup.prod + d.result.dup.stops ? ` (${d.result.dup.prod + d.result.dup.stops} já estavam)` : ''}.`))),
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
  const only = ctx.only ?? null;   // opened from the card of one group: only that group's box is shown, so a sheet can never go to the other base
  const status = h('p', { class: 'note' }, only ? `Escolha a planilha de ${GNAME[only]}. Só planilhas de ${GNAME[only]} são aceitas aqui.` : 'Escolha a planilha de cada grupo, no quadro dele. Cada quadro só aceita a planilha do seu grupo.');
  const items = [];
  const go = h('button', { type: 'button', class: 'primary', disabled: true }, 'Subir para a base');
  const modeAdd = h('input', { type: 'radio', name: 'bd-mode', checked: true }), modeRep = h('input', { type: 'radio', name: 'bd-mode' });
  const sure = h('input', { type: 'checkbox' });
  const refresh = () => { go.disabled = !items.length || (modeRep.checked && !sure.checked); };
  [modeAdd, modeRep, sure].forEach((x) => x.addEventListener('change', refresh));
  // one box per group: a RAW sheet can only go into the RAW box and a machining one into the machining box (never mixed)
  const slots = (only ? [only] : ['raw', 'usi']).map((g) => {
    const list = h('div', { class: 'bd-files' }), picker = h('input', { type: 'file', accept: '.xlsx,.xls', hidden: true }), st = { g, item: null };
    picker.addEventListener('change', async () => {
      list.replaceChildren(); st.item = null;
      const f = picker.files[0]; picker.value = '';
      if (f) {
        status.textContent = 'Lendo a planilha…';
        try {
          const r = parseHistoryWorkbook(await import('xlsx'), await f.arrayBuffer());
          if (r.group !== g) list.append(h('div', { class: 'bd-file bad' }, h('b', {}, f.name), h('span', {}, `Esta planilha é de ${GNAME[r.group]}, não de ${GNAME[g]}. Coloque-a no quadro de ${GNAME[r.group]}.`)));
          else {
            const days = [...new Set(r.prod.map((x) => x.d))].sort(), machines = [...new Set(r.prod.map((x) => x.m))].sort();
            st.item = { f, r };
            list.append(h('div', { class: 'bd-file' }, h('b', {}, f.name), h('span', {}, `${nf(r.prod.length)} produções · ${nf(r.stops.length)} paradas · ${days.length} dias (${dmy(days[0])} a ${dmy(days.at(-1))}) · ${machines.join(', ')}`), ...r.warnings.map((w) => h('small', { class: 'bd-warn' }, w))));
          }
        } catch (e) { list.append(h('div', { class: 'bd-file bad' }, h('b', {}, f.name), h('span', {}, e.message))); }
      }
      items.length = 0; slots.forEach((q) => { if (q.item) items.push(q.item); });
      status.textContent = items.length ? 'Confira os números acima. Eles saem da planilha, linha a linha.' : 'Nenhuma planilha válida escolhida.';
      refresh();
    });
    st.box = h('div', { class: 'bd-slot' }, h('h4', {}, GNAME[g]), h('button', { type: 'button', class: 'ghost', onclick: () => picker.click() }, `📂 Escolher planilha de ${GNAME[g]}`), picker, list);
    return st;
  });
  const bar = h('div', { class: 'bd-progress', hidden: true }, h('i', {}));
  const { close } = modal(only ? `Importar Excel de ${GNAME[only]}` : 'Importar o histórico (Excel)', h('div', { class: 'bd-body' },
    h('p', {}, 'Traz para a base de dados as produções e as paradas que já estão nas planilhas de controle (abas PRODUÇÃO e PARADAS).'),
    h('div', { class: only ? 'bd-slots one' : 'bd-slots' }, ...slots.map((q) => q.box)), status,
    h('div', { class: 'bd-mode' },
      h('label', {}, modeAdd, h('span', {}, h('b', {}, ' Adicionar à base'), h('small', {}, ' (recomendado): só entra o que ainda não está; nada se repete.'))),
      h('label', {}, modeRep, h('span', {}, h('b', {}, ' Substituir tudo'), h('small', {}, ' o que está na base daquele grupo é trocado pela planilha (fica uma cópia para restaurar).'))),
      h('label', { class: 'bd-check' }, sure, ' Entendo que isso troca a base do grupo.')),
    bar, h('div', { class: 'bd-btns' }, go)), { wide: true, onClose: ctx.back });
  go.addEventListener('click', async () => {
    if (modeRep.checked) {   // say exactly what will be erased before doing it
      const lines = [];
      for (const { r } of items) { const b = await loadBase(r.group, { force: true }).catch(() => emptyBase()); lines.push(`${GNAME[r.group]}: ${nf(b.prod.length)} produções e ${nf(b.stops.length)} paradas serão apagadas e trocadas por ${nf(r.prod.length)} produções e ${nf(r.stops.length)} paradas da planilha.`); }
      if (!window.confirm(`SUBSTITUIR TUDO\n\n${lines.join('\n')}\n\nO outro grupo não é tocado. Fica uma cópia para restaurar. Continuar?`)) return;
    }
    go.disabled = true; bar.hidden = false; go.textContent = 'Enviando…';
    try {
      const out = [], checks = [];
      for (const { f, r } of items) {
        const res = await sendRecords(r.group, { prod: r.prod, stops: r.stops, label: `Histórico importado de ${f.name}`, op: modeRep.checked ? 'replace' : 'append', confirm: modeRep.checked, onProgress: (p) => { bar.firstChild.style.width = `${Math.round(p * 100)}%`; } });
        out.push(`${GNAME[r.group]}: ${nf(res.added.prod)} produções e ${nf(res.added.stops)} paradas novas${res.dup.prod + res.dup.stops ? ` · ${nf(res.dup.prod + res.dup.stops)} já estavam` : ''}${res.invalid ? ` · ${nf(res.invalid)} recusadas` : ''}`);
        status.replaceChildren('Conferindo se tudo o que está na planilha chegou na base…');
        checks.push(await verifyImport(r, modeRep.checked));
      }
      status.replaceChildren(h('b', { class: checks.every((c) => c.ok) ? 'bd-good' : 'bd-warn' }, checks.every((c) => c.ok) ? '✓ Pronto e conferido. ' : '⚠ Enviado, mas a conferência achou diferenças. '), out.join(' | '), ...checks.map((c) => c.node));
      go.textContent = 'Concluído'; ctx.onDone?.();
    } catch (e) { status.replaceChildren(h('span', { class: 'bd-warn' }, `Não consegui terminar: ${e.message}`)); go.disabled = false; go.textContent = 'Tentar de novo'; }
  });
  return { close };
}

// after an import: read the base back from the server and prove that what the sheet has is what the app will show
const hsum = (rows) => rows.reduce((t, r) => t + (Number(r.h) || 0), 0);
async function verifyImport(r, replaced) {
  // the server cuts long texts (same limits as api/historico.js), so the sheet's rows are cut the same way before comparing
  const cut = (v, n) => (typeof v === 'string' ? v.slice(0, n) : v);
  let trimmed = 0;
  const cp = r.prod.map((x) => { const y = { ...x, p: cut(x.p, 160), o: cut(x.o, 160), ob: cut(x.ob, 300) }; if (y.p !== x.p || y.o !== x.o || y.ob !== x.ob) trimmed++; return y; });
  const cs = r.stops.map((x) => { const y = { ...x, c: cut(x.c, 40), mo: cut(x.mo, 160), ds: cut(x.ds, 300) }; if (y.c !== x.c || y.mo !== x.mo || y.ds !== x.ds) trimmed++; return y; });
  const base = await loadBase(r.group, { force: true }), m = mergeRecords(base, { prod: cp, stops: cs }), miss = { prod: m.added.prod, stops: m.added.stops };
  const rows = [['Produções', r.prod.length, replaced ? base.prod.length : null, miss.prod], ['Paradas', r.stops.length, replaced ? base.stops.length : null, miss.stops],
    ['Horas produzidas', hsum(r.prod), replaced ? hsum(base.prod) : null, 0], ['Horas paradas', hsum(r.stops), replaced ? hsum(base.stops) : null, 0]];
  const wrong = rows.filter(([n, a, b, ms]) => ms > 0 || (b != null && Math.abs(a - b) > (n.startsWith('Horas') ? 0.05 : 0)));
  const f = (n, v) => (n.startsWith('Horas') ? `${v.toFixed(2).replace('.', ',')} h` : nf(v));
  const node = h('table', { class: 'bd-tab bd-verify' }, h('caption', {}, `Conferência · ${GNAME[r.group]}`), h('thead', {}, h('tr', {}, ['', 'Planilha', replaced ? 'Base agora' : 'Achadas na base', ''].map((t) => h('th', {}, t)))),
    h('tbody', {}, trimmed ? h('tr', {}, h('td', { colspan: 4, class: 'note' }, `${nf(trimmed)} registro(s) tinham texto muito longo (observação, peça ou descrição) e foram guardados com o texto cortado. Os números e horários não mudam.`)) : '', rows.map(([n, a, b, ms]) => { const bad = ms > 0 || (b != null && Math.abs(a - b) > (n.startsWith('Horas') ? 0.05 : 0)); return h('tr', { class: bad ? 'bad' : '' }, h('td', {}, n), h('td', {}, f(n, a)), h('td', {}, b != null ? f(n, b) : (n.startsWith('Horas') ? '—' : nf(a - ms))), h('td', {}, bad ? `⚠ ${ms ? `${nf(ms)} não chegou` : 'diferente'}` : '✓')); })));
  return { ok: !wrong.length, node };
}

// what is in the base of one group: records, period, robots, last import (read from the base itself)
function summarize(base) {
  const days = [...new Set(base.prod.map((r) => r.d))].sort(), machines = new Map();
  for (const r of base.prod) machines.set(r.m, (machines.get(r.m) || 0) + 1);
  return { days, machines: [...machines.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true })) };
}
// the integrity check of one base: only points out, never changes anything
function integrity(g, base) {
  const bad = [], seenKeys = new Set();
  const wrongM = [...base.prod, ...base.stops].filter((r) => groupOfMachine(r.m) !== g);
  if (wrongM.length) bad.push(`${nf(wrongM.length)} registro(s) de máquina que não é de ${GNAME[g]} (${[...new Set(wrongM.map((r) => r.m))].slice(0, 5).join(', ')})`);
  const noDate = [...base.prod, ...base.stops].filter((r) => !/^\d{4}-\d{2}-\d{2}$/.test(r.d || ''));
  if (noDate.length) bad.push(`${nf(noDate.length)} registro(s) sem data válida`);
  const neg = [...base.prod, ...base.stops].filter((r) => !(Number(r.h) >= 0));
  if (neg.length) bad.push(`${nf(neg.length)} registro(s) com horas inválidas`);
  const ids = new Set(base.batches.map((b) => b.id)), orphan = [...base.prod, ...base.stops].filter((r) => r.b && !ids.has(r.b) && !/^ed/.test(r.b));
  if (orphan.length) bad.push(`${nf(orphan.length)} registro(s) de envios que não estão mais na lista de versões`);
  void seenKeys;
  return bad;
}

// ---------------------------------------------------------------- status card (what is in the base, versions, and undo)
export async function renderBaseCard(root, ctx) {
  root.replaceChildren(h('div', { class: 'bd-card-head' }, h('h3', {}, 'Situação das bases'), h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: ctx.reload }, '↻ Atualizar'))),
    h('p', { class: 'note' }, 'Cada grupo tem a sua base, separada: uma planilha de robôs só entra em RAW, e uma da usinagem só em Usinagem.'), h('p', { class: 'note' }, 'Lendo a base…'));
  const cards = [];
  for (const g of ['raw', 'usi']) {
    let base = emptyBase(), err = '';
    try { base = await loadBase(g, { force: true }); } catch (e) { err = e.message; }
    const { days, machines } = summarize(base), batches = [...base.batches].reverse();
    const last = batches.find((b) => /importado/i.test(b.label)) ?? batches[0];
    const result = h('div', { class: 'bd-result' });
    const list = h('div', { class: 'bd-versions', hidden: true }, batches.length ? h('ul', { class: 'bd-batches' }, batches.map((b, i) => {
      const own = [...base.prod, ...base.stops].filter((r) => r.b === b.id), ds = [...new Set(own.map((r) => r.d))].sort();
      return h('li', {}, h('span', {}, h('b', {}, fmtAt(b.at)), ` · ${b.op === 'replace' ? 'substituiu tudo' : 'adicionou'} · ${b.label}`, h('small', {}, ` ${nf(b.nProd)} produções · ${nf(b.nStops)} paradas${ds.length ? ` · ${dmy(ds[0])} a ${dmy(ds.at(-1))}` : ''}${i === 0 ? ' · mais recente' : ''}`)),
        h('button', { type: 'button', class: 'ghost', onclick: async (e) => { if (!window.confirm(`Desfazer este envio?\n\n${b.label}\n${nf(b.nProd)} produções e ${nf(b.nStops)} paradas saem da base de ${GNAME[g]}.`)) return; e.target.disabled = true; try { await undoBatch(g, b.id); ctx.toast?.('Envio desfeito.'); ctx.reload(); } catch (x) { ctx.toast?.(x.message); e.target.disabled = false; } } }, 'Desfazer'));
    })) : h('p', { class: 'note' }, 'Nenhum envio ainda.'),
      batches.some((b) => /importado/i.test(b.label)) ? h('button', { type: 'button', class: 'linkbtn', onclick: async () => { if (!window.confirm(`Voltar a base de ${GNAME[g]} para a cópia feita antes da última substituição?`)) return; try { await restoreBase(g); ctx.toast?.('Base restaurada.'); ctx.reload(); } catch (x) { ctx.toast?.(x.message); } } }, 'restaurar a cópia anterior à substituição') : '');
    const has = base.prod.length || base.stops.length;
    cards.push(h('section', { class: 'bd-grp bd-card' }, h('h4', {}, GNAME[g]),
      err ? h('p', { class: 'bd-warn' }, err) : has ? h('div', { class: 'bd-stats' },
        h('p', { class: 'bd-last' }, last ? h('span', {}, 'Última importação: ', h('b', {}, fmtAt(last.at)), h('small', {}, ` · ${last.label.replace(/^Histórico importado de /, 'arquivo ')}`)) : 'Nenhuma importação ainda.'),
        h('p', {}, h('b', {}, nf(base.prod.length)), ' produções · ', h('b', {}, nf(base.stops.length)), ' paradas · ', h('b', {}, String(days.length)), ' dias', days.length ? h('small', {}, ` (${dmy(days[0])} a ${dmy(days.at(-1))})`) : ''),
        h('p', { class: 'bd-mach' }, machines.map(([m, n]) => h('span', { class: 'chip' }, `${m} · ${nf(n)}`)))) : h('p', { class: 'note' }, 'Base vazia.'),
      h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'primary', onclick: () => openImport({ only: g, onDone: ctx.reload, back: ctx.back }) }, `⤒ Importar Excel de ${g === 'raw' ? 'robôs (RAW)' : 'usinagem'}`),
        h('button', { type: 'button', class: 'ghost', onclick: () => { list.hidden = !list.hidden; } }, `▤ Versões (${batches.length})`),
        h('button', { type: 'button', class: 'ghost', onclick: () => { const bad = integrity(g, base); result.replaceChildren(bad.length ? h('div', { class: 'bd-warn' }, h('b', {}, '⚠ Achei isto na base: '), h('ul', {}, bad.map((x) => h('li', {}, x)))) : h('p', { class: 'bd-good' }, `✓ Base de ${GNAME[g]} conferida: todas as máquinas são do grupo, todas as datas e horas são válidas e todo registro pertence a uma versão.`)); } }, '✓ Conferir a base')),
      result, list));
  }
  root.replaceChildren(h('div', { class: 'bd-card-head' }, h('h3', {}, 'Situação das bases'), h('div', { class: 'bd-btns' }, h('button', { type: 'button', class: 'ghost', onclick: ctx.reload }, '↻ Atualizar'))),
    h('p', { class: 'note' }, 'Cada grupo tem a sua base, separada: uma planilha de robôs só entra em RAW, e uma da usinagem só em Usinagem.'), h('div', { class: 'bd-slots' }, ...cards));
}

// the base screen as a window (opened from the ⋮ menu): see what is stored, import the Excel history, undo an envio
export function openBaseModal(ctx) {
  const host = h('div', { class: 'bd-card-body' });
  modal('Base de dados', host, { wide: true });
  const back = () => openBaseModal(ctx), reload = () => { renderBaseCard(host, { ...ctx, reload, back }); ctx.reload?.(); };
  renderBaseCard(host, { ...ctx, reload, back });
}
