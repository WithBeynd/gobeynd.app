#!/usr/bin/env node
'use strict';
/**
 * Beynd Home Month Pulse (P3-2) — dependency-free: node tests/month-pulse-home.js
 *
 * geodeHomeMonthPulseHtml, geodeMonthPulseView, geodeMonthPulseHtml and everything they reach (the P3-1 Living Month
 * model included) are extracted from index.html (plus js/geode-pure/01-foundation.js) and run in an isolated vm context
 * under a simulated clock, with storage, the DOM, save and recurrence trapped. Checks:
 *   - the plan remainder, completed and still-ahead figures shown are the model's own (planRemainder, doneTotal,
 *     aheadTotal), and the remainder is Monthly Left; a synthetic model proves no figure is recomputed from rows;
 *   - plan wording only: no cash, bank, balance, available, safe-to-spend, disposable or spending claim, and no
 *     overdue / unpaid / missed / late inference; no received figure or coverage while income received is null;
 *   - unplaced completed one-offs never enter a shown total and are named only as items with no known month;
 *   - a model that is not ready (pending boundary, another schema, another month, invalid clock or state) shows nothing,
 *     even when it carries figures; rendering reads only and writes nothing;
 *   - rHome places the Pulse under the hero and skips the persistent over-budget card only when the Pulse is shown;
 *   - mutants that break any of this are caught by the checks above.
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

const ENTRY_FUNCTIONS = ['geodeHomeMonthPulseHtml', 'geodeMonthPulseView', 'geodeMonthPulseHtml', 'geodeLivingMonthModel', 'calcMonthlyLeftover', 'fm'];
const CONSTANTS = ['GEODE_SCHEMA_VERSION'];
const PULSE_FUNCTIONS = ['geodeMonthPulseView', 'geodeMonthPulseHtml', 'geodeHomeMonthPulseHtml'];

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
/** The page state: the Pulse may read only its currency (through fm); its figures are decoys. */
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
  return { script: new vm.Script(code, { filename: 'month-pulse-program.js' }), extracted: [...have.keys()] };
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

/** A recursive proxy that logs every write at any depth. */
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

