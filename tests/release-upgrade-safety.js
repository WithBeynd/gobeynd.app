#!/usr/bin/env node
'use strict';
/**
 * Beynd release upgrade safety — dependency-free: node tests/release-upgrade-safety.js
 *
 * Runs the real service-worker.js and the page's shell-readiness functions from index.html in Node vm contexts against
 * fake caches, network, clients and DOM, and checks what a schema-2 release needs before it may reach users:
 *   - the worker only installs an app shell that declares its own runtime version, fetched past the HTTP cache;
 *   - a failed install leaves the previous worker's cache untouched and can be retried;
 *   - activation deletes older Beynd caches, then claims and reloads every open window, once;
 *   - every cache lookup reads this release's cache only, so an older cached app can never answer;
 *   - the page records geode_shell only after older Beynd caches are gone, which is what lets the schema 1 → 2
 *     transition start (the financial behaviour of that gate is in tests/cross-month-financial-truth.js, FA-3 RELEASE);
 *   - the stale-runtime gate speaks plainly and offers one Reload.
 * Exit code 0 when every check passes, 1 otherwise.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const INDEX = read('index.html');
const SW = read('service-worker.js');
const ORIGIN = 'https://gobeynd.app';
const PREVIOUS = 'v1.0.75';
const RELEASE_GATE = "else if (geodeShellReadiness() !== 'pending') geodeSchema2Transition();";

// ───────────────────────────── page source ─────────────────────────────

function extractFunction(name) {
  const at = INDEX.indexOf('\nfunction ' + name + '(');
  if (at < 0 || INDEX.indexOf('\nfunction ' + name + '(', at + 1) >= 0) throw new Error('index.html must declare ' + name + ' exactly once');
  return INDEX.slice(at + 1, INDEX.indexOf('\n}\n', at) + 2);
}
function extractConstant(name) {
  const m = INDEX.match(new RegExp('\\nvar ' + name + ' = [^\\n]*;\\n'));
  if (!m) throw new Error('index.html has no top-level var ' + name);
  return m[0].trim();
}
const RUNTIME = (INDEX.match(/\nvar BEYND_RUNTIME_VERSION = '([^']+)';\n/) || [])[1];
const SCHEMA = (INDEX.match(/\nvar GEODE_SCHEMA_VERSION = (\d+);/) || [])[1];

// ───────────────────────────── fakes ─────────────────────────────

const log = [];
const tick = () => new Promise(r => setImmediate(r));
const keyOf = x => new URL(typeof x === 'string' ? x : x.url, ORIGIN).href;
const pathOf = x => { const u = new URL(typeof x === 'string' ? x : x.url, ORIGIN); return u.origin === ORIGIN ? u.pathname + u.search : u.href; };

class FakeRequest {
  constructor(input, init) {
    init = init || {};
    this.url = keyOf(input);
    this.cache = init.cache || (typeof input === 'object' && input.cache) || 'default';
    this.mode = init.mode || (typeof input === 'object' && input.mode) || 'cors';
  }
}
class FakeResponse {
  constructor(body, init) {
    init = init || {};
    this.body = body == null ? '' : String(body);
    this.status = init.status === undefined ? 200 : init.status;
    this.ok = this.status >= 200 && this.status < 300;
    this.type = init.type || 'basic';
    this.used = false;
  }
  clone() {
    if (this.used) throw new TypeError('body already used');
    return new FakeResponse(this.body, { status: this.status, type: this.type });
  }
  text() {
    if (this.used) return Promise.reject(new TypeError('body already used'));
    this.used = true;
    return Promise.resolve(this.body);
  }
  static error() { return new FakeResponse('', { status: 0, type: 'error' }); }
}

class FakeCache {
  constructor(name) { this.name = name; this.entries = new Map(); }
  match(req) { log.push('cache.match:' + this.name + ':' + pathOf(req)); const r = this.entries.get(keyOf(req)); return Promise.resolve(r ? r.clone() : undefined); }
  put(req, res) {
    if (res.used) return Promise.reject(new TypeError('body already used'));
    log.push('put:' + this.name + ':' + pathOf(req));
    this.entries.set(keyOf(req), res);
    return Promise.resolve();
  }
  paths() { return [...this.entries.keys()].map(pathOf).sort(); }
  body(p) { const r = this.entries.get(keyOf(p)); return r ? r.body : null; }
}

/** CacheStorage. fail: { delete: Set(names that reject), keys: 'reject' | 'throw' }. */
class FakeCaches {
  constructor(fail) { this.map = new Map(); this.fail = fail || {}; this.globalMatches = 0; }
  seed(name, files) { const c = new FakeCache(name); Object.keys(files).forEach(p => c.entries.set(keyOf(p), new FakeResponse(files[p]))); this.map.set(name, c); return c; }
  open(name) { if (!this.map.has(name)) { log.push('caches.create:' + name); this.map.set(name, new FakeCache(name)); } return Promise.resolve(this.map.get(name)); }
  has(name) { return Promise.resolve(this.map.has(name)); }
  keys() {
    if (this.fail.keys === 'throw') throw new Error('SecurityError');
    if (this.fail.keys === 'reject') return Promise.reject(new Error('SecurityError'));
    return Promise.resolve([...this.map.keys()]);
  }
  delete(name) {
    log.push('delete:' + name);
    return tick().then(() => {
      if (this.fail.delete && this.fail.delete.has(name)) { log.push('delete-failed:' + name); throw new Error('cannot delete ' + name); }
      const had = this.map.delete(name);
      log.push('deleted:' + name);
      return had;
    });
  }
  /** A global lookup across every cache — what the worker must never use. */
  match(req) {
    this.globalMatches++;
    log.push('caches.match:' + pathOf(req));
    for (const c of this.map.values()) { const r = c.entries.get(keyOf(req)); if (r) return Promise.resolve(r.clone()); }
    return Promise.resolve(undefined);
  }
  names() { return [...this.map.keys()].sort(); }
}

