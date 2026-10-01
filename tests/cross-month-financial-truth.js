#!/usr/bin/env node
/*
 * Beynd — cross-month financial truth regression harness.
 *
 *   node tests/cross-month-financial-truth.js
 *
 * Principle under test: once Beynd has recorded a financial fact, month rollover must not erase it,
 * duplicate it, silently rewrite it, or turn an intention into a historical fact.
 *
 * Real production functions are extracted from index.html (plus js/geode-pure/01-foundation.js) and run in
 * an isolated vm context under a simulated clock. Only UI side effects, persistence and randomness are shimmed.
 *
 * Result kinds:
 *   PASS     invariant holds (a failure is reported as FAIL)
 *   CURRENT  documents current behaviour that is not the target semantics (a change is reported as CHANGED)
 *   XFAIL    target not yet met and the observed value matches the catalogued known defect
 *   XPASS    target now met — update the spec (move the check to PASS)
 *   SPEC     future assertion that needs the contribution ledger / migration; not executable yet
 *   FAIL     unexpected regression, or a known defect whose observed value changed
 *   ERROR    the harness itself failed (missing production function, unresolved dependency, runtime warning)
 * Exit code is 0 only when there are no FAIL, XPASS, CHANGED or ERROR results.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const FOUNDATION_JS = path.join(ROOT, 'js', 'geode-pure', '01-foundation.js');
const FIXTURES_JSON = path.join(__dirname, 'fixtures', 'cross-month-legacy-states.json');

class HarnessError extends Error {}

// ───────────────────────────── production code ─────────────────────────────

const PRODUCTION_FUNCTIONS = [
  // dates
  'currentYM', 'geodeTodayISO', 'geodeTodayLocalISO', 'geodeDateToLocalISO', 'geodeIsoDateIsPast',
  // payments: save / complete / delete / same-month identity
  'geodeSavePayApply', 'togglePay', 'delPay', 'geodeFindExistingLinkedPaymentForYm', 'geodePayYmFromDateStr',
  'geodeNormalizePayLinkedIntent', 'geodeMergeDuplicateLinkedContributionsSameMonth', 'geodePaymentMonthYmFromDate',
  'geodePaymentEffectiveStatus', 'advancePaymentDueDateOneMonth', 'migratePaymentFlowFields',
  // month rollover
  'syncRecurringPayments', 'rollupRecurringPaymentDueDates', 'rollupRecurringExpenseDueDates',
  'geodeArchiveExpiredOneOffExpenses', 'geodeNormalizeBeyndStatement', 'geodeUpsertBeyndStatementItem',
  'geodeBuildBeyndStatementOneOff', 'geodeBeyndStatementArchiveKey',
  // balances
  'geodeRecomputeBalancesFromPayments', 'geodeNormalizeGoalInvestBaseFields', 'geodeSavingsReleaseDeductionSumForSource',
  'geodeGoalEffectiveSavedFromState', 'geodeGoalHasPositiveLinkedInvestmentForState', 'geodeGoalLinkedInvBalanceForState',
  // Monthly Left
  'calcMonthlyLeftover', 'calcMonthlyLeftoverConfirmedOnly', 'sumPaymentsMonthlyOutflow',
  'sumPaymentsMonthlyOutflowConfirmedOnly', 'paymentCountsForMonthlyOutflow', 'paymentCountsForMonthlyOutflowConfirmedOnly',
  'sumExpensesMonthly', 'geodeExpenseIsOneOff', 'geodeExpenseIsExpiredOneOff', 'geodeExpenseMonthValue',
  'geodeExpenseDateValue', 'geodePaymentCountsAsPaidInCurrentMonth', 'geodeOverdueItems',
  // entity edits and Quick Setup
  'saveGoal', 'doDep', 'saveInv', 'geodeQsDone', 'geodeQuickSetupNum',
  // savings release
  'geodeApplySavingsRelease', 'geodeSavingsReleaseEligibility', 'geodeSavingsReleaseResolveSource',
  'geodeSavingsReleaseSourceType', 'geodeSavingsReleaseAvailableBalance', 'geodeReserveClassifySource',
  'geodeSavingsReleaseFindGoal', 'geodeSavingsReleaseFindInvest', 'geodeIsEmergencyBufferGoal',
  'geodeNormalizeSavingsReleases',
  // debt ledger: shared payment paths call it; it must stay inert for goal/investment rows
  'geodeNormalizeDebtPaymentEvents', 'geodeDebtPaymentEventSnapshot', 'geodeDebtPaymentOccurrenceYm',
  'geodeDebtPaymentActiveCompletion', 'geodeDebtPaymentEventId', 'geodeRecordDebtPaymentTransition',
  'geodeDebtPaymentYmValid', 'geodeDebtPaymentPointerTarget',
  // activity log
  'appendActivityLog', 'trimActivityLogForRetention'
];

/** Read-only structural checks: the reload and render shims below must mirror these production bodies. */
const STRUCTURAL_FUNCTIONS = ['load', 'render'];

/**
 * Test-only environment. Everything here is a side effect the scenarios do not observe (UI, toasts, caches,
 * behaviour-layer telemetry), persistence (save → in-memory store), or randomness (uid, rc).
 */
