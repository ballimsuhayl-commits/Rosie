const CACHE_NAME = 'rosie-v5-baseline';
const urlsToCache = ['/', '/index.html', '/static/js/bundle.js'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(urlsToCache)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => {
    return Promise.all(ks.map((k) => { if (k !== CACHE_NAME) return caches.delete(k); }));
  }));
});

self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