/**
 * Network: files maps a same-origin path (or a full URL) to a body, or to { status, body }; a query string is ignored
 * when only the bare path is listed (as static hosting does). offline rejects everything; fail: paths that reject.
 */
function fakeNetwork(files, opts) {
  opts = opts || {};
  const net = { files, offline: !!opts.offline, fail: new Set(opts.fail || []), requests: [] };
  net.fetch = (input, init) => {
    const req = input instanceof FakeRequest ? input : new FakeRequest(input);
    const cache = (init && init.cache) || req.cache;
    const p = pathOf(req);
    net.requests.push(p + ' ' + cache);
    log.push('fetch:' + p);
    if (net.offline || net.fail.has(p)) return Promise.reject(new TypeError('Failed to fetch'));
    const f = files[p] !== undefined ? files[p] : files[p.split('?')[0]];
    if (f === undefined) return Promise.resolve(new FakeResponse('Not found', { status: 404 }));
    const spec = typeof f === 'object' ? f : { body: f };
    return Promise.resolve(new FakeResponse(spec.body, { status: spec.status === undefined ? 200 : spec.status, type: p.indexOf('http') === 0 ? 'cors' : 'basic' }));
  };
  return net;
}

/** The release's own files as the network serves them after deployment ('/' is index.html). */
function releaseFiles(overrides) {
  const files = {};
  PRECACHE().forEach(u => { files[u] = read(u === '/' ? 'index.html' : u.slice(1)); });
  return Object.assign(files, overrides || {});
}
const OLD_SHELL = INDEX.replace("\nvar BEYND_RUNTIME_VERSION = '" + RUNTIME + "';", "\nvar BEYND_RUNTIME_VERSION = '" + PREVIOUS + "';");
const OLD_FILES = { '/': OLD_SHELL, '/index.html': OLD_SHELL, '/js/geode-pure/01-foundation.js': '/* old foundation */' };

// ───────────────────────────── worker ─────────────────────────────

