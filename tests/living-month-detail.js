#!/usr/bin/env node
'use strict';
/**
 * Beynd Living Month detail — Happened vs Still ahead (P3-3) — dependency-free: node tests/living-month-detail.js
 *
 * The Home Month Pulse with its detail disclosure (geodeHomeMonthPulseHtml → geodeMonthDetailView / geodeMonthDetailHtml)
 * and everything it reaches are extracted from index.html (plus js/geode-pure/01-foundation.js) and run in an isolated vm
 * context under a simulated clock, with storage, the DOM, save and recurrence trapped. Checks, for every case:
 *   - the detail's section totals are the model's doneTotal / aheadTotal and reconcile with the Pulse glance;
 *   - every completion appears once: an event a payment item cites as its evidence is not listed again (identity only);
 *   - unplaced completions, releases and valuations never sit in a totalled column; nothing enters Monthly Left;
 *   - evidence wording only: no bank, cash, balance, spending, payment-date, overdue / unpaid / missed / late claim;
 *   - a model that is not ready shows no detail; rendering reads only, offers no action and writes nothing;
 *   - mutants that break any of this are caught.
 * Exit code 0 when every check passes, 1 otherwise.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const INDEX = read('index.html');
const FOUNDATION = read('js/geode-pure/01-foundation.js');

// ───────────────────────────── production code ─────────────────────────────

const ENTRY_FUNCTIONS = ['geodeHomeMonthPulseHtml', 'geodeMonthDetailView', 'geodeMonthDetailHtml', 'geodeLivingMonthModel', 'calcMonthlyLeftover', 'fm'];
const CONSTANTS = ['GEODE_SCHEMA_VERSION'];
const DETAIL_FUNCTIONS = ['geodeMonthDetailView', 'geodeMonthDetailHtml', 'geodeMonthPulseDay', 'geodeMonthPulseMonthName'];

const SHIMS = String.raw`
var __RealDate = Date, __nowMs = 0;
function __SimDate(a, b, c, d, e, f, g) {
  if (!(this instanceof __SimDate)) return new __RealDate(__nowMs).toString();
  var r = arguments.length === 0 ? new __RealDate(__nowMs)
    : arguments.length === 1 ? new __RealDate(a)
    : new __RealDate(a, b, c == null ? 1 : c, d || 0, e || 0, f || 0, g || 0);
  Object.setPrototypeOf(r, __SimDate.prototype);
  return r;
}
__SimDate.prototype = Object.create(__RealDate.prototype);
__SimDate.prototype.constructor = __SimDate;
__SimDate.now = function () { return __nowMs; };
__SimDate.UTC = __RealDate.UTC;
__SimDate.parse = __RealDate.parse;
Date = __SimDate;

var __trapLog = [];
function save() { __trapLog.push('save()'); }
function persistGeodeToLocalStorage() { __trapLog.push('persistGeodeToLocalStorage()'); }
function syncRecurringPayments() { __trapLog.push('syncRecurringPayments()'); }
function geodeStoreFinancialState() { __trapLog.push('geodeStoreFinancialState()'); }
function render() { __trapLog.push('render()'); }
function appendActivityLog() { __trapLog.push('appendActivityLog()'); }
function __storageTrap(name) {
  return {
    getItem: function (k) { __trapLog.push(name + '.getItem(' + k + ')'); return null; },
    setItem: function (k) { __trapLog.push(name + '.setItem(' + k + ')'); },
    removeItem: function (k) { __trapLog.push(name + '.removeItem(' + k + ')'); },
    clear: function () { __trapLog.push(name + '.clear()'); },
    key: function () { __trapLog.push(name + '.key()'); return null; }
  };
}
var localStorage = __storageTrap('localStorage');
var sessionStorage = __storageTrap('sessionStorage');
function __objectTrap(name) {
  return new Proxy({}, {
    get: function (t, k) { __trapLog.push(name + '.' + String(k)); return undefined; },
    set: function (t, k) { __trapLog.push(name + '.' + String(k) + ' ='); return true; },
    has: function (t, k) { __trapLog.push('in ' + name); return false; }
  });
}
var document = __objectTrap('document');
var window = __objectTrap('window');
var location = __objectTrap('location');
var navigator = __objectTrap('navigator');
/** The page state: the detail may read only its currency (through fm); its figures are decoys. */
var S = {};
function __parse(text) { return JSON.parse(text); }
`;

function extractFunction(src, name) {
  const needle = '\nfunction ' + name + '(';
  const starts = [];
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) starts.push(i + 1);
  if (!starts.length) throw new Error('production function not found in index.html: ' + name);
  const start = starts[starts.length - 1];
  const firstLine = src.slice(start, src.indexOf('\n', start));
  const opens = (firstLine.match(/\{/g) || []).length;
  const closes = (firstLine.match(/\}/g) || []).length;
  let text;
  if (opens > 0 && opens === closes && /\}\s*$/.test(firstLine)) {
    text = firstLine;
  } else {
    const end = src.indexOf('\n}', start);
    if (end < 0) throw new Error('could not find the end of production function ' + name);
    text = src.slice(start, end + 2);
  }
  new vm.Script('(' + text + '\n)', { filename: 'index.html:' + name });
  return { name, text };
}

const JS_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'do', 'else',
  'try', 'with', 'void', 'delete', 'in', 'of', 'instanceof', 'throw', 'super', 'this']);

/** Names a function calls that it does not declare itself (regex literals, strings and comments stripped first). */
function calledNames(text) {
  const stripped = text.replace(/((?<=(?:^|[=(,:[!&|?{};]|\breturn)\s*)\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*)|(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*')|("(?:\\.|[^"\\\n])*")|(`(?:\\.|[^`\\])*`)/gm, ' ');
  const local = new Set();
  let m;
  const fnDecl = /function\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
  while ((m = fnDecl.exec(stripped))) {
    if (m[1]) local.add(m[1]);
    m[2].split(',').map(s => s.trim()).filter(Boolean).forEach(p => local.add(p));
  }
  const call = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  const out = new Set();
  while ((m = call.exec(stripped))) {
    if (!JS_WORDS.has(m[1]) && !local.has(m[1])) out.add(m[1]);
  }
  return out;
}

