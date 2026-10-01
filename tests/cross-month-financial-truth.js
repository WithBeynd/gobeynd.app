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
  'geodeRecomputeBalancesFromPayments', 'geodePaymentBalanceEffect', 'geodeGoalCountedContributions',
  'geodeNormalizeGoalInvestBaseFields', 'geodeSavingsReleaseDeductionSumForSource',
  'geodeGoalEffectiveSavedFromState', 'geodeGoalHasPositiveLinkedInvestmentForState', 'geodeGoalLinkedInvBalanceForState',
  // Monthly Left
  'calcMonthlyLeftover', 'calcMonthlyLeftoverConfirmedOnly', 'sumPaymentsMonthlyOutflow',
  'sumPaymentsMonthlyOutflowConfirmedOnly', 'paymentCountsForMonthlyOutflow', 'paymentCountsForMonthlyOutflowConfirmedOnly',
  'sumExpensesMonthly', 'geodeExpenseIsOneOff', 'geodeExpenseIsExpiredOneOff', 'geodeExpenseMonthValue',
  'geodeExpenseDateValue', 'geodePaymentCountsAsPaidInCurrentMonth', 'geodeOverdueItems',
  // entity edits and Quick Setup
  'saveGoal', 'geodeEditAmountChanged', 'doDep', 'saveInv', 'geodeQsDone', 'geodeQuickSetupNum',
  // savings release
  'geodeApplySavingsRelease', 'geodeSavingsReleaseEligibility', 'geodeSavingsReleaseResolveSource',
  'geodeSavingsReleaseSourceType', 'geodeSavingsReleaseAvailableBalance', 'geodeReserveClassifySource',
  'geodeSavingsReleaseFindGoal', 'geodeSavingsReleaseFindInvest', 'geodeIsEmergencyBufferGoal',
  'geodeNormalizeSavingsReleases',
  // debt ledger: shared payment paths call it; it must stay inert for goal/investment rows
  'geodeNormalizeDebtPaymentEvents', 'geodeDebtPaymentEventSnapshot', 'geodeDebtPaymentOccurrenceYm',
  'geodeDebtPaymentActiveCompletion', 'geodeDebtPaymentEventId', 'geodeRecordDebtPaymentTransition',
  'geodeDebtPaymentYmValid', 'geodeDebtPaymentPointerTarget',
  // contribution ledger (FA-3A): captured on the same payment paths; nothing reads it for balances yet
  'geodeNormalizeContributionEvents', 'geodeContributionYmValid', 'geodeContributionEventValid', 'geodeContributionLedger',
  'geodeContributionActiveCompletions', 'geodeContributionActiveCompletion', 'geodeContributionEntityRef',
  'geodeContributionRecurrence', 'geodeContributionOccurrenceYm', 'geodeContributionEventSnapshot',
  'geodeContributionCompletionFields', 'geodeContributionPointerTarget', 'geodeContributionYmAdd', 'geodeContributionRowRepresents',
  'geodeContributionPriorCompletion', 'geodeContributionEventId',
  'geodeAppendContributionCompletion', 'geodeAppendContributionReversal', 'geodeRecordContributionTransition',
  'geodeRecordContributionDeletion', 'geodeEnsureContributionCompletion',
  // legacy contribution seeding (FA-3B): load seeds completions that legacy paid rows prove
  'geodeLegacyContributionSeedFields', 'geodeSeedLegacyContributionEvents',
  // legacy carry (FA-3C-A): payment-level carries and the schema-2 goal authority, simulated only
  'geodeNormalizeContributionCarry', 'geodeContributionCarryValid', 'geodeContributionCarryResolutionValid',
  'geodeContributionCarryLedger', 'geodeContributionCarryActive', 'geodeLegacyCarryCandidate', 'geodeSchema2TransitionCarryRecords',
  'geodeSchema2GoalParts', 'geodeSchema2GoalPosition', 'geodeSchema2GoalEffectiveSaved', 'geodeSchema2GoalCorrectionBase',
  // Smart Import and backup export / restore extraction
  'geodeSmartImportConfirm', 'exportJSONBackup', 'isPlainObject', 'validateBeyndBackupEnvelope',
  'geodeBeyndBackupRestorableKeyWhitelist', 'geodeBeyndBackupForbiddenDataKeys', 'extractRestorableData',
  // activity log
  'appendActivityLog', 'trimActivityLogForRetention'
];

/** Production top-level constants the extracted base functions read. */
const BASE_CONSTANTS = ['GEODE_SCHEMA_VERSION'];

/**
 * Read-only structural checks: the reload and render shims below must mirror these production bodies, and the
 * App.contribute / App.planSchedule intents must mirror what the payment modal's callers pass.
 */
const STRUCTURAL_FUNCTIONS = ['load', 'render', 'openPayModal', 'geodePayFromGoal', 'geodePayFromInvest', 'geodePayFromDebt',
  'openPayQuick', 'geodePlanDetailActionForStep', 'geodeMainActionFromPriorityStep', 'openSuggestedAction', 'openGoalModal', 'openInvModal'];

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
/** A boolean field is a checkbox. */
var document = { getElementById: function (id) {
  if (!Object.prototype.hasOwnProperty.call(__fields, id)) return null;
  return typeof __fields[id] === 'boolean' ? { checked: __fields[id], value: 'on' } : { value: __fields[id] };
} };
/** Backup export: the confirm is accepted and the downloaded file is captured in __downloads. */
var __downloads = [];
function confirm() { return true; }
function Blob(parts) { this.text = parts.join(''); }
var URL = { createObjectURL: function (b) { __downloads.push(b.text); return 'blob:' + __downloads.length; }, revokeObjectURL: function () {} };
document.createElement = function () { return { click: function () {} }; };
document.body = { appendChild: function () {}, removeChild: function () {} };
function geodeSmartImportRememberLearn() {} function geodeSmartImportShowHandoffModal() {}

var __uidN = 0;
function uid() { __uidN++; return 'id' + __uidN; }
function rc() { return '#9b7fe8'; }
function fm(v) { return '£' + Math.round(Number(v) || 0); }

function render() {} function rGoals() {} function closeModal() {} function checkAlerts() {} function syncPills() {} function goTab() {}
var __toasts = [];
function toast(m) { __toasts.push(String(m)); } function geodeSuccessToast() {} function geodeStageLToastAfterSave(m) { return m; }
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
  geodeNormalizeContributionEvents(S);
  geodeNormalizeContributionCarry(S);
  geodeSeedLegacyContributionEvents();
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
        date: p.date, lastPaidYM: p.lastPaidYM || '', goalId: p.goalId || '', investId: p.investId || '', debtId: p.debtId || '',
        direct: p.directContribution === true, countsInMonthlyLeft: paymentCountsForMonthlyOutflow(p) };
    }),
    activity: (S.activityLog || []).map(function (e) { return { type: e.type, delta: e.delta }; })
  });
}

/** Contributions the recompute adds to a goal, measured on a copy with zero base and no releases, beside geodeGoalCountedContributions. */
function __countedCheck(goalId) {
  var keep = S;
  try {
    S = JSON.parse(JSON.stringify(keep));
    S.goals.forEach(function (g) { g.baseSaved = 0; });
    S.savingsReleases = [];
    geodeRecomputeBalancesFromPayments();
    var g = S.goals.filter(function (x) { return x.id === goalId; })[0];
    var c = geodeGoalCountedContributions(S, g);
    var paidRecurring = 0;
    S.payments.forEach(function (p) {
      if (p && p.goalId === goalId && p.rec === 'yes' && geodePaymentEffectiveStatus(p) === 'paid') paidRecurring += toNum(p.amount);
    });
    var r = function (v) { return Math.round(v * 100) / 100; };
    return JSON.stringify({ recompute: r(toNum(g.saved)), helper: r(c.total), paidRecurring: r(paidRecurring), helperRecurring: r(c.recurring) });
  } finally {
    S = keep;
  }
}

/**
 * FA-3C hypothesis, measured on a copy: what goals and investments would show if base + active contribution
 * completions − event-derived releases were the authority (the recompute's release clamp and goal display rule).
 */
function __eventAuthority() {
  var keep = S;
  try {
    S = JSON.parse(JSON.stringify(keep));
    var active = geodeContributionActiveCompletions(S);
    var position = function (entityType, entity, base) {
      var sum = toNum(base);
      active.forEach(function (e) { if (e.entityType === entityType && e.entityId === String(entity.id)) sum += e.amount; });
      var ded = geodeSavingsReleaseDeductionSumForSource(S, entity.id);
      return ded > 0 ? Math.max(0, Math.round((sum - ded) * 100) / 100) : sum;
    };
    var goal = {}, inv = {};
    (S.goals || []).forEach(function (g) { g.saved = position('goal', g, g.baseSaved); });
    (S.investments || []).forEach(function (i) { i.balance = position('investment', i, i.baseBalance); });
    (S.goals || []).forEach(function (g) { goal[g.id] = geodeGoalEffectiveSavedFromState(S, g); });
    (S.investments || []).forEach(function (i) { inv[i.id] = toNum(i.balance); });
    return JSON.stringify({ goal: goal, inv: inv });
  } finally {
    S = keep;
  }
}

/**
 * FA-3C-A simulation, measured on a copy: the carries the schema 1→2 transition would create (none when createdAt is
 * null), and per goal what the app displays now beside the schema-2 parts, position and display.
 */
function __schema2(createdAt) {
  var keep = S;
  try {
    S = JSON.parse(JSON.stringify(keep));
    var created = createdAt === null ? [] : geodeSchema2TransitionCarryRecords(S, createdAt);
    S.contributionCarry = (S.contributionCarry || []).concat(created);
    geodeNormalizeContributionCarry(S);
    var goals = {};
    (S.goals || []).forEach(function (g) {
      goals[g.id] = { legacy: geodeGoalEffectiveSavedFromState(S, g), parts: geodeSchema2GoalParts(S, g),
        position: geodeSchema2GoalPosition(S, g), shown: geodeSchema2GoalEffectiveSaved(S, g) };
    });
    return JSON.stringify({ created: created, carry: S.contributionCarry, active: geodeContributionCarryActive(S), goals: goals });
  } finally {
    S = keep;
  }
}
`;

/**
 * Plan, Home and Suggested Actions entry points. They run in a second program: their production dependencies are
 * extracted transitively, and the real Suggested Actions reconciliation, cache invalidation and emergency-buffer
 * linking replace the base program's shims of the same names.
 */
const PLAN_ENTRY_FUNCTIONS = ['geodePlanDetailActionForStep', 'geodePlanStepActionState', 'geodePlanStepScheduledRows',
  'geodePlanStepScheduledAmount', 'geodeMainActionFromPriorityStep', 'getSuggestedActions', 'geodeHomePrepareSuggestedActionsList',
  'openSuggestedAction', 'geodeReconcileFrozenSuggestedActionsAfterLinkedSave', 'geodeInvalidateDecisionCaches',
  'geodeEnsureEmergencyBufferGoalForPayment'];

/** Production top-level constants the extracted Suggested Actions code reads. */
const PLAN_CONSTANTS = ['_FOLLOWTHROUGH_MS_2D', '_FOLLOWTHROUGH_MS_3D', 'SUGGESTED_REFRESH_COOLDOWN_MS', 'SUGGESTED_LEFTOVER_FRAC',
  'SUGGESTED_LEFTOVER_FLOOR', 'SUGGESTED_MAX_BATCH_AGE_MS', 'ADAPTIVE_MIN_EVIDENCE', 'ADAPTIVE_ROLL_WINDOW', 'geodeCoachingCopy'];

/** Plan-program environment: UI entry points and plan sizing, which these scenarios do not test. */
const PLAN_SHIMS = String.raw`
var msub = '';
/** getMonthPlan sizing is not under test: each scenario fixes the month's plan steps. */
var __plan = { steps: [] };
function getMonthPlan() { return __plan; }
/** The payment modal is UI: record what it was opened with; App.saveModal performs its save. */
var __opened = null;
function openPayModal(id, prefill) { __opened = { id: id || null, prefill: prefill ? JSON.parse(JSON.stringify(prefill)) : null }; }
function openInvModal() {}
function setTimeout(fn) { fn(); }
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
  if (!m) throw new HarnessError('production constant not found in index.html: ' + name);
  return m[0].trim();
}

function buildProgram() {
  const src = readSource(INDEX_HTML);
  const foundation = readSource(FOUNDATION_JS);
  const extracted = PRODUCTION_FUNCTIONS.map(n => extractFunction(src, n));
  const structural = {};
  STRUCTURAL_FUNCTIONS.forEach(n => { structural[n] = extractFunction(src, n).text; });
  const baseConstants = BASE_CONSTANTS.map(n => extractConstant(src, n)).join('\n');
  const code = TEST_SHIMS + '\n' + foundation + '\n' + extracted.map(f => f.text).join('\n') + '\n' + baseConstants + '\n';
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
  return { script, extracted, structural, src, plan: buildPlanProgram(src, foundation, extracted) };
}

/** Base program + PLAN_SHIMS + the PLAN_ENTRY_FUNCTIONS dependency closure; a name nothing defines is an error. */
function buildPlanProgram(src, foundation, extracted) {
  const constants = BASE_CONSTANTS.concat(PLAN_CONSTANTS).map(n => extractConstant(src, n));
  const baseCode = TEST_SHIMS + '\n' + PLAN_SHIMS + '\n' + foundation + '\n' + extracted.map(f => f.text).join('\n') + '\n' + constants.join('\n') + '\n';
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  new vm.Script(baseCode, { filename: 'cross-month-plan-probe.js' }).runInContext(probe);
  const planShims = new Set();
  PLAN_SHIMS.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_, n) => planShims.add(n));
  const have = new Map();
  const queue = PLAN_ENTRY_FUNCTIONS.slice();
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || planShims.has(n)) continue;
    if (PLAN_ENTRY_FUNCTIONS.indexOf(n) < 0 && vm.runInContext('typeof ' + n, probe) !== 'undefined') continue;
    const f = extractFunction(src, n);
    have.set(n, f);
    calledNames(f.text).forEach(c => queue.push(c));
  }
  const planExtracted = [...have.values()];
  const code = baseCode + planExtracted.map(f => f.text).join('\n') + '\n';
  return { script: new vm.Script(code, { filename: 'cross-month-plan-program.js' }), extracted: planExtracted };
}

// ───────────────────────────── simulated app ─────────────────────────────

const apps = [];

class App {
  /** program: PROGRAM (default) or PROGRAM.plan for Plan / Home / Suggested Actions scenarios. */
  constructor(state, clock, program) {
    this.warnings = [];
    const warnings = this.warnings;
    this.ctx = vm.createContext({
      console: {
        log() {}, info() {},
        warn(...a) { warnings.push(a.map(String).join(' ')); },
        error(...a) { warnings.push(a.map(String).join(' ')); }
      }
    });
    (program || PROGRAM).script.runInContext(this.ctx);
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
  /**
   * Payment form save (geodeSavePayApply) with the intent openPayModal assigns: 'replace' when editing a row,
   * 'new' for a contribution the user adds (plain modal, goal/investment cards, quick add).
   */
  contribute(o) {
    const before = new Set(this.state().payments.map(p => p.id));
    const gid = o.goalId || '', invid = o.investId || '', debtid = o.debtId || '';
    const kind = gid ? 'goal' : invid ? 'invest' : debtid ? 'debt' : 'bill';
    this.run('window._geodePayLinkedIntent = ' + JSON.stringify(o.intent || (o.id ? 'replace' : 'new')) + ';');
    this.call('geodeSavePayApply', [o.id || null, o.name || 'Contribution', String(o.amount), o.date, o.status, o.rec || 'no',
      o.date, gid, invid, debtid, kind, Number(o.amount)]);
    const added = this.state().payments.filter(p => !before.has(p.id));
    return added.length ? added[0].id : null;
  }
  editPayment(id, changes) {
    const p = this.state().payments.filter(x => x.id === id)[0];
    if (!p) throw new HarnessError('editPayment: no row ' + id);
    this.contribute(Object.assign({ id, name: p.name, amount: p.amount, date: p.date, status: p.status, rec: p.rec,
      goalId: p.goalId, investId: p.investId }, changes));
  }
  /** The 'set' save path: debt Plan actions reuse the same-month row and replace its amount (goal/investment/buffer gaps use 'add'). */
  planSchedule(o) { return this.contribute(Object.assign({ intent: 'set' }, o)); }
  /** Plan program only: fix the month's plan steps that Plan, Home and Suggested Actions read. */
  setPlan(steps) { this.run('__plan = { steps: ' + JSON.stringify(steps) + ' };'); }
  /** What Plan detail shows for a step, with the shared action state behind it. */
  planView(step) {
    this.ctx.__stepJson = JSON.stringify(step);
    return JSON.parse(this.run(`(function () {
      var step = JSON.parse(__stepJson), st = geodePlanStepActionState(S, step), a = geodePlanDetailActionForStep(S, step, st.progress, 0);
      return JSON.stringify({ label: a.show ? a.label : '', amount: a.show ? a.amount : null, applied: st.applied, scheduled: st.scheduled,
        gap: st.coverageGap, actionable: st.isActionable, scheduledOnly: st.isScheduledOnly, actionAmount: st.actionAmount });
    })()`));
  }
  /** What the Home main action shows for a step. */
  homeView(step) {
    this.ctx.__stepJson = JSON.stringify(step);
    return JSON.parse(this.run('(function () { var a = geodeMainActionFromPriorityStep(S, JSON.parse(__stepJson)); return JSON.stringify({ cta: a.cta, amount: a.amount }); })()'));
  }
  /** Home render: rebuilds the Suggested Actions list (window._geodeSuggestedActions) from the frozen batch and the plan. */
  suggestions() {
    this.run('geodeHomePrepareSuggestedActionsList();');
    return JSON.parse(this.run('JSON.stringify((window._geodeSuggestedActions || []).map(function (a) { return { type: a.type, amount: a.amount }; }))'));
  }
  planTap(step, amount) { return this.tap('(function () { var step = JSON.parse(__stepJson); geodePlanDetailActionForStep(S, step, geodePlanStepActionState(S, step).progress, 0).run(); })()', step, amount); }
  homeTap(step, amount) { return this.tap('geodeMainActionFromPriorityStep(S, JSON.parse(__stepJson)).run()', step, amount); }
  suggestedTap(index, amount) { return this.tap('openSuggestedAction(' + index + ')', null, amount); }
  /** Runs a surface's action; when it opened the payment modal, saves it (amount: what the user typed, else the prefill). */
  tap(code, step, amount) {
    this.ctx.__stepJson = JSON.stringify(step || null);
    this.run('__opened = null; msub = "";');
    this.run(code);
    const opened = JSON.parse(this.run('JSON.stringify(__opened)'));
    const out = { msub: this.run('msub'), id: opened ? opened.id : null, intent: null };
    if (opened) out.intent = this.saveModal(opened, amount);
    return out;
  }
  /** Mirrors openPayModal (intent, buffer flag, edit form filled from the row) and savePay (pre-save merge, then save). */
  saveModal(opened, amount) {
    const row = opened.id ? this.state().payments.filter(p => p.id === opened.id)[0] : null;
    const f = row ? { name: row.name, amount: row.amount, date: row.date, status: row.status, rec: row.rec === 'yes',
      goalId: row.goalId, investId: row.investId, debtId: row.debtId } : opened.prefill;
    const intent = row ? 'replace' : f._geodePayIntent ? this.call('geodeNormalizePayLinkedIntent', [f._geodePayIntent]) : 'new';
    this.run('window._geodePayPrefillBufferContribution = ' + JSON.stringify(!row && f.bufferContribution === true) + ';');
    this.merge();
    this.contribute({ id: row ? row.id : null, intent, name: f.name, amount: amount != null ? amount : f.amount, date: f.date,
      status: f.status, rec: f.rec ? 'yes' : 'no', goalId: f.goalId, investId: f.investId, debtId: f.debtId });
    return intent;
  }
  /** rPayments and savePay run the legacy same-month merge before showing or saving payments. */
  merge() { return this.call('geodeMergeDuplicateLinkedContributionsSameMonth'); }
  toggle(id) { this.call('togglePay', [id]); }
  completeAllUnpaid() { this.state().payments.filter(p => p.status !== 'paid').forEach(p => this.toggle(p.id)); }
  del(id) { this.call('delPay', [id]); }
  /** Runs an entity form save with these fields; returns the toasts it showed. */
  submit(fn, id, fields) {
    this.run('__fields = ' + JSON.stringify(fields) + '; __toasts = [];');
    this.call(fn, [id]);
    return JSON.parse(this.run('JSON.stringify(__toasts)'));
  }
  /**
   * Goal edit form as openGoalModal pre-fills it: Saved So Far and its hidden original both hold g.saved.
   * over replaces fields; a field set to undefined is left out of the form.
   */
  editGoal(id, over) {
    const g = this.state().goals.filter(x => x.id === id)[0];
    return this.submit('saveGoal', id, Object.assign({ gn: g.name, ga: String(g.amount), gs: String(g.saved), geode_goal_saved_orig: String(g.saved),
      gm: String(g.monthly || 0), gd: '', gc: g.cat || 'other' }, over || {}));
  }
  /** Goal edit form saved without touching "Saved So Far". */
  renameGoal(id, name) { return this.editGoal(id, { gn: name }); }
  /** New-goal form (no hidden original). */
  createGoal(name, target, saved) { return this.submit('saveGoal', '', { gn: name, ga: String(target), gs: String(saved), gm: '0', gd: '', gc: 'other' }); }
  /** Investment edit form as openInvModal pre-fills it: Balance and its hidden original both hold inv.balance. */
  editInvestment(id, over) {
    const v = this.state().investments.filter(x => x.id === id)[0];
    return this.submit('saveInv', id, Object.assign({ xn: v.name, xb: String(v.balance), geode_inv_balance_orig: String(v.balance), xtype: v.type || 'other',
      xr: String(v.returns || 0), xp: v.platform || '', xo: v.notes || '', xpurpose: v.purpose || '', xhorizon: v.horizon || '',
      xcs: v.contributionStyle || '', xgoalid: v.goalId || '' }, over || {}));
  }
  /** Investment edit form; balance overrides the Balance field. */
  saveInvestment(id, name, balance) { return this.editInvestment(id, Object.assign({ xn: name }, balance === undefined ? {} : { xb: String(balance) })); }
  /** New-investment form (no hidden original). */
  createInvestment(name, balance) {
    return this.submit('saveInv', '', { xn: name, xb: String(balance), xtype: 'isa', xr: '0', xp: '', xo: '', xpurpose: '', xhorizon: '', xcs: '', xgoalid: '' });
  }
  countedCheck(goalId) { return JSON.parse(this.run('__countedCheck(' + JSON.stringify(goalId) + ')')); }
  deposit(goalId, amount) { this.run('__fields = ' + JSON.stringify({ ['di-' + goalId]: String(amount) }) + ';'); this.call('doDep', [goalId]); }
  release(goalId, amount) {
    return JSON.parse(this.run('JSON.stringify(geodeApplySavingsRelease(' + JSON.stringify({ sourceType: 'goal', sourceId: goalId, amount, reason: 'emergency' }) + '))'));
  }
  quickSetup(data) { this.run('window._geodeQS = ' + JSON.stringify({ quickSetupData: data }) + '; geodeQsDone();'); }
  /** Contribution ledger as stored, and the active completions its rules derive. */
  events() { return this.state().contributionEvents; }
  activeEvents() { return JSON.parse(this.run('JSON.stringify(geodeContributionActiveCompletions(S))')); }
  pointer(id) { const p = this.state().payments.filter(x => x.id === id)[0]; return (p && p.contributionEventId) || null; }
  /** Smart Import confirm for payment review rows { name, amount, date, link ('goal:id' | 'invest:id' | ''), mergeId }. */
  smartImport(items) {
    const fields = {};
    const rows = items.map((it, i) => {
      Object.assign(fields, { ['gim-inc-' + i]: true, ['gim-type-' + i]: 'payment', ['gim-name-' + i]: it.name, ['gim-amt-' + i]: String(it.amount),
        ['gim-date-' + i]: it.date, ['gim-link-' + i]: it.link || '', ['gim-merge-' + i]: it.mergeId ? 'merge' : 'add' });
      return it.mergeId ? { existingDupKind: 'payment', existingDupId: it.mergeId } : {};
    });
    this.run('__fields = ' + JSON.stringify(fields) + '; window._geodeSmartImportN = ' + items.length + '; window._geodeSmartImportRows = ' + JSON.stringify(rows) + ';');
    this.call('geodeSmartImportConfirm');
  }
  /** exportJSONBackup: the envelope it downloads. */
  backup() { this.run('__downloads = []; exportJSONBackup();'); return JSON.parse(this.run('__downloads[0]')); }
  /** extractRestorableData — the restore extraction step (no live restore calls it yet). */
  restorable(envelope) { this.ctx.__argsJson = JSON.stringify([envelope]); return JSON.parse(this.run('JSON.stringify(extractRestorableData.apply(null, JSON.parse(__argsJson)))')); }
}

// ───────────────────────────── results ─────────────────────────────

const DEFECTS = {
  D1: 'Recurring goal/investment contributions lose prior months at rollover (syncRecurringPayments resets the row; geodeRecomputeBalancesFromPayments rebuilds from currently-paid rows only).',
  D2: 'Quick Setup "Monthly essentials" housing/food/transport are stored as one-off expenses and drop out of later months (geodeQsDone).',
  D3: 'Goal/investment edit forms write the displayed total into baseSaved/baseBalance, re-adding paid rows and re-deducting releases (saveGoal, saveInv). Repaired in FA-2; guarded by the E, R2 and FA2 checks.',
  D4: 'Same-month linked save overwrites or merges a different unpaid row for the same goal/investment (geodeSavePayApply upsert, geodeMergeDuplicateLinkedContributionsSameMonth). Repaired in FA-1; guarded by the IDENTITY and FA-1 checks.',
  D5: 'An unpaid voluntary one-off contribution keeps reducing every later month\'s Monthly Left (paymentCountsForMonthlyOutflow overdue rule).',
  D6: 'Same-session rollover and reload disagree: the persisted g.saved / inv.balance cache stays stale until the next recompute.',
  D7: 'A savings release sized against a balance that rollover later shrinks hides later contributions (release deduction clamps at 0).',
  D8: 'Undoing a recurring completion does not revert the due-date advance, so complete → undo cycles push the next due date into later months (togglePay).',
  D9: 'Editing a recurring template while its current month is completed rewrites the recorded occurrence amount (single mutable row).',
  D10: 'Entering an investment value adds currently-paid contributions on top of the entered value (saveInv baseBalance + paid rows).',
  D11: 'Annual recurrence lifecycle: completing an annual row moves its due date a year ahead at once and nothing resets it, so the completed occurrence drops out of Monthly Left and Plan, next year\'s row still shows paid, and tapping it undoes instead of completing (togglePay).'
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
    const order = ['geodeNormalizeContributionEvents(S);', 'geodeNormalizeContributionCarry(S);', 'geodeSeedLegacyContributionEvents();', 'syncRecurringPayments();', 'migratePaymentFlowFields();', 'geodeNormalizeGoalInvestBaseFields();',
      'geodeNormalizeSavingsReleases(S);', 'geodeNormalizeDebtPaymentEvents(S);', 'geodeRecomputeBalancesFromPayments();'];
    const at = order.map(c => load.indexOf(c));
    invariant('fidelity.load', 'load() runs the reload-shim sequence in this order', at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1])), true);
    const render = PROGRAM.structural.render;
    invariant('fidelity.render', 'render() starts rollover with syncRecurringPayments() and never recomputes balances itself',
      render.indexOf('syncRecurringPayments();') >= 0 && render.indexOf('geodeRecomputeBalancesFromPayments') < 0, true);
    const dupes = PROGRAM.extracted.filter(f => f.declarations > 1).map(f => f.name + ' ×' + f.declarations);
    invariant('fidelity.declarations', 'extracted production functions declared exactly once', dupes, []);

    const modal = PROGRAM.structural.openPayModal;
    const modalAt = ["if (p) window._geodePayLinkedIntent = 'replace';", 'geodeNormalizePayLinkedIntent(prefill._geodePayIntent)',
      "window._geodePayLinkedIntent = 'new';"].map(c => modal.indexOf(c));
    invariant('fidelity.intent.modal', 'openPayModal intent: edit → replace, prefill → its own intent, otherwise → new (App.contribute)',
      modalAt.every((p, i) => p >= 0 && (i === 0 || p > modalAt[i - 1])), true);
    const intents = name => (PROGRAM.structural[name].match(/_geodePayIntent\s*[:=]\s*'(\w+)'/g) || []).map(m => m.replace(/.*'(\w+)'/, '$1'));
    invariant('fidelity.intent.direct', 'User-added goal/investment entry points pass the new intent; debt entry points keep set',
      ['geodePayFromGoal', 'geodePayFromInvest', 'openPayQuick', 'geodePayFromDebt'].map(n => [n, intents(n)]),
      [['geodePayFromGoal', ['new']], ['geodePayFromInvest', ['new']], ['openPayQuick', ['set', 'new', 'new']], ['geodePayFromDebt', ['set']]]);
    invariant('fidelity.intent.plan', 'Plan prefills in source order: debt keeps set; buffer/goal/investment gap actions add; untouched fallbacks set',
      ['geodePlanDetailActionForStep', 'geodeMainActionFromPriorityStep', 'openSuggestedAction'].map(n => [n, intents(n)]),
      [['geodePlanDetailActionForStep', ['set', 'set', 'set', 'add', 'set', 'add', 'set', 'add', 'set']],
        ['geodeMainActionFromPriorityStep', ['set', 'add', 'add', 'add']], ['openSuggestedAction', ['set', 'add', 'add', 'add']]]);
    invariant('fidelity.adjust', 'Non-debt "Adjust scheduled amount" runs geodePlanAdjustScheduledRun (edit by id / Payments); debt keeps its prefill',
      (PROGRAM.structural.geodePlanDetailActionForStep.match(/setScheduleAction\('Adjust scheduled amount'[^\n]*/g) || [])
        .map(l => l.indexOf('geodePlanAdjustScheduledRun(state, step)') >= 0), [false, true, true, true]);
    invariant('fidelity.plan.declarations', 'Plan-program production functions declared exactly once',
      PROGRAM.plan.extracted.filter(f => f.declarations > 1).map(f => f.name + ' ×' + f.declarations), []);
    const goalModal = PROGRAM.structural.openGoalModal, invModal = PROGRAM.structural.openInvModal;
    invariant('fidelity.form.goal', 'openGoalModal pre-fills Saved So Far and its hidden original with g.saved (App.editGoal)',
      [goalModal.indexOf('id="gs" class="fi" placeholder="0" value="\' +\n    (g ? g.saved : \'0\')') >= 0,
        goalModal.indexOf('if (g) h += \'<input type="hidden" id="geode_goal_saved_orig" value="\' + String(g.saved)') >= 0], [true, true]);
    invariant('fidelity.form.inv', 'openInvModal pre-fills Balance and its hidden original with inv.balance (App.editInvestment)',
      [invModal.indexOf('id="xb" class="fi" placeholder="5000" value="\' +\n    (e ? e.balance : \'\')') >= 0,
        invModal.indexOf('if (e) h += \'<input type="hidden" id="geode_inv_balance_orig" value="\' + String(e.balance)') >= 0], [true, true]);
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
  Object.keys(orders).forEach(order => MODES.forEach(mode => scenario('GOAL D — one-off £250 + recurring £100 in June, ' + order + ' [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    orders[order](app);
    let s = app.snap();
    invariant('D.rows', 'Two independent intents: one-off £250 and recurring £100', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 100 }]);
    invariant('D.left', 'June Monthly Left', s.left, 2650);
    app.at('2026-06-20'); app.completeAllUnpaid(); s = app.snap();
    invariant('D.goal', 'June: both completed', s.goal.gH, 1350);
    app.advance('2026-07-02', mode); s = app.snap();
    if (mode === 'reload') target('D.jul.goal', 'July rollover preserves £1,350', s.goal.gH, 1350, 1250, 'D1');
    else current('D.jul.goal', 'July rollover shows £1,350 only because the stale session cache hides D1', s.goal.gH, 1350);
    invariant('D.jul.template', 'July recurring template amount', s.rows.filter(r => r.rec === 'yes').map(r => r.amount), [100]);
  })));
}

