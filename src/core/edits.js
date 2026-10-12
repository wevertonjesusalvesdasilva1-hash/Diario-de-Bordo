// Manual changes the person made after the reading: what the app read, what they put instead.
// Kept on the rows themselves (row.edits, row.added, page.removedRows), so they persist and reach the report.

export const FIELD_NAME = { data: 'Data', peca: 'Peça', modelo: 'Modelo', chapa1: 'Chapa (1º turno)', ini1: 'Início (1º turno)', fim1: 'Fim (1º turno)', chapa2: 'Chapa (2º turno)', ini2: 'Início (2º turno)', fim2: 'Fim (2º turno)', chapa3: 'Chapa (3º turno)', ini3: 'Início (3º turno)', fim3: 'Fim (3º turno)', turno_finalizou: 'Turno', turno: 'Turno', obs: 'Observações', chapa: 'Chapa', ini: 'Início', fim: 'Fim', motivo: 'Motivo', desc: 'Descrição' };

const same = (a, b) => String(a ?? '').trim().toUpperCase() === String(b ?? '').trim().toUpperCase();

// Called with the value the cell had BEFORE this change; keeps the very first value as "what was read".
export function recordEdit(row, field, before, after) {
  if (row.added) return; // a row the person created has no reading to compare with
  const prev = row.edits?.[field];
  const from = prev ? prev.from : before;
  if (same(from, after)) { if (prev) { delete row.edits[field]; if (!Object.keys(row.edits).length) delete row.edits; } return; }
  row.edits = { ...(row.edits ?? {}), [field]: { from: from ?? '', to: after ?? '', at: new Date().toISOString() } };
}

export function recordRemoval(page, table, row, ri) {
  const bits = table === 'prod'
    ? [row.peca, row.modelo, row.ini1 && `${row.ini1}–${row.fim1 ?? ''}`].filter(Boolean)
    : [row.motivo, row.ini && `${row.ini}–${row.fim ?? ''}`].filter(Boolean);
  (page.removedRows ??= []).push({ table, linha: row.linha || ri + 1, added: !!row.added, summary: bits.join(' · ') });
}

// Flat list for the report. `cards` (the analysis findings) tell which edits still raise an alert.
export function collectEdits(pages, cards = []) {
  const out = [];
  const day = (p) => (p.date || '').slice(0, 5) || 'sem data';
  const alerts = (p, table, ri) => cards.some((c) => c.page === p.id && c.table === table && c.ri === ri);
  for (const p of pages) {
    const base = { page: p.id, label: p.label, machine: p.machine || 'SEM MÁQUINA', day: day(p) };
    if (p.edits?.machine) out.push({ ...base, kind: 'alterado', table: 'prod', ri: 0, linha: '', where: 'Cabeçalho', field: 'Máquina', from: p.edits.machine.from, to: p.edits.machine.to, alert: false });
    for (const table of ['prod', 'stops']) {
      p[table].forEach((r, ri) => {
        const where = `${table === 'prod' ? 'Produção' : 'Parada'} linha ${r.linha || ri + 1}`;
        if (r.added) { out.push({ ...base, kind: 'linha nova', table, ri, linha: r.linha || ri + 1, where, field: '', from: '', to: describeRow(table, r), alert: alerts(p, table, ri) }); return; }
        for (const [f, e] of Object.entries(r.edits ?? {})) {
          const kind = !String(e.from ?? '').trim() ? 'preenchido' : !String(e.to ?? '').trim() ? 'apagado' : 'alterado';
          out.push({ ...base, kind, table, ri, linha: r.linha || ri + 1, where, field: FIELD_NAME[f] ?? f, from: e.from, to: e.to, alert: alerts(p, table, ri) });
        }
      });
    }
    for (const r of p.removedRows ?? []) if (!r.added) out.push({ ...base, kind: 'linha excluída', table: r.table, ri: 0, linha: r.linha, where: `${r.table === 'prod' ? 'Produção' : 'Parada'} linha ${r.linha}`, field: '', from: r.summary, to: '', alert: false });
  }
  return out;
}

const describeRow = (table, r) => (table === 'prod'
  ? [r.peca, r.modelo, r.ini1 && `${r.ini1}–${r.fim1 ?? ''}`].filter(Boolean)
  : [r.motivo, r.ini && `${r.ini}–${r.fim ?? ''}`].filter(Boolean)).join(' · ') || 'linha em branco';

// One sentence for a card or a sheet cell.
export function describeEdit(e) {
  const f = e.field ? `${e.field}: ` : '';
  if (e.kind === 'preenchido') return `${f}estava em branco na leitura, você colocou "${e.to}"`;
  if (e.kind === 'apagado') return `${f}a leitura tinha "${e.from}", você apagou`;
  if (e.kind === 'linha nova') return `linha acrescentada por você (${e.to})`;
  if (e.kind === 'linha excluída') return `linha excluída por você${e.from ? ` (${e.from})` : ''}`;
  return `${f}a leitura tinha "${e.from}", você mudou para "${e.to}"`;
}
