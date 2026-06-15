// ─── GPA Calculator Service Worker ───────────────────────────────────────────
// Caches every request so the app works 100% offline.
// On install   → pre-cache core shell assets
// On fetch     → cache-first for same-origin, network-first for CDN fonts/icons
// On activate  → purge stale caches

const CACHE_NAME = 'gpa-calc-v1';

// Assets that must be available before the app "feels" usable
const PRECACHE_URLS = [
  './index.html',
  './manifest.json'
  // sw.js itself is managed by the browser
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  // Activate immediately without waiting for old tabs to close
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  // Take control of all open clients without a page reload
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For CDN resources (Google Fonts, Remix Icons, jsdelivr) use
  // Stale-While-Revalidate: serve cached, update in background
  const isCDN =
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('jsdelivr.net') ||
    url.hostname.includes('fonts.gstatic.com');

  if (isCDN) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // For everything else (app shell, etc.) use Cache-First
  event.respondWith(cacheFirst(event.request));
});

// ── Strategies ────────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached – return a simple offline fallback for HTML
    if (request.headers.get('accept')?.includes('text/html')) {
      const cached = await caches.match('./index.html');
      return cached || new Response('Offline – please reload once connected.', {
        headers: { 'Content-Type': 'text/html' }
      });
    }
    return new Response('', { status: 408 });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const networkFetch = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null);

  return cached || await networkFetch;
}
