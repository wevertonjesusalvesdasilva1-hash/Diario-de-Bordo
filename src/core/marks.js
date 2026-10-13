// Where a card points on the sheet image: the rows that matter (outlined) and, when the card knows them, the exact
// cells (a stronger box). Everything is a fraction of the image, so the screen and the downloaded copy share it.
const COLS = {
  prod: { data: 1, peca: 2, modelo: 3, chapa1: 4, ini1: 5, fim1: 6, chapa2: 7, ini2: 8, fim2: 9, chapa3: 10, ini3: 11, fim3: 12, turno: 13, obs: 14 },
  stops: { data: 1, chapa: 2, ini: 3, fim: 4, turno: 5, motivo: [6, 15], desc: 16 },
};

// card.refs = [{ table, linha, fields? }]; page = { sheetGeo, crop } → [{ kind: 'row' | 'cell', x, y, w, h }]
export function cardMarks(card, page) {
  const out = [];
  for (const r of card.refs ?? []) {
    const g = page?.sheetGeo?.[r.table];
    const n = (r.linha || 0) - 1;
    if (!g || n < 0 || n + 1 >= g.y.length) continue;
    const y = g.y[n], h = g.y[n + 1] - g.y[n];
    out.push({ kind: 'row', x: g.x0, y, w: g.x1 - g.x0, h });
    const meta = page?.crop?.[r.table];
    if (!meta) continue;
    for (const f of r.fields ?? []) {
      const spec = COLS[r.table]?.[f];
      if (spec == null) continue;
      const [c0, c1] = Array.isArray(spec) ? spec : [spec, spec];
      const a = meta.cols[c0]?.[0], b = meta.cols[c1]?.[1];
      if (a == null || b == null) continue;
      out.push({ kind: 'cell', x: g.x0 + a * (g.x1 - g.x0), y, w: (b - a) * (g.x1 - g.x0), h });
    }
  }
  return out;
}