function goalE() {
  scenario('GOAL E — rename goal after a completed £250 contribution', () => {
    const app = new App(baseState(), '2026-06-10');
    app.contribute({ name: 'Holiday top-up', amount: 250, date: '2026-06-10', status: 'paid', rec: 'no', goalId: 'gH' });
    invariant('E.before', 'Holiday after £250 completed', app.snap().goal.gH, 1250);
    app.renameGoal('gH', 'Holiday trip');
    const s = app.snap();
    invariant('E.goal', 'Rename leaves Holiday unchanged', s.goal.gH, 1250);
    invariant('E.activity', 'Rename logs no goal movement', s.activity.filter(a => a.type === 'goal'), []);
  });
  scenario('GOAL E — rename investment after a completed £500 contribution', () => {
    const app = new App(baseState(), '2026-06-05');
    app.contribute({ name: 'ISA top-up', amount: 500, date: '2026-06-05', status: 'paid', rec: 'no', investId: 'iA' });
    invariant('E.inv.before', 'ISA after £500 completed', app.snap().inv.iA, 5500);
    app.saveInvestment('iA', 'ISA renamed');
    const s = app.snap();
    invariant('E.inv', 'Rename leaves ISA unchanged', s.inv.iA, 5500);
    invariant('E.inv.activity', 'Rename logs no investment movement', s.activity.filter(a => a.type === 'invest'), []);
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
    invariant('ID.A.rows', 'Rows stay independent', s.rows.map(r => ({ rec: r.rec, amount: r.amount, status: r.status })).sort((a, b) => a.amount - b.amount),
      [{ rec: 'yes', amount: 100, status: 'upcoming' }, { rec: 'no', amount: 250, status: 'paid' }]);
  });
  scenario('IDENTITY B — two separate user one-offs £250 and £50 in June', () => {
    const app = new App(baseState(), '2026-06-05');
    app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    app.contribute({ name: 'Holiday small', amount: 50, date: '2026-06-22', status: 'upcoming', rec: 'no', goalId: 'gH' });
    const s = app.snap();
    invariant('ID.B.rows', 'Two independent intents', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'no', amount: 50 }]);
    invariant('ID.B.left', 'June Monthly Left', s.left, 2700);
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

/** Same-month contribution identity: adding is a new intention, editing is the same row, repeating a Plan action reuses its row. */
function identityMatrix() {
  const holidayRow = (id, amount, rec, extra) => Object.assign({ id, name: 'Holiday ' + id, amount, date: '2026-06-20', status: 'upcoming', rec,
    lastPaidYM: '', goalId: 'gH', investId: '', debtId: '', payKind: 'goal', createdAt: 1 }, extra || {});
  const rowsOf = app => app.rows().map(r => ({ id: r.id, rec: r.rec, amount: r.amount, direct: r.direct }));
  /** Save → render → reload keeps the same rows (no duplicates, no merge, no marker change). */
  const survives = (id, app) => {
    const saved = rowsOf(app);
    app.render(); const rendered = rowsOf(app);
    app.reload(); const reloaded = rowsOf(app);
    invariant(id, 'Rows survive render and reload unchanged', [rendered, reloaded], [saved, saved]);
  };
  const goalOneOff = (app, amount, date) => app.contribute({ name: 'Holiday extra', amount, date: date || '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
  const goalPlan = (app, amount, extra) => app.planSchedule(Object.assign({ name: 'Goal contribution: Holiday', amount, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' }, extra || {}));

  scenario('FA-1 A — goal: recurring £100, then a separate one-off £250', () => {
    const app = new App(baseState(), '2026-06-05');
    monthlyHoliday(app); goalOneOff(app, 250);
    const s = app.snap();
    invariant('FA1.A.rows', 'Two rows, each with its own frequency and amount', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 100 }]);
    invariant('FA1.A.left', 'June allocation £350 → Monthly Left', s.left, 2650);
    survives('FA1.A.survives', app);
  });
  scenario('FA-1 B — goal: one-off £250, then a separate recurring £100', () => {
    const app = new App(baseState(), '2026-06-05');
    goalOneOff(app, 250); monthlyHoliday(app);
    const s = app.snap();
    invariant('FA1.B.rows', 'Two rows, each with its own frequency and amount', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 100 }]);
    invariant('FA1.B.left', 'June allocation £350 → Monthly Left', s.left, 2650);
    survives('FA1.B.survives', app);
  });
  scenario('FA-1 C — goal: one-off £250, then a separate one-off £50', () => {
    const app = new App(baseState(), '2026-06-05');
    goalOneOff(app, 250); goalOneOff(app, 50, '2026-06-22');
    const s = app.snap();
    invariant('FA1.C.rows', 'Both one-offs kept', signature(s.rows), [{ rec: 'no', amount: 250 }, { rec: 'no', amount: 50 }]);
    invariant('FA1.C.left', 'June allocation £300 → Monthly Left', s.left, 2700);
    survives('FA1.C.survives', app);
  });
  scenario('FA-1 D — goal: the same Plan action scheduled twice', () => {
    const app = new App(baseState(), '2026-06-05');
    goalPlan(app, 100); goalPlan(app, 100);
    const s = app.snap();
    invariant('FA1.D.rows', 'One Plan row of £100 (not £200)', signature(s.rows), [{ rec: 'yes', amount: 100 }]);
    invariant('FA1.D.left', 'June Monthly Left', s.left, 2900);
    survives('FA1.D.survives', app);
    goalPlan(app, 50, { intent: 'add' });
    invariant('FA1.D.add', 'An explicit add intent tops up the same Plan row', signature(app.rows()), [{ rec: 'yes', amount: 150 }]);
  });
  scenario('FA-1 E — goal: editing an existing row by id', () => {
    const app = new App(baseState(), '2026-06-05');
    goalOneOff(app, 250);
    const id = monthlyHoliday(app);
    app.editPayment(id, { amount: 150 });
    const rows = rowsOf(app);
    invariant('FA1.E.rows', 'Edited row keeps its id and marker; the one-off is untouched',
      rows.map(r => [r.id === id, r.rec, r.amount, r.direct]).sort(), [[false, 'no', 250, true], [true, 'yes', 150, true]]);
    survives('FA1.E.survives', app);
  });
  scenario('FA-1 F — goal: Plan scheduling next to contributions the user added', () => {
    const app = new App(baseState(), '2026-06-05');
    monthlyHoliday(app);
    goalPlan(app, 20);
    invariant('FA1.F.recurring', 'Plan £20 does not overwrite the user\'s recurring £100', signature(app.rows()), [{ rec: 'yes', amount: 100 }, { rec: 'yes', amount: 20 }]);
    goalPlan(app, 20);
    invariant('FA1.F.repeat', 'Repeating the Plan action reuses its own row', signature(app.rows()), [{ rec: 'yes', amount: 100 }, { rec: 'yes', amount: 20 }]);
    const two = new App(baseState(), '2026-06-05');
    goalOneOff(two, 250); goalPlan(two, 120);
    invariant('FA1.F.oneoff', 'Plan recurring £120 does not absorb the user\'s one-off £250', signature(two.rows()), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 120 }]);
    survives('FA1.F.survives', app);
  });
  scenario('FA-1 G — investment: the same identity rules', () => {
    const invRec = app => app.contribute({ name: 'ISA monthly', amount: 200, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    const invOne = (app, amount) => app.contribute({ name: 'ISA extra', amount, date: '2026-06-20', status: 'upcoming', rec: 'no', investId: 'iA' });
    const invPlan = (app, amount) => app.planSchedule({ name: 'Investment contribution (ISA)', amount, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    const a = new App(baseState(), '2026-06-05');
    invRec(a); invOne(a, 500);
    invariant('FA1.G.recurring-oneoff', 'Recurring £200 + one-off £500 stay two rows; Monthly Left',
      [signature(a.rows()), a.snap().left], [[{ rec: 'no', amount: 500 }, { rec: 'yes', amount: 200 }], 2300]);
    survives('FA1.G.survives', a);
    const c = new App(baseState(), '2026-06-05');
    invOne(c, 500); invOne(c, 300);
    invariant('FA1.G.two-oneoffs', 'Two one-offs £500 + £300 kept', signature(c.rows()), [{ rec: 'no', amount: 300 }, { rec: 'no', amount: 500 }]);
    const d = new App(baseState(), '2026-06-05');
    invPlan(d, 120); invPlan(d, 120);
    invariant('FA1.G.plan-repeat', 'Same Plan action twice → one row', signature(d.rows()), [{ rec: 'yes', amount: 120 }]);
    const f = new App(baseState(), '2026-06-05');
    invRec(f); invPlan(f, 50);
    invariant('FA1.G.plan-vs-user', 'Plan £50 does not overwrite the user\'s recurring £200', signature(f.rows()), [{ rec: 'yes', amount: 200 }, { rec: 'yes', amount: 50 }]);
  });
  scenario('FA-1 H — debt shared path keeps its existing same-month behaviour', () => {
    const debts = [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 20 }];
    const app = new App(baseState({ debts }), '2026-06-05');
    app.planSchedule({ name: 'Card payment', amount: 50, date: '2026-06-15', status: 'upcoming', rec: 'yes', debtId: 'dC' });
    app.contribute({ name: 'Extra debt payment: Card', amount: 100, date: '2026-06-20', status: 'upcoming', rec: 'no', debtId: 'dC' });
    current('FA1.H.upsert', 'A second unpaid same-month debt payment updates the existing row (unchanged debt behaviour)',
      app.rows().map(r => ({ rec: r.rec, amount: r.amount, direct: r.direct })), [{ rec: 'yes', amount: 100, direct: false }]);
    const legacy = new App(baseState({ debts, payments: [
      Object.assign(holidayRow('d1', 50, 'yes'), { goalId: '', debtId: 'dC', payKind: 'debt' }),
      Object.assign(holidayRow('d2', 100, 'no'), { goalId: '', debtId: 'dC', payKind: 'debt', createdAt: 2 })] }), '2026-06-05');
    legacy.merge();
    current('FA1.H.merge', 'Unpaid same-month debt rows still merge (unchanged debt behaviour)', signature(legacy.rows()), [{ rec: 'yes', amount: 150 }]);
  });
  scenario('FA-1 LEGACY — saved states without the marker', () => {
    const app = new App(baseState({ payments: [holidayRow('p1', 100, 'yes', { date: '2026-06-15' })] }), '2026-06-05');
    app.reload();
    invariant('FA1.L.no-backfill', 'Reload adds no marker to existing rows', app.state().payments.map(p => 'directContribution' in p), [false]);
    goalPlan(app, 120);
    invariant('FA1.L.plan-reuse', 'Plan action reuses an existing unmarked recurring row (F.3 kept for saved states)', signature(app.rows()), [{ rec: 'yes', amount: 120 }]);
    const two = new App(baseState({ payments: [holidayRow('p1', 250, 'no')] }), '2026-06-05');
    goalPlan(two, 120);
    invariant('FA1.L.plan-oneoff', 'Plan recurring action leaves an existing one-off alone', signature(two.rows()), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 120 }]);
  });
  scenario('FA-1 MERGE — legacy same-month merge no longer combines separate intentions', () => {
    const mixed = new App(baseState({ payments: [holidayRow('p1', 100, 'yes'), holidayRow('p2', 250, 'no', { createdAt: 2 })] }), '2026-06-05');
    mixed.merge();
    invariant('FA1.M.mixed', 'One-off + recurring are not merged', signature(mixed.rows()), [{ rec: 'no', amount: 250 }, { rec: 'yes', amount: 100 }]);
    const direct = new App(baseState({ payments: [holidayRow('p1', 250, 'no', { directContribution: true }), holidayRow('p2', 50, 'no', { directContribution: true, createdAt: 2 })] }), '2026-06-05');
    direct.merge();
    invariant('FA1.M.direct', 'Contributions the user added are not merged', signature(direct.rows()), [{ rec: 'no', amount: 250 }, { rec: 'no', amount: 50 }]);
    const dup = new App(baseState({ payments: [holidayRow('p1', 100, 'yes'), holidayRow('p2', 100, 'yes', { createdAt: 2 })] }), '2026-06-05');
    dup.merge();
    current('FA1.M.legacy-dup', 'Two unmarked recurring rows for the same goal and month still merge (legacy duplicate cleanup)', signature(dup.rows()), [{ rec: 'yes', amount: 200 }]);
  });
}

/**
 * Plan contribution action semantics: a gap action adds only the uncovered gap (topping up the Plan row, never a row
 * the user added), Adjust edits the one row that provides the coverage (several rows → Payments), and paid +
 * scheduled together cover a goal/investment/buffer step. Debt keeps its existing behaviour.
 */
function planActions() {
  const GOAL_STEP = { label: 'Catch up on Holiday', amount: 120 };
  const INV_STEP = { label: 'Invest what remains', amount: 120 };
  const BUF_STEP = { label: 'Build your emergency fund', amount: 120 };
  const DEBT_STEP = { label: 'Reduce high-interest Card', amount: 120 };
  const HOL = { goalId: 'gH', payKind: 'goal' }, EMG = { goalId: 'gE', payKind: 'goal' }, ISAL = { investId: 'iA', payKind: 'invest' };
  const USER = { directContribution: true }, PAID = { status: 'paid', date: '2026-06-02' };
  const pay = (id, amount, rec, link, extra) => Object.assign({ id, name: 'Row ' + id, amount, date: '2026-06-15', status: 'upcoming', rec,
    lastPaidYM: '', goalId: '', investId: '', debtId: '', payKind: 'bill', createdAt: 1 }, link || {}, extra || {});
  const EMERGENCY = () => ({ id: 'gE', name: 'Emergency fund', amount: 1000, saved: 100, baseSaved: 100, monthly: 0, cat: 'emergency' });
  const CARD = () => ({ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 });
  const planApp = (payments, extra) => new App(baseState(Object.assign({ payments, incomeExplicitlySet: true }, extra || {})), '2026-06-05', PROGRAM.plan);
  const pick = (o, ...keys) => keys.reduce((r, k) => { r[k] = o[k]; return r; }, {});
  /** Unpaid rows as [id, frequency, amount, user-added]. */
  const unpaid = app => app.rows().filter(r => r.status !== 'paid').map(r => [r.id, r.rec, r.amount, r.direct]);
  const outcome = (app, step) => { const v = app.planView(step); return { rows: unpaid(app), scheduled: v.scheduled, left: app.snap().left, next: v.label }; };
  const tapped = t => [t.msub, t.id, t.intent];
  /** The helper's rows are exactly the rows whose removal changes the scheduled amount. */
  const sameRows = (app, step) => {
    app.ctx.__stepJson = JSON.stringify(step);
    return JSON.parse(app.run(`(function () {
      var step = JSON.parse(__stepJson), all = S.payments.slice(), full = geodePlanStepScheduledAmount(S, step), counted = [];
      var rows = geodePlanStepScheduledRows(S, step), sum = 0;
      rows.forEach(function (e) { sum += e.amount; });
      for (var i = 0; i < all.length; i++) {
        S.payments = all.filter(function (p, j) { return j !== i; });
        if (geodePlanStepScheduledAmount(S, step) !== full) counted.push(all[i].id);
      }
      S.payments = all;
      return JSON.stringify({ rows: rows.map(function (e) { return e.row.id; }).sort(), counted: counted.sort(), sumMatches: sum === full });
    })()`));
  };

  scenario('PLAN A — goal target £120, nothing scheduled', () => {
    const app = planApp([]);
    invariant('PA.A.view', 'Plan detail offers the whole step', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Schedule this step', amount: 120 });
    invariant('PA.A.tap', 'The gap action opens a new contribution with the add intent', tapped(app.planTap(GOAL_STEP)), ['payments', null, 'add']);
    invariant('PA.A.result', 'One Plan row £120; Monthly Left £2,880; Plan now offers Adjust', outcome(app, GOAL_STEP),
      { rows: [['id1', 'yes', 120, false]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' });
  });
  scenario('PLAN B1 — goal: user recurring £100, Plan fills the £20 gap', () => {
    const app = planApp([pay('u1', 100, 'yes', HOL, USER)]);
    invariant('PA.B1.view', 'Plan detail offers only the gap', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Schedule this step', amount: 20 });
    invariant('PA.B1.tap', 'Gap action uses the add intent', tapped(app.planTap(GOAL_STEP)), ['payments', null, 'add']);
    invariant('PA.B1.result', 'User £100 kept; Plan £20 added; total £120; Monthly Left £2,880', outcome(app, GOAL_STEP),
      { rows: [['u1', 'yes', 100, true], ['id1', 'yes', 20, false]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' });
    invariant('PA.B1.repeat', 'The refreshed Plan action (two rows → Payments) creates nothing', [tapped(app.planTap(GOAL_STEP)), unpaid(app)],
      [['payments', null, null], [['u1', 'yes', 100, true], ['id1', 'yes', 20, false]]]);
  });
  scenario('PLAN B2 — goal: user recurring £120, Adjust', () => {
    const app = planApp([pay('u1', 120, 'yes', HOL, USER)]);
    invariant('PA.B2.view', 'Plan detail offers Adjust for the scheduled £120', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Adjust scheduled amount', amount: 120 });
    invariant('PA.B2.edit', 'Adjust edits the user\'s row by id; saved unchanged it stays one £120 row',
      [tapped(app.planTap(GOAL_STEP)), unpaid(app)], [['payments', 'u1', 'replace'], [['u1', 'yes', 120, true]]]);
    invariant('PA.B2.edit150', 'Changed to £150 the same row becomes £150; no second row; Monthly Left £2,850',
      [tapped(app.planTap(GOAL_STEP, 150)), unpaid(app), app.snap().left], [['payments', 'u1', 'replace'], [['u1', 'yes', 150, true]], 2850]);
  });
  scenario('PLAN C1 — goal: Plan row £100, Plan fills the £20 gap', () => {
    const app = planApp([pay('p1', 100, 'yes', HOL)]);
    invariant('PA.C1.view', 'Plan detail offers only the gap', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Schedule this step', amount: 20 });
    invariant('PA.C1.tap', 'Gap action uses the add intent', tapped(app.planTap(GOAL_STEP)), ['payments', null, 'add']);
    invariant('PA.C1.result', 'The Plan row is topped up to one £120 row', outcome(app, GOAL_STEP),
      { rows: [['p1', 'yes', 120, false]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' });
  });
  scenario('PLAN C2 — goal: Plan row £120, Adjust', () => {
    const app = planApp([pay('p1', 120, 'yes', HOL)]);
    invariant('PA.C2.edit', 'Adjust edits the Plan row by id; changed to £150 it stays one row',
      [tapped(app.planTap(GOAL_STEP, 150)), unpaid(app)], [['payments', 'p1', 'replace'], [['p1', 'yes', 150, false]]]);
  });
  scenario('PLAN D1 — goal: user one-off £100, Plan fills the £20 gap', () => {
    const app = planApp([pay('u1', 100, 'no', HOL, USER)]);
    invariant('PA.D1.view', 'Plan detail offers only the gap', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Schedule this step', amount: 20 });
    app.planTap(GOAL_STEP);
    invariant('PA.D1.result', 'One-off £100 stays one-off; Plan £20 added; total £120', outcome(app, GOAL_STEP),
      { rows: [['u1', 'no', 100, true], ['id1', 'yes', 20, false]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' });
  });
  scenario('PLAN D2 — goal: user one-off £120, Adjust', () => {
    const app = planApp([pay('u1', 120, 'no', HOL, USER)]);
    invariant('PA.D2.edit', 'Adjust edits the one-off by id; it stays one-off; no second row',
      [tapped(app.planTap(GOAL_STEP)), unpaid(app)], [['payments', 'u1', 'replace'], [['u1', 'no', 120, true]]]);
    invariant('PA.D2.edit150', 'Changed to £150 the same one-off becomes £150', [app.planTap(GOAL_STEP, 150).id, unpaid(app)], ['u1', [['u1', 'no', 150, true]]]);
  });
  scenario('PLAN E1 — goal: user £50 + £50, Plan fills the £20 gap', () => {
    const app = planApp([pay('u1', 50, 'yes', HOL, USER), pay('u2', 50, 'yes', HOL, Object.assign({ createdAt: 2 }, USER))]);
    app.planTap(GOAL_STEP);
    invariant('PA.E1.result', 'Both user rows survive; Plan £20 added; total £120', outcome(app, GOAL_STEP),
      { rows: [['u1', 'yes', 50, true], ['u2', 'yes', 50, true], ['id1', 'yes', 20, false]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' });
  });
  scenario('PLAN E2 — goal: user £60 + £60, Adjust', () => {
    const app = planApp([pay('u1', 60, 'yes', HOL, USER), pay('u2', 60, 'yes', HOL, Object.assign({ createdAt: 2 }, USER))]);
    invariant('PA.E2.view', 'Plan detail offers Adjust for the scheduled £120', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Adjust scheduled amount', amount: 120 });
    invariant('PA.E2.payments', 'Two rows: Adjust opens Payments and changes nothing; total £120',
      [tapped(app.planTap(GOAL_STEP)), outcome(app, GOAL_STEP)],
      [['payments', null, null], { rows: [['u1', 'yes', 60, true], ['u2', 'yes', 60, true]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' }]);
  });
  scenario('PLAN F — goal: Plan £20 + user £100, Adjust', () => {
    const app = planApp([pay('p1', 20, 'yes', HOL), pay('u1', 100, 'yes', HOL, Object.assign({ createdAt: 2 }, USER))]);
    invariant('PA.F.payments', 'Two rows: Adjust opens Payments and changes nothing; total £120',
      [tapped(app.planTap(GOAL_STEP)), outcome(app, GOAL_STEP)],
      [['payments', null, null], { rows: [['p1', 'yes', 20, false], ['u1', 'yes', 100, true]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' }]);
  });
  scenario('PLAN G — goal: paid £50 + user scheduled £70 covers the £120 step', () => {
    const app = planApp([pay('u0', 50, 'no', HOL, Object.assign({}, USER, PAID)), pay('u1', 70, 'yes', HOL, Object.assign({ createdAt: 2 }, USER))]);
    app.setPlan([GOAL_STEP]);
    invariant('PA.G.state', 'Covered: no gap, not actionable, scheduled-only; Plan offers Adjust £70',
      app.planView(GOAL_STEP), { label: 'Adjust scheduled amount', amount: 70, applied: 50, scheduled: 70, gap: 0, actionable: false, scheduledOnly: true, actionAmount: 0 });
    invariant('PA.G.home', 'Home routes to the plan instead of scheduling another payment', app.homeView(GOAL_STEP), { cta: 'View plan', amount: null });
    invariant('PA.G.suggested', 'Suggested Actions offer nothing for the covered step', app.suggestions(), []);
    invariant('PA.G.adjust', 'Adjust edits the one scheduled row; nothing is added',
      [tapped(app.planTap(GOAL_STEP)), unpaid(app), app.snap().left], [['payments', 'u1', 'replace'], [['u1', 'yes', 70, true]], 2880]);
  });
  scenario('PLAN G2 — goal: paid £50 + user scheduled £30 leaves a £40 gap', () => {
    const app = planApp([pay('u0', 50, 'no', HOL, Object.assign({}, USER, PAID)), pay('u1', 30, 'yes', HOL, Object.assign({ createdAt: 2 }, USER))]);
    app.setPlan([GOAL_STEP]);
    invariant('PA.G2.view', 'Plan detail offers the £40 gap, not £70', pick(app.planView(GOAL_STEP), 'label', 'amount'), { label: 'Schedule remaining amount', amount: 40 });
    invariant('PA.G2.home', 'Home offers the same £40', app.homeView(GOAL_STEP), { cta: 'Plan a contribution', amount: 40 });
    invariant('PA.G2.suggested', 'Suggested Actions offer the same £40', app.suggestions(), [{ type: 'goal_contribution', amount: 40 }]);
    invariant('PA.G2.tap', 'Gap action uses the add intent', tapped(app.planTap(GOAL_STEP)), ['payments', null, 'add']);
    const v = app.planView(GOAL_STEP);
    invariant('PA.G2.result', 'User £30 kept; Plan £40 added; scheduled £70 + paid £50 = £120',
      [unpaid(app), v.scheduled, v.applied, app.snap().left, v.label], [[['u1', 'yes', 30, true], ['id1', 'yes', 40, false]], 70, 50, 2880, 'Adjust scheduled amount']);
  });
  scenario('PLAN G2P — goal: paid £50 + Plan scheduled £30 leaves a £40 gap', () => {
    const app = planApp([pay('u0', 50, 'no', HOL, Object.assign({}, USER, PAID)), pay('p1', 30, 'yes', HOL, { createdAt: 2 })]);
    app.planTap(GOAL_STEP);
    const v = app.planView(GOAL_STEP);
    invariant('PA.G2P.result', 'The Plan row tops up £30 → £70; paid £50 + scheduled £70 = £120',
      [unpaid(app), v.scheduled, v.applied, app.snap().left], [[['p1', 'yes', 70, false]], 70, 50, 2880]);
  });
  scenario('PLAN HOME / SUGGESTED — gap actions share the Plan semantics', () => {
    const home = planApp([pay('u1', 100, 'yes', HOL, USER)]);
    invariant('PA.H.home', 'Home main action fills the £20 gap with add; user row kept',
      [home.homeView(GOAL_STEP), tapped(home.homeTap(GOAL_STEP)), unpaid(home)],
      [{ cta: 'Plan a contribution', amount: 20 }, ['payments', null, 'add'], [['u1', 'yes', 100, true], ['id1', 'yes', 20, false]]]);
    invariant('PA.H.home.after', 'Home then routes to the plan', home.homeView(GOAL_STEP), { cta: 'View plan', amount: null });
    const sa = planApp([pay('p1', 100, 'yes', HOL)]);
    sa.setPlan([GOAL_STEP]);
    invariant('PA.H.suggested', 'Suggested Action tops up the Plan row by the £20 gap',
      [sa.suggestions(), tapped(sa.suggestedTap(0)), unpaid(sa)],
      [[{ type: 'goal_contribution', amount: 20 }], ['', null, 'add'], [['p1', 'yes', 120, false]]]);
    invariant('PA.H.suggested.after', 'Suggested Actions then offer nothing', sa.suggestions(), []);
  });

  scenario('PLAN SA — stale Suggested Action after the gap is filled elsewhere', () => {
    const viaPlan = planApp([pay('u1', 100, 'yes', HOL, USER)]);
    viaPlan.setPlan([GOAL_STEP]);
    invariant('PA.SA.frozen', 'Home freezes a £20 goal Suggested Action', [viaPlan.suggestions(), viaPlan.state().lastSuggestedActions.map(a => [a.type, a.amount])],
      [[{ type: 'goal_contribution', amount: 20 }], [['goal_contribution', 20]]]);
    viaPlan.planTap(GOAL_STEP);
    invariant('PA.SA.plan.reconciled', 'Filling the gap from Plan detail removes the frozen goal action (linked-save reconciliation)',
      viaPlan.state().lastSuggestedActions.map(a => a.type), []);
    invariant('PA.SA.plan.home', 'Next Home render offers nothing; the card slot opens nothing; total stays £120',
      [viaPlan.suggestions(), tapped(viaPlan.suggestedTap(0)), outcome(viaPlan, GOAL_STEP).scheduled], [[], ['', null, null], 120]);

    const viaUser = planApp([pay('u1', 100, 'yes', HOL, USER)]);
    viaUser.setPlan([GOAL_STEP]);
    viaUser.suggestions();
    viaUser.contribute({ name: 'Holiday extra', amount: 20, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    invariant('PA.SA.user', 'A £20 the user adds from the goal card also reconciles; Home then offers nothing',
      [viaUser.state().lastSuggestedActions.map(a => a.type), viaUser.suggestions(), outcome(viaUser, GOAL_STEP).scheduled], [[], [], 120]);

    const partial = planApp([pay('u1', 100, 'yes', HOL, USER)]);
    partial.setPlan([GOAL_STEP]);
    partial.suggestions();
    partial.contribute({ name: 'Holiday extra', amount: 15, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    invariant('PA.SA.partial', 'After £15 of the £20 is added elsewhere, Home offers £5 and tapping it reaches exactly £120',
      [partial.suggestions(), tapped(partial.suggestedTap(0)), outcome(partial, GOAL_STEP).scheduled], [[{ type: 'goal_contribution', amount: 5 }], ['', null, 'add'], 120]);

    const buffer = planApp([], { goals: [HOLIDAY(), EMERGENCY()] });
    buffer.setPlan([BUF_STEP]);
    buffer.suggestions();
    buffer.contribute({ name: 'Emergency fund', amount: 120, date: '2026-06-20', status: 'upcoming', rec: 'yes', goalId: 'gE' });
    current('PA.SA.buffer.frozen', 'A buffer gap filled from the goal card is not a buffer save, so the frozen buffer action stays in the batch',
      buffer.state().lastSuggestedActions.map(a => [a.type, a.amount]), [['buffer_contribution', 120]]);
    invariant('PA.SA.buffer.home', 'The next Home render still drops it (plan signature changed → batch refreshed); nothing to tap',
      [buffer.suggestions(), tapped(buffer.suggestedTap(0)), outcome(buffer, BUF_STEP).scheduled], [[], ['', null, null], 120]);

    const noRender = planApp([pay('u1', 100, 'yes', HOL, USER)]);
    noRender.setPlan([GOAL_STEP]);
    noRender.suggestions();
    noRender.planTap(GOAL_STEP);
    current('PA.SA.no-render', 'openSuggestedAction trusts the list from the last Home render (every save calls render(), which rebuilds it): replaying the pre-save list adds £20 again',
      [tapped(noRender.suggestedTap(0)), outcome(noRender, GOAL_STEP).scheduled], [['', null, 'add'], 140]);
  });

  scenario('PLAN INVESTMENT — same semantics for the investment step', () => {
    const none = planApp([]);
    none.setPlan([INV_STEP]);
    current('PA.I0.view', 'Nothing scheduled: Plan detail label for the first investment action (existing copy)', pick(none.planView(INV_STEP), 'label', 'amount'),
      { label: 'Schedule remaining amount', amount: 120 });
    invariant('PA.I0.suggested', 'Suggested Action schedules £120 with add; one Plan row',
      [none.suggestions(), tapped(none.suggestedTap(0)), unpaid(none)], [[{ type: 'investment_contribution', amount: 120 }], ['', null, 'add'], [['id1', 'yes', 120, false]]]);
    const i1 = planApp([pay('v1', 100, 'yes', ISAL, USER)]);
    invariant('PA.I1.edit', 'User £100: Adjust edits that row by id; changed to £120 no row is added beside it',
      [pick(i1.planView(INV_STEP), 'label', 'amount'), tapped(i1.planTap(INV_STEP, 120)), unpaid(i1), i1.snap().left],
      [{ label: 'Adjust scheduled amount', amount: 100 }, ['payments', 'v1', 'replace'], [['v1', 'yes', 120, true]], 2880]);
    const i2 = planApp([pay('v1', 100, 'yes', ISAL)]);
    invariant('PA.I2.edit', 'Plan £100: Adjust edits the Plan row by id', [tapped(i2.planTap(INV_STEP, 120)), unpaid(i2)],
      [['payments', 'v1', 'replace'], [['v1', 'yes', 120, false]]]);
    const multi = planApp([pay('v1', 60, 'yes', ISAL, USER), pay('v2', 60, 'yes', ISAL, Object.assign({ createdAt: 2 }, USER))]);
    invariant('PA.I.multi', 'Two investment rows: Adjust opens Payments and changes nothing', [tapped(multi.planTap(INV_STEP)), unpaid(multi)],
      [['payments', null, null], [['v1', 'yes', 60, true], ['v2', 'yes', 60, true]]]);
    const covered = planApp([pay('v1', 120, 'yes', ISAL, USER)]);
    covered.setPlan([INV_STEP]);
    invariant('PA.I.covered', 'Scheduled investment: Home routes to the plan and Suggested Actions offer nothing',
      [covered.homeView(INV_STEP).cta, covered.suggestions()], ['View plan', []]);
  });

  scenario('PLAN BUFFER — emergency buffer step', () => {
    const goals = { goals: [HOLIDAY(), EMERGENCY()] };
    const links = app => app.rows().filter(r => r.status !== 'paid').map(r => [r.id, r.goalId]);
    const none = planApp([], goals);
    invariant('PA.BUF.none', 'Nothing scheduled: the buffer action schedules £120 with add, linked to the emergency goal',
      [pick(none.planView(BUF_STEP), 'label', 'amount'), tapped(none.planTap(BUF_STEP)), unpaid(none), links(none)],
      [{ label: 'Schedule this step', amount: 120 }, ['payments', null, 'add'], [['id1', 'yes', 120, false]], [['id1', 'gE']]]);
    const user = planApp([pay('u1', 100, 'yes', EMG, USER)], goals);
    user.planTap(BUF_STEP);
    invariant('PA.BUF.user', 'User buffer £100 kept; Plan £20 added; total £120', outcome(user, BUF_STEP),
      { rows: [['u1', 'yes', 100, true], ['id1', 'yes', 20, false]], scheduled: 120, left: 2880, next: 'Adjust scheduled amount' });
    invariant('PA.BUF.user.adjust', 'Then two rows: Adjust opens Payments and changes nothing', [tapped(user.planTap(BUF_STEP)), unpaid(user)],
      [['payments', null, null], [['u1', 'yes', 100, true], ['id1', 'yes', 20, false]]]);
    const plan = planApp([pay('p1', 100, 'yes', EMG)], goals);
    plan.planTap(BUF_STEP);
    invariant('PA.BUF.plan', 'Plan buffer row £100 is topped up to one £120 row', unpaid(plan), [['p1', 'yes', 120, false]]);
    invariant('PA.BUF.plan.adjust', 'Adjust edits that one row by id', [tapped(plan.planTap(BUF_STEP, 150)), unpaid(plan)],
      [['payments', 'p1', 'replace'], [['p1', 'yes', 150, false]]]);
    const legacy = planApp([pay('l1', 120, 'yes', null, { name: 'Rainy day pot' })], goals);
    invariant('PA.BUF.name-only', 'A row counted only by its buffer-like name: Adjust opens that exact row; editing leaves it unlinked',
      [pick(legacy.planView(BUF_STEP), 'label', 'amount'), tapped(legacy.planTap(BUF_STEP)), unpaid(legacy), links(legacy)],
      [{ label: 'Adjust scheduled amount', amount: 120 }, ['payments', 'l1', 'replace'], [['l1', 'yes', 120, false]], [['l1', '']]]);
    const multi = planApp([pay('u1', 60, 'yes', EMG, USER), pay('l1', 60, 'yes', null, { name: 'Emergency buffer', createdAt: 2 })], goals);
    invariant('PA.BUF.multi', 'Linked £60 + name-matched £60: Adjust opens Payments and changes nothing', [tapped(multi.planTap(BUF_STEP)), unpaid(multi)],
      [['payments', null, null], [['u1', 'yes', 60, true], ['l1', 'yes', 60, false]]]);
    const partial = planApp([pay('b0', 50, 'no', EMG, Object.assign({}, USER, PAID)), pay('u1', 30, 'yes', EMG, Object.assign({ createdAt: 2 }, USER))], goals);
    invariant('PA.BUF.partial.view', 'Paid £50 + scheduled £30: the buffer action offers the £40 gap', pick(partial.planView(BUF_STEP), 'label', 'amount'),
      { label: 'Schedule remaining amount', amount: 40 });
    partial.planTap(BUF_STEP);
    const pv = partial.planView(BUF_STEP);
    invariant('PA.BUF.partial', 'User £30 kept; Plan £40 added; paid £50 + scheduled £70 = £120', [unpaid(partial), pv.applied, pv.scheduled, pv.label],
      [[['u1', 'yes', 30, true], ['id1', 'yes', 40, false]], 50, 70, 'Adjust scheduled amount']);
    const mixed = planApp([pay('u1', 60, 'yes', EMG, USER), pay('l1', 40, 'yes', null, { name: 'Emergency buffer' }), pay('k1', 25, 'yes', null, { name: 'Buffer top-up' }),
      pay('c1', 30, 'yes', HOL, { name: 'Car buffer' }), pay('h1', 70, 'yes', HOL), pay('n1', 15, 'yes', null, { name: 'Netflix' })], goals);
    invariant('PA.BUF.rows', 'Scheduled-rows helper returns exactly the rows the scheduled amount counts (buffer name rules included)',
      sameRows(mixed, BUF_STEP), { rows: ['c1', 'k1', 'l1', 'u1'], counted: ['c1', 'k1', 'l1', 'u1'], sumMatches: true });
    invariant('PA.GOAL.rows', 'Same check for the goal step', sameRows(mixed, GOAL_STEP), { rows: ['c1', 'h1'], counted: ['c1', 'h1'], sumMatches: true });
  });

  scenario('PLAN DEBT — debt Plan actions keep their existing behaviour', () => {
    const debts = { debts: [CARD()] };
    const app = planApp([], debts);
    invariant('PA.DEBT.tap', 'Debt gap action still uses set', [pick(app.planView(DEBT_STEP), 'label', 'amount'), tapped(app.planTap(DEBT_STEP))],
      [{ label: 'Schedule this step', amount: 120 }, ['payments', null, 'set']]);
    invariant('PA.DEBT.adjust', 'Debt Adjust still opens a set prefill (no row id) and re-saving keeps one row',
      [pick(app.planView(DEBT_STEP), 'label', 'amount'), tapped(app.planTap(DEBT_STEP)), unpaid(app)],
      [{ label: 'Adjust scheduled amount', amount: 120 }, ['payments', null, 'set'], [['id1', 'yes', 120, false]]]);
    const covered = planApp([pay('d0', 50, 'no', { debtId: 'dC', payKind: 'debt' }, Object.assign({ name: 'Extra debt payment: Card' }, PAID)),
      pay('d1', 70, 'yes', { debtId: 'dC', payKind: 'debt' }, { name: 'Extra debt payment: Card', createdAt: 2 })], debts);
    covered.setPlan([DEBT_STEP]);
    current('PA.DEBT.covered', 'Debt paid £50 + scheduled £70 keeps the debt action state (remaining £70 offered; debt is outside FA-1C)',
      [pick(covered.planView(DEBT_STEP), 'label', 'amount', 'actionable', 'scheduledOnly', 'actionAmount'), covered.homeView(DEBT_STEP)],
      [{ label: 'Schedule remaining amount', amount: 70, actionable: true, scheduledOnly: false, actionAmount: 70 }, { cta: 'Schedule extra payment', amount: 70 }]);
    current('PA.DEBT.covered.tap', 'Its set action reuses the scheduled debt row (no duplicate)', [tapped(covered.planTap(DEBT_STEP)), unpaid(covered)],
      [['payments', null, 'set'], [['d1', 'yes', 70, false]]]);
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
    invariant('R2.after', 'Rename does not deduct the release again', app.snap().goal.gH, 800);
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

// FA-2: entity edits never move money unless the amount field was changed.

/** Displayed position now, after render, after reload, at the July rollover (same session, then reload) and after the August reload. */
function crossMonth(app, kind, id) {
  const shown = () => { const s = app.snap(); return kind === 'goal' ? s.goal[id] : s.inv[id]; };
  const t = { now: shown() };
  app.render(); t.render = shown();
  app.reload(); t.reload = shown();
  app.advance('2026-07-02', 'session'); t.julSession = shown();
  app.reload(); t.julReload = shown();
  app.advance('2026-08-02', 'reload'); t.augReload = shown();
  return t;
}
const steady = v => ({ now: v, render: v, reload: v, julSession: v, julReload: v, augReload: v });
const completeOn10June = (app, o) => {
  const id = app.contribute(Object.assign({ status: 'upcoming', date: '2026-06-10' }, o));
  app.at('2026-06-10'); app.toggle(id);
  return id;
};
const freshApp = (setup, extra) => { const app = new App(baseState(extra), '2026-06-05'); if (setup) setup(app); return app; };
const goalOf = app => app.state().goals.filter(g => g.id === 'gH')[0];
const invOf = app => app.state().investments.filter(v => v.id === 'iA')[0];
const goalActivity = app => app.snap().activity.filter(a => a.type === 'goal');
const investActivity = app => app.snap().activity.filter(a => a.type === 'invest');
const REFUSED_RECURRING = 'We can\u2019t safely update this amount yet. A recurring contribution from this month is still included in your total. Your current amount has been left unchanged.';
const REFUSED_BELOW = 'We can\u2019t lower Saved So Far that far here, because it\u2019s below what\u2019s already marked complete for this goal. Your current amount has been left unchanged.';
const holidayOneOff = app => completeOn10June(app, { name: 'Holiday top-up', amount: 250, rec: 'no', goalId: 'gH' });
const holidayMonthly = app => completeOn10June(app, { name: 'Holiday monthly', amount: 250, rec: 'yes', goalId: 'gH' });

function fa2Goals() {
  scenario('FA-2 GOAL — base £1,000 + completed one-off £250 (shown £1,250): edits that do not change Saved So Far', () => {
    const never = crossMonth(freshApp(holidayOneOff), 'goal', 'gH');
    invariant('FA2.G.never', 'Never edited: £1,250 throughout', never, steady(1250));
    let app = freshApp(holidayOneOff);
    app.renameGoal('gH', 'Summer holiday');
    invariant('FA2.G.rename', 'Rename: baseSaved stays £1,000; no goal activity', [goalOf(app).baseSaved, goalActivity(app)], [1000, []]);
    invariant('FA2.G.rename.timeline', 'Rename: same timeline as never editing', crossMonth(app, 'goal', 'gH'), never);
    app = freshApp(holidayOneOff);
    app.editGoal('gH', { ga: '3000' });
    invariant('FA2.G.target', 'Target £3,000: saved; baseSaved £1,000; same timeline as never editing',
      [goalOf(app).amount, goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [3000, 1000, never]);
    app = freshApp(holidayOneOff);
    app.editGoal('gH', { gm: '150', gc: 'travel', gd: '2027-03-31' });
    invariant('FA2.G.metadata', 'Monthly amount, category and target-date fields: saved; baseSaved £1,000; same timeline as never editing',
      [goalOf(app).monthly, goalOf(app).cat, goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [150, 'travel', 1000, never]);
    invariant('FA2.G.unchanged', 'Saved So Far submitted as "1250", "1250.00", "1250.004": unchanged at 2dp (baseSaved £1,000, shown £1,250)',
      ['1250', '1250.00', '1250.004'].map(v => { const a = freshApp(holidayOneOff); a.editGoal('gH', { gs: v }); return [goalOf(a).baseSaved, a.snap().goal.gH]; }),
      [[1000, 1250], [1000, 1250], [1000, 1250]]);
    app = freshApp(holidayOneOff);
    app.editGoal('gH', { gs: '' });
    invariant('FA2.G.blank', 'Blank Saved So Far is unchanged: baseSaved £1,000; same timeline as never editing', [goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [1000, never]);
    app = freshApp(holidayOneOff);
    app.editGoal('gH', { gs: '1250', geode_goal_saved_orig: undefined });
    invariant('FA2.G.orig-missing', 'Hidden original missing: the current £1,250 is the reference, so an unchanged field stays inert', [goalOf(app).baseSaved, app.snap().goal.gH], [1000, 1250]);
  });

  scenario('FA-2 GOAL — explicit Saved So Far corrections (one-off £250 counted)', () => {
    let app = freshApp(holidayOneOff);
    const rows = app.state().payments;
    const toasts = app.editGoal('gH', { gs: '1180' });
    invariant('FA2.G.down', '£1,250 → £1,180: baseSaved = 1,180 − 250 + 0 = £930; shown £1,180; no message', [goalOf(app).baseSaved, app.snap().goal.gH, toasts], [930, 1180, []]);
    invariant('FA2.G.down.rows', 'Contribution rows untouched; the correction is not logged as goal activity', [app.state().payments, goalActivity(app)], [rows, []]);
    const down = crossMonth(app, 'goal', 'gH');
    app = freshApp(holidayOneOff);
    app.editGoal('gH', { gs: '1400' });
    invariant('FA2.G.up', '£1,250 → £1,400: baseSaved £1,150; shown £1,400; not logged as goal activity', [goalOf(app).baseSaved, app.snap().goal.gH, goalActivity(app)], [1150, 1400, []]);
    const up = crossMonth(app, 'goal', 'gH');
    invariant('FA2.G.reload', 'Both corrections survive render and reload', [down.render, down.reload, up.render, up.reload], [1180, 1180, 1400, 1400]);
    invariant('FA2.G.rollover', 'Both corrections hold at the July rollover (session, reload) and after the August reload',
      [down.julSession, down.julReload, down.augReload, up.julSession, up.julReload, up.augReload], [1180, 1180, 1180, 1400, 1400, 1400]);
    app = freshApp(holidayOneOff);
    const zero = app.editGoal('gH', { gs: '0' });
    invariant('FA2.G.zero.negative', '£0 with £250 completed would need a negative base: refused with a message; nothing changes',
      [zero, goalOf(app).baseSaved, app.snap().goal.gH], [[REFUSED_BELOW], 1000, 1250]);
    app = freshApp(holidayOneOff);
    app.editGoal('gH', { gs: '1180', geode_goal_saved_orig: undefined });
    invariant('FA2.G.orig-missing.correct', 'Hidden original missing: a changed amount still corrects exactly (baseSaved £930, shown £1,180)', [goalOf(app).baseSaved, app.snap().goal.gH], [930, 1180]);
    invariant('FA2.G.counted', 'Correction helper counts exactly what the recompute adds (£250, none recurring)',
      freshApp(holidayOneOff).countedCheck('gH'), { recompute: 250, helper: 250, paidRecurring: 0, helperRecurring: 0 });
  });

  scenario('FA-2 GOAL — two completed one-offs £100 + £150 (shown £1,250)', () => {
    const two = app => {
      completeOn10June(app, { name: 'Top-up A', amount: 100, rec: 'no', goalId: 'gH' });
      completeOn10June(app, { name: 'Top-up B', amount: 150, rec: 'no', goalId: 'gH' });
    };
    const never = crossMonth(freshApp(two), 'goal', 'gH');
    let app = freshApp(two);
    app.renameGoal('gH', 'Summer holiday');
    invariant('FA2.G.multi.rename', 'Rename: same timeline as never editing (£1,250)', [crossMonth(app, 'goal', 'gH'), never], [steady(1250), steady(1250)]);
    app = freshApp(two);
    invariant('FA2.G.multi.counted', 'Helper and recompute both count £250', app.countedCheck('gH'), { recompute: 250, helper: 250, paidRecurring: 0, helperRecurring: 0 });
    app.editGoal('gH', { gs: '1180' });
    invariant('FA2.G.multi', '£1,250 → £1,180: baseSaved £930; £1,180 through July and August', [goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [930, steady(1180)]);
  });

  scenario('FA-2 GOAL — savings release £200 (shown £800)', () => {
    const release = app => app.release('gH', 200);
    let app = freshApp(release);
    let releases = app.state().savingsReleases;
    app.renameGoal('gH', 'Summer holiday');
    invariant('FA2.G.release.rename', 'Rename: baseSaved £1,000; release record unchanged; £800 throughout',
      [goalOf(app).baseSaved, app.state().savingsReleases, crossMonth(app, 'goal', 'gH')], [1000, releases, steady(800)]);
    app = freshApp(release);
    releases = app.state().savingsReleases;
    app.editGoal('gH', { gs: '700' });
    invariant('FA2.G.release.correct', '£800 → £700: baseSaved = 700 − 0 + 200 = £900; release record unchanged; £700 throughout',
      [goalOf(app).baseSaved, app.state().savingsReleases, crossMonth(app, 'goal', 'gH')], [900, releases, steady(700)]);
    app = freshApp(release);
    app.editGoal('gH', { gs: '0' });
    invariant('FA2.G.zero', '£800 → £0 is representable (baseSaved £200): £0 throughout', [goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [200, steady(0)]);
  });

  scenario('FA-2 GOAL — one-off £250 + release £200 (shown £1,050)', () => {
    const both = app => { holidayOneOff(app); app.release('gH', 200); };
    let app = freshApp(both);
    invariant('FA2.G.contrib-release.before', 'Shown £1,050', app.snap().goal.gH, 1050);
    app.renameGoal('gH', 'Summer holiday');
    invariant('FA2.G.contrib-release.rename', 'Rename: baseSaved £1,000; £1,050 throughout', [goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [1000, steady(1050)]);
    app = freshApp(both);
    const releases = app.state().savingsReleases;
    app.editGoal('gH', { gs: '900' });
    invariant('FA2.G.contrib-release.correct', '£1,050 → £900: baseSaved = 900 − 250 + 200 = £850; release counted once; £900 throughout',
      [goalOf(app).baseSaved, app.state().savingsReleases, crossMonth(app, 'goal', 'gH')], [850, releases, steady(900)]);
  });

  scenario('FA-2 GOAL — monthly recurring £250 completed in June (shown £1,250)', () => {
    let app = freshApp(holidayMonthly);
    invariant('FA2.G.recurring.counted', 'Helper and recompute both count £250, all recurring', app.countedCheck('gH'), { recompute: 250, helper: 250, paidRecurring: 250, helperRecurring: 250 });
    const before = app.state();
    const toasts = app.editGoal('gH', { gs: '1180' });
    const after = app.state();
    invariant('FA2.G.recurring-refused', 'Correction while a recurring completion counts: refused with the explanatory message; goals, rows, releases and activity unchanged',
      [toasts, after.goals, after.payments, after.savingsReleases, after.activityLog], [[REFUSED_RECURRING], before.goals, before.payments, before.savingsReleases, before.activityLog]);
    const never = crossMonth(freshApp(holidayMonthly), 'goal', 'gH');
    app = freshApp(holidayMonthly);
    app.renameGoal('gH', 'Summer holiday');
    const edited = crossMonth(app, 'goal', 'gH');
    invariant('FA2.G.recurring-rollover', 'Rename: same timeline as never editing (no FA-2 base change)', edited, never);
    target('FA2.G.recurring-rollover.d1', 'Rename with a recurring completion: £1,250 should hold through July and August', edited, steady(1250), never, 'D1');
  });

  scenario('FA-2 GOAL — Saved So Far disabled by a linked investment', () => {
    const app = freshApp(holidayOneOff, { investments: [Object.assign(ISA(), { goalId: 'gH' })] });
    invariant('FA2.G.linked.before', 'The linked ISA (£5,000) provides the goal position; the goal\'s own cache is £1,250', [app.snap().goal.gH, goalOf(app).saved], [5000, 1250]);
    app.renameGoal('gH', 'Summer holiday');
    invariant('FA2.G.linked-investment', 'Rename submits the disabled field unchanged: goal baseSaved stays £1,000, own amount £1,250, shown £5,000',
      [goalOf(app).baseSaved, goalOf(app).saved, app.snap().goal.gH], [1000, 1250, 5000]);
    app.reload();
    invariant('FA2.G.linked.reload', 'After reload: goal baseSaved £1,000, own amount £1,250, shown £5,000; ISA £5,000',
      [goalOf(app).baseSaved, goalOf(app).saved, app.snap().goal.gH, app.snap().inv.iA], [1000, 1250, 5000, 5000]);
  });

  scenario('FA-2 GOAL — floating-point Saved So Far', () => {
    const app = freshApp(a => completeOn10June(a, { name: 'Pennies', amount: 0.2, rec: 'no', goalId: 'gH' }),
      { goals: [Object.assign(HOLIDAY(), { saved: 1000.1, baseSaved: 1000.1 })] });
    const cached = goalOf(app).saved;
    app.editGoal('gH', { gs: '1000.30' });
    invariant('FA2.G.float', 'The form opens with the unrounded ' + cached + '; "1000.30" is unchanged at 2dp: baseSaved stays £1,000.10',
      [cached !== 1000.3, goalOf(app).baseSaved, app.snap().goal.gH], [true, 1000.1, 1000.3]);
  });

  scenario('FA-2 GOAL — shared counting definition', () => {
    const paid = (id, amount, rec, link) => Object.assign({ id, name: id, amount, date: '2026-06-01', status: 'paid', rec, lastPaidYM: rec === 'yes' ? '2026-06' : '' }, link);
    const app = new App(baseState({ payments: [
      paid('one-off', 100, 'no', { goalId: 'gH' }),
      paid('monthly', 150, 'yes', { goalId: 'gH' }),
      paid('goal-and-isa', 70, 'no', { goalId: 'gH', investId: 'iA' }),
      { id: 'upcoming', name: 'upcoming', amount: 40, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' },
      { id: 'overdue', name: 'overdue', amount: 35, date: '2026-06-01', status: 'upcoming', rec: 'no', goalId: 'gH' },
      paid('isa-only', 30, 'no', { investId: 'iA' }),
      paid('deleted-goal', 20, 'no', { goalId: 'gGone' })
    ] }), '2026-06-05');
    app.reload();
    invariant('FA2.G.counted.rules', 'Completed rows only, goal link before investment link, missing goals ignored: helper = recompute = £320 (£150 recurring)',
      app.countedCheck('gH'), { recompute: 320, helper: 320, paidRecurring: 150, helperRecurring: 150 });
  });

  scenario('FA-2 GOAL — creating a goal', () => {
    const app = freshApp();
    app.createGoal('House', 20000, 1000);
    const g = app.state().goals.filter(x => x.name === 'House')[0];
    invariant('FA2.G.creation', 'New goal with Saved So Far £1,000: saved and baseSaved £1,000; shown £1,000', [g.saved, g.baseSaved, app.snap().goal[g.id]], [1000, 1000, 1000]);
    current('FA2.G.creation.activity', 'Creating a goal logs its opening amount as goal activity (existing behaviour, unchanged)', goalActivity(app), [{ type: 'goal', delta: 1000 }]);
  });
}

function fa2Investments() {
  const isaOneOff = app => completeOn10June(app, { name: 'ISA top-up', amount: 200, rec: 'no', investId: 'iA' });
  const isaMonthly = app => completeOn10June(app, { name: 'ISA monthly', amount: 200, rec: 'yes', investId: 'iA' });
  scenario('FA-2 INVESTMENT — base £5,000 + completed one-off £200 (shown £5,200)', () => {
    const never = crossMonth(freshApp(isaOneOff), 'invest', 'iA');
    invariant('FA2.I.never', 'Never edited: £5,200 throughout', never, steady(5200));
    let app = freshApp(isaOneOff);
    app.saveInvestment('iA', 'ISA renamed');
    invariant('FA2.I.rename', 'Rename: baseBalance stays £5,000; no investment activity', [invOf(app).baseBalance, investActivity(app)], [5000, []]);
    invariant('FA2.I.rename.timeline', 'Rename: same timeline as never editing', crossMonth(app, 'invest', 'iA'), never);
    app = freshApp(isaOneOff);
    app.editInvestment('iA', { xb: '5200.00' });
    invariant('FA2.I.unchanged', 'Balance submitted as "5200.00" is unchanged: baseBalance £5,000; same timeline as never editing',
      [invOf(app).baseBalance, investActivity(app), crossMonth(app, 'invest', 'iA')], [5000, [], never]);
    app = freshApp(isaOneOff);
    app.editInvestment('iA', { xtype: 'other', xr: '120', xp: 'Vanguard', xo: 'Long term', xhorizon: 'long', xcs: 'recurring' });
    invariant('FA2.I.metadata', 'Type, returns, platform, notes, horizon, contribution style: saved; no financial movement or activity',
      [invOf(app).type, invOf(app).returns, invOf(app).platform, invOf(app).baseBalance, investActivity(app), crossMonth(app, 'invest', 'iA')],
      ['other', 120, 'Vanguard', 5000, [], never]);
    app = freshApp(isaOneOff);
    const blank = app.editInvestment('iA', { xb: '' });
    invariant('FA2.I.blank', 'Blank Balance on an existing investment is unchanged: saved without a prompt; baseBalance £5,000', [blank, invOf(app).baseBalance, app.snap().inv.iA], [[], 5000, 5200]);
    app = freshApp(isaOneOff);
    app.editInvestment('iA', { xb: '5600' });
    target('FA2.I.explicit-up', 'Balance entered as £5,600 shows £5,600 (explicit Balance semantics deferred to FA-7)', app.snap().inv.iA, 5600, 5800, 'D10');
    app = freshApp(isaOneOff);
    app.editInvestment('iA', { xb: '4800' });
    target('FA2.I.explicit-down', 'Balance entered as £4,800 shows £4,800 (explicit Balance semantics deferred to FA-7)', app.snap().inv.iA, 4800, 5000, 'D10');
    current('FA2.I.explicit.activity', 'An explicit Balance change still logs its balance_update investment entry (existing behaviour)', investActivity(app), [{ type: 'invest', delta: -200 }]);
  });
  scenario('FA-2 INVESTMENT — monthly recurring £200 completed in June', () => {
    const never = crossMonth(freshApp(isaMonthly), 'invest', 'iA');
    const app = freshApp(isaMonthly);
    app.saveInvestment('iA', 'ISA renamed');
    const edited = crossMonth(app, 'invest', 'iA');
    invariant('FA2.I.recurring-rollover', 'Rename: same timeline as never editing (no FA-2 base change)', edited, never);
    target('FA2.I.recurring-rollover.d1', 'Rename with a recurring completion: £5,200 should hold through July and August', edited, steady(5200), never, 'D1');
  });
  scenario('FA-2 INVESTMENT — creating an investment', () => {
    const app = freshApp();
    app.createInvestment('New ISA', 5000);
    const v = app.state().investments.filter(x => x.name === 'New ISA')[0];
    invariant('FA2.I.creation', 'New investment with Balance £5,000: balance and baseBalance £5,000', [v.balance, v.baseBalance], [5000, 5000]);
    const blank = app.createInvestment('Blank ISA', '');
    invariant('FA2.I.creation.blank', 'A new investment still needs a Balance', [blank, app.state().investments.filter(x => x.name === 'Blank ISA').length],
      [['Enter an amount before saving.'], 0]);
  });
}

function fa2Deposits() {
  scenario('FA-2 DEPOSIT — "+" £50 and a completed one-off £250 (shown £1,300)', () => {
    const depositThenTopUp = app => { app.deposit('gH', 50); holidayOneOff(app); };
    let app = freshApp(depositThenTopUp);
    invariant('FA2.DEP.before', 'Shown £1,300; the deposit sits in baseSaved (£1,050)', [app.snap().goal.gH, goalOf(app).baseSaved], [1300, 1050]);
    app.renameGoal('gH', 'Summer holiday');
    invariant('FA2.DEP.rename', 'Rename: baseSaved stays £1,050; £1,300 throughout', [goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [1050, steady(1300)]);
    app = freshApp(depositThenTopUp);
    app.editGoal('gH', { gs: '1200' });
    invariant('FA2.DEP.correct', '£1,300 → £1,200 re-anchors the combined base: baseSaved = 1,200 − 250 = £950; £1,200 throughout',
      [goalOf(app).baseSaved, crossMonth(app, 'goal', 'gH')], [950, steady(1200)]);
  });
}

// FA-3A: goal/investment payment paths record contribution events; nothing financial reads them yet.

const COMPLETION_KEYS = ['id', 'eventType', 'paymentId', 'entityType', 'entityId', 'occurrenceYm', 'amount', 'recurrence', 'dueDateSnapshot', 'recordedAt', 'source'];
const REVERSAL_KEYS = ['id', 'eventType', 'paymentId', 'entityType', 'entityId', 'occurrenceYm', 'reversesEventId', 'recordedAt', 'source'];
/** completion: [type, payment, entity, occurrence, amount, recurrence, source]; reversal: [type, payment, entity, occurrence, reverses, source]. */
const evRow = e => e.eventType === 'completion'
  ? ['completion', e.paymentId, e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount, e.recurrence, e.source]
  : ['reversal', e.paymentId, e.entityType + ':' + e.entityId, e.occurrenceYm, e.reversesEventId, e.source];
const evRows = app => app.events().map(evRow);
const activeTotal = app => round(app.activeEvents().reduce((s, e) => s + e.amount, 0));
const withoutLedger = state => {
  const c = JSON.parse(JSON.stringify(state));
  delete c.contributionEvents;
  c.payments.forEach(p => { delete p.contributionEventId; });
  return c;
};
/** Every row (and two rows that do not exist) gets a £5,000 May completion it points to. */
const withFakeLedger = state => {
  const c = withoutLedger(state);
  const fake = (id, paymentId, entityType, entityId) => ({ id, eventType: 'completion', paymentId, entityType, entityId, occurrenceYm: '2026-05',
    amount: 5000, recurrence: 'monthly', dueDateSnapshot: '', recordedAt: 1, source: 'fake' });
  c.contributionEvents = c.payments.map((p, i) => {
    p.contributionEventId = 'fake' + i;
    return fake('fake' + i, String(p.id), p.goalId ? 'goal' : 'investment', String(p.goalId || p.investId || 'iA'));
  }).concat([fake('fake-goal', 'ghost-goal', 'goal', 'gH'), fake('fake-inv', 'ghost-inv', 'investment', 'iA')]);
  return c;
};

function fa3aLedger() {
  scenario('FA-3A LEDGER — state, normalisation and the active set', () => {
    const src = PROGRAM.src;
    const sStart = src.indexOf('\nvar S = {');
    const fresh = freshApp();
    fresh.reload();
    invariant('FA3A.state.default', 'The canonical state declares contributionEvents: []; a stored state without it loads with []',
      [src.slice(sStart, src.indexOf('\n};', sStart)).indexOf('\n  contributionEvents: [],') >= 0, fresh.events()], [true, []]);

    const C = (id, paymentId, ym, amount, recordedAt, extra) => Object.assign({ id, eventType: 'completion', paymentId, entityType: 'goal', entityId: 'gH',
      occurrenceYm: ym, amount, recurrence: 'one_off', dueDateSnapshot: ym + '-10', recordedAt, source: 'test' }, extra || {});
    const R = (id, reverses, paymentId, ym, recordedAt) => ({ id, eventType: 'reversal', paymentId, entityType: 'goal', entityId: 'gH', occurrenceYm: ym,
      reversesEventId: reverses, recordedAt, source: 'test' });
    const ISA_LINK = { entityType: 'investment', entityId: 'iA' };
    const valid = { c1: C('c1', 'p1', '2026-05', 100, 1), c3: C('c3', 'p2', '2026-05', 50, 3, ISA_LINK), r3: R('r3', 'c3', 'p2', '2026-05', 4),
      c4: C('c4', 'p2', '2026-05', 75, 8, ISA_LINK) };
    const stored = [null, 7, 'x', [], valid.c1, C('c1', 'p1', '2026-05', 999, 1), C('c2', 'p1', '2026-05', 100, 2),
      C('bad-amount', 'p3', '2026-05', 0, 1), C('bad-entity', 'p3', '2026-05', 10, 1, { entityType: 'debt' }), C('bad-ym', 'p3', '2026-13', 10, 1),
      C('bad-rec', 'p3', '2026-05', 10, 1, { recurrence: 'weekly' }), C('bad-time', 'p3', '2026-05', 10, '1'), C('bad-payment', '', '2026-05', 10, 1),
      valid.c3, valid.r3, R('r3-again', 'c3', 'p2', '2026-05', 5), R('r-missing', 'zz', 'p1', '2026-05', 6), R('r-other-month', 'c1', 'p1', '2026-04', 7), valid.c4];
    const app = new App(baseState({ contributionEvents: stored }), '2026-06-05');
    app.reload();
    const once = app.events();
    app.reload();
    invariant('FA3A.state.normalise', 'Malformed values load as []; invalid events, duplicate ids, unmatched or repeated reversals and a second active completion for one occurrence are dropped; valid events kept unmodified; idempotent',
      [['{}', 'x', null, 42].map(v => { const a = new App(baseState({ contributionEvents: v === '{}' ? {} : v }), '2026-06-05'); a.reload(); return a.events(); }),
        once, app.events()], [[[], [], [], []], [valid.c1, valid.c3, valid.r3, valid.c4], [valid.c1, valid.c3, valid.r3, valid.c4]]);
    invariant('FA3A.active', 'Active completions: one per occurrence (c1 £100, c4 £75); total £175', [app.activeEvents().map(e => e.id), activeTotal(app)], [['c1', 'c4'], 175]);
    invariant('FA3A.reversal', 'The reversed c3 (£50) is not active and its reversal carries no value; with the ledger, Holiday and ISA still show base £1,000 / £5,000',
      [app.activeEvents().some(e => e.id === 'c3' || e.id === 'r3'), app.snap().goal.gH, app.snap().inv.iA], [false, 1000, 5000]);
  });

  scenario('FA-3A LEDGER — backup export, restore extraction and schema', () => {
    const app = freshApp(holidayOneOff, { _schemaVersion: 1 });
    const stored = app.events();
    const env = app.backup();
    const restored = app.restorable(env);
    const back = new App(restored.state, '2026-06-20');
    back.reload();
    invariant('FA3A.backup', 'Backup carries the ledger; restore extraction keeps it; the restored state loads it unchanged, with the row pointer, Holiday £1,250',
      [stored.length, env.data.contributionEvents, restored.ok, restored.strippedKeys.indexOf('contributionEvents'), back.events(), back.pointer('id1'), back.snap().goal.gH],
      [1, stored, true, -1, stored, stored[0].id, 1250]);
    const old = JSON.parse(JSON.stringify(env));
    delete old.data.contributionEvents;
    old.data.payments.forEach(p => { delete p.contributionEventId; });
    const oldRestored = app.restorable(old);
    const oldApp = new App(oldRestored.state, '2026-06-20');
    oldApp.reload();
    invariant('FA3A.old-backup', 'A backup from before the ledger is accepted; loading it seeds the one completion its paid one-off proves (FA-3B migration), Holiday £1,250',
      [oldRestored.ok, Object.prototype.hasOwnProperty.call(oldRestored.state, 'contributionEvents'), evRows(oldApp), oldApp.snap().goal.gH],
      [true, false, [['completion', 'id1', 'goal:gH', '2026-06', 250, 'one_off', 'migration']], 1250]);
    const lists = JSON.parse(app.run('JSON.stringify([geodeBeyndBackupRestorableKeyWhitelist(), geodeBeyndBackupForbiddenDataKeys()])'));
    invariant('FA3A.backup.lists', 'contributionEvents is restorable, not forbidden and not excluded from export',
      [lists[0].indexOf('contributionEvents') >= 0, lists[1].indexOf('contributionEvents'), env.excludedTopLevelKeys.indexOf('contributionEvents')], [true, -1, -1]);
    const newer = app.restorable(Object.assign({}, env, { schemaVersion: 2 }));
    current('FA3A.schema', 'Schema stays 1 in FA-3A (bump deferred to the authority switch); a backup marked newer is refused whole, never extracted without its ledger',
      [app.run('GEODE_SCHEMA_VERSION'), env.schemaVersion, newer.ok, Object.keys(newer.state).length], [1, 1, false, 0]);
  });
}

function fa3aGoals() {
  scenario('FA-3A GOAL — togglePay capture (monthly £100 due 15 June)', () => {
    const app = freshApp();
    const id = monthlyHoliday(app);
    invariant('FA3A.goal.schedule', 'Scheduling records nothing', app.events(), []);
    app.at('2026-06-10'); app.toggle(id);
    const c = app.events()[0];
    invariant('FA3A.goal.toggle.complete', 'Completing records one June completion (£100, monthly, due date before the advance); the row points to it; Holiday £1,100',
      [evRows(app), Object.keys(c), c.dueDateSnapshot, app.pointer(id), app.snap().goal.gH],
      [[['completion', id, 'goal:gH', '2026-06', 100, 'monthly', 'mark_completed']], COMPLETION_KEYS, '2026-06-15', c.id, 1100]);
    const recorded = app.events();
    app.run('(function () { var p = S.payments.filter(function (x) { return x.id === ' + JSON.stringify(id) + '; })[0];' +
      ' geodeRecordContributionTransition(geodeContributionEventSnapshot(p), p, "repeat"); geodeRecordContributionTransition(null, p, "repeat");' +
      ' geodeEnsureContributionCompletion(p, "repeat"); })()');
    app.render(); app.render(); app.render(); app.reload(); app.reload();
    invariant('FA3A.goal.toggle.double', 'Recording the same completion again (as unchanged, as new, via the safety net), three renders and two reloads add nothing',
      [app.events(), app.pointer(id), app.snap().goal.gH], [recorded, c.id, 1100]);
    app.toggle(id);
    const r = app.events()[1];
    invariant('FA3A.goal.toggle.undo', 'Undo appends exactly one reversal of that completion; nothing active; pointer removed; Holiday £1,000',
      [evRows(app), Object.keys(r), app.activeEvents().length, app.pointer(id), app.snap().goal.gH],
      [[evRow(c), ['reversal', id, 'goal:gH', '2026-06', c.id, 'mark_completed']], REVERSAL_KEYS, 0, null, 1000]);
    app.toggle(id);
    const again = app.events();
    invariant('FA3A.goal.toggle.recomplete', 'Re-completing appends a new June completion: completion, reversal, completion; one active (the new one); Holiday £1,100',
      [again.map(e => e.eventType + ' ' + e.occurrenceYm), again[2].id !== c.id, app.activeEvents().map(e => e.id), app.pointer(id), app.snap().goal.gH],
      [['completion 2026-06', 'reversal 2026-06', 'completion 2026-06'], true, [again[2].id], again[2].id, 1100]);
  });

  scenario('FA-3A GOAL — payment form capture', () => {
    const app = freshApp();
    const one = app.contribute({ name: 'Holiday top-up', amount: 250, date: '2026-06-02', status: 'paid', rec: 'no', goalId: 'gH' });
    const monthly = app.contribute({ name: 'Holiday monthly', amount: 100, date: '2026-06-15', status: 'paid', rec: 'yes', goalId: 'gH' });
    const later = app.contribute({ name: 'Holiday extra', amount: 40, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    app.editPayment(later, { status: 'paid' });
    invariant('FA3A.goal.form.complete', 'Saved as paid (new one-off, new monthly) or edited to paid: one completion each — one-off for its due month, monthly for its completion month; Holiday £1,390',
      [evRows(app), app.events().map(e => e.dueDateSnapshot), app.snap().goal.gH],
      [[['completion', one, 'goal:gH', '2026-06', 250, 'one_off', 'payment_form'], ['completion', monthly, 'goal:gH', '2026-06', 100, 'monthly', 'payment_form'],
        ['completion', later, 'goal:gH', '2026-06', 40, 'one_off', 'payment_form']], ['2026-06-02', '2026-06-15', '2026-06-20'], 1390]);
    const first = app.events()[0];
    app.editPayment(one, { name: 'Holiday top-up (renamed)' });
    app.editPayment(one, {});
    const unchanged = app.events().length;
    app.editPayment(one, { amount: 300 });
    const replaced = app.events()[4];
    invariant('FA3A.goal.form.edit-paid', 'Renaming or re-saving a paid row records nothing; changing it to £300 reverses its completion and records £300 for the same occurrence and due date; Holiday £1,440',
      [unchanged, evRows(app).slice(3), replaced.dueDateSnapshot, app.activeEvents().map(e => [e.paymentId, e.amount]), app.pointer(one), app.snap().goal.gH],
      [3, [['reversal', one, 'goal:gH', '2026-06', first.id, 'payment_form'], ['completion', one, 'goal:gH', '2026-06', 300, 'one_off', 'payment_form']],
        '2026-06-02', [[monthly, 100], [later, 40], [one, 300]], replaced.id, 1440]);
    app.editPayment(one, { goalId: '', investId: 'iA' });
    invariant('FA3A.goal.form.relink', 'Moving the paid £300 to the ISA reverses the goal completion and records it for the ISA, same occurrence; Holiday £1,140, ISA £5,300',
      [evRows(app).slice(5), app.snap().goal.gH, app.snap().inv.iA],
      [[['reversal', one, 'goal:gH', '2026-06', replaced.id, 'payment_form'], ['completion', one, 'investment:iA', '2026-06', 300, 'one_off', 'payment_form']], 1140, 5300]);
    const monthlyEvent = app.events()[1];
    app.editPayment(monthly, { status: 'upcoming' });
    invariant('FA3A.goal.form.unpay', 'Editing the paid monthly row back to upcoming reverses its completion; Holiday £1,040',
      [evRows(app).slice(7), app.pointer(monthly), app.snap().goal.gH], [[['reversal', monthly, 'goal:gH', '2026-06', monthlyEvent.id, 'payment_form']], null, 1040]);
  });

  scenario('FA-3A SCOPE — debt, bill and unlinked rows record no contribution events', () => {
    const app = freshApp(null, { debts: [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 }] });
    app.contribute({ name: 'Card payment', amount: 50, date: '2026-06-02', status: 'paid', rec: 'no', debtId: 'dC' });
    app.contribute({ name: 'Gym', amount: 30, date: '2026-06-02', status: 'paid', rec: 'no' });
    app.contribute({ name: 'Old goal', amount: 20, date: '2026-06-02', status: 'paid', rec: 'no', goalId: 'gGone' });
    invariant('FA3A.scope', 'Debt payment recorded in debtPaymentEvents only; bill and missing-goal rows record nothing', [app.events(), app.state().debtPaymentEvents.length], [[], 1]);
  });
}

function fa3aInvestments() {
  scenario('FA-3A INVESTMENT — capture only (Balance stays legacy)', () => {
    let app = freshApp();
    const id = completeOn10June(app, { name: 'ISA monthly', amount: 200, rec: 'yes', investId: 'iA' });
    invariant('FA3A.inv.toggle.complete', 'Completing records a June £200 monthly completion for the ISA; ISA £5,200',
      [evRows(app), app.pointer(id) === app.events()[0].id, app.snap().inv.iA], [[['completion', id, 'investment:iA', '2026-06', 200, 'monthly', 'mark_completed']], true, 5200]);
    app = freshApp();
    const one = app.contribute({ name: 'ISA top-up', amount: 300, date: '2026-06-02', status: 'paid', rec: 'no', investId: 'iA' });
    invariant('FA3A.inv.form.complete', 'Saving a paid one-off records a June £300 completion for the ISA; ISA £5,300',
      [evRows(app), app.snap().inv.iA], [[['completion', one, 'investment:iA', '2026-06', 300, 'one_off', 'payment_form']], 5300]);
  });
}

function fa3aSmartImport() {
  scenario('FA-3A SMART IMPORT — new rows and merges', () => {
    const app = freshApp();
    app.smartImport([{ name: 'Holiday transfer', amount: 150, date: '2026-06-01', link: 'goal:gH' }, { name: 'ISA transfer', amount: 80, date: '2026-06-02', link: 'invest:iA' },
      { name: 'Holiday later', amount: 60, date: '2026-06-20', link: 'goal:gH' }, { name: 'Gym', amount: 30, date: '2026-06-01', link: '' }]);
    const ids = app.state().payments.map(p => p.id);
    invariant('FA3A.import.create', 'Past-dated goal/ISA imports arrive paid and record one completion each; the future-dated import and the bill record nothing',
      [app.state().payments.map(p => p.status), evRows(app)],
      [['paid', 'paid', 'upcoming', 'paid'], [['completion', ids[0], 'goal:gH', '2026-06', 150, 'one_off', 'smart_import'], ['completion', ids[1], 'investment:iA', '2026-06', 80, 'one_off', 'smart_import']]]);
    const sched = monthlyHoliday(app);
    const merge = amount => app.smartImport([{ name: 'Holiday monthly', amount, date: '2026-06-03', link: 'goal:gH', mergeId: sched }]);
    merge(100);
    const merged = app.events();
    invariant('FA3A.import.merge', 'Merging a past-dated import into the scheduled monthly row makes it paid and records its June completion (from the import date)',
      [app.state().payments.filter(p => p.id === sched)[0].status, evRow(merged[2]), app.pointer(sched)], ['paid', ['completion', sched, 'goal:gH', '2026-06', 100, 'monthly', 'smart_import'], merged[2].id]);
    merge(100);
    app.render(); app.reload();
    invariant('FA3A.import.idempotent', 'Importing the same transaction into the same row again, then render and reload, records nothing', app.events(), merged);
    merge(120);
    invariant('FA3A.import.merge-amount', 'A merge that changes the paid amount reverses the June completion and records £120 for the same occurrence',
      evRows(app).slice(3), [['reversal', sched, 'goal:gH', '2026-06', merged[2].id, 'smart_import'], ['completion', sched, 'goal:gH', '2026-06', 120, 'monthly', 'smart_import']]);
  });
}

function fa3aDeletion() {
  scenario('FA-3A DELETE — only the current occurrence is reversed', () => {
    let app = freshApp(holidayOneOff);
    const c = app.events()[0];
    app.del('id1');
    invariant('FA3A.delete.current', 'Deleting a completed one-off reverses its completion; nothing active; Holiday £1,000',
      [evRows(app), app.activeEvents().length, app.snap().goal.gH], [[evRow(c), ['reversal', 'id1', 'goal:gH', '2026-06', c.id, 'delete_payment']], 0, 1000]);
    app = freshApp(holidayMonthly);
    const june = app.events()[0];
    app.advance('2026-07-02', 'session');
    app.at('2026-07-10'); app.toggle('id1');
    const july = app.events()[1];
    app.del('id1');
    invariant('FA3A.delete.historical', 'Deleting a monthly row completed in June and July reverses July only; June stays active',
      [app.events().map(e => e.eventType + ' ' + e.occurrenceYm), app.events()[2].reversesEventId, app.activeEvents().map(e => e.id)],
      [['completion 2026-06', 'completion 2026-07', 'reversal 2026-07'], july.id, [june.id]]);
    app = freshApp(holidayMonthly);
    app.advance('2026-07-02', 'reload');
    app.del('id1');
    invariant('FA3A.delete.upcoming', 'Deleting it while July is still upcoming records nothing; June stays active', [app.events().length, app.activeEvents().map(e => e.occurrenceYm)], [1, ['2026-06']]);
  });
}

function fa3aIdentity() {
  scenario('FA-3A IDENTITY — three direct contributions in one month', () => {
    const app = freshApp();
    const ids = [50, 75, 100].map(amount => app.contribute({ name: 'Holiday top-up', amount, date: '2026-06-02', status: 'paid', rec: 'no', goalId: 'gH' }));
    app.merge();
    const ev = app.events();
    invariant('FA3A.direct.multi', '£50, £75, £100: three rows, three completions with distinct ids for the three rows, no merge; active total £225; Holiday £1,225',
      [app.state().payments.map(p => p.id), ev.map(e => e.paymentId), new Set(ev.map(e => e.id)).size, ev.map(e => e.amount), activeTotal(app), app.snap().goal.gH],
      [ids, ids, 3, [50, 75, 100], 225, 1225]);
    const sched = app.planSchedule({ name: 'Holiday plan', amount: 120, date: '2026-06-20', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    app.merge();
    invariant('FA3A.fa1.pointer', 'A same-month Plan save afterwards creates its own row; paid rows, their pointers and the ledger are untouched',
      [sched !== null, app.state().payments.filter(p => p.status === 'paid').map(p => p.contributionEventId), app.events()], [true, ev.map(e => e.id), ev]);
  });
}

function fa3aRollover() {
  MODES.forEach(mode => scenario('FA-3A ROLLOVER — June completion through July and August [' + mode + ']', () => {
    const app = freshApp(holidayMonthly);
    const june = app.events();
    app.advance('2026-07-02', mode);
    const row = app.state().payments[0];
    const julyShown = app.snap().goal.gH;
    invariant('FA3A.rollover.jul', 'July rollover: the June event is unchanged and not duplicated; the row is reset and its pointer removed',
      [app.events(), row.status, row.lastPaidYM, 'contributionEventId' in row], [june, 'upcoming', '', false]);
    app.render(); app.reload();
    app.advance('2026-08-02', 'reload');
    invariant('FA3A.rollover.aug', 'Renders, reloads and the August reload leave the ledger unchanged', app.events(), june);
    current('FA3A.rollover.display', 'Holiday still shows the legacy value in July and August: the ledger is not authoritative until FA-3C (D1 open)',
      [julyShown, app.snap().goal.gH], by(mode, { session: [1250, 1000], reload: [1000, 1000] }));
  }));

  scenario('FA-3A ROLLOVER — completions from before the ledger', () => {
    const paid = (id, rec, date, lastPaidYM, link) => Object.assign({ id, name: id, amount: 100, date, status: 'paid', rec, lastPaidYM, goalId: '', investId: '',
      debtId: '', payKind: 'goal' }, link);
    const state = baseState({ payments: [paid('m', 'yes', '2026-07-15', '2026-06', { goalId: 'gH' }), paid('o', 'no', '2026-06-02', '', { goalId: 'gH' }),
      paid('mi', 'yes', '2026-07-15', '2026-06', { investId: 'iA', payKind: 'invest' }), paid('b', 'yes', '2026-07-15', '2026-06', { payKind: 'bill' })] });
    const seeded = [['completion', 'm', 'goal:gH', '2026-06', 100, 'monthly', 'migration'], ['completion', 'o', 'goal:gH', '2026-06', 100, 'one_off', 'migration'],
      ['completion', 'mi', 'investment:iA', '2026-06', 100, 'monthly', 'migration']];
    const loaded = MODES.map(mode => {
      const app = new App(state, '2026-06-20');
      app.reload(); app.render();
      const june = [evRows(app), app.state().payments.map(p => !!p.contributionEventId)];
      app.advance('2026-07-02', mode);
      app.render(); app.reload(); app.advance('2026-08-02', 'reload');
      return [june, evRows(app)];
    });
    invariant('FA3A.legacy-seeded', 'Loading in June seeds each completed goal/ISA row once (FA-3B migration) and points it there; the bill seeds nothing; July and August add nothing',
      loaded, MODES.map(() => [[seeded, [true, true, true, false]], seeded]));
    const expected = [['completion', 'm', 'goal:gH', '2026-06', 100, 'monthly', 'rollover_safety_net'], ['completion', 'mi', 'investment:iA', '2026-06', 100, 'monthly', 'rollover_safety_net']];
    const app = new App(state, '2026-06-20');
    app.render();
    app.advance('2026-07-02', 'session');
    const july = [evRows(app), app.events().map(e => e.dueDateSnapshot)];
    invariant('FA3A.safety-net', 'Rows completed without capture in a session that never loaded: the July rollover records each completed monthly goal/ISA row once for June, with no due-date snapshot; one-offs and bills record nothing',
      july, [expected, ['', '']]);
    app.render(); app.reload(); app.advance('2026-08-02', 'reload');
    invariant('FA3A.safety-net.repeat', 'Later renders add nothing; the next load seeds only the paid one-off the safety net leaves to migration; the August rollover adds nothing',
      evRows(app), expected.concat([['completion', 'o', 'goal:gH', '2026-06', 100, 'one_off', 'migration']]));
  });
}

function fa3aProtection() {
  const STEPS = [{ label: 'Catch up on Holiday', amount: 120 }, { label: 'Invest what remains', amount: 120 }];
  /** Monthly Left, goal/ISA shown, rows, Plan detail, Home main action and Suggested Actions — before and after a reload. */
  const surfaces = (state, clock) => {
    const a = new App(state, clock, PROGRAM.plan);
    a.setPlan(STEPS);
    const look = () => ({ snap: a.snap(), plan: STEPS.map(s => a.planView(s)), home: STEPS.map(s => a.homeView(s)), suggestions: a.suggestions() });
    const direct = look();
    a.reload();
    return { direct, reloaded: look() };
  };
  const CASES = [
    ['goal-monthly', 'goal monthly £100', app => { completeOn10June(app, { name: 'Holiday monthly', amount: 100, rec: 'yes', goalId: 'gH' }); }, [2900, 2900, 2900, 2900, 2900]],
    ['goal-oneoff', 'goal one-off £100', app => { completeOn10June(app, { name: 'Holiday top-up', amount: 100, rec: 'no', goalId: 'gH' }); }, [2900, 2900, 2900, 3000, 3000]],
    ['inv-monthly', 'investment monthly £200', app => { completeOn10June(app, { name: 'ISA monthly', amount: 200, rec: 'yes', investId: 'iA' }); }, [2800, 2800, 2800, 2800, 2800]],
    ['direct-multi', 'direct £50 + £75 + £100', app => {
      [50, 75, 100].forEach(amount => app.contribute({ name: 'Holiday top-up', amount, date: '2026-06-02', status: 'paid', rec: 'no', goalId: 'gH' }));
      app.at('2026-06-10');
    }, [2775, 2775, 2775, 3000, 3000]]
  ];
  CASES.forEach(([key, name, setup, left]) => scenario('FA-3A PROTECTION — ' + name + ': Monthly Left, Plan, Home, Suggested Actions', () => {
    const app = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05', PROGRAM.plan);
    app.setPlan(STEPS);
    setup(app);
    const checks = [];
    const check = (label, clock) => {
      const s = app.state();
      const real = surfaces(s, clock);
      checks.push([label, real.direct.snap.left, same(real, surfaces(withoutLedger(s), clock)) && same(real, surfaces(withFakeLedger(s), clock))]);
    };
    check('June', '2026-06-10');
    app.render(); check('June render', '2026-06-10');
    app.reload(); check('June reload', '2026-06-10');
    app.advance('2026-07-02', 'session'); check('July', '2026-07-02');
    app.reload(); check('July reload', '2026-07-02');
    const labels = ['June', 'June render', 'June reload', 'July', 'July reload'];
    invariant('FA3A.protect.' + key, 'Every surface identical with the ledger removed or replaced by £5,000 completions; Monthly Left (legacy) ' +
      left.map(v => '£' + v.toLocaleString('en-GB')).join(' / '), checks, labels.map((l, i) => [l, left[i], true]));
  }));

  scenario('FA-3A PROTECTION — release: base £1,000 + one-off £250 + release £200', () => {
    const app = freshApp(a => { holidayOneOff(a); a.release('gH', 200); });
    const ledger = app.events();
    const state = app.state();
    invariant('FA3A.release', 'One £250 completion; the release adds no contribution event and keeps its single record; Holiday £1,050 throughout',
      [evRows(app), state.savingsReleases.length, crossMonth(app, 'goal', 'gH'), app.events()],
      [[['completion', 'id1', 'goal:gH', '2026-06', 250, 'one_off', 'mark_completed']], 1, steady(1050), ledger]);
    const shownAfterReload = s => { const a = new App(s, '2026-06-20'); a.reload(); return a.snap().goal.gH; };
    invariant('FA3A.release.inert', 'With the ledger removed or replaced the release still deducts once: Holiday £1,050 after reload',
      [shownAfterReload(state), shownAfterReload(withoutLedger(state)), shownAfterReload(withFakeLedger(state))], [1050, 1050, 1050]);
  });
}

/** An annual Holiday contribution £250 due on `due`, completed on `completedOn`; returns { app, id, event }. */
const completedAnnual = (due, completedOn, program) => {
  const app = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05', program);
  const id = app.contribute({ name: 'Holiday annual', amount: 250, date: due, status: 'upcoming', rec: 'annual', goalId: 'gH' });
  app.at(completedOn); app.toggle(id);
  return { app, id, event: app.events()[0] };
};

/** Annual recurrence lifecycle (D11): characterised, not repaired. Whatever the row does, each year's completion stays recorded. */
function fa3aAnnual() {
  scenario('FA-3A ANNUAL — annual Holiday contribution £250 due 10 June (D11)', () => {
    const STEP = { label: 'Catch up on Holiday', amount: 250 };
    const app = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05', PROGRAM.plan);
    app.setPlan([STEP]);
    const id = app.contribute({ name: 'Holiday annual', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', goalId: 'gH' });
    const plan = () => { const v = app.planView(STEP); return { applied: v.applied, scheduled: v.scheduled, gap: v.gap }; };
    const row = () => app.state().payments.filter(p => p.id === id)[0];
    invariant('FA3A.annual.before', 'Before completion: Monthly Left £2,750; Plan sees £250 scheduled', { left: app.snap().left, plan: plan() },
      { left: 2750, plan: { applied: 0, scheduled: 250, gap: 0 } });
    app.at('2026-06-10'); app.toggle(id);
    const c = app.events()[0];
    invariant('FA3A.annual.complete', 'Completion recorded for June 2026: £250, annual, due 10 June 2026 (before the one-year advance)',
      [evRow(c), c.dueDateSnapshot], [['completion', id, 'goal:gH', '2026-06', 250, 'annual', 'mark_completed'], '2026-06-10']);
    current('FA3A.annual.advance', 'Completing moves the due date to 10 June 2027 at once (lastPaidYM 2026-06); Holiday £1,250',
      [row().date, row().lastPaidYM, app.snap().goal.gH], ['2027-06-10', '2026-06', 1250]);
    target('FA3A.annual.left', 'The June completion still counts in June\'s Monthly Left (£2,750)', app.snap().left, 2750, 3000, 'D11');
    target('FA3A.annual.plan', 'Plan recognises the £250 just completed', plan(), { applied: 250, scheduled: 0, gap: 0 }, { applied: 0, scheduled: 0, gap: 250 }, 'D11');
    app.advance('2027-06-05', 'reload');
    target('FA3A.annual.next-year', 'June 2027: the row is the upcoming 2027 occurrence and Plan sees it scheduled', [row().status, plan()],
      ['upcoming', { applied: 0, scheduled: 250, gap: 0 }], ['paid', { applied: 250, scheduled: 0, gap: 0 }], 'D11');
    invariant('FA3A.annual.ledger', 'A year of renders and reloads leaves the 2026 completion untouched', app.events(), [c]);
    app.at('2027-06-10'); app.toggle(id);
    target('FA3A.annual.next-year-tap', 'Tapping the row in June 2027 completes the 2027 occurrence', [row().status, row().lastPaidYM], ['paid', '2027-06'], ['upcoming', ''], 'D11');
    invariant('FA3A.annual.history-survives-next-year-tap', 'That tap leaves the 2026 completion active: no reversal, no 2027 completion, pointer removed',
      [app.events(), app.activeEvents().map(e => e.id), app.pointer(id)], [[c], [c.id], null]);
    current('FA3A.annual.tap.display', 'Holiday shows £1,000 after the tap (legacy row display; the ledger is not authoritative until FA-3C)', app.snap().goal.gH, 1000);
  });

  scenario('FA-3A ANNUAL — undo and edit within the same occurrence', () => {
    let { app, id, event } = completedAnnual('2026-06-10', '2026-06-10');
    app.toggle(id);
    invariant('FA3A.annual.undo.same-occurrence', 'Undo straight after completing reverses the 2026 completion once; nothing active',
      [evRows(app), app.activeEvents().length], [[evRow(event), ['reversal', id, 'goal:gH', '2026-06', event.id, 'mark_completed']], 0]);
    ({ app, id, event } = completedAnnual('2026-06-10', '2026-06-10'));
    app.advance('2026-12-01', 'reload');
    app.toggle(id);
    invariant('FA3A.annual.undo.later-same-occurrence', 'Undo in December 2026, before the next due date, still reverses it',
      [evRows(app).map(r => r[0] + ' ' + r[3]), app.activeEvents().length], [['completion 2026-06', 'reversal 2026-06'], 0]);
    ({ app, id, event } = completedAnnual('2026-06-10', '2026-06-10'));
    app.at('2026-07-01');
    app.editPayment(id, { amount: 300 });
    invariant('FA3A.annual.edit.same-occurrence', 'Changing it to £300 in July 2026 reverses the completion and records £300 for the 2026 occurrence',
      evRows(app).slice(1), [['reversal', id, 'goal:gH', '2026-06', event.id, 'payment_form'], ['completion', id, 'goal:gH', '2026-06', 300, 'annual', 'payment_form']]);
  });

  scenario('FA-3A ANNUAL — a later occurrence never rewrites the 2026 completion', () => {
    let { app, id, event } = completedAnnual('2026-06-10', '2026-06-10');
    app.advance('2027-06-05', 'reload');
    app.editPayment(id, { amount: 300 });
    invariant('FA3A.annual.edit.next-year', 'Editing the stale row to £300 in June 2027 records nothing and drops its pointer; the 2026 completion stays active at £250',
      [app.events(), app.pointer(id)], [[event], null]);
    ({ app, id, event } = completedAnnual('2026-06-10', '2026-06-10'));
    app.advance('2027-06-05', 'reload');
    app.del(id);
    invariant('FA3A.delete.stale-annual', 'Deleting the stale row in June 2027 leaves the 2026 completion active (orphaned)', [app.events(), app.activeEvents().map(e => e.id)], [[event], [event.id]]);
    ({ app, id, event } = completedAnnual('2026-03-10', '2026-06-10'));
    const nextDue = app.state().payments[0].date;
    app.advance('2027-04-10', 'reload');
    app.toggle(id);
    invariant('FA3A.annual.history-survives-next-due', 'Completed late (June 2026, due March, next due ' + nextDue + '): a tap in April 2027, after the next due date, leaves it active',
      [nextDue, app.events(), app.activeEvents().map(e => e.id)], ['2027-03-10', [event], [event.id]]);
  });
}

/** The same occurrence guard for monthly and one-off rows. */
function fa3aOccurrence() {
  scenario('FA-3A OCCURRENCE — monthly row paid for June, tapped in July', () => {
    const app = freshApp();
    const sched = monthlyHoliday(app);
    app.smartImport([{ name: 'Holiday monthly', amount: 100, date: '2026-06-03', link: 'goal:gH', mergeId: sched }]);
    const june = app.events();
    app.advance('2026-07-02', 'reload');
    const julyRow = app.state().payments.filter(p => p.id === sched)[0];
    app.at('2026-07-10'); app.toggle(sched);
    invariant('FA3A.monthly.history-survives-next-month-tap', 'Paid for June by Smart Import (no completion month, so rollover never resets it), tapped in July: the June completion stays active',
      [[julyRow.status, julyRow.lastPaidYM], app.events(), app.activeEvents().map(e => e.occurrenceYm)], [['paid', ''], june, ['2026-06']]);
  });

  scenario('FA-3A OCCURRENCE — one-off undo', () => {
    let app = freshApp(holidayOneOff);
    const c = app.events()[0];
    app.toggle('id1');
    invariant('FA3A.oneoff.undo', 'Undo reverses the one-off completion exactly once; nothing active',
      [evRows(app), app.activeEvents().length], [[evRow(c), ['reversal', 'id1', 'goal:gH', '2026-06', c.id, 'mark_completed']], 0]);
    app.toggle('id1'); app.toggle('id1');
    const ev = app.events();
    invariant('FA3A.oneoff.undo.again', 'Re-complete then undo again: each reversal targets the completion before it',
      [ev.map(e => e.eventType), ev[3].reversesEventId === ev[2].id, app.activeEvents().length], [['completion', 'reversal', 'completion', 'reversal'], true, 0]);
    app = freshApp(holidayOneOff);
    app.advance('2026-08-02', 'reload');
    app.toggle('id1');
    invariant('FA3A.oneoff.undo.later', 'Undo in August still reverses it: a one-off row keeps representing its only occurrence',
      [evRows(app).map(r => r[0] + ' ' + r[3]), app.activeEvents().length], [['completion 2026-06', 'reversal 2026-06'], 0]);
    app = freshApp(holidayOneOff);
    app.editPayment('id1', { date: '2026-07-02' });
    const redated = app.events();
    app.toggle('id1');
    invariant('FA3A.oneoff.undo.redated', 'Moving the paid one-off to 2 July records nothing; undo then reverses the June completion through its pointer',
      [redated.length, evRows(app).map(r => r[0] + ' ' + r[3]), app.activeEvents().length], [1, ['completion 2026-06', 'reversal 2026-06'], 0]);
    app = freshApp(holidayOneOff);
    app.advance('2026-08-02', 'reload');
    app.del('id1');
    invariant('FA3A.delete.oneoff-later', 'Deleting the completed one-off in August reverses its completion', evRows(app).map(r => r[0] + ' ' + r[r.length - 1]),
      ['completion mark_completed', 'reversal delete_payment']);
  });
}

// FA-3B: load seeds the completions legacy paid rows prove; nothing financial reads the ledger yet.

const FA3B_STEPS = [{ label: 'Catch up on Holiday', amount: 120 }, { label: 'Invest what remains', amount: 120 }];
/** A payment row as builds before the ledger stored it (paid one-off £250 for Holiday unless overridden). */
const legacyPay = (id, o) => Object.assign({ id, name: id, amount: 250, date: '2026-06-10', status: 'paid', rec: 'no', lastPaidYM: '', goalId: 'gH',
  investId: '', debtId: '', payKind: 'goal', createdAt: 1 }, o);
const legacyInvPay = (id, o) => legacyPay(id, Object.assign({ amount: 200, goalId: '', investId: 'iA', payKind: 'invest' }, o));
const legacyState = (goal, extra) => baseState(Object.assign({ incomeExplicitlySet: true, goals: [Object.assign(HOLIDAY(), goal)] }, extra));
const legacyInvState = (inv, extra) => baseState(Object.assign({ incomeExplicitlySet: true, investments: [Object.assign(ISA(), inv)] }, extra));
const EVENT_RELEASE = { id: 'r_event', sourceType: 'goal', sourceId: 'gH', amount: 200, reason: 'emergency', date: '2026-06-20', ym: '2026-06', relatedYm: '2026-06',
  remainingBalance: 800, createdAt: 1781949600000, confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' };
const LEGACY_RELEASE = { id: 'r_legacy', sourceType: 'goal', sourceId: 'gH', amount: 200, reason: 'manual', date: '2026-05-20', ym: '2026-05', createdAt: 1779271200000,
  confirmedByUser: true };
const PAYMENT_LOG = [{ ts: 1781517600000, type: 'payment', delta: 250, payKind: 'goal', goalId: 'gH', name: 'pm' },
  { ts: 1784109600000, type: 'payment', delta: 250, payKind: 'goal', goalId: 'gH', name: 'pm' }];

/** Loads a stored state in the Plan program; without seeding it is the legacy (pre-FA-3B) load. */
const fa3bLoad = (state, clock, seeding) => {
  const app = new App(state, clock, PROGRAM.plan);
  if (!seeding) app.run('geodeSeedLegacyContributionEvents = function () {};');
  app.setPlan(FA3B_STEPS);
  app.reload();
  return app;
};
/** Displayed figures, Monthly Left and rows, Plan detail, Home main action and Suggested Actions. */
const fa3bLook = app => ({ snap: app.snap(), plan: FA3B_STEPS.map(s => app.planView(s)), home: FA3B_STEPS.map(s => app.homeView(s)), suggestions: app.suggestions() });
/** [payment, entity, occurrence, amount, recurrence, dueDateSnapshot, source] */
const seededRows = app => app.events().map(e => [e.paymentId, e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount, e.recurrence, e.dueDateSnapshot, e.source]);
const pointedRows = app => { const ids = app.activeEvents().map(e => e.id); return app.state().payments.filter(p => ids.indexOf(p.contributionEventId) >= 0).map(p => p.id); };

/**
 * Legacy load (L) beside the seeded load (M), two reloads, repeated seeding, and the hypothetical event-authority
 * position (E) on the migrated state.
 */
function fa3bMigrate(state, clock, kind, entityId) {
  const legacy = fa3bLoad(state, clock, false);
  const app = fa3bLoad(state, clock, true);
  const shownIn = look => (kind === 'goal' ? look.snap.goal : look.snap.inv)[entityId];
  const L = fa3bLook(legacy), M = fa3bLook(app);
  const seeded = seededRows(app), events = app.events(), pointers = pointedRows(app), migrated = app.state();
  const authority = JSON.parse(app.run('__eventAuthority()'));
  const E = (kind === 'goal' ? authority.goal : authority.inv)[entityId];
  legacy.reload(); app.reload();
  const LR = fa3bLook(legacy), R1 = fa3bLook(app);
  app.render(); app.reload();
  const R2 = fa3bLook(app);
  app.run('geodeSeedLegacyContributionEvents(); geodeSeedLegacyContributionEvents();');
  return {
    seeded, pointers, E,
    shown: [shownIn(L), shownIn(M), shownIn(R1), shownIn(R2)],
    surfaces: same(L, M) && same(LR, R1),
    rows: same(withoutLedger(migrated), withoutLedger(legacy.state())),
    idempotent: same(app.events(), events) && same(app.state().payments, migrated.payments) && same(R1.snap, R2.snap),
    stored: kind === 'goal' ? state.goals[0].saved : state.investments[0].balance
  };
}

/**
 * [key, matrix id, stored state, clock, seeded [payment, occurrence, amount, recurrence, dueDateSnapshot], rows pointed at their
 *  seeded completion, legacy shown L, hypothetical event authority E, why E differs]
 */
const FA3B_GOALS = [
  ['base-only', 'G0 base £1,000 only', legacyState({}), '2026-08-10', [], [], 1000, 1000],
  ['one-off', 'G1 base £1,000 + paid one-off £250 due 10 June', legacyState({ saved: 1250 }, { payments: [legacyPay('p1')] }), '2026-08-10',
    [['p1', '2026-06', 250, 'one_off', '2026-06-10']], ['p1'], 1250, 1250],
  ['annual-safe', 'G2 base + annual £250 completed June 2026 (lastPaidYM 2026-06, due date already advanced to 10 June 2027)',
    legacyState({ saved: 1250 }, { payments: [legacyPay('pa', { rec: 'annual', lastPaidYM: '2026-06', date: '2027-06-10' })] }), '2026-08-10',
    [['pa', '2026-06', 250, 'annual', '']], ['pa'], 1250, 1250],
  ['monthly-current', 'G3 base + monthly £100 completed this month (lastPaidYM 2026-08, next due 15 September)',
    legacyState({ saved: 1100 }, { payments: [legacyPay('pm', { amount: 100, rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-15' })] }), '2026-08-20',
    [['pm', '2026-08', 100, 'monthly', '']], ['pm'], 1100, 1100],
  ['monthly-prior-unsynced', 'G4 base + monthly £250 completed in June and saved; Beynd next opened on 2 July',
    legacyState({ saved: 1250 }, { payments: [legacyPay('pm', { rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15' })] }), '2026-07-02',
    [['pm', '2026-06', 250, 'monthly', '']], [], 1000, 1250, 'D1: the legacy load resets the June row; event authority keeps the June £250 it rescued'],
  ['monthly-lost', 'G5 base + monthly £250 already reset at earlier rollovers (June and July survive only in the activity log)',
    legacyState({}, { payments: [legacyPay('pm', { rec: 'yes', status: 'upcoming', date: '2026-08-15' })], activityLog: PAYMENT_LOG }), '2026-08-05', [], [], 1000, 1000],
  ['release-event', 'G6 base £1,000 + event-derived release £200', legacyState({ saved: 800 }, { savingsReleases: [EVENT_RELEASE] }), '2026-08-10', [], [], 800, 800],
  ['release-base-delta', 'G7 legacy base-delta release £200 already inside baseSaved £800',
    legacyState({ saved: 800, baseSaved: 800 }, { savingsReleases: [LEGACY_RELEASE] }), '2026-08-10', [], [], 800, 800],
  ['oneoff-release', 'G8 base + paid one-off £250 + event-derived release £200',
    legacyState({ saved: 1050 }, { payments: [legacyPay('p1')], savingsReleases: [EVENT_RELEASE] }), '2026-08-10',
    [['p1', '2026-06', 250, 'one_off', '2026-06-10']], ['p1'], 1050, 1050],
  ['recurring-release', 'G9 base + monthly £250 completed this month + event-derived release £200',
    legacyState({ saved: 1050 }, { payments: [legacyPay('pm', { rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-15' })], savingsReleases: [EVENT_RELEASE] }),
    '2026-08-20', [['pm', '2026-08', 250, 'monthly', '']], ['pm'], 1050, 1050],
  ['deposit-base', 'G10 deposit £50 already folded into baseSaved £1,050', legacyState({ saved: 1050, baseSaved: 1050 },
    { activityLog: [{ ts: 1783418400000, type: 'goal', delta: 50, goalId: 'gH', goalName: 'Holiday' }] }), '2026-08-10', [], [], 1050, 1050],
  ['d3-residue', 'G11 old D3 edit wrote the shown £1,250 into baseSaved while the paid one-off £250 remains',
    legacyState({ saved: 1500, baseSaved: 1250 }, { payments: [legacyPay('p1')] }), '2026-08-10', [['p1', '2026-06', 250, 'one_off', '2026-06-10']], ['p1'], 1500, 1500],
  ['no-base', 'G12 goal stored without baseSaved (saved £1,250 already includes the paid one-off £250)',
    (() => { const s = legacyState({ saved: 1250 }, { payments: [legacyPay('p1')] }); delete s.goals[0].baseSaved; return s; })(), '2026-08-10',
    [['p1', '2026-06', 250, 'one_off', '2026-06-10']], ['p1'], 1500, 1500],
  ['monthly-ambiguous', 'GA base + monthly £100 paid by a Smart Import merge (no lastPaidYM; import date 3 June)',
    legacyState({ saved: 1100 }, { payments: [legacyPay('pm', { amount: 100, rec: 'yes', date: '2026-06-03' })] }), '2026-08-10', [], [], 1100, 1000,
    'ambiguous legacy history: legacy keeps counting the paid row forever; no occurrence month is recorded, so nothing is seeded'],
  ['annual-ambiguous', 'GB base + annual £250 completed, then form-edited (lastPaidYM lost; date is the advanced 10 June 2027)',
    legacyState({ saved: 1250 }, { payments: [legacyPay('pa', { rec: 'annual', date: '2027-06-10' })] }), '2026-08-10', [], [], 1250, 1000,
    'ambiguous legacy history: the stored date may be the completed occurrence or the next one'],
  ['annual-ambiguous-past', 'GC base + annual £250 saved as paid through the form (no lastPaidYM; date 10 June 2026) — same stored shape as GB',
    legacyState({ saved: 1250 }, { payments: [legacyPay('pa', { rec: 'annual', date: '2026-06-10' })] }), '2026-08-10', [], [], 1250, 1000,
    'ambiguous legacy history: indistinguishable from GB'],
  ['negative', 'GX base + paid one-off of −£50 (not a contribution; legacy subtracts it)',
    legacyState({ saved: 950 }, { payments: [legacyPay('pn', { amount: -50 })] }), '2026-08-10', [], [], 950, 1000,
    'other: a negative paid row is not a contribution event'],
  ['scope', 'GS paid one-off £250 linked to a deleted goal; paid debt and bill rows; upcoming and overdue Holiday one-offs', legacyState({}, {
    debts: [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 }],
    payments: [legacyPay('pg', { goalId: 'gGone' }), legacyPay('pd', { goalId: '', debtId: 'dC', payKind: 'debt' }), legacyPay('pb', { goalId: '', payKind: 'bill' }),
      legacyPay('pu', { status: 'upcoming', date: '2026-08-25' }), legacyPay('po', { status: 'overdue', date: '2026-08-01' })] }),
    '2026-08-10', [], [], 1000, 1000]
];

/** Investments stay capture-only: Balance keeps its legacy authority (D10 open). */
const FA3B_INVESTMENTS = [
  ['base-only', 'I0 ISA balance £5,000 only', legacyInvState({}), '2026-08-10', [], [], 5000, 5000],
  ['one-off', 'I1 ISA + paid one-off £500', legacyInvState({ balance: 5500 }, { payments: [legacyInvPay('i1', { amount: 500, date: '2026-06-05' })] }), '2026-08-10',
    [['i1', '2026-06', 500, 'one_off', '2026-06-05']], ['i1'], 5500, 5500],
  ['monthly-current', 'I2 ISA + monthly £200 completed this month', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('im', { rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-05' })] }), '2026-08-20', [['im', '2026-08', 200, 'monthly', '']], ['im'], 5200, 5200],
  ['monthly-prior-unsynced', 'I3 ISA + monthly £200 completed in June; next opened on 2 July', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('im', { rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-05' })] }), '2026-07-02', [['im', '2026-06', 200, 'monthly', '']], [], 5000, 5200,
    'D1: the legacy load resets the June row'],
  ['monthly-ambiguous', 'I4 ISA + monthly £200 paid with no lastPaidYM', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('im', { rec: 'yes', date: '2026-06-05' })] }), '2026-08-10', [], [], 5200, 5000, 'ambiguous legacy history'],
  ['annual-safe', 'I5 ISA + annual £200 completed June 2026 (lastPaidYM 2026-06)', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('ia', { rec: 'annual', lastPaidYM: '2026-06', date: '2027-06-05' })] }), '2026-08-10', [['ia', '2026-06', 200, 'annual', '']], ['ia'], 5200, 5200],
  ['annual-ambiguous', 'I6 ISA + annual £200 paid with no lastPaidYM', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('ia', { rec: 'annual', date: '2027-06-05' })] }), '2026-08-10', [], [], 5200, 5000, 'ambiguous legacy history']
];

function fa3bMatrix() {
  [['goal', 'gH', FA3B_GOALS], ['investment', 'iA', FA3B_INVESTMENTS]].forEach(([kind, entityId, cases]) => cases.forEach(c => {
    const [key, name, state, clock, seeded, pointers, shown, hypothetical, why] = c;
    const prefix = kind === 'goal' ? 'FA3B.goal.' : 'FA3B.inv.';
    scenario('FA-3B MIGRATION — ' + name, () => {
      const r = fa3bMigrate(state, clock, kind, entityId);
      const entity = kind === 'goal' ? 'goal:' + entityId : 'investment:' + entityId;
      invariant(prefix + key, 'Seeds ' + (seeded.length ? seeded.map(s => s[0] + ' ' + s[1] + ' £' + s[2]).join(', ') : 'nothing') +
        '; shown ' + show(shown) + ' before migration, after it and after two reloads (stored ' + show(r.stored) + '); every surface identical to the legacy load; rows unchanged except the pointer; idempotent',
        { seeded: r.seeded, pointers: r.pointers, shown: r.shown, surfaces: r.surfaces, rows: r.rows, idempotent: r.idempotent },
        { seeded: seeded.map(s => [s[0], entity].concat(s.slice(1), ['migration'])), pointers, shown: [shown, shown, shown, shown], surfaces: true, rows: true, idempotent: true });
      const text = 'L legacy ' + show(shown) + ' / M after migration ' + show(r.shown[1]) + ' / E event authority ' + show(r.E);
      const prefixA = kind === 'goal' ? 'FA3B.authority.' : 'FA3B.authority.inv.';
      if (shown === hypothetical) invariant(prefixA + key, text + ' — identical', [r.shown[0], r.shown[1], r.E], [shown, shown, hypothetical]);
      else current(prefixA + key, text + ' — ' + why, [r.shown[0], r.shown[1], r.E], [shown, shown, hypothetical]);
    });
  }));
}

function fa3bOrder() {
  scenario('FA-3B ORDER — migration runs after normalisation and before syncRecurringPayments', () => {
    const load = PROGRAM.structural.load;
    const at = ['geodeNormalizeContributionEvents(S);', 'geodeSeedLegacyContributionEvents();', 'syncRecurringPayments();'].map(c => load.indexOf(c));
    const app = new App(legacyState({ saved: 1250 }, { payments: [legacyPay('pm', { rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15' })] }), '2026-07-02');
    app.reload();
    const row = app.state().payments[0];
    const june = app.events();
    app.render(); app.reload(); app.advance('2026-08-02', 'reload');
    invariant('FA3B.order.before-sync', 'load() seeds between normalisation and the first rollover; June paid row opened in July: its June £250 is seeded by migration (not left to the rollover safety net), stays active through August; the row is then reset with no pointer',
      [at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1])), seededRows(app), app.activeEvents().map(e => e.id), same(app.events(), june), [row.status, row.lastPaidYM, 'contributionEventId' in row]],
      [true, [['pm', 'goal:gH', '2026-06', 250, 'monthly', '', 'migration']], [june[0].id], true, ['upcoming', '', false]]);
  });
}

function fa3bPointers() {
  const G1 = FA3B_GOALS[1], G2 = FA3B_GOALS[2], G3 = FA3B_GOALS[3];
  const loaded = (c, clock) => { const app = new App(c[2], clock || c[3]); app.reload(); return { app, seeded: app.events()[0] }; };
  const tail = (app, n) => evRows(app).slice(n);
  scenario('FA-3B POINTER — a migrated completion behaves like a native one while the row still represents its occurrence', () => {
    const after = (c, act) => { const { app, seeded } = loaded(c); act(app); return { app, seeded }; };
    let { app, seeded } = after(G1, a => a.toggle('p1'));
    const oneOff = [tail(app, 1), [seeded.id, app.activeEvents().length, app.pointer('p1'), app.snap().goal.gH]];
    ({ app, seeded } = after(G3, a => a.toggle('pm')));
    invariant('FA3B.pointer.undo', 'Undo reverses the migrated completion: one-off and this month\'s monthly row; nothing active; pointer removed; Holiday £1,000',
      [oneOff, [tail(app, 1), [seeded.id, app.activeEvents().length, app.pointer('pm'), app.snap().goal.gH]]],
      [[[['reversal', 'p1', 'goal:gH', '2026-06', oneOff[1][0], 'mark_completed']], [oneOff[1][0], 0, null, 1000]],
        [[['reversal', 'pm', 'goal:gH', '2026-08', seeded.id, 'mark_completed']], [seeded.id, 0, null, 1000]]]);

    ({ app, seeded } = after(G3, a => a.editPayment('pm', { amount: 150 })));
    const monthly = [tail(app, 1), app.pointer('pm') === app.events()[2].id, seeded.id];
    ({ app, seeded } = after(G2, a => { a.at('2026-09-01'); a.editPayment('pa', { amount: 300 }); }));
    invariant('FA3B.pointer.edit', 'A paid edit reverses the migrated completion and records the new amount for the same occurrence: monthly £150 (August), annual £300 in September (2026-06)',
      [monthly, tail(app, 1)],
      [[[['reversal', 'pm', 'goal:gH', '2026-08', monthly[2], 'payment_form'], ['completion', 'pm', 'goal:gH', '2026-08', 150, 'monthly', 'payment_form']], true, monthly[2]],
        [['reversal', 'pa', 'goal:gH', '2026-06', seeded.id, 'payment_form'], ['completion', 'pa', 'goal:gH', '2026-06', 300, 'annual', 'payment_form']]]);

    ({ app, seeded } = after(G1, a => a.del('p1')));
    const deleted = [tail(app, 1), app.activeEvents().length, seeded.id];
    ({ app, seeded } = after(G2, a => { a.advance('2027-06-05', 'reload'); a.del('pa'); }));
    invariant('FA3B.pointer.delete', 'Deleting the migrated one-off reverses it; deleting the annual row in June 2027 (stale) leaves the 2026 completion active',
      [deleted, [app.events(), app.activeEvents().map(e => e.id)]],
      [[[['reversal', 'p1', 'goal:gH', '2026-06', deleted[2], 'delete_payment']], 0, deleted[2]], [[seeded], [seeded.id]]]);

    const rolled = MODES.map(mode => {
      ({ app, seeded } = loaded(G3));
      app.advance('2026-09-02', mode);
      const row = app.state().payments[0];
      app.render(); app.reload();
      return [app.events(), [row.status, 'contributionEventId' in row], app.snap().goal.gH];
    });
    invariant('FA3B.pointer.rollover', 'September rollover (session and reload): the migrated August completion survives unchanged and undoubled; the row resets and drops its pointer; Holiday shows the legacy £1,000 (D1 open)',
      rolled.map(r => [r[0].length, r[0][0].source, r[1], r[2]]), MODES.map(() => [1, 'migration', ['upcoming', false], 1000]));

    ({ app, seeded } = loaded(G2));
    const pointed = app.pointer('pa') === seeded.id;
    app.advance('2027-06-05', 'reload');
    app.at('2027-06-10'); app.toggle('pa');
    const late = loaded(G2, '2027-07-01');
    invariant('FA3B.pointer.annual', 'Annual: the migrated 2026 completion is pointed at in 2026; a tap in June 2027 leaves it active (no reversal, no 2027 event); the same row first opened in July 2027 is seeded for 2026 without a pointer',
      [pointed, app.events(), app.activeEvents().map(e => e.id), seededRows(late.app), late.app.pointer('pa')],
      [true, [seeded], [seeded.id], [['pa', 'goal:gH', '2026-06', 250, 'annual', '', 'migration']], null]);
  });
}

function fa3bParity() {
  /** [type, payment, entity, occurrence, amount | reversed position, recurrence] — provenance (id, time, source) left out. */
  const shape = app => { const ev = app.events(); return ev.map(e => [e.eventType, e.paymentId, e.entityType + ':' + e.entityId, e.occurrenceYm,
    e.eventType === 'completion' ? e.amount : ev.findIndex(x => x.id === e.reversesEventId), e.recurrence || '']); };
  const look = app => [shape(app), app.activeEvents().length, !!app.pointer('id1'), app.snap().goal.gH];
  const ACTIONS = [
    ['undo', app => app.toggle('id1')],
    ['undo-recomplete', app => { app.toggle('id1'); app.toggle('id1'); }],
    ['paid-edit', app => app.editPayment('id1', { amount: 300 })],
    ['delete', app => app.del('id1')],
    ['rollover', app => { app.advance('2026-07-02', 'session'); app.reload(); app.advance('2026-08-02', 'reload'); }],
    ['backup-restore', app => { const restored = app.restorable(app.backup()); app.run('S = ' + JSON.stringify(restored.state) + '; save();'); app.reload(); }]
  ];
  scenario('FA-3B PARITY — native FA-3A completion vs migrated completion of the same row', () => {
    const out = [['one-off', holidayOneOff], ['monthly', holidayMonthly]].map(([label, setup]) => {
      const native = () => freshApp(setup);
      const migrated = () => { const a = new App(withoutLedger(native().state()), '2026-06-10'); a.reload(); return a; };
      const n = native().events()[0], m = migrated().events()[0];
      const fields = e => [e.paymentId, e.entityType, e.entityId, e.occurrenceYm, e.amount, e.recurrence];
      const differ = COMPLETION_KEYS.filter(k => k !== 'id' && k !== 'recordedAt' && !same(n[k], m[k]));
      return [label, same(fields(n), fields(m)), differ, ACTIONS.filter(([, act]) => {
        const a = native(), b = migrated();
        act(a); act(b);
        return !same(look(a), look(b));
      }).map(x => x[0])];
    });
    invariant('FA3B.parity.native-migrated', 'Same payment, goal, occurrence, amount and recurrence; undo, re-complete, paid edit, delete, rollover and backup/restore give identical ledgers, active sets, pointers and Holiday; only provenance differs (source; and for a monthly row the pre-advance due date, which migration cannot see)',
      out, [['one-off', true, ['source'], []], ['monthly', true, ['dueDateSnapshot', 'source'], []]]);

    const covered = setup => { const a = freshApp(setup); const before = a.events(); a.reload(); a.reload(); return same(a.events(), before) && before.length > 0; };
    const importedThenResaved = a => {
      const sched = monthlyHoliday(a);
      a.smartImport([{ name: 'Holiday monthly', amount: 100, date: '2026-06-03', link: 'goal:gH', mergeId: sched }]);
      a.advance('2026-07-02', 'reload');
      a.at('2026-07-10'); a.editPayment(sched, { name: 'Holiday monthly (renamed)' });
    };
    invariant('FA3B.native.covered', 'Payments the ledger has seen seed nothing on load: monthly completed this month; one-off moved to July after completion; the same with its pointer lost; a June Smart Import merge re-saved through the form in July (lastPaidYM rewritten to July, no July payment)',
      [covered(holidayMonthly), covered(a => { holidayOneOff(a); a.editPayment('id1', { date: '2026-07-02' }); }),
        covered(a => { holidayOneOff(a); a.editPayment('id1', { date: '2026-07-02' }); a.run('delete S.payments[0].contributionEventId; save();'); }),
        covered(importedThenResaved)], [true, true, true, true]);
  });
}

function fa3bLifecycle() {
  const MIXED = legacyState({ saved: 1700 }, { investments: [Object.assign(ISA(), { balance: 5700 })], payments: [legacyPay('p1'),
    legacyPay('pm', { amount: 100, rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-15' }), legacyPay('pa', { rec: 'annual', lastPaidYM: '2026-06', date: '2027-06-10' }),
    legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' }), legacyInvPay('i1', { amount: 500, date: '2026-06-05' }), legacyInvPay('ia', { rec: 'annual', date: '2027-06-05' })] });
  const MIXED_SEEDED = [['p1', 'goal:gH', '2026-06', 250, 'one_off', '2026-06-10', 'migration'], ['pm', 'goal:gH', '2026-08', 100, 'monthly', '', 'migration'],
    ['pa', 'goal:gH', '2026-06', 250, 'annual', '', 'migration'], ['i1', 'investment:iA', '2026-06', 500, 'one_off', '2026-06-05', 'migration']];
  const view = app => [app.events(), app.activeEvents().length, app.snap()];
  scenario('FA-3B IDEMPOTENCY AND RELOAD — one-off, monthly, annual, ISA and ambiguous rows together', () => {
    const app = new App(MIXED, '2026-08-20');
    app.reload();
    const first = view(app), rows = app.state().payments;
    app.reload(); app.reload(); app.render(); app.render(); app.reload();
    app.run('geodeSeedLegacyContributionEvents(); geodeSeedLegacyContributionEvents(); geodeSeedLegacyContributionEvents();');
    invariant('FA3B.idempotent', 'Seeds four completions (ambiguous monthly and annual rows none); four more loads, two renders and three direct runs add nothing and change no row or display; Holiday £1,700, ISA £5,700',
      [seededRows(app), same(view(app), first), same(app.state().payments, rows), [first[2].goal.gH, first[2].inv.iA]], [MIXED_SEEDED, true, true, [1700, 5700]]);
    const path = steps => { const a = new App(MIXED, '2026-08-20'); steps(a); return view(a); };
    const once = path(a => a.reload());
    invariant('FA3B.reload', 'Load once, load-render-load-load and load-load-load give identical ledgers, active sets and displays (rendering before a reload changes nothing)',
      [same(path(a => { a.reload(); a.render(); a.reload(); a.reload(); }), once), same(path(a => { a.reload(); a.reload(); a.reload(); }), once)], [true, true]);
  });

  scenario('FA-3B BACKUP — legacy, native, migrated and ambiguous backups restore without duplicates or invention', () => {
    const restoreLoad = (env, clock) => { const r = new App({}, clock).restorable(env); const a = new App(r.state, clock); a.reload(); return { r, a }; };
    const legacyEnv = new App(MIXED, '2026-08-20').backup();
    const legacy = restoreLoad(legacyEnv, '2026-08-20');
    invariant('FA3B.backup.legacy', 'A legacy backup (no contributionEvents) restores; the load seeds only the four completions its rows prove; Holiday £1,700, ISA £5,700',
      ['contributionEvents' in legacyEnv.data, legacy.r.ok, seededRows(legacy.a), legacy.a.snap().goal.gH, legacy.a.snap().inv.iA], [false, true, MIXED_SEEDED, 1700, 5700]);
    const native = freshApp(a => { holidayOneOff(a); a.at('2026-06-20'); });
    const nativeBack = restoreLoad(native.backup(), '2026-06-20');
    invariant('FA3B.backup.native', 'A backup holding a native completion restores and loads with exactly that ledger (no migration copy)',
      [nativeBack.a.events(), nativeBack.a.pointer('id1')], [native.events(), native.events()[0].id]);
    const migrated = new App(MIXED, '2026-08-20');
    migrated.reload();
    const migratedBack = restoreLoad(migrated.backup(), '2026-08-20');
    migratedBack.a.reload();
    invariant('FA3B.backup.migrated', 'A backup holding migrated completions restores, loads and reloads with exactly that ledger and those pointers',
      [migratedBack.a.events(), migratedBack.a.state().payments.map(p => p.contributionEventId || null)],
      [migrated.events(), migrated.state().payments.map(p => p.contributionEventId || null)]);
    const ambiguous = legacyState({ saved: 1350 }, { payments: [legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' }), legacyPay('pa', { rec: 'annual', date: '2027-06-10' })] });
    const ambiguousBack = restoreLoad(new App(ambiguous, '2026-08-10').backup(), '2026-08-10');
    invariant('FA3B.backup.ambiguous', 'A legacy backup with only ambiguous paid rows restores with no invented event; Holiday stays £1,350; schema stays 1',
      [ambiguousBack.a.events(), ambiguousBack.a.snap().goal.gH, ambiguousBack.a.run('GEODE_SCHEMA_VERSION')], [[], 1350, 1]);
  });

  scenario('FA-3B OBSERVATIONAL — a migrated state with £5,000 fake completions shows exactly what it showed', () => {
    const app = fa3bLoad(MIXED, '2026-08-20', true);
    const s = app.state();
    const fake = (id, paymentId, entityType, entityId) => ({ id, eventType: 'completion', paymentId, entityType, entityId, occurrenceYm: '2026-08', amount: 5000,
      recurrence: 'one_off', dueDateSnapshot: '', recordedAt: 1, source: 'fake' });
    const faked = JSON.parse(JSON.stringify(s));
    faked.contributionEvents = faked.contributionEvents.concat([fake('fake-goal', 'p1-ghost', 'goal', 'gH'), fake('fake-inv', 'i1-ghost', 'investment', 'iA'),
      fake('fake-row', 'px', 'goal', 'gH')]);
    const surfaces = state => { const a = fa3bLoad(state, '2026-08-20', true); const direct = fa3bLook(a); a.reload(); return [direct, fa3bLook(a)]; };
    const real = surfaces(s), withFake = surfaces(faked);
    invariant('FA3B.observational.fake-event', 'Three active £5,000 completions (Holiday, ISA, the ambiguous row) change nothing: Holiday £1,700, ISA £5,700; Monthly Left, Plan, Home and Suggested Actions identical before and after reload',
      [same(real, withFake), real[0].snap.goal.gH, real[0].snap.inv.iA], [true, 1700, 5700]);
  });
}

// FA-3C-A: payment-level legacy carries and the schema-2 goal authority, simulated on copies; nothing financial reads either yet.

const FA3CA_AT = 1790000000000;
/** Schema-2 simulation on a copy of the loaded state: transition carries created at createdAt (null: none created). */
const schema2 = (app, createdAt) => JSON.parse(app.run('__schema2(' + JSON.stringify(createdAt === undefined ? FA3CA_AT : createdAt) + ')'));
/** [payment, entity, kind, amount, recurrence, dueDateSnapshot, source] */
const carryRows = list => list.filter(c => c.kind !== 'resolution').map(c => [c.paymentId, c.entityType + ':' + c.entityId, c.kind, c.amount, c.recurrence, c.dueDateSnapshot, c.source]);
/** [carry, entity, amount] */
const activeCarryRows = list => list.map(c => [c.carryId, c.entityType + ':' + c.entityId, c.amount]);
const CARRY = (id, paymentId, o) => Object.assign({ id, paymentId, entityType: 'goal', entityId: 'gH', kind: 'undated_contribution', amount: 250,
  recurrence: 'monthly', dueDateSnapshot: '2026-06-03', createdAt: FA3CA_AT, source: 'schema2_transition' }, o);
const NEG_CARRY = (id, paymentId, o) => CARRY(id, paymentId, Object.assign({ kind: 'legacy_negative_effect', amount: -50, recurrence: 'one_off', dueDateSnapshot: '2026-06-10' }, o));
const RESOLUTION = (id, carryId, reason, o) => Object.assign({ id, kind: 'resolution', carryId, reason, recordedAt: FA3CA_AT + 1000, source: 'test' }, o);
const CAR = () => ({ id: 'gB', name: 'Car', amount: 3000, saved: 500, baseSaved: 500, monthly: 0, cat: 'other' });
/** The production carry ledger applied to a list. */
const carryLedger = (app, list) => { app.ctx.__argsJson = JSON.stringify([list]); return JSON.parse(app.run('JSON.stringify(geodeContributionCarryLedger.apply(null, JSON.parse(__argsJson)))')); };
/**
 * Holiday: dated one-off £250, ambiguous monthly £100 (GA), ambiguous annual £250 (GB), negative −£50 (GX), event-derived release £200;
 * Car: ambiguous monthly £40; ISA: ambiguous monthly £200; a paid one-off linked to a deleted goal.
 */
const CARRY_MIX = legacyState({}, {
  goals: [Object.assign(HOLIDAY(), { saved: 1350 }), Object.assign(CAR(), { saved: 540 })], investments: [Object.assign(ISA(), { balance: 5200 })],
  payments: [legacyPay('p1'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' }), legacyPay('pa', { rec: 'annual', date: '2027-06-10' }),
    legacyPay('pn', { amount: -50 }), legacyPay('pb', { amount: 40, rec: 'yes', date: '2026-06-04', goalId: 'gB' }),
    legacyInvPay('im', { rec: 'yes', date: '2026-06-05' }), legacyPay('pg', { goalId: 'gGone' })],
  savingsReleases: [EVENT_RELEASE] });
const CARRY_MIX_CARRIES = [['px', 'goal:gH', 'undated_contribution', 100, 'monthly', '2026-06-03', 'schema2_transition'],
  ['pa', 'goal:gH', 'undated_contribution', 250, 'annual', '2027-06-10', 'schema2_transition'],
  ['pn', 'goal:gH', 'legacy_negative_effect', -50, 'one_off', '2026-06-10', 'schema2_transition'],
  ['pb', 'goal:gB', 'undated_contribution', 40, 'monthly', '2026-06-04', 'schema2_transition']];

function fa3caNormalise() {
  scenario('FA-3C-A CARRY NORMALISATION — invalid, duplicate and malformed records cannot count', () => {
    const app = new App(baseState(), '2026-08-10');
    const C1 = CARRY('c1', 'pA'), N1 = NEG_CARRY('n1', 'pN'), R1 = RESOLUTION('r1', 'c1', 'amended', { amount: 200 });
    const loadWith = value => { const a = new App(Object.assign(baseState(), { contributionCarry: value }), '2026-08-10'); a.reload(); return a.state().contributionCarry; };
    invariant('FA3CA.normalise.collection', 'Missing, null, object, text and number collections load as []; a valid collection (positive carry, negative effect, resolution) loads unchanged, signs kept',
      [loadWith(undefined), loadWith(null), loadWith({ c1: C1 }), loadWith('[]'), loadWith(5), loadWith([C1, N1, R1]), activeCarryRows(carryLedger(app, [C1, N1]).active)],
      [[], [], [], [], [], [C1, N1, R1], [['c1', 'goal:gH', 250], ['n1', 'goal:gH', -50]]]);

    const INVALID = [['no id', CARRY('', 'pB')], ['no payment', CARRY('x1', '')], ['payment not text', CARRY('x2', 7)],
      ['debt entity', CARRY('x3', 'pC', { entityType: 'debt' })], ['no entity id', CARRY('x4', 'pD', { entityId: '' })],
      ['unknown kind', CARRY('x5', 'pE', { kind: 'contribution' })], ['zero', CARRY('x6', 'pF', { amount: 0 })],
      ['negative undated_contribution', CARRY('x7', 'pG', { amount: -10 })], ['positive legacy_negative_effect', NEG_CARRY('x8', 'pH', { amount: 10 })],
      ['amount as text', CARRY('x9', 'pI', { amount: '250' })], ['amount missing', CARRY('x10', 'pJ', { amount: null })],
      ['unknown recurrence', CARRY('x11', 'pK', { recurrence: 'weekly' })], ['no createdAt', CARRY('x12', 'pL', { createdAt: undefined })],
      ['due date not text', CARRY('x13', 'pM', { dueDateSnapshot: null })], ['other source', CARRY('x14', 'pO', { source: 'mark_completed' })],
      ['names an occurrenceYm', CARRY('x15', 'pP', { occurrenceYm: '2026-06' })], ['array', [CARRY('x16', 'pQ')]], ['null', null], ['text', 'carry']];
    invariant('FA3CA.normalise.invalid', 'Dropped: ' + INVALID.map(x => x[0]).join(', ') + '; the valid carry survives',
      carryLedger(app, [C1].concat(INVALID.map(x => x[1]))).kept.map(c => c.id), ['c1']);

    const later = CARRY('c1b', 'pA', { createdAt: FA3CA_AT + 5, amount: 999 });
    const dup = carryLedger(app, [later, CARRY('c1z', 'pA', { amount: 999 }), C1, CARRY('c1', 'pZ', { amount: 999 })]);
    invariant('FA3CA.normalise.duplicates', 'Duplicate id: the first record wins; more carries for one payment: the earliest (createdAt, then id) wins whatever the array order — £250 active once',
      [dup.kept.map(c => c.id + ' £' + c.amount), activeCarryRows(dup.active)], [['c1 £250'], [['c1', 'goal:gH', 250]]]);

    const BAD = [['unknown carry', RESOLUTION('q1', 'nope', 'reversed')], ['unknown reason', RESOLUTION('q2', 'c1', 'deleted')],
      ['amended to 0', RESOLUTION('q3', 'c1', 'amended', { amount: 0 })], ['amended across sign', RESOLUTION('q4', 'c1', 'amended', { amount: -20 })],
      ['moved to a debt', RESOLUTION('q5', 'c1', 'moved', { entityType: 'debt', entityId: 'dC' })], ['dated without an event', RESOLUTION('q6', 'c1', 'dated')],
      ['no recordedAt', RESOLUTION('q7', 'c1', 'reversed', { recordedAt: undefined })], ['resolves a dropped duplicate carry', RESOLUTION('q8', 'c1b', 'reversed')],
      ['shares the carry id', RESOLUTION('c1', 'c1', 'reversed')]];
    const res = carryLedger(app, [C1, later].concat(BAD.map(x => x[1])));
    const dupRes = carryLedger(app, [C1, R1, RESOLUTION('r1', 'c1', 'reversed')]);
    invariant('FA3CA.normalise.resolution', 'Resolutions dropped: ' + BAD.map(x => x[0]).join(', ') + ' — £250 stays active; a duplicate resolution id applies once (the first: amended to £200)',
      [res.kept.map(r => r.id), activeCarryRows(res.active), dupRes.kept.map(r => r.id + ':' + (r.reason || r.kind)), activeCarryRows(dupRes.active)],
      [['c1'], [['c1', 'goal:gH', 250]], ['c1:undated_contribution', 'r1:amended'], [['c1', 'goal:gH', 200]]]);

    const full = [C1, N1, CARRY('c2', 'pB', { entityId: 'gB' }), RESOLUTION('r1', 'c1', 'amended', { amount: 200, recordedAt: FA3CA_AT + 1 }),
      RESOLUTION('r2', 'c1', 'amended', { amount: 180, recordedAt: FA3CA_AT + 2 }), RESOLUTION('r3', 'c2', 'moved', { entityType: 'goal', entityId: 'gH', recordedAt: FA3CA_AT + 1 }), later];
    const orders = [full, full.slice().reverse(), [full[3], full[6], full[0], full[5], full[1], full[4], full[2]]];
    const actives = orders.map(o => activeCarryRows(carryLedger(app, o).active).sort((a, b) => a[0].localeCompare(b[0])));
    invariant('FA3CA.normalise.deterministic', 'Three array orders of the same records give the same active carries',
      actives, orders.map(() => [['c1', 'goal:gH', 180], ['c2', 'goal:gH', 250], ['n1', 'goal:gH', -50]]));
  });

  scenario('FA-3C-A ACTIVE CARRY — resolution semantics (pure model; no action is wired)', () => {
    const app = new App(baseState(), '2026-08-10');
    const C1 = CARRY('c1', 'pA'), N1 = NEG_CARRY('n1', 'pN');
    const act = list => activeCarryRows(carryLedger(app, list).active);
    invariant('FA3CA.active.unresolved', 'Unresolved undated_contribution £250 → +£250; unresolved legacy_negative_effect −£50 → −£50',
      act([C1, N1]), [['c1', 'goal:gH', 250], ['n1', 'goal:gH', -50]]);
    invariant('FA3CA.active.resolutions', 'reversed → inactive; amended £250 → £200 → one active £200; moved Holiday → Car → one active on Car; dated → inactive (the dated completion owns the amount); nothing applies after reversed; amendments apply in recordedAt order whatever the array order; a negative effect amends to −£30',
      [act([C1, RESOLUTION('a', 'c1', 'reversed')]), act([C1, RESOLUTION('a', 'c1', 'amended', { amount: 200 })]),
        act([C1, RESOLUTION('a', 'c1', 'moved', { entityType: 'goal', entityId: 'gB' })]), act([C1, RESOLUTION('a', 'c1', 'dated', { eventId: 'cev_x' })]),
        act([C1, RESOLUTION('a', 'c1', 'reversed', { recordedAt: FA3CA_AT + 1 }), RESOLUTION('b', 'c1', 'amended', { amount: 200, recordedAt: FA3CA_AT + 2 })]),
        act([C1, RESOLUTION('a', 'c1', 'amended', { amount: 180, recordedAt: FA3CA_AT + 3 }), RESOLUTION('b', 'c1', 'amended', { amount: 200, recordedAt: FA3CA_AT + 2 })]),
        act([N1, RESOLUTION('a', 'n1', 'amended', { amount: -30 })])],
      [[], [['c1', 'goal:gH', 200]], [['c1', 'goal:gB', 250]], [], [], [['c1', 'goal:gH', 180]], [['n1', 'goal:gH', -30]]]);
  });
}

/** Transition carries per FA-3B goal fixture (none for the others). */
const FA3CA_CARRIES = {
  'monthly-ambiguous': [['pm', 'goal:gH', 'undated_contribution', 100, 'monthly', '2026-06-03', 'schema2_transition']],
  'annual-ambiguous': [['pa', 'goal:gH', 'undated_contribution', 250, 'annual', '2027-06-10', 'schema2_transition']],
  'annual-ambiguous-past': [['pa', 'goal:gH', 'undated_contribution', 250, 'annual', '2026-06-10', 'schema2_transition']],
  'negative': [['pn', 'goal:gH', 'legacy_negative_effect', -50, 'one_off', '2026-06-10', 'schema2_transition']]
};
/** [base, dated, carry, released] per goal fixture. */
const FA3CA_PARTS = { 'base-only': [1000, 0, 0, 0], 'one-off': [1000, 250, 0, 0], 'annual-safe': [1000, 250, 0, 0], 'monthly-current': [1000, 100, 0, 0],
  'monthly-prior-unsynced': [1000, 250, 0, 0], 'monthly-lost': [1000, 0, 0, 0], 'release-event': [1000, 0, 0, 200], 'release-base-delta': [800, 0, 0, 0],
  'oneoff-release': [1000, 250, 0, 200], 'recurring-release': [1000, 250, 0, 200], 'deposit-base': [1050, 0, 0, 0], 'd3-residue': [1250, 250, 0, 0],
  'no-base': [1250, 250, 0, 0], 'monthly-ambiguous': [1000, 0, 100, 0], 'annual-ambiguous': [1000, 0, 250, 0], 'annual-ambiguous-past': [1000, 0, 250, 0],
  'negative': [1000, 0, -50, 0], 'scope': [1000, 0, 0, 0] };
const FA3CA_CLASS = {
  'monthly-prior-unsynced': 'CORRECTNESS RESTORATION (D1): the dated June completion alone restores £250; no carry, no residual',
  'monthly-lost': 'NO HISTORICAL EVIDENCE: no event, no carry (the activity log is not evidence)',
  'monthly-ambiguous': 'KNOWN AMOUNT, UNKNOWN OCCURRENCE: undated_contribution carry, no occurrence month',
  'annual-ambiguous': 'KNOWN AMOUNT, UNKNOWN OCCURRENCE: undated_contribution carry, no occurrence month',
  'annual-ambiguous-past': 'KNOWN AMOUNT, UNKNOWN OCCURRENCE: undated_contribution carry, no occurrence month',
  'negative': 'SIGNED LEGACY EFFECT: legacy_negative_effect carry; no event, no release',
  'release-base-delta': 'IDENTICAL: the legacy base-delta release stays inside baseSaved',
  'd3-residue': 'IDENTICAL: possible old D3 residue kept as stored (base and dated completion, no carry)',
  'no-base': 'IDENTICAL after the pre-existing load normalisation (stored £1,250 without baseSaved → base £1,250 + dated £250)',
  'scope': 'IDENTICAL: the row of a deleted goal, debt and bill rows, upcoming and overdue rows carry nothing'
};

function fa3caMatrix() {
  const mismatches = [];
  FA3B_GOALS.forEach(c => {
    const [key, name, state, clock, , , shown] = c;
    scenario('FA-3C-A AUTHORITY SIMULATION — ' + name, () => {
      const app = fa3bLoad(state, clock, true);
      const sim = schema2(app), again = schema2(app);
      const g = sim.goals.gH, p = g.parts;
      const dated = app.activeEvents().map(e => e.paymentId);
      const simulated = key === 'monthly-prior-unsynced' ? 1250 : shown;
      const parts = FA3CA_PARTS[key];
      if (round(g.shown) !== round(g.legacy)) mismatches.push([key, round(g.legacy), round(g.shown)]);
      invariant('FA3CA.goal.' + key, 'legacy ' + show(shown) + '; base ' + show(parts[0]) + ' + dated ' + show(parts[1]) + ' + carry ' + show(parts[2]) +
        ' − released ' + show(parts[3]) + ' = simulated ' + show(simulated) + ' — ' + (FA3CA_CLASS[key] || 'IDENTICAL') +
        '; ordinary load stores no carry; no payment both dated and carried; repeat identical; releases untouched',
        { legacy: g.legacy, parts: [p.base, p.dated, p.carry, p.released], simulated: g.shown, carries: carryRows(sim.created), stored: app.state().contributionCarry,
          both: sim.created.filter(x => dated.indexOf(x.paymentId) >= 0).length, repeat: same(again, sim), releases: app.state().savingsReleases.length },
        { legacy: shown, parts, simulated, carries: FA3CA_CARRIES[key] || [], stored: [], both: 0, repeat: true, releases: state.savingsReleases.length });
    });
  });
  scenario('FA-3C-A AUTHORITY SIMULATION — the full goal matrix', () => {
    invariant('FA3CA.goal.mismatch-explained', 'Simulated authority equals the legacy display for every goal fixture except G4, the intended D1 restoration (£1,000 → £1,250)',
      mismatches, [['monthly-prior-unsynced', 1000, 1250]]);
  });

  scenario('FA-3C-A RELEASE CLAMP — a release larger than the position clamps at £0 exactly as the recompute does', () => {
    const app = fa3bLoad(legacyState({ saved: 0, baseSaved: 100 }, { payments: [legacyPay('px', { amount: 50, rec: 'yes', date: '2026-06-03' })], savingsReleases: [EVENT_RELEASE] }), '2026-08-10', true);
    const sim = schema2(app);
    invariant('FA3CA.release.clamp', 'Base £100 + ambiguous monthly £50 (carry) − event-derived release £200: legacy £0, simulated £0 (clamped, not −£50)',
      [app.snap().goal.gH, sim.goals.gH.parts, sim.goals.gH.shown], [0, { base: 100, dated: 0, carry: 50, released: 200 }, 0]);
  });

  scenario('FA-3C-A G4 — June close, first July load, schema-2 simulation', () => {
    const G4 = FA3B_GOALS.filter(c => c[0] === 'monthly-prior-unsynced')[0];
    const app = new App(G4[2], '2026-06-30');
    app.reload();
    const june = app.snap().goal.gH;
    app.advance('2026-07-02', 'reload');
    const sim = schema2(app);
    invariant('FA3CA.g4.restoration', 'June close £1,250; first July load (FA-3B seed, then legacy sync) £1,000; simulated £1,250 from the dated June completion alone — CORRECTNESS RESTORATION, no carry, no residual',
      [june, app.snap().goal.gH, seededRows(app), sim.created, sim.goals.gH.parts, sim.goals.gH.shown],
      [1250, 1000, [['pm', 'goal:gH', '2026-06', 250, 'monthly', '', 'migration']], [], { base: 1000, dated: 250, carry: 0, released: 0 }, 1250]);
  });
}

function fa3caTransition() {
  scenario('FA-3C-A TRANSITION — eligibility, payment identity, idempotency and the investment deferral', () => {
    const app = fa3bLoad(CARRY_MIX, '2026-08-20', true);
    const sim = schema2(app);
    const owners = app.state().payments.filter(p => p.status === 'paid' && Number(p.amount) && ['gH', 'gB'].indexOf(p.goalId) >= 0)
      .map(p => [p.id, [app.activeEvents().some(e => e.paymentId === p.id) && 'dated', sim.created.some(c => c.paymentId === p.id) && 'carry'].filter(Boolean)]);
    invariant('FA3CA.transition.eligibility', 'Carries for the paid goal rows no dated completion owns — ambiguous monthly £100, ambiguous annual £250, negative −£50, Car monthly £40; none for the dated one-off, the ISA row or the deleted goal\'s row; every counted goal payment has exactly one owner; Holiday £1,350 and Car £540 simulated as displayed',
      [carryRows(sim.created), owners, [sim.goals.gH.legacy, sim.goals.gH.shown, sim.goals.gB.legacy, sim.goals.gB.shown]],
      [CARRY_MIX_CARRIES, [['p1', ['dated']], ['px', ['carry']], ['pa', ['carry']], ['pn', ['carry']], ['pb', ['carry']]], [1350, 1350, 540, 540]]);

    const other = schema2(app, FA3CA_AT + 99);
    app.run('S.contributionCarry = ' + JSON.stringify(sim.created) + '; save(); __reload();');
    const stored = app.state().contributionCarry;
    app.reload(); app.render(); app.reload();
    const after = schema2(app);
    app.run('S.contributionCarry = [' + JSON.stringify(RESOLUTION('rx', 'carry_px', 'reversed')) + '].concat(S.contributionCarry);');
    invariant('FA3CA.transition.idempotent', 'The same state gives the same records (ids derive from the payment); another creation time gives the same carry set; once stored they survive reloads, a repeat creates nothing, and a payment with a resolved carry gets no second one; simulated Holiday stays £1,350',
      [same(schema2(fa3bLoad(CARRY_MIX, '2026-08-20', true)).created, sim.created), sim.created.map(c => c.id), same(carryRows(other.created), carryRows(sim.created)),
        same(stored, sim.created), same(app.state().contributionCarry.slice(1), sim.created), after.created, schema2(app).created, after.goals.gH.shown],
      [true, ['carry_px', 'carry_pa', 'carry_pn', 'carry_pb'], true, true, true, [], [], 1350]);

    const inv = fa3bLoad(CARRY_MIX, '2026-08-20', true);
    const candidate = a => JSON.parse(a.run('JSON.stringify(geodeLegacyCarryCandidate(S, S.payments.filter(function (p) { return p.id === "im"; })[0], {}))'));
    const before = [candidate(inv), inv.snap().inv.iA];
    const months = ['2026-09-02', '2026-10-02', '2026-11-02', '2026-12-02', '2027-01-02', '2027-02-02', '2027-03-02', '2027-04-02', '2027-05-02', '2027-06-02', '2027-07-02', '2027-08-02'];
    months.forEach(m => inv.advance(m, 'reload'));
    const im = inv.state().payments.filter(p => p.id === 'im')[0];
    invariant('FA3CA.inv.deferred', 'Investments keep legacy authority: the transition creates no ISA carry; the ambiguous ISA row stays as evidence through twelve monthly reloads (paid £200, no lastPaidYM, no event, ISA £5,200), so FA-7 can derive the same +£200 carry later',
      [sim.created.filter(c => c.entityType !== 'goal').length, before, [im.status, im.amount, im.lastPaidYM || '', inv.events().filter(e => e.paymentId === 'im').length],
        candidate(inv), inv.snap().inv.iA],
      [0, [{ paymentId: 'im', entityType: 'investment', entityId: 'iA', kind: 'undated_contribution', amount: 200, recurrence: 'monthly', dueDateSnapshot: '2026-06-05' }, 5200],
        ['paid', 200, '', 0], { paymentId: 'im', entityType: 'investment', entityId: 'iA', kind: 'undated_contribution', amount: 200, recurrence: 'monthly', dueDateSnapshot: '2026-06-05' }, 5200]);

    const GA = FA3B_GOALS.filter(c => c[0] === 'monthly-ambiguous')[0];
    const resaved = new App(GA[2], '2026-08-10');
    resaved.reload();
    resaved.run('S.contributionCarry = ' + JSON.stringify(schema2(resaved).created) + '; save(); __reload();');
    resaved.at('2026-08-12'); resaved.editPayment('pm', { name: 'Holiday monthly (renamed)' });
    const stamped = resaved.state().payments[0].lastPaidYM;
    resaved.reload();
    const aug = [resaved.events().length, resaved.snap().goal.gH, schema2(resaved, null).goals.gH.shown];
    resaved.advance('2026-09-02', 'reload');
    invariant('FA3CA.seed.carry-witnessed', 'A carried amount is never dated again: the GA row with its £100 carry, re-saved through the form in August (lastPaidYM stamped 2026-08), gets no migration event on the next load and no rollover safety-net event at the September reset; simulated Holiday stays £1,100 (legacy £1,100, then £1,000 after the reset, D1)',
      [stamped, aug, [resaved.events().length, resaved.snap().goal.gH, schema2(resaved, null).goals.gH.shown]], ['2026-08', [0, 1100, 1100], [0, 1000, 1100]]);

    const orphan = fa3bLoad(Object.assign(JSON.parse(JSON.stringify(CARRY_MIX)), { contributionCarry: [CARRY('carry_old', 'pOld', { entityId: 'gGone', amount: 300 })] }), '2026-08-20', true);
    const orphanSim = schema2(orphan);
    invariant('FA3CA.orphan', 'No carry for the paid row of a deleted goal; an existing carry whose goal is gone is kept as history but counts toward no goal',
      [orphanSim.created.some(c => c.paymentId === 'pg'), orphan.state().contributionCarry.map(c => c.id), orphanSim.goals.gH.parts.carry, orphanSim.goals.gB.parts.carry],
      [false, ['carry_old'], 300, 40]);
  });
}

function fa3caResolutions() {
  scenario('FA-3C-A RESOLUTIONS — each resolution matches what the legacy display does for the same user action', () => {
    const ACT = legacyState({}, { goals: [Object.assign(HOLIDAY(), { saved: 1100 }), CAR()], payments: [legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })] });
    const DATED = { id: 'cev_dated', eventType: 'completion', paymentId: 'px', entityType: 'goal', entityId: 'gH', occurrenceYm: '2026-06', amount: 100,
      recurrence: 'monthly', dueDateSnapshot: '2026-06-03', recordedAt: FA3CA_AT + 1000, source: 'user_dated' };
    const run = ([label, act, resolution, events]) => {
      const app = new App(ACT, '2026-08-10');
      app.reload();
      const created = schema2(app).created;
      act(app);
      const res = resolution ? [RESOLUTION('res1', created[0].id, resolution.reason, resolution)] : [];
      app.run('S.contributionCarry = ' + JSON.stringify(created.concat(res)) + '; S.contributionEvents = S.contributionEvents.concat(' + JSON.stringify(events || []) + ');');
      const sim = schema2(app, null), s = app.snap();
      return [label, s.goal.gH, s.goal.gB, sim.goals.gH.shown, sim.goals.gB.shown, sim.goals.gH.parts.dated, sim.goals.gH.parts.carry];
    };
    invariant('FA3CA.resolution.actions', '[action, legacy Holiday, legacy Car, simulated Holiday, simulated Car, dated, carry]: none; undo and delete → reversed; edit £100 → £80 → amended; relink to Car → moved; user dates it June → dated + dated completion, position unchanged',
      [['none', () => {}], ['undo', a => a.toggle('px'), { reason: 'reversed' }], ['delete', a => a.del('px'), { reason: 'reversed' }],
        ['amend', a => a.editPayment('px', { amount: 80 }), { reason: 'amended', amount: 80 }],
        ['move', a => a.editPayment('px', { goalId: 'gB' }), { reason: 'moved', entityType: 'goal', entityId: 'gB' }],
        ['date', () => {}, { reason: 'dated', eventId: 'cev_dated' }, [DATED]]].map(run),
      [['none', 1100, 500, 1100, 500, 0, 100], ['undo', 1000, 500, 1000, 500, 0, 0], ['delete', 1000, 500, 1000, 500, 0, 0],
        ['amend', 1080, 500, 1080, 500, 0, 80], ['move', 1000, 600, 1000, 600, 0, 0], ['date', 1100, 500, 1100, 500, 100, 0]]);
  });
}

function fa3caLinkedAndCorrection() {
  scenario('FA-3C-A LINKED GOAL — linked goals stay investment-derived; nothing counts twice', () => {
    const linked = (inv, payments) => legacyState({}, { goals: [Object.assign(HOLIDAY(), { saved: 1350 })], investments: [Object.assign(ISA(), { goalId: 'gH' }, inv)], payments });
    const goalRows = [legacyPay('pg'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })];
    const look = state => {
      const app = fa3bLoad(state, '2026-08-10', true);
      const sim = schema2(app);
      return [app.snap().goal.gH, sim.goals.gH.position, sim.goals.gH.shown, sim.goals.gH.parts.dated, sim.goals.gH.parts.carry, carryRows(sim.created).map(c => c[0]), app.snap().inv.iA];
    };
    invariant('FA3CA.linked', '[legacy shown, simulated position, simulated shown, dated, carry, carried payments, ISA]: ISA £5,200 linked → Holiday shows the ISA in both (its own position £1,350 = £1,000 + dated £250 + carry £100; the ISA completion £200 never enters it); ISA at £0 → Holiday shows its position £1,350 in both',
      [look(linked({ balance: 5200 }, goalRows.concat([legacyInvPay('pi', { date: '2026-06-05' })]))), look(linked({ balance: 0, baseBalance: 0 }, goalRows))],
      [[5200, 1350, 5200, 250, 100, ['px'], 5200], [1350, 1350, 1350, 250, 100, ['px'], 0]]);
  });

  scenario('FA-3C-A SAVED SO FAR — schema-2 correction arithmetic (simulation; saveGoal unchanged)', () => {
    const correct = (state, clock, entered) => {
      const app = fa3bLoad(state, clock, true);
      const out = JSON.parse(app.run('(function () { var keep = S; try { S = JSON.parse(JSON.stringify(keep)); S.contributionCarry = S.contributionCarry.concat(geodeSchema2TransitionCarryRecords(S, ' + FA3CA_AT + ')); ' +
        'var g = S.goals[0], shown = geodeSchema2GoalEffectiveSaved(S, g), base = geodeSchema2GoalCorrectionBase(S, g, ' + JSON.stringify(entered) + '); if (base !== null) g.baseSaved = base; ' +
        'return JSON.stringify([shown, base, geodeSchema2GoalPosition(S, g), geodeSchema2GoalEffectiveSaved(S, g)]); } finally { S = keep; } })()'));
      return out;
    };
    const mixed = legacyState({ saved: 1300 }, { payments: [legacyPay('p1'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })],
      savingsReleases: [Object.assign({}, EVENT_RELEASE, { amount: 50, remainingBalance: 1300 })] });
    const gx = FA3B_GOALS.filter(c => c[0] === 'negative')[0][2];
    const linked = legacyState({ saved: 1350 }, { investments: [Object.assign(ISA(), { goalId: 'gH', balance: 5000 })], payments: [legacyPay('p1'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })] });
    invariant('FA3CA.correction', '[shown, new base, position, shown after]: base £1,000 + dated £250 + carry £100 − release £50 = £1,300, enter £1,200 → base £900 → £1,200; GX £950, enter £900 → base £950 (signed carry −£50) → £900; enter £200 or −£5 → refused, unchanged; linked goal: enter £1,500 → base £1,150, position £1,500, still shows the ISA £5,000',
      [correct(mixed, '2026-08-10', 1200), correct(gx, '2026-08-10', 900), correct(mixed, '2026-08-10', 200), correct(mixed, '2026-08-10', -5), correct(linked, '2026-08-10', 1500)],
      [[1300, 900, 1200, 1200], [950, 950, 900, 900], [1300, null, 1300, 1300], [1300, null, 1300, 1300], [5000, 1150, 1500, 5000]]);

    const g3 = FA3B_GOALS.filter(c => c[0] === 'monthly-current')[0];
    const app = fa3bLoad(g3[2], g3[3], true);
    const toasts = app.editGoal('gH', { gs: '1500' });
    invariant('FA3CA.fa2-guard', 'Production keeps the FA-2 refusal (monthly completion this month): Saved So Far £1,500 refused, base £1,000, Holiday £1,100; the schema-2 simulation would store base £1,400 and show £1,500',
      [toasts.length === 1 && toasts[0].indexOf('can\u2019t safely update') >= 0, app.state().goals[0].baseSaved, app.snap().goal.gH, correct(g3[2], g3[3], 1500)],
      [true, 1000, 1100, [1100, 1400, 1500, 1500]]);

    const neg = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05');
    const left = neg.snap().left;
    neg.contribute({ name: 'Holiday minus', amount: -50, date: '2026-06-02', status: 'paid', goalId: 'gH' });
    current('FA3CA.negative-input', 'The payment form still accepts a paid −£50 Holiday row (FA-3C-B owns validation): stored −£50, Holiday £950, no event, Monthly Left £3,000 → £3,050',
      [neg.state().payments.map(p => p.amount), neg.snap().goal.gH, neg.events().length, left, neg.snap().left], [[-50], 950, 0, 3000, 3050]);
  });
}

function fa3caLifecycle() {
  scenario('FA-3C-A OBSERVATIONAL — £5,000 carries change no production surface; the simulation sees them', () => {
    const real = fa3bLoad(CARRY_MIX, '2026-08-20', true).state();
    const faked = JSON.parse(JSON.stringify(real));
    faked.contributionCarry = [CARRY('fake-goal', 'ghost-g', { amount: 5000 }), CARRY('fake-inv', 'ghost-i', { entityType: 'investment', entityId: 'iA', amount: 5000 }),
      CARRY('fake-row', 'px', { amount: 5000 }), NEG_CARRY('fake-neg', 'pb', { entityId: 'gB', amount: -500 })];
    const surfaces = state => { const a = fa3bLoad(state, '2026-08-20', true); const direct = [fa3bLook(a), a.state().savingsReleases]; a.reload(); return [direct, fa3bLook(a), a.state().savingsReleases, a]; };
    const r = surfaces(real), f = surfaces(faked);
    const sim = schema2(f[3], null);
    invariant('FA3CA.observational.fake-carry', 'Holiday +£10,000, ISA +£5,000 and Car −£500 in carries: goals, ISA, Monthly Left, Plan, Home, Suggested Actions and releases identical before and after reload (Holiday £1,350, ISA £5,200, Car £540); the carries survive the loads and the simulation counts only them (Holiday £1,000 + dated £250 + £10,000 − release £200 = £11,050; Car £500 − £500 = £0)',
      [same(r.slice(0, 3), f.slice(0, 3)), [r[0][0].snap.goal.gH, r[0][0].snap.inv.iA, r[0][0].snap.goal.gB], f[3].state().contributionCarry.length, [sim.goals.gH.shown, sim.goals.gB.shown]],
      [true, [1350, 5200, 540], 4, [11050, 0]]);
  });

  scenario('FA-3C-A BACKUP — contributionCarry persists, exports and restores; schema stays 1', () => {
    const records = [CARRY('c1', 'pA'), RESOLUTION('r1', 'c1', 'amended', { amount: 200 })];
    const app = new App(Object.assign(baseState(), { _schemaVersion: 1, contributionCarry: records }), '2026-08-10');
    app.reload(); app.render(); app.reload();
    const persisted = app.state().contributionCarry;
    const env = app.backup(), restored = app.restorable(env);
    const back = new App(restored.state, '2026-08-10');
    back.reload();
    const oldEnv = new App(baseState({ _schemaVersion: 1 }), '2026-08-10').backup();
    const oldBack = new App(new App({}, '2026-08-10').restorable(oldEnv).state, '2026-08-10');
    oldBack.reload();
    const badEnv = JSON.parse(JSON.stringify(env));
    badEnv.data.contributionCarry = [CARRY('bad', 'pZ', { amount: -1 })].concat(records);
    const badBack = new App(app.restorable(badEnv).state, '2026-08-10');
    badBack.reload();
    invariant('FA3CA.backup', 'A carry and its resolution survive load, render and reload; the export holds them; restore extraction keeps them (not stripped) and the restored load has them; an old backup without the key loads []; an invalid carry in a backup is dropped at load; schema 1 throughout',
      [same(persisted, records), same(env.data.contributionCarry, records), [restored.ok, restored.strippedKeys.indexOf('contributionCarry')], same(back.state().contributionCarry, records),
        ['contributionCarry' in oldEnv.data, oldBack.state().contributionCarry], badBack.state().contributionCarry.map(c => c.id), [env.schemaVersion, back.run('GEODE_SCHEMA_VERSION')]],
      [true, true, [true, -1], true, [false, []], ['c1', 'r1'], [1, 1]]);
  });

  scenario('FA-3C-A BOUNDARY — carries come only from the transition helper, which nothing calls; no engine reads carries', () => {
    const src = PROGRAM.src;
    const bodies = [];
    const decl = /\nfunction ([A-Za-z_$][\w$]*)\(/g;
    let m;
    while ((m = decl.exec(src))) {
      const start = m.index + 1, firstLine = src.slice(start, src.indexOf('\n', start));
      const opens = (firstLine.match(/\{/g) || []).length, closes = (firstLine.match(/\}/g) || []).length;
      const end = opens > 0 && opens === closes && /\}\s*$/.test(firstLine) ? start + firstLine.length : src.indexOf('\n}', start);
      bodies.push([m[1], src.slice(start, end)]);
    }
    const users = needle => [...new Set(bodies.filter(b => b[1].indexOf(needle) >= 0).map(b => b[0]))].sort();
    invariant('FA3CA.boundary', 'Functions that mention: the transition helper — only itself; the schema2_transition source — the validator and the helper; carry state — the carry functions, FA-3B seeding (carried payments are seen) and the backup whitelist; carry functions — the carry family, the simulated goal parts, FA-3B seeding, the rollover safety net (left to an active carry) and load (normaliser only); schema-2 goal helpers — only each other',
      [users('geodeSchema2TransitionCarryRecords('), users("'schema2_transition'"), users('contributionCarry'), users('ContributionCarry'), users('geodeLegacyCarryCandidate('), users('geodeSchema2Goal')],
      [['geodeSchema2TransitionCarryRecords'], ['geodeContributionCarryValid', 'geodeSchema2TransitionCarryRecords'],
        ['geodeBeyndBackupRestorableKeyWhitelist', 'geodeContributionCarryActive', 'geodeNormalizeContributionCarry', 'geodeSchema2TransitionCarryRecords', 'geodeSeedLegacyContributionEvents'],
        ['geodeContributionCarryActive', 'geodeContributionCarryLedger', 'geodeContributionCarryResolutionValid', 'geodeContributionCarryValid', 'geodeEnsureContributionCompletion',
          'geodeNormalizeContributionCarry', 'geodeSchema2GoalParts', 'geodeSchema2TransitionCarryRecords', 'geodeSeedLegacyContributionEvents', 'load'],
        ['geodeLegacyCarryCandidate', 'geodeSchema2TransitionCarryRecords'],
        ['geodeSchema2GoalCorrectionBase', 'geodeSchema2GoalEffectiveSaved', 'geodeSchema2GoalParts', 'geodeSchema2GoalPosition']]);
  });
}

/** Completions FA-3B seeds for each legacy fixture: only rows whose stored fields prove a paid occurrence. */
const MIG_SEEDED = {
  'goal-completed-one-off': [['p_one_off', 'goal:gH', '2026-06', 250, 'one_off', '2026-06-10', 'migration']],
  'goal-current-month-recurring-completed': [['p_monthly', 'goal:gH', '2026-08', 100, 'monthly', '', 'migration']],
  'goal-possible-edit-double-count': [['p_one_off', 'goal:gH', '2026-06', 250, 'one_off', '2026-06-10', 'migration']],
  'investment-value-plus-completed-contribution': [['p_inv', 'investment:iA', '2026-06', 500, 'one_off', '2026-06-05', 'migration']]
};

function migrationFixtures() {
  const data = JSON.parse(readSource(FIXTURES_JSON));
  data.fixtures.forEach(f => scenario('MIGRATION FIXTURE — ' + f.id, () => {
    const app = new App(f.state, f.clock);
    const shownNow = () => { const s = app.snap(); return f.entity.kind === 'goal' ? s.goal[f.entity.id] : s.inv[f.entity.id]; };
    const legacy = new App(f.state, f.clock);
    legacy.run('geodeSeedLegacyContributionEvents = function () {};');
    legacy.reload();
    app.reload();
    const shown = shownNow(), events = app.events();
    current('MIG.' + f.id + '.display', 'Displayed before migration', legacy.snap()[f.entity.kind === 'goal' ? 'goal' : 'inv'][f.entity.id], f.displayBeforeMigration);
    app.reload(); app.reload();
    invariant('MIG.' + f.id + '.identity', 'Displayed immediately after migration and after two reloads equals ' + show(f.displayBeforeMigration) +
      '; idempotent; only completions the stored rows prove are seeded (' + f.history.split('.')[0] + ')',
      [shown, shownNow(), same(app.events(), events), seededRows(app)], [f.displayBeforeMigration, f.displayBeforeMigration, true, MIG_SEEDED[f.id] || []]);
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
  missedRecurring(); investments(); quickSetup(); monthlyLeft(); identity(); identityMatrix(); planActions(); releases(); deposits();
  fa2Goals(); fa2Investments(); fa2Deposits();
  fa3aLedger(); fa3aGoals(); fa3aInvestments(); fa3aSmartImport(); fa3aDeletion(); fa3aIdentity(); fa3aRollover(); fa3aProtection(); fa3aAnnual(); fa3aOccurrence();
  fa3bOrder(); fa3bMatrix(); fa3bPointers(); fa3bParity(); fa3bLifecycle();
  fa3caNormalise(); fa3caMatrix(); fa3caTransition(); fa3caResolutions(); fa3caLinkedAndCorrection(); fa3caLifecycle();
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