/** A fresh worker running service-worker.js; windows: the open pages it can claim ({ url, navigate? }). */
function loadWorker(env) {
  const listeners = {};
  const sandbox = {
    console: { log() {}, info() {}, warn() {}, error() {} },
    URL, Request: FakeRequest, Response: FakeResponse,
    caches: env.caches, fetch: env.net.fetch,
    location: { origin: ORIGIN },
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    skipWaiting() { log.push('skipWaiting'); return Promise.resolve(); },
    clients: {
      claim() { log.push('claim'); return Promise.resolve(); },
      matchAll(o) { log.push('matchAll:' + (o && o.type)); return Promise.resolve(env.windows || []); }
    }
  };
  sandbox.self = sandbox;
  const ctx = vm.createContext(sandbox);
  new vm.Script(SW, { filename: 'service-worker.js' }).runInContext(ctx);
  const lifecycle = type => {
    let done = Promise.resolve();
    const event = { waitUntil(p) { done = Promise.resolve(p); } };
    listeners[type].forEach(fn => fn(event));
    return done.then(() => 'resolved', e => 'rejected: ' + (e && e.message));
  };
  return {
    ctx,
    value: expr => vm.runInContext(expr, ctx),
    install: () => lifecycle('install'),
    activate: () => lifecycle('activate'),
    /** A fetch event; returns what the worker answered: the body, 'network error' or 'no response'. */
    fetch(url, mode) {
      let answer;
      const event = { request: new FakeRequest(url, { mode: mode || 'no-cors' }), respondWith(p) { answer = Promise.resolve(p); } };
      listeners.fetch.forEach(fn => fn(event));
      if (!answer) return Promise.resolve('not handled');
      return answer.then(r => (!r ? 'no response' : r.type === 'error' ? 'network error' : r.body), e => 'rejected: ' + e.message);
    }
  };
}
const PRECACHE = () => loadWorker({ caches: new FakeCaches(), net: fakeNetwork({}) }).value('PRECACHE_URLS.slice()');
const CURRENT_CACHE = 'beynd-cache-' + RUNTIME;
const settle = async () => { for (let i = 0; i < 5; i++) await tick(); };

// ───────────────────────────── page ─────────────────────────────

function fakeStorage(init) {
  const m = Object.assign({}, init || {});
  return {
    m, throwOnGet: false,
    getItem(k) { if (this.throwOnGet) throw new Error('SecurityError'); return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) { log.push('setItem:' + k + '=' + v); m[k] = String(v); },
    removeItem(k) { delete m[k]; }
  };
}

/** The page's release-safety functions from index.html; caches: a FakeCaches, or undefined for a browser without the Cache API. */
function loadPage(caches, storage) {
  const sandbox = { console: { log() {}, info() {}, warn() {}, error() {} }, localStorage: storage };
  if (caches) sandbox.caches = caches;
  const ctx = vm.createContext(sandbox);
  const code = ['BEYND_RUNTIME_VERSION', 'GEODE_SHELL_KEY', 'GEODE_CACHE_PREFIX'].map(extractConstant).join('\n') + '\n' +
    ['geodeShellReadiness', 'geodeShellCleanup'].map(extractFunction).join('\n');
  new vm.Script(code, { filename: 'index-release-safety.js' }).runInContext(ctx);
  return { readiness: () => vm.runInContext('geodeShellReadiness()', ctx), cleanup: () => Promise.resolve(vm.runInContext('geodeShellCleanup()', ctx)) };
}

/** A minimal DOM for geodeShowStaleRuntimeGate. */
function loadGate(withBody) {
  const reloads = [];
  const make = tag => ({
    tag, children: [], attrs: {}, listeners: {}, id: '', className: '', textContent: '', type: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); },
    appendChild(c) { this.children.push(c); return c; }
  });
  const body = make('body');
  const find = (node, id) => node.id === id ? node : node.children.reduce((f, c) => f || find(c, id), null);
  const document = { body: withBody === false ? null : body, createElement: make, getElementById: id => find(body, id) };
  const ctx = vm.createContext({ document, location: { reload() { reloads.push(1); } }, console: { log() {}, warn() {}, error() {} } });
  new vm.Script(extractFunction('geodeShowStaleRuntimeGate'), { filename: 'index-gate.js' }).runInContext(ctx);
  return { body, reloads, show: reason => vm.runInContext('geodeShowStaleRuntimeGate(' + JSON.stringify(reason) + ')', ctx) };
}

// ───────────────────────────── results ─────────────────────────────

const results = [];
let group = '';
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function check(id, text, actual, expected) {
  results.push({ group, id, text, ok: same(actual, expected), detail: same(actual, expected) ? '' : 'expected ' + JSON.stringify(expected) + ', observed ' + JSON.stringify(actual) });
}
const before = (list, a, b) => { const i = list.indexOf(a), j = list.indexOf(b); return i >= 0 && j >= 0 && i < j; };
const lastIndex = (list, pred) => { let n = -1; list.forEach((x, i) => { if (pred(x)) n = i; }); return n; };
const firstIndex = (list, pred) => list.findIndex(pred);

// ───────────────────────────── checks ─────────────────────────────

