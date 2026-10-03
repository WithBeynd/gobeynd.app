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
  // recurring occurrence lifecycle (FA-4B): calendar-safe advance, undo inverse, paid-occurrence month, annual reset
  'geodeIsoDateAddMonths', 'geodeIsoDateMonthsBehind', 'geodePaymentUndoDueDate', 'geodePaymentPaidOccurrenceInMonth',
  'geodeAnnualPaymentNextOccurrenceDue',
  // completed occurrence amount (FA-4C), and the payment form's Monthly Left preview
  'geodePaymentMonthAmount', 'geodePayModalImpactRefresh', 'geodeRenderModalImpactBlock', 'geodeCoachingLineForDelta', 'geodeCloneStateForUiCalc',
  'escHtmlLite', 'geodeDetailsWhy',
  // month rollover
  'syncRecurringPayments', 'rollupRecurringPaymentDueDates', 'rollupRecurringExpenseDueDates',
  'geodeArchiveExpiredOneOffExpenses', 'geodeNormalizeBeyndStatement', 'geodeUpsertBeyndStatementItem',
  'geodeBuildBeyndStatementOneOff', 'geodeBeyndStatementArchiveKey',
  // balances
  'geodeRecomputeBalancesFromPayments', 'geodePaymentBalanceEffect', 'geodeGoalCountedContributions',
  'geodeNormalizeGoalInvestBaseFields', 'geodeSavingsReleaseDeductionSumForSource',
  'geodeGoalEffectiveSavedFromState', 'geodeGoalHasPositiveLinkedInvestmentForState', 'geodeGoalLinkedInvBalanceForState',
  // investment position authority (FA-7B): valuation anchors, contribution / release ordering, the load-time transition
  'geodeInvestmentIsoDateValid', 'geodeInvestmentValuationValid', 'geodeInvestmentValuations', 'geodeInvestmentOrderedAfter',
  'geodeInvestmentLatestValuation', 'geodeContributionEffectiveDate', 'geodeInvestmentContributionFlows', 'geodeInvestmentReleaseFlows',
  'geodeInvestmentPosition', 'geodeInvestmentLegacyBalance', 'geodeInvestmentDisplayBalance', 'geodeInvestmentCapitalSinceTracking',
  'geodeInvestmentValuationRecordedAt', 'geodeInvestmentAppendValuation', 'geodeInvestmentLegacyOpeningValues', 'geodeInvestmentEvidenceLatestAt',
  'geodeInvestmentAuthorityTransition',
  // Monthly Left
  'calcMonthlyLeftover', 'calcMonthlyLeftoverConfirmedOnly', 'sumPaymentsMonthlyOutflow',
  'sumPaymentsMonthlyOutflowConfirmedOnly', 'paymentCountsForMonthlyOutflow', 'paymentCountsForMonthlyOutflowConfirmedOnly',
  'geodePaymentIsLapsedVoluntaryOneOff', 'sumExpensesMonthly', 'geodeExpenseIsOneOff', 'geodeExpenseIsExpiredOneOff', 'geodeExpenseMonthValue',
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
  'geodeNormalizeContributionEvents', 'geodeContributionYmValid', 'geodeContributionYmTrusted', 'geodeContributionEventValid', 'geodeContributionLedger',
  'geodeContributionActiveCompletions', 'geodeContributionActiveCompletion', 'geodeContributionEntityRef',
  'geodeContributionRecurrence', 'geodeContributionOccurrenceYm', 'geodeContributionEventSnapshot',
  'geodeContributionCompletionFields', 'geodeContributionPointerTarget', 'geodeContributionYmAdd', 'geodeContributionRowRepresents',
  'geodeContributionPriorCompletion', 'geodeContributionEventId',
  'geodeAppendContributionCompletion', 'geodeAppendContributionReversal', 'geodeRecordContributionTransition',
  'geodeRecordContributionDeletion', 'geodeEnsureContributionCompletion',
  // legacy contribution seeding (FA-3B): load seeds completions that legacy paid rows prove
  'geodeLegacyContributionSeedFields', 'geodeSeedLegacyContributionEvents',
  // legacy carry (FA-3C-A): payment-level carries and the schema-2 goal position
  'geodeNormalizeContributionCarry', 'geodeContributionCarryValid', 'geodeContributionCarryResolutionValid',
  'geodeContributionCarryLedger', 'geodeContributionCarryActive', 'geodeLegacyCarryCandidate', 'geodeSchema2TransitionCarryRecords',
  'geodeSchema2GoalParts', 'geodeSchema2GoalPosition', 'geodeSchema2GoalCorrectionBase',
  // schema-2 goal authority (FA-3C-C): version rule, one-time transition, integrity report, carry-aware recurring reset
  'geodePersistedSchemaVersion', 'geodeSchema2Active', 'geodeSchema2AuthorityProblems', 'geodeSchema2IntegrityReport',
  'geodeSchema2CommitTransition', 'geodeSchema2Transition', 'geodeSchema2RecurringResetDue',
  // release safety: stale-runtime write guard, cross-window detection, shell readiness for the transition
  'geodeStoredSchemaVersion', 'geodeMarkRuntimeStale', 'geodeNoteFinancialBoot', 'geodeFinancialWriteAllowed',
  'geodeOnForeignFinancialWrite', 'geodeShellReadiness', 'persistGeodeToLocalStorage',
  // carry lifecycle and contribution input integrity (FA-3C-B): payment actions resolve the carry a row still holds
  'geodeContributionCarryFor', 'geodeContributionCarryForRow', 'geodeResolveContributionCarry', 'geodeContributionCarryFollowRow',
  'geodeContributionSaveRefusal',
  // Smart Import and backup export / restore extraction
  'geodeSmartImportConfirm', 'geodeSmartImportRefusedMergeLine', 'exportJSONBackup', 'isPlainObject', 'validateBeyndBackupEnvelope',
  'geodeBeyndBackupRestorableKeyWhitelist', 'geodeBeyndBackupForbiddenDataKeys', 'extractRestorableData',
  // activity log
  'appendActivityLog', 'trimActivityLogForRetention'
];

/** Production top-level constants the extracted base functions read. */
const BASE_CONSTANTS = ['GEODE_SCHEMA_VERSION', 'BEYND_RUNTIME_VERSION', '_geodeRuntimeStale', '_geodeFinancialKeySeen',
  'GEODE_SHELL_KEY', 'GEODE_CACHE_PREFIX'];

/**
 * Read-only structural checks: the reload and render shims below must mirror these production bodies, and the
 * App.contribute / App.planSchedule intents must mirror what the payment modal's callers pass.
 */
const STRUCTURAL_FUNCTIONS = ['load', 'save', 'geodeInstallFinancialStorageListener', 'geodeShowStaleRuntimeGate',
  'geodeShellCleanup', 'render', 'openPayModal', 'geodePayFromGoal', 'geodePayFromInvest', 'geodePayFromDebt',
  'openPayQuick', 'geodePlanDetailActionForStep', 'geodeMainActionFromPriorityStep', 'openSuggestedAction', 'openGoalModal', 'openInvModal'];

/** The release gate load() and __reload put in front of the schema 1 → 2 transition (geodeShellReadiness). */
const RELEASE_GATE = "else if (geodeShellReadiness() !== 'pending') geodeSchema2Transition();";

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
/** Production save() minus its snapshot/archive side effects: the same release guard, then the whole state to the store. */
function save() { if (!geodeFinancialWriteAllowed()) return; __store = JSON.stringify(S); _geodeFinancialKeySeen = true; }
/** Stale-runtime reload gate (UI): records which gate production would show. */
var __staleGate = '';
function geodeShowStaleRuntimeGate(reason) { __staleGate = reason; }
function __memStorage() { var m = {}; return { getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; }, setItem: function (k, v) { m[k] = String(v); }, removeItem: function (k) { delete m[k]; } }; }
/** localStorage[KEY] is the store save() writes. __storageFault: 'throw' — setItem(KEY) throws; 'lose' — it returns but stores nothing. */
var __storageFault = '', __otherStorage = __memStorage();
var localStorage = {
  getItem: function (k) { return k === KEY ? __store : __otherStorage.getItem(k); },
  setItem: function (k, v) {
    if (k !== KEY) return __otherStorage.setItem(k, v);
    if (__storageFault === 'throw') throw new Error('QuotaExceededError');
    if (__storageFault !== 'lose') __store = String(v);
  },
  removeItem: function (k) { if (k === KEY) __store = null; else __otherStorage.removeItem(k); }
};
var sessionStorage = __memStorage();
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
/** Smart Import handoff modal: the summary it was opened with is kept in __handoff. */
var __handoff = null;
function geodeSmartImportRememberLearn() {} function geodeSmartImportShowHandoffModal(sum) { __handoff = JSON.parse(JSON.stringify(sum)); }

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
  _geodeRuntimeStale = ''; _geodeFinancialKeySeen = false; __staleGate = ''; // a reload is a new page
  geodeNoteFinancialBoot(__store);
  S = JSON.parse(__store);
  S._schemaVersion = geodePersistedSchemaVersion(S._schemaVersion);
  geodeNormalizeContributionEvents(S);
  geodeNormalizeContributionCarry(S);
  migratePaymentFlowFields();
  geodeNormalizeGoalInvestBaseFields();
  geodeNormalizeSavingsReleases(S);
  var _geodeInvOpening = _geodeRuntimeStale ? [] : geodeInvestmentLegacyOpeningValues(S);
  if (!_geodeRuntimeStale) {
    if (geodeSchema2Active(S)) geodeSchema2IntegrityReport(S);
    else if (geodeShellReadiness() !== 'pending') geodeSchema2Transition();
    if (geodeSchema2Active(S)) geodeInvestmentAuthorityTransition(S, _geodeInvOpening);
  }
  syncRecurringPayments();
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
 * FA-3C-C: goal authority derived afresh from the live state, independent of the g.saved cache — per goal the schema-2
 * parts, position and what the goal display rule shows for it — and the active carries.
 */
function __authority() {
  var goals = {};
  (S.goals || []).forEach(function (g) {
    var position = geodeSchema2GoalPosition(S, g);
    goals[g.id] = { parts: geodeSchema2GoalParts(S, g), position: position,
      shown: geodeGoalHasPositiveLinkedInvestmentForState(S, g) ? geodeGoalLinkedInvBalanceForState(S, g.id) : position };
  });
  return JSON.stringify({ carry: S.contributionCarry || [], active: geodeContributionCarryActive(S), goals: goals });
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
  return { script, extracted, structural, src, plan: buildPlanProgram(src, foundation, extracted), payModal: buildPayModalProgram(src, foundation) };
}

/** Payment-modal environment: page chrome and hints are UI; the form openPayModal writes into the modal is what App.modalForm reads. */
const PAY_MODAL_SHIMS = String.raw`
var S = null, window = {}, __html = '';
function mh() { return ''; } function openModal(h) { __html = h; } function setTimeout() {}
function geodePayRecentNamesHtml() { return ''; } function geodePayLastHintHtml() { return ''; }
function geodeBufferActionCopy() { return { modalHeading: '' }; } function geodeTodayLocalISO() { return ''; }
`;

/** openPayModal with the production functions it calls (PAY_MODAL_SHIMS aside), so an edit form opens exactly as production fills it. */
function buildPayModalProgram(src, foundation) {
  const base = PAY_MODAL_SHIMS + '\n' + foundation + '\n';
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  new vm.Script(base).runInContext(probe);
  const have = new Map();
  const queue = ['openPayModal'];
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || vm.runInContext('typeof ' + n, probe) !== 'undefined') continue;
    const f = extractFunction(src, n);
    have.set(n, f);
    const locals = new Set((f.text.match(/\bvar\s+[A-Za-z_$][\w$]*\s*=\s*function\b/g) || []).map(m => m.split(/\s+/)[1]));
    calledNames(f.text).forEach(c => { if (!locals.has(c)) queue.push(c); });
  }
  return new vm.Script(base + [...have.values()].map(f => f.text).join('\n') + '\n', { filename: 'cross-month-pay-modal.js' });
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
  /**
   * state is persisted and booted as production loads it (__reload). program: PROGRAM (default) or PROGRAM.plan for
   * Plan / Home / Suggested Actions scenarios. options.boot === false: state stays in memory as given, never loaded.
   */
  constructor(state, clock, program, options) {
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
    if (!(options && options.boot === false)) this.run('__reload()');
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
  /** Mirrors openPayModal (intent, buffer flag, edit form as production fills it) and savePay (pre-save merge, then save). */
  saveModal(opened, amount) {
    const row = opened.id ? this.state().payments.filter(p => p.id === opened.id)[0] : null;
    if (row) {
      this.modalEdit(row.id, amount != null ? { amount } : {});
      return 'replace';
    }
    const f = opened.prefill;
    const intent = f._geodePayIntent ? this.call('geodeNormalizePayLinkedIntent', [f._geodePayIntent]) : 'new';
    this.run('window._geodePayPrefillBufferContribution = ' + JSON.stringify(f.bufferContribution === true) + ';');
    this.merge();
    this.contribute({ id: null, intent, name: f.name, amount: amount != null ? amount : f.amount, date: f.date,
      status: f.status, rec: f.rec ? 'yes' : 'no', goalId: f.goalId, investId: f.investId, debtId: f.debtId });
    return intent;
  }
  /** The edit form production openPayModal renders for a row: each input's value and each select's selected option (else its first). */
  modalForm(id) {
    const ctx = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
    PROGRAM.payModal.runInContext(ctx);
    ctx.__stateJson = JSON.stringify(this.state());
    const html = vm.runInContext('S = JSON.parse(__stateJson); openPayModal(' + JSON.stringify(id) + '); __html', ctx);
    const text = v => v.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    const input = f => { const m = html.match(new RegExp('id="' + f + '"[^>]*? value="([^"]*)"')); return m ? text(m[1]) : ''; };
    const select = f => {
      const opts = [...((html.split('<select id="' + f + '"')[1] || '').split('</select>')[0]).matchAll(/<option value="([^"]*)"( selected)?>/g)];
      const pick = opts.filter(o => o[2])[0] || opts[0];
      return pick ? text(pick[1]) : '';
    };
    return { name: input('pn'), amount: input('pa'), date: input('pd'), status: select('ps'), rec: select('prec'),
      goalId: select('pglid'), investId: select('pinvlid'), debtId: select('pdebtlid') };
  }
  /** Edit form opened on a row, these fields changed, saved as savePay reads it (Frequency and one link normalised; pre-save merge). */
  modalEdit(id, changes) {
    const f = Object.assign(this.modalForm(id), changes || {});
    const rec = f.rec === 'yes' || f.rec === 'annual' ? f.rec : 'no';
    const gid = f.goalId || '', invid = gid ? '' : f.investId || '', debtid = gid || invid ? '' : f.debtId || '';
    this.run('window._geodePayPrefillBufferContribution = false;');
    this.merge();
    this.contribute({ id, intent: 'replace', name: f.name, amount: f.amount, date: f.date, status: f.status, rec, goalId: gid, investId: invid, debtId: debtid });
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
    this.run('__fields = ' + JSON.stringify(fields) + '; __handoff = null; window._geodeSmartImportN = ' + items.length + '; window._geodeSmartImportRows = ' + JSON.stringify(rows) + ';');
    this.call('geodeSmartImportConfirm');
    return JSON.parse(this.run('JSON.stringify(__handoff)'));
  }
  /** exportJSONBackup: the envelope it downloads. */
  backup() { this.run('__downloads = []; exportJSONBackup();'); return JSON.parse(this.run('__downloads[0]')); }
  /** extractRestorableData — the restore extraction step (no live restore calls it yet). */
  restorable(envelope) { this.ctx.__argsJson = JSON.stringify([envelope]); return JSON.parse(this.run('JSON.stringify(extractRestorableData.apply(null, JSON.parse(__argsJson)))')); }
}

// ───────────────────────────── results ─────────────────────────────

const DEFECTS = {
  D1: 'Recurring goal/investment contributions lose prior months at rollover (syncRecurringPayments resets the row; geodeRecomputeBalancesFromPayments rebuilds from currently-paid rows only). Goals repaired by schema-2 goal authority (FA-3); investments repaired in FA-7B (valuation anchor + completions); guarded by the I, FA3B and FA7B checks.',
  D2: 'Quick Setup "Monthly essentials" housing/food/transport are stored as one-off expenses and drop out of later months (geodeQsDone). Repaired in FA-4A; guarded by the QS and FA4A.qs checks.',
  D3: 'Goal/investment edit forms write the displayed total into baseSaved/baseBalance, re-adding paid rows and re-deducting releases (saveGoal, saveInv). Repaired in FA-2; guarded by the E, R2 and FA2 checks.',
  D4: 'Same-month linked save overwrites or merges a different unpaid row for the same goal/investment (geodeSavePayApply upsert, geodeMergeDuplicateLinkedContributionsSameMonth). Repaired in FA-1; guarded by the IDENTITY and FA-1 checks.',
  D5: 'An unpaid voluntary one-off contribution keeps reducing every later month\'s Monthly Left (paymentCountsForMonthlyOutflow overdue rule). Repaired in FA-4A; guarded by the ML.vol and FA4A.lapse checks.',
  D6: 'Same-session rollover and reload disagree: the persisted g.saved / inv.balance cache stays stale until the next recompute. For investments repaired in FA-7B (row resets no longer move the position); guarded by the I.parity and FA7B checks.',
  D7: 'A savings release sized against a balance that rollover later shrinks hides later contributions (release deduction clamps at 0).',
  D8: 'Undoing a recurring completion does not revert the due-date advance, so complete → undo cycles push the next due date into later months (togglePay). Repaired in FA-4B; guarded by the H.date and FA4B.undo checks.',
  D9: 'Editing a recurring template while its current month is completed rewrites the recorded occurrence amount (single mutable row). Repaired in FA-4C; guarded by the F2 and FA4C checks.',
  D10: 'Entering an investment value adds currently-paid contributions on top of the entered value (saveInv baseBalance + paid rows). Repaired in FA-7B (the entered value is a valuation anchor); guarded by the I.val, FA2.I.explicit and FA7B checks.',
  D11: 'Annual recurrence lifecycle: completing an annual row moves its due date a year ahead at once and nothing resets it, so the completed occurrence drops out of Monthly Left and Plan, next year\'s row still shows paid, and tapping it undoes instead of completing (togglePay). Repaired in FA-4B; guarded by the FA3A.annual and FA4B.annual checks.'
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
/**
 * The schema-1 load a failed transition falls back to: payment rows are goal authority, nothing is seeded or carried —
 * the pre-FA-3C display, kept to compare legacy figures with schema 2.
 */
const legacyLoad = (state, clock, program) => {
  const app = new App(state, clock, program, { boot: false });
  app.run('geodeSchema2Transition = function () { return false; }; geodeSeedLegacyContributionEvents = function () {};');
  app.reload();
  return app;
};
/** Stored data as a build from before the ledger wrote it: no contribution ledger, carries, row pointers or schema marker. */
const legacyData = state => {
  const c = JSON.parse(JSON.stringify(state));
  delete c._schemaVersion; delete c.contributionEvents; delete c.contributionCarry;
  (c.payments || []).forEach(p => { delete p.contributionEventId; });
  return c;
};
/** Goal authority derived afresh from the live state (__authority). */
const authority = app => JSON.parse(app.run('__authority()'));
const INTEGRITY = '[geode] schema 2 integrity: ';
/** Consumes the app's console warnings: true when there were some and every one is the schema-2 integrity report. */
const flagged = app => { const w = app.warnings.splice(0); return w.length > 0 && w.every(x => x.indexOf(INTEGRITY) === 0); };
const signature = rows => rows.map(r => ({ rec: r.rec, amount: r.amount })).sort((a, b) => (a.rec + a.amount).localeCompare(b.rec + b.amount));

// ───────────────────────────── scenarios ─────────────────────────────

function harnessFidelity() {
  scenario('Harness fidelity — shims mirror production boot and render', () => {
    const load = PROGRAM.structural.load;
    const order = ['geodeNoteFinancialBoot(d);', 'S._schemaVersion = geodePersistedSchemaVersion(p._schemaVersion);', 'geodeNormalizeContributionEvents(S);', 'geodeNormalizeContributionCarry(S);',
      'migratePaymentFlowFields();', 'geodeNormalizeGoalInvestBaseFields();', 'geodeNormalizeSavingsReleases(S);',
      'var _geodeInvOpening = _geodeRuntimeStale ? [] : geodeInvestmentLegacyOpeningValues(S);', 'if (!_geodeRuntimeStale) {',
      'if (geodeSchema2Active(S)) geodeSchema2IntegrityReport(S);', RELEASE_GATE,
      'if (geodeSchema2Active(S)) geodeInvestmentAuthorityTransition(S, _geodeInvOpening);', 'syncRecurringPayments();',
      'geodeNormalizeDebtPaymentEvents(S);', 'geodeRecomputeBalancesFromPayments();'];
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
    invariant('A.jul.rollover', 'After July rollover Holiday still includes June (D1 closed by FA-3C-C)', s.goal.gH, 1100);
    app.at('2026-07-15'); app.toggle(id); s = app.snap('Jul 15 completed');
    invariant('A.jul.goal', 'July completed: Holiday (D1 closed by FA-3C-C)', s.goal.gH, 1200);
    invariant('A.jul.left', 'July Monthly Left', s.left, 2900);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('A.aug.rollover', 'After August rollover Holiday still includes June + July (D1 closed by FA-3C-C)', s.goal.gH, 1200);
    app.at('2026-08-15'); app.toggle(id); s = app.snap('Aug 15 completed');
    invariant('A.aug.goal', 'August completed: Holiday (D1 closed by FA-3C-C)', s.goal.gH, 1300);
    invariant('A.aug.left', 'August Monthly Left', s.left, 2900);
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL A — same-session vs reload', () => {
    parity('A.parity', 'GOAL A (D6 closed for goals by FA-3C-C)', timelines);
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
    invariant('B.jul.rollover', 'July rollover: Holiday keeps June (D1 closed by FA-3C-C)', s.goal.gH, 1100);
    app.advance('2026-07-16', mode); s = app.snap('Jul 16 July not completed');
    invariant('B.jul.missed', 'July not completed: Holiday keeps June (D1 closed by FA-3C-C)', s.goal.gH, 1100);
    invariant('B.jul.left', 'July Monthly Left allocates July\'s £100 once', s.left, 2900);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('B.aug.left', 'August Monthly Left: missed July £100 does not carry into August', s.left, 2900);
    invariant('B.aug.rollover', 'August rollover: Holiday keeps June (D1 closed by FA-3C-C)', s.goal.gH, 1100);
    app.at('2026-08-15'); app.toggle(id); s = app.snap('Aug 15 completed');
    invariant('B.aug.goal', 'August completed: Holiday (D1 closed by FA-3C-C)', s.goal.gH, 1200);
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL B — same-session vs reload', () => {
    parity('B.parity', 'GOAL B (D6 closed for goals by FA-3C-C)', timelines);
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
    invariant('C1.aug.rollover', 'August rollover before another completion: Holiday stays £1,200 (D1 closed by FA-3C-C)', s.goal.gH, 1200);
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL C1 — same-session vs reload', () => parity('C1.parity', 'GOAL C1 (D6 closed for goals by FA-3C-C)', timelines));

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
    invariant('D.jul.goal', 'July rollover preserves £1,350 in both modes (D1 closed by FA-3C-C; before it, only the stale session cache showed £1,350)', s.goal.gH, 1350);
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
    invariant('F1.jul.goal', 'July completed at £150: Holiday = base + June £100 + July £150 (D1 closed by FA-3C-C)', s.goal.gH, 1250);
    invariant('F1.jul.left.after', 'July Monthly Left after completion', s.left, 2850);
    spec('F1.june', 'June occurrence remains £100 after the template edit', 'June is not recorded anywhere');
  });
  scenario('GOAL F2 — template edit in June after June is completed', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    app.editPayment(id, { amount: 150 });
    const s = app.snap();
    invariant('F2.goal', 'Editing the template does not rewrite June\'s recorded £100 (D9 closed by FA-4C)', s.goal.gH, 1100);
    invariant('F2.left', 'June Monthly Left reflects the £100 actually recorded (D9 closed by FA-4C)', s.left, 2900);
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
    invariant('G.goal', 'Holiday keeps June after the template is deleted (D1 closed by FA-3C-C)', s.goal.gH, 1100);
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
    invariant('H.date.undo', 'Due date returns to 15 June after complete → undo (D8 closed by FA-4B)', app.snap().rows[0].date, '2026-06-15');
    app.toggle(id); seen.push(app.snap().goal.gH);
    app.toggle(id); seen.push(app.snap().goal.gH);
    invariant('H.sequence', 'Holiday through the sequence', seen, [1100, 1000, 1100, 1000]);
    invariant('H.final', 'Final Holiday', seen[3], 1000);
    invariant('H.bounds', 'Never below £1,000 or above £1,100', seen.every(v => v >= 1000 && v <= 1100), true);
    invariant('H.date.final', 'Due date after the full sequence (D8 closed by FA-4B)', app.snap().rows[0].date, '2026-06-15');
    app.advance('2026-07-02', 'reload');
    invariant('H.date.july', 'July shows the July occurrence as next due (D8 closed by FA-4B)', app.snap().rows[0].date, '2026-07-15');
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
    invariant('I.jul.rollover', 'July rollover keeps June (D1 closed for investments by FA-7B: the June completion, not the reset row, is the cash flow)', s.inv.iA, 5200);
    app.at('2026-07-10'); app.toggle(id); s = app.snap('Jul 10 completed');
    invariant('I.jul', 'July completed: ISA (D1 closed by FA-7B)', s.inv.iA, 5400);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('I.aug.rollover', 'August rollover keeps June + July (D1 closed by FA-7B)', s.inv.iA, 5400);
    app.at('2026-08-10'); app.toggle(id); s = app.snap('Aug 10 completed');
    invariant('I.aug', 'August completed: ISA (D1 closed by FA-7B)', s.inv.iA, 5600);
    timelines[mode] = app.timeline;
  }));
  scenario('INVESTMENT — same-session vs reload', () => parity('I.parity', 'INVESTMENT (D6 closed for investments by FA-7B: row resets no longer move the position, so the cache never goes stale at rollover)', timelines));

  scenario('INVESTMENT — value entered as £5,600 on 20 July', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA monthly', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'yes', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    app.advance('2026-07-02', 'reload');
    app.at('2026-07-10'); app.toggle(id);
    app.at('2026-07-20'); app.saveInvestment('iA', 'ISA', 5600);
    let s = app.snap();
    invariant('I.val.display', 'Display at valuation equals the entered £5,600 (D10 closed by FA-7B: June and July are held by the observation)', s.inv.iA, 5600);
    app.advance('2026-08-02', 'reload'); s = app.snap();
    invariant('I.val.aug.rollover', 'August rollover: £5,600 — the 20 July valuation (FA-7B; before it, only the lost July row offset D10)', s.inv.iA, 5600);
    app.at('2026-08-10'); app.toggle(id); s = app.snap();
    invariant('I.val.aug', 'August £200 after the valuation: estimated £5,800 = valuation + August (FA-7B; before it, only the lost July row offset D10)', s.inv.iA, 5800);
    const pos = JSON.parse(app.run('JSON.stringify([geodeInvestmentCapitalSinceTracking(S, S.investments[0]), geodeInvestmentPosition(S, S.investments[0])])'));
    invariant('I.val.capital', 'Contributed capital since tracking = £600 (June + July + August completions); estimated value £5,800 = last entered value £5,600 (manual, 20 July) + £200 recorded after it',
      [pos[0], pos[1].value, pos[1].anchor.value, pos[1].anchor.source, pos[1].anchor.date, pos[1].flowsSince, pos[1].estimated], [600, 5800, 5600, 'manual', '2026-07-20', 200, true]);
  });
}

function quickSetup() {
  const timelines = {};
  MODES.forEach(mode => scenario('QUICK SETUP — essentials across June, July, August [' + mode + ']', () => {
    const app = new App(baseState({ income: 0, goals: [], investments: [] }), '2026-06-10');
    app.quickSetup({ income: '2500', incomeType: 'regular', hasDependants: false,
      expenses: { housing: '900', food: '300', transport: '150', bills: '120' }, debt: { total: '', min: '' } });
    invariant('QS.rec', 'Quick Setup monthly essentials are stored as monthly expenses (D2 closed by FA-4A)',
      app.state().expenses.map(e => [e.id, e.rec]), [['qs_housing', 'yes'], ['qs_food', 'yes'], ['qs_transport', 'yes'], ['qs_bills', 'yes']]);
    let s = app.snap('Jun 10 setup');
    invariant('QS.jun', 'June Monthly Left', s.left, 1030);
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    invariant('QS.jul', 'July Monthly Left (D2 closed by FA-4A)', s.left, 1030);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('QS.aug', 'August Monthly Left (D2 closed by FA-4A)', s.left, 1030);
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
    invariant('ML.vol.jul', 'July Monthly Left (voluntary contribution lapsed, not a liability; D5 closed by FA-4A)', app.snap().left, 3000);
    app.advance('2026-08-02', mode);
    invariant('ML.vol.aug', 'August Monthly Left (D5 closed by FA-4A)', app.snap().left, 3000);
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

/** FA-4A (D2): Quick Setup essentials are monthly; re-runs update in place and never downgrade; history stays where it is. */
function fa4aQuickSetup() {
  const data = over => ({ income: '2500', incomeType: 'regular', hasDependants: false,
    expenses: Object.assign({ housing: '900', food: '300', transport: '150', bills: '120' }, over || {}), debt: { total: '', min: '' } });
  const rows = app => app.state().expenses.map(e => [e.id, e.rec, e.amount]);
  const timelines = {};
  MODES.forEach(mode => scenario('FA-4A QUICK SETUP — fresh setup in June, re-run in July, August [' + mode + ']', () => {
    const app = new App(baseState({ income: 0, goals: [], investments: [] }), '2026-06-10');
    app.quickSetup(data());
    invariant('FA4A.qs.fresh', 'A fresh Quick Setup stores Housing, Food and groceries, Transport and Bills as monthly expenses',
      app.state().expenses.map(e => [e.id, e.name, e.cat, e.rec, e.amount]),
      [['qs_housing', 'Housing', 'housing', 'yes', 900], ['qs_food', 'Food and groceries', 'food', 'yes', 300],
        ['qs_transport', 'Transport', 'transport', 'yes', 150], ['qs_bills', 'Bills and subscriptions', 'subs', 'yes', 120]]);
    app.snap('Jun 10 setup');
    app.advance('2026-07-02', mode); app.snap('Jul 02 rollover');
    app.quickSetup(data({ housing: '950' }));
    let s = app.snap('Jul 02 re-run');
    invariant('FA4A.qs.rerun.rows', 'Re-running Quick Setup in July updates the same four rows in place: still monthly, no duplicates',
      rows(app), [['qs_housing', 'yes', 950], ['qs_food', 'yes', 300], ['qs_transport', 'yes', 150], ['qs_bills', 'yes', 120]]);
    invariant('FA4A.qs.rerun.left', 'July Monthly Left after the re-run (£2,500 − £950 − £300 − £150 − £120)', s.left, 980);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('FA4A.qs.aug', 'August keeps the four monthly essentials and their Monthly Left', [rows(app), s.left],
      [[['qs_housing', 'yes', 950], ['qs_food', 'yes', 300], ['qs_transport', 'yes', 150], ['qs_bills', 'yes', 120]], 980]);
    timelines[mode] = app.timeline;
  }));
  scenario('FA-4A QUICK SETUP — same-session vs reload', () => parity('FA4A.qs.parity', 'FA-4A QUICK SETUP', timelines, undefined, ''));

  scenario('FA-4A QUICK SETUP — a re-run never downgrades a monthly row', () => {
    const app = new App(baseState({ income: 0, goals: [], investments: [],
      expenses: [{ id: 'qs_housing', name: 'Housing', amount: 900, cat: 'housing', rec: 'yes', date: '2026-05-10' }] }), '2026-06-10');
    app.quickSetup(data({ housing: '900', food: '', transport: '', bills: '' }));
    invariant('FA4A.qs.keep.monthly', 'A re-run that includes Housing keeps the already-monthly qs_housing monthly, once', rows(app), [['qs_housing', 'yes', 900]]);
    app.quickSetup(data({ housing: '', food: '300', transport: '', bills: '' }));
    invariant('FA4A.qs.keep.untouched', 'A re-run that leaves Housing blank leaves qs_housing as it was and adds Food as monthly',
      rows(app), [['qs_housing', 'yes', 900], ['qs_food', 'yes', 300]]);
  });

  scenario('FA-4A QUICK SETUP — one-off qs_ rows from earlier builds are neither migrated nor restored', () => {
    const legacyRow = { id: 'qs_housing', name: 'Housing', amount: 900, cat: 'housing', rec: 'no', date: '2026-06-10' };
    const app = new App(baseState({ expenses: [legacyRow] }), '2026-06-15');
    invariant('FA4A.qs.legacy.kept', 'Booting in June leaves the stored one-off qs_housing one-off (no migration)', rows(app), [['qs_housing', 'no', 900]]);
    const archived = () => (app.state().archivedExpenses || []).filter(e => e.id === 'qs_housing').map(e => [e.id, e.rec, e.amount, e.date]);
    app.advance('2026-07-02', 'session'); app.advance('2026-07-20', 'reload'); app.advance('2026-08-02', 'reload'); app.advance('2026-08-03', 'session');
    invariant('FA4A.qs.archived', 'Across July and August renders and reloads the archived row stays archived once and is not restored',
      [rows(app), archived(), app.snap().left], [[], [['qs_housing', 'no', 900, '2026-06-10']], 3000]);
    app.quickSetup(data({ housing: '900', food: '', transport: '', bills: '' }));
    invariant('FA4A.qs.archived.rerun', 'Only an explicit re-run with a Housing amount creates one active monthly qs_housing; the archive keeps its row unchanged',
      [rows(app), archived()], [[['qs_housing', 'yes', 900]], [['qs_housing', 'no', 900, '2026-06-10']]]);
  });
}

/** FA-4A (D5): an unpaid one-off goal or investment contribution lapses at the month boundary; debt and bill rows stay liabilities. */
function fa4aLapse() {
  const GOAL = { label: 'Catch up on Holiday', amount: 120 };
  const INVEST = { label: 'Invest what remains', amount: 120 };
  const CARD = () => ({ id: 'dC', name: 'Card', balance: 2000, apr: 20, minp: 50 });
  const plan = (app, step) => { const v = app.planView(step); return { applied: v.applied, scheduled: v.scheduled, gap: v.gap }; };
  const stored = app => app.state().payments.map(p => [p.id, p.status, p.date, p.amount, p.rec, p.lastPaidYM || '', p.goalId || '', p.investId || '', p.debtId || '']);
  const timelines = {};
  MODES.forEach(mode => scenario('FA-4A LAPSE — goal, investment, debt and bill one-offs left unpaid from June [' + mode + ']', () => {
    const app = new App(baseState({ incomeExplicitlySet: true, debts: [CARD()] }), '2026-06-05', PROGRAM.plan);
    const ids = {
      goal: app.contribute({ name: 'Holiday extra', amount: 250, date: '2026-06-20', status: 'upcoming', rec: 'no', goalId: 'gH' }),
      invest: app.contribute({ name: 'ISA top-up', amount: 200, date: '2026-06-22', status: 'upcoming', rec: 'no', investId: 'iA' }),
      debt: app.contribute({ name: 'Card extra', amount: 150, date: '2026-06-24', status: 'upcoming', rec: 'no', debtId: 'dC' }),
      bill: app.contribute({ name: 'Boiler service', amount: 100, date: '2026-06-25', status: 'upcoming', rec: 'no' })
    };
    const counts = () => { const r = app.snap().rows; return Object.keys(ids).map(k => [k, r.filter(x => x.id === ids[k])[0].countsInMonthlyLeft]); };
    let s = app.snap('Jun 05 scheduled');
    const june = { rows: stored(app), events: app.events(), debt: app.state().debts[0].balance };
    invariant('FA4A.lapse.jun', 'June: all four count; Monthly Left £3,000 − £700; Plan sees £250 Holiday and £200 ISA scheduled',
      [s.left, counts(), plan(app, GOAL), plan(app, INVEST)],
      [2300, [['goal', true], ['invest', true], ['debt', true], ['bill', true]],
        { applied: 0, scheduled: 250, gap: 0 }, { applied: 0, scheduled: 200, gap: 0 }]);

    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    invariant('FA4A.lapse.jul.counts', 'July: goal and investment one-offs lapse (A, B); debt-linked and bill one-offs still count (C, D)', counts(),
      [['goal', false], ['invest', false], ['debt', true], ['bill', true]]);
    invariant('FA4A.lapse.jul.left', 'July Monthly Left: £3,000 − £150 debt − £100 bill', s.left, 2750);
    invariant('FA4A.lapse.jul.overdue', 'Home overdue list still shows all four unpaid rows (E)', [s.homeOverduePayments, s.rows.map(r => r.effective)],
      [4, ['overdue', 'overdue', 'overdue', 'overdue']]);
    invariant('FA4A.lapse.jul.plan', 'Plan scheduled amounts exclude the lapsed rows (G): nothing scheduled for Holiday or ISA', [plan(app, GOAL), plan(app, INVEST)],
      [{ applied: 0, scheduled: 0, gap: 120 }, { applied: 0, scheduled: 0, gap: 120 }]);

    const julyId = app.contribute({ name: 'Holiday July', amount: 80, date: '2026-07-20', status: 'upcoming', rec: 'no', goalId: 'gH' });
    s = app.snap('Jul 02 July contribution');
    invariant('FA4A.lapse.jul.current', 'A July goal one-off still counts in July: Monthly Left £2,670, Plan sees £80 scheduled',
      [s.left, s.rows.filter(r => r.id === julyId)[0].countsInMonthlyLeft, plan(app, GOAL)], [2670, true, { applied: 0, scheduled: 80, gap: 40 }]);

    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    invariant('FA4A.lapse.aug.left', 'August: the July one-off lapses too; debt and bill still count (£2,750)', s.left, 2750);
    invariant('FA4A.lapse.aug.plan', 'August Plan: nothing scheduled for Holiday or ISA', [plan(app, GOAL), plan(app, INVEST)],
      [{ applied: 0, scheduled: 0, gap: 120 }, { applied: 0, scheduled: 0, gap: 120 }]);
    invariant('FA4A.lapse.stored', 'Lapsing changes nothing stored (F): June rows unchanged and unpaid, no contribution events, Holiday £1,000, ISA £5,000, Card £2,000',
      [stored(app).filter(r => r[0] !== julyId), app.events(), s.goal.gH, s.inv.iA, app.state().debts[0].balance],
      [june.rows, june.events, 1000, 5000, june.debt]);
    timelines[mode] = app.timeline;
  }));
  scenario('FA-4A LAPSE — same-session vs reload', () => parity('FA4A.lapse.parity', 'FA-4A LAPSE (H)', timelines, undefined, ''));

  scenario('FA-4A LAPSE — classification matrix in July 2026', () => {
    const app = new App(baseState({ incomeExplicitlySet: true }), '2026-07-10', PROGRAM.plan);
    const row = (id, o) => Object.assign({ id, name: id, amount: 10, status: 'upcoming', rec: 'no', date: '2026-06-20', goalId: '', investId: '', debtId: '' }, o);
    const matrix = [
      [row('goal-june', { goalId: 'gH' }), true, false],
      [row('goal-june-stored-overdue', { goalId: 'gH', status: 'overdue' }), true, false],
      [row('goal-december', { goalId: 'gH', date: '2025-12-20' }), true, false],
      [row('invest-june', { investId: 'iA' }), true, false],
      [row('goal-and-debt-june', { goalId: 'gH', debtId: 'dC' }), false, true],
      [row('invest-and-debt-june', { investId: 'iA', debtId: 'dC' }), false, true],
      [row('debt-june', { debtId: 'dC' }), false, true],
      [row('bill-june', {}), false, true],
      [row('goal-june-paid', { goalId: 'gH', status: 'paid' }), false, false],
      [row('goal-monthly-june', { goalId: 'gH', rec: 'yes' }), false, true],
      [row('goal-annual-june', { goalId: 'gH', rec: 'annual' }), false, true],
      [row('goal-july-past-day', { goalId: 'gH', date: '2026-07-05' }), false, true],
      [row('goal-july', { goalId: 'gH', date: '2026-07-20' }), false, true],
      [row('goal-august', { goalId: 'gH', date: '2026-08-20' }), false, false],
      [row('goal-no-date', { goalId: 'gH', date: '' }), false, true]
    ];
    app.ctx.__rowsJson = JSON.stringify(matrix.map(m => m[0]));
    const observed = JSON.parse(app.run('JSON.stringify(JSON.parse(__rowsJson).map(function (p) { var lapsed = geodePaymentIsLapsedVoluntaryOneOff(p); ' +
      'return [p.id, lapsed, paymentCountsForMonthlyOutflow(p), paymentCountsForMonthlyOutflowDisplay(p), paymentCountsForMonthlyOutflow(p) || lapsed]; }))'));
    invariant('FA4A.lapse.matrix', 'Per row: lapsed, counts in Monthly Left, counts in Plan scheduled (always the same), reaches the Review overdue-contribution count',
      observed, matrix.map(m => [m[0].id, m[1], m[2], m[2], m[2] || m[1]]));
    app.at('2027-01-05');
    app.ctx.__rowsJson = JSON.stringify([row('goal-dec-2026', { goalId: 'gH', date: '2026-12-20' }), row('goal-jan-2027', { goalId: 'gH', date: '2027-01-02' }),
      row('goal-bad-date', { goalId: 'gH', date: 'soon' })]);
    invariant('FA4A.lapse.year', 'January 2027: a December goal one-off has lapsed; a January one-off (day already past) and an unreadable date have not',
      JSON.parse(app.run('JSON.stringify(JSON.parse(__rowsJson).map(function (p) { return [p.id, geodePaymentIsLapsedVoluntaryOneOff(p)]; }))')),
      [['goal-dec-2026', true], ['goal-jan-2027', false], ['goal-bad-date', false]]);
    invariant('FA4A.lapse.review', 'rReview still counts a lapsed contribution among the overdue contributions to check',
      extractFunction(PROGRAM.src, 'rReview').text.indexOf('if (!paymentCountsForMonthlyOutflow(p) && !geodePaymentIsLapsedVoluntaryOneOff(p)) continue;') >= 0, true);
  });
}

/** A payment row as the lifecycle sees it: [status, date, lastPaidYM, lastPaidDueDate]. */
const lifecycle = (app, id) => { const p = app.state().payments.filter(x => x.id === id)[0]; return [p.status, p.date, p.lastPaidYM || '', p.lastPaidDueDate || '']; };

/** FA-4B (month-end): one calendar month keeps the day or clamps to the month's last day; rollover counts months from the stored date. */
function fa4bMonthEnd() {
  scenario('FA-4B MONTH-END — calendar-safe month steps', () => {
    const app = new App(baseState(), '2026-06-10');
    const cases = [['2026-01-31', 1, '2026-02-28'], ['2028-01-31', 1, '2028-02-29'], ['2026-03-31', 1, '2026-04-30'], ['2026-04-30', 1, '2026-05-30'],
      ['2028-02-29', 1, '2028-03-29'], ['2026-12-31', 1, '2027-01-31'], ['2026-06-15', 1, '2026-07-15'], ['2026-01-31', 3, '2026-04-30'],
      ['2026-06-10', 12, '2027-06-10'], ['2028-02-29', 12, '2029-02-28'], ['2100-01-31', 1, '2100-02-28'], ['2000-01-31', 1, '2000-02-29'],
      ['2026-02-30', 1, ''], ['2026-13-01', 1, ''], ['2026-6-5', 1, ''], ['soon', 1, ''], ['', 1, '']];
    invariant('FA4B.month.add', 'geodeIsoDateAddMonths: day kept or clamped to the target month\'s last day (leap years included); not a real date → \'\'',
      cases.map(c => [c[0], c[1], app.call('geodeIsoDateAddMonths', [c[0], c[1]])]), cases);
  });
  scenario('FA-4B MONTH-END — rollover of an unpaid monthly payment and a monthly expense due 31 January', () => {
    const dates = clock => {
      const app = new App(baseState({ payments: [{ id: 'r', name: 'Rent', amount: 500, status: 'upcoming', rec: 'yes', date: '2026-01-31' }],
        expenses: [{ id: 'e', name: 'Phone', amount: 20, cat: 'subs', rec: 'yes', date: '2026-01-31' }] }), clock);
      return [clock, app.state().payments[0].date, app.state().expenses[0].date];
    };
    invariant('FA4B.month.rollup', 'Opened in February → 28 Feb (setMonth made it 3 March, skipping February); March → 31 Mar; April → 30 Apr (setMonth: 3 April)',
      ['2026-02-10', '2026-03-05', '2026-04-05'].map(dates),
      [['2026-02-10', '2026-02-28', '2026-02-28'], ['2026-03-05', '2026-03-31', '2026-03-31'], ['2026-04-05', '2026-04-30', '2026-04-30']]);
  });
}

/** FA-4B (D8): completing a recurring row records the due date it advanced from (lastPaidDueDate); undo restores exactly that date, only while it still applies. */
function fa4bUndo() {
  const timelines = {};
  MODES.forEach(mode => scenario('FA-4B UNDO — monthly Holiday £100 due 15 June: complete / undo twice, then July [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15');
    const seen = [];
    const step = label => { if (mode === 'reload') app.reload(); seen.push(lifecycle(app, id)); app.snap(label); };
    app.toggle(id); step('complete 1');
    app.toggle(id); step('undo 1');
    app.toggle(id); step('complete 2');
    app.toggle(id); step('undo 2');
    invariant('FA4B.undo.cycle', 'Each completion records 15 June and advances to 15 July; each undo restores 15 June and drops the record (persisted across reloads)',
      seen, [['paid', '2026-07-15', '2026-06', '2026-06-15'], ['upcoming', '2026-06-15', '', ''], ['paid', '2026-07-15', '2026-06', '2026-06-15'], ['upcoming', '2026-06-15', '', '']]);
    invariant('FA4B.undo.ledger', 'Contribution events: completion, reversal, completion, reversal, all 2026-06; Holiday back to £1,000',
      [evRows(app).map(r => r[0] + ' ' + r[3]), app.snap().goal.gH], [['completion 2026-06', 'reversal 2026-06', 'completion 2026-06', 'reversal 2026-06'], 1000]);
    app.at('2026-06-20'); app.toggle(id);
    app.advance('2026-07-02', mode); const rolled = lifecycle(app, id); app.snap('Jul 02 rollover');
    app.at('2026-07-15'); app.toggle(id); const julyDone = lifecycle(app, id); app.snap('Jul 15 complete');
    app.toggle(id); app.snap('Jul 15 undo');
    invariant('FA4B.undo.july', 'Completed again in June, the July rollover makes it the July occurrence and drops the June record; completing July advances to 15 August and undo restores 15 July — never August',
      [rolled, julyDone, lifecycle(app, id)], [['upcoming', '2026-07-15', '', ''], ['paid', '2026-08-15', '2026-07', '2026-07-15'], ['upcoming', '2026-07-15', '', '']]);
    timelines[mode] = app.timeline;
  }));
  scenario('FA-4B UNDO — same-session vs reload', () => parity('FA4B.undo.parity', 'FA-4B UNDO', timelines, undefined, ''));

  MODES.forEach(mode => scenario('FA-4B UNDO — month-end rent £500 due 31 January [' + mode + ']', () => {
    const app = new App(baseState(), '2026-01-20');
    const id = app.contribute({ name: 'Rent', amount: 500, date: '2026-01-31', status: 'upcoming', rec: 'yes' });
    app.toggle(id); if (mode === 'reload') app.reload();
    const done = lifecycle(app, id);
    app.toggle(id); if (mode === 'reload') app.reload();
    invariant('FA4B.undo.month-end', '31 Jan completed → 28 Feb (31 Jan recorded); undo → 31 Jan, the recorded date, not one month before 28 Feb',
      [done, lifecycle(app, id)], [['paid', '2026-02-28', '2026-01', '2026-01-31'], ['upcoming', '2026-01-31', '', '']]);
    app.toggle(id); app.advance('2026-02-03', mode);
    const feb = lifecycle(app, id);
    app.at('2026-02-20'); app.toggle(id);
    invariant('FA4B.undo.month-end.next', 'February is the 28 Feb occurrence; completing it advances one month from the stored day (28 Mar)',
      [feb, lifecycle(app, id)], [['upcoming', '2026-02-28', '', ''], ['paid', '2026-03-28', '2026-02', '2026-02-28']]);
  }));

  scenario('FA-4B UNDO — annual rows', () => {
    let { app, id } = completedAnnual('2026-06-10', '2026-06-10');
    const done = lifecycle(app, id);
    app.toggle(id);
    const same = lifecycle(app, id);
    ({ app, id } = completedAnnual('2026-06-10', '2026-06-10'));
    app.advance('2026-12-01', 'reload'); app.toggle(id);
    const later = lifecycle(app, id);
    const leap = new App(baseState(), '2028-02-10');
    const lid = leap.contribute({ name: 'Licence', amount: 90, date: '2028-02-29', status: 'upcoming', rec: 'annual' });
    leap.toggle(lid); const leapDone = lifecycle(leap, lid); leap.toggle(lid);
    invariant('FA4B.undo.annual', 'Annual: completing 10 June 2026 records it and advances to 10 June 2027; undo the same day, or in December 2026 (same occurrence), restores 10 June 2026 instead of skipping a year; 29 Feb 2028 → 28 Feb 2029, undo → 29 Feb 2028',
      [done, same, later, leapDone, lifecycle(leap, lid)],
      [['paid', '2027-06-10', '2026-06', '2026-06-10'], ['upcoming', '2026-06-10', '', ''], ['upcoming', '2026-06-10', '', ''],
        ['paid', '2029-02-28', '2028-02', '2028-02-29'], ['upcoming', '2028-02-29', '', '']]);
  });

  scenario('FA-4B UNDO — a stale or malformed lastPaidDueDate never rewinds a row', () => {
    const app = new App(baseState(), '2026-06-20');
    const row = o => Object.assign({ id: 'x', status: 'paid', rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15', lastPaidDueDate: '2026-06-15' }, o);
    const cases = [
      ['valid record', row({}), '2026-06-15'],
      ['invalid string', row({ lastPaidDueDate: 'soon' }), ''],
      ['impossible date', row({ lastPaidDueDate: '2026-02-30' }), ''],
      ['unrelated old date', row({ lastPaidDueDate: '2025-01-15' }), ''],
      ['earlier occurrence', row({ lastPaidDueDate: '2026-05-15' }), ''],
      ['date edited after completion', row({ date: '2026-07-20' }), ''],
      ['no completion month', row({ lastPaidYM: '' }), ''],
      ['future completion month', row({ lastPaidYM: '2026-09' }), ''],
      ['annual row, one-month step', row({ rec: 'annual' }), ''],
      ['annual row, valid record', row({ rec: 'annual', date: '2027-06-15' }), '2026-06-15'],
      ['one-off row', row({ rec: 'no' }), ''],
      ['row not paid', row({ status: 'upcoming' }), ''],
      ['no record', row({ lastPaidDueDate: undefined }), '']
    ];
    invariant('FA4B.stale.matrix', 'geodePaymentUndoDueDate restores only a valid record whose one-step advance is the current date, with a trusted completion month, on a paid monthly/annual row',
      cases.map(c => [c[0], app.call('geodePaymentUndoDueDate', [c[1]])]), cases.map(c => [c[0], c[2]]));
    app.at('2026-07-03');
    invariant('FA4B.stale.progressed', 'In July 2026 (the next due month) the June record no longer applies, even on a row still marked paid', app.call('geodePaymentUndoDueDate', [row({})]), '');
    const tapped = [['unrelated old date', '2025-01-15'], ['earlier occurrence', '2026-05-15'], ['invalid string', 'soon']].map(c => {
      const a = new App(baseState({ payments: [{ id: 'b', name: 'Gym', amount: 40, status: 'paid', rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15', lastPaidDueDate: c[1] }] }), '2026-06-20');
      a.toggle('b');
      return [c[0], lifecycle(a, 'b')];
    });
    invariant('FA4B.stale.tap', 'Undo with a stale or malformed record keeps today\'s safe behaviour — the due date stays 15 July — and drops the record',
      tapped, tapped.map(t => [t[0], ['upcoming', '2026-07-15', '', '']]));
  });
}

/** FA-4B (D11): an annual completion counts in the month it was paid; the row becomes the next occurrence when its next due month arrives (not investment rows). */
function fa4bAnnual() {
  const timelines = {};
  MODES.forEach(mode => scenario('FA-4B ANNUAL — annual insurance £250 due 10 June 2026, through June 2027 [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'Insurance', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual' });
    app.at('2026-06-10'); app.toggle(id);
    let s = app.snap('Jun 2026 completed');
    invariant('FA4B.annual.bill.june', 'June 2026 completed: paid for 2026-06, next due 10 June 2027; it counts in June\'s Monthly Left and confirmed Left (£2,750)',
      [lifecycle(app, id), s.left, s.leftConfirmed], [['paid', '2027-06-10', '2026-06', '2026-06-10'], 2750, 2750]);
    const held = ['2026-07-02', '2026-12-01', '2027-01-04', '2027-05-31'].map(d => { app.advance(d, mode); const x = app.snap(d); return [d, lifecycle(app, id)[0], x.left]; });
    invariant('FA4B.annual.bill.held', 'July 2026 to May 2027, the year change included: still the paid 2026 occurrence, costing nothing (£3,000)',
      held, ['2026-07-02', '2026-12-01', '2027-01-04', '2027-05-31'].map(d => [d, 'paid', 3000]));
    app.advance('2027-06-01', mode); s = app.snap('Jun 2027 next occurrence');
    invariant('FA4B.annual.bill.reset', 'June 2027, the next due month: the upcoming 2027 occurrence (record dropped), counted in Monthly Left (£2,750)',
      [lifecycle(app, id), s.left], [['upcoming', '2027-06-10', '', ''], 2750]);
    app.at('2027-06-10'); app.toggle(id); s = app.snap('Jun 2027 completed');
    invariant('FA4B.annual.bill.tap', 'A tap in June 2027 completes 2027 (next due 10 June 2028), still £2,750; a bill records no contribution or debt events',
      [lifecycle(app, id), s.left, (app.events() || []).length, (app.state().debtPaymentEvents || []).length], [['paid', '2028-06-10', '2027-06', '2027-06-10'], 2750, 0, 0]);
    timelines[mode] = app.timeline;
  }));
  scenario('FA-4B ANNUAL — same-session vs reload', () => parity('FA4B.annual.parity', 'FA-4B ANNUAL', timelines, undefined, ''));

  MODES.forEach(mode => scenario('FA-4B ANNUAL — annual Holiday £250: the 2026 completion survives the 2027 occurrence [' + mode + ']', () => {
    const { app, id, event } = completedAnnual('2026-06-10', '2026-06-10');
    app.advance('2027-05-31', mode);
    const may = [lifecycle(app, id)[0], app.snap().goal.gH];
    app.advance('2027-06-01', mode);
    invariant('FA4B.annual.goal.reset', 'May 2027: still paid for 2026 (Holiday £1,250). June 2027: the upcoming 2027 occurrence; the 2026 completion is the only event, active and unreversed; Holiday £1,250',
      [may, lifecycle(app, id), app.events(), app.activeEvents().map(e => e.id), app.snap().goal.gH],
      [['paid', 1250], ['upcoming', '2027-06-10', '', ''], [event], [event.id], 1250]);
    app.at('2027-06-10'); app.toggle(id); app.toggle(id);
    invariant('FA4B.annual.goal.undo-2027', 'Completing then undoing 2027 reverses only the 2027 completion and restores 10 June 2027; 2026 stays active; Holiday £1,250',
      [lifecycle(app, id), evRows(app).slice(1).map(r => r[0] + ' ' + r[3]), app.activeEvents().map(e => e.occurrenceYm), app.snap().goal.gH],
      [['upcoming', '2027-06-10', '', ''], ['completion 2027-06', 'reversal 2027-06'], ['2026-06'], 1250]);
  }));

  scenario('FA-4B ANNUAL — annual card fee £250 linked to a debt: occurrence lifecycle only', () => {
    const app = new App(baseState({ debts: [{ id: 'dC', name: 'Card', balance: 2000, apr: 20, minp: 50 }] }), '2026-06-05');
    const id = app.contribute({ name: 'Card annual fee', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', debtId: 'dC' });
    app.at('2026-06-10'); app.toggle(id);
    const june = [lifecycle(app, id), app.snap().left, app.state().debts[0].balance, (app.state().debtPaymentEvents || []).length];
    app.advance('2027-06-01', 'reload');
    invariant('FA4B.annual.debt', 'June 2026: counts (£2,750); Card stays £2,000 and no debt payment event is recorded for an annual row. June 2027: the upcoming 2027 occurrence; Card £2,000; still no debt events',
      [june, [lifecycle(app, id), app.state().debts[0].balance, (app.state().debtPaymentEvents || []).length]],
      [[['paid', '2027-06-10', '2026-06', '2026-06-10'], 2750, 2000, 0], [['upcoming', '2027-06-10', '', ''], 2000, 0]]);
  });

  MODES.forEach(mode => scenario('FA-4B ANNUAL — annual ISA £250 keeps today\'s lifecycle (FA-7) [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA annual', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    let s = app.snap();
    const june = [lifecycle(app, id), s.left, s.inv.iA];
    app.advance('2027-06-01', mode); s = app.snap();
    invariant('FA4B.annual.invest', 'June 2026: counts in Monthly Left (£2,750), ISA £5,250. June 2027: NOT reset — still paid for 2026-06, ISA £5,250, and counted by its due date as before (£2,750)',
      [june, [lifecycle(app, id), s.left, s.inv.iA]],
      [[['paid', '2027-06-10', '2026-06', '2026-06-10'], 2750, 5250], [['paid', '2027-06-10', '2026-06', '2026-06-10'], 2750, 5250]]);
  }));

  scenario('FA-4B ANNUAL — the next occurrence begins in the next due month, no sooner', () => {
    const { app, id } = completedAnnual('2026-03-10', '2026-06-10');
    const seen = ['2026-07-01', '2026-12-01', '2027-01-04', '2027-02-27', '2027-03-01'].map(d => { app.advance(d, 'reload'); return [d, lifecycle(app, id)[0]]; });
    invariant('FA4B.annual.timing', 'Completed late (June 2026, due March, next due 10 March 2027): paid through July, December, the year change and February; upcoming from March 2027',
      seen, [['2026-07-01', 'paid'], ['2026-12-01', 'paid'], ['2027-01-04', 'paid'], ['2027-02-27', 'paid'], ['2027-03-01', 'upcoming']]);
  });

  scenario('FA-4B LABEL — payment rows name their recurrence', () => {
    invariant('FA4B.label', 'rPayments: rec yes → Monthly, annual → Annual, anything else → One-off',
      extractFunction(PROGRAM.src, 'rPayments').text.indexOf("(p.rec === 'yes' ? 'Monthly' : p.rec === 'annual' ? 'Annual' : 'One-off')") >= 0, true);
  });
}

/**
 * FA-4C (D9, Option B): a completed occurrence keeps the amount it was completed at (lastPaidAmount). Editing a recurring
 * row while it is paid changes its template - later occurrences - only; undo, edit, complete again corrects the amount.
 */
function fa4cOccurrenceAmount() {
  const row = (app, id) => app.state().payments.filter(p => p.id === id)[0];
  const amounts = (app, id) => { const p = row(app, id); return [p.amount, 'lastPaidAmount' in p ? p.lastPaidAmount : 'absent']; };
  const timelines = {};
  MODES.forEach(mode => scenario('FA-4C TEMPLATE — monthly Holiday £100 completed 15 June, edited to £150 while paid, through July [' + mode + ']', () => {
    const STEP = { label: 'Catch up on Holiday', amount: 100 };
    const app = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05', PROGRAM.plan);
    app.setPlan([STEP]);
    const plan = () => { const v = app.planView(STEP); return { applied: v.applied, scheduled: v.scheduled }; };
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    const event = app.events()[0], completed = [lifecycle(app, id), amounts(app, id)];
    app.editPayment(id, { amount: 150 });
    if (mode === 'reload') app.reload();
    let s = app.snap('Jun edited');
    invariant('FA4C.template.row', 'Completing records lastPaidAmount £100; the paid edit makes the row (template) £150 and keeps lastPaidAmount £100, status, due date, lastPaidYM and lastPaidDueDate',
      [completed, [lifecycle(app, id), amounts(app, id)]],
      [[['paid', '2026-07-15', '2026-06', '2026-06-15'], [100, 100]], [['paid', '2026-07-15', '2026-06', '2026-06-15'], [150, 100]]]);
    invariant('FA4C.template.event', 'The June completion stays active at £100 and pointed to; the edit appends no reversal and no replacement',
      [evRows(app), app.activeEvents().map(e => e.amount), app.pointer(id)], [[['completion', id, 'goal:gH', '2026-06', 100, 'monthly', 'mark_completed']], [100], event.id]);
    invariant('FA4C.template.june', 'June: Holiday £1,100; Monthly Left and confirmed Left £2,900; Plan applied £100 - the amount actually completed',
      [s.goal.gH, s.left, s.leftConfirmed, plan()], [1100, 2900, 2900, { applied: 100, scheduled: 0 }]);
    app.advance('2026-07-02', mode); s = app.snap('Jul 02');
    invariant('FA4C.template.july', 'July: the upcoming July occurrence is £150 and lastPaidAmount is cleared by the monthly reset; Monthly Left £2,850, Plan sees £150 scheduled; June stays £100 (Holiday £1,100)',
      [lifecycle(app, id), amounts(app, id), s.left, plan(), s.goal.gH, evRows(app).length],
      [['upcoming', '2026-07-15', '', ''], [150, 'absent'], 2850, { applied: 0, scheduled: 150 }, 1100, 1]);
    app.at('2026-07-15'); app.toggle(id); s = app.snap('Jul 15 completed');
    invariant('FA4C.template.july-complete', 'Completing July records £150 for 2026-07 beside June\'s £100: Holiday £1,250, Monthly Left £2,850, lastPaidAmount £150',
      [evRows(app).map(r => [r[0], r[3], r[4]]), s.goal.gH, s.left, amounts(app, id)],
      [[['completion', '2026-06', 100], ['completion', '2026-07', 150]], 1250, 2850, [150, 150]]);
    timelines[mode] = app.timeline;
  }));
  scenario('FA-4C TEMPLATE — same-session vs reload', () => parity('FA4C.template.parity', 'FA-4C TEMPLATE', timelines, undefined, ''));

  scenario('FA-4C PREVIEW — the payment form previews what saving does to this month', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    const preview = (p, amount) => {
      app.run('__fields = ' + JSON.stringify({ 'geode-pay-impact-host': '', pn: p.name, pa: String(amount), pd: p.date, ps: p.status, prec: p.rec, pglid: 'gH', geode_pay_edit_id: p.id }) +
        '; __impact = null; geodeRenderModalImpactBlock = function (line1, sentence) { __impact = [line1, sentence]; return ""; };');
      app.call('geodePayModalImpactRefresh');
      return JSON.parse(app.run('JSON.stringify(__impact)'));
    };
    const upcoming = preview(row(app, id), 150);
    app.at('2026-06-15'); app.toggle(id);
    invariant('FA4C.preview', 'Scheduled £100 → £150 previews Monthly Left £2,900 → £2,850; once June is completed, the same edit is a template change and previews no change to this month',
      [upcoming, preview(row(app, id), 150)],
      [['Left this month: £2900 → £2850', 'This lowers left this month on your plan.'], ['', 'Won\u2019t change left this month as entered.']]);
  });

  scenario('FA-4C CORRECTION — undo, edit, complete again', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    const first = app.events()[0];
    app.toggle(id);
    const undone = [lifecycle(app, id), amounts(app, id), evRows(app).slice(1)];
    app.editPayment(id, { amount: 120 }); app.toggle(id);
    const s = app.snap();
    invariant('FA4C.correction', 'Undo reverses the £100 completion and clears lastPaidAmount; edited to £120 and completed again, June is a new £120 completion (lastPaidAmount £120): Holiday £1,120, Monthly Left £2,880',
      [undone, evRows(app).slice(2), app.activeEvents().map(e => [e.occurrenceYm, e.amount]), amounts(app, id), s.goal.gH, s.left],
      [[['upcoming', '2026-06-15', '', ''], [100, 'absent'], [['reversal', id, 'goal:gH', '2026-06', first.id, 'mark_completed']]],
        [['completion', id, 'goal:gH', '2026-06', 120, 'monthly', 'mark_completed']], [['2026-06', 120]], [120, 120], 1120, 2880]);
  });

  scenario('FA-4C TEMPLATE — a relink while paid moves the completed amount, not the template', () => {
    const app = new App(baseState({ goals: [HOLIDAY(), CAR()] }), '2026-06-05');
    const id = monthlyHoliday(app);
    app.at('2026-06-15'); app.toggle(id);
    const first = app.events()[0];
    app.editPayment(id, { goalId: 'gB', amount: 150 });
    const s = app.snap();
    invariant('FA4C.template.relink', 'Holiday → Car with £150 while paid: the June completion moves at its £100 (reversal, then Car completion 2026-06 £100); row £150, lastPaidAmount £100; Holiday £1,000, Car £600',
      [evRows(app).slice(1), amounts(app, id), s.goal.gH, s.goal.gB],
      [[['reversal', id, 'goal:gH', '2026-06', first.id, 'payment_form'], ['completion', id, 'goal:gB', '2026-06', 100, 'monthly', 'payment_form']], [150, 100], 1000, 600]);
  });

  scenario('FA-4C BILL — monthly phone bill £100 completed in June, edited to £150 while paid', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'Phone', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes' });
    app.at('2026-06-15'); app.toggle(id); app.editPayment(id, { amount: 150 });
    const june = [app.snap().left, amounts(app, id)];
    app.advance('2026-07-02', 'reload');
    const july = [lifecycle(app, id), amounts(app, id), app.snap().left];
    app.at('2026-07-15'); app.toggle(id);
    invariant('FA4C.bill', 'June stays £100 (Monthly Left £2,900; row £150, lastPaidAmount £100); July\'s occurrence is £150 (£2,850) and completing it keeps £2,850; no contribution or debt events',
      [june, july, [app.snap().left, amounts(app, id)], app.events().length, app.state().debtPaymentEvents.length],
      [[2900, [150, 100]], [['upcoming', '2026-07-15', '', ''], [150, 'absent'], 2850], [2850, [150, 150]], 0, 0]);
  });

  scenario('FA-4C DEBT — monthly card payment £100 completed in June, edited to £150 while paid', () => {
    const app = new App(baseState({ debts: [{ id: 'dC', name: 'Card', balance: 2000, apr: 20, minp: 50 }] }), '2026-06-05', PROGRAM.plan);
    const id = app.contribute({ name: 'Card payment', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', debtId: 'dC' });
    const debtEvents = () => app.state().debtPaymentEvents.map(e => [e.eventType, e.occurrenceYm, e.amount]);
    app.at('2026-06-15'); app.toggle(id); app.editPayment(id, { amount: 150, debtId: 'dC' });
    const june = [debtEvents(), app.state().debts[0].balance, app.snap().left, amounts(app, id), app.call('geodeSumPaymentsForDebtThisMonth', [app.state(), 'dC'])];
    app.advance('2026-07-02', 'reload');
    const july = [amounts(app, id), app.snap().left];
    app.at('2026-07-15'); app.toggle(id);
    invariant('FA4C.debt', 'June: the debt payment event stays £100, Card stays £2,000 (user/provider authority), Monthly Left £2,900, Plan extra above the £50 minimum £50 (from the £100 paid). July: £150 occurrence (£2,850); completing it records a £150 July event; Card still £2,000',
      [june, july, debtEvents(), app.state().debts[0].balance],
      [[[['completion', '2026-06', 100]], 2000, 2900, [150, 100], 50], [[150, 'absent'], 2850], [['completion', '2026-06', 100], ['completion', '2026-07', 150]], 2000]);
  });

  scenario('FA-4C ANNUAL — annual insurance £250 completed 10 June 2026, edited to £300 the same month', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'Insurance', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual' });
    app.at('2026-06-10'); app.toggle(id); app.editPayment(id, { amount: 300 });
    const june = [lifecycle(app, id), amounts(app, id), app.snap().left];
    app.advance('2026-07-02', 'reload');
    const july = [lifecycle(app, id)[0], app.snap().left];
    app.advance('2027-06-01', 'reload');
    const next = [lifecycle(app, id), amounts(app, id), app.snap().left];
    app.at('2027-06-10'); app.toggle(id);
    invariant('FA4C.annual.bill', 'June 2026 stays £250 (Monthly Left £2,750; row £300, lastPaidAmount £250, due date and lastPaidDueDate unchanged); July £3,000; June 2027: the annual reset clears lastPaidAmount and the upcoming 2027 occurrence is £300 (£2,700); completing it records lastPaidAmount £300, next due June 2028',
      [june, july, next, [lifecycle(app, id), amounts(app, id), app.snap().left]],
      [[['paid', '2027-06-10', '2026-06', '2026-06-10'], [300, 250], 2750], ['paid', 3000], [['upcoming', '2027-06-10', '', ''], [300, 'absent'], 2700],
        [['paid', '2028-06-10', '2027-06', '2027-06-10'], [300, 300], 2700]]);
  });

  scenario('FA-4C ANNUAL — annual Holiday £250 completed June 2026, edited to £300 in June', () => {
    const { app, id, event } = completedAnnual('2026-06-10', '2026-06-10');
    app.editPayment(id, { amount: 300 });
    const june = [evRows(app), amounts(app, id), app.snap().goal.gH, app.snap().left];
    app.advance('2027-06-05', 'reload');
    app.at('2027-06-10'); app.toggle(id);
    invariant('FA4C.annual.goal', 'June 2026: the completion stays £250 (no event), Holiday £1,250, Monthly Left £2,750; June 2027 completes at £300 beside it - Holiday £1,550',
      [june, app.activeEvents().map(e => [e.occurrenceYm, e.amount]), app.snap().goal.gH],
      [[[evRow(event)], [300, 250], 1250, 2750], [['2026-06', 250], ['2027-06', 300]], 1550]);
  });

  scenario('FA-4C LEGACY — rows completed before lastPaidAmount existed', () => {
    const legacy = () => new App(baseState({
      debts: [{ id: 'dC', name: 'Card', balance: 2000, apr: 20, minp: 50 }],
      payments: [{ id: 'b', name: 'Gym', amount: 40, status: 'paid', rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15' },
        { id: 'd', name: 'Card payment', amount: 100, status: 'paid', rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15', debtId: 'dC', payKind: 'debt' }]
    }), '2026-06-20');
    const app = legacy();
    const read = [app.snap().left, amounts(app, 'b'), amounts(app, 'd')];
    app.editPayment('b', {}); app.editPayment('d', { debtId: 'dC' });
    const unchanged = [amounts(app, 'b'), amounts(app, 'd'), app.snap().left];
    app.editPayment('b', { amount: 60 }); app.editPayment('d', { amount: 150, debtId: 'dC' });
    const edited = [amounts(app, 'b'), amounts(app, 'd'), app.snap().left, app.state().debts[0].balance];
    app.advance('2026-07-02', 'reload');
    invariant('FA4C.legacy', 'Without lastPaidAmount the row amount is used (Monthly Left £2,860, no £0 or NaN); a save with nothing changed writes nothing; the first paid amount edit keeps the amount the row was completed at as lastPaidAmount (Gym £40, card £100: still £2,860, Card £2,000); July uses the new amounts (£2,790)',
      [read, unchanged, edited, [amounts(app, 'b'), amounts(app, 'd'), app.snap().left]],
      [[2860, [40, 'absent'], [100, 'absent']], [[40, 'absent'], [100, 'absent'], 2860], [[60, 40], [150, 100], 2860, 2000], [[60, 'absent'], [150, 'absent'], 2790]]);
  });

  scenario('FA-4C AMOUNT — geodePaymentMonthAmount reads lastPaidAmount only for this month\'s paid recurring occurrence', () => {
    const app = new App(baseState(), '2026-07-10');
    const paid = o => Object.assign({ status: 'paid', rec: 'yes', lastPaidYM: '2026-07', date: '2026-08-15', amount: 150, lastPaidAmount: 100 }, o);
    const cases = [
      ['monthly, completed this month', paid({}), 100],
      ['annual, completed this month', paid({ rec: 'annual', date: '2027-07-15' }), 100],
      ['completed last month (stale)', paid({ lastPaidYM: '2026-06' }), 150],
      ['no completion month', paid({ lastPaidYM: '' }), 150],
      ['upcoming', paid({ status: 'upcoming', lastPaidYM: '' }), 150],
      ['one-off', paid({ rec: 'no' }), 150],
      ['no lastPaidAmount', paid({ lastPaidAmount: undefined }), 150],
      ['lastPaidAmount 0', paid({ lastPaidAmount: 0 }), 150],
      ['lastPaidAmount negative', paid({ lastPaidAmount: -5 }), 150],
      ['lastPaidAmount text', paid({ lastPaidAmount: '100' }), 150],
      ['lastPaidAmount null', paid({ lastPaidAmount: null }), 150],
      ['row amount not a number', paid({ amount: 'abc', lastPaidAmount: undefined }), 0]
    ];
    invariant('FA4C.amount.matrix', 'Only a positive numeric lastPaidAmount on a paid monthly/annual row completed this month replaces the row amount; anything else falls back to the row amount (never NaN)',
      cases.map(c => [c[0], app.call('geodePaymentMonthAmount', [c[1]])]), cases.map(c => [c[0], c[2]]));
  });

  scenario('FA-4C INVESTMENT — monthly ISA £100 completed in June, edited to £150 while paid', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA monthly', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    app.at('2026-06-15'); app.toggle(id);
    const event = app.events()[0];
    app.editPayment(id, { amount: 150 });
    const s = app.snap();
    invariant('FA4C.invest.occurrence', 'The investment completion stays £100 (no reversal or replacement), row £150 with lastPaidAmount £100, June Monthly Left £2,900; baseBalance untouched (£5,000)',
      [evRows(app), app.pointer(id), amounts(app, id), s.left, app.state().investments[0].baseBalance],
      [[['completion', id, 'investment:iA', '2026-06', 100, 'monthly', 'mark_completed']], event.id, [150, 100], 2900, 5000]);
    invariant('FA4C.invest.legacy-balance', 'ISA £5,100: since FA-7B the position reads the June completion (£100), not the edited template (£150) — the template edit no longer moves it', s.inv.iA, 5100);
  });
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
    invariant('PA.G2.result', 'User £30 kept; Plan £40 added (id2: the boot transition dated the paid £50 as cev_id1); scheduled £70 + paid £50 = £120',
      [unpaid(app), v.scheduled, v.applied, app.snap().left, v.label], [[['u1', 'yes', 30, true], ['id2', 'yes', 40, false]], 70, 50, 2880, 'Adjust scheduled amount']);
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
    invariant('PA.BUF.partial', 'User £30 kept; Plan £40 added (id2: the boot transition dated the paid £50 as cev_id1); paid £50 + scheduled £70 = £120', [unpaid(partial), pv.applied, pv.scheduled, pv.label],
      [[['u1', 'yes', 30, true], ['id2', 'yes', 40, false]], 50, 70, 'Adjust scheduled amount']);
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
    invariant('R1.jul', 'July £100 completion is visible: position £1,000 + June £100 + July £100 − release £1,100 (D7 closed by FA-3C-C)', app.snap().goal.gH, 100);
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
    app.reload();
    invariant('FA2.G.recurring-refused', 'Schema 2 (FA-3C-C): the June completion is a dated event, so the FA-2 refusal is no longer needed — £1,250 → £1,180 stores base £930 (£1,180 − dated £250) and shows £1,180, also after reload; rows, releases and activity unchanged (the refusal remains the schema-1 fallback)',
      [toasts, [after.goals[0].saved, after.goals[0].baseSaved, app.snap().goal.gH], after.payments, after.savingsReleases, after.activityLog],
      [[], [1180, 930, 1180], before.payments, before.savingsReleases, before.activityLog]);
    const never = crossMonth(freshApp(holidayMonthly), 'goal', 'gH');
    app = freshApp(holidayMonthly);
    app.renameGoal('gH', 'Summer holiday');
    const edited = crossMonth(app, 'goal', 'gH');
    invariant('FA2.G.recurring-rollover', 'Rename: same timeline as never editing (no FA-2 base change)', edited, never);
    invariant('FA2.G.recurring-rollover.d1', 'Rename with a recurring completion: £1,250 holds through July and August (D1 closed by FA-3C-C)', edited, steady(1250));
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
    invariant('FA2.I.never', 'Never edited: £5,200 throughout (FA-7B: the opening anchor £5,000 + the June completion; before it, the one-off row that never resets)', never, steady(5200));
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
    invariant('FA2.I.explicit-up', 'Balance entered as £5,600 shows £5,600 (D10 closed by FA-7B: the earlier £200 is held by the observation)', app.snap().inv.iA, 5600);
    app = freshApp(isaOneOff);
    app.editInvestment('iA', { xb: '4800' });
    invariant('FA2.I.explicit-down', 'Balance entered as £4,800 shows £4,800 (D10 closed by FA-7B)', app.snap().inv.iA, 4800);
    invariant('FA2.I.explicit.activity', 'An explicit Balance change logs its balance_update entry as the observation against the position just before it: £4,800 − £5,200 = −£400 (FA-7B; before it, −£200 against the D10 recompute)', investActivity(app), [{ type: 'invest', delta: -400 }]);
  });
  scenario('FA-2 INVESTMENT — monthly recurring £200 completed in June', () => {
    const never = crossMonth(freshApp(isaMonthly), 'invest', 'iA');
    const app = freshApp(isaMonthly);
    app.saveInvestment('iA', 'ISA renamed');
    const edited = crossMonth(app, 'invest', 'iA');
    invariant('FA2.I.recurring-rollover', 'Rename: same timeline as never editing (no FA-2 base change)', edited, never);
    invariant('FA2.I.recurring-rollover.d1', 'Rename with a recurring completion: £5,200 holds through July and August (D1 closed by FA-7B; before it, both timelines lost June alike)', edited, steady(5200));
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
    invariant('FA3A.reversal', 'The reversed c3 (£50) is not active and its reversal carries no value; in schema 2 the active Holiday completion c1 £100 counts (Holiday £1,100) while the ISA stays legacy at its £5,000 base (investment events are not authority)',
      [app.activeEvents().some(e => e.id === 'c3' || e.id === 'r3'), app.snap().goal.gH, app.snap().inv.iA], [false, 1100, 5000]);
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
    old.data = legacyData(old.data); old.schemaVersion = 1;
    const oldRestored = app.restorable(old);
    const oldApp = new App(oldRestored.state, '2026-06-20');
    oldApp.reload();
    invariant('FA3A.old-backup', 'A backup from before the ledger is accepted; loading it seeds the one completion its paid one-off proves (FA-3B migration), Holiday £1,250',
      [oldRestored.ok, Object.prototype.hasOwnProperty.call(oldRestored.state, 'contributionEvents'), evRows(oldApp), oldApp.snap().goal.gH],
      [true, false, [['completion', 'id1', 'goal:gH', '2026-06', 250, 'one_off', 'migration']], 1250]);
    const lists = JSON.parse(app.run('JSON.stringify([geodeBeyndBackupRestorableKeyWhitelist(), geodeBeyndBackupForbiddenDataKeys()])'));
    invariant('FA3A.backup.lists', 'contributionEvents is restorable, not forbidden and not excluded from export',
      [lists[0].indexOf('contributionEvents') >= 0, lists[1].indexOf('contributionEvents'), env.excludedTopLevelKeys.indexOf('contributionEvents')], [true, -1, -1]);
    const newer = app.restorable(Object.assign({}, env, { schemaVersion: 3 }));
    invariant('FA3A.schema', 'Schema 2 since FA-3C-C (the authority switch): the build and its export are schema 2, and the schema-1 state saved above transitioned; a backup marked newer (3) is refused whole, never extracted without its ledger',
      [app.run('GEODE_SCHEMA_VERSION'), env.schemaVersion, app.state()._schemaVersion, newer.ok, Object.keys(newer.state).length], [2, 2, 2, false, 0]);
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
    invariant('FA3A.rollover.display', 'Schema 2 (FA-3C-C): the June completion is goal authority, so Holiday keeps £1,250 in July and August in both modes (D1 closed; before FA-3C-C the legacy display fell to £1,000)',
      [julyShown, app.snap().goal.gH], [1250, 1250]);
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
    const app = new App(state, '2026-06-20', undefined, { boot: false });
    app.render();
    app.advance('2026-07-02', 'session');
    const july = [evRows(app), app.events().map(e => e.dueDateSnapshot)];
    invariant('FA3A.safety-net', 'Schema 1 (a session that never loaded, so no transition yet): rows completed without capture — the July rollover records each completed monthly goal/ISA row once for June, with no due-date snapshot; one-offs and bills record nothing',
      july, [expected, ['', '']]);
    app.render(); app.reload(); app.advance('2026-08-02', 'reload');
    invariant('FA3A.safety-net.repeat', 'Later renders add nothing; the next load (the schema 1→2 transition) seeds only the paid one-off the safety net leaves to migration; the August rollover adds nothing',
      evRows(app), expected.concat([['completion', 'o', 'goal:gH', '2026-06', 100, 'one_off', 'migration']]));
  });
}

function fa3aProtection() {
  const STEPS = [{ label: 'Catch up on Holiday', amount: 120 }, { label: 'Invest what remains', amount: 120 }];
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
    /** Monthly Left (all and confirmed), Home overdue count and rows — before and after a reload; a variant's integrity report is consumed. Investment balances follow the ledger since FA-7B (FA7B checks). */
    const execution = (state, clock, variant) => {
      const a = new App(state, clock, PROGRAM.plan);
      a.setPlan(STEPS);
      const look = () => { const s = a.snap(); return [s.left, s.leftConfirmed, s.homeOverduePayments, s.rows]; };
      const out = [look(), (a.reload(), look())];
      if (variant) a.warnings.splice(0).filter(w => w.indexOf(INTEGRITY) !== 0).forEach(w => a.warnings.push(w));
      return out;
    };
    const check = (label, clock) => {
      const s = app.state();
      const real = execution(s, clock);
      checks.push([label, real[0][0], same(real, execution(withoutLedger(s), clock, true)) && same(real, execution(withFakeLedger(s), clock, true))]);
    };
    check('June', '2026-06-10');
    app.render(); check('June render', '2026-06-10');
    app.reload(); check('June reload', '2026-06-10');
    app.advance('2026-07-02', 'session'); check('July', '2026-07-02');
    app.reload(); check('July reload', '2026-07-02');
    const labels = ['June', 'June render', 'June reload', 'July', 'July reload'];
    invariant('FA3A.protect.' + key, 'Monthly Left, Home overdue and rows identical with the ledger removed or replaced by £5,000 completions (in schema 2 the ledger is goal authority and, since FA-7B, investment cash-flow evidence, so goal- and investment-derived figures may follow it); Monthly Left ' +
      left.map(v => '£' + v.toLocaleString('en-GB')).join(' / '), checks, labels.map((l, i) => [l, left[i], true]));
  }));

  scenario('FA-3A PROTECTION — release: base £1,000 + one-off £250 + release £200', () => {
    const app = freshApp(a => { holidayOneOff(a); a.release('gH', 200); });
    const ledger = app.events();
    const state = app.state();
    invariant('FA3A.release', 'One £250 completion; the release adds no contribution event and keeps its single record; Holiday £1,050 throughout',
      [evRows(app), state.savingsReleases.length, crossMonth(app, 'goal', 'gH'), app.events()],
      [[['completion', 'id1', 'goal:gH', '2026-06', 250, 'one_off', 'mark_completed']], 1, steady(1050), ledger]);
    const shownAfterReload = s => { const a = new App(s, '2026-06-20'); a.reload(); return [a.snap().goal.gH, a.state().savingsReleases.length, a.warnings.length ? flagged(a) : 'clean']; };
    invariant('FA3A.release.inert', 'The release deducts exactly once whatever the ledger holds: with it, Holiday £1,050 (£1,000 + £250 − £200); removed, £800 (the one-off has no completion, so the integrity report flags it and it does not count); replaced by two £5,000 Holiday completions, £10,800 (£1,000 + £10,000 − £200); one release record each',
      [shownAfterReload(state), shownAfterReload(withoutLedger(state)), shownAfterReload(withFakeLedger(state))], [[1050, 1, 'clean'], [800, 1, true], [10800, 1, 'clean']]);
  });
}

/** An annual Holiday contribution £250 due on `due`, completed on `completedOn`; returns { app, id, event }. */
const completedAnnual = (due, completedOn, program) => {
  const app = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05', program);
  const id = app.contribute({ name: 'Holiday annual', amount: 250, date: due, status: 'upcoming', rec: 'annual', goalId: 'gH' });
  app.at(completedOn); app.toggle(id);
  return { app, id, event: app.events()[0] };
};

/** Annual recurrence lifecycle (D11, repaired in FA-4B). Whatever the row does, each year's completion stays recorded. */
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
    invariant('FA3A.annual.left', 'The June completion still counts in June\'s Monthly Left (£2,750) (D11 closed by FA-4B)', app.snap().left, 2750);
    invariant('FA3A.annual.plan', 'Plan recognises the £250 just completed (D11 closed by FA-4B)', plan(), { applied: 250, scheduled: 0, gap: 0 });
    app.advance('2027-06-05', 'reload');
    invariant('FA3A.annual.next-year', 'June 2027: the row is the upcoming 2027 occurrence and Plan sees it scheduled (D11 closed by FA-4B)', [row().status, plan()],
      ['upcoming', { applied: 0, scheduled: 250, gap: 0 }]);
    invariant('FA3A.annual.ledger', 'A year of renders and reloads leaves the 2026 completion untouched', app.events(), [c]);
    app.at('2027-06-10'); app.toggle(id);
    invariant('FA3A.annual.next-year-tap', 'Tapping the row in June 2027 completes the 2027 occurrence; next due June 2028 (D11 closed by FA-4B)',
      [row().status, row().lastPaidYM, row().date], ['paid', '2027-06', '2028-06-10']);
    const c27 = app.events()[1];
    invariant('FA3A.annual.history-survives-next-year-tap', 'That tap leaves the 2026 completion active and unreversed and records the 2027 completion beside it; the row points at the 2027 one',
      [app.events().length, app.events()[0], evRow(c27), app.activeEvents().map(e => e.id), app.pointer(id)],
      [2, c, ['completion', id, 'goal:gH', '2027-06', 250, 'annual', 'mark_completed'], [c.id, c27.id], c27.id]);
    invariant('FA3A.annual.tap.display', 'Holiday £1,500 after the tap: the still-active 2026 completion plus the 2027 one are goal authority in schema 2', app.snap().goal.gH, 1500);
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
    const edited = [evRows(app), app.pointer(id), lifecycle(app, id), [app.state().payments[0].amount, app.state().payments[0].lastPaidAmount], app.snap().goal.gH];
    app.advance('2027-06-05', 'reload');
    const upcoming27 = [lifecycle(app, id), app.state().payments[0].amount, 'lastPaidAmount' in app.state().payments[0], app.snap().left];
    app.at('2027-06-10'); app.toggle(id);
    invariant('FA3A.annual.edit.same-occurrence', 'Changing it to £300 in July 2026 changes the template only (FA-4C, D9 Option B; before FA-4C it reversed the completion and recorded £300 for the 2026 occurrence): the 2026 completion stays active at £250 and pointed to, no event, lastPaidYM / due date / lastPaidDueDate unchanged, lastPaidAmount £250, Holiday £1,250. June 2027: the upcoming 2027 occurrence is £300 (Monthly Left £2,700); completing it records £300 for 2027-06 beside the 2026 £250 - Holiday £1,550',
      [edited, upcoming27, evRows(app), app.snap().goal.gH],
      [[[evRow(event)], event.id, ['paid', '2027-06-10', '2026-06', '2026-06-10'], [300, 250], 1250],
        [['upcoming', '2027-06-10', '', ''], 300, false, 2700],
        [evRow(event), ['completion', id, 'goal:gH', '2027-06', 300, 'annual', 'mark_completed']], 1550]);
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
    invariant('FA3A.annual.history-survives-next-due', 'Completed late (June 2026, due March, next due ' + nextDue + '): the row became the 2027 occurrence in March 2027, so a tap in April 2027 completes it (2027-04, next due March 2028) and leaves the 2026 completion active and unreversed',
      [nextDue, app.events()[0], evRows(app).slice(1), app.activeEvents().map(e => e.occurrenceYm), app.state().payments[0].date],
      ['2027-03-10', event, [['completion', id, 'goal:gH', '2027-04', 250, 'annual', 'mark_completed']], ['2026-06', '2027-04'], '2028-03-10']);
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
/** lastPaidYM as a pre-FA-3C-B.3a form re-save left it (every save of a paid monthly row stamped the current month): stored data can already hold it. */
const olderBuildStamp = (app, id) => app.run('S.payments.forEach(function (p) { if (p.id === ' + JSON.stringify(id) + ') p.lastPaidYM = currentYM(); }); save();');
const EVENT_RELEASE = { id: 'r_event', sourceType: 'goal', sourceId: 'gH', amount: 200, reason: 'emergency', date: '2026-06-20', ym: '2026-06', relatedYm: '2026-06',
  remainingBalance: 800, createdAt: 1781949600000, confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' };
const LEGACY_RELEASE = { id: 'r_legacy', sourceType: 'goal', sourceId: 'gH', amount: 200, reason: 'manual', date: '2026-05-20', ym: '2026-05', createdAt: 1779271200000,
  confirmedByUser: true };
const PAYMENT_LOG = [{ ts: 1781517600000, type: 'payment', delta: 250, payKind: 'goal', goalId: 'gH', name: 'pm' },
  { ts: 1784109600000, type: 'payment', delta: 250, payKind: 'goal', goalId: 'gH', name: 'pm' }];

/** Loads a stored state in the Plan program: as production does (seeding, then the schema-2 transition), else the legacy schema-1 load. */
const fa3bLoad = (state, clock, seeding) => {
  const app = seeding ? new App(state, clock, PROGRAM.plan) : legacyLoad(state, clock, PROGRAM.plan);
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
    rows: same(withoutLedger(migrated).payments, withoutLedger(legacy.state()).payments),
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

/** Investment completions are captured as for goals; since FA-7B the position is the opening anchor (the legacy figure, M) plus completions after it, so a D1 loss is restored and ambiguous rows stay held by the anchor. */
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
      /** Schema 2 shows the event position for a goal or (since FA-7B) an investment whose legacy load lost a dated completion (D1); everything else shows what the legacy load showed. */
      const restored = /^D1:/.test(why || '');
      const m = restored ? hypothetical : shown;
      invariant(prefix + key, 'Seeds ' + (seeded.length ? seeded.map(s => s[0] + ' ' + s[1] + ' £' + s[2]).join(', ') : 'nothing') +
        '; shown ' + show(shown) + ' by the legacy load and ' + show(m) + ' after the transition and two reloads (stored ' + show(r.stored) + '); every surface ' +
        (restored ? 'follows the restored ' + kind : 'identical to the legacy load') + '; rows unchanged except the pointer; idempotent',
        { seeded: r.seeded, pointers: r.pointers, shown: r.shown, surfaces: r.surfaces, rows: r.rows, idempotent: r.idempotent },
        { seeded: seeded.map(s => [s[0], entity].concat(s.slice(1), ['migration'])), pointers, shown: [shown, m, m, m], surfaces: !restored, rows: true, idempotent: true });
      const text = 'L legacy ' + show(shown) + ' / M after the transition ' + show(r.shown[1]) + ' / E event authority ' + show(r.E);
      const prefixA = kind === 'goal' ? 'FA3B.authority.' : 'FA3B.authority.inv.';
      const goalWhy = restored ? ' — ' + why + ' (CORRECTNESS RESTORATION: M = E)' : ' — ' + why + '; schema 2 keeps the legacy figure as a carry (E leaves carries out)';
      if (shown === hypothetical) invariant(prefixA + key, text + ' — identical', [r.shown[0], r.shown[1], r.E], [shown, m, hypothetical]);
      else if (kind === 'goal') invariant(prefixA + key, text + goalWhy, [r.shown[0], r.shown[1], r.E], [shown, m, hypothetical]);
      else if (restored) invariant(prefixA + key, text + ' — ' + why + ' (CORRECTNESS RESTORATION, FA-7B: the opening anchor holds the legacy base, the dated completion counts after it, M = E)', [r.shown[0], r.shown[1], r.E], [shown, m, hypothetical]);
      else invariant(prefixA + key, text + ' — ' + why + '; FA-7B: the opening anchor holds the legacy figure, M = L (E, base + events, would drop the undated £200; ambiguous rows are FA-7C)', [r.shown[0], r.shown[1], r.E], [shown, m, hypothetical]);
    });
  }));
}

function fa3bOrder() {
  scenario('FA-3B ORDER — migration runs after normalisation and before syncRecurringPayments', () => {
    const load = PROGRAM.structural.load;
    const transition = PROGRAM.src.slice(PROGRAM.src.indexOf('\nfunction geodeSchema2Transition('), PROGRAM.src.indexOf('\nfunction geodeSchema2RecurringResetDue('));
    const at = ['geodeNormalizeContributionEvents(S);', RELEASE_GATE, 'syncRecurringPayments();'].map(c => load.indexOf(c));
    const app = new App(legacyState({ saved: 1250 }, { payments: [legacyPay('pm', { rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-15' })] }), '2026-07-02');
    app.reload();
    const row = app.state().payments[0];
    const june = app.events();
    app.render(); app.reload(); app.advance('2026-08-02', 'reload');
    const seedFirst = transition.indexOf('geodeSeedLegacyContributionEvents();');
    invariant('FA3B.order.before-sync', 'load() runs the schema 1→2 transition — whose first step is the seed, before the carries — between normalisation and the first rollover; June paid row opened in July: its June £250 is seeded by migration (not left to the rollover safety net), stays active through August; the row is then reset with no pointer',
      [at.every((p, i) => p >= 0 && (i === 0 || p > at[i - 1])) && seedFirst >= 0 && seedFirst < transition.indexOf('geodeSchema2TransitionCarryRecords(S)'),
        seededRows(app), app.activeEvents().map(e => e.id), same(app.events(), june), [row.status, row.lastPaidYM, 'contributionEventId' in row]],
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

    const editedRow = (app, seeded, id) => { const p = app.state().payments[0]; return [app.events().length, app.pointer(id) === seeded.id, [p.amount, p.lastPaidAmount], app.snap().goal.gH]; };
    ({ app, seeded } = after(G3, a => a.editPayment('pm', { amount: 150 })));
    const monthly = editedRow(app, seeded, 'pm');
    ({ app, seeded } = after(G2, a => { a.at('2026-09-01'); a.editPayment('pa', { amount: 300 }); }));
    invariant('FA3B.pointer.edit', 'A paid amount edit of a migrated recurring row changes the template only (FA-4C, D9 Option B; before FA-4C it reversed the migrated completion and recorded the new amount for the same occurrence): monthly £100 → £150 in August and annual £250 → £300 in September keep the migrated completion active and pointed to, record no event, and the row (no lastPaidAmount before) keeps its completed amount as lastPaidAmount; Holiday £1,100 / £1,250',
      [monthly, editedRow(app, seeded, 'pa')],
      [[1, true, [150, 100], 1100], [1, true, [300, 250], 1250]]);

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
    invariant('FA3B.pointer.rollover', 'September rollover (session and reload): the migrated August completion survives unchanged and undoubled; the row resets and drops its pointer; Holiday keeps £1,100 from the completion (D1 closed by FA-3C-C; the legacy display fell to £1,000)',
      rolled.map(r => [r[0].length, r[0][0].source, r[1], r[2]]), MODES.map(() => [1, 'migration', ['upcoming', false], 1100]));

    ({ app, seeded } = loaded(G2));
    const pointed = app.pointer('pa') === seeded.id;
    app.advance('2027-06-05', 'reload');
    app.at('2027-06-10'); app.toggle('pa');
    const late = loaded(G2, '2027-07-01');
    invariant('FA3B.pointer.annual', 'Annual: the migrated 2026 completion is pointed at in 2026; a tap in June 2027 completes the 2027 occurrence and leaves the 2026 completion active and unreversed; the same row first opened in July 2027 is seeded for 2026 without a pointer',
      [pointed, app.events()[0], seededRows(app).slice(1), app.activeEvents().map(e => e.occurrenceYm), seededRows(late.app), late.app.pointer('pa')],
      [true, seeded, [['pa', 'goal:gH', '2027-06', 250, 'annual', '2027-06-10', 'mark_completed']], ['2026-06', '2027-06'],
        [['pa', 'goal:gH', '2026-06', 250, 'annual', '', 'migration']], null]);
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
      const migrated = () => { const a = new App(legacyData(native().state()), '2026-06-10'); a.reload(); return a; };
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

    const covered = (setup, damaged) => {
      const a = freshApp(setup); const before = a.events(); a.reload(); a.reload();
      return same(a.events(), before) && before.length > 0 && (damaged ? flagged(a) && a.snap().goal.gH === 1250 : a.warnings.length === 0);
    };
    const importedThenResaved = a => {
      const sched = monthlyHoliday(a);
      a.smartImport([{ name: 'Holiday monthly', amount: 100, date: '2026-06-03', link: 'goal:gH', mergeId: sched }]);
      a.advance('2026-07-02', 'reload');
      a.at('2026-07-10'); a.editPayment(sched, { name: 'Holiday monthly (renamed)' });
    };
    invariant('FA3B.native.covered', 'Payments the ledger has seen seed nothing on load: monthly completed this month; one-off moved to July after completion; the same with its pointer lost (schema 2 flags the row as unowned in the integrity report, repairs nothing and still shows £1,250 from the June completion); a June Smart Import merge re-saved through the form in July (lastPaidYM rewritten to July, no July payment)',
      [covered(holidayMonthly), covered(a => { holidayOneOff(a); a.editPayment('id1', { date: '2026-07-02' }); }),
        covered(a => { holidayOneOff(a); a.editPayment('id1', { date: '2026-07-02' }); a.run('delete S.payments[0].contributionEventId; save();'); }, true),
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
    legacyEnv.data = legacyData(legacyEnv.data); legacyEnv.schemaVersion = 1;
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
    const ambiguousEnv = new App(ambiguous, '2026-08-10').backup();
    ambiguousEnv.data = legacyData(ambiguousEnv.data); ambiguousEnv.schemaVersion = 1;
    const ambiguousBack = restoreLoad(ambiguousEnv, '2026-08-10');
    invariant('FA3B.backup.ambiguous', 'A legacy backup with only ambiguous paid rows restores with no invented event: the transition carries both rows undated and Holiday stays £1,350 at schema 2',
      [ambiguousBack.a.events(), carryRows(ambiguousBack.a.state().contributionCarry).map(c => [c[0], c[3]]), ambiguousBack.a.snap().goal.gH, ambiguousBack.a.state()._schemaVersion],
      [[], [['px', 100], ['pa', 250]], 1350, 2]);
  });

  scenario('FA-3B OBSERVATIONAL — £5,000 fake completions move only goal Saved: never the ISA, Monthly Left or rows', () => {
    const app = fa3bLoad(MIXED, '2026-08-20', true);
    const s = app.state();
    const fake = (id, paymentId, entityType, entityId) => ({ id, eventType: 'completion', paymentId, entityType, entityId, occurrenceYm: '2026-08', amount: 5000,
      recurrence: 'one_off', dueDateSnapshot: '', recordedAt: 1, source: 'fake' });
    const faked = JSON.parse(JSON.stringify(s));
    faked.contributionEvents = faked.contributionEvents.concat([fake('fake-goal', 'p1-ghost', 'goal', 'gH'), fake('fake-inv', 'i1-ghost', 'investment', 'iA'),
      fake('fake-row', 'px', 'goal', 'gH')]);
    const execution = a => { const v = a.snap(); return [v.inv, v.left, v.leftConfirmed, v.homeOverduePayments, v.rows]; };
    const surfaces = state => { const a = fa3bLoad(state, '2026-08-20', true); const direct = execution(a); a.reload(); return [direct, execution(a), a]; };
    const real = surfaces(s), withFake = surfaces(faked);
    const shown = a => [a.snap().goal.gH, a.snap().inv.iA];
    invariant('FA3B.observational.fake-event', 'Three active £5,000 completions (Holiday, ISA, the carried ambiguous row): ISA, Monthly Left, Home overdue and rows identical before and after reload; schema 2 counts both Holiday completions (£1,700 + £10,000 = £11,700) and never the investment one (ISA £5,700)',
      [same(real.slice(0, 2), withFake.slice(0, 2)), shown(real[2]), shown(withFake[2])], [true, [1700, 5700], [11700, 5700]]);
  });
}

// FA-3C-A: payment-level legacy carries and the schema-2 goal position; FA-3C-C makes them goal authority at the transition.

const FA3CA_AT = 1790000000000;
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
    scenario('FA-3C-A AUTHORITY — ' + name, () => {
      const app = fa3bLoad(state, clock, true);
      const legacy = fa3bLoad(state, clock, false).snap().goal.gH;
      const a = authority(app), p = a.goals.gH.parts;
      const dated = app.activeEvents().map(e => e.paymentId);
      const stored = app.state().contributionCarry;
      const schema2 = key === 'monthly-prior-unsynced' ? 1250 : shown;
      const parts = FA3CA_PARTS[key];
      if (round(app.snap().goal.gH) !== round(legacy)) mismatches.push([key, round(legacy), round(app.snap().goal.gH)]);
      app.reload();
      invariant('FA3CA.goal.' + key, 'legacy ' + show(shown) + '; base ' + show(parts[0]) + ' + dated ' + show(parts[1]) + ' + carry ' + show(parts[2]) +
        ' − released ' + show(parts[3]) + ' = schema 2 ' + show(schema2) + ' — ' + (FA3CA_CLASS[key] || 'IDENTICAL') +
        '; the transition stores exactly these carries; no payment both dated and carried; a reload changes nothing; releases untouched',
        { legacy, parts: [p.base, p.dated, p.carry, p.released], shown: [a.goals.gH.shown, app.snap().goal.gH], carries: carryRows(stored),
          both: stored.filter(x => dated.indexOf(x.paymentId) >= 0).length, reload: same(authority(app), a), releases: app.state().savingsReleases.length },
        { legacy: shown, parts, shown: [schema2, schema2], carries: FA3CA_CARRIES[key] || [], both: 0, reload: true, releases: state.savingsReleases.length });
    });
  });
  scenario('FA-3C-A AUTHORITY — the full goal matrix', () => {
    invariant('FA3CA.goal.mismatch-explained', 'Schema-2 goal Saved equals the legacy display for every goal fixture except G4, the intended D1 restoration (£1,000 → £1,250)',
      mismatches, [['monthly-prior-unsynced', 1000, 1250]]);
  });

  scenario('FA-3C-A RELEASE CLAMP — a release larger than the position clamps at £0 exactly as the recompute does', () => {
    const app = fa3bLoad(legacyState({ saved: 0, baseSaved: 100 }, { payments: [legacyPay('px', { amount: 50, rec: 'yes', date: '2026-06-03' })], savingsReleases: [EVENT_RELEASE] }), '2026-08-10', true);
    const a = authority(app);
    invariant('FA3CA.release.clamp', 'Base £100 + ambiguous monthly £50 (carry) − event-derived release £200: shown £0, position £0 (clamped, not −£50)',
      [app.snap().goal.gH, a.goals.gH.parts, a.goals.gH.shown], [0, { base: 100, dated: 0, carry: 50, released: 200 }, 0]);
  });

  scenario('FA-3C-A G4 — June close, first July load', () => {
    const G4 = FA3B_GOALS.filter(c => c[0] === 'monthly-prior-unsynced')[0];
    const app = new App(G4[2], '2026-06-30');
    const june = app.snap().goal.gH;
    app.advance('2026-07-02', 'reload');
    const a = authority(app);
    invariant('FA3CA.g4.restoration', 'June close £1,250; first July load £1,250 — the transition (30 June) dated the June completion, so the July reset keeps it — CORRECTNESS RESTORATION, no carry, no residual (the legacy load showed £1,000)',
      [june, app.snap().goal.gH, seededRows(app), app.state().contributionCarry, a.goals.gH.parts, a.goals.gH.shown, legacyLoad(G4[2], '2026-07-02').snap().goal.gH],
      [1250, 1250, [['pm', 'goal:gH', '2026-06', 250, 'monthly', '', 'migration']], [], { base: 1000, dated: 250, carry: 0, released: 0 }, 1250, 1000]);
  });
}

function fa3caTransition() {
  scenario('FA-3C-A TRANSITION — eligibility, payment identity, idempotency and the investment deferral', () => {
    const app = fa3bLoad(CARRY_MIX, '2026-08-20', true);
    const stored = app.state().contributionCarry;
    const legacy = fa3bLoad(CARRY_MIX, '2026-08-20', false).snap();
    const owners = app.state().payments.filter(p => p.status === 'paid' && Number(p.amount) && ['gH', 'gB'].indexOf(p.goalId) >= 0)
      .map(p => [p.id, [app.activeEvents().some(e => e.paymentId === p.id) && 'dated', stored.some(c => c.paymentId === p.id) && 'carry'].filter(Boolean)]);
    invariant('FA3CA.transition.eligibility', 'The transition carries the paid goal rows no dated completion owns — ambiguous monthly £100, ambiguous annual £250, negative −£50, Car monthly £40; none for the dated one-off, the ISA row or the deleted goal\'s row; every counted goal payment has exactly one owner; Holiday £1,350 and Car £540 as the legacy load showed',
      [carryRows(stored), owners, [legacy.goal.gH, app.snap().goal.gH, legacy.goal.gB, app.snap().goal.gB]],
      [CARRY_MIX_CARRIES, [['p1', ['dated']], ['px', ['carry']], ['pa', ['carry']], ['pn', ['carry']], ['pb', ['carry']]], [1350, 1350, 540, 540]]);

    const other = fa3bLoad(CARRY_MIX, '2026-08-21', true).state().contributionCarry;
    app.reload(); app.render(); app.reload();
    const helper = () => JSON.parse(app.run('JSON.stringify(geodeSchema2TransitionCarryRecords(S))'));
    const afterReloads = [same(app.state().contributionCarry, stored), helper()];
    app.run('S.contributionCarry = [' + JSON.stringify(RESOLUTION('rx', 'carry_px', 'reversed')) + '].concat(S.contributionCarry);');
    invariant('FA3CA.transition.idempotent', 'Carry ids derive from the payment; a transition on another day stores the same carry set; reloads and renders store nothing more, the helper run again creates nothing, and a payment with a resolved carry gets no second one; Holiday stays £1,350',
      [stored.map(c => c.id), same(carryRows(other), carryRows(stored)), afterReloads, helper(), app.snap().goal.gH],
      [['carry_px', 'carry_pa', 'carry_pn', 'carry_pb'], true, [true, []], [], 1350]);

    const inv = fa3bLoad(CARRY_MIX, '2026-08-20', true);
    const candidate = a => JSON.parse(a.run('JSON.stringify(geodeLegacyCarryCandidate(S, S.payments.filter(function (p) { return p.id === "im"; })[0], {}))'));
    const before = [candidate(inv), inv.snap().inv.iA];
    const months = ['2026-09-02', '2026-10-02', '2026-11-02', '2026-12-02', '2027-01-02', '2027-02-02', '2027-03-02', '2027-04-02', '2027-05-02', '2027-06-02', '2027-07-02', '2027-08-02'];
    months.forEach(m => inv.advance(m, 'reload'));
    const im = inv.state().payments.filter(p => p.id === 'im')[0];
    invariant('FA3CA.inv.deferred', 'No investment carry: the transition creates no ISA carry; the ambiguous ISA row stays as evidence through twelve monthly reloads (paid £200, no lastPaidYM, no event, ISA £5,200 — held by its FA-7B opening anchor), so FA-7C can still find the same +£200 candidate',
      [inv.state().contributionCarry.filter(c => c.entityType !== 'goal').length, before, [im.status, im.amount, im.lastPaidYM || '', inv.events().filter(e => e.paymentId === 'im').length],
        candidate(inv), inv.snap().inv.iA],
      [0, [{ paymentId: 'im', entityType: 'investment', entityId: 'iA', kind: 'undated_contribution', amount: 200, recurrence: 'monthly', dueDateSnapshot: '2026-06-05' }, 5200],
        ['paid', 200, '', 0], { paymentId: 'im', entityType: 'investment', entityId: 'iA', kind: 'undated_contribution', amount: 200, recurrence: 'monthly', dueDateSnapshot: '2026-06-05' }, 5200]);

    const GA = FA3B_GOALS.filter(c => c[0] === 'monthly-ambiguous')[0];
    const resaved = new App(GA[2], '2026-08-10');
    resaved.at('2026-08-12'); resaved.editPayment('pm', { name: 'Holiday monthly (renamed)' });
    const kept = resaved.state().payments[0].lastPaidYM;
    olderBuildStamp(resaved, 'pm');
    resaved.reload();
    const aug = [resaved.events().length, resaved.snap().goal.gH, authority(resaved).goals.gH.shown];
    resaved.advance('2026-09-02', 'reload');
    invariant('FA3CA.seed.carry-witnessed', 'A carried amount is never dated again: the GA row with its £100 carry, re-saved through the form in August (lastPaidYM stays empty) and then holding the 2026-08 stamp an older build\'s re-save wrote, gets no migration event on the next load and none at the September reset; Holiday stays £1,100 (the legacy load fell to £1,000 at the reset, D1)',
      [kept, aug, [resaved.events().length, resaved.snap().goal.gH, authority(resaved).goals.gH.shown]], ['', [0, 1100, 1100], [0, 1100, 1100]]);

    const orphan = fa3bLoad(Object.assign(JSON.parse(JSON.stringify(CARRY_MIX)), { contributionCarry: [CARRY('carry_old', 'pOld', { entityId: 'gGone', amount: 300 })] }), '2026-08-20', true);
    const orphanAuth = authority(orphan);
    invariant('FA3CA.orphan', 'No carry for the paid row of a deleted goal; an existing carry whose goal is gone is kept as history but counts toward no goal (Holiday carries £300 = £100 + £250 − £50, Car £40)',
      [orphan.state().contributionCarry.some(c => c.paymentId === 'pg'), orphan.state().contributionCarry.map(c => c.id), orphanAuth.goals.gH.parts.carry, orphanAuth.goals.gB.parts.carry],
      [false, ['carry_old', 'carry_px', 'carry_pa', 'carry_pn', 'carry_pb'], 300, 40]);
  });
}

function fa3caResolutions() {
  scenario('FA-3C-A RESOLUTIONS — each resolution gives what the legacy display gave for the same user action', () => {
    const ACT = legacyState({}, { goals: [Object.assign(HOLIDAY(), { saved: 1100 }), CAR()], payments: [legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })] });
    const DATED = { id: 'cev_dated', eventType: 'completion', paymentId: 'px', entityType: 'goal', entityId: 'gH', occurrenceYm: '2026-06', amount: 100,
      recurrence: 'monthly', dueDateSnapshot: '2026-06-03', recordedAt: FA3CA_AT + 1000, source: 'user_dated' };
    const run = ([label, act]) => {
      const app = new App(ACT, '2026-08-10');
      act(app);
      app.reload();
      const a = authority(app), s = app.snap();
      return [label, s.goal.gH, s.goal.gB, a.goals.gH.shown, a.goals.gB.shown, a.goals.gH.parts.dated, a.goals.gH.parts.carry, resolutionRows(app).map(r => r[1])];
    };
    invariant('FA3CA.resolution.actions', '[action, Holiday, Car, Holiday position, Car position, dated, carry, resolutions] — each as the legacy display showed: none; undo and delete → reversed; edit £100 → £80 → amended; relink to Car → moved; dating it June (no production action does; written here) → dated + a dated completion, position unchanged',
      [['none', () => {}], ['undo', a => a.toggle('px')], ['delete', a => a.del('px')], ['amend', a => a.editPayment('px', { amount: 80 })],
        ['move', a => a.editPayment('px', { goalId: 'gB' })],
        ['date', a => a.run('S.contributionCarry.push(' + JSON.stringify(RESOLUTION('res1', 'carry_px', 'dated', { eventId: 'cev_dated' })) + '); S.contributionEvents.push(' + JSON.stringify(DATED) + '); save();')]].map(run),
      [['none', 1100, 500, 1100, 500, 0, 100, []], ['undo', 1000, 500, 1000, 500, 0, 0, ['reversed']], ['delete', 1000, 500, 1000, 500, 0, 0, ['reversed']],
        ['amend', 1080, 500, 1080, 500, 0, 80, ['amended']], ['move', 1000, 600, 1000, 600, 0, 0, ['moved']], ['date', 1100, 500, 1100, 500, 100, 0, ['dated']]]);
  });
}

function fa3caLinkedAndCorrection() {
  scenario('FA-3C-A LINKED GOAL — linked goals stay investment-derived; nothing counts twice', () => {
    const linked = (inv, payments) => legacyState({}, { goals: [Object.assign(HOLIDAY(), { saved: 1350 })], investments: [Object.assign(ISA(), { goalId: 'gH' }, inv)], payments });
    const goalRows = [legacyPay('pg'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })];
    const look = state => {
      const app = fa3bLoad(state, '2026-08-10', true);
      const a = authority(app);
      return [app.snap().goal.gH, a.goals.gH.position, a.goals.gH.shown, a.goals.gH.parts.dated, a.goals.gH.parts.carry, carryRows(app.state().contributionCarry).map(c => c[0]), app.snap().inv.iA];
    };
    invariant('FA3CA.linked', '[shown, position, display rule, dated, carry, carried payments, ISA]: ISA £5,200 linked → Holiday shows the ISA (its own position £1,350 = £1,000 + dated £250 + carry £100; the ISA completion £200 never enters it); ISA at £0 → Holiday shows its position £1,350',
      [look(linked({ balance: 5200 }, goalRows.concat([legacyInvPay('pi', { date: '2026-06-05' })]))), look(linked({ balance: 0, baseBalance: 0 }, goalRows))],
      [[5200, 1350, 5200, 250, 100, ['px'], 5200], [1350, 1350, 1350, 250, 100, ['px'], 0]]);
  });

  scenario('FA-3C-A SAVED SO FAR — schema-2 correction arithmetic through saveGoal', () => {
    /** [shown, stored base (null: refused), position, shown after] for Saved So Far entered as `entered`. */
    const correct = (state, clock, entered) => {
      const app = fa3bLoad(state, clock, true);
      const shown = app.snap().goal.gH;
      const toasts = app.editGoal('gH', { gs: String(entered) });
      app.reload();
      return [shown, toasts.length ? null : app.state().goals[0].baseSaved, authority(app).goals.gH.position, app.snap().goal.gH];
    };
    const mixed = legacyState({ saved: 1300 }, { payments: [legacyPay('p1'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })],
      savingsReleases: [Object.assign({}, EVENT_RELEASE, { amount: 50, remainingBalance: 1300 })] });
    const gx = FA3B_GOALS.filter(c => c[0] === 'negative')[0][2];
    const linked = legacyState({ saved: 1350 }, { investments: [Object.assign(ISA(), { goalId: 'gH', balance: 5000 })], payments: [legacyPay('p1'), legacyPay('px', { amount: 100, rec: 'yes', date: '2026-06-03' })] });
    invariant('FA3CA.correction', '[shown, new base, position, shown after]: base £1,000 + dated £250 + carry £100 − release £50 = £1,300, enter £1,200 → base £900 → £1,200; GX £950, enter £900 → base £950 (signed carry −£50) → £900; enter £200 or −£5 → refused, unchanged; linked goal: enter £1,500 → base £1,150, position £1,500, still shows the ISA £5,000',
      [correct(mixed, '2026-08-10', 1200), correct(gx, '2026-08-10', 900), correct(mixed, '2026-08-10', 200), correct(mixed, '2026-08-10', -5), correct(linked, '2026-08-10', 1500)],
      [[1300, 900, 1200, 1200], [950, 950, 900, 900], [1300, null, 1300, 1300], [1300, null, 1300, 1300], [5000, 1150, 1500, 5000]]);

    const g3 = FA3B_GOALS.filter(c => c[0] === 'monthly-current')[0];
    const legacy = legacyLoad(g3[2], g3[3]);
    const toasts = legacy.editGoal('gH', { gs: '1500' });
    invariant('FA3CA.fa2-guard', 'Schema 2 needs no recurring refusal: with this month\'s monthly completion dated, Saved So Far £1,500 stores base £1,400 and shows £1,500, also after reload; the schema-1 fallback keeps the FA-2 refusal (base £1,000, Holiday £1,100)',
      [correct(g3[2], g3[3], 1500), toasts, legacy.state().goals[0].baseSaved, legacy.snap().goal.gH],
      [[1100, 1400, 1500, 1500], [REFUSED_RECURRING], 1000, 1100]);
  });
}

function fa3caLifecycle() {
  scenario('FA-3C-A OBSERVATIONAL — carries are goal authority only: £5,000 carries move goals, never the ISA, Monthly Left, rows or releases', () => {
    const real = fa3bLoad(CARRY_MIX, '2026-08-20', true).state();
    const faked = JSON.parse(JSON.stringify(real));
    const at = { createdAt: real.contributionCarry[0].createdAt };
    faked.contributionCarry = [CARRY('fake-goal', 'ghost-g', Object.assign({ amount: 5000 }, at)), CARRY('fake-inv', 'ghost-i', Object.assign({ entityType: 'investment', entityId: 'iA', amount: 5000 }, at)),
      CARRY('fake-row', 'px', Object.assign({ amount: 5000 }, at)), NEG_CARRY('fake-neg', 'pb', Object.assign({ entityId: 'gB', amount: -500 }, at))];
    const execution = a => { const s = a.snap(); return [s.inv, s.left, s.leftConfirmed, s.homeOverduePayments, s.rows, a.state().savingsReleases]; };
    const surfaces = state => { const a = fa3bLoad(state, '2026-08-20', true); const direct = execution(a); a.reload(); return [direct, execution(a), a]; };
    const r = surfaces(real), f = surfaces(faked);
    const goals = a => [a.snap().goal.gH, a.snap().inv.iA, a.snap().goal.gB];
    invariant('FA3CA.observational.fake-carry', 'Holiday +£10,000, ISA +£5,000 and Car −£500 in carries (replacing the real ones): ISA, Monthly Left, rows and releases identical before and after reload; goals follow the carries (Holiday £1,000 + dated £250 + £10,000 − release £200 = £11,050; Car £500 − £500 = £0; real Holiday £1,350, Car £540); the investment carry counts nowhere; the carries survive the loads and the integrity report flags the state',
      [same(r.slice(0, 2), f.slice(0, 2)), goals(r[2]), goals(f[2]), f[2].state().contributionCarry.length, flagged(f[2]), r[2].warnings.length],
      [true, [1350, 5200, 540], [11050, 5200, 0], 4, true, 0]);
  });

  scenario('FA-3C-A BACKUP — contributionCarry persists, exports and restores; schema 2 after the transition', () => {
    const records = [CARRY('c1', 'pA'), RESOLUTION('r1', 'c1', 'amended', { amount: 200 })];
    const app = new App(Object.assign(baseState(), { _schemaVersion: 1, contributionCarry: records }), '2026-08-10');
    app.reload(); app.render(); app.reload();
    const persisted = app.state().contributionCarry;
    const env = app.backup(), restored = app.restorable(env);
    const back = new App(restored.state, '2026-08-10');
    back.reload();
    const oldEnv = new App(baseState(), '2026-08-10').backup();
    oldEnv.data = legacyData(oldEnv.data); oldEnv.schemaVersion = 1;
    const oldBack = new App(new App({}, '2026-08-10').restorable(oldEnv).state, '2026-08-10');
    oldBack.reload();
    const badEnv = JSON.parse(JSON.stringify(env));
    badEnv.data.contributionCarry = [CARRY('bad', 'pZ', { amount: -1 })].concat(records);
    const badBack = new App(app.restorable(badEnv).state, '2026-08-10');
    badBack.reload();
    invariant('FA3CA.backup', 'A carry and its resolution survive the transition, render and reload; the export holds them; restore extraction keeps them (not stripped) and the restored load has them; an old schema-1 backup without the key loads [] and transitions to schema 2; an invalid carry in a backup is dropped at load; export and build are schema 2',
      [same(persisted, records), same(env.data.contributionCarry, records), [restored.ok, restored.strippedKeys.indexOf('contributionCarry')], same(back.state().contributionCarry, records),
        ['contributionCarry' in oldEnv.data, oldBack.state().contributionCarry, oldBack.state()._schemaVersion], badBack.state().contributionCarry.map(c => c.id),
        [env.schemaVersion, back.run('GEODE_SCHEMA_VERSION'), app.state()._schemaVersion, back.state()._schemaVersion]],
      [true, true, [true, -1], true, [false, [], 2], ['c1', 'r1'], [2, 2, 2, 2]]);
  });

  scenario('FA-3C-A BOUNDARY — carries come only from the schema 1→2 transition; only goal authority and the C4b reset read them', () => {
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
    invariant('FA3CA.boundary', 'Functions that mention: the transition carry helper — itself and the transition (its only caller); the schema2_transition source — the validator and the helper; carry state — the carry functions, the resolution writer, FA-3B seeding (carried payments are seen), the transition, the C4b reset rule and the backup whitelist; carry functions — the carry family, the FA-3C-B lifecycle helpers and the contribution recorder, deletion and rollover safety net that call them, the goal parts, the authority validator, the C4b reset rule and recurring sync (which carried payments it may reset), FA-3B seeding and load (normaliser only); schema-2 goal helpers — each other, the recompute (goal Saved) and saveGoal (Saved So Far)',
      [users('geodeSchema2TransitionCarryRecords('), users("'schema2_transition'"), users('contributionCarry'), users('ContributionCarry'), users('geodeLegacyCarryCandidate('), users('geodeSchema2Goal')],
      [['geodeSchema2Transition', 'geodeSchema2TransitionCarryRecords'], ['geodeContributionCarryValid', 'geodeSchema2TransitionCarryRecords'],
        ['geodeBeyndBackupRestorableKeyWhitelist', 'geodeContributionCarryActive', 'geodeNormalizeContributionCarry', 'geodeResolveContributionCarry', 'geodeSchema2RecurringResetDue',
          'geodeSchema2Transition', 'geodeSchema2TransitionCarryRecords', 'geodeSeedLegacyContributionEvents'],
        ['geodeContributionCarryActive', 'geodeContributionCarryFollowRow', 'geodeContributionCarryFor', 'geodeContributionCarryForRow', 'geodeContributionCarryLedger',
          'geodeContributionCarryResolutionValid', 'geodeContributionCarryValid', 'geodeContributionSaveRefusal', 'geodeEnsureContributionCompletion', 'geodeNormalizeContributionCarry',
          'geodeRecordContributionDeletion', 'geodeRecordContributionTransition', 'geodeResolveContributionCarry', 'geodeSchema2AuthorityProblems', 'geodeSchema2GoalParts',
          'geodeSchema2RecurringResetDue', 'geodeSchema2TransitionCarryRecords', 'geodeSeedLegacyContributionEvents', 'load', 'syncRecurringPayments'],
        ['geodeLegacyCarryCandidate', 'geodeSchema2TransitionCarryRecords'],
        ['geodeRecomputeBalancesFromPayments', 'geodeSchema2GoalCorrectionBase', 'geodeSchema2GoalParts', 'geodeSchema2GoalPosition', 'saveGoal']]);
    invariant('FA3CB.boundary', 'Functions that mention: the resolution writer — itself, the row follower and payment deletion; the row follower — itself and the contribution recorder; the save refusal — itself, the payment form save and Smart Import; the dated reason — only the resolution validator and the carry ledger (no production action dates a carry)',
      [users('geodeResolveContributionCarry('), users('geodeContributionCarryFollowRow('), users('geodeContributionSaveRefusal('), users("'dated'")],
      [['geodeContributionCarryFollowRow', 'geodeRecordContributionDeletion', 'geodeResolveContributionCarry'], ['geodeContributionCarryFollowRow', 'geodeRecordContributionTransition'],
        ['geodeContributionSaveRefusal', 'geodeSavePayApply', 'geodeSmartImportConfirm'], ['geodeContributionCarryLedger', 'geodeContributionCarryResolutionValid']]);
  });
}

const fa3cbFixture = key => FA3B_GOALS.filter(c => c[0] === key)[0];
/** A FA-3B goal fixture booted through the schema 1→2 transition; edit adjusts a copy of the stored state first. */
const carriedFixture = (key, edit) => { const f = fa3cbFixture(key); const s = JSON.parse(JSON.stringify(f[2])); if (edit) edit(s); return new App(s, f[3]); };
/** [carry, reason, amount or goal it sets] in stored order. */
const resolutionRows = app => app.state().contributionCarry.filter(r => r.kind === 'resolution')
  .map(r => [r.carryId, r.reason].concat(r.reason === 'amended' ? [r.amount] : r.reason === 'moved' ? [r.entityType + ':' + r.entityId] : []));
/** [shown, shown by a fresh authority derivation, active carries, resolutions, active completions [payment, entity, occurrence, amount], baseSaved] for a goal. */
const carryView = (app, goalId) => {
  const g = goalId || 'gH', a = authority(app);
  return [app.snap().goal[g], a.goals[g].shown, activeCarryRows(a.active), resolutionRows(app),
    app.activeEvents().map(e => [e.paymentId, e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount]), app.state().goals.filter(x => x.id === g)[0].baseSaved];
};
/** [toasts the action showed, stored state unchanged] */
const attempt = (app, act) => { app.run('__toasts = [];'); const before = app.state(); act(app); return [JSON.parse(app.run('JSON.stringify(__toasts)')), same(app.state(), before)]; };
/** The carry, if any, whose occurrence the row's paid state still is. */
const heldCarry = (app, id) => JSON.parse(app.run('JSON.stringify(geodeContributionCarryForRow(S, geodeContributionEventSnapshot(S.payments.filter(function (p) { return p.id === ' + JSON.stringify(id) + '; })[0])))'));
const REFUSED_AMOUNT = 'A contribution needs an amount above \u00a30. Nothing has been changed.';
const REFUSED_COMPLETE = 'This contribution needs an amount above \u00a30 before it can be marked complete. Nothing has been changed.';
const REFUSED_MOVE = 'This completed contribution can\u2019t be moved somewhere else while its history is unresolved. Leave it where it is and add a new contribution for the other destination. If it never actually happened, mark it not completed instead. Nothing has been changed.';
const REFUSED_CARRY_SIGN = 'This older entry can\u2019t be turned into a contribution. Mark it not completed, then add the contribution separately. Nothing has been changed.';
const REFUSED_PAID_TO_GOAL = 'This payment is already marked as completed, so it can\u2019t start counting toward a goal from here. If the money went to this goal, mark it not completed, then complete it again. Nothing has been changed.';
const GA_HELD = [1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000];

function fa3cbActions() {
  scenario('FA-3C-B CARRY ACTIONS — undo, delete, edit and relink resolve the carry a row still holds', () => {
    const ga = carriedFixture('monthly-ambiguous'); ga.toggle('pm');
    const gx = carriedFixture('negative'); gx.toggle('pn');
    invariant('FA3CB.carry.undo', 'Marking a carried paid row not completed appends reversed: GA +£100 and GX −£50 end; no contribution event or reversal (no dated completion exists); simulated equals the legacy result (£1,000)',
      [carryView(ga), carryView(gx), ga.events().length + gx.events().length],
      [[1000, 1000, [], [['carry_pm', 'reversed']], [], 1000], [1000, 1000, [], [['carry_pn', 'reversed']], [], 1000], 0]);

    const gd = carriedFixture('monthly-ambiguous'); gd.del('pm');
    invariant('FA3CB.carry.delete', 'Deleting a carried paid row appends reversed alongside the deletion: the carry record stays as history, nothing stays active, no event, no release',
      [carryView(gd), gd.state().contributionCarry.filter(c => c.kind !== 'resolution').map(c => c.id), gd.state().payments.length, gd.events().length, gd.state().savingsReleases.length],
      [[1000, 1000, [], [['carry_pm', 'reversed']], [], 1000], ['carry_pm'], 0, 0, 0]);

    const gb = carriedFixture('annual-ambiguous'); const original = gb.state().contributionCarry[0];
    gb.editPayment('pa', { amount: 200 }); gb.reload();
    const gxe = carriedFixture('negative'); gxe.editPayment('pn', { amount: -30 });
    invariant('FA3CB.carry.edit', 'A paid amount edit amends the carry: GB £250 → £200 → amended +£200 (still after reload); GX −£50 → −£30 → amended −£30 (correcting a pre-transition negative effect is allowed; creating one is not); no dated event, no new carry, the original carry record unchanged, baseSaved unchanged',
      [carryView(gb), same(gb.state().contributionCarry[0], original), gb.state().contributionCarry.filter(c => c.kind !== 'resolution').length, carryView(gxe)],
      [[1200, 1200, [['carry_pa', 'goal:gH', 200]], [['carry_pa', 'amended', 200]], [], 1000], true, 1,
        [970, 970, [['carry_pn', 'goal:gH', -30]], [['carry_pn', 'amended', -30]], [], 1000]]);

    const withCar = s => { s.goals.push(CAR()); };
    const gr = carriedFixture('monthly-ambiguous', withCar); gr.editPayment('pm', { goalId: 'gB' });
    const gr2 = carriedFixture('monthly-ambiguous', withCar); gr2.editPayment('pm', { goalId: 'gB', amount: 80 });
    invariant('FA3CB.carry.relink', 'Relinking a carried paid row Holiday → Car appends moved: Holiday loses £100, Car gains it, in the legacy display and the simulation alike; with a new amount too, moved then amended; no event, no second carry',
      [carryView(gr), carryView(gr, 'gB'), carryView(gr2, 'gB'), gr2.state().contributionCarry.filter(c => c.kind !== 'resolution').length],
      [[1000, 1000, [['carry_pm', 'goal:gB', 100]], [['carry_pm', 'moved', 'goal:gB']], [], 1000], [600, 600, [['carry_pm', 'goal:gB', 100]], [['carry_pm', 'moved', 'goal:gB']], [], 500],
        [580, 580, [['carry_pm', 'goal:gB', 80]], [['carry_pm', 'moved', 'goal:gB'], ['carry_pm', 'amended', 80]], [], 500], 1]);

    const gi = carriedFixture('monthly-ambiguous');
    const toInv = attempt(gi, a => a.editPayment('pm', { goalId: '', investId: 'iA' }));
    const toBill = attempt(gi, a => a.editPayment('pm', { goalId: '' }));
    const toDebt = attempt(gi, a => a.editPayment('pm', { goalId: '', debtId: 'dC' }));
    gi.toggle('pm'); gi.editPayment('pm', { goalId: '', investId: 'iA', status: 'paid' });
    invariant('FA3CB.carry.cross-entity', 'While paid, a carried goal row cannot be moved to an investment, a bill or a debt (investment carries belong to FA-7; no resolution can express the move without inventing history): refused, nothing changed; marked not completed first (reversed), it can then be completed on the ISA as a new dated occurrence',
      [toInv, toBill, toDebt, carryView(gi), gi.snap().inv.iA],
      [[[REFUSED_MOVE], true], [[REFUSED_MOVE], true], [[REFUSED_MOVE], true],
        [1000, 1000, [], [['carry_pm', 'reversed']], [['pm', 'investment:iA', '2026-08', 100]], 1000], 5100]);

    const ir = new App(legacyState({}, { investments: [Object.assign(ISA(), { balance: 5200 })], payments: [legacyInvPay('im', { rec: 'yes', date: '2026-06-05' })] }), '2026-08-10');
    const irTry = attempt(ir, a => a.editPayment('im', { investId: '', goalId: 'gH' }));
    invariant('FA3CB.relink.inv-to-goal', 'An ambiguous paid ISA row (no carry: investments are deferred to FA-7) cannot be relinked to Holiday while paid (FA-3C-B.2): refused, nothing changed — legacy Holiday £1,000, simulated £1,000, ISA £5,200, no carry, no event (before FA-3C-B.2 the move gave legacy £1,200 against simulated £1,000)',
      [irTry, ir.snap().goal.gH, authority(ir).goals.gH.shown, ir.snap().inv.iA, ir.state().contributionCarry.length, ir.events().length], [[[REFUSED_MOVE], true], 1000, 1000, 5200, 0, 0]);
  });

  scenario('FA-3C-B RE-SAVE — metadata and date edits never date a carry', () => {
    const rs = carriedFixture('monthly-ambiguous');
    rs.at('2026-08-12'); rs.editPayment('pm', { name: 'Holiday monthly (renamed)' });
    const saved = carryView(rs);
    rs.reload(); rs.reload();
    invariant('FA3CB.carry.resave', 'A paid carried row re-saved with only a new name: no resolution, no dated event, no second carry, active carry unchanged — after the save and after two reloads (FA-3B seeding sees the carried payment)',
      [saved, carryView(rs), rs.state().contributionCarry.length], [GA_HELD, GA_HELD, 1]);

    const de = carriedFixture('monthly-ambiguous'); de.editPayment('pm', { date: '2026-08-20' }); de.reload();
    const dx = carriedFixture('negative'); dx.editPayment('pn', { date: '2026-07-01' }); dx.reload();
    const dz = new App(legacyState({ saved: 1250 }, { payments: [legacyPay('pz', { date: '' })] }), '2026-08-10');
    dz.editPayment('pz', { date: '2026-07-14' }); dz.reload();
    invariant('FA3CB.carry.date-edit-no-date', 'A new due date is not proof of when the money moved: GA monthly, GX one-off and an undated one-off (no date at the transition, given 14 July now) keep their carries undated after the save and a reload — no resolution, no event (no explicit "this happened on" action exists, so dated is not wired)',
      [carryView(de), carryView(dx), carryView(dz)],
      [GA_HELD, [950, 950, [['carry_pn', 'goal:gH', -50]], [], [], 1000], [1250, 1250, [['carry_pz', 'goal:gH', 250]], [], [], 1000]]);

    const look = app => [seededRows(app).map(r => [r[0], r[2]]), carryRows(app.state().contributionCarry)];
    const oneOff = new App(fa3cbFixture('one-off')[2], '2026-08-10'); oneOff.reload();
    const undated = new App(legacyState({ saved: 1250 }, { payments: [legacyPay('pz', { date: '' })] }), '2026-08-10'); undated.reload();
    const negative = new App(fa3cbFixture('negative')[2], '2026-08-10'); negative.reload();
    invariant('FA3CB.oneoff.ambiguity', 'A paid one-off is dated by its due month (seeded, no carry); a paid one-off with no valid date proves no occurrence (no seed, one_off carry with an empty dueDateSnapshot); a negative one-off is a legacy_negative_effect — eligibility unchanged from FA-3C-A',
      [look(oneOff), look(undated), look(negative)],
      [[[['p1', '2026-06']], []], [[], [['pz', 'goal:gH', 'undated_contribution', 250, 'one_off', '', 'schema2_transition']]],
        [[], [['pn', 'goal:gH', 'legacy_negative_effect', -50, 'one_off', '2026-06-10', 'schema2_transition']]]]);
  });
}

function fa3cbValidation() {
  scenario('FA-3C-B INPUT INTEGRITY — goal and investment contributions need an amount above £0', () => {
    const fresh = extra => { const a = new App(baseState(Object.assign({ incomeExplicitlySet: true }, extra)), '2026-06-05'); a.reload(); return a; };
    const ng = fresh();
    const newGoal = [
      attempt(ng, a => a.contribute({ name: 'Holiday minus', amount: -50, date: '2026-06-02', status: 'paid', goalId: 'gH' })),
      attempt(ng, a => a.contribute({ name: 'Holiday minus', amount: -50, date: '2026-06-20', status: 'upcoming', rec: 'yes', goalId: 'gH' })),
      attempt(ng, a => a.contribute({ name: 'Plan top-up', amount: -50, date: '2026-06-20', status: 'upcoming', goalId: 'gH', intent: 'add' }))];
    invariant('FA3CB.negative.new-goal', 'A new −£50 Holiday contribution — paid, scheduled monthly, or a Plan top-up — is refused with a specific message and nothing saved; Holiday stays £1,000',
      [newGoal, ng.snap().goal.gH, ng.state().payments.length], [[[[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true]], 1000, 0]);

    const ni = fresh();
    invariant('FA3CB.negative.new-investment', 'A new −£50 ISA contribution, paid or scheduled, is refused; ISA stays £5,000',
      [attempt(ni, a => a.contribute({ name: 'ISA minus', amount: -50, date: '2026-06-02', status: 'paid', investId: 'iA' })),
        attempt(ni, a => a.contribute({ name: 'ISA minus', amount: -50, date: '2026-06-20', status: 'upcoming', rec: 'yes', investId: 'iA' })), ni.snap().inv.iA],
      [[[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true], 5000]);

    const dated = new App(fa3cbFixture('one-off')[2], '2026-08-10'); dated.reload();
    const ga = carriedFixture('monthly-ambiguous'), gx = carriedFixture('negative');
    const up = fresh(); const upId = up.contribute({ name: 'Holiday', amount: 100, date: '2026-06-20', status: 'upcoming', goalId: 'gH' });
    invariant('FA3CB.negative.edit-positive', 'A positive contribution cannot be edited into a negative one: a dated paid one-off, a carried GA row and an upcoming row → −£20 refused; a carried GX −£50 → +£80 refused too (a legacy negative effect cannot become a contribution); nothing changed',
      [attempt(dated, a => a.editPayment('p1', { amount: -20 })), attempt(ga, a => a.editPayment('pm', { amount: -20 })),
        attempt(up, a => a.editPayment(upId, { amount: -20 })), attempt(gx, a => a.editPayment('pn', { amount: 80 }))],
      [[[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true], [[REFUSED_CARRY_SIGN], true]]);

    const zg = fresh({ payments: [legacyPay('pz0', { amount: 0, status: 'upcoming', date: '2026-06-20' }), legacyPay('pneg', { amount: -50, status: 'upcoming', date: '2026-06-20' })] });
    const zp = fresh(); const zpId = zp.contribute({ name: 'Holiday', amount: 100, date: '2026-06-02', status: 'paid', goalId: 'gH' });
    invariant('FA3CB.zero.goal', 'A new £0 Holiday contribution, a paid £100 edited to £0 and GX edited to £0 are refused; an upcoming £0 or −£50 Holiday row cannot be marked complete — no zero or negative paid contribution is created',
      [attempt(zg, a => a.contribute({ name: 'Holiday', amount: 0, date: '2026-06-02', status: 'paid', goalId: 'gH' })), attempt(zp, a => a.editPayment(zpId, { amount: 0 })),
        attempt(carriedFixture('negative'), a => a.editPayment('pn', { amount: 0 })), attempt(zg, a => a.toggle('pz0')), attempt(zg, a => a.toggle('pneg'))],
      [[[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true], [[REFUSED_AMOUNT], true], [[REFUSED_COMPLETE], true], [[REFUSED_COMPLETE], true]]);

    const zi = fresh({ payments: [legacyInvPay('pi0', { amount: 0, status: 'upcoming', date: '2026-06-20' })] });
    invariant('FA3CB.zero.investment', 'A new £0 ISA contribution is refused and an upcoming £0 ISA row cannot be marked complete',
      [attempt(zi, a => a.contribute({ name: 'ISA', amount: 0, date: '2026-06-02', status: 'paid', investId: 'iA' })), attempt(zi, a => a.toggle('pi0'))],
      [[[REFUSED_AMOUNT], true], [[REFUSED_COMPLETE], true]]);

    const bp = new App(baseState({ incomeExplicitlySet: true }), '2026-06-05', PROGRAM.plan); bp.reload();
    bp.run('window._geodePayPrefillBufferContribution = true;');
    const refusedBuffer = attempt(bp, a => a.contribute({ name: 'Emergency buffer', amount: -50, date: '2026-06-20', status: 'upcoming' }));
    const kept = [bp.run('window._geodePayLinkedIntent'), bp.run('window._geodePayPrefillBufferContribution')];
    bp.contribute({ name: 'Emergency buffer', amount: 50, date: '2026-06-20', status: 'upcoming' });
    invariant('FA3CB.validation.atomic', 'Every refusal above left the stored state untouched (no row, event, resolution or activity entry); a refused −£50 buffer contribution creates no emergency goal and keeps the modal\'s intent and buffer flag for the retry, which then saves £50 to a new Emergency buffer goal',
      [refusedBuffer, kept, bp.state().goals.map(g => g.name), bp.state().payments.map(p => [p.amount, p.goalId ? 'goal' : 'bill'])],
      [[[REFUSED_AMOUNT], true], ['new', true], ['Holiday', 'Emergency buffer'], [[50, 'goal']]]);

    const sc = fresh({ debts: [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 }] });
    const scope = attempt(sc, a => {
      a.contribute({ name: 'Refund', amount: -20, date: '2026-06-02', status: 'paid' });
      a.contribute({ name: 'Card', amount: 0, date: '2026-06-20', status: 'upcoming', debtId: 'dC' });
    });
    invariant('FA3CB.validation.scope', 'Bill and debt amounts are not judged by the contribution rule: a −£20 bill and a £0 debt payment save exactly as before',
      [scope[0], sc.state().payments.map(p => [p.amount, p.payKind])], [[], [[-20, 'bill'], [0, 'debt']]]);

    const lx = new App(fa3cbFixture('negative')[2], '2026-08-10'); lx.reload();
    const loaded = [lx.snap().goal.gH, lx.state().payments[0].amount];
    lx.reload();
    const renamed = attempt(lx, a => a.editPayment('pn', { name: 'Holiday adjustment' }));
    const lp = new App(fa3cbFixture('negative')[2], '2026-08-10'); lp.reload();
    const corrected = attempt(lp, a => a.editPayment('pn', { amount: 80 }));
    invariant('FA3CB.negative.legacy-rows', 'An existing paid −£50 row is never normalised away: it loads and reloads as −£50 (Holiday £950) and can be renamed; the transition carried it (legacy_negative_effect), so correcting it to +£80 is refused like any carried negative row — nothing changed (before FA-3C-C, with no carry yet, it became +£80)',
      [loaded, [lx.snap().goal.gH, lx.state().payments[0].amount, lx.state().payments[0].name], renamed[0], corrected, [lp.snap().goal.gH, lp.state().payments[0].amount]],
      [[950, -50], [950, -50, 'Holiday adjustment'], [], [[REFUSED_CARRY_SIGN], true], [950, -50]]);
  });
}

function fa3cbTimelines() {
  scenario('FA-3C-B MONTHLY GA TIMELINE — the legacy carry and later genuine occurrences stay separable', () => {
    const t = carriedFixture('monthly-ambiguous');
    t.at('2026-08-12'); t.editPayment('pm', { name: 'Holiday monthly (renamed)' }); olderBuildStamp(t, 'pm');
    const A = carryView(t);
    invariant('FA3CB.monthly.resave', 'A. August: GA re-saved through the form and holding the 2026-08 stamp an older build\'s re-save wrote — carry only, no event', A, GA_HELD);

    t.advance('2026-09-02', 'reload');
    const B = carryView(t);
    const long = carriedFixture('monthly-ambiguous'); long.at('2026-08-12'); long.editPayment('pm', { name: 'Holiday monthly (renamed)' }); olderBuildStamp(long, 'pm');
    const still = carriedFixture('monthly-ambiguous');
    ['2026-09-02', '2026-10-02', '2026-11-02', '2026-12-02', '2027-01-02', '2027-02-02', '2027-03-02', '2027-04-02', '2027-05-02', '2027-06-02', '2027-07-02', '2027-08-02']
      .forEach(m => { long.advance(m, 'reload'); still.advance(m, 'reload'); });
    invariant('FA3CB.monthly.rollover', 'B. September is the first month after the August transition, so C4b resets the stamped row; the carry stays as goal authority (Holiday £1,100; the legacy load fell to £1,000, D1) and no event dates it; twelve monthly reloads change nothing; a GA row never stamped (no lastPaidYM) resets the same way — the carry, not the stamp, decides',
      [[B, t.state().payments[0].status, heldCarry(t, 'pm')], [carryView(long), long.state().payments[0].status], [carryView(still), still.state().payments[0].status, heldCarry(still, 'pm')]],
      [[[1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000], 'upcoming', null], [[1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000], 'upcoming'],
        [[1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000], 'upcoming', null]]);

    t.toggle('pm');
    const C = carryView(t);
    t.reload();
    invariant('FA3CB.monthly.next-occurrence', 'C. September: the user completes the next real occurrence — the carry stays +£100 and a new dated completion +£100 (2026-09) is recorded; Holiday £1,100 → £1,200 (the legacy load showed £1,100); reload keeps exactly one of each',
      [C, carryView(t)], [[1200, 1200, [['carry_pm', 'goal:gH', 100]], [], [['pm', 'goal:gH', '2026-09', 100]], 1000], [1200, 1200, [['carry_pm', 'goal:gH', 100]], [], [['pm', 'goal:gH', '2026-09', 100]], 1000]]);
    invariant('FA3CB.owner.future-coexistence', 'At C the payment has an active carry and an active dated completion — different occurrences: the row\'s paid state is the September completion (pointer), not the carry, and the simulation counts both once',
      [heldCarry(t, 'pm'), t.pointer('pm') === t.activeEvents()[0].id, authority(t).goals.gH.parts], [null, true, { base: 1000, dated: 100, carry: 100, released: 0 }]);

    const branch = new App(t.state(), '2026-09-02'); branch.reload();
    const stale = new App(t.state(), '2026-09-02'); stale.reload();
    stale.at('2026-10-05'); stale.toggle('pm');
    invariant('FA3CB.owner.stale-pointer', 'From C, the September completion untapped on 5 October before any render (the row no longer represents it, but its pointer still names it): the legacy carry is not mistaken for the row\'s paid state — no resolution, the carry and the September completion both stay',
      [resolutionRows(stale), activeCarryRows(authority(stale).active), stale.activeEvents().map(e => e.occurrenceYm)], [[], [['carry_pm', 'goal:gH', 100]], ['2026-09']]);
    const keyed = new App(t.state(), '2026-09-02'); keyed.reload();
    invariant('FA3CB.owner.keyed-completion', 'From C with the row\'s pointer lost (an older backup), the September completion still owns its paid state, found by month: the row holds no carry, so moving it to an investment while paid is not refused as a legacy carry',
      keyed.run('var r = S.payments.filter(function (p) { return p.id === "pm"; })[0]; delete r.contributionEventId;' +
        ' [geodeContributionCarryForRow(S, geodeContributionEventSnapshot(r)), geodeContributionSaveRefusal(S, r, { kind: "invest", status: "paid", amount: 100 })]'),
      [null, '']);
    t.toggle('pm');
    invariant('FA3CB.monthly.next-undo', 'D. Undoing the September completion reverses that dated event only; the legacy carry stays +£100',
      [carryView(t), t.events().map(e => e.eventType)], [[1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000], ['completion', 'reversal']]);

    branch.run('geodeResolveContributionCarry(S, "pm", { reason: "reversed" }, "history")');
    branch.reload();
    invariant('FA3CB.monthly.legacy-undo', 'E. From C, reversing the legacy carry (the canonical writer called directly — no current screen addresses a carry the row no longer holds, so nothing recomputes until the reload read here) ends the carry only; the September completion stays: Holiday £1,100',
      carryView(branch), [1100, 1100, [], [['carry_pm', 'reversed']], [['pm', 'goal:gH', '2026-09', 100]], 1000]);

    const del = (state, clock, act) => { const a = new App(state, clock); a.reload(); if (act) act(a); a.del('pm'); return carryView(a); };
    const atB = (() => { const a = carriedFixture('monthly-ambiguous'); a.at('2026-08-12'); a.editPayment('pm', { name: 'x' }); olderBuildStamp(a, 'pm'); a.advance('2026-09-02', 'reload'); return a.state(); })();
    const g3 = fa3cbFixture('monthly-current');
    invariant('FA3CB.delete.history', 'Deleting a payment: (A) carry only, row holds it → reversed; (B) dated current occurrence only → that completion reversed (FA-3A); (C) carry + a later dated occurrence the row holds → the dated occurrence reversed, the carry stays; (D) carry the reset row no longer holds → stays. Dated history of earlier occurrences and carries the row no longer holds are never erased',
      [del(carriedFixture('monthly-ambiguous').state(), '2026-08-10'), del(g3[2], g3[3]), del(atB, '2026-09-02', a => a.toggle('pm')), del(atB, '2026-09-02')],
      [[1000, 1000, [], [['carry_pm', 'reversed']], [], 1000], [1000, 1000, [], [], [], 1000],
        [1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000], [1100, 1100, [['carry_pm', 'goal:gH', 100]], [], [], 1000]]);
  });

  scenario('FA-3C-B ANNUAL GB/GC TIMELINE — a stale touch never fabricates the next annual occurrence', () => {
    const HELD = [1250, 1250, [['carry_pa', 'goal:gH', 250]], [], [], 1000];
    const stale = key => {
      const a = carriedFixture(key);
      a.editPayment('pa', { name: 'Holiday annual (renamed)' });
      a.smartImport([{ name: 'Holiday annual', amount: 250, date: '2026-07-01', link: 'goal:gH', mergeId: 'pa' }]);
      a.reload();
      return carryView(a);
    };
    invariant('FA3CB.annual.stale', 'GB and GC: a form re-save and a matching Smart Import merge (same amount, paid) leave the carry alone — no resolution, no annual completion, also after reload',
      [stale('annual-ambiguous'), stale('annual-ambiguous-past')], [HELD, HELD]);

    const next = key => {
      const same = carriedFixture(key); same.advance('2027-06-12', 'reload');
      same.toggle('pa'); same.toggle('pa');
      const fresh = carriedFixture(key); fresh.advance('2027-06-12', 'reload');
      const id = fresh.contribute({ name: 'Holiday 2027', amount: 250, date: '2027-06-10', status: 'paid', rec: 'annual', goalId: 'gH' });
      return [carryView(same), carryView(fresh).map(v => JSON.stringify(v).split(JSON.stringify(id)).join('"new"')).map(JSON.parse)];
    };
    const NEXT = [[1250, 1250, [], [['carry_pa', 'reversed']], [['pa', 'goal:gH', '2027-06', 250]], 1000],
      [1500, 1500, [['carry_pa', 'goal:gH', 250]], [], [['new', 'goal:gH', '2027-06', 250]], 1000]];
    invariant('FA3CB.annual.next-occurrence', 'June 2027, GB and GC: the 2027 contribution completed as its own payment coexists with the carry (legacy and simulated £1,500). On the same row the only route is tap (undo: nothing resets an annual row, D11) then tap — the untick is an undo (reversed), so the carry ends and the 2027 completion replaces it (£1,250, as legacy); whether that untick meant "undo" cannot be told from stored evidence',
      [next('annual-ambiguous'), next('annual-ambiguous-past')], [NEXT, NEXT]);
  });
}

function fa3cbIntegration() {
  scenario('FA-3C-B SMART IMPORT — import data corroborates; it never dates a carry', () => {
    const run = item => { const a = carriedFixture('monthly-ambiguous'); const r = attempt(a, x => x.smartImport([item])); a.reload(); return [carryView(a), a.state().payments.length, a.snap().inv.iA, r[1]]; };
    const merge = o => Object.assign({ name: 'Holiday monthly', amount: 100, date: '2026-08-01', link: 'goal:gH', mergeId: 'pm' }, o);
    const added = (() => { const a = carriedFixture('monthly-ambiguous'); a.smartImport([{ name: 'Holiday', amount: 100, date: '2026-08-01', link: 'goal:gH' }]); a.reload(); return carryView(a).map(v => JSON.stringify(v).replace(/"id\d+"/g, '"new"')).map(JSON.parse); })();
    invariant('FA3CB.smart-import', 'Merging into the carried GA row (read after the next load: Smart Import does not recompute in-session): same amount, paid → nothing; £120 → amended; a future date (upcoming) → reversed; linked to the ISA → not merged (row, carry and ISA unchanged); an import added as its own row is a new dated occurrence beside the carry. Never dated, never a second carry',
      [run(merge({})), run(merge({ amount: 120 })), run(merge({ date: '2026-08-20' })), run(merge({ link: 'invest:iA' })), added],
      [[GA_HELD, 1, 5000, false], [[1120, 1120, [['carry_pm', 'goal:gH', 120]], [['carry_pm', 'amended', 120]], [], 1000], 1, 5000, false],
        [[1000, 1000, [], [['carry_pm', 'reversed']], [], 1000], 1, 5000, false], [GA_HELD, 1, 5000, true],
        [1200, 1200, [['carry_pm', 'goal:gH', 100]], [], [['new', 'goal:gH', '2026-08', 100]], 1000]]);
  });

  scenario('FA-3C-B DIRECT CONTRIBUTION AND PLAN — new rows stay separate from a carried row', () => {
    const d = carriedFixture('monthly-ambiguous');
    const d1 = d.contribute({ name: 'Extra', amount: 60, date: '2026-08-10', status: 'paid', goalId: 'gH' });
    const d2 = d.contribute({ name: 'Extra', amount: 60, date: '2026-08-10', status: 'paid', goalId: 'gH' });
    invariant('FA3CB.direct.identity', 'Two £60 direct contributions beside the carried GA row: two distinct rows, two dated completions, the carry untouched (D4 not reintroduced); legacy and simulated £1,220',
      [carryView(d), d.state().payments.map(p => p.id), d1 !== d2],
      [[1220, 1220, [['carry_pm', 'goal:gH', 100]], [], [[d1, 'goal:gH', '2026-08', 60], [d2, 'goal:gH', '2026-08', 60]], 1000], ['pm', d1, d2], true]);

    const p = carriedFixture('monthly-ambiguous');
    const planRow = p.contribute({ intent: 'add', name: 'Catch up on Holiday', amount: 120, date: '2026-08-10', status: 'upcoming', goalId: 'gH' });
    p.contribute({ intent: 'add', name: 'Catch up on Holiday', amount: 30, date: '2026-08-10', status: 'upcoming', goalId: 'gH' });
    const zero = attempt(p, a => a.contribute({ intent: 'add', name: 'Catch up on Holiday', amount: 0, date: '2026-08-10', status: 'upcoming', goalId: 'gH' }));
    invariant('FA3CB.plan.gap', 'Plan top-ups (add intent) beside the carried paid row: £120 then £30 fill one upcoming Plan row (£150), never the carried row; a £0 top-up is refused; no carry involvement',
      [p.state().payments.map(r => [r.id === planRow ? 'plan' : r.id, r.amount, r.status]), carryView(p), zero],
      [[['pm', 100, 'paid'], ['plan', 150, 'upcoming']], GA_HELD, [[REFUSED_AMOUNT], true]]);
  });

  scenario('FA-3C-B OWNERSHIP — one owner per paid effect across a mixed lifecycle', () => {
    const app = new App(CARRY_MIX, '2026-08-20');
    app.editPayment('px', { name: 'Holiday monthly (renamed)' }); olderBuildStamp(app, 'px');
    app.editPayment('pa', { amount: 200 });
    app.toggle('pn');
    app.editPayment('p1', { name: 'Holiday one-off (renamed)' });
    app.reload();
    app.advance('2026-09-02', 'reload');
    const goals = app.state().goals.map(g => g.id);
    const owners = app.state().payments.filter(p => p.status === 'paid' && goals.indexOf(p.goalId) >= 0)
      .map(p => [p.id, [app.pointer(p.id) && app.activeEvents().some(e => e.id === app.pointer(p.id)) && 'dated', heldCarry(app, p.id) && 'carry'].filter(Boolean)]);
    const sim = authority(app);
    invariant('FA3CB.owner.same-effect-xor', 'CARRY_MIX after rename (GA then holding an older build\'s 2026-08 stamp), amend, undo, rename, reload and the September rollover: every paid goal row\'s current effect has exactly one owner (dated completion or carry); C4b reset both carried monthly rows (GA and Car) in September, their carries kept — Holiday £1,350 (the legacy load showed £1,250, D1), Car £540',
      [owners, [app.snap().goal.gH, sim.goals.gH.shown, app.snap().goal.gB, sim.goals.gB.shown]],
      [[['p1', ['dated']], ['pa', ['carry']]], [1350, 1350, 540, 540]]);

    const before = new App(CARRY_MIX, '2026-08-20').state().contributionCarry.filter(c => c.kind !== 'resolution');
    const battery = new App(CARRY_MIX, '2026-08-20');
    battery.editPayment('px', { amount: 90 }); battery.editPayment('pb', { goalId: 'gH' }); battery.toggle('pn'); battery.del('pa');
    battery.editPayment('im', { amount: 150 }); battery.toggle('im'); battery.toggle('im');
    battery.contribute({ name: 'Extra', amount: 60, date: '2026-08-20', status: 'paid', goalId: 'gH' });
    battery.smartImport([{ name: 'Holiday', amount: 90, date: '2026-08-01', link: 'goal:gH', mergeId: 'px' }]);
    battery.reload(); battery.advance('2026-09-02', 'reload');
    invariant('FA3CB.negative.closed', 'After edits, relinks, undo, delete, ISA actions, a direct contribution, a Smart Import merge and reloads, the carry records are exactly the four the transition created (no new carry, no new legacy_negative_effect, no investment carry); only resolutions were appended',
      [same(battery.state().contributionCarry.filter(c => c.kind !== 'resolution'), before), resolutionRows(battery).map(r => r[1])],
      [true, ['amended', 'moved', 'reversed', 'reversed']]);
  });

  scenario('FA-3C-B OBSERVATIONAL, BACKUP AND SAVED SO FAR — carries and their resolutions are goal authority only', () => {
    const mixed = new App(CARRY_MIX, '2026-08-20');
    mixed.editPayment('pa', { amount: 200 }); mixed.toggle('pn'); mixed.editPayment('pb', { goalId: 'gH' });
    const st = mixed.state(), stripped = Object.assign({}, st, { contributionCarry: [] });
    const lookOf = s => {
      const a = fa3bLoad(s, '2026-08-20', true);
      const v = a.snap();
      return [[v.inv, v.left, v.leftConfirmed, v.homeOverduePayments, v.rows, a.state().savingsReleases], [v.goal.gH, v.goal.gB], a];
    };
    const real = lookOf(st), bare = lookOf(stripped);
    invariant('FA3CB.observational', 'A CARRY_MIX state with amended, reversed and moved resolutions, and the same state with its carries removed: ISA, Monthly Left, Home overdue, rows and releases identical; goals follow the carries (Holiday £1,390 = £1,000 + dated £250 + GA £100 + amended GB £200 + moved Car row £40 − release £200; without carries £1,050 and the integrity report flags the uncarried rows; Car £500 either way)',
      [same(real[0], bare[0]), real[1], bare[1], real[2].warnings.length, flagged(bare[2])], [true, [1390, 500], [1050, 500], 0, true]);

    const b = carriedFixture('monthly-ambiguous', s => { s._schemaVersion = 1; });
    b.editPayment('pm', { amount: 120 });
    b.editPayment('pm', { amount: 120 });
    b.reload(); b.reload();
    const records = b.state().contributionCarry;
    const env = b.backup(), restored = b.restorable(env), back = new App(restored.state, '2026-08-10'); back.reload(); back.reload();
    const none = new App(fa3cbFixture('monthly-ambiguous')[2], '2026-08-10'); none.reload(); none.toggle('pm'); none.reload();
    invariant('FA3CB.backup', 'A resolution written by a production action survives save, reload, export and restore; repeating the same edit appends nothing; reloads never duplicate it; export and build are schema 2; a schema-1 state gains exactly its transition carry on the first load, and later loads and actions only append resolutions',
      [resolutionRows(b), same(env.data.contributionCarry, records), same(back.state().contributionCarry, records), [env.schemaVersion, back.run('GEODE_SCHEMA_VERSION')],
        [carryRows(none.state().contributionCarry).map(c => c[0]), resolutionRows(none)]],
      [[['carry_pm', 'amended', 120]], true, true, [2, 2], [['pm'], [['carry_pm', 'reversed']]]]);

    const w = carriedFixture('monthly-ambiguous', s => { s.goals.push(CAR()); s.savingsReleases = [EVENT_RELEASE]; });
    const untouched = () => [w.state().contributionCarry[0], w.state().goals.map(g => g.baseSaved), w.state().savingsReleases, w.events()];
    const was = untouched();
    const write = change => JSON.parse(w.run('JSON.stringify(geodeResolveContributionCarry(S, ' + JSON.stringify(change[0]) + ', ' + JSON.stringify(change[1]) + ', "test"))')) ? 'appended' : 'none';
    const writes = [['pm', { reason: 'amended', amount: 90 }], ['pm', { reason: 'amended', amount: 90 }], ['pm', { reason: 'amended', amount: 80 }],
      ['pm', { reason: 'amended', amount: -5 }], ['pm', { reason: 'moved', entityType: 'goal', entityId: 'gB' }], ['pm', { reason: 'moved', entityType: 'goal', entityId: 'gB' }],
      ['nope', { reason: 'reversed' }], ['pm', { reason: 'reversed' }], ['pm', { reason: 'reversed' }], ['pm', { reason: 'amended', amount: 70 }]].map(write);
    invariant('FA3CB.writer', 'The canonical writer, called at one instant: amended £90, again £90 (nothing), £80, −£5 (invalid: nothing), moved to Car, again (nothing), a payment without a carry (nothing), reversed, again (nothing), amended after reversal (nothing); £90 → £80 applies in written order; the carry record, baseSaved, releases and events are untouched',
      [writes, resolutionRows(w), same(untouched(), was)],
      [['appended', 'none', 'appended', 'none', 'appended', 'none', 'none', 'appended', 'none', 'none'],
        [['carry_pm', 'amended', 90], ['carry_pm', 'amended', 80], ['carry_pm', 'moved', 'goal:gB'], ['carry_pm', 'reversed']], true]);
    const order = carriedFixture('monthly-ambiguous');
    order.run('for (var i = 0; i < 8; i++) uid(); geodeResolveContributionCarry(S, "pm", { reason: "amended", amount: 90 }, "test"); geodeResolveContributionCarry(S, "pm", { reason: "amended", amount: 80 }, "test");');
    invariant('FA3CB.writer.order', 'Two amendments written in the same millisecond, with ids (cres_id9, cres_id10) whose order disagrees with the written order, apply in written order (recordedAt kept after the carry\'s earlier resolutions): active £80, also after reload',
      [activeCarryRows(authority(order).active), (order.reload(), activeCarryRows(authority(order).active))], [[['carry_pm', 'goal:gH', 80]], [['carry_pm', 'goal:gH', 80]]]);

    const gb = carriedFixture('annual-ambiguous'), legacy = legacyLoad(fa3cbFixture('annual-ambiguous')[2], '2026-08-10');
    const correct = app => [app.editGoal('gH', { gs: '1500' }), app.state().goals[0].baseSaved, app.snap().goal.gH];
    invariant('FA3CB.saved-so-far', 'Saved So Far on GB: schema 2 stores £1,500 − carry £250 = base £1,250, exactly what the schema-1 FA-2 rule gives without a carry, and the carry is untouched; carry actions never change baseSaved (checked in every view above)',
      [correct(gb), correct(legacy), activeCarryRows(authority(gb).active)], [[[], 1250, 1500], [[], 1250, 1500], [['carry_pa', 'goal:gH', 250]]]);
  });
}

const B2_AT = '2026-08-10';
const PENSION = () => ({ id: 'iB', name: 'Pension', type: 'pension', balance: 3000, baseBalance: 3000 });
/** Holiday £1,000 and an ISA (base £5,000) holding one ambiguous paid row (default: monthly £200, no lastPaidYM), transition carries stored. */
const b2Ambiguous = (row, extra) => new App(legacyState({}, Object.assign({ investments: [Object.assign(ISA(), { balance: 5200 })],
  payments: [row || legacyInvPay('im', { rec: 'yes', date: '2026-06-05' })] }, extra || {})), B2_AT);
/** A row completed natively this month: its paid state is a dated completion it represents. */
const b2Dated = (row, extra) => { const app = new App(legacyState({}, Object.assign({ payments: [row] }, extra || {})), B2_AT); app.toggle(row.id); return app; };
/**
 * An annual row completed in August 2025 and seen in September 2026. An investment row is still paid (the annual reset
 * leaves investment rows to FA-7), its completion an earlier occurrence; a goal row became its 2026 occurrence in August 2026.
 */
const b2Stale = (row, extra) => {
  const app = new App(legacyState({}, Object.assign({ payments: [row] }, extra || {})), '2025-08-04'); app.reload(); app.toggle(row.id);
  app.advance('2026-09-15', 'reload');
  return app;
};
/** completion: [type, entity, occurrence, amount]; reversal: [type, entity, occurrence] */
const b2Events = app => app.events().map(e => [e.eventType, e.entityType + ':' + e.entityId, e.occurrenceYm].concat(e.eventType === 'completion' ? [e.amount] : []));
const b2Active = app => app.activeEvents().map(e => [e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount]);
/** [legacy Holiday, simulated Holiday, ISA] */
const b2View = app => [app.snap().goal.gH, authority(app).goals.gH.shown, app.snap().inv.iA];
/** What FA-7 could carry for the row: geodeLegacyCarryCandidate with the active completions as dated. */
const b2Candidate = (app, id) => JSON.parse(app.run('(function () { var dated = Object.create(null); geodeContributionActiveCompletions(S).forEach(function (e) { dated[e.paymentId] = true; });' +
  ' return JSON.stringify(geodeLegacyCarryCandidate(S, S.payments.filter(function (p) { return p.id === ' + JSON.stringify(id) + '; })[0], dated)); })()'));
const b2ToGoal = id => a => a.editPayment(id, { investId: '', goalId: 'gH' });
const b2ToIsa = id => a => a.editPayment(id, { goalId: '', investId: 'iA' });
const B2_CANDIDATE = { paymentId: 'im', entityType: 'investment', entityId: 'iA', kind: 'undated_contribution', amount: 200, recurrence: 'monthly', dueDateSnapshot: '2026-06-05' };
const B2_MOVED = (from, to, ym) => [['completion', from, ym, 200], ['reversal', from, ym], ['completion', to, ym, 200]];

function fa3cb2Boundary() {
  scenario('FA-3C-B.2 AUTHORITY BOUNDARY — a paid contribution crosses between a goal and an investment only with the dated occurrence it represents', () => {
    const amb = b2Ambiguous(), ambControl = b2Ambiguous();
    const cand0 = b2Candidate(amb, 'im');
    const ambTry = attempt(amb, b2ToGoal('im'));
    const ambRow = amb.state().payments[0];
    invariant('FA3CB2.inv-goal.ambiguous', 'An ambiguous paid ISA £200 (no dated completion, no carry) relinked to Holiday: refused, stored state unchanged — still ISA-linked, lastPaidYM empty, no event, carry, release or activity entry; ISA £5,200, Holiday £1,000 (simulated £1,000), Monthly Left £3,000',
      [ambTry, ambRow.investId, ambRow.goalId, ambRow.lastPaidYM, amb.events().length, amb.state().contributionCarry.length, amb.state().savingsReleases.length, amb.state().activityLog.length, b2View(amb), amb.snap().left],
      [[[REFUSED_MOVE], true], 'iA', '', '', 0, 0, 0, 0, [1000, 1000, 5200], 3000]);
    amb.reload(); amb.reload(); ambControl.reload(); ambControl.reload();
    invariant('FA3CB2.inv-goal.reload', 'After the refusal and two reloads the state is identical to the same fixture never touched: nothing was stamped, so nothing is seeded',
      [same(amb.state(), ambControl.state()), amb.events().length, b2View(amb)], [true, 0, [1000, 1000, 5200]]);

    const fut = b2Ambiguous(); attempt(fut, b2ToGoal('im'));
    fut.contribute({ name: 'Holiday monthly', amount: 200, date: '2026-08-20', status: 'paid', rec: 'yes', goalId: 'gH' });
    invariant('FA3CB2.inv-goal.future', 'The safe path after the refusal — leave the ISA row and add a new Holiday contribution: a dated Holiday completion (2026-08) beside the untouched ISA row; ISA £5,200, Holiday £1,200 (simulated £1,200); the ISA evidence unchanged',
      [b2Active(fut), b2View(fut), fut.state().payments.filter(p => p.id === 'im')[0].investId, b2Candidate(fut, 'im')],
      [[['goal:gH', '2026-08', 200]], [1200, 1200, 5200], 'iA', B2_CANDIDATE]);

    const dat = b2Dated(legacyInvPay('id', { rec: 'yes', status: 'upcoming', date: '2026-08-05' }));
    const datBefore = b2Active(dat);
    const datTry = attempt(dat, b2ToGoal('id'));
    const datAfter = [b2Events(dat), b2View(dat)];
    dat.reload();
    invariant('FA3CB2.inv-goal.dated', 'A paid ISA £200 completed this month (a dated completion it represents) relinked to Holiday: allowed — the ISA completion is reversed and the same occurrence (2026-08) recorded for Holiday; ISA £5,000, Holiday £1,200, simulated £1,200; no carry, baseSaved unchanged; identical after reload',
      [datBefore, datTry[0], datAfter, [b2Events(dat), b2View(dat)], dat.state().contributionCarry.length, dat.state().goals[0].baseSaved],
      [[['investment:iA', '2026-08', 200]], [], [B2_MOVED('investment:iA', 'goal:gH', '2026-08'), [1200, 1200, 5000]],
        [B2_MOVED('investment:iA', 'goal:gH', '2026-08'), [1200, 1200, 5000]], 0, 1000]);

    const unp = new App(legacyState({}, { payments: [legacyInvPay('iu', { rec: 'yes', status: 'upcoming', date: '2026-08-20' })] }), B2_AT);
    const unpTry = attempt(unp, b2ToGoal('iu'));
    const unpLinked = [unp.state().payments[0].goalId, b2View(unp), unp.events().length];
    unp.toggle('iu');
    invariant('FA3CB2.inv-goal.unpaid', 'An unpaid ISA contribution relinked to Holiday: allowed, there is no effect to move (Holiday £1,000, ISA £5,000, no event); completing it records a dated Holiday completion (2026-08): Holiday £1,200, simulated £1,200',
      [unpTry[0], unpLinked, b2Active(unp), b2View(unp)], [[], ['gH', [1000, 1000, 5000], 0], [['goal:gH', '2026-08', 200]], [1200, 1200, 5000]]);

    const sti = b2Stale(legacyInvPay('ia', { rec: 'annual', status: 'upcoming', date: '2025-08-05' }));
    const stiTry = attempt(sti, b2ToGoal('ia'));
    invariant('FA3CB2.inv-goal.stale', 'An annual ISA £200 completed in August 2025, still paid in September 2026 (its completion an earlier occurrence the row no longer represents), relinked to Holiday: refused, nothing changed — the 2025-08 ISA completion stays ISA history, Holiday receives nothing (£1,000, simulated £1,000), ISA £5,200',
      [stiTry, b2Active(sti), b2View(sti)], [[[REFUSED_MOVE], true], [['investment:iA', '2025-08', 200]], [1000, 1000, 5200]]);

    const stg = b2Stale(legacyPay('ga', { rec: 'annual', status: 'upcoming', date: '2025-08-05', amount: 200 }));
    const stgTotal = authority(stg).goals.gH.shown + stg.snap().inv.iA;
    const stgTry = attempt(stg, b2ToIsa('ga'));
    const stgRow = stg.state().payments[0];
    invariant('FA3CB2.goal-inv.stale', 'The mirror is no longer stale: the annual Holiday £200 row became its upcoming 2026 occurrence in August 2026 (FA-4B), so relinking it to the ISA is an ordinary unpaid move, allowed and moving no money — the 2025-08 Holiday completion stays Holiday history, the ISA does not gain the £200 (£5,000); Holiday £1,200, simulated £1,200',
      [stgTry, b2Active(stg), [stgRow.status, stgRow.goalId, stgRow.investId], b2View(stg)], [[[], false], [['goal:gH', '2025-08', 200]], ['upcoming', '', 'iA'], [1200, 1200, 5000]]);

    const sgg = b2Stale(legacyPay('ga', { rec: 'annual', status: 'upcoming', date: '2025-08-05', amount: 200 }), { goals: [HOLIDAY(), CAR()] });
    const sggTry = attempt(sgg, a => a.editPayment('ga', { goalId: 'gB' }));
    const sggSim = authority(sgg).goals;
    invariant('FA3CB2.goal-goal', 'Within goals nothing new is refused: the stale Holiday row moves to Car while its 2025-08 completion stays Holiday history (the template move does not rewrite it) — schema 2 shows Holiday £1,200 / Car £500, the moved row bringing no history to Car (the legacy display showed Holiday £1,000 / Car £700); carried goal → goal moves stay FA3CB.carry.relink',
      [sggTry[0], b2Active(sgg), [sgg.snap().goal.gH, sgg.snap().goal.gB], [sggSim.gH.shown, sggSim.gB.shown]], [[], [['goal:gH', '2025-08', 200]], [1200, 500], [1200, 500]]);

    const ii = b2Ambiguous(null, { investments: [Object.assign(ISA(), { balance: 5200 }), PENSION()] });
    const iiTry = attempt(ii, a => a.editPayment('im', { investId: 'iB' }));
    invariant('FA3CB2.inv-inv.ambiguous', 'Within investments nothing new is refused: the ambiguous paid ISA row moves to the Pension (no event; the undated investment evidence now names the Pension). Since FA-7B rows are not investment authority: the £200 stays held by the ISA opening anchor (ISA £5,200, Pension £3,000) — re-attributing absorbed ambiguous rows is FA-7C',
      [iiTry[0], [ii.snap().inv.iA, ii.snap().inv.iB], ii.events().length, (b2Candidate(ii, 'im') || {}).entityId], [[], [5200, 3000], 0, 'iB']);
    const id2 = b2Dated(legacyInvPay('id', { rec: 'yes', status: 'upcoming', date: '2026-08-05' }), { investments: [ISA(), PENSION()] });
    const id2Try = attempt(id2, a => a.editPayment('id', { investId: 'iB' }));
    invariant('FA3CB2.inv-inv.dated', 'A dated ISA completion it represents moves to the Pension as the same occurrence: ISA completion reversed, Pension completion 2026-08; ISA £5,000, Pension £3,200',
      [id2Try[0], b2Events(id2), [id2.snap().inv.iA, id2.snap().inv.iB]], [[], B2_MOVED('investment:iA', 'investment:iB', '2026-08'), [5000, 3200]]);

    const oo = b2Ambiguous(legacyInvPay('io', { rec: 'no', date: '2026-06-10' }));
    /** The relink comes a minute after the load that seeded the completion: the simulated clock is frozen within a step, and an action in the transition's millisecond is indistinguishable from evidence the FA-7B opening anchor holds. */
    oo.run('__nowMs += 60000;');
    const ooTry = attempt(oo, b2ToGoal('io'));
    const od = b2Ambiguous(legacyInvPay('ix', { rec: 'no', date: '' }));
    const odTry = attempt(od, b2ToGoal('ix'));
    invariant('FA3CB2.oneoff', 'One-off: a paid ISA one-off with a due date (FA-3B dated it 2026-06 at load) moves to Holiday as that occurrence — ISA completion reversed, Holiday completion 2026-06; Holiday £1,200 = simulated, ISA £5,000. One with no usable due date has no occurrence: refused, nothing changed, no date invented',
      [ooTry[0], b2Events(oo), b2View(oo), odTry, od.events().length, b2View(od)],
      [[], B2_MOVED('investment:iA', 'goal:gH', '2026-06'), [1200, 1200, 5000], [[REFUSED_MOVE], true], 0, [1000, 1000, 5200]]);

    const an = b2Ambiguous(legacyInvPay('ian', { rec: 'annual', date: '2027-06-05' }));
    const anTry = attempt(an, b2ToGoal('ian'));
    const ad = b2Dated(legacyInvPay('iad', { rec: 'annual', status: 'upcoming', date: '2026-08-05' }));
    const adTry = attempt(ad, b2ToGoal('iad'));
    invariant('FA3CB2.recurring', 'Occurrence, not recurrence, decides: an ambiguous paid annual ISA row (like the monthly one above) is refused unchanged; an annual ISA row completed this month moves to Holiday as its 2026-08 occurrence (ISA completion reversed, Holiday completion 2026-08; Holiday £1,200 = simulated, ISA £5,000)',
      [anTry, b2View(an), adTry[0], b2Events(ad), b2View(ad)],
      [[[REFUSED_MOVE], true], [1000, 1000, 5200], [], B2_MOVED('investment:iA', 'goal:gH', '2026-08'), [1200, 1200, 5000]]);

    const si = b2Ambiguous();
    const siCand = b2Candidate(si, 'im');
    const siTry = attempt(si, a => a.smartImport([{ name: 'im', amount: 200, date: '2026-06-05', link: 'goal:gH', mergeId: 'im' }]));
    si.reload();
    invariant('FA3CB2.smart-import', 'A Smart Import merge that would relink the ambiguous paid ISA row to Holiday is skipped by the same refusal: stored state unchanged (link, lastPaidYM, events, carry, activity log); after the next load ISA £5,200, Holiday £1,000 (simulated £1,000), the ISA evidence unchanged',
      [siTry[1], si.state().payments[0].investId, si.state().payments[0].lastPaidYM, si.events().length, b2View(si), b2Candidate(si, 'im')],
      [true, 'iA', '', 0, [1000, 1000, 5200], B2_CANDIDATE]);

    invariant('FA3CB2.fa7-evidence', 'The undated ISA evidence FA-7 will carry survives every refused move: geodeLegacyCarryCandidate gives the same ISA £200 candidate before and after the refused form relink (and two reloads) and before and after the refused Smart Import merge',
      [cand0, b2Candidate(amb, 'im'), siCand, b2Candidate(si, 'im')], [B2_CANDIDATE, B2_CANDIDATE, B2_CANDIDATE, B2_CANDIDATE]);

    invariant('FA3CB2.no-invention', 'No relink manufactures occurrence evidence: refused moves leave lastPaidYM, events and carries as they were (ambiguous monthly after reloads, ambiguous annual, dateless one-off, Smart Import after reload); allowed moves record only the occurrence already proven (monthly and annual 2026-08, one-off 2026-06)',
      [[amb, an, od, si].map(a => [a.state().payments[0].lastPaidYM, a.events().length, a.state().contributionCarry.length]), [dat, ad, oo].map(a => a.activeEvents().map(e => e.occurrenceYm))],
      [[['', 0, 0], ['', 0, 0], ['', 0, 0], ['', 0, 0]], [['2026-08'], ['2026-08'], ['2026-06']]]);

    const gdi = b2Dated(legacyPay('gd', { rec: 'yes', status: 'upcoming', date: '2026-08-05', amount: 200 }));
    const total = a => authority(a).goals.gH.shown + a.snap().inv.iA;
    const gdiTotal = total(gdi);
    const gdiTry = attempt(gdi, b2ToIsa('gd'));
    invariant('FA3CB2.no-double-count', 'No goal ↔ investment relink counts one £200 under both simulated goal and investment: the reset (unpaid) annual Holiday row moved to the ISA brings nothing (£6,200 before and after); a represented Holiday completion moved to the ISA (Holiday completion reversed, ISA completion 2026-08) keeps £6,200 (simulated Holiday £1,000 + ISA £5,200)',
      [stgTotal, total(stg), gdiTotal, gdiTry[0], b2Active(gdi), total(gdi)], [6200, 6200, 6200, [], [['investment:iA', '2026-08', 200]], 6200]);

    invariant('FA3CB2.schema2-hole', 'After every goal ↔ investment relink above, allowed or refused, legacy Holiday equals simulated Holiday: ambiguous monthly, dated, unpaid then completed, stale ISA, stale Holiday, Holiday → ISA, one-off dated and dateless, annual ambiguous and dated, Smart Import',
      [amb, dat, unp, sti, stg, gdi, oo, od, an, ad, si].map(a => b2View(a).slice(0, 2)),
      [[1000, 1000], [1200, 1200], [1200, 1200], [1000, 1000], [1200, 1200], [1000, 1000], [1200, 1200], [1000, 1000], [1000, 1000], [1200, 1200], [1000, 1000]]);

    const atm = b2Ambiguous(); attempt(atm, b2ToGoal('im'));
    invariant('FA3CB2.atomic', 'Every refusal is atomic: the form refusals (ambiguous monthly and annual, dateless one-off, stale ISA) and the Smart Import refusal left the whole stored state unchanged, and a refused form save keeps the edit\'s intent ("replace") for the retry',
      [[ambTry, anTry, odTry, stiTry].map(t => t[1]), siTry[1], atm.run('window._geodePayLinkedIntent')], [[true, true, true, true], true, 'replace']);

    const card = { debts: [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 }] };
    const bl = b2Ambiguous(null, card), bd = b2Ambiguous(null, card);
    const blTry = attempt(bl, a => a.editPayment('im', { investId: '' })), bdTry = attempt(bd, a => a.editPayment('im', { investId: '', debtId: 'dC' }));
    invariant('FA3CB2.scope', 'Bill and debt destinations keep their FA-3C-B behaviour (for investment rows an FA-7C decision): the ambiguous paid ISA row can still become a bill or a debt payment; since FA-7B the row is not investment authority, so the ISA keeps the £200 its opening anchor holds (ISA £5,200 each)',
      [blTry[0], bl.snap().inv.iA, bdTry[0], bd.snap().inv.iA], [[], 5200, [], 5200]);

    const dl = b2Ambiguous(legacyInvPay('iz', { rec: 'yes', date: '2026-06-05', investId: 'iZ' }));
    const dlTry = attempt(dl, b2ToGoal('iz'));
    invariant('FA3CB2.dead-link', 'C5 (FA-3C-C): a paid row still naming a removed investment adds nothing anywhere, and in schema 2 a paid row cannot start counting toward a goal from the form — moving it to Holiday is refused, nothing changed; Holiday £1,000, ISA £5,000 (before FA-3C-C the move was allowed and legacy Holiday counted it, £1,200)',
      [dlTry, dl.snap().goal.gH, dl.snap().inv.iA], [[[REFUSED_PAID_TO_GOAL], true], 1000, 5000]);
    invariant('FA3CB2.dead-link.occurrence', 'The refused move records no completion — not at the stale due month (2026-06), not now — and leaves no undated goal effect to carry (the row still names the removed investment)',
      [b2Active(dl), b2Candidate(dl, 'iz')], [[], null]);
    invariant('FA3CB3B.dead-link.after-transition', 'The gap FA-3C-B.3b left for FA-3C-C is closed: a paid row can no longer start counting toward a goal with neither dated evidence nor a carry — C5 refuses it, so Holiday £1,000 everywhere (before: legacy £1,200 against simulated £1,000)',
      b2View(dl), [1000, 1000, 5000]);
  });
}

// FA-3C-B.3a: the payment form keeps a row's paid occurrence (lastPaidYM) and its recurrence; only a status change writes lastPaidYM.

const B3A_AT = '2026-08-10';
const CARD = () => ({ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 });
/** Paid rows with no lastPaidYM, no event and no carry: goal monthly £200, ISA monthly £200, goal annual £200 (next due June 2027). */
const B3A_GOAL = () => legacyPay('pm', { amount: 200, rec: 'yes', date: '2026-06-05' });
const B3A_INV = () => legacyInvPay('im', { rec: 'yes', date: '2026-06-05' });
const B3A_ANNUAL = () => legacyPay('pa', { amount: 200, rec: 'annual', date: '2027-06-05' });
/** Upcoming £200 Holiday rows due 5 August, to complete natively (toggle) or through the form. */
const b3aUpcoming = (id, rec) => legacyPay(id, { amount: 200, rec, status: 'upcoming', date: '2026-08-05' });
/** A legacy state before the schema transition (no carries) loaded at clock: Holiday £1,000 and Car £500 bases, ISA £5,000, Card debt. */
const b3aLoad = (payments, clock) => {
  const app = new App(legacyState({}, { payments, goals: [HOLIDAY(), CAR()], debts: [CARD()] }), clock || B3A_AT);
  app.reload();
  return app;
};
const b3aRow = (app, id) => app.state().payments.filter(p => p.id === id)[0];
/** [lastPaidYM, ledger events, carry records] */
const b3aProv = (app, id) => [b3aRow(app, id).lastPaidYM || '', app.events().length, (app.state().contributionCarry || []).length];
/** Everything authority reads: rows (name aside), contribution and debt ledgers, carries, goal and investment caches (the activity log is not authority). */
const b3aMoney = app => {
  const s = app.state();
  return [s.payments.map(p => Object.assign({}, p, { name: '' })), s.contributionEvents, s.contributionCarry || [], s.debtPaymentEvents,
    s.goals.map(g => [g.id, g.saved, g.baseSaved]), s.investments.map(i => [i.id, i.balance, i.baseBalance])];
};
/** [legacy Holiday, simulated Holiday] */
const b3aView = app => [app.snap().goal.gH, authority(app).goals.gH.shown];
const b3aActive = b2Active;

function fa3cb3aForm() {
  scenario('FA-3C-B.3a FORM ROUND-TRIP — opening a payment and saving it unchanged changes nothing authority reads', () => {
    const semantic = r => [r.amount, r.status, r.date, r.rec, r.lastPaidYM || '', r.goalId || '', r.investId || '', r.debtId || '', r.contributionEventId || ''];
    const roundTrip = (rows, native) => {
      const app = b3aLoad(rows()), control = b3aLoad(rows());
      native.forEach(id => { app.toggle(id); control.toggle(id); });
      const before = app.state().payments.map(p => [p.id, semantic(p)]);
      app.state().payments.forEach(p => app.modalEdit(p.id));
      const changed = app.state().payments.filter((p, i) => !same(semantic(p), before[i][1])).map(p => p.id);
      const afterSave = same(b3aMoney(app), b3aMoney(control));
      app.reload(); control.reload();
      return [changed, afterSave, same(b3aMoney(app), b3aMoney(control))];
    };
    const debtRow = (id, o) => legacyPay(id, Object.assign({ amount: 50, goalId: '', debtId: 'dC', payKind: 'debt', date: '2026-08-01' }, o));
    invariant('FA3CB3A.roundtrip.oneoff', 'One-off rows — paid Holiday (dated by FA-3B at load), upcoming ISA, paid debt payment, paid bill, Holiday completed natively — each opened in the edit form and saved unchanged: no field changes (amount, status, date, recurrence, lastPaidYM, goal / investment / debt link, event pointer), ledgers, carries and balances identical to the untouched state, also after reload',
      roundTrip(() => [legacyPay('o1'), legacyInvPay('o2', { status: 'upcoming', date: '2026-08-20' }), debtRow('o3', {}),
        legacyPay('o4', { amount: 80, goalId: '', payKind: 'bill' }), b3aUpcoming('o5', 'no')], ['o5']), [[], true, true]);
    invariant('FA3CB3A.roundtrip.monthly', 'Monthly rows — ambiguous paid Holiday (no lastPaidYM), ISA and debt payment completed natively (lastPaidYM 2026-08), upcoming Holiday — saved unchanged: nothing changes, also after reload',
      roundTrip(() => [B3A_GOAL(), legacyInvPay('m2', { rec: 'yes', status: 'upcoming', date: '2026-08-05' }), debtRow('m3', { rec: 'yes', status: 'upcoming' }),
        legacyPay('m4', { amount: 100, rec: 'yes', status: 'upcoming', date: '2026-08-25' })], ['m2', 'm3']), [[], true, true]);
    invariant('FA3CB3A.roundtrip.annual', 'Annual rows — ambiguous paid Holiday, Holiday completed natively (lastPaidYM 2026-08, next due 2027), upcoming ISA, paid bill completed in March (lastPaidYM 2026-03) — saved unchanged: each stays annual and nothing changes, also after reload',
      roundTrip(() => [B3A_ANNUAL(), b3aUpcoming('a2', 'annual'), legacyInvPay('a3', { rec: 'annual', status: 'upcoming', date: '2027-02-01' }),
        legacyPay('a4', { amount: 120, rec: 'annual', goalId: '', payKind: 'bill', lastPaidYM: '2026-03', date: '2027-03-01' })], ['a2']), [[], true, true]);
  });

  scenario('FA-3C-B.3a PAID → PAID — an edit is not a completion: the form never stamps or clears lastPaidYM', () => {
    const control = b3aLoad([B3A_GOAL(), B3A_INV()]); control.reload();
    /** [row after the save, provenance after the save, provenance after reload, app] */
    const edit = (id, changes) => {
      const a = b3aLoad([B3A_GOAL(), B3A_INV()]); a.at('2026-08-12'); a.modalEdit(id, changes);
      const row = b3aRow(a, id), saved = b3aProv(a, id);
      a.reload();
      return [row, saved, b3aProv(a, id), a];
    };
    /** No lastPaidYM, no event, one carry record: the Holiday row's transition carry (the ISA row is never carried). */
    const HELD = ['', 0, 1];
    const nc = edit('pm', {});
    invariant('FA3CB3A.monthly.nochange', 'An ambiguous paid monthly Holiday £200 (no lastPaidYM or event; carried at the transition) opened and saved with nothing changed: lastPaidYM stays empty, no event, no carry record beyond the transition carry; after reload nothing is seeded and every row, ledger and balance equals the untouched state',
      [nc[1], nc[2], same(b3aMoney(nc[3]), b3aMoney(control))], [HELD, HELD, true]);
    const rg = edit('pm', { name: 'Holiday monthly (renamed)' }), ri = edit('im', { name: 'ISA monthly (renamed)' });
    invariant('FA3CB3A.monthly.rename', 'Renamed only — the Holiday row and the ISA row: the name changes; lastPaidYM stays empty, the save records no event and no carry record (the only one is the Holiday transition carry), and reload seeds nothing',
      [[rg[0].name, rg[1], rg[2]], [ri[0].name, ri[1], ri[2]]], [['Holiday monthly (renamed)', HELD, HELD], ['ISA monthly (renamed)', HELD, HELD]]);

    const am = edit('pm', { amount: '250' });
    const nat = b3aLoad([b3aUpcoming('nm', 'yes')]); nat.toggle('nm'); nat.modalEdit('nm', { amount: '250' });
    invariant('FA3CB3A.monthly.amount', 'Amount £200 → £250 while paid. Provenance: the ambiguous row keeps lastPaidYM empty and gains no event (also after reload); its transition carry is amended to £250 (two carry records). Amount: Holiday £1,250 (£1,000 + the amended carry); a row completed natively this month keeps lastPaidYM 2026-08 and, a template edit (FA-4C, D9 Option B; before FA-4C its completion was replaced at £250), keeps its £200 completion and records nothing - row £250, lastPaidAmount £200, £1,200',
      [am[1], am[2], am[3].snap().goal.gH, b3aRow(nat, 'nm').lastPaidYM, b3aActive(nat), nat.events().map(e => e.eventType), b3aView(nat),
        [b3aRow(nat, 'nm').amount, b3aRow(nat, 'nm').lastPaidAmount]],
      [['', 0, 2], ['', 0, 2], 1250, '2026-08', [['goal:gH', '2026-08', 200]], ['completion'], [1200, 1200], [250, 200]]);

    const lk = edit('pm', { goalId: 'gB' });
    invariant('FA3CB3A.monthly.link', 'Relinked Holiday → Car (a move FA-3C-B.2 permits): lastPaidYM stays empty, no event — the transition carry moves with it (two carry records), reload seeds nothing on Car either (Holiday £1,000, Car £700)',
      [lk[0].goalId, lk[1], lk[2], [lk[3].snap().goal.gH, lk[3].snap().goal.gB]], ['gB', ['', 0, 2], ['', 0, 2], [1000, 700]]);
    const dt = edit('pm', { date: '2026-07-05' });
    invariant('FA3CB3A.monthly.date', 'Due date 5 June → 5 July while paid: lastPaidYM stays empty, no event, no carry record beyond the transition carry, reload seeds nothing (whether an edited due date is migration evidence is FA-3C-B.3b)',
      [dt[0].date, dt[1], dt[2]], ['2026-07-05', HELD, HELD]);

    const battery = id => [{}, { name: 'renamed' }, { amount: '250' }, id === 'pm' ? { goalId: 'gB' } : { investId: 'iB' }, { date: '2026-07-05' }, { rec: 'annual' }]
      .map(changes => {
        const a = b3aLoad([B3A_GOAL(), B3A_INV()]); a.run('S.investments.push(' + JSON.stringify(PENSION()) + '); save();');
        a.at('2026-08-12'); a.modalEdit(id, changes);
        const saved = b3aRow(a, id).lastPaidYM || '';
        a.reload();
        return [saved, a.events().length];
      });
    const SIX = [['', 0], ['', 0], ['', 0], ['', 0], ['', 0], ['', 0]];
    invariant('FA3CB3A.goal.no-stamp', 'The ambiguous Holiday row gains no occurrence evidence from any edit — unchanged, renamed, amount, relinked to Car, due date, monthly → annual: lastPaidYM empty after the save, no event after reload',
      battery('pm'), SIX);
    invariant('FA3CB3A.invest.no-stamp', 'The same for the ambiguous ISA row — unchanged, renamed, amount, relinked to the Pension, due date, monthly → annual',
      battery('im'), SIX);

    const clock = at => {
      const a = b3aLoad([B3A_GOAL(), legacyPay('pk', { amount: 120, rec: 'annual', lastPaidYM: '2026-03', date: '2027-03-01' })], at);
      a.modalEdit('pm', { name: 'renamed' }); a.modalEdit('pk', { name: 'renamed' }); a.modalEdit('pm', {}); a.modalEdit('pk', {});
      const kept = [b3aRow(a, 'pm').lastPaidYM || '', b3aRow(a, 'pk').lastPaidYM || ''];
      a.reload();
      return [kept, a.events().map(e => [e.paymentId, e.eventType, e.occurrenceYm])];
    };
    const KEPT = [['', '2026-03'], [['pk', 'completion', '2026-03']]];
    invariant('FA3CB3A.clock-independent', 'Renamed then saved unchanged in June 2026, August 2026 and January 2027: the ambiguous monthly row keeps an empty lastPaidYM and the annual row its March 2026 completion month — the wall clock never becomes the paid month; the only event is the March completion FA-3B dates from the stored lastPaidYM',
      ['2026-06-20', '2026-08-12', '2027-01-15'].map(clock), [KEPT, KEPT, KEPT]);
  });

  scenario('FA-3C-B.3a ANNUAL — the form keeps an annual row annual, and keeps its occurrence through later actions', () => {
    const map = b3aLoad([legacyPay('rn', { rec: 'no' }), B3A_GOAL(), B3A_ANNUAL(), b3aUpcoming('ra', 'annual'), legacyPay('rx', { rec: undefined })]);
    invariant('FA3CB3A.annual.preserve-rec', 'The edit form opens every stored recurrence as itself — one-off, monthly, annual (paid and upcoming) — and a row with no stored recurrence as One-off, as the save treats it',
      ['rn', 'pm', 'pa', 'ra', 'rx'].map(id => map.modalForm(id).rec), ['no', 'yes', 'annual', 'annual', 'no']);

    const native = () => { const a = b3aLoad([b3aUpcoming('na', 'annual')]); a.toggle('na'); return a; };
    const look = a => { const r = b3aRow(a, 'na'); return [r.rec, r.lastPaidYM, r.date, r.contributionEventId, a.events().length]; };
    const nc = native(), ncBefore = look(nc); nc.modalEdit('na', {});
    invariant('FA3CB3A.annual.nochange', 'An annual Holiday £200 completed natively in August (lastPaidYM 2026-08, next due August 2027) opened and saved unchanged: still annual, same lastPaidYM, date and event pointer, no new event',
      [ncBefore, look(nc)], [['annual', '2026-08', '2027-08-05', ncBefore[3], 1], ncBefore]);

    const control = b3aLoad([B3A_ANNUAL()]); control.reload();
    const amb = b3aLoad([B3A_ANNUAL()]); amb.modalEdit('pa', {});
    const ambSaved = [b3aRow(amb, 'pa').rec, b3aRow(amb, 'pa').lastPaidYM];
    amb.reload();
    invariant('FA3CB3A.annual.no-future-save-seed', 'An ambiguous paid annual Holiday row (next due June 2027, no lastPaidYM — as stored it seeds nothing: untouched control has no event) opened and saved unchanged in August 2026: still annual, lastPaidYM empty; reload seeds nothing — no one-off completion dated June 2027',
      [control.events().length, ambSaved, amb.events().length, same(b3aMoney(amb), b3aMoney(control))], [0, ['annual', ''], 0, true]);

    const rn = native(), rnPointer = b3aRow(rn, 'na').contributionEventId; rn.modalEdit('na', { name: 'Holiday annual (renamed)' });
    invariant('FA3CB3A.annual.rename', 'Renamed with Annual kept: still annual, lastPaidYM 2026-08, the 2026-08 completion stays active and pointed to; legacy and simulated £1,200',
      [b3aRow(rn, 'na').rec, b3aRow(rn, 'na').lastPaidYM, b3aActive(rn), b3aRow(rn, 'na').contributionEventId === rnPointer, b3aView(rn)],
      ['annual', '2026-08', [['goal:gH', '2026-08', 200]], true, [1200, 1200]]);

    const un = native(); un.modalEdit('na', { name: 'renamed' }); un.toggle('na');
    invariant('FA3CB3A.annual.rename-undo', 'Completed natively → renamed → marked not completed: the completion is reversed (no phantom), legacy and simulated agree at £1,000',
      [b3aActive(un), un.events().map(e => e.eventType), b3aView(un)], [[], ['completion', 'reversal'], [1000, 1000]]);
    const dl = native(); dl.modalEdit('na', { name: 'renamed' }); dl.del('na');
    invariant('FA3CB3A.annual.rename-delete', 'Completed natively → renamed → deleted: the occurrence the row still represents is reversed (FA-3A delete policy), legacy and simulated agree at £1,000',
      [b3aActive(dl), dl.events().map(e => e.eventType), b3aView(dl)], [[], ['completion', 'reversal'], [1000, 1000]]);
    const ar = native(); ar.modalEdit('na', { name: 'renamed' }); ar.modalEdit('na', { amount: '300' });
    invariant('FA3CB3A.annual.rename-amount', 'Completed natively → renamed → amount £300: a template edit (FA-4C, D9 Option B; before FA-4C the 2026-08 occurrence was replaced at £300) - the 2026-08 completion stays active at £200, no new event or occurrence, row £300 with lastPaidAmount £200; legacy and simulated agree at £1,200',
      [b3aActive(ar), ar.events().map(e => e.eventType), b3aView(ar), [b3aRow(ar, 'na').amount, b3aRow(ar, 'na').lastPaidAmount]],
      [[['goal:gH', '2026-08', 200]], ['completion'], [1200, 1200], [300, 200]]);

    const ma = b3aLoad([b3aUpcoming('mt', 'yes')]); ma.toggle('mt'); ma.modalEdit('mt', { rec: 'annual' });
    const maMid = [b3aRow(ma, 'mt').rec, b3aRow(ma, 'mt').lastPaidYM, b3aActive(ma)];
    ma.toggle('mt');
    invariant('FA3CB3A.monthly-to-annual-undo', 'A monthly Holiday £200 completed natively in August, changed to Annual while paid (lastPaidYM stays 2026-08; the completion is re-recorded as annual for the same occurrence, FA-3A), then marked not completed: the completion is reversed — legacy and simulated agree at £1,000',
      [maMid, b3aActive(ma), b3aView(ma)], [['annual', '2026-08', [['goal:gH', '2026-08', 200]]], [], [1000, 1000]]);
  });

  scenario('FA-3C-B.3a STATUS — only a status change writes lastPaidYM, through the existing completion and reversal lifecycle', () => {
    const complete = rec => { const a = b3aLoad([b3aUpcoming('u', rec)]); a.modalEdit('u', { status: 'paid' }); return [b3aRow(a, 'u').lastPaidYM || '', b3aActive(a), b3aView(a)]; };
    invariant('FA3CB3A.status.unpaid-paid', 'Upcoming → Completed through the form records the completion now (2026-08): monthly and — like togglePay, FA-3C-B.3b — annual stamp lastPaidYM 2026-08; one-off keeps it empty; legacy and simulated £1,200',
      ['yes', 'annual', 'no'].map(complete), ['2026-08', '2026-08', ''].map(ym => [ym, [['goal:gH', '2026-08', 200]], [1200, 1200]]));
    const undo = rec => { const a = b3aLoad([b3aUpcoming('u', rec)]); a.toggle('u'); a.modalEdit('u', { status: 'upcoming' }); return [b3aRow(a, 'u').lastPaidYM || '', b3aActive(a), a.events().map(e => e.eventType), b3aView(a)]; };
    invariant('FA3CB3A.status.paid-unpaid', 'Completed natively → set back to Scheduled through the form: lastPaidYM cleared and the completion reversed — monthly, annual and one-off; legacy and simulated £1,000',
      ['yes', 'annual', 'no'].map(undo), ['yes', 'annual', 'no'].map(() => ['', [], ['completion', 'reversal'], [1000, 1000]]));
  });

  scenario('FA-3C-B.3a AUTHORITY BOUNDARY — an edit cannot turn an ambiguous row into a movable dated one', () => {
    const isa = b2Ambiguous(), cand0 = b2Candidate(isa, 'im');
    isa.modalEdit('im', { name: 'ISA monthly (renamed)' });
    const candSaved = b2Candidate(isa, 'im');
    isa.reload();
    const isaAfter = [b3aProv(isa, 'im'), isa.state().contributionCarry.filter(c => c.entityType !== 'goal').length];
    const isaTry = attempt(isa, a => a.modalEdit('im', { investId: '', goalId: 'gH' }));
    const goal = b3aLoad([B3A_GOAL()]);
    goal.modalEdit('pm', { name: 'Holiday monthly (renamed)' }); goal.reload();
    const goalTry = attempt(goal, a => a.modalEdit('pm', { goalId: '', investId: 'iA' }));
    invariant('FA3CB3A.b2-still-refuses', 'The red-team bypass is closed: the ambiguous paid ISA row renamed and reloaded after the transition is still ambiguous — lastPaidYM empty, no event, no investment carry — so ISA → Holiday is still refused, nothing changed (ISA £5,200, Holiday £1,000); the ambiguous Holiday row (holding its transition carry) renamed and reloaded is still refused Holiday → ISA',
      [isaAfter, isaTry, b2View(isa), b3aProv(goal, 'pm'), goalTry], [[['', 0, 0], 0], [[REFUSED_MOVE], true], [1000, 1000, 5200], ['', 0, 1], [[REFUSED_MOVE], true]]);
    isa.advance('2026-09-02', 'reload'); isa.reload();
    invariant('FA3CB3A.fa7-evidence', 'The undated ISA evidence FA-7 will carry survives the edit: geodeLegacyCarryCandidate gives the same ISA £200 candidate before the rename, after it, after reload and the refused relink, and after the September reload',
      [cand0, candSaved, b2Candidate(isa, 'im')], [B2_CANDIDATE, B2_CANDIDATE, B2_CANDIDATE]);
  });

  scenario('FA-3C-B.3a — temporal and migration weaknesses left open for FA-3C-B.3b, as FA-3C-B.3b leaves them', () => {
    const f1 = b3aLoad([legacyPay('f1', { date: '2026-12-10' })]);
    invariant('FA3CB3A.b3-open.future-oneoff', 'FA-3C-B.3b: a legacy paid Holiday one-off due 10 December 2026 loaded in August is not seeded — a future month proves no occurrence; the row stays paid and legacy Holiday still counts it (£1,250)',
      [b3bCompletions(f1), b3aRow(f1, 'f1').status, f1.snap().goal.gH], [[], 'paid', 1250]);
    const f2 = b3aLoad([legacyPay('f2', { amount: 200, rec: 'yes', lastPaidYM: '2027-03', date: '2026-06-05' })]);
    invariant('FA3CB3A.b3-open.future-lastpaid', 'FA-3C-B.3b: a paid monthly row whose stored lastPaidYM is 2027-03 loaded in August 2026 is not seeded, and rollover does not erase it — it stays paid with its stamp; legacy Holiday £1,200',
      [b3bCompletions(f2), b3aRow(f2, 'f2').status, b3aRow(f2, 'f2').lastPaidYM, f2.snap().goal.gH], [[], 'paid', '2027-03', 1200]);
    const f3 = b3aLoad([legacyPay('f3', { amount: 200, rec: 'yes', lastPaidYM: '2026-13', date: '2026-06-05' })]);
    invariant('FA3CB3A.b3-open.malformed-safety-net', 'FA-3C-B.3b: a paid monthly row with an invalid lastPaidYM (2026-13) gets no completion — no due-month fallback — and rollover does not erase it; legacy Holiday £1,200',
      [b3bCompletions(f3), b3aRow(f3, 'f3').status, b3aRow(f3, 'f3').lastPaidYM, f3.snap().goal.gH], [[], 'paid', '2026-13', 1200]);
    const far = b3aLoad([legacyPay('f4', { status: 'upcoming', date: '2099-01-10' })]); far.toggle('f4');
    invariant('FA3CB3A.b3-open.native-future-oneoff', 'FA-3C-B.3b: completing an upcoming one-off due January 2099 in August 2026 records August 2026 — the money moved now, the due date is only the schedule',
      b3bCompletions(far), [['2026-08', 'one_off', 'mark_completed']]);
    const zero = b3aLoad([legacyPay('f5', { amount: 0 })]);
    const zeroTry = attempt(zero, a => a.modalEdit('f5', { amount: '200' }));
    const zeroSession = [zero.events().length, b3aView(zero)];
    zero.reload();
    invariant('FA3CB3A.b3-open.late-seed', 'C5 (FA-3C-C): a paid £0 Holiday one-off corrected to £200 would start counting from the form, so schema 2 refuses it — nothing changed, no completion, Holiday £1,000, and the next load seeds nothing (before FA-3C-C it was dated in the session at the due month, June 2026)',
      [zeroTry, zeroSession, b3bCompletions(zero)], [[[REFUSED_PAID_TO_GOAL], true], [0, [1000, 1000]], []]);
    const oneOff = b3aLoad([B3A_GOAL()]); oneOff.modalEdit('pm', { rec: 'no' }); oneOff.reload();
    invariant('FA3CB3A.b3-open.recurrence-to-oneoff', 'Closed by FA-3C-C (C3: seeding only at the transition): the ambiguous paid monthly row, carried at the transition, changed to One-off records nothing, and the next load (schema 2) seeds nothing — its carry keeps the amount (before FA-3C-C the next schema-1 load dated it June 2026 as a one-off)',
      [b3bCompletions(oneOff), b3bTransition(oneOff), b3bTriple(oneOff)], [[], [['pm', 'goal:gH', 'undated_contribution', 200]], [1200, 1200, 200]]);
  });
}

/** [occurrence, recurrence, source] of every completion in the ledger. */
const b3bCompletions = app => app.events().filter(e => e.eventType === 'completion').map(e => [e.occurrenceYm, e.recurrence, e.source]);
/** [occurrence, recurrence, source, due-date snapshot] of the active completions. */
const b3bDated = app => app.activeEvents().map(e => [e.occurrenceYm, e.recurrence, e.source, e.dueDateSnapshot]);
/** geodeContributionYmTrusted for each value at the app's clock. */
const b3bTrusted = (app, list) => list.map(ym => JSON.parse(app.run('JSON.stringify(geodeContributionYmTrusted(' + JSON.stringify(ym) + '))')));
/** geodeLegacyContributionSeedFields for every row: what migration would accept. */
const b3bSeedFields = app => JSON.parse(app.run('JSON.stringify(S.payments.map(function (p) { return geodeLegacyContributionSeedFields(S, p); }))'));
/** The rollover safety net called directly on a row, as syncRecurringPayments calls it before a reset. */
const b3bEnsure = (app, id) => app.run('geodeEnsureContributionCompletion(S.payments.filter(function (p) { return p.id === ' + JSON.stringify(id) + '; })[0], "rollover_safety_net"); save();');
/** Carries the schema 1→2 transition stored: [payment, entity, kind, amount] */
const b3bTransition = app => app.state().contributionCarry.filter(c => c.kind !== 'resolution').map(c => [c.paymentId, c.entityType + ':' + c.entityId, c.kind, c.amount]);
/** [Holiday shown, Holiday from a fresh authority derivation, its carry part] */
const b3bTriple = app => { const a = authority(app); return [app.snap().goal.gH, a.goals.gH.shown, a.goals.gH.parts.carry]; };
/** A schema-1 load (failed transition) with migration seeding disabled: only the rollover safety net can record a completion. */
const b3bUnseeded = (payments, clock) => legacyLoad(legacyState({}, { payments, goals: [HOLIDAY(), CAR()], debts: [CARD()] }), clock || B3A_AT);
const b3bStatus = (app, ids) => ids.map(id => [b3aRow(app, id).status, b3aRow(app, id).lastPaidYM || '']);
const B3B_FUTURE_ONEOFF = () => legacyPay('f1', { date: '2026-12-10' });
const B3B_FUTURE_STAMP = () => legacyPay('f2', { amount: 200, rec: 'yes', lastPaidYM: '2027-03', date: '2026-06-05' });
const B3B_MALFORMED = () => legacyPay('f3', { amount: 200, rec: 'yes', lastPaidYM: '2026-13', date: '2026-06-05' });

function fa3cb3bTemporal() {
  scenario('FA-3C-B.3b TEMPORAL EVIDENCE — a completion is dated only by trusted evidence, never after the current month', () => {
    const dec = b3aLoad([], '2026-12-10');
    const decTrust = b3bTrusted(dec, ['2026-12', '2027-01', '2025-12', '2026-13', '2026-00', 'garbage', '', '2026-1', null]);
    dec.at('2027-01-10');
    invariant('FA3CB3B.helper.boundary', 'geodeContributionYmTrusted: in December 2026, 2026-12 and 2025-12 are trusted; 2027-01 (future), 2026-13, 2026-00, garbage, empty, 2026-1 and null are not; in January 2027, 2026-12 and 2027-01 are trusted and 2027-02 is not',
      [decTrust, b3bTrusted(dec, ['2026-12', '2027-01', '2027-02'])], [[true, false, true, false, false, false, false, false, false], [true, true, false]]);

    const fo = b3aLoad([B3B_FUTURE_ONEOFF(), legacyInvPay('fi', { date: '2026-12-10' })]); fo.reload(); fo.reload();
    invariant('FA3CB3B.future-oneoff.no-seed', 'Legacy paid one-offs due December 2026 (Holiday £250, ISA £200) loaded in August and reloaded twice: no completion, rows still paid, legacy Holiday £1,250 and ISA £5,200 unchanged',
      [b3bCompletions(fo), b3bStatus(fo, ['f1', 'fi']), fo.snap().goal.gH, fo.snap().inv.iA], [[], [['paid', ''], ['paid', '']], 1250, 5200]);

    const fl = b3aLoad([B3B_FUTURE_STAMP(), legacyPay('fa', { amount: 200, rec: 'annual', lastPaidYM: '2026-09', date: '2027-09-05' })]); fl.reload(); fl.reload();
    invariant('FA3CB3B.future-lastpaid.no-seed', 'Paid monthly (lastPaidYM 2027-03) and annual (lastPaidYM 2026-09) rows loaded in August 2026 and reloaded twice: no completion, no fallback to the due month, stamps and paid status kept; legacy Holiday £1,400',
      [b3bCompletions(fl), b3bStatus(fl, ['f2', 'fa']), fl.snap().goal.gH], [[], [['paid', '2027-03'], ['paid', '2026-09']], 1400]);

    const bad = ['2026-13', '2026-00', 'garbage', '2026-8'];
    const ml = b3aLoad(bad.map((ym, i) => legacyPay('m' + i, { amount: 200, rec: 'yes', lastPaidYM: ym, date: '2026-06-05' })));
    bad.forEach((ym, i) => b3bEnsure(ml, 'm' + i)); ml.reload();
    invariant('FA3CB3B.malformed-lastpaid.no-fallback', 'Paid monthly rows with lastPaidYM 2026-13, 2026-00, garbage and 2026-8: neither migration, rollover nor the safety net called directly records a completion — no due-month fallback; rows stay paid with their stamps; legacy Holiday £1,800',
      [b3bCompletions(ml), b3bStatus(ml, bad.map((ym, i) => 'm' + i)), ml.snap().goal.gH], [[], bad.map(ym => ['paid', ym]), 1800]);

    const ft = b3aLoad([legacyPay('n1', { amount: 200, status: 'upcoming', date: '2099-01-10' })]); ft.toggle('n1'); ft.reload();
    const ff = b3aLoad([legacyPay('n1', { amount: 200, status: 'upcoming', date: '2099-01-10' })]); ff.modalEdit('n1', { status: 'paid' }); ff.reload();
    const fn = b3aLoad([]); const fnId = fn.contribute({ name: 'Holiday later', amount: 200, date: '2099-01-10', status: 'paid', rec: 'no', goalId: 'gH' }); fn.reload();
    const ftDated = b3bDated(ft); ft.toggle('n1');
    invariant('FA3CB3B.native-future-oneoff.current-occurrence', 'A one-off due January 2099 completed in August 2026 — by Mark completed, by the form (Scheduled → Completed) or created Completed — records August 2026 with the 2099 due date as its schedule snapshot; after reload the row still represents it (legacy and simulated £1,200), and undoing reverses it',
      [ftDated, b3bDated(ff), b3bDated(fn), [ft.pointer('n1'), b3aActive(ft)], [!!ff.pointer('n1'), !!fn.pointer(fnId)], b3aView(ff)],
      [[['2026-08', 'one_off', 'mark_completed', '2099-01-10']], [['2026-08', 'one_off', 'payment_form', '2099-01-10']], [['2026-08', 'one_off', 'payment_form', '2099-01-10']], [null, []], [true, true], [1200, 1200]]);

    const pdue = (id, rec) => legacyPay(id, { amount: 200, rec, status: 'upcoming', date: '2026-06-10' });
    const pt = b3aLoad([pdue('o1', 'no')]); pt.toggle('o1'); pt.reload();
    const pf = b3aLoad([pdue('o1', 'no'), pdue('a1', 'annual')]); pf.modalEdit('o1', { status: 'paid' }); pf.modalEdit('a1', { status: 'paid' }); pf.reload();
    const pfDated = b3bDated(pf), pfView = b3aView(pf), ptDated = b3bDated(pt), pfStamp = b3aRow(pf, 'a1').lastPaidYM || '';
    pt.toggle('o1'); pf.toggle('o1'); pf.toggle('a1');
    invariant('FA3CB3B.native-past-due.current-occurrence', 'Past-due June items completed in August: nothing in the app asks when the money moved and "Completed means the money has moved", so the one-off (Mark completed or form) and the annual (form, lastPaidYM stamped 2026-08) record August 2026 with June as the schedule snapshot; after reload still represented (legacy and simulated £1,400), undoing reverses them',
      [ptDated, pfDated, pfView, pfStamp, [b3aActive(pt), b3aActive(pf)]],
      [[['2026-08', 'one_off', 'mark_completed', '2026-06-10']], [['2026-08', 'one_off', 'payment_form', '2026-06-10'], ['2026-08', 'annual', 'payment_form', '2026-06-10']], [1400, 1400], '2026-08', [[], []]]);

    const sm = b3aLoad([b3aUpcoming('s1', 'no'), legacyPay('s2', { amount: 200, date: '2026-08-05' })]); sm.toggle('s1');
    invariant('FA3CB3B.same-month-oneoff', 'A one-off due 5 August completed in August records August (Mark completed), and a legacy paid one-off due 5 August is seeded for August — both keep the due date as snapshot',
      b3bDated(sm).sort(), [['2026-08', 'one_off', 'mark_completed', '2026-08-05'], ['2026-08', 'one_off', 'migration', '2026-08-05']].sort());

    const rn = b3aLoad([b3aUpcoming('nm', 'yes')]); rn.toggle('nm'); rn.modalEdit('nm', { rec: 'no' }); rn.reload();
    const ra = b3aLoad([B3A_GOAL()]); ra.modalEdit('pm', { rec: 'no' });
    invariant('FA3CB3B.recurrence-to-oneoff.no-invention', 'A monthly completion recorded in August, changed to One-off while paid, keeps its recorded occurrence (August 2026, now one-off) and nothing else after reload; the ambiguous paid monthly row changed to One-off records nothing in the save, and in schema 2 no later load seeds it (FA3CB3A.b3-open.recurrence-to-oneoff)',
      [b3bDated(rn).map(r => r.slice(0, 2)), b3bCompletions(rn).length, ra.events().length], [[['2026-08', 'one_off']], 2, 0]);

    const dl = b3aLoad([legacyInvPay('iz', { rec: 'yes', date: '2026-06-05', investId: 'iZ' }), legacyInvPay('iy', { date: '2026-12-10', investId: 'iZ' })]);
    const dlTry = [attempt(dl, b2ToGoal('iz')), attempt(dl, b2ToGoal('iy'))];
    invariant('FA3CB3B.dead-link.occurrence', 'Paid rows naming a removed investment (monthly due June, lastPaidYM empty; one-off due December) cannot be moved to Holiday in schema 2 (C5): both refused, nothing changed — no completion at the stale or the future month, no carry (they never counted toward a goal), Holiday £1,000 (before FA-3C-C both moved and legacy Holiday showed £1,400)',
      [dlTry, b3bCompletions(dl), b3bTransition(dl), b3bTriple(dl)], [[[[REFUSED_PAID_TO_GOAL], true], [[REFUSED_PAID_TO_GOAL], true]], [], [], [1000, 1000, 0]]);
  });

  scenario('FA-3C-B.3b MIGRATION — the seed and the rollover safety net accept the same evidence: valid and not after the current month', () => {
    const le = b3aLoad([legacyPay('z1', { amount: 0 }), legacyPay('z2', { amount: 0, rec: 'yes', date: '2026-06-05' }),
      legacyPay('z3', { amount: 0, rec: 'yes', lastPaidYM: '2026-08', date: '2026-06-05' }), legacyPay('z4', { amount: 0, date: '2026-12-10' })]);
    const leTry = ['z1', 'z2', 'z3', 'z4'].map(id => attempt(le, a => a.modalEdit(id, { amount: '200' }))[0]);
    invariant('FA3CB3B.late-edit.same-session', 'Paid £0 Holiday rows corrected to £200 in one session — one-off due June, unstamped monthly, monthly stamped 2026-08, one-off due December: in schema 2 a paid row cannot start counting from the form (C5), so all four are refused and nothing is dated or carried; Holiday £1,000 (before FA-3C-C two were dated at their evidence month and legacy Holiday showed £1,800)',
      [leTry, b3bCompletions(le), b3bTriple(le)], [[[REFUSED_PAID_TO_GOAL], [REFUSED_PAID_TO_GOAL], [REFUSED_PAID_TO_GOAL], [REFUSED_PAID_TO_GOAL]], [], [1000, 1000, 0]]);

    const vp = b3aLoad([legacyPay('p1', {}), legacyPay('p2', { amount: 200, rec: 'yes', lastPaidYM: '2026-08', date: '2026-06-05' }),
      legacyPay('p3', { amount: 200, rec: 'yes', lastPaidYM: '2026-07', date: '2026-06-05' }), legacyPay('p4', { amount: 200, rec: 'annual', lastPaidYM: '2026-03', date: '2027-03-05' })]);
    invariant('FA3CB3B.seed.valid-past', 'Valid past or current evidence is still seeded as before: one-off due June (with its due date), monthly stamped August and July, annual stamped March; the July row then rolls over to upcoming',
      [seededRows(vp), b3aRow(vp, 'p3').status], [[['p1', 'goal:gH', '2026-06', 250, 'one_off', '2026-06-10', 'migration'], ['p2', 'goal:gH', '2026-08', 200, 'monthly', '', 'migration'],
        ['p3', 'goal:gH', '2026-07', 200, 'monthly', '', 'migration'], ['p4', 'goal:gH', '2026-03', 200, 'annual', '', 'migration']], 'upcoming']);

    const fr = b3aLoad([B3B_FUTURE_ONEOFF(), legacyPay('f2', { amount: 200, rec: 'yes', lastPaidYM: '2026-09', date: '2026-06-05' }),
      legacyPay('fa', { amount: 200, rec: 'annual', lastPaidYM: '2027-01', date: '2027-09-05' })]);
    invariant('FA3CB3B.seed.future-rejected', 'Evidence after August 2026 — one-off due December, monthly stamped September, annual stamped January 2027 — gives no seed fields and no completion; nothing is re-dated to the current or due month',
      [b3bSeedFields(fr), b3bCompletions(fr)], [[null, null, null], []]);

    const mr = b3aLoad([legacyPay('q1', { amount: 200, rec: 'yes', lastPaidYM: '2026-13', date: '2026-06-05' }), legacyPay('q2', { amount: 200, rec: 'yes', lastPaidYM: '2026-00', date: '2026-06-05' }),
      legacyPay('q3', { amount: 200, rec: 'yes', lastPaidYM: 'garbage', date: '2026-06-05' }), legacyPay('q4', { amount: 200, rec: 'yes', date: '2026-06-05' }),
      legacyPay('q5', { date: '2026-13-01' }), legacyPay('q6', { date: '' })]);
    invariant('FA3CB3B.seed.malformed-rejected', 'Malformed or missing evidence — lastPaidYM 2026-13, 2026-00, garbage or empty; a one-off dated 2026-13-01 or undated — gives no seed fields and no completion',
      [b3bSeedFields(mr), b3bCompletions(mr)], [[null, null, null, null, null, null], []]);

    const sf = b3bUnseeded([legacyPay('sv', { amount: 200, rec: 'yes', lastPaidYM: '2026-07', date: '2026-06-05' }), legacyPay('sf', { amount: 200, rec: 'yes', lastPaidYM: '2026-09', date: '2026-06-05' }), B3B_FUTURE_ONEOFF()]);
    b3bEnsure(sf, 'sf'); b3bEnsure(sf, 'f1');
    invariant('FA3CB3B.safety-net.future-rejected', 'With migration seeding off, rollover records the July-stamped row (2026-07) and resets it; the September-stamped row is neither recorded nor reset, and the safety net called directly on it or on the December one-off records nothing',
      [b3bCompletions(sf), b3bStatus(sf, ['sv', 'sf', 'f1'])], [[['2026-07', 'monthly', 'rollover_safety_net']], [['upcoming', ''], ['paid', '2026-09'], ['paid', '']]]);

    const sm = b3bUnseeded([legacyPay('sv', { amount: 200, rec: 'yes', lastPaidYM: '2026-07', date: '2026-06-05' }), B3B_MALFORMED(), legacyPay('sg', { amount: 200, rec: 'yes', lastPaidYM: 'garbage', date: '2026-06-05' })]);
    b3bEnsure(sm, 'f3'); b3bEnsure(sm, 'sg');
    invariant('FA3CB3B.safety-net.malformed-rejected', 'With migration seeding off, rows stamped 2026-13 and garbage are neither recorded at their due month (2026-06) nor reset, even when the safety net is called on them directly; the valid July row is recorded and reset',
      [b3bCompletions(sm), b3bStatus(sm, ['sv', 'f3', 'sg'])], [[['2026-07', 'monthly', 'rollover_safety_net']], [['upcoming', ''], ['paid', '2026-13'], ['paid', 'garbage']]]);

    const ml = b3aLoad([B3B_FUTURE_STAMP(), B3B_MALFORMED(), B3A_GOAL()]);
    invariant('FA3CB3B.monthly-left.untrusted-stamp', 'Legacy display effect of keeping them paid: monthly rows stamped 2027-03 or 2026-13 count in Monthly Left exactly like the ambiguous paid monthly row with no stamp — not as this month\'s outflow',
      ml.rows().map(r => [r.id, r.status, r.countsInMonthlyLeft]), [['f2', 'paid', false], ['f3', 'paid', false], ['pm', 'paid', false]]);

    const si = b3aLoad([]);
    si.smartImport([{ name: 'Holiday July', amount: 200, date: '2026-07-20', link: 'goal:gH' }, { name: 'Holiday December', amount: 200, date: '2026-12-20', link: 'goal:gH' }]);
    invariant('FA3CB3B.smart-import.transaction-month', 'Smart Import rows keep their transaction month: a July transaction records 2026-07; a December one is imported as scheduled and records nothing',
      [b3bCompletions(si), si.state().payments.map(p => p.status)], [[['2026-07', 'one_off', 'smart_import']], ['paid', 'upcoming']]);
  });

  scenario('FA-3C-B.3b PRESERVATION — rejected evidence stays where carries, FA-7 and FA-3C-B.2 find it', () => {
    const b2f = b2Ambiguous(legacyInvPay('im', { date: '2026-12-10' })), b2s = b2Ambiguous(legacyInvPay('im', { rec: 'yes', lastPaidYM: '2027-03', date: '2026-06-05' }));
    const b2fTry = attempt(b2f, b2ToGoal('im')), b2sTry = attempt(b2s, b2ToGoal('im'));
    invariant('FA3CB3B.b2.future-remains-ambiguous', 'A paid ISA one-off due December and a paid ISA monthly stamped 2027-03 are not dated by the rejected seed, so they stay ambiguous: ISA → Holiday is refused and nothing changes (Holiday £1,000 = simulated, ISA £5,200)',
      [b2fTry, b2sTry, b3bCompletions(b2f).concat(b3bCompletions(b2s)), b2View(b2f), b2View(b2s)], [[[REFUSED_MOVE], true], [[REFUSED_MOVE], true], [], [1000, 1000, 5200], [1000, 1000, 5200]]);

    const cg = b3aLoad([B3B_FUTURE_ONEOFF(), B3B_FUTURE_STAMP(), B3B_MALFORMED()]);
    invariant('FA3CB3B.carry.future-preserved', 'Holiday rows whose evidence was rejected (one-off due December £250, monthly stamped 2027-03 £200, monthly stamped 2026-13 £200) are what the transition carried, undated: Holiday £1,650 = £1,000 + carries £650, as the legacy load showed',
      [b3bTransition(cg), b3bTriple(cg)], [[['f1', 'goal:gH', 'undated_contribution', 250], ['f2', 'goal:gH', 'undated_contribution', 200], ['f3', 'goal:gH', 'undated_contribution', 200]], [1650, 1650, 650]]);

    const fi = b3aLoad([legacyInvPay('i1', { date: '2026-12-10' }), legacyInvPay('i2', { rec: 'yes', lastPaidYM: '2027-03', date: '2026-06-05' }), legacyInvPay('i3', { rec: 'yes', lastPaidYM: '2026-13', date: '2026-06-05' })]);
    const cand = id => { const c = b2Candidate(fi, id); return c && [c.entityType + ':' + c.entityId, c.kind, c.amount, c.recurrence]; };
    invariant('FA3CB3B.fa7.future-preserved', 'ISA rows whose evidence was rejected stay FA-7 evidence: each still gives an undated ISA £200 candidate, no investment carry is created, and ISA keeps £5,600 (the legacy figure, held by its FA-7B opening anchor)',
      [['i1', 'i2', 'i3'].map(cand), b3bTransition(fi), fi.snap().inv.iA],
      [[['investment:iA', 'undated_contribution', 200, 'one_off'], ['investment:iA', 'undated_contribution', 200, 'monthly'], ['investment:iA', 'undated_contribution', 200, 'monthly']], [], 5600]);
  });

  scenario('FA-3C-B.3b STABILITY — reloads, months and years', () => {
    const tl = b3aLoad([legacyPay('p1', {}), B3B_FUTURE_ONEOFF(), B3B_FUTURE_STAMP(), B3B_MALFORMED(), legacyPay('n1', { amount: 200, status: 'upcoming', date: '2026-06-10' }), b3aUpcoming('n2', 'yes')]);
    tl.toggle('n1'); tl.toggle('n2');
    const tlMoney = b3aMoney(tl), tlView = b3bTriple(tl);
    for (let i = 0; i < 10; i++) tl.reload();
    invariant('FA3CB3B.ten-load', 'Valid, future, malformed and natively completed rows loaded ten more times: rows, ledgers, carries and caches unchanged, three completions (June one-off seeded, past-due one-off and monthly completed in August), Holiday £2,300 = £1,000 + dated £650 + carries £650',
      [same(b3aMoney(tl), tlMoney), b3bCompletions(tl).length, b3bTriple(tl), tlView], [true, 3, [2300, 2300, 650], [2300, 2300, 650]]);

    const cm = b3aLoad([legacyPay('cm', { amount: 200, rec: 'yes', status: 'upcoming', date: '2026-06-05' }), legacyPay('co', { amount: 200, status: 'upcoming', date: '2026-08-20' })], '2026-06-10');
    cm.toggle('cm'); cm.toggle('co');
    cm.advance('2026-07-10', 'reload'); cm.toggle('cm');
    cm.advance('2026-08-10', 'reload');
    invariant('FA3CB3B.cross-month', 'June → July → August: a monthly completed in June and July records 2026-06 and 2026-07 and rolls over; a one-off due 20 August completed in June records June (when the money moved), not August; Holiday £1,600 (D1 closed by FA-3C-C; the legacy display showed £1,200)',
      [b3bCompletions(cm), b3bStatus(cm, ['cm', 'co']), b3aView(cm)],
      [[['2026-06', 'monthly', 'mark_completed'], ['2026-06', 'one_off', 'mark_completed'], ['2026-07', 'monthly', 'mark_completed']], [['upcoming', ''], ['paid', '']], [1600, 1600]]);

    const cy = b3aLoad([legacyPay('ym', { amount: 200, rec: 'yes', status: 'upcoming', date: '2026-12-05' }), legacyPay('yo', { amount: 200, status: 'upcoming', date: '2027-01-15' }),
      legacyPay('yl', { amount: 200, rec: 'yes', lastPaidYM: '2026-12', date: '2026-12-05' })], '2026-12-10');
    cy.toggle('ym'); cy.toggle('yo');
    const cyDec = [b3bCompletions(cy), b3bStatus(cy, ['ym', 'yl'])];
    cy.advance('2027-01-10', 'reload');
    invariant('FA3CB3B.cross-year', 'December 2026 → January 2027: the legacy row stamped 2026-12 is seeded for December; a monthly and a one-off due 15 January completed in December record 2026-12; in January 2026-12 < 2027-01, so both monthly rows roll over (their completions kept) and nothing is dated 2027',
      [cyDec, b3bCompletions(cy), b3bStatus(cy, ['ym', 'yl', 'yo'])],
      [[[['2026-12', 'monthly', 'migration'], ['2026-12', 'monthly', 'mark_completed'], ['2026-12', 'one_off', 'mark_completed']], [['paid', '2026-12'], ['paid', '2026-12']]],
        [['2026-12', 'monthly', 'migration'], ['2026-12', 'monthly', 'mark_completed'], ['2026-12', 'one_off', 'mark_completed']], [['upcoming', ''], ['upcoming', ''], ['paid', '']]]);

    const look = app => [b3bDated(app), b3bTriple(app), app.state().payments.map(p => [p.id, p.status, p.lastPaidYM || '', !!p.contributionEventId])];
    const cases = [
      ['native future one-off', b3aLoad([legacyPay('n1', { amount: 200, status: 'upcoming', date: '2099-01-10' })]), a => a.toggle('n1')],
      ['native past-due annual (form)', b3aLoad([legacyPay('a1', { amount: 200, rec: 'annual', status: 'upcoming', date: '2026-06-10' })]), a => a.modalEdit('a1', { status: 'paid' })],
      ['£0 → £200 one-off', b3aLoad([legacyPay('z1', { amount: 0 })]), a => a.modalEdit('z1', { amount: '200' })],
      ['£0 → £200 unstamped monthly', b3aLoad([legacyPay('z2', { amount: 0, rec: 'yes', date: '2026-06-05' })]), a => a.modalEdit('z2', { amount: '200' })],
      ['dead link → Holiday', b3aLoad([legacyInvPay('iz', { rec: 'yes', date: '2026-06-05', investId: 'iZ' })]), b2ToGoal('iz')],
      ['monthly completion → One-off', b3aLoad([b3aUpcoming('nm', 'yes')]), a => { a.toggle('nm'); a.modalEdit('nm', { rec: 'no' }); }]
    ];
    invariant('FA3CB3B.same-session-reload', 'Each B.3b action seen in the same session and after a reload is identical — active completions, legacy and simulated values, row status, stamp and pointer: ' + cases.map(c => c[0]).join(', '),
      cases.map(([label, app, act]) => { act(app); const s = look(app); app.reload(); return [label, same(look(app), s)]; }), cases.map(c => [c[0], true]));

    const ma = b3aLoad([B3B_FUTURE_ONEOFF(), legacyPay('f2', { amount: 200, rec: 'yes', lastPaidYM: '2026-09', date: '2026-06-05' })]);
    const maAug = [b3bCompletions(ma), ma.snap().goal.gH];
    ma.advance('2026-09-10', 'reload'); const maSep = [b3bCompletions(ma), ma.snap().goal.gH];
    ma.advance('2026-12-10', 'reload');
    invariant('FA3CB3B.c3.evidence-matures', 'Closed by FA-3C-C (C3: seeding only at the transition): rejected future evidence is never seeded later — not the September stamp in September, not the December one-off in December; both stay carried, so Holiday holds £1,450 throughout (before FA-3C-C a later schema-1 load dated each once its month arrived)',
      [maAug, maSep, [b3bCompletions(ma), ma.snap().goal.gH], b3bTransition(ma).map(c => c[0])], [[[], 1450], [[], 1450], [[], 1450], ['f1', 'f2']]);
  });
}

// FA-3C-C: the one-time schema 1 → 2 transition; in schema 2 goal Saved is base + dated completions + carries − releases.

const FA3CC_FAILED = '[geode] schema 2 transition not completed, staying on schema 1: ';
const SAVE_FAILED = 'Could not save data (storage may be full).';
/** Consumes the app's console warnings: the reason each failed transition gave ('? ' marks any other warning). */
const transitionFailures = app => app.warnings.splice(0).map(w => (w.indexOf(FA3CC_FAILED) === 0 ? w.slice(FA3CC_FAILED.length) : '? ' + w));
const toasts = app => JSON.parse(app.run('JSON.stringify(__toasts)'));
const stored = app => JSON.parse(app.run('__store'));
/** Counts store writes through localStorage — the transition's commit (the harness save() writes the store directly). */
const watchWrites = app => app.run('var __writes = 0, __setItem = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY) __writes++; return __setItem.call(localStorage, k, v); };');
const writes = app => { const n = app.run('__writes'); app.run('__writes = 0;'); return n; };
/** Local time h:m on an ISO date. */
const clockAt = (app, iso, h, m) => { const [y, mo, d] = iso.split('-').map(Number); app.run('__nowMs = new __RealDate(' + y + ',' + (mo - 1) + ',' + d + ',' + h + ',' + m + ').getTime();'); };
/** A load's financial result without ids or creation times: display, seeded completions, carries, goal parts and positions. */
const financial = app => { const a = authority(app); return [app.snap(), seededRows(app), carryRows(app.state().contributionCarry), Object.keys(a.goals).map(g => [g, a.goals[g].parts, a.goals[g].position])]; };
/** __reload up to the transition: what a load has done when it commits schema 2. */
const FA3CC_TO_TRANSITION = "_geodeRuntimeStale = ''; _geodeFinancialKeySeen = false; geodeNoteFinancialBoot(__store);" +
  ' S = JSON.parse(__store); S._schemaVersion = geodePersistedSchemaVersion(S._schemaVersion); geodeNormalizeContributionEvents(S); geodeNormalizeContributionCarry(S);' +
  ' migratePaymentFlowFields(); geodeNormalizeGoalInvestBaseFields(); geodeNormalizeSavingsReleases(S);';
/** CARRY_MIX plus a monthly Holiday £100 completed this month (lastPaidYM 2026-08): seeded completions beside the carries; Holiday £1,450. */
const FA3CC_MIX = (() => {
  const s = JSON.parse(JSON.stringify(CARRY_MIX));
  s.goals[0].saved = 1450;
  s.payments.push(legacyPay('pc', { amount: 100, rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-15' }));
  return s;
})();
const GA_STATE = () => fa3cbFixture('monthly-ambiguous')[2];
const AMBIGUOUS_MONTHLY = (id, o) => legacyPay(id, Object.assign({ amount: 100, rec: 'yes', date: '2026-06-03' }, o));

function fa3ccTransition() {
  scenario('FA-3C-C TRANSITION — version rule, order, one write, conservation', () => {
    const app = new App(baseState(), '2026-08-10');
    const values = JSON.parse(app.run('JSON.stringify([undefined, null, "2", "x", NaN, Infinity, 0, -1, 1.5, true, 1, 2, 3].map(function (v) { return geodePersistedSchemaVersion(v); }))'));
    const src = PROGRAM.src, sAt = src.indexOf('\nvar S = {'), sDecl = src.slice(sAt, src.indexOf('\n};', sAt));
    const load = PROGRAM.structural.load, persist = load.indexOf('S._schemaVersion = geodePersistedSchemaVersion(p._schemaVersion);');
    invariant('FA3CC.transition.version-rule', 'A stored marker counts only as a whole number ≥ 1 (missing, null, text, NaN, Infinity, 0, negative, fractional or boolean → schema 1); the build is schema 2, and a fresh install (nothing stored) keeps the default marker, so it starts at schema 2 and never transitions',
      [values, app.run('GEODE_SCHEMA_VERSION'), sDecl.indexOf('_schemaVersion: GEODE_SCHEMA_VERSION,') >= 0, load.indexOf('if (d) {') < persist && persist < load.indexOf('} catch(e) {}')],
      [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3], 2, true, true]);

    const g1 = fa3cbFixture('one-off');
    const boot = v => {
      const s = JSON.parse(JSON.stringify(g1[2]));
      if (v !== undefined) s._schemaVersion = v;
      const a = new App(s, g1[3]);
      return [seededRows(a).length, stored(a)._schemaVersion, a.snap().goal.gH, a.warnings.length ? flagged(a) : 'clean'];
    };
    const MOVED = [1, 2, 1250, 'clean'];
    invariant('FA3CC.transition.version-load', 'Stored G1 (paid one-off £250 for Holiday) with the marker missing, "2", 0, −1, 1.5, "x", null or 1 loads as schema 1 and transitions once (completion seeded, stored marker 2, Holiday £1,250); a numeric 2 is already schema 2 — nothing seeded, the unowned row is flagged and adds nothing (Holiday £1,000)',
      [undefined, '2', 0, -1, 1.5, 'x', null, 1, 2].map(boot), [MOVED, MOVED, MOVED, MOVED, MOVED, MOVED, MOVED, MOVED, [0, 2, 1000, true]]);

    const tr = extractFunction(src, 'geodeSchema2Transition').text;
    const steps = ['geodeSeedLegacyContributionEvents();', 'geodeSchema2TransitionCarryRecords(S)', 'geodeSchema2AuthorityProblems(S, true)',
      'S._schemaVersion = GEODE_SCHEMA_VERSION;', 'geodeSchema2CommitTransition()'].map(s => tr.indexOf(s));
    const gateAt = load.indexOf(RELEASE_GATE), syncAt = load.indexOf('syncRecurringPayments();');
    invariant('FA3CC.c4.order', 'The transition seeds dated completions, then carries what rows cannot date, validates, sets the marker and only then writes; load runs it (behind the release gate) before recurring sync resets paid rows — every construct is found before its position is compared',
      [steps.every(i => i >= 0), steps.every((i, n) => !n || steps[n - 1] < i), gateAt >= 0 && syncAt >= 0 && gateAt < syncAt], [true, true, true]);

    const once = new App(FA3CC_MIX, '2026-08-20', undefined, { boot: false });
    watchWrites(once);
    once.run('__reload()');
    const first = [writes(once), stored(once)._schemaVersion, same(stored(once).contributionEvents, once.events()), same(stored(once).contributionCarry, once.state().contributionCarry)];
    const ledger = [once.events(), once.state().contributionCarry, once.run('__uidN')];
    once.reload(); once.reload();
    invariant('FA3CC.c2.one-write', 'The transition persists the whole state in one store write (marker 2, the seeded completions and the four carries as held in memory); two later loads write nothing and change no completion, carry, id or time, and allocate no ids',
      [first, writes(once), same([once.events(), once.state().contributionCarry, once.run('__uidN')], ledger)], [[1, 2, true, true], 0, true]);

    const CARRIED = { 'monthly-ambiguous': [100], 'annual-ambiguous': [250], 'annual-ambiguous-past': [250], negative: [-50] };
    const outcome = f => {
      const a = new App(f[2], f[3]);
      return [f[0], a.snap().goal.gH, legacyLoad(f[2], f[3]).snap().goal.gH, seededRows(a).map(r => [r[0], r[2], r[3], r[4], r[5]]), carryRows(a.state().contributionCarry).map(c => c[3])];
    };
    invariant('FA3CC.transition.conservation', 'Every FA-3B goal fixture (G0–G12, GA, GB, GC, GX, GS): Holiday after the transition equals the legacy display, except G4, whose dated June £250 the legacy load dropped is restored (£1,250); G5 invents nothing; GA/GB/GC keep their ambiguous effect and GX its −£50 as carries; seeded completions are exactly the occurrences the rows prove',
      FA3B_GOALS.map(outcome), FA3B_GOALS.map(f => [f[0], f[0] === 'monthly-prior-unsynced' ? f[7] : f[6], f[6], f[4], CARRIED[f[0]] || []]));
  });
}

function fa3ccCrash() {
  scenario('FA-3C-C CRASH — a failed transition persists nothing and leaves schema 1 in memory; the next load retries', () => {
    const clock = '2026-08-20';
    const legacy = legacyLoad(FA3CC_MIX, clock).state();
    const failing = fault => {
      const app = new App(FA3CC_MIX, clock, undefined, { boot: false });
      const before = app.run('__store');
      app.run('__storageFault = ' + JSON.stringify(fault) + '; __toasts = [];');
      app.run('__reload()');
      return { app, before, look: [transitionFailures(app), toasts(app), app.run('__store') === before, app.state()._schemaVersion, same(app.state(), legacy), app.snap().goal] };
    };
    const FAILED = [['storage'], [SAVE_FAILED], true, 1, true, { gH: 1450, gB: 540 }];
    const thrown = failing('throw'), lost = failing('lose');
    invariant('FA3CC.c2.crash.setitem-throws', 'localStorage.setItem throws during the transition write: the warning gives storage, the save-failed toast shows, the store is untouched, and memory is exactly the schema-1 fallback load (legacy Holiday £1,450, Car £540)',
      thrown.look, FAILED);
    invariant('FA3CC.c2.crash.write-lost', 'The write returns but the read-back differs (nothing stored): treated the same — storage warning and toast, store untouched, schema 1 in memory exactly',
      lost.look, FAILED);
    lost.app.run('__toasts = []; __reload()');
    invariant('FA3CC.c2.crash.reload-after-failure', 'Reloading while storage still fails retries and fails the same way: still schema 1, store still the original, legacy figures',
      [transitionFailures(lost.app), toasts(lost.app), lost.app.run('__store') === lost.before, lost.app.state()._schemaVersion, lost.app.snap().goal], [['storage'], [SAVE_FAILED], true, 1, { gH: 1450, gB: 540 }]);

    const bad = JSON.parse(JSON.stringify(FA3CC_MIX));
    bad.contributionCarry = [CARRY('cinv', 'im', { entityType: 'investment', entityId: 'iA', amount: 200 })];
    const invalid = new App(bad, clock, undefined, { boot: false });
    const badBefore = invalid.run('__store');
    invalid.run('__toasts = []; __reload()');
    invariant('FA3CC.c2.crash.validation', 'A transition that fails validation (a stored investment carry) stops before the final write: the warning names the problem, no toast, store untouched, schema 1 in memory with nothing seeded, legacy Holiday £1,450',
      [transitionFailures(invalid), toasts(invalid), invalid.run('__store') === badBefore, invalid.state()._schemaVersion, invalid.events().length, invalid.snap().goal.gH], [['investment carry cinv'], [], true, 1, 0, 1450]);

    thrown.app.run('__storageFault = "";');
    clockAt(thrown.app, '2026-08-21', 15, 0);
    watchWrites(thrown.app);
    thrown.app.run('__reload()');
    const clean = new App(FA3CC_MIX, '2026-08-21');
    invariant('FA3CC.c2.crash.retry', 'With storage working again the next load (the 21st at 15:00: other ids and creation times) transitions and persists schema 2 at once; its financial result — display, seeded completions, carries, goal parts and positions — equals an uninterrupted transition (21st at noon)',
      [writes(thrown.app), stored(thrown.app)._schemaVersion, same(financial(thrown.app), financial(clean)), thrown.app.state().contributionCarry[0].createdAt === clean.state().contributionCarry[0].createdAt],
      [1, 2, true, false]);
    const done = [thrown.app.events(), thrown.app.state().contributionCarry];
    thrown.app.reload();
    invariant('FA3CC.c2.crash.after-success', 'Reloading after the successful retry does not transition again: no write; completions and carries identical, ids and creation times included',
      [writes(thrown.app), same([thrown.app.events(), thrown.app.state().contributionCarry], done)], [0, true]);

    const interrupted = reopen => {
      const app = new App(FA3CC_MIX, clock, undefined, { boot: false });
      app.run(FA3CC_TO_TRANSITION + ' var __committed = geodeSchema2Transition();');
      const committed = app.run('__committed');
      app.at(reopen); app.run('__reload()');
      const whole = new App(FA3CC_MIX, clock);
      whole.at(reopen); whole.run('__reload()');
      return [committed, same(app.state(), whole.state()), app.snap().goal];
    };
    invariant('FA3CC.c2.crash.before-sync', 'The app dies after the transition write but before recurring sync and the recompute: reopening the same day or on 2 September (past the carries\' month) gives exactly the state of an uninterrupted boot followed by the same reopen; Holiday £1,450, Car £540',
      ['2026-08-20', '2026-09-02'].map(interrupted), [[true, true, { gH: 1450, gB: 540 }], [true, true, { gH: 1450, gB: 540 }]]);

    const broken = JSON.parse(JSON.stringify(fa3cbFixture('one-off')[2]));
    broken._schemaVersion = 2;
    broken.contributionCarry = [CARRY('cinv', 'im', { entityType: 'investment', entityId: 'iA', amount: 200 })];
    const inc = new App(broken, '2026-08-10');
    inc.reload();
    const REPORT = INTEGRITY + 'investment carry cinv; payment p1 counts toward goal gH with no completion or carry';
    invariant('FA3CC.c2.incomplete', 'A stored schema-2 state missing the paid one-off\'s completion and holding an investment carry is reported on every load and repaired by none: nothing seeded, no carry added or dropped, the row adds nothing (Holiday £1,000), the investment carry adds nothing (ISA £5,000), the marker stays 2',
      [inc.warnings.splice(0), inc.events(), same(inc.state().contributionCarry, broken.contributionCarry), inc.snap().goal.gH, inc.snap().inv.iA, stored(inc)._schemaVersion],
      [[REPORT, REPORT], [], true, 1000, 5000, 2]);
  });
}

function fa3ccAuthority() {
  scenario('FA-3C-C AUTHORITY — goal Saved is base + dated completions + carries − releases; payment rows add nothing', () => {
    const app = new App(CARRY_MIX, '2026-08-20');
    const saved = id => app.state().goals.filter(g => g.id === id)[0].saved;
    const a = authority(app);
    invariant('FA3CC.authority.parts', 'CARRY_MIX after the transition: Holiday base £1,000 + dated £250 + carries £300 (£100 + £250 − £50) − release £200 = £1,350; Car £500 + carry £40 = £540; the g.saved cache, a fresh derivation and the display agree',
      [a.goals.gH.parts, a.goals.gB.parts, [saved('gH'), a.goals.gH.position, app.snap().goal.gH], [saved('gB'), a.goals.gB.position, app.snap().goal.gB]],
      [{ base: 1000, dated: 250, carry: 300, released: 200 }, { base: 500, dated: 0, carry: 40, released: 0 }, [1350, 1350, 1350], [540, 540, 540]]);

    const recompute = extractFunction(PROGRAM.src, 'geodeRecomputeBalancesFromPayments').text;
    invariant('FA3CC.c1.single-writer', 'One schema-2 formula: geodeSchema2GoalEffectiveSaved is gone, and the sole cache writer stores geodeSchema2GoalPosition for goals in schema 2 and (FA-7B) the investment display balance — position authority, or the legacy rebuild only where no valid valuation exists — with no row adding to an investment',
      [PROGRAM.src.indexOf('geodeSchema2GoalEffectiveSaved') < 0, recompute.indexOf('g.saved = geodeSchema2GoalPosition(S, g);') >= 0,
        recompute.indexOf('if (!schema2) eff.goal.saved += eff.amount;') >= 0, recompute.indexOf('inv.balance = geodeInvestmentDisplayBalance(S, inv);') >= 0,
        recompute.indexOf('eff.investment') < 0], [true, true, true, true, true]);

    const agree = () => { const x = authority(app); return ['gH', 'gB'].every(g => saved(g) === x.goals[g].position); };
    const steps = [];
    const top = app.contribute({ name: 'Top-up', amount: 60, date: '2026-08-20', status: 'paid', goalId: 'gH' }); steps.push(agree());
    app.release('gH', 50); steps.push(agree());
    app.editGoal('gB', { gs: '700' }); steps.push(agree());
    app.toggle('px'); steps.push(agree());
    app.del(top); steps.push(agree());
    app.reload(); steps.push(agree());
    invariant('FA3CC.c1.cache', 'Readers read g.saved, and after each action — new paid contribution, release, Saved So Far, undoing a carried row, deleting a payment — and a reload, the cache equals a fresh schema-2 derivation: Holiday £1,350 + £60 − £50 − £100 − £60 = £1,200, Car £700',
      [steps, app.snap().goal], [[true, true, true, true, true, true], { gH: 1200, gB: 700 }]);

    const rows = new App(CARRY_MIX, '2026-08-20');
    rows.run('S.payments.forEach(function (p) { if (p.id === "px" || p.id === "p1") p.amount = 5000; }); S.payments.push(' + JSON.stringify(legacyPay('pz', { amount: 999, date: '2026-08-01' })) + '); save();');
    rows.reload();
    invariant('FA3CC.authority.rows-add-nothing', 'Payment rows prove no history in schema 2: a dated and a carried row raised to £5,000 in storage and an extra paid £999 row with no completion leave Holiday at £1,350 (the unowned row is flagged); the ISA shows its FA-7B opening anchor (£5,200, the legacy figure), not its rows',
      [rows.snap().goal, rows.snap().inv.iA, flagged(rows)], [{ gH: 1350, gB: 540 }, 5200, true]);

    const inv = new App(CARRY_MIX, '2026-08-20');
    inv.run('var e = JSON.parse(JSON.stringify(S.contributionEvents[0])); e.id = "ev_inv"; e.paymentId = "ghost"; e.entityType = "investment"; e.entityId = "iA";' +
      ' e.amount = 1000; e.occurrenceYm = "2026-08"; e.dueDateSnapshot = ""; S.contributionEvents.push(e); save();');
    inv.reload();
    const ghost = [inv.snap().inv.iA, inv.activeEvents().filter(e => e.paymentId === 'ghost').length];
    const isa = inv.contribute({ name: 'ISA top-up', amount: 300, date: '2026-08-20', status: 'paid', investId: 'iA' });
    inv.reload();
    invariant('FA3CC.authority.investment-ledger', 'Since FA-7B the ledger, not rows, is investment cash-flow evidence (formerly FA3CC.authority.investment-legacy: "an active completion with no row adds nothing"): an active £1,000 ISA completion recorded after the opening anchor counts with no row (ISA £6,200); a native ISA completion counts once, through its event (ISA £6,500); Holiday unaffected',
      [ghost, inv.snap().inv.iA, inv.activeEvents().filter(e => e.paymentId === isa).length, inv.snap().goal.gH], [[6200, 1], 6500, 1, 1350]);

    const del = new App(CARRY_MIX, '2026-08-20');
    del.run(extractFunction(PROGRAM.src, 'geodeShouldCascadeDeleteLinkedPayment').text + '\n' + extractFunction(PROGRAM.src, 'delGoal').text);
    const history = [del.events(), del.state().contributionCarry, del.state().savingsReleases];
    del.call('delGoal', ['gH']);
    del.createGoal('Holiday', 2000, 0);
    del.reload();
    const fresh = del.state().goals.filter(g => g.name === 'Holiday')[0];
    invariant('FA3CC.authority.goal-deletion', 'Deleting Holiday (production delGoal: its recurring and unpaid rows go, paid one-offs stay) rewrites no completion, carry or release into another goal; a new goal named Holiday gets a new id and inherits none of that history (£0); Car keeps £540',
      [same([del.events(), del.state().contributionCarry, del.state().savingsReleases], history), fresh.id !== 'gH', del.snap().goal[fresh.id], del.snap().goal.gB], [true, true, 0, 540]);
  });
}

function fa3ccLifecycle() {
  scenario('FA-3C-C C3 — after schema 2, payment-row fields never become history', () => {
    const app = new App(legacyState({ saved: 1350 }, { payments: [legacyPay('pf', { date: '2026-09-10' }), AMBIGUOUS_MONTHLY('ps', { lastPaidYM: '2026-09', date: '2026-09-15' })] }), '2026-08-10');
    const look = () => [app.events().length, activeCarryRows(authority(app).active).length, app.snap().goal.gH];
    const seen = [look()];
    app.advance('2026-09-12', 'reload'); seen.push(look());
    app.advance('2026-10-05', 'reload'); seen.push(look());
    app.modalEdit('pf', { name: 'Renamed' }); app.editPayment('ps', { rec: 'no' }); app.reload(); seen.push(look());
    app.run('S.payments.forEach(function (p) { geodeEnsureContributionCompletion(p, "rollover"); });'); seen.push(look());
    const choke = JSON.parse(app.run('JSON.stringify([S.payments.every(function (p) { return geodeLegacyContributionSeedFields(S, p) === null; }),' +
      ' (function () { var c = JSON.parse(JSON.stringify(S)); c._schemaVersion = 1; return !!geodeLegacyContributionSeedFields(c, c.payments[0]); })()])'));
    invariant('FA3CC.c3.no-promotion', 'Future evidence carried at the August transition (one-off due 10 September, monthly stamped 2026-09) is never dated: not when its month arrives, not in October, not after a form edit or a recurrence change, not by the rollover safety net; Holiday £1,350 throughout. The seed choke point returns nothing in schema 2, though the same row would seed under schema 1',
      [seen, choke], [[[0, 2, 1350], [0, 2, 1350], [0, 2, 1350], [0, 2, 1350], [0, 2, 1350]], [true, true]]);

    const inv = new App(baseState(), '2026-08-10');
    inv.run('S.payments.push(' + JSON.stringify(legacyInvPay('im', { rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-05' })) + ', ' +
      JSON.stringify(legacyInvPay('iz', { amount: 150, rec: 'yes', lastPaidYM: '2026-08', date: '2026-07-05', investId: 'iZ' })) + '); save();');
    inv.reload();
    inv.editPayment('iz', { investId: 'iA' });
    inv.run('S.payments.forEach(function (p) { geodeEnsureContributionCompletion(p, "rollover"); });');
    const invLook = () => [inv.events().length, inv.rows().map(r => r.status), inv.snap().inv.iA];
    const invSeen = [invLook()];
    inv.advance('2026-09-10', 'reload'); invSeen.push(invLook());
    inv.advance('2026-10-10', 'reload'); invSeen.push(invLook());
    invariant('FA3CC.c3.investment', 'Schema-2 paid ISA monthly rows stamped August with no completion — one native-looking, one relinked from a removed investment (the recorder\'s row-evidence path) — are never dated: not by that edit, not by the safety net, not at rollover; with no completion owning their month both stay completed, preserved for FA-7C; since FA-7B a paid row without a completion is no cash flow, so the ISA stays at its opening anchor (£5,000; before FA-7B the rows counted, £5,350)',
      invSeen, [[0, ['paid', 'paid'], 5000], [0, ['paid', 'paid'], 5000], [0, ['paid', 'paid'], 5000]]);
  });

  scenario('FA-3C-C C4b — a carried monthly row resets once its carry\'s month has passed; the carry stays', () => {
    const look = app => { const p = app.state().payments[0]; return [p.status, p.lastPaidYM || '', app.snap().goal.gH, activeCarryRows(authority(app).active), resolutionRows(app), app.events().length]; };
    const PAID = ['paid', '', 1100, [['carry_pm', 'goal:gH', 100]], [], 0];
    const RESET = ['upcoming', '', 1100, [['carry_pm', 'goal:gH', 100]], [], 0];
    const late = new App(GA_STATE(), '2026-08-31', undefined, { boot: false });
    clockAt(late, '2026-08-31', 23, 30); late.run('__reload()');
    const lateAug = [look(late)];
    late.reload(); lateAug.push(look(late));
    clockAt(late, '2026-09-01', 0, 10); late.reload();
    const sep = look(late), sepState = late.state();
    late.reload(); late.reload(); late.render(); late.reload();
    invariant('FA3CC.c4b.transition-31-aug', 'Transition at 23:30 on 31 August: the carried GA row stays completed that night (two loads); at 00:10 on 1 September it resets to upcoming — carry kept, nothing reversed, no completion, no lastPaidYM invented, Holiday £1,100; three more loads and a render in September change nothing',
      [lateAug, sep, same(late.state(), sepState)], [[PAID, PAID], RESET, true]);

    const early = new App(GA_STATE(), '2026-09-01', undefined, { boot: false });
    clockAt(early, '2026-09-01', 0, 10); early.run('__reload()');
    const sepLooks = [look(early)];
    early.advance('2026-09-15', 'reload'); sepLooks.push(look(early));
    clockAt(early, '2026-09-30', 23, 50); early.reload(); sepLooks.push(look(early));
    clockAt(early, '2026-10-01', 0, 10); early.reload();
    invariant('FA3CC.c4b.transition-1-sep', 'Transition at 00:10 on 1 September: the carried row stays completed through September (loads on the 1st, the 15th and at 23:50 on the 30th) and resets at 00:10 on 1 October, carry kept',
      [sepLooks, look(early)], [[PAID, PAID, PAID], RESET]);

    const mix = new App(CARRY_MIX, '2026-08-20');
    mix.advance('2026-09-05', 'reload'); mix.advance('2026-10-05', 'reload');
    invariant('FA3CC.c4b.monthly-only', 'Only carried monthly rows reset: by October the carried monthly Holiday and Car rows are upcoming, while the carried annual and negative one-off rows, the dated one-off, the unstamped ISA row and the removed-goal row stay completed; all four carries kept, nothing reversed or dated; Holiday £1,350, Car £540',
      [mix.state().payments.map(p => [p.id, p.status, p.lastPaidYM || '']), activeCarryRows(authority(mix).active).length, resolutionRows(mix), mix.events().length, mix.snap().goal],
      [[['p1', 'paid', ''], ['px', 'upcoming', ''], ['pa', 'paid', ''], ['pn', 'paid', ''], ['pb', 'upcoming', ''], ['im', 'paid', ''], ['pg', 'paid', '']], 4, [], 1, { gH: 1350, gB: 540 }]);

    const before = new App(GA_STATE(), '2026-08-10');
    before.toggle('pm'); before.reload();
    const after = new App(GA_STATE(), '2026-08-10');
    after.advance('2026-09-05', 'reload');
    after.toggle('pm'); const completed = after.snap().goal.gH;
    after.toggle('pm'); const undone = after.snap().goal.gH;
    after.reload();
    invariant('FA3CC.c4b.undo', 'Before the reset, Mark not completed on the carried row reverses its carry (the contribution never happened): Holiday £1,000. After the September reset the template no longer owns it: completing it records September (£1,200) and undoing that reverses only September — the carry stays (£1,100 after reload)',
      [[before.snap().goal.gH, resolutionRows(before)], [completed, undone, after.snap().goal.gH, resolutionRows(after), after.activeEvents().length]],
      [[1000, [['carry_pm', 'reversed']]], [1200, 1100, 1100, [], 0]]);

    const d1 = carriedFixture('one-off'); d1.del('p1'); d1.reload();
    const d2 = carriedFixture('monthly-ambiguous'); d2.del('pm'); d2.reload();
    const d3 = carriedFixture('monthly-ambiguous'); d3.advance('2026-09-05', 'reload'); d3.del('pm'); d3.reload();
    const d4 = carriedFixture('monthly-ambiguous'); d4.advance('2026-09-05', 'reload'); d4.toggle('pm');
    const d4Completed = d4.snap().goal.gH;
    d4.del('pm'); d4.reload();
    invariant('FA3CC.c4b.payment-deletion', 'Deleting the dated one-off reverses its occurrence (£1,000); deleting the carried row before the reset reverses its carry (£1,000); after the reset, deleting the template leaves the detached carry (£1,100); with the carry and a September completion, deleting reverses only September (£1,200 → £1,100)',
      [[d1.snap().goal.gH, d1.activeEvents().length], [d2.snap().goal.gH, resolutionRows(d2)], [d3.snap().goal.gH, resolutionRows(d3)], [d4Completed, d4.snap().goal.gH, resolutionRows(d4), d4.activeEvents().length]],
      [[1000, 0], [1000, [['carry_pm', 'reversed']]], [1100, []], [1200, 1100, [], 0]]);
  });
}

function fa3ccRefusal() {
  scenario('FA-3C-C C5 — a completed row whose money did not count cannot start counting toward a goal from the form', () => {
    const app = new App(legacyState({}, { goals: [HOLIDAY(), CAR()], debts: [CARD()], payments: [
      legacyInvPay('di', { investId: 'iZ' }), legacyPay('bu', { goalId: '', payKind: 'bill', rec: 'yes', date: '2026-06-05' }),
      legacyPay('zm', { amount: 0, rec: 'yes', date: '2026-06-05' }), legacyPay('zo', { amount: 0 }),
      legacyPay('dr', { goalId: '', debtId: 'dC', payKind: 'debt' }), legacyPay('dg', { goalId: 'gGone' })] }), '2026-08-10');
    const tries = [['di', { investId: '', goalId: 'gH' }], ['bu', { goalId: 'gH' }], ['zm', { amount: 200 }], ['zo', { amount: 200 }], ['dr', { goalId: 'gH' }], ['dg', { goalId: 'gH' }]]
      .map(([id, changes]) => attempt(app, a => a.editPayment(id, changes)));
    const REFUSED = [[REFUSED_PAID_TO_GOAL], true];
    invariant('FA3CC.c5.refused', 'Refused with nothing changed: a dead investment link moved to Holiday, a paid unstamped bill linked to Holiday, a paid £0 monthly and a paid £0 one-off raised to £200, a paid debt row and a removed-goal link moved to Holiday; no completion or carry, Holiday £1,000, Car £500',
      [tries, app.events().length, app.state().contributionCarry.length, app.snap().goal], [[REFUSED, REFUSED, REFUSED, REFUSED, REFUSED, REFUSED], 0, 0, { gH: 1000, gB: 500 }]);

    const recovery = [a => a.toggle('di'), a => a.editPayment('di', { investId: '', goalId: 'gH' }), a => a.toggle('di')].map(act => attempt(app, act)[0]);
    invariant('FA3CC.c5.recovery', 'Recovery as the message says: mark the dead-link row not completed, link it to Holiday, complete it now — one completion dated this month (August, £200), Holiday £1,200',
      [recovery, app.activeEvents().map(e => [e.paymentId, e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount]), app.snap().goal.gH], [[[], [], []], [['di', 'goal:gH', '2026-08', 200]], 1200]);

    const ok = new App(legacyState({ saved: 1350 }, { payments: [legacyPay('p1'), AMBIGUOUS_MONTHLY('pc'),
      legacyPay('pu', { amount: 200, status: 'upcoming', date: '2026-08-05' }), legacyPay('ub', { amount: 200, goalId: '', payKind: 'bill', status: 'overdue', date: '2026-07-05' })] }), '2026-08-10');
    const allowed = [
      a => a.editPayment('p1', { name: 'Flights' }),
      a => a.editPayment('p1', { amount: 300 }),
      a => a.editPayment('pc', { amount: 150 }),
      a => { a.editPayment('ub', { goalId: 'gH' }); a.toggle('ub'); },
      a => a.contribute({ name: 'Extra', amount: 50, date: '2026-08-10', status: 'paid', goalId: 'gH' }),
      a => a.toggle('pu')
    ].map(act => [attempt(ok, act)[0], ok.snap().goal.gH]);
    ok.reload();
    invariant('FA3CC.c5.allowed', 'C5 refuses only new counting: renaming the dated one-off (£1,350), raising it to £300 (£1,400), raising the carried monthly row to £150 (£1,450), linking an unpaid July bill to Holiday then completing it now (August, £1,650), a new paid £50 (£1,700) and a native tap on an upcoming Holiday row (£1,900) all save without a refusal; after reload Holiday £1,900, each completion dated where it happened',
      [allowed, ok.snap().goal.gH, ok.activeEvents().map(e => [e.occurrenceYm, e.amount]).sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]))],
      [[[[], 1350], [[], 1400], [[], 1450], [[], 1650], [[], 1700], [[], 1900]], 1900, [['2026-06', 300], ['2026-08', 200], ['2026-08', 200], ['2026-08', 50]]]);
  });

  scenario('FA-3C-C SMART IMPORT — a refused merge changes nothing and is reported in the import summary', () => {
    const app = new App(legacyState({}, { payments: [legacyPay('bu', { goalId: '', payKind: 'bill', rec: 'yes', date: '2026-06-05' }), legacyPay('zo', { amount: 0 })] }), '2026-08-10');
    const money = a => { const s = a.state(); return [s.payments, s.contributionEvents, s.contributionCarry, s.goals]; };
    const before = money(app);
    const two = app.smartImport([{ name: 'Holiday savings', amount: 80, date: '2026-08-03', link: 'goal:gH', mergeId: 'bu' },
      { name: 'Holiday top-up', amount: 120, date: '2026-08-04', link: 'goal:gH', mergeId: 'zo' }]);
    const one = app.smartImport([{ name: 'Holiday savings', amount: 80, date: '2026-08-03', link: 'goal:gH', mergeId: 'bu' }]);
    const modal = extractFunction(PROGRAM.src, 'geodeSmartImportShowHandoffModal').text;
    invariant('FA3CC.c5.smart-import', 'Imports matched to completed rows whose money did not count (a bill, a £0 Holiday row) are refused: no row, completion, carry or goal changes and nothing is added (Holiday £1,000); the summary counts 2, then 1 for a single refusal, and the real handoff modal renders the refusal line',
      [same(money(app), before), [two.refusedMerges, two.added, one.refusedMerges, one.added], app.snap().goal.gH,
        modal.indexOf('geodeSmartImportRefusedMergeLine(sum.refusedMerges)') >= 0 && modal.indexOf('escHtmlLite(refusedLine)') >= 0],
      [true, [2, 0, 1, 0], 1000, true]);
    const line = n => app.run('geodeSmartImportRefusedMergeLine(' + n + ')');
    invariant('FA3CC.c5.smart-import.copy', 'Summary copy without ledger or schema words: nothing for 0, then the singular and plural lines',
      [line(0), line(1), line(2), /ledger|schema|carry|event|authority|transition/i.test(line(1) + line(2))],
      ['', '1 imported payment couldn\u2019t be merged into the matching item, so it was left out. Nothing else changed. If it\u2019s a separate payment, import it again as a new item.',
        '2 imported payments couldn\u2019t be merged into the matching items, so they were left out. Nothing else changed. If they\u2019re separate payments, import them again as new items.', false]);
  });
}

function fa3ccPositions() {
  scenario('FA-3C-C SAVED SO FAR — the entered total becomes the goal position, whatever history it holds', () => {
    const P = legacyPay, R = EVENT_RELEASE, M = () => AMBIGUOUS_MONTHLY('pc');
    const CASES = [
      ['base', [], [], null, 1500],
      ['event', [P('p1')], [], null, 1250],
      ['carry', [M()], [], null, 1400],
      ['event + carry', [P('p1'), M()], [], null, 1150],
      ['release', [], [R], null, 1700],
      ['event + release', [P('p1')], [R], null, 1450],
      ['carry + release', [M()], [R], null, 1600],
      ['event + carry + release', [P('p1'), M()], [R], null, 1350],
      ['negative carry', [P('pn', { amount: -50 })], [], null, 1550],
      ['multiple events', [P('p1'), P('p2', { amount: 150, date: '2026-07-10' })], [], null, 1100],
      ['reversed event', [P('p1')], [], a => a.toggle('p1'), 1500],
      ['amended carry', [M()], [], a => a.editPayment('pc', { amount: 150 }), 1350],
      ['resolved carry', [M()], [], a => a.toggle('pc'), 1500],
      ['recurring completed this month', [P('pm', { amount: 100, rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-15' })], [], null, 1400]
    ];
    const out = CASES.map(([label, payments, releases, act]) => {
      const app = new App(legacyState({}, { payments, savingsReleases: releases }), '2026-08-20');
      if (act) act(app);
      const t = app.editGoal('gH', { gs: '1500' });
      const g = () => app.state().goals[0];
      const row = [label, t, app.snap().goal.gH, g().saved, g().baseSaved];
      app.reload();
      return row.concat([app.snap().goal.gH, g().saved]);
    });
    invariant('FA3CC.saved.cases', 'Saved So Far £1,500 entered over each history — [case, toasts, shown, reopened form value, stored base, shown and form value after reload]: base = £1,500 − dated − carries + releases, signed carries respected, the old recurring-month guard gone in schema 2',
      out, CASES.map(c => [c[0], [], 1500, 1500, c[4], 1500, 1500]));
    const low = new App(legacyState({}, { payments: [P('p1'), M()] }), '2026-08-20');
    invariant('FA3CC.saved.below-history', 'An entered total below what dated completions and carries already hold (£300 < £350) is refused and nothing changes',
      [attempt(low, a => a.editGoal('gH', { gs: '300' })), low.snap().goal.gH], [[[REFUSED_BELOW], true], 1350]);
  });

  scenario('FA-3C-C RELEASES — a release is subtracted once and stays subtracted', () => {
    const app = carriedFixture('one-off');
    const r = app.release('gH', 300);
    const seen = [app.snap().goal.gH];
    app.reload(); seen.push(app.snap().goal.gH);
    app.advance('2026-09-10', 'reload'); seen.push(app.snap().goal.gH);
    app.run('S.payments[0].amount = 5000; S.payments.push(' + JSON.stringify(legacyPay('pz', { amount: 700, date: '2026-09-01' })) + '); save();');
    app.reload(); seen.push(app.snap().goal.gH);
    app.contribute({ name: 'After', amount: 100, date: '2026-09-10', status: 'paid', goalId: 'gH' }); seen.push(app.snap().goal.gH);
    app.reload(); seen.push(app.snap().goal.gH);
    invariant('FA3CC.release.stays', 'A £300 release from Holiday £1,250 leaves £950 and stays subtracted once: reload, rollover and raised or added payment rows (the unowned one flagged) never restore it; a later £100 contribution adds on top (£1,050)',
      [r.ok, seen, flagged(app)], [true, [950, 950, 950, 950, 1050, 1050], true]);
  });

  scenario('FA-3C-C ROLLOVER, RESTORE, LINKED, PLAN, MONTHLY LEFT', () => {
    const roll = new App(FA3CC_MIX, '2026-08-20');
    const pos = () => [roll.snap().goal, roll.snap().inv.iA];
    const seen = [pos()];
    roll.advance('2026-09-05', 'reload'); seen.push(pos());
    roll.advance('2026-10-05', 'session'); seen.push(pos());
    roll.advance('2026-11-05', 'reload'); seen.push(pos());
    const P = [{ gH: 1450, gB: 540 }, 5200];
    invariant('FA3CC.rollover.positions', 'Over three rollovers (reload, same session, reload) dated and carried history survives every reset: Holiday £1,450, Car £540, ISA £5,200',
      seen, [P, P, P, P]);

    const restoreBoot = (env, clock) => { const r = new App({}, clock).restorable(env); const a = new App(r.state, clock, undefined, { boot: false }); watchWrites(a); a.run('__reload()'); return a; };
    const env1 = legacyLoad(CARRY_MIX, '2026-08-20').backup();
    const r1 = restoreBoot(env1, '2026-08-20');
    const first1 = [writes(r1), stored(r1)._schemaVersion, r1.snap().goal, seededRows(r1).length, carryRows(r1.state().contributionCarry)];
    const r1Ledger = [r1.events(), r1.state().contributionCarry];
    r1.reload();
    invariant('FA3CC.restore.schema-1', 'A schema-1 backup (exported by a fallback load) restores and transitions once: one write, marker 2, Holiday £1,350 and Car £540, one seeded completion and the four carries; the next load writes nothing and changes nothing',
      [env1.schemaVersion, first1, writes(r1), same([r1.events(), r1.state().contributionCarry], r1Ledger)], [1, [1, 2, { gH: 1350, gB: 540 }, 1, CARRY_MIX_CARRIES], 0, true]);
    const src = new App(CARRY_MIX, '2026-08-20'), env2 = src.backup();
    const r2 = restoreBoot(env2, '2026-08-20');
    invariant('FA3CC.restore.schema-2', 'A schema-2 backup restores without migrating: no write, completions and carries identical to the source (ids and times included), Holiday £1,350',
      [env2.schemaVersion, writes(r2), same([r2.events(), r2.state().contributionCarry], [src.events(), src.state().contributionCarry]), r2.snap().goal.gH], [2, 0, true, 1350]);
    const env3 = JSON.parse(JSON.stringify(env2));
    env3.data = legacyData(env3.data); env3.schemaVersion = 1;
    const r3 = restoreBoot(env3, '2026-08-20');
    invariant('FA3CC.restore.old-backup', 'An old backup without a marker, completions or carries normalises and transitions: one write, marker 2, the same seeded completion and carries as a live transition, Holiday £1,350',
      [writes(r3), stored(r3)._schemaVersion, seededRows(r3), carryRows(r3.state().contributionCarry), r3.snap().goal.gH], [1, 2, seededRows(src), CARRY_MIX_CARRIES, 1350]);

    const ln = new App(legacyState({ saved: 1350 }, { investments: [Object.assign(ISA(), { goalId: 'gH', balance: 5200 })],
      payments: [legacyPay('p1'), AMBIGUOUS_MONTHLY('pc'), legacyInvPay('im', { rec: 'yes', date: '2026-06-05' })] }), '2026-08-10');
    const view = () => [ln.snap().goal.gH, ln.state().goals[0].saved, authority(ln).goals.gH.position, ln.snap().inv.iA];
    const linked = [view()];
    ln.reload(); linked.push(view());
    ln.advance('2026-09-05', 'reload'); linked.push(view());
    let reason = '';
    const rel = attempt(ln, a => { reason = a.release('gH', 100).reason; });
    const L = [5200, 1350, 1350, 5200];
    invariant('FA3CC.linked.positions', 'Holiday linked to the ISA displays the ISA (£5,200) while its own schema-2 position (£1,000 + dated £250 + carry £100 = £1,350) stays in the goal cache; goal history never enters the ISA and ISA rows never enter the goal — at boot, after reload and after the September rollover; a release stays refused, nothing changed',
      [linked, rel[1], reason], [[L, L, L], true, 'use_linked_investment_row']);

    const plan = new App(legacyState({ amount: 2000, saved: 1500 }, { payments: [legacyPay('p3', { amount: 300 }), AMBIGUOUS_MONTHLY('pc', { amount: 200 })] }), '2026-08-10', PROGRAM.plan);
    plan.setPlan(FA3B_STEPS);
    const planBefore = plan.state();
    const views = [FA3B_STEPS.map(s => plan.planView(s)), FA3B_STEPS.map(s => plan.homeView(s)), plan.suggestions()];
    const remaining = plan.run('calcGoalIntelligence(S.goals[0]).remaining');
    invariant('FA3CC.plan.position', 'Plan reads the schema-2 position: base £1,000 + carry £200 + dated £300 = £1,500 of a £2,000 target, £500 remaining; viewing Plan detail, the Home action and Suggested Actions creates no row, completion or carry',
      [authority(plan).goals.gH.parts, plan.snap().goal.gH, remaining, views.length, same([plan.state().payments, plan.events(), plan.state().contributionCarry], [planBefore.payments, planBefore.contributionEvents, planBefore.contributionCarry])],
      [{ base: 1000, dated: 300, carry: 200, released: 0 }, 1500, 500, 3, true]);

    const ml = new App(CARRY_MIX, '2026-08-20');
    const leftOf = a => { const s = a.snap(); return [s.left, s.leftConfirmed, s.homeOverduePayments]; };
    const leftBefore = leftOf(ml);
    ml.run('var e = JSON.parse(JSON.stringify(S.contributionEvents[0])); e.id = "ev_big"; e.paymentId = "ghost"; e.occurrenceYm = "2026-08"; e.dueDateSnapshot = ""; e.amount = 50000;' +
      ' S.contributionEvents.push(e); S.contributionCarry.push(' + JSON.stringify(CARRY('carry_big', 'ghost2', { amount: 70000 })) + '); save();');
    ml.reload();
    invariant('FA3CC.monthly-left.isolation', 'Monthly Left reads payments only: a fake £50,000 completion and a £70,000 carry move Holiday\'s position (£121,350) but not Monthly Left, its confirmed-only figure or Home overdue payments',
      [leftOf(ml), ml.snap().goal.gH], [leftBefore, 121350]);
  });
}

// FA-3 release safety: a runtime never writes financial data newer than it understands or changed under it by another window,
// and the schema 1 → 2 transition waits until no older cached copy of the app is left in this browser.

const STALE_WARN = '[geode] financial writes stopped until reload: ';
/** Consumes the app's console warnings: 'stale:<reason>' per stale mark, 'transition:<why>' per failed transition, '? ' anything else. */
const relWarnings = app => app.warnings.splice(0).map(w => (w.indexOf(STALE_WARN) === 0 ? 'stale:' + w.slice(STALE_WARN.length)
  : w.indexOf(FA3CC_FAILED) === 0 ? 'transition:' + w.slice(FA3CC_FAILED.length) : '? ' + w));
/** [why this page stopped writing, which reload gate it shows]; ['', ''] while it may write. */
const staleState = app => JSON.parse(app.run('JSON.stringify([_geodeRuntimeStale, __staleGate])'));
const rawStore = app => app.run('__store');
/** raw with its schema marker set to v (undefined: removed). */
const withSchema = (raw, v) => { const p = JSON.parse(raw); if (v === undefined) delete p._schemaVersion; else p._schemaVersion = v; return JSON.stringify(p); };
/** Another window stores raw at KEY (null: removes it). No storage event reaches this page unless fireStorage sends one. */
const foreignStore = (app, raw) => { app.ctx.__raw = raw; app.run('__store = __raw;'); };
/** A financial action: a completed £50 Holiday top-up added from the payment form (save). */
const relAct = app => app.contribute({ name: 'Top-up', amount: 50, date: '2026-06-05', status: 'paid', goalId: 'gH' });
/** Runs the production storage listener (geodeInstallFinancialStorageListener) in this page. */
const relListen = app => {
  app.run('var __listeners = []; window.addEventListener = function (type, fn) { __listeners.push([type, fn]); };');
  app.run(PROGRAM.structural.geodeInstallFinancialStorageListener + '\ngeodeInstallFinancialStorageListener();');
};
/** A storage event as the browser delivers it to other windows; area: 'local' (default), 'session' or 'none' (no storageArea). */
const fireStorage = (app, key, newValue, area) => {
  app.ctx.__evJson = JSON.stringify({ key, newValue });
  app.run('var __e = JSON.parse(__evJson);' + (area === 'none' ? '' : ' __e.storageArea = ' + (area === 'session' ? 'sessionStorage' : 'localStorage') + ';') +
    ' __listeners.forEach(function (l) { if (l[0] === "storage") l[1](__e); });');
};
/** A page booted on schema 2 data (baseState transitions on its first load; no Cache API here, so nothing holds it back). */
const schema2App = () => new App(baseState(), '2026-06-05');
/**
 * A page loading the G1 fixture (paid one-off £250, schema 1). shell: the geode_shell value stored (true: this runtime's);
 * cacheApi false: a browser without the Cache API.
 */
const shellApp = (shell, cacheApi) => {
  const f = fa3cbFixture('one-off');
  const app = new App(f[2], f[3], undefined, { boot: false });
  if (cacheApi !== false) app.run('var caches = {};');
  if (shell !== undefined) app.run('__otherStorage.setItem(GEODE_SHELL_KEY, ' + (shell === true ? 'BEYND_RUNTIME_VERSION' : JSON.stringify(shell)) + ');');
  watchWrites(app);
  app.run('__reload()');
  return app;
};
/** Schema of the stored data as production reads it (a missing marker is schema 1). */
const storedSchema = app => app.run('geodeStoredSchemaVersion(__store)');

function releaseSafetyFidelity() {
  scenario('FA-3 RELEASE — harness and production guards are the same code', () => {
    const src = PROGRAM.src, load = PROGRAM.structural.load;
    const reloadShim = TEST_SHIMS.slice(TEST_SHIMS.indexOf('function __reload()'), TEST_SHIMS.indexOf('\n}\n', TEST_SHIMS.indexOf('function __reload()')));
    const gateOrder = text => { const at = ['geodeNoteFinancialBoot(', 'if (!_geodeRuntimeStale) {', 'if (geodeSchema2Active(S)) geodeSchema2IntegrityReport(S);', RELEASE_GATE, 'syncRecurringPayments();'].map(c => text.indexOf(c)); return at.every((p, i) => p >= 0 && (!i || p > at[i - 1])); };
    invariant('REL.fidelity.reload', 'load() and the __reload shim both note the stored schema first, then run the integrity report or the gated transition only while the page may write, before recurring sync',
      [gateOrder(load), gateOrder(reloadShim), reloadShim.indexOf('geodeNoteFinancialBoot(__store);') >= 0, load.indexOf('geodeNoteFinancialBoot(d);') >= 0], [true, true, true, true]);
    const guarded = (name, guard) => {
      const t = extractFunction(src, name).text, g = t.indexOf(guard), w = t.indexOf('localStorage.setItem(KEY'), seen = t.indexOf('_geodeFinancialKeySeen = true;');
      return g >= 0 && w >= 0 && seen >= 0 && g < w && w < seen && t.slice(t.indexOf('{') + 1, g).replace(/try\s*\{/, '').trim() === '';
    };
    invariant('REL.fidelity.writers', 'Each of the three KEY writers asks geodeFinancialWriteAllowed first (the transition commit as the schema-1 data it replaces) and records that it wrote; production has no other KEY writer; the save shim keeps the guard',
      [guarded('save', 'if (!geodeFinancialWriteAllowed()) return;'), guarded('persistGeodeToLocalStorage', 'if (!geodeFinancialWriteAllowed()) return;'),
        guarded('geodeSchema2CommitTransition', 'if (!geodeFinancialWriteAllowed(1)) return false;'), src.split('localStorage.setItem(KEY').length - 1,
        src.indexOf("setItem('geode_v6'") < 0, TEST_SHIMS.indexOf('function save() { if (!geodeFinancialWriteAllowed()) return;') >= 0],
      [true, true, true, 3, true, true]);
    invariant('REL.fidelity.boot', 'Boot loads, then listens for other windows\' changes, then cleans older app caches',
      src.indexOf('\nload();\ngeodeInstallFinancialStorageListener();\ngeodeShellCleanup();\n') >= 0, true);
  });
}

function releaseSafetyBoot() {
  scenario('FA-3 RELEASE BOOT — data newer than this runtime is shown behind the reload gate and never rewritten', () => {
    const app = new App(baseState(), '2026-06-05');
    const versions = JSON.parse(app.run(`JSON.stringify([null, '{bad', 'null', '[]', '"x"', '{}', '{"_schemaVersion":"3"}', '{"_schemaVersion":2.5}', '{"_schemaVersion":1}',
      '{"_schemaVersion":2}', '{"_schemaVersion":3}', '{"_schemaVersion":7}'].map(function (raw) {
      var v = geodeStoredSchemaVersion(raw); _geodeRuntimeStale = ''; geodeNoteFinancialBoot(raw);
      return [v !== v ? 'unreadable' : v, _geodeRuntimeStale, _geodeFinancialKeySeen];
    }))`));
    app.run("_geodeRuntimeStale = ''; _geodeFinancialKeySeen = true;");
    invariant('REL.boot.versions', 'Stored KEY: nothing → none; unreadable, JSON null, an array or text → unreadable; a missing, text, fractional or 1 marker → schema 1; 2 and 3 as stored. Only a schema above 2 stops writes at boot; unreadable data is left to load() as before',
      [versions, relWarnings(app)],
      [[[null, '', false], ['unreadable', '', true], ['unreadable', '', true], ['unreadable', '', true], ['unreadable', '', true], [1, '', true], [1, '', true], [1, '', true],
        [1, '', true], [2, '', true], [3, 'newer', true], [7, 'newer', true]], ['stale:newer', 'stale:newer']]);

    const boot = v => {
      const a = new App(Object.assign(baseState(v > 2 ? { payments: [legacyPay('p1')] } : {}), { _schemaVersion: v }), '2026-06-05', undefined, { boot: false });
      watchWrites(a);
      const raw = rawStore(a);
      a.run('__reload()');
      const booted = [a.run('S._schemaVersion'), a.events().length, staleState(a)];
      relAct(a); a.run('persistGeodeToLocalStorage();'); a.run('geodeSchema2CommitTransition();');
      return [booted, writes(a), rawStore(a) === raw, relWarnings(a)];
    };
    invariant('REL.boot.newer', 'Stored schema 3 or 7: kept as stored in memory (never lowered to 2), no transition or seeding, the "newer version" gate; a form save, a direct persist and a transition commit then write nothing — the stored text is byte-identical',
      [boot(3), boot(7)], [[[3, 0, ['newer', 'newer']], 0, true, ['stale:newer']], [[7, 0, ['newer', 'newer']], 0, true, ['stale:newer']]]);
    invariant('REL.boot.current', 'Stored schema 2: no gate; the same save and persist write normally (the commit, replacing schema 1 only, refuses and stops writes)',
      boot(2), [[2, 0, ['', '']], 1, false, ['stale:changed']]);

    const again = new App(Object.assign(baseState(), { _schemaVersion: 3 }), '2026-06-05');
    const raw = rawStore(again);
    again.reload(); again.reload();
    invariant('REL.boot.no-loop', 'Reloading on schema 3 data shows the same gate each time and still writes nothing: the gate never reloads by itself',
      [staleState(again), rawStore(again) === raw, relWarnings(again)], [['newer', 'newer'], true, ['stale:newer', 'stale:newer', 'stale:newer']]);
  });
}

function releaseSafetyWrites() {
  scenario('FA-3 RELEASE WRITES — every writer re-reads storage and refuses data another window made incompatible', () => {
    const atWrite = (label, edit, writer) => {
      const app = schema2App();
      const mine = rawStore(app), theirs = edit(mine);
      foreignStore(app, theirs);
      if (writer === 'persist') app.run('persistGeodeToLocalStorage();'); else relAct(app);
      const after = rawStore(app);
      return [label, staleState(app), after === theirs ? 'kept theirs' : after && JSON.parse(after).payments.length === 1 ? 'wrote mine' : '?', relWarnings(app)];
    };
    const blocked = (label, why) => [label, [why, why], 'kept theirs', ['stale:' + why]];
    invariant('REL.write.save', 'A schema 2 page whose stored data another window changed without telling it (no storage event, e.g. restored from the back/forward cache): a form save refuses schema 3 (newer), schema 1, a missing marker, a text "3" marker and removed data (changed), leaving their data byte-identical',
      [atWrite('schema 3', r => withSchema(r, 3)), atWrite('schema 1', r => withSchema(r, 1)), atWrite('no marker', r => withSchema(r)),
        atWrite('text "3"', r => withSchema(r, '3')), atWrite('removed', () => null)],
      [blocked('schema 3', 'newer'), blocked('schema 1', 'changed'), blocked('no marker', 'changed'), blocked('text "3"', 'changed'), blocked('removed', 'changed')]);
    invariant('REL.write.persist', 'persistGeodeToLocalStorage refuses the same way: schema 3 (newer) and removed data (changed)',
      [atWrite('schema 3', r => withSchema(r, 3), 'persist'), atWrite('removed', () => null, 'persist')], [blocked('schema 3', 'newer'), blocked('removed', 'changed')]);
    invariant('REL.write.unreadable', 'Unreadable stored data keeps the behaviour from before the guard: the save writes this page\'s schema 2 state over it',
      atWrite('unreadable', () => '{bad'), ['unreadable', ['', ''], 'wrote mine', []]);
    const lww = atWrite('same schema', r => JSON.stringify(Object.assign(JSON.parse(r), { income: 4000 })));
    current('REL.write.same-schema', 'Another window\'s schema 2 edit is not detected: this page\'s save replaces it (last writer wins; no merge)',
      lww, ['same schema', ['', ''], 'wrote mine', []]);

    const sticky = schema2App();
    const mine = rawStore(sticky);
    foreignStore(sticky, withSchema(mine, 3)); relAct(sticky);
    foreignStore(sticky, mine); relAct(sticky); sticky.run('persistGeodeToLocalStorage();');
    const held = [staleState(sticky), rawStore(sticky) === mine];
    sticky.run('__reload()'); relAct(sticky);
    invariant('REL.write.sticky', 'Once stopped, the page stays stopped even if storage turns compatible again (no write, same gate); only a reload clears it, after which saves write again',
      [held, staleState(sticky), JSON.parse(rawStore(sticky)).payments.length, relWarnings(sticky)], [[['newer', 'newer'], true], ['', ''], 1, ['stale:newer']]);

    const blind = schema2App();
    foreignStore(blind, withSchema(rawStore(blind), 3)); relAct(blind);
    const held3 = rawStore(blind);
    blind.run("var __getItem = localStorage.getItem; localStorage.getItem = function (k) { if (k === KEY) throw new Error('SecurityError'); return __getItem.call(localStorage, k); };");
    relAct(blind); blind.run('persistGeodeToLocalStorage();');
    invariant('REL.write.stale-unreadable', 'A stopped page stays stopped when storage can no longer be read: the save and persist after that write nothing',
      [rawStore(blind) === held3, staleState(blind), relWarnings(blind)], [true, ['newer', 'newer'], ['stale:newer']]);

    const f = fa3cbFixture('one-off');
    const commit = theirs => {
      const t = new App(f[2], f[3], undefined, { boot: false });
      watchWrites(t);
      t.run(FA3CC_TO_TRANSITION);
      const raw = theirs(rawStore(t));
      foreignStore(t, raw);
      const ok = t.run('geodeSchema2Transition()');
      return [ok, writes(t), rawStore(t) === raw, t.run('S._schemaVersion'), t.events().length, staleState(t), relWarnings(t), toasts(t)];
    };
    invariant('REL.write.transition', 'A load that read schema 1 commits nothing when storage became schema 3 (newer) or schema 2 (another window already transitioned): stored data byte-identical, memory back on schema 1, gate shown (the transition\'s storage toast sits behind it); unchanged schema 1 still commits',
      [commit(r => withSchema(r, 3)), commit(r => withSchema(r, 2)), commit(r => r).slice(0, 6)],
      [[false, 0, true, 1, 0, ['newer', 'newer'], ['stale:newer', 'transition:storage'], [SAVE_FAILED]],
        [false, 0, true, 1, 0, ['changed', 'changed'], ['stale:changed', 'transition:storage'], [SAVE_FAILED]],
        [true, 1, false, 2, 1, ['', '']]]);
  });
}

function releaseSafetyListener() {
  scenario('FA-3 RELEASE LISTENER — another window\'s change to the financial key stops this page at once', () => {
    const SCHEMA2 = rawStore(schema2App());
    const event = (label, key, value, area) => {
      const app = schema2App();
      relListen(app);
      if ((key === 'geode_v6' || key === null) && area !== 'session') foreignStore(app, value);
      fireStorage(app, key, value, area);
      const gate = staleState(app);
      const before = rawStore(app);
      relAct(app);
      return [label, gate, rawStore(app) === before ? 'no write' : 'wrote', relWarnings(app)];
    };
    const stops = (label, why) => [label, [why, why], 'no write', ['stale:' + why]];
    invariant('REL.listen.stops', 'Storage events on geode_v6 stop writes before any action: schema 3 (newer); schema 1, no marker, text "2", unreadable, removed key, storage cleared (changed)',
      [event('schema 3', 'geode_v6', withSchema(SCHEMA2, 3)), event('schema 1', 'geode_v6', withSchema(SCHEMA2, 1)), event('no marker', 'geode_v6', withSchema(SCHEMA2)),
        event('text "2"', 'geode_v6', withSchema(SCHEMA2, '2')), event('unreadable', 'geode_v6', '{bad'), event('removed', 'geode_v6', null), event('cleared', null, null)],
      [stops('schema 3', 'newer'), stops('schema 1', 'changed'), stops('no marker', 'changed'), stops('text "2"', 'changed'), stops('unreadable', 'changed'),
        stops('removed', 'changed'), stops('cleared', 'changed')]);
    invariant('REL.listen.ignores', 'Other keys, sessionStorage events and a same-schema change leave the page writing; an event without storageArea on geode_v6 still counts',
      [event('other key', 'geode_shell', 'v1.0.76'), event('sessionStorage', 'geode_v6', withSchema(SCHEMA2, 3), 'session'), event('same schema', 'geode_v6', SCHEMA2),
        event('no area', 'geode_v6', withSchema(SCHEMA2, 3), 'none')],
      [['other key', ['', ''], 'wrote', []], ['sessionStorage', ['', ''], 'wrote', []], ['same schema', ['', ''], 'wrote', []], stops('no area', 'newer')]);
    const tabA = schema2App();
    relListen(tabA);
    watchWrites(tabA);
    const tabB = withSchema(rawStore(tabA), 3);
    foreignStore(tabA, tabB); fireStorage(tabA, 'geode_v6', tabB);
    relAct(tabA);
    const writers = [tabA.run('persistGeodeToLocalStorage(); geodeSchema2CommitTransition()'), tabA.run('geodeFinancialWriteAllowed()'), tabA.run('geodeFinancialWriteAllowed(1)')];
    invariant('REL.listen.all-writers', 'Tab A (schema 2) hears tab B store schema 3: a form save, persistGeodeToLocalStorage and the transition commit all refuse (commit false, no store write), tab B\'s data stays byte-identical, one "newer version" gate',
      [writers, writes(tabA), rawStore(tabA) === tabB, staleState(tabA), relWarnings(tabA)], [[false, false, false], 0, true, ['newer', 'newer'], ['stale:newer']]);
    const first = schema2App();
    relListen(first);
    fireStorage(first, 'geode_v6', null); fireStorage(first, 'geode_v6', withSchema(SCHEMA2, 3));
    invariant('REL.listen.first-reason', 'The first reason is kept: removed, then schema 3 → still "changed", one warning, one gate', [staleState(first), relWarnings(first)], [['changed', 'changed'], ['stale:changed']]);
  });
}

function releaseSafetyGate() {
  scenario('FA-3 RELEASE GATE — schema 2 waits until older app caches are gone from this browser', () => {
    const legacyHoliday = legacyLoad(fa3cbFixture('one-off')[2], fa3cbFixture('one-off')[3]).snap().goal.gH;
    const look = app => [app.run('geodeShellReadiness()'), writes(app), storedSchema(app), app.events().length, app.snap().goal.gH, staleState(app), relWarnings(app)];
    const held = ['pending', 0, 1, 0, legacyHoliday, ['', ''], []], moved = r => [r, 1, 2, 1, 1250, ['', ''], []];
    invariant('REL.gate.readiness', 'With a Cache API: no geode_shell or the previous runtime\'s → pending: no transition, schema 1 stays stored, legacy display; this runtime\'s → ready: one commit to schema 2. No Cache API → absent: transitions',
      [look(shellApp()), look(shellApp('v1.0.75')), look(shellApp(true)), look(shellApp(undefined, false))], [held, held, moved('ready'), moved('absent')]);

    const app = shellApp();
    relAct(app);
    const pending = [storedSchema(app), stored(app).payments.length, staleState(app)];
    app.run('__otherStorage.setItem(GEODE_SHELL_KEY, BEYND_RUNTIME_VERSION);');
    app.reload();
    const opened = [writes(app), storedSchema(app), app.events().length];
    relAct(app);
    invariant('REL.gate.open', 'While pending the page keeps saving schema 1 (top-up stored); once geode_shell names this runtime the next load transitions once, and later saves write schema 2',
      [pending, opened, storedSchema(app), stored(app).payments.length, staleState(app), relWarnings(app)], [[1, 2, ['', '']], [1, 2, 2], 2, 3, ['', ''], []]);
  });
}

function releaseSafetyTabs() {
  scenario('FA-3 RELEASE TABS — two windows of this runtime around the transition', () => {
    const ready = shellApp(true);
    const theirs = rawStore(ready);
    const heard = shellApp();
    relListen(heard);
    foreignStore(heard, theirs); fireStorage(heard, 'geode_v6', theirs);
    relAct(heard);
    const heardOut = [staleState(heard), rawStore(heard) === theirs];
    heard.reload(); relAct(heard);
    invariant('REL.tabs.event', 'A page still on schema 1 (pending) hears another window commit schema 2: it stops at once with the "updated in another window" gate and its save writes nothing; after reload it runs on schema 2 and saves again',
      [heardOut, heard.run('S._schemaVersion'), storedSchema(heard), staleState(heard), relWarnings(heard)], [[['changed', 'changed'], true], 2, 2, ['', ''], ['stale:changed']]);
    const missed = shellApp();
    foreignStore(missed, theirs); relAct(missed);
    invariant('REL.tabs.missed', 'The same page without the event (suspended or back/forward cache): its next save re-reads storage, refuses and shows the gate',
      [staleState(missed), rawStore(missed) === theirs, relWarnings(missed)], [['changed', 'changed'], true, ['stale:changed']]);
    relAct(ready);
    invariant('REL.tabs.winner', 'The window that transitioned keeps working on schema 2', [staleState(ready), storedSchema(ready), relWarnings(ready)], [['', ''], 2, []]);
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
    const legacy = legacyLoad(f.state, f.clock);
    app.reload();
    const shown = shownNow(), events = app.events();
    current('MIG.' + f.id + '.display', 'Displayed before migration', legacy.snap()[f.entity.kind === 'goal' ? 'goal' : 'inv'][f.entity.id], f.displayBeforeMigration);
    app.reload(); app.reload();
    invariant('MIG.' + f.id + '.identity', 'Displayed immediately after migration and after two reloads equals ' + show(f.displayBeforeMigration) +
      '; idempotent; only completions the stored rows prove are seeded (' + f.history.split('.')[0] + ')',
      [shown, shownNow(), same(app.events(), events), seededRows(app)], [f.displayBeforeMigration, f.displayBeforeMigration, true, MIG_SEEDED[f.id] || []]);
    if (f.entity.kind !== 'goal') {
      const vals = () => app.state().investments.filter(i => i.id === f.entity.id)[0].valuations.map(v => [v.id, v.value, v.source]);
      const first = vals(); app.reload();
      invariant('MIG.' + f.id + '.anchor', 'FA-7B: the identity holds through one legacy_transition anchor at the legacy figure (it holds the base and the migrated completion, which is not counted again), not through the row rebuild; reloads add no second anchor',
        [first, vals(), shownNow()], [[['val_legacy_' + f.entity.id, f.displayBeforeMigration, 'legacy_transition']], [['val_legacy_' + f.entity.id, f.displayBeforeMigration, 'legacy_transition']], f.displayBeforeMigration]);
    }
  }));
}

// ───────────────────────────── FA-7B investment position authority ─────────────────────────────

const fa7bInv = (app, id) => app.state().investments.filter(i => i.id === id)[0];
const fa7bPos = (app, id) => JSON.parse(app.run('JSON.stringify(geodeInvestmentPosition(S, S.investments.filter(function (i) { return i.id === ' + JSON.stringify(id) + '; })[0]))'));
/** [shown, position value, raw, anchor value, anchor source, flows since, releases since, estimated] — null fields: no valid valuation. */
const fa7bLook = (app, id) => {
  id = id || 'iA';
  const p = fa7bPos(app, id);
  return [app.snap().inv[id], p && p.value, p && p.rawValue, p && p.anchor.value, p && p.anchor.source, p && p.flowsSince, p && p.releasesSince, p && p.estimated];
};
/** Stored valuations as [value, date, source]. */
const fa7bVals = (app, id) => ((fa7bInv(app, id || 'iA') || {}).valuations || []).map(v => v && typeof v === 'object' ? [v.value, v.date, v.source] : v);
const fa7bRelease = (app, amount, id) => JSON.parse(app.run('JSON.stringify(geodeApplySavingsRelease(' + JSON.stringify({ sourceType: 'investment', sourceId: id || 'iA', amount, reason: 'emergency' }) + '))'));
const fa7bRecompute = app => app.run('geodeRecomputeBalancesFromPayments();');
/** A new investment "Fund" created through the form on 5 June; returns the app and its id. */
const fa7bFund = balance => {
  const app = new App(baseState({ investments: [] }), '2026-06-05');
  app.createInvestment('Fund', balance);
  return [app, app.state().investments.filter(i => i.name === 'Fund')[0].id];
};
const INV_EVENT_RELEASE = { id: 'r_inv', sourceType: 'investment', sourceId: 'iA', amount: 300, reason: 'emergency', date: '2026-07-01', ym: '2026-07', relatedYm: '2026-07',
  remainingBalance: 5100, createdAt: 1782900000000, confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' };
const INV_LEGACY_RELEASE = { id: 'r_inv_legacy', sourceType: 'investment', sourceId: 'iA', amount: 100, reason: 'manual', date: '2026-05-20', ym: '2026-05', createdAt: 1779271200000, confirmedByUser: true };
/** The legacy figure computed here, independently of production: base + paid ISA rows − event-derived releases. */
const fa7bLegacyFigure = state => {
  const inv = state.investments[0];
  let v = Number(inv.baseBalance);
  state.payments.forEach(p => { if (p.status === 'paid' && p.investId === inv.id) v += Number(p.amount); });
  (state.savingsReleases || []).forEach(r => { if (r.sourceId === inv.id && r.balanceMutationMode === 'event_derived') v -= Number(r.amount); });
  return v;
};

/** [key, description, stored legacy state, clock, L_pre, what the schema-1 legacy load shows after its lifecycle (default L_pre)] */
const FA7B_TRANSITION = [
  ['I0', 'no contribution: ISA £5,000', legacyInvState({}), '2026-08-10', 5000],
  ['I1', 'paid monthly £200 completed this month (lastPaidYM 2026-08)', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('im', { rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-05' })] }), '2026-08-20', 5200],
  ['I1-prior', 'paid monthly £200 completed in June, Beynd next opened on 2 July', legacyInvState({ balance: 5200 },
    { payments: [legacyInvPay('im', { rec: 'yes', lastPaidYM: '2026-06', date: '2026-07-05' })] }), '2026-07-02', 5200, 5000],
  ['I2', 'paid one-off £500', legacyInvState({ balance: 5500 }, { payments: [legacyInvPay('i1', { amount: 500, date: '2026-06-05' })] }), '2026-08-10', 5500],
  ['I3', 'multiple paid: one-off £500 (June), one-off £300 (July), monthly £200 (this month)', legacyInvState({ balance: 6000 }, { payments: [
    legacyInvPay('i1', { amount: 500, date: '2026-06-05' }), legacyInvPay('i2', { amount: 300, date: '2026-07-20' }),
    legacyInvPay('im', { rec: 'yes', lastPaidYM: '2026-08', date: '2026-09-05' })] }), '2026-08-20', 6000],
  ['I4', 'releases: base £4,900 (a legacy base-delta release £100 already inside it) + paid one-off £500 − event-derived release £300',
    legacyInvState({ balance: 5100, baseBalance: 4900 }, { payments: [legacyInvPay('i1', { amount: 500, date: '2026-06-05' })], savingsReleases: [INV_EVENT_RELEASE, INV_LEGACY_RELEASE] }),
    '2026-08-10', 5100],
  ['I5', 'ambiguous paid monthly £200 (no lastPaidYM)', legacyInvState({ balance: 5200 }, { payments: [legacyInvPay('im', { rec: 'yes', date: '2026-06-05' })] }), '2026-08-10', 5200],
  ['I6', 'D10 residue: value entered as £5,600 under the old model while a paid one-off £200 remained (shown £5,800)',
    legacyInvState({ balance: 5800, baseBalance: 5600 }, { payments: [legacyInvPay('i1', { date: '2026-06-05' })] }), '2026-08-10', 5800],
  ['I7', 'value already lost: monthly £200 reset by an earlier rollover (no row proves June any more)',
    legacyInvState({}, { payments: [legacyInvPay('im', { rec: 'yes', status: 'upcoming', date: '2026-08-05' })] }), '2026-08-03', 5000]
];

function fa7bTransition() {
  FA7B_TRANSITION.forEach(([key, name, state, clock, lpre, legacyShown]) => scenario('FA-7B TRANSITION — ' + key + ' ' + name, () => {
    const legacy = legacyLoad(state, clock).snap().inv.iA;
    const app = new App(state, clock);
    const look = () => [fa7bLook(app), fa7bVals(app)];
    const first = look();
    app.reload(); const r1 = look();
    app.reload(); const r2 = look();
    const opened = [[lpre, lpre, lpre, lpre, 'legacy_transition', 0, 0, false], [[lpre, clock, 'legacy_transition']]];
    invariant('FA7B.transition.' + key, 'Migrated initial position = L_pre ' + show(lpre) + ' (computed independently as base + paid rows − event-derived releases' +
      (legacyShown !== undefined ? '; the schema-1 load would show ' + show(legacyShown) + ' after resetting the row — D1, restored' : '') +
      '): one legacy_transition anchor at L_pre dated the transition day, nothing estimated; reload → same position, one anchor; reload → same',
      [fa7bLegacyFigure(state), legacy, first, r1, r2], [lpre, legacyShown !== undefined ? legacyShown : lpre, opened, opened, opened]);
  }));
}

function fa7bSafety() {
  scenario('FA-7B TRANSITION SAFETY — malformed valuations never become authority', () => {
    const V = o => Object.assign({ id: 'v1', value: 5600, date: '2026-06-20', recordedAt: 1, source: 'manual' }, o);
    const cases = [['not an array', 'x'], ['empty array', []], ['null entry', [null]], ['array entry', [[5600]]], ['string value', [V({ value: '5600' })]],
      ['null value', [V({ value: null })]], ['impossible date', [V({ date: '2026-02-30' })]], ['month 13', [V({ date: '2026-13-01' })]], ['date with time', [V({ date: '2026-06-20T10:00' })]],
      ['string recordedAt', [V({ recordedAt: '1' })]], ['unknown source', [V({ source: 'provider' })]], ['missing source', [V({ source: undefined })]], ['empty id', [V({ id: '' })]]];
    const app = freshApp();
    app.ctx.__argsJson = JSON.stringify(cases.map(c => c[1]));
    const verdicts = JSON.parse(app.run('JSON.stringify(JSON.parse(__argsJson).map(function (v) { var inv = { id: "iA", baseBalance: 5000, valuations: v };' +
      ' return [geodeInvestmentLatestValuation(inv), geodeInvestmentPosition(S, inv), geodeInvestmentDisplayBalance(S, inv)]; }))'));
    const control = JSON.parse(app.run('JSON.stringify(geodeInvestmentPosition(S, { id: "iA", valuations: [' + JSON.stringify(V()) + '] }).value)'));
    invariant('FA7B.safety.malformed', 'No valid anchor, no authority: ' + cases.map(c => c[0]).join(', ') + ' — each leaves the latest valuation and position null and the display on the legacy figure (£5,000); a valid entry anchors (£5,600)',
      [verdicts, control], [cases.map(() => [null, null, 5000]), 5600]);

    const kept = new App(legacyInvState({ balance: 5500, valuations: [V({ source: 'provider' }), V({ id: 'v2', date: '2026-13-01' })] },
      { payments: [legacyInvPay('i1', { amount: 500, date: '2026-06-05' })] }), '2026-08-10');
    const junk = new App(legacyInvState({ balance: 5500, valuations: 'x' }, { payments: [legacyInvPay('i1', { amount: 500, date: '2026-06-05' })] }), '2026-08-10');
    invariant('FA7B.safety.malformed-load', 'A present but invalid valuations property does not stop or replace the transition: invalid entries are kept untouched and one legacy_transition anchor at the legacy £5,500 is added; a non-array value gives way to the anchor',
      [fa7bVals(kept), kept.snap().inv.iA, fa7bVals(junk), junk.snap().inv.iA],
      [[[5600, '2026-06-20', 'provider'], [5600, '2026-13-01', 'manual'], [5500, '2026-08-10', 'legacy_transition']], 5500, [[5500, '2026-08-10', 'legacy_transition']], 5500]);
  });

  scenario('FA-7B TRANSITION SAFETY — idempotent, deterministic, all-or-safe, reload-safe', () => {
    const state = FA7B_TRANSITION.filter(f => f[0] === 'I2')[0][2];
    const app = new App(state, '2026-08-10');
    const anchor = () => fa7bInv(app, 'iA').valuations;
    const once = anchor();
    const again = app.run('JSON.stringify([geodeInvestmentLegacyOpeningValues(S), geodeInvestmentAuthorityTransition(S, geodeInvestmentLegacyOpeningValues(S)), geodeInvestmentAuthorityTransition(S, [9999])])');
    app.reload(); app.reload();
    invariant('FA7B.safety.idempotent', 'Once anchored, an investment offers no opening value, and running the transition again (even with a forged opening value) adds no second anchor; two reloads keep the same single anchor (id val_legacy_iA) and £5,500',
      [JSON.parse(again), same(anchor(), once), once.map(v => v.id), app.snap().inv.iA], [[[], true, true], true, ['val_legacy_iA'], 5500]);

    const later = new App(state, '2026-09-14');
    const latestEvidence = a => Math.max.apply(null, a.events().map(e => e.recordedAt));
    invariant('FA7B.safety.deterministic', 'The same stored data transitioned on another day opens at the same value with the same anchor id; each anchor\'s recordedAt is the latest evidence it holds (the completion that load\'s migration seeded), so it holds exactly that evidence',
      [fa7bInv(later, 'iA').valuations.map(v => [v.id, v.value, v.source, v.recordedAt === latestEvidence(later)]), later.snap().inv.iA, once[0].recordedAt === latestEvidence(app)],
      [once.map(v => [v.id, v.value, v.source, true]), 5500, true]);

    const aborted = new App(state, '2026-08-10', undefined, { boot: false });
    aborted.run('var __realPosition = geodeInvestmentPosition; geodeInvestmentPosition = function (s, inv) { var p = __realPosition(s, inv); if (p) p.rawValue += 1; return p; };');
    aborted.run('__reload()');
    const abortWarnings = aborted.warnings.filter(w => w.indexOf('investment valuation transition not completed') >= 0);
    aborted.warnings.splice(0).filter(w => abortWarnings.indexOf(w) < 0).forEach(w => aborted.warnings.push(w));
    const abortedLook = [abortWarnings.length,
      Object.prototype.hasOwnProperty.call(fa7bInv(aborted, 'iA'), 'valuations'), aborted.snap().inv.iA, aborted.state()._schemaVersion];
    aborted.run('geodeInvestmentPosition = __realPosition;');
    aborted.reload();
    invariant('FA7B.safety.all-or-safe', 'A transition whose position would not equal the legacy figure is undone completely (warning; no valuations property; legacy authority £5,500 on schema 2); the next load anchors it at £5,500',
      [abortedLook, fa7bVals(aborted), aborted.snap().inv.iA], [[1, false, 5500, 2], [[5500, '2026-08-10', 'legacy_transition']], 5500]);

    const d1 = FA7B_TRANSITION.filter(f => f[0] === 'I1-prior')[0][2];
    const opened = new App(d1, '2026-07-02', undefined, { boot: false });
    opened.run('var __commits = [], __setItemRaw = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY) __commits.push(String(v)); return __setItemRaw.call(localStorage, k, v); };');
    opened.run('__reload()');
    const commits = JSON.parse(opened.run('JSON.stringify(__commits)')).map(c => JSON.parse(c));
    const commit = [commits.length, commits[0]._schemaVersion, commits[0].investments[0].valuations === undefined, commits[0].payments[0].status,
      opened.state().payments[0].status, opened.snap().inv.iA, stored(opened).investments[0].valuations.length, stored(opened).payments[0].status];
    const reopened = new App(d1, '2026-07-03', undefined, { boot: false });
    reopened.run('__store = ' + JSON.stringify(JSON.stringify(commits[0])) + '; __reload()');
    opened.reload(); opened.advance('2026-08-02', 'reload');
    invariant('FA7B.safety.write-model', 'D1 fixture: the transitioning load commits schema 2 once through storage before the lifecycle runs (rows as stored — June paid — and no anchor), then memory holds the anchor and the reset row (£5,200) and the whole-state save stores them together. Browser closed right after the commit: reopening from it the next day opens at the same £5,200 with one anchor. Later reloads and the August rollover add no second anchor',
      [commit, reopened.snap().inv.iA, fa7bVals(reopened).length, fa7bVals(opened).length, opened.snap().inv.iA],
      [[1, 2, true, 'paid', 'upcoming', 5200, 1, 'upcoming'], 5200, 1, 1, 5200]);
  });
}

function fa7bJourneys() {
  scenario('FA-7B J1 — create £5,000, no contributions, next month', () => {
    const [app, id] = fa7bFund(5000);
    const first = fa7bLook(app, id);
    app.advance('2026-07-02', 'session'); const session = fa7bLook(app, id);
    app.reload(); const reload = fa7bLook(app, id);
    const at = [5000, 5000, 5000, 5000, 'manual_create', 0, 0, false];
    invariant('FA7B.J1', 'A new investment opens on a manual_create valuation of £5,000 (also mirrored to baseBalance and balance); July rollover and reload: £5,000, nothing estimated',
      [first, fa7bVals(app, id), [fa7bInv(app, id).baseBalance, fa7bInv(app, id).balance], session, reload], [at, [[5000, '2026-06-05', 'manual_create']], [5000, 5000], at, at]);
  });

  MODES.forEach(mode => scenario('FA-7B J2/J3/J4/J8 — create £5,000, contribute £200, observe £5,600, contribute £200, undo [' + mode + ']', () => {
    const [app, id] = fa7bFund(5000);
    completeOn10June(app, { name: 'Fund monthly', amount: 200, rec: 'yes', investId: id });
    const june = fa7bLook(app, id);
    app.advance('2026-07-02', mode); const july = fa7bLook(app, id);
    app.reload(); const julyReload = fa7bLook(app, id);
    app.advance('2026-08-02', mode); const august = fa7bLook(app, id);
    const est = [5200, 5200, 5200, 5000, 'manual_create', 200, 0, true];
    invariant('FA7B.J2', 'J2: £5,000 + the June £200 completion = estimated £5,200, through the July rollover, a reload and the August rollover (the reset row is not the cash flow; the completion is)',
      [june, july, julyReload, august], [est, est, est, est]);

    const [app3, id3] = fa7bFund(5000);
    const pm3 = completeOn10June(app3, { name: 'Fund monthly', amount: 200, rec: 'yes', investId: id3 });
    app3.at('2026-06-20');
    app3.saveInvestment(id3, 'Fund', 5600);
    const observed = fa7bLook(app3, id3);
    const activity = investActivity(app3);
    app3.advance('2026-07-02', mode); const j3July = fa7bLook(app3, id3);
    const obs = [5600, 5600, 5600, 5600, 'manual', 0, 0, false];
    invariant('FA7B.J3', 'J3: the £5,600 entered on 20 June shows £5,600 — it holds June\'s £200; one manual valuation; activity logs the change against the position just before it (+£400, after the existing +£5,000 creation entry); July rollover £5,600',
      [observed, fa7bVals(app3, id3), activity, [fa7bInv(app3, id3).baseBalance, fa7bInv(app3, id3).balance], j3July],
      [obs, [[5000, '2026-06-05', 'manual_create'], [5600, '2026-06-20', 'manual']], [{ type: 'invest', delta: 5000 }, { type: 'invest', delta: 400 }], [5600, 5600], obs]);

    app3.at('2026-07-10'); app3.toggle(pm3);
    const j4 = fa7bLook(app3, id3);
    app3.reload(); const j4Reload = fa7bLook(app3, id3);
    const plus = [5800, 5800, 5800, 5600, 'manual', 200, 0, true];
    invariant('FA7B.J4', 'J4: £200 completed on 10 July after the observation: estimated £5,800 = £5,600 + £200, also after reload', [j4, j4Reload], [plus, plus]);

    app3.at('2026-07-12'); app3.toggle(pm3);
    const j8 = fa7bLook(app3, id3);
    app3.reload(); const j8Reload = fa7bLook(app3, id3);
    invariant('FA7B.J8', 'J8: undoing the July contribution after the observation reverses it: £5,800 → £5,600 (the observation again, nothing estimated), also after reload', [j8, j8Reload], [obs, obs]);
  }));

  scenario('FA-7B J5 — enter £5,600, market falls, later enter £5,450', () => {
    const [app, id] = fa7bFund(5600);
    app.at('2026-07-15');
    app.saveInvestment(id, 'Fund', 5450);
    const look = fa7bLook(app, id);
    app.reload();
    const at = [5450, 5450, 5450, 5450, 'manual', 0, 0, false];
    invariant('FA7B.J5', 'J5: the later observation £5,450 shows £5,450 — no contribution or withdrawal is invented for the fall; activity −£150 against the position before it (after the +£5,600 creation entry); reload £5,450',
      [look, fa7bVals(app, id), investActivity(app), fa7bLook(app, id), app.events().length, app.state().savingsReleases.length],
      [at, [[5600, '2026-06-05', 'manual_create'], [5450, '2026-07-15', 'manual']], [{ type: 'invest', delta: 5600 }, { type: 'invest', delta: -150 }], at, 0, 0]);
  });

  MODES.forEach(mode => scenario('FA-7B J6 — FA-4 canonical: anchor £5,000, June £100, template £150, July rollover, July £150 [' + mode + ']', () => {
    const app = freshApp();
    const id = completeOn10June(app, { name: 'ISA monthly', amount: 100, rec: 'yes', investId: 'iA' });
    const seq = [app.snap().inv.iA];
    app.editPayment(id, { amount: 150 }); seq.push(app.snap().inv.iA);
    app.advance('2026-07-02', mode); seq.push(app.snap().inv.iA);
    app.at('2026-07-10'); app.toggle(id); seq.push(app.snap().inv.iA);
    app.reload(); seq.push(app.snap().inv.iA);
    invariant('FA7B.J6', 'J6: opening anchor £5,000 → June £100 completed £5,100 → template edited to £150: £5,100 (the June completion keeps £100) → July rollover £5,100 → July £150 completed £5,250 → reload £5,250',
      [seq, fa7bVals(app)], [[5100, 5100, 5100, 5250, 5250], [[5000, '2026-06-05', 'legacy_transition']]]);
  }));

  scenario('FA-7B J9 — a contribution before a newer observation is undone or edited', () => {
    const [app, id] = fa7bFund(5000);
    const pm = completeOn10June(app, { name: 'Fund monthly', amount: 200, rec: 'yes', investId: id });
    app.at('2026-06-12');
    const po = app.contribute({ name: 'Fund top-up', amount: 300, date: '2026-06-12', status: 'paid', rec: 'no', investId: id });
    const before = app.snap().inv[id];
    app.at('2026-06-20'); app.saveInvestment(id, 'Fund', 5600);
    const obs = [5600, 5600, 5600, 5600, 'manual', 0, 0, false];
    app.at('2026-06-25'); app.toggle(pm); const undone = fa7bLook(app, id);
    app.editPayment(po, { amount: 400 }); const edited = fa7bLook(app, id);
    app.reload(); const reload = fa7bLook(app, id);
    app.del(po); const deleted = fa7bLook(app, id);
    invariant('FA7B.J9', 'J9: £5,500 (£5,000 + £200 + £300), observed £5,600 on 20 June; then undoing June\'s £200, editing the 12 June £300 to £400 (its replacement keeps 12 June), reloading and deleting it all leave the observation £5,600',
      [before, undone, edited, reload, deleted, app.events().filter(e => e.eventType === 'reversal').length], [5500, obs, obs, obs, obs, 3]);
  });
}

function fa7bEvidence() {
  scenario('FA-7B EFFECTIVE DATE — early, late, same day, Smart Import', () => {
    const early = freshApp(a => a.contribute({ name: 'ISA July', amount: 200, date: '2026-07-01', status: 'upcoming', rec: 'yes', investId: 'iA' }));
    early.at('2026-06-28'); early.toggle(early.state().payments[0].id);
    const eff = early.run('geodeContributionEffectiveDate(geodeContributionActiveCompletions(S)[0])');
    const beforeObs = early.snap().inv.iA;
    early.at('2026-06-30'); early.saveInvestment('iA', 'ISA', 5250);
    const atObs = early.snap().inv.iA;
    early.advance('2026-07-02', 'reload');
    invariant('FA7B.effective.early', 'Scheduled 1 July, marked paid 28 June: effective 28 June (the day marked), so the £5,250 observed on 30 June holds it — £5,250, not £5,450, also after the July rollover and reload',
      [eff, beforeObs, atObs, early.snap().inv.iA], ['2026-06-28', 5200, 5250, 5250]);

    const late = freshApp(a => {
      a.contribute({ name: 'ISA 10th', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'no', investId: 'iA' });
      a.contribute({ name: 'ISA 22nd', amount: 100, date: '2026-06-22', status: 'upcoming', rec: 'no', investId: 'iA' });
    });
    late.at('2026-06-20'); late.saveInvestment('iA', 'ISA', 5100);
    late.at('2026-06-25');
    late.state().payments.forEach(p => late.toggle(p.id));
    const dates = JSON.parse(late.run('JSON.stringify(geodeContributionActiveCompletions(S).map(geodeContributionEffectiveDate))'));
    invariant('FA7B.effective.late', 'Marked paid on 25 June after a 20 June observation: due 10 June → effective 10 June, held by the observation; due 22 June → effective 22 June, after it: £5,100 + £100 = £5,200',
      [dates, late.snap().inv.iA], [['2026-06-10', '2026-06-22'], 5200]);

    const day = freshApp();
    clockAt(day, '2026-06-20', 9, 0);
    day.contribute({ name: 'Morning', amount: 100, date: '2026-06-20', status: 'paid', rec: 'no', investId: 'iA' });
    clockAt(day, '2026-06-20', 12, 0); day.saveInvestment('iA', 'ISA', 5150);
    const noon = fa7bLook(day);
    clockAt(day, '2026-06-20', 15, 0);
    day.contribute({ name: 'Afternoon', amount: 50, date: '2026-06-20', status: 'paid', rec: 'no', investId: 'iA' });
    const afternoon = fa7bLook(day);
    day.saveInvestment('iA', 'ISA', 5300);
    const sameMs = fa7bLook(day);
    invariant('FA7B.effective.same-day', 'Same day, ordered by recordedAt: £100 at 09:00 is held by the 12:00 observation £5,150; £50 at 15:00 follows it (£5,200 estimated); an observation saved in the same millisecond as that £50 still holds it (£5,300)',
      [noon, afternoon, sameMs], [[5150, 5150, 5150, 5150, 'manual', 0, 0, false], [5200, 5200, 5200, 5150, 'manual', 50, 0, true], [5300, 5300, 5300, 5300, 'manual', 0, 0, false]]);

    const si = freshApp();
    si.at('2026-06-20'); si.saveInvestment('iA', 'ISA', 5600);
    si.at('2026-06-25');
    si.smartImport([{ name: 'ISA early June', amount: 200, date: '2026-06-05', link: 'invest:iA' }, { name: 'ISA 22 June', amount: 150, date: '2026-06-22', link: 'invest:iA' }]);
    const imported = si.activeEvents().map(e => [e.amount, e.source, e.dueDateSnapshot]);
    const noRecompute = si.snap().inv.iA;
    fa7bRecompute(si);
    const recomputed = si.snap().inv.iA;
    si.reload();
    invariant('FA7B.effective.smart-import', 'Back-dated import: on 25 June Smart Import records a 5 June £200 and a 22 June £150 transaction. A recompute (Smart Import itself does not recompute: FA-7C) gives £5,750 — the 5 June £200 is held by the 20 June observation, the 22 June £150 follows it; reload agrees',
      [imported, noRecompute, recomputed, si.snap().inv.iA], [[[200, 'smart_import', '2026-06-05'], [150, 'smart_import', '2026-06-22']], 5600, 5750, 5750]);

    const merge = freshApp(a => a.contribute({ name: 'ISA monthly', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'yes', investId: 'iA' }));
    const row = merge.state().payments[0].id;
    merge.at('2026-06-20'); merge.saveInvestment('iA', 'ISA', 5100);
    merge.at('2026-06-25');
    merge.smartImport([{ name: 'ISA monthly', amount: 200, date: '2026-06-23', link: 'invest:iA', mergeId: row }]);
    fa7bRecompute(merge);
    invariant('FA7B.effective.smart-import-merge', 'A Smart Import merge into the ISA row due 10 June keeps the transaction date (23 June), not the row\'s due date: it follows the 20 June observation, £5,100 + £200 = £5,300',
      [merge.activeEvents().map(e => [e.amount, e.source, e.dueDateSnapshot]), merge.snap().inv.iA], [[[200, 'smart_import', '2026-06-23']], 5300]);
  });

  scenario('FA-7B RELEASES — ordered against the anchor; eligibility and capping unchanged', () => {
    const app = freshApp();
    app.at('2026-06-10'); const r1 = fa7bRelease(app, 300); const afterFirst = fa7bLook(app);
    app.at('2026-06-15'); app.saveInvestment('iA', 'ISA', 5000); const observed = fa7bLook(app);
    app.at('2026-06-20'); fa7bRelease(app, 200); const afterSecond = fa7bLook(app);
    app.reload(); const reload = fa7bLook(app);
    const capital = JSON.parse(app.run('geodeInvestmentCapitalSinceTracking(S, S.investments[0])'));
    invariant('FA7B.release.order', 'Opening anchor £5,000; release £300 on 10 June → £4,700; observed £5,000 on 15 June → £5,000 (the release is held by the observation); release £200 on 20 June → £4,800, also after reload; capital since tracking −£500 (releases, no completions)',
      [[r1.ok, afterFirst], observed, afterSecond, reload, capital],
      [[true, [4700, 4700, 4700, 5000, 'legacy_transition', 0, 300, true]], [5000, 5000, 5000, 5000, 'manual', 0, 0, false], [4800, 4800, 4800, 5000, 'manual', 0, 200, true], [4800, 4800, 4800, 5000, 'manual', 0, 200, true], -500]);
    app.at('2026-06-25');
    const big = fa7bRelease(app, 99999);
    invariant('FA7B.release.cap', 'A release is still capped at the available balance (the position): £99,999 asked, £4,800 released, ISA £0',
      [big.ok, app.state().savingsReleases.slice(-1)[0].amount, app.snap().inv.iA], [true, 4800, 0]);
    const pension = new App(baseState({ investments: [ISA(), PENSION()] }), '2026-06-05');
    invariant('FA7B.release.eligibility', 'Eligibility unchanged: a pension is locked capital, nothing released; its opening anchor £3,000 stands',
      [fa7bRelease(pension, 100, 'iB').ok, pension.snap().inv.iB, pension.state().savingsReleases.length], [false, 3000, 0]);
  });

  scenario('FA-7B EVIDENCE — reversal, deleted template, negative raw position', () => {
    const del = freshApp();
    completeOn10June(del, { name: 'ISA monthly', amount: 200, rec: 'yes', investId: 'iA' });
    del.advance('2026-07-02', 'reload');
    del.at('2026-07-05'); del.del(del.state().payments[0].id);
    const deletedLater = del.snap().inv.iA; del.reload();
    const paidDel = freshApp();
    const one = completeOn10June(paidDel, { name: 'ISA top-up', amount: 200, rec: 'no', investId: 'iA' });
    paidDel.at('2026-06-15'); paidDel.del(one);
    invariant('FA7B.evidence.deleted-template', 'Deleting the recurring template in July (row reset, June completed) leaves the surviving June completion: £5,200, also after reload; deleting a paid one-off it still represents reverses it: £5,000',
      [deletedLater, del.snap().inv.iA, del.events().length, paidDel.snap().inv.iA], [5200, 5200, 1, 5000]);

    const neg = new App(legacyInvState({ balance: 200, baseBalance: 0 }, { payments: [legacyInvPay('i1', { date: '2026-06-05' })] }), '2026-06-20');
    const opened = neg.snap().inv.iA;
    neg.at('2026-06-21'); fa7bRelease(neg, 150);
    neg.at('2026-06-22'); neg.toggle('i1');
    const look = fa7bLook(neg);
    neg.reload();
    invariant('FA7B.evidence.negative-raw', 'Opening anchor £200 holds the migrated £200 one-off; release £150 → £50; undoing that one-off reverses evidence the anchor held: raw −£150, shown £0 (only the display is clamped), also after reload',
      [opened, look, fa7bLook(neg)], [200, [0, 0, -150, 200, 'legacy_transition', -200, 150, true], [0, 0, -150, 200, 'legacy_transition', -200, 150, true]]);
  });

  scenario('FA-7B SAVES — unchanged, metadata-only, future-dated, compatibility fields', () => {
    const [app, id] = fa7bFund(5000);
    completeOn10June(app, { name: 'Fund monthly', amount: 200, rec: 'yes', investId: id });
    app.at('2026-06-20');
    app.saveInvestment(id, 'Fund');
    const unchanged = [fa7bVals(app, id).length, fa7bLook(app, id), investActivity(app).length];
    app.editInvestment(id, { xn: 'Fund renamed', xr: '4', xp: 'Broker', xo: 'note' });
    const meta = [fa7bVals(app, id).length, fa7bLook(app, id), investActivity(app).length, fa7bInv(app, id).name];
    const est = [5200, 5200, 5200, 5000, 'manual_create', 200, 0, true];
    invariant('FA7B.save.unchanged', 'Saving the form with the shown £5,200 unchanged, then a name/returns/platform/notes edit: no valuation appended, no activity beyond the creation entry, the position stays estimated £5,200',
      [unchanged, meta], [[1, est, 1], [1, est, 1, 'Fund renamed']]);

    const fut = freshApp();
    fut.run('S.investments[0].valuations.push({ id: "v_future", value: 6000, date: "2026-07-01", recordedAt: 1, source: "manual" }); geodeRecomputeBalancesFromPayments(); save();');
    const before = fut.state();
    const toastsShown = fut.editInvestment('iA', { xb: '6100' });
    invariant('FA7B.save.future', 'A device date earlier than the latest valuation (1 July, today 5 June): saving a new value is refused with a message and nothing changes; no valuation is ever dated in the future',
      [toastsShown, same(fut.state(), before), fut.snap().inv.iA],
      [['This value can\u2019t be saved yet: your device date is earlier than the last value you entered. Check the date and try again.'], true, 6000]);

    const compat = freshApp(), twin = freshApp();
    compat.at('2026-06-20'); compat.saveInvestment('iA', 'ISA', 5600);
    twin.at('2026-06-20'); twin.saveInvestment('iA', 'ISA');
    const s = stored(compat).investments[0];
    invariant('FA7B.save.compat', 'Old-runtime fields stay meaningful: the observation is mirrored to baseBalance and balance (£5,600), valuations hold the opening anchor and the observation; the stored investment has the same fields as after a save that changes no value',
      [s.baseBalance, s.balance, s.valuations.map(v => [v.value, v.source]), Object.keys(s).sort()],
      [5600, 5600, [[5000, 'legacy_transition'], [5600, 'manual']], Object.keys(stored(twin).investments[0]).sort()]);
  });
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
  missedRecurring(); investments(); quickSetup(); monthlyLeft(); fa4aQuickSetup(); fa4aLapse(); fa4bMonthEnd(); fa4bUndo(); fa4bAnnual(); fa4cOccurrenceAmount(); identity(); identityMatrix(); planActions(); releases(); deposits();
  fa2Goals(); fa2Investments(); fa2Deposits();
  fa3aLedger(); fa3aGoals(); fa3aInvestments(); fa3aSmartImport(); fa3aDeletion(); fa3aIdentity(); fa3aRollover(); fa3aProtection(); fa3aAnnual(); fa3aOccurrence();
  fa3bOrder(); fa3bMatrix(); fa3bPointers(); fa3bParity(); fa3bLifecycle();
  fa3caNormalise(); fa3caMatrix(); fa3caTransition(); fa3caResolutions(); fa3caLinkedAndCorrection(); fa3caLifecycle();
  fa3cbActions(); fa3cbValidation(); fa3cbTimelines(); fa3cbIntegration(); fa3cb2Boundary(); fa3cb3aForm(); fa3cb3bTemporal();
  fa3ccTransition(); fa3ccCrash(); fa3ccAuthority(); fa3ccLifecycle(); fa3ccRefusal(); fa3ccPositions();
  fa7bTransition(); fa7bSafety(); fa7bJourneys(); fa7bEvidence();
  releaseSafetyFidelity(); releaseSafetyBoot(); releaseSafetyWrites(); releaseSafetyListener(); releaseSafetyGate(); releaseSafetyTabs();
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
