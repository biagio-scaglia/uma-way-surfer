// Keeps the game in the browser after the first visit, so the next ones start at once.
// Files under assets/ have a content hash in their name and never change: they are served
// from the cache. The page itself is fetched fresh when possible, so a new deploy shows up.
const CACHE = 'uma-way-surfer-v1';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

/** A new build replaces index-<hash>.js/.css: drop the old copies so the cache does not grow. */
async function dropOldBuilds(cache, url) {
  const match = url.pathname.match(/\/(index)-[\w-]+\.(js|css)$/);
  if (!match) return;
  for (const request of await cache.keys()) {
    const old = new URL(request.url);
    if (old.pathname !== url.pathname && old.pathname.match(/\/index-[\w-]+\.(js|css)$/)?.[1] === match[2]) {
      await cache.delete(request);
    }
  }
}

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await dropOldBuilds(cache, new URL(request.url));
  }
  return response;
}

async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
}

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/assets/')) event.respondWith(fromCacheFirst(request));
  else if (request.mode === 'navigate') event.respondWith(fromNetworkFirst(request));
});
