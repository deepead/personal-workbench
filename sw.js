const CACHE_NAME = 'workbench-pwa-v1';
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS.concat(CDN_ASSETS)))
      .then(() => self.skipWaiting())
      .catch(err => { console.warn('[SW] install cache error', err); self.skipWaiting(); })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCdnChart = url.host === 'cdn.jsdelivr.net';

  // 1. same-origin pages: network first, fallback cache -> index.html
  if (isSameOrigin && url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === './') {
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => caches.match(event.request, { ignoreSearch: true })
          .then(r => r || caches.match('./index.html')))
    );
    return;
  }

  // 2. static assets / CDN: stale-while-revalidate
  if (isSameOrigin || isCdnChart) {
    event.respondWith(
      caches.match(event.request, { ignoreSearch: true }).then(cached => {
        const fetchAndCache = fetch(event.request)
          .then(resp => {
            if (resp.ok) {
              const clone = resp.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || fetchAndCache;
      })
    );
  }
});
