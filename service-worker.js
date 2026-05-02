// Beynd Service Worker
// Financial coaching that guides you before every decision that matters.
// Cache version: beynd-v3 (removed skipWaiting from install — update banner now functional)

const CACHE_NAME = 'beynd-v3';

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install — precache core assets
self.addEventListener('install', function (event) {
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
    })
  );
});

// Fetch — cache-first for same-origin, network-first for CDN assets
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

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
