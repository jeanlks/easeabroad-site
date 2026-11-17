/**
 * EaseAbroad Web Service Worker
 * Provides offline caching for static assets, place photos, and places/insights API.
 */

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `ea-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `ea-images-${CACHE_VERSION}`;
const API_CACHE = `ea-api-${CACHE_VERSION}`;
const MAX_IMAGE_ENTRIES = 300;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (![STATIC_CACHE, IMAGE_CACHE, API_CACHE].includes(key)) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

async function trimCache(cacheName, maxItems) {
  try {
    const cache = await caches.open(cacheName);
    const keys = await cache.keys();
    if (keys.length > maxItems) {
      const deleteCount = keys.length - maxItems;
      for (let i = 0; i < deleteCount; i++) {
        await cache.delete(keys[i]);
      }
    }
  } catch (_) {}
}

function isImageRequest(request, url) {
  if (request.destination === 'image') return true;
  if (url.hostname.includes('wikimedia.org') || url.hostname.includes('wikipedia.org')) return true;
  return /\.(?:png|jpe?g|webp|svg|gif|ico)(?:\?.*)?$/i.test(url.pathname);
}

function isApiCacheable(request, url) {
  if (request.method !== 'GET') return false;
  if (!url.hostname.includes('easeabroad.app')) return false;
  return url.pathname.startsWith('/places/') || url.pathname.startsWith('/insights/');
}

function isHashedStatic(url) {
  return url.pathname.includes('/_expo/static/') || /\.[a-f0-9]{8,}\.(?:js|css)$/i.test(url.pathname);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch (_) {
    return;
  }

  // 1. Image Caching: Cache-First with Network Fallback
  if (isImageRequest(request, url)) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const response = await fetch(request);
          if (response && (response.status === 200 || response.type === 'opaque')) {
            cache.put(request, response.clone()).catch(() => {});
            trimCache(IMAGE_CACHE, MAX_IMAGE_ENTRIES).catch(() => {});
          }
          return response;
        } catch (err) {
          if (cached) return cached;
          throw err;
        }
      })
    );
    return;
  }

  // 2. Cacheable Places / Insights API: Stale-While-Revalidate
  if (isApiCacheable(request, url)) {
    event.respondWith(
      caches.open(API_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        }).catch(() => null);

        if (cached) {
          event.waitUntil(fetchPromise);
          return cached;
        }

        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;
        return new Response(JSON.stringify({ error: 'Network error and no offline cache available' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      })
    );
    return;
  }

  // 3. Immutable hashed static assets: Cache-First
  if (isHashedStatic(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response && response.status === 200) {
          cache.put(request, response.clone()).catch(() => {});
        }
        return response;
      })
    );
    return;
  }

  // 4. HTML Navigation: Network-First with Cache Fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          const fallback = await caches.match('/app/index.html');
          return fallback || Response.error();
        })
    );
    return;
  }
});