const TEST_SHIMS = String.raw`
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

var KEY = 'geode_v6';
var __store = null;
function save() { __store = JSON.stringify(S); }
function __memStorage() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
var localStorage = __memStorage(), sessionStorage = __memStorage();
var __fields = {};
var window = {};
var document = { getElementById: function (id) { return Object.prototype.hasOwnProperty.call(__fields, id) ? { value: __fields[id] } : null; } };

var __uidN = 0;
function uid() { __uidN++; return 'id' + __uidN; }
function rc() { return '#9b7fe8'; }
function fm(v) { return '£' + Math.round(Number(v) || 0); }

function render() {} function rGoals() {} function closeModal() {} function checkAlerts() {} function syncPills() {} function goTab() {}
function toast() {} function geodeSuccessToast() {} function geodeStageLToastAfterSave(m) { return m; }
function geodeEmitPaymentCompletionFeedback() {} function geodeMarkRecentUserSave() {} function geodeSubOnSave() {}
function setLastSnapshotBeforeChange() {} function geodeInvalidateDecisionCaches() {}
function evaluatePaymentFollowthrough() {} function geodeHomeMainActionInsightKind() { return ''; }
function geodeRememberLastPaymentDraft() {} function geodeReconcileFrozenSuggestedActionsAfterLinkedSave() {}
function geodeEnsureEmergencyBufferGoalForPayment() { return { applied: false }; }
function geodeNormalizeGoalTargetDateInput() { return null; }
function geodeConfirm(msg, onYes) { onYes(); }
function geodeQuickSetupSyncFromUi() {}
function geodePlanReadinessState() { return 'active'; }

/** Mirrors load(): the subset of its boot sequence that touches payments, goals, investments and releases. */
function __reload() {
  S = JSON.parse(__store);
  syncRecurringPayments();
  migratePaymentFlowFields();
  geodeNormalizeGoalInvestBaseFields();
  geodeNormalizeSavingsReleases(S);
  geodeNormalizeDebtPaymentEvents(S);
  geodeRecomputeBalancesFromPayments();
  syncRecurringPayments(); // first render() after boot
}

/** Read-only observation of what the app would display. */
function __snapshot() {
  var goal = {}, inv = {};
  (S.goals || []).forEach(function (g) { goal[g.id] = geodeGoalEffectiveSavedFromState(S, g); });
  (S.investments || []).forEach(function (i) { inv[i.id] = toNum(i.balance); });
  return JSON.stringify({
    ym: currentYM(),
    goal: goal,
    inv: inv,
    left: calcMonthlyLeftover(S),
    leftConfirmed: calcMonthlyLeftoverConfirmedOnly(S),
    homeOverduePayments: geodeOverdueItems().filter(function (x) { return x.kind === 'payment'; }).length,
    rows: (S.payments || []).map(function (p) {
      return { id: p.id, amount: toNum(p.amount), rec: p.rec, status: p.status, effective: geodePaymentEffectiveStatus(p),
        date: p.date, lastPaidYM: p.lastPaidYM || '', goalId: p.goalId || '', investId: p.investId || '',
        countsInMonthlyLeft: paymentCountsForMonthlyOutflow(p) };
    }),
    activity: (S.activityLog || []).map(function (e) { return { type: e.type, delta: e.delta }; })
  });
}
`;

function readSource(file) {
  if (!fs.existsSync(file)) throw new HarnessError('missing file: ' + path.relative(ROOT, file));
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Top-level functions in index.html start at column 0 ("\nfunction name(") and end at the first "\n}".
 * The extracted text must parse on its own, which catches a truncated or over-long extraction.
 * When a name is declared more than once, the last declaration wins at runtime, so that one is used.
 */
function extractFunction(src, name) {
  const needle = '\nfunction ' + name + '(';
  const starts = [];
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) starts.push(i + 1);
  if (!starts.length) throw new HarnessError('production function not found in index.html: ' + name);
  const start = starts[starts.length - 1];
  const firstLine = src.slice(start, src.indexOf('\n', start));
  const opens = (firstLine.match(/\{/g) || []).length;
  const closes = (firstLine.match(/\}/g) || []).length;
  let text;
  if (opens > 0 && opens === closes && /\}\s*$/.test(firstLine)) {
    text = firstLine;
  } else {
    const end = src.indexOf('\n}', start);
    if (end < 0) throw new HarnessError('could not find the end of production function ' + name);
    text = src.slice(start, end + 2);
  }
  try {
    new vm.Script('(' + text + '\n)', { filename: 'index.html:' + name });
  } catch (e) {
    throw new HarnessError('extracted production function ' + name + ' does not parse: ' + e.message);
  }
  return { name, text, declarations: starts.length };
}

const JS_WORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'function', 'return', 'typeof', 'new', 'do', 'else',
  'try', 'with', 'void', 'delete', 'in', 'of', 'instanceof', 'throw', 'super', 'this']);

