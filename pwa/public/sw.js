// Doodlebug PWA Service Worker - Resilient Offline & Update Strategy
const CACHE_NAME = 'doodlebug-v4';
const MAX_CACHED_ASSETS = 35; // Cap cached assets so old hashed bundles do not accumulate indefinitely
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './favicon.svg'
];

async function trimCache(cacheName, maxItems, newRequestUrl) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();

    // Proactively evict superseded hashed Vite bundles (e.g. older /assets/index-[hash].js or .css)
    if (newRequestUrl && newRequestUrl.includes('/assets/index-')) {
      const isJs = newRequestUrl.endsWith('.js');
      const isCss = newRequestUrl.endsWith('.css');
      if (isJs || isCss) {
        const ext = isJs ? '.js' : '.css';
        const olderHashed = keys.filter((req) => {
          return req.url !== newRequestUrl && req.url.includes('/assets/index-') && req.url.endsWith(ext);
        });
        await Promise.all(olderHashed.map((req) => cache.delete(req)));
      }
    }

    const currentKeys = await cache.keys();
    if (currentKeys.length > maxItems) {
      const purgeable = currentKeys.filter((req) => {
        const path = new URL(req.url).pathname;
        return !PRECACHE_ASSETS.includes(path);
      });
      const toDelete = purgeable.slice(0, currentKeys.length - maxItems);
      await Promise.all(toDelete.map((req) => cache.delete(req)));
    }
  } catch (e) {
    // Ignore cache trim failures
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => trimCache(CACHE_NAME, MAX_CACHED_ASSETS))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Only handle http/https requests
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) {
    return;
  }

  let requestUrl;
  try {
    requestUrl = new URL(event.request.url);
  } catch {
    return;
  }

  // Let network handle non-GET, API, and health check endpoints directly without caching
  if (
    event.request.method !== 'GET' ||
    requestUrl.pathname.startsWith('/api/') ||
    requestUrl.pathname === '/health' ||
    requestUrl.pathname === '/api/health'
  ) {
    return;
  }

  // Navigation requests: Network-first to always get latest index.html after deploy
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html') || caches.match('/index.html')))
    );
    return;
  }

  // Only handle same-origin static assets; cross-origin requests (e.g. Worker /health, Firebase Storage, Google Fonts) bypass SW cache
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  // Static assets (hashed JS, CSS, images, fonts): Cache-first with runtime caching
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;
      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
              trimCache(CACHE_NAME, MAX_CACHED_ASSETS, event.request.url);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // If offline and uncached, return empty response or fail gracefully
          return new Response(null, { status: 504, statusText: 'Gateway Timeout (Offline)' });
        });
    })
  );
});
