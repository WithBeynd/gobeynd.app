#!/usr/bin/env node
/**
 * P3-6C Ask Beynd model-context truth: the context Beynd sends to the model, and the worker's system prompt, keep the
 * Phase 3 boundaries — PLAN (planned income, planned expenses, scheduled payments, plan leftover), RECORDED evidence
 * (completed payments, the balance snapshot the user entered) and UNKNOWN (a payment past its date with no outcome).
 *
 * Builds the real context string (geodeBuildCoachingContext and every block it calls, from index.html) inside the
 * cross-month harness's simulated app (tests/month-baseline.js pageOver: production load and store) for scenarios A–N,
 * reads the worker's WORKER_SYSTEM_PROMPT and providerMessages from worker/src/index.js, adds static copy guards, checks
 * the financial functions are byte-identical to P3-6B, and runs a mutant per rule.
 *
 * Run: node tests/ask-context-truth.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const ROOT = path.join(__dirname, '..');
const SRC = cm.readSource(cm.INDEX_HTML);
const WORKER_FILE = path.join(ROOT, 'worker', 'src', 'index.js');
const WORKER_SRC = fs.readFileSync(WORKER_FILE, 'utf8').replace(/\r\n/g, '\n');
/** P3-6B: the financial engine this stage must leave byte-identical. */
const ENGINE_REF = '94e8390';
const J = v => JSON.stringify(v);

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
/** October 2026, nothing past its date: planned income £3,000; Rent £1,000 (15th) and Holiday £100 (25th); Food £400. Monthly Left £1,500. */
const BASE = over => Object.assign({
  _schemaVersion: 3, income: 3000, incomeExplicitlySet: true, incomeType: 'stable', expectationGaps: [], expectationFloorYm: OCT,
  cur: { code: 'GBP', sym: '£' }, planStrategy: 'balanced',
  payments: [
    { id: 'rent', name: 'Rent', amount: 1000, rec: 'yes', status: 'upcoming', date: OCT + '-15' },
    { id: 'hol', name: 'Holiday monthly', amount: 100, rec: 'yes', status: 'upcoming', date: OCT + '-25', goalId: 'gH' }
  ],
  expenses: [{ id: 'food', name: 'Food', amount: 400, rec: 'yes', cat: 'food', date: OCT + '-01' }],
  goals: [{ id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other', targetDate: '2027-01-31' }],
  investments: [], debts: [], savingsReleases: [], debtPaymentEvents: [], activityLog: [], lastSuggestedActions: []
}, over || {});
const withPayment = (s, p) => { s.payments = s.payments.concat([p]); return s; };
const withExpense = (s, e) => { s.expenses = s.expenses.concat([e]); return s; };
const GYM = (status, date) => ({ id: 'gym', name: 'Gym', amount: 30, rec: 'no', status, date });
const BILLS = amount => ({ id: 'bills', name: 'Bills', amount, rec: 'yes', cat: 'bills', date: OCT + '-02' });
const RECEIPT = (id, amount) => ({ id, eventType: 'receipt', amount, ym: OCT, recordedAt: at('2026-10-10', 9), source: 'manual' });

const SCENARIOS = {
  base: () => BASE(),
  A: () => withPayment(BASE(), GYM('upcoming', '2026-10-11')),
  B: () => withPayment(BASE(), GYM('overdue', '2026-10-11')),
  C: () => withPayment(BASE(), GYM('paid', '2026-10-11')),
  D: () => withPayment(BASE(), GYM('upcoming', '2026-10-20')),
  E: () => BASE(),
  F: () => BASE({ incomeReceipts: [RECEIPT('inc1', 1000)] }),
  Ffull: () => BASE({ incomeReceipts: [RECEIPT('inc1', 3000)] }),
  G: () => BASE({ incomeType: 'irregular', incomeTypeUserSet: true }),
  H: () => BASE({ income: 0, incomeExplicitlySet: true, incomeType: 'none' }),
  I: () => BASE({ income: 0, incomeExplicitlySet: false }),
  J: () => BASE({ expenses: [{ id: 'food', name: 'Food', amount: 800, rec: 'yes', cat: 'food', date: OCT + '-01' }] }),
  K: () => withExpense(BASE(), BILLS(1000)),
  L: () => withExpense(BASE(), BILLS(2000)),
  M: () => BASE({ realityCheck: { amount: 200, ym: OCT, date: at(TODAY, 9) } }),
  N: () => BASE()
};

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
/** The context builder, the engine it reads (real, not the harness's plan shim) and the receipt ledger for the mutants. */
const ENTRIES = ['geodeBuildCoachingContext', 'getMonthPlan', 'computeAffordabilityContext', 'calcMonthlyLeftover', 'assessPressure',
  'geodeHasOverdue', 'geodeIncomeReceiptLedger', 'geodeAskBeyndPlannedIncomeLine', 'geodeAskBeyndIncomeCode'];

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
  PROGRAM = { script: new vm.Script(PRELUDE + '\n' + globals.join('\n') + '\n' + code, { filename: 'ask-context-program' }), names: [...have.keys()] };
  return PROGRAM;
}

const fnText = n => cm.extractFunction(SRC, n).text;
/** The active mutant: page functions [name, [[from, to], …]] and worker source pairs (each anchor must occur exactly once). */
let MUT = null;
function replaceOnce(t, pairs, where) {
  pairs.forEach(([from, to]) => {
    if (t.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in ' + where + ': ' + from);
    t = t.replace(from, () => to);
  });
  return t;
}

function page(state) {
  const p = mb.pageOver(J(state), TODAY);
  program().script.runInContext(p.ctx);
  if (MUT && MUT.page) MUT.page.forEach(([n, pairs]) => p.run(replaceOnce(fnText(n), pairs, n)));
  return p;
}
const CTX = {};
function ctx(name) {
  const key = name + (MUT ? '#' + MUT.name : '');
  if (!(key in CTX)) CTX[key] = String(page(SCENARIOS[name]()).run('geodeBuildCoachingContext()'));
  return CTX[key];
}
const monthlyLeft = name => page(SCENARIOS[name]()).run('calcMonthlyLeftover(S)');

/** The worker module's prompt and message builder, evaluated from source (export default replaced). */
function worker() {
  const src = MUT && MUT.worker ? replaceOnce(WORKER_SRC, MUT.worker, 'worker/src/index.js') : WORKER_SRC;
  const c = vm.createContext({ crypto: {}, TextEncoder, Response: function () {}, setTimeout, clearTimeout });
  vm.runInContext(src.replace(/^export default /m, 'var __worker = '), c, { filename: 'worker/src/index.js' });
  return {
    prompt: vm.runInContext('WORKER_SYSTEM_PROMPT', c),
    maxContext: vm.runInContext('MAX_CONTEXT_CHARS', c),
    messages: JSON.parse(vm.runInContext('JSON.stringify(providerMessages({ question: "Q?", messages: [{ role: "user", content: "earlier" }], context: "CTX-LINE" }))', c))
  };
}

// ───────────────────────────── vocabulary ─────────────────────────────

const UNKNOWN_LINE = 'Some payments are past their date with no outcome recorded. Do not assume they were unpaid, missed or failed.';
const LEGEND = 'How to read this: PLAN is what the user expects or intends (planned income, planned expenses, scheduled payments, plan leftover), not proof that money moved. RECORDED is what the user recorded (completed payments, a balance snapshot they entered). Anything not recorded is UNKNOWN: a payment past its date with no outcome recorded is not unpaid, missed or failed.';
/** Sentences that name a forbidden word only to rule it out. */
const NEGATIONS = [UNKNOWN_LINE, LEGEND, 'do not claim minimums are met or missed unless explicitly in context.'];
const strip = t => NEGATIONS.reduce((s, n) => s.split(n).join(' '), t);
const CERTAINTY = /\boverdue\b|\bunpaid\b|\bmissed\b|\bfailed\b|\blate\b/i;
const AS_ACTUAL = /\breceived\b|\breceipts?\b|\bspent\b|\bspending\b|cash available|cash left|safe to spend|available now/i;
const COMPARISON = /difference|overstat|understat|\baligned\b|below (your|the) plan|above (your|the) plan|compared with monthly left|balance gap|looks steady|worth another look/i;
const line = (t, prefix) => (t.split('\n').find(l => l.indexOf(prefix) === 0) || null);

// ───────────────────────────── A–D: payments ─────────────────────────────

function payments() {
  group('A–D  Payment outcomes: past date with no outcome stays UNKNOWN', () => {
    const A = ctx('A'), B = ctx('B'), C = ctx('C'), D = ctx('D'), base = ctx('base');
    check('A.unknown', 'A. Due yesterday, no outcome: the context says the outcome is not recorded and must not be assumed', A.indexOf(UNKNOWN_LINE) >= 0, true);
    check('A.noCertainty', 'A. Nothing else calls it overdue, unpaid, missed, failed or late', CERTAINTY.test(strip(A)), false);
    check('B.unknown', 'B. Due yesterday, marked Needs confirmation: the same unknown line, never "overdue"', [B.indexOf(UNKNOWN_LINE) >= 0, CERTAINTY.test(strip(B))], [true, false]);
    check('AB.same', 'A and B reach the model identically (Needs confirmation adds no certainty)', A === B, true);
    check('C.completed', 'C. Due yesterday, completed: no unknown line (recorded evidence is not weakened to unknown)', [C.indexOf(UNKNOWN_LINE) >= 0, CERTAINTY.test(strip(C))], [false, false]);
    check('D.future', 'D. Future scheduled payment: no unknown line and no paid / spent wording', [D.indexOf(UNKNOWN_LINE) >= 0, /\bpaid\b|\bspent\b/i.test(strip(D)), CERTAINTY.test(strip(D))], [false, false, false]);
    check('base.none', 'Nothing past its date: no unknown line', base.indexOf(UNKNOWN_LINE) >= 0, false);
    check('legend', 'Every context opens with the PLAN / RECORDED / UNKNOWN reading guide', ['A', 'B', 'C', 'D', 'base'].map(n => ctx(n).split('\n')[1]), ['A', 'B', 'C', 'D', 'base'].map(() => LEGEND));
  });
}

// ───────────────────────────── E–I: planned income ─────────────────────────────

function income() {
  group('E–I  Planned income is the plan; unset is not £0; receipts are not added', () => {
    const E = ctx('E'), F = ctx('F'), G = ctx('G'), H = ctx('H'), I = ctx('I');
    check('E.planned', 'E. £3,000 planned, no receipts: "Planned income: £3000/month · stable"', line(E, 'Planned income: '), 'Planned income: £3000/month \u00b7 stable');
    check('E.noReceived', 'E. Nothing says income was received, and no receipt line appears', AS_ACTUAL.test(strip(E)), false);
    check('F.unchanged', 'F. A partial £1,000 receipt changes nothing the model sees (receipts are not Ask evidence in Phase 3)', F === E, true);
    check('F.full', 'A full £3,000 receipt changes nothing either (never read as complete income evidence)', ctx('Ffull') === E, true);
    check('G.irregular', 'G. Irregular: a plan attribute on the planned line and in posture, not an arrival', [line(G, 'Planned income: '), line(G, 'Planned income type: ')], ['Planned income: £3000/month \u00b7 irregular', 'Planned income type: variable/irregular']);
    check('H.zero', 'H. Explicit £0: "Planned income: £0/month"; the caution says planned_income_zero, never no_income or not set',
      [line(H, 'Planned income: '), /planned_income_zero/.test(H), /\bno_income\b/.test(H), /not set/.test(H)], ['Planned income: £0/month', true, false, false]);
    check('I.unset', 'I. Never set: "Planned income: not set"; the caution says planned_income_not_set, never £0 or no_income',
      [line(I, 'Planned income: '), /planned_income_not_set/.test(I), /\bno_income\b/.test(I), /Planned income: £0/.test(I)], ['Planned income: not set', true, false, false]);
    check('EI.noBareIncome', 'No context carries an unqualified "Income: £" or "Monthly income: £" line', ['E', 'G', 'H', 'I', 'L'].filter(n => /^(Monthly )?[Ii]ncome: /m.test(ctx(n))), []);
  });
}

// ───────────────────────────── J–L: planned expenses and Monthly Left ─────────────────────────────

function expensesAndLeft() {
  group('J–L  Planned expenses and the plan leftover', () => {
    const Jc = ctx('J'), K = ctx('K'), L = ctx('L');
    check('J.planned', 'J. Expense plan £800: "Planned monthly expenses: £800"', line(Jc, 'Planned monthly expenses: '), 'Planned monthly expenses: £800');
    check('J.noSpending', 'J. No spent / spending / spending-so-far wording', AS_ACTUAL.test(strip(Jc)), false);
    check('K.left', 'K. Monthly Left +£500 stays "Plan leftover this month (estimate)"; no over-plan block; never cash or safe to spend',
      [monthlyLeft('K'), line(K, 'Plan leftover this month (estimate): '), /OVER-PLAN CONTEXT/.test(K), AS_ACTUAL.test(strip(K))], [500, 'Plan leftover this month (estimate): £500', false, false]);
    check('L.left', 'L. Monthly Left −£500: the plan leftover line and the over-plan block, every figure labelled as plan',
      [monthlyLeft('L'), line(L, 'Plan leftover this month (estimate): £'), /OVER-PLAN CONTEXT \(PLAN figures/.test(L), L.indexOf('Plan leftover this month (estimate): -£500 (the plan is over by £500)') >= 0,
        L.indexOf('Planned monthly expenses: £2400') >= 0, L.indexOf('Planned monthly payments (scheduled and completed): £1100') >= 0, /Planned flexible expenses by category/.test(L)],
      [-500, 'Plan leftover this month (estimate): £-500', true, true, true, true, true]);
    check('L.words', 'L. No spending / over-budget / cash wording, and no nudge to refresh the balance', [AS_ACTUAL.test(strip(L)), /over budget|refreshing reality/i.test(L), CERTAINTY.test(strip(L))], [false, false, false]);
    const W = worker();
    check('size', 'Every context fits the worker limit (' + W.maxContext + ' characters)', Object.keys(SCENARIOS).filter(n => ctx(n).length > W.maxContext), []);
  });
}

// ───────────────────────────── M–N: Reality ─────────────────────────────

function reality() {
  group('M–N  The balance stays an observation', () => {
    const M = ctx('M'), N = ctx('N');
    check('M.snapshot', 'M. "User-entered balance snapshot: £200 on 12 Oct." and no comparison or affordability inference', [M.indexOf('User-entered balance snapshot: £200 on 12 Oct.') >= 0, COMPARISON.test(M)], [true, false]);
    check('N.none', 'N. No balance: "User-entered balance snapshot: none this month."', [N.indexOf('User-entered balance snapshot: none this month.') >= 0, COMPARISON.test(N)], [true, false]);
    check('MN.rest', 'Apart from the snapshot line the two contexts are identical', M.replace(/User-entered balance snapshot: [^\n]*/, '') === N.replace(/User-entered balance snapshot: [^\n]*/, ''), true);
  });
}

// ───────────────────────────── worker prompt ─────────────────────────────

function workerPrompt() {
  group('Worker  System-prompt contract (worker/src/index.js)', () => {
    const W = worker();
    const has = s => W.prompt.indexOf(s) >= 0;
    check('W.plan', 'PLAN is intentions and expectations, not proof money moved', [has('PLAN is what the user expects or intends'), has('not proof that money moved')], [true, true]);
    check('W.recorded', 'RECORDED is what the user recorded', has('RECORDED is what the user recorded'), true);
    check('W.unknown', 'UNKNOWN stays unknown; a passed date without an outcome is not non-payment',
      [has('anything else is UNKNOWN and stays unknown'), has('A payment past its date with no recorded outcome is unknown: never call it unpaid, missed, failed or late.')], [true, true]);
    check('W.asActual', 'Planned income is not received, planned expenses are not spent, the plan leftover is not cash or safe to spend',
      has('Do not describe planned income as received, planned expenses as spent, or plan leftover as current cash or money that is safe to spend.'), true);
    check('W.absence', 'Missing evidence never becomes £0 or a failure', has('Never turn missing evidence into £0 or a failure.'), true);
    check('W.antiFabrication', 'Existing anti-fabrication and no-live-bank rules are kept',
      [has('Do not invent figures, targets, dates, or guarantees.'), has('Bank connection is not live; do not imply live balances, transactions, or certainty beyond the context.'), has('Answer only from the plan and conversation in Beynd.')], [true, true, true]);
    check('W.concise', 'The prompt stays concise (under 2,600 characters)', W.prompt.length < 2600, true);
    check('W.messages', 'The model receives the prompt as the system message and the context verbatim, then history and the question',
      W.messages.map(m => [m.role, m.content]), [['system', W.prompt], ['user', 'Context:\nCTX-LINE'], ['user', 'earlier'], ['user', 'Q?']]);
  });
}

// ───────────────────────────── static guards ─────────────────────────────

/** Ask-only functions that write text the model receives. */
const ASK_TEXT = ['geodeBuildCoachingContext', 'geodeFormatAskBeyndSpendingPressureContextBlock', 'geodeFormatAskBeyndPaoContextBlock',
  'geodeFormatAskBeyndContextPostureBlock', 'geodeFormatPlanRationaleContextBlock', 'geodeAskBeyndPlannedIncomeLine', 'geodeAskBeyndIncomeCode',
  'geodeFormatAskBeyndOrchestrationBlock', 'geodeFormatAskBeyndMonthContextBlock'];
/** The financial engine and evidence functions P3-6C must not change. */
const ENGINE = ['calcMonthlyLeftover', 'computeAffordabilityContext', 'getMonthPlan', 'geodeStage62BreathingRoomFloor', 'geodeStage62RealityAdjustment',
  'sumExpensesMonthly', 'sumPaymentsMonthlyOutflow', 'geodePaymentEffectiveStatus', 'geodeHasOverdue', 'assessPressure', 'geodeIncomeReceiptLedger',
  'geodeRealityStatus', 'togglePay', 'geodeRecomputeBalancesFromPayments', 'geodePlanRationaleSnapshot', 'geodeOrchestrationSnapshot'];

function guards() {
  group('Static guards', () => {
    const strings = n => (fnText(n).match(/'(?:\\.|[^'\\\n])*'/g) || []).join(' ');
    const all = ASK_TEXT.map(strings).join(' ');
    check('S.overdue', 'No live Ask text says "Anything overdue may need attention"', /Anything overdue may need attention/.test(all), false);
    check('S.income', 'No live Ask text writes an unqualified "Income: " or "Monthly income: " label', /'(Monthly )?[Ii]ncome: '/.test(all), false);
    check('S.expenses', 'No live Ask text writes "Monthly spending total", "Flexible spending by category", "Estimated monthly leftover" or "over budget by"',
      /Monthly spending total|Flexible spending by category|Estimated monthly leftover|over budget by/.test(all), false);
    check('S.comparison', 'No live Ask text compares the balance with Monthly Left', COMPARISON.test(all.replace('not compared with the plan', '').replace('not checked against the plan', '')), false);
    check('S.receipts', 'No Ask text function reads income receipts', ASK_TEXT.filter(n => /incomeReceipts|geodeIncomeReceipt|geodeLivingMonthIncome/.test(fnText(n))), []);
    check('S.byokDead', 'BYOK is DEAD: window._GEODE_ASK_BEYND_BYOK is read once and assigned nowhere, so every send goes to the worker',
      [SRC.split('_GEODE_ASK_BEYND_BYOK').length - 1, /_GEODE_ASK_BEYND_BYOK\s*=[^=]/.test(SRC), fnText('geodeBeyndAiComplete').indexOf('if (!(window._GEODE_ASK_BEYND_BYOK === true && S.beyondApiKey))') >= 0], [1, false, true]);
    const old = execFileSync('git', ['show', ENGINE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
    check('S.engine', 'Monthly Left, room, the plan engine, payment status, receipts ledger, Reality status and positions are byte-identical to P3-6B (' + ENGINE_REF + ')',
      ENGINE.filter(n => cm.extractFunction(old, n).text !== fnText(n)), []);
    check('S.harness', 'The context builder and the engine run as production code (no shimmed plan)', ENTRIES.filter(n => program().names.indexOf(n) < 0), []);
  });
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = [
  { name: 'unknown payment becomes overdue again', page: [['geodeFormatAskBeyndPaoContextBlock', [["lines.push('Some payments are past their date with no outcome recorded. Do not assume they were unpaid, missed or failed.');", "lines.push('Anything overdue may need attention before suggesting new commitments.');"]]]], run: [payments] },
  { name: 'Needs confirmation becomes overdue', page: [['geodeBuildCoachingContext', [["    var balanceBlock = balanceCtxLines.join('\\n');", "    if ((S.payments || []).some(function (p) { return p && p.status === 'overdue'; })) balanceCtxLines.push('Some payments are overdue.');\n    var balanceBlock = balanceCtxLines.join('\\n');"]]]], run: [payments] },
  { name: 'planned income loses "planned"', page: [['geodeAskBeyndPlannedIncomeLine', [["return 'Planned income: ' + sym + amt + '/month \\u00b7 '", "return 'Income: ' + sym + amt + '/month \\u00b7 '"]]]], run: [income] },
  { name: 'planned expenses become "spending"', page: [['geodeBuildCoachingContext', [["'Planned monthly expenses: ' + sym + Math.round(tSpend)", "'Monthly spending total: ' + sym + Math.round(tSpend)"]]]], run: [expensesAndLeft] },
  { name: 'unset income becomes £0', page: [['geodeAskBeyndPlannedIncomeLine', [["if (!state.incomeExplicitlySet) return 'Planned income: not set';", "if (false) return 'Planned income: not set';"]]]], run: [income] },
  { name: 'explicit £0 becomes unset', page: [['geodeAskBeyndPlannedIncomeLine', [["if (amt <= 0) return 'Planned income: ' + sym + amt + '/month';", "if (amt <= 0) return 'Planned income: not set';"]]]], run: [income] },
  { name: 'no_income code returns', page: [['geodeAskBeyndIncomeCode', [["if (code !== 'no_income') return code;", 'return code;']]]], run: [income] },
  { name: 'worker prompt loses the unknown rule', worker: [['A payment past its date with no recorded outcome is unknown: never call it unpaid, missed, failed or late. ', '']], run: [workerPrompt] },
  { name: 'worker prompt permits plan-as-actual', worker: [['Do not describe planned income as received, planned expenses as spent, or plan leftover as current cash or money that is safe to spend. ', 'You may treat planned income as received and planned expenses as spent. ']], run: [workerPrompt] },
  { name: 'balance comparison returns', page: [['geodeBuildCoachingContext', [["    var balanceBlock = balanceCtxLines.join('\\n');", "    if (rs.hasData) balanceCtxLines.push('Difference from plan: ' + sym + Math.round(toNum(rs.amount) - left));\n    var balanceBlock = balanceCtxLines.join('\\n');"]]]], run: [reality] },
  { name: 'receipts treated as complete income evidence', page: [['geodeBuildCoachingContext', [['      geodeAskBeyndPlannedIncomeLine(S, sym),', "      geodeAskBeyndPlannedIncomeLine(S, sym),\n      'Income received this month: ' + sym + (geodeIncomeReceiptLedger(S.incomeReceipts, currentYM()).month.total || 0),"]]]], run: [income] },
  { name: 'reading guide removed', page: [['geodeBuildCoachingContext', [["      'How to read this: PLAN", "      'PLAN"]]]], run: [payments] },
  { name: 'over-plan block says spending again', page: [['geodeFormatAskBeyndSpendingPressureContextBlock', [["lines.push('Planned monthly expenses: ' + sym + expenses);", "lines.push('Monthly spending so far: ' + sym + expenses);"]]]], run: [expensesAndLeft] }
];

function runMutants() {
  return MUTANTS.map(mu => {
    const saved = results;
    results = [];
    let note = '';
    try {
      (mu.page || []).forEach(([n, pairs]) => replaceOnce(fnText(n), pairs, n));
      if (mu.worker) replaceOnce(WORKER_SRC, mu.worker, 'worker/src/index.js');
      MUT = mu;
      mu.run.forEach(fn => fn());
    } catch (e) { note = 'anchor: ' + e.message; }
    MUT = null;
    const failed = results.filter(r => !r.ok);
    results = saved;
    return { name: mu.name, killed: !note && failed.length > 0, by: failed.slice(0, 2).map(r => r.id), note };
  });
}

// ───────────────────────────── main ─────────────────────────────

function main() {
  const t0 = Date.now();
  payments();
  income();
  expensesAndLeft();
  reality();
  workerPrompt();
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