/** Names a function calls that it does not declare itself (strings and comments stripped first). */
function calledNames(text) {
  const stripped = text.replace(/(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*')|("(?:\\.|[^"\\\n])*")|(`(?:\\.|[^`\\])*`)/g, ' ');
  const local = new Set();
  let m;
  const fnDecl = /function\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
  while ((m = fnDecl.exec(stripped))) {
    if (m[1]) local.add(m[1]);
    m[2].split(',').map(s => s.trim()).filter(Boolean).forEach(p => local.add(p));
  }
  const call = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
  const out = new Set();
  while ((m = call.exec(stripped))) {
    if (!JS_WORDS.has(m[2]) && !local.has(m[2])) out.add(m[2]);
  }
  return out;
}

function buildProgram() {
  const src = readSource(INDEX_HTML);
  const foundation = readSource(FOUNDATION_JS);
  const extracted = PRODUCTION_FUNCTIONS.map(n => extractFunction(src, n));
  const structural = {};
  STRUCTURAL_FUNCTIONS.forEach(n => { structural[n] = extractFunction(src, n).text; });
  const code = TEST_SHIMS + '\n' + foundation + '\n' + extracted.map(f => f.text).join('\n') + '\n';
  const script = new vm.Script(code, { filename: 'cross-month-harness-program.js' });

  // Every name the extracted functions call must resolve to a real production function or a declared shim.
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  script.runInContext(probe);
  const unresolved = [];
  extracted.forEach(f => {
    calledNames(f.text).forEach(n => {
      if (vm.runInContext('typeof ' + n, probe) === 'undefined') unresolved.push(f.name + ' → ' + n);
    });
  });
  if (unresolved.length) {
    throw new HarnessError('unresolved dependencies (extract the production function or add a documented shim):\n    ' + unresolved.join('\n    '));
  }
  return { script, extracted, structural };
}

// ───────────────────────────── simulated app ─────────────────────────────

const apps = [];

class App {
  constructor(state, clock) {
    this.warnings = [];
    const warnings = this.warnings;
    this.ctx = vm.createContext({
      console: {
        log() {}, info() {},
        warn(...a) { warnings.push(a.map(String).join(' ')); },
        error(...a) { warnings.push(a.map(String).join(' ')); }
      }
    });
    PROGRAM.script.runInContext(this.ctx);
    this.at(clock);
    this.run('S = ' + JSON.stringify(state) + '; save();');
    this.timeline = [];
    apps.push(this);
  }
  run(code) { return vm.runInContext(code, this.ctx); }
  call(fn, args) { this.ctx.__argsJson = JSON.stringify(args || []); return this.run(fn + '.apply(null, JSON.parse(__argsJson))'); }
  /** Local noon on an ISO date. */
  at(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    this.run('__nowMs = new __RealDate(' + y + ',' + (m - 1) + ',' + d + ',12).getTime();');
  }
  /** Same session: render() starts with syncRecurringPayments() and does not recompute balances. */
  render() { this.run('syncRecurringPayments()'); }
  /** Reload: rehydrate from the persisted store and run the boot sequence. */
  reload() { this.run('save(); __reload()'); }
  advance(iso, mode) { this.at(iso); if (mode === 'reload') this.reload(); else this.render(); }
  state() { return JSON.parse(this.run('JSON.stringify(S)')); }
  snap(label) {
    const s = JSON.parse(this.run('__snapshot()'));
    if (label) this.timeline.push({ label, snap: s });
    return s;
  }
  rows() { return this.snap().rows; }
  /** Payment form save (geodeSavePayApply). New rows use the default 'set' intent, edits use 'replace'. */
  contribute(o) {
    const before = new Set(this.state().payments.map(p => p.id));
    const gid = o.goalId || '', invid = o.investId || '';
    const kind = gid ? 'goal' : invid ? 'invest' : 'bill';
    this.run('window._geodePayLinkedIntent = ' + JSON.stringify(o.intent || (o.id ? 'replace' : 'set')) + ';');
    this.call('geodeSavePayApply', [o.id || null, o.name || 'Contribution', String(o.amount), o.date, o.status, o.rec || 'no',
      o.date, gid, invid, '', kind, Number(o.amount)]);
    const added = this.state().payments.filter(p => !before.has(p.id));
    return added.length ? added[0].id : null;
  }
  editPayment(id, changes) {
    const p = this.state().payments.filter(x => x.id === id)[0];
    if (!p) throw new HarnessError('editPayment: no row ' + id);
    this.contribute(Object.assign({ id, name: p.name, amount: p.amount, date: p.date, status: p.status, rec: p.rec,
      goalId: p.goalId, investId: p.investId }, changes));
  }
  /**
   * Plan-generated scheduling. Today a Plan apply reaches geodeSavePayApply through openPayModal with the 'set'
   * intent, indistinguishable from a user save. When FA-1 introduces a Plan-origin marker, set it here.
   */
  planSchedule(o) { return this.contribute(Object.assign({ intent: 'set' }, o)); }
  toggle(id) { this.call('togglePay', [id]); }
  completeAllUnpaid() { this.state().payments.filter(p => p.status !== 'paid').forEach(p => this.toggle(p.id)); }
  del(id) { this.call('delPay', [id]); }
  /** Goal edit form saved without touching "Saved So Far" (the form pre-fills it with g.saved). */
  renameGoal(id, name) {
    const g = this.state().goals.filter(x => x.id === id)[0];
    this.run('__fields = ' + JSON.stringify({ gn: name, ga: String(g.amount), gs: String(g.saved), gm: String(g.monthly || 0), gd: '', gc: g.cat || 'other' }) + ';');
    this.call('saveGoal', [id]);
  }
  /** Investment edit form (pre-filled with inv.balance); balance overrides the Balance field. */
  saveInvestment(id, name, balance) {
    const v = this.state().investments.filter(x => x.id === id)[0];
    this.run('__fields = ' + JSON.stringify({ xn: name, xb: String(balance === undefined ? v.balance : balance), xtype: v.type || 'other',
      xr: String(v.returns || 0), xp: v.platform || '', xo: v.notes || '', xpurpose: '', xhorizon: '', xcs: '', xgoalid: v.goalId || '' }) + ';');
    this.call('saveInv', [id]);
  }
  deposit(goalId, amount) { this.run('__fields = ' + JSON.stringify({ ['di-' + goalId]: String(amount) }) + ';'); this.call('doDep', [goalId]); }
  release(goalId, amount) {
    return JSON.parse(this.run('JSON.stringify(geodeApplySavingsRelease(' + JSON.stringify({ sourceType: 'goal', sourceId: goalId, amount, reason: 'emergency' }) + '))'));
  }
  quickSetup(data) { this.run('window._geodeQS = ' + JSON.stringify({ quickSetupData: data }) + '; geodeQsDone();'); }
}

// ───────────────────────────── results ─────────────────────────────

const DEFECTS = {
  D1: 'Recurring goal/investment contributions lose prior months at rollover (syncRecurringPayments resets the row; geodeRecomputeBalancesFromPayments rebuilds from currently-paid rows only).',
  D2: 'Quick Setup "Monthly essentials" housing/food/transport are stored as one-off expenses and drop out of later months (geodeQsDone).',
  D3: 'Goal/investment edit forms write the displayed total into baseSaved/baseBalance, re-adding paid rows and re-deducting releases (saveGoal, saveInv).',
  D4: 'Same-month linked save overwrites or merges a different unpaid row for the same goal/investment (geodeSavePayApply upsert, geodeMergeDuplicateLinkedContributionsSameMonth).',
  D5: 'An unpaid voluntary one-off contribution keeps reducing every later month\'s Monthly Left (paymentCountsForMonthlyOutflow overdue rule).',
  D6: 'Same-session rollover and reload disagree: the persisted g.saved / inv.balance cache stays stale until the next recompute.',
  D7: 'A savings release sized against a balance that rollover later shrinks hides later contributions (release deduction clamps at 0).',
  D8: 'Undoing a recurring completion does not revert the due-date advance, so complete → undo cycles push the next due date into later months (togglePay).',
  D9: 'Editing a recurring template while its current month is completed rewrites the recorded occurrence amount (single mutable row).',
  D10: 'Entering an investment value adds currently-paid contributions on top of the entered value (saveInv baseBalance + paid rows).'
};

const results = [];
let scenarioName = '';

const round = v => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const normalise = v => (Array.isArray(v) ? v.map(normalise) : v && typeof v === 'object'
  ? Object.keys(v).sort().reduce((o, k) => { o[k] = normalise(v[k]); return o; }, {}) : round(v));
const same = (a, b) => JSON.stringify(normalise(a)) === JSON.stringify(normalise(b));
const show = v => (typeof v === 'number' ? '£' + round(v).toLocaleString('en-GB') : JSON.stringify(v));

function record(status, id, text, detail) { results.push({ scenario: scenarioName, status, id, text, detail: detail || '' }); }

/** Must hold today and after every repair. */
function invariant(id, text, actual, expected) {
  if (same(actual, expected)) record('PASS', id, text + ' = ' + show(expected));
  else record('FAIL', id, text, 'expected ' + show(expected) + ', observed ' + show(actual));
}
/** Current behaviour that is documented but is not the target semantics. */
function current(id, text, actual, expected) {
  if (same(actual, expected)) record('CURRENT', id, text + ' = ' + show(expected));
  else record('CHANGED', id, text, 'documented ' + show(expected) + ', observed ' + show(actual) + ' — update the documented behaviour consciously');
}
/** Target semantics. known = today's catalogued defective value; undefined when the target already holds today. */
function target(id, text, actual, expected, known, defect) {
  if (known === undefined) return invariant(id, text, actual, expected);
  if (same(actual, expected)) record('XPASS', id, text, 'target ' + show(expected) + ' now met (catalogued ' + defect + ') — move to PASS');
  else if (same(actual, known)) record('XFAIL', id, text, 'target ' + show(expected) + ', observed ' + show(actual) + ' [' + defect + ']');
  else record('FAIL', id, text, 'target ' + show(expected) + ', observed ' + show(actual) + ', catalogued ' + defect + ' value was ' + show(known));
}
/** Needs the contribution ledger or the migration; recorded, not executed. */
function spec(id, text, observedNow) {
  record('SPEC', id, text, observedNow === undefined ? '' : 'today: ' + observedNow);
}

function scenario(name, fn) {
  scenarioName = name;
  const firstApp = apps.length;
  try {
    fn();
  } catch (e) {
    record('ERROR', 'scenario', e instanceof HarnessError ? e.message : String(e && e.stack || e));
  }
  apps.slice(firstApp).forEach(a => a.warnings.forEach(w => record('ERROR', 'console', 'production code warned: ' + w)));
}

const MODES = ['session', 'reload'];
/** Per-mode value: by(mode, { session: x, reload: y }). Missing keys mean undefined. */
const by = (mode, values) => values[mode];

/** Compares the two modes' timelines label by label. */
function parity(id, text, timelines, knownDiffLabels, defect) {
  const s = timelines.session || [], r = timelines.reload || [];
  if (!s.length || !r.length || s.length !== r.length) {
    record('ERROR', id, 'parity timelines missing or misaligned');
    return;
  }
  const diffs = s.filter((x, i) => !same(x.snap, r[i].snap)).map(x => x.label);
  target(id, text + ' — labels where same-session and reload differ', diffs, [], knownDiffLabels, defect);
}

// ───────────────────────────── fixtures ─────────────────────────────

const HOLIDAY = () => ({ id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' });
const ISA = () => ({ id: 'iA', name: 'ISA', type: 'isa', balance: 5000, baseBalance: 5000 });
const baseState = extra => Object.assign({ income: 3000, payments: [], expenses: [], goals: [HOLIDAY()], investments: [ISA()],
  debts: [], savingsReleases: [], debtPaymentEvents: [], activityLog: [], lastSuggestedActions: [] }, extra || {});
const monthlyHoliday = (app, date) => app.contribute({ name: 'Holiday monthly', amount: 100, date: date || '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
const signature = rows => rows.map(r => ({ rec: r.rec, amount: r.amount })).sort((a, b) => (a.rec + a.amount).localeCompare(b.rec + b.amount));

// ───────────────────────────── scenarios ─────────────────────────────

function harnessFidelity() {
  scenario('Harness fidelity — shims mirror production boot and render', () => {
    const load = PROGRAM.structural.load;
    const order = ['syncRecurringPayments();', 'migratePaymentFlowFields();', 'geodeNormalizeGoalInvestBaseFields();',
      'geodeNormalizeSavingsReleases(S);', 'geodeNormalizeDebtPaymentEvents(S);', 'geodeRecomputeBalancesFromPayments();'];
    const at = order.map(c => load.indexOf(c));
    invariant('fidelity.load', 'load() runs the reload-shim sequence in this order', at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1])), true);
    const render = PROGRAM.structural.render;
    invariant('fidelity.render', 'render() starts rollover with syncRecurringPayments() and never recomputes balances itself',
      render.indexOf('syncRecurringPayments();') >= 0 && render.indexOf('geodeRecomputeBalancesFromPayments') < 0, true);
    const dupes = PROGRAM.extracted.filter(f => f.declarations > 1).map(f => f.name + ' ×' + f.declarations);
    invariant('fidelity.declarations', 'extracted production functions declared exactly once', dupes, []);
  });
}

function goalA() {
  const timelines = {};
  MODES.forEach(mode => scenario('GOAL A — three completed recurring months [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    let s = app.snap('Jun 15 completed');
    invariant('A.jun.goal', 'June completed: Holiday', s.goal.gH, 1100);
    invariant('A.jun.left', 'June Monthly Left', s.left, 2900);
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    target('A.jul.rollover', 'After July rollover Holiday still includes June', s.goal.gH, 1100, by(mode, { reload: 1000 }), 'D1');
    app.at('2026-07-15'); app.toggle(id); s = app.snap('Jul 15 completed');
    target('A.jul.goal', 'July completed: Holiday', s.goal.gH, 1200, 1100, 'D1');
    invariant('A.jul.left', 'July Monthly Left', s.left, 2900);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    target('A.aug.rollover', 'After August rollover Holiday still includes June + July', s.goal.gH, 1200, by(mode, { session: 1100, reload: 1000 }), 'D1');
    app.at('2026-08-15'); app.toggle(id); s = app.snap('Aug 15 completed');
    target('A.aug.goal', 'August completed: Holiday', s.goal.gH, 1300, 1100, 'D1');
    invariant('A.aug.left', 'August Monthly Left', s.left, 2900);
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL A — same-session vs reload', () => {
    parity('A.parity', 'GOAL A', timelines, ['Jul 02 rollover', 'Aug 02 rollover'], 'D6');
    spec('A.ledger', 'Durable completions exist for 2026-06, 2026-07 and 2026-08 (one each, £100)', 'no occurrence record exists');
  });
}

function goalB() {
  const timelines = {};
  MODES.forEach(mode => scenario('GOAL B — completed / missed / completed [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    let s = app.snap('Jun 15 completed');
    invariant('B.jun.goal', 'June completed: Holiday', s.goal.gH, 1100);
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    target('B.jul.rollover', 'July rollover: Holiday keeps June', s.goal.gH, 1100, by(mode, { reload: 1000 }), 'D1');
    app.advance('2026-07-16', mode); s = app.snap('Jul 16 July not completed');
    target('B.jul.missed', 'July not completed: Holiday keeps June', s.goal.gH, 1100, by(mode, { reload: 1000 }), 'D1');
    invariant('B.jul.left', 'July Monthly Left allocates July\'s £100 once', s.left, 2900);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('B.aug.left', 'August Monthly Left: missed July £100 does not carry into August', s.left, 2900);
    target('B.aug.rollover', 'August rollover: Holiday keeps June', s.goal.gH, 1100, by(mode, { reload: 1000 }), 'D1');
    app.at('2026-08-15'); app.toggle(id); s = app.snap('Aug 15 completed');
    target('B.aug.goal', 'August completed: Holiday', s.goal.gH, 1200, 1100, 'D1');
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL B — same-session vs reload', () => {
    parity('B.parity', 'GOAL B', timelines, ['Jul 02 rollover', 'Jul 16 July not completed', 'Aug 02 rollover'], 'D6');
    spec('B.history', 'History reads June = completed, July = not recorded (missed), August = completed', 'one recurring row; no per-month record');
  });
}

function goalC() {
  const timelines = {};
  MODES.forEach(mode => scenario('GOAL C1 — June missed, July completed + separate £100 catch-up [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.advance('2026-06-20', mode);
    app.advance('2026-07-05', mode);
    app.toggle(id);
    app.contribute({ name: 'June catch-up', amount: 100, date: '2026-07-05', status: 'paid', rec: 'no', goalId: 'gH' });
    let s = app.snap('Jul 05 July + catch-up');
    invariant('C1.jul.goal', 'July: Holiday after July £100 + catch-up £100', s.goal.gH, 1200);
    invariant('C1.jul.left', 'July Monthly Left', s.left, 2800);
    invariant('C1.jul.rows', 'Two independent rows (recurring £100, one-off £100)', signature(s.rows), [{ rec: 'no', amount: 100 }, { rec: 'yes', amount: 100 }]);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    target('C1.aug.rollover', 'August rollover before another completion: Holiday stays £1,200', s.goal.gH, 1200, by(mode, { reload: 1100 }), 'D1');
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL C1 — same-session vs reload', () => parity('C1.parity', 'GOAL C1', timelines, ['Aug 02 rollover'], 'D6'));

  scenario('GOAL C2 — June missed, recurring ticked on 5 July', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.advance('2026-06-20', 'reload');
    app.advance('2026-07-05', 'reload');
    app.toggle(id);
    const s = app.snap();
    invariant('C2.goal', 'Holiday after the 5 July tick', s.goal.gH, 1100);
    invariant('C2.occurrence', 'Recorded as a July completion (lastPaidYM)', s.rows[0].lastPaidYM, '2026-07');
    invariant('C2.no-june', 'Rows recording a June completion', String(s.rows.filter(r => r.lastPaidYM === '2026-06').length), '0');
    current('C2.next-date', 'Next due date after the tick', s.rows[0].date, '2026-08-15');
  });
}

function goalD() {
  const orders = {
    'recurring first': app => { monthlyHoliday(app); app.at('2026-06-06'); app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' }); },
    'one-off first': app => { app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' }); app.at('2026-06-06'); monthlyHoliday(app); }
  };
  const known = {
    'recurring first': { rows: [{ rec: 'yes', amount: 250 }], left: 2750, goal: 1250, julSession: 1250, julReload: 1000, template: [250] },
    'one-off first': { rows: [{ rec: 'yes', amount: 100 }], left: 2900, goal: 1100, julSession: 1100, julReload: 1000, template: undefined }
  };
  Object.keys(orders).forEach(order => MODES.forEach(mode => scenario('GOAL D — one-off £250 + recurring £100 in June, ' + order + ' [' + mode + ']', () => {
    const k = known[order];
    const app = new App(baseState(), '2026-06-05');
    orders[order](app);
    let s = app.snap();
    target('D.rows', 'Two independent intents: one-off £250 and recurring £100', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 100 }], k.rows, 'D4');
    target('D.left', 'June Monthly Left', s.left, 2650, k.left, 'D4');
    app.at('2026-06-20'); app.completeAllUnpaid(); s = app.snap();
    target('D.goal', 'June: both completed', s.goal.gH, 1350, k.goal, 'D4');
    app.advance('2026-07-02', mode); s = app.snap();
    target('D.jul.goal', 'July rollover preserves £1,350', s.goal.gH, 1350, mode === 'reload' ? k.julReload : k.julSession, 'D4');
    target('D.jul.template', 'July recurring template amount' + (k.template === undefined ? ' (today right only because the £250 was overwritten)' : ''),
      s.rows.filter(r => r.rec === 'yes').map(r => r.amount), [100], k.template, 'D4');
  })));
}

function goalE() {
  scenario('GOAL E — rename goal after a completed £250 contribution', () => {
    const app = new App(baseState(), '2026-06-10');
    app.contribute({ name: 'Holiday top-up', amount: 250, date: '2026-06-10', status: 'paid', rec: 'no', goalId: 'gH' });
    invariant('E.before', 'Holiday after £250 completed', app.snap().goal.gH, 1250);
    app.renameGoal('gH', 'Holiday trip');
    const s = app.snap();
    target('E.goal', 'Rename leaves Holiday unchanged', s.goal.gH, 1250, 1500, 'D3');
    target('E.activity', 'Rename logs no goal movement', s.activity.filter(a => a.type === 'goal'), [], [{ type: 'goal', delta: 250 }], 'D3');
  });
  scenario('GOAL E — rename investment after a completed £500 contribution', () => {
    const app = new App(baseState(), '2026-06-05');
    app.contribute({ name: 'ISA top-up', amount: 500, date: '2026-06-05', status: 'paid', rec: 'no', investId: 'iA' });
    invariant('E.inv.before', 'ISA after £500 completed', app.snap().inv.iA, 5500);
    app.saveInvestment('iA', 'ISA renamed');
    const s = app.snap();
    target('E.inv', 'Rename leaves ISA unchanged', s.inv.iA, 5500, 6000, 'D3');
    target('E.inv.activity', 'Rename logs no investment movement', s.activity.filter(a => a.type === 'invest'), [], [{ type: 'invest', delta: 500 }], 'D3');
  });
}

function goalF() {
  scenario('GOAL F1 — July template edit £100 → £150 after June completion', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    app.advance('2026-07-02', 'reload');
    app.editPayment(id, { amount: 150 });
    let s = app.snap();
    invariant('F1.jul.left', 'July Monthly Left allocates £150', s.left, 2850);
    app.at('2026-07-15'); app.toggle(id); s = app.snap();
    target('F1.jul.goal', 'July completed at £150: Holiday = base + June £100 + July £150', s.goal.gH, 1250, 1150, 'D1');
    invariant('F1.jul.left.after', 'July Monthly Left after completion', s.left, 2850);
    spec('F1.june', 'June occurrence remains £100 after the template edit', 'June is not recorded anywhere');
  });
  scenario('GOAL F2 — template edit in June after June is completed', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    app.editPayment(id, { amount: 150 });
    const s = app.snap();
    target('F2.goal', 'Editing the template does not rewrite June\'s recorded £100', s.goal.gH, 1100, 1150, 'D9');
    target('F2.left', 'June Monthly Left reflects the £100 actually recorded', s.left, 2900, 2850, 'D9');
  });
}

function goalG() {
  MODES.forEach(mode => scenario('GOAL G — delete recurring template in July after June completion [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    app.advance('2026-07-02', mode);
    app.del(id);
    const s = app.snap();
    target('G.goal', 'Holiday keeps June after the template is deleted', s.goal.gH, 1100, 1000, 'D1');
    invariant('G.left', 'July Monthly Left', s.left, 3000);
    spec('G.history', 'June completion survives template deletion', 'deleting the row removes the only record');
  }));
}

function goalH() {
  scenario('GOAL H — complete → undo → redo → undo (June)', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15');
    const seen = [];
    app.toggle(id); seen.push(app.snap().goal.gH);
    app.toggle(id); seen.push(app.snap().goal.gH);
    target('H.date.undo', 'Due date returns to 15 June after complete → undo', app.snap().rows[0].date, '2026-06-15', '2026-07-15', 'D8');
    app.toggle(id); seen.push(app.snap().goal.gH);
    app.toggle(id); seen.push(app.snap().goal.gH);
    invariant('H.sequence', 'Holiday through the sequence', seen, [1100, 1000, 1100, 1000]);
    invariant('H.final', 'Final Holiday', seen[3], 1000);
    invariant('H.bounds', 'Never below £1,000 or above £1,100', seen.every(v => v >= 1000 && v <= 1100), true);
    target('H.date.final', 'Due date after the full sequence', app.snap().rows[0].date, '2026-06-15', '2026-08-15', 'D8');
    app.advance('2026-07-02', 'reload');
    target('H.date.july', 'July shows the July occurrence as next due', app.snap().rows[0].date, '2026-07-15', '2026-08-15', 'D8');
    spec('H.ledger', 'At most one active completion per payment and month; four events (completion, reversal, completion, reversal)', 'no occurrence record exists');
  });
}