async function versions() {
  group = 'VERSIONS — page runtime and worker cache move together';
  const worker = loadWorker({ caches: new FakeCaches(), net: fakeNetwork({}) });
  const cacheVersion = worker.value('CACHE_VERSION');
  check('ver.values', 'index.html BEYND_RUNTIME_VERSION and service-worker.js CACHE_VERSION are v1.0.76', [RUNTIME, cacheVersion], ['v1.0.76', 'v1.0.76']);
  check('ver.lockstep', 'They match, so the worker accepts exactly this page and names its cache after it', [RUNTIME === cacheVersion, worker.value('CACHE_NAME')], [true, 'beynd-cache-' + RUNTIME]);
  check('ver.bumped', 'Both differ from the deployed v1.0.75, so every browser installs this release', [RUNTIME !== PREVIOUS, cacheVersion !== PREVIOUS], [true, true]);
  check('ver.schema', 'The financial schema stays 2', SCHEMA, '2');
  check('ver.settings', 'Settings shows "Runtime " + BEYND_RUNTIME_VERSION through the existing display',
    INDEX.indexOf("Runtime ' +\n    escHtmlLite(typeof BEYND_RUNTIME_VERSION !== 'undefined' ? BEYND_RUNTIME_VERSION : 'unknown')") >= 0, true);
  const pure = fs.readdirSync(path.join(ROOT, 'js', 'geode-pure')).filter(f => /\.js$/.test(f)).sort().map(f => '/js/geode-pure/' + f);
  const urls = PRECACHE();
  check('ver.precache.pure', 'Precache covers every js/geode-pure file', pure.filter(u => urls.indexOf(u) < 0), []);
  check('ver.precache.exists', 'Every precached URL exists in the repository', urls.filter(u => !fs.existsSync(path.join(ROOT, u === '/' ? 'index.html' : u.slice(1)))), []);
  check('ver.no-global-match', 'service-worker.js never calls the global caches.match()', /caches\s*\.\s*match\s*\(/.test(SW), false);
}

async function install() {
  group = 'INSTALL — only this release\'s verified shell is accepted';
  log.length = 0;
  const caches = new FakeCaches();
  caches.seed('beynd-cache-' + PREVIOUS, OLD_FILES);
  const net = fakeNetwork(releaseFiles());
  const ok = await loadWorker({ caches, net }).install();
  const urls = PRECACHE();
  check('inst.ok', 'Correct shell: install resolves and this release\'s cache holds every precached URL', [ok, caches.map.get(CURRENT_CACHE).paths()], ['resolved', urls.slice().sort()]);
  check('inst.reload', 'Every precache request bypasses the HTTP cache (cache: reload)', net.requests, urls.map(u => u + ' reload'));
  check('inst.shell-copy', 'The cached shell is the fetched v1.0.76 page, byte for byte', caches.map.get(CURRENT_CACHE).body('/index.html') === INDEX, true);
  const skip = log.indexOf('skipWaiting');
  check('inst.skipWaiting', 'skipWaiting runs once, after every asset is stored', [log.filter(x => x === 'skipWaiting').length, skip > lastIndex(log, x => x.indexOf('put:') === 0)], [1, true]);
  check('inst.no-early-put', 'Nothing is stored before every fetch has been verified', firstIndex(log, x => x.indexOf('put:') === 0) > lastIndex(log, x => x.indexOf('fetch:') === 0), true);
  check('inst.old-kept', 'Install itself leaves the previous cache alone (activation removes it)', caches.names(), ['beynd-cache-' + PREVIOUS, CURRENT_CACHE]);

  const refused = async (label, overrides, opts) => {
    log.length = 0;
    const c = new FakeCaches();
    c.seed('beynd-cache-' + PREVIOUS, OLD_FILES);
    const outcome = await loadWorker({ caches: c, net: fakeNetwork(releaseFiles(overrides), opts) }).install();
    return [label, outcome.indexOf('rejected') === 0, c.names(), c.map.get('beynd-cache-' + PREVIOUS).body('/index.html') === OLD_SHELL, log.indexOf('skipWaiting') >= 0, log.some(x => x.indexOf('put:') === 0)];
  };
  const kept = label => [label, true, ['beynd-cache-' + PREVIOUS], true, false, false];
  const truncated = INDEX.slice(0, Math.floor(INDEX.length / 2));
  check('inst.old-shell', 'An older shell (v1.0.75 marker) at /index.html or at / is rejected even with HTTP 200: install fails, no new cache, the previous cache intact, no skipWaiting',
    [await refused('old /index.html', { '/index.html': OLD_SHELL }), await refused('old /', { '/': OLD_SHELL })], [kept('old /index.html'), kept('old /')]);
  check('inst.malformed', 'Malformed shells are rejected: truncated mid-file, a 200 maintenance page, an empty body, the marker only inside a comment of a truncated page',
    [await refused('truncated', { '/index.html': truncated }), await refused('maintenance', { '/index.html': '<!doctype html><html><body>Back soon</body></html>' }),
      await refused('empty', { '/': '' }), await refused('marker in truncated', { '/index.html': "<html><!--\nvar BEYND_RUNTIME_VERSION = '" + RUNTIME + "';-->" })],
    [kept('truncated'), kept('maintenance'), kept('empty'), kept('marker in truncated')]);
  check('inst.network', 'Network failure or an HTTP error on any asset fails install the same way: offline, one failed asset, a 404 shell, a 500 asset',
    [await refused('offline', {}, { offline: true }), await refused('coaching fails', {}, { fail: ['/coaching.json'] }),
      await refused('404 shell', { '/index.html': { status: 404, body: INDEX } }), await refused('500 asset', { '/js/geode-pure/03-suggested-snapshots.js': { status: 500, body: '' } })],
    [kept('offline'), kept('coaching fails'), kept('404 shell'), kept('500 asset')]);
}

async function installFailure() {
  group = 'INSTALL FAILURE — the previous app stays, schema 2 waits, the next attempt retries';
  log.length = 0;
  const caches = new FakeCaches();
  caches.seed('beynd-cache-' + PREVIOUS, OLD_FILES);
  const storage = fakeStorage({ geode_v6: '{"income":3000}' });
  const page = loadPage(caches, storage);
  const failed = await loadWorker({ caches, net: fakeNetwork(releaseFiles({ '/index.html': OLD_SHELL, '/': OLD_SHELL })) }).install();
  const load = extractFunction('load');
  check('fail.held', 'CDN still serving the old page: install fails; the previous cache stays; shell readiness is pending, so load() takes no transition branch; the financial key is untouched',
    [failed.indexOf('rejected') === 0, caches.names(), page.readiness(), load.indexOf('if (!_geodeRuntimeStale) {') >= 0 && load.indexOf(RELEASE_GATE) > load.indexOf('if (!_geodeRuntimeStale) {'), storage.m.geode_v6],
    [true, ['beynd-cache-' + PREVIOUS], 'pending', true, '{"income":3000}']);
  const retried = await loadWorker({ caches, net: fakeNetwork(releaseFiles()), windows: [] }).install();
  const worker = loadWorker({ caches, net: fakeNetwork(releaseFiles()), windows: [] });
  const activated = await worker.activate();
  await page.cleanup();
  check('fail.retry', 'Once the network serves v1.0.76, the next install succeeds, activation removes the previous cache and the page then records shell readiness',
    [retried, activated, caches.names(), page.readiness(), storage.m.geode_shell, storage.m.geode_v6], ['resolved', 'resolved', [CURRENT_CACHE], 'ready', RUNTIME, '{"income":3000}']);
}

async function activate() {
  group = 'ACTIVATE — older Beynd caches go, then the worker claims and reloads every window once';
  log.length = 0;
  const caches = new FakeCaches();
  caches.seed('beynd-cache-' + PREVIOUS, OLD_FILES);
  caches.seed('beynd-cache-v1.0.70', OLD_FILES);
  caches.seed(CURRENT_CACHE, { '/index.html': INDEX });
  caches.seed('pdfjs-cache', { 'https://cdn.example/pdf.js': 'pdf' });
  caches.seed('other-app', { '/x': 'x' });
  const navigated = [];
  const win = url => ({ url: ORIGIN + url, navigate(u) { log.push('navigate:' + pathOf(u)); navigated.push(pathOf(u)); return Promise.resolve(this); } });
  const windows = [win('/'), win('/?tab=plan')];
  const outcome = await loadWorker({ caches, net: fakeNetwork({}), windows }).activate();
  check('act.cleanup', 'Activation resolves; both older Beynd caches are deleted; this release\'s cache and non-Beynd caches remain',
    [outcome, caches.names()], ['resolved', [CURRENT_CACHE, 'other-app', 'pdfjs-cache']]);
  const claim = log.indexOf('claim');
  check('act.order', 'Every deletion has finished before clients.claim(); claim before matchAll({ type: window }); matchAll before any navigation',
    [claim > log.indexOf('deleted:beynd-cache-' + PREVIOUS) && claim > log.indexOf('deleted:beynd-cache-v1.0.70'), before(log, 'claim', 'matchAll:window'),
      log.indexOf('matchAll:window') < firstIndex(log, x => x.indexOf('navigate:') === 0)], [true, true, true]);
  check('act.navigate', 'Each open window is reloaded once, onto its own URL', navigated, ['/', '/?tab=plan']);
  check('act.no-loop', 'A reloaded page re-registers the same worker: nothing new installs or activates, so no second reload; the page reloads on controllerchange only after a banner tap',
    [navigated.length, (INDEX.match(/addEventListener\('controllerchange'[\s\S]*?\n {2}\}\);/) || [''])[0].indexOf('if (!_geodeReloadAfterSkip) return;') >= 0], [2, true]);

  log.length = 0;
  const stubborn = new FakeCaches({ delete: new Set(['beynd-cache-' + PREVIOUS]) });
  stubborn.seed('beynd-cache-' + PREVIOUS, OLD_FILES);
  stubborn.seed(CURRENT_CACHE, { '/index.html': INDEX });
  const odd = [{ url: ORIGIN + '/' }, { url: ORIGIN + '/a', navigate() { log.push('navigate:/a'); return Promise.reject(new Error('navigation blocked')); } }, win('/b')];
  navigated.length = 0;
  const worker = loadWorker({ caches: stubborn, net: fakeNetwork({}, { offline: true }), windows: odd });
  const stubbornOutcome = await worker.activate();
  check('act.tolerant', 'A cache that cannot be deleted, a window without navigate() and a rejected navigation do not stop activation: claim and the other reloads still happen',
    [stubbornOutcome, stubborn.names(), log.indexOf('claim') >= 0, log.filter(x => x.indexOf('navigate:') === 0)], ['resolved', ['beynd-cache-' + PREVIOUS, CURRENT_CACHE], true, ['navigate:/a', 'navigate:/b']]);
  check('act.undeleted-unread', 'That undeletable older cache never answers: offline, /index.html comes from this release\'s cache',
    [await worker.fetch('/', 'navigate') === INDEX, await worker.fetch('/index.html') === INDEX, stubborn.globalMatches], [true, true, 0]);
}

