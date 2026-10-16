const C = 'ora-extra-v2';
const SHELL = ['/', '/icon.svg'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  const u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const isAsset = u.pathname.startsWith('/assets/');
  e.respondWith(
    fetch(r).then((res) => {
      const html = (res.headers.get('content-type') || '').includes('text/html');
      // nunca guarda erro nem HTML no lugar de um asset (chunk inexistente cai no index.html)
      if (res.ok && !(isAsset && html)) { const cp = res.clone(); caches.open(C).then((c) => c.put(r, cp)); }
      return res;
    }).catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('/') || caches.match('/index.html') : Response.error()))),
  );
});