function extractConstant(src, name) {
  const m = src.match(new RegExp('\\nvar ' + name + ' = [^\\n]*;\\n'));
  if (!m) throw new Error('production constant not found in index.html: ' + name);
  return m[0].trim();
}

/** The shims, the foundation and the entry functions' dependency closure; a name nothing defines is an error. */
function buildProgram(src) {
  const base = SHIMS + '\n' + FOUNDATION + '\n' + CONSTANTS.map(n => extractConstant(src, n)).join('\n') + '\n';
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  new vm.Script(base).runInContext(probe);
  const have = new Map();
  const queue = ENTRY_FUNCTIONS.slice();
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || vm.runInContext('typeof ' + n, probe) !== 'undefined') continue;
    const f = extractFunction(src, n);
    have.set(n, f);
    calledNames(f.text).forEach(c => queue.push(c));
  }
  const code = base + [...have.values()].map(f => f.text).join('\n') + '\n';
  return { script: new vm.Script(code, { filename: 'living-month-detail-program.js' }), extracted: [...have.keys()] };
}

// ───────────────────────────── observation helpers ─────────────────────────────

function canon(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Object.is(v, -0) ? '-0' : String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

function writeTrap(root, log) {
  const cache = new WeakMap();
  function wrap(obj, at) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (cache.has(obj)) return cache.get(obj);
    const p = new Proxy(obj, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r);
        return typeof k === 'string' && v !== null && typeof v === 'object' ? wrap(v, at + '.' + k) : v;
      },
      set(t, k, v) { log.push('set ' + at + '.' + String(k)); return Reflect.set(t, k, v); },
      defineProperty(t, k, d) { log.push('define ' + at + '.' + String(k)); return Reflect.defineProperty(t, k, d); },
      deleteProperty(t, k) { log.push('delete ' + at + '.' + String(k)); return Reflect.deleteProperty(t, k); }
    });
    cache.set(obj, p);
    return p;
  }
  return wrap(root, 'state');
}