async function lookups() {
  group = 'LOOKUPS — this release\'s cache only';
  const setup = (current, opts) => {
    log.length = 0;
    const caches = new FakeCaches();
    caches.seed('beynd-cache-' + PREVIOUS, Object.assign({ 'https://cdn.example/lib.js': 'old lib' }, OLD_FILES));
    caches.seed(CURRENT_CACHE, current);
    const net = fakeNetwork(releaseFiles({ 'https://cdn.example/lib.js': 'new lib', '/fresh.png': 'png' }), opts);
    return { caches, net, worker: loadWorker({ caches, net }) };
  };
  let s = setup({ '/index.html': INDEX }, { offline: true });
  check('look.offline-nav', 'Offline navigation answers with this release\'s /index.html, never the older cache\'s',
    [await s.worker.fetch('/', 'navigate') === INDEX, s.caches.globalMatches, log.filter(x => x.indexOf('cache.match:') === 0)], [true, 0, ['cache.match:' + CURRENT_CACHE + ':/index.html']]);
  s = setup({}, { offline: true });
  check('look.offline-missing', 'Offline with no shell in this release\'s cache: a network error, not the older cached app', [await s.worker.fetch('/', 'navigate'), s.caches.globalMatches], ['network error', 0]);
  s = setup({ '/js/geode-pure/01-foundation.js': 'current foundation' });
  check('look.asset-current', 'A same-origin asset in this release\'s cache is served from it without the network',
    [await s.worker.fetch('/js/geode-pure/01-foundation.js'), s.net.requests], ['current foundation', []]);
  s = setup({});
  const asset = await s.worker.fetch('/js/geode-pure/01-foundation.js');
  await settle();
  check('look.asset-old-ignored', 'A same-origin asset only the older cache holds is fetched from the network and stored in this release\'s cache',
    [asset === read('js/geode-pure/01-foundation.js'), s.net.requests, s.caches.map.get(CURRENT_CACHE).paths(), s.caches.globalMatches],
    [true, ['/js/geode-pure/01-foundation.js default'], ['/js/geode-pure/01-foundation.js'], 0]);
  s = setup({}, { offline: true });
  check('look.cross-origin', 'Offline cross-origin requests read this release\'s cache only (the older cache\'s copy is not used)',
    [await s.worker.fetch('https://cdn.example/lib.js'), s.caches.globalMatches], ['network error', 0]);
}