function missedRecurring() {
  const timelines = {};
  MODES.forEach(mode => scenario('MISSED — £100/month due 15 June, never completed [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    monthlyHoliday(app);
    let s = app.snap('Jun 05 scheduled');
    invariant('M.jun.left', 'June Monthly Left allocates £100', s.left, 2900);
    app.advance('2026-06-16', mode); s = app.snap('Jun 16 past due');
    current('M.jun.status', 'June after due date: effective status', s.rows[0].effective, 'overdue');
    current('M.jun.home', 'June after due date: Home overdue payment items', String(s.homeOverduePayments), '1');
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    current('M.jul.rows', 'July rollover: one row, moved to 15 July (June no longer identifiable)', s.rows.map(r => [r.date, r.effective]), [['2026-07-15', 'upcoming']]);
    invariant('M.jul.left', 'July Monthly Left allocates only July\'s £100 (missed June is not a liability)', s.left, 2900);
    invariant('M.jul.goal', 'Holiday unchanged', s.goal.gH, 1000);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    current('M.aug.rows', 'August rollover: same row moved to 15 August', s.rows.map(r => r.date), ['2026-08-15']);
    invariant('M.aug.left', 'August Monthly Left allocates only August\'s £100', s.left, 2900);
    timelines[mode] = app.timeline;
  }));
  scenario('MISSED — same-session vs reload', () => {
    parity('M.parity', 'MISSED', timelines, undefined, '');
    spec('M.history', 'History can answer "June = not completed" (derived from template + absence of a June completion)', 'June is erased at July rollover');
  });
}

