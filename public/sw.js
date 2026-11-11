// On the first visit this downloads the whole game in the background: every character,
// every scenery model, code, styles and fonts. Later visits start from the browser, even offline.
// Files under assets/ carry a content hash in their name, so a cached copy never goes stale.
// After a deploy only the files that changed are downloaded; the old ones are deleted.
const CACHE = 'uma-way-surfer';
// Filled in at build time by the precache-list plugin in vite.config.ts.
const PRECACHE = self.__PRECACHE__;
const wanted = new Set(PRECACHE.map(path => new URL(path, self.registration.scope).href));

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const have = new Set((await cache.keys()).map(request => request.url));
    const missing = [...wanted].filter(url => !have.has(url) || url === self.registration.scope);
    // A few at a time, so a slow phone connection is not flooded.
    for (let i = 0; i < missing.length; i += 6) await cache.addAll(missing.slice(i, i + 6));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    const cache = await caches.open(CACHE);
    for (const request of await cache.keys()) {
      const isAsset = new URL(request.url).pathname.includes('/assets/');
      if (isAsset && !wanted.has(request.url) && !/\.woff2?$/.test(request.url)) await cache.delete(request);
    }
    await self.clients.claim();
  })());
});

// The page reports what it loaded before this worker took over (such as the font
// subsets its text happened to need), so those are kept for offline visits too.
self.addEventListener('message', event => {
  const urls = event.data?.loaded;
  if (!Array.isArray(urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const url of urls) {
      if (typeof url !== 'string' || new URL(url).origin !== self.location.origin || !url.includes('/assets/')) continue;
      if (!(await cache.match(url, { ignoreVary: true }))) await cache.add(url).catch(() => {});
    }
  })());
});

async function fromCacheFirst(request) {
  const cache = await caches.open(CACHE);
  // Match by address alone: module scripts send an Origin header that precached copies lack.
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

// The page is fetched fresh when online, so a new deploy shows up on the next visit.
async function fromNetworkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(self.registration.scope, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(self.registration.scope);
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