async function navigation() {
  group = 'NAVIGATION — network first; only this release\'s shell is kept for offline';
  const nav = async (served, url) => {
    log.length = 0;
    const caches = new FakeCaches();
    caches.seed(CURRENT_CACHE, { '/index.html': INDEX });
    const net = fakeNetwork(Object.assign(releaseFiles(), served));
    const worker = loadWorker({ caches, net });
    const answer = await worker.fetch(url, 'navigate');
    await settle();
    return [answer === INDEX ? 'v1.0.76 page' : answer === OLD_SHELL ? 'old page' : answer, net.requests, caches.map.get(CURRENT_CACHE).paths()];
  };
  check('nav.network-first', 'Online, a navigation is answered from the network (no-store) and the verified page is stored under its URL',
    await nav({}, '/?source=pwa'), ['v1.0.76 page', ['/?source=pwa no-store'], ['/?source=pwa', '/index.html']]);
  const stale = await nav({ '/index.html': OLD_SHELL }, '/index.html');
  check('nav.stale-not-cached', 'A stale CDN copy of the older page is shown as served but never replaces this release\'s cached /index.html',
    [stale[0], stale[2], await (async () => { const c = new FakeCaches(); c.seed(CURRENT_CACHE, { '/index.html': INDEX }); const w = loadWorker({ caches: c, net: fakeNetwork({ '/index.html': OLD_SHELL }) });
      await w.fetch('/index.html', 'navigate'); await settle(); return c.map.get(CURRENT_CACHE).body('/index.html') === INDEX; })()], ['old page', ['/index.html'], true]);
  check('nav.error-page', 'A 200 page that is not the app shell (e.g. a hosting error page) is not cached', (await nav({ '/missing': 'Site not found' }, '/missing'))[2], ['/index.html']);
}

