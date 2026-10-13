// Private storage behind a tiny interface (Vercel Blob in production, memory in the tests).
import { put, get, list, del } from '@vercel/blob';

export const blobStore = {
  ok: () => !!process.env.BLOB_READ_WRITE_TOKEN,
  async read(path) {
    const r = await get(path, { access: 'private', useCache: false });
    if (!r || r.statusCode !== 200) return null;
    return new Response(r.stream).text();
  },
  write: (path, text) => put(path, text, { access: 'private', allowOverwrite: true, addRandomSuffix: false, contentType: 'application/json' }),
  async list(prefix) {
    const out = []; let cursor;
    do { const r = await list({ prefix, cursor, limit: 1000 }); out.push(...r.blobs.map((b) => b.pathname)); cursor = r.hasMore ? r.cursor : undefined; } while (cursor);
    return out;
  },
  async del(paths) {
    if (!paths.length) return;
    const urls = [];
    for (const p of paths) { const { blobs } = await list({ prefix: p, limit: 1 }); if (blobs[0]?.pathname === p) urls.push(blobs[0].url); }
    if (urls.length) await del(urls);
  },
  // keeps only the images of the sheets in `keep` (sala/a/<sid>.sheet|strips)
  async prune(keep) {
    const names = await this.list('sala/a/');
    await this.del(names.filter((n) => !keep.has(n.slice('sala/a/'.length).split('.')[0])));
  },
};
let store = blobStore;
export const useStore = (s) => { store = s ?? blobStore; };
export const getStore = () => store;