function investments() {
  const timelines = {};
  MODES.forEach(mode => scenario('INVESTMENT — £200/month June, July, August [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA monthly', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'yes', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    let s = app.snap('Jun 10 completed');
    invariant('I.jun', 'June completed: ISA', s.inv.iA, 5200);
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    target('I.jul.rollover', 'July rollover keeps June', s.inv.iA, 5200, by(mode, { reload: 5000 }), 'D1');
    app.at('2026-07-10'); app.toggle(id); s = app.snap('Jul 10 completed');
    target('I.jul', 'July completed: ISA', s.inv.iA, 5400, 5200, 'D1');
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    target('I.aug.rollover', 'August rollover keeps June + July', s.inv.iA, 5400, by(mode, { session: 5200, reload: 5000 }), 'D1');
    app.at('2026-08-10'); app.toggle(id); s = app.snap('Aug 10 completed');
    target('I.aug', 'August completed: ISA', s.inv.iA, 5600, 5200, 'D1');
    timelines[mode] = app.timeline;
  }));
  scenario('INVESTMENT — same-session vs reload', () => parity('I.parity', 'INVESTMENT', timelines, ['Jul 02 rollover', 'Aug 02 rollover'], 'D6'));

  scenario('INVESTMENT — value entered as £5,600 on 20 July', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA monthly', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'yes', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    app.advance('2026-07-02', 'reload');
    app.at('2026-07-10'); app.toggle(id);
    app.at('2026-07-20'); app.saveInvestment('iA', 'ISA', 5600);
    let s = app.snap();
    target('I.val.display', 'Display at valuation equals the entered £5,600', s.inv.iA, 5600, 5800, 'D10');
    app.advance('2026-08-02', 'reload'); s = app.snap();
    invariant('I.val.aug.rollover', 'August rollover: £5,600 (today only coincidentally right: lost July row offsets D10)', s.inv.iA, 5600);
    app.at('2026-08-10'); app.toggle(id); s = app.snap();
    invariant('I.val.aug', 'August £200 after the valuation: estimated £5,800 (today coincidentally right)', s.inv.iA, 5800);
    spec('I.val.capital', 'Contributed capital since tracking = £600; estimated value = last entered value + contributions recorded after it', 'no valuation or occurrence record exists');
  });
}

