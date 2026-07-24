// Minimal service worker for AUA.
//
// Scope is deliberately narrow: cache the static app shell (HTML/CSS/JS/icons)
// so the app opens instantly and still renders if the network hiccups. API
// responses are NEVER cached — air quality data going stale would be worse
// than showing a loading state, so those requests always go to the network.

const CACHE = 'aua-shell-v1';

// Only same-origin static assets. Vite hashes its build output, so we cache
// opportunistically at runtime rather than hardcoding filenames here.
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Never cache API traffic or cross-origin requests (backend, map tiles,
  // fonts): air data must always be fresh, and third-party responses aren't
  // ours to store.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigations: network first, fall back to the cached shell when offline so
  // the app still opens instead of showing the browser's error page.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())));
    return;
  }

  // Static assets: serve from cache when present, otherwise fetch and store.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ??
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
