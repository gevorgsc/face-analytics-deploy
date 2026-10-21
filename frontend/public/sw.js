// Face Analytics Pro - Service Worker
// Caches static assets for offline-capable shell; API requests always go to network.

const CACHE = 'fap-v2';

self.addEventListener('install', e => {
  e.waitUntil(self.skipWaiting());
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

  // Dynamic resources must never be served from the application cache.
  if (url.pathname.startsWith('/api/') ||
      url.pathname.startsWith('/ws') ||
      url.pathname.startsWith('/media/')) {
    return;
  }

  // HTML must be network-first so deployments cannot get stuck on an old bundle.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(response => {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put('/index.html', clone));
        return response;
      }).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache immutable/static assets after their first successful network response.
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(resp => {
      if (resp.ok && e.request.method === 'GET') {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }))
  );
});