function quickSetup() {
  const timelines = {};
  MODES.forEach(mode => scenario('QUICK SETUP — essentials across June, July, August [' + mode + ']', () => {
    const app = new App(baseState({ income: 0, goals: [], investments: [] }), '2026-06-10');
    app.quickSetup({ income: '2500', incomeType: 'regular', hasDependants: false,
      expenses: { housing: '900', food: '300', transport: '150', bills: '120' }, debt: { total: '', min: '' } });
    current('QS.rec', 'Quick Setup expense recurrence (housing, food, transport, bills)',
      app.state().expenses.map(e => [e.id, e.rec]), [['qs_housing', 'no'], ['qs_food', 'no'], ['qs_transport', 'no'], ['qs_bills', 'yes']]);
    let s = app.snap('Jun 10 setup');
    invariant('QS.jun', 'June Monthly Left', s.left, 1030);
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    target('QS.jul', 'July Monthly Left', s.left, 1030, 2380, 'D2');
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    target('QS.aug', 'August Monthly Left', s.left, 1030, 2380, 'D2');
    timelines[mode] = app.timeline;
  }));
  scenario('QUICK SETUP — same-session vs reload', () => parity('QS.parity', 'QUICK SETUP', timelines, undefined, ''));
}

function monthlyLeft() {
  MODES.forEach(mode => scenario('MONTHLY LEFT — unpaid voluntary one-off £250 in June [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-10');
    app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    invariant('ML.vol.jun', 'June Monthly Left', app.snap().left, 2750);
    app.advance('2026-07-02', mode);
    target('ML.vol.jul', 'July Monthly Left (voluntary contribution lapsed, not a liability)', app.snap().left, 3000, 2750, 'D5');
    app.advance('2026-08-02', mode);
    target('ML.vol.aug', 'August Monthly Left', app.snap().left, 3000, 2750, 'D5');
  }));
  MODES.forEach(mode => scenario('MONTHLY LEFT — unpaid one-off bill £250 in June [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-10');
    app.contribute({ name: 'Boiler service', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no' });
    invariant('ML.bill.jun', 'June Monthly Left', app.snap().left, 2750);
    app.advance('2026-07-02', mode);
    current('ML.bill.jul', 'July Monthly Left (unpaid bill still a liability under current rules)', app.snap().left, 2750);
    app.advance('2026-08-02', mode);
    current('ML.bill.aug', 'August Monthly Left', app.snap().left, 2750);
  }));
}

