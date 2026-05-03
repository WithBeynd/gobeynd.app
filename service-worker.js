// Beynd Service Worker
// Financial coaching that guides you before every decision that matters.
//
// CACHE_NAME: bump manually on each deploy (e.g. beynd-v4 → beynd-v5). New name
// triggers precache refresh and old-cache cleanup so clients pick up the new shell.

// Increment this string on every production deploy so updates roll out reliably.
const CACHE_NAME = 'beynd-v4';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install — precache core assets
self.addEventListener('install', function (event) {
  console.log('[SW] Installing new version:', CACHE_NAME);
  self.skipWaiting(); // activate new service worker immediately

  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// Activate — delete old caches (including geode-v1)
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames
          .filter(function (name) { return name !== CACHE_NAME; })
          .map(function (name) { return caches.delete(name); })
      );
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      console.log('[SW] Activated:', CACHE_NAME);
    })
  );
});

// Fetch — HTML navigations network-first; cache-first for same-origin assets; network-first for CDN
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  // HTML: network-first so navigations get the latest app shell; offline → cached index
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function (response) {
        return response;
      }).catch(function () {
        return caches.match('/index.html');
      })
    );
    return;
  }

  // Network-first for CDN resources (PDF.js etc.)
  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match(event.request);
      })
    );
    return;
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        // Only cache valid same-origin responses
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        var toCache = response.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, toCache);
        });
        return response;
      });
    })
  );
});

// Message — support skipWaiting from app UI (update prompts)
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