function textOf(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
/** The detail disclosure's inner markup, or null when the Pulse has none. */
function detailOf(html) {
  const m = html.match(/<details data-geode-month-detail="1"[^>]*>([\s\S]*)<\/details>/);
  return m ? m[1] : null;
}
/** Rows of one detail list: each row is [title, detail] or [title, detail, amount]; null when the list is absent. */
function listOf(detail, key) {
  const m = detail.match(new RegExp('<ul data-geode-month-detail-list="' + key + '"[^>]*>([\\s\\S]*?)</ul>'));
  if (!m) return null;
  return (m[1].match(/<li[\s\S]*?<\/li>/g) || []).map(li => (li.match(/<div[^>]*>[^<]*<\/div>/g) || []).map(textOf));
}
/** Section headings: [label, total?] each. */
function headingsOf(detail) {
  return (detail.match(/<h3[\s\S]*?<\/h3>/g) || []).map(h => (h.match(/<span[^>]*>[^<]*<\/span>/g) || []).map(textOf));
}
function commitmentsOf(html) {
  const m = html.match(/<div data-geode-month-pulse-commitments="1"[^>]*>([^<]*)<\/div>/);
  return m ? textOf(m[1]) : '';
}

const at = (y, m, d, h) => new Date(y, m - 1, d, h == null ? 12 : h).getTime();
const NOW = at(2026, 10, 15);
const GBP = { sym: '\u00a3', code: 'GBP', loc: 'en-GB' };

/** Claims the detail must never make: cash, bank, balance, spending, a payment date, income, or an inferred missed payment. */
const FORBIDDEN = /\b(cash|bank|balance|available|disposable|spent|spending|paid out|paid on|payment date|transaction|overdue|unpaid|missed|failed|late|arrears|income|salary|profit|gain|received|owed?)\b|\+\u00a3/i;

// ───────────────────────────── fixtures (clock: 15 Oct 2026) ─────────────────────────────

function base(extra) {
  return Object.assign({
    _schemaVersion: 3, income: 3000, incomeExplicitlySet: true, incomeType: 'stable', incomeTypeUserSet: true,
    payments: [], expenses: [], goals: [], investments: [], debts: [], savingsReleases: [],
    billPaymentEvents: [], debtPaymentEvents: [], contributionEvents: [], contributionCarry: [], expectationGaps: [],
    activityLog: [], snapshots: {}, lastSnapshot: null
  }, extra || {});
}
const bill = (id, amount, date, extra) => Object.assign({ id, name: id, amount, date, status: 'upcoming', rec: 'yes', lastPaidYM: '', goalId: '', investId: '', debtId: '' }, extra || {});
const paidMonthly = (id, amount, dueDate, extra) => bill(id, amount, '2026-11-' + dueDate.slice(8), Object.assign({
  status: 'paid', lastPaidYM: '2026-10', lastPaidAmount: amount, lastPaidDueDate: dueDate }, extra || {}));
const billEvent = (pid, amount, occ, recordedAt, extra) => Object.assign({ id: 'bpe_' + pid + '_' + occ + '_c1', eventType: 'completion', paymentId: pid,
  amount, occurrenceYm: occ, dueDateSnapshot: occ + '-01', recordedAt, paymentNameSnapshot: pid, recurrenceSnapshot: 'monthly', source: 'mark_completed' }, extra || {});
const cev = (id, pid, entityType, entityId, amount, occ, extra) => Object.assign({ id, eventType: 'completion', paymentId: pid, entityType, entityId,
  occurrenceYm: occ, amount, recurrence: 'monthly', dueDateSnapshot: occ + '-04', recordedAt: at(2026, 10, 4, 9), source: 'mark_completed' }, extra || {});
const dpe = (id, pid, amount, occ) => ({ id, eventType: 'completion', paymentId: pid, debtId: 'd1', amount, occurrenceYm: occ,
  recordedAt: at(2026, 10, 2, 9), dueDateSnapshot: occ + '-02', debtNameSnapshot: 'Card', paymentNameSnapshot: pid, recurrenceSnapshot: 'monthly', source: 'mark_completed' });
const release = (id, amount, date, sourceId, sourceType) => ({ id, sourceType: sourceType || 'goal', sourceId, amount, reason: 'emergency', date, ym: date.slice(0, 7),
  relatedYm: date.slice(0, 7), remainingBalance: 1200, createdAt: at(2026, 10, Number(date.slice(8, 10)), 10), confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' });
const GOAL = () => [{ id: 'g1', name: 'Holiday', target: 2000, saved: 400, baseSaved: 300 }];
const BUFFER = () => [{ id: 'gb', name: 'Buffer', target: 3000, saved: 1200, baseSaved: 1500 }];
const ISA = vals => [{ id: 'i1', name: 'ISA', balance: 5400, baseBalance: 5000, valuations: vals || [] }];
const CARD = () => [{ id: 'd1', name: 'Card', balance: 5000, apr: 20, minp: 150 }];
const val = (id, value, date, source) => ({ id, value, date, recordedAt: at(2026, 10, Number(date.slice(8, 10)), 8), source: source || 'manual' });

const CASES = {
  'A.completed-and-scheduled': () => base({ payments: [paidMonthly('Rent', 1200, '2026-10-01'), bill('Phone', 40, '2026-10-20')],
    billPaymentEvents: [billEvent('Rent', 1200, '2026-10', at(2026, 10, 1, 9))] }),
  'C.status-only': () => base({ payments: [paidMonthly('Water', 35, '2026-10-03'), bill('Phone', 40, '2026-10-20')] }),
  'D.due-no-outcome': () => base({ payments: [bill('Gym', 30, '2026-10-05'), bill('Phone', 40, '2026-10-20')] }),
  'E.undated': () => base({ payments: [bill('Streaming', 25, ''), bill('Phone', 40, '2026-10-20')] }),
  'F.outstanding-earlier': () => base({ payments: [bill('Dentist', 90, '2026-09-20', { rec: 'no' }), bill('Phone', 40, '2026-10-20')] }),
  'G.goal-contribution-done': () => base({ goals: GOAL(), payments: [paidMonthly('Save for holiday', 100, '2026-10-04', { goalId: 'g1' })],
    contributionEvents: [cev('ce_1', 'Save for holiday', 'goal', 'g1', 100, '2026-10')] }),
  'H.goal-contribution-scheduled': () => base({ goals: GOAL(), payments: [bill('Holiday top-up', 50, '2026-10-28', { goalId: 'g1' })] }),
  'I.investment-contribution-done': () => base({ investments: ISA(), payments: [paidMonthly('ISA top-up', 150, '2026-10-06', { investId: 'i1' })],
    contributionEvents: [cev('ce_2', 'ISA top-up', 'investment', 'i1', 150, '2026-10')] }),
  'J.debt-payment-done': () => base({ debts: CARD(), payments: [paidMonthly('Card payment', 200, '2026-10-02', { debtId: 'd1' }),
    bill('Card extra', 100, '2026-10-25', { rec: 'no', debtId: 'd1' })], debtPaymentEvents: [dpe('dpe_1', 'Card payment', 200, '2026-10')] }),
  'K.release': () => base({ goals: BUFFER(), payments: [bill('Phone', 40, '2026-10-20')], savingsReleases: [release('rel_oct', 300, '2026-10-08', 'gb')] }),
  'L.valuation': () => base({ investments: ISA([val('val_legacy', 5000, '2026-10-01', 'legacy_transition'), val('val_oct', 5400, '2026-10-12')]),
    payments: [bill('Phone', 40, '2026-10-20')] }),
  'N.release-and-completion': () => base({ goals: BUFFER(), payments: [paidMonthly('Rent', 1200, '2026-10-01'), bill('Phone', 40, '2026-10-20')],
    billPaymentEvents: [billEvent('Rent', 1200, '2026-10', at(2026, 10, 1, 9))], savingsReleases: [release('rel_oct', 300, '2026-10-08', 'gb')] }),
  'O.valuation-and-contribution': () => base({ investments: ISA([val('val_oct', 5400, '2026-10-12')]),
    payments: [paidMonthly('ISA top-up', 150, '2026-10-06', { investId: 'i1' })], contributionEvents: [cev('ce_2', 'ISA top-up', 'investment', 'i1', 150, '2026-10')] }),
  'P.unplaced': () => base({ payments: [bill('Gift', 30, '', { rec: 'no', status: 'paid' }), bill('Phone', 40, '2026-10-20')] }),
  'P.unplaced-with-evidence': () => base({ goals: GOAL(), payments: [bill('Trip', 100, '', { rec: 'no', status: 'paid', goalId: 'g1', contributionEventId: 'ce_trip' })],
    contributionEvents: [cev('ce_trip', 'Trip', 'goal', 'g1', 100, '2026-10', { recurrence: 'one_off', dueDateSnapshot: '' })] }),
  'Q.earlier-gaps': () => base({ payments: [bill('Rent', 1200, '2026-10-01'), bill('Phone', 40, '2026-10-20')],
    expectationGaps: [{ id: 'gap_Rent_2026-07', domain: 'bill', targetId: 'Rent', paymentId: 'Rent', recurrence: 'monthly', fromYm: '2026-07', toYm: '2026-09',
      expectedAmount: 1200, dueDay: 1, templateNameSnapshot: 'Rent', targetNameSnapshot: '', seenYm: '2026-06', capturedAt: at(2026, 10, 1, 8), capturedBy: 'rev_x', source: 'month_boundary' }],
    billPaymentEvents: [billEvent('Rent', 1200, '2026-08', at(2026, 10, 2, 9))] }),
  'Q.earlier-gaps-only': () => base({
    expectationGaps: [{ id: 'gap_Gym_2026-08', domain: 'bill', targetId: 'Gym', paymentId: 'Gym', recurrence: 'monthly', fromYm: '2026-08', toYm: '2026-09',
      expectedAmount: 30, dueDay: 5, templateNameSnapshot: 'Gym', targetNameSnapshot: '', seenYm: '2026-07', capturedAt: at(2026, 10, 1, 8), capturedBy: 'rev_x', source: 'month_boundary' }] }),
  'R.all-completed': () => base({ payments: [paidMonthly('Rent', 1200, '2026-10-01'), paidMonthly('Water', 35, '2026-10-03')],
    billPaymentEvents: [billEvent('Rent', 1200, '2026-10', at(2026, 10, 1, 9))] }),
  'S.nothing-completed': () => base({ payments: [bill('Phone', 40, '2026-10-20'), bill('Gym', 30, '2026-10-25')] }),
  'T.release-only': () => base({ goals: BUFFER(), savingsReleases: [release('rel_oct', 300, '2026-10-08', 'gb')] }),
  'T.valuation-only': () => base({ investments: ISA([val('val_oct', 5400, '2026-10-12')]) }),
  'T.allocation-only': () => base({ goals: GOAL(), payments: [bill('Holiday top-up', 50, '2026-10-28', { goalId: 'g1' })] }),
  'U.quiet': () => base(),
  'V.irregular': () => base({ income: 1600, incomeType: 'irregular', payments: [paidMonthly('Rent', 900, '2026-10-01'), bill('Phone', 40, '2026-10-20')],
    billPaymentEvents: [billEvent('Rent', 900, '2026-10', at(2026, 10, 1, 9))] }),
  'W.negative': () => base({ income: 1000, payments: [paidMonthly('Rent', 1200, '2026-10-01'), bill('Phone', 40, '2026-10-20')],
    billPaymentEvents: [billEvent('Rent', 1200, '2026-10', at(2026, 10, 1, 9))] }),
  'Z.system-and-orphan': () => base({ goals: GOAL(), payments: [bill('Phone', 40, '2026-10-20')],
    contributionEvents: [cev('ce_gone', 'deleted-row', 'goal', 'g1', 100, '2026-10', { source: 'rollover_safety_net' })],
    billPaymentEvents: [billEvent('old-bill', 60, '2026-10', at(2026, 10, 3, 9), { paymentNameSnapshot: 'Old phone plan' })] }),
  'Z.markup': () => base({ payments: [bill('<b>Rent & "co"</b> with a very long name that should wrap safely on a narrow phone screen', 1200, '2026-10-20')] })
};

const PENDING = {
  'X.boundary-pending': () => base({ goals: BUFFER(), payments: [bill('Rent', 1200, '2026-09-01')], savingsReleases: [release('rel_oct', 300, '2026-10-08', 'gb')] })
};

// ───────────────────────────── checks ─────────────────────────────

function checksFor(src) {
  const results = [];
  let group = '';
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const section = name => { group = name; };

  const program = buildProgram(src);
  const ctx = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  program.script.runInContext(ctx);
  const parse = obj => ctx.__parse(JSON.stringify(obj));
  const vmDate = ms => vm.runInContext('new Date(' + ms + ')', ctx);
  vm.runInContext('__nowMs = ' + NOW + ';', ctx);
  const trapLog = () => JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', ctx));
  const clearTraps = () => vm.runInContext('__trapLog = [];', ctx);
  vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(Object.assign(base({ income: 99999, payments: [bill('decoy', 777, '2026-10-02')] }), { cur: GBP }))) + ');', ctx);
  const pulse = (state, now) => { clearTraps(); return ctx.geodeHomeMonthPulseHtml(state, now === undefined ? vmDate(NOW) : now); };
  const model = state => ctx.geodeLivingMonthModel(state, vmDate(NOW));
  const fm = v => ctx.fm(v);
  const byDue = list => list.map((x, i) => ({ x, i })).sort((a, b) => {
    const da = a.x.dueDate || '', db = b.x.dueDate || '';
    return da !== db ? (!da ? 1 : !db ? -1 : da < db ? -1 : 1) : a.i - b.i;
  }).map(w => w.x);

  section('STATIC — the detail reads the model only and computes no figure');
  const detailCode = DETAIL_FUNCTIONS.map(n => extractFunction(src, n).text).join('\n')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  check('static.declared', 'index.html declares each detail function once', DETAIL_FUNCTIONS.map(n => src.split('\nfunction ' + n + '(').length - 1), [1, 1, 1, 1]);
  check('static.no-reach-around', 'Detail code names no state, ledger, gap ledger, payment counter, Monthly Left function, row field, storage, DOM, clock or recordedAt',
    ['Events', 'expectationGaps', 'calcMonthlyLeftover', 'sumPayments', 'paymentCounts', 'sumExpenses', 'toNum', 'lastPaid', 'recordedAt',
      'localStorage', 'sessionStorage', 'document', 'window', 'reduce('].filter(w => detailCode.indexOf(w) >= 0)
      .concat(/\bDate\b/.test(detailCode) ? ['Date'] : [])
      .concat(/(?<![\w$.])S\b/.test(detailCode) ? ['S'] : []).concat(/(?<![\w$.])state\b/.test(detailCode) ? ['state'] : []).concat(/\+=\s*[\w.]*amount|amount\s*\+/.test(detailCode) ? ['amount sum'] : []), []);
  check('static.totals', 'Section totals are the model\'s doneTotal and aheadTotal', ['d.doneTotal', 'd.aheadTotal', 'payments.doneTotal', 'payments.aheadTotal'].map(w => detailCode.indexOf(w) >= 0), [true, true, true, true]);
  check('static.dedup-identity', 'Duplicates are matched by evidence identity (source and event id), never by amount or name',
    [detailCode.indexOf("x.evidenceRef.source + '' + x.evidenceRef.eventId") >= 0, detailCode.indexOf("e.evidenceSource + '' + e.id") >= 0], [true, true]);
  check('static.model-labels', 'Event labels come from the model (paymentName / entityName), not from the state',
    ['e.paymentName', 'e.entityName'].map(w => detailCode.indexOf(w) >= 0), [true, true]);

  // Generic checks for a ready case; returns { html, detail, m }.
  function ready(id, raw) {
    const state = parse(raw);
    const before = canon(state);
    const writes = [];
    const html = pulse(writeTrap(state, writes));
    const traps = trapLog();
    const m = model(state);
    const detail = detailOf(html);
    const p = m.payments;
    const cited = new Set(p.done.concat(p.unplaced).filter(x => x.evidenceRef).map(x => x.evidenceRef.source + '|' + x.evidenceRef.eventId));
    const also = m.happened.filter(e => !cited.has(e.evidenceSource + '|' + e.id));
    const content = p.done.length + p.ahead.length + p.unplaced.length + also.length + m.earlier.gapCount > 0;
    check(id + '.pure', 'Rendering writes nothing and reaches no storage, DOM, save or sync', [m.status, writes, traps, canon(state) === before], ['ready', [], [], true]);
    check(id + '.present', 'The detail exists exactly when the month has something beneath the glance', detail !== null, content);
    if (!detail) return { html, detail, m };
    const done = listOf(detail, 'done') || [];
    const ahead = listOf(detail, 'ahead') || [];
    const alsoRows = listOf(detail, 'also') || [];
    const unplaced = listOf(detail, 'unplaced') || [];
    const heads = headingsOf(detail);
    const head = label => (heads.filter(h => h[0] === label)[0] || [])[1] || '';
    check(id + '.done', 'Happened lists payments.done once each, by due date, at the amount Monthly Left counts', [done.map(r => r[0]), done.map(r => r[2])],
      [byDue(p.done).map(x => x.name), byDue(p.done).map(x => fm(x.amount))]);
    check(id + '.ahead', 'Still ahead lists payments.ahead once each, by due date, at the amount Monthly Left counts', [ahead.map(r => r[0]), ahead.map(r => r[2])],
      [byDue(p.ahead).map(x => x.name), byDue(p.ahead).map(x => fm(x.amount))]);
    check(id + '.reconcile', 'Section totals are doneTotal / aheadTotal, match the Pulse glance, and the listed amounts add up to them',
      [head('Happened'), head('Still ahead'), commitmentsOf(html).indexOf(fm(p.doneTotal) + ' completed') >= 0 || !p.done.length,
        commitmentsOf(html).indexOf(fm(p.aheadTotal) + ' still ahead') >= 0 || !p.ahead.length,
        Math.abs(p.done.reduce((s, x) => s + x.amount, 0) - p.doneTotal) < 1e-9, Math.abs(p.ahead.reduce((s, x) => s + x.amount, 0) - p.aheadTotal) < 1e-9],
      [p.done.length ? fm(p.doneTotal) + ' completed' : '', p.ahead.length ? fm(p.aheadTotal) + ' still ahead' : '', true, true, true, true]);
    check(id + '.once', 'No occurrence twice: an event a payment item cites is not listed again; every other event is listed once',
      [alsoRows.length, done.length + alsoRows.length + unplaced.length], [also.length, p.done.length + p.unplaced.length + m.happened.length - m.happened.filter(e => cited.has(e.evidenceSource + '|' + e.id)).length]);
    check(id + '.untotalled', 'Also-recorded events (releases, valuations, other records) and unplaced items carry no amount column — never in a total',
      [alsoRows.filter(r => r.length !== 2).length, unplaced.filter(r => r.length !== 2).length], [0, 0]);
    check(id + '.unplaced', 'Unplaced completions are listed only in their own section, once each', [unplaced.map(r => r[0]),
      p.unplaced.filter(x => done.concat(ahead).some(r => r[0] === x.name)).length], [p.unplaced.map(x => x.name), 0]);
    const text = textOf(detail);
    check(id + '.words', 'No cash, bank, balance, spending, payment-date, income, gain or overdue / unpaid / missed / late wording', FORBIDDEN.test(text) ? text.match(FORBIDDEN)[0] : '', '');
    check(id + '.read-only', 'The detail offers no action: no button, link or handler beyond the native disclosure', /<button|onclick|<a /.test(detail), false);
    return { html, detail, m, done, ahead, alsoRows, unplaced, heads };
  }

  section('CASES — A to W, each against every detail check');
  let r = ready('A', CASES['A.completed-and-scheduled']());
  check('A.text', 'One completed bill (ledger) and one scheduled bill: recorded as completed / scheduled, with due dates only',
    [r.done, r.ahead, r.alsoRows.length], [[['Rent', 'Recorded as completed \u00b7 due 1 Oct', '\u00a31,200']], [['Phone', 'Scheduled \u00b7 due 20 Oct', '\u00a340']], 0]);
  check('B.ledger', 'B — completed with ledger evidence: the bill event is the payment item\'s evidence, so it is not listed again',
    [r.m.payments.done[0].evidenceRef.eventId, r.m.happened.map(e => e.id), r.alsoRows], ['bpe_Rent_2026-10_c1', ['bpe_Rent_2026-10_c1'], []]);
  check('M.once', 'M — completion and its matching happened event: displayed once, not twice', textOf(r.detail).split('Rent').length - 1, 1);

  r = ready('C', CASES['C.status-only']());
  check('C.text', 'Completed with no ledger record (legacy status only): marked as completed — no evidence invented', r.done, [['Water', 'Marked as completed \u00b7 due 3 Oct', '\u00a335']]);

  r = ready('D', CASES['D.due-no-outcome']());
  check('D.text', 'Due earlier this month, nothing recorded: "Due · no outcome recorded", never overdue or unpaid', r.ahead,
    [['Gym', 'Due 5 Oct \u00b7 no outcome recorded', '\u00a330'], ['Phone', 'Scheduled \u00b7 due 20 Oct', '\u00a340']]);

  r = ready('E', CASES['E.undated']());
  check('E.text', 'Undated: "No due date recorded", listed after dated items', r.ahead, [['Phone', 'Scheduled \u00b7 due 20 Oct', '\u00a340'], ['Streaming', 'No due date recorded', '\u00a325']]);

  r = ready('F', CASES['F.outstanding-earlier']());
  check('F.text', 'One-off from September still counted: "From September · no outcome recorded"', r.ahead,
    [['Dentist', 'From September \u00b7 no outcome recorded', '\u00a390'], ['Phone', 'Scheduled \u00b7 due 20 Oct', '\u00a340']]);

  r = ready('G', CASES['G.goal-contribution-done']());
  check('G.text', 'Completed goal contribution: a contribution, recorded as completed; its contribution event is not listed again',
    [r.done, r.alsoRows], [[['Save for holiday', 'Goal contribution \u00b7 recorded as completed \u00b7 due 4 Oct', '\u00a3100']], []]);

  r = ready('H', CASES['H.goal-contribution-scheduled']());
  check('H.text', 'Scheduled goal contribution: planned, not "due" — an allocation, not an obligation', r.ahead, [['Holiday top-up', 'Goal contribution \u00b7 planned for 28 Oct', '\u00a350']]);

  r = ready('I', CASES['I.investment-contribution-done']());
  check('I.text', 'Completed investment contribution', [r.done, r.alsoRows], [[['ISA top-up', 'Investment contribution \u00b7 recorded as completed \u00b7 due 6 Oct', '\u00a3150']], []]);

  r = ready('J', CASES['J.debt-payment-done']());
  check('J.text', 'Debt payment recorded as completed; nothing about the debt balance or principal', [r.done, r.ahead, /Card\b(?! (payment|extra))/.test(textOf(r.detail))],
    [[['Card payment', 'Debt payment \u00b7 recorded as completed \u00b7 due 2 Oct', '\u00a3200']], [['Card extra', 'Debt payment \u00b7 scheduled \u00b7 due 25 Oct', '\u00a3100']], false]);

  r = ready('K', CASES['K.release']());
  const kNoRelease = model(parse(Object.assign(CASES['K.release'](), { savingsReleases: [] })));
  check('K.text', 'Savings release: "£300 released from Buffer", dated by its own date, untotalled; Monthly Left and payment totals unchanged by it',
    [r.alsoRows, r.m.plan.monthlyLeft === kNoRelease.plan.monthlyLeft, r.m.payments.doneTotal === kNoRelease.payments.doneTotal, r.m.payments.aheadTotal === kNoRelease.payments.aheadTotal],
    [[['\u00a3300 released from Buffer', 'Release \u00b7 8 Oct']], true, true, true]);

  r = ready('L', CASES['L.valuation']());
  check('L.text', 'Valuation: a recorded value (not +£), the legacy anchor omitted, untotalled', r.alsoRows, [['ISA value recorded at \u00a35,400', 'Valuation \u00b7 12 Oct']]);

  r = ready('N', CASES['N.release-and-completion']());
  check('N.text', 'Release beside a completion: the completion once in the totalled list, the release once under also recorded',
    [r.done.map(x => x[0]), r.alsoRows, /not counted in these totals/.test(r.detail)], [['Rent'], [['\u00a3300 released from Buffer', 'Release \u00b7 8 Oct']], true]);

  r = ready('O', CASES['O.valuation-and-contribution']());
  check('O.text', 'Valuation beside a contribution: the contribution once (its event folded in), the valuation separate and untotalled',
    [r.done.map(x => x[0]), r.alsoRows, r.heads[0]], [['ISA top-up'], [['ISA value recorded at \u00a35,400', 'Valuation \u00b7 12 Oct']], ['Happened', '\u00a3150 completed']]);

  r = ready('P', CASES['P.unplaced']());
  check('P.text', 'Unplaced completed one-off: its own section, not counted, never in Happened or Still ahead',
    [r.unplaced, r.done.length, r.ahead.map(x => x[0]), /Not counted in this month\u2019s figures\./.test(r.detail), r.heads.map(h => h[0])],
    [[['Gift', '\u00a330 \u00b7 completed, month unknown']], 0, ['Phone'], true, ['Happened', 'Still ahead', 'Completed, month unknown']]);
  r = ready('P.evidence', CASES['P.unplaced-with-evidence']());
  check('P.evidence.text', 'Unplaced with a ledger completion: the event stays with the unplaced item — not listed as happened this month',
    [r.unplaced, r.alsoRows, r.m.happened.map(e => e.id), r.heads.map(h => h[0])],
    [[['Trip', 'Goal contribution \u00b7 \u00a3100 \u00b7 completed, month unknown']], [], ['ce_trip'], ['Completed, month unknown']]);

  r = ready('Q', CASES['Q.earlier-gaps']());
  check('Q.text', 'Earlier gaps: one calm summary line, no list and no "missed"; August\'s settlement recorded this month is listed for August, untotalled',
    [/Earlier months have 2 expected items with no recorded outcome\./.test(r.detail), r.alsoRows, r.ahead.map(x => x[0]), r.m.earlier.gapCount],
    [true, [['Rent', '\u00a31,200 recorded as completed \u00b7 for August']], ['Rent', 'Phone'], 2]);

  r = ready('Q.only', CASES['Q.earlier-gaps-only']());
  check('Q.only.text', 'Earlier gaps and nothing else (the row since deleted): the detail is the one summary line — no headings, no lists, no totals',
    [r.m.earlier.gapCount, r.heads.length, (r.detail.match(/<ul /g) || []).length, textOf(r.detail.replace(/<summary[\s\S]*?<\/summary>/, '')), commitmentsOf(r.html)],
    [2, 0, 0, 'Earlier months have 2 expected items with no recorded outcome.', '']);

  r = ready('R', CASES['R.all-completed']());
  check('R.text', 'All completed: both listed under Happened; Still ahead says so calmly', [r.done.map(x => x[0]), r.heads, /Nothing still ahead\./.test(r.detail)],
    [['Rent', 'Water'], [['Happened', '\u00a31,235 completed'], ['Still ahead']], true]);

  r = ready('S', CASES['S.nothing-completed']());
  check('S.text', 'Nothing completed: Happened says so calmly; Still ahead lists both', [/Nothing recorded as completed yet\./.test(r.detail), r.ahead.map(x => x[0]), r.heads],
    [true, ['Phone', 'Gym'], [['Happened'], ['Still ahead', '\u00a370 still ahead']]]);

  r = ready('T.release', CASES['T.release-only']());
  check('T.release.text', 'No payments, one release: Happened holds the release alone — no totals, no empty Still ahead, no "not counted" caption',
    [r.heads, r.alsoRows, /not counted in these totals|Still ahead|Nothing/.test(r.detail), commitmentsOf(r.html)], [[['Happened']], [['\u00a3300 released from Buffer', 'Release \u00b7 8 Oct']], false, '']);
  r = ready('T.valuation', CASES['T.valuation-only']());
  check('T.valuation.text', 'Only a valuation', [r.heads, r.alsoRows], [[['Happened']], [['ISA value recorded at \u00a35,400', 'Valuation \u00b7 12 Oct']]]);
  r = ready('T.allocation', CASES['T.allocation-only']());
  check('T.allocation.text', 'Only an allocation (scheduled contribution)', [r.ahead, /Nothing recorded as completed yet\./.test(r.detail)],
    [[['Holiday top-up', 'Goal contribution \u00b7 planned for 28 Oct', '\u00a350']], true]);

  r = ready('U', CASES['U.quiet']());
  check('U.text', 'Quiet month: no detail at all — the Pulse stays short', [r.detail, /<details/.test(r.html)], [null, false]);

  r = ready('V', CASES['V.irregular']());
  check('V.text', 'Irregular income: the detail is the same story and says nothing about income', [r.done.map(x => x[0]), r.ahead.map(x => x[0]), /income/i.test(textOf(r.detail))],
    [['Rent'], ['Phone'], false]);

  r = ready('W', CASES['W.negative']());
  check('W.text', 'Negative plan: the detail sits beside the existing Plan link; one disclosure, one link, no new action', [r.done.map(x => x[0]),
    (r.html.match(/<details/g) || []).length, (r.html.match(/<button/g) || []).length, r.html.indexOf('<details') < r.html.indexOf('Review this month in Plan')], [['Rent'], 1, 1, true]);

  r = ready('Z.system', CASES['Z.system-and-orphan']());
  check('Z.system.text', 'Events no payment item cites (a deleted row, a safety-net record) are listed once by the model\'s labels, the system one said to be recorded by Beynd',
    [r.alsoRows], [[['Old phone plan', '\u00a360 recorded as completed'], ['Holiday', '\u00a3100 contribution recorded to Holiday \u00b7 recorded by Beynd']]]);
  check('Z.labels', 'Model labels: the current row or entity name, else the name the event recorded, else null',
    r.m.happened.map(e => [e.id, e.paymentName, e.entityName]), [['bpe_old-bill_2026-10_c1', 'Old phone plan', null], ['ce_gone', null, 'Holiday']]);

  r = ready('Z.markup', CASES['Z.markup']());
  check('Z.markup.text', 'Names are escaped, and long names wrap (min-width:0, overflow-wrap:anywhere) beside a non-wrapping amount',
    [/<b>/.test(r.detail), /&lt;b&gt;Rent &amp; &quot;co&quot;&lt;\/b&gt;/.test(r.detail), /min-width:0;overflow-wrap:anywhere/.test(r.detail), /white-space:nowrap/.test(r.detail)],
    [false, true, true, true]);

  section('ACCESSIBILITY — native disclosure, headings, lists, text distinctions');
  r = ready('ACC', CASES['N.release-and-completion']());
  check('acc.structure', 'A native <details>/<summary> disclosure (keyboard and screen-reader operable) with h3 section headings and lists',
    [/<details data-geode-month-detail="1"[^>]*><summary[^>]*>See what\u2019s happened and what\u2019s ahead<\/summary>/.test(r.html),
      (r.detail.match(/<h3/g) || []).length, (r.detail.match(/<ul /g) || []).length, (r.detail.match(/<li /g) || []).length, /outline:none/.test(r.html)], [true, 2, 3, 3, false]);
  check('acc.text-distinctions', 'Evidence and kind are told in words (recorded / marked, release, valuation, contribution), not by colour alone',
    [r.done[0][1], r.alsoRows[0][1]], ['Recorded as completed \u00b7 due 1 Oct', 'Release \u00b7 8 Oct']);

  section('NOT READY — no detail from a model that is not ready');
  Object.keys(PENDING).forEach(id => {
    const state = parse(PENDING[id]());
    const writes = [];
    check(id, 'Boundary pending (with a release that would otherwise appear): no Pulse, no detail, nothing written or synced',
      [model(state).status, pulse(writeTrap(state, writes)), writes, trapLog()], ['boundary_pending', '', [], []]);
  });
  const readyModel = parse(model(parse(CASES['N.release-and-completion']())));
  check('X.stale-model', 'The same figures and events under any non-ready status give no detail view',
    ['boundary_pending', 'schema_not_current', 'clock_month_mismatch', 'invalid_clock', 'invalid_state'].map(s => ctx.geodeMonthDetailView(Object.assign({}, readyModel, { status: s }))),
    [null, null, null, null, null]);
  check('X.refusals', 'Another schema, another month, no clock, no state: no detail',
    [pulse(parse(Object.assign(CASES['A.completed-and-scheduled'](), { _schemaVersion: 2 }))), pulse(parse(CASES['A.completed-and-scheduled']()), vmDate(at(2026, 11, 2))),
      pulse(parse(CASES['A.completed-and-scheduled']()), vmDate(NaN)), pulse(null), ctx.geodeMonthDetailHtml(null)], ['', '', '', '', '']);

  return { results, extracted: program.extracted.length };
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'no deduplication': ["return e && !cited[e.evidenceSource + '|' + e.id];", 'return !!e;'],
  'unplaced citations ignored': ['[payments.done || [], payments.unplaced || []].forEach', '[payments.done || []].forEach'],
  'release totalled in the column': ["meta(['release', day]), null);", "meta(['release', day]), e.amount);"],
  'valuation shown as a gain': ["' value recorded at ' + fm(e.value)", "' +' + fm(e.value)"],
  'due item called overdue': ["(allocation ? 'planned for ' : 'due ') + day + ' \\u00b7 no outcome recorded'", "(allocation ? 'planned for ' : 'overdue since ') + day"],
  'heading total recomputed': ["heading('Happened', d.done.length ? fm(d.doneTotal) + ' completed' : '')", "heading('Happened', d.done.length ? fm(d.done.length) + ' completed' : '')"],
  'non-ready model detailed': ["if (!model || model.status !== 'ready' || !model.payments) return null;", 'if (!model || !model.payments) return null;'],
  'status-only called recorded': ["x.evidence === 'ledger' ? 'recorded as completed' : 'marked as completed'", "'recorded as completed'"],
  'unplaced listed as happened': ["    if (d.done.length) h += list('done', d.done.map(doneRow));", "    if (d.done.length || d.unplaced.length) h += list('done', d.done.concat(d.unplaced).map(doneRow));"]
};

function main() {
  const { results, extracted } = checksFor(INDEX);
  Object.keys(MUTANTS).forEach(name => {
    const [from, to] = MUTANTS[name];
    if (INDEX.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html: ' + name);
    let caught;
    try {
      caught = checksFor(INDEX.replace(from, to)).results.some(r => !r.ok);
    } catch (e) {
      caught = true;
    }
    results.push({ group: 'MUTANTS — each detail defect is caught by the checks above', id: 'mutant.' + name.replace(/\s+/g, '-'),
      text: 'Caught: ' + name, ok: caught, detail: caught ? '' : 'every check still passed' });
  });

  let failed = 0;
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(26) + ' ' + r.text + (r.ok ? '' : '\n        ' + r.detail));
  });
  console.log('\nExtracted production functions: ' + extracted);
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