/** Visible text of rendered markup: tags removed, entities decoded, whitespace collapsed. */
function textOf(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
/** Visible text of the element carrying the data-geode-month-pulse-<part> marker ('' when absent). */
function partOf(html, part) {
  const open = html.indexOf('data-geode-month-pulse-' + part + '="1"');
  if (open < 0) return '';
  const start = html.lastIndexOf('<div', open);
  let depth = 0;
  const tag = /<(\/?)div\b[^>]*>/g;
  tag.lastIndex = start;
  let m;
  while ((m = tag.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return textOf(html.slice(start, m.index + m[0].length));
  }
  return '';
}

const at = (y, m, d, h) => new Date(y, m - 1, d, h == null ? 12 : h).getTime();
const NOW = at(2026, 10, 15);
const INCOME_NOTE = 'Income received isn\u2019t tracked yet.';
const IRREGULAR_NOTE = 'Planned income can vary. Income received isn\u2019t tracked yet.';
const DUE_ONE = '1 scheduled item is due, with no outcome recorded.';
const UNPLACED_ONE = '1 completed item has no known month.';
const GBP = { sym: '\u00a3', code: 'GBP', loc: 'en-GB' };

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
const billEvent = (pid, amount, occ, recordedAt) => ({ id: 'bpe_' + pid + '_' + occ + '_c1', eventType: 'completion', paymentId: pid,
  amount, occurrenceYm: occ, dueDateSnapshot: occ + '-01', recordedAt, paymentNameSnapshot: pid, recurrenceSnapshot: 'monthly', source: 'mark_completed' });
const expense = (id, amount, rec, date) => ({ id, name: id, amount, cat: 'Bills', date, rec });

const FIXTURES = {
  'A.positive': () => base({
    payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20')],
    billPaymentEvents: [billEvent('rent', 1200, '2026-10', at(2026, 10, 1, 9))],
    expenses: [expense('groceries', 400, 'yes', '2026-10-01')]
  }),
  'B.negative': () => base({ income: 1000, payments: [bill('rent', 1200, '2026-10-20')] }),
  'C.zero': () => base({ income: 1240, payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20')] }),
  'D.no-income': () => base({ income: 0, payments: [bill('phone', 50, '2026-10-20')] }),
  'D.no-income-unset': () => base({ income: 0, incomeExplicitlySet: false, incomeType: 'none', incomeTypeUserSet: false, payments: [bill('phone', 50, '2026-10-20')] }),
  'E.irregular': () => base({ income: 1600, incomeType: 'irregular', payments: [bill('rent', 900, '2026-10-25')] }),
  'F.no-payments': () => base({ expenses: [expense('groceries', 400, 'yes', '2026-10-01')] }),
  'F.quiet-month': () => base(),
  'G.all-completed': () => base({ payments: [paidMonthly('rent', 1200, '2026-10-01'), paidMonthly('water', 35, '2026-10-03')],
    billPaymentEvents: [billEvent('rent', 1200, '2026-10', at(2026, 10, 1, 9))] }),
  'G.one-payment': () => base({ payments: [bill('phone', 40, '2026-10-20')] }),
  'H.all-ahead': () => base({ payments: [bill('phone', 40, '2026-10-20'), bill('gym', 30, '2026-10-25')] }),
  'I.mixed': () => base({
    debts: [{ id: 'd1', name: 'Card', balance: 4000, apr: 20, minp: 100 }],
    payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20'), bill('card', 150, '2026-10-28', { debtId: 'd1' })],
    expenses: [expense('groceries', 400, 'yes', '2026-10-01')]
  }),
  'J.due-no-outcome': () => base({ payments: [bill('gym', 30, '2026-10-05'), bill('phone', 40, '2026-10-20')] }),
  'J.due-two': () => base({ payments: [bill('gym', 30, '2026-10-05'), bill('water', 35, '2026-10-03'), bill('phone', 40, '2026-10-20')] }),
  'K.unplaced': () => base({ payments: [bill('gift', 30, '', { rec: 'no', status: 'paid' }), bill('phone', 40, '2026-10-20')] }),
  'K.unplaced-two': () => base({ payments: [bill('gift', 30, '', { rec: 'no', status: 'paid' }), bill('card-gift', 75, '2026-02-30', { rec: 'no', status: 'paid' }),
    paidMonthly('rent', 1200, '2026-10-01')] }),
  'N.annual-due': () => base({ payments: [bill('tv-licence', 170, '2026-10-28', { rec: 'annual' }), bill('car-tax', 190, '2027-02-10', { rec: 'annual' })] }),
  'O.contribution': () => base({
    goals: [{ id: 'g1', name: 'Holiday', target: 2000, saved: 400, baseSaved: 300 }],
    investments: [{ id: 'i1', name: 'ISA', balance: 5000, baseBalance: 5000, valuations: [] }],
    payments: [paidMonthly('save-holiday', 100, '2026-10-04', { goalId: 'g1' }), bill('save-extra', 50, '2026-10-28', { goalId: 'g1' }),
      bill('isa', 250, '2026-10-27', { investId: 'i1' })],
    contributionEvents: [{ id: 'ce_1', eventType: 'completion', paymentId: 'save-holiday', entityType: 'goal', entityId: 'g1', occurrenceYm: '2026-10',
      amount: 100, recurrence: 'monthly', dueDateSnapshot: '2026-10-04', recordedAt: at(2026, 10, 4, 9), source: 'mark_completed' }]
  }),
  'P.debt': () => base({
    debts: [{ id: 'd1', name: 'Card', balance: 5000, apr: 20, minp: 150 }],
    payments: [paidMonthly('card', 200, '2026-10-02', { debtId: 'd1' }), bill('card-extra', 100, '2026-10-25', { rec: 'no', debtId: 'd1' })],
    debtPaymentEvents: [{ id: 'dpe_1', eventType: 'completion', paymentId: 'card', debtId: 'd1', amount: 200, occurrenceYm: '2026-10',
      recordedAt: at(2026, 10, 2, 9), dueDateSnapshot: '2026-10-02', debtNameSnapshot: 'Card', paymentNameSnapshot: 'card', recurrenceSnapshot: 'monthly', source: 'mark_completed' }]
  })
};

/** Pending boundaries, each also carrying a figure that would be stale if shown. */
const PENDING = {
  'L.unpaid-monthly-behind': () => base({ income: 100, payments: [bill('rent', 1200, '2026-09-01')] }),
  'L.paid-monthly-last-month': () => base({ payments: [bill('rent', 1200, '2026-10-01', { status: 'paid', lastPaidYM: '2026-09', lastPaidAmount: 1200, lastPaidDueDate: '2026-09-01' })] }),
  'L.expired-one-off-expense': () => base({ expenses: [expense('party', 120, 'no', '2026-09-14')] })
};

/** Words the Pulse must never use: a cash or balance claim, spending, coverage, or an inferred missed payment. */
const FORBIDDEN_WORDS = /\b(cash|bank|balance|available|disposable|spent|spending|paid out|safe to spend|overdue|unpaid|missed|late|covered|coverage|shortfall|overdraft)\b/i;

// ───────────────────────────── checks ─────────────────────────────

/** Every check, against the given page source; returns the results and the extracted function count. */
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
  const setClock = ms => vm.runInContext('__nowMs = ' + ms + ';', ctx);
  const trapLog = () => JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', ctx));
  const clearTraps = () => vm.runInContext('__trapLog = [];', ctx);
  const setS = obj => vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(obj)) + ');', ctx);
  const decoyS = () => setS(Object.assign(base({ income: 99999, payments: [bill('decoy', 777, '2026-10-02')] }), { cur: GBP }));
  const pulse = (state, now, opts) => { clearTraps(); return ctx.geodeHomeMonthPulseHtml(state, now === undefined ? vmDate(NOW) : now, opts); };
  const model = (state, nowMs) => ctx.geodeLivingMonthModel(state, vmDate(nowMs == null ? NOW : nowMs));
  const fm = v => ctx.fm(v);
  const view = m => ctx.geodeMonthPulseHtml(ctx.geodeMonthPulseView(m));
  decoyS();
  setClock(NOW);

  section('STATIC — the Pulse reads the model only and computes no figure');
  const pulseText = PULSE_FUNCTIONS.map(n => extractFunction(src, n).text).join('\n');
  const code = pulseText.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'/g, "''");
  check('static.declared', 'index.html declares each Pulse function once',
    PULSE_FUNCTIONS.map(n => src.split('\nfunction ' + n + '(').length - 1), [1, 1, 1]);
  check('static.no-reach-around', 'Pulse code names no payment counter, Monthly Left function, row field, expense sum, gap ledger, storage, DOM or clock',
    ['calcMonthlyLeftover', 'sumPayments', 'paymentCounts', 'sumExpenses', 'toNum', 'geodePayment', '.amount', 'lastPaid', '.status ===', 'state.payments',
      'state.expenses', 'state.income', 'expectationGaps', 'localStorage', 'sessionStorage', 'document', 'window', 'Date'].filter(w => code.indexOf(w) >= 0)
      .concat(/(?<![\w$.])S\b/.test(code) ? ['S'] : []), []);
  check('static.model-fields', 'The figures shown are the model\'s planRemainder, doneTotal and aheadTotal',
    ['model.available.planRemainder', 'model.payments.doneTotal', 'model.payments.aheadTotal'].map(w => code.indexOf(w) >= 0), [true, true, true]);
  check('static.closure', 'The Pulse reaches no writer or boundary engine', program.extracted.filter(n =>
    /^(save|persistGeodeToLocalStorage|syncRecurringPayments|geodeStoreFinancialState|geodeArchive\w*|geodeCapture\w*|geodeSeed\w*|geodeRecord\w*|geodeSchema\dTransition|togglePay|render\w*|rHome)$/.test(n)), []);

  section('HOME — placement and the one presentation change');
  const rHome = extractFunction(src, 'rHome').text;
  const heroEnd = rHome.indexOf("'</details>';\n  h += '</div>';");
  const pulseCall = rHome.indexOf("_monthPulseHtml = geodeHomeMonthPulseHtml(S, new Date(), { dueShownElsewhere: geodeHomeNeedsAttentionWouldShow(S) });");
  const pulseAppend = rHome.indexOf('h += _monthPulseHtml;');
  const anticipatory = rHome.indexOf('h += geodeHomeAnticipatoryMaybeHtml(S);');
  check('home.placement', 'rHome builds the Pulse from the page state and the clock once, directly under the Net Worth hero and before every other Home surface',
    [heroEnd > 0, pulseCall > heroEnd, pulseAppend > pulseCall, anticipatory > pulseAppend, rHome.split('geodeHomeMonthPulseHtml(').length - 1,
      src.split('geodeHomeMonthPulseHtml(').length - 1], [true, true, true, true, 1, 2]);
  check('home.overbudget', 'The persistent over-budget card is skipped only when a Pulse was rendered (a non-ready model leaves Home as before)',
    rHome.indexOf("!_monthPulseHtml &&\n      geodeHomeOrchSurfaceShowResolved('overBudget'") > 0, true);
  check('home.empty-state', 'The empty-state Home returns before the Pulse is built', rHome.indexOf('c.innerHTML = hEmpty;') < pulseCall, true);
  check('home.no-sync', 'rHome itself runs no recurrence or boundary step, so the Pulse never triggers one',
    ['syncRecurringPayments(', 'geodeSchema3Transition(', 'geodeCaptureExpectationGaps('].filter(w => rHome.indexOf(w) >= 0), []);

  // Display checks for a ready fixture; returns [html, model].
  function ready(id, raw, opts) {
    setClock(NOW);
    const state = parse(raw);
    const before = canon(state);
    const writes = [];
    const html = pulse(writeTrap(state, writes), undefined, opts);
    const traps = trapLog();
    const m = model(state);
    const r = m.available.planRemainder;
    const text = textOf(html);
    check(id + '.shown', 'Ready model: one Pulse section, labelled with the month', [m.status, (html.match(/<section /g) || []).length, /aria-label="This month, October"/.test(html), text.indexOf('October') === 0],
      ['ready', 1, true, true]);
    check(id + '.pure', 'Rendering writes nothing to the state and reaches no storage, DOM, save or sync', [writes, traps, canon(state) === before], [[], [], true]);
    check(id + '.remainder', 'The plan remainder shown is the model\'s planRemainder, which is Monthly Left, in plan wording',
      [partOf(html, 'remainder'), r === ctx.calcMonthlyLeftover(state)], [r < 0 ? 'Your current plan is ' + fm(-r) + ' over' : fm(r) + ' left if the month goes to plan', true]);
    const d = m.payments.done.length, a = m.payments.ahead.length;
    check(id + '.commitments', 'Completed and still ahead are the model\'s doneTotal and aheadTotal (omitted when the month has no scheduled item)',
      partOf(html, 'commitments'), d || a ? (d ? fm(m.payments.doneTotal) + ' completed' : 'Nothing completed yet') + ' \u00b7 ' + (a ? fm(m.payments.aheadTotal) + ' still ahead' : 'nothing still ahead') : '');
    check(id + '.words', 'No cash, bank, balance, available, safe-to-spend, disposable or spending claim; no overdue, unpaid, missed or late inference', FORBIDDEN_WORDS.test(text) ? text : '', '');
    check(id + '.received', 'Income received is null: no received figure, no coverage — at most the one plain line',
      [m.income.received, m.available.receivedCoverage, text.split(IRREGULAR_NOTE).join('').split(INCOME_NOTE).join('').match(/receiv|cover|%/i)], [null, null, null]);
    check(id + '.over-link', 'A way into Plan appears exactly when the plan is over', /Review this month in Plan/.test(html), r < 0);
    setS(Object.assign(base({ income: 1, payments: [bill('other-decoy', 5, '2026-10-02', { status: 'paid' })], expenses: [expense('x', 9, 'yes', '2026-10-01')] }), { cur: GBP }));
    check(id + '.page-state', 'The page state supplies only the currency: changing its figures changes nothing shown', pulse(parse(raw), undefined, opts), html);
    decoyS();
    return [html, m];
  }

  section('STATES — A to P, each against every display check');
  let [html, m] = ready('A', FIXTURES['A.positive']());
  check('A.text', 'Positive month: £1,360 left if the month goes to plan; £1,200 completed · £40 still ahead; the income line; nothing to attend to',
    [partOf(html, 'remainder'), partOf(html, 'commitments'), partOf(html, 'income'), partOf(html, 'attention')],
    ['\u00a31,360 left if the month goes to plan', '\u00a31,200 completed \u00b7 \u00a340 still ahead', INCOME_NOTE, '']);

  [html, m] = ready('B', FIXTURES['B.negative']());
  check('B.text', 'Negative plan: a plan issue, never a negative "left" figure, an overdraft or a shortfall',
    [partOf(html, 'remainder'), /left if/.test(html), /\u2212|-\u00a3|\u00a3-/.test(textOf(html)), m.plan.monthlyLeft], ['Your current plan is \u00a3200 over', false, false, -200]);

  [html, m] = ready('C', FIXTURES['C.zero']());
  check('C.text', 'Zero remainder: £0 left if the month goes to plan, not "over"', [partOf(html, 'remainder'), m.plan.monthlyLeft], ['\u00a30 left if the month goes to plan', 0]);

  [html, m] = ready('D', FIXTURES['D.no-income']());
  check('D.text', 'No income: the plan is £50 over; no income line (no planned income to receive)',
    [partOf(html, 'remainder'), partOf(html, 'income'), m.income.planned], ['Your current plan is \u00a350 over', '', 0]);
  [html, m] = ready('D.unset', FIXTURES['D.no-income-unset']());
  check('D.unset.text', 'Income never set: the same plan statement, no income line', [partOf(html, 'remainder'), partOf(html, 'income')], ['Your current plan is \u00a350 over', '']);

  [html, m] = ready('E', FIXTURES['E.irregular']());
  check('E.text', 'Irregular income: the remainder stays conditional, and planned income is said to vary — never guaranteed or received',
    [partOf(html, 'remainder'), partOf(html, 'income'), m.income.type], ['\u00a3700 left if the month goes to plan', IRREGULAR_NOTE, 'irregular']);

  [html, m] = ready('F', FIXTURES['F.no-payments']());
  check('F.text', 'No payments: the remainder and the income line only — no commitments line, no zero totals',
    [partOf(html, 'remainder'), /Scheduled payments/.test(html), /completed|ahead/.test(html)], ['\u00a32,600 left if the month goes to plan', false, false]);
  [html, m] = ready('F.quiet', FIXTURES['F.quiet-month']());
  check('F.quiet.text', 'A quiet month (no payments, expenses or activity) says very little: month, remainder, income line',
    textOf(html), 'October \u00a33,000 left if the month goes to plan ' + INCOME_NOTE);

  [html, m] = ready('G', FIXTURES['G.all-completed']());
  check('G.text', 'All completed: £1,235 completed · nothing still ahead', partOf(html, 'commitments'), '\u00a31,235 completed \u00b7 nothing still ahead');
  [html, m] = ready('G.one', FIXTURES['G.one-payment']());
  check('G.one.text', 'Only one payment: nothing completed yet · £40 still ahead', partOf(html, 'commitments'), 'Nothing completed yet \u00b7 \u00a340 still ahead');

  [html, m] = ready('H', FIXTURES['H.all-ahead']());
  check('H.text', 'All ahead: nothing completed yet · £70 still ahead', partOf(html, 'commitments'), 'Nothing completed yet \u00b7 \u00a370 still ahead');

  [html, m] = ready('I', FIXTURES['I.mixed']());
  check('I.text', 'Mixed: £1,200 completed · £190 still ahead; £1,210 left', [partOf(html, 'commitments'), partOf(html, 'remainder')],
    ['\u00a31,200 completed \u00b7 \u00a3190 still ahead', '\u00a31,210 left if the month goes to plan']);

  [html, m] = ready('J', FIXTURES['J.due-no-outcome']());
  check('J.text', 'Due earlier this month with nothing recorded: one restrained line, in evidence wording', partOf(html, 'attention'), DUE_ONE);
  [html, m] = ready('J.two', FIXTURES['J.due-two']());
  check('J.two.text', 'Two due items: the plural line', partOf(html, 'attention'), '2 scheduled items are due, with no outcome recorded.');
  [html, m] = ready('J.elsewhere', FIXTURES['J.due-no-outcome'](), { dueShownElsewhere: true });
  check('J.elsewhere.text', 'When Home\'s needs-attention card already lists due items, the Pulse does not repeat them; totals unchanged',
    [partOf(html, 'attention'), partOf(html, 'commitments')], ['', 'Nothing completed yet \u00b7 \u00a370 still ahead']);

  [html, m] = ready('K', FIXTURES['K.unplaced']());
  check('K.text', 'Unplaced completed one-off: named once as an item with no known month; never in a total, never completed this month, not in Monthly Left',
    [partOf(html, 'attention'), partOf(html, 'commitments'), partOf(html, 'remainder'), textOf(html).indexOf('\u00a330') < 0, m.payments.unplaced.length, m.payments.doneTotal],
    [UNPLACED_ONE, 'Nothing completed yet \u00b7 \u00a340 still ahead', '\u00a32,960 left if the month goes to plan', true, 1, 0]);
  [html, m] = ready('K.two', FIXTURES['K.unplaced-two']());
  check('K.two.text', 'Two unplaced beside a completed row: plural line; the completed total is the counted row only',
    [partOf(html, 'attention'), partOf(html, 'commitments')], ['2 completed items have no known month.', '\u00a31,200 completed \u00b7 nothing still ahead']);

  [html, m] = ready('N', FIXTURES['N.annual-due']());
  check('N.text', 'Annual row due this month counts in full and is still ahead; the February one is not shown', [partOf(html, 'commitments'), partOf(html, 'remainder')],
    ['Nothing completed yet \u00b7 \u00a3170 still ahead', '\u00a32,830 left if the month goes to plan']);

  [html, m] = ready('O', FIXTURES['O.contribution']());
  check('O.text', 'Contributions are allocations: labelled as scheduled payments and contributions, completed / still ahead — not spent or paid out',
    [partOf(html, 'commitments'), /Scheduled payments and contributions/.test(html), m.payments.done.concat(m.payments.ahead).map(x => x.nature)],
    ['\u00a3100 completed \u00b7 \u00a3300 still ahead', true, ['allocation', 'allocation', 'allocation']]);

  [html, m] = ready('P', FIXTURES['P.debt']());
  check('P.text', 'Debt payments: £200 completed · £100 still ahead; no claim about the debt balance', [partOf(html, 'commitments'), /balance|owe/i.test(textOf(html))],
    ['\u00a3200 completed \u00b7 \u00a3100 still ahead', false]);

  section('NOT READY — no figure from a model that is not ready');
  Object.keys(PENDING).forEach(id => {
    setClock(NOW);
    const state = parse(PENDING[id]());
    const before = canon(state);
    const writes = [];
    const out = pulse(writeTrap(state, writes));
    check(id, 'Boundary pending: nothing rendered, nothing written or synced, the boundary left unprocessed',
      [model(state).status, out, writes, trapLog(), canon(state) === before], ['boundary_pending', '', [], [], true]);
  });
  check('L.stale-figure', 'The pending state carries a stale negative Monthly Left, and still nothing is shown (Home keeps its existing cards)',
    [ctx.calcMonthlyLeftover(parse(PENDING['L.unpaid-monthly-behind']())) < 0, pulse(parse(PENDING['L.unpaid-monthly-behind']()))], [true, '']);
  [
    ['M.schema2', Object.assign(FIXTURES['A.positive'](), { _schemaVersion: 2 }), NOW, 'schema_not_current'],
    ['M.schema4', Object.assign(FIXTURES['A.positive'](), { _schemaVersion: 4 }), NOW, 'schema_not_current'],
    ['M.clock-month', FIXTURES['A.positive'](), at(2026, 11, 2), 'clock_month_mismatch'],
    ['M.invalid-clock', FIXTURES['A.positive'](), NaN, 'invalid_clock']
  ].forEach(([id, raw, ms, status]) => {
    setClock(NOW);
    const state = parse(raw);
    check(id, 'Refused (' + status + '): nothing rendered', [model(state, ms).status, pulse(state, vmDate(ms))], [status, '']);
  });
  check('M.invalid-state', 'No state: nothing rendered', [model(null).status, pulse(null), pulse(undefined), pulse(parse([]))], ['invalid_state', '', '', '']);

  section('MODEL CONTRACT — the display is the model, figures and all');
  const synthetic = status => ({
    kind: 'living_month', authoritative: false, status, reason: status === 'ready' ? '' : status,
    month: { ym: '2026-10', today: '2026-10-15', day: 15, daysInMonth: 31, daysRemaining: 16, boundaryPending: false },
    plan: { basis: 'plan', incomePlanned: 3000, incomeType: 'stable', paymentsCountedTotal: 1800, budgetTotal: 458, monthlyLeft: 742 },
    income: { state: 'not_tracked', planned: 3000, explicitlySet: true, type: 'stable', certainty: 'stable_plan', received: null, outstanding: null, reason: 'no_income_evidence' },
    available: { planRemainder: 742, receivedCoverage: null, reason: 'no_income_evidence' },
    payments: { countedTotal: 1800, doneTotal: 1120, aheadTotal: 680, done: [{ id: 'x', state: 'completed_this_month', amount: 1 }],
      ahead: [{ id: 'y', state: 'scheduled', amount: 2 }, { id: 'z', state: 'due_no_outcome_recorded', amount: 3 }],
      unplaced: [{ id: 'u', state: 'completed_month_unknown', amount: 999 }] },
    expenses: { basis: 'plan', budgetTotal: 458, items: [] }, happened: [], earlier: { basis: 'evidence_only', gapCount: 0, gapMonths: [] },
    changes: { available: false, reason: 'no_month_baseline' }
  });
  const synth = view(parse(synthetic('ready')));
  check('contract.figures', 'A synthetic model whose totals match no item amounts: the Pulse shows exactly its planRemainder, doneTotal and aheadTotal and its own classifications',
    [partOf(synth, 'remainder'), partOf(synth, 'commitments'), partOf(synth, 'attention'), /999|\u00a3[1-6](?![\d,])/.test(textOf(synth))],
    ['\u00a3742 left if the month goes to plan', '\u00a31,120 completed \u00b7 \u00a3680 still ahead', DUE_ONE + ' ' + UNPLACED_ONE, false]);
  check('contract.stale', 'The same figures under any non-ready status show nothing',
    ['boundary_pending', 'schema_not_current', 'clock_month_mismatch', 'invalid_clock', 'invalid_state'].map(s => [ctx.geodeMonthPulseView(parse(synthetic(s))), view(parse(synthetic(s)))]),
    Array(5).fill([null, '']));
  const noRemainder = synthetic('ready'); noRemainder.available.planRemainder = null;
  const nanRemainder = synthetic('ready'); nanRemainder.available.planRemainder = NaN;
  check('contract.unknown-remainder', 'A ready model without a numeric remainder shows nothing (unknown is never displayed as £0)',
    [ctx.geodeMonthPulseView(parse(noRemainder)), ctx.geodeMonthPulseView(nanRemainder), ctx.geodeMonthPulseView(null), ctx.geodeMonthPulseHtml(null)], [null, null, null, '']);
  const receivedLater = synthetic('ready'); receivedLater.income.received = 500;
  const laterHtml = view(parse(receivedLater));
  check('contract.received-later', 'Should a later stage evidence income received, P3-2 still shows no received figure or coverage',
    [/500|receiv|cover/i.test(textOf(laterHtml)), partOf(laterHtml, 'income')], [false, '']);
  const badMonth = synthetic('ready'); badMonth.month.ym = '2026-13';
  const badMonthHtml = view(parse(badMonth));
  check('contract.month', 'An unrecognised month gives no month label rather than a wrong one',
    [/<section[^>]*aria-label="This month"/.test(badMonthHtml), textOf(badMonthHtml).indexOf('\u00a3742') === 0], [true, true]);

  return { results, extracted: program.extracted.length };
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'remainder from planned income': ['var remainder = model.available.planRemainder;', 'var remainder = model.plan.incomePlanned;'],
  'non-ready model rendered': ["if (!model || model.status !== 'ready' || !model.month", 'if (!model || !model.month'],
  'unplaced counted as completed': ['done: { count: done.length, total: model.payments.doneTotal }',
    'done: { count: done.length + (model.payments.unplaced || []).length, total: model.payments.doneTotal }'],
  'due cue says overdue': ["'1 scheduled item is due, with no outcome recorded.'", "'1 payment is overdue.'"],
  'zero shown as over': ['var over = view.planRemainder < 0;', 'var over = view.planRemainder <= 0;'],
  'received shown as zero': ['if (view.incomeReceived === null && view.incomePlanned > 0) {',
    "if (view.incomePlanned > 0) { h += '<div>\u00a30 received</div>';"],
  'over-budget card always skipped': ["!_monthPulseHtml &&\n      geodeHomeOrchSurfaceShowResolved('overBudget'", "geodeHomeOrchSurfaceShowResolved('overBudget'"],
  'pulse placed after other surfaces': ['  h += _monthPulseHtml;\n  h += geodeHomeAnticipatoryMaybeHtml(S);', '  h += geodeHomeAnticipatoryMaybeHtml(S);\n  h += _monthPulseHtml;']
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
    results.push({ group: 'MUTANTS — each display defect is caught by the checks above', id: 'mutant.' + name.replace(/\s+/g, '-'),
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
