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
  'geodeNormalizePayLinkedIntent', 'geodeMergeDuplicateLinkedContributionsSameMonth', 'geodeDuplicateLinkedContributionKey', 'geodePaymentMonthYmFromDate',
  'geodePaymentEffectiveStatus', 'advancePaymentDueDateOneMonth', 'migratePaymentFlowFields',
  // recurring occurrence lifecycle (FA-4B): calendar-safe advance, undo inverse, paid-occurrence month, annual reset
  'geodeIsoDateAddMonths', 'geodeIsoDateMonthsBehind', 'geodePaymentUndoDueDate', 'geodePaymentPaidOccurrenceInMonth',
  // paid one-off occurrence month (P3-1B)
  'geodePaymentOneOffOccurrenceYm',
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
  'geodeGoalEffectiveSavedFromState', 'geodeGoalHasLinkedInvestmentAuthorityForState', 'geodeGoalLinkedInvBalanceForState',
  // linked-goal investment authority (FA-7D): the linked position, zero included, and one destination for contributions
  'geodeGoalLinkedInvestmentAuthorityForState', 'geodeLinkedGoalContributionRefusal', 'geodeInvestmentValueEstimated',
  // investment position authority (FA-7B): valuation anchors, contribution / release ordering, the load-time transition
  'geodeInvestmentIsoDateValid', 'geodeInvestmentValuationValid', 'geodeInvestmentValuations', 'geodeInvestmentOrderedAfter',
  'geodeInvestmentLatestValuation', 'geodeContributionEffectiveDate', 'geodeInvestmentContributionFlows', 'geodeInvestmentReleaseFlows',
  'geodeInvestmentPosition', 'geodeInvestmentLegacyBalance', 'geodeInvestmentDisplayBalance', 'geodeInvestmentCapitalSinceTracking',
  'geodeInvestmentValuationRecordedAt', 'geodeInvestmentAppendValuation', 'geodeInvestmentLegacyOpeningValues', 'geodeInvestmentEvidenceLatestAt',
  'geodeInvestmentAuthorityTransition',
  // investment occurrence lifecycle (FA-7C): rows on valuation-anchored investments are lifecycle only
  'geodeInvestmentLifecycleRowInvestment', 'geodeInvestmentRowOccurrenceYm',
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
  'geodeDebtPaymentYmValid', 'geodeDebtPaymentPointerTarget', 'geodeDebtPaymentActiveCompletions',
  // bill settlement ledger (P2-4): evidence on the same payment paths; nothing financial reads it
  'geodePaymentIsBill', 'geodeBillDueYm', 'geodeBillPaymentEventValid', 'geodeBillPaymentLedger', 'geodeNormalizeBillPaymentEvents',
  'geodeBillPaymentActiveCompletion', 'geodeBillPaymentEventId', 'geodeBillPaymentEventSnapshot', 'geodeBillPaidOccurrenceYm',
  'geodeBillCompletedAmount', 'geodeAppendBillCompletion', 'geodeRecordBillPaymentTransition', 'geodeSeedBillPaymentEvents',
  // expectation evidence and schema 3 (P2-5): captured at the month boundary; nothing financial reads it
  'geodeSchema3Active', 'geodeSchema3TransitionDue', 'geodeSchema3Transition', 'geodeSchema3TransitionOutstanding', 'geodeBoundaryTransitionOutstanding',
  'geodeExpectationDomain', 'geodeExpectationGapValid', 'geodeExpectationGapLedger', 'geodeNormalizeExpectationGaps', 'geodeExpectationEventDueYm',
  'geodeExpectationSettlementIndex', 'geodeExpectationSettled', 'geodeExpectationCreatedYm', 'geodeExpectationPaidOccurrenceYm',
  'geodeExpectationCaptureContext', 'geodeCaptureExpectationGaps', 'geodeExpectationOccurrenceStatus', 'geodeExpectationOccurrences',
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
  'geodeStoredSchemaVersion', 'geodeMarkRuntimeStale', 'geodeFinancialRevValid', 'geodeFinancialRevFromRaw',
  'geodeClassifyFinancialRevision', 'geodeRevWriterToken', 'geodeFinancialRevId', 'geodeStampFinancialRev', 'geodeFinancialJsonToStore', 'geodeAcceptFinancialWrite',
  // failed-persistence guard (P2-9): the one KEY write of save and persist; a failed write puts S back to the committed text
  'geodeStoreFinancialState', 'geodeNoteCommittedState', 'geodeRestoreCommittedState',
  'geodeNoteFinancialBoot', 'geodeFinancialWriteAllowed',
  'geodeOnForeignFinancialWrite', 'geodeShellReadiness', 'geodeRuntimeVersionParts', 'geodeBeyndCacheOrder', 'persistGeodeToLocalStorage',
  'geodeBoundaryHoldMessage', 'geodeInvestmentTransitionOutstanding', 'geodeRecurrenceWouldMutateBoundary',
  'geodeBoundaryEvidenceLocked', 'geodeShowBoundaryHoldNotice', 'geodeNoteBoundaryHold', 'geodeClearBoundaryHold',
  'geodeRefuseBoundaryEvidenceEdit',
  // pre-mutation boundary (P2-8): admission, then the boundary, before an action's first change; no sync until its write
  'geodePrepareFinancialMutation', 'geodeEndFinancialAction', 'geodePaymentCompletionMark', 'geodeBoundaryChangedRow',
  'geodeRefuseBoundaryChangedRow', 'calcLeftover', 'delExp', 'setPrimaryGoal',
  // carry lifecycle and contribution input integrity (FA-3C-B): payment actions resolve the carry a row still holds
  'geodeContributionCarryFor', 'geodeContributionCarryForRow', 'geodeResolveContributionCarry', 'geodeContributionCarryFollowRow',
  'geodeContributionSaveRefusal',
  // Smart Import and backup export / restore extraction
  'geodeSmartImportConfirm', 'geodeSmartImportRefusedMergeLine', 'geodeSmartImportRefusedLinkedGoalLine', 'exportJSONBackup', 'isPlainObject', 'validateBeyndBackupEnvelope',
  'geodeBeyndBackupRestorableKeyWhitelist', 'geodeBeyndBackupForbiddenDataKeys', 'extractRestorableData',
  // activity log
  'appendActivityLog', 'trimActivityLogForRetention',
  // modal commit guard (P1-CLOSE): the modal as openModal builds it and closeModal closes it, and its one commit
  'openModal', 'removeModalDom', 'closeModal', 'geodeModalCommitOpen', 'geodeModalCommitBegin', 'geodeModalCommitRelease',
  // month baseline (P3-4C): captured from the Living Month model inside the guarded write; nothing financial reads it
  'geodeMonthBaselineMonthStart', 'geodeMonthBaselineValid', 'geodeMonthBaselineKind', 'geodeMonthBaselineStatus', 'geodeMonthBaselineFromModel',
  'geodeMonthBaselineCapture', 'geodeMonthBaselinePrepare', 'geodeMonthBaselineStage', 'geodeLivingMonthModel',
  'geodeLivingMonthCalendar', 'geodeLivingMonthIncome', 'geodeLivingMonthEvidenceIndex', 'geodeLivingMonthPaymentItem',
  'geodeLivingMonthExpenses', 'geodeLivingMonthHappened', 'geodeLivingMonthEarlierGaps', 'geodeLivingMonthPaymentEvidence',
  // plan changes (P3-4D): the one component derivation and the pure comparison with the month's record
  'geodeLivingMonthComponents', 'geodeLivingMonthChanges',
  // income receipt evidence (P3-5B): validators, the one ledger and its admitted writers; nothing financial reads it
  'geodeIncomeReceiptAmountValid', 'geodeIncomeReceiptValid', 'geodeIncomeReceiptVoidValid', 'geodeIncomeReceiptLedger', 'geodeIncomeReceiptDraft',
  'geodeIncomeReceiptId', 'geodeIncomeReceiptTarget', 'geodeIncomeReceiptCommit', 'geodeRecordIncomeReceipt', 'geodeVoidIncomeReceipt', 'geodeCorrectIncomeReceipt'
];

/** Production top-level constants the extracted base functions read. */
const BASE_CONSTANTS = ['GEODE_SCHEMA_VERSION', 'BEYND_RUNTIME_VERSION', '_geodeRuntimeStale', '_geodeFinancialKeySeen',
  '_geodeKnownRaw', '_geodeKnownRev', '_geodeRevN', '_geodeRevWriter', '_geodeBoundaryHoldAttempts', '_geodeBoundaryHoldNotice',
  '_geodeBoundaryHoldReady', '_geodeFinancialActionOpen', '_geodeFinancialActionSeq', '_geodeBoundaryChangedRows',
  '_geodeCommittedText', '_geodeWriteFailedTask', '_geodeMonthBaselinePending', 'GEODE_SHELL_KEY', 'GEODE_CACHE_PREFIX'];

/**
 * Read-only structural checks: the reload and render shims below must mirror these production bodies, and the
 * App.contribute / App.planSchedule intents must mirror what the payment modal's callers pass.
 */
const STRUCTURAL_FUNCTIONS = ['load', 'save', 'geodeInstallFinancialStorageListener', 'geodeShowStaleRuntimeGate',
  'geodeShellCleanup', 'render', 'openPayModal', 'geodePayFromGoal', 'geodePayFromInvest', 'geodePayFromDebt',
  'openPayQuick', 'geodePlanDetailActionForStep', 'geodeMainActionFromPriorityStep', 'openSuggestedAction', 'openGoalModal', 'openInvModal'];

/** The release gate load() and __reload put in front of the schema 1 → 2 transition (geodeShellReadiness). */
const RELEASE_GATE = "else if (geodeShellReadiness() !== 'pending') geodeSchema2Transition();";
/** P2-5: the same readiness in front of the schema 2 → 3 transition, between RELEASE_GATE and INVESTMENT_GATE. */
const SCHEMA3_GATE = "if (geodeSchema3TransitionDue(S) && geodeShellReadiness() !== 'pending') geodeSchema3Transition();";
/** P1-REL: the same readiness in front of the automatic FA-7B investment transition, after RELEASE_GATE and before recurring sync. */
const INVESTMENT_GATE = "if (geodeSchema2Active(S) && geodeShellReadiness() !== 'pending') geodeInvestmentAuthorityTransition(S, _geodeInvOpening);";

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
/**
 * Production save() minus its snapshot/archive side effects: the same release guard, then production's own KEY write
 * (geodeStoreFinancialState) through the localStorage below, so __storageFault fails it exactly as production fails (P2-9).
 */
function save() {
  if (!geodeFinancialWriteAllowed()) return 'refused';
  var actionWasOpen = !!_geodeFinancialActionOpen;
  geodeEndFinancialAction();
  geodeMonthBaselineStage(actionWasOpen);
  __saving = true;
  try { return geodeStoreFinancialState(); } finally { __saving = false; }
}
/** True while save() writes: write counters (watchWrites, __commits) count only the transition commits and persists. */
var __saving = false;
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
/** #modal is the open modal (__modal); any other id is a form field, and a boolean field is a checkbox. */
var document = { getElementById: function (id) {
  if (id === 'modal') return __modal;
  if (!Object.prototype.hasOwnProperty.call(__fields, id)) return null;
  return typeof __fields[id] === 'boolean' ? { checked: __fields[id], value: 'on' } : { value: __fields[id] };
} };
/** Backup export: the confirm is accepted and the downloaded file is captured in __downloads. */
var __downloads = [];
function confirm() { return true; }
function Blob(parts) { this.text = parts.join(''); }
var URL = { createObjectURL: function (b) { __downloads.push(b.text); return 'blob:' + __downloads.length; }, revokeObjectURL: function () {} };
/** An element's class list and attributes; the one appended with id "modal" is the open modal until it is removed. */
var __modal = null;
function __Element() {
  var cls = {}, attrs = {};
  this.classList = { add: function (c) { cls[c] = true; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return cls[c] === true; } };
  this.setAttribute = function (k, v) { attrs[k] = String(v); };
  this.getAttribute = function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; };
  this.removeAttribute = function (k) { delete attrs[k]; };
}
__Element.prototype.addEventListener = function () {};
__Element.prototype.click = function () {};
__Element.prototype.remove = function () { if (__modal === this) __modal = null; };
document.createElement = function () { return new __Element(); };
document.body = { appendChild: function (el) { if (el.id === 'modal') __modal = el; }, removeChild: function () {} };
/** Timers wait for __runTimers(): until then a closed modal is still in the page, in its close animation. */
var __timers = [];
function setTimeout(fn) { __timers.push(fn); return __timers.length; }
function __runTimers() { while (__timers.length) __timers.shift()(); }
function geodeQuickSetupExit() {}
/** Smart Import handoff modal: the summary it was opened with is kept in __handoff. */
var __handoff = null;
function geodeSmartImportRememberLearn() {} function geodeSmartImportShowHandoffModal(sum) { __handoff = JSON.parse(JSON.stringify(sum)); }

var __uidN = 0;
function uid() { __uidN++; return 'id' + __uidN; }
function rc() { return '#9b7fe8'; }
function fm(v) { return '£' + Math.round(Number(v) || 0); }

function render() {} function rGoals() {} function checkAlerts() {} function syncPills() {} function goTab() {}
/**
 * Messages. Each shim starts with the guard its production function starts with (P2-9: nothing after a failed write in
 * that task). Success lines and completion feedback go to __acks, apart from __toasts.
 */
var __toasts = [], __acks = [];
function toast(m) { if (_geodeWriteFailedTask) return; __toasts.push(String(m)); }
function geodeSuccessToast(m) { if (_geodeWriteFailedTask) return; __acks.push(String(m)); } function geodeStageLToastAfterSave(m) { return m; }
function geodeEmitPaymentCompletionFeedback(p) { if (_geodeWriteFailedTask) return; if (p && String(p.status || '') === 'paid') __acks.push('completed ' + p.id); }
function geodeMarkRecentUserSave() {}
function geodeSubOnSave(name) { if (_geodeWriteFailedTask) return; __acks.push('subscription ' + name); }
function setLastSnapshotBeforeChange() {} function geodeInvalidateDecisionCaches() {}
function evaluatePaymentFollowthrough() {} function geodeRememberLastPaymentDraft() {}
/**
 * P2-8 fidelity: payment actions reach these before their write, and in production each begins with getMonthPlan(),
 * whose first statement is calcLeftover() → syncRecurringPayments(). Only that side effect is kept; plan sizing and the
 * insight kind are not under test (production skips getMonthPlan without income or expenses — reaching it always is the
 * stricter case).
 */
function getMonthPlan() { calcLeftover(); return { steps: [] }; }
function geodeHomeMainActionInsightKind() { getMonthPlan(); return ''; }
function geodeReconcileFrozenSuggestedActionsAfterLinkedSave() { getMonthPlan(); }
/** The payment modal is UI: record what it was opened with (P2-8 reopens an edit form whose row the boundary reset). */
var __opened = null;
function openPayModal(id, prefill) { __opened = { id: id || null, prefill: prefill ? JSON.parse(JSON.stringify(prefill)) : null }; }
function geodeEnsureEmergencyBufferGoalForPayment() { return { applied: false }; }
function geodeNormalizeGoalTargetDateInput() { return null; }
function geodeConfirm(msg, onYes) { onYes(); }
function geodeQuickSetupSyncFromUi() {}
function geodePlanReadinessState() { return 'active'; }

/** Mirrors load(): the subset of its boot sequence that touches payments, goals, investments and releases. */
function __reload() {
  _geodeRuntimeStale = ''; _geodeFinancialKeySeen = false; __staleGate = ''; // a reload is a new page
  _geodeBoundaryHoldAttempts = 0; _geodeBoundaryHoldNotice = false; _geodeBoundaryHoldReady = false;
  _geodeFinancialActionOpen = 0; _geodeBoundaryChangedRows = null; _geodeWriteFailedTask = false;
  _geodeRevN = 0; _geodeRevWriter = geodeRevWriterToken(); // P2-10: a new page's revision counter and writer token
  _geodeMonthBaselinePending = null; // P3-4C: page memory
  geodeNoteFinancialBoot(__store);
  S = JSON.parse(__store);
  S._schemaVersion = geodePersistedSchemaVersion(S._schemaVersion);
  geodeNormalizeContributionEvents(S);
  geodeNormalizeContributionCarry(S);
  migratePaymentFlowFields();
  geodeNormalizeGoalInvestBaseFields();
  geodeNormalizeSavingsReleases(S);
  geodeNormalizeBillPaymentEvents(S);
  if (!_geodeRuntimeStale) geodeSeedBillPaymentEvents();
  geodeNormalizeExpectationGaps(S);
  var _geodeInvOpening = _geodeRuntimeStale ? [] : geodeInvestmentLegacyOpeningValues(S);
  if (!_geodeRuntimeStale) {
    if (geodeSchema2Active(S)) geodeSchema2IntegrityReport(S);
    else if (geodeShellReadiness() !== 'pending') geodeSchema2Transition();
    if (geodeSchema3TransitionDue(S) && geodeShellReadiness() !== 'pending') geodeSchema3Transition();
    if (geodeSchema2Active(S) && geodeShellReadiness() !== 'pending') geodeInvestmentAuthorityTransition(S, _geodeInvOpening);
  }
  geodeNoteCommittedState();
  syncRecurringPayments();
  geodeNormalizeDebtPaymentEvents(S);
  geodeRecomputeBalancesFromPayments();
  geodeNoteCommittedState(); // load() ends here
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
      shown: geodeGoalHasLinkedInvestmentAuthorityForState(S, g) ? geodeGoalLinkedInvBalanceForState(S, g.id) : position };
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
/** getMonthPlan sizing is not under test: each scenario fixes the month's plan steps. Its first statement, calcLeftover(), is kept (P2-8). */
var __plan = { steps: [] };
function getMonthPlan() { calcLeftover(); return __plan; }
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
  return { script, extracted, structural, src, plan: buildPlanProgram(src, foundation, extracted), payModal: buildPayModalProgram(src, foundation),
    commit: buildCommitProgram(src, foundation, extracted) };
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
  return buildEntryProgram(src, foundation, extracted, PLAN_SHIMS, PLAN_CONSTANTS, PLAN_ENTRY_FUNCTIONS, 'plan');
}

/** Base program + shims + the entry functions' dependency closure (entries replace base shims of the same name). */
function buildEntryProgram(src, foundation, extracted, shims, constantNames, entries, name) {
  const constants = BASE_CONSTANTS.concat(constantNames).map(n => extractConstant(src, n));
  const baseCode = TEST_SHIMS + '\n' + shims + '\n' + foundation + '\n' + extracted.map(f => f.text).join('\n') + '\n' + constants.join('\n') + '\n';
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  new vm.Script(baseCode, { filename: 'cross-month-' + name + '-probe.js' }).runInContext(probe);
  const ownShims = new Set();
  shims.replace(/function\s+([A-Za-z_$][\w$]*)\s*\(/g, (_, n) => ownShims.add(n));
  const have = new Map();
  const queue = entries.slice();
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || ownShims.has(n)) continue;
    if (entries.indexOf(n) < 0 && vm.runInContext('typeof ' + n, probe) !== 'undefined') continue;
    const f = extractFunction(src, n);
    have.set(n, f);
    calledNames(f.text).forEach(c => queue.push(c));
  }
  const entryExtracted = [...have.values()];
  const code = baseCode + entryExtracted.map(f => f.text).join('\n') + '\n';
  return { script: new vm.Script(code, { filename: 'cross-month-' + name + '-program.js' }), extracted: entryExtracted };
}

/**
 * Modal save handlers (P1-CLOSE). They run in a third program: each reads its form from __fields inside the modal
 * openModal builds, and their production dependencies are extracted transitively.
 */
const COMMIT_ENTRY_FUNCTIONS = ['savePay', 'geodeDupPayResolve', 'geodeDupExpResolve', 'saveExp', 'geodeSaveExpApply', 'saveDebt', 'saveInc',
  'geodeConfirmSavingsRelease'];

/** Commit-program environment: modal headings and toast copy are UI. */
const COMMIT_SHIMS = String.raw`
function mh() { return ''; }
`;

function buildCommitProgram(src, foundation, extracted) {
  return buildEntryProgram(src, foundation, extracted, COMMIT_SHIMS, [], COMMIT_ENTRY_FUNCTIONS, 'commit');
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
  /**
   * Later visit. Reload: the page's last write happened while it was open (load() writes nothing before recurring sync,
   * and nothing saves on unload), so it is stored at the old clock and the new page loads at iso. Session: render at iso.
   */
  advance(iso, mode) { if (mode === 'reload') { this.run('save();'); this.at(iso); this.run('__reload()'); } else { this.at(iso); this.render(); } }
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
    // As savePay: the commit (P2-8: admission and the month boundary) before the first change, then the save; released
    // when refused. P3-4B.1: no global same-month merge — only the linked upsert merges its own target group.
    if (!this.run('geodeModalCommitBegin()')) return null;
    const applied = this.call('geodeSavePayApply', [o.id || null, o.name || 'Contribution', String(o.amount), o.date, o.status, o.rec || 'no',
      o.date, gid, invid, debtid, kind, Number(o.amount)]);
    if (!applied) this.run('geodeModalCommitRelease()');
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
    this.contribute({ id: null, intent, name: f.name, amount: amount != null ? amount : f.amount, date: f.date,
      status: f.status, rec: f.rec ? 'yes' : 'no', goalId: f.goalId, investId: f.investId, debtId: f.debtId });
    return intent;
  }
  /** The form production openPayModal renders for a row (or, with id null, a new one from prefill): each input's value and each select's selected option (else its first). */
  modalForm(id, prefill) {
    const ctx = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
    PROGRAM.payModal.runInContext(ctx);
    ctx.__stateJson = JSON.stringify(this.state());
    const html = vm.runInContext('S = JSON.parse(__stateJson); openPayModal(' + JSON.stringify(id) + (prefill ? ', ' + JSON.stringify(prefill) : '') + '); __html', ctx);
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
    this.contribute({ id, intent: 'replace', name: f.name, amount: f.amount, date: f.date, status: f.status, rec, goalId: gid, investId: invid, debtId: debtid });
  }
  /** The legacy same-month merge over every group (the rule under test; P3-4B.1: no user action runs it unscoped). */
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
  /** As geodeConfirmSavingsRelease: the commit (P2-8: admission and the month boundary), the release, released when refused. */
  release(goalId, amount) {
    if (!this.run('geodeModalCommitBegin()')) return { ok: false, refused: 'commit' };
    const r = JSON.parse(this.run('JSON.stringify(geodeApplySavingsRelease(' + JSON.stringify({ sourceType: 'goal', sourceId: goalId, amount, reason: 'emergency' }) + '))'));
    if (!r.ok) this.run('geodeModalCommitRelease()');
    return r;
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
/** P2-10: a state without its revision id — the writer identity two independently loaded pages never share. seq, by and at stay. */
const withoutRevId = s => { const c = JSON.parse(JSON.stringify(s)); if (c && c._rev) delete c._rev.id; return c; };
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
      'geodeNormalizeBillPaymentEvents(S);', 'if (!_geodeRuntimeStale) geodeSeedBillPaymentEvents();', 'geodeNormalizeExpectationGaps(S);',
      'var _geodeInvOpening = _geodeRuntimeStale ? [] : geodeInvestmentLegacyOpeningValues(S);', 'if (!_geodeRuntimeStale) {',
      'if (geodeSchema2Active(S)) geodeSchema2IntegrityReport(S);', RELEASE_GATE, SCHEMA3_GATE, INVESTMENT_GATE, 'syncRecurringPayments();',
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
    invariant('fidelity.intent.plan', 'Plan prefills in source order: debt schedule actions keep set (each save is its own row, P2-3); buffer/goal/investment gap actions add; untouched fallbacks set',
      ['geodePlanDetailActionForStep', 'geodeMainActionFromPriorityStep', 'openSuggestedAction'].map(n => [n, intents(n)]),
      [['geodePlanDetailActionForStep', ['set', 'set', 'add', 'set', 'add', 'set', 'add', 'set']],
        ['geodeMainActionFromPriorityStep', ['set', 'add', 'add', 'add']], ['openSuggestedAction', ['set', 'add', 'add', 'add']]]);
    invariant('fidelity.adjust', 'Every "Adjust scheduled amount", debt included since P2-3, runs geodePlanAdjustScheduledRun (edit the one row by id, else open Payments)',
      (PROGRAM.structural.geodePlanDetailActionForStep.match(/setScheduleAction\('Adjust scheduled amount'[^\n]*/g) || [])
        .map(l => l.indexOf('geodePlanAdjustScheduledRun(state, step)') >= 0), [true, true, true, true]);
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

/** The contribution ledger for one row: every event as [type, occurrence month, amount], and the completions no reversal undoes. */
function completionLedger(app, paymentId) {
  const events = app.state().contributionEvents.filter(e => e.paymentId === paymentId);
  const reversed = new Set(events.filter(e => e.eventType === 'reversal').map(e => e.reversesEventId));
  return {
    events: events.map(e => [e.eventType, e.occurrenceYm, e.eventType === 'completion' ? e.amount : null]),
    active: events.filter(e => e.eventType === 'completion' && !reversed.has(e.id)).map(e => [e.occurrenceYm, e.amount]),
    pairs: events.map((e, i) => e.eventType !== 'reversal' || (i > 0 && events[i - 1].id === e.reversesEventId))
  };
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
    invariant('A.ledger', 'Durable completions exist for 2026-06, 2026-07 and 2026-08 (one each, £100) in the contribution ledger (FA-3C; reclassified from SPEC in P2-6)',
      completionLedger(app, id).active, [['2026-06', 100], ['2026-07', 100], ['2026-08', 100]]);
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL A — same-session vs reload', () => {
    parity('A.parity', 'GOAL A (D6 closed for goals by FA-3C-C)', timelines);
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
    invariant('B.history', 'The occurrence read model answers June = confirmed, July = expected · no recorded outcome (never "missed" or "unpaid"), August = confirmed (P2-5)',
      ['2026-06', '2026-07', '2026-08'].map(ym => app.run('geodeExpectationOccurrenceStatus(S, ' + JSON.stringify(id) + ', "' + ym + '")')),
      ['confirmed', 'expected_no_recorded_outcome', 'confirmed']);
    timelines[mode] = app.timeline;
  }));
  scenario('GOAL B — same-session vs reload', () => {
    parity('B.parity', 'GOAL B (D6 closed for goals by FA-3C-C)', timelines);
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
    invariant('F1.june', 'June occurrence remains £100 after the template edit; July is recorded at £150 (contribution ledger, FA-3C; reclassified from SPEC in P2-6)',
      completionLedger(app, id).active, [['2026-06', 100], ['2026-07', 150]]);
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
    invariant('G.history', 'June completion survives template deletion: the row is gone, its June completion stays in the contribution ledger and the occurrence read model answers confirmed (reclassified from SPEC in P2-6)',
      [s.rows.length, completionLedger(app, id).active, app.run('geodeExpectationOccurrenceStatus(S, ' + JSON.stringify(id) + ', "2026-06")')], [0, [['2026-06', 100]], 'confirmed']);
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
    const ledger = completionLedger(app, id);
    invariant('H.ledger', 'At most one active completion per payment and month; four events (completion, reversal, completion, reversal), each reversal undoing the completion before it, none active at the end (reclassified from SPEC in P2-6)',
      [ledger.events, ledger.pairs.every(Boolean), ledger.active],
      [[['completion', '2026-06', 100], ['reversal', '2026-06', null], ['completion', '2026-06', 100], ['reversal', '2026-06', null]], true, []]);
  });
}

function missedRecurring() {
  const timelines = {};
  MODES.forEach(mode => scenario('MISSED — £100/month due 15 June, never completed [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = monthlyHoliday(app);
    let s = app.snap('Jun 05 scheduled');
    invariant('M.jun.left', 'June Monthly Left allocates £100', s.left, 2900);
    app.advance('2026-06-16', mode); s = app.snap('Jun 16 past due');
    current('M.jun.status', 'June after due date: effective status', s.rows[0].effective, 'overdue');
    current('M.jun.home', 'June after due date: Home overdue payment items', String(s.homeOverduePayments), '1');
    app.advance('2026-07-02', mode); s = app.snap('Jul 02 rollover');
    current('M.jul.rows', 'July rollover: one row, moved to 15 July (the row no longer identifies June; since P2-5 the June expectation survives as evidence, see M.history)', s.rows.map(r => [r.date, r.effective]), [['2026-07-15', 'upcoming']]);
    invariant('M.jul.left', 'July Monthly Left allocates only July\'s £100 (missed June is not a liability)', s.left, 2900);
    invariant('M.jul.goal', 'Holiday unchanged', s.goal.gH, 1000);
    app.advance('2026-08-02', mode); s = app.snap('Aug 02 rollover');
    current('M.aug.rows', 'August rollover: same row moved to 15 August', s.rows.map(r => r.date), ['2026-08-15']);
    invariant('M.aug.left', 'August Monthly Left allocates only August\'s £100', s.left, 2900);
    invariant('M.history', 'The occurrence read model answers June and July = expected · no recorded outcome — recorded at each boundary from the template and the absence of a settlement, never "not completed" or "missed"; August, the current month, is not classified (P2-5)',
      ['2026-06', '2026-07', '2026-08'].map(ym => app.run('geodeExpectationOccurrenceStatus(S, ' + JSON.stringify(id) + ', "' + ym + '")')),
      ['expected_no_recorded_outcome', 'expected_no_recorded_outcome', 'unknown']);
    timelines[mode] = app.timeline;
  }));
  scenario('MISSED — same-session vs reload', () => {
    parity('M.parity', 'MISSED', timelines, undefined, '');
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

  MODES.forEach(mode => scenario('FA-4B ANNUAL — annual ISA £250 becomes its 2027 occurrence (FA-7C) [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA annual', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    let s = app.snap();
    const june = [lifecycle(app, id), s.left, s.inv.iA];
    app.advance('2027-06-01', mode); s = app.snap();
    invariant('FA4B.annual.invest', 'June 2026: counts in Monthly Left (£2,750), ISA £5,250. June 2027: the upcoming 2027 occurrence like any annual row (until FA-7C investment rows stayed paid, because the row held the value); the 2026 £250 completion stays active, so ISA keeps £5,250; it counts by its due date (£2,750)',
      [june, [lifecycle(app, id), s.left, s.inv.iA, app.activeEvents().map(e => [e.occurrenceYm, e.amount])]],
      [[['paid', '2027-06-10', '2026-06', '2026-06-10'], 2750, 5250], [['upcoming', '2027-06-10', '', ''], 2750, 5250, [['2026-06', 250]]]]);
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
  scenario('FA-1 H — debt: each unpaid payment intent keeps its own row (P2-3)', () => {
    const debts = [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 20 }];
    const app = new App(baseState({ debts }), '2026-06-05');
    app.planSchedule({ name: 'Card payment', amount: 50, date: '2026-06-15', status: 'upcoming', rec: 'yes', debtId: 'dC' });
    app.contribute({ name: 'Extra debt payment: Card', amount: 100, date: '2026-06-20', status: 'upcoming', rec: 'no', debtId: 'dC' });
    invariant('FA1.H.upsert', 'A second unpaid same-month debt payment is its own row: the £50 monthly stays monthly and the £100 one-off stays one-off',
      signature(app.rows()), [{ rec: 'no', amount: 100 }, { rec: 'yes', amount: 50 }]);
    const legacy = new App(baseState({ debts, payments: [
      Object.assign(holidayRow('d1', 50, 'yes'), { goalId: '', debtId: 'dC', payKind: 'debt' }),
      Object.assign(holidayRow('d2', 100, 'no'), { goalId: '', debtId: 'dC', payKind: 'debt', createdAt: 2 })] }), '2026-06-05');
    legacy.merge();
    invariant('FA1.H.merge', 'Unpaid same-month debt rows are not merged: no summed amount, no promoted frequency, both ids kept',
      legacy.state().payments.map(p => [p.id, p.rec, p.amount]).sort(), [['d1', 'yes', 50], ['d2', 'no', 100]]);
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
 * scheduled together cover a goal/investment/buffer step — and, since P2-7, a debt step.
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
    invariant('PA.DEBT.adjust', 'Debt Adjust opens the one scheduled row by id (the shared Adjust helper; P2-3 no longer reuses a debt row without an id) and re-saving keeps one row',
      [pick(app.planView(DEBT_STEP), 'label', 'amount'), tapped(app.planTap(DEBT_STEP)), unpaid(app)],
      [{ label: 'Adjust scheduled amount', amount: 120 }, ['payments', 'id1', 'replace'], [['id1', 'yes', 120, false]]]);
    const covered = planApp([pay('d0', 50, 'no', { debtId: 'dC', payKind: 'debt' }, Object.assign({ name: 'Extra debt payment: Card' }, PAID)),
      pay('d1', 70, 'yes', { debtId: 'dC', payKind: 'debt' }, { name: 'Extra debt payment: Card', createdAt: 2 })], debts);
    covered.setPlan([DEBT_STEP]);
    invariant('PA.DEBT.covered', 'Debt paid £50 + scheduled £70 covers the £120 step: Plan offers to adjust the £70 already scheduled, not to schedule it again, and Home points to the plan (P2-7: debt joins the paid + scheduled coverage rule; was CURRENT)',
      [pick(covered.planView(DEBT_STEP), 'label', 'amount', 'actionable', 'scheduledOnly', 'actionAmount'), covered.homeView(DEBT_STEP)],
      [{ label: 'Adjust scheduled amount', amount: 70, actionable: false, scheduledOnly: true, actionAmount: 0 }, { cta: 'View plan', amount: null }]);
    invariant('PA.DEBT.covered.tap', 'Its tap edits the one scheduled row d1 by id and re-saving keeps that one row — no second £70 (P2-7; was CURRENT, when the tap saved a duplicate £70 beside d1)',
      [tapped(covered.planTap(DEBT_STEP)), unpaid(covered), covered.state().debts[0].balance],
      [['payments', 'd1', 'replace'], [['d1', 'yes', 70, false]], 1000]);
  });

  scenario('P2-7 DEBT PLAN COVERAGE — current-month scheduled debt intent counts toward the step, through the existing scheduled-row rules', () => {
    const debts = { debts: [CARD()] };
    const DEBT = { debtId: 'dC', payKind: 'debt' };
    const extra = (id, amount, rec, more) => pay(id, amount, rec, DEBT, Object.assign({ name: 'Extra debt payment: Card' }, more || {}));
    const paid50 = () => extra('d0', 50, 'no', PAID);
    const state = app => pick(app.planView(DEBT_STEP), 'label', 'amount', 'applied', 'scheduled', 'actionAmount');

    const partial = planApp([paid50(), extra('d1', 20, 'yes', { createdAt: 2 })], debts);
    partial.setPlan([DEBT_STEP]);
    const partialBefore = state(partial);
    const partialTap = tapped(partial.planTap(DEBT_STEP));
    invariant('P2.debtplan.partial', 'B. Paid £50 + scheduled £20 of £120: Plan offers only the uncovered £50; accepting saves it as its own row beside d1 (P2-3), after which the step is covered and Plan offers Adjust',
      [partialBefore, partialTap, unpaid(partial), pick(partial.planView(DEBT_STEP), 'label', 'scheduled', 'actionAmount')],
      [{ label: 'Schedule remaining amount', amount: 50, applied: 50, scheduled: 20, actionAmount: 50 }, ['payments', null, 'set'],
        [['d1', 'yes', 20, false], ['id1', 'yes', 50, false]], { label: 'Adjust scheduled amount', scheduled: 70, actionAmount: 0 }]);

    const two = planApp([paid50(), extra('d1', 30, 'yes', { createdAt: 2 }), extra('d2', 40, 'no', { createdAt: 3, date: '2026-06-20' })], debts);
    two.setPlan([DEBT_STEP]);
    invariant('P2.debtplan.two-rows', 'C/D. Two separate scheduled intents (a £30 monthly and a £40 one-off this month) both count: £50 + £70 covers the step; with two rows Adjust opens Payments rather than picking one, and neither row is merged or changed',
      [state(two), tapped(two.planTap(DEBT_STEP)), unpaid(two)],
      [{ label: 'Adjust scheduled amount', amount: 70, applied: 50, scheduled: 70, actionAmount: 0 }, ['payments', null, null], [['d1', 'yes', 30, false], ['d2', 'no', 40, false]]]);

    const minimum = planApp([paid50(), pay('m1', 50, 'yes', DEBT, { name: 'Card minimum', createdAt: 2 })], { debts: [Object.assign(CARD(), { minp: 50 })] });
    minimum.setPlan([DEBT_STEP]);
    invariant('P2.debtplan.minimum', 'D. The existing scheduled-row rule still applies (card with a £50 minimum, minp): a scheduled row that only meets the minimum is not extra and covers nothing, so the £70 stays uncovered',
      state(minimum), { label: 'Schedule remaining amount', amount: 70, applied: 50, scheduled: 0, actionAmount: 70 });

    const done = planApp([paid50(), extra('d1', 70, 'yes', { status: 'paid', date: '2026-07-15', lastPaidYM: '2026-06', lastPaidDueDate: '2026-06-15', createdAt: 2 })], debts);
    done.setPlan([DEBT_STEP]);
    invariant('P2.debtplan.completed', 'E. Completed rows are counted once, as paid: £50 + £70 paid completes the step, nothing is scheduled and nothing is offered',
      [state(done), done.planView(DEBT_STEP).actionable], [{ label: '', amount: null, applied: 120, scheduled: 0, actionAmount: 0 }, false]);

    const later = planApp([paid50(), extra('d1', 70, 'no', { date: '2026-07-15', createdAt: 2 })], debts);
    later.setPlan([DEBT_STEP]);
    invariant('P2.debtplan.next-month', 'F. A £70 one-off dated next month does not cover this month: the £70 is still offered',
      state(later), { label: 'Schedule remaining amount', amount: 70, applied: 50, scheduled: 0, actionAmount: 70 });

    invariant('P2.debtplan.balance', 'G. No Plan view or tap moves the debt balance: Card stays £1,000 throughout',
      [partial, two, minimum, done, later].map(a => a.state().debts[0].balance), [1000, 1000, 1000, 1000, 1000]);
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
    const app = freshApp(holidayOneOff);
    app.editInvestment('iA', { xgoalid: 'gH' });
    invariant('FA2.G.linked.before', 'The June £250 completed, then the ISA linked through its form (FA-7D: a new contribution to an already linked goal goes to the investment): the linked ISA (£5,000) provides the goal position; the goal\'s own cache is £1,250', [app.snap().goal.gH, goalOf(app).saved], [5000, 1250]);
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
    const newer = app.restorable(Object.assign({}, env, { schemaVersion: 4 }));
    invariant('FA3A.schema', 'Schema 3 since P2-5 (schema 2 since FA-3C-C, the authority switch): the build and its export are schema 3, and the schema-1 state saved above transitioned; a backup marked newer (4) is refused whole, never extracted without its ledger',
      [app.run('GEODE_SCHEMA_VERSION'), env.schemaVersion, app.state()._schemaVersion, newer.ok, Object.keys(newer.state).length], [3, 3, 3, false, 0]);
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
    invariant('FA3B.backup.ambiguous', 'A legacy backup with only ambiguous paid rows restores with no invented event: the transition carries both rows undated and Holiday stays £1,350 at schema 3 (P2-5: schema 2 then 3)',
      [ambiguousBack.a.events(), carryRows(ambiguousBack.a.state().contributionCarry).map(c => [c[0], c[3]]), ambiguousBack.a.snap().goal.gH, ambiguousBack.a.state()._schemaVersion],
      [[], [['px', 100], ['pa', 250]], 1350, 3]);
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
    const imRow = () => { const p = inv.state().payments.filter(x => x.id === 'im')[0]; return [p.status, p.amount, p.lastPaidYM || '', inv.events().filter(e => e.paymentId === 'im').length]; };
    inv.reload();
    const august = imRow();
    const months = ['2026-09-02', '2026-10-02', '2026-11-02', '2026-12-02', '2027-01-02', '2027-02-02', '2027-03-02', '2027-04-02', '2027-05-02', '2027-06-02', '2027-07-02', '2027-08-02'];
    const seen = months.map(m => { inv.advance(m, 'reload'); return [imRow()[0], inv.snap().inv.iA]; });
    invariant('FA3CA.inv.deferred', 'No investment carry: the transition creates no ISA carry; its opening anchor holds the ambiguous row\'s £200 (ISA £5,200). Since FA-7C the row is lifecycle only: still completed through the transition month (August), upcoming from September (before FA-7C it stayed completed forever) — no lastPaidYM, no event invented, ISA £5,200 through twelve monthly reloads; nothing completed, so no carry candidate remains',
      [inv.state().contributionCarry.filter(c => c.entityType !== 'goal').length, before, august, seen, imRow(), candidate(inv)],
      [0, [{ paymentId: 'im', entityType: 'investment', entityId: 'iA', kind: 'undated_contribution', amount: 200, recurrence: 'monthly', dueDateSnapshot: '2026-06-05' }, 5200],
        ['paid', 200, '', 0], months.map(() => ['upcoming', 5200]), ['upcoming', 200, '', 0], null]);

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
    invariant('FA3CA.linked', '[shown, position, display rule, dated, carry, carried payments, ISA]: ISA £5,200 linked → Holiday shows the ISA (its own position £1,350 = £1,000 + dated £250 + carry £100; the ISA completion £200 never enters it); ISA at £0 → Holiday shows £0 (FA-7D: the ISA\'s valid £0 opening anchor is authority, not a reason to fall back), while its own position £1,350 stays intact',
      [look(linked({ balance: 5200 }, goalRows.concat([legacyInvPay('pi', { date: '2026-06-05' })]))), look(linked({ balance: 0, baseBalance: 0 }, goalRows))],
      [[5200, 1350, 5200, 250, 100, ['px'], 5200], [0, 1350, 0, 250, 100, ['px'], 0]]);
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
    invariant('FA3CA.backup', 'A carry and its resolution survive the transition, render and reload; the export holds them; restore extraction keeps them (not stripped) and the restored load has them; an old schema-1 backup without the key loads [] and transitions to schema 3 (through 2, P2-5); an invalid carry in a backup is dropped at load; export and build are schema 3',
      [same(persisted, records), same(env.data.contributionCarry, records), [restored.ok, restored.strippedKeys.indexOf('contributionCarry')], same(back.state().contributionCarry, records),
        ['contributionCarry' in oldEnv.data, oldBack.state().contributionCarry, oldBack.state()._schemaVersion], badBack.state().contributionCarry.map(c => c.id),
        [env.schemaVersion, back.run('GEODE_SCHEMA_VERSION'), app.state()._schemaVersion, back.state()._schemaVersion]],
      [true, true, [true, -1], true, [false, [], 3], ['c1', 'r1'], [3, 3, 3, 3]]);
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
    invariant('FA3CA.boundary', 'Functions that mention: the transition carry helper — itself and the transition (its only caller); the schema2_transition source — the validator and the helper; carry state — the carry functions, the resolution writer, FA-3B seeding (carried payments are seen), the transition, the C4b reset rule and the backup whitelist; carry functions — the carry family, the FA-3C-B lifecycle helpers and the contribution recorder, deletion and rollover safety net that call them, the goal parts, the authority validator, the C4b reset rule, recurring sync (which carried payments it may reset) and the P2-2 boundary preview that reads the same carry map before deciding whether to hold that sync, FA-3B seeding and load (normaliser only); schema-2 goal helpers — each other, the recompute (goal Saved) and saveGoal (Saved So Far)',
      [users('geodeSchema2TransitionCarryRecords('), users("'schema2_transition'"), users('contributionCarry'), users('ContributionCarry'), users('geodeLegacyCarryCandidate('), users('geodeSchema2Goal')],
      [['geodeSchema2Transition', 'geodeSchema2TransitionCarryRecords'], ['geodeContributionCarryValid', 'geodeSchema2TransitionCarryRecords'],
        ['geodeBeyndBackupRestorableKeyWhitelist', 'geodeContributionCarryActive', 'geodeNormalizeContributionCarry', 'geodeResolveContributionCarry', 'geodeSchema2RecurringResetDue',
          'geodeSchema2Transition', 'geodeSchema2TransitionCarryRecords', 'geodeSeedLegacyContributionEvents'],
        ['geodeContributionCarryActive', 'geodeContributionCarryFollowRow', 'geodeContributionCarryFor', 'geodeContributionCarryForRow', 'geodeContributionCarryLedger',
          'geodeContributionCarryResolutionValid', 'geodeContributionCarryValid', 'geodeContributionSaveRefusal', 'geodeEnsureContributionCompletion', 'geodeNormalizeContributionCarry',
          'geodeRecordContributionDeletion', 'geodeRecordContributionTransition', 'geodeRecurrenceWouldMutateBoundary', 'geodeResolveContributionCarry', 'geodeSchema2AuthorityProblems', 'geodeSchema2GoalParts',
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
/** Toasts plus whether the action changed state. _rev is excluded: a refused action can still reach save(), and a successful save records a revision without being a financial edit. */
const stateApartFromRev = s => { const c = JSON.parse(JSON.stringify(s)); delete c._rev; return c; };
/** A refused action changes nothing but write metadata: its write may record the month's first baseline (P3-4C), never change one. */
const stateApartFromWrite = (s, before) => { const c = stateApartFromRev(s); if (before.monthBaseline === undefined) delete c.monthBaseline; return c; };
const attempt = (app, act) => { app.run('__toasts = [];'); const before = app.state(); act(app); return [JSON.parse(app.run('JSON.stringify(__toasts)')), same(stateApartFromWrite(app.state(), before), stateApartFromRev(before))]; };
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
    invariant('FA3CB.smart-import', 'Merging into the carried GA row (read after the next load; same-session recompute is FA7C.smart-import): same amount, paid → nothing; £120 → amended; a future date (upcoming) → reversed; linked to the ISA → not merged (row, carry and ISA unchanged); an import added as its own row is a new dated occurrence beside the carry. Never dated, never a second carry',
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
    invariant('FA3CB.backup', 'A resolution written by a production action survives save, reload, export and restore; repeating the same edit appends nothing; reloads never duplicate it; export and build are schema 3 (P2-5); a schema-1 state gains exactly its transition carry on the first load, and later loads and actions only append resolutions',
      [resolutionRows(b), same(env.data.contributionCarry, records), same(back.state().contributionCarry, records), [env.schemaVersion, back.run('GEODE_SCHEMA_VERSION')],
        [carryRows(none.state().contributionCarry).map(c => c[0]), resolutionRows(none)]],
      [[['carry_pm', 'amended', 120]], true, true, [3, 3], [['pm'], [['carry_pm', 'reversed']]]]);

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
 * An annual row completed in August 2025 and seen in September 2026: goal and (since FA-7C) investment rows became
 * their 2026 occurrence in August 2026; the 2025-08 completion stays as history.
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
      [same(withoutRevId(amb.state()), withoutRevId(ambControl.state())), amb.events().length, b2View(amb)], [true, 0, [1000, 1000, 5200]]);

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
    const stiRow = sti.state().payments[0];
    invariant('FA3CB2.inv-goal.stale', 'No longer stale (FA-7C, like the goal mirror below): the annual ISA £200 completed in August 2025 became its upcoming 2026 occurrence in August 2026 (before FA-7C investment rows stayed paid and this relink was refused), so relinking it to Holiday is an ordinary unpaid move, allowed and moving no money — the 2025-08 ISA completion stays ISA history (ISA £5,200), Holiday receives nothing (£1,000, simulated £1,000)',
      [stiTry, b2Active(sti), [stiRow.status, stiRow.goalId, stiRow.investId], b2View(sti)], [[[], false], [['investment:iA', '2025-08', 200]], ['upcoming', 'gH', ''], [1000, 1000, 5200]]);

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
    invariant('FA3CB2.inv-inv.ambiguous', 'Within investments nothing new is refused: the ambiguous paid ISA row moves to the Pension (no event; the undated investment evidence now names the Pension). Rows are not investment authority (FA-7B) and the move is prospective only (FA-7C): the absorbed £200 stays with the ISA opening anchor (ISA £5,200, Pension £3,000), no anchor is rewritten, no history invented; the Pension gains only occurrences completed later (FA7C.relink)',
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
    invariant('FA3CB2.atomic', 'Every refusal is atomic: the form refusals (ambiguous monthly and annual, dateless one-off) and the Smart Import refusal left the whole stored state unchanged, and a refused form save keeps the edit\'s intent ("replace") for the retry (the stale ISA move is no longer refused since FA-7C: FA3CB2.inv-goal.stale)',
      [[ambTry, anTry, odTry].map(t => t[1]), siTry[1], atm.run('window._geodePayLinkedIntent')], [[true, true, true], true, 'replace']);

    const card = { debts: [{ id: 'dC', name: 'Card', balance: 1000, minPayment: 50, apr: 25 }] };
    const bl = b2Ambiguous(null, card), bd = b2Ambiguous(null, card);
    const blTry = attempt(bl, a => a.editPayment('im', { investId: '' })), bdTry = attempt(bd, a => a.editPayment('im', { investId: '', debtId: 'dC' }));
    invariant('FA3CB2.scope', 'Bill and debt destinations keep their FA-3C-B behaviour: the ambiguous paid ISA row can still become a bill or a debt payment. The change is prospective (FA-7C): the row is not investment authority, so the ISA keeps the £200 its opening anchor holds (ISA £5,200 each), nothing reversed or invented',
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
    const candAugust = b2Candidate(isa, 'im');
    isa.advance('2026-09-02', 'reload'); isa.reload();
    invariant('FA3CB3A.fa7-evidence', 'The undated ISA evidence survives the edit: geodeLegacyCarryCandidate gives the same ISA £200 candidate before the rename, after it, and after reload and the refused relink. In September (FA-7C) the row, its £200 held by the ISA opening anchor, becomes upcoming: nothing completed, so no candidate, no event, ISA £5,200 (before FA-7C it stayed completed)',
      [cand0, candSaved, candAugust, b2Candidate(isa, 'im'), isa.state().payments[0].status, isa.events().length, isa.snap().inv.iA], [B2_CANDIDATE, B2_CANDIDATE, B2_CANDIDATE, null, 'upcoming', 0, 5200]);
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
/** Counts store writes other than save()'s (__saving) — the transition's commit and persists. */
const watchWrites = app => app.run('var __writes = 0, __setItem = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY && !__saving) __writes++; return __setItem.call(localStorage, k, v); };');
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
    invariant('FA3CC.transition.version-rule', 'A stored marker counts only as a whole number ≥ 1 (missing, null, text, NaN, Infinity, 0, negative, fractional or boolean → schema 1); the build is schema 3 (P2-5), and a fresh install (nothing stored) keeps the default marker, so it starts at schema 3 and never transitions',
      [values, app.run('GEODE_SCHEMA_VERSION'), sDecl.indexOf('_schemaVersion: GEODE_SCHEMA_VERSION,') >= 0, load.indexOf('if (d) {') < persist && persist < load.indexOf('} catch(e) {}')],
      [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 3], 3, true, true]);

    const g1 = fa3cbFixture('one-off');
    const boot = v => {
      const s = JSON.parse(JSON.stringify(g1[2]));
      if (v !== undefined) s._schemaVersion = v;
      const a = new App(s, g1[3]);
      return [seededRows(a).length, stored(a)._schemaVersion, a.snap().goal.gH, a.warnings.length ? flagged(a) : 'clean'];
    };
    const MOVED = [1, 3, 1250, 'clean'];
    invariant('FA3CC.transition.version-load', 'Stored G1 (paid one-off £250 for Holiday) with the marker missing, "2", 0, −1, 1.5, "x", null or 1 loads as schema 1 and transitions once (completion seeded, stored marker 3 after the P2-5 step, Holiday £1,250); a numeric 2 is already schema 2 — nothing seeded (it only moves to 3), the unowned row is flagged and adds nothing (Holiday £1,000)',
      [undefined, '2', 0, -1, 1.5, 'x', null, 1, 2].map(boot), [MOVED, MOVED, MOVED, MOVED, MOVED, MOVED, MOVED, MOVED, [0, 3, 1000, true]]);

    const tr = extractFunction(src, 'geodeSchema2Transition').text;
    const steps = ['geodeSeedLegacyContributionEvents();', 'geodeSchema2TransitionCarryRecords(S)', 'geodeSchema2AuthorityProblems(S, true)',
      'S._schemaVersion = 2;', 'geodeSchema2CommitTransition()'].map(s => tr.indexOf(s));
    const gateAt = load.indexOf(RELEASE_GATE), syncAt = load.indexOf('syncRecurringPayments();');
    invariant('FA3CC.c4.order', 'The transition seeds dated completions, then carries what rows cannot date, validates, sets the marker and only then writes; load runs it (behind the release gate) before recurring sync resets paid rows — every construct is found before its position is compared',
      [steps.every(i => i >= 0), steps.every((i, n) => !n || steps[n - 1] < i), gateAt >= 0 && syncAt >= 0 && gateAt < syncAt], [true, true, true]);

    const once = new App(FA3CC_MIX, '2026-08-20', undefined, { boot: false });
    watchWrites(once);
    once.run('__reload()');
    const first = [writes(once), stored(once)._schemaVersion, same(stored(once).contributionEvents, once.events()), same(stored(once).contributionCarry, once.state().contributionCarry)];
    const ledger = [once.events(), once.state().contributionCarry, once.run('__uidN')];
    once.reload(); once.reload();
    invariant('FA3CC.c2.one-write', 'The transition persists the whole state in one store write (the seeded completions and the four carries as held in memory), and the P2-5 schema-3 transition in one more (marker 3); two later loads write nothing and change no completion, carry, id or time, and allocate no ids',
      [first, writes(once), same([once.events(), once.state().contributionCarry, once.run('__uidN')], ledger)], [[2, 3, true, true], 0, true]);

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
      return { app, before, look: [transitionFailures(app), toasts(app), app.run('__store') === before, app.state()._schemaVersion, same(withoutRevId(app.state()), withoutRevId(legacy)), app.snap().goal] };
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
    invariant('FA3CC.c2.crash.retry', 'With storage working again the next load (the 21st at 15:00: other ids and creation times) transitions and persists schema 2 at once, then schema 3 (P2-5: a second write); its financial result — display, seeded completions, carries, goal parts and positions — equals an uninterrupted transition (21st at noon)',
      [writes(thrown.app), stored(thrown.app)._schemaVersion, same(financial(thrown.app), financial(clean)), thrown.app.state().contributionCarry[0].createdAt === clean.state().contributionCarry[0].createdAt],
      [2, 3, true, false]);
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
      const finance = s => Object.assign({}, s, { expectationGaps: null, expectationFloorYm: null, _rev: null, monthBaseline: null });
      const evidence = s => [s.expectationFloorYm, s.expectationGaps.map(g => [g.paymentId, g.fromYm, g.toYm]), (s.monthBaseline || {}).kind || null];
      return [committed, same(finance(app.state()), finance(whole.state())), app.snap().goal, evidence(app.state()), evidence(whole.state())];
    };
    invariant('FA3CC.c2.crash.before-sync', 'The app dies after the schema-2 write but before the schema-3 transition, recurring sync and the recompute: reopening the same day or on 2 September (past the carries\' month) gives exactly the financial state of an uninterrupted boot followed by the same reopen; Holiday £1,450, Car £540. Only expectation evidence may differ (P2-5): the interrupted boot reaches schema 3 on reopen, so its floor is that month and it can claim nothing before it; neither records a period here (the monthly row settled August, and rows with no known occurrence record nothing). The September month baseline (P3-4C) has the same figures in both, but the interrupted boot\'s roll replaces the schema-3 transition write of 2 September, so it cannot prove the opening plan: first_observed, where the uninterrupted boot replaces August text: month_open. Neither boot writes a baseline on the 20th (nothing to store)',
      ['2026-08-20', '2026-09-02'].map(interrupted),
      [[true, true, { gH: 1450, gB: 540 }, ['2026-08', [], null], ['2026-08', [], null]], [true, true, { gH: 1450, gB: 540 }, ['2026-09', [], 'first_observed'], ['2026-08', [], 'month_open']]]);

    const broken = JSON.parse(JSON.stringify(fa3cbFixture('one-off')[2]));
    broken._schemaVersion = 2;
    broken.contributionCarry = [CARRY('cinv', 'im', { entityType: 'investment', entityId: 'iA', amount: 200 })];
    const inc = new App(broken, '2026-08-10');
    inc.reload();
    const REPORT = INTEGRITY + 'investment carry cinv; payment p1 counts toward goal gH with no completion or carry';
    invariant('FA3CC.c2.incomplete', 'A stored schema-2 state missing the paid one-off\'s completion and holding an investment carry is reported on every load and repaired by none: nothing seeded, no carry added or dropped, the row adds nothing (Holiday £1,000), the investment carry adds nothing (ISA £5,000), the marker moves only to 3 (P2-5 adds expectation storage and repairs nothing)',
      [inc.warnings.splice(0), inc.events(), same(inc.state().contributionCarry, broken.contributionCarry), inc.snap().goal.gH, inc.snap().inv.iA, stored(inc)._schemaVersion],
      [[REPORT, REPORT], [], true, 1000, 5000, 3]);
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
    invariant('FA3CC.c3.investment', 'Schema-2 paid ISA monthly rows stamped August with no completion — one native-looking, one relinked from a removed investment (the recorder\'s row-evidence path) — are never dated: not by that edit, not by the safety net, not at rollover. Since FA-7B a paid row without a completion is no cash flow (ISA £5,000, the opening anchor; before FA-7B the rows counted, £5,350); since FA-7C such a row is lifecycle only, so both become upcoming once their stamped month (August) has passed — nothing recorded, ISA £5,000 (before FA-7C they stayed completed)',
      invSeen, [[0, ['paid', 'paid'], 5000], [0, ['upcoming', 'upcoming'], 5000], [0, ['upcoming', 'upcoming'], 5000]]);
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
    invariant('FA3CC.c4b.monthly-only', 'Only carried monthly rows reset: by October the carried monthly Holiday and Car rows are upcoming, while the carried annual and negative one-off rows, the dated one-off and the removed-goal row stay completed; all four carries kept, nothing reversed or dated; Holiday £1,350, Car £540. The unstamped ISA row (no carry: its £200 is held by the ISA opening anchor) is lifecycle only since FA-7C and is upcoming too; ISA £5,200, no event',
      [mix.state().payments.map(p => [p.id, p.status, p.lastPaidYM || '']), activeCarryRows(authority(mix).active).length, resolutionRows(mix), mix.events().length, mix.snap().goal, mix.snap().inv.iA],
      [[['p1', 'paid', ''], ['px', 'upcoming', ''], ['pa', 'paid', ''], ['pn', 'paid', ''], ['pb', 'upcoming', ''], ['im', 'upcoming', ''], ['pg', 'paid', '']], 4, [], 1, { gH: 1350, gB: 540 }, 5200]);

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
    invariant('FA3CC.restore.schema-1', 'A schema-1 backup (exported by a fallback load) restores and transitions once per schema: two writes (schema 2, then 3 — P2-5), marker 3, Holiday £1,350 and Car £540, one seeded completion and the four carries; the next load writes nothing and changes nothing',
      [env1.schemaVersion, first1, writes(r1), same([r1.events(), r1.state().contributionCarry], r1Ledger)], [1, [2, 3, { gH: 1350, gB: 540 }, 1, CARRY_MIX_CARRIES], 0, true]);
    const src = new App(CARRY_MIX, '2026-08-20'), env2 = src.backup();
    const r2 = restoreBoot(env2, '2026-08-20');
    invariant('FA3CC.restore.schema-2', 'A current-schema (3) backup restores without migrating: no write, completions and carries identical to the source (ids and times included), Holiday £1,350',
      [env2.schemaVersion, writes(r2), same([r2.events(), r2.state().contributionCarry], [src.events(), src.state().contributionCarry]), r2.snap().goal.gH], [3, 0, true, 1350]);
    const env2b = JSON.parse(JSON.stringify(env2));
    env2b.schemaVersion = 2; env2b.data._schemaVersion = 2; delete env2b.data.expectationGaps; delete env2b.data.expectationFloorYm;
    const r2b = restoreBoot(env2b, '2026-08-20');
    invariant('FA3CC.restore.schema-2-to-3', 'A schema-2 backup (P2-5) restores and moves to schema 3 in one write: marker 3, an empty expectation list and the floor at this month (nothing derived before it), completions and carries identical to the source, Holiday £1,350',
      [writes(r2b), stored(r2b)._schemaVersion, stored(r2b).expectationGaps, stored(r2b).expectationFloorYm, same([r2b.events(), r2b.state().contributionCarry], [src.events(), src.state().contributionCarry]), r2b.snap().goal.gH],
      [1, 3, [], '2026-08', true, 1350]);
    const env3 = JSON.parse(JSON.stringify(env2));
    env3.data = legacyData(env3.data); env3.schemaVersion = 1;
    const r3 = restoreBoot(env3, '2026-08-20');
    invariant('FA3CC.restore.old-backup', 'An old backup without a marker, completions or carries normalises and transitions: two writes (schema 2, then 3), marker 3, the same seeded completion and carries as a live transition, Holiday £1,350',
      [writes(r3), stored(r3)._schemaVersion, seededRows(r3), carryRows(r3.state().contributionCarry), r3.snap().goal.gH], [2, 3, seededRows(src), CARRY_MIX_CARRIES, 1350]);

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
    const gateOrder = text => { const at = ['geodeNoteFinancialBoot(', 'if (!_geodeRuntimeStale) {', 'if (geodeSchema2Active(S)) geodeSchema2IntegrityReport(S);', RELEASE_GATE, SCHEMA3_GATE, INVESTMENT_GATE, 'syncRecurringPayments();'].map(c => text.indexOf(c)); return at.every((p, i) => p >= 0 && (!i || p > at[i - 1])); };
    const transitionCalls = text => text.split('geodeInvestmentAuthorityTransition(').length - 1;
    invariant('REL.fidelity.reload', 'load() and the __reload shim both note the stored schema first, then run the integrity report or the gated schema transition, then the investment transition behind the same shell readiness (P1-REL), only while the page may write and before recurring sync; each calls the investment transition exactly once, and production calls it nowhere else',
      [gateOrder(load), gateOrder(reloadShim), reloadShim.indexOf('geodeNoteFinancialBoot(__store);') >= 0, load.indexOf('geodeNoteFinancialBoot(d);') >= 0,
        transitionCalls(load), transitionCalls(reloadShim), transitionCalls(src) - transitionCalls(extractFunction(src, 'geodeInvestmentAuthorityTransition').text)],
      [true, true, true, true, 1, 1, 1]);
    const first = (t, guard) => { const g = t.indexOf(guard); return g >= 0 && t.slice(t.indexOf('{') + 1, g).replace(/try\s*\{/, '').trim() === ''; };
    const writes = (t, readBack) => {
      const w = t.indexOf('localStorage.setItem(KEY'), seen = t.indexOf('geodeAcceptFinancialWrite(');
      return t.indexOf('geodeFinancialJsonToStore()') >= 0 && w >= 0 && seen > w && t.indexOf(readBack) > w;
    };
    const viaStore = name => { const t = extractFunction(src, name).text; return first(t, "if (!geodeFinancialWriteAllowed()) return 'refused';") &&
      t.indexOf('geodeStoreFinancialState()') > t.indexOf("return 'refused';") && t.indexOf('localStorage.setItem') < 0; };
    const commit = extractFunction(src, 'geodeSchema2CommitTransition').text;
    const wipe = extractFunction(src, 'wipeLocalAppStateAndReload').text;
    invariant('REL.fidelity.writers', 'save() and persistGeodeToLocalStorage() ask geodeFinancialWriteAllowed first, then make their one write through geodeStoreFinancialState (P2-9), which stamps _rev, read-backs its one setItem and only then accepts that text; the transition commit asks the same guard first (as the schema it replaces: 1, or 2 for the P2-5 schema-3 transition) and does the same; production has no other KEY setItem; wipe asks the same guard before removeItem; the save shim asks the guard and writes through the same geodeStoreFinancialState',
      [viaStore('save'), viaStore('persistGeodeToLocalStorage'), writes(extractFunction(src, 'geodeStoreFinancialState').text, 'localStorage.getItem(KEY) === prepared.json'),
        first(commit, 'if (!geodeFinancialWriteAllowed(from === undefined ? 1 : from)) return false;') && writes(commit, 'localStorage.getItem(KEY) !== json'),
        src.split('localStorage.setItem(KEY').length - 1, src.indexOf("setItem('geode_v6'") < 0,
        TEST_SHIMS.indexOf("if (!geodeFinancialWriteAllowed()) return 'refused';") >= 0 && TEST_SHIMS.indexOf('return geodeStoreFinancialState();') >= 0,
        wipe.indexOf('if (!geodeFinancialWriteAllowed()) return;') >= 0 && wipe.indexOf('if (!geodeFinancialWriteAllowed()) return;') < wipe.indexOf('localStorage.removeItem(KEY)')],
      [true, true, true, true, 2, true, true, true]);
    invariant('REL.fidelity.boot', 'Boot loads, then listens for other windows\' changes, then cleans older app caches',
      src.indexOf('\nload();\ngeodeInstallFinancialStorageListener();\ngeodeShellCleanup();\n') >= 0, true);
  });
}

function releaseSafetyBoot() {
  scenario('FA-3 RELEASE BOOT — data newer than this runtime is shown behind the reload gate and never rewritten', () => {
    const app = new App(baseState(), '2026-06-05');
    const versions = JSON.parse(app.run(`JSON.stringify([null, '{bad', 'null', '[]', '"x"', '{}', '{"_schemaVersion":"3"}', '{"_schemaVersion":2.5}', '{"_schemaVersion":1}',
      '{"_schemaVersion":2}', '{"_schemaVersion":3}', '{"_schemaVersion":4}', '{"_schemaVersion":7}'].map(function (raw) {
      var v = geodeStoredSchemaVersion(raw); _geodeRuntimeStale = ''; geodeNoteFinancialBoot(raw);
      return [v !== v ? 'unreadable' : v, _geodeRuntimeStale, _geodeFinancialKeySeen];
    }))`));
    app.run("_geodeRuntimeStale = ''; _geodeFinancialKeySeen = true;");
    invariant('REL.boot.versions', 'Stored KEY: nothing → none; unreadable, JSON null, an array or text → unreadable; a missing, text, fractional or 1 marker → schema 1; 2, 3 and 4 as stored. Only a schema above 3 (P2-5) stops writes at boot; unreadable data is left to load() as before',
      [versions, relWarnings(app)],
      [[[null, '', false], ['unreadable', '', true], ['unreadable', '', true], ['unreadable', '', true], ['unreadable', '', true], [1, '', true], [1, '', true], [1, '', true],
        [1, '', true], [2, '', true], [3, '', true], [4, 'newer', true], [7, 'newer', true]], ['stale:newer', 'stale:newer']]);

    const boot = v => {
      const a = new App(Object.assign(baseState(v > 3 ? { payments: [legacyPay('p1')] } : {}), { _schemaVersion: v }), '2026-06-05', undefined, { boot: false });
      watchWrites(a);
      const raw = rawStore(a);
      a.run('__reload()');
      const booted = [a.run('S._schemaVersion'), a.events().length, staleState(a)];
      relAct(a); a.run('persistGeodeToLocalStorage();'); a.run('geodeSchema2CommitTransition();');
      return [booted, writes(a), rawStore(a) === raw, relWarnings(a)];
    };
    invariant('REL.boot.newer', 'Stored schema 4 or 7: kept as stored in memory (never lowered to 3), no transition or seeding, the "newer version" gate; a form save, a direct persist and a transition commit then write nothing — the stored text is byte-identical',
      [boot(4), boot(7)], [[[4, 0, ['newer', 'newer']], 0, true, ['stale:newer']], [[7, 0, ['newer', 'newer']], 0, true, ['stale:newer']]]);
    invariant('REL.boot.current', 'Stored schema 3: no gate; save persists the reloaded state, and a following persist of that same text does not write it again; the commit, replacing schema 1 only, refuses and stops writes',
      boot(3), [[3, 0, ['', '']], 0, false, ['stale:changed']]);

    const again = new App(Object.assign(baseState(), { _schemaVersion: 4 }), '2026-06-05');
    const raw = rawStore(again);
    again.reload(); again.reload();
    invariant('REL.boot.no-loop', 'Reloading on schema 4 data shows the same gate each time and still writes nothing: the gate never reloads by itself',
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
    invariant('REL.write.save', 'A schema 3 page whose stored data another window changed without telling it (no storage event, e.g. restored from the back/forward cache): a form save refuses schema 4 (newer), schema 1, a missing marker, a text "3" marker and removed data (changed), leaving their data byte-identical',
      [atWrite('schema 4', r => withSchema(r, 4)), atWrite('schema 1', r => withSchema(r, 1)), atWrite('no marker', r => withSchema(r)),
        atWrite('text "3"', r => withSchema(r, '3')), atWrite('removed', () => null)],
      [blocked('schema 4', 'newer'), blocked('schema 1', 'changed'), blocked('no marker', 'changed'), blocked('text "3"', 'changed'), blocked('removed', 'changed')]);
    invariant('REL.write.persist', 'persistGeodeToLocalStorage refuses the same way: schema 4 (newer) and removed data (changed)',
      [atWrite('schema 4', r => withSchema(r, 4), 'persist'), atWrite('removed', () => null, 'persist')], [blocked('schema 4', 'newer'), blocked('removed', 'changed')]);
    invariant('REL.write.unreadable', 'Unreadable stored data keeps the behaviour from before the guard: the save writes this page\'s schema 3 state over it',
      atWrite('unreadable', () => '{bad'), ['unreadable', ['', ''], 'wrote mine', []]);
    const lww = atWrite('same schema', r => JSON.stringify(Object.assign(JSON.parse(r), { income: 4000 })));
    invariant('REL.write.same-schema', 'A same-schema change that keeps this page\'s revision id is an unfenced write (P2-1 compatibility): it is logged — at the action\'s admission (P2-8) and again at its save — and this page\'s save still replaces it. A newer fenced revision is refused separately (P2-1)',
      lww, ['same schema', ['', ''], 'wrote mine', ['? [geode] unfenced financial write observed; this write proceeds', '? [geode] unfenced financial write observed; this write proceeds']]);

    const sticky = schema2App();
    const mine = rawStore(sticky);
    foreignStore(sticky, withSchema(mine, 4)); relAct(sticky);
    foreignStore(sticky, mine); relAct(sticky); sticky.run('persistGeodeToLocalStorage();');
    const held = [staleState(sticky), rawStore(sticky) === mine];
    sticky.run('__reload()'); relAct(sticky);
    invariant('REL.write.sticky', 'Once stopped, the page stays stopped even if storage turns compatible again (no write, same gate); only a reload clears it, after which saves write again',
      [held, staleState(sticky), JSON.parse(rawStore(sticky)).payments.length, relWarnings(sticky)], [[['newer', 'newer'], true], ['', ''], 1, ['stale:newer']]);

    const blind = schema2App();
    foreignStore(blind, withSchema(rawStore(blind), 4)); relAct(blind);
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
    invariant('REL.write.transition', 'A load that read schema 1 commits nothing when storage became schema 4 (newer) or schema 2 (another window already transitioned): stored data byte-identical, memory back on schema 1, gate shown (the transition\'s storage toast sits behind it); unchanged schema 1 still commits',
      [commit(r => withSchema(r, 4)), commit(r => withSchema(r, 2)), commit(r => r).slice(0, 6)],
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
    invariant('REL.listen.stops', 'Storage events on geode_v6 stop writes before any action: schema 4 (newer); schema 1, no marker, text "2", unreadable, removed key, storage cleared (changed)',
      [event('schema 4', 'geode_v6', withSchema(SCHEMA2, 4)), event('schema 1', 'geode_v6', withSchema(SCHEMA2, 1)), event('no marker', 'geode_v6', withSchema(SCHEMA2)),
        event('text "2"', 'geode_v6', withSchema(SCHEMA2, '2')), event('unreadable', 'geode_v6', '{bad'), event('removed', 'geode_v6', null), event('cleared', null, null)],
      [stops('schema 4', 'newer'), stops('schema 1', 'changed'), stops('no marker', 'changed'), stops('text "2"', 'changed'), stops('unreadable', 'changed'),
        stops('removed', 'changed'), stops('cleared', 'changed')]);
    const fencedOther = JSON.parse(SCHEMA2);
    fencedOther.income = 4321;
    fencedOther._rev = { seq: 50, id: 'rev_other_window', by: 'v1.0.77', at: 1 };
    invariant('REL.listen.ignores', 'Other keys and sessionStorage events leave the page writing; an event without storageArea on geode_v6 still counts. Another fenced runtime\'s same-schema text stops this page (P2-1)',
      [event('other key', 'geode_shell', 'v1.0.76'), event('sessionStorage', 'geode_v6', withSchema(SCHEMA2, 4), 'session'), event('fenced same schema', 'geode_v6', JSON.stringify(fencedOther)),
        event('no area', 'geode_v6', withSchema(SCHEMA2, 4), 'none')],
      [['other key', ['', ''], 'wrote', []], ['sessionStorage', ['', ''], 'wrote', []], stops('fenced same schema', 'foreign'), stops('no area', 'newer')]);
    const tabA = schema2App();
    relListen(tabA);
    watchWrites(tabA);
    const tabB = withSchema(rawStore(tabA), 4);
    foreignStore(tabA, tabB); fireStorage(tabA, 'geode_v6', tabB);
    relAct(tabA);
    const writers = [tabA.run('persistGeodeToLocalStorage(); geodeSchema2CommitTransition()'), tabA.run('geodeFinancialWriteAllowed()'), tabA.run('geodeFinancialWriteAllowed(1)')];
    invariant('REL.listen.all-writers', 'Tab A (schema 3) hears tab B store schema 4: a form save, persistGeodeToLocalStorage and the transition commit all refuse (commit false, no store write), tab B\'s data stays byte-identical, one "newer version" gate',
      [writers, writes(tabA), rawStore(tabA) === tabB, staleState(tabA), relWarnings(tabA)], [[false, false, false], 0, true, ['newer', 'newer'], ['stale:newer']]);
    const first = schema2App();
    relListen(first);
    fireStorage(first, 'geode_v6', null); fireStorage(first, 'geode_v6', withSchema(SCHEMA2, 4));
    invariant('REL.listen.first-reason', 'The first reason is kept: removed, then schema 4 → still "changed", one warning, one gate', [staleState(first), relWarnings(first)], [['changed', 'changed'], ['stale:changed']]);
  });
}

function releaseSafetyGate() {
  scenario('FA-3 RELEASE GATE — schema 2 waits until older app caches are gone from this browser', () => {
    const legacyHoliday = legacyLoad(fa3cbFixture('one-off')[2], fa3cbFixture('one-off')[3]).snap().goal.gH;
    const look = app => [app.run('geodeShellReadiness()'), writes(app), storedSchema(app), app.events().length, app.snap().goal.gH, staleState(app), relWarnings(app)];
    const held = ['pending', 0, 1, 0, legacyHoliday, ['', ''], []], moved = r => [r, 2, 3, 1, 1250, ['', ''], []];
    invariant('REL.gate.readiness', 'With a Cache API: no geode_shell or the previous runtime\'s → pending: no transition, schema 1 stays stored, legacy display; this runtime\'s → ready: one commit to schema 2, then one to schema 3 (P2-5). No Cache API → absent: transitions',
      [look(shellApp()), look(shellApp('v1.0.75')), look(shellApp(true)), look(shellApp(undefined, false))], [held, held, moved('ready'), moved('absent')]);

    const app = shellApp();
    relAct(app);
    const pending = [storedSchema(app), stored(app).payments.length, staleState(app)];
    app.run('__otherStorage.setItem(GEODE_SHELL_KEY, BEYND_RUNTIME_VERSION);');
    app.reload();
    const opened = [writes(app), storedSchema(app), app.events().length];
    relAct(app);
    invariant('REL.gate.open', 'While pending the page keeps saving schema 1 (top-up stored); once geode_shell names this runtime the next load transitions once through each schema (two commits), and later saves write schema 3',
      [pending, opened, storedSchema(app), stored(app).payments.length, staleState(app), relWarnings(app)], [[1, 2, ['', '']], [2, 3, 2], 3, 3, ['', ''], []]);
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
    invariant('REL.tabs.event', 'A page still on schema 1 (pending) hears another window commit schema 3: it stops at once with the "updated in another window" gate and its save writes nothing; after reload it runs on schema 3 and saves again',
      [heardOut, heard.run('S._schemaVersion'), storedSchema(heard), staleState(heard), relWarnings(heard)], [[['changed', 'changed'], true], 3, 3, ['', ''], ['stale:changed']]);
    const missed = shellApp();
    foreignStore(missed, theirs); relAct(missed);
    invariant('REL.tabs.missed', 'The same page without the event (suspended or back/forward cache): its next save re-reads storage, refuses and shows the gate',
      [staleState(missed), rawStore(missed) === theirs, relWarnings(missed)], [['changed', 'changed'], true, ['stale:changed']]);
    relAct(ready);
    invariant('REL.tabs.winner', 'The window that transitioned keeps working on schema 3', [staleState(ready), storedSchema(ready), relWarnings(ready)], [['', ''], 3, []]);
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
    invariant('FA7B.safety.all-or-safe', 'A transition whose position would not equal the legacy figure is undone completely (warning; no valuations property; legacy authority £5,500 on schema 3 — the P2-5 transition is independent of it); the next load anchors it at £5,500',
      [abortedLook, fa7bVals(aborted), aborted.snap().inv.iA], [[1, false, 5500, 3], [[5500, '2026-08-10', 'legacy_transition']], 5500]);

    const d1 = FA7B_TRANSITION.filter(f => f[0] === 'I1-prior')[0][2];
    const opened = new App(d1, '2026-07-02', undefined, { boot: false });
    opened.run('var __commits = [], __setItemRaw = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY && !__saving) __commits.push(String(v)); return __setItemRaw.call(localStorage, k, v); };');
    opened.run('__reload()');
    const commits = JSON.parse(opened.run('JSON.stringify(__commits)')).map(c => JSON.parse(c));
    const commit = [commits.length, commits[0]._schemaVersion, commits[0].investments[0].valuations === undefined, commits[0].payments[0].status,
      opened.state().payments[0].status, opened.snap().inv.iA, stored(opened).investments[0].valuations.length, stored(opened).payments[0].status];
    const reopened = new App(d1, '2026-07-03', undefined, { boot: false });
    reopened.run('__store = ' + JSON.stringify(JSON.stringify(commits[0])) + '; __reload()');
    opened.reload(); opened.advance('2026-08-02', 'reload');
    invariant('FA7B.safety.write-model', 'D1 fixture: the transitioning load commits schema 2 once through storage before the lifecycle runs (rows as stored — June paid — and no anchor; the P2-5 schema-3 commit follows it, also before the lifecycle), then memory holds the anchor and the reset row (£5,200) and the whole-state save stores them together. Browser closed right after the commit: reopening from it the next day opens at the same £5,200 with one anchor. Later reloads and the August rollover add no second anchor',
      [commit, reopened.snap().inv.iA, fa7bVals(reopened).length, fa7bVals(opened).length, opened.snap().inv.iA],
      [[2, 2, true, 'paid', 'upcoming', 5200, 1, 'upcoming'], 5200, 1, 1, 5200]);
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
    const sameSession = si.snap().inv.iA;
    fa7bRecompute(si);
    const recomputed = si.snap().inv.iA;
    si.reload();
    invariant('FA7B.effective.smart-import', 'Back-dated import: on 25 June Smart Import records a 5 June £200 and a 22 June £150 transaction: £5,750 at once in the same session (FA-7C: Smart Import recomputes; before it the session showed £5,600 until a recompute) — the 5 June £200 is held by the 20 June observation, the 22 June £150 follows it; a further recompute and a reload agree',
      [imported, sameSession, recomputed, si.snap().inv.iA], [[[200, 'smart_import', '2026-06-05'], [150, 'smart_import', '2026-06-22']], 5750, 5750, 5750]);

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

// ───────────────────────────── FA-7C investment occurrence lifecycle ─────────────────────────────

/** ISA (legacy base £5,000) holding an ambiguous paid monthly £200 row (no lastPaidYM): the legacy figure £5,200. */
const FA7C_AMBIGUOUS = extra => legacyInvState({ balance: 5200 }, Object.assign({ payments: [legacyInvPay('im', { rec: 'yes', date: '2026-06-05' })] }, extra || {}));
/** [row status, lastPaidYM, ISA, events, contribution carries, ISA valuations] */
const fa7cLook = (app, id) => {
  const p = app.state().payments.filter(x => x.id === (id || 'im'))[0];
  return [p ? p.status : 'deleted', p ? p.lastPaidYM || '' : '', app.snap().inv.iA, app.events().length, (app.state().contributionCarry || []).length, fa7bVals(app).length];
};

function fa7cLifecycle() {
  MODES.forEach(mode => scenario('FA-7C AMBIGUOUS ROW — absorbed by the opening anchor, lifecycle only, month boundary [' + mode + ']', () => {
    const app = new App(FA7C_AMBIGUOUS(), '2026-08-10');
    const seen = [fa7cLook(app)];
    app.reload(); seen.push(fa7cLook(app));
    clockAt(app, '2026-08-31', 23, 50);
    if (mode === 'reload') app.reload(); else app.render();
    seen.push(fa7cLook(app));
    clockAt(app, '2026-09-01', 0, 10);
    if (mode === 'reload') app.reload(); else app.render();
    seen.push(fa7cLook(app));
    const dueSep = app.state().payments[0].date;
    app.advance('2026-09-10', mode);
    app.toggle('im');
    const completed = [fa7cLook(app), app.activeEvents().map(e => [e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount, e.source])];
    app.reload();
    const PAID = ['paid', '', 5200, 0, 0, 1], UP = ['upcoming', '', 5200, 0, 0, 1];
    invariant('FA7C.ambiguous.monthly', 'A/B/C: the ambiguous paid ISA row (its £200 held by the opening anchor, £5,200) stays completed through the transition month — loads and renders on the 10th and at 23:50 on 31 August — and is upcoming at 00:10 on 1 September (due ' + dueSep + '), with no lastPaidYM, no completion and no carry invented and ISA still £5,200; completing September records a dated 2026-09 £200 completion: £5,400, also after reload',
      [seen, dueSep, completed, app.snap().inv.iA],
      [[PAID, PAID, PAID, UP], '2026-09-05', [['paid', '2026-09', 5400, 1, 0, 1], [['investment:iA', '2026-09', 200, 'mark_completed']]], 5400]);
  }));

  scenario('FA-7C AMBIGUOUS ROW — year boundary', () => {
    const app = new App(FA7C_AMBIGUOUS(), '2026-12-15');
    const dec = fa7cLook(app);
    clockAt(app, '2026-12-31', 23, 50); app.reload();
    const nye = fa7cLook(app);
    clockAt(app, '2027-01-01', 0, 10); app.reload();
    invariant('FA7C.ambiguous.year', 'Q: transitioned on 15 December 2026, the absorbed row stays completed through 23:50 on 31 December and is upcoming at 00:10 on 1 January 2027 (due ' + app.state().payments[0].date + '); ISA £5,200 throughout, nothing recorded',
      [dec, nye, fa7cLook(app), app.state().payments[0].date], [['paid', '', 5200, 0, 0, 1], ['paid', '', 5200, 0, 0, 1], ['upcoming', '', 5200, 0, 0, 1], '2027-01-05']);
  });

  scenario('FA-7C AMBIGUOUS ROW — no anchor, no reset; delete keeps the anchor value', () => {
    const legacy = legacyLoad(FA7C_AMBIGUOUS(), '2026-08-10');
    legacy.advance('2026-10-05', 'reload');
    invariant('FA7C.ambiguous.no-anchor', 'Where the investment has no valid valuation (schema-1 fallback: legacy authority, the row is the value) the ambiguous row keeps its paid state through October: ISA £5,200, no valuation',
      [fa7cLook(legacy)], [['paid', '', 5200, 0, 0, 0]]);

    const delPaid = new App(FA7C_AMBIGUOUS(), '2026-08-10');
    delPaid.del('im');
    const afterPaid = [fa7cLook(delPaid), delPaid.snap().inv.iA];
    delPaid.reload();
    const delLater = new App(FA7C_AMBIGUOUS(), '2026-08-10');
    delLater.advance('2026-09-05', 'reload'); delLater.del('im'); delLater.reload();
    invariant('FA7C.ambiguous.delete', 'D: deleting the absorbed template while completed (August) or after its reset (September) removes the row only — no reversal for evidence that never existed, no event, the opening anchor untouched: ISA £5,200, also after reload',
      [afterPaid, fa7cLook(delPaid), fa7bVals(delPaid), fa7cLook(delLater)],
      [[['deleted', '', 5200, 0, 0, 1], 5200], ['deleted', '', 5200, 0, 0, 1], [[5200, '2026-08-10', 'legacy_transition']], ['deleted', '', 5200, 0, 0, 1]]);
  });

  scenario('FA-7C AMBIGUOUS ROW — relink is prospective', () => {
    const app = new App(FA7C_AMBIGUOUS({ investments: [Object.assign(ISA(), { balance: 5200 }), PENSION()] }), '2026-08-10');
    app.editPayment('im', { investId: 'iB' });
    const moved = [app.snap().inv.iA, app.snap().inv.iB, app.events().length, fa7bVals(app, 'iA'), fa7bVals(app, 'iB'), app.state().payments[0].status];
    app.advance('2026-09-05', 'reload');
    const reset = [app.state().payments[0].status, app.snap().inv.iA, app.snap().inv.iB];
    app.at('2026-09-10'); app.toggle('im'); app.reload();
    invariant('FA7C.relink', 'E/F: the absorbed ambiguous row moved ISA → Pension in August moves no history: ISA keeps £5,200 (its anchor), Pension £3,000, no event, both anchors unchanged; the row resets in September; its September completion is a Pension occurrence: Pension £3,200, ISA £5,200',
      [moved, reset, app.activeEvents().map(e => [e.entityType + ':' + e.entityId, e.occurrenceYm, e.amount]), app.snap().inv.iA, app.snap().inv.iB],
      [[5200, 3000, 0, [[5200, '2026-08-10', 'legacy_transition']], [[3000, '2026-08-10', 'legacy_transition']], 'paid'], ['upcoming', 5200, 3000],
        [['investment:iB', '2026-09', 200]], 5200, 3200]);
  });
}

function fa7cAnnual() {
  MODES.forEach(mode => scenario('FA-7C J7 — annual ISA £250 in 2026, template £300, 2027 occurrence £300 [' + mode + ']', () => {
    const app = freshApp();
    const id = app.contribute({ name: 'ISA annual', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    const ev = () => app.activeEvents().map(e => [e.occurrenceYm, e.amount, e.recurrence]);
    const row = () => { const p = app.state().payments.filter(x => x.id === id)[0]; return [p.status, p.amount, p.date, p.lastPaidYM || '']; };
    const seq = [[app.snap().inv.iA, ev(), row()]];
    app.editPayment(id, { amount: 300 }); seq.push([app.snap().inv.iA, ev(), row()]);
    app.advance('2026-12-02', mode); seq.push([app.snap().inv.iA, ev(), row()]);
    app.advance('2027-06-01', mode); seq.push([app.snap().inv.iA, ev(), row()]);
    app.at('2027-06-10'); app.toggle(id); seq.push([app.snap().inv.iA, ev(), row()]);
    app.reload(); seq.push([app.snap().inv.iA, ev(), row()]);
    const y26 = ['2026-06', 250, 'annual'], y27 = ['2027-06', 300, 'annual'];
    invariant('FA7C.J7', 'J7 / G-J: anchor £5,000 → 2026 completion £250: £5,250, row advanced to June 2027 → template edited to £300: £5,250, the 2026 completion keeps £250 → December: still completed → June 2027: the upcoming 2027 occurrence at £300, ISA £5,250, the 2026 £250 still active → completing 2027 records £300: £5,550, row advanced to June 2028 → reload £5,550. No reversal: entering 2027 never undoes 2026',
      [seq, app.events().filter(e => e.eventType === 'reversal').length],
      [[[5250, [y26], ['paid', 250, '2027-06-10', '2026-06']], [5250, [y26], ['paid', 300, '2027-06-10', '2026-06']], [5250, [y26], ['paid', 300, '2027-06-10', '2026-06']],
        [5250, [y26], ['upcoming', 300, '2027-06-10', '']], [5550, [y26, y27], ['paid', 300, '2028-06-10', '2027-06']], [5550, [y26, y27], ['paid', 300, '2028-06-10', '2027-06']]], 0]);
  }));

  scenario('FA-7C ANNUAL — an investment without a valuation keeps the annual exclusion', () => {
    const app = legacyLoad(baseState(), '2026-06-05');
    const id = app.contribute({ name: 'ISA annual', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id);
    app.advance('2027-06-01', 'reload');
    const p = app.state().payments[0];
    const bad = legacyLoad(baseState({ investments: [Object.assign(ISA(), { valuations: [{ id: 'vbad', value: 'x', date: '2026-06-05', source: 'manual', recordedAt: 1 }] })] }), '2026-06-05');
    const badId = bad.contribute({ name: 'ISA annual', amount: 250, date: '2026-06-10', status: 'upcoming', rec: 'annual', investId: 'iA' });
    bad.at('2026-06-10'); bad.toggle(badId);
    bad.advance('2027-06-01', 'reload');
    const q = bad.state().payments[0];
    invariant('FA7C.annual.no-anchor', 'On the schema-1 fallback with no valid valuation — none, or only an invalid one (legacy authority: the paid row is the value) — the annual ISA row is not reset in June 2027: still paid for 2026-06, ISA £5,250',
      [[p.status, p.lastPaidYM], app.snap().inv.iA, fa7bVals(app).length, [q.status, q.lastPaidYM], bad.snap().inv.iA], [['paid', '2026-06'], 5250, 0, ['paid', '2026-06'], 5250]);
  });
}

function fa7cSmartImport() {
  scenario('FA-7C SMART IMPORT — same-session recompute', () => {
    const app = freshApp();
    app.at('2026-06-20');
    app.smartImport([{ name: 'Holiday top-up', amount: 100, date: '2026-06-18', link: 'goal:gH' }, { name: 'ISA top-up', amount: 200, date: '2026-06-18', link: 'invest:iA' }]);
    const session = [app.snap().goal.gH, app.snap().inv.iA];
    fa7bRecompute(app);
    const again = [app.snap().goal.gH, app.snap().inv.iA];
    app.reload();
    invariant('FA7C.smart-import', 'K/L/P: importing a Holiday £100 and an ISA £200 transaction (18 June) shows Holiday £1,100 and ISA £5,200 at once in the same session (before FA-7C both stayed stale until a recompute or reload); a further recompute and a reload agree',
      [session, again, [app.snap().goal.gH, app.snap().inv.iA]], [[1100, 5200], [1100, 5200], [1100, 5200]]);

    const goalOnly = freshApp();
    goalOnly.at('2026-06-20');
    goalOnly.smartImport([{ name: 'Holiday top-up', amount: 100, date: '2026-06-18', link: 'goal:gH' }]);
    invariant('FA7C.smart-import.goal-only', 'A goal-only import moves the goal, never investment authority: Holiday £1,100, ISA £5,000 (its anchor, no flow)',
      [goalOnly.snap().goal.gH, fa7bLook(goalOnly)], [1100, [5000, 5000, 5000, 5000, 'legacy_transition', 0, 0, false]]);

    const ordered = freshApp();
    ordered.at('2026-06-20'); ordered.saveInvestment('iA', 'ISA', 5600);
    ordered.at('2026-06-25');
    ordered.smartImport([{ name: 'ISA early June', amount: 200, date: '2026-06-05', link: 'invest:iA' }]);
    const backDated = ordered.snap().inv.iA;
    ordered.smartImport([{ name: 'ISA 22 June', amount: 150, date: '2026-06-22', link: 'invest:iA' }]);
    invariant('FA7C.smart-import.order', 'M/N: after a £5,600 observation on 20 June, a back-dated 5 June £200 import stays held by it in the same session (£5,600); a 22 June £150 import follows it at once (£5,750)',
      [backDated, ordered.snap().inv.iA], [5600, 5750]);

    const merge = freshApp(a => a.contribute({ name: 'ISA monthly', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'yes', investId: 'iA' }));
    const row = merge.state().payments[0].id;
    merge.at('2026-06-20');
    const item = { name: 'ISA monthly', amount: 200, date: '2026-06-15', link: 'invest:iA', mergeId: row };
    merge.smartImport([item]);
    const first = [merge.snap().inv.iA, merge.activeEvents().length];
    merge.smartImport([item]);
    merge.reload();
    invariant('FA7C.smart-import.merge', 'O: merging a £200 import into the ISA row completes it once (£5,200, one completion, same session); importing the same transaction into it again records nothing more: £5,200, one completion, also after reload',
      [first, merge.snap().inv.iA, merge.activeEvents().length], [[5200, 1], 5200, 1]);
  });
}

// ───────────────────────────── FA-7D linked-goal investment authority ─────────────────────────────

/** Holiday (target £10,000, its own Saved £1,000) and the ISA (opening anchor £5,000) on 5 June. */
const fa7dApp = (extra, program) => new App(baseState(Object.assign({ goals: [Object.assign(HOLIDAY(), { amount: 10000 })] }, extra || {})), '2026-06-05', program);
/** [Holiday shown, Holiday's own cache, baseSaved, contribution events, releases, ISA valuations, ISA shown] */
const fa7dLook = app => {
  const g = app.state().goals.filter(x => x.id === 'gH')[0];
  return [app.snap().goal.gH, g.saved, g.baseSaved, app.events().length, (app.state().savingsReleases || []).length, fa7bVals(app).length, app.snap().inv.iA];
};
/** Links (goalId) or unlinks ('') the ISA through its edit form. */
const fa7dLink = (app, goalId) => app.editInvestment('iA', { xgoalid: goalId });
const REFUSED_LINKED_GOAL = 'This goal is linked to an investment, so contributions to it are recorded against the investment. Link this contribution to the investment instead.';

function fa7dLinkedGoals() {
  MODES.forEach(mode => scenario('FA-7D J10 — the linked goal follows the investment, £0 included; unlink and relink [' + mode + ']', () => {
    const app = fa7dApp();
    const seq = [fa7dLook(app)];
    app.at('2026-06-06'); fa7dLink(app, 'gH'); seq.push(fa7dLook(app));
    app.advance('2026-06-10', mode); app.saveInvestment('iA', 'ISA', 4500); seq.push(fa7dLook(app));
    app.advance('2026-07-01', mode); app.saveInvestment('iA', 'ISA', 0); seq.push(fa7dLook(app));
    app.advance('2026-07-15', mode); app.saveInvestment('iA', 'ISA', 3000); seq.push(fa7dLook(app));
    app.advance('2026-08-03', mode); fa7dLink(app, ''); seq.push(fa7dLook(app));
    app.advance('2026-08-20', mode); fa7dLink(app, 'gH'); seq.push(fa7dLook(app));
    app.reload(); seq.push(fa7dLook(app));
    const own = [1000, 1000, 0, 0];
    invariant('FA7D.J10', 'J10: Holiday (target £10,000, own Saved £1,000) → linked to the ISA £5,000: shows £5,000 → ISA observed £4,500: £4,500 → £0: £0 (a valid position, not a reason to fall back to £1,000) → £3,000: £3,000 → unlinked: its own schema-2 position £1,000 → relinked: £3,000 → reload £3,000. Linking and unlinking write nothing to the goal (Saved and baseSaved £1,000), record no contribution or release, and add no valuation (only the three observations do)',
      seq, [[1000, ...own, 1, 5000], [5000, ...own, 1, 5000], [4500, ...own, 2, 4500], [0, ...own, 3, 0], [3000, ...own, 4, 3000],
        [1000, ...own, 4, 3000], [3000, ...own, 4, 3000], [3000, ...own, 4, 3000]]);
  }));

  scenario('FA-7D VALIDITY — valid £0 and a negative raw position override goal Saved; no valid authority falls back', () => {
    const zero = fa7dApp({ investments: [Object.assign(ISA(), { goalId: 'gH', balance: 0, baseBalance: 0 })] });
    let reason = '';
    const rel = attempt(zero, a => { reason = a.release('gH', 100).reason; });
    invariant('FA7D.zero.anchor', 'A linked ISA whose opening anchor is £0: Holiday shows £0 (its own £1,000 kept in the cache, unused); a release from the goal is refused (use the investment), nothing changed',
      [fa7dLook(zero), rel[1], reason], [[0, 1000, 1000, 0, 0, 1, 0], true, 'use_linked_investment_row']);

    const neg = new App(legacyInvState({ balance: 200, baseBalance: 0, goalId: 'gH' }, { payments: [legacyInvPay('i1', { date: '2026-06-05' })] }), '2026-06-20');
    neg.at('2026-06-21'); fa7bRelease(neg, 150);
    neg.at('2026-06-22'); neg.toggle('i1');
    const negSession = [neg.snap().goal.gH, fa7bLook(neg)[2], neg.state().goals[0].saved];
    neg.reload();
    invariant('FA7D.negative-raw', 'The FA-7B negative case linked to Holiday: raw ISA position −£150, shown £0 → Holiday shows £0 — never the negative raw value, never its own £1,000 — also after reload',
      [negSession, [neg.snap().goal.gH, fa7bLook(neg)[2], neg.state().goals[0].saved]], [[0, -150, 1000], [0, -150, 1000]]);

    const none = fa7dApp({ investments: [] });
    const broken = fa7dApp({ investments: [{ name: 'Broken', type: 'isa', goalId: 'gH', balance: 5000, baseBalance: 5000 }] });
    const legacyPositive = legacyLoad(baseState({ investments: [Object.assign(ISA(), { goalId: 'gH', balance: 300, baseBalance: 300 })] }), '2026-06-05');
    const legacyZero = legacyLoad(baseState({ investments: [Object.assign(ISA(), { goalId: 'gH', balance: 0, baseBalance: 0 })] }), '2026-06-05');
    invariant('FA7D.fallback', 'Not the same states: no investment carries the link (missing) → Holiday its own £1,000; a linked entry with no id (malformed: not an investment, no anchor) → £1,000, not £0 and not its £5,000; schema-1 fallback with no valuation keeps the legacy rule — linked £300 → £300, linked £0 → its own £1,000',
      [none.snap().goal.gH, broken.snap().goal.gH, legacyPositive.snap().goal.gH, legacyZero.snap().goal.gH], [1000, 1000, 300, 1000]);
  });

  scenario('FA-7D ROUTING — a contribution toward a linked goal has one destination: the investment', () => {
    const app = fa7dApp();
    app.at('2026-06-06'); fa7dLink(app, 'gH');
    const prefill = { name: 'Contribute to Holiday', date: '2026-06-10', status: 'upcoming', rec: true, goalId: 'gH', _geodePayIntent: 'new' };
    const form = app.modalForm(null, prefill);
    app.at('2026-06-10');
    const id = app.contribute({ name: form.name, amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'no', goalId: form.goalId, investId: form.investId });
    app.toggle(id);
    const done = [fa7dLook(app), app.activeEvents().map(e => [e.entityType + ':' + e.entityId, e.amount])];
    const direct = attempt(app, a => a.contribute({ name: 'Holiday top-up', amount: 100, date: '2026-06-12', status: 'upcoming', rec: 'no', goalId: 'gH' }));
    const bill = app.contribute({ name: 'Gift', amount: 50, date: '2026-06-14', status: 'upcoming', rec: 'no' });
    const moved = attempt(app, a => a.editPayment(bill, { goalId: 'gH' }));
    app.at('2026-06-20'); fa7dLink(app, '');
    const unlinked = fa7dLook(app);
    app.reload();
    invariant('FA7D.routing', '"Contribute to this goal" on the linked Holiday opens the form on the ISA ([goal, investment] link); saved and completed it is one ISA completion of £200: ISA £5,200, Holiday shows £5,200, its own Saved stays £1,000. A payment saved straight to the linked goal, or a bill moved onto it, is refused with nothing changed. Unlinking shows Holiday £1,000 beside the ISA £5,200 — the £200 counted once, nowhere hidden — also after reload',
      [[form.goalId, form.investId], done, direct, moved, unlinked, fa7dLook(app)],
      [['', 'iA'], [[5200, 1000, 1000, 1, 0, 1, 5200], [['investment:iA', 200]]], [[REFUSED_LINKED_GOAL], true], [[REFUSED_LINKED_GOAL], true],
        [1000, 1000, 1000, 1, 0, 1, 5200], [1000, 1000, 1000, 1, 0, 1, 5200]]);

    const form2 = fa7dApp().modalForm(null, prefill);
    const two = fa7dApp({ investments: [Object.assign(ISA(), { goalId: 'gH' }), Object.assign(PENSION(), { goalId: 'gH' })] });
    invariant('FA7D.routing.form', 'Unlinked, the goal prefill stays on the goal; linked to two investments it stays on the goal too (no guess) and saving it there is refused',
      [[form2.goalId, form2.investId], [two.modalForm(null, prefill).goalId, two.snap().goal.gH],
        attempt(two, a => a.contribute({ name: 'Holiday top-up', amount: 100, date: '2026-06-12', status: 'upcoming', rec: 'no', goalId: 'gH' }))],
      [['gH', ''], ['gH', 8000], [[REFUSED_LINKED_GOAL], true]]);

    const kept = fa7dApp();
    const row = kept.contribute({ name: 'Holiday monthly', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    kept.at('2026-06-06'); fa7dLink(kept, 'gH');
    kept.at('2026-06-15'); kept.editPayment(row, { amount: 120 }); kept.toggle(row);
    const keptLinked = [fa7dLook(kept), kept.activeEvents().map(e => [e.entityType + ':' + e.entityId, e.amount])];
    kept.at('2026-06-20'); fa7dLink(kept, '');
    invariant('FA7D.routing.existing-row', 'Boundary: a Holiday row from before the link keeps its link and can still be edited; completing it is one goal completion (£120) in Holiday\'s own Saved (£1,120) while Holiday shows the ISA £5,000; after unlinking Holiday shows £1,120 and the ISA £5,000 — counted once, never moved',
      [keptLinked, fa7dLook(kept)], [[[5000, 1120, 1000, 1, 0, 1, 5000], [['goal:gH', 120]]], [1120, 1120, 1000, 1, 0, 1, 5000]]);
  });

  scenario('FA-7D SMART IMPORT — an import linked to a linked goal is left out; linked to the investment it counts once', () => {
    const app = fa7dApp();
    app.at('2026-06-06'); fa7dLink(app, 'gH');
    app.at('2026-06-20');
    const before = app.state();
    const sum = app.smartImport([{ name: 'Holiday savings', amount: 80, date: '2026-06-18', link: 'goal:gH' }]);
    const left = [sum.refusedLinkedGoal, sum.added, same([app.state().payments, app.events()], [before.payments, before.contributionEvents]), app.snap().goal.gH];
    const ok = app.smartImport([{ name: 'ISA savings', amount: 80, date: '2026-06-18', link: 'invest:iA' }]);
    const line = n => app.run('geodeSmartImportRefusedLinkedGoalLine(' + n + ')');
    const modal = extractFunction(PROGRAM.src, 'geodeSmartImportShowHandoffModal').text;
    invariant('FA7D.smart-import', 'Linked to the linked Holiday: refused and reported (1 left out, nothing added, no row or completion, Holiday £5,000); linked to the ISA: one completion, ISA and Holiday £5,080 at once; the summary renders the line, plain words for 0, 1 and 2',
      [left, [ok.refusedLinkedGoal, ok.added, app.snap().inv.iA, app.snap().goal.gH, app.events().length],
        modal.indexOf('geodeSmartImportRefusedLinkedGoalLine(sum.refusedLinkedGoal)') >= 0, [line(0), line(1), line(2)]],
      [[1, 0, true, 5000], [0, 1, 5080, 5080, 1], true,
        ['', '1 imported payment was linked to a goal that follows its linked investment, so it was left out. Import it linked to the investment instead.',
          '2 imported payments were linked to goals that follow their linked investments, so they were left out. Import them linked to the investments instead.']]);
  });

  scenario('FA-7D READERS — decision and export readers use the effective goal value', () => {
    const EMERGENCY = { id: 'gE', name: 'Emergency fund', amount: 3000, saved: 600, baseSaved: 600, monthly: 0, cat: 'emergency' };
    const BUF = { label: 'Build your emergency fund', amount: 120 };
    const suggest = inv => {
      const app = new App(baseState({ incomeExplicitlySet: true, goals: [HOLIDAY(), EMERGENCY], investments: inv }), '2026-06-05', PROGRAM.plan);
      app.setPlan([BUF]);
      return [app.snap().goal.gE, app.suggestions().map(s => s.type)];
    };
    invariant('FA7D.readers.buffer', 'Suggested Actions sizes the buffer step from the effective buffer: unlinked, its own £600 (≥ £500) → no buffer action; linked to an ISA at £5,000 → none; linked to an ISA at £0 → shows £0 and offers the buffer action (it read the hidden £600 before)',
      [suggest([ISA()]), suggest([Object.assign(ISA(), { goalId: 'gE' })]), suggest([Object.assign(ISA(), { goalId: 'gE', balance: 0, baseBalance: 0 })])],
      [[600, []], [5000, []], [0, ['buffer_contribution']]]);
    const csv = extractFunction(PROGRAM.src, 'exportCSV').text;
    invariant('FA7D.readers.export', 'The CSV export lists each goal\'s effective Saved, as its Goals Saved summary already did (not the goal\'s own cache)',
      [csv.indexOf("lines.push(g.name+','+g.amount+','+geodeGoalEffectiveSaved(g)+','") >= 0, csv.indexOf("g.saved+','") < 0], [true, true]);
  });

  scenario('FA-7D PRESENTATION — an estimated value is labelled; an observed one is not', () => {
    const app = fa7dApp();
    app.at('2026-06-06'); fa7dLink(app, 'gH');
    const flags = () => JSON.parse(app.run('JSON.stringify([geodeInvestmentValueEstimated(S, S.investments[0]), geodeGoalLinkedInvestmentAuthorityForState(S, S.goals[0]).estimated])'));
    const seen = [flags()];
    app.at('2026-06-08'); app.saveInvestment('iA', 'ISA', 5100); seen.push(flags());
    const id = app.contribute({ name: 'ISA top-up', amount: 200, date: '2026-06-10', status: 'upcoming', rec: 'no', investId: 'iA' });
    app.at('2026-06-10'); app.toggle(id); seen.push(flags());
    app.at('2026-06-12'); app.saveInvestment('iA', 'ISA', 5400); seen.push(flags());
    const src = PROGRAM.src;
    invariant('FA7D.presentation', '[investment estimated, linked goal estimated]: opening anchor → observed; £5,100 entered → observed; a £200 completion since → estimated (£5,300 is not a new observation); £5,400 entered → observed. The investment card labels only an estimated value "Estimated value", the linked goal line adds "(estimated)", and no copy still claims linked authority needs a balance above £0',
      [seen, src.indexOf("(geodeInvestmentValueEstimated(S, e) ? '<div") >= 0 && src.indexOf('>Estimated value</div>') >= 0,
        src.indexOf("(_linkedEstimated ? ' (estimated)' : '')") >= 0, src.indexOf('balance &gt; 0') < 0],
      [[[false, false], [false, false], [true, true], [false, false]], true, true, true]);
  });
}

// ───────────────────────────── P1-CLOSE: one modal commit, one effect ─────────────────────────────

/** The payment form as savePay reads it. */
const p1PayForm = o => ({ pn: o.name, pa: String(o.amount), pd: o.date, ps: o.status, prec: o.rec || 'no', pglid: o.goalId || '',
  pinvlid: o.investId || '', pdebtlid: o.debtId || '' });
/** A modal as openModal builds it, holding this form (and the intent openPayModal sets); its enter animation has run. */
const p1Open = (app, fields, intent) => app.run('__fields = ' + JSON.stringify(fields) + '; __toasts = [];' +
  (intent ? ' window._geodePayLinkedIntent = ' + JSON.stringify(intent) + ';' : '') + ' openModal(""); __runTimers();');
/** The open modal's commit state; null once it has left the page. */
const p1Modal = app => JSON.parse(app.run('JSON.stringify(__modal ? { closing: __modal.classList.contains("mo-bg--closing"), commit: __modal.getAttribute("data-geode-commit") } : null)'));
const p1Toasts = app => JSON.parse(app.run('JSON.stringify(__toasts)'));
/** Presses the modal's commit this many times before its 165 ms removal runs (a double-click, or a repeated call), then lets time pass; returns the modal's state after the presses. */
const p1Press = (app, code, presses) => {
  for (let i = 0; i < presses; i++) app.run(code);
  const modal = p1Modal(app);
  app.run('__runTimers()');
  return modal;
};
const P1_OPEN = { closing: false, commit: null };
const P1_CLOSING = { closing: true, commit: '1' };
/**
 * One commit pressed once and pressed twice, each in a fresh app: what look sees after one press, after two (same session)
 * and after two then reload — one user action, so one effect in all three — and the modal after the second press.
 */
function p1Double(state, open, code, look) {
  const once = new App(state, '2026-06-10', PROGRAM.commit);
  open(once); p1Press(once, code, 1);
  const twice = new App(state, '2026-06-10', PROGRAM.commit);
  open(twice);
  const modal = p1Press(twice, code, 2);
  const session = look(twice);
  twice.reload();
  return [look(once), session, look(twice), modal];
}
const p1Thrice = v => [v, v, v, P1_CLOSING];
/** [payment rows, active contribution completions, Holiday shown, ISA shown, Monthly Left]. */
const p1Money = app => { const s = app.snap(); return [app.state().payments.length, app.activeEvents().length, s.goal.gH, s.inv.iA, s.left]; };
const p1PayOpen = (fields, intent) => app => p1Open(app, fields, intent || 'new');
const P1_GOAL_50 = p1PayForm({ name: 'Holiday top-up', amount: 50, date: '2026-06-10', status: 'paid', goalId: 'gH' });

function p1Close() {
  scenario('P1-CLOSE PAYMENTS — one payment form saved twice before it closes is one payment', () => {
    invariant('P1.pay.goal', 'A: £50 paid to Holiday (£1,000), Save pressed twice → one row, one completion, Holiday £1,050, Monthly Left £2,950 — as one press, also after reload; the modal is closing with its commit taken',
      p1Double(baseState(), p1PayOpen(P1_GOAL_50), 'savePay("")', p1Money), p1Thrice([1, 1, 1050, 5000, 2950]));
    invariant('P1.pay.invest', 'B: £50 paid to the ISA (£5,000) twice → one completion, ISA £5,050 once, its valuations untouched (the opening anchor only)',
      p1Double(baseState(), p1PayOpen(p1PayForm({ name: 'ISA top-up', amount: 50, date: '2026-06-10', status: 'paid', investId: 'iA' })), 'savePay("")',
        app => p1Money(app).concat([app.state().investments[0].valuations.map(v => v.source)])),
      p1Thrice([1, 1, 1000, 5050, 2950, ['legacy_transition']]));
    invariant('P1.pay.bill-paid', 'C: a £30 monthly bill saved paid twice → one row, Monthly Left £2,970',
      p1Double(baseState(), p1PayOpen(p1PayForm({ name: 'Gym', amount: 30, date: '2026-06-10', status: 'paid', rec: 'yes' })), 'savePay("")', p1Money),
      p1Thrice([1, 0, 1000, 5000, 2970]));
    invariant('P1.pay.bill-upcoming', 'D: an £80 upcoming one-off bill saved twice → one row, Monthly Left £2,920',
      p1Double(baseState(), p1PayOpen(p1PayForm({ name: 'Vet', amount: 80, date: '2026-06-20', status: 'upcoming' })), 'savePay("")', p1Money),
      p1Thrice([1, 0, 1000, 5000, 2920]));
    const card = baseState({ debts: [{ id: 'd1', name: 'Card', balance: 1000, minp: 50, apr: 20 }] });
    invariant('P1.pay.debt', 'E: £100 paid to the card (£1,000) twice → one row, one debt payment event, Monthly Left £2,900; the debt balance stays the £1,000 the user entered',
      p1Double(card, p1PayOpen(p1PayForm({ name: 'Card payment', amount: 100, date: '2026-06-10', status: 'paid', debtId: 'd1' })), 'savePay("")',
        app => { const s = app.state(); return [s.payments.length, s.debtPaymentEvents.length, s.debts[0].balance, app.snap().left]; }),
      p1Thrice([1, 1, 1000, 2900]));
  });

  scenario('P1-CLOSE ENTITIES — release, goal, investment, expense, debt and income forms commit once', () => {
    invariant('P1.release', 'F: £200 released from Holiday (£1,000), Confirm pressed twice → one release, Holiday £800 (not £600), also after reload',
      p1Double(baseState(), app => p1Open(app, { 'geode-sr-source': 'goal:gH', 'geode-sr-amount': '200', 'geode-sr-reason': 'emergency', 'geode-sr-note': '' }),
        'geodeConfirmSavingsRelease()', app => [app.state().savingsReleases.length, app.snap().goal.gH, app.snap().left]),
      p1Thrice([1, 800, 3000]));
    const named = (app, list, name) => app.state()[list].filter(x => x.name === name);
    invariant('P1.goal.create', 'G: a new goal Car with Saved So Far £1,500 saved twice → one goal, its opening £1,500 once (baseSaved, no contribution event), one activity entry',
      p1Double(baseState(), app => p1Open(app, { gn: 'Car', ga: '5000', gs: '1500', gm: '0', gd: '', gc: 'other' }), 'saveGoal("")',
        app => { const car = named(app, 'goals', 'Car'); return [car.length, car.map(g => app.snap().goal[g.id]), app.events().length, app.state().activityLog.filter(e => e.type === 'goal').length]; }),
      p1Thrice([1, [1500], 0, 1]));
    invariant('P1.investment.create', 'H: a new investment GIA at £3,000 saved twice → one investment, one manual_create valuation, £3,000 once',
      p1Double(baseState(), app => p1Open(app, { xn: 'GIA', xb: '3000', xtype: 'isa', xr: '0', xp: '', xo: '', xpurpose: '', xhorizon: '', xcs: '', xgoalid: '' }), 'saveInv("")',
        app => { const gia = named(app, 'investments', 'GIA'); return [gia.length, gia.map(v => app.snap().inv[v.id]), gia.map(v => v.valuations.map(x => [x.source, x.value]))]; }),
      p1Thrice([1, [3000], [[['manual_create', 3000]]]]));
    invariant('P1.expense', 'I: a £40 monthly expense saved twice → one expense, Monthly Left £2,960',
      p1Double(baseState(), app => p1Open(app, { en: 'Gym', ea: '40', ed: '2026-06-10', ecat: 'other', er: 'yes' }), 'saveExp("")',
        app => [app.state().expenses.length, app.snap().left]),
      p1Thrice([1, 2960]));
    invariant('P1.debt.create', 'A new £1,200 debt saved twice → one debt at £1,200, one activity entry',
      p1Double(baseState(), app => p1Open(app, { dn: 'Card', db: '1200', dapr: '20', dmp: '50', dinttype: 'fixed', dcat: 'other' }), 'saveDebt("")',
        app => [app.state().debts.map(d => d.balance), app.state().activityLog.filter(e => e.type === 'debt').length]),
      p1Thrice([[1200], 1]));
    invariant('P1.income', 'Income £3,500 saved twice → income £3,500, one activity entry, Monthly Left £3,500',
      p1Double(baseState(), app => p1Open(app, { mi: '3500' }), 'saveInc()',
        app => [app.state().income, app.state().activityLog.filter(e => e.type === 'income').length, app.snap().left]),
      p1Thrice([3500, 1, 3500]));
  });

  scenario('P1-CLOSE SMART IMPORT AND DUPLICATE PROMPTS — one confirmation imports or resolves once', () => {
    const importOpen = app => {
      p1Open(app, { 'gim-inc-0': true, 'gim-type-0': 'payment', 'gim-name-0': 'Holiday savings', 'gim-amt-0': '75', 'gim-date-0': '2026-06-05',
        'gim-link-0': 'goal:gH', 'gim-merge-0': 'add', 'gim-inc-1': true, 'gim-type-1': 'expense', 'gim-name-1': 'Coffee', 'gim-amt-1': '12',
        'gim-date-1': '2026-06-05', 'gim-cat-1': 'food', 'gim-rec-1': false, 'gim-merge-1': 'add' });
      app.run('__handoff = null; window._geodeSmartImportN = 2; window._geodeSmartImportRows = [{}, {}];');
    };
    invariant('P1.smart-import', 'J: a statement with a £75 Holiday payment (5 June, so completed) and a £12 coffee, "Add to Beynd" pressed twice → one row, one expense, one completion, Holiday £1,075 at once, Monthly Left £2,913',
      p1Double(baseState(), importOpen, 'geodeSmartImportConfirm()',
        app => [app.state().payments.length, app.state().expenses.length, app.activeEvents().length, app.snap().goal.gH, app.snap().left]),
      p1Thrice([1, 1, 1, 1075, 2913]));
    const gymExpense = baseState({ expenses: [{ id: 'e1', name: 'Gym', amount: 30, cat: 'other', date: '2026-06-01', rec: 'yes' }] });
    const counts = app => [app.state().payments.length, app.state().expenses.length, app.snap().left];
    invariant('P1.dup.pay', 'A £30 Gym bill that matches a Gym expense opens "Already in Spending"; "Keep both" pressed twice → one payment beside the expense, Monthly Left £2,940',
      p1Double(gymExpense, app => { p1Open(app, p1PayForm({ name: 'Gym', amount: 30, date: '2026-06-10', status: 'paid', rec: 'yes' }), 'new'); app.run('savePay(""); __runTimers();'); },
        'geodeDupPayResolve("both")', counts),
      p1Thrice([1, 1, 2940]));
    const gymBill = baseState({ payments: [{ id: 'p1', name: 'Gym', amount: 30, date: '2026-06-15', status: 'upcoming', rec: 'yes', lastPaidYM: '', payKind: 'bill' }] });
    invariant('P1.dup.exp', 'A £30 Gym expense that matches a scheduled Gym bill opens "Already scheduled"; "Keep both" pressed twice → one expense beside the bill, Monthly Left £2,940',
      p1Double(gymBill, app => { p1Open(app, { en: 'Gym', ea: '30', ed: '2026-06-10', ecat: 'other', er: 'yes' }); app.run('saveExp(""); __runTimers();'); },
        'geodeDupExpResolve("both")', counts),
      p1Thrice([1, 1, 2940]));
  });

  scenario('P1-CLOSE PLAN ADD — a Plan "add" saved twice leaves the scheduled row at one addition', () => {
    const scheduled = baseState({ payments: [{ id: 'pS', name: 'Holiday monthly', amount: 100, date: '2026-06-20', status: 'upcoming', rec: 'yes', lastPaidYM: '', goalId: 'gH', payKind: 'goal' }] });
    invariant('P1.plan.add', 'K: Plan adds £20 to the £100 scheduled Holiday row (intent add), Save pressed twice → the row is £120 — not £20 (the second press would replace with the reset intent) and not £140 — Monthly Left £2,880, also after reload',
      p1Double(scheduled, p1PayOpen(p1PayForm({ name: 'Holiday monthly', amount: 20, date: '2026-06-20', status: 'upcoming', rec: 'yes', goalId: 'gH' }), 'add'), 'savePay("")',
        app => [app.state().payments.map(p => p.amount), app.snap().left]),
      p1Thrice([[120], 2880]));
  });

  scenario('P1-CLOSE RECOVERY — a refused save keeps the modal usable; a failure never unlocks a commit; a new modal starts clear', () => {
    const app = new App(baseState(), '2026-06-10', PROGRAM.commit);
    p1Open(app, Object.assign({}, P1_GOAL_50, { pa: '' }), 'new');
    app.run('savePay("")');
    const formRefused = [p1Toasts(app), p1Modal(app), app.state().payments.length];
    app.run('__fields.pa = "0"; __toasts = [];');
    app.run('savePay("")');
    const applyRefused = [p1Toasts(app).length, p1Modal(app), app.state().payments.length];
    app.run('__fields.pa = "50"; __toasts = [];');
    const saved = p1Press(app, 'savePay("")', 2);
    invariant('P1.validation.pay', 'L: Save with no amount is refused by the form (toast, modal open, no commit taken, nothing saved); £0 paid is refused by the contribution rule (same); corrected to £50 and pressed twice it saves once — £1,050',
      [formRefused, applyRefused, saved, p1Money(app)],
      [[['Enter an amount before saving.'], P1_OPEN, 0], [1, P1_OPEN, 0], P1_CLOSING, [1, 1, 1050, 5000, 2950]]);

    const rel = new App(baseState(), '2026-06-10', PROGRAM.commit);
    p1Open(rel, { 'geode-sr-source': 'goal:gH', 'geode-sr-amount': '', 'geode-sr-reason': 'emergency', 'geode-sr-note': '' });
    rel.run('geodeConfirmSavingsRelease()');
    const relRefused = [p1Toasts(rel), p1Modal(rel)];
    rel.run('__fields["geode-sr-amount"] = "200";');
    p1Press(rel, 'geodeConfirmSavingsRelease()', 2);
    const goal = new App(baseState(), '2026-06-10', PROGRAM.commit);
    p1Open(goal, { gn: '', ga: '5000', gs: '1500', gm: '0', gd: '', gc: 'other' });
    goal.run('saveGoal("")');
    const goalRefused = [p1Toasts(goal), p1Modal(goal)];
    goal.run('__fields.gn = "Car";');
    p1Press(goal, 'saveGoal("")', 2);
    invariant('P1.validation.forms', 'L: a release with no amount and a goal with no name are refused with the modal still usable; corrected, each commits once (Holiday £800; two goals)',
      [relRefused, [rel.state().savingsReleases.length, rel.snap().goal.gH], goalRefused, goal.state().goals.length],
      [[['Enter an amount to release.'], P1_OPEN], [1, 800], [['Add a name before saving.'], P1_OPEN], 2]);

    const two = new App(baseState(), '2026-06-10', PROGRAM.commit);
    p1Open(two, P1_GOAL_50, 'new'); p1Press(two, 'savePay("")', 1);
    p1Open(two, P1_GOAL_50, 'new'); p1Press(two, 'savePay("")', 1);
    const afterTwo = p1Money(two);
    two.run('window._geodePayLinkedIntent = "new"; openModal(""); savePay("");');
    two.run('window._geodePayLinkedIntent = "new"; openModal("");');
    const fresh = p1Modal(two);
    two.run('savePay("");');
    const whileClosing = p1Money(two);
    two.run('__runTimers()');
    two.reload();
    invariant('P1.new-modal', 'M: two separately opened modals each saving £50 are two contributions (Holiday £1,100); a third saves £50 and, while it is still closing, a fourth opens clear and its save counts too (£1,200) — four actions, four effects, also after reload',
      [afterTwo, fresh, whileClosing, p1Money(two)],
      [[2, 2, 1100, 5000, 2900], P1_OPEN, [4, 4, 1200, 5000, 2800], [4, 4, 1200, 5000, 2800]]);

    const fail = new App(baseState(), '2026-06-10', PROGRAM.commit);
    const press = code => { try { fail.run(code); return 'returned'; } catch (e) { return 'threw'; } };
    p1Open(fail, P1_GOAL_50, 'new');
    fail.run('var __realSave = save; save = function () { __realSave(); throw new Error("after the change"); };');
    const after = [press('savePay("")'), press('savePay("")'), p1Modal(fail), p1Money(fail)];
    fail.run('save = __realSave;');
    p1Open(fail, P1_GOAL_50, 'new');
    fail.run('var __realApply = geodeSavePayApply; geodeSavePayApply = function () { throw new Error("before any change"); };');
    const before = [press('savePay("")'), p1Modal(fail), p1Money(fail)];
    fail.run('geodeSavePayApply = __realApply;');
    p1Open(fail, P1_GOAL_50, 'new'); p1Press(fail, 'savePay("")', 1);
    invariant('P1.failure', 'A save that fails after changing state keeps that modal\'s commit taken (a second press is refused: one row, £1,050); one that fails before changing anything changes nothing; neither locks Beynd — the next modal saves (£1,100)',
      [after, before, p1Money(fail)],
      [['threw', 'returned', { closing: false, commit: '1' }, [1, 1, 1050, 5000, 2950]], ['threw', { closing: false, commit: '1' }, [1, 1, 1050, 5000, 2950]],
        [2, 2, 1100, 5000, 2900]]);
  });

  scenario('P1-CLOSE INTERACTION LOCK — a committing or closing modal takes no pointer input', () => {
    const app = new App(baseState(), '2026-06-10', PROGRAM.commit);
    app.run('openModal(""); __runTimers(); closeModal(); closeModal();');
    const pending = Number(app.run('__timers.length'));
    const src = PROGRAM.src;
    invariant('P1.lock', 'The stylesheet stops pointer input to a committing or closing modal\'s panel (the backdrop still takes the click, so nothing underneath is hit), keeps a committing modal\'s close button usable, and closeModal on a closing modal schedules no second removal',
      [src.indexOf('.mo-bg[data-geode-commit] .mo,.mo-bg.mo-bg--closing .mo{pointer-events:none}') >= 0,
        src.indexOf('.mo-bg[data-geode-commit]:not(.mo-bg--closing) .mo-close{pointer-events:auto}') >= 0, pending, p1Modal(app)],
      [true, true, 1, { closing: true, commit: null }]);
  });
}

// ───────────────────────────── run ─────────────────────────────

// P1-REL: the automatic FA-7B investment transition waits for this release's shell (geodeShellReadiness), like the
// schema 1 → 2 transition. RELEASE_STATES_JSON holds schema-2 data as the deployed v1.0.76 runtime stored it, with what
// that runtime showed; pages here have a Cache API, so readiness follows the stored geode_shell.

const RELEASE_STATES_JSON = path.join(__dirname, 'fixtures', 'release-v1.0.76-states.json');
const P1R_PREVIOUS = 'v1.0.76';
let p1rData = null;
const p1rFixtures = () => (p1rData = p1rData || JSON.parse(readSource(RELEASE_STATES_JSON))).fixtures;
const p1rFixture = key => p1rFixtures().filter(f => f.key === key)[0];
/** A page of this runtime first loading state (Cache API present); shell: stored geode_shell (true: this runtime's, null: none). */
const p1rPage = (state, clock, shell) => {
  const app = new App(state, clock, undefined, { boot: false });
  app.run('var caches = {}; __uidN = 9000;');
  if (shell) app.run('__otherStorage.setItem(GEODE_SHELL_KEY, ' + (shell === true ? 'BEYND_RUNTIME_VERSION' : JSON.stringify(shell)) + ');');
  watchWrites(app);
  app.run('__reload()');
  return app;
};
/** geodeShellCleanup succeeded in this browser: geode_shell names this runtime. */
const p1rReady = app => app.run('__otherStorage.setItem(GEODE_SHELL_KEY, BEYND_RUNTIME_VERSION);');
/** Valuations per investment as [id, [[value, source]...] | null]. */
const p1rVals = list => (list || []).map(i => [String(i.id), Array.isArray(i.valuations) ? i.valuations.map(v => [v.value, v.source]) : null]);
const p1rShown = app => { const s = app.snap(); return { inv: s.inv, goal: s.goal }; };
/** [readiness, shown, valuations in memory, valuations stored]. */
const p1rLook = app => [app.run('geodeShellReadiness()'), p1rShown(app), p1rVals(app.state().investments), p1rVals(stored(app).investments)];
const p1rLegacy = f => f.state.investments.map(i => [String(i.id), null]);
/** One legacy_transition anchor per investment that has an id, at the figure v1.0.76 showed. */
const p1rAnchored = f => f.state.investments.map(i => [String(i.id), i.id == null ? null : [[f.shown.inv[String(i.id)], 'legacy_transition']]]);
const p1rMoney = shown => Object.keys(shown.inv).map(k => k + ' ' + show(shown.inv[k])).concat(Object.keys(shown.goal).map(k => 'goal ' + k + ' ' + show(shown.goal[k]))).join(', ');

function p1RelFixtures() {
  p1rFixtures().forEach(f => scenario('P1-REL FIXTURE — ' + f.key + ' ' + f.description, () => {
    const legacy = p1rLegacy(f), anchored = p1rAnchored(f);
    const app = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    const pending = p1rLook(app), pendingWrites = writes(app);
    app.run('save();');
    const saved = p1rVals(stored(app).investments);
    p1rReady(app); app.reload();
    const ready = p1rLook(app).slice(0, 3);
    app.run('save();');
    const readySaved = p1rVals(stored(app).investments);
    app.reload(); const again = p1rLook(app);
    app.advance('2026-09-02', 'reload'); const sept = p1rLook(app);
    app.advance('2026-10-02', 'reload'); const oct = p1rLook(app);
    const settled = ['ready', f.shown, anchored, anchored];
    invariant('P1REL.fixture.' + f.key, 'v1.0.76 showed ' + (p1rMoney(f.shown) || 'nothing') + '. First load of this runtime with the shell pending (geode_shell ' + P1R_PREVIOUS +
      '): the same figures, no anchor in memory or storage, the load writes nothing and a save stores no anchor; once geode_shell names this runtime the next load anchors each investment with an id once, at the figure v1.0.76 showed, and the next save stores it; reload, September and October: same figures, same single anchor',
      [pending, pendingWrites, saved, ready, readySaved, again, sept, oct],
      [['pending', f.shown, legacy, legacy], 0, legacy, ['ready', f.shown, anchored], anchored, settled, settled, settled]);
  }));
}

function p1RelPending() {
  scenario('P1-REL PENDING — the automatic investment transition waits while the shell is not verified', () => {
    const f = p1rFixture('P10'), legacy = p1rLegacy(f);
    const look = app => [app.run('geodeShellReadiness()'), p1rShown(app).inv, p1rVals(app.state().investments)];
    invariant('P1REL.pending.markers', 'geode_shell v1.0.76 (stale), none (absent marker) or an older v1.0.70: readiness pending, no anchor, the v1.0.76 figures (ISA £5,200, GIA £2,100, Pension £10,000)',
      [P1R_PREVIOUS, null, 'v1.0.70'].map(m => look(p1rPage(f.state, f.clock, m))), [0, 1, 2].map(() => ['pending', f.shown.inv, legacy]));

    const held = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    held.reload(); held.advance('2026-09-02', 'reload'); held.run('save();');
    const stuck = [look(held), p1rVals(stored(held).investments)];
    p1rReady(held); held.reload(); held.run('save();');
    invariant('P1REL.pending.cleanup-fails', 'Cleanup that keeps failing (Cache API error) leaves geode_shell at v1.0.76: two more loads, one in September, and a save store no anchor. The September boundary is held, so the paid August ISA row is not reset and the ISA stays £5,200; once cleanup succeeds the next load anchors that £5,200 once',
      [stuck, look(held), p1rVals(stored(held).investments)],
      [[['pending', { iA: 5200, iG: 2100, iP: 10000 }, legacy], legacy], ['ready', { iA: 5200, iG: 2100, iP: 10000 }, [['iA', [[5200, 'legacy_transition']]], ['iG', [[2100, 'legacy_transition']]], ['iP', [[10000, 'legacy_transition']]]]],
        [['iA', [[5200, 'legacy_transition']]], ['iG', [[2100, 'legacy_transition']]], ['iP', [[10000, 'legacy_transition']]]]]);

    const p2 = p1rFixture('P2');
    const acting = p1rPage(p2.state, p2.clock, P1R_PREVIOUS);
    acting.contribute({ name: 'ISA extra', amount: 100, date: p2.clock, status: 'paid', rec: 'no', investId: 'iA' });
    const during = [look(acting), p1rVals(stored(acting).investments), acting.events().length];
    p1rReady(acting); acting.reload(); acting.run('save();');
    invariant('P1REL.pending.actions', 'While pending, a paid one-off £100 to the ISA is recorded on legacy authority (£5,300, a second completion) and its save stores no anchor; the next ready load anchors the legacy figure then available, £5,300, once',
      [during, look(acting), p1rVals(stored(acting).investments)],
      [[['pending', { iA: 5300 }, [['iA', null]]], [['iA', null]], 2], ['ready', { iA: 5300 }, [['iA', [[5300, 'legacy_transition']]]]], [['iA', [[5300, 'legacy_transition']]]]]);

    const manual = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    manual.saveInvestment('iA', 'ISA', 6000);
    manual.createInvestment('Fund', 1500);
    const fund = String(manual.state().investments.filter(i => i.name === 'Fund')[0].id);
    const entered = [look(manual), p1rVals(stored(manual).investments)];
    p1rReady(manual); manual.reload(); manual.run('save();');
    const kept = [['iA', [[6000, 'manual']]], ['iG', null], ['iP', null], [fund, [[1500, 'manual_create']]]];
    const moved = [['iA', [[6000, 'manual']]], ['iG', [[2100, 'legacy_transition']]], ['iP', [[10000, 'legacy_transition']]], [fund, [[1500, 'manual_create']]]];
    invariant('P1REL.pending.manual', 'User observations are not held: while pending, entering the ISA value £6,000 and creating Fund £1,500 store a manual and a manual_create valuation (no legacy anchor anywhere); the next ready load anchors only the investments without a valuation (GIA, Pension) and keeps the user\'s values',
      [entered, look(manual), p1rVals(stored(manual).investments)],
      [[['pending', { iA: 6000, iG: 2100, iP: 10000, [fund]: 1500 }, kept], kept], ['ready', { iA: 6000, iG: 2100, iP: 10000, [fund]: 1500 }, moved], moved]);

    const noCache = new App(f.state, f.clock);
    invariant('P1REL.absent', 'A browser without the Cache API (readiness absent: no app copy can be cached there) keeps FA-7B behaviour: the first load anchors each investment at the v1.0.76 figure',
      look(noCache), ['absent', f.shown.inv, p1rAnchored(f)]);
  });

  scenario('P1-REL NEW MONTH — the first load of this runtime is also the first load of a new month, shell pending', () => {
    const f = p1rFixture('P2');
    const app = p1rPage(f.state, '2026-09-02', P1R_PREVIOUS);
    const pending = [p1rLook(app).slice(0, 3), app.state().payments.map(p => p.status), stored(app).payments.map(p => p.status)];
    p1rReady(app); app.reload();
    const ready = p1rLook(app).slice(0, 3);
    app.advance('2026-10-02', 'reload');
    invariant('P1REL.new-month', 'P2 (August monthly £200 completed, shown £5,200) first opened by this runtime on 2 September with the shell pending: recurrence would reset the paid row, but the boundary is held, so the row stays paid and the ISA stays £5,200 in memory and storage; the next ready load anchors £5,200 once; October recurrence then advances and the figure stays £5,200',
      [pending, ready, p1rShown(app).inv],
      [[['pending', { inv: { iA: 5200 }, goal: { gH: 1000 } }, [['iA', null]]], ['paid'], ['paid']], ['ready', { inv: { iA: 5200 }, goal: { gH: 1000 } }, [['iA', [[5200, 'legacy_transition']]]]], { iA: 5200 }]);
  });
}

function p1RelIdempotence() {
  scenario('P1-REL IDEMPOTENCE — the gated transition keeps FA-7B identity, determinism and recovery', () => {
    const f = p1rFixture('P3');
    const anchor = list => (list || []).map(i => (i.valuations || []).map(v => [v.id, v.value, v.source, v.recordedAt]));
    const app = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    p1rReady(app);
    app.run('__reload();');
    const lost = [anchor(app.state().investments), anchor(stored(app).investments)];
    app.run('__reload();');
    const retried = anchor(app.state().investments);
    app.run('save();'); app.reload(); app.reload();
    const forged = app.run('JSON.stringify([geodeInvestmentAuthorityTransition(S, geodeInvestmentLegacyOpeningValues(S)), geodeInvestmentAuthorityTransition(S, [9999])])');
    const settled = [anchor(app.state().investments), anchor(stored(app).investments), app.snap().inv.iA];
    const other = p1rPage(f.state, '2026-08-25', true);
    app.contribute({ name: 'ISA extra', amount: 100, date: f.clock, status: 'paid', rec: 'no', investId: 'iA' });
    app.reload(); app.reload();
    const once = retried[0][0];
    invariant('P1REL.idempotent', 'P3 (£6,000): a ready load whose state never reaches storage (the tab closes or the write is lost) holds the anchor in memory only; the next load builds the same anchor (fixed id val_legacy_iA, £6,000, recordedAt = its latest evidence); running the transition again, even with a forged opening value, adds nothing; two reloads keep one anchor; another page transitioning the same v1.0.76 data on another day builds the identical anchor; a later £100 contribution counts once (£6,100 across two reloads)',
      [lost, retried, JSON.parse(forged), settled, anchor(other.state().investments), app.snap().inv.iA, anchor(stored(app).investments)],
      [[[[once]], [[]]], [[once]], [true, true], [[[once]], [[once]], 6000], [[once]], 6100, [[once]]]);
    invariant('P1REL.idempotent.anchor', 'That anchor is val_legacy_iA at £6,000 (legacy_transition)', once.slice(0, 3), ['val_legacy_iA', 6000, 'legacy_transition']);
  });
}

function p2BoundaryHold() {
  const HOLD = 'Beynd hasn\'t finished updating on this device. Reload to finish.';
  scenario('P2-2 BOUNDARY HOLD — recurrence waits while the investment transition is outstanding', () => {
    const f = p1rFixture('P2');
    const isa = app => app.snap().inv.iA;
    const paid = app => app.state().payments.map(p => p.status);

    const loaded = p1rPage(f.state, '2026-09-02', P1R_PREVIOUS);
    invariant('P2.hold.load', 'A new September load with the shell pending keeps the August ISA row paid and the ISA at £5,200 in memory and storage; boot\'s load and render are two holds, so the reload notice is up',
      [isa(loaded), paid(loaded), stored(loaded).payments.map(p => p.status), p1rVals(loaded.state().investments), loaded.run('_geodeBoundaryHoldNotice'), loaded.run('_geodeBoundaryHoldAttempts'), loaded.run('geodeBoundaryHoldMessage()')],
      [5200, ['paid'], ['paid'], [['iA', null]], true, 2, HOLD]);

    const live = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    live.advance('2026-09-02', 'render');
    invariant('P2.hold.render', 'A page opened in August and still pending, rendered on 2 September without a reload, does not reset the row or drop the ISA',
      [isa(live), paid(live), stored(live).payments.map(p => p.status), live.run('[_geodeBoundaryHoldNotice, _geodeBoundaryHoldAttempts]')],
      [5200, ['paid'], ['paid'], [false, 1]]);

    const ready = p1rPage(f.state, '2026-09-02', true);
    ready.reload();
    invariant('P2.hold.ready', 'With the shell already ready, the September load anchors £5,200 once and recurrence then advances the row; a reload does not add a second anchor',
      [isa(ready), paid(ready), p1rVals(ready.state().investments), p1rVals(stored(ready).investments)],
      [5200, ['upcoming'], [['iA', [[5200, 'legacy_transition']]]], [['iA', [[5200, 'legacy_transition']]]]]);

    const anchored = p1rPage(f.state, f.clock, true);
    anchored.run('__otherStorage.setItem(GEODE_SHELL_KEY, ' + JSON.stringify(P1R_PREVIOUS) + ');');
    anchored.advance('2026-09-02', 'reload');
    invariant('P2.hold.anchored', 'An ISA that already has its anchor is not held just because geode_shell is put back to v1.0.76: September recurrence runs and the position stays £5,200',
      [anchored.run('geodeShellReadiness()'), isa(anchored), paid(anchored), p1rVals(anchored.state().investments), anchored.run('_geodeBoundaryHoldNotice')],
      ['pending', 5200, ['upcoming'], [['iA', [[5200, 'legacy_transition']]]], false]);

    const manual = p1rPage(f.state, '2026-09-02', P1R_PREVIOUS);
    manual.run('__toasts = [];');
    manual.toggle('id1');
    const refused = [paid(manual), isa(manual), JSON.parse(manual.run('JSON.stringify(__toasts)'))];
    manual.saveInvestment('iA', 'ISA', 6000);
    const entered = [isa(manual), p1rVals(manual.state().investments), p1rVals(stored(manual).investments)];
    p1rReady(manual); manual.reload();
    invariant('P2.hold.manual', 'While the boundary is held, toggling the August ISA row is refused and the £5,200 stays; entering £6,000 stores a manual valuation. The next ready load keeps that £6,000 and does not add a legacy anchor beside it',
      [refused, entered, isa(manual), p1rVals(manual.state().investments)],
      [[['paid'], 5200, [HOLD]], [6000, [['iA', [[6000, 'manual']]]], [['iA', [[6000, 'manual']]]]], 6000, [['iA', [[6000, 'manual']]]]]);

    const months = p1rPage(f.state, '2026-09-02', P1R_PREVIOUS);
    months.advance('2026-10-02', 'reload');
    months.advance('2026-11-02', 'reload');
    const still = [isa(months), paid(months), p1rVals(months.state().investments)];
    p1rReady(months); months.reload(); months.reload();
    invariant('P2.hold.months', 'September, October and November all pending do not drop the ISA; the first ready load anchors £5,200 once and the next reload does not anchor again',
      [still, isa(months), p1rVals(months.state().investments), p1rVals(stored(months).investments)],
      [[5200, ['paid'], [['iA', null]]], 5200, [['iA', [[5200, 'legacy_transition']]]], [['iA', [[5200, 'legacy_transition']]]]]);

    const once = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    once.at('2026-09-02');
    once.run('syncRecurringPayments();');
    const first = once.run('[_geodeBoundaryHoldNotice, _geodeBoundaryHoldAttempts]');
    once.run('syncRecurringPayments();');
    invariant('P2.hold.notice', 'The first held processing leaves no notice; the second makes the reload notice available. The ISA is still £5,200',
      [first, once.run('[_geodeBoundaryHoldNotice, _geodeBoundaryHoldAttempts]'), isa(once)],
      [[false, 1], [true, 2], 5200]);

    const stale = p1rPage(f.state, '2026-09-02', P1R_PREVIOUS);
    const body = JSON.parse(rawStore(stale));
    body.income = 1111;
    body._rev = { seq: body._rev.seq + 4, id: 'rev_boundary_other', by: 'v1.0.77', at: 9 };
    const foreign = JSON.stringify(body);
    const attempts = stale.run('_geodeBoundaryHoldAttempts');
    stale.run('_geodeBoundaryHoldNotice = false;');
    foreignStore(stale, foreign);
    stale.render();
    invariant('P2.hold.stale', 'A fenced foreign write is refused by the P2-1 fence and is not counted as another boundary hold; storage stays on that foreign text and the page is foreign-stale',
      [rawStore(stale) === foreign, staleState(stale), stale.run('[_geodeBoundaryHoldNotice, _geodeBoundaryHoldAttempts]'), attempts, paid(stale), relWarnings(stale)],
      [true, ['foreign', 'foreign'], [false, attempts], attempts, ['paid'], ['stale:foreign']]);

    const partial = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    partial.run('geodeInvestmentTransitionOutstanding = function () { return false; };');
    partial.advance('2026-09-02', 'reload');
    const broken = p1rPage(f.state, f.clock, P1R_PREVIOUS);
    broken.run('geodeBoundaryTransitionOutstanding = function () { return false; };');
    broken.advance('2026-09-02', 'reload');
    invariant('P2.hold.disabled', 'With only the investment check forced off the schema-3 transition still holds the boundary (P2-5: one hold rule, geodeBoundaryTransitionOutstanding); with that rule forced off, the September load resets the row and the ISA falls to £5,000 — the hold is what keeps £5,200',
      [[isa(partial), paid(partial)], [isa(broken), paid(broken)]], [[5200, ['paid']], [5000, ['upcoming']]]);

    const order = JSON.parse(loaded.run('JSON.stringify(["beynd-cache-v1.0.70","beynd-cache-v1.0.76","beynd-cache-v1.0.77","beynd-cache-v1.0.78","beynd-cache-v1.0.79","beynd-cache-preview","other-app"].map(geodeBeyndCacheOrder))'));
    invariant('P2.hold.cache-order', 'Cache names order against v1.0.78: older, current, newer, unknown, and non-Beynd',
      order, ['older', 'older', 'older', 'current', 'newer', 'unknown', 'other']);
  });
}

function p2DebtIdentity() {
  const CARD4K = () => ({ id: 'dC', name: 'Card', balance: 4000, apr: 20, minp: 50 });
  const debtApp = (payments, clock) => new App(baseState({ debts: [CARD4K()], payments: payments || [] }), clock || '2026-06-05', PROGRAM.plan);
  /** Every debt entry point (debt card, Plan, Home, Suggested Actions, quick pay) opens the form with intent 'set' and no row id. */
  const debtPay = (app, amount, rec, date, intent) => app.contribute({ intent: intent || 'set', name: 'Card ' + (rec === 'yes' ? 'monthly' : 'extra'),
    amount, date: date || '2026-06-15', status: 'upcoming', rec, debtId: 'dC' });
  const view = (app, ids) => app.state().payments.filter(p => p.debtId === 'dC')
    .map(p => [ids[p.id] || p.id, p.rec, p.amount, p.status, p.date]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  const debtEvents = (app, ids) => app.state().debtPaymentEvents.map(e => [e.eventType, ids[e.paymentId] || e.paymentId, e.occurrenceYm, e.amount == null ? null : e.amount]);
  const balance = app => app.state().debts[0].balance;

  scenario('P2-3 DEBT IDENTITY — distinct unpaid debt payment intents keep distinct rows', () => {
    const a = debtApp();
    const m = debtPay(a, 50, 'yes'), o = debtPay(a, 100, 'no', '2026-06-20');
    const ids = { [m]: 'm50', [o]: 'o100' };
    a.merge();
    invariant('P2.debt.monthly-oneoff', '£50 monthly + £100 one-off for the same card and month: two rows with two ids, each with its own frequency and amount, after the Payments-list merge too; Card stays £4,000; Monthly Left counts both (£3,000 − £150)',
      [m !== o, view(a, ids), balance(a), a.snap().left],
      [true, [['m50', 'yes', 50, 'upcoming', '2026-06-15'], ['o100', 'no', 100, 'upcoming', '2026-06-20']], 4000, 2850]);

    const b = debtApp();
    const b1 = debtPay(b, 50, 'yes'), b2 = debtPay(b, 75, 'yes');
    b.merge();
    invariant('P2.debt.two-monthly', '£50 monthly + £75 monthly: two monthly rows, nothing summed', view(b, { [b1]: 'm50', [b2]: 'm75' }),
      [['m50', 'yes', 50, 'upcoming', '2026-06-15'], ['m75', 'yes', 75, 'upcoming', '2026-06-15']]);

    const c = debtApp();
    const c1 = debtPay(c, 50, 'yes'), c2 = debtPay(c, 50, 'yes', null, 'new');
    c.merge();
    invariant('P2.debt.identical', 'Two identical £50 monthly payments added separately (Plan "set" then plain form "new") stay two rows; a matching amount is not a duplicate',
      [c1 !== c2, view(c, { [c1]: 'first', [c2]: 'second' }), c.snap().left],
      [true, [['first', 'yes', 50, 'upcoming', '2026-06-15'], ['second', 'yes', 50, 'upcoming', '2026-06-15']], 2900]);

    a.modalEdit(m, { amount: '60' });
    invariant('P2.debt.edit', 'Editing the monthly row through its own form keeps its id, changes only it, and adds no row; the one-off is untouched',
      [view(a, ids), a.state().payments.length, balance(a)],
      [[['m50', 'yes', 60, 'upcoming', '2026-06-15'], ['o100', 'no', 100, 'upcoming', '2026-06-20']], 2, 4000]);

    a.at('2026-06-15');
    a.toggle(m);
    const afterFirst = [view(a, ids).map(r => [r[0], r[3]]), debtEvents(a, ids)];
    a.toggle(o);
    const afterSecond = [view(a, ids).map(r => [r[0], r[3]]), debtEvents(a, ids), a.snap().left];
    a.toggle(m);
    invariant('P2.debt.complete', 'Completing the monthly records only its own debt event and leaves the one-off upcoming; completing the one-off records only its own; undoing the monthly reverses only its event; Card stays £4,000 throughout',
      [afterFirst, afterSecond, view(a, ids).map(r => [r[0], r[3]]), debtEvents(a, ids), balance(a)],
      [[[['m50', 'paid'], ['o100', 'upcoming']], [['completion', 'm50', '2026-06', 60]]],
        [[['m50', 'paid'], ['o100', 'paid']], [['completion', 'm50', '2026-06', 60], ['completion', 'o100', '2026-06', 100]], 2840],
        [['m50', 'upcoming'], ['o100', 'paid']], [['completion', 'm50', '2026-06', 60], ['completion', 'o100', '2026-06', 100], ['reversal', 'm50', '2026-06', null]], 4000]);

    const before = view(a, ids);
    a.reload();
    invariant('P2.debt.reload', 'Reload keeps both rows, ids, statuses and events exactly as the session had them', [view(a, ids), debtEvents(a, ids).length], [before, 3]);

    const d = debtApp();
    const d1 = debtPay(d, 50, 'yes'), d2 = debtPay(d, 100, 'no', '2026-06-20');
    d.del(d1);
    invariant('P2.debt.delete', 'Deleting the monthly row leaves the one-off row exactly as it was', view(d, { [d2]: 'o100' }), [['o100', 'no', 100, 'upcoming', '2026-06-20']]);
  });

  MODES.forEach(mode => scenario('P2-3 DEBT BOUNDARY — June monthly £50 + one-off £100 through July and August [' + mode + ']', () => {
    const app = debtApp();
    const m = debtPay(app, 50, 'yes'), o = debtPay(app, 100, 'no', '2026-06-20');
    const ids = { [m]: 'm50', [o]: 'o100' };
    app.at('2026-06-20'); app.toggle(m); app.toggle(o);
    app.advance('2026-07-02', mode); app.merge();
    const july = [view(app, ids), app.snap().left];
    const x = debtPay(app, 100, 'no', '2026-07-20');
    ids[x] = 'x100';
    app.merge();
    const julyExtra = view(app, ids);
    app.advance('2026-08-02', mode); app.merge();
    invariant('P2.debt.boundary.' + mode, 'July: the monthly comes back upcoming on 15 July; the June one-off stays a completed one-off and never becomes monthly (Monthly Left £2,950). A new July one-off next to the July monthly is its own row. August: the monthly moves to 15 August, both one-offs keep their frequency and amounts; Card stays £4,000',
      [july, julyExtra, view(app, ids), balance(app)],
      [[[['m50', 'yes', 50, 'upcoming', '2026-07-15'], ['o100', 'no', 100, 'paid', '2026-06-20']], 2950],
        [['m50', 'yes', 50, 'upcoming', '2026-07-15'], ['o100', 'no', 100, 'paid', '2026-06-20'], ['x100', 'no', 100, 'upcoming', '2026-07-20']],
        [['m50', 'yes', 50, 'upcoming', '2026-08-15'], ['o100', 'no', 100, 'paid', '2026-06-20'], ['x100', 'no', 100, 'upcoming', '2026-07-20']], 4000]);
  }));

  scenario('P2-3 DEBT PATHS — Smart Import, legacy state, goals and the stale-write fence', () => {
    const si = debtApp();
    const m = debtPay(si, 50, 'yes');
    si.smartImport([{ name: 'Card extra', amount: 100, date: '2026-06-20', link: 'debt:dC' }]);
    si.merge(); si.reload(); si.merge();
    invariant('P2.debt.import', 'A Smart Import debt payment added as new next to the £50 monthly stays its own one-off row through the Payments-list merge and a reload',
      view(si, { [m]: 'm50' }).map(r => [r[0] === 'm50' ? 'm50' : 'import', r[1], r[2]]), [['import', 'no', 100], ['m50', 'yes', 50]]);

    const merged = debtApp([{ id: 'dm', name: 'Card', amount: 150, date: '2026-06-15', status: 'upcoming', rec: 'yes', lastPaidYM: '', goalId: '', investId: '', debtId: 'dC', payKind: 'debt', createdAt: 1 }]);
    merged.merge(); merged.reload();
    invariant('P2.debt.history', 'A £150 monthly row an earlier runtime already merged stays one £150 monthly row: nothing is split or guessed', view(merged, {}), [['dm', 'yes', 150, 'upcoming', '2026-06-15']]);

    const goalRow = (id, created) => ({ id, name: 'Holiday', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', lastPaidYM: '', goalId: 'gH', investId: '', debtId: '', payKind: 'goal', createdAt: created });
    const debtRow = (id, amount, rec, created) => ({ id, name: 'Card', amount, date: '2026-06-15', status: 'upcoming', rec, lastPaidYM: '', goalId: '', investId: '', debtId: 'dC', payKind: 'debt', createdAt: created });
    const mixed = debtApp([goalRow('g1', 1), goalRow('g2', 2), debtRow('d1', 50, 'yes', 3), debtRow('d2', 100, 'no', 4)]);
    mixed.merge();
    invariant('P2.debt.goal-merge', 'The goal branch of the merge is unchanged: two unmarked £100 monthly Holiday rows still combine (FA1.M.legacy-dup) while the two debt rows beside them stay apart',
      mixed.state().payments.map(p => [p.id, p.rec, p.amount]).sort(), [['d1', 'yes', 50], ['d2', 'no', 100], ['g1', 'yes', 200]]);

    const st = debtApp();
    const s1 = debtPay(st, 50, 'yes');
    const body = JSON.parse(rawStore(st));
    body.income = 3333;
    body._rev = { seq: body._rev.seq + 3, id: 'rev_debt_other', by: 'v1.0.77', at: 9 };
    const foreign = JSON.stringify(body);
    foreignStore(st, foreign);
    debtPay(st, 100, 'no', '2026-06-20');
    invariant('P2.debt.stale', 'A debt payment saved in a tab another window has overtaken is refused by the P2-1 fence: the other window\'s text stays stored, the page is foreign-stale',
      [rawStore(st) === foreign, staleState(st), relWarnings(st), JSON.parse(rawStore(st)).payments.map(p => p.id === s1)], [true, ['foreign', 'foreign'], ['stale:foreign'], [true]]);

    const mutateSave = app => {
      app.run(`(function () {
        var src = geodeSavePayApply.toString();
        var out = src.replace("if (debtid || payLinkedIntent === 'new') return false;", "if (!debtid && payLinkedIntent === 'new') return false;")
          .replace("if (gid) { kindLabel = 'Contribution'; existing = geodeFindExistingLinkedPaymentForYm('goal'",
            "if (debtid) { kindLabel = 'Payment'; existing = geodeFindExistingLinkedPaymentForYm('debt', debtid, ym); } else if (gid) { kindLabel = 'Contribution'; existing = geodeFindExistingLinkedPaymentForYm('goal'");
        if (out === src) throw new Error('mutation did not apply');
        geodeSavePayApply = (0, eval)('(' + out + ')');
      })()`);
    };
    const mu = debtApp();
    mutateSave(mu);
    debtPay(mu, 50, 'yes'); debtPay(mu, 100, 'no', '2026-06-20');
    invariant('P2.debt.upsert.disabled', 'With the old debt upsert restored, the £100 one-off overwrites the £50 monthly row — the guard is what keeps two rows',
      mu.state().payments.map(p => [p.rec, p.amount]), [['yes', 100]]);

    const mm = debtApp([debtRow('d1', 50, 'yes', 1), debtRow('d2', 100, 'no', 2)]);
    mm.run(`(function () {
      var src = geodeDuplicateLinkedContributionKey.toString();
      var out = src.replace("=== 'paid' || p.debtId || p.directContribution === true) return '';", "=== 'paid' || p.directContribution === true) return ''; if (p.debtId) { var dym = geodePaymentMonthYmFromDate(p.date); return dym ? dym + '|d|' + p.debtId + '|u' : ''; }");
      if (out === src) throw new Error('mutation did not apply');
      geodeDuplicateLinkedContributionKey = (0, eval)('(' + out + ')');
    })()`);
    mm.merge();
    invariant('P2.debt.merge.disabled', 'With debt rows grouped again, the merge sums them into one £150 row — the exclusion is what keeps them apart',
      mm.state().payments.map(p => [p.id, p.amount]), [['d1', 150]]);
  });
}

function p2BillSettlement() {
  const bill = (app, name, amount, date, rec, status) => app.contribute({ name, amount, date, status: status || 'upcoming', rec: rec || 'yes' });
  const billRow = (id, o) => Object.assign({ id, name: 'Rent', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', lastPaidYM: '',
    goalId: '', investId: '', debtId: '', payKind: 'bill', createdAt: 1 }, o);
  /** [type, payment, due month, amount] per stored bill event, in order. */
  const bev = (app, ids) => (app.state().billPaymentEvents || []).map(e => [e.eventType, (ids && ids[e.paymentId]) || e.paymentId, e.occurrenceYm, e.amount == null ? null : e.amount]);
  /** A completion's evidence fields. */
  const proof = e => [e.paymentId, e.amount, e.occurrenceYm, e.dueDateSnapshot, e.recurrenceSnapshot, e.paymentNameSnapshot, e.source, typeof e.recordedAt === 'number'];
  const completions = app => (app.state().billPaymentEvents || []).filter(e => e.eventType === 'completion');
  const active = (app, ids) => JSON.parse(app.run('JSON.stringify(geodeBillPaymentLedger(S.billPaymentEvents).active.map(function (e) { return [e.paymentId, e.occurrenceYm, e.amount]; }))'))
    .map(a => [(ids && ids[a[0]]) || a[0], a[1], a[2]]);
  const row = (app, id) => app.state().payments.filter(p => p.id === id)[0];
  const card = () => ({ id: 'dC', name: 'Card', balance: 4000, apr: 20, minp: 50 });
  const mutate = (app, fn, from, to) => app.run(`(function () {
    var src = ${fn}.toString();
    var out = src.replace(${JSON.stringify(from)}, ${JSON.stringify(to)});
    if (out === src) throw new Error('mutation did not apply');
    ${fn} = (0, eval)('(' + out + ')');
  })()`);

  scenario('P2-4 BILL SETTLEMENT — completion, undo, edits and deletion keep durable evidence', () => {
    const a = new App(baseState(), '2026-06-05');
    const rent = bill(a, 'Rent', 100, '2026-06-15');
    a.at('2026-06-10'); a.toggle(rent);
    const ev = completions(a);
    invariant('P2.bill.complete', 'Completing a £100 monthly bill due 15 June on 10 June records one completion: its own payment id, £100, due month 2026-06 with the due date captured before the row advanced, monthly, named Rent, from mark_completed; the row still behaves as before (paid, lastPaidYM 2026-06, lastPaidAmount £100, next due 15 July)',
      [ev.length, proof(ev[0]), [row(a, rent).status, row(a, rent).lastPaidYM, row(a, rent).lastPaidAmount, row(a, rent).date]],
      [1, [rent, 100, '2026-06', '2026-06-15', 'monthly', 'Rent', 'mark_completed', true], ['paid', '2026-06', 100, '2026-07-15']]);

    const first = JSON.stringify(a.state().billPaymentEvents);
    a.render(); a.run('save();'); a.reload(); a.render(); a.reload();
    invariant('P2.bill.reload', 'Render, save and two reloads keep that one event byte-identical: no duplicate', JSON.stringify(a.state().billPaymentEvents) === first, true);

    const e = new App(baseState(), '2026-06-05');
    const early = bill(e, 'Insurance', 40, '2026-07-01');
    e.at('2026-06-28'); e.toggle(early);
    invariant('P2.bill.early', 'A bill due 1 July completed on 28 June is the July occurrence (due date 2026-07-01), not June; the row keeps its own semantics (lastPaidYM 2026-06, next due 1 August)',
      [bev(e), completions(e)[0].dueDateSnapshot, row(e, early).lastPaidYM, row(e, early).date], [[['completion', early, '2026-07', 40]], '2026-07-01', '2026-06', '2026-08-01']);

    const u = new App(baseState(), '2026-06-05');
    const r = bill(u, 'Rent', 100, '2026-06-15'), ph = bill(u, 'Phone', 25, '2026-06-20');
    const ids = { [r]: 'rent', [ph]: 'phone' };
    u.at('2026-06-21'); u.toggle(r); u.toggle(ph); u.toggle(r);
    invariant('P2.bill.undo', 'Rent and Phone both completed, then Rent marked not completed: one reversal of Rent\'s June completion is appended (nothing deleted); Phone\'s settlement stays active',
      [bev(u, ids), active(u, ids), u.state().billPaymentEvents.filter(x => x.eventType === 'reversal').map(x => [x.reversesEventId === completions(u)[0].id, x.source])],
      [[['completion', 'rent', '2026-06', 100], ['completion', 'phone', '2026-06', 25], ['reversal', 'rent', '2026-06', null]], [['phone', '2026-06', 25]], [[true, 'mark_completed']]]);
    u.toggle(r);
    u.reload();
    invariant('P2.bill.cycle', 'Complete → undo → complete leaves exactly one active Rent settlement for June (the second completion), beside the reversed first, also after reload; the row is due 15 July again',
      [bev(u, ids).filter(x => x[1] === 'rent'), active(u, ids), row(u, r).date],
      [[['completion', 'rent', '2026-06', 100], ['reversal', 'rent', '2026-06', null], ['completion', 'rent', '2026-06', 100]], [['phone', '2026-06', 25], ['rent', '2026-06', 100]], '2026-07-15']);

    a.modalEdit(rent, { amount: '150' });
    a.modalEdit(rent, { name: 'Rent (flat)' });
    a.reload();
    invariant('P2.bill.fa4c', 'FA-4C: after completing £100, the template edited to £150 and renamed: the completion stays £100 named Rent, no event is added, the row shows £150 with lastPaidAmount £100',
      [completions(a).map(proof), a.state().billPaymentEvents.length, [row(a, rent).amount, row(a, rent).lastPaidAmount, row(a, rent).name]],
      [[[rent, 100, '2026-06', '2026-06-15', 'monthly', 'Rent', 'mark_completed', true]], 1, [150, 100, 'Rent (flat)']]);

    a.del(rent);
    const afterDelete = [a.state().payments.length, a.state().billPaymentEvents.length];
    a.reload();
    invariant('P2.bill.delete', 'Deleting the Rent template removes the row but not its recorded settlement, also after reload', [afterDelete, bev(a)], [[0, 1], [['completion', rent, '2026-06', 100]]]);

    const o = new App(baseState(), '2026-06-05');
    const vet = bill(o, 'Vet', 80, '2026-06-20', 'no');
    const gym = bill(o, 'Gym', 200, '2026-06-25', 'annual');
    const leftBefore = o.snap().left;
    o.at('2026-06-10'); o.toggle(vet); o.toggle(gym);
    invariant('P2.bill.oneoff-annual', 'A one-off £80 due 20 June and an annual £200 due 25 June, completed on 10 June: each records its own due month (one_off, annual), the annual row moves to 25 June 2027 exactly as before, and Monthly Left is what the payment rows give (£2,720 both before and after)',
      [completions(o).map(x => [x.paymentId, x.amount, x.occurrenceYm, x.dueDateSnapshot, x.recurrenceSnapshot]), row(o, gym).date, leftBefore, o.snap().left],
      [[[vet, 80, '2026-06', '2026-06-20', 'one_off'], [gym, 200, '2026-06', '2026-06-25', 'annual']], '2027-06-25', 2720, 2720]);

    const f = new App(baseState(), '2026-06-05');
    const paidNow = bill(f, 'Water', 30, '2026-06-03', 'yes', 'paid');
    const unpaidThenPaid = bill(f, 'Phone', 25, '2026-06-20');
    f.modalEdit(unpaidThenPaid, { status: 'paid' });
    f.modalEdit(paidNow, { status: 'upcoming' });
    invariant('P2.bill.form', 'The payment form records the same evidence: a monthly bill saved paid (due 3 June) and an upcoming bill edited to paid each record their form date\'s month; editing the first back to upcoming reverses it',
      [bev(f, { [paidNow]: 'water', [unpaidThenPaid]: 'phone' }), f.state().billPaymentEvents.map(x => x.source)],
      [[['completion', 'water', '2026-06', 30], ['completion', 'phone', '2026-06', 25], ['reversal', 'water', '2026-06', null]], ['payment_form', 'payment_form', 'payment_form']]);

    const l = new App(baseState({ debts: [card()] }), '2026-06-05');
    const g = l.contribute({ name: 'Holiday', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    const i = l.contribute({ name: 'ISA', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    const d = l.contribute({ intent: 'set', name: 'Card', amount: 50, date: '2026-06-15', status: 'upcoming', rec: 'yes', debtId: 'dC' });
    l.at('2026-06-15'); l.toggle(g); l.toggle(i); l.toggle(d);
    invariant('P2.bill.scope', 'Goal, investment and debt rows completed record no bill evidence (their own ledgers record them as before)',
      [l.state().billPaymentEvents.length, l.events().length, l.state().debtPaymentEvents.length], [0, 2, 1]);

    invariant('P2.bill.modal', 'P1-CLOSE: a £30 monthly bill saved paid with Save pressed twice is one row and one settlement — as one press, also after reload',
      p1Double(baseState(), p1PayOpen(p1PayForm({ name: 'Gym', amount: 30, date: '2026-06-10', status: 'paid', rec: 'yes' })), 'savePay("")',
        app => [app.state().payments.length, bev(app).map(x => [x[0], x[2], x[3]])]),
      p1Thrice([1, [['completion', '2026-06', 30]]]));
  });

  MODES.forEach(mode => scenario('P2-4 BILL MONTHS — £100 monthly bill through June, July and August [' + mode + ']', () => {
    const app = new App(baseState(), '2026-06-05');
    const rent = bill(app, 'Rent', 100, '2026-06-15');
    app.at('2026-06-10'); app.toggle(rent);
    const june = bev(app, { [rent]: 'rent' });
    app.advance('2026-07-02', mode);
    const july = [bev(app, { [rent]: 'rent' }), row(app, rent).status, row(app, rent).date, app.snap().left];
    app.at('2026-07-12'); app.toggle(rent);
    const julyDone = bev(app, { [rent]: 'rent' });
    app.advance('2026-08-02', mode);
    invariant('P2.bill.months.' + mode, 'June: one June settlement. July: the row comes back upcoming for 15 July and the June settlement remains (Monthly Left £2,900 from the row); completing July adds a distinct July settlement. August: June and July remain, the row is upcoming for 15 August, and nothing is recorded or inferred for August',
      [june, july, julyDone, bev(app, { [rent]: 'rent' }), active(app, { [rent]: 'rent' }), row(app, rent).status, row(app, rent).date],
      [[['completion', 'rent', '2026-06', 100]], [[['completion', 'rent', '2026-06', 100]], 'upcoming', '2026-07-15', 2900],
        [['completion', 'rent', '2026-06', 100], ['completion', 'rent', '2026-07', 100]],
        [['completion', 'rent', '2026-06', 100], ['completion', 'rent', '2026-07', 100]], [['rent', '2026-06', 100], ['rent', '2026-07', 100]], 'upcoming', '2026-08-15']);
  }));

  scenario('P2-4 BILL SMART IMPORT — an imported completed bill records the same evidence', () => {
    const app = new App(baseState(), '2026-06-20');
    const rent = bill(app, 'Rent', 100, '2026-06-15');
    app.smartImport([{ name: 'Plumber', amount: 90, date: '2026-06-10' }, { name: 'Holiday', amount: 60, date: '2026-06-11', link: 'goal:gH' },
      { name: 'Later', amount: 20, date: '2026-06-25' }, { name: 'Rent', amount: 100, date: '2026-06-15', mergeId: rent }]);
    app.reload();
    const plumber = app.state().payments.filter(p => p.name === 'Plumber')[0].id;
    invariant('P2.bill.import', 'Smart Import: a paid Plumber £90 added as new records a one-off settlement for June 2026 dated with its transaction date; a merge into the upcoming Rent row that completes it records Rent\'s June settlement; a goal-linked import and an upcoming (future) import record no bill evidence — also after reload',
      [completions(app).map(e => [e.paymentId === plumber ? 'plumber' : e.paymentId === rent ? 'rent' : e.paymentId, e.amount, e.occurrenceYm, e.dueDateSnapshot, e.recurrenceSnapshot, e.source]),
        app.state().billPaymentEvents.length],
      [[['plumber', 90, '2026-06', '2026-06-10', 'one_off', 'smart_import'], ['rent', 100, '2026-06', '2026-06-15', 'monthly', 'smart_import']], 2]);
  });

  scenario('P2-4 BILL SEED — load seeds only the settlement a paid bill row proves', () => {
    const provable = billRow('s1', { amount: 150, date: '2026-07-15', status: 'paid', lastPaidYM: '2026-06', lastPaidDueDate: '2026-06-15', lastPaidAmount: 100 });
    const ambiguous = [
      billRow('a1', { date: '2026-07-15', status: 'paid', lastPaidYM: '2026-06' }),
      billRow('a2', {}),
      billRow('a3', { rec: 'no', date: '2026-06-01', status: 'paid' }),
      billRow('a4', { date: '2026-10-15', status: 'paid', lastPaidYM: '2026-09', lastPaidDueDate: '2026-09-15', lastPaidAmount: 100 }),
      billRow('a5', { date: '2026-07-15', status: 'paid', lastPaidYM: 'June', lastPaidDueDate: '2026-06-15' }),
      billRow('a6', { date: '2026-07-15', status: 'paid', lastPaidYM: '2026-06', lastPaidDueDate: 'soon' }),
      billRow('a7', { date: '2026-07-15', status: 'paid', lastPaidYM: '2026-06', lastPaidDueDate: '2026-06-15', debtId: 'dC', payKind: 'debt' })
    ];
    const seeded = new App(baseState({ debts: [card()], payments: [provable].concat(ambiguous) }), '2026-06-20');
    invariant('P2.bill.seed', 'A paid monthly bill with a trusted lastPaidYM 2026-06 and the due date it settled (15 June) seeds exactly one settlement: June, £100 (its lastPaidAmount, not the £150 template), source migration; nothing else is reconstructed',
      completions(seeded).map(proof), [['s1', 100, '2026-06', '2026-06-15', 'monthly', 'Rent', 'migration', true]]);
    invariant('P2.bill.seed.ambiguous', 'Rows that do not prove a due period seed nothing: paid without lastPaidDueDate, unpaid, a paid one-off, a future lastPaidYM, a malformed lastPaidYM, a malformed due date, and a debt-linked row',
      seeded.state().billPaymentEvents.filter(e => e.paymentId !== 's1').length, 0);
    const once = JSON.stringify(seeded.state().billPaymentEvents);
    seeded.reload(); seeded.reload(); seeded.run('save();'); seeded.reload();
    const sameAfterReloads = JSON.stringify(seeded.state().billPaymentEvents) === once;
    seeded.advance('2026-07-02', 'reload'); seeded.reload();
    invariant('P2.bill.seed.idempotent', 'Three reloads and a save keep the seeded event byte-identical; the July load resets the row and seeds nothing more; the June settlement remains',
      [sameAfterReloads, bev(seeded), row(seeded, 's1').status], [true, [['completion', 's1', '2026-06', 100]], 'upcoming']);

    const july = new App(baseState({ payments: [provable] }), '2026-07-02');
    const annual = new App(baseState({ payments: [billRow('y1', { name: 'TV licence', amount: 170, rec: 'annual', date: '2027-03-10', status: 'paid', lastPaidYM: '2026-03', lastPaidDueDate: '2026-03-10', lastPaidAmount: 170 })] }), '2026-06-20');
    const witnessed = new App(baseState({ payments: [provable], billPaymentEvents: [
      { id: 'bpe_x_c1', eventType: 'completion', paymentId: 's1', amount: 100, occurrenceYm: '2026-06', dueDateSnapshot: '2026-06-15', recordedAt: 1, source: 'mark_completed' },
      { id: 'bpe_x_r1', eventType: 'reversal', paymentId: 's1', occurrenceYm: '2026-06', reversesEventId: 'bpe_x_c1', recordedAt: 2, source: 'mark_completed' }] }), '2026-06-20');
    invariant('P2.bill.seed.cases', 'First loaded in July, the paid June row seeds June before recurrence resets it; a paid annual bill seeds its March occurrence once; a payment the ledger has already seen (reversed June) is not seeded again',
      [bev(july), row(july, 's1').status, bev(annual), bev(witnessed)],
      [[['completion', 's1', '2026-06', 100]], 'upcoming', [['completion', 'y1', '2026-03', 170]], [['completion', 's1', '2026-06', 100], ['reversal', 's1', '2026-06', null]]]);

    const ledger = new App(baseState(), '2026-06-20');
    const list = [
      { id: 'c1', eventType: 'completion', paymentId: 'p', amount: 10, occurrenceYm: '2026-06', recordedAt: 1 },
      { id: 'c2', eventType: 'completion', paymentId: 'p', amount: 10, occurrenceYm: '2026-06', recordedAt: 2 },
      { id: 'c3', eventType: 'completion', paymentId: 'p', amount: 10, occurrenceYm: '2026-06', recordedAt: 3 },
      { id: 'r1', eventType: 'reversal', paymentId: 'p', occurrenceYm: '2026-07', reversesEventId: 'c1', recordedAt: 4 },
      { id: 'r2', eventType: 'reversal', paymentId: 'p', occurrenceYm: '2026-06', reversesEventId: 'c1', recordedAt: 5 },
      { id: 'r3', eventType: 'reversal', paymentId: 'p', occurrenceYm: '2026-06', reversesEventId: 'c1', recordedAt: 6 },
      {}, { id: 'z', eventType: 'completion', paymentId: 'p', amount: 0, occurrenceYm: '2026-08', recordedAt: 7 },
      { id: 'c1', eventType: 'completion', paymentId: 'q', amount: 5, occurrenceYm: '2026-06', recordedAt: 8 }];
    ledger.ctx.__list = JSON.stringify(list);
    invariant('P2.bill.normalise', 'The ledger rules: a reversal counts only for its completion\'s payment and month, once; at most one active completion per payment and month (earliest); invalid, zero-amount and duplicate-id events are dropped',
      JSON.parse(ledger.run('(function () { var l = geodeBillPaymentLedger(JSON.parse(__list)); return JSON.stringify([l.kept.map(function (e) { return e.id; }), l.active.map(function (e) { return e.id; })]); })()')),
      [['c1', 'c2', 'r2'], ['c2']]);
  });

  scenario('P2-4 BILL AUTHORITY — the ledger never moves Monthly Left or a position', () => {
    const app = new App(baseState({ debts: [card()] }), '2026-06-05');
    const rent = bill(app, 'Rent', 100, '2026-06-15'), vet = bill(app, 'Vet', 80, '2026-06-20', 'no'), gym = bill(app, 'Gym', 200, '2026-06-25', 'annual');
    const g = app.contribute({ name: 'Holiday', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    const i = app.contribute({ name: 'ISA', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' });
    const d = app.contribute({ intent: 'set', name: 'Card', amount: 50, date: '2026-06-15', status: 'upcoming', rec: 'yes', debtId: 'dC' });
    app.at('2026-06-16'); [rent, gym, g, i, d].forEach(id => app.toggle(id));
    const look = () => JSON.parse(app.run('geodeRecomputeBalancesFromPayments(); (function () { var s = JSON.parse(__snapshot()); return JSON.stringify([s.left, s.leftConfirmed, s.goal, s.inv, S.debts.map(function (x) { return x.balance; }), s.rows.map(function (r) { return r.countsInMonthlyLeft; })]); })()'));
    const withLedger = look();
    app.run('var __keepBills = S.billPaymentEvents; S.billPaymentEvents = [];');
    const empty = look();
    app.run('delete S.billPaymentEvents;');
    const absent = look();
    const forged = [];
    app.state().payments.forEach(p => ['2026-05', '2026-06', '2026-07'].forEach((ym, n) => forged.push({ id: 'f_' + p.id + n, eventType: 'completion', paymentId: p.id, amount: 9999, occurrenceYm: ym, recordedAt: n })));
    app.ctx.__forged = JSON.stringify(forged);
    app.run('S.billPaymentEvents = JSON.parse(__forged);');
    const flooded = look();
    app.run('S.billPaymentEvents = __keepBills;');
    invariant('P2.bill.monthly-left', 'Monthly Left (and its confirmed-only form) and each row\'s Monthly Left inclusion are identical with the recorded ledger, an empty ledger, no ledger key and a forged ledger settling every row in May–July at £9,999',
      [empty, absent, flooded].map(x => [x[0], x[1], x[5]]), [0, 1, 2].map(() => [withLedger[0], withLedger[1], withLedger[5]]));
    invariant('P2.bill.positions', 'Holiday, ISA and Card are the same under all four ledgers: the bill ledger cannot change a goal, investment or debt position',
      [empty, absent, flooded].map(x => [x[2], x[3], x[4]]), [0, 1, 2].map(() => [withLedger[2], withLedger[3], withLedger[4]]));

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
    invariant('P2.bill.readers', 'Functions that mention the bill ledger: only the ledger family, the backup whitelist, the P2-5 expectation settlement index (read-only correlation for evidence) and the P3-1 Living Month read model (read-only evidence, inert: tests/living-month-read-model.js); functions that call into it: the family, load (normalise + seed), togglePay, the payment form, Smart Import, that index and the read model\'s evidence index — no Monthly Left, recompute, goal, investment or debt function',
      [users('billPaymentEvents'), users('BillPayment')],
      [['geodeAppendBillCompletion', 'geodeBeyndBackupRestorableKeyWhitelist', 'geodeBillPaymentActiveCompletion', 'geodeBillPaymentEventId', 'geodeExpectationSettlementIndex',
        'geodeLivingMonthEvidenceIndex', 'geodeLivingMonthHappened', 'geodeLivingMonthPaymentEvidence', 'geodeNormalizeBillPaymentEvents',
        'geodeRecordBillPaymentTransition', 'geodeSeedBillPaymentEvents'],
      ['geodeAppendBillCompletion', 'geodeBillPaymentActiveCompletion', 'geodeBillPaymentEventId', 'geodeBillPaymentEventSnapshot', 'geodeBillPaymentEventValid', 'geodeBillPaymentLedger',
        'geodeExpectationSettlementIndex', 'geodeLivingMonthEvidenceIndex', 'geodeNormalizeBillPaymentEvents', 'geodeRecordBillPaymentTransition', 'geodeSavePayApply', 'geodeSeedBillPaymentEvents',
        'geodeSmartImportConfirm', 'load', 'togglePay']]);
    invariant('P2.bill.schema', 'The list stayed additive at schema 2; schema is 3 since P2-5; the backup whitelist carries it', [app.state()._schemaVersion, app.run('geodeBeyndBackupRestorableKeyWhitelist().indexOf("billPaymentEvents") >= 0')], [3, true]);
  });

  scenario('P2-4 BILL REGRESSION — P2-1 fence, P2-2 hold and P2-3 debt identity', () => {
    const st = new App(baseState(), '2026-06-05');
    const rent = bill(st, 'Rent', 100, '2026-06-15');
    const body = JSON.parse(rawStore(st));
    body.income = 3333;
    body._rev = { seq: body._rev.seq + 3, id: 'rev_bill_other', by: 'v1.0.77', at: 9 };
    const foreign = JSON.stringify(body);
    foreignStore(st, foreign);
    st.at('2026-06-10'); st.toggle(rent);
    const refused = [rawStore(st) === foreign, (JSON.parse(rawStore(st)).billPaymentEvents || []).length, staleState(st), relWarnings(st)];
    st.run('__reload();');
    invariant('P2.bill.stale', 'A bill completed in a tab another window has overtaken is refused by the P2-1 fence: the other window\'s text stays stored with no bill evidence; after reload the page adopts it (income £3,333, Rent upcoming, no settlement)',
      [refused, st.state().income, row(st, rent).status, bev(st)], [[true, 0, ['foreign', 'foreign'], ['stale:foreign']], 3333, 'upcoming', []]);

    const f = p1rFixture('P2');
    const held = JSON.parse(JSON.stringify(f.state));
    held.payments.push(billRow('bR', { date: '2026-09-15', status: 'paid', lastPaidYM: '2026-08', lastPaidDueDate: '2026-08-15', lastPaidAmount: 100 }),
      billRow('bP', { name: 'Phone', amount: 25, date: '2026-08-20' }));
    const page = p1rPage(held, '2026-09-02', P1R_PREVIOUS);
    const atLoad = [bev(page), row(page, 'bR').status, row(page, 'bP').date];
    page.toggle('bP');
    const afterToggle = bev(page);
    page.advance('2026-10-02', 'reload'); page.advance('2026-11-02', 'reload');
    const months = bev(page);
    p1rReady(page); page.reload(); page.reload();
    invariant('P2.bill.hold', 'v1.0.76 data first loaded in September with the boundary held: the paid August Rent row is held paid and seeds only its August settlement; completing the held Phone (still due 20 August) records August, not September; October and November held loads add nothing; the ready load resets the rows and keeps exactly those two settlements',
      [atLoad, afterToggle, months, bev(page), [row(page, 'bR').status, row(page, 'bP').status]],
      [[[['completion', 'bR', '2026-08', 100]], 'paid', '2026-08-20'], [['completion', 'bR', '2026-08', 100], ['completion', 'bP', '2026-08', 25]],
        [['completion', 'bR', '2026-08', 100], ['completion', 'bP', '2026-08', 25]], [['completion', 'bR', '2026-08', 100], ['completion', 'bP', '2026-08', 25]], ['upcoming', 'upcoming']]);

    const dbt = new App(baseState({ debts: [card()] }), '2026-06-05');
    const m50 = dbt.contribute({ intent: 'set', name: 'Card monthly', amount: 50, date: '2026-06-15', status: 'upcoming', rec: 'yes', debtId: 'dC' });
    const o100 = dbt.contribute({ intent: 'set', name: 'Card extra', amount: 100, date: '2026-06-20', status: 'upcoming', rec: 'no', debtId: 'dC' });
    const water = bill(dbt, 'Water', 30, '2026-06-15');
    dbt.at('2026-06-20'); dbt.toggle(m50); dbt.toggle(water); dbt.merge();
    invariant('P2.bill.debt', 'P2-3 unchanged beside bills: the £50 monthly and £100 one-off card payments stay two rows; completing the monthly writes one debt event and no bill event; completing the Water bill writes one bill event and no debt event; Card stays £4,000',
      [m50 !== o100, dbt.state().payments.filter(p => p.debtId === 'dC').map(p => [p.rec, p.amount]).sort(), dbt.state().debtPaymentEvents.map(e => e.paymentId === m50),
        bev(dbt).map(e => e[1] === water), dbt.state().debts[0].balance],
      [true, [['no', 100], ['yes', 50]], [true], [true], 4000]);
  });

  scenario('P2-4 BILL MUTATIONS — each guard is what produces its result', () => {
    const toggled = () => { const app = new App(baseState(), '2026-06-05'); const id = bill(app, 'Rent', 100, '2026-06-15'); app.at('2026-06-10'); return [app, id]; };

    const [a, ar] = toggled();
    mutate(a, 'togglePay', "geodeRecordBillPaymentTransition(_bpeBefore, p, 'mark_completed');", '');
    a.toggle(ar);
    invariant('P2.bill.mut.record', 'Without the togglePay call, completing Rent records nothing — that call is the evidence source', a.state().billPaymentEvents.length, 0);

    const [b, br] = toggled();
    mutate(b, 'geodeRecordBillPaymentTransition', "source === 'mark_completed' && before ? before.date : after.date", 'after.date');
    b.toggle(br);
    invariant('P2.bill.mut.due', 'Reading the due date after togglePay advanced the row records July for a June completion — capturing it before the advance is what keeps June', bev(b).map(e => e[2]), ['2026-07']);

    const [c, cr] = toggled();
    mutate(c, 'geodeRecordBillPaymentTransition', 'if (!before.bill) return;', 'return;');
    c.toggle(cr); c.toggle(cr);
    invariant('P2.bill.mut.reverse', 'Without the reversal branch, undo leaves the June settlement active — the reversal is what withdraws it', active(c).length, 1);

    const future = billRow('a4', { date: '2026-10-15', status: 'paid', lastPaidYM: '2026-09', lastPaidDueDate: '2026-09-15', lastPaidAmount: 100 });
    const d = new App(baseState({ payments: [future] }), '2026-06-20', undefined, { boot: false });
    mutate(d, 'geodeSeedBillPaymentEvents', "!geodeContributionYmTrusted(String(p.lastPaidYM || ''))", '!geodeContributionYmValid(String(p.lastPaidYM || \'\'))');
    d.reload();
    invariant('P2.bill.mut.seed', 'Accepting an untrusted (future) lastPaidYM seeds a September settlement that never happened — the trust check is what refuses it', bev(d), [['completion', 'a4', '2026-09', 100]]);

    const e = new App(baseState(), '2026-06-05');
    const er = bill(e, 'Rent', 100, '2026-06-15');
    mutate(e, 'geodeAppendBillCompletion', 'if (existing) return existing;', '');
    e.at('2026-06-10'); e.toggle(er);
    e.call('geodeRecordBillPaymentTransition', [{ id: er, status: 'upcoming', date: '2026-06-15', lastPaidDueDate: '', bill: true }, JSON.parse(e.run('JSON.stringify(S.payments[0])')), 'mark_completed']);
    invariant('P2.bill.mut.once', 'Without the one-active check, recording the same June completion again appends a second completion — the check is what keeps one', completions(e).length, 2);
  });
}

function p2RevisionFence() {
  const UNFENCED_LOG = '? [geode] unfenced financial write observed; this write proceeds';
  const pageOn = (raw, clock) => {
    const app = new App(JSON.parse(raw), clock || '2026-06-05', undefined, { boot: false });
    app.run('__store = ' + JSON.stringify(raw) + '; __reload();');
    return app;
  };
  scenario('P2-1 REVISION — a stale same-runtime write is refused and a reload adopts the newer text', () => {
    const origin = schema2App();
    const parent = rawStore(origin);
    const tabA = pageOn(parent);
    const tabB = pageOn(parent);
    invariant('P2.boot.shared', 'Two pages loaded from one stored text observe that exact text and its revision',
      [rawStore(tabA) === parent, rawStore(tabB) === parent, tabA.run('_geodeKnownRaw === __store'), tabB.run('JSON.stringify(_geodeKnownRev)')],
      [true, true, true, tabA.run('JSON.stringify(_geodeKnownRev)')]);
    tabA.contribute({ name: 'Top-up', amount: 50, date: '2026-06-05', status: 'paid', goalId: 'gH' });
    const newer = rawStore(tabA);
    const revA = JSON.parse(newer)._rev;
    invariant('P2.write.stamp', 'Tab A\'s save advances seq, mints a new id, names this runtime and stores state and revision in one text',
      [newer !== parent, revA.seq, typeof revA.id === 'string' && revA.id.indexOf('rev_') === 0, revA.by, typeof revA.at === 'number',
        tabA.run('_geodeKnownRaw === __store'), JSON.parse(newer).payments.length],
      [true, JSON.parse(parent)._rev.seq + 1, true, 'v1.0.78', true, true, JSON.parse(parent).payments.length + 1]);

    foreignStore(tabB, newer);
    tabB.run('S.lastSeenAt = 1; persistGeodeToLocalStorage();');
    const afterPersist = [rawStore(tabB) === newer, staleState(tabB), relWarnings(tabB)];
    tabB.run('S.income = 1; save();');
    const afterSave = rawStore(tabB) === newer;
    tabB.at('2026-07-02');
    tabB.render();
    invariant('P2.stale.refused', 'After A\'s fenced write, B\'s lastSeen persist, an unrelated save and a July recurrence roll all leave A\'s text untouched and B stays foreign-stale',
      [afterPersist, afterSave, rawStore(tabB) === newer, staleState(tabB)],
      [[true, ['foreign', 'foreign'], ['stale:foreign']], true, true, ['foreign', 'foreign']]);

    relListen(tabA);
    fireStorage(tabA, 'geode_v6', newer);
    invariant('P2.echo', 'A storage event carrying the text this page just wrote does not stop it',
      [staleState(tabA), relWarnings(tabA)], [['', ''], []]);

    tabB.run('__reload();');
    const adopted = [staleState(tabB), rawStore(tabB) === newer, tabB.run('S.payments.length')];
    tabB.contribute({ name: 'After reload', amount: 25, date: '2026-07-02', status: 'paid', goalId: 'gH' });
    const again = JSON.parse(rawStore(tabB))._rev;
    invariant('P2.reload', 'Reload clears the gate, adopts A\'s text and can write the next revision',
      [adopted, again.seq, again.id !== revA.id, staleState(tabB)],
      [[ ['', ''], true, JSON.parse(newer).payments.length ], revA.seq + 1, true, ['', '']]);
  });

  scenario('P2-1 REVISION — deleted, newer, unfenced, quota and a disabled fence', () => {
    const origin = schema2App();
    const parent = rawStore(origin);
    const kept = pageOn(parent);
    foreignStore(kept, null);
    kept.run('save();');
    invariant('P2.deleted', 'KEY removed after this page saw it: no write, changed gate',
      [rawStore(kept), staleState(kept), relWarnings(kept)], [null, ['changed', 'changed'], ['stale:changed']]);

    const newer = pageOn(parent);
    foreignStore(newer, withSchema(parent, 4));
    newer.run('persistGeodeToLocalStorage();');
    invariant('P2.newer', 'Stored schema 4 (newer than this schema-3 runtime) is still refused before any revision check',
      [rawStore(newer) === withSchema(parent, 4), staleState(newer), relWarnings(newer)], [true, ['newer', 'newer'], ['stale:newer']]);

    const old = pageOn(parent);
    const unfenced = JSON.parse(parent);
    unfenced.income = 2222;
    foreignStore(old, JSON.stringify(unfenced));
    old.run('S.income = 3333; save();');
    const storedOld = JSON.parse(rawStore(old));
    invariant('P2.unfenced', 'An older runtime that rewrites the same revision id is logged and last-writer-wins; this page then mints the next revision',
      [storedOld.income, storedOld._rev.seq, storedOld._rev.id !== unfenced._rev.id, staleState(old), relWarnings(old)],
      [3333, unfenced._rev.seq + 1, true, ['', ''], [UNFENCED_LOG]]);

    const quota = pageOn(parent);
    const beforeRev = quota.run('JSON.stringify(S._rev)');
    quota.run('S.lastSeenAt = 9; __storageFault = "throw"; persistGeodeToLocalStorage();');
    const thrown = [rawStore(quota) === parent, quota.run('JSON.stringify(S._rev)') === beforeRev, quota.run('_geodeKnownRaw === __store'), JSON.parse(quota.run('JSON.stringify(__toasts)'))];
    quota.run('__runTimers(); S.lastSeenAt = 10; __storageFault = "lose"; __toasts = []; persistGeodeToLocalStorage();');
    const lost = [rawStore(quota) === parent, quota.run('JSON.stringify(S._rev)') === beforeRev, quota.run('_geodeKnownRaw === __store'), JSON.parse(quota.run('JSON.stringify(__toasts)'))];
    invariant('P2.quota', 'A throwing setItem and a write that does not read back leave the stored text, in-memory revision and knownRaw where they were',
      [thrown, lost], [[true, true, true, ['Could not save data (storage may be full).']], [true, true, true, ['Could not save data (storage may be full).']]]);

    const disabled = pageOn(parent);
    const victim = JSON.parse(parent);
    victim.income = 4444;
    victim._rev = { seq: victim._rev.seq + 5, id: 'rev_fenced_other', by: 'v1.0.77', at: 2 };
    const victimRaw = JSON.stringify(victim);
    foreignStore(disabled, victimRaw);
    disabled.run('geodeClassifyFinancialRevision = function () { return "unfenced"; }; S.income = 5555; save();');
    invariant('P2.fence.disabled', 'With revision classification forced to unfenced, the same foreign text is overwritten — the refusal depends on the classifier',
      [JSON.parse(rawStore(disabled)).income !== 4444, staleState(disabled)], [true, ['', '']]);
    relWarnings(disabled);
  });

  scenario('P2-1 REVISION — a stale modal does not begin a commit', () => {
    const origin = schema2App();
    const parent = rawStore(origin);
    const tab = pageOn(parent);
    const fenced = JSON.parse(parent);
    fenced._rev = { seq: fenced._rev.seq + 1, id: 'rev_modal_other', by: 'v1.0.77', at: 3 };
    fenced.income = 4600;
    foreignStore(tab, JSON.stringify(fenced));
    tab.run('openModal("<p>edit</p>");');
    const began = tab.run('geodeModalCommitBegin()');
    const again = tab.run('geodeModalCommitBegin()');
    invariant('P2.modal.stale', 'geodeModalCommitBegin uses the same admission check: a fenced foreign text refuses the commit before the flag is taken, and the stored text stays',
      [began, again, tab.run('document.getElementById("modal").getAttribute("data-geode-commit")'), rawStore(tab) === JSON.stringify(fenced), staleState(tab), relWarnings(tab)],
      [false, false, null, true, ['foreign', 'foreign'], ['stale:foreign']]);
    const fresh = pageOn(parent);
    fresh.run('openModal("<p>edit</p>");');
    const first = fresh.run('geodeModalCommitBegin()');
    const second = fresh.run('geodeModalCommitBegin()');
    invariant('P2.modal.once', 'A modal whose storage is still the text this page loaded still commits once',
      [first, second, fresh.run('document.getElementById("modal").getAttribute("data-geode-commit")')], [true, false, '1']);
  });
}

// P2-10: seq orders revisions before identity is consulted, and every page load mints ids under its own writer token.

function p2RevisionIdentity() {
  const UNFENCED_LOG = '? [geode] unfenced financial write observed; this write proceeds';
  const FOREIGN = ['foreign', 'foreign'];
  const ID = /^rev_([0-9a-f]{16})_(\d+)$/;
  const pageOn = (raw, clock) => {
    const app = new App(JSON.parse(raw), clock || '2026-06-05', undefined, { boot: false });
    app.run('__store = ' + JSON.stringify(raw) + '; __reload();');
    return app;
  };
  const known = app => JSON.parse(app.run('JSON.stringify(_geodeKnownRev)'));
  const revOf = raw => JSON.parse(raw)._rev;
  /** Stored schema-3 data whose revision a pre-P2-10 page minted (rev_4, seq 4): the R3 pages then write seq 5, 6 and 7. */
  const PARENT = () => {
    const p = JSON.parse(rawStore(schema2App()));
    p._rev = { seq: 4, id: 'rev_4', by: 'v1.0.78', at: new Date(2026, 5, 4, 12).getTime() };
    return JSON.stringify(p);
  };
  /** from with its revision replaced (null: removed) and income set. */
  const text = (from, rev, income) => {
    const p = JSON.parse(from);
    if (rev === null) delete p._rev; else p._rev = rev;
    p.income = income;
    return JSON.stringify(p);
  };
  /** The pre-P2-10 classifier and id generator, for the mutation checks. */
  const OLD_CLASSIFIER = `function (raw) {
    var rev = geodeFinancialRevFromRaw(raw);
    if (!rev || !geodeFinancialRevValid(_geodeKnownRev)) return rev ? 'fenced' : 'unfenced';
    if (rev.id === _geodeKnownRev.id) return 'unfenced';
    if (rev.seq >= _geodeKnownRev.seq) return 'fenced';
    return 'unfenced';
  }`;
  const OLD_REV_ID = `function () {
    _geodeRevN += 1;
    var id = 'rev_' + _geodeRevN;
    if (_geodeKnownRev && id === _geodeKnownRev.id) { _geodeRevN += 1; id = 'rev_' + _geodeRevN; }
    return id;
  }`;
  const oldClassifier = app => app.run('geodeClassifyFinancialRevision = (' + OLD_CLASSIFIER + ');');
  const oldRevId = app => app.run('geodeFinancialRevId = (' + OLD_REV_ID + ');');

  /**
   * The P2-CLOSE-R3 sequence. B writes (seq 5), then misses every storage event. A, loaded from B's text, records a
   * confirmed £61 Holiday contribution (seq 6), reloads, and saves an income edit (seq 7). Then B saves.
   * o.mut(app): alters each page. o.force: A's reloaded page takes B's writer token and counter, so its next id equals
   * the id B knows. o.listen: B hears each of A's writes through the production storage listener.
   */
  const r3 = o => {
    o = o || {};
    const mut = o.mut || (() => {});
    const B = pageOn(PARENT());
    mut(B);
    if (o.listen) relListen(B);
    B.run('S.income = 3101; save()');
    const bRev = known(B);
    const A = pageOn(rawStore(B));
    mut(A);
    const paid = A.contribute({ name: 'Paid in A', amount: 61, date: '2026-06-05', status: 'paid', goalId: 'gH' });
    const raw6 = rawStore(A);
    if (o.listen) fireStorage(B, 'geode_v6', raw6);
    A.run('__reload();');
    if (o.force) {
      const m = ID.exec(bRev.id);
      A.run('_geodeRevWriter = ' + JSON.stringify(m[1]) + '; _geodeRevN = ' + (Number(m[2]) - 1) + ';');
    }
    A.run('S.income = 3456; save()');
    const theirs = rawStore(A), rev7 = revOf(theirs);
    if (o.listen) fireStorage(B, 'geode_v6', theirs);
    const staleBefore = staleState(B)[0];
    foreignStore(B, theirs);
    const bSave = B.run('S.goals[0].baseSaved = 1700; save()');
    const after = stored(B);
    relWarnings(A);
    return {
      ids: [bRev.id, revOf(raw6).id, rev7.id], seqs: [bRev.seq, revOf(raw6).seq, rev7.seq], staleBefore,
      outcome: [bSave, rawStore(B) === theirs, after.payments.some(p => p.id === paid && p.status === 'paid'),
        (after.contributionEvents || []).filter(e => e.paymentId === paid).length, after.income, after._rev.seq, staleState(B), relWarnings(B)]
    };
  };
  const REFUSED = [['refused', true, true, 1, 3456, 7, FOREIGN, ['stale:foreign']]];
  const OVERWRITTEN = [['saved', false, false, 0, 3101, 6, ['', ''], [UNFENCED_LOG]]];

  scenario('P2-10 REVISION ORDER — seq decides before identity: the classification truth table', () => {
    const parent = PARENT();
    const base = revOf(parent);
    const legacy = text(parent, null, JSON.parse(parent).income);
    const rev = o => Object.assign({}, base, o);
    const CASES = [
      ['A exact stored text', parent, parent],
      ['B same id, same seq, by and at (this revision carried over), other text', parent, text(parent, rev({}), 2222)],
      ['B2 same id, same seq, other at', parent, text(parent, rev({ at: base.at + 1 }), 2222)],
      ['C same id, higher seq', parent, text(parent, rev({ seq: 7 }), 2222)],
      ['D same id, lower seq', parent, text(parent, rev({ seq: 3 }), 2222)],
      ['E other id, higher seq', parent, text(parent, rev({ seq: 5, id: 'rev_other_1' }), 2222)],
      ['F other id, same seq', parent, text(parent, rev({ id: 'rev_other_1' }), 2222)],
      ['G other id, lower seq', parent, text(parent, rev({ seq: 3, id: 'rev_other_1' }), 2222)],
      ['H stored text without a revision', parent, text(parent, null, 2222)],
      ['H2 page knows no revision, stored has one', legacy, text(legacy, rev({ seq: 1, id: 'rev_other_1' }), 2222)],
      ['H3 neither has a revision', legacy, text(legacy, null, 2222)],
      ['I newer schema, same revision', parent, withSchema(text(parent, rev({}), 2222), 4)],
      ['I2 newer schema, higher seq', parent, withSchema(text(parent, rev({ seq: 9 }), 2222), 4)],
      ['J KEY removed', parent, null]
    ];
    const decided = (page, raw) => raw === null || raw === rawStore(page) || JSON.parse(raw)._schemaVersion !== page.run('S._schemaVersion');
    const table = CASES.map(([label, from, raw]) => {
      const page = pageOn(from);
      const cls = decided(page, raw) ? '-' : (foreignStore(page, raw), page.run('geodeClassifyFinancialRevision(__store)'));
      foreignStore(page, raw);
      const result = page.run('S.income = 4321; save()');
      return [label, cls, result, rawStore(page) === raw, staleState(page)[0], relWarnings(page)];
    });
    const saved = l => [l, 'unfenced', 'saved', false, '', [UNFENCED_LOG]];
    const refused = (l, cls, why) => [l, cls, 'refused', true, why || 'foreign', ['stale:' + (why || 'foreign')]];
    const L = CASES.map(c => c[0]);
    invariant('P2.rev.table', 'Exact text: written. A valid stored revision with a higher seq is refused whatever its id (C — the R3 blocker — and E). Same seq: refused unless it is the very revision this page knows, carried over by a writer without the fence (B written and logged, B2 and F refused). Lower seq, or no stored revision, keeps the P2-1 last-writer-wins policy for writers without the fence (D, G, H, H3 written and logged); a page that knows no revision refuses a stored one (H2). Newer schema and a removed KEY are refused before any revision check',
      table, [[L[0], '-', 'saved', false, '', []], saved(L[1]), refused(L[2], 'fenced'), refused(L[3], 'fenced'), saved(L[4]), refused(L[5], 'fenced'),
        refused(L[6], 'fenced'), saved(L[7]), saved(L[8]), refused(L[9], 'fenced'), saved(L[10]), refused(L[11], '-', 'newer'), refused(L[12], '-', 'newer'),
        refused(L[13], '-', 'changed')]);

    const events = CASES.map(([label, from, raw]) => {
      const page = pageOn(from);
      page.ctx.__raw = raw;
      page.run('geodeOnForeignFinancialWrite(__raw)');
      relWarnings(page);
      return [label, staleState(page)[0]];
    });
    invariant('P2.rev.event', 'The storage listener uses the same classifier: each foreign text stops a page through the event exactly when the page\'s own next write would be refused',
      events, table.map(r => [r[0], r[4]]));
  });

  scenario('P2-10 R3 — a page that missed storage events is not aliased by a reloaded writer', () => {
    const run = r3();
    const [b, a6, a7] = run.ids.map(id => ID.exec(id));
    invariant('P2.rev.r3', 'B (seq 5) misses every event; A records the confirmed £61 Holiday contribution (seq 6), reloads and saves an income edit (seq 7) under a new writer token; B\'s save is refused: storage stays byte-identical to A\'s seq-7 text — the paid row, its one contribution event and the income edit kept, seq not moved back — and B shows the reload gate',
      [run.seqs, !!(b && a6 && a7), a6 && a7 && a6[1] !== a7[1], new Set(run.ids).size, run.outcome], [[5, 6, 7], true, true, 3, REFUSED[0]]);

    const forced = r3({ force: true });
    invariant('P2.rev.forced', 'Forced collision: A\'s reloaded page is given B\'s writer token and counter, so storage holds the very id B knows at seq 7 against B\'s seq 5. B is still refused and A\'s text kept — the refusal rests on seq, not on ids being random',
      [forced.seqs, forced.ids[2] === forced.ids[0], forced.outcome], [[5, 6, 7], true, REFUSED[0]]);

    const heard = r3({ listen: true });
    invariant('P2.rev.r3.event', 'With the storage events delivered, B already stops at A\'s first write; its save is refused the same way',
      [heard.staleBefore, heard.outcome], ['foreign', REFUSED[0]]);
  });

  scenario('P2-10 MISSED EVENTS — the next write re-reads storage; the storage event is only a signal', () => {
    const origin = schema2App();
    const rent = origin.contribute({ name: 'Rent', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes' });
    const parent = rawStore(origin);
    const A = pageOn(parent), B1 = pageOn(parent), B2 = pageOn(parent);
    A.at('2026-06-10'); A.toggle(rent);
    A.run('__reload();'); A.run('S.income = 3456; save()');
    const theirs = rawStore(A);
    [B1, B2].forEach(b => { b.at('2026-06-10'); foreignStore(b, theirs); });
    B1.toggle(rent);
    B2.editPayment(rent, { amount: 120 });
    const look = b => [rawStore(b) === theirs, staleState(b), relWarnings(b), b.state().payments.filter(p => p.id === rent).map(p => [p.status, p.amount])[0]];
    invariant('P2.rev.missed', 'A completes Rent, reloads and edits income; neither B page hears it. B1\'s completion and B2\'s edit each re-read storage at admission, are refused before any change (Rent still upcoming £100 in their memory) and leave A\'s text byte-identical',
      [look(B1), look(B2), stored(A).payments.filter(p => p.id === rent).map(p => p.status)[0], stored(A).income],
      [[true, FOREIGN, ['stale:foreign'], ['upcoming', 100]], [true, FOREIGN, ['stale:foreign'], ['upcoming', 100]], 'paid', 3456]);
    relWarnings(A);
  });

  scenario('P2-10 REVISION IDENTITY — every page load is a new writer; seq only moves forward', () => {
    const page = pageOn(PARENT());
    const ids = [], seqs = [];
    const note = app => { const r = revOf(rawStore(app)); ids.push(r.id); seqs.push(r.seq); };
    const write = (app, n) => { app.run('S.income = ' + n + '; save()'); note(app); };
    write(page, 3001); write(page, 3002); write(page, 3003);
    page.run('__reload();'); write(page, 3004); write(page, 3005);
    page.run('__reload();'); write(page, 3006);
    write(pageOn(rawStore(page)), 3007);
    const parts = ids.map(id => ID.exec(id));
    const tokens = parts.map(m => m && m[1]);
    invariant('P2.rev.identity', 'Each new id is rev_<16-hex page token>_<counter>: one page\'s writes share its token and differ by counter; each reload, and another page loaded from the stored text, starts a new token at counter 1; no id repeats',
      [parts.every(Boolean), parts.map(m => m && Number(m[2])), new Set(tokens).size, tokens[0] === tokens[2], tokens[2] !== tokens[3], tokens[4] !== tokens[5], new Set(ids).size],
      [true, [1, 2, 3, 1, 2, 1, 1], 4, true, true, true, 7]);
    invariant('P2.rev.monotonic', 'Seq rises by exactly one on every successful write — from the stored 4 through one page, across two reloads and in a second page that adopted the stored text; no successful write lowers it',
      seqs, [5, 6, 7, 8, 9, 10, 11]);

    const twins = [pageOn(rawStore(page)), pageOn(rawStore(page))];
    const many = new Set(), cycler = pageOn(rawStore(page));
    for (let i = 0; i < 200; i++) { cycler.run('__reload(); S.income = ' + (4000 + i) + '; save()'); many.add(revOf(rawStore(cycler)).id); }
    invariant('P2.rev.unique', 'Two pages loaded from the same text at the same moment hold different writer tokens; 200 reload-and-write cycles mint 200 different ids',
      [twins[0].run('_geodeRevWriter') !== twins[1].run('_geodeRevWriter'), many.size], [true, 200]);

    const token = setup => { const t = pageOn(rawStore(page)); t.run(setup); return t.run('geodeRevWriterToken()'); };
    invariant('P2.rev.token', 'The token is 16 hex characters from crypto.getRandomValues when the browser has it; Math.random fills it when crypto is missing or throws. Timestamps play no part',
      [token('var crypto = { getRandomValues: function (a) { for (var i = 0; i < a.length; i++) a[i] = i * 17; return a; } };'),
        token('var crypto = { getRandomValues: function () { throw new Error("no entropy"); } }; Math.random = function () { return 0.5; };'),
        token('Math.random = function () { return 0.25; };'),
        token('Math.random = function () { return 0.25; }; __nowMs += 86400000;')],
      ['0011223344556677', '8000800080008000', '4000400040004000', '4000400040004000']);

    invariant('P2.rev.fidelity', 'The harness runs production\'s token, generator, stamp and classifier unchanged; a page starts as production\'s does (counter 0, a fresh token) and the reload shim starts a new page the same way',
      [['geodeRevWriterToken', 'geodeFinancialRevId', 'geodeStampFinancialRev', 'geodeClassifyFinancialRevision'].map(n => PROGRAM.extracted.some(f => f.name === n && f.text === extractFunction(PROGRAM.src, n).text)),
        /var _geodeRevN = 0;\s*var _geodeRevWriter = geodeRevWriterToken\(\);/.test(PROGRAM.src), TEST_SHIMS.indexOf('_geodeRevN = 0; _geodeRevWriter = geodeRevWriterToken();') > 0],
      [[true, true, true, true], true, true]);
  });

  scenario('P2-10 OLD REVISION IDS — pre-P2-10 rev_N ids stay readable and seq still orders them', () => {
    const parent = PARENT();
    const page = pageOn(parent);
    const before = known(page);
    page.run('S.income = 3001; save()');
    const next = revOf(rawStore(page));
    const base = revOf(parent);
    const newer = pageOn(parent), carried = pageOn(parent);
    foreignStore(newer, text(parent, Object.assign({}, base, { seq: 5 }), 2222)); newer.run('S.income = 1; save()');
    foreignStore(carried, text(parent, base, 2222)); carried.run('S.income = 1; save()');
    invariant('P2.rev.old', 'A page that loaded a rev_4 (seq 4) text knows it and writes seq 5 under a new-format id. Against a page that knows rev_4/4: rev_4 at seq 5 is newer and refused; rev_4/4 carried over with other text keeps the P2-1 legacy policy (written, logged). No migration, schema 3',
      [[before.id, before.seq], [next.seq, ID.test(next.id)], [staleState(newer)[0], relWarnings(newer)], [staleState(carried)[0], relWarnings(carried), stored(carried).income], stored(page)._schemaVersion],
      [['rev_4', 4], [5, true], ['foreign', ['stale:foreign']], ['', [UNFENCED_LOG], 1], 3]);
  });

  scenario('P2-10 RACE — localStorage has no compare-and-set; once storage settles the losing page is refused', () => {
    const parent = PARENT();
    const race = (forceSameId, listen) => {
      const C = pageOn(parent), D = pageOn(parent);
      if (forceSameId) D.run('_geodeRevWriter = ' + JSON.stringify(C.run('_geodeRevWriter')) + '; __nowMs += 1;');
      if (listen) { relListen(D); relListen(C); }
      // Both were admitted against the parent text before either write landed: D's setItem first, then C's.
      const dResult = D.run('S.goals[0].baseSaved = 1300; save()');
      const dRaw = rawStore(D);
      const cResult = C.run('S.income = 3333; save()');
      // As the browser delivers it: C hears D's write only after its own setItem.
      if (listen) fireStorage(C, 'geode_v6', dRaw);
      const settled = rawStore(C);
      const dRev = known(D), cRev = revOf(settled);
      if (listen) fireStorage(D, 'geode_v6', settled);
      foreignStore(D, settled);
      const dNext = D.run('S.income = 3444; save()');
      const cNext = C.run('S.lastSeenAt = 7; save()');
      const out = [[dResult, cResult], [dRev.seq, cRev.seq, dRev.id === cRev.id], stored(C).goals[0].baseSaved, dNext, rawStore(D) === settled,
        stored(C).income, cNext, staleState(D), relWarnings(D), relWarnings(C)];
      return out;
    };
    const plain = race(false), sameId = race(true), heard = race(false, true);
    const LOST = plain[2];
    current('P2.limit.race', 'Platform limitation, not repaired (no CAS in localStorage): two pages admitted against the same text before either write lands both write seq 5, and the later setItem (C\'s) replaces the earlier (D\'s Holiday base 1300 is gone from storage)',
      [plain[0], plain[1].slice(0, 2), LOST], [['saved', 'saved'], [5, 5], 1000]);
    const after = r => r.slice(3);
    invariant('P2.rev.race', 'Once storage settles on C\'s text the loser D is refused on its next write (other id, same seq) and C\'s text stays; C keeps writing. With D forced onto C\'s writer token (the same id at the same seq, a different at) D is still refused. With the storage events delivered both pages stop — D on hearing C\'s write, C on hearing D\'s, which arrives after its own write and cannot be ordered against it — so C\'s stored text stays and both reload',
      [after(plain), sameId[1][2], after(sameId), after(heard)],
      [['refused', true, 3333, 'saved', FOREIGN, ['stale:foreign'], []], true, ['refused', true, 3333, 'saved', FOREIGN, ['stale:foreign'], []],
        ['refused', true, 3333, 'refused', FOREIGN, ['stale:foreign'], ['stale:foreign']]]);
  });

  scenario('P2-10 STALE BEFORE THE BOUNDARY — a newer foreign revision is refused before any month boundary or change (P2-8)', () => {
    const origin = new App(baseState(), '2026-06-01');
    const rent = origin.contribute({ name: 'Rent', amount: 80, date: '2026-06-15', status: 'upcoming', rec: 'yes' });
    origin.at('2026-06-15'); origin.toggle(rent);
    const parent = rawStore(origin);
    const foreign = JSON.parse(parent);
    foreign._rev = Object.assign({}, foreign._rev, { seq: foreign._rev.seq + 2 });
    foreign.income = 3999;
    const theirs = JSON.stringify(foreign);
    const MEM = 'JSON.stringify([S.payments, S.expectationGaps, S.billPaymentEvents, S.contributionEvents, S.income])';
    const attempt = act => {
      const page = pageOn(parent, '2026-06-20');
      foreignStore(page, theirs);
      page.at('2026-08-03');
      const before = page.run(MEM);
      act(page);
      return [page.run(MEM) === before, rawStore(page) === theirs, staleState(page), relWarnings(page)];
    };
    const look = [true, true, FOREIGN, ['stale:foreign']];
    invariant('P2.rev.boundary', 'A June page with June and July boundaries pending; storage holds the same revision id it knows at a higher seq. Its first act on 3 August — editing Rent, or completing it — is refused at admission: no boundary captured, no row rolled, no edit, storage byte-identical',
      [attempt(p => p.editPayment(rent, { amount: 150 })), attempt(p => p.toggle(rent))], [look, look]);
  });

  scenario('P2-10 FAILED WRITES — rollback keeps the committed revision; nothing that failed is resurrected (P2-9)', () => {
    const page = pageOn(PARENT());
    page.run('S.income = 3001; save()');
    const committed = rawStore(page), rev1 = revOf(committed);
    const fail = fault => {
      page.run('__storageFault = ' + JSON.stringify(fault) + '; S.income = 9999; S.goals[0].baseSaved = 7777;');
      const r = page.run('save()');
      const look = [r, rawStore(page) === committed, page.run('JSON.stringify(S._rev)') === JSON.stringify(rev1), page.run('S.income'),
        page.run('_geodeKnownRaw === __store'), page.run('_geodeCommittedText') === committed];
      page.run('__storageFault = ""; __runTimers(); __toasts = [];');
      return look;
    };
    const thrown = fail('throw'), lost = fail('lose');
    page.run('S.lastSeenAt = 5; save()');
    const next = stored(page);
    const FAILED = ['failed', true, true, 3001, true, true];
    invariant('P2.rev.failed', 'A throwing setItem and a write that does not read back each leave storage, the in-memory revision, knownRaw and the committed text where they were; the next successful write is seq + 1 under a new id and carries neither failed change',
      [thrown, lost, [next._rev.seq, next._rev.id !== rev1.id, next.income, next.goals[0].baseSaved !== 7777]], [FAILED, FAILED, [rev1.seq + 1, true, 3001, true]]);
  });

  scenario('P2-10 MUTATIONS — the seq-first classifier and the writer token are each load-bearing', () => {
    const oldBoth = r3({ mut: app => { oldClassifier(app); oldRevId(app); } });
    invariant('P2.rev.mut.r3', 'With the pre-P2-10 classifier and page-local rev_N ids together, the R3 sequence reproduces the defect: A\'s reloaded page re-mints the id B knows, B\'s stale save is written, the paid row, its event and the income edit are lost and seq moves back',
      [oldBoth.ids[2] === oldBoth.ids[0], oldBoth.outcome], [true, OVERWRITTEN[0]]);
    const oldCls = r3({ force: true, mut: oldClassifier });
    invariant('P2.rev.mut.classifier', 'The pre-P2-10 classifier alone (matching id → unfenced before seq) loses the same data under the forced collision — the seq-first order is what refuses it',
      [oldCls.ids[2] === oldCls.ids[0], oldCls.outcome], [true, OVERWRITTEN[0]]);
    const oldIds = r3({ mut: oldRevId });
    invariant('P2.rev.mut.ids', 'The pre-P2-10 generator alone collides on reload (the identity coverage catches it: A\'s seq-7 id equals B\'s), and the seq-first classifier still refuses B',
      [oldIds.ids, oldIds.outcome], [['rev_1', 'rev_2', 'rev_1'], REFUSED[0]]);
  });
}

function p1RelOldWriter() {
  scenario('P1-REL OLD WRITER — a v1.0.76 page can still write schema 2 (documented limitation)', () => {
    const f = p1rFixture('P2');
    const app = p1rPage(f.state, f.clock, true);
    app.contribute({ name: 'ISA extra', amount: 100, date: f.clock, status: 'paid', rec: 'no', investId: 'iA' });
    const before = [app.snap().inv.iA, p1rVals(stored(app).investments), app.events().length];
    const theirs = JSON.parse(JSON.stringify(f.state));
    theirs.income = 3100;
    foreignStore(app, JSON.stringify(theirs));
    const allowed = app.run('geodeFinancialWriteAllowed()');
    const refused = relWarnings(app);
    app.run('__reload();');
    invariant('P1REL.old-writer', 'Resolved by schema 3 (P2-5): after this runtime anchored P2 and recorded +£100 (£5,300) its data is schema 3, so a v1.0.76/v1.0.77 page that loaded before the upgrade can no longer store its schema-2 memory — its own guard refuses schema-3 data as newer (release suite old.open-tab and old.event run the tagged v1.0.77 code). Should schema-2 text still land (an unguarded writer), this page refuses its next write as changed, and the next load moves that data to schema 3 again and re-anchors the £5,200 it holds (no double count)',
      [before, allowed, refused, staleState(app), [app.snap().inv.iA, p1rVals(app.state().investments), app.events().length, app.state().income, app.state()._schemaVersion]],
      [[5300, [['iA', [[5200, 'legacy_transition']]]], 2], false, ['stale:changed'], ['', ''], [5200, [['iA', [[5200, 'legacy_transition']]]], 1, 3100, 3]]);
  });
}

// P2-5: a monthly expectation that elapses with no recorded outcome is kept as evidence when the month boundary rolls it.

function p2Expectations() {
  const mutate = (app, fn, from, to) => app.run(`(function () {
    var src = ${fn}.toString();
    var out = src.replace(${JSON.stringify(from)}, ${JSON.stringify(to)});
    if (out === src) throw new Error('mutation did not apply');
    ${fn} = (0, eval)('(' + out + ')');
  })()`);
  const CARD = () => ({ id: 'dC', name: 'Card', balance: 4000, apr: 20, minp: 50 });
  const DOMAINS = ['goal', 'investment', 'debt', 'bill'];
  const AMOUNT = { goal: 100, investment: 200, debt: 50, bill: 80 };
  const LINK = { goal: { goalId: 'gH' }, investment: { investId: 'iA' }, debt: { debtId: 'dC', intent: 'set' }, bill: {} };
  const C = 'confirmed', E = 'expected_no_recorded_outcome', U = 'unknown';
  const addRow = (app, d, date, amount) => app.contribute(Object.assign({ name: d + ' monthly', amount: amount || AMOUNT[d], date, status: 'upcoming', rec: 'yes' }, LINK[d]));
  /** A page born on clock (default 1 June, so the schema-3 floor is June) with one monthly row per domain due on the 15th. */
  const world = (clock, domains, date) => {
    const app = new App(baseState({ debts: [CARD()] }), clock || '2026-06-01');
    const ids = {};
    (domains || DOMAINS).forEach(d => { ids[d] = addRow(app, d, date || '2026-06-15'); });
    return { app, ids };
  };
  const billRow = (id, o) => Object.assign({ id, name: 'Rent', amount: 80, date: '2026-06-15', status: 'upcoming', rec: 'yes', lastPaidYM: '',
    goalId: '', investId: '', debtId: '', payKind: 'bill', createdAt: 1 }, o);
  const label = (ids, pid) => Object.keys(ids).filter(k => ids[k] === pid)[0] || pid;
  const bySpan = (a, b) => (a[0] + a[2] < b[0] + b[2] ? -1 : a[0] + a[2] > b[0] + b[2] ? 1 : 0);
  /** Stored gap records as [row, domain, from, to, expected amount]. */
  const gaps = (app, ids) => (app.state().expectationGaps || []).map(g => [label(ids, g.paymentId), g.domain, g.fromYm, g.toYm, g.expectedAmount]).sort(bySpan);
  /** One record per domain over from..to (amounts: per domain, default AMOUNT). */
  const span = (from, to, amounts, domains) => (domains || DOMAINS).map(d => [d, d, from, to, (amounts || AMOUNT)[d]]).sort(bySpan);
  const status = (app, id, yms) => yms.map(ym => app.run('geodeExpectationOccurrenceStatus(S, ' + JSON.stringify(id) + ', ' + JSON.stringify(ym) + ')'));
  const statuses = (app, ids, yms) => Object.keys(ids).map(d => [d, status(app, ids[d], yms)]);
  const all = (ids, list) => Object.keys(ids).map(d => [d, list]);
  const confirmAll = (app, ids, iso) => { app.at(iso); Object.keys(ids).forEach(d => app.toggle(ids[d])); };
  const ymAdd = (ym, n) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const ledgers = app => { const s = app.state(); return [s.contributionEvents, s.debtPaymentEvents, s.billPaymentEvents]; };
  const ms = (y, m, d) => new Date(y, m - 1, d, 12).getTime();

  MODES.forEach(mode => scenario('P2-5 THREE MONTHS — June confirmed, July absent, August return; goal, investment, debt and bill [' + mode + ']', () => {
    const { app, ids } = world();
    confirmAll(app, ids, '2026-06-15');
    const settled = ledgers(app);
    app.advance('2026-08-03', mode);
    invariant('P2.exp.base', 'Each monthly row records July only: June was confirmed (its own occurrence), August is the current month',
      gaps(app, ids), span('2026-07', '2026-07'));
    invariant('P2.exp.base.status', 'June reads confirmed from each domain\'s own ledger (contributions for goal and investment, debt events, bill events); July expected · no recorded outcome; August not classified',
      statuses(app, ids, ['2026-06', '2026-07', '2026-08']), all(ids, [C, E, U]));
    const goalGap = app.state().expectationGaps.filter(g => g.paymentId === ids.goal)[0];
    invariant('P2.exp.record', 'A record holds evidence only — deterministic id gap_<payment>_<from>, the template and target as seen, the boundary evidence and who captured it; no balance, position, Monthly Left or outcome field',
      [Object.keys(goalGap).sort(), goalGap.id, goalGap.targetId, goalGap.recurrence, goalGap.dueDay, goalGap.templateNameSnapshot, goalGap.targetNameSnapshot, goalGap.seenYm,
        goalGap.capturedBy, goalGap.source, typeof goalGap.capturedAt],
      [['capturedAt', 'capturedBy', 'domain', 'dueDay', 'expectedAmount', 'fromYm', 'id', 'paymentId', 'recurrence', 'seenYm', 'source', 'targetId', 'targetNameSnapshot',
        'templateNameSnapshot', 'toYm'], 'gap_' + ids.goal + '_2026-07', 'gH', 'monthly', 15, 'goal monthly', 'Holiday', '2026-06', 'v1.0.78', 'month_boundary', 'number']);
    invariant('P2.exp.base.ledgers', 'The settlement ledgers are untouched by the boundary: nothing appended, altered or duplicated',
      same(ledgers(app), settled), true);
    invariant('P2.exp.base.rows', 'Every row rolled as before: upcoming, due 15 August',
      app.state().payments.map(p => [label(ids, p.id), p.status, p.date]).sort(), DOMAINS.map(d => [d, 'upcoming', '2026-08-15']).sort());
  }));

  MODES.forEach(mode => scenario('P2-5 THREE MONTHS — variants: July confirmed, July opened unconfirmed, template edited, template deleted [' + mode + ']', () => {
    const jc = world();
    confirmAll(jc.app, jc.ids, '2026-06-15');
    jc.app.advance('2026-07-02', mode);
    confirmAll(jc.app, jc.ids, '2026-07-15');
    jc.app.advance('2026-08-03', mode);
    invariant('P2.exp.jul-confirmed', 'July confirmed in July: no record; June and July read confirmed', [gaps(jc.app, jc.ids), statuses(jc.app, jc.ids, ['2026-06', '2026-07'])], [[], all(jc.ids, [C, C])]);

    const jo = world();
    confirmAll(jo.app, jo.ids, '2026-06-15');
    jo.app.advance('2026-07-10', mode);
    jo.app.advance('2026-08-03', mode);
    invariant('P2.exp.jul-open', 'Opened in July without confirming: the August boundary records July for every domain', [gaps(jo.app, jo.ids), statuses(jo.app, jo.ids, ['2026-06', '2026-07'])],
      [span('2026-07', '2026-07'), all(jo.ids, [C, E])]);

    const ed = world();
    confirmAll(ed.app, ed.ids, '2026-06-15');
    ed.app.advance('2026-08-03', mode);
    const NEW = { goal: 150, investment: 250, debt: 75, bill: 120 };
    DOMAINS.forEach(d => ed.app.modalEdit(ed.ids[d], { amount: String(NEW[d]) }));
    ed.app.advance('2026-10-02', mode);
    invariant('P2.exp.edit', 'July was recorded at the old amount before the August edit; August and September elapse at the edited amount; July is never rewritten',
      gaps(ed.app, ed.ids), span('2026-07', '2026-07').concat(span('2026-08', '2026-09', NEW)).sort(bySpan));

    const del = world();
    confirmAll(del.app, del.ids, '2026-06-15');
    del.app.advance('2026-08-03', mode);
    const kept = del.app.state().expectationGaps;
    DOMAINS.forEach(d => del.app.del(del.ids[d]));
    del.app.advance('2026-10-02', mode);
    invariant('P2.exp.delete', 'Templates deleted after the return: the July records survive unchanged, no later period is recorded (no tombstone); August and September stay unknown',
      [same(del.app.state().expectationGaps, kept), statuses(del.app, del.ids, ['2026-07', '2026-08', '2026-09'])], [true, all(del.ids, [E, U, U])]);
  }));

  MODES.forEach(mode => scenario('P2-5 LONG ABSENCE — 1, 2 and 12 months away after June confirmed, all four domains [' + mode + ']', () => {
    [1, 2, 12].forEach(n => {
      const { app, ids } = world();
      confirmAll(app, ids, '2026-06-15');
      const back = ymAdd('2026-06', n + 1);
      app.advance(back + '-03', mode);
      const last = ymAdd(back, -1);
      invariant('P2.exp.absence.' + n, n + ' month(s) away, back in ' + back + ': one record per row from July through ' + last + ' (the last fully elapsed month); the current month is not classified and nothing later is recorded',
        [gaps(app, ids), statuses(app, ids, [last, back, ymAdd(back, 1)]), app.state().expectationGaps.every(g => g.toYm < back)],
        [span('2026-07', last), all(ids, [E, U, U]), true]);
    });
  }));

  MODES.forEach(mode => scenario('P2-5 EVIDENCE FLOOR — no period before the last stored write, the schema-3 transition or the row\'s creation [' + mode + ']', () => {
    const bd = new App(baseState({ debts: [CARD()] }), '2026-03-01');
    const rent = addRow(bd, 'bill', '2026-08-15');
    bd.advance('2026-08-10', 'session');
    bd.modalEdit(rent, { date: '2026-05-15' });
    bd.advance('2026-09-02', mode);
    invariant('P2.exp.floor.backdate', 'A row scheduled from August and backdated in August to 15 May records August only at the September boundary: May–July are not fabricated (the last stored write was August)',
      [gaps(bd, { bill: rent }), status(bd, rent, ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09'])], [[['bill', 'bill', '2026-08', '2026-08', 80]], [U, U, U, E, U]]);

    const cr = new App(baseState({ investments: [], _schemaVersion: 3, expectationGaps: [], expectationFloorYm: '2026-03', contributionEvents: [], contributionCarry: [],
      billPaymentEvents: [], payments: [billRow('b1', { date: '2026-04-15', createdAt: ms(2026, 6, 10) })] }), '2026-03-10', undefined, { boot: false });
    cr.at('2026-08-03'); cr.run('__reload()');
    invariant('P2.exp.floor.created', 'A row whose creation time is June (stored write and floor March, due April) records June–July only: never before its creation month',
      [gaps(cr, { bill: 'b1' }), status(cr, 'b1', ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])], [[['bill', 'bill', '2026-06', '2026-07', 80]], [U, U, E, E, U]]);

    const tr = new App(baseState({ investments: [], _schemaVersion: 2, contributionEvents: [], contributionCarry: [], payments: [billRow('b1', { date: '2026-03-15' })] }),
      '2026-03-10', undefined, { boot: false });
    tr.at('2026-06-05'); tr.run('__reload()');
    const atTransition = [tr.state()._schemaVersion, tr.state().expectationFloorYm, gaps(tr, { bill: 'b1' }), tr.state().payments[0].date];
    tr.advance('2026-07-02', mode);
    invariant('P2.exp.floor.transition', 'Schema-2 data last written in March, opened in June: the transition sets the floor to June and backfills nothing (March–May stay unknown) while the row rolls; the July boundary then records June',
      [atTransition, gaps(tr, { bill: 'b1' }), status(tr, 'b1', ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07'])],
      [[3, '2026-06', [], '2026-06-15'], [['bill', 'bill', '2026-06', '2026-06', 80]], [U, U, U, E, U]]);

    const ctx = JSON.parse(bd.run('JSON.stringify(geodeExpectationCaptureContext({ expectationFloorYm: "bad", expectationGaps: [] }, "2026-09"))'));
    invariant('P2.exp.floor.missing', 'Missing revision evidence or an invalid floor gives the current month, which derives nothing', [ctx.seenYm, ctx.floorYm], ['2026-09', '2026-09']);
  }));

  scenario('P2-5 IDEMPOTENCE — render, reload and reopening never record a period twice', () => {
    const { app, ids } = world();
    confirmAll(app, ids, '2026-06-15');
    app.advance('2026-08-03', 'reload');
    const first = app.state().expectationGaps, raw = rawStore(app);
    app.render(); app.render(); app.reload(); app.reload();
    app.at('2026-08-25'); app.render(); app.reload();
    invariant('P2.exp.idempotent', 'Two renders, two reloads and a later same-month render and reload: identical records (ids and capture times) and a byte-identical store',
      [same(app.state().expectationGaps, first), rawStore(app) === raw, first.length], [true, true, 4]);
    const reopened = new App(baseState(), '2026-08-03', undefined, { boot: false });
    foreignStore(reopened, raw); reopened.run('_geodeKnownRaw = __store; __reload()');
    invariant('P2.exp.reopen', 'Another page opening the same stored text later that month adds nothing', [same(reopened.state().expectationGaps, first), rawStore(reopened) === raw], [true, true]);

    const one = world();
    confirmAll(one.app, one.ids, '2026-06-15');
    one.app.at('2026-08-03');
    one.app.run('var __saved = [], __save0 = save; save = function () { __save0(); __saved.push(__store); };');
    one.app.render();
    const texts = JSON.parse(one.app.run('JSON.stringify(__saved)')).map(t => JSON.parse(t));
    invariant('P2.exp.one-write', 'The boundary stores evidence and the rolled rows in one whole-state write: one save, holding the four July records and every row upcoming for 15 August',
      [texts.length, texts.map(t => [t.expectationGaps.length, t.payments.every(p => p.status === 'upcoming' && p.date === '2026-08-15')])], [1, [[4, true]]]);
  });

  scenario('P2-5 REFUSED SAVE — a page that may not store the boundary neither records nor rolls it', () => {
    const { app, ids } = world();
    confirmAll(app, ids, '2026-06-15');
    const body = JSON.parse(rawStore(app));
    body.income = 3333;
    body._rev = { seq: body._rev.seq + 2, id: 'rev_expectation_other', by: 'v1.0.78', at: ms(2026, 7, 10) };
    const foreign = JSON.stringify(body);
    foreignStore(app, foreign);
    app.at('2026-08-03'); app.render();
    invariant('P2.exp.refused', 'Another window\'s fenced July write is in storage: the August render records nothing and rolls nothing, in memory or storage; the page is foreign-stale',
      [rawStore(app) === foreign, app.state().expectationGaps, app.state().payments.map(p => p.status), staleState(app), relWarnings(app)],
      [true, [], ['paid', 'paid', 'paid', 'paid'], ['foreign', 'foreign'], ['stale:foreign']]);
    app.run('__reload()');
    const once = gaps(app, ids);
    app.reload(); app.reload();
    invariant('P2.exp.refused.reload', 'Reloading adopts that text (income £3,333) and records July exactly once; further reloads add nothing',
      [app.state().income, once, gaps(app, ids)], [3333, span('2026-07', '2026-07'), span('2026-07', '2026-07')]);
  });

  scenario('P2-5 BOUNDARY HOLD — schema-2 data waiting for the shell holds the boundary; the ready load clears it', () => {
    const state = baseState({ investments: [], _schemaVersion: 2, contributionEvents: [], contributionCarry: [],
      payments: [billRow('b1', { status: 'paid', lastPaidYM: '2026-06', lastPaidDueDate: '2026-06-15', date: '2026-07-15', lastPaidAmount: 80 })] });
    const app = p1rPage(state, '2026-08-03', P1R_PREVIOUS);
    invariant('P2.exp.hold', 'Pending in August with no investment to transition: the schema-3 transition is outstanding, so the row stays paid, nothing is recorded, storage stays schema 2 and the reload notice is up',
      [app.run('geodeBoundaryTransitionOutstanding()'), app.run('geodeInvestmentTransitionOutstanding()'), app.state().payments[0].status, app.state().expectationGaps, stored(app)._schemaVersion,
        app.run('_geodeBoundaryHoldNotice')], [true, false, 'paid', [], 2, true]);
    p1rReady(app); app.reload();
    invariant('P2.exp.hold.ready', 'The first ready load moves to schema 3 (floor August) and the boundary runs: the row rolls, July stays unknown (it elapsed before the transition), the hold is cleared',
      [stored(app)._schemaVersion, app.state().expectationFloorYm, app.state().payments[0].status, app.state().payments[0].date, status(app, 'b1', ['2026-06', '2026-07']),
        app.run('[_geodeBoundaryHoldNotice, _geodeBoundaryHoldAttempts, geodeBoundaryTransitionOutstanding()]')],
      [3, '2026-08', 'upcoming', '2026-08-15', [C, U], [false, 0, false]]);
    app.advance('2026-09-02', 'reload');
    invariant('P2.exp.hold.next', 'The September boundary records August', gaps(app, { bill: 'b1' }), [['bill', 'bill', '2026-08', '2026-08', 80]]);
  });

  scenario('P2-5 NOT FINANCIAL AUTHORITY — Monthly Left and every position are identical with no records, real records and forged £999,999 records', () => {
    const { app, ids } = world();
    confirmAll(app, ids, '2026-06-15');
    app.advance('2026-08-03', 'reload');
    const look = a => [a.snap(), a.state().debts.map(d => [d.id, d.balance]), a.state().goals.map(g => [g.id, g.saved]), a.state().investments.map(i => [i.id, i.balance]),
      a.state().savingsReleases, a.run('calcMonthlyLeftover(S)')];
    const real = look(app);
    app.run('S.expectationGaps = []; save();'); app.reload();
    const none = look(app);
    const forged = DOMAINS.map(d => ({ id: 'gap_' + ids[d] + '_2026-01', paymentId: ids[d], domain: d, targetId: '', recurrence: 'monthly', fromYm: '2026-01', toYm: '2026-12',
      expectedAmount: 999999, dueDay: 15, templateNameSnapshot: 'forged', targetNameSnapshot: '', seenYm: '2026-01', capturedAt: 1, capturedBy: 'forged', source: 'month_boundary' }));
    app.ctx.__forged = JSON.stringify(forged);
    app.run('S.expectationGaps = JSON.parse(__forged); save();'); app.reload();
    const fake = look(app);
    invariant('P2.exp.monthly-left', 'Monthly Left (all and confirmed-only), Home overdue items and the rows are the same with no records, the real July records and £999,999 records over 2026',
      [same(none[0], real[0]), same(fake[0], real[0]), fake[5] === real[5], app.state().expectationGaps.length], [true, true, true, 4]);
    invariant('P2.exp.positions', 'Holiday, ISA, Card and releases are the same in all three: a record never moves money',
      [same(none.slice(1, 5), real.slice(1, 5)), same(fake.slice(1, 5), real.slice(1, 5))], [true, true]);

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
    invariant('P2.exp.readers', 'Functions that mention the records: the evidence family, the schema-3 transition, recurring sync (capture), the backup whitelist and the P3-1 Living Month earlier-gap summary (evidence only, inert: tests/living-month-read-model.js); outside the family only load (normalise), recurring sync (capture) and that summary call into it — no Monthly Left, recompute, Plan, goal, investment or debt calculator',
      [users('expectationGaps'), users('Expectation').filter(n => n.indexOf('Expectation') < 0)],
      [['geodeBeyndBackupRestorableKeyWhitelist', 'geodeCaptureExpectationGaps', 'geodeExpectationCaptureContext', 'geodeExpectationOccurrenceStatus', 'geodeExpectationOccurrences',
        'geodeLivingMonthEarlierGaps', 'geodeNormalizeExpectationGaps', 'geodeSchema3Transition', 'syncRecurringPayments'], ['geodeLivingMonthEarlierGaps', 'load', 'syncRecurringPayments']]);
  });

  MODES.forEach(mode => scenario('P2-5 RANGES AND CORRELATION — settlement overlays a recorded range at read time; a settled month is never recorded [' + mode + ']', () => {
    const { app, ids } = world('2026-06-01', ['bill']);
    confirmAll(app, ids, '2026-06-15');
    app.advance('2026-10-02', mode);
    const range = app.state().expectationGaps;
    const before = app.state().billPaymentEvents.length;
    // P2-8: production's late-settlement path is one form save (August date, Completed). Saving the date alone, then
    // tapping complete, never reached August there: the save's render() rolls the row back to October first.
    app.modalEdit(ids.bill, { date: '2026-08-15', status: 'paid' });
    invariant('P2.exp.range', 'July–September recorded as one range; confirming the August occurrence later through the payment form (August date, Completed) reads July expected, August confirmed, September expected — the range record is unchanged and the ledger gains only that completion',
      [gaps(app, ids), status(app, ids.bill, ['2026-07', '2026-08', '2026-09']), same(app.state().expectationGaps, range), app.state().billPaymentEvents.length - before],
      [[['bill', 'bill', '2026-07', '2026-09', 80]], [E, C, E], true, 1]);
    const occurrences = JSON.parse(app.run('JSON.stringify(geodeExpectationOccurrences(S).map(function (o) { return [o.periodYm, o.status]; }))'));
    invariant('P2.exp.range.read', 'The read model lists each recorded period with its current outcome', occurrences, [['2026-07', E], ['2026-08', C], ['2026-09', E]]);
    app.advance('2026-11-02', mode);
    invariant('P2.exp.range.next', 'At the November boundary September is already recorded and nothing is claimed for October: a form completion keeps no settled due date (lastPaidDueDate), so the row\'s only evidence is its paid month, October, and October reads unknown — never expected or confirmed',
      [gaps(app, ids), status(app, ids.bill, ['2026-10'])], [[['bill', 'bill', '2026-07', '2026-09', 80]], [U]]);

    const cs = world('2026-06-01', ['bill']);
    confirmAll(cs.app, cs.ids, '2026-06-15');
    cs.app.run('S.payments.forEach(function (p) { p.status = "upcoming"; p.date = "2026-06-15"; p.lastPaidYM = ""; delete p.lastPaidDueDate; delete p.lastPaidAmount; }); save();');
    cs.app.advance('2026-08-03', mode);
    invariant('P2.exp.correlation', 'A row put back to June unpaid (as an older runtime could) while its June settlement stays active: the boundary skips June and records July only',
      [gaps(cs.app, cs.ids), status(cs.app, cs.ids.bill, ['2026-06', '2026-07'])], [[['bill', 'bill', '2026-07', '2026-07', 80]], [C, E]]);
  }));

  scenario('P2-5 SCHEMA 3 TRANSITION — readiness-gated, adds only empty evidence storage and the floor, once, crash-safe', () => {
    const src3 = world('2026-06-01', ['bill']);
    const s2 = JSON.parse(rawStore(src3.app));
    s2._schemaVersion = 2; delete s2.expectationGaps; delete s2.expectationFloorYm;
    const app = new App(s2, '2026-06-05', undefined, { boot: false });
    const before = JSON.parse(rawStore(app));
    watchWrites(app);
    app.run('__reload()');
    const after = stored(app);
    const strip = s => { const o = Object.assign({}, s); delete o._rev; delete o._schemaVersion; delete o.expectationGaps; delete o.expectationFloorYm; return o; };
    const first = [writes(app), after._schemaVersion, after.expectationGaps, after.expectationFloorYm, same(strip(after), strip(before))];
    app.reload(); app.reload();
    invariant('P2.exp.schema3', 'Stored schema 2 moves to 3 in one write: an empty list and floor June, every other value as it was; two reloads write nothing and keep the floor',
      [first, writes(app), stored(app).expectationFloorYm], [[1, 3, [], '2026-06', true], 0, '2026-06']);

    const fail = new App(s2, '2026-06-05', undefined, { boot: false });
    const raw = rawStore(fail);
    fail.run('__storageFault = "throw"; __toasts = [];');
    fail.run('__reload()');
    const failed = [fail.warnings.splice(0), toasts(fail), rawStore(fail) === raw, fail.state()._schemaVersion, fail.state().expectationGaps, 'expectationFloorYm' in fail.state()];
    fail.run('__storageFault = "";');
    fail.reload();
    invariant('P2.exp.schema3.crash', 'The commit failing: the warning gives storage, the save-failed toast shows, the store is untouched and memory stays schema 2 with no floor; the next load commits schema 3',
      [failed, stored(fail)._schemaVersion, stored(fail).expectationFloorYm],
      [[['[geode] schema 3 transition not completed, staying on schema 2: storage'], ['Could not save data (storage may be full).'], true, 2, [], false], 3, '2026-06']);

    const fresh = new App(baseState(), '2026-06-05');
    invariant('P2.exp.schema3.fresh', 'A fresh install starts at schema 3 with an empty list and the floor at its first month', [fresh.state()._schemaVersion, fresh.state().expectationGaps, fresh.state().expectationFloorYm],
      [3, [], '2026-06']);

    const old = new App(Object.assign(JSON.parse(rawStore(src3.app))), '2026-06-05', undefined, { boot: false });
    const text3 = rawStore(old);
    old.run('GEODE_SCHEMA_VERSION = 2; BEYND_RUNTIME_VERSION = "v1.0.77"; __reload();');
    relAct(old); old.run('persistGeodeToLocalStorage(); geodeSchema2CommitTransition();');
    invariant('P2.exp.forward-guard', 'A schema-2 runtime (v1.0.77 constants) opening schema-3 data shows the "newer version" gate and writes nothing — the evidence survives byte for byte (the tagged v1.0.77 code itself: release suite old.*)',
      [staleState(old), rawStore(old) === text3, relWarnings(old)], [['newer', 'newer'], true, ['stale:newer']]);
  });

  scenario('P2-5 MUTATIONS — each guard is load-bearing', () => {
    const cap = world();
    confirmAll(cap.app, cap.ids, '2026-06-15');
    mutate(cap.app, 'geodeCaptureExpectationGaps', 'if (fromYm > endYm) return;', 'return;');
    cap.app.advance('2026-08-03', 'reload');
    invariant('P2.exp.mut.capture', 'With capture disabled the August boundary records nothing — July is lost to unknown', gaps(cap.app, cap.ids), []);

    const fl = new App(baseState({ debts: [CARD()] }), '2026-03-01');
    const rent = addRow(fl, 'bill', '2026-08-15');
    fl.advance('2026-08-10', 'session');
    mutate(fl, 'geodeCaptureExpectationGaps', '[ctx.seenYm, ctx.floorYm, geodeExpectationCreatedYm(p)]', '[]');
    fl.modalEdit(rent, { date: '2026-05-15' });
    fl.advance('2026-09-02', 'reload');
    invariant('P2.exp.mut.floor', 'With the floors ignored the backdated row fabricates May–July', gaps(fl, { bill: rent }), [['bill', 'bill', '2026-05', '2026-08', 80]]);

    const co = world('2026-06-01', ['bill']);
    confirmAll(co.app, co.ids, '2026-06-15');
    co.app.run('S.payments.forEach(function (p) { p.status = "upcoming"; p.date = "2026-06-15"; p.lastPaidYM = ""; delete p.lastPaidDueDate; delete p.lastPaidAmount; }); save();');
    mutate(co.app, 'geodeExpectationSettled', "return !!map[paymentId + '|' + ym];", 'return false;');
    co.app.advance('2026-08-03', 'reload');
    invariant('P2.exp.mut.correlation', 'With settlement correlation ignored the settled June is recorded as expected and reads expected',
      [gaps(co.app, co.ids), status(co.app, co.ids.bill, ['2026-06'])], [[['bill', 'bill', '2026-06', '2026-07', 80]], [E]]);

    const ml = world();
    confirmAll(ml.app, ml.ids, '2026-06-15');
    ml.app.advance('2026-08-03', 'reload');
    const leftReal = ml.app.snap().left, goalReal = ml.app.snap().goal.gH;
    ml.app.run('var __left0 = calcMonthlyLeftover; calcMonthlyLeftover = function (s) { return __left0(s) - (s.expectationGaps || []).reduce(function (t, g) { return t + g.expectedAmount; }, 0); };');
    ml.app.run('var __goal0 = geodeGoalEffectiveSavedFromState; geodeGoalEffectiveSavedFromState = function (s, g) { return __goal0(s, g) + (s.expectationGaps || []).filter(function (x) { return x.targetId === g.id; }).reduce(function (t, x) { return t + x.expectedAmount; }, 0); };');
    invariant('P2.exp.mut.authority', 'A Monthly Left or goal calculator that read the records would move £430 off Monthly Left and £100 onto Holiday — the identity checks above would fail',
      [leftReal - ml.app.snap().left, ml.app.snap().goal.gH - goalReal], [430, 100]);

    const fg = new App(Object.assign(JSON.parse(rawStore(cap.app))), '2026-08-03', undefined, { boot: false });
    const text3 = rawStore(fg);
    mutate(fg, 'geodeFinancialWriteAllowed', 'if (_geodeRuntimeStale) return false;', 'return true;');
    fg.run('GEODE_SCHEMA_VERSION = 2; __reload(); S._schemaVersion = 2; S.expectationGaps = []; save();');
    invariant('P2.exp.mut.forward-guard', 'With the forward guard bypassed a schema-2 runtime overwrites the schema-3 text, losing the evidence', [rawStore(fg) === text3, stored(fg)._schemaVersion], [false, 2]);
    relWarnings(fg);

    const sep = world();
    confirmAll(sep.app, sep.ids, '2026-06-15');
    sep.app.at('2026-08-03');
    mutate(sep.app, 'syncRecurringPayments', "var paidYm = gaps && p.rec === 'yes'", "save(); var paidYm = gaps && p.rec === 'yes'");
    sep.app.run('var __saved = [], __save0 = save; save = function () { __save0(); __saved.push(__store); };');
    sep.app.render();
    const texts = JSON.parse(sep.app.run('JSON.stringify(__saved)')).map(t => JSON.parse(t));
    invariant('P2.exp.mut.separate', 'Saving between capture and roll stores evidence beside rows that have not rolled — a crash there leaves a half-processed boundary (one-write check above fails)',
      [texts.length > 1, texts.some(t => t.expectationGaps.length > 0 && t.payments.some(p => p.status === 'paid'))], [true, true]);
  });
}

// P2-6: cross-month continuity verification. The combined P2-1..P2-5 system under adversarial June → July → August use:
// what happened each month, what Beynd knows (confirmed), what it only expected (expected · no recorded outcome), what it
// does not know (unknown), and the financial position, which only the settlement ledgers and valuations decide.
function p2Continuity() {
  const C = 'confirmed', E = 'expected_no_recorded_outcome', U = 'unknown';
  const DOMAINS = ['goal', 'investment', 'debt', 'bill'];
  const AMOUNT = { goal: 100, investment: 200, debt: 50, bill: 80 };
  const NEW = { goal: 150, investment: 250, debt: 75, bill: 120 };
  const LINK = { goal: { goalId: 'gH' }, investment: { investId: 'iA' }, debt: { debtId: 'dC', intent: 'set' }, bill: {} };
  const CARD = () => ({ id: 'dC', name: 'Card', balance: 4000, apr: 20, minp: 50 });
  const mutate = (app, fn, from, to) => app.run(`(function () {
    var src = ${fn}.toString();
    var out = src.replace(${JSON.stringify(from)}, ${JSON.stringify(to)});
    if (out === src) throw new Error('mutation did not apply');
    ${fn} = (0, eval)('(' + out + ')');
  })()`);
  const ymAdd = (ym, n) => { const t = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + n; return Math.floor(t / 12) + '-' + String(t % 12 + 1).padStart(2, '0'); };
  const addRow = (app, d, date, amount, rec) => app.contribute(Object.assign({ name: d + ' monthly', amount: amount || AMOUNT[d], date, status: 'upcoming', rec: rec || 'yes' }, LINK[d]));
  /** A page first opened on clock (default 1 June: schema-3 floor June) with one monthly row per domain due on the 15th: Holiday £1,000, ISA £5,000, Card £4,000. */
  const world = (clock, domains, date, extra, program) => {
    const app = new App(baseState(Object.assign({ debts: [CARD()] }, extra || {})), clock || '2026-06-01', program);
    const ids = {};
    (domains || DOMAINS).forEach(d => { ids[d] = addRow(app, d, date || '2026-06-15'); });
    return { app, ids };
  };
  const label = (ids, pid) => Object.keys(ids).filter(k => ids[k] === pid)[0] || pid;
  const sorted = list => list.sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
  /** Stored expectation records as [row, from, to, expected amount]. */
  const gaps = (app, ids) => sorted((app.state().expectationGaps || []).map(g => [label(ids, g.paymentId), g.fromYm, g.toYm, g.expectedAmount]));
  /** Active settlements in each domain's own ledger as [row, ledger, due month, amount]. */
  const settled = (app, ids) => sorted(JSON.parse(app.run(`JSON.stringify([].concat(
    geodeContributionActiveCompletions(S).map(function (e) { return [e.paymentId, 'contribution', geodeExpectationEventDueYm(e), e.amount]; }),
    geodeDebtPaymentActiveCompletions(S).map(function (e) { return [e.paymentId, 'debt', geodeExpectationEventDueYm(e), e.amount]; }),
    geodeBillPaymentLedger(S.billPaymentEvents).active.map(function (e) { return [e.paymentId, 'bill', geodeExpectationEventDueYm(e), e.amount]; })))`))
    .map(s => [label(ids, s[0])].concat(s.slice(1))));
  const status = (app, id, yms) => yms.map(ym => app.run('geodeExpectationOccurrenceStatus(S, ' + JSON.stringify(id) + ', ' + JSON.stringify(ym) + ')'));
  const classify = (app, ids, yms) => Object.keys(ids).map(d => [d, status(app, ids[d], yms)]);
  const every = (ids, list) => Object.keys(ids).map(d => [d, list]);
  const rows = (app, ids) => sorted(app.state().payments.map(p => [label(ids, p.id), p.rec, p.status, p.date, toNumber(p.amount)]));
  const toNumber = v => Math.round(Number(v) * 100) / 100;
  /** [Holiday shown, ISA shown, Card balance]. */
  const position = app => { const s = app.snap(); return [s.goal.gH, s.inv.iA, (app.state().debts[0] || {}).balance]; };
  /** [Monthly Left, confirmed-only Monthly Left]. */
  const left = app => { const s = app.snap(); return [s.left, s.leftConfirmed]; };
  const confirmAll = (app, ids, iso) => { app.at(iso); Object.keys(ids).forEach(d => app.toggle(ids[d])); };
  /** reload mode reloads after every meaningful action; session mode never reloads. */
  const settle = (app, mode) => { if (mode === 'reload') app.reload(); };
  const row = (d, from, to, amounts) => [d, from, to, (amounts || AMOUNT)[d]];
  const each = (fn, domains) => sorted((domains || DOMAINS).map(fn));
  /** Display (Monthly Left, overdue, rows, goals, investments), debt balances, releases and investment positions of the state in memory. */
  const LOOK = `JSON.stringify([JSON.parse(__snapshot()), (S.debts || []).map(function (d) { return [d.id, d.balance]; }), S.savingsReleases || [],
    (S.investments || []).map(function (i) { var p = geodeInvestmentPosition(S, i); return [i.id, p && p.value, p && p.estimated]; })])`;
  const FORGED = `(S.payments || []).map(function (p) { return { id: 'gap_' + p.id + '_2026-01', paymentId: String(p.id), domain: geodeExpectationDomain(p),
    targetId: '', recurrence: 'monthly', fromYm: '2026-01', toYm: '2027-12', expectedAmount: 999999, dueDay: 15, templateNameSnapshot: 'forged', targetNameSnapshot: '', seenYm: '2026-01',
    capturedAt: 1, capturedBy: 'forged', source: 'month_boundary' }; })`;
  /** The same look on a copy of the state whose records are replaced: none, or forged £999,999 over 2026–2027 for every row. */
  const without = (app, how) => JSON.parse(app.run(`(function () {
    var keep = S;
    try {
      S = JSON.parse(JSON.stringify(keep));
      S.expectationGaps = ${how === 'forged' ? FORGED : '[]'};
      return ${LOOK};
    } finally { S = keep; }
  })()`));
  const shown = app => JSON.parse(app.run(LOOK));
  /** Monthly Left, every position and the releases are the same with the real records, none and forged ones. */
  const authorityFree = app => { const real = shown(app); return [same(without(app, 'none'), real), same(without(app, 'forged'), real)]; };

  // ── C. THREE-MONTH TORTURE MATRIX ──
  const CASES = [
    ['1', 'June confirmed → July absent → August return'],
    ['2', 'June confirmed → July confirmed → August return'],
    ['3', 'June unconfirmed → July absent → August return'],
    ['4', 'June confirmed → July absent → August: template amounts edited'],
    ['5', 'June confirmed → July absent → August: templates deleted'],
    ['6', 'June confirmed → July absent → August: current occurrence completed']
  ];
  const journey = (kase, mode) => {
    const { app, ids } = world();
    if (kase !== '3') { confirmAll(app, ids, '2026-06-15'); settle(app, mode); }
    if (kase === '2') { app.advance('2026-07-02', mode); confirmAll(app, ids, '2026-07-15'); settle(app, mode); }
    app.advance('2026-08-03', mode);
    if (kase === '4') { DOMAINS.forEach(d => { app.modalEdit(ids[d], { amount: String(NEW[d]) }); settle(app, mode); }); }
    if (kase === '5') { DOMAINS.forEach(d => { app.del(ids[d]); settle(app, mode); }); }
    if (kase === '6') { app.at('2026-08-15'); DOMAINS.forEach(d => { app.toggle(ids[d]); settle(app, mode); }); }
    const august = { rows: rows(app, ids), settled: settled(app, ids), gaps: gaps(app, ids), read: classify(app, ids, ['2026-06', '2026-07', '2026-08']),
      position: position(app), left: left(app), free: authorityFree(app) };
    app.advance('2026-09-02', mode);
    const september = { gaps: gaps(app, ids), read: classify(app, ids, ['2026-06', '2026-07', '2026-08', '2026-09']), position: position(app) };
    return { august, september };
  };
  const LEDGER = { goal: 'contribution', investment: 'contribution', debt: 'debt', bill: 'bill' };
  const paidIn = (ym, amounts) => each(d => [d, LEDGER[d], ym, (amounts || AMOUNT)[d]]);
  const upcoming = (date, amounts) => each(d => [d, 'yes', 'upcoming', date, (amounts || AMOUNT)[d]]);
  const L0 = 3000 - 430;
  /** Monthly Left subtracts every row due this month; confirmed-only Monthly Left subtracts only completed ones. */
  const EXPECT = {
    1: { rows: upcoming('2026-08-15'), settled: paidIn('2026-06'), gaps: each(d => row(d, '2026-07', '2026-07')), read: [C, E, U], position: [1100, 5200, 4000], left: [L0, 3000],
      sepGaps: sorted(each(d => row(d, '2026-07', '2026-07')).concat(each(d => row(d, '2026-08', '2026-08')))), sepRead: [C, E, E, U], sepPosition: [1100, 5200, 4000] },
    2: { rows: upcoming('2026-08-15'), settled: sorted(paidIn('2026-06').concat(paidIn('2026-07'))), gaps: [], read: [C, C, U], position: [1200, 5400, 4000], left: [L0, 3000],
      sepGaps: each(d => row(d, '2026-08', '2026-08')), sepRead: [C, C, E, U], sepPosition: [1200, 5400, 4000] },
    3: { rows: upcoming('2026-08-15'), settled: [], gaps: each(d => row(d, '2026-06', '2026-07')), read: [E, E, U], position: [1000, 5000, 4000], left: [L0, 3000],
      sepGaps: sorted(each(d => row(d, '2026-06', '2026-07')).concat(each(d => row(d, '2026-08', '2026-08')))), sepRead: [E, E, E, U], sepPosition: [1000, 5000, 4000] },
    4: { rows: upcoming('2026-08-15', NEW), settled: paidIn('2026-06'), gaps: each(d => row(d, '2026-07', '2026-07')), read: [C, E, U], position: [1100, 5200, 4000], left: [3000 - 595, 3000],
      sepGaps: sorted(each(d => row(d, '2026-07', '2026-07')).concat(each(d => row(d, '2026-08', '2026-08', NEW)))), sepRead: [C, E, E, U], sepPosition: [1100, 5200, 4000] },
    5: { rows: [], settled: paidIn('2026-06'), gaps: each(d => row(d, '2026-07', '2026-07')), read: [C, E, U], position: [1100, 5200, 4000], left: [3000, 3000],
      sepGaps: each(d => row(d, '2026-07', '2026-07')), sepRead: [C, E, U, U], sepPosition: [1100, 5200, 4000] },
    6: { rows: each(d => [d, 'yes', 'paid', '2026-09-15', AMOUNT[d]]), settled: sorted(paidIn('2026-06').concat(paidIn('2026-08'))), gaps: each(d => row(d, '2026-07', '2026-07')), read: [C, E, C],
      position: [1200, 5400, 4000], left: [L0, L0], sepGaps: each(d => row(d, '2026-07', '2026-07')), sepRead: [C, E, C, U], sepPosition: [1200, 5400, 4000] }
  };
  MODES.forEach(mode => scenario('P2-6 THREE-MONTH MATRIX — goal, investment, debt and bill; ' + (mode === 'reload' ? 'reload after every meaningful action' : 'one session, no reload') + ' [' + mode + ']', () => {
    CASES.forEach(([kase, text]) => {
      const x = EXPECT[kase], got = journey(kase, mode);
      invariant('P2.cm.' + kase + '.august', text + '. August, independently: live rows; active settlements in each domain\'s own ledger; expectation records; June/July/August read; Holiday/ISA/Card; Monthly Left (all, confirmed-only); identical with no or forged records',
        [got.august.rows, got.august.settled, got.august.gaps, got.august.read, got.august.position, got.august.left, got.august.free],
        [x.rows, x.settled, x.gaps, every({ goal: 1, investment: 1, debt: 1, bill: 1 }, x.read), x.position, x.left, [true, true]]);
      invariant('P2.cm.' + kase + '.september', text + '. One boundary later (September): what Beynd now knows, expected and does not know; positions unchanged by the boundary',
        [got.september.gaps, got.september.read, got.september.position], [x.sepGaps, every({ goal: 1, investment: 1, debt: 1, bill: 1 }, x.sepRead), x.sepPosition]);
    });
  }));

  // ── D. THE FOUR THREE-MONTH EXTENSIONS PHASE 1 DEFERRED ──
  MODES.forEach(mode => scenario('P2-6 PHASE-1 EXTENSIONS — investment template edit, debt payment, monthly bill, release; June → absent July → August [' + mode + ']', () => {
    const inv = world('2026-06-01', ['investment']);
    confirmAll(inv.app, inv.ids, '2026-06-15'); settle(inv.app, mode);
    const juneInv = fa7bLook(inv.app);
    inv.app.advance('2026-08-03', mode);
    const back = fa7bLook(inv.app);
    inv.app.modalEdit(inv.ids.investment, { amount: '250' }); settle(inv.app, mode);
    const edited = [fa7bLook(inv.app), settled(inv.app, inv.ids), gaps(inv.app, inv.ids), status(inv.app, inv.ids.investment, ['2026-06', '2026-07', '2026-08'])];
    inv.app.at('2026-08-15'); inv.app.toggle(inv.ids.investment); settle(inv.app, mode);
    const completed = fa7bLook(inv.app);
    inv.app.at('2026-08-20'); inv.app.saveInvestment('iA', 'ISA', 5300); settle(inv.app, mode);
    const observed = fa7bLook(inv.app);
    inv.app.advance('2026-09-02', mode);
    const EST = [5200, 5200, 5200, 5000, 'legacy_transition', 200, 0, true];
    invariant('P2.ext.investment', 'ISA (anchor £5,000). June: £200 confirmed → estimated £5,200. July: absent. August: back £5,200; template edited to £250 — June stays one £200 completion, July stays expected at £200, the position stays £5,200; August completed at £250 → £5,450 (anchor + both completions); £5,300 entered → observed £5,300; September: still £5,300, August confirmed, nothing recorded for it; one opening anchor plus the one observation',
      [juneInv, back, edited, completed, observed, fa7bLook(inv.app), status(inv.app, inv.ids.investment, ['2026-06', '2026-07', '2026-08']), gaps(inv.app, inv.ids), fa7bVals(inv.app).map(v => v[2])],
      [EST, EST, [EST, [['investment', 'contribution', '2026-06', 200]], [['investment', '2026-07', '2026-07', 200]], [C, E, U]],
        [5450, 5450, 5450, 5000, 'legacy_transition', 450, 0, true], [5300, 5300, 5300, 5300, 'manual', 0, 0, false], [5300, 5300, 5300, 5300, 'manual', 0, 0, false],
        [C, E, C], [['investment', '2026-07', '2026-07', 200]], ['legacy_transition', 'manual']]);

    const debt = world('2026-06-01', ['debt']);
    const card = () => debt.app.state().debts[0].balance;
    const ident = () => debt.app.state().payments.map(p => [p.id === debt.ids.debt, p.rec, p.debtId]);
    confirmAll(debt.app, debt.ids, '2026-06-15'); settle(debt.app, mode);
    const juneDebt = [card(), ident()];
    debt.app.advance('2026-08-03', mode);
    const augDebt = [card(), ident(), status(debt.app, debt.ids.debt, ['2026-06', '2026-07', '2026-08']), gaps(debt.app, debt.ids)];
    debt.app.at('2026-08-15'); debt.app.toggle(debt.ids.debt); settle(debt.app, mode);
    invariant('P2.ext.debt', 'Card £4,000 (user-entered) with a £50 monthly payment. June confirmed: Card £4,000, one row with the same id. August back: Card £4,000, still that one monthly row (identity survives the boundary); June confirmed from debt events, July expected · no recorded outcome (never "missed"), August unknown. August completed: two debt completions (June, August), Card still £4,000 — payment history never moves the balance',
      [juneDebt, augDebt, [card(), ident(), settled(debt.app, debt.ids), status(debt.app, debt.ids.debt, ['2026-06', '2026-07', '2026-08'])]],
      [[4000, [[true, 'yes', 'dC']]], [4000, [[true, 'yes', 'dC']], [C, E, U], [['debt', '2026-07', '2026-07', 50]]],
        [4000, [[true, 'yes', 'dC']], [['debt', 'debt', '2026-06', 50], ['debt', 'debt', '2026-08', 50]], [C, E, C]]]);

    const bill = world('2026-06-01', ['bill']);
    confirmAll(bill.app, bill.ids, '2026-06-15'); settle(bill.app, mode);
    const evidence = JSON.stringify(bill.app.state().billPaymentEvents);
    bill.app.advance('2026-08-03', mode);
    const historyFree = JSON.parse(bill.app.run(`(function () { var keep = S; try { S = JSON.parse(JSON.stringify(keep)); S.expectationGaps = []; S.billPaymentEvents = [];
      return JSON.stringify([calcMonthlyLeftover(S), calcMonthlyLeftoverConfirmedOnly(S)]); } finally { S = keep; } })()`));
    invariant('P2.ext.bill', 'Rent £80 monthly. June confirmed. August back: the June settlement is byte-identical; July is an expectation record, not a settlement (the bill ledger holds only June; the record holds only July); Monthly Left £2,920 (August\'s £80 only) and the same with the July record and the whole bill ledger removed — it reads only August\'s live row',
      [JSON.stringify(bill.app.state().billPaymentEvents) === evidence, settled(bill.app, bill.ids), gaps(bill.app, bill.ids), status(bill.app, bill.ids.bill, ['2026-06', '2026-07', '2026-08']), left(bill.app), historyFree],
      [true, [['bill', 'bill', '2026-06', 80]], [['bill', '2026-07', '2026-07', 80]], [C, E, U], [2920, 3000], [2920, 3000]]);

    const rel = world('2026-06-01', ['goal']);
    const control = world('2026-06-01', ['goal']);
    [rel, control].forEach(w => { confirmAll(w.app, w.ids, '2026-06-15'); settle(w.app, mode); });
    rel.app.at('2026-06-20'); const juneRelease = rel.app.release('gH', 200); settle(rel.app, mode);
    [rel, control].forEach(w => w.app.advance('2026-08-03', mode));
    const augRel = [rel.app.snap().goal.gH, rel.app.state().savingsReleases.map(r => [r.amount, r.ym, r.balanceMutationMode]), left(rel.app), left(control.app)];
    rel.app.at('2026-08-10'); rel.app.release('gH', 100); settle(rel.app, mode);
    rel.app.advance('2026-09-02', mode);
    invariant('P2.ext.release', 'Holiday £1,000 with £100 monthly. June: £100 confirmed (£1,100), £200 released on 20 June (event-derived) → £900. July: absent. August: Holiday £900, the one June release unchanged; Monthly Left £2,900 / £3,000 — exactly the page with no release (an old release is never a current outflow); £100 released in August → £800. September: £800, two releases, expectation records for July and August only; identical with no or forged records',
      [juneRelease.ok, augRel, [rel.app.snap().goal.gH, rel.app.state().savingsReleases.map(r => [r.amount, r.ym]), gaps(rel.app, rel.ids), authorityFree(rel.app)]],
      [true, [900, [[200, '2026-06', 'event_derived']], [2900, 3000], [2900, 3000]],
        [800, [[200, '2026-06'], [100, '2026-08']], [['goal', '2026-07', '2026-07', 100], ['goal', '2026-08', '2026-08', 100]], [true, true]]]);
  }));

  scenario('P2-6 HARNESS FIDELITY — a later visit loads what the page stored while it was open', () => {
    const w = world('2026-06-01', ['goal']);
    confirmAll(w.app, w.ids, '2026-06-15');
    w.app.at('2026-06-20'); w.app.release('gH', 200); w.app.reload();
    const dirty = w.app.run('JSON.stringify(S) !== __store');
    w.app.advance('2026-08-03', 'reload');
    const src = PROGRAM.src, load = extractFunction(src, 'load').text;
    const beforeSync = load.slice(0, load.indexOf('\n  syncRecurringPayments();'));
    invariant('P2.fidelity.advance', 'After a release and a reload the page\'s memory differs from storage (the boot recompute is not stored until a later write). The next visit stores it at the old clock and loads at the new one, as production does: load() makes no financial write before its first recurring sync (only the guarded transition commits) and nothing saves on unload — so the August load sees the June write and records July',
      [dirty, gaps(w.app, w.ids), (beforeSync.match(/\bsave\(\)|persistGeodeToLocalStorage\(\)/g) || []).length, /beforeunload|pagehide|['"]unload['"]/.test(src), new Date(w.app.state().expectationGaps[0] ? JSON.parse(rawStore(w.app))._rev.at : 0).getMonth() + 1],
      [true, [['goal', '2026-07', '2026-07', 100]], 0, false, 8]);
  });

  // ── G. INVESTMENT AUTHORITY TORTURE ──
  MODES.forEach(mode => scenario('P2-6 INVESTMENT AUTHORITY — valuations, contributions, releases, an absence, an edit, £0 and a year away [' + mode + ']', () => {
    const { app, ids } = world('2026-06-01', ['investment']);
    const seq = [], free = [];
    const look = name => { const l = fa7bLook(app); seq.push([name, l[0], l[7]]); free.push(authorityFree(app).every(Boolean)); settle(app, mode); };
    app.at('2026-06-05'); app.saveInvestment('iA', 'ISA', 5100); look('valued £5,100 before any contribution');
    app.at('2026-06-15'); app.toggle(ids.investment); look('£200 monthly confirmed after it');
    app.at('2026-06-20'); app.contribute({ name: 'ISA top-up', amount: 100, date: '2026-06-20', status: 'paid', rec: 'no', investId: 'iA' }); look('£100 one-off paid');
    app.at('2026-06-25'); app.saveInvestment('iA', 'ISA', 5450); look('valued £5,450 after both');
    app.advance('2026-08-03', mode); look('August return after an absent July');
    app.at('2026-08-05'); fa7bRelease(app, 300); look('£300 released before a valuation');
    app.at('2026-08-10'); app.saveInvestment('iA', 'ISA', 4900); look('valued £4,900');
    app.at('2026-08-12'); fa7bRelease(app, 100); look('£100 released after it');
    app.at('2026-08-14'); app.modalEdit(ids.investment, { amount: '250' }); look('template edited £200 → £250');
    app.at('2026-08-15'); app.toggle(ids.investment); look('August £250 confirmed');
    app.at('2026-08-20'); app.saveInvestment('iA', 'ISA', 0); look('valid £0 valuation');
    app.advance('2027-08-03', mode); look('back a year later');
    app.at('2027-08-04'); app.saveInvestment('iA', 'ISA', 3000); look('valued £3,000 after the long absence');
    invariant('P2.inv.torture', 'ISA [step, shown, estimated]: £5,100 observed → +£200 estimated £5,300 → +£100 £5,400 → £5,450 observed → absent July: £5,450 (the July expectation adds nothing) → −£300 £5,150 → £4,900 observed → −£100 £4,800 → edit: £4,800 → +£250 £5,050 → £0 observed (valid) → a year away: £0 (eleven expected months add nothing) → £3,000 observed. At every step the position, Monthly Left and releases are the same with no or forged records; the records are July (£200) and September 2026–July 2027 (£250); the valuations are the opening anchor and the five observations',
      [seq, free.every(Boolean), gaps(app, ids), fa7bVals(app).map(v => [v[0], v[2]])],
      [[['valued £5,100 before any contribution', 5100, false], ['£200 monthly confirmed after it', 5300, true], ['£100 one-off paid', 5400, true], ['valued £5,450 after both', 5450, false],
        ['August return after an absent July', 5450, false], ['£300 released before a valuation', 5150, true], ['valued £4,900', 4900, false], ['£100 released after it', 4800, true],
        ['template edited £200 → £250', 4800, true], ['August £250 confirmed', 5050, true], ['valid £0 valuation', 0, false], ['back a year later', 0, false], ['valued £3,000 after the long absence', 3000, false]],
        true, [['investment', '2026-07', '2026-07', 200], ['investment', '2026-09', '2027-07', 250]],
        [[5000, 'legacy_transition'], [5100, 'manual'], [5450, 'manual'], [4900, 'manual'], [0, 'manual'], [3000, 'manual']]]);
  }));

  // ── H. GOAL / LINKED INVESTMENT TORTURE (FA-7D) ──
  MODES.forEach(mode => scenario('P2-6 LINKED GOAL — own history, link, contribution through the goal, absence, valuation, unlink, relink [' + mode + ']', () => {
    const app = fa7dApp();
    const seq = [];
    const look = name => { seq.push([name].concat(fa7dLook(app))); settle(app, mode); };
    const own = app.contribute({ name: 'Holiday monthly', amount: 100, date: '2026-06-15', status: 'upcoming', rec: 'yes', goalId: 'gH' });
    app.at('2026-06-15'); app.toggle(own); look('June: own £100 confirmed');
    app.at('2026-06-16'); fa7dLink(app, 'gH'); look('linked to the ISA');
    const form = app.modalForm(null, { name: 'Contribute to Holiday', date: '2026-06-20', status: 'upcoming', rec: true, goalId: 'gH', _geodePayIntent: 'new' });
    const via = app.contribute({ name: form.name, amount: 200, date: '2026-06-20', status: 'upcoming', rec: 'yes', goalId: form.goalId, investId: form.investId });
    app.at('2026-06-20'); app.toggle(via); look('£200 monthly through the goal, confirmed');
    app.advance('2026-08-03', mode); look('August return after an absent July');
    const ids = { own, via };
    const august = [gaps(app, ids), classify(app, ids, ['2026-06', '2026-07'])];
    app.at('2026-08-05'); app.saveInvestment('iA', 'ISA', 5600); look('ISA valued £5,600');
    app.at('2026-08-06'); fa7dLink(app, ''); look('unlinked');
    app.at('2026-08-07'); fa7dLink(app, 'gH'); look('relinked');
    app.advance('2026-09-02', mode); look('September');
    invariant('P2.linked.torture', '[step, Holiday shown, own cache, baseSaved, contribution events, releases, valuations, ISA shown]. The goal form routes the linked contribution to the ISA ([goal, investment] = ["", iA]); June: own £100 → Holiday £1,100; linked → shows the ISA £5,000 (own £1,100 kept); £200 through the goal is one ISA completion → £5,200; August: £5,200 — the July expectations of both rows (goal £100, ISA £200) become nobody\'s Saved; £5,600 observed → £5,600; unlinked → its own £1,100; relinked → £5,600; September the same. Two completions in total (goal £100, ISA £200): no dual write',
      [[form.goalId, form.investId], seq, august, app.activeEvents().map(e => [e.entityType + ':' + e.entityId, e.amount]).sort()],
      [['', 'iA'], [['June: own £100 confirmed', 1100, 1100, 1000, 1, 0, 1, 5000], ['linked to the ISA', 5000, 1100, 1000, 1, 0, 1, 5000], ['£200 monthly through the goal, confirmed', 5200, 1100, 1000, 2, 0, 1, 5200],
        ['August return after an absent July', 5200, 1100, 1000, 2, 0, 1, 5200], ['ISA valued £5,600', 5600, 1100, 1000, 2, 0, 2, 5600], ['unlinked', 1100, 1100, 1000, 2, 0, 2, 5600],
        ['relinked', 5600, 1100, 1000, 2, 0, 2, 5600], ['September', 5600, 1100, 1000, 2, 0, 2, 5600]],
        [[['own', '2026-07', '2026-07', 100], ['via', '2026-07', '2026-07', 200]], [['own', [C, E]], ['via', [C, E]]]], [['goal:gH', 100], ['investment:iA', 200]]]);
  }));

  // ── I. DEBT TORTURE ──
  MODES.forEach(mode => scenario('P2-6 DEBT — £50 monthly, £100 one-off and £75 monthly on one card through completion, undo, absence, edit, import and delete [' + mode + ']', () => {
    const app = new App(baseState({ debts: [CARD()] }), '2026-06-01');
    const pay = (amount, rec, date) => app.contribute({ intent: 'set', name: 'Card ' + amount, amount, date, status: 'upcoming', rec, debtId: 'dC' });
    const m50 = pay(50, 'yes', '2026-06-15'), o100 = pay(100, 'no', '2026-06-20'), m75 = pay(75, 'yes', '2026-06-15');
    const ids = { m50, o100, m75 };
    const view = () => { app.merge(); return rows(app, ids).filter(r => r[0] !== 'import'); };
    const events = () => app.state().debtPaymentEvents.map(e => [e.eventType, label(ids, e.paymentId), e.occurrenceYm]);
    const card = () => app.state().debts[0].balance;
    app.at('2026-06-15'); app.toggle(m50); settle(app, mode);
    app.at('2026-06-20'); app.toggle(o100); app.toggle(m50); app.toggle(m50); settle(app, mode);
    const june = [view(), events(), card()];
    app.advance('2026-08-03', mode);
    const august = [view(), gaps(app, ids), classify(app, ids, ['2026-06', '2026-07']), card()];
    app.at('2026-08-04'); app.modalEdit(m75, { amount: '80' }); settle(app, mode);
    const imported = app.smartImport([{ name: 'Card extra', amount: 60, date: '2026-08-04', link: 'debt:dC' }]);
    const importId = app.state().payments.filter(p => [m50, o100, m75].indexOf(p.id) < 0)[0].id;
    ids.import = importId;
    settle(app, mode);
    app.del(m50); settle(app, mode);
    app.advance('2026-09-02', mode);
    invariant('P2.debt.torture', 'June: £50 completed, £100 one-off completed, £50 undone and completed again, £75 left open: three rows, debt events completion/completion/reversal/completion, Card £4,000. August (July absent): the monthlies upcoming on 15 August, the one-off still a completed one-off; records £50 July and £75 June–July, never the one-off; Card £4,000. August: £75 edited to £80, a £60 Smart Import debt payment stays its own (upcoming) one-off row, the £50 deleted. September: one new record, £80 for August; the one-off and the import are never recorded or promoted; Card £4,000 throughout — payment history never moves the balance',
      [june, august, [rows(app, ids), gaps(app, ids), card(), imported.added]],
      [[[['m50', 'yes', 'paid', '2026-07-15', 50], ['m75', 'yes', 'upcoming', '2026-06-15', 75], ['o100', 'no', 'paid', '2026-06-20', 100]],
        [['completion', 'm50', '2026-06'], ['completion', 'o100', '2026-06'], ['reversal', 'm50', '2026-06'], ['completion', 'm50', '2026-06']], 4000],
        [[['m50', 'yes', 'upcoming', '2026-08-15', 50], ['m75', 'yes', 'upcoming', '2026-08-15', 75], ['o100', 'no', 'paid', '2026-06-20', 100]],
          [['m50', '2026-07', '2026-07', 50], ['m75', '2026-06', '2026-07', 75]], [['m50', [C, E]], ['o100', [C, U]], ['m75', [E, E]]], 4000],
        [[['import', 'no', 'upcoming', '2026-08-04', 60], ['m75', 'yes', 'upcoming', '2026-09-15', 80], ['o100', 'no', 'paid', '2026-06-20', 100]],
          [['m50', '2026-07', '2026-07', 50], ['m75', '2026-06', '2026-07', 75], ['m75', '2026-08', '2026-08', 80]], 4000, 1]]);
  }));

  // ── J. BILL TORTURE ──
  MODES.forEach(mode => scenario('P2-6 BILLS — monthly, annual and one-off: only the monthly is ever an expectation; every completion is settlement evidence [' + mode + ']', () => {
    const make = () => {
      const app = new App(baseState(), '2026-06-01');
      const ids = { rent: app.contribute({ name: 'Rent', amount: 80, date: '2026-06-15', status: 'upcoming', rec: 'yes' }),
        insurance: app.contribute({ name: 'Insurance', amount: 300, date: '2026-06-20', status: 'upcoming', rec: 'annual' }),
        repair: app.contribute({ name: 'Repair', amount: 120, date: '2026-06-25', status: 'upcoming', rec: 'no' }) };
      return { app, ids };
    };
    const bev = (app, ids) => app.state().billPaymentEvents.map(e => [e.eventType, label(ids, e.paymentId), e.occurrenceYm, e.recurrenceSnapshot]);
    const open = make();
    open.app.advance('2026-08-03', mode);
    const openAug = [gaps(open.app, open.ids), classify(open.app, open.ids, ['2026-06', '2026-07']), authorityFree(open.app)];
    open.app.at('2026-08-10'); open.app.toggle(open.ids.insurance); open.app.toggle(open.ids.repair); settle(open.app, mode);
    open.app.advance('2026-09-02', mode);
    const done = make();
    done.app.at('2026-06-25'); Object.keys(done.ids).forEach(k => done.app.toggle(done.ids[k])); settle(done.app, mode);
    done.app.advance('2026-08-03', mode);
    const doneAug = [gaps(done.app, done.ids), authorityFree(done.app)];
    const evidence = JSON.stringify(done.app.state().billPaymentEvents);
    Object.keys(done.ids).forEach(k => { done.app.del(done.ids[k]); settle(done.app, mode); });
    done.app.advance('2026-09-02', mode);
    invariant('P2.bill.torture', 'Nothing completed in June: August records Rent June–July only (the overdue annual Insurance and one-off Repair are never captured), Monthly Left and positions identical with no or forged records; Insurance and Repair completed late in August → bill evidence for their June due dates; September adds Rent August only. All three completed in June: three bill completions (monthly, annual, one-off); August records Rent July only; deleting all three keeps the evidence byte-identical and September records nothing more',
      [openAug, [gaps(open.app, open.ids), bev(open.app, open.ids)], doneAug, [bev(done.app, done.ids), JSON.stringify(done.app.state().billPaymentEvents) === evidence, gaps(done.app, done.ids), done.app.state().payments.length]],
      [[[['rent', '2026-06', '2026-07', 80]], [['rent', [E, E]], ['insurance', [U, U]], ['repair', [U, U]]], [true, true]],
        [[['rent', '2026-06', '2026-07', 80], ['rent', '2026-08', '2026-08', 80]], [['completion', 'insurance', '2026-06', 'annual'], ['completion', 'repair', '2026-06', 'one_off']]],
        [[['rent', '2026-07', '2026-07', 80]], [true, true]],
        [[['completion', 'rent', '2026-06', 'monthly'], ['completion', 'insurance', '2026-06', 'annual'], ['completion', 'repair', '2026-06', 'one_off']], true, [['rent', '2026-07', '2026-07', 80]], 0]]);
  }));

  // ── K. RELEASE TORTURE ──
  MODES.forEach(mode => scenario('P2-6 RELEASES — the same three months with and without expectation capture: identical releases, refusals, positions and Monthly Left [' + mode + ']', () => {
    const real = world(), blind = world();
    mutate(blind.app, 'geodeCaptureExpectationGaps', 'if (fromYm > endYm) return;', 'return;');
    const both = fn => [real, blind].map(w => fn(w));
    const results = [];
    both(w => { confirmAll(w.app, w.ids, '2026-06-15'); settle(w.app, mode); });
    results.push(both(w => { w.app.at('2026-06-20'); const r = w.app.release('gH', 200); settle(w.app, mode); return r.ok; }));
    both(w => w.app.advance('2026-08-03', mode));
    results.push(both(w => { w.app.at('2026-08-05'); const r = w.app.release('gH', 100); settle(w.app, mode); return r.ok; }));
    results.push(both(w => { w.app.at('2026-08-06'); const r = w.app.release('gH', 5000); return [r.ok, r.reason || '']; }));
    both(w => w.app.advance('2026-09-02', mode));
    const looks = both(w => shown(w.app));
    invariant('P2.release.torture', 'Two identical pages, one recording expectations and one not: June £200 release, absent July, August £100 release, then a £5,000 request capped the same way to the £800 left; September: identical Monthly Left, overdue items, rows, Holiday/ISA/Card positions and releases (Holiday £0) — only the evidence differs (8 records against none)',
      [results.map(r => same(r[0], r[1])), same(looks[0], looks[1]), looks[0][0].goal.gH, looks[0][2].map(r => [r.amount, r.ym]), [real.app.state().expectationGaps.length, blind.app.state().expectationGaps.length]],
      [[true, true, true], true, 0, [[200, '2026-06'], [100, '2026-08'], [800, '2026-08']], [8, 0]]);
  }));

  // ── L. MONTHLY LEFT TORTURE ──
  scenario('P2-6 MONTHLY LEFT — real, none, forged and overlaid evidence over identical live rows; no catch-up charge', () => {
    const states = [];
    const add = (name, build) => { const w = world(); build(w); states.push([name, w]); };
    add('June + July confirmed, August', w => { confirmAll(w.app, w.ids, '2026-06-15'); w.app.advance('2026-07-02', 'reload'); confirmAll(w.app, w.ids, '2026-07-15'); w.app.advance('2026-08-03', 'reload'); });
    add('June confirmed, July absent, August', w => { confirmAll(w.app, w.ids, '2026-06-15'); w.app.advance('2026-08-03', 'reload'); });
    add('nothing confirmed, August', w => { w.app.advance('2026-08-03', 'reload'); });
    add('June confirmed, back after 12 months', w => { confirmAll(w.app, w.ids, '2026-06-15'); w.app.advance('2027-07-03', 'reload'); });
    const overlay = app => JSON.parse(app.run(`(function () {
      var keep = S;
      try {
        S = JSON.parse(JSON.stringify(keep));
        (S.payments || []).forEach(function (p, i) {
          var dom = geodeExpectationDomain(p), base = { id: 'ov_' + i, paymentId: p.id, eventType: 'completion', amount: toNum(p.amount), occurrenceYm: '2026-07', dueDateSnapshot: '2026-07-15', recordedAt: 1, source: 'mark_completed' };
          if (dom === 'bill') S.billPaymentEvents.push(Object.assign({ recurrenceSnapshot: 'monthly', paymentNameSnapshot: p.name }, base));
          if (dom === 'debt') S.debtPaymentEvents.push(Object.assign({ debtId: p.debtId }, base));
        });
        var snap = JSON.parse(__snapshot());
        return JSON.stringify([snap.left, snap.leftConfirmed, snap.homeOverduePayments, (S.debts || []).map(function (d) { return d.balance; }),
          (S.payments || []).filter(function (p) { var d = geodeExpectationDomain(p); return d === 'bill' || d === 'debt'; }).map(function (p) { return geodeExpectationOccurrenceStatus(S, p.id, '2026-07'); })]);
      } finally { S = keep; }
    })()`));
    const table = states.map(([name, w]) => {
      const s = w.app.snap();
      return [name, s.left, s.leftConfirmed, s.homeOverduePayments, authorityFree(w.app), overlay(w.app)];
    });
    invariant('P2.left.torture', '[state, Monthly Left, confirmed-only, Home overdue payments, same with no/forged records, with bill and debt July settlements overlaid → (Monthly Left, confirmed-only, overdue, Card, July read)]. Every state has the same four rows due on the 15th, so Monthly Left is £2,570 in each: two unresolved months, or twelve, never become a catch-up charge; overlaying settlements changes only the read (July confirmed), never Monthly Left or the Card balance',
      table, states.map(([name], i) => [name, L0, 3000, 0, [true, true], [L0, 3000, 0, [4000], i === 0 ? [C, C] : [C, C]]]));
  });

  // ── M. CALENDAR ──
  scenario('P2-6 CALENDAR — 31st-of-month, leap and non-leap February, December → January, annual rows beside monthly', () => {
    const bill = (born, due, rec) => { const app = new App(baseState(), born); const id = app.contribute({ name: 'Rent', amount: 80, date: due, status: 'upcoming', rec: rec || 'yes' }); return { app, id }; };
    const look = (w, yms) => [gaps(w.app, { rent: w.id }), status(w.app, w.id, yms), w.app.state().payments[0].date];
    const jan = bill('2027-01-05', '2027-01-31');
    jan.app.at('2027-01-31'); jan.app.toggle(jan.id);
    jan.app.advance('2027-03-03', 'reload');
    const janConfirmed = look(jan, ['2027-01', '2027-02', '2027-03']);
    jan.app.advance('2027-04-02', 'reload');
    const janNext = [gaps(jan.app, { rent: jan.id }), jan.app.state().expectationGaps.map(g => g.dueDay), jan.app.state().payments[0].date];
    const open = bill('2027-01-05', '2027-01-31');
    open.app.advance('2027-02-02', 'session'); const febRow = open.app.state().payments[0].date;
    open.app.advance('2027-03-03', 'session');
    const jump = bill('2027-01-05', '2027-01-31');
    jump.app.advance('2027-03-03', 'reload');
    const leap = bill('2028-01-05', '2028-01-31');
    leap.app.at('2028-01-31'); leap.app.toggle(leap.id);
    const leapPaidTo = leap.app.state().payments[0].date;
    leap.app.advance('2028-03-03', 'reload');
    const dec = bill('2026-12-01', '2026-12-15');
    dec.app.at('2026-12-15'); dec.app.toggle(dec.id);
    dec.app.advance('2027-02-02', 'reload');
    const decOpen = bill('2026-12-01', '2026-12-15');
    decOpen.app.advance('2027-02-02', 'reload');
    const mixed = bill('2026-11-01', '2026-11-15');
    const annual = mixed.app.contribute({ name: 'Insurance', amount: 300, date: '2026-12-20', status: 'upcoming', rec: 'annual' });
    mixed.app.advance('2027-02-02', 'reload');
    const JAN = ['2027-01', '2027-02', '2027-03'], LEAP = ['2028-01', '2028-02', '2028-03'], DEC = ['2026-12', '2027-01', '2027-02'];
    const months = (w, yms) => look(w, yms).slice(0, 2), day = w => w.app.state().payments[0].date;
    invariant('P2.calendar', 'Occurrence month identity survives every calendar edge (the displayed day is P2.calendar.day-drift). Due 31 Jan 2027, confirmed: back in March → February recorded (Jan confirmed, Mar unknown); April records March. Never confirmed, rendered in February and March → January and February recorded as separate months; jumped straight to March → one January–February record. Leap 2028: 31 Jan paid, back in March → February 2028 recorded. December confirmed, back in February → January 2027 alone; never confirmed → one December 2026–January 2027 record. An annual row beside a monthly one is never recorded and keeps its date',
      [janConfirmed.slice(0, 2), janNext[0], months(open, JAN), months(jump, JAN), months(leap, LEAP), months(dec, DEC), months(decOpen, DEC),
        [gaps(mixed.app, { rent: mixed.id, annual }), mixed.app.state().payments.filter(p => p.id === annual).map(p => [p.status, p.date])]],
      [[[['rent', '2027-02', '2027-02', 80]], [C, E, U]], [['rent', '2027-02', '2027-02', 80], ['rent', '2027-03', '2027-03', 80]],
        [[['rent', '2027-01', '2027-01', 80], ['rent', '2027-02', '2027-02', 80]], [E, E, U]], [[['rent', '2027-01', '2027-02', 80]], [E, E, U]],
        [[['rent', '2028-02', '2028-02', 80]], [C, E, U]], [[['rent', '2027-01', '2027-01', 80]], [C, E, U]], [[['rent', '2026-12', '2027-01', 80]], [E, E, U]],
        [[['rent', '2026-11', '2027-01', 80]], [['upcoming', '2026-12-20']]]]);
    current('P2.calendar.day-drift', 'The displayed due day drifts because no intended day is stored (P2-7 audit: LATER — a fix needs a new persisted field). Due 31 Jan 2027, confirmed: 28 Feb → 28 Mar → 28 Apr, and the March record keeps due day 28 (Feb 28, Mar 28). Never confirmed, seen in February: 28 Feb → 28 Mar. Jumped straight from January to March: 31 Mar. Leap 2028: 29 Feb → 29 Mar. A 15th-of-month row never drifts. The occurrence month is always right (P2.calendar)',
      [[janConfirmed[2], janNext[1], janNext[2]], [febRow, day(open)], day(jump), [leapPaidTo, day(leap)], [day(dec), day(decOpen)]],
      [['2027-03-28', [28, 28], '2027-04-28'], ['2027-02-28', '2027-03-28'], '2027-03-31', ['2028-02-29', '2028-03-29'], ['2027-02-15', '2027-02-15']]);
  });

  // ── N. SCHEMA-TRANSITION TORTURE ──
  scenario('P2-6 SCHEMA TRANSITIONS — 1 → 2 → 3, a crash between them, pending months, a manual valuation while pending, a stale tab during the move', () => {
    const legacy = legacyData(baseState({ incomeExplicitlySet: true, investments: [Object.assign(ISA(), { balance: 5200 })],
      payments: [legacyInvPay('i1', { rec: 'yes', date: '2026-07-10', lastPaidYM: '2026-06', lastPaidDueDate: '2026-06-10' })] }));
    const one = new App(legacy, '2026-08-03', undefined, { boot: false });
    watchWrites(one);
    one.run('__reload()');
    const oneWrites = writes(one);
    one.reload(); one.reload();
    invariant('P2.schema.1-2-3', 'Schema-1 data last used in June, first opened by this runtime in August: two transition commits (1 → 2, 2 → 3), floor August, the ISA anchored once at its legacy £5,200; the paid June row rolls, July stays unknown (it elapsed before the transition — nothing invented); two reloads write nothing more',
      [oneWrites, stored(one)._schemaVersion, stored(one).expectationFloorYm, stored(one).expectationGaps, status(one, 'i1', ['2026-06', '2026-07']), one.snap().inv.iA, fa7bVals(one).map(v => [v[0], v[2]]), writes(one)],
      [2, 3, '2026-08', [], [C, U], 5200, [[5200, 'legacy_transition']], 0]);

    const crash = new App(legacy, '2026-08-03', undefined, { boot: false });
    mutate(crash, 'geodeSchema3Transition', 'S.expectationGaps = [];', 'throw new Error("crash between commits");');
    crash.run('__reload()');
    const between = [stored(crash)._schemaVersion, crash.state().payments[0].status, crash.run('geodeBoundaryTransitionOutstanding()'), crash.warnings.splice(0)];
    const after = new App(JSON.parse(rawStore(crash)), '2026-09-02', undefined, { boot: false });
    after.run('__store = ' + JSON.stringify(rawStore(crash)) + '; __reload();');
    invariant('P2.schema.crash-between', 'The 2 → 3 commit crashing after 1 → 2 committed: storage stays schema 2 and the boundary is held (the June row stays paid); the next load, in September, commits schema 3 with floor September — July and August stay unknown, the ISA still £5,200 with one anchor',
      [between, [stored(after)._schemaVersion, stored(after).expectationFloorYm, stored(after).expectationGaps, status(after, 'i1', ['2026-07', '2026-08']), after.snap().inv.iA, fa7bVals(after).length]],
      [[2, 'paid', true, ['[geode] schema 3 transition not completed, staying on schema 2: crash between commits']], [3, '2026-09', [], [U, U], 5200, 1]]);

    const f = p1rFixture('P2');
    const pending = p1rPage(f.state, '2026-09-02', P1R_PREVIOUS);
    const month = () => [pending.run('currentYM()'), stored(pending)._schemaVersion, pending.state().payments.map(p => p.status), (pending.state().expectationGaps || []).length, pending.snap().inv.iA];
    const held = [month()];
    pending.advance('2026-10-02', 'reload'); held.push(month());
    pending.saveInvestment('iA', 'ISA', 5900); const valued = [pending.snap().inv.iA, p1rVals(stored(pending).investments)];
    pending.advance('2026-11-02', 'reload'); held.push(month());
    p1rReady(pending); pending.reload();
    const ready = [stored(pending)._schemaVersion, stored(pending).expectationFloorYm, pending.state().payments.map(p => p.status), gaps(pending, {}), pending.snap().inv.iA, p1rVals(stored(pending).investments)];
    pending.reload(); pending.reload();
    invariant('P2.schema.pending', 'Schema-2 data (ISA £5,200 with an August paid row) pending through September, October and November: every boundary held — row paid, no records, storage schema 2, ISA £5,200; a manual £5,900 valuation entered while pending is stored as an observation; the first ready load moves to schema 3 with floor November, keeps that one valuation (no legacy anchor beside it), rolls the row and records nothing for the held months; two more reloads change nothing',
      [held, valued, ready, [stored(pending)._schemaVersion, stored(pending).expectationFloorYm, p1rVals(stored(pending).investments)]],
      [[['2026-09', 2, ['paid'], 0, 5200], ['2026-10', 2, ['paid'], 0, 5200], ['2026-11', 2, ['paid'], 0, 5900]], [5900, [['iA', [[5900, 'manual']]]]],
        [3, '2026-11', ['upcoming'], [], 5900, [['iA', [[5900, 'manual']]]]], [3, '2026-11', [['iA', [[5900, 'manual']]]]]]);

    const raw2 = rawStore(p1rPage(f.state, f.clock, P1R_PREVIOUS));
    const pageOn = clock => { const app = new App(JSON.parse(raw2), clock, undefined, { boot: false }); app.run('var caches = {};'); app.run('__otherStorage.setItem(GEODE_SHELL_KEY, ' + JSON.stringify(P1R_PREVIOUS) + '); __store = ' + JSON.stringify(raw2) + '; __reload();'); return app; };
    const tabA = pageOn(f.clock), tabB = pageOn(f.clock);
    p1rReady(tabA); tabA.reload();
    const moved = rawStore(tabA);
    foreignStore(tabB, moved);
    tabB.run('S.income = 4100; persistGeodeToLocalStorage(); save();');
    tabB.advance('2026-09-02', 'session');
    const refusedB = [rawStore(tabB) === moved, staleState(tabB), relWarnings(tabB)];
    tabB.run('__otherStorage.setItem(GEODE_SHELL_KEY, BEYND_RUNTIME_VERSION); __reload();');
    invariant('P2.schema.stale-tab', 'Two pending tabs on the same schema-2 data; tab A becomes ready and moves storage to schema 3. Tab B (schema 2 in memory) then persists, saves and renders across September: all refused as "changed", A\'s schema-3 text untouched; B\'s reload adopts schema 3 (its refused income change is gone — no merge)',
      [JSON.parse(moved)._schemaVersion, refusedB, [tabB.state()._schemaVersion, tabB.state().income === JSON.parse(moved).income, staleState(tabB)]],
      [3, [true, ['changed', 'changed'], ['stale:changed']], [3, true, ['', '']]]);
  });

  // ── P. SAME-RUNTIME MULTI-TAB TORTURE ──
  scenario('P2-6 MULTI-TAB — two schema-3 tabs; the stale one never overwrites, reloads to adopt, never merges', () => {
    const origin = world();
    confirmAll(origin.app, origin.ids, '2026-06-15');
    origin.app.advance('2026-07-02', 'reload');
    const parent = rawStore(origin.app);
    const pageOn = (raw, clock) => { const app = new App(JSON.parse(raw), clock, undefined, { boot: false }); app.run('__store = ' + JSON.stringify(raw) + '; __reload();'); return app; };
    const ids = origin.ids;
    const pair = () => [pageOn(parent, '2026-07-05'), pageOn(parent, '2026-07-05')];
    const outcome = (a, b, attempt) => {
      const theirs = rawStore(a);
      foreignStore(b, theirs);
      attempt(b);
      const refused = [rawStore(b) === theirs, staleState(b)[0], relWarnings(b).length > 0];
      b.run('__reload();');
      const adopted = rawStore(b) === theirs;
      b.contribute({ name: 'After reload', amount: 5, date: b.run('geodeTodayLocalISO()'), status: 'paid', goalId: 'gH' });
      return [refused, adopted, JSON.parse(rawStore(b))._rev.seq === JSON.parse(theirs)._rev.seq + 1];
    };
    const results = [];
    let [a, b] = pair();
    a.toggle(ids.goal);
    results.push(['A completes; B renders Home (render + incidental persist) and completes', outcome(a, b, x => { x.render(); x.run('persistGeodeToLocalStorage();'); x.toggle(ids.bill); })]);
    [a, b] = pair();
    a.modalEdit(ids.debt, { amount: '65' });
    results.push(['A edits a template; B completes it', outcome(a, b, x => x.toggle(ids.debt))]);
    [a, b] = pair();
    a.advance('2026-08-03', 'session');
    const captured = a.state().expectationGaps.length;
    results.push(['A crosses into August and records July; B persists incidentally and renders', outcome(a, b, x => { x.at('2026-08-03'); x.run('persistGeodeToLocalStorage();'); x.render(); })]);
    [a, b] = pair();
    a.saveInvestment('iA', 'ISA', 6100);
    results.push(['A records a valuation; B saves', outcome(a, b, x => x.run('S.income = 9; save();'))]);
    invariant('P2.tabs.torture', 'For each pair loaded from the same schema-3 text: B\'s attempt is refused as foreign with A\'s text byte-identical; B\'s reload adopts A\'s text exactly (nothing of B\'s refused change merged) and B\'s next write is the next revision. A\'s boundary recorded July for all four rows',
      [results, captured], [results.map(r => [r[0], [[true, 'foreign', true], true, true]]), 4]);
  });

  // ── Q. LONG-LIVED TAB ──
  scenario('P2-6 LONG-LIVED TAB — open from June across month end; render, checkAlerts, calcLeftover and Home render reach the fresh-load result once', () => {
    const src = PROGRAM.src;
    const inject = (app, names) => names.forEach(n => app.run(extractFunction(src, n).text.replace(/^function (\w+)/, n + ' = function')));
    const triggers = {
      render: app => app.render(),
      checkAlerts: app => { inject(app, ['checkAlerts', 'geodeHasPositiveIncome']); app.run('geodeShouldSuppressPostSaveAlerts = function () { return false; }; checkAlerts();'); },
      calcLeftover: app => { inject(app, ['calcLeftover']); app.run('calcLeftover();'); },
      homeRender: app => { app.render(); app.run('persistGeodeToLocalStorage();'); }
    };
    const strip = s => { const o = JSON.parse(JSON.stringify(s)); delete o._rev; (o.expectationGaps || []).forEach(g => { delete g.capturedAt; }); return o; };
    const table = Object.keys(triggers).map(name => {
      const { app, ids } = world();
      confirmAll(app, ids, '2026-06-15');
      app.at('2026-06-20'); app.saveInvestment('iA', 'ISA', 5300);
      const stored0 = rawStore(app);
      app.at('2026-08-03');
      triggers[name](app);
      const once = strip(app.state());
      app.render(); triggers[name](app); app.render();
      const fresh = new App(JSON.parse(stored0), '2026-06-20', undefined, { boot: false });
      fresh.run('__store = ' + JSON.stringify(stored0) + ';');
      fresh.at('2026-08-03'); fresh.run('__reload()');
      return [name, same(once, strip(fresh.state())), same(strip(app.state()), once), app.state().expectationGaps.length, fa7bVals(app).map(v => v[2])];
    });
    const renderFirst = extractFunction(src, 'render').text.split('\n')[1].trim();
    invariant('P2.longlived', 'A page opened in June (all four rows confirmed, ISA valued £5,300) left open until 3 August: each entry point — render, checkAlerts, calcLeftover, Home render (render runs recurring sync first, then rHome persists) — leaves exactly the state a fresh August load of the June text reaches (records, rows, positions, valuations); repeating them adds nothing; four July records; the valuation is kept',
      [renderFirst, table], ['syncRecurringPayments();', Object.keys(triggers).map(n => [n, true, true, 4, ['legacy_transition', 'manual']])]);
  });

  // ── R. BACKUP / NORMALISATION ──
  scenario('P2-6 BACKUP AND NORMALISATION — every kind of evidence exported; malformed records dropped; schema 2 adds no history; newer refused; restore stays unwired', () => {
    const { app, ids } = world();
    confirmAll(app, ids, '2026-06-15');
    app.at('2026-06-20'); app.release('gH', 100); app.saveInvestment('iA', 'ISA', 5400);
    app.advance('2026-08-03', 'reload');
    const env = app.backup();
    const s = app.state();
    const KEYS = ['expectationGaps', 'expectationFloorYm', 'billPaymentEvents', 'contributionEvents', 'debtPaymentEvents', 'savingsReleases'];
    const exported = KEYS.map(k => [k, same(env.data[k], s[k]), Array.isArray(s[k]) ? s[k].length : s[k]]);
    const valid = s.expectationGaps[0];
    const bad = [null, [], 'gap', Object.assign({}, valid, { id: 'gap_x' }), Object.assign({}, valid, { fromYm: '2026-09' }), Object.assign({}, valid, { domain: 'expense' }),
      Object.assign({}, valid, { recurrence: 'annual' }), Object.assign({}, valid, { expectedAmount: -1 }), Object.assign({}, valid, { expectedAmount: 'NaN' }), Object.assign({}, valid, { capturedAt: null }),
      Object.assign({}, valid, { paymentId: '' }), Object.assign({}, valid, { toYm: '2026-13' }), Object.assign({}, valid, { expectedAmount: 1 })];
    app.ctx.__norm = JSON.stringify({ _schemaVersion: 3, expectationFloorYm: 'June', expectationGaps: [valid].concat(bad) });
    const norm = JSON.parse(app.run('(function () { var d = JSON.parse(__norm); geodeNormalizeExpectationGaps(d); var once = JSON.stringify(d); geodeNormalizeExpectationGaps(d); return JSON.stringify([d.expectationGaps.length, d.expectationGaps[0].expectedAmount, d.expectationFloorYm, once === JSON.stringify(d)]); })()'));
    const s2 = JSON.parse(JSON.stringify(env.data));
    s2._schemaVersion = 2; delete s2.expectationGaps; delete s2.expectationFloorYm;
    const restored = new App(s2, '2026-10-02', undefined, { boot: false });
    restored.run('__reload()');
    const validate = sv => app.run('validateBeyndBackupEnvelope(JSON.parse(' + JSON.stringify(JSON.stringify(Object.assign({}, env, { schemaVersion: sv }))) + ')).ok');
    const callers = (PROGRAM.src.match(/extractRestorableData\(/g) || []).length;
    invariant('P2.backup', 'The schema-3 backup carries expectation records and floor, bill, contribution and debt evidence and releases exactly as stored. Normalising a list of one valid record and thirteen malformed ones (not objects, wrong id, reversed range, unknown domain, annual, negative or non-numeric amount, no capture time, no payment, invalid month, a duplicate id) keeps only the valid one; an invalid floor becomes this month; a second pass changes nothing. Schema-2 data (that backup minus the evidence) loaded in October moves to schema 3 with floor October and no record: nothing invented; positions as in the backup. A schema-4 backup is refused, schema 3 accepted. extractRestorableData still has no caller',
      [exported, norm, [stored(restored)._schemaVersion, stored(restored).expectationFloorYm, stored(restored).expectationGaps, restored.snap().goal.gH, restored.snap().inv.iA], [validate(4), validate(3)], callers],
      [[['expectationGaps', true, 4], ['expectationFloorYm', true, '2026-06'], ['billPaymentEvents', true, 1], ['contributionEvents', true, 2], ['debtPaymentEvents', true, 1], ['savingsReleases', true, 1]],
        [1, valid.expectedAmount, '2026-08', true], [3, '2026-10', [], app.snap().goal.gH, app.snap().inv.iA], [false, true], 1]);
  });

  // ── T. KNOWN LIMITATIONS, RE-TESTED ──
  scenario('P2-6 KNOWN LIMITATIONS — each re-observed; UNKNOWN, never fabricated', () => {
    const lw = world();
    confirmAll(lw.app, lw.ids, '2026-06-15');
    lw.app.at('2026-08-03');
    lw.app.release('gH', 50);
    lw.app.render();
    invariant('P2.limit.first-write', 'P2-8 (was a known limitation): a page left open from June whose first act after the month turns is a financial write (here a £50 release) before any render processes the boundary first — July is recorded from the evidence as it stood (expected, no recorded outcome) and the release lands after it, as a render, checkAlerts, calcLeftover or fresh load first would (P2.longlived)',
      [gaps(lw.app, lw.ids), classify(lw.app, lw.ids, ['2026-07'])],
      [[['bill', '2026-07', '2026-07', 80], ['debt', '2026-07', '2026-07', 50], ['goal', '2026-07', '2026-07', 100], ['investment', '2026-07', '2026-07', 200]], every(lw.ids, [E])]);
    const pw = world();
    confirmAll(pw.app, pw.ids, '2026-06-15');
    pw.app.at('2026-08-03');
    pw.app.run("setPrimaryGoal('gH');");
    pw.app.render();
    current('P2.limit.first-preference-write', 'Narrower residual after P2-8: a first act that stores no payment, completion or valuation (here choosing the primary goal) is not a financial mutation and does not process the boundary; its save moves the seen month to August, so July reads unknown — never fabricated, never "missed"',
      [gaps(pw.app, pw.ids), classify(pw.app, pw.ids, ['2026-07'])], [[], every(pw.ids, [U])]);

    const paidRow = lastPaidYM => {
      const app = new App(baseState({ investments: [], _schemaVersion: 3, expectationGaps: [], expectationFloorYm: '2026-06', contributionEvents: [], contributionCarry: [], billPaymentEvents: [],
        payments: [{ id: 'b1', name: 'Rent', amount: 80, date: '2026-07-15', status: 'paid', rec: 'yes', lastPaidYM, goalId: '', investId: '', debtId: '', payKind: 'bill', createdAt: 1 }] }), '2026-06-10', undefined, { boot: false });
      app.at('2026-08-03'); app.run('__reload()');
      return [app.state().payments[0].status, gaps(app, { b1: 'b1' }), status(app, 'b1', ['2026-06', '2026-07'])];
    };
    invariant('P2.limit.paid-unknown', 'A paid monthly bill with a malformed completion month and no due date: the boundary resets it but cannot tell which occurrence it settled, so it records nothing — June and July stay unknown rather than guessed. With no completion month at all the row is not reset (Phase-1 rule, unchanged) and nothing is recorded either',
      [paidRow('2026-6'), paidRow('')], [['upcoming', [], [U, U]], ['paid', [], [U, U]]]);

    const dl = world('2026-06-01', ['bill']);
    confirmAll(dl.app, dl.ids, '2026-06-15');
    dl.app.advance('2026-07-10', 'reload');
    dl.app.del(dl.ids.bill);
    dl.app.advance('2026-08-03', 'reload');
    invariant('P2.limit.delete-open', 'A template deleted in July, before July\'s boundary: nothing records its July — June confirmed, July unknown (no tombstone)',
      [gaps(dl.app, dl.ids), status(dl.app, dl.ids.bill, ['2026-06', '2026-07'])], [[], [C, U]]);
  });

  // ── E. LONG ABSENCE ──
  /** Structural soundness of the records: unique ids, no month recorded twice for a payment, none current or future, none before the floor, none settled. */
  const sound = app => JSON.parse(app.run(`(function () {
    var g = S.expectationGaps || [], ym = currentYM(), seen = {}, ids = {}, overlap = false, settledHit = false, idx = geodeExpectationSettlementIndex(S);
    g.forEach(function (x) {
      ids[x.id] = true;
      for (var m = x.fromYm; m <= x.toYm; m = geodeContributionYmAdd(m, 1)) {
        if (seen[x.paymentId + '|' + m]) overlap = true;
        seen[x.paymentId + '|' + m] = true;
        if (geodeExpectationSettled(idx, x.domain, x.paymentId, m)) settledHit = true;
      }
    });
    return JSON.stringify([Object.keys(ids).length === g.length, !overlap, g.every(function (x) { return x.toYm < ym; }), g.every(function (x) { return x.fromYm >= S.expectationFloorYm; }), !settledHit]);
  })()`));
  const SOUND = [true, true, true, true, true];
  const ledgerText = app => { const s = app.state(); return JSON.stringify([s.contributionEvents, s.debtPaymentEvents, s.billPaymentEvents, s.savingsReleases]); };
  const VARIANTS = [
    ['unchanged', 'June confirmed, template unchanged'],
    ['history', 'June and July confirmed, then away'],
    ['none', 'nothing ever confirmed'],
    ['valued-before', 'ISA valued £5,500 on 10 June, then June confirmed'],
    ['valued-after', 'June confirmed, then ISA valued £5,600 on 20 June'],
    ['delete', 'June confirmed; every template deleted after the return'],
    ['edit', 'June confirmed; every template edited after the return']
  ];
  [1, 2, 6, 12, 18].forEach(n => scenario('P2-6 LONG ABSENCE — ' + n + ' month(s) away, all four domains, seven variants', () => {
    VARIANTS.forEach(([v, text]) => {
      const { app, ids } = world();
      if (v === 'valued-before') { app.at('2026-06-10'); app.saveInvestment('iA', 'ISA', 5500); }
      if (v !== 'none') confirmAll(app, ids, '2026-06-15');
      if (v === 'valued-after') { app.at('2026-06-20'); app.saveInvestment('iA', 'ISA', 5600); }
      if (v === 'history') { app.advance('2026-07-02', 'reload'); confirmAll(app, ids, '2026-07-15'); }
      const leftAt = v === 'history' ? '2026-07' : '2026-06';
      const before = [position(app), ledgerText(app)];
      const back = ymAdd(leftAt, n + 1), last = ymAdd(back, -1);
      app.advance(back + '-03', 'reload');
      const first = v === 'none' ? '2026-06' : ymAdd(leftAt, 1);
      const expectGaps = each(d => row(d, first, last));
      const got = [gaps(app, ids), sound(app), [position(app), ledgerText(app)], classify(app, ids, [last, back])];
      const want = [expectGaps, SOUND, before, every(ids, [E, U])];
      if (v === 'delete' || v === 'edit') {
        DOMAINS.forEach(d => (v === 'delete' ? app.del(ids[d]) : app.modalEdit(ids[d], { amount: String(NEW[d]) })));
        app.advance(ymAdd(back, 1) + '-03', 'reload');
        got.push(gaps(app, ids), sound(app), position(app));
        want.push(v === 'delete' ? expectGaps : sorted(expectGaps.concat(each(d => row(d, back, back, NEW)))), SOUND, before[0]);
      }
      invariant('P2.long.' + n + '.' + v, text + '; back in ' + back + ': one record per row from ' + first + ' through ' + last + ' — no duplicate or overlapping range, nothing current or future, nothing before the June floor, no settled month recorded; settlements, releases and positions exactly as before the absence; the last elapsed month expected, the current month unknown' +
        (v === 'delete' ? '; after deleting every template the next boundary records nothing more' : v === 'edit' ? '; after editing every template the next boundary records that month at the new amounts and never rewrites the range' : ''),
        got, want);
    });
  }));

  // ── F. EXPECTATION-RANGE TORTURE ──
  MODES.forEach(mode => scenario('P2-6 RANGE TORTURE — one July–September record under settlement, reversal, re-completion, deletion, reload and backup [' + mode + ']', () => {
    const { app, ids } = world('2026-06-01', ['bill']);
    confirmAll(app, ids, '2026-06-15'); settle(app, mode);
    app.advance('2026-10-02', mode);
    const record = JSON.stringify(app.state().expectationGaps);
    const read = () => status(app, ids.bill, ['2026-07', '2026-08', '2026-09', '2026-10']);
    const steps = [['recorded', read()]];
    // P2-8: late settlement as production offers it — one form save with the August date and Completed (P2.exp.range).
    app.modalEdit(ids.bill, { date: '2026-08-15', status: 'paid' }); settle(app, mode);
    steps.push(['August settled', read()]);
    app.toggle(ids.bill); settle(app, mode);
    steps.push(['August reversed', read()]);
    app.modalEdit(ids.bill, { date: '2026-08-15', status: 'paid' }); settle(app, mode);
    steps.push(['August re-completed', read()]);
    app.del(ids.bill); settle(app, mode);
    steps.push(['template deleted in October', read()]);
    app.reload();
    steps.push(['reload', read()]);
    const envelope = app.backup();
    app.ctx.__backupJson = JSON.stringify(envelope.data);
    const fromBackup = JSON.parse(app.run(`(function () { var d = JSON.parse(__backupJson); geodeNormalizeExpectationGaps(d); var once = JSON.stringify(d.expectationGaps); geodeNormalizeExpectationGaps(d);
      return JSON.stringify([once === JSON.stringify(d.expectationGaps), ['2026-07', '2026-08', '2026-09', '2026-10'].map(function (m) { return geodeExpectationOccurrenceStatus(d, ${JSON.stringify(ids.bill)}, m); })]); })()`));
    app.advance('2026-11-03', mode);
    invariant('P2.range.torture', 'Rent: June confirmed, away until October → one July–September record. The settlement overlay alone decides each month: August settled (late, through the payment form saved with the August date as Completed) → [expected, confirmed, expected]; reversed → all expected; completed again → confirmed again; template deleted in October → August stays confirmed (its evidence survives), October unknown; reload and the backup data (normalised twice, idempotent) read the same; the record is byte-identical throughout and never split; November records nothing for a deleted template',
      [steps, JSON.stringify(app.state().expectationGaps) === record, JSON.stringify(envelope.data.expectationGaps) === record, fromBackup, gaps(app, ids), app.state().billPaymentEvents.map(e => [e.eventType, e.occurrenceYm])],
      [[['recorded', [E, E, E, U]], ['August settled', [E, C, E, U]], ['August reversed', [E, E, E, U]], ['August re-completed', [E, C, E, U]], ['template deleted in October', [E, C, E, U]], ['reload', [E, C, E, U]]],
        true, true, [true, [E, C, E, U]], [['bill', '2026-07', '2026-09', 80]],
        [['completion', '2026-06'], ['completion', '2026-08'], ['reversal', '2026-08'], ['completion', '2026-08']]]);
  }));

  // ── U. P2-8 PRE-MUTATION BOUNDARY ──
  // A page last written in June and left open with no render since: its first act after the month turns changes money.
  // geodePrepareFinancialMutation: write admission, then the boundary from the evidence as it stood, then the change and its one save.
  const NEW8 = { goal: 300, investment: 500, debt: 150, bill: 500 };
  const MOVED = 'This item moved into a new month before your change was saved. Check it and try again.';
  /** Expectation records as [template name, amount]: the intent each one keeps. */
  const intents = app => (app.state().expectationGaps || []).map(g => [g.templateNameSnapshot, g.expectedAmount]);
  const rowOf = (app, id) => { const p = app.state().payments.filter(x => x.id === id)[0]; return p ? [p.name, toNumber(p.amount), p.date, p.status] : null; };
  /** The payment form opened on a row as production fills it, these fields changed, saved through production savePay; returns its toasts. */
  const formSave = (app, id, changes) => {
    p1Open(app, p1PayForm(Object.assign(app.modalForm(id), changes || {})), 'replace');
    app.run('savePay(' + JSON.stringify(id) + '); __runTimers();');
    return p1Toasts(app);
  };
  /** world() in the program that holds production savePay; June confirmed (unless confirm === false); then the clock moves to iso with no render. */
  const away = (iso, domains, confirm) => {
    const w = world('2026-06-01', domains, undefined, undefined, PROGRAM.commit);
    confirmAll(w.app, confirm === false ? {} : w.ids, '2026-06-15');
    w.app.at(iso);
    return w;
  };
  /** Every text save() stores from now on. */
  const watchSaves = app => app.run('var __saves = []; save = (function (inner) { return function () { var b = __store, r = inner(); if (__store !== b) __saves.push(__store); return r; }; })(save);');
  const takeSaves = app => JSON.parse(app.run('JSON.stringify(__saves.splice(0))'));
  /** In a stored text, the row's completion and its own settlement ledger agree for the occurrence the row holds. */
  const coherent = (app, text, id) => app.run(`(function (d) {
    var p = (d.payments || []).filter(function (x) { return x.id === ${JSON.stringify(id)}; })[0];
    if (!p) return 'no row';
    var paid = p.status === 'paid', ym = paid ? geodeBillPaidOccurrenceYm(p) : geodeBillDueYm(p.date);
    return paid === geodeExpectationSettled(geodeExpectationSettlementIndex(d), geodeExpectationDomain(p), String(p.id), ym);
  })(JSON.parse(${JSON.stringify(text)}))`);
  /** Settlement and position evidence a boundary never writes: ledgers, releases, valuations, debt balances. */
  const evidence = d => JSON.stringify([d.contributionEvents, d.debtPaymentEvents, d.billPaymentEvents, d.savingsReleases, (d.investments || []).map(i => i.valuations), (d.debts || []).map(x => x.balance)]);
  /** Pre-P2-8 behaviour: admission only — no boundary first, no action window. */
  const bypass = app => app.run('geodePrepareFinancialMutation = function () { geodeEndFinancialAction(); return geodeFinancialWriteAllowed(); };');

  scenario('P2-8 EDIT FIRST — a long-lived page\'s first act after 2, 12 and 18 months edits Rent £80 → Rent NEW £500', () => {
    [['2026-08-03', 2], ['2027-06-03', 12], ['2027-12-03', 18]].forEach(([iso, n]) => {
      const { app, ids } = away(iso, ['bill']);
      const now = iso.slice(0, 7), last = ymAdd(now, -1);
      const refused = formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' });
      const atRefusal = [gaps(app, ids), intents(app), rowOf(app, ids.bill), JSON.parse(app.run('JSON.stringify(__opened)')), same(stored(app).expectationGaps, app.state().expectationGaps)];
      formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' });
      const record = JSON.stringify(app.state().expectationGaps);
      app.render(); app.reload();
      invariant('P2.first.edit.' + n, 'Rent £80 confirmed in June; the page is left open ' + n + ' months and its first act is the Rent form (still showing June completed) saved as Rent NEW £500. The boundary runs first, from the evidence as it stood: one ' +
        '2026-07…' + last + ' record at £80 under "bill monthly", stored before the edit. The form described a completion the boundary has just reset, so it is refused and opens again on the row as it now is; saved again, Rent NEW £500 applies to ' + now + ' only. After render and reload the record is byte-identical and no past month reads £500',
        [refused, atRefusal, gaps(app, ids), intents(app), rowOf(app, ids.bill), status(app, ids.bill, ['2026-06', '2026-07', last, now]), JSON.stringify(app.state().expectationGaps) === record],
        [[MOVED], [[['bill', '2026-07', last, 80]], [['bill monthly', 80]], ['bill monthly', 80, now + '-15', 'upcoming'], { id: ids.bill, prefill: null }, true],
          [['bill', '2026-07', last, 80]], [['bill monthly', 80]], ['Rent NEW', 500, now + '-15', 'upcoming'], [C, E, E, U], true]);
    });

    const open = away('2027-06-03', ['bill'], false);
    const firstTry = formSave(open.app, open.ids.bill, { name: 'Rent NEW', amount: '500' });
    const saved = [gaps(open.app, open.ids), intents(open.app), rowOf(open.app, open.ids.bill)];
    open.app.render(); open.app.reload();
    invariant('P2.first.edit.open', 'Never confirmed (Rent still open on 15 June 2026): the form carries its own date, so the first save after 12 months proceeds — June 2026–May 2027 recorded at £80 first, then the edit (saved with the date the stale form showed). The next render rolls the row into June 2027 and records nothing new',
      [firstTry, saved, gaps(open.app, open.ids), intents(open.app), rowOf(open.app, open.ids.bill)],
      [[], [[['bill', '2026-06', '2027-05', 80]], [['bill monthly', 80]], ['Rent NEW', 500, '2026-06-15', 'upcoming']],
        [['bill', '2026-06', '2027-05', 80]], [['bill monthly', 80]], ['Rent NEW', 500, '2027-06-15', 'upcoming']]);

    const imm = away('2026-08-03', ['bill']);
    formSave(imm.app, imm.ids.bill, { name: 'Rent NEW', amount: '500' });
    formSave(imm.app, imm.ids.bill, { name: 'Rent NEW', amount: '500' });
    const july = JSON.stringify(imm.app.state().expectationGaps[0]);
    imm.app.render(); imm.app.reload();
    imm.app.advance('2026-09-03', 'reload');
    invariant('P2.first.edit.immutable', 'Captured at £80, edited to £500, rendered, reloaded, then the September boundary: the July record is byte-identical and August — the first month under the new template — is recorded at Rent NEW £500',
      [JSON.stringify(imm.app.state().expectationGaps[0]) === july, gaps(imm.app, imm.ids), intents(imm.app)],
      [true, [['bill', '2026-07', '2026-07', 80], ['bill', '2026-08', '2026-08', 500]], [['bill monthly', 80], ['Rent NEW', 500]]]);

    ['goal', 'investment', 'debt'].forEach(d => {
      const { app, ids } = away('2027-06-03', [d]);
      const pos = position(app), vals = JSON.stringify(fa7bVals(app));
      const refused = formSave(app, ids[d], { amount: String(NEW8[d]) });
      formSave(app, ids[d], { amount: String(NEW8[d]) });
      app.render(); app.reload();
      invariant('P2.first.edit.' + d, 'The ' + d + ' row (£' + AMOUNT[d] + ', June confirmed) edited to £' + NEW8[d] + ' as the first act after 12 months: July 2026–May 2027 recorded at £' + AMOUNT[d] + ' first; the form is refused once (its June completion was reset) and the retry edits the same row; Holiday, ISA (and its valuations) and Card stay as they were — the boundary moves no position',
        [refused, gaps(app, ids), intents(app).map(x => x[1]), app.state().payments.map(p => [p.id === ids[d], toNumber(p.amount)]), position(app), JSON.stringify(fa7bVals(app)) === vals],
        [[MOVED], [[d, '2026-07', '2027-05', AMOUNT[d]]], [AMOUNT[d]], [[true, NEW8[d]]], pos, true]);
    });

    const mut = away('2027-06-03', ['bill'], false);
    bypass(mut.app);
    formSave(mut.app, mut.ids.bill, { name: 'Rent NEW', amount: '500' });
    invariant('P2.first.edit.mut', 'Mutation: with the preparation reduced to admission alone (pre-P2-8), the same first save records June 2026–May 2027 as Rent NEW £500 — the boundary ran from the edited row mid-action. The preparation is what keeps £80',
      [gaps(mut.app, mut.ids), intents(mut.app)], [[['bill', '2026-06', '2027-05', 500]], [['Rent NEW', 500]]]);

    const fab = away('2026-08-03', ['bill']);
    fab.app.run('geodeBoundaryChangedRow = function () { return false; };');
    const fabToasts = formSave(fab.app, fab.ids.bill, { name: 'Rent NEW', amount: '500' });
    invariant('P2.first.edit.mut-reset', 'Mutation: without the changed-row refusal the June form (Completed, due 15 July) is applied after the boundary reopened Rent — it stores a July settlement nobody made, turning the July just recorded as expected into confirmed. The refusal is what prevents it',
      [fabToasts, rowOf(fab.app, fab.ids.bill)[3], status(fab.app, fab.ids.bill, ['2026-07', '2026-08'])], [[], 'paid', [C, U]]);
  });

  scenario('P2-8 TOGGLE FIRST — one coherent action write; a tap on a row the boundary changed is refused', () => {
    const page = () => {
      const w = world('2026-06-01', DOMAINS, undefined, undefined, PROGRAM.commit);
      w.vet = w.app.contribute({ name: 'Vet', amount: 30, date: '2026-08-20', status: 'upcoming', rec: 'no' });
      confirmAll(w.app, w.ids, '2026-06-15');
      w.app.at('2026-08-03');
      watchSaves(w.app);
      return w;
    };
    const vetBill = app => app.state().billPaymentEvents.filter(e => e.paymentId !== undefined).map(e => [e.eventType, e.occurrenceYm, toNumber(e.amount)]).slice(-1);
    const t = page();
    t.app.toggle(t.vet);
    const saves = takeSaves(t.app);
    invariant('P2.first.toggle', 'All four rows confirmed in June and a one-off Vet bill (£30, due 20 August) still open; the first act on 3 August completes Vet. Two whole-state writes: the boundary (four July records at the June templates, Vet untouched and still open) and then the completion — Vet paid with its August settlement in the same text. No stored text ever holds Vet paid without its settlement',
      [saves.length, saves.map(x => coherent(t.app, x, t.vet)), saves.map(x => JSON.parse(x).expectationGaps.length), saves.map(x => rowOf({ state: () => JSON.parse(x) }, t.vet)[3]), gaps(t.app, t.ids), vetBill(t.app)],
      [2, [true, true], [4, 4], ['upcoming', 'paid'], each(d => row(d, '2026-07', '2026-07')), [['completion', '2026-08', 30]]]);

    const m = page();
    bypass(m.app);
    m.app.toggle(m.vet);
    invariant('P2.first.toggle.mut', 'Mutation: with the preparation reduced to admission alone, completing Vet writes twice and the first write — recurring sync reached through the Home insight helper mid-action — stores Vet paid with no settlement',
      takeSaves(m.app).map(x => coherent(m.app, x, m.vet)), [false, true]);

    const moved = away('2026-08-03', ['bill'], false);
    watchSaves(moved.app);
    moved.app.run('__toasts = [];');
    moved.app.toggle(moved.ids.bill);
    const first = [p1Toasts(moved.app), takeSaves(moved.app).length, rowOf(moved.app, moved.ids.bill), gaps(moved.app, moved.ids)];
    moved.app.toggle(moved.ids.bill);
    const paidReset = away('2026-08-03', ['bill']);
    paidReset.app.run('__toasts = [];');
    paidReset.app.toggle(paidReset.ids.bill);
    const reset = [p1Toasts(paidReset.app), rowOf(paidReset.app, paidReset.ids.bill), paidReset.app.state().billPaymentEvents.length];
    invariant('P2.first.toggle.moved', 'A tap made on the June screen is never applied to another month: Rent still open on 15 June is tapped on 3 August — the boundary records June–July and moves the row to 15 August, so the tap is refused (one write: the boundary); the next tap completes August. Rent completed in June (shown completed) tapped on 3 August — the boundary reopened it, so the tap neither reopens nor completes anything',
      [first, [takeSaves(moved.app).length, rowOf(moved.app, moved.ids.bill), status(moved.app, moved.ids.bill, ['2026-06', '2026-07', '2026-08'])], reset],
      [[[MOVED], 1, ['bill monthly', 80, '2026-08-15', 'upcoming'], [['bill', '2026-06', '2026-07', 80]]], [1, ['bill monthly', 80, '2026-09-15', 'paid'], [E, E, C]],
        [[MOVED], ['bill monthly', 80, '2026-08-15', 'upcoming'], 1]]);

    const silent = away('2026-08-03', ['bill'], false);
    silent.app.run('geodeBoundaryChangedRow = function (id) { return !!(_geodeBoundaryChangedRows && _geodeBoundaryChangedRows[id] === "completion"); };');
    silent.app.run('__toasts = [];');
    silent.app.toggle(silent.ids.bill);
    invariant('P2.first.toggle.mut-moved', 'Mutation: when a tap is refused only for a reset (not a moved due date), the tap on the June screen silently completes August — a month the user never saw. Refusing a moved row is what prevents it',
      [p1Toasts(silent.app), status(silent.app, silent.ids.bill, ['2026-06', '2026-07', '2026-08'])], [[], [E, E, C]]);
  });

  scenario('P2-8 OTHER FIRST ACTIONS — delete, contribution, release, valuation, new payment and Smart Import each process the boundary first', () => {
    const FOUR = each(d => row(d, '2026-07', '2026-07'));
    [
      ['delete Rent', (app, ids) => { app.del(ids.bill); return app.state().payments.some(p => p.id === ids.bill); }, false],
      ['complete a £50 Holiday contribution', app => !!app.contribute({ name: 'Top-up', amount: 50, date: '2026-08-03', status: 'paid', goalId: 'gH' }), true],
      ['release £50 from Holiday', app => app.release('gH', 50).ok, true],
      ['value the ISA at £5,600', app => { app.saveInvestment('iA', 'ISA', 5600); return fa7bVals(app).map(v => [v[0], v[2]]).pop(); }, [5600, 'manual']],
      ['create a Vet payment', app => !!app.contribute({ name: 'Vet', amount: 30, date: '2026-08-20', status: 'upcoming', rec: 'no' }), true],
      ['Smart Import a £75 Holiday payment', app => { app.smartImport([{ name: 'Holiday savings', amount: 75, date: '2026-08-02', link: 'goal:gH' }]); return app.state().payments.length; }, 5]
    ].forEach(([label, act, effect]) => {
      const { app, ids } = away('2026-08-03', DOMAINS);
      const done = act(app, ids);
      app.reload();
      invariant('P2.first.other.' + label.split(' ')[0].toLowerCase(), 'All four rows confirmed in June; the first act on 3 August is to ' + label + ': it happens, and July is recorded for every row at its June template (expected, no recorded outcome) — the act cannot remove or rewrite that evidence',
        [done, gaps(app, ids), classify(app, ids, ['2026-07'])], [effect, FOUR, every(ids, [E])]);
    });
  });

  scenario('P2-8 FRESH LOAD, PRIOR RENDER AND HELD BOUNDARY — nothing processed twice; a held boundary stays held', () => {
    const fresh = away('2027-06-03', ['bill']);
    fresh.app.run('__reload()');
    watchSaves(fresh.app);
    const freshToasts = formSave(fresh.app, fresh.ids.bill, { name: 'Rent NEW', amount: '500' });
    const rendered = away('2026-08-03', ['bill']);
    rendered.app.render();
    watchSaves(rendered.app);
    const renderedToasts = formSave(rendered.app, rendered.ids.bill, { name: 'Rent NEW', amount: '500' });
    invariant('P2.first.fresh', 'A fresh load after 12 months (boundary processed at load), or a render first in the long-lived page: the edit is the only write, applies at once, and leaves exactly one range at £80',
      [[freshToasts, takeSaves(fresh.app).length, gaps(fresh.app, fresh.ids), rowOf(fresh.app, fresh.ids.bill)], [renderedToasts, takeSaves(rendered.app).length, gaps(rendered.app, rendered.ids)]],
      [[[], 1, [['bill', '2026-07', '2027-05', 80]], ['Rent NEW', 500, '2027-06-15', 'upcoming']], [[], 1, [['bill', '2026-07', '2026-07', 80]]]]);

    const f = p1rFixture('P2');
    const withRent = JSON.parse(JSON.stringify(f.state));
    withRent.payments.push({ id: 'bR', name: 'Rent', amount: 80, date: '2026-08-15', status: 'upcoming', rec: 'yes', lastPaidYM: '', payKind: 'bill', createdAt: new Date(2026, 7, 1, 12).getTime() });
    const held = edit => {
      const app = p1rPage(withRent, f.clock, P1R_PREVIOUS);
      app.at('2026-09-02');
      if (edit) app.modalEdit('bR', { name: 'Rent NEW', amount: '500' });
      const during = [app.snap().inv.iA, app.state().payments.map(p => [p.id, p.status, toNumber(p.amount), p.date]), (app.state().expectationGaps || []).length, app.state()._schemaVersion];
      p1rReady(app); app.reload();
      return [during, intents(app), app.run("geodeExpectationOccurrenceStatus(S, 'bR', '2026-08')"), app.snap().inv.iA, app.state().expectationFloorYm];
    };
    invariant('P2.first.held', 'P2-2 fixture opened in August with the investment transition outstanding, plus an open £80 Rent due 15 August. On 2 September (boundary held) the first act edits Rent to £500: the boundary stays held — nothing recorded, Rent not rolled, the ISA row still paid, ISA £5,200 — and the edit applies. The held page is still schema 2, so no record can exist before the September schema-3 floor: at the ready load August reads unknown with or without the edit, and never Rent NEW £500',
      [held(true), held(false)],
      [[[5200, [['id1', 'paid', 200, '2026-09-05'], ['bR', 'upcoming', 500, '2026-08-15']], 0, 2], [], U, 5200, '2026-09'],
        [[5200, [['id1', 'paid', 200, '2026-09-05'], ['bR', 'upcoming', 80, '2026-08-15']], 0, 2], [], U, 5200, '2026-09']]);
  });

  scenario('P2-8 STALE TAB — an action in a page another window has written behind is refused before capture, roll or change', () => {
    [
      ['edit', (app, ids) => formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' })],
      ['toggle', (app, ids) => app.toggle(ids.bill)],
      ['release', app => app.release('gH', 50)]
    ].forEach(([label, act]) => {
      const { app, ids } = away('2026-08-03', DOMAINS);
      const other = JSON.parse(rawStore(app));
      other._rev = { seq: other._rev.seq + 1, id: 'rev_other_tab', by: other._rev.by, at: new Date(2026, 7, 2, 12).getTime() };
      other.income = 4100;
      const theirs = JSON.stringify(other);
      foreignStore(app, theirs);
      const mine = JSON.stringify(app.state());
      act(app, ids);
      invariant('P2.first.stale.' + label, 'Another window of the same runtime stored a newer revision on 2 August; this June page\'s first act (' + label + ') is refused at admission: storage is exactly the other window\'s text, and this page records, rolls and changes nothing — its memory is as it was',
        [rawStore(app) === theirs, staleState(app), JSON.stringify(app.state()) === mine, relWarnings(app)], [true, ['foreign', 'foreign'], true, ['stale:foreign']]);
    });
  });

  scenario('P2-8 ACTION ATOMICITY — with a boundary pending, each action stores the boundary and then itself; nothing half-made', () => {
    const page = () => {
      const w = world('2026-06-01', DOMAINS, undefined, undefined, PROGRAM.commit);
      w.vet = w.app.contribute({ name: 'Vet', amount: 30, date: '2026-08-20', status: 'upcoming', rec: 'no' });
      w.extra = w.app.contribute({ intent: 'set', name: 'Card extra', amount: 100, date: '2026-08-20', status: 'upcoming', rec: 'no', debtId: 'dC' });
      w.early = w.app.contribute({ name: 'Insurance', amount: 40, date: '2026-08-25', status: 'upcoming', rec: 'no' });
      confirmAll(w.app, w.ids, '2026-06-15');
      w.app.toggle(w.early);
      w.app.at('2026-08-03');
      return w;
    };
    const table = [
      ['toggle bill', w => w.app.toggle(w.vet), 'vet'],
      ['toggle debt', w => w.app.toggle(w.extra), 'extra'],
      ['contribution', w => w.app.contribute({ name: 'Top-up', amount: 50, date: '2026-08-03', status: 'paid', goalId: 'gH' })],
      ['undo', w => w.app.toggle(w.early), 'early'],
      ['release', w => w.app.release('gH', 50)],
      ['valuation', w => w.app.saveInvestment('iA', 'ISA', 5600)],
      ['payment form', w => formSave(w.app, w.vet, { amount: '35' }), 'vet']
    ].map(([label, act, rowKey]) => {
      const w = page();
      const before = evidence(w.app.state());
      watchSaves(w.app);
      act(w);
      const saves = takeSaves(w.app);
      const id = rowKey ? w[rowKey] : null;
      const look = x => { const d = JSON.parse(x); return evidence(d) + JSON.stringify(d.payments.map(p => [p.id, p.status, toNumber(p.amount)])); };
      return [label, saves.length, evidence(JSON.parse(saves[0])) === before, look(saves[saves.length - 1]) !== look(saves[0]),
        saves[saves.length - 1] === rawStore(w.app), id ? saves.map(x => coherent(w.app, x, id)) : [true, true]];
    });
    invariant('P2.atomic', 'June page, 3 August, each first act in its own page: exactly two writes — the boundary (no settlement, release, valuation or debt balance in it changed) and the action (the whole change in that one text, which is what stays stored). Every row the action completes or reopens agrees with its own ledger in every stored text',
      table, table.map(r => [r[0], 2, true, true, true, [true, true]]));
  });

  scenario('P2-8 HARNESS FIDELITY — the production edit-first call graph, and what the harness may stub', () => {
    const src = PROGRAM.src;
    const text = n => extractFunction(src, n).text;
    const strip = t => t.replace(/\/\/[^\n]*/g, '').replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g, '""');
    const at = (t, k) => { const i = t.indexOf(k); return i < 0 ? Infinity : i; };
    const actionSave = n => strip(text(n)).lastIndexOf('\n  save();');
    invariant('P2.fidelity.graph', 'Production: the payment form save and togglePay ask the Home insight helper before their save; it reads getMonthPlan, whose first work is calcLeftover, whose first statement is recurring sync; the frozen Suggested Actions reconcile reaches getMonthPlan through getSuggestedActions. So any month boundary still pending when an action starts is processed in the middle of it — unless it was processed before the first change',
      [at(strip(text('geodeSavePayApply')), 'geodeHomeMainActionInsightKind()') < actionSave('geodeSavePayApply'), at(strip(text('togglePay')), 'geodeHomeMainActionInsightKind()') < actionSave('togglePay'),
        at(text('geodeHomeMainActionInsightKind'), 'getMonthPlan()') < Infinity, text('getMonthPlan').split('\n').slice(1, 3).map(s => s.trim()), text('calcLeftover').split('\n')[1].trim(),
        at(text('geodeReconcileFrozenSuggestedActionsAfterLinkedSave'), 'getSuggestedActions(') < Infinity, at(text('getSuggestedActions'), 'getMonthPlan()') < Infinity],
      [true, true, true, ['var steps = [];', 'var left = calcLeftover();'], 'syncRecurringPayments();', true, true]);

    const probe = new App(baseState(), '2026-06-10');
    probe.run('var __syncs = 0, __sync = syncRecurringPayments; syncRecurringPayments = function () { __syncs++; return __sync.apply(null, arguments); };' +
      ' geodeHomeMainActionInsightKind(); geodeReconcileFrozenSuggestedActionsAfterLinkedSave(); getMonthPlan();');
    invariant('P2.fidelity.shims', 'The harness keeps that path: its insight, reconcile and getMonthPlan shims each reach production calcLeftover, which runs recurring sync (three calls); the Plan program\'s getMonthPlan shim does the same',
      [probe.run('__syncs'), PROGRAM.extracted.some(f => f.name === 'calcLeftover'), /function getMonthPlan\(\) \{ calcLeftover\(\);/.test(PLAN_SHIMS)], [3, true, true]);

    const ENTRIES = ['savePay', 'geodeDupPayResolve', 'geodeDupExpResolve', 'saveExp', 'saveGoal', 'saveInv', 'saveDebt', 'saveInc', 'geodeConfirmSavingsRelease',
      'geodeSmartImportConfirm', 'togglePay', 'delPay', 'delGoal', 'delInv', 'delDebt', 'delExp', 'doDep', 'geodeSpendingQuickAdd', 'geodeRemoveSub', 'geodeQsDone',
      'geodeSmartImportUseAsIncome', 'geodeApplySuggestion', 'geodeUndoLastAdjustment'];
    const CHANGE = /\bS\.[\w$.\[\]"]+\s*=(?!=)|\.push\(|\.splice\(|\b(p|g|ex|inv|d|row|exp)\.\w+\s*=(?!=)|delete\s+[a-z]\.|geodeSavePayApply\(|geodeSaveExpApply\(|geodeApplySavingsRelease\(|geodeMergeDuplicateLinkedContributionsSameMonth\(|(?<!function )_doSave\w*\(/;
    const UI = ['render()', 'rGoals()', 'checkAlerts()', 'rHome()', 'geodeEmitPaymentCompletionFeedback('];
    const order = ENTRIES.map(n => {
      const t = strip(text(n)).replace(/function _doSave\w*\(/g, 'function __local(');
      const admit = Math.min(at(t, 'geodePrepareFinancialMutation()'), at(t, 'geodeModalCommitBegin()'));
      const m = t.match(CHANGE), save = at(t, 'save()'), ui = Math.min(...UI.map(k => at(t, k)));
      return [n, admit < (m ? m.index : Infinity), ui === Infinity || save < ui];
    });
    invariant('P2.fidelity.entries', 'Every live financial entry point (payment, expense, goal, investment, debt and income forms, duplicate prompts, release, Smart Import, toggle, deletes, deposit, quick add, subscriptions, Quick Setup, import as income, suggestion apply and undo) admits — geodePrepareFinancialMutation or the commit — before its first change (the legacy same-month merge included); and each calls render, rGoals, checkAlerts, rHome or completion feedback only after its save, which is why the harness may stub those as no-ops',
      order, ENTRIES.map(n => [n, true, true]));
  });

  // ── V. P2-9 FAILED PERSISTENCE ──
  // A KEY write that throws or does not read back puts S back to the committed text: what never reached storage can
  // neither become month-boundary evidence nor ride along with a later write, and nothing after the failure says "saved".
  const fail = (app, fault) => app.run('__storageFault = ' + JSON.stringify(fault) + '; __toasts = []; __acks = [];');
  /** Storage works again; the failed task has ended. */
  const heal = app => app.run('__storageFault = ""; __runTimers();');
  const acks = app => JSON.parse(app.run('JSON.stringify(__acks)'));
  const actionWindow = app => JSON.parse(app.run('JSON.stringify([_geodeFinancialActionOpen, _geodeBoundaryChangedRows])'));
  /** An unrelated later write that succeeds (a preference persisted from this page). */
  const unrelated = app => app.run('S.lastSeenAt = Date.now() + 1; persistGeodeToLocalStorage()');
  /** KEY writes from now: the first `ok` succeed, the next `bad` fail as `fault`, then storage works again. */
  const failAfter = (app, ok, bad, fault) => app.run('var __wplan = { ok: ' + ok + ', bad: ' + bad + ' }, __wplanSet = localStorage.setItem; localStorage.setItem = function (k, v) {' +
    ' if (k === KEY) { if (__wplan.ok > 0) __wplan.ok--; else if (__wplan.bad > 0) { __wplan.bad--; if (' + JSON.stringify(fault) + ' === "throw") throw new Error("QuotaExceededError"); return; } }' +
    ' return __wplanSet.call(localStorage, k, v); }; __toasts = []; __acks = [];');
  const storedRow = (app, id) => { const p = stored(app).payments.filter(x => x.id === id)[0]; return p ? [p.name, toNumber(p.amount), p.date, p.status] : null; };
  /** world() last written on 1 June 2026, its rows due on `due`; the clock moves to iso with no render (a long-lived page). */
  const openPage = (iso, domains, due) => { const w = world('2026-06-01', domains, due, undefined, PROGRAM.commit); w.app.at(iso); return w; };
  const FAULTS = ['throw', 'lose', 'control'];

  scenario('P2-9 RESULT CONTRACT — save and persist say saved, no_change, refused or failed; a failed write leaves memory as committed', () => {
    const { app } = world('2026-06-01', ['bill']);
    const run = code => app.run(code);
    const look = () => [run('S.income'), run('JSON.stringify(S._rev)') === run('JSON.stringify(JSON.parse(__store)._rev)'), JSON.parse(run('__store')).income, run('_geodeKnownRaw === __store')];
    const results = [run('S.income = 3100; save()'), run('save()'), run('S.income = 3200; persistGeodeToLocalStorage()'), run('persistGeodeToLocalStorage()')];
    fail(app, 'throw');
    const thrown = [run('S.income = 3300; save()'), look(), p1Toasts(app)];
    heal(app); fail(app, 'lose');
    const lost = [run('S.income = 3400; persistGeodeToLocalStorage()'), look(), p1Toasts(app), actionWindow(app)];
    heal(app);
    const fenced = JSON.parse(rawStore(app));
    fenced._rev = { seq: fenced._rev.seq + 1, id: 'rev_other_window', by: 'v1.0.78', at: 3 };
    foreignStore(app, JSON.stringify(fenced));
    const refused = [run('S.income = 3500; save()'), rawStore(app) === JSON.stringify(fenced), relWarnings(app)];
    invariant('P2.fail.contract', 'save() and persistGeodeToLocalStorage() return saved, then no_change for the same state; a throwing setItem (save) and a write that does not read back (persist) return failed: memory income, revision and knownRaw are the stored ones again and the one save-failed message shows; after another window wrote a newer revision: refused, its text kept',
      [results, thrown, lost, refused],
      [['saved', 'no_change', 'saved', 'no_change'], ['failed', [3200, true, 3200, true], [SAVE_FAILED]], ['failed', [3200, true, 3200, true], [SAVE_FAILED], [0, null]],
        ['refused', true, ['stale:foreign']]]);
  });

  scenario('P2-9 EDIT FIRST, STORAGE FAILING — the R2 reproduction after 2, 12 and 18 months: no failed template becomes history', () => {
    [['2026-08-03', 2], ['2027-06-03', 12], ['2027-12-03', 18]].forEach(([iso, n]) => {
      const now = iso.slice(0, 7), last = ymAdd(now, -1);
      FAULTS.forEach(fault => {
        const { app, ids } = openPage(iso, ['bill'], '2028-12-15');
        const before = rawStore(app);
        fail(app, fault === 'control' ? '' : fault);
        const toasts = formSave(app, ids.bill, { name: 'Rent NEW', amount: '500', date: last + '-15' });
        const at = [toasts, acks(app), rowOf(app, ids.bill), rawStore(app) === before, actionWindow(app)];
        heal(app); app.render(); unrelated(app);
        const look = [at, gaps(app, ids), stored(app).expectationGaps.length, storedRow(app, ids.bill), status(app, ids.bill, [last])];
        if (fault === 'control') {
          invariant('P2.fail.edit.' + n + '.control', 'Control: storage working, the same first act after ' + n + ' months (Rent → Rent NEW £500 due ' + last + '-15) is saved and acknowledged ("£500 scheduled ✓", and the harness\'s subscription note); the next render moves it to ' + now + ' and records nothing — ' + last + ' stays unknown',
            look, [[[], ['subscription Rent NEW', '£500 scheduled ✓'], ['Rent NEW', 500, last + '-15', 'upcoming'], false, [0, null]], [], 0, ['Rent NEW', 500, now + '-15', 'upcoming'], [U]]);
        } else {
          invariant('P2.fail.edit.' + n + '.' + fault, 'Rent £80 due 15 Dec 2028, last written 1 June 2026; ' + n + ' months later its first act edits it to Rent NEW £500 due ' + last + '-15 and the write ' + (fault === 'throw' ? 'throws' : 'does not read back') + ': only the save-failed message, no acknowledgement, Rent back to £80 in memory, storage untouched, the action window closed. Storage then works, the page renders and an unrelated write succeeds: no record, Rent £80 stored, ' + last + ' unknown',
            look, [[[SAVE_FAILED], [], ['bill monthly', 80, '2028-12-15', 'upcoming'], true, [0, null]], [], 0, ['bill monthly', 80, '2028-12-15', 'upcoming'], [U]]);
        }
      });
    });

    const mut = openPage('2026-08-03', ['bill'], '2028-12-15');
    mut.app.run('geodeRestoreCommittedState = function () {};');
    fail(mut.app, 'throw');
    formSave(mut.app, mut.ids.bill, { name: 'Rent NEW', amount: '500', date: '2026-07-15' });
    heal(mut.app); mut.app.render(); unrelated(mut.app);
    invariant('P2.fail.edit.mut', 'Mutation: without putting S back after the failed write (only the revision restored, as before P2-9), the same case stores July 2026 as Rent NEW £500 after recovery — the R2 reproduction. The restore is what prevents it',
      [gaps(mut.app, mut.ids), intents(mut.app), stored(mut.app).expectationGaps.map(g => [g.fromYm, g.expectedAmount, g.templateNameSnapshot])],
      [[['bill', '2026-07', '2026-07', 500]], [['Rent NEW', 500]], [['2026-07', 500, 'Rent NEW']]]);
  });

  scenario('P2-9 TWO WRITES — the boundary write failing stops the action; the boundary stored and the action failing keeps the boundary only', () => {
    FAULTS.slice(0, 2).forEach(fault => {
      const { app, ids } = away('2026-08-03', ['bill']);
      const before = rawStore(app), row = rowOf(app, ids.bill);
      fail(app, fault);
      const toasts = formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' });
      const at = [toasts, acks(app), gaps(app, ids), rowOf(app, ids.bill), rawStore(app) === before, actionWindow(app), app.run('!!__modal && __modal.getAttribute("data-geode-commit")')];
      heal(app); app.render();
      const recorded = gaps(app, ids);
      const retry = [formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' }), formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' })];
      invariant('P2.fail.boundary.' + fault, 'A: June confirmed, 3 August, the boundary pending; the first act\'s boundary write ' + (fault === 'throw' ? 'throws' : 'does not read back') + ': the boundary is undone in memory, the edit never runs (form left open, no commit taken), only the save-failed message, storage untouched. Storage works: the next render records July at £80; the form opened again on the processed row saves (twice, no warning) — July keeps £80, no £500 history',
        [at, recorded, retry, gaps(app, ids), intents(app), rowOf(app, ids.bill)[0]],
        [[[SAVE_FAILED], [], [], row, true, [0, null], null], [['bill', '2026-07', '2026-07', 80]], [[], []], [['bill', '2026-07', '2026-07', 80]], [['bill monthly', 80]], 'Rent NEW']);
    });
    const proceeds = away('2026-08-03', ['bill']);
    const prepared = extractFunction(PROGRAM.src, 'geodePrepareFinancialMutation').text.replace("syncRecurringPayments() === 'failed' || ", '(syncRecurringPayments(), false) || ');
    proceeds.app.run(prepared);
    failAfter(proceeds.app, 0, 1, 'throw');
    formSave(proceeds.app, proceeds.ids.bill, { name: 'Rent NEW', amount: '500' });
    invariant('P2.fail.boundary.mut', 'Mutation: when the preparation ignores its failed boundary write, the edit runs on the un-processed month and its own write succeeds — the stale June form is stored (Rent NEW completed) and July is never recorded. Refusing after a failed boundary write is what prevents it',
      [storedRow(proceeds.app, proceeds.ids.bill), stored(proceeds.app).expectationGaps], [['Rent NEW', 500, '2026-07-15', 'paid'], []]);

    FAULTS.slice(0, 2).forEach(fault => {
      const { app, ids } = away('2026-08-03', ['bill'], false);
      failAfter(app, 1, 1, fault);
      const toasts = formSave(app, ids.bill, { name: 'Rent NEW', amount: '500' });
      const at = [toasts, acks(app), gaps(app, ids), stored(app).expectationGaps.map(g => [g.fromYm, g.toYm, g.expectedAmount]), rowOf(app, ids.bill), storedRow(app, ids.bill), app.run('__store.indexOf("Rent NEW") < 0'), actionWindow(app)];
      app.run('__runTimers();'); unrelated(app);
      app.at('2026-09-03'); app.render();
      invariant('P2.fail.action.' + fault, 'B: Rent open since June, 3 August: the boundary write succeeds (June–July at £80, Rent moved to 15 August), then the edit\'s write ' + (fault === 'throw' ? 'throws' : 'does not read back') + ': storage holds the boundary and not the edit, memory is that boundary state, only the save-failed message. After an unrelated write and the September boundary, August is recorded at the old £80 — the failed edit never becomes history',
        [at, gaps(app, ids), intents(app), app.run('__store.indexOf("Rent NEW") < 0')],
        [[[SAVE_FAILED], [], [['bill', '2026-06', '2026-07', 80]], [['2026-06', '2026-07', 80]], ['bill monthly', 80, '2026-08-15', 'upcoming'], ['bill monthly', 80, '2026-08-15', 'upcoming'], true, [0, null]],
          [['bill', '2026-06', '2026-07', 80], ['bill', '2026-08', '2026-08', 80]], [['bill monthly', 80], ['bill monthly', 80]], true]);
    });
  });

  scenario('P2-9 FOUR DOMAINS — failed past-dated edits of bill, goal, investment and debt rows never become history or move a position', () => {
    DOMAINS.forEach(d => {
      FAULTS.forEach(fault => {
        const { app, ids } = openPage('2026-08-03', [d], '2026-09-15');
        const pos = position(app), vals = JSON.stringify(fa7bVals(app));
        fail(app, fault === 'control' ? '' : fault);
        const toasts = formSave(app, ids[d], { amount: String(NEW8[d] * 3), date: '2026-07-15' });
        heal(app); app.render(); unrelated(app);
        app.at('2026-10-03'); app.render();
        const look = [toasts, gaps(app, ids), position(app), JSON.stringify(fa7bVals(app)) === vals];
        if (fault === 'control') {
          invariant('P2.fail.domain.' + d + '.control', 'Control: the ' + d + ' row (£' + AMOUNT[d] + ', due 15 September) edited on 3 August to £' + (NEW8[d] * 3) + ' due 15 July is saved; it moves to August and August–September are recorded at the new amount (the edit came before them); no position moves',
            look, [[], [[d, '2026-08', '2026-09', NEW8[d] * 3]], pos, true]);
        } else {
          invariant('P2.fail.domain.' + d + '.' + fault, 'The ' + d + ' row (£' + AMOUNT[d] + ', due 15 September, last written in June) edited on 3 August to £' + (NEW8[d] * 3) + ' due 15 July; the write ' + (fault === 'throw' ? 'throws' : 'does not read back') + '. Storage recovers, an unrelated write succeeds, then October: only September is recorded, at the old £' + AMOUNT[d] + '; Holiday, ISA (and its valuations) and Card unchanged',
            look, [[SAVE_FAILED], [[d, '2026-09', '2026-09', AMOUNT[d]]], pos, true]);
        }
      });
    });
  });

  scenario('P2-9 FAILED TOGGLE, RELEASE, VALUATION, DELETE AND CREATE — a later successful write never carries a failed action', () => {
    const { app, ids } = openPage('2026-08-03', DOMAINS, '2026-08-15');
    app.render();
    const pos = position(app);
    fail(app, 'throw');
    DOMAINS.forEach(d => app.toggle(ids[d]));
    const at = [p1Toasts(app), acks(app), rows(app, ids).map(r => r[2]), settled(app, ids), position(app)];
    heal(app); unrelated(app);
    const kept = [stored(app).payments.map(p => p.status), evidence(stored(app)) === evidence(app.state()), DOMAINS.map(d => coherent(app, rawStore(app), ids[d])), DOMAINS.map(d => status(app, ids[d], ['2026-08'])[0])];
    DOMAINS.forEach(d => app.toggle(ids[d]));
    invariant('P2.fail.toggle', 'Bill, goal, investment and debt rows (due 15 August) tapped complete on 3 August while every write throws: one save-failed message, no completion feedback, every row still open with no settlement, positions unchanged. After recovery an unrelated write stores no paid row and no settlement (each row agrees with its ledger); August reads unknown until the taps are retried and saved',
      [at, kept, settled(app, ids).map(s => s.slice(0, 3))],
      [[[SAVE_FAILED], [], ['upcoming', 'upcoming', 'upcoming', 'upcoming'], [], pos], [['upcoming', 'upcoming', 'upcoming', 'upcoming'], true, [true, true, true, true], [U, U, U, U]],
        [['bill', 'bill', '2026-08'], ['debt', 'debt', '2026-08'], ['goal', 'contribution', '2026-08'], ['investment', 'contribution', '2026-08']]]);

    const rel = world('2026-06-01', ['bill'], undefined, undefined, PROGRAM.commit).app;
    const held = position(rel);
    fail(rel, 'throw');
    const refusedRelease = rel.release('gH', 100);
    const releaseAt = [refusedRelease, p1Toasts(rel), rel.state().savingsReleases.length, position(rel), rel.run('__modal ? __modal.getAttribute("data-geode-commit") : null')];
    fail(rel, 'lose');
    rel.run('__runTimers();');
    const valToasts = rel.saveInvestment('iA', 'ISA', 6400);
    const valAt = [valToasts, fa7bVals(rel).map(v => v[0]), position(rel)];
    heal(rel); unrelated(rel);
    const relKept = [stored(rel).savingsReleases.length, (stored(rel).investments[0].valuations || []).map(v => v.value), position(rel)];
    const retried = [rel.release('gH', 100).ok, rel.saveInvestment('iA', 'ISA', 6400)];
    invariant('P2.fail.release-valuation', 'A £100 Holiday release whose write throws reports not saved (the release modal keeps no commit, no success line) and leaves no release; an ISA value of £6,400 whose write does not read back leaves the valuations as they were (only the save-failed message). After recovery an unrelated write stores neither; retried, both save',
      [releaseAt, valAt, relKept, retried, rel.state().savingsReleases.length, fa7bVals(rel).map(v => v[0])],
      [[{ ok: false, reason: 'not_saved' }, [SAVE_FAILED], 0, held, null], [[SAVE_FAILED], [5000], held], [0, [5000], held], [true, []], 1, [5000, 6400]]);

    const del = away('2026-08-03', ['bill']);
    del.app.render();
    const record = JSON.stringify(del.app.state().expectationGaps);
    fail(del.app, 'throw');
    del.app.del(del.ids.bill);
    const delAt = [p1Toasts(del.app), !!rowOf(del.app, del.ids.bill)];
    heal(del.app); unrelated(del.app);
    const created = del.app.contribute({ name: 'Gym', amount: 40, date: '2026-08-20', status: 'upcoming', rec: 'yes' });
    del.app.run('__runTimers();');
    fail(del.app, 'lose');
    const gym = del.app.contribute({ name: 'Gym', amount: 40, date: '2026-08-20', status: 'upcoming', rec: 'yes' });
    const gymAt = [p1Toasts(del.app), del.app.state().payments.filter(p => p.name === 'Gym').length];
    heal(del.app); unrelated(del.app);
    del.app.at('2026-10-03'); del.app.render();
    invariant('P2.fail.delete-create', 'Deleting Rent while the write throws leaves Rent (only the save-failed message); after recovery an unrelated write still stores Rent and its July record byte-identical. A new recurring Gym created while the write does not read back leaves no Gym; an unrelated write stores only the Gym created earlier with storage working (control), and October records August–September for that one Gym alone.',
      [delAt, storedRow(del.app, del.ids.bill) !== null, JSON.stringify(stored(del.app).expectationGaps.filter(g => g.fromYm === '2026-07')) === record, created !== null, gymAt,
        stored(del.app).payments.filter(p => p.name === 'Gym').length, stored(del.app).expectationGaps.map(g => [g.templateNameSnapshot, g.fromYm])],
      [[[SAVE_FAILED], true], true, true, true, [[SAVE_FAILED], 1], 1, [['bill monthly', '2026-07'], ['bill monthly', '2026-08'], ['Gym', '2026-08']]]);
  });

  scenario('P2-9 STALE TAB AND SCHEMA TRANSITION — failure never weakens P2-1 or the transition', () => {
    const { app, ids } = openPage('2026-08-03', ['bill'], '2028-12-15');
    fail(app, 'throw');
    formSave(app, ids.bill, { name: 'Rent NEW', amount: '500', date: '2026-07-15' });
    heal(app);
    const fenced = JSON.parse(rawStore(app));
    fenced._rev = { seq: fenced._rev.seq + 1, id: 'rev_other_window', by: 'v1.0.78', at: 3 };
    fenced.income = 4600;
    foreignStore(app, JSON.stringify(fenced));
    const retry = formSave(app, ids.bill, { name: 'Rent NEW', amount: '500', date: '2026-07-15' });
    app.render(); unrelated(app);
    invariant('P2.fail.stale', 'A failed edit, then another window stores a newer revision, then this page retries: refused at admission (stale gate), the other window\'s text stays byte-identical and this page records nothing',
      [retry, rawStore(app) === JSON.stringify(fenced), staleState(app), relWarnings(app), gaps(app, ids)], [[], true, ['foreign', 'foreign'], ['stale:foreign'], []]);

    const src3 = world('2026-06-01', ['bill']);
    const s2 = JSON.parse(rawStore(src3.app));
    s2._schemaVersion = 2; delete s2.expectationGaps; delete s2.expectationFloorYm;
    const page = new App(s2, '2026-08-05', undefined, { boot: false });
    fail(page, 'throw');
    page.run('__reload()');
    const failed = [page.warnings.splice(0), p1Toasts(page), page.state()._schemaVersion, 'expectationFloorYm' in page.state()];
    heal(page);
    page.run('S.income = 3300; save();');
    const continued = [stored(page)._schemaVersion, 'expectationFloorYm' in stored(page), stored(page).income];
    page.reload();
    invariant('P2.fail.schema', 'Schema-2 data opened on 5 August with every write throwing: the 2 → 3 commit fails (memory stays schema 2, no floor). Storage recovers and the same page saves: schema 2 is stored, never an uncommitted schema 3. The next load commits schema 3 with floor August',
      [failed, continued, stored(page)._schemaVersion, stored(page).expectationFloorYm],
      [[['[geode] schema 3 transition not completed, staying on schema 2: storage'], [SAVE_FAILED], 2, false], [2, false, 3300], 3, '2026-08']);
  });

  scenario('P2-9 MESSAGES AND HARNESS FIDELITY — success only after a stored write; the harness write fails as production does', () => {
    const ok = openPage('2026-08-03', ['bill'], '2028-12-15');
    ok.app.run('__acks = [];');
    const saved = [formSave(ok.app, ok.ids.bill, { amount: '90' }), acks(ok.app)];
    const failed = openPage('2026-08-03', ['bill'], '2028-12-15');
    fail(failed.app, 'throw');
    const failedLook = [formSave(failed.app, failed.ids.bill, { amount: '90' }), acks(failed.app)];
    failed.app.run('__runTimers();');
    const later = [failed.app.run('__toasts = []; toast("later"); JSON.stringify(__toasts)')];
    const moved = away('2026-08-03', ['bill']);
    moved.app.run('__acks = [];');
    const movedLook = [formSave(moved.app, moved.ids.bill, { name: 'Rent NEW', amount: '500' }), acks(moved.app)];
    invariant('P2.fail.messages', 'A saved edit is acknowledged ("£90 scheduled ✓") and shows no warning; a failed one shows only the save-failed message and no acknowledgement; the next task shows messages again; a refused one (the boundary changed the row) shows only its refusal',
      [saved, failedLook, later, movedLook], [[[], ['subscription bill monthly', '£90 scheduled ✓']], [[SAVE_FAILED], []], ['["later"]'], [[MOVED], []]]);

    const mut = openPage('2026-08-03', ['bill'], '2028-12-15');
    mut.app.run(extractFunction(PROGRAM.src, 'geodeStoreFinancialState').text.replace('_geodeWriteFailedTask = true;', ''));
    fail(mut.app, 'throw');
    invariant('P2.fail.messages.mut', 'Mutation: when a failed write does not end the task\'s messages, the failed edit is still acknowledged after the save-failed message — the false "Saved to your plan." of R2. Ending them is what prevents it',
      [formSave(mut.app, mut.ids.bill, { amount: '90' }), acks(mut.app)], [[SAVE_FAILED], ['subscription bill monthly', '£90 scheduled ✓']]);

    const src = PROGRAM.src, text = n => extractFunction(src, n).text, line = (n, i) => text(n).split('\n')[i || 1].trim();
    const load = PROGRAM.structural.load, reloadShim = TEST_SHIMS.slice(TEST_SHIMS.indexOf('function __reload()'), TEST_SHIMS.indexOf('\n}\n', TEST_SHIMS.indexOf('function __reload()')));
    const probe = new App(baseState(), '2026-06-10');
    probe.run('S.income = 3900; __storageFault = "throw";');
    const shimFails = [probe.run('save()'), JSON.parse(probe.run('__store')).income, probe.run('S.income')];
    invariant('P2.fail.fidelity', 'toast, completion feedback and the subscription note start with the failed-task guard and the success toast goes through toast; the harness shims start with the same guard. load() marks its state committed just before its recurring sync and as its last statement, and so does the reload shim. Recurring sync returns its save result and the preparation refuses on failed. The harness save() fails under __storageFault as production does: failed, store and memory as committed',
      [line('toast'), line('geodeEmitPaymentCompletionFeedback'), line('geodeSubOnSave'), line('geodeSuccessToast'),
        ['function toast(m) { if (_geodeWriteFailedTask) return;', 'function geodeSuccessToast(m) { if (_geodeWriteFailedTask) return;', 'function geodeEmitPaymentCompletionFeedback(p) { if (_geodeWriteFailedTask) return;', 'function geodeSubOnSave(name) { if (_geodeWriteFailedTask) return;'].map(s => TEST_SHIMS.indexOf(s) >= 0),
        [load, reloadShim].map(t => t.indexOf('geodeNoteCommittedState();\n  syncRecurringPayments();') >= 0), load.trim().split('\n').slice(-2)[0].trim(), reloadShim.indexOf('geodeNoteCommittedState(); // load() ends here') >= 0,
        text('syncRecurringPayments').indexOf('if (changed) return save();') >= 0, text('geodePrepareFinancialMutation').indexOf("if (syncRecurringPayments() === 'failed' || _geodeRuntimeStale) return false;") >= 0, shimFails],
      ['if (_geodeWriteFailedTask) return;', 'if (_geodeWriteFailedTask) return;', 'if (_geodeWriteFailedTask || !geodeIsSubscription(name, rec)) return;', "toast(msg, 'ok', 2600);",
        [true, true, true, true], [true, true], 'geodeNoteCommittedState();', true, true, true, ['failed', 3000, 3000]]);
  });
}

/**
 * P2-7: closeModal's delayed removal removes only the modal it closed. A modal opened during the 165ms fade is a
 * different #modal and stays, with its commit guard and the stale-write gate exactly as before.
 */
function p2ModalClose() {
  const page = () => { const app = new App(baseState(), '2026-06-10', PROGRAM.commit); app.run('var __open = function (name) { openModal("<p>" + name + "</p>"); __modal.__name = name; };'); return app; };
  const look = app => JSON.parse(app.run('JSON.stringify(__modal ? { name: __modal.__name, closing: __modal.classList.contains("mo-bg--closing"), commit: __modal.getAttribute("data-geode-commit") } : null)'));
  const pending = app => Number(app.run('__timers.length'));
  /** A closes, B opens before A's timer, then A's timer fires. */
  const race = app => { app.run('__open("A"); __runTimers(); closeModal();'); const a = look(app); app.run('__open("B");'); const b = look(app); app.run('__runTimers();'); return [a, b, look(app)]; };
  const OPEN = name => ({ name, closing: false, commit: null });

  scenario('P2-7 MODAL CLOSE — the delayed removal removes only the modal it closed', () => {
    const plain = page();
    plain.run('__open("A"); __runTimers(); closeModal();');
    const closing = look(plain);
    plain.run('__runTimers();');
    invariant('P2.modal.close', 'Ordinary close: the modal fades (mo-bg--closing, still in the page) and its timer then removes it',
      [closing, pending(plain), look(plain)], [{ name: 'A', closing: true, commit: null }, 0, null]);

    invariant('P2.modal.race', 'A closes; B opens before A\'s 165ms timer (openModal removes A at once); A\'s timer fires and B stays, open and clear',
      race(page()), [{ name: 'A', closing: true, commit: null }, OPEN('B'), OPEN('B')]);

    const twice = page();
    twice.run('__open("A"); __runTimers(); closeModal(); closeModal();');
    const queued = pending(twice);
    twice.run('__runTimers(); closeModal();');
    invariant('P2.modal.repeat', 'Repeated close is harmless: a second close while fading schedules nothing; after removal, closing with no modal open does nothing',
      [queued, pending(twice), look(twice)], [1, 0, null]);

    const guard = page();
    guard.run('__open("A"); __runTimers(); closeModal(); __open("B");');
    const commits = [guard.run('geodeModalCommitBegin()'), guard.run('geodeModalCommitBegin()')];
    guard.run('__runTimers();');
    invariant('P2.modal.commit', 'Double-submit guard unchanged: B (opened during A\'s fade) takes its one commit, a second press is refused, and A\'s timer leaves B and its commit flag in place',
      [commits, look(guard)], [[true, false], { name: 'B', closing: false, commit: '1' }]);

    const stale = page();
    const fenced = JSON.parse(rawStore(stale));
    fenced._rev = { seq: (fenced._rev ? fenced._rev.seq : 0) + 1, id: 'rev_modal_other', by: 'v1.0.77', at: 3 };
    fenced.income = 4600;
    stale.run('__open("A"); __runTimers(); closeModal(); __open("B");');
    foreignStore(stale, JSON.stringify(fenced));
    const began = stale.run('geodeModalCommitBegin()');
    stale.run('__runTimers();');
    invariant('P2.modal.stale-gate', 'Stale-write gate unchanged: B opened during A\'s fade, after another tab wrote, refuses its commit; A\'s timer leaves B; the other tab\'s text stays',
      [began, look(stale), rawStore(stale) === JSON.stringify(fenced), staleState(stale), relWarnings(stale)],
      [false, OPEN('B'), true, ['foreign', 'foreign'], ['stale:foreign']]);

    const mutated = page();
    mutated.run('closeModal = function () { var m = document.getElementById("modal"); if (!m || m.classList.contains("mo-bg--closing")) return; m.classList.add("mo-bg--closing"); m.classList.remove("on"); setTimeout(removeModalDom, 165); };');
    invariant('P2.modal.mut', 'Mutation: with the old delayed removeModalDom (whatever #modal exists when the timer fires), A\'s timer removes B — the captured node is what keeps B',
      race(mutated)[2], null);
    invariant('P2.modal.source', 'closeModal removes the node it captured, never a fresh #modal lookup, and keeps the 165ms fade and the closing class',
      [/setTimeout\(function \(\) \{\s*try \{ m\.remove\(\); \} catch \(e2\) \{\}\s*\}, 165\);/.test(PROGRAM.src), PROGRAM.src.indexOf('setTimeout(removeModalDom') < 0,
        extractFunction(PROGRAM.src, 'closeModal').text.indexOf("m.classList.add('mo-bg--closing');") >= 0], [true, true, true]);
  });
}

// ───────────────────────────── P3-1B paid one-off occurrence ─────────────────────────────

const P31B_MONTHS = ['2026-10-15', '2026-11-15', '2026-12-15', '2027-01-15'];
const p31bRow = (id, extra) => Object.assign({ id, name: id, amount: 100, date: '', status: 'paid', rec: 'no', lastPaidYM: '', goalId: '', investId: '',
  debtId: '', payKind: 'bill', createdAt: 1 }, extra || {});
const p31bState = extra => Object.assign(baseState(), { _schemaVersion: 3, contributionEvents: [], contributionCarry: [], billPaymentEvents: [] }, extra || {});
const P31B_DEBT = () => ({ id: 'dA', name: 'Card', balance: 1000, baseBalance: 1000, apr: 20, minp: 50 });
/** [Monthly Left, confirmed-only Monthly Left] in October, November, December and January; the clock starts on 15 October. */
function p31bMonths(app, mode) {
  return P31B_MONTHS.map((d, i) => {
    if (i) app.advance(d, mode);
    const s = app.snap(d.slice(0, 7));
    return [s.left, s.leftConfirmed];
  });
}
const p31bRowState = (app, id) => { const p = app.state().payments.filter(x => x.id === id)[0]; return p ? [p.status, p.date === undefined ? 'missing' : p.date, p.lastPaidYM || ''] : null; };
/** Goal Saved, investment balances and debt balances recomputed on a copy — as stored, and with every lastPaidYM removed from one-off rows. */
const p31bAuthority = app => JSON.parse(app.run(`(function () {
  function look(strip) {
    var keep = S;
    try {
      S = JSON.parse(JSON.stringify(keep));
      if (strip) S.payments.forEach(function (p) { if (p.rec !== 'yes' && p.rec !== 'annual') p.lastPaidYM = ''; });
      geodeRecomputeBalancesFromPayments();
      return [S.goals.map(function (g) { return geodeGoalEffectiveSavedFromState(S, g); }), S.investments.map(function (i) { return toNum(i.balance); }),
        (S.debts || []).map(function (d) { return toNum(d.balance); })];
    } finally { S = keep; }
  }
  return JSON.stringify([look(false), look(true)]);
})()`));

function p31bOccurrence() {
  const F = (left, conf) => left.map((l, i) => [l, conf[i]]);
  const MATRIX = [
    ['A unpaid undated', { status: 'upcoming' }, F([2900, 2900, 2900, 2900], [3000, 3000, 3000, 3000])],
    ['B paid undated, no stamp', {}, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['C paid undated, stamped October', { lastPaidYM: '2026-10' }, F([2900, 3000, 3000, 3000], [2900, 3000, 3000, 3000])],
    ['D paid, valid date October', { date: '2026-10-05' }, F([2900, 3000, 3000, 3000], [2900, 3000, 3000, 3000])],
    ['E paid, valid date September', { date: '2026-09-05' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, date null', { date: null }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, no date key', { date: undefined }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, "garbage"', { date: 'garbage' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, full timestamp', { date: '2026-10-05T09:00:00Z' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, "2026/10/05"', { date: '2026/10/05' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, "05/10/2026"', { date: '05/10/2026' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, "2026-13-01"', { date: '2026-13-01' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F paid, "2026-10" (month only)', { date: '2026-10' }, F([3000, 3000, 3000, 3000], [3000, 3000, 3000, 3000])],
    ['F unpaid, full timestamp (unchanged rule)', { status: 'upcoming', date: '2026-10-05T09:00:00Z' }, F([2900, 2900, 2900, 2900], [3000, 3000, 3000, 3000])]
  ];
  const matrix = {};
  MODES.forEach(mode => scenario('P3-1B MATRIX — one £100 one-off row, Monthly Left and confirmed-only across Oct / Nov / Dec / Jan [' + mode + ']', () => {
    const seen = [], kept = [];
    MATRIX.forEach(([label, extra]) => {
      const row = p31bRow('r', extra);
      if (extra.date === undefined && 'date' in extra) delete row.date;
      const app = new App(p31bState({ payments: [row] }), P31B_MONTHS[0]);
      const before = p31bRowState(app, 'r');
      seen.push([label, p31bMonths(app, mode)]);
      kept.push([label, same(p31bRowState(app, 'r'), before)]);
    });
    invariant('P31B.matrix', 'Unpaid undated keeps today\'s rule; a paid one-off counts only in its known month (valid date or completion stamp); unknown or malformed counts in no month',
      seen, MATRIX.map(([label, , exp]) => [label, exp]));
    invariant('P31B.matrix.stored', 'No row is re-dated, re-stamped or changed by four months of loads and renders', kept, MATRIX.map(([label]) => [label, true]));
    matrix[mode] = seen;
  }));
  scenario('P3-1B MATRIX — same-session vs reload', () => invariant('P31B.matrix.parity', 'Session renders and reloads give the same figures', same(matrix.session, matrix.reload), true));

  const KINDS = [['bill', {}, null], ['goal', { goalId: 'gH', payKind: 'goal' }, 'goal'], ['investment', { investId: 'iA', payKind: 'invest' }, 'investment'],
    ['debt', { debtId: 'dA', payKind: 'debt' }, null]];
  MODES.forEach(mode => scenario('P3-1B TOGGLE — an undated unpaid one-off marked paid on 15 October, and the same tap undone [' + mode + ']', () => {
    const done = [], undone = [], authority = [];
    KINDS.forEach(([kind, extra, entity]) => {
      const st = () => p31bState({ debts: kind === 'debt' ? [P31B_DEBT()] : [], payments: [p31bRow('t', Object.assign({ status: 'upcoming' }, extra))] });
      const app = new App(st(), P31B_MONTHS[0]);
      app.toggle('t'); if (mode === 'reload') app.reload();
      const row = p31bRowState(app, 't');
      const events = app.state().contributionEvents.map(e => e.eventType + ' ' + e.occurrenceYm + ' ' + e.entityType);
      const ledgers = [app.state().billPaymentEvents.length, (app.state().debtPaymentEvents || []).length];
      const auth = p31bAuthority(app);
      authority.push([kind, same(auth[0], auth[1])]);
      done.push([kind, row, events, ledgers, p31bMonths(app, mode)]);
      const app2 = new App(st(), P31B_MONTHS[0]);
      app2.toggle('t'); app2.toggle('t'); if (mode === 'reload') app2.reload();
      undone.push([kind, p31bRowState(app2, 't'), app2.state().contributionEvents.map(e => e.eventType + ' ' + e.occurrenceYm), p31bMonths(app2, mode)]);
    });
    const OCT_ONLY = F([2900, 3000, 3000, 3000], [2900, 3000, 3000, 3000]);
    invariant('P31B.toggle', 'Marked paid: date stays blank, lastPaidYM = 2026-10 (the action month); a goal or investment row records its October completion, bills and debts record none; counted in October only',
      done, KINDS.map(([kind, , entity]) => [kind, ['paid', '', '2026-10'], entity ? ['completion 2026-10 ' + entity] : [], [0, 0], OCT_ONLY]));
    invariant('P31B.toggle.undo', 'Undone: upcoming, undated, stamp cleared (a reversal for the contribution); unpaid undated again counts every month as before',
      undone, KINDS.map(([kind, , entity]) => [kind, ['upcoming', '', ''], entity ? ['completion 2026-10', 'reversal 2026-10'] : [],
        F([2900, 2900, 2900, 2900], [3000, 3000, 3000, 3000])]));
    invariant('P31B.toggle.authority', 'The stamp moves no authority: goal Saved, investment and debt balances recompute identically with every one-off stamp removed',
      authority, KINDS.map(([kind]) => [kind, true]));

    const dated = new App(p31bState({ payments: [p31bRow('d', { status: 'upcoming', date: '2026-10-20' })] }), P31B_MONTHS[0]);
    dated.toggle('d'); if (mode === 'reload') dated.reload();
    const datedDone = p31bRowState(dated, 'd');
    dated.toggle('d');
    invariant('P31B.toggle.dated', 'A one-off with a valid date is not stamped: its date names the occurrence; undo leaves it as it was',
      [datedDone, p31bRowState(dated, 'd')], [['paid', '2026-10-20', ''], ['upcoming', '2026-10-20', '']]);
  }));

  MODES.forEach(mode => scenario('P3-1B LEGACY — carried, restored and legacy undated paid rows [' + mode + ']', () => {
    const g1 = new App(baseState({ payments: [p31bRow('g1', { goalId: 'gH', payKind: 'goal' })] }), P31B_MONTHS[0]);
    const carryBefore = g1.state().contributionCarry.map(c => [c.kind, c.amount, c.paymentId]);
    const g1Saved = [];
    const g1Left = P31B_MONTHS.map((d, i) => { if (i) g1.advance(d, mode); g1Saved.push(g1.snap().goal.gH); return g1.snap().left; });
    invariant('P31B.legacy.carry', 'Schema-1 goal row, paid and undated: the transition\'s undated carry stays the goal\'s (Holiday £1,100 every month, as before P3-1B), it is never dated, and no month\'s Monthly Left subtracts it',
      [carryBefore, g1.state().contributionCarry.map(c => [c.kind, c.amount, c.paymentId]), g1.state().contributionEvents.length, g1Saved, g1Left],
      [[['undated_contribution', 100, 'g1']], [['undated_contribution', 100, 'g1']], 0, [1100, 1100, 1100, 1100], [3000, 3000, 3000, 3000]]);

    const h = new App(p31bState({ payments: [p31bRow('h', { goalId: 'gH', payKind: 'goal' })] }), P31B_MONTHS[0]);
    const hSaved = [];
    const hLeft = P31B_MONTHS.map((d, i) => { if (i) h.advance(d, mode); hSaved.push(h.snap().goal.gH); return h.snap().left; });
    invariant('P31B.legacy.restored', 'Restored schema-3 goal row, paid and undated, with no completion or carry: Holiday stays £1,000 (as before P3-1B), the integrity report still flags it, and no month subtracts it',
      [hSaved, hLeft, flagged(h)], [[1000, 1000, 1000, 1000], [3000, 3000, 3000, 3000], true]);

    const others = [['investment', { investId: 'iA', payKind: 'invest' }], ['bill', {}]].map(([kind, extra]) => {
      const app = new App(baseState({ payments: [p31bRow('o', extra)] }), P31B_MONTHS[0]);
      return [kind, P31B_MONTHS.map((d, i) => { if (i) app.advance(d, mode); return app.snap().left; })];
    });
    invariant('P31B.legacy.others', 'Schema-1 investment and bill rows, paid and undated: no month subtracts them', others,
      [['investment', [3000, 3000, 3000, 3000]], ['bill', [3000, 3000, 3000, 3000]]]);
  }));

  scenario('P3-1B READ MODELS — dashboard, posture, affordability and the display / confirmed rules apply the same occurrence rule', () => {
    const rm = buildEntryProgram(PROGRAM.src, readSource(FOUNDATION_JS), PROGRAM.extracted, '', [], ['geodeDashboardSnapshot', 'geodeFinancialPosture',
      'geodeAffordabilitySnapshot', 'paymentCountsForMonthlyOutflowDisplay'], 'p31b-read-models');
    const LOOK = `JSON.stringify((function () {
      var o = { monthKey: '2026-10', today: '2026-10-15' }, d = geodeDashboardSnapshot(S, o), f = geodeFinancialPosture(S, o), a = geodeAffordabilitySnapshot(S, o);
      return [calcMonthlyLeftover(S), d.leftThisMonth, f.sourceSignals.unresolvedDebtMinimums, a.paymentOutflow, a.confirmedPaymentOutflow,
        calcMonthlyLeftoverConfirmedOnly(S), paymentCountsForMonthlyOutflowDisplay(S.payments[0])];
    })())`;
    const ROWS = [
      ['paid undated, no stamp', {}, [3000, 3000, 100, 0, 0, 3000, false]],
      ['paid undated, stamped October', { lastPaidYM: '2026-10' }, [2900, 2900, 0, 100, 100, 2900, true]],
      ['paid undated, stamped September', { lastPaidYM: '2026-09' }, [3000, 3000, 100, 0, 0, 3000, false]],
      ['paid, timestamp date', { date: '2026-10-05T09:00:00Z' }, [3000, 3000, 100, 0, 0, 3000, false]],
      ['paid, valid date October', { date: '2026-10-05' }, [2900, 2900, 0, 100, 100, 2900, true]],
      ['unpaid undated', { status: 'upcoming' }, [2900, 2900, 0, 100, 0, 3000, true]]
    ];
    const seen = ROWS.map(([label, extra]) => {
      const app = new App(p31bState({ debts: [{ id: 'dA', name: 'Card', balance: 1000, minp: 100 }],
        payments: [p31bRow('r', Object.assign({ debtId: 'dA', payKind: 'debt' }, extra))] }), P31B_MONTHS[0], rm, { boot: false });
      return [label, JSON.parse(app.run(LOOK))];
    });
    invariant('P31B.readers', '[Monthly Left, dashboard left, posture unresolved debt minimum, affordability outflow, affordability confirmed outflow, confirmed-only Monthly Left, display rule] agree for each row',
      seen, ROWS.map(([label, , exp]) => [label, exp]));
    const lines = PROGRAM.src.split('\n');
    const noDate = lines.map((l, i) => [l, i]).filter(([l]) => l.trim() === 'if (!p.date) return true;');
    const prev = i => { let j = i - 1; while (j >= 0 && !lines[j].trim()) j--; return lines[j] || ''; };
    invariant('P31B.readers.source', 'Every one-off "no date counts" rule in index.html is preceded by the paid one-off occurrence rule (seven copies, one helper)',
      [noDate.length, noDate.filter(([, i]) => prev(i).indexOf('geodePaymentOneOffOccurrenceYm(p) ===') >= 0).length], [7, 7]);
  });
}

// ───────────────────────────── P3-4B.1 plan mutation isolation ─────────────────────────────

/**
 * P3-4B.1: one payment save changes only the row it saves (or, for a linked Plan save, the one same-month group that
 * row's upsert targets); legacy duplicate groups elsewhere stay byte-for-byte as stored. A UI preview that cannot
 * deep-copy the state shows nothing rather than computing on rows shared with S.
 */
function p34b1Isolation() {
  const row = (id, kind, amount, date, status, rec, createdAt) => ({ id, name: (kind === 'g' ? 'Holiday ' : 'ISA ') + id, amount, date, status, rec,
    lastPaidYM: '', goalId: kind === 'g' ? 'gH' : '', investId: kind === 'i' ? 'iA' : '', debtId: '', payKind: kind === 'g' ? 'goal' : 'invest', createdAt });
  /** Legacy same-month duplicate groups: current (different amounts; mixed statuses), future, historical, and a paid row beside the current investment group. */
  const GROUPS = {
    current: ['gC1', 'gC2', 'iC1', 'iC2'], future: ['gF1', 'gF2'], historical: ['iH1', 'iH2'], paid: ['iP']
  };
  const ALL = [].concat(GROUPS.current, GROUPS.future, GROUPS.historical, GROUPS.paid);
  const fixture = () => baseState({ payments: [
    row('gC1', 'g', 100, '2026-06-20', 'upcoming', 'yes', 1), row('gC2', 'g', 120, '2026-06-25', 'upcoming', 'yes', 2),
    row('iC1', 'i', 40, '2026-06-01', 'overdue', 'no', 3), row('iC2', 'i', 60, '2026-06-28', 'upcoming', 'no', 4),
    row('gF1', 'g', 75, '2026-08-10', 'upcoming', 'no', 5), row('gF2', 'g', 75, '2026-08-12', 'upcoming', 'no', 6),
    row('iH1', 'i', 30, '2026-04-10', 'overdue', 'no', 7), row('iH2', 'i', 45, '2026-04-15', 'overdue', 'no', 8),
    row('iP', 'i', 200, '2026-06-02', 'paid', 'no', 9)
  ] });
  const stored = app => { const o = {}; app.state().payments.forEach(p => { o[p.id] = JSON.stringify(p); }); return o; };
  /** Of these ids, the ones whose stored row is not byte-for-byte what it was (removed rows included). */
  const touched = (before, after, ids) => ids.filter(id => before[id] !== after[id]);
  /** Contribution, carry and settlement ledgers (a save logs its own activity line, so the activity log is not compared here). */
  const evidence = app => { const s = app.state(); return JSON.stringify([s.contributionEvents || [], s.contributionCarry || [], s.billPaymentEvents || [], s.debtPaymentEvents || [], s.expectationGaps || []]); };
  const position = app => { const s = app.snap(); return [s.goal.gH, s.inv.iA]; };
  /** Production savePay on a new-row form opened with this intent. */
  const saveNew = (app, form, intent) => { p1Open(app, p1PayForm(form), intent); app.run('savePay(""); __runTimers();'); };
  /** Production savePay on the edit form openPayModal fills for a row, these fields changed. */
  const saveEdit = (app, id, changes) => {
    p1Open(app, p1PayForm(Object.assign(app.modalForm(id), changes)), 'replace');
    app.run('savePay(' + JSON.stringify(id) + '); __runTimers();');
  };
  /** Replaces a production function in this app with its source edited (a mutant: the fix reverted). */
  const patch = (app, fn, from, to) => app.run(`(function () {
    var src = ${fn}.toString(), out = src.split(${JSON.stringify(from)}).join(${JSON.stringify(to)});
    if (out === src) throw new Error('mutation did not apply');
    ${fn} = (0, eval)('(' + out + ')');
  })()`);
  const UNSCOPED_SAVE = ['if (!geodeModalCommitBegin()) return;', 'if (!geodeModalCommitBegin()) return; geodeMergeDuplicateLinkedContributionsSameMonth();'];
  const UNSCOPED_UPSERT = ["geodeMergeDuplicateLinkedContributionsSameMonth(geodeDuplicateLinkedContributionKey({ status: 'upcoming', goalId: gid, investId: invid, rec: rec, date: dt }))",
    'geodeMergeDuplicateLinkedContributionsSameMonth()'];
  /** One action on the fixture: [unrelated rows it touched, Monthly Left change, goal/investment positions, evidence unchanged]. */
  const act = (action, unrelated, mutant) => {
    const app = new App(fixture(), '2026-06-05', PROGRAM.commit);
    if (mutant) patch(app, mutant[0], mutant[1], mutant[2]);
    const before = stored(app), left0 = app.snap().left, pos0 = position(app), ev0 = evidence(app);
    action(app);
    return { app, before, touched: touched(before, stored(app), unrelated), left: app.snap().left - left0, positions: [pos0, position(app)], evidence: evidence(app) === ev0 };
  };

  scenario('P3-4B.1 ORDINARY SAVE — saving one payment leaves every unrelated duplicate group byte-for-byte as stored', () => {
    const water = app => saveNew(app, { name: 'Water', amount: 30, date: '2026-06-15', status: 'upcoming' }, 'new');
    const a = act(water, ALL);
    invariant('P34B1.A.current', 'Bill save: the current-month duplicate groups (Holiday £100 + £120 monthly; ISA £40 overdue + £60 upcoming one-off) are untouched',
      touched(a.before, stored(a.app), GROUPS.current), []);
    invariant('P34B1.B.future', 'Bill save: the August Holiday duplicates are untouched', touched(a.before, stored(a.app), GROUPS.future), []);
    invariant('P34B1.C.historical', 'Bill save: the April ISA overdue duplicates are untouched', touched(a.before, stored(a.app), GROUPS.historical), []);
    invariant('P34B1.A.left', 'Bill save: Monthly Left moves by the £30 bill only; Holiday, ISA and the evidence ledgers are unchanged',
      [a.left, a.positions[1], a.evidence], [-30, a.positions[0], true]);
    invariant('P34B1.A.disabled', 'With the global merge restored in savePay, the same bill save rewrites every duplicate group — the isolation is what keeps them',
      act(water, ALL, ['savePay'].concat(UNSCOPED_SAVE)).touched, GROUPS.current.concat(GROUPS.future, GROUPS.historical));

    const goal = app => saveNew(app, { name: 'Holiday extra', amount: 50, date: '2026-06-15', status: 'upcoming', rec: 'no', goalId: 'gH' }, 'set');
    const d = act(goal, ALL);
    invariant('P34B1.D.goal', 'Goal Plan save (Holiday, June, one-off): the ISA groups and the Holiday monthly and August groups are untouched; Monthly Left −£50 only; positions and evidence unchanged',
      [d.touched, d.left, d.positions[1], d.evidence], [[], -50, d.positions[0], true]);
    invariant('P34B1.D.disabled', 'With the upsert merge unscoped again, the same goal save rewrites the unrelated groups',
      act(goal, ALL, ['geodeSavePayApply'].concat(UNSCOPED_UPSERT)).touched, GROUPS.current.concat(GROUPS.future, GROUPS.historical));

    const isa = app => saveNew(app, { name: 'ISA monthly', amount: 80, date: '2026-06-15', status: 'upcoming', rec: 'yes', investId: 'iA' }, 'set');
    const e = act(isa, ALL);
    invariant('P34B1.E.investment', 'Investment Plan save (ISA, June, monthly): the Holiday groups and the ISA one-off and April groups are untouched; Monthly Left −£80 only; positions and evidence unchanged',
      [e.touched, e.left, e.positions[1], e.evidence], [[], -80, e.positions[0], true]);
  });

  scenario('P3-4B.1 SAME GROUP — a save inside a duplicate group changes that row, or that one group for a linked Plan save', () => {
    const f1 = act(app => saveEdit(app, 'gC1', { amount: 110 }), ALL);
    invariant('P34B1.F.edit', 'Editing Holiday £100 → £110: only that row changes (its £120 duplicate stays a separate row); Monthly Left −£10; positions and evidence unchanged',
      [f1.touched, JSON.parse(stored(f1.app).gC1).amount, f1.left, f1.positions[1], f1.evidence], [['gC1'], 110, -10, f1.positions[0], true]);

    const f2 = act(app => saveNew(app, { name: 'Holiday monthly', amount: 30, date: '2026-06-20', status: 'upcoming', rec: 'yes', goalId: 'gH' }, 'add'), ALL);
    const gC1 = JSON.parse(stored(f2.app).gC1);
    invariant('P34B1.H.group', 'Plan "add" £30 to the Holiday June monthly (F.3, no duplicates): its own £100 + £120 group becomes one row (oldest id kept) of £250; no other row changes; Monthly Left −£30; Holiday and evidence unchanged',
      [f2.touched, [gC1.amount, gC1.status, gC1.date], f2.left, f2.positions[1], f2.evidence], [['gC1', 'gC2'], [250, 'upcoming', '2026-06-20'], -30, f2.positions[0], true]);

    const g = act(app => saveNew(app, { name: 'ISA extra', amount: 10, date: '2026-06-20', status: 'upcoming', rec: 'no', investId: 'iA' }, 'add'), ALL);
    const iC1 = JSON.parse(stored(g.app).iC1);
    invariant('P34B1.G.mixed', 'Plan "add" £10 to the ISA June one-offs: the unpaid £40 overdue + £60 upcoming become one £110 overdue row; the paid £200 beside them, its evidence and the ISA position are untouched',
      [g.touched, [iC1.amount, iC1.status, iC1.date], g.left, g.positions[1], g.evidence], [['iC1', 'iC2'], [110, 'overdue', '2026-06-01'], -10, g.positions[0], true]);
  });

  scenario('P3-4B.1 SMART IMPORT AND LEGACY — import never merges by itself; legacy duplicates stay until the user resolves them', () => {
    const i1 = act(app => app.smartImport([{ name: 'Holiday top-up', amount: 25, date: '2026-06-20', link: 'goal:gH' }]), ALL);
    invariant('P34B1.I.add', 'A goal-linked import added as new beside the Holiday duplicates: one new row, every stored row untouched',
      [i1.touched, i1.app.state().payments.length], [[], ALL.length + 1]);
    const i2 = act(app => app.smartImport([{ name: 'Holiday', amount: 100, date: '2026-06-20', link: 'goal:gH', mergeId: 'gC2' }]), ALL);
    invariant('P34B1.I.merge', 'An import the user merges into Holiday £120: only that chosen row changes; no row is added or removed',
      [i2.touched, i2.app.state().payments.length], [['gC2'], ALL.length]);

    const j = act(app => { saveNew(app, { name: 'Water', amount: 30, date: '2026-06-15', status: 'upcoming' }, 'new'); app.render(); app.reload(); app.render(); }, ALL);
    invariant('P34B1.J.legacy', 'After a save, a render and a reload, every legacy duplicate group is still stored exactly as before',
      j.touched, []);
  });

  /** Payments render and the three UI previews, in one program with a page holding the impact host and the payments list. */
  const UI_SHIMS = String.raw`
var __host = { innerHTML: 'stale' }, __plist = null, __gebiBase = document.getElementById;
document.getElementById = function (id) {
  if (id === 'geode-pay-impact-host' || id === 'geode-exp-impact-host') return __host;
  if (id === 'plist') return __plist;
  return __gebiBase(id);
};
document.createElement = function () { var e = new __Element(); e.style = {}; e.innerHTML = ''; e.children = []; e.appendChild = function (c) { this.children.push(c); }; return e; };
`;
  const ui = buildEntryProgram(PROGRAM.src, readSource(FOUNDATION_JS), PROGRAM.extracted, UI_SHIMS, [],
    ['rPayments', 'geodeExpModalImpactRefresh', 'geodeQuickSetupLiveLeft', 'geodePayModalImpactRefresh'], 'p34b1-ui');
  const uiApp = () => {
    const app = new App(fixture(), '2026-06-05', ui);
    watchWrites(app);
    app.run('var __saveCalls = 0; save = (function (inner) { return function () { __saveCalls++; return inner(); }; })(save);' +
      ' __impact = null; geodeRenderModalImpactBlock = function (line1, sentence) { __impact = [line1, sentence]; return "rendered"; };');
    return app;
  };
  /** Makes JSON.stringify(S) throw (as a cyclic or unserialisable state would) until healed; S's rows are untouched. */
  const FAULT = "Object.defineProperty(S, '__cloneFault', { enumerable: true, configurable: true, get: function () { throw new Error('clone fault'); } });";
  const HEAL = 'delete S.__cloneFault;';
  const PAY = { 'geode-pay-impact-host': '', pn: 'Water', pa: '30', pd: '2026-06-15', ps: 'upcoming', prec: 'no', pglid: '', geode_pay_edit_id: '' };
  const PAY_EDIT = Object.assign({}, PAY, { pn: 'Holiday gC1', pa: '500', pd: '2026-06-20', prec: 'yes', pglid: 'gH', geode_pay_edit_id: 'gC1' });
  const EXP = { 'geode-exp-impact-host': '', en: 'Taxi', ea: '50', ed: '2026-06-10', ecat: 'transport', er: 'no', geode_exp_edit_id: '' };
  const QS = { quickSetupData: { income: '3000', expenses: { housing: '500' }, debt: {}, goal: {} } };
  /** A preview run: [what it returned or threw, the impact it rendered, the host's content, saves, stored writes]; then S compared with before. */
  const preview = (app, code, fields, fault) => {
    const before = app.run('JSON.stringify(S)'), left0 = app.snap().left;
    app.run('__fields = ' + JSON.stringify(fields || {}) + '; __impact = null; __host.innerHTML = "stale"; __saveCalls = 0; window._geodeQS = ' + JSON.stringify(QS) + ';');
    if (fault) app.run(FAULT);
    let out;
    try { out = app.run(code); } catch (err) { out = 'threw: ' + err.message; }
    if (fault) app.run(HEAL);
    return { out: out === undefined ? null : out, impact: JSON.parse(app.run('JSON.stringify(__impact)')), host: app.run('__host.innerHTML'),
      saves: app.run('__saveCalls'), writes: writes(app), same: app.run('JSON.stringify(S)') === before, left: app.snap().left === left0 };
  };

  scenario('P3-4B.1 PREVIEW ISOLATION — previews compute on a deep copy, or show nothing when the state cannot be copied', () => {
    const app = uiApp();
    const left = app.snap().left;
    const fmt = v => '£' + Math.round(v);
    const pay = preview(app, 'geodePayModalImpactRefresh()', PAY), exp = preview(app, 'geodeExpModalImpactRefresh()', EXP), qs = preview(app, 'geodeQuickSetupLiveLeft()', {});
    invariant('P34B1.K.normal', 'Copy succeeds: the payment preview shows Monthly Left −£30, the expense preview −£50, Quick Setup the live total; S, Monthly Left, saves and writes untouched',
      [[pay.impact, pay.same, pay.left, pay.saves, pay.writes], [exp.impact, exp.same, exp.left, exp.saves, exp.writes], [qs.out, qs.same, qs.saves, qs.writes]],
      [[['Left this month: ' + fmt(left) + ' → ' + fmt(left - 30), 'This lowers left this month on your plan.'], true, true, 0, 0],
        [['Left this month: ' + fmt(left) + ' → ' + fmt(left - 50), 'This lowers left this month on your plan.'], true, true, 0, 0],
        [fmt(left - 500), true, 0, 0]]);

    app.run(FAULT);
    const copy = app.run('geodeCloneStateForUiCalc(S) === null');
    app.run(HEAL);
    invariant('P34B1.L.copy', 'When the state cannot be deep-copied the UI copy is null — never a shallow copy holding S\'s row objects', copy, true);
    const shallow = uiApp();
    patch(shallow, 'geodeCloneStateForUiCalc', 'return null;', 'return { payments: (state.payments || []).slice(), expenses: (state.expenses || []).slice() };');
    shallow.run(FAULT);
    const shared = shallow.run('(function () { var t = geodeCloneStateForUiCalc(S); return !!t && t.payments[0] === S.payments[0]; })()');
    shallow.run(HEAL);
    invariant('P34B1.L.disabled', 'With a shallow fallback restored, the copy shares S\'s payment row objects — what the null result rules out', shared, true);

    const SUPPRESSED = { impact: null, host: '', saves: 0, writes: 0, same: true, left: true };
    const pick = r => ({ impact: r.impact, host: r.host, saves: r.saves, writes: r.writes, same: r.same, left: r.left });
    invariant('P34B1.M.payment', 'Copy fails on a payment preview (new row, and an edit of Holiday £100 → £500): no preview, the stale one cleared, nothing thrown; S byte-for-byte, Monthly Left, saves and writes untouched',
      [pick(preview(app, 'geodePayModalImpactRefresh()', PAY, true)), pick(preview(app, 'geodePayModalImpactRefresh()', PAY_EDIT, true))], [SUPPRESSED, SUPPRESSED]);
    invariant('P34B1.N.expense', 'Copy fails on an expense preview: no preview, the stale one cleared; S, Monthly Left, saves and writes untouched',
      pick(preview(app, 'geodeExpModalImpactRefresh()', EXP, true)), SUPPRESSED);
    const qsFail = preview(app, 'geodeQuickSetupLiveLeft()', {}, true);
    invariant('P34B1.L.quick-setup', 'Copy fails on the Quick Setup live total: it shows nothing (\'\'); S, saves and writes untouched',
      [qsFail.out, qsFail.same, qsFail.saves, qsFail.writes], ['', true, 0, 0]);
    invariant('P34B1.K.after', 'Once the state can be copied again, the payment preview works as before',
      preview(app, 'geodePayModalImpactRefresh()', PAY).impact, pay.impact);
  });

  scenario('P3-4B.1 PAYMENTS RENDER — rendering Payments repeatedly is read-only and shows every legacy duplicate', () => {
    const app = uiApp();
    const before = app.run('JSON.stringify(S)');
    const seen = [1, 2, 3].map(() => {
      app.run('__saveCalls = 0; __plist = document.createElement("div"); rPayments(document.createElement("div"));');
      const ids = JSON.parse(app.run('JSON.stringify(__plist.children.map(function (c) { var m = c.innerHTML.match(/openPayModal\\(\'([^\']+)\'\\)/); return m ? m[1] : ""; }))'));
      return [ids.slice().sort(), app.run('JSON.stringify(S)') === before, app.run('__saveCalls'), writes(app)];
    });
    const once = [ALL.slice().sort(), true, 0, 0];
    invariant('P34B1.O.render', 'Three Payments renders: each lists all nine rows (both rows of every duplicate group); S byte-for-byte, no save, no stored write',
      seen, [once, once, once]);
  });
}

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
  fa7cLifecycle(); fa7cAnnual(); fa7cSmartImport();
  fa7dLinkedGoals();
  p1Close();
  releaseSafetyFidelity(); releaseSafetyBoot(); releaseSafetyWrites(); releaseSafetyListener(); releaseSafetyGate(); releaseSafetyTabs();
  p1RelFixtures(); p1RelPending(); p1RelIdempotence(); p2BoundaryHold(); p2DebtIdentity(); p2BillSettlement(); p2RevisionFence(); p2RevisionIdentity(); p1RelOldWriter(); p2Expectations();
  p2Continuity();
  p2ModalClose();
  migrationFixtures();
  p31bOccurrence();
  p34b1Isolation();

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

if (require.main === module) main();

/** The simulated app and its production extraction, for suites that build on this harness (tests/month-baseline.js). */
module.exports = {
  init() { PROGRAM = PROGRAM || buildProgram(); return PROGRAM; },
  App, HarnessError, TEST_SHIMS, PRODUCTION_FUNCTIONS, BASE_CONSTANTS, INDEX_HTML, FOUNDATION_JS,
  readSource, extractFunction, extractConstant, calledNames
};