async function shellReadiness() {
  group = 'SHELL READINESS — geode_shell is written only after older Beynd caches are gone';
  log.length = 0;
  const absentStore = fakeStorage();
  const absent = loadPage(undefined, absentStore);
  check('shell.absent', 'No Cache API: readiness is absent (the transition may run); cleanup does nothing and records no marker',
    [absent.readiness(), await absent.cleanup(), absentStore.m], ['absent', false, {}]);

  const pendingStore = fakeStorage();
  const caches = new FakeCaches();
  const page = loadPage(caches, pendingStore);
  const states = [page.readiness()];
  pendingStore.m.geode_shell = PREVIOUS; states.push(page.readiness());
  pendingStore.throwOnGet = true; states.push(page.readiness()); pendingStore.throwOnGet = false;
  check('shell.pending', 'With a Cache API: no marker, the previous runtime\'s marker, or unreadable storage → pending (never absent)', states, ['pending', 'pending', 'pending']);

  log.length = 0;
  const store = fakeStorage({ geode_v6: '{"_schemaVersion":1}' });
  const full = new FakeCaches();
  full.seed('beynd-cache-' + PREVIOUS, OLD_FILES); full.seed('beynd-cache-v1.0.70', OLD_FILES); full.seed(CURRENT_CACHE, { '/index.html': INDEX }); full.seed('other-app', {});
  const cleaned = loadPage(full, store);
  const ok = await cleaned.cleanup();
  const mark = log.indexOf('setItem:geode_shell=' + RUNTIME);
  check('shell.cleanup', 'Cleanup deletes every older Beynd cache (not this release\'s, not others), and only after both deletions finished records geode_shell = v1.0.76; readiness becomes ready; the financial key is untouched',
    [ok, full.names(), mark > log.indexOf('deleted:beynd-cache-' + PREVIOUS) && mark > log.indexOf('deleted:beynd-cache-v1.0.70'), cleaned.readiness(), store.m],
    [true, [CURRENT_CACHE, 'other-app'], true, 'ready', { geode_v6: '{"_schemaVersion":1}', geode_shell: RUNTIME }]);
  check('shell.doc', 'The code says geode_shell is not a stale-tab lock', extractFunction('geodeShellReadiness').length > 0 &&
    INDEX.indexOf('geode_shell proves only that older cached app copies are gone') >= 0 && INDEX.indexOf('not\n * that no older page is still open') >= 0, true);
}

