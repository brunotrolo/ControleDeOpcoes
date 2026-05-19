// Service Worker — Travas PUT PWA
const CACHE  = 'travas-put-v1';
const SHELL  = ['./index.html', './manifest.json', './icon-192.svg', './icon-512.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Requisições ao GAS WebApp → network-first, sem cache SW (dados dinâmicos)
  if (url.hostname.includes('script.google') || url.hostname.includes('googleusercontent')) {
    e.respondWith(fetch(e.request).catch(() => new Response(
      JSON.stringify({ rows: [], ts: null, error: 'offline' }),
      { headers: { 'Content-Type': 'application/json' } }
    )));
    return;
  }

  // App shell → cache-first
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && SHELL.some(s => e.request.url.includes(s.replace('./', '')))) {
        caches.open(CACHE).then(c => c.put(e.request, res.clone()));
      }
      return res;
    }))
  );
});
