// Beynd Service Worker
// Financial coaching that guides you before every decision that matters.
//
// CACHE_VERSION: increment on every release, then commit + push. Keep it equal to index.html BEYND_RUNTIME_VERSION:
// install only accepts an app shell that declares exactly this runtime version.
// CACHE_NAME is derived so old caches are deleted on activate and clients never mix versions.

const CACHE_VERSION = 'v1.0.79'; // P3-REL: Phase 3 living month (schema stays 3)
const CACHE_NAME = `beynd-cache-${CACHE_VERSION}`;
const CACHE_PREFIX = 'beynd-cache-';
const SHELL_URLS = ['/', '/index.html'];
const SHELL_MARKER = "\nvar BEYND_RUNTIME_VERSION = '" + CACHE_VERSION + "';";

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/js/geode-pure/01-foundation.js',
  '/js/geode-pure/02-plan-snapshots.js',
  '/js/geode-pure/03-suggested-snapshots.js',
  '/js/geode-pure/04-adaptive-snapshots.js',
  '/js/geode-pure/05-presentation-snapshots.js',
  '/coaching.json',
  '/service-worker.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

/** A complete app shell of this release: its runtime marker and the closing tag (a truncated or older page fails). */
function isCurrentShell(body) {
  return typeof body === 'string' && body.indexOf(SHELL_MARKER) >= 0 && /<\/html>\s*$/i.test(body);
}

// Install — fetch every asset past the HTTP cache, verify the shell, and only then fill this release's cache.
// Any failure rejects install before anything is cached, so the current worker and its cache stay as they were.
self.addEventListener('install', function (event) {
  event.waitUntil(
    Promise.all(PRECACHE_URLS.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' })).then(function (res) {
        if (!res || !res.ok) throw new Error('precache ' + url + ': ' + (res ? res.status : 'no response'));
        if (SHELL_URLS.indexOf(url) < 0) return [url, res];
        return res.clone().text().then(function (body) {
          if (!isCurrentShell(body)) throw new Error('precache ' + url + ': not the ' + CACHE_VERSION + ' app shell');
          return [url, res];
        });
      });
    })).then(function (entries) {
      return caches.open(CACHE_NAME).then(function (cache) {
        return Promise.all(entries.map(function (e) { return cache.put(e[0], e[1]); }));
      });
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/** Numeric [major, minor, patch] for a v1.2.3 token, or null when the token cannot be ordered. */
function runtimeVersionParts(v) {
  var m = /^v(\d+)\.(\d+)\.(\d+)$/.exec(String(v || ''));
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True only when a Beynd cache is demonstrably older than this release. Newer and unorderable caches stay. */
function cacheOlderThanThisRelease(key) {
  if (String(key || '').indexOf(CACHE_PREFIX) !== 0 || key === CACHE_NAME) return false;
  var mine = runtimeVersionParts(CACHE_VERSION);
  var theirs = runtimeVersionParts(String(key).slice(CACHE_PREFIX.length));
  if (!mine || !theirs) return false;
  for (var i = 0; i < 3; i++) {
    if (theirs[i] !== mine[i]) return theirs[i] < mine[i];
  }
  return false;
}

// Activate — remove Beynd caches older than this release, take control, then reload every open window onto this
// release's shell, so no page keeps running an older app after this one takes over. A newer Beynd cache, and a Beynd
// cache whose version cannot be ordered, are left in place. A cache that cannot be deleted is never read here
// (lookups use CACHE_NAME only), and the page's shell check keeps schema changes waiting until older copies are gone.
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(cacheOlderThanThisRelease).map(function (key) {
          return caches.delete(key).catch(function () { return false; });
        })
      );
    }).then(function () {
      return self.clients.claim();
    }).then(function () {
      return self.clients.matchAll({ type: 'window' });
    }).then(function (windows) {
      // Started, never awaited: each reload's request waits for this activation to finish, so waiting for the reloads
      // here would hold activation until the browser's event timeout.
      windows.forEach(function (client) {
        if (typeof client.navigate !== 'function') return;
        Promise.resolve().then(function () { return client.navigate(client.url); }).catch(function () { return null; });
      });
    })
  );
});

/** This release's cache only: an older Beynd cache must never answer for the app. */
function matchCurrent(req) {
  return caches.open(CACHE_NAME).then(function (cache) {
    return cache.match(req);
  });
}

// Fetch — HTML: network-first (fresh shell); only this release's shell is cached; offline → this release's verified index.
// Same-origin assets: cache-first from this release's cache with validated put. CDN: network-first (e.g. PDF.js).
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);
  var req = event.request;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req, { cache: 'no-store' }).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var check = response.clone();
          var keep = response.clone();
          check.text().then(function (body) {
            if (!isCurrentShell(body)) return;
            return caches.open(CACHE_NAME).then(function (cache) {
              return cache.put(req, keep);
            });
          }).catch(function () {});
        }
        return response;
      }).catch(function () {
        return matchCurrent('/index.html').then(function (res) {
          return res || Response.error();
        });
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) {
    event.respondWith(
      fetch(req).catch(function () {
        return matchCurrent(req).then(function (res) {
          return res || Response.error();
        });
      })
    );
    return;
  }

  event.respondWith(
    matchCurrent(req).then(function (res) {
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