async function cleanupFailure() {
  group = 'CLEANUP FAILURE — no marker, so no transition; nothing financial is touched';
  const attempt = async (label, fail) => {
    log.length = 0;
    const store = fakeStorage({ geode_v6: '{"_schemaVersion":1}' });
    const caches = new FakeCaches(fail);
    caches.seed('beynd-cache-' + PREVIOUS, OLD_FILES); caches.seed('beynd-cache-v1.0.70', OLD_FILES); caches.seed(CURRENT_CACHE, {});
    const page = loadPage(caches, store);
    const ok = await page.cleanup();
    return [label, ok, page.readiness(), store.m];
  };
  const held = label => [label, false, 'pending', { geode_v6: '{"_schemaVersion":1}' }];
  check('clean.fail', 'An older cache that cannot be deleted, caches.keys() rejecting, or caches.keys() throwing: cleanup reports false, geode_shell is not written, readiness stays pending (not absent), the financial key is unchanged',
    [await attempt('delete fails', { delete: new Set(['beynd-cache-v1.0.70']) }), await attempt('keys rejects', { keys: 'reject' }), await attempt('keys throws', { keys: 'throw' })],
    [held('delete fails'), held('keys rejects'), held('keys throws')]);
  const retry = await attempt('next boot', {});
  check('clean.retry', 'The next boot with a working Cache API completes cleanup and becomes ready', retry, ['next boot', true, 'ready', { geode_v6: '{"_schemaVersion":1}', geode_shell: RUNTIME }]);
}

async function gate() {
  group = 'STALE-RUNTIME GATE — plain words, one Reload';
  const COPY = {
    newer: 'A newer version of Beynd is needed on this device. Reload to update.',
    changed: 'Beynd was updated in another window. Reload to continue \u2014 your saved information is safe.'
  };
  const view = reason => {
    const g = loadGate();
    g.show(reason);
    const el = g.body.children[0];
    const out = [g.body.children.length, el.id, el.attrs.role, el.attrs['aria-modal'], el.children.map(c => c.tag + ':' + c.textContent)];
    g.show(reason);
    out.push(g.body.children.length);
    el.children[1].listeners.click.forEach(fn => fn());
    out.push(g.reloads.length);
    return out;
  };
  const expected = text => [1, 'geode-stale-gate', 'alertdialog', 'true', ['p:' + text, 'button:Reload'], 1, 1];
  check('gate.newer', 'Newer stored data: the full-screen gate with the update copy and one Reload button; shown once; Reload reloads', view('newer'), expected(COPY.newer));
  check('gate.changed', 'Another window\'s change: the reassuring copy, same single action', view('changed'), expected(COPY.changed));
  check('gate.words', 'Neither copy mentions schema, ledger, cache, service worker or migration', Object.values(COPY).filter(t => /schema|ledger|cache|service worker|migrat/i.test(t)), []);
  const bare = loadGate(false);
  let threw = false;
  try { bare.show('newer'); } catch (e) { threw = true; }
  check('gate.no-body', 'Before the page body exists the gate is skipped without throwing (writes stay blocked regardless)', threw, false);
  check('gate.css', 'The gate covers the whole screen above everything', /\.geode-stale-gate\{position:fixed;inset:0;z-index:100000;/.test(INDEX), true);
}

async function main() {
  try {
    if (!RUNTIME) throw new Error('index.html has no BEYND_RUNTIME_VERSION line');
    await versions(); await install(); await installFailure(); await activate(); await lookups(); await navigation();
    await shellReadiness(); await cleanupFailure(); await gate();
  } catch (e) {
    results.push({ group, id: 'error', text: 'harness error', ok: false, detail: String(e && e.stack || e) });
  }
  console.log('Beynd release upgrade safety');
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL').padEnd(6) + r.id.padEnd(24) + ' ' + r.text + (r.detail ? '\n' + ' '.repeat(32) + r.detail : ''));
  });
  const failed = results.filter(r => !r.ok).length;
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