function identity() {
  scenario('IDENTITY A — completed one-off £250 while recurring £100 is scheduled', () => {
    const app = new App(baseState(), '2026-06-05');
    monthlyHoliday(app);
    app.at('2026-06-10');
    app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-10', status: 'paid', rec: 'no', goalId: 'gH' });
    const s = app.snap();
    target('ID.A.rows', 'Rows stay independent', s.rows.map(r => ({ rec: r.rec, amount: r.amount, status: r.status })).sort((a, b) => a.amount - b.amount),
      [{ rec: 'yes', amount: 100, status: 'upcoming' }, { rec: 'no', amount: 250, status: 'paid' }], [{ rec: 'yes', amount: 250, status: 'paid' }], 'D4');
  });
  scenario('IDENTITY B — two separate user one-offs £250 and £50 in June', () => {
    const app = new App(baseState(), '2026-06-05');
    app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    app.contribute({ name: 'Holiday small', amount: 50, date: '2026-06-22', status: 'upcoming', rec: 'no', goalId: 'gH' });
    const s = app.snap();
    target('ID.B.rows', 'Two independent intents', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'no', amount: 50 }], [{ rec: 'no', amount: 50 }], 'D4');
    target('ID.B.left', 'June Monthly Left', s.left, 2700, 2950, 'D4');
  });
  scenario('IDENTITY C — repeating the same Plan scheduling action (F.3 protection)', () => {
    const app = new App(baseState(), '2026-06-05');
    app.planSchedule({ name: 'Holiday', amount: 120, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    app.planSchedule({ name: 'Holiday', amount: 120, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    invariant('ID.C.goal.repeat', 'Goal: repeat schedule leaves one row', signature(app.rows()), [{ rec: 'yes', amount: 120 }]);
    const inv = new App(baseState(), '2026-06-05');
    inv.planSchedule({ name: 'ISA', amount: 96, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    inv.planSchedule({ name: 'ISA', amount: 120, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    invariant('ID.C.inv.replace', 'Investment: re-schedule £96 → £120 replaces the amount on one row', signature(inv.rows()), [{ rec: 'yes', amount: 120 }]);
  });
}

function releases() {
  MODES.forEach(mode => scenario('RELEASE R1 — release £1,100 after June completion, then July [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app, '2026-06-10');
    app.at('2026-06-10'); app.toggle(id);
    app.at('2026-06-20');
    const r = app.release('gH', 1100);
    invariant('R1.applied', 'Release applied for £1,100', [r.ok, r.event && r.event.amount], [true, 1100]);
    invariant('R1.jun', 'Holiday after release', app.snap().goal.gH, 0);
    app.advance('2026-07-02', mode);
    invariant('R1.jul.rollover', 'Holiday after July rollover', app.snap().goal.gH, 0);
    app.at('2026-07-10'); app.toggle(id);
    target('R1.jul', 'July £100 completion is visible', app.snap().goal.gH, 100, 0, 'D7');
  }));
  scenario('RELEASE R2 — rename after a £200 release', () => {
    const app = new App(baseState(), '2026-06-05');
    const r = app.release('gH', 200);
    invariant('R2.applied', 'Release applied for £200', [r.ok, r.event && r.event.amount], [true, 200]);
    invariant('R2.before', 'Holiday after release', app.snap().goal.gH, 800);
    app.renameGoal('gH', 'Holiday trip');
    target('R2.after', 'Rename does not deduct the release again', app.snap().goal.gH, 800, 600, 'D3');
  });
}

function deposits() {
  scenario('DEPOSIT — "+" £50, rename, rollover', () => {
    const app = new App(baseState(), '2026-06-05');
    app.deposit('gH', 50);
    invariant('DEP.after', 'Holiday after + £50', app.snap().goal.gH, 1050);
    app.renameGoal('gH', 'Holiday trip');
    invariant('DEP.rename', 'Rename after deposit', app.snap().goal.gH, 1050);
    app.advance('2026-07-02', 'reload');
    invariant('DEP.rollover', 'July rollover', app.snap().goal.gH, 1050);
    spec('DEP.event', 'A + deposit is a durable, reversible deposit event (not a direct baseSaved mutation)', 'baseSaved += amount; no undo');
  });
}

function migrationFixtures() {
  const data = JSON.parse(readSource(FIXTURES_JSON));
  data.fixtures.forEach(f => scenario('MIGRATION FIXTURE — ' + f.id, () => {
    const app = new App(f.state, f.clock);
    app.reload();
    const s = app.snap();
    const shown = f.entity.kind === 'goal' ? s.goal[f.entity.id] : s.inv[f.entity.id];
    current('MIG.' + f.id + '.display', 'Displayed before migration', shown, f.displayBeforeMigration);
    spec('MIG.' + f.id + '.identity', 'Displayed immediately after migration equals ' + show(f.displayBeforeMigration) + '; migration is idempotent; nothing backfilled', f.history);
  }));
}

// ───────────────────────────── run ─────────────────────────────

let PROGRAM;
function main() {
  try {
    PROGRAM = buildProgram();
  } catch (e) {
    console.log('ERROR  harness could not load production code: ' + (e instanceof HarnessError ? e.message : (e.stack || e)));
    process.exit(2);
  }
  harnessFidelity();
  goalA(); goalB(); goalC(); goalD(); goalE(); goalF(); goalG(); goalH();
  missedRecurring(); investments(); quickSetup(); monthlyLeft(); identity(); releases(); deposits();
  migrationFixtures();

  console.log('Beynd cross-month financial truth harness');
  console.log('production: ' + path.relative(process.cwd(), INDEX_HTML) + ' (' + PROGRAM.extracted.length + ' functions) + ' + path.relative(process.cwd(), FOUNDATION_JS));
  let last = '';
  results.forEach(r => {
    if (r.scenario !== last) { console.log('\n== ' + r.scenario); last = r.scenario; }
    console.log('  ' + r.status.padEnd(8) + r.id.padEnd(26) + ' ' + r.text + (r.detail ? '\n  ' + ' '.repeat(35) + r.detail : ''));
  });
  const kinds = ['PASS', 'CURRENT', 'XFAIL', 'SPEC', 'XPASS', 'CHANGED', 'FAIL', 'ERROR'];
  const count = k => results.filter(r => r.status === k).length;
  console.log('\nKnown defects referenced by XFAIL:');
  Object.keys(DEFECTS).forEach(d => {
    const n = results.filter(r => r.status === 'XFAIL' && r.detail.indexOf('[' + d + ']') >= 0).length;
    console.log('  ' + d.padEnd(4) + String(n).padStart(3) + '  ' + DEFECTS[d]);
  });
  console.log('\nSummary: ' + kinds.map(k => k + ': ' + count(k)).join('  '));
  const bad = count('FAIL') + count('XPASS') + count('CHANGED') + count('ERROR');
  console.log(bad ? 'RESULT: NOT CLEAN — investigate FAIL / XPASS / CHANGED / ERROR above' : 'RESULT: CLEAN — no unexpected results');
  process.exit(bad ? 1 : 0);
}

main();
