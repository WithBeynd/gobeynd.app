#!/usr/bin/env node
/**
 * P3-6D evidence-based coaching integrity: what the user scheduled, said or planned is not what happened.
 *
 * Runs the production payment form save (geodeSavePayApply), mark complete (togglePay), Smart Import, the feeling chips,
 * the activity / completion readers (geodeActivityPaymentCompleted, geodeLatestActionKind, e5PaymentsLinkedSince), Home
 * coaching (geodeChooseHomePrimary, geodeHomeNudgeMessage, the plan-pressure card), the human-moment consistency flags,
 * the financial memory profile and modifiers and the plan chain from index.html inside the cross-month harness's
 * simulated app (tests/month-baseline.js pageOver: production load, save and store).
 *
 * Checks: scheduled versus completed goal and investment contributions (A–D), feeling taps versus behaviour (E/F), month
 * context strategy (G), plan pressure without cash claims (H/I), balance and receipt isolation (J/K), financial
 * invariance (L), coaching.json parity (M) and em dashes (N), and a mutant per rule.
 *
 * Run: node tests/coaching-evidence-integrity.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = cm.readSource(cm.INDEX_HTML);
const COACHING = JSON.parse(fs.readFileSync(path.join(ROOT, 'coaching.json'), 'utf8'));
const BEFORE_REF = 'd068755';
const J = v => JSON.stringify(v);
const EM_DASH = /\u2014/;

// ───────────────────────────── results ─────────────────────────────

let results = [];
let section = '';
const canon = v => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object'
  ? '{' + Object.keys(v).sort().map(k => J(k) + ':' + canon(v[k])).join(',') + '}' : v === undefined ? 'undefined' : J(v));
function check(id, text, actual, expected) {
  const ok = canon(actual) === canon(expected);
  results.push({ section, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
}
function group(name, fn) {
  section = name;
  try { fn(); } catch (e) { results.push({ section, id: 'error', text: 'section threw', ok: false, detail: String(e && e.stack || e) }); }
}

// ───────────────────────────── fixtures ─────────────────────────────

const OCT = '2026-10';
const TODAY = '2026-10-12';
const at = mb.at;
/** October 2026, nothing past its date: planned income £3,000; Rent £1,000 (25th); Food £400; Holiday goal; an ISA at £0. Monthly Left £1,600. */
const BASE = over => Object.assign({
  _schemaVersion: 3, income: 3000, incomeExplicitlySet: true, incomeType: 'stable', expectationGaps: [], expectationFloorYm: OCT,
  cur: { code: 'GBP', sym: '£' }, planStrategy: 'balanced',
  payments: [{ id: 'rent', name: 'Rent', amount: 1000, rec: 'yes', status: 'upcoming', date: OCT + '-25' }],
  expenses: [{ id: 'food', name: 'Food', amount: 400, rec: 'yes', cat: 'food', date: OCT + '-01' }],
  goals: [{ id: 'gH', name: 'Holiday', amount: 2000, saved: 500, baseSaved: 500, monthly: 0, cat: 'other', targetDate: '2027-06-30' }],
  investments: [{ id: 'iS', name: 'ISA', balance: 0, baseBalance: 0, valuations: [] }],
  debts: [], savingsReleases: [], debtPaymentEvents: [], contributionEvents: [], activityLog: [], lastSuggestedActions: [], behaviourEvents: []
}, over || {});
/** tests/reality-decoupling.js WIDE: Monthly Left £1,390, a 22% card and the balanced style, so debt, buffer, goal and investment steps exist. */
const WIDE = over => Object.assign(mb.PLAN(OCT), {
  planStrategy: 'balanced', cur: { code: 'GBP', sym: '£' }, behaviourEvents: [],
  debts: [{ id: 'd1', name: 'Card', balance: 2000, apr: 22, minp: 50 }],
  goals: [Object.assign({ targetDate: '2027-01-31' }, { id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' })]
}, over || {});
/** The same plan with a regular £1,890 bill: Monthly Left −£500. */
const MLNEG = over => { const s = WIDE(over); s.expenses = s.expenses.concat([{ id: 'bills', name: 'Bills', amount: 1890, rec: 'yes', cat: 'bills', date: OCT + '-02' }]); return s; };
const FEEL = (kind, n) => Array.from({ length: n }, (_, i) => ({ kind, ym: OCT, ts: new Date(at(TODAY, 8 + i)).toISOString(), meta: {} }));
const RECEIPT = (id, amount) => ({ id, eventType: 'receipt', amount, ym: OCT, recordedAt: at('2026-10-10', 9), source: 'manual' });
const RC = amount => ({ realityCheck: { amount, ym: OCT, date: at(TODAY, 9) } });

// ───────────────────────────── program ─────────────────────────────

const PRELUDE = [
  'var __html = null;',
  'function openModal(h) { __html = String(h); }',
  'function removeModalDom() { __html = null; }',
  'function closeModal() { __html = null; }',
  'function mh(t) { return "<div class=\\"mh\\">" + t + "</div>"; }'
].join('\n');
/** A top-level production `var` declaration: one line, or an object / array literal closed at column 0. */
function extractGlobal(n) {
  const start = SRC.indexOf('\nvar ' + n + ' = ') + 1;
  const eol = SRC.indexOf('\n', start);
  const first = SRC.slice(start, eol);
  if (/[{[]\s*$/.test(first)) return SRC.slice(start, SRC.indexOf('\n' + (/\{\s*$/.test(first) ? '}' : ']') + ';', start) + 3);
  return first;
}
const DECLARED = new Set((SRC.match(/\nvar [A-Za-z_$][\w$]* = /g) || []).map(s => s.slice(5, -3)));
const ENTRIES = [
  'geodeActivityPaymentCompleted', 'geodeLatestActionKind', 'geodeGetLatestActivity', 'e5PaymentsLinkedSince', 'e5PaymentsLinkedPlannedSince',
  'hasRecentInvestmentFlowActivity', 'hasRecentInvestmentPlannedActivity', 'geodeInvestmentContributionState', 'geodeChooseHomePrimary',
  'geodeHomeNudgeMessage', 'geodeSyntheticCashPressure', 'geodeHomePressureLevel', 'geodeFinancialMemoryProfile', 'geodeFinancialMemoryPlanModifiers',
  'geodeHumanMomentConsistencyFlags', 'getPriorityRebalanceContext', 'getCoreNudges', 'getMonthPlan', 'computeAffordabilityContext',
  'geodeGetContextPosture', 'geodeSetRealityFeelingFromChip', 'geodeRealitySelfReportToast', 'geodeRealityPageHtml', 'geodeHomeAnticipatoryLine',
  'calcMonthlyLeftover', 'geodeCopy', 'geodeIncomeReceiptLedger'
];

const MEASURE = `
function __measure() {
  var a = computeAffordabilityContext(S);
  var plan = getMonthPlan();
  var post = geodeGetContextPosture(S);
  var mods = geodeFinancialMemoryPlanModifiers(S, a, null);
  return JSON.stringify({
    ml: calcMonthlyLeftover(S), planRoom: a.planRoom, floor: a.breathingRoomFloor, room: a.suggestableRoom,
    multiplier: a.realityAdjustment ? a.realityAdjustment.postureMultiplier : null, codes: a.reasonCodes,
    steps: plan.steps.map(function (s) { return [s.label, s.amount, s.priority]; }),
    posture: post.posture, tone: post.tone,
    mods: [mods.debtExtraMultiplier, mods.goalRecoveryMultiplier, mods.investmentMultiplier, mods.bufferPreference, mods.reasonCodes]
  });
}
function __coaching() {
  var latest = geodeGetLatestActivity(S);
  var kind = geodeLatestActionKind(latest);
  var primary = geodeChooseHomePrimary([], latest, kind, 'ok');
  return JSON.stringify({
    completed: latest ? geodeActivityPaymentCompleted(latest) : null,
    flag: latest ? (latest.completed === undefined ? 'none' : latest.completed) : null,
    kind: kind,
    primary: primary ? primary.topic + ': ' + primary.message : null,
    goalLine: geodeHomeNudgeMessage({ topic: 'priority_goal', message: 'Holiday is your focus.' }, kind, 'ok', { skipWit: true }),
    investLine: geodeHomeNudgeMessage({ topic: 'invest_gap', message: 'Investing is next.' }, kind, 'ok', { skipWit: true }),
    e5Goal: e5PaymentsLinkedSince(S, 'goalId', 14), e5Invest: e5PaymentsLinkedSince(S, 'investId', 14),
    investFlow: hasRecentInvestmentFlowActivity(S, 14), investState: geodeInvestmentContributionState(S),
    signals: geodeFinancialMemoryProfile(S).evidence.contributionSignals,
    flags: geodeHumanMomentConsistencyFlags(S)
  });
}
`;

let PROGRAM = null;
function program() {
  if (PROGRAM) return PROGRAM;
  const probe = mb.pageOver(J(BASE()), TODAY);
  probe.run(PRELUDE);
  const have = new Map(), missing = new Set(), entry = new Set(ENTRIES), queue = ENTRIES.slice();
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || missing.has(n)) continue;
    if (!entry.has(n) && probe.run('typeof ' + n) !== 'undefined') continue;
    let f;
    try { f = cm.extractFunction(SRC, n); } catch (e) { missing.add(n); continue; }
    have.set(n, f.text);
    cm.calledNames(f.text).forEach(c => queue.push(c));
  }
  const code = [...have.values()].join('\n');
  const globals = [...DECLARED].filter(n => new RegExp('(^|[^\\w$.])' + n.replace(/\$/g, '\\$') + '(?![\\w$])').test(code) && probe.run('typeof ' + n) === 'undefined').map(extractGlobal);
  PROGRAM = { script: new vm.Script(PRELUDE + '\n' + globals.join('\n') + '\n' + code + '\n' + MEASURE, { filename: 'coaching-evidence-program' }), names: [...have.keys()] };
  return PROGRAM;
}

const fnText = n => cm.extractFunction(SRC, n).text;
/** The active mutant: [function, [[from, to], …]] pairs applied to every page (each anchor must occur exactly once). */
let MUT = null;
function mutantText(n, pairs) {
  let t = fnText(n);
  pairs.forEach(([from, to]) => {
    if (t.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in ' + n + ': ' + from);
    t = t.replace(from, () => to);
  });
  return t;
}
function page(state, feeling) {
  const p = mb.pageOver(J(state), TODAY);
  program().script.runInContext(p.ctx);
  if (MUT) MUT.forEach(([n, pairs]) => p.run(mutantText(n, pairs)));
  if (feeling) p.run('sessionStorage.setItem("geode_reality_feeling", ' + J(feeling) + ');');
  return p;
}
/** The simulated clock stands still; a later action happens a minute on (activity entries are ordered by time). */
const later = p => p.run('__nowMs += 60000;');
const json = (p, expr) => { const t = p.run('JSON.stringify(' + expr + ')'); return t === undefined ? undefined : JSON.parse(t); };
const measure = p => JSON.parse(p.run('__measure()'));
const coaching = p => JSON.parse(p.run('__coaching()'));

/** Payment form saves through production geodeSavePayApply (harness App.contribute). */
const GOAL = (status, date, amount) => ({ goalId: 'gH', name: 'Toward Holiday', amount: amount || 100, date, status, rec: 'no', intent: 'new' });
const INVEST = (status, date, amount) => ({ investId: 'iS', name: 'ISA contribution', amount: amount || 100, date, status, rec: 'no', intent: 'new' });

const MONEY_MOVED = /moved|landed|topped up|you invested|started moving money|recent contributions help|investing activity is noted|portfolio shifted/i;

// ───────────────────────────── A–D: scheduled versus completed ─────────────────────────────

function contributions() {
  group('A  Scheduled goal contribution is planned, not done', () => {
    const p = page(BASE());
    p.contribute(GOAL('upcoming', OCT + '-25'));
    const c = coaching(p);
    check('A.flag', 'A. The payment form logs the schedule as not completed', [c.flag, c.completed], [false, false]);
    check('A.kind', 'A. Home reads it as a scheduled payment, not a goal payment', c.kind, 'payment_scheduled');
    check('A.e5', 'A. No recent completed goal contribution (E.5 reads completion evidence)', c.e5Goal, false);
    check('A.copy', 'A. No Home coaching says money moved, landed or topped up a goal', [c.primary, MONEY_MOVED.test(c.goalLine)], [null, false]);
    p.contribute(GOAL('upcoming', OCT + '-26')); p.contribute(GOAL('upcoming', OCT + '-27'));
    const c3 = coaching(p);
    check('A.behaviour', 'A. Three scheduled goal contributions: no contribution signal, no goal or contribution follow-through',
      [c3.signals, c3.flags.goalActions, c3.flags.contributionActions, c3.flags.goalFollowThrough], [0, 0, 0, false]);
    check('A.engagement', 'A. Scheduling still counts as using the plan this week (active day)', c3.flags.activeDays, 1);
    const legacy = page(BASE({ activityLog: [{ ts: at(TODAY, 11), type: 'payment', delta: 100, payKind: 'goal', goalId: 'gH', investId: '', debtId: '', name: 'Toward Holiday' }] }));
    const cl = coaching(legacy);
    check('A.legacy', 'A. An unflagged entry from before P3-6D with no completion recorded for it is not read as a completion',
      [cl.flag, cl.completed, cl.kind, cl.primary], ['none', false, 'payment_scheduled', null]);
  });

  group('B  Scheduled investment contribution is not investing that happened', () => {
    const p = page(BASE());
    p.contribute(INVEST('upcoming', OCT + '-25'));
    const c = coaching(p);
    check('B.flag', 'B. Logged as not completed; Home kind payment_scheduled', [c.flag, c.kind], [false, 'payment_scheduled']);
    check('B.e5', 'B. No recent completed investment contribution or investment flow', [c.e5Invest, c.investFlow], [false, false]);
    check('B.state', 'B. Investment contribution state stays NOT_STARTED (no "already investing" copy)', c.investState, 'NOT_STARTED');
    check('B.copy', 'B. No coaching says "you invested", "investments moved" or "started moving money into investments"', [c.primary, MONEY_MOVED.test(c.investLine)], [null, false]);
    const q = page(BASE());
    q.smartImport([{ name: 'ISA top-up', amount: 150, date: OCT + '-28', link: 'invest:iS' }]);
    const ci = coaching(q);
    check('B.import', 'B. A Smart Import row dated ahead is upcoming: logged as not completed, no investment activity', [ci.flag, ci.kind, ci.e5Invest, ci.investState], [false, 'payment_scheduled', false, 'NOT_STARTED']);
    const seeded = page(BASE({
      payments: BASE().payments.concat([{ id: 'old', name: 'ISA June', amount: 200, date: '2026-06-05', status: 'paid', rec: 'no', lastPaidYM: '2026-06', investId: 'iS', goalId: '', debtId: '', payKind: 'invest', createdAt: 1 }]),
      contributionEvents: [{ id: 'cev_m', eventType: 'completion', paymentId: 'old', entityType: 'investment', entityId: 'iS', occurrenceYm: '2026-06', amount: 200,
        recurrence: 'one_off', dueDateSnapshot: '2026-06-05', recordedAt: at(TODAY, 9), source: 'migration' }]
    }));
    const cs = coaching(seeded);
    check('B.migration', 'B. A June completion the upgrade seeded today is not recent investing (its time is when the upgrade ran)', [cs.e5Invest, cs.investFlow], [false, false]);
  });

  group('C  Completed goal contribution is still recognised', () => {
    const p = page(BASE());
    p.contribute(GOAL('paid', TODAY));
    const c = coaching(p);
    check('C.flag', 'C. A contribution saved as completed is logged as completed', [c.flag, c.completed, c.kind], [true, true, 'goal_payment']);
    check('C.e5', 'C. E.5 sees a recent completed goal contribution', c.e5Goal, true);
    check('C.copy', 'C. Home can acknowledge it (goal progress card; "Your recent contributions help")',
      [/^goal_action_home: /.test(c.primary), /Your recent contributions help/.test(c.goalLine)], [true, true]);
    const t = page(BASE());
    const id = t.contribute(GOAL('upcoming', OCT + '-25'));
    later(t);
    t.toggle(id);
    const ct = coaching(t);
    check('C.toggle', 'C. Scheduled then marked complete: the unflagged togglePay entry is confirmed by the completion ledger', [ct.flag, ct.completed, ct.kind, ct.e5Goal], ['none', true, 'goal_payment', true]);
    t.contribute(GOAL('paid', TODAY)); t.contribute(GOAL('paid', TODAY));
    const c3 = coaching(t);
    check('C.behaviour', 'C. Three completed goal contributions: contribution signals and goal follow-through', [c3.signals, c3.flags.goalActions, c3.flags.goalFollowThrough], [3, 3, true]);
    const q = page(BASE());
    q.smartImport([{ name: 'Holiday transfer', amount: 120, date: '2026-10-05', link: 'goal:gH' }]);
    const ci = coaching(q);
    check('C.import', 'C. A Smart Import row dated in the past is paid: logged as completed', [ci.flag, ci.kind, ci.e5Goal], [true, 'goal_payment', true]);
  });

  group('D  Completed investment contribution is still recognised', () => {
    const p = page(BASE());
    p.contribute(INVEST('paid', TODAY));
    const c = coaching(p);
    check('D.flag', 'D. Logged as completed; Home kind invest_payment', [c.flag, c.kind], [true, 'invest_payment']);
    check('D.e5', 'D. E.5 and investment flow see it; contribution state ACTIVE', [c.e5Invest, c.investFlow, c.investState], [true, true, 'ACTIVE']);
    check('D.copy', 'D. Home can acknowledge investing that happened', [/^invest_action_home: /.test(c.primary), /started moving money into investments/.test(c.investLine)], [true, true]);
    const t = page(BASE());
    const iid = t.contribute(INVEST('upcoming', OCT + '-25'));
    later(t);
    t.toggle(iid);
    const ct = coaching(t);
    check('D.toggle', 'D. Scheduled then marked complete: recognised through the ledger', [ct.completed, ct.kind, ct.e5Invest, ct.investState], [true, 'invest_payment', true, 'ACTIVE']);
  });

  group('A–D  Edits and suggestion ordering', () => {
    const p = page(BASE());
    const id = p.contribute(GOAL('paid', TODAY));
    later(p);
    p.editPayment(id, { name: 'Holiday pot' });
    check('AD.editPaid', 'Editing an already completed row is not logged as a new completion', coaching(p).flag, false);
    const states = {
      scheduledGoal: s => s.contribute(GOAL('upcoming', OCT + '-25')),
      scheduledInvest: s => s.contribute(INVEST('upcoming', OCT + '-25')),
      completedGoal: s => s.contribute(GOAL('paid', TODAY)),
      none: () => {}
    };
    const old = installOldPriority();
    const same = Object.keys(states).map(k => {
      const q = page(BASE());
      states[k](q);
      q.run(old);
      return [k, q.run('JSON.stringify(getPriorityRebalanceContext(S)) === JSON.stringify(__oldPrc(S))')];
    });
    check('AD.ordering', 'Suggested-action and highlight ordering context is exactly what it was before P3-6D (a scheduled row still counts as a planned action for ordering)',
      same, Object.keys(states).map(k => [k, true]));
  });
}

/** getPriorityRebalanceContext and the E.5 helpers as they were at d068755, renamed. */
function installOldPriority() {
  const old = execFileSync('git', ['show', BEFORE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
  return ['getPriorityRebalanceContext', 'e5PaymentsLinkedSince', 'hasRecentInvestmentFlowActivity'].map(n => cm.extractFunction(old, n).text).join('\n')
    .replace(/\bgetPriorityRebalanceContext\b/g, '__oldPrc').replace(/\be5PaymentsLinkedSince\b/g, '__oldE5').replace(/\bhasRecentInvestmentFlowActivity\b/g, '__oldFlow');
}

// ───────────────────────────── E/F: feeling ─────────────────────────────

function feeling() {
  group('E  Repeated feeling taps are not behaviour', () => {
    const base = measure(page(WIDE()));
    const tapped = page(WIDE());
    tapped.run('__toasts = []; geodeSetRealityFeelingFromChip("slow"); geodeSetRealityFeelingFromChip("slow"); geodeSetRealityFeelingFromChip("unsure");');
    const events = json(tapped, 'S.behaviourEvents.map(function (e) { return e.kind; })');
    check('E.recorded', 'E. The chips still record what the user said (three feeling events this month)', events, ['feeling_slow', 'feeling_slow', 'feeling_unsure']);
    tapped.run('sessionStorage.removeItem("geode_reality_feeling");');
    check('E.nextSession', 'E. Next session (no feeling set): steps, room, floor, posture and memory modifiers identical to never having tapped', measure(tapped), base);
    const prof = json(tapped, 'geodeFinancialMemoryProfile(S)');
    check('E.memory', 'E. The memory profile counts the taps for reference only: no pattern flag, no evidence, no memory reason',
      [prof.evidence.slowOrUnsureEvents, 'hasRecentSlowOrUnsurePattern' in prof, prof.evidenceCount === json(page(WIDE()), 'geodeFinancialMemoryProfile(S)').evidenceCount,
        json(tapped, 'geodeFinancialMemoryPlanModifiers(S, computeAffordabilityContext(S), null).reasonCodes').some(c => /feeling|slow|unsure|moved/.test(c))],
      [3, false, true, false]);
    const moved = measure(page(WIDE({ behaviourEvents: FEEL('feeling_moved', 4) })));
    check('E.moved', 'E. Four "Things moved" events with no current feeling change nothing either', moved, base);
    const c = coaching(tapped);
    check('E.notActivity', 'E. Taps write no activity: no contribution signal, follow-through, investment flow or Home activity kind',
      [json(tapped, 'S.activityLog.length'), c.signals, c.flags.goalActions, c.investFlow, c.kind], [0, 0, 0, false, '']);
    const surplus = page(BASE({ income: 6000 }));
    surplus.run('geodeSetRealityFeelingFromChip("slow"); geodeSetRealityFeelingFromChip("moved"); geodeSetRealityFeelingFromChip("unsure");');
    check('E.cashInMotion', 'E. In a surplus month, taps never make "Cash in motion" appear', json(surplus, 'getCoreNudges(S).map(function (n) { return n.topic; })').indexOf('cash_in_motion'), -1);
  });

  group('F  A feeling still adapts today\'s recommendation', () => {
    const base = measure(page(WIDE()));
    const slow = measure(page(WIDE(), 'slow'));
    check('F.slow', 'F. "Slow down" today: review_first, room ×0.62, a higher floor and smaller room than with no feeling',
      [slow.posture, slow.multiplier, slow.floor > base.floor, slow.room < base.room], ['review_first', 0.62, true, true]);
    const moved = measure(page(WIDE(), 'moved'));
    check('F.moved', 'F. "Things moved" today: protect_flexibility, room ×0.78', [moved.posture, moved.multiplier], ['protect_flexibility', 0.78]);
    const unsure = measure(page(WIDE(), 'unsure'));
    check('F.unsure', 'F. "Not sure" today: review_first, room ×0.62 (the review_first ×0.62 is below the unsure ×0.72)', [unsure.posture, unsure.multiplier], ['review_first', 0.62]);
    const still = measure(page(WIDE(), 'still'));
    check('F.still', 'F. "Still on track": no adjustment (same as no feeling)', still, base);
    const slowTaps = measure(page(WIDE({ behaviourEvents: FEEL('feeling_slow', 3) }), 'slow'));
    check('F.noDouble', 'F. Repeated taps add nothing on top of today\'s feeling', slowTaps, slow);
    check('F.plan', 'F. Monthly Left is the same whatever the feeling', [base.ml, slow.ml, moved.ml, unsure.ml], [base.ml, base.ml, base.ml, base.ml]);
  });
}

// ───────────────────────────── G: month context ─────────────────────────────

function monthContext() {
  group('G  Month context still adapts strategy', () => {
    const MC = o => ({ monthContext: Object.assign({ ym: OCT, protect: '', worried: '', success: '', updatedAt: at(TODAY, 9) }, o) });
    const base = measure(page(WIDE()));
    const worried = measure(page(WIDE(MC({ worried: 'Car repair' }))));
    const protect = measure(page(WIDE(MC({ protect: 'Rent' }))));
    const success = measure(page(WIDE(MC({ success: 'Calm month' }))));
    check('G.worried', 'G. Worried about: room ×0.78, smaller room', [worried.multiplier, worried.room < base.room], [0.78, true]);
    check('G.protect', 'G. Protect: room ×0.86', protect.multiplier, 0.86);
    check('G.success', 'G. Success would feel like: no strategy effect', success, base);
    check('G.plan', 'G. Monthly Left unchanged by month context', [worried.ml, protect.ml], [base.ml, base.ml]);
  });
}

// ───────────────────────────── H/I: plan pressure ─────────────────────────────

const CASH_CLAIM = /cash flow is|cash flow|over budget|negative right now|right now|overspend|stabilise cash|spending looks|you(\u2019|')re short|can(\u2019|')t afford/i;

function planPressure() {
  group('H  No synthetic cash-pressure claim without evidence', () => {
    const p = page(BASE());
    check('H.pressure', 'H. Monthly Left £1,600: Home pressure ok', p.run('geodeHomePressureLevel()'), 'ok');
    const picks = ['ok', 'mild'].map(pr => json(p, 'geodeChooseHomePrimary([], null, "", ' + J(pr) + ')'));
    check('H.silence', 'H. With nothing to show and the plan not over, Home shows no plan-pressure card (silence, not a fallback warning)', picks, [null, null]);
    const variants = [0, 1, 2].map(i => { p.run('S.nudgeHistory = ' + J(Array.from({ length: i }, () => ({ topic: 'cash_pressure_home' }))) + ';'); return json(p, 'geodeSyntheticCashPressure()'); });
    check('H.copy', 'H. The card\'s every variant, title and explanation make no actual cash claim (cash flow, over budget, right now)',
      variants.map(v => CASH_CLAIM.test([v.title, v.message, v.explain].join(' '))), [false, false, false]);
    check('H.anticipatory', 'H. The Home anticipatory line for Monthly Left below zero describes what was entered, not spending',
      /Spending looks tight/.test(fnText('geodeHomeAnticipatoryLine')), false);
  });

  group('I  Negative Monthly Left is a plan problem', () => {
    const p = page(MLNEG());
    check('I.pressure', 'I. Monthly Left −£500: Home pressure strong', [p.run('calcMonthlyLeftover(S)'), p.run('geodeHomePressureLevel()')], [-500, 'strong']);
    const card = json(p, 'geodeChooseHomePrimary([], null, "", "strong")');
    check('I.card', 'I. The card says the plan is over or stretched, never what is in the account',
      [card.topic, /plan/i.test(card.title + ' ' + card.message), CASH_CLAIM.test(card.title + ' ' + card.message + ' ' + card.explain), /doesn\u2019t show what\u2019s in your account/.test(card.explain)],
      ['cash_pressure_home', true, false, true]);
  });
}

// ───────────────────────────── J/K/L: isolation and invariance ─────────────────────────────

function isolation() {
  group('J/K  Balance and receipts stay out of recommendation maths', () => {
    const base = measure(page(WIDE()));
    check('J.balance', 'J. A £50 or £9,000 balance gives the same steps, room, floor and modifiers', [measure(page(WIDE(RC(50)))), measure(page(WIDE(RC(9000))))], [base, base]);
    check('K.receipts', 'K. Full and partial income receipts give the same steps, room, floor and modifiers',
      [measure(page(WIDE({ incomeReceipts: [RECEIPT('inc1', 3000)] }))), measure(page(WIDE({ incomeReceipts: [RECEIPT('inc1', 800)] })))], [base, base]);
    const withEvidence = measure(page(WIDE(Object.assign({ incomeReceipts: [RECEIPT('inc1', 800)], behaviourEvents: FEEL('feeling_slow', 2) }, RC(50)))));
    check('JK.together', 'J/K. Balance, receipts and repeated taps together: identical to none of them', withEvidence, base);
  });

  group('L  No financial plan calculation changed', () => {
    const old = execFileSync('git', ['show', BEFORE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
    const FINANCIAL = ['calcMonthlyLeftover', 'sumExpensesMonthly', 'sumPaymentsMonthlyOutflow', 'computeAffordabilityContext', 'getMonthPlan',
      'geodeStage62BreathingRoomFloor', 'geodeStage62RealityAdjustment', 'geodeGetContextPosture', 'assessPressure', 'togglePay',
      'geodeRecomputeBalancesFromPayments', 'geodePaymentBalanceEffect', 'geodeRecordContributionTransition', 'geodeRecordDebtPaymentTransition',
      'geodeContributionLedger', 'geodeIncomeReceiptLedger', 'geodeLivingMonthComponents', 'geodeLivingMonthChanges', 'geodeMonthBaselineCapture',
      'geodeApplySavingsRelease', 'geodeRealityStatus', 'rebalanceSuggestedActions', 'getFinancialContext'];
    check('L.identical', 'L. Monthly Left, room, floor, posture, the plan engine, balances, ledgers, receipts, baseline, P3-4 changes, releases and ordering are byte-identical to P3-6C (' + BEFORE_REF + ')',
      FINANCIAL.filter(n => cm.extractFunction(old, n).text !== fnText(n)), []);
    const dropFlag = t => t.replace(/,\n    completed: st === 'paid' && !\(savedPayBefore && savedPayBefore\.status === 'paid'\)\n/, '\n');
    check('L.save', 'L. The payment form save differs from P3-6C only by the completed flag on its activity entry',
      [dropFlag(fnText('geodeSavePayApply')) === cm.extractFunction(old, 'geodeSavePayApply').text, dropFlag(fnText('geodeSavePayApply')) !== fnText('geodeSavePayApply')], [true, true]);
    const flows = [['scheduled', s => s.contribute(GOAL('upcoming', OCT + '-25'))], ['completed', s => s.contribute(INVEST('paid', TODAY))]];
    const figs = s => json(s, '[calcMonthlyLeftover(S), S.goals[0].saved, S.investments[0].balance, S.payments.length]');
    check('L.actions', 'L. Scheduling or completing moves Monthly Left and positions exactly as the money rules say (scheduled £100: Monthly Left −£100, positions unchanged; completed £100: ISA +£100)',
      flows.map(([n, f]) => { const s = page(BASE()); const before = figs(s); f(s); return [n, before, figs(s)]; }),
      [['scheduled', [1600, 500, 0, 1], [1500, 500, 0, 2]], ['completed', [1600, 500, 0, 1], [1500, 500, 100, 2]]]);
  });
}

// ───────────────────────────── M/N: copy ─────────────────────────────

function copy() {
  group('M  coaching.json and the built-in fallback say the same thing', () => {
    const p = page(BASE());
    const cards = cfg => [0, 1, 2].map(i => {
      p.run('geodeCoachingCopy = ' + J(cfg) + '; S.nudgeHistory = ' + J(Array.from({ length: i }, () => ({ topic: 'cash_pressure_home' }))) + ';');
      return json(p, 'geodeSyntheticCashPressure()');
    });
    check('M.parity', 'M. The plan-pressure card is identical from coaching.json and from the fallback (title, every variant, type, topic, explanation)',
      canon(cards(COACHING)) === canon(cards({})), true);
    check('M.json', 'M. coaching.json carries no "Cash flow" / "over budget" wording for the card', CASH_CLAIM.test(J(COACHING.nudges.cash_pressure_home)), false);
  });

  group('N  No em dash in new or edited coaching', () => {
    const p = page(BASE());
    p.run('geodeCoachingCopy = {};');
    const card = [0, 1, 2].map(i => { p.run('S.nudgeHistory = ' + J(Array.from({ length: i }, () => ({ topic: 'cash_pressure_home' }))) + ';'); return json(p, 'geodeSyntheticCashPressure()'); });
    p.run('__toasts = []; geodeRealitySelfReportToast("slow"); geodeRealitySelfReportToast("on_track");');
    const toasts = json(p, '__toasts');
    const html = p.run('geodeRealityPageHtml()').replace(/<[^>]*>/g, ' ');
    const subtitle = 'Your plan stays as it is. This just helps Beynd judge how gently to suggest the next step.';
    const anticipatory = (fnText('geodeHomeAnticipatoryLine').match(/'What you\\u2019ve entered[^']*'/) || [''])[0];
    const edited = [].concat(card.map(c => [c.title, c.message, c.explain].join(' ')), toasts.map(t => String(t.msg || t.message || t)), [subtitle, anticipatory], J(COACHING.nudges.cash_pressure_home));
    check('N.present', 'N. The edited copy is live: the Reality subtitle, both toasts and the anticipatory line',
      [html.indexOf(subtitle) >= 0, toasts.length, anticipatory !== ''], [true, 2, true]);
    check('N.toasts', 'N. The toast says the plan stays, and only a cautious feeling mentions a lighter next step',
      toasts.map(t => String(t.msg || t.message || t)), ['Noted for today. Your plan stays as it is, but Beynd may go a bit easier on the next step.', 'Noted for today. Your plan stays as it is.']);
    check('N.emDash', 'N. None of it contains an em dash', edited.filter(s => EM_DASH.test(s) || /\\u2014/.test(s)), []);
    check('N.oldCopy', 'N. "Your plan stays the same" and "Your plan has not changed" are gone from the Reality page and toast',
      [/Your plan stays the same|Your plan has not changed/.test(fnText('geodeRealityPageHtml') + fnText('geodeRealitySelfReportToast'))], [false]);
  });
}

// ───────────────────────────── static guards ─────────────────────────────

function guards() {
  group('Static guards', () => {
    check('S.writers', 'Every payment activity writer that can save a row without completing it flags the entry (payment form, Smart Import twice, Quick Setup twice)',
      [/completed: st === 'paid' && !\(savedPayBefore/.test(fnText('geodeSavePayApply')), (fnText('geodeSmartImportConfirm').match(/completed: st === 'paid'/g) || []).length,
        (fnText('geodeQuickSetupFinish').match(/name: 'Toward [^}]*completed: false \}/g) || []).length],
      [true, 2, 2]);
    check('S.readers', 'Payment entries count as completed behaviour only through geodeActivityPaymentCompleted (memory, human moment, orchestration, Home kind)',
      [/contributionPayment\(le\) && geodeActivityPaymentCompleted\(le, state\)/.test(fnText('geodeFinancialMemoryProfile')),
        /geodeActivityPaymentCompleted\(e, state\)/.test(fnText('geodeHumanMomentConsistencyFlags')),
        /geodeActivityPaymentCompleted\(e, st0\)/.test(fnText('geodeOrchestrationSnapshotV2')),
        /geodeActivityPaymentCompleted\(latest\)/.test(fnText('geodeLatestActionKind'))], [true, true, true, true]);
    check('S.e5', 'E.5 coaching evidence never reads createdAt; only the ordering helper does', [/createdAt/.test(fnText('e5PaymentsLinkedSince')), /createdAt/.test(fnText('e5PaymentsLinkedPlannedSince'))], [false, true]);
    check('S.feelingMemory', 'Feeling events set no memory flag and add no evidence', /feeling_[\s\S]*mark\(\)/.test(fnText('geodeFinancialMemoryProfile').split('_eMemFeel')[0].split('Feeling chips')[1] || ''), false);
    check('S.harness', 'The probe program extracted the production functions (none shimmed)', ENTRIES.filter(n => program().names.indexOf(n) < 0), []);
  });
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'scheduled goal payment treated as completed': { m: [['geodeActivityPaymentCompleted', [['  if (e.completed === false) return false;', '  if (e.completed === false) return !!e.goalId;']]]], run: [contributions] },
  'scheduled investment payment treated as completed': { m: [['e5PaymentsLinkedSince', [["    if (p.status === 'paid' && p.lastPaidYM === ym) return true;", "    if (field === 'investId' && typeof p.createdAt === 'number' && p.createdAt >= cut) return true;\n    if (p.status === 'paid' && p.lastPaidYM === ym) return true;"]]]], run: [contributions] },
  'completed contribution stops being recognised': { m: [['geodeActivityPaymentCompleted', [['  if (e.completed === true) return true;', '  if (e.completed === true) return false;']]]], run: [contributions] },
  'feeling becomes financial evidence': { m: [['geodeFinancialMemoryProfile', [["      if (be.kind === 'feeling_moved') out.evidence.movedEvents++;\n    }\n", "      if (be.kind === 'feeling_moved') out.evidence.movedEvents++;\n    }\n    if (out.evidence.slowOrUnsureEvents >= 2) { out.hasRepeatedTightMonths = true; mark(); mark(); }\n"]]]], run: [feeling] },
  'chip taps recreate cash-in-motion behaviour': { m: [['geodeSetRealityFeelingFromChip', [["  if (feelEventKind[val]) geodeRecordBehaviourEvent(feelEventKind[val], {});", "  if (feelEventKind[val]) geodeRecordBehaviourEvent(feelEventKind[val], {});\n  appendActivityLog('goal', 25, { goalId: 'gH' }); appendActivityLog('invest', 25, { investId: 'iS' });"]]]], run: [feeling] },
  'synthetic pressure card returns without a plan over': { m: [['geodeChooseHomePrimary', [['  return null;\n}', '  return geodeSyntheticCashPressure();\n}']]]], run: [planPressure] },
  'plan pressure says cash flow is negative': { m: [['geodeSyntheticCashPressure', [["    'This month\\u2019s plan is over. Worth easing something before you add anything new.',", "    'Cash flow is negative right now, so trim or reschedule before adding anything new.',"]]]], run: [planPressure] },
  'balance changes a recommendation amount': { m: [['getMonthPlan', [['    overpay = geodeFinancialMemorySoftenedAmount(overpay, memoryMods.debtExtraMultiplier, 50, false);', '    overpay = geodeFinancialMemorySoftenedAmount(overpay, memoryMods.debtExtraMultiplier, 50, false);\n    if (S.realityCheck && S.realityCheck.ym === currentYM() && toNum(S.realityCheck.amount) < 300) overpay = Math.max(50, Math.round(overpay / 2));']]]], run: [isolation] },
  'receipts change a recommendation amount': { m: [['computeAffordabilityContext', [['  var planRoom = calcMonthlyLeftover(state);', '  var planRoom = calcMonthlyLeftover(state) + (geodeIncomeReceiptLedger(state.incomeReceipts, currentYM()).month.total || 0) * 0.1;']]]], run: [isolation] },
  'edited coaching reintroduces an em dash': { m: [['geodeRealitySelfReportToast', [["        ? 'Noted for today. Your plan stays as it is.'", "        ? 'Noted for today \\u2014 your plan stays as it is.'"]]]], run: [copy] }
};

function runMutants() {
  const out = [];
  Object.keys(MUTANTS).forEach(name => {
    const mu = MUTANTS[name];
    const saved = results;
    results = [];
    let note = '';
    try {
      mu.m.forEach(([n, pairs]) => mutantText(n, pairs));
      MUT = mu.m;
      mu.run.forEach(fn => fn());
    } catch (e) { note = 'anchor: ' + e.message; }
    MUT = null;
    const failed = results.filter(r => !r.ok);
    results = saved;
    out.push({ name, killed: !note && failed.length > 0, by: failed.slice(0, 2).map(r => r.id), note });
  });
  return out;
}

// ───────────────────────────── main ─────────────────────────────

function main() {
  const t0 = Date.now();
  contributions();
  feeling();
  monthContext();
  planPressure();
  isolation();
  copy();
  guards();
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  let cur = '';
  results.forEach(r => {
    if (r.section !== cur) { cur = r.section; console.log('\n== ' + cur); }
    console.log((r.ok ? '  PASS ' : '  FAIL ') + r.id + '  ' + r.text + (r.ok ? '' : '\n         ' + r.detail));
  });
  console.log('\n== MUTANTS: each must be killed by a check above');
  const ms = runMutants();
  ms.forEach(m => console.log((m.killed ? '  KILLED   ' : '  SURVIVED ') + m.name + (m.killed ? '  (' + m.by.join(', ') + ')' : '') + (m.note ? '  ' + m.note : '')));
  const survived = ms.filter(m => !m.killed).length;
  console.log('\nSummary: PASS: ' + pass + ' FAIL: ' + fail + '  MUTANTS: ' + (ms.length - survived) + '/' + ms.length + ' killed  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  const ok = fail === 0 && survived === 0;
  console.log('RESULT: ' + (ok ? 'PASS' : 'FAIL'));
  process.exit(ok ? 0 : 1);
}

main();
