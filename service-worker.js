// Beynd Service Worker
// Financial coaching that guides you before every decision that matters.
//
// CACHE_VERSION: increment on every release, then commit + push.
// CACHE_NAME is derived so old caches are deleted on activate and clients never mix versions.

const CACHE_VERSION = 'v1.0.44'; // update this on every release
const CACHE_NAME = `beynd-cache-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/service-worker.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Install — precache core assets; new worker can take over when client sends SKIP_WAITING
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(PRECACHE_URLS);
    })
  );
});

// Activate — remove every cache that is not this release’s name
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.map(function (key) {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// Fetch — HTML: network-first (fresh shell), then update cache; offline → cached index
// Same-origin assets: cache-first with validated put. CDN: network-first (e.g. PDF.js).
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  var req = event.request;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(req, clone);
          });
        }
        return response;
      }).catch(function () {
        return caches.match('/index.html');
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(function () {
        return caches.match(req);
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (res) {
      if (res) return res;
      return fetch(req).then(function (fetchRes) {
        if (!fetchRes || fetchRes.status !== 200 || fetchRes.type !== 'basic') {
          return fetchRes;
        }
        var clone = fetchRes.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(req, clone);
        });
        return fetchRes;
      });
    })
  );
});

// Message — user-controlled update: app may send string or { type: 'SKIP_WAITING' }
self.addEventListener('message', function (event) {
  var data = event.data;
  if (data === 'SKIP_WAITING' || (data && data.type === 'SKIP_WAITING')) {
    self.skipWaiting();
  }
});
