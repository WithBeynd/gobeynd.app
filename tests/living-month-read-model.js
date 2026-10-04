#!/usr/bin/env node
'use strict';
/**
 * Beynd Living Month read model (P3-1) — dependency-free: node tests/living-month-read-model.js
 *
 * geodeLivingMonthModel and every production function it reaches are extracted from index.html (plus
 * js/geode-pure/01-foundation.js) and run in an isolated vm context under a simulated clock. Storage, the DOM, window,
 * save, persistence and recurrence are traps: the model must never reach them. Checks:
 *   - Monthly Left is mirrored exactly, and the plan reconciles: income − payments counted − budget = Monthly Left;
 *   - the payment pool Monthly Left counts is partitioned into done / ahead, completely, at the amounts it counts;
 *   - done evidence is a ledger completion or status_only; expenses are plan; income received is null, not 0;
 *   - nothing reports a cash position, received income, or missed / unpaid / failed without evidence;
 *   - expectation gaps are a summary only and change no figure;
 *   - a pending boundary, another schema, another month or an invalid clock returns the minimal safe model;
 *   - the model is pure: no write to the state at any depth, no storage, no DOM, no save, no sync, no reliance on S,
 *     identical repeated results, no output object shared with the state — and mutants that break this are caught.
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

/** What the harness calls directly; everything they reach is extracted transitively. */
const ENTRY_FUNCTIONS = ['geodeLivingMonthModel', 'geodeLivingMonthCalendar', 'calcMonthlyLeftover', 'sumPaymentsMonthlyOutflow',
  'sumExpensesMonthly', 'paymentCountsForMonthlyOutflow', 'geodeRecurrenceWouldMutateBoundary'];
const CONSTANTS = ['GEODE_SCHEMA_VERSION'];

/** Writers and boundary machinery a read model must never reach. Trapped ones are shimmed; the rest must not be extracted. */
const TRAPPED = ['save', 'persistGeodeToLocalStorage', 'syncRecurringPayments', 'geodeStoreFinancialState', 'render', 'appendActivityLog'];
const FORBIDDEN = /^(save|persistGeodeToLocalStorage|syncRecurringPayments|geodeStoreFinancialState|rollup\w*|geodeArchive\w*|geodeCapture\w*|geodeNormalize\w*|geodeSeed\w*|geodeRecord\w*|geodeAppend\w*|geodeEnsure\w*|geodeSchema\dTransition|geodeSchema2CommitTransition|geodeInvestmentAuthorityTransition|geodeRecomputeBalancesFromPayments|geodeNoteBoundaryHold|geodeClearBoundaryHold|geodePrepareFinancialMutation|togglePay|render\w*|appendActivityLog|setLastSnapshotBeforeChange|captureMonthlySnapshot)$/;

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

/** Every trap records here; a pure read records nothing. */
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
/** The page's live state. Tests set it to a decoy: the model must read only the state it is given. */
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
function buildProgram(src, extraEntries) {
  const base = SHIMS + '\n' + FOUNDATION + '\n' + CONSTANTS.map(n => extractConstant(src, n)).join('\n') + '\n';
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  new vm.Script(base).runInContext(probe);
  const have = new Map();
  const queue = ENTRY_FUNCTIONS.concat(extraEntries || []);
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || vm.runInContext('typeof ' + n, probe) !== 'undefined') continue;
    const f = extractFunction(src, n);
    have.set(n, f);
    calledNames(f.text).forEach(c => queue.push(c));
  }
  const code = base + [...have.values()].map(f => f.text).join('\n') + '\n';
  return { script: new vm.Script(code, { filename: 'living-month-program.js' }), extracted: [...have.keys()] };
}

function newContext(program) {
  const ctx = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  program.script.runInContext(ctx);
  return ctx;
}

// ───────────────────────────── observation helpers ─────────────────────────────

/** Order-sensitive canonical text of a value: keys, undefined, NaN and types included. */
function canon(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : Object.is(v, -0) ? '-0' : String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

/** A recursive proxy that logs every write at any depth: set, define, delete, prototype change, preventExtensions. */
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
      deleteProperty(t, k) { log.push('delete ' + at + '.' + String(k)); return Reflect.deleteProperty(t, k); },
      setPrototypeOf(t) { log.push('setPrototypeOf ' + at); return false; },
      preventExtensions(t) { log.push('preventExtensions ' + at); return Reflect.preventExtensions(t); }
    });
    cache.set(obj, p);
    return p;
  }
  return wrap(root, 'state');
}

function objectsIn(v, set) {
  if (v === null || typeof v !== 'object' || set.has(v)) return set;
  set.add(v);
  Object.keys(v).forEach(k => objectsIn(v[k], set));
  return set;
}

/** Every key and string value in the model (keys as k:name, values as v:text). */
function words(v, out) {
  out = out || [];
  if (typeof v === 'string') out.push('v:' + v);
  else if (v !== null && typeof v === 'object') Object.keys(v).forEach(k => { out.push('k:' + k); words(v[k], out); });
  return out;
}

const at = (y, m, d, h) => new Date(y, m - 1, d, h == null ? 12 : h).getTime();
const NOW = at(2026, 10, 15);

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
const expense = (id, amount, rec, date) => ({ id, name: id, amount, cat: 'Bills', date, rec });

