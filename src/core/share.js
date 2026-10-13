// Sharing a reading between PCs. The state that travels is light (no images); each sheet's images travel
// separately, once, under the sheet's own id (sid). Pure functions: the network part lives in main.js.
export const newSid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-6);

// pages as they are in the app → { lite, assets }: lite goes in the shared state, assets[sid] = { sheet, strips }
export function splitForShare(pages) {
  const lite = [], assets = {};
  for (const p of pages) {
    if (!p.sid || (p.status !== 'ok' && p.status !== 'erro')) continue;
    const strips = { prod: {}, stops: {} };
    const slim = (rows, key) => rows.map((r) => { const { strip, ...rest } = r; if (strip) strips[key][r.linha] = strip; return rest; });
    const { sheet, prod, stops, ...rest } = p;
    lite.push({ ...rest, prod: slim(prod, 'prod'), stops: slim(stops, 'stops') });
    assets[p.sid] = { sheet: sheet ?? null, strips };
  }
  return { lite, assets };
}

// the shared state → pages for this PC, keeping the images already held locally (cache[sid] = { sheet, strips })
export function mergeRemote(remotePages, cache = {}) {
  return remotePages.map((rp) => {
    const c = cache[rp.sid];
    const fat = (rows, key) => rows.map((r) => (c?.strips?.[key]?.[r.linha] ? { ...r, strip: c.strips[key][r.linha] } : r));
    return { ...rp, sheet: c?.sheet ?? null, prod: fat(rp.prod ?? [], 'prod'), stops: fat(rp.stops ?? [], 'stops') };
  });
}

// which sids still need their images fetched
export const missingAssets = (pages) => pages.filter((p) => p.sid && !p.sheet).map((p) => p.sid);