const FIXTURES = {
  'A.fixed-income': () => base({
    payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20')],
    billPaymentEvents: [billEvent('rent', 1200, '2026-10', at(2026, 10, 1, 9))],
    expenses: [expense('groceries', 400, 'yes', '2026-10-01'), expense('insurance', 600, 'annual', '2027-03-01')]
  }),
  'B.irregular-income': () => base({ income: 1600, incomeType: 'irregular', payments: [bill('rent', 900, '2026-10-25')] }),
  'C.no-income': () => base({ income: 0, incomeExplicitlySet: false, incomeType: 'none', incomeTypeUserSet: false, payments: [bill('phone', 50, '2026-10-20')] }),
  'D.monthly-upcoming': () => base({ payments: [bill('phone', 40, '2026-10-20'), bill('gym', 30, '2026-10-05')] }),
  'E.monthly-completed': () => base({
    payments: [paidMonthly('rent', 1200, '2026-10-01'), paidMonthly('water', 35, '2026-10-03')],
    billPaymentEvents: [billEvent('rent', 1200, '2026-10', at(2026, 10, 1, 9))]
  }),
  'F.paid-different-amount': () => base({
    payments: [paidMonthly('energy', 60, '2026-10-08', { lastPaidAmount: 75 })],
    billPaymentEvents: [billEvent('energy', 75, '2026-10', at(2026, 10, 8, 9))]
  }),
  'G.debt-payment': () => base({
    debts: [{ id: 'd1', name: 'Card', balance: 5000, apr: 20, minp: 150 }],
    payments: [paidMonthly('card', 200, '2026-10-02', { debtId: 'd1' }), bill('card-extra', 100, '2026-10-25', { rec: 'no', debtId: 'd1' })],
    debtPaymentEvents: [{ id: 'dpe_1', eventType: 'completion', paymentId: 'card', debtId: 'd1', amount: 200, occurrenceYm: '2026-10',
      recordedAt: at(2026, 10, 2, 9), dueDateSnapshot: '2026-10-02', debtNameSnapshot: 'Card', paymentNameSnapshot: 'card', recurrenceSnapshot: 'monthly', source: 'mark_completed' }]
  }),
  'H.goal-contribution': () => base({
    goals: [{ id: 'g1', name: 'Holiday', target: 2000, saved: 400, baseSaved: 300 }],
    payments: [paidMonthly('save-holiday', 100, '2026-10-04', { goalId: 'g1' }), bill('save-extra', 50, '2026-10-28', { goalId: 'g1' })],
    contributionEvents: [{ id: 'ce_1', eventType: 'completion', paymentId: 'save-holiday', entityType: 'goal', entityId: 'g1', occurrenceYm: '2026-10',
      amount: 100, recurrence: 'monthly', dueDateSnapshot: '2026-10-04', recordedAt: at(2026, 10, 4, 9), source: 'mark_completed' }]
  }),
  'I.investment-contribution': () => base({
    investments: [{ id: 'i1', name: 'ISA', balance: 5150, baseBalance: 5000,
      valuations: [{ id: 'val_1', value: 5000, date: '2026-09-01', recordedAt: at(2026, 9, 1, 9), source: 'manual' }] }],
    payments: [paidMonthly('isa', 150, '2026-10-06', { investId: 'i1' })],
    contributionEvents: [{ id: 'ce_2', eventType: 'completion', paymentId: 'isa', entityType: 'investment', entityId: 'i1', occurrenceYm: '2026-10',
      amount: 150, recurrence: 'monthly', dueDateSnapshot: '2026-10-06', recordedAt: at(2026, 10, 6, 9), source: 'mark_completed' }]
  }),
  'J.annual-due-this-month': () => base({ payments: [bill('tv-licence', 170, '2026-10-28', { rec: 'annual' })] }),
  'K.annual-not-due': () => base({ payments: [bill('car-tax', 190, '2027-02-10', { rec: 'annual' }), bill('phone', 40, '2026-10-20')] }),
  'L.one-off-this-month': () => base({
    payments: [bill('repair', 80, '2026-10-22', { rec: 'no' }), bill('ticket', 45, '2026-10-03', { rec: 'no', status: 'paid' })],
    billPaymentEvents: [billEvent('ticket', 45, '2026-10', at(2026, 10, 3, 9), { recurrenceSnapshot: 'one_off', dueDateSnapshot: '2026-10-03' })]
  }),
  'M.overdue-one-off': () => base({ payments: [bill('dentist', 90, '2026-09-20', { rec: 'no' }), bill('phone', 40, '2026-10-20')] }),
  'N.lapsed-voluntary-one-off': () => base({
    goals: [{ id: 'g1', name: 'Holiday', target: 2000, saved: 0, baseSaved: 0 }],
    payments: [bill('one-off-save', 150, '2026-09-05', { rec: 'no', goalId: 'g1' }), bill('phone', 40, '2026-10-20')]
  }),
  'O.undated': () => base({ payments: [bill('streaming', 25, ''), bill('gift', 30, '', { rec: 'no', status: 'paid' })] }),
  'P.release': () => base({
    goals: [{ id: 'g1', name: 'Buffer', target: 3000, saved: 1200, baseSaved: 1500 }],
    payments: [bill('phone', 40, '2026-10-20')],
    savingsReleases: [
      { id: 'rel_oct', sourceType: 'goal', sourceId: 'g1', amount: 300, reason: 'emergency', date: '2026-10-08', ym: '2026-10', relatedYm: '2026-10',
        remainingBalance: 1200, createdAt: at(2026, 10, 8, 10), confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' },
      { id: 'rel_sep', sourceType: 'goal', sourceId: 'g1', amount: 100, reason: 'manual', date: '2026-09-12', ym: '2026-09', relatedYm: '2026-09',
        remainingBalance: 1500, createdAt: at(2026, 9, 12, 10), confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' },
      { id: 'rel_unconfirmed', sourceType: 'goal', sourceId: 'g1', amount: 50, reason: 'manual', date: '2026-10-09', ym: '2026-10', relatedYm: '2026-10',
        remainingBalance: 1200, createdAt: at(2026, 10, 9, 10), confirmedByUser: false, note: '', balanceMutationMode: 'event_derived' }
    ]
  }),
  'Q.valuation': () => base({
    investments: [{ id: 'i1', name: 'ISA', balance: 5400, baseBalance: 5000, valuations: [
      { id: 'val_legacy', value: 5000, date: '2026-10-01', recordedAt: at(2026, 10, 1, 8), source: 'legacy_transition' },
      { id: 'val_sep', value: 5100, date: '2026-09-01', recordedAt: at(2026, 9, 1, 8), source: 'manual' },
      { id: 'val_oct', value: 5400, date: '2026-10-12', recordedAt: at(2026, 10, 12, 8), source: 'manual' }] }]
  }),
  'R.earlier-gaps': () => base({
    payments: [bill('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20')],
    expectationGaps: [
      { id: 'gap_rent_2026-07', domain: 'bill', targetId: 'rent', paymentId: 'rent', recurrence: 'monthly', fromYm: '2026-07', toYm: '2026-09',
        expectedAmount: 1200, dueDay: 1, templateNameSnapshot: 'rent', targetNameSnapshot: '', seenYm: '2026-06', capturedAt: at(2026, 10, 1, 8), capturedBy: 'rev_x', source: 'month_boundary' }
    ],
    billPaymentEvents: [billEvent('rent', 1200, '2026-08', at(2026, 10, 2, 9))]
  }),
  'S.long-absence-reconciled': () => base({
    payments: [bill('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20'), bill('card', 150, '2026-10-12', { debtId: 'd1' })],
    debts: [{ id: 'd1', name: 'Card', balance: 4000 }],
    expenses: [expense('groceries', 400, 'yes', '2026-10-01')],
    expectationGaps: ['rent', 'phone', 'card'].map(pid => ({ id: 'gap_' + pid + '_2025-11', domain: pid === 'card' ? 'debt' : 'bill', targetId: pid, paymentId: pid,
      recurrence: 'monthly', fromYm: '2025-11', toYm: '2026-09', expectedAmount: 100, dueDay: 1, templateNameSnapshot: pid, targetNameSnapshot: '',
      seenYm: '2025-10', capturedAt: at(2026, 10, 1, 8), capturedBy: 'rev_x', source: 'month_boundary' }))
  })
};

/** Boundary pending / held: states the boundary engine has not processed for October yet. */
const PENDING = {
  'T.unpaid-monthly-behind': () => base({ payments: [bill('rent', 1200, '2026-09-01')] }),
  'T.paid-monthly-last-month': () => base({ payments: [bill('rent', 1200, '2026-10-01', { status: 'paid', lastPaidYM: '2026-09', lastPaidAmount: 1200, lastPaidDueDate: '2026-09-01' })] }),
  'T.expired-one-off-expense': () => base({ expenses: [expense('party', 120, 'no', '2026-09-14')] }),
  'T.long-absence-unprocessed': () => base({ payments: [bill('rent', 1200, '2025-10-01'), bill('phone', 40, '2025-10-20')] })
};

// ───────────────────────────── checks ─────────────────────────────

const results = [];
let group = '';
function check(id, text, actual, expected) {
  const ok = canon(actual) === canon(expected);
  results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
}
function section(name) { group = name; }

function main() {
  const program = buildProgram(INDEX, ['geodeMonthBaselineFromModel']);
  const ctx = newContext(program);
  const parse = obj => ctx.__parse(JSON.stringify(obj));
  const vmDate = ms => vm.runInContext('new Date(' + ms + ')', ctx);
  function setClock(ms) { vm.runInContext('__nowMs = ' + ms + ';', ctx); }
  function trapLog() { return JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', ctx)); }
  function clearTraps() { vm.runInContext('__trapLog = [];', ctx); }
  function model(state, nowMs) {
    clearTraps();
    return ctx.geodeLivingMonthModel(state, vmDate(nowMs == null ? NOW : nowMs));
  }

  section('STATIC — the read model reaches no writer, storage, DOM or substitute baseline');
  const lmSources = INDEX.match(/\nfunction geodeLivingMonth\w+\([\s\S]*?\n\}/g) || [];
  check('static.functions', 'index.html declares the model and its helpers once each',
    lmSources.map(s => s.match(/function (\w+)/)[1]).sort(),
    ['geodeLivingMonthCalendar', 'geodeLivingMonthChanges', 'geodeLivingMonthComponents', 'geodeLivingMonthEarlierGaps', 'geodeLivingMonthEvidenceIndex', 'geodeLivingMonthExpenses', 'geodeLivingMonthHappened',
      'geodeLivingMonthIncome', 'geodeLivingMonthModel', 'geodeLivingMonthPaymentEvidence', 'geodeLivingMonthPaymentItem', 'geodeLivingMonthReceipts']);
  const lmText = lmSources.join('\n').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  check('static.words', 'Model code names no storage, DOM, save, sync, snapshot, confirmed-only figure, activity log or wall clock',
    ['localStorage', 'sessionStorage', 'document', 'window', 'save(', 'persistGeodeToLocalStorage', 'syncRecurringPayments', 'lastSnapshot',
      '_pendingCompareBaseline', 'calcMonthlyLeftoverConfirmedOnly', 'activityLog', 'Date.now', 'new Date()'].filter(w => lmText.indexOf(w) >= 0)
      .concat(/(?<![\w$.])S\b/.test(lmText) ? ['S'] : []), []);
  check('static.closure', 'No writer or boundary-engine function is in the extracted dependency closure',
    program.extracted.filter(n => FORBIDDEN.test(n)), []);
  check('static.trapped', 'The trapped writers are shims, never production code', TRAPPED.filter(n => program.extracted.indexOf(n) >= 0), []);
  check('static.monthly-left', 'calcMonthlyLeftover is the Phase-1 formula, unchanged',
    extractFunction(INDEX, 'calcMonthlyLeftover').text.replace(/\s+/g, ' '),
    'function calcMonthlyLeftover(state) { if (!state) return 0; var income = toNum(state.income); // Plan: scheduled + completed outflows (cash-flow plan view). return income - sumPaymentsMonthlyOutflow(state.payments || []) - sumExpensesMonthly(state.expenses || []); }');

  // Generic invariants for a ready fixture; returns the model for fixture-specific checks.
  function invariants(id, raw, opts) {
    opts = opts || {};
    setClock(opts.clock || NOW);
    vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(base({ income: 99999, payments: [bill('decoy', 777, '2026-10-02')] }))) + ');', ctx);
    const state = parse(raw);
    const before = canon(state);
    const writes = [];
    const m = model(writeTrap(state, writes), opts.now);
    const traps = trapLog();
    check(id + '.status', 'Ready, non-authoritative', [m.status, m.authoritative, m.kind], ['ready', false, 'living_month']);
    check(id + '.pure', 'No write to the state at any depth, no trap reached, state deep-equal after', [writes, traps, canon(state) === before], [[], [], true]);
    const ml = ctx.calcMonthlyLeftover(state);
    check(id + '.monthly-left', 'plan.monthlyLeft === calcMonthlyLeftover(state); planRemainder is the same figure',
      [m.plan.monthlyLeft === ml, m.available.planRemainder === ml], [true, true]);
    check(id + '.plan', 'incomePlanned − paymentsCountedTotal − budgetTotal === monthlyLeft (exact)',
      m.plan.incomePlanned - m.plan.paymentsCountedTotal - m.plan.budgetTotal === m.plan.monthlyLeft, true);
    const counted = ctx.sumPaymentsMonthlyOutflow(state.payments);
    check(id + '.partition', 'doneTotal + aheadTotal === sumPaymentsMonthlyOutflow(state.payments), and countedTotal is that figure',
      [m.payments.doneTotal + m.payments.aheadTotal === counted, m.payments.countedTotal === counted, m.plan.paymentsCountedTotal === counted], [true, true, true]);
    const pool = state.payments.filter(p => ctx.paymentCountsForMonthlyOutflow(p)).map(p => p.id).sort();
    check(id + '.pool', 'Every payment Monthly Left counts appears exactly once; nothing else appears',
      m.payments.done.concat(m.payments.ahead).map(x => x.id).sort(), pool);
    check(id + '.amounts', 'Each item\'s amount is exactly geodePaymentMonthAmount(row), the amount Monthly Left counts',
      m.payments.done.concat(m.payments.ahead).filter(x => x.amount !== ctx.geodePaymentMonthAmount(state.payments.filter(p => p.id === x.id)[0])).map(x => x.id), []);
    const unplacedRows = state.payments.filter(p => p.status === 'paid' && p.rec !== 'yes' && p.rec !== 'annual' &&
      !ctx.paymentCountsForMonthlyOutflow(p) && !ctx.geodePaymentOneOffOccurrenceYm(p)).map(p => p.id).sort();
    check(id + '.unplaced', 'Unplaced lists exactly the paid one-offs with no known month (none counted), each completed_month_unknown, outside done / ahead',
      [m.payments.unplaced.map(x => x.id).sort(), m.payments.unplaced.every(x => x.state === 'completed_month_unknown'),
        m.payments.unplaced.filter(x => pool.indexOf(x.id) >= 0).length], [unplacedRows, true, 0]);
    check(id + '.budget', 'Budget total === sumExpensesMonthly(state.expenses); every expense line is plan',
      [m.expenses.budgetTotal === ctx.sumExpensesMonthly(state.expenses), m.plan.budgetTotal === m.expenses.budgetTotal,
        m.expenses.items.every(e => e.basis === 'plan'), m.expenses.basis], [true, true, true, 'plan']);
    check(id + '.unknowns', 'No receipt recorded (none_recorded): income received / outstanding and received coverage are null (not 0) — coverage has no opening position; change has no baseline',
      [m.income.state, m.income.received, m.income.outstanding, m.available.receivedCoverage, m.available.reason, m.changes.available, m.changes.reason],
      ['none_recorded', null, null, null, 'no_opening_position', false, 'no_month_baseline']);
    const noGaps = parse(Object.assign({}, raw, { expectationGaps: [] }));
    const mg = model(noGaps, opts.now);
    check(id + '.gaps-inert', 'Removing every expectation gap changes no figure, partition, budget or availability',
      canon([mg.plan, mg.payments, mg.expenses, mg.available]), canon([m.plan, m.payments, m.expenses, m.available]));
    const w = words(m);
    check(id + '.epistemic', 'No key or value claims cash, a bank figure, spending, a payment date, or missed / unpaid / failed',
      w.filter(x => /^k:.*(cash|bank|paidon|paidat|transactiondate|spent|actual|disposable)/i.test(x) ||
        /^v:.*\b(missed|unpaid|failed|spent|cash|received)\b/i.test(x)), []);
    check(id + '.repeat', 'A second call returns an equivalent model', canon(model(state, opts.now)), canon(m));
    const stateObjects = objectsIn(state, new Set());
    check(id + '.aliasing', 'No object in the model is an object of the state', [...objectsIn(m, new Set())].filter(o => stateObjects.has(o)).length, 0);
    return m;
  }

  const byId = (m, pid) => m.payments.done.concat(m.payments.ahead).filter(x => x.id === pid)[0];
  const brief = x => x ? [x.kind, x.nature, x.state, x.amount, x.evidence] : null;

  section('FINANCIAL MATRIX — A to S, each against every invariant');
  let m = invariants('A', FIXTURES['A.fixed-income']());
  check('A.figures', 'Fixed income: 3000 − (1200 + 40) − (400 + 600/12) = 1310', [m.plan.monthlyLeft, m.payments.doneTotal, m.payments.aheadTotal, m.plan.budgetTotal], [1310, 1200, 40, 450]);
  check('A.items', 'Rent done with ledger evidence; phone scheduled', [brief(byId(m, 'rent')), brief(byId(m, 'phone'))],
    [['bill', 'scheduled_outgoing', 'completed_this_month', 1200, 'ledger'], ['bill', 'scheduled_outgoing', 'scheduled', 40, null]]);
  check('A.income', 'Stable plan, no receipt evidence', [m.income.planned, m.income.type, m.income.certainty], [3000, 'stable', 'stable_plan']);

  m = invariants('B', FIXTURES['B.irregular-income']());
  check('B.income', 'Irregular plan: planned and type only', [m.income.planned, m.income.type, m.income.certainty, m.plan.incomeType], [1600, 'irregular', 'irregular_plan', 'irregular']);

  m = invariants('C', FIXTURES['C.no-income']());
  check('C.income', 'No income plan: Monthly Left is −50, received still null (not 0)', [m.plan.monthlyLeft, m.income.planned, m.income.type, m.income.certainty, m.income.explicitlySet, m.income.received],
    [-50, 0, 'none', 'no_income_plan', false, null]);

  m = invariants('D', FIXTURES['D.monthly-upcoming']());
  check('D.items', 'Due on the 20th: scheduled; due on the 5th with nothing recorded: due_no_outcome_recorded', [byId(m, 'phone').state, byId(m, 'gym').state],
    ['scheduled', 'due_no_outcome_recorded']);

  m = invariants('E', FIXTURES['E.monthly-completed']());
  check('E.items', 'Completed with a ledger completion: ledger; completed with none: status_only (no evidence invented)',
    [brief(byId(m, 'rent')), brief(byId(m, 'water')), byId(m, 'rent').evidenceRef, byId(m, 'water').evidenceRef],
    [['bill', 'scheduled_outgoing', 'completed_this_month', 1200, 'ledger'], ['bill', 'scheduled_outgoing', 'completed_this_month', 35, 'status_only'],
      { source: 'billPaymentEvents', eventId: 'bpe_rent_2026-10_c1', occurrenceYm: '2026-10', recordedAt: at(2026, 10, 1, 9) }, null]);
  check('E.due-date', 'A completed row reports the occurrence it settled (lastPaidDueDate), not its advanced next date',
    [byId(m, 'rent').dueDate, byId(m, 'rent').dueYm], ['2026-10-01', '2026-10']);

  m = invariants('F', FIXTURES['F.paid-different-amount']());
  check('F.amount', 'Paid at 75 against a 60 template: counted at 75 (lastPaidAmount), template kept apart', [byId(m, 'energy').amount, byId(m, 'energy').templateAmount, m.plan.monthlyLeft],
    [75, 60, 2925]);

  m = invariants('G', FIXTURES['G.debt-payment']());
  check('G.items', 'Debt rows: kind debt, scheduled outgoing; the paid one has debt-ledger evidence', [brief(byId(m, 'card')), brief(byId(m, 'card-extra')), byId(m, 'card').evidenceRef.source],
    [['debt', 'scheduled_outgoing', 'completed_this_month', 200, 'ledger'], ['debt', 'scheduled_outgoing', 'scheduled', 100, null], 'debtPaymentEvents']);
  check('G.happened', 'The settlement is a recorded event, timed by recordedAt only', m.happened.map(e => [e.type, e.domain, e.amount, e.entityId, e.timeBasis, e.eventDate, e.recordedBy]),
    [['settlement_recorded', 'debt', 200, 'd1', 'recorded_at', null, 'user']]);

  m = invariants('H', FIXTURES['H.goal-contribution']());
  check('H.items', 'Goal contributions are allocations, not obligations', [brief(byId(m, 'save-holiday')), brief(byId(m, 'save-extra'))],
    [['goal_contribution', 'allocation', 'completed_this_month', 100, 'ledger'], ['goal_contribution', 'allocation', 'scheduled', 50, null]]);

  m = invariants('I', FIXTURES['I.investment-contribution']());
  check('I.items', 'Investment contribution: allocation with contribution-ledger evidence', [brief(byId(m, 'isa')), byId(m, 'isa').evidenceRef.source],
    [['investment_contribution', 'allocation', 'completed_this_month', 150, 'ledger'], 'contributionEvents']);
  check('I.happened', 'The contribution is a recorded event for the investment', m.happened.map(e => [e.type, e.domain, e.entityId, e.amount]), [['contribution_recorded', 'investment', 'i1', 150]]);

  m = invariants('J', FIXTURES['J.annual-due-this-month']());
  check('J.items', 'Annual row due this month: counted in full, scheduled', [brief(byId(m, 'tv-licence')), byId(m, 'tv-licence').recurrence], [['bill', 'scheduled_outgoing', 'scheduled', 170, null], 'annual']);

  m = invariants('K', FIXTURES['K.annual-not-due']());
  check('K.items', 'Annual row due in February: not counted, not in the model', [byId(m, 'car-tax'), m.plan.monthlyLeft], [undefined, 2960]);

  m = invariants('L', FIXTURES['L.one-off-this-month']());
  check('L.items', 'One-off due this month: scheduled; one-off settled this month: done with ledger evidence',
    [brief(byId(m, 'repair')), brief(byId(m, 'ticket')), byId(m, 'ticket').recurrence], [['bill', 'scheduled_outgoing', 'scheduled', 80, null], ['bill', 'scheduled_outgoing', 'completed_this_month', 45, 'ledger'], 'one_off']);

  m = invariants('M', FIXTURES['M.overdue-one-off']());
  check('M.items', 'One-off due in September and still counted: outstanding_from_earlier (not "missed")', [brief(byId(m, 'dentist')), m.plan.monthlyLeft],
    [['bill', 'scheduled_outgoing', 'outstanding_from_earlier', 90, null], 2870]);

  m = invariants('N', FIXTURES['N.lapsed-voluntary-one-off']());
  check('N.items', 'Lapsed voluntary one-off: Monthly Left does not count it, so the model does not list it', [byId(m, 'one-off-save'), m.plan.monthlyLeft], [undefined, 2960]);

  m = invariants('O', FIXTURES['O.undated']());
  check('O.items', 'Undated rows (P3-1B): unpaid is counted and undated; paid with no known month is not counted — unplaced, completed_month_unknown, status_only',
    [brief(byId(m, 'streaming')), brief(byId(m, 'gift')), m.payments.unplaced.map(brief), m.plan.monthlyLeft],
    [['bill', 'scheduled_outgoing', 'undated', 25, null], null, [['bill', 'scheduled_outgoing', 'completed_month_unknown', 30, 'status_only']], 2975]);

  m = invariants('P', FIXTURES['P.release']());
  const pNoRelease = model(parse(Object.assign(FIXTURES['P.release'](), { savingsReleases: [] })));
  check('P.happened', 'Only the confirmed October release appears, dated by its own date and recordedAt kept apart',
    m.happened.map(e => [e.id, e.type, e.domain, e.amount, e.eventDate, e.timeBasis, e.recordedAt]), [['rel_oct', 'release', 'goal', 300, '2026-10-08', 'release_date', at(2026, 10, 8, 10)]]);
  check('P.flow', 'A release changes no plan figure (Monthly Left is flow, not state)', canon([m.plan, m.payments, m.available]), canon([pNoRelease.plan, pNoRelease.payments, pNoRelease.available]));

  m = invariants('Q', FIXTURES['Q.valuation']());
  check('Q.happened', 'The October manual valuation appears as a level (value, not amount); the legacy anchor and September do not',
    m.happened.map(e => [e.id, e.type, e.amount, e.value, e.eventDate, e.timeBasis]), [['val_oct', 'valuation', null, 5400, '2026-10-12', 'valuation_date']]);

  m = invariants('R', FIXTURES['R.earlier-gaps']());
  check('R.earlier', 'July and September stay expected_no_recorded_outcome; August has a settlement and is not a gap',
    m.earlier, { basis: 'evidence_only', gapCount: 2, gapMonths: ['2026-07', '2026-09'] });
  check('R.no-catch-up', 'Rent counts once this month (1200), not once per earlier month', [byId(m, 'rent').amount, m.plan.monthlyLeft], [1200, 1760]);
  check('R.late-settlement', 'August\'s settlement, tapped in October, is listed as outside this month\'s occurrence',
    m.happened.map(e => [e.occurrenceYm, e.occurrenceInMonth, e.recordedBy]), [['2026-08', false, 'user']]);

  m = invariants('S', FIXTURES['S.long-absence-reconciled']());
  check('S.earlier', 'Eleven months × three rows are summarised as evidence only', [m.earlier.gapCount, m.earlier.gapMonths.length, m.earlier.gapMonths[0], m.earlier.gapMonths[10]],
    [33, 11, '2025-11', '2026-09']);
  check('S.no-catch-up', 'This month counts each row once: 3000 − (1200 + 40 + 150) − 400 = 1210', [m.plan.monthlyLeft, m.payments.aheadTotal, m.month.boundaryPending], [1210, 1390, false]);

  section('P3-1B — paid one-off occurrence month and evidence by each ledger\'s own key');
  const NOV = at(2026, 11, 15);
  const G1 = () => [{ id: 'g1', name: 'Holiday', target: 2000, saved: 0, baseSaved: 0 }];
  const D1 = () => [{ id: 'd1', name: 'Card', balance: 5000, apr: 20, minp: 150 }];
  const I1 = () => [{ id: 'i1', name: 'ISA', balance: 5000, baseBalance: 5000,
    valuations: [{ id: 'val_1', value: 5000, date: '2026-09-01', recordedAt: at(2026, 9, 1, 9), source: 'manual' }] }];
  const cev = (pid, entityType, entityId, occ, due) => ({ id: 'ce_' + pid, eventType: 'completion', paymentId: pid, entityType, entityId,
    occurrenceYm: occ, amount: 100, recurrence: 'one_off', dueDateSnapshot: due, recordedAt: at(2026, 10, 3, 9), source: 'mark_completed' });
  const dpe = (pid, occ, due) => ({ id: 'dpe_' + pid, eventType: 'completion', paymentId: pid, debtId: 'd1', amount: 100, occurrenceYm: occ,
    recordedAt: at(2026, 10, 3, 9), dueDateSnapshot: due, debtNameSnapshot: 'Card', paymentNameSnapshot: pid, recurrenceSnapshot: 'one_off', source: 'mark_completed' });
  const oneOff = (id, date, extra) => bill(id, 100, date, Object.assign({ rec: 'no', status: 'paid' }, extra || {}));
  const where = (m, pid) => ['done', 'ahead', 'unplaced'].filter(k => m.payments[k].some(x => x.id === pid))[0] || 'absent';
  const anyItem = (m, pid) => m.payments.done.concat(m.payments.ahead, m.payments.unplaced).filter(x => x.id === pid)[0];
  const evid = (m, pid) => { const x = anyItem(m, pid); return x ? [where(m, pid), x.state, x.evidence, x.evidenceRef && x.evidenceRef.source, x.evidenceRef && x.evidenceRef.occurrenceYm] : ['absent']; };

  const sepOct = base({ goals: G1(), payments: [oneOff('trip', '2026-09-20', { goalId: 'g1', contributionEventId: 'ce_trip' })],
    contributionEvents: [cev('trip', 'goal', 'g1', '2026-10', '2026-09-20')] });
  m = invariants('P31B.due-sep-done-oct', sepOct);
  const sepState = parse(sepOct);
  const sepRow = sepState.payments[0];
  check('P31B.due-sep-done-oct', 'Due September, completed October: the October completion is found by the contribution ledger\'s own rule (a due-month key would ask for September and find nothing); Monthly Left still follows the due date, so October does not count it, and October\'s happened lists the completion',
    [ctx.geodeContributionOccurrenceYm(sepRow), (ctx.geodeLivingMonthPaymentEvidence(sepRow, ctx.geodeLivingMonthEvidenceIndex(sepState), sepState) || {}).occurrenceYm,
      where(m, 'trip'), m.plan.monthlyLeft, m.happened.map(e => [e.id, e.occurrenceYm, e.occurrenceInMonth])],
    ['2026-09', '2026-10', 'absent', 3000, [['ce_trip', '2026-10', true]]]);

  m = invariants('P31B.due-nov-done-oct', base({ goals: G1(), payments: [oneOff('trip', '2026-11-20', { goalId: 'g1', contributionEventId: 'ce_trip' })],
    contributionEvents: [cev('trip', 'goal', 'g1', '2026-10', '2026-11-20')] }), { clock: NOV, now: NOV });
  check('P31B.due-nov-done-oct', 'Due November, completed early in October, viewed in November: counted in November by its due date, and its evidence is the October ledger completion — not status_only',
    [evid(m, 'trip'), m.plan.monthlyLeft], [['done', 'completed_this_month', 'ledger', 'contributionEvents', '2026-10'], 2900]);

  m = invariants('P31B.due-oct-done-oct', base({ goals: G1(), payments: [oneOff('trip', '2026-10-05', { goalId: 'g1', contributionEventId: 'ce_trip' })],
    contributionEvents: [cev('trip', 'goal', 'g1', '2026-10', '2026-10-05')] }));
  check('P31B.due-oct-done-oct', 'Due and completed in October: done this month with the October completion', [evid(m, 'trip'), m.plan.monthlyLeft],
    [['done', 'completed_this_month', 'ledger', 'contributionEvents', '2026-10'], 2900]);

  const stamped = base({ goals: G1(), payments: [oneOff('trip', '', { goalId: 'g1', lastPaidYM: '2026-10', contributionEventId: 'ce_trip' })],
    contributionEvents: [cev('trip', 'goal', 'g1', '2026-10', '')] });
  m = invariants('P31B.undated-stamped-oct', stamped);
  check('P31B.undated-stamped-oct', 'Undated, completed in October (stamped): done this month with its October completion', [evid(m, 'trip'), m.plan.monthlyLeft],
    [['done', 'completed_this_month', 'ledger', 'contributionEvents', '2026-10'], 2900]);
  m = invariants('P31B.undated-stamped-oct.nov', stamped, { clock: NOV, now: NOV });
  check('P31B.undated-stamped-oct.nov', 'The same row in November: its month is known and is not November — not counted, not unplaced',
    [where(m, 'trip'), m.plan.monthlyLeft], ['absent', 3000]);

  m = invariants('P31B.undated-unstamped-evidence', base({ goals: G1(), payments: [oneOff('trip', '', { goalId: 'g1', contributionEventId: 'ce_trip' })],
    contributionEvents: [cev('trip', 'goal', 'g1', '2026-10', '')] }));
  check('P31B.undated-unstamped-evidence', 'Undated, no stamp (completed before P3-1B) but an October completion exists: evidence is recognised, counting is not changed by it — unplaced, not in Monthly Left',
    [evid(m, 'trip'), m.plan.monthlyLeft], [['unplaced', 'completed_month_unknown', 'ledger', 'contributionEvents', '2026-10'], 3000]);

  const carryRaw = base({ goals: G1(), payments: [oneOff('lc', '', { goalId: 'g1' })],
    contributionCarry: [{ id: 'carry_lc', paymentId: 'lc', entityType: 'goal', entityId: 'g1', kind: 'undated_contribution', amount: 100,
      recurrence: 'one_off', dueDateSnapshot: '', createdAt: at(2026, 6, 1, 9), source: 'schema2_transition' }] });
  m = invariants('P31B.legacy-carry', carryRaw);
  check('P31B.legacy-carry', 'Legacy undated carry: known effect, unknown month — unplaced, status_only, never dated; the carry is untouched (purity checks) and no month counts it',
    [evid(m, 'lc'), m.plan.monthlyLeft, m.happened.length], [['unplaced', 'completed_month_unknown', 'status_only', null, null], 3000, 0]);

  m = invariants('P31B.bill-undated-restored-event', base({ payments: [oneOff('gift', '')],
    billPaymentEvents: [billEvent('gift', 100, '2026-10', at(2026, 10, 3, 9), { recurrenceSnapshot: 'one_off' })] }));
  check('P31B.bill-undated-restored-event', 'Undated bill with a restored October bill event: the bill ledger keys by the due month and the row names none — status_only, unplaced, not counted',
    [evid(m, 'gift'), m.plan.monthlyLeft], [['unplaced', 'completed_month_unknown', 'status_only', null, null], 3000]);

  m = invariants('P31B.bill-undated-stamped', base({ payments: [oneOff('gift', '', { lastPaidYM: '2026-10' })] }));
  check('P31B.bill-undated-stamped', 'Undated bill completed in October (stamped): counted in October; no bill evidence can exist — status_only',
    [evid(m, 'gift'), m.plan.monthlyLeft], [['done', 'completed_this_month', 'status_only', null, null], 2900]);

  m = invariants('P31B.debt-undated-stamped', base({ debts: D1(), payments: [oneOff('extra', '', { debtId: 'd1', lastPaidYM: '2026-10' })] }));
  check('P31B.debt-undated-stamped', 'Undated debt payment completed in October (stamped): counted in October; the debt ledger records no undated occurrence — status_only',
    [evid(m, 'extra'), m.plan.monthlyLeft], [['done', 'completed_this_month', 'status_only', null, null], 2900]);

  m = invariants('P31B.debt-pointer', base({ debts: D1(), payments: [oneOff('extra', '2026-11-20', { debtId: 'd1', debtPaymentCompletionEventId: 'dpe_extra' })],
    debtPaymentEvents: [dpe('extra', '2026-10', '2026-10-20')] }), { clock: NOV, now: NOV });
  check('P31B.debt-pointer', 'Debt one-off completed in October, date later edited to November: found by its completion pointer, as the debt reversal finds it',
    [evid(m, 'extra'), m.plan.monthlyLeft], [['done', 'completed_this_month', 'ledger', 'debtPaymentEvents', '2026-10'], 2900]);

  m = invariants('P31B.investment-undated-stamped', base({ investments: I1(), payments: [oneOff('isa', '', { investId: 'i1', lastPaidYM: '2026-10', contributionEventId: 'ce_isa' })],
    contributionEvents: [cev('isa', 'investment', 'i1', '2026-10', '')] }));
  check('P31B.investment-undated-stamped', 'Undated investment contribution completed in October: done this month with its October completion',
    [evid(m, 'isa'), m.plan.monthlyLeft], [['done', 'completed_this_month', 'ledger', 'contributionEvents', '2026-10'], 2900]);

  m = invariants('P31B.stamp-earlier', base({ payments: [oneOff('gift', '', { lastPaidYM: '2026-09' })] }));
  check('P31B.stamp-earlier', 'Undated, completed in September (stamped), viewed in October: not counted and not unplaced', [where(m, 'gift'), m.plan.monthlyLeft], ['absent', 3000]);

  m = invariants('P31B.parser', base({ payments: [bill('ts-open', 25, '2026-10-05T09:00:00Z', { rec: 'no' }), oneOff('ts', '2026-10-05T09:00:00Z'),
    oneOff('slash', '2026/10/05'), oneOff('month', '2026-10'), oneOff('nul', null), oneOff('junk', 'garbage'), oneOff('feb30', '2026-02-30'), oneOff('ok', '2026-10-05')] }));
  check('P31B.parser', 'Payment dates are strictly YYYY-MM-DD calendar days: an unpaid timestamp row stays counted and reads undated (as Monthly Left treats it); every malformed paid row is unplaced; only the valid date counts',
    [['ts-open', 'ts', 'slash', 'month', 'nul', 'junk', 'feb30', 'ok'].map(pid => where(m, pid)), anyItem(m, 'ts-open').state, anyItem(m, 'ts-open').dueDate, m.plan.monthlyLeft],
    [['ahead', 'unplaced', 'unplaced', 'unplaced', 'unplaced', 'unplaced', 'unplaced', 'done'], 'undated', null, 2875]);

  section('BOUNDARY — a state the boundary has not processed returns the minimal safe model');
  const minimalKeys = ['kind', 'authoritative', 'status', 'reason', 'month', 'plan', 'income', 'available', 'payments', 'expenses', 'happened', 'earlier', 'changes'];
  Object.keys(PENDING).forEach(id => {
    setClock(NOW);
    const state = parse(PENDING[id]());
    const before = canon(state);
    const writes = [];
    const pm = model(writeTrap(state, writes));
    check(id, 'boundaryPending; no plan, partition, budget, events or gaps; unknowns stay null; nothing written or synced',
      [pm.status, pm.month.boundaryPending, pm.month.ym, pm.plan, pm.payments, pm.expenses, pm.happened, pm.earlier, pm.income.received, pm.income.planned,
        pm.available.planRemainder, pm.available.receivedCoverage, pm.changes.available, Object.keys(pm), writes, trapLog(), canon(state) === before],
      ['boundary_pending', true, '2026-10', null, null, null, null, null, null, null, null, null, false, minimalKeys, [], [], true]);
  });
  setClock(NOW);
  const heldState = parse(PENDING['T.unpaid-monthly-behind']());
  check('T.engine-untouched', 'The boundary engine stays where it was: the pending row is still dated September after the model ran',
    [model(heldState).status, heldState.payments[0].date, heldState.payments[0].status, heldState.expectationGaps.length], ['boundary_pending', '2026-09-01', 'upcoming', 0]);
  check('T.predicate-default', 'geodeRecurrenceWouldMutateBoundary() with no argument still reads the page state S',
    (function () { vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(PENDING['T.unpaid-monthly-behind']())) + ');', ctx);
      const a = ctx.geodeRecurrenceWouldMutateBoundary();
      vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(FIXTURES['A.fixed-income']())) + ');', ctx);
      return [a, ctx.geodeRecurrenceWouldMutateBoundary()]; })(), [true, false]);

  section('REFUSALS — another schema, another month, no clock, no state');
  setClock(NOW);
  const refusal = (raw, nowMs) => { const r = model(raw === null ? null : parse(raw), nowMs); return [r.status, r.plan, r.payments, r.income.received, r.available.receivedCoverage, r.month && r.month.boundaryPending]; };
  check('refuse.schema2', 'Schema 2 state: schema_not_current', refusal(Object.assign(FIXTURES['A.fixed-income'](), { _schemaVersion: 2 })), ['schema_not_current', null, null, null, null, null]);
  check('refuse.schema4', 'Newer schema 4 state: schema_not_current (never interpreted)', refusal(Object.assign(FIXTURES['A.fixed-income'](), { _schemaVersion: 4 })), ['schema_not_current', null, null, null, null, null]);
  check('refuse.month', 'A clock in November while the runtime is in October: clock_month_mismatch, boundary not evaluated',
    refusal(FIXTURES['A.fixed-income'](), at(2026, 11, 2)), ['clock_month_mismatch', null, null, null, null, null]);
  check('refuse.state', 'No state: invalid_state', refusal(null), ['invalid_state', null, null, null, null, null]);
  clearTraps();
  const bad = ctx.geodeLivingMonthModel(parse(FIXTURES['A.fixed-income']()), vmDate(NaN));
  check('refuse.clock', 'Invalid clock: invalid_clock, month null', [bad.status, bad.month, bad.plan], ['invalid_clock', null, null]);

  section('CALENDAR — supplied clock, local calendar');
  const calCases = [
    ['month-start', at(2026, 10, 1), ['2026-10', '2026-10-01', 1, 31, 30]],
    ['mid-month', at(2026, 10, 15), ['2026-10', '2026-10-15', 15, 31, 16]],
    ['month-end', at(2026, 10, 31, 23), ['2026-10', '2026-10-31', 31, 31, 0]],
    ['january', at(2027, 1, 31), ['2027-01', '2027-01-31', 31, 31, 0]],
    ['february', at(2027, 2, 14), ['2027-02', '2027-02-14', 14, 28, 14]],
    ['leap-february', at(2028, 2, 29), ['2028-02', '2028-02-29', 29, 29, 0]],
    ['december', at(2026, 12, 31, 23), ['2026-12', '2026-12-31', 31, 31, 0]],
    ['january-after', at(2027, 1, 1, 0), ['2027-01', '2027-01-01', 1, 31, 30]]
  ];
  calCases.forEach(([id, ms, expected]) => {
    setClock(ms);
    const cm = model(parse(base()), ms);
    check('cal.' + id, 'ym, today, day, daysInMonth, daysRemaining (days after today); model ready on that month',
      [cm.month.ym, cm.month.today, cm.month.day, cm.month.daysInMonth, cm.month.daysRemaining, cm.status], expected.concat(['ready']));
  });
  setClock(NOW);
  check('cal.epoch', 'The clock may be supplied as epoch ms', (function () { clearTraps(); const e = ctx.geodeLivingMonthModel(parse(base()), NOW); return [e.status, e.month.today]; })(), ['ready', '2026-10-15']);

  section('CLOCK — the supplied clock drives the model\'s own day logic');
  setClock(NOW);
  const d15 = model(parse(FIXTURES['D.monthly-upcoming']()), at(2026, 10, 15));
  const d25 = model(parse(FIXTURES['D.monthly-upcoming']()), at(2026, 10, 25));
  check('clock.day', 'Same runtime month, clock moved to the 25th: day fields follow it and the phone (due 20th) becomes due_no_outcome_recorded',
    [d25.month.day, d25.month.daysRemaining, byId(d25, 'phone').state, byId(d15, 'phone').state], [25, 6, 'due_no_outcome_recorded', 'scheduled']);
  check('clock.plan', 'Within a month the plan does not depend on the day', canon(d25.plan), canon(d15.plan));

  section('PENCE — partition totals with non-binary amounts');
  setClock(NOW);
  const penceRaw = base({ income: 2345.67, payments: [paidMonthly('a', 33.33, '2026-10-02'), bill('b', 19.99, '2026-10-20'), bill('c', 0.1, '2026-10-21'),
    paidMonthly('d', 0.2, '2026-10-03'), bill('e', 1234.56, '2026-10-22')], expenses: [expense('x', 99.99, 'yes', '2026-10-01'), expense('y', 1000, 'annual', '2027-01-05')] });
  m = invariants('pence', penceRaw);
  check('pence.note', 'Plan and budget reconcile exactly; done + ahead equals the counted total exactly for this fixture',
    [m.plan.incomePlanned - m.plan.paymentsCountedTotal - m.plan.budgetTotal === m.plan.monthlyLeft, m.payments.doneTotal + m.payments.aheadTotal - m.payments.countedTotal], [true, 0]);
  // Production sums every counted row in one pass; the partition sums two buckets. IEEE-754 addition is not associative,
  // so interleaved done / ahead amounts can differ from the one-pass total in the last binary digit — never by a penny.
  const inter = parse(base({ payments: [paidMonthly('a', 0.1, '2026-10-02'), bill('b', 0.2, '2026-10-20'), bill('c', 0.3, '2026-10-21')] }));
  const im = model(inter);
  const residual = im.payments.doneTotal + im.payments.aheadTotal - ctx.sumPaymentsMonthlyOutflow(inter.payments);
  check('pence.associativity', 'Interleaved 0.10 done / 0.20 + 0.30 ahead: every item exact, plan exact, partition residual below 1e-9 (float order only)',
    [im.payments.doneTotal, im.payments.aheadTotal, im.plan.monthlyLeft === ctx.calcMonthlyLeftover(inter), Math.abs(residual) < 1e-9, Math.abs(residual) > 0],
    [0.1, 0.5, true, true, true]);

  section('INCOME — irregular and stable plans are never read as received');
  [['irregular-1600', { income: 1600, incomeType: 'irregular' }, ['irregular', 'irregular_plan', 1600]],
    ['stable-3000', { income: 3000, incomeType: 'stable' }, ['stable', 'stable_plan', 3000]]].forEach(([id, inc, exp]) => {
    setClock(NOW);
    const im = model(parse(base(Object.assign({}, inc, {
      activityLog: [{ ts: at(2026, 10, 1, 9), type: 'income', delta: inc.income }],
      smartImportLearned: { lastIncomeAmount: inc.income, lastIncomeDate: '2026-10-01' },
      lastSnapshot: { leftThisMonth: 999, totalDebt: 0, totalSaved: 0, totalInvestments: 0, netWorth: 0 }
    }))));
    check('income.' + id, 'Planned and type only; an income log entry and import history are not receipts: none recorded, received, outstanding and received coverage null',
      [im.income.type, im.income.certainty, im.income.planned, im.income.received, im.income.outstanding, im.available.receivedCoverage, im.income.state],
      exp.concat([null, null, null, 'none_recorded']));
  });

  section('PURITY — S, repeat calls, output independence');
  setClock(NOW);
  const decoyText = JSON.stringify(JSON.stringify(base({ income: 12345, incomeType: 'irregular', payments: [paidMonthly('decoy', 999, '2026-10-02')] })));
  const realText = JSON.stringify(JSON.stringify(FIXTURES['H.goal-contribution']()));
  vm.runInContext('S = __parse(' + decoyText + ');', ctx);
  const withDecoy = canon(model(parse(FIXTURES['H.goal-contribution']())));
  const decoyAfter = vm.runInContext('JSON.stringify(S)', ctx);
  vm.runInContext('S = __parse(' + realText + ');', ctx);
  const withReal = canon(model(parse(FIXTURES['H.goal-contribution']())));
  check('purity.S', 'The model\'s output is the same whatever the page state S holds, and S is untouched', [withDecoy === withReal, decoyAfter === JSON.parse(decoyText)], [true, true]);
  const st = parse(FIXTURES['A.fixed-income']());
  const first = model(st);
  const firstText = canon(first);
  first.plan.monthlyLeft = -1; first.payments.done.push({ id: 'x' }); first.happened.length = 0; first.income.received = 5;
  check('purity.output-independent', 'Mutating a returned model changes neither the state nor the next model', [canon(model(st)) === firstText, canon(st) === canon(parse(FIXTURES['A.fixed-income']()))], [true, true]);
  check('purity.frozen', 'A deep-frozen state is read without error and gives the same model', (function () {
    const fz = parse(FIXTURES['G.debt-payment']());
    const freeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => freeze(o[k])); } return o; };
    const plain = canon(model(parse(FIXTURES['G.debt-payment']())));
    return canon(model(freeze(fz))) === plain;
  })(), true);

  // P3-4D: the change calculation reads only the supplied state's own month baseline.
  const baselineOf = raw => JSON.parse(JSON.stringify(ctx.geodeMonthBaselineFromModel(model(parse(raw)), 'month_open', at(2026, 10, 3, 9))));
  const blRaw = Object.assign(FIXTURES['A.fixed-income'](), { income: 3200, monthBaseline: baselineOf(FIXTURES['A.fixed-income']()) });
  const blState = parse(blRaw);
  const blBefore = canon(blState);
  const blWrites = [];
  const blModel = model(writeTrap(blState, blWrites));
  check('purity.changes', 'With a month baseline in the state: changes available (income +£200), no write at any depth, no trap reached, the state and its record deep-equal after',
    [blModel.changes.available, blModel.changes.components.income.delta, blWrites, trapLog(), canon(blState) === blBefore], [true, 200, [], [], true]);
  const decoyBl = JSON.parse(JSON.parse(decoyText));
  decoyBl.monthBaseline = Object.assign({}, blRaw.monthBaseline, { income: 9000, outgoings: 6040, observedAt: at(2026, 10, 2, 9) });
  vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(decoyBl)) + ');', ctx);
  const blWithDecoy = canon(model(parse(blRaw)).changes);
  vm.runInContext('S = {};', ctx);
  check('purity.changes-S', 'The page state S holding another plan and another valid October record changes nothing: changes come from the supplied state\'s record',
    [blWithDecoy === canon(model(parse(blRaw)).changes), blWithDecoy === canon(blModel.changes)], [true, true]);
  check('purity.changes-frozen', 'A deep-frozen state and record give the same changes', (function () {
    const freeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => freeze(o[k])); } return o; };
    return canon(model(freeze(parse(blRaw))).changes) === canon(blModel.changes);
  })(), true);
  const c1 = model(blState).changes, c2 = model(blState).changes;
  const recordObjects = objectsIn(blState.monthBaseline, new Set());
  c1.components.income.delta = 0; c1.baseline.kind = 'x';
  check('purity.changes-fresh', 'Repeated calls return equal, separate objects: mutating one result changes neither the next result nor the record; no result object is the record or part of it',
    [c1 !== c2, c2.components.income.delta, c2.baseline.kind, canon(blState) === blBefore, [...objectsIn(c2, new Set())].filter(o => recordObjects.has(o)).length],
    [true, 200, 'month_open', true, 0]);

  section('MUTANTS — each impurity is caught by at least one detector');
  const ANCHOR = '  for (var i = 0; i < list.length; i++) {\n    if (!paymentCountsForMonthlyOutflow(list[i])) {';
  if (INDEX.split(ANCHOR).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html');
  const INCOME_LINE = '  var incomePlanned = toNum(state.income);\n  var paymentsCountedTotal';
  if (INDEX.split(INCOME_LINE).length !== 2) throw new Error('mutant income anchor must occur exactly once in index.html');
  const insert = code => [ANCHOR, '  ' + code + '\n' + ANCHOR];
  const mutants = {
    'same-value write to a row': insert('list[0].status = list[0].status;'),
    'push onto a ledger': insert('(state.expectationGaps || []).push({});'),
    'sort the payments': insert('list.sort(function () { return 0; });'),
    'read localStorage': insert('localStorage.getItem("geode_v6");'),
    'call save': insert('save();'),
    'run recurrence': insert('syncRecurringPayments();'),
    'touch the DOM': insert('document.title;'),
    'read the page state S': [INCOME_LINE, INCOME_LINE.replace('toNum(state.income)', 'toNum(S.income)')]
  };
  Object.keys(mutants).forEach(name => {
    const mp = buildProgram(INDEX.replace(mutants[name][0], mutants[name][1]));
    const mc = newContext(mp);
    vm.runInContext('__nowMs = ' + NOW + '; S = __parse(' + decoyText + ');', mc);
    const raw = FIXTURES['A.fixed-income']();
    const state = mc.__parse(JSON.stringify(raw));
    const before = canon(state);
    const writes = [];
    const out = mc.geodeLivingMonthModel(writeTrap(state, writes), vm.runInContext('new Date(' + NOW + ')', mc));
    const traps = JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', mc));
    const caught = [];
    if (writes.length) caught.push('write-trap');
    if (canon(state) !== before) caught.push('deep-equal');
    if (traps.length) caught.push('trap-log');
    if (out.plan && out.plan.monthlyLeft !== mc.calcMonthlyLeftover(state)) caught.push('monthly-left');
    if (out.plan && out.plan.incomePlanned - out.plan.paymentsCountedTotal - out.plan.budgetTotal !== out.plan.monthlyLeft) caught.push('plan-reconciliation');
    check('mutant.' + name.replace(/\s+/g, '-'), 'Caught: ' + name, caught.length > 0, true);
  });

  let failed = 0;
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(30) + ' ' + r.text + (r.ok ? '' : '\n        ' + r.detail));
  });
  console.log('\nExtracted production functions: ' + program.extracted.length);
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

if (require.main === module) main();

module.exports = { INDEX, buildProgram, newContext, extractFunction, calledNames, canon, writeTrap, objectsIn, words, base, bill, paidMonthly, billEvent, expense, at, NOW };
