#!/usr/bin/env node
/**
 * P3-6E Plan-as-cash and spending copy integrity: plan figures read as plan, never as cash, actual spending, current
 * affordability or money already moved.
 *
 * Runs the production copy paths from index.html inside the cross-month harness's simulated app (tests/month-baseline.js
 * pageOver): the save feedback picker and the payment form save, the goal target date label and the Goals list, the
 * Payments / Expenses / Money overview empty states, the expense, goal and investment modal impact lines, the over-budget
 * plan block, the Plan buffer and investing step text, and the Highlights nudges.
 *
 * Checks: scenarios A–J, the live copy, a static search of live paths, financial and Reality invariants, and a mutant per
 * rule.
 *
 * Run: node tests/plan-copy-integrity.js
 */
'use strict';

const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = cm.readSource(cm.INDEX_HTML);
const BEFORE_REF = '6a98b46';
const OLD = execFileSync('git', ['show', BEFORE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
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
/** tests/reality-action-guidance.js CALM: Monthly Left £1,390, a 22% card, a Holiday goal (£1,000 of £2,000). */
const CALM = over => {
  const s = Object.assign(mb.PLAN(OCT), {
    planStrategy: 'balanced', cur: { code: 'GBP', sym: '£' }, behaviourEvents: [],
    debts: [{ id: 'd1', name: 'Card', balance: 2000, apr: 22, minp: 50 }],
    goals: [{ targetDate: '2027-01-31', id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' }]
  }, over || {});
  s.payments = s.payments.filter(x => x.id !== 'fine').map(x => (x.id === 'hol' ? Object.assign({}, x, { date: OCT + '-25' }) : x));
  return s;
};
/** The same plan with a regular £1,950 bill: Monthly Left −£500. */
const MLNEG = over => { const s = CALM(over); s.expenses = s.expenses.concat([{ id: 'bills', name: 'Bills', amount: 1950, rec: 'yes', cat: 'bills', date: OCT + '-02' }]); return s; };
const EMPTY = over => Object.assign(CALM(), { expenses: [], payments: [] }, over || {});
const RC = (amount, iso) => ({ realityCheck: { amount, ym: OCT, date: at(iso || TODAY, 9) } });
const RECEIPT = (id, amount) => ({ id, eventType: 'receipt', amount, ym: OCT, recordedAt: at('2026-10-10', 9), source: 'manual' });
const goalAt = (o) => ({ goals: [Object.assign({ id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' }, o)] });
const PRIMARY = s => { s.goals = s.goals.map(g => Object.assign({}, g, { isPrimary: true })); return s; };

// ───────────────────────────── program ─────────────────────────────

const PRELUDE = [
  'var __html = null;',
  'function openModal(h) { __html = String(h); }',
  'function removeModalDom() { __html = null; }',
  'function closeModal() { __html = null; }',
  'function mh(t) { return "<div class=\\"mh\\">" + t + "</div>"; }',
  'function __host() { return { innerHTML: "", children: [], style: {}, appendChild: function (c) { this.children.push(c); }, insertBefore: function (c) { this.children.unshift(c); } }; }',
  'var __hosts = {};',
  'var __gid0 = document.getElementById;',
  'document.getElementById = function (id) { return Object.prototype.hasOwnProperty.call(__hosts, id) ? __hosts[id] : __gid0(id); };',
  'var __ce0 = document.createElement;',
  'document.createElement = function (t) { var e = __ce0(t); var h = __host(); for (var k in h) e[k] = h[k]; return e; };'
].join('\n');
function extractGlobal(n) {
  const start = SRC.indexOf('\nvar ' + n + ' = ') + 1;
  const eol = SRC.indexOf('\n', start);
  const first = SRC.slice(start, eol);
  if (/[{[]\s*$/.test(first)) return SRC.slice(start, SRC.indexOf('\n' + (/\{\s*$/.test(first) ? '}' : ']') + ';', start) + 3);
  return first;
}
const DECLARED = new Set((SRC.match(/\nvar [A-Za-z_$][\w$]* = /g) || []).map(s => s.slice(5, -3)));
const ENTRIES = [
  'geodeMicroConfirmPickMessage', 'geodeStageLToastAfterSave', 'geodeEmitPaymentCompletionFeedback', 'geodeHomeNoteRecentCompletion',
  'geodeGoalTargetDateLabel', 'rGoals', 'rPayments', 'rExpenses', 'rMoneyOverview', 'geodeOverBudgetPlanBlockHtml',
  'geodeExpModalImpactRefresh', 'geodeGoalModalImpactRefresh', 'geodeInvModalImpactRefresh', 'geodeCoachingLineForDelta',
  'geodePlanBufferStepDisplay', 'geodePlanInvestStepDisplay', 'getCoreNudges', 'getIntentAwareNudges', 'geodeStageLProgressSignal',
  'calcMonthlyLeftover', 'computeAffordabilityContext', 'getMonthPlan', 'geodeGetMainAction', 'geodeRealityActionGuidance',
  'geodeIncomeReceiptLedger', 'geodeContributionLedger'
];

const MEASURE = `
function __text(h) { return String(h || '').replace(/<[^>]*>/g, ' | ').replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\\s*\\|\\s*(\\|\\s*)*/g, ' | ').replace(/^\\s*\\|\\s*|\\s*\\|\\s*$/g, '').trim(); }
function __measure() {
  var a = computeAffordabilityContext(S);
  var plan = getMonthPlan();
  var main = geodeGetMainAction(S);
  return JSON.stringify({
    ml: calcMonthlyLeftover(S), planRoom: a.planRoom, room: a.suggestableRoom,
    steps: plan.steps.map(function (s) { return [s.label, s.amount, s.priority]; }),
    main: main ? [main.title, main.amount, main.cta] : null,
    goals: S.goals.map(function (g) { return [g.id, g.saved, g.amount]; }),
    debts: S.debts.map(function (d) { return [d.id, d.balance]; }),
    payments: S.payments.map(function (p) { return [p.id, p.amount, p.status, p.date]; })
  });
}
function __walk(n) { return [n.innerHTML || '', n.textContent || ''].concat((n.children || []).map(__walk)).join(' | '); }
function __render(fn, hostIds) {
  (hostIds || []).forEach(function (id) { __hosts[id] = __host(); });
  var el = __host();
  fn(el);
  var parts = [__walk(el)];
  (hostIds || []).forEach(function (id) { parts.push(__walk(__hosts[id])); });
  return __text(parts.join(' | '));
}
function __impact(fn, host, fields) {
  __hosts[host] = __host();
  Object.keys(fields).forEach(function (k) { __fields[k] = fields[k]; });
  fn();
  return __text(__hosts[host].innerHTML);
}
function __nudges(kind) {
  var list = kind === 'core' ? getCoreNudges(S) : getIntentAwareNudges(S);
  return JSON.stringify(list.map(function (n) { return { topic: n.topic, title: n.title, message: n.message, variants: n.variants || [] }; }));
}
function __feedback() {
  var note = window._geodeHomeRecentCompletion ? window._geodeHomeRecentCompletion.msg : '';
  return JSON.stringify({ acks: __acks.filter(function (a) { return a.indexOf('subscription ') !== 0; }), toasts: __toasts.slice(), note: note });
}
function __resetFeedback() { __acks = []; __toasts = []; window._geodeHomeRecentCompletion = null; }
`;

let PROGRAM = null;
function program() {
  if (PROGRAM) return PROGRAM;
  const probe = mb.pageOver(J(CALM()), TODAY);
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
  PROGRAM = { script: new vm.Script(PRELUDE + '\n' + globals.join('\n') + '\n' + code + '\n' + MEASURE, { filename: 'plan-copy-integrity-program' }), names: [...have.keys()] };
  return PROGRAM;
}

const fnText = n => cm.extractFunction(SRC, n).text;
let MUT = null;
function mutantText(n, pairs) {
  let t = fnText(n);
  pairs.forEach(([from, to]) => {
    if (t.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in ' + n + ': ' + from);
    t = t.replace(from, () => to);
  });
  return t;
}
/** Static checks read the (possibly mutated) production text of a function. */
const liveText = n => { const m = MUT && MUT.filter(([f]) => f === n)[0]; return m ? mutantText(n, m[1]) : fnText(n); };
function page(state) {
  const p = mb.pageOver(J(state), TODAY);
  program().script.runInContext(p.ctx);
  if (MUT) MUT.forEach(([n, pairs]) => p.run(mutantText(n, pairs)));
  return p;
}
const json = (p, expr) => { const t = p.run('JSON.stringify(' + expr + ')'); return t === undefined ? undefined : JSON.parse(t); };
const measure = p => JSON.parse(p.run('__measure()'));
const render = (p, fn, hosts) => String(p.run('__render(' + fn + ', ' + J(hosts || []) + ')'));
const modal = (p, fn, host, fields) => String(p.run('__impact(' + fn + ', ' + J(host) + ', ' + J(fields) + ')'));
const nudges = (p, kind) => JSON.parse(p.run('__nudges(' + J(kind) + ')'));
const nudgeText = list => list.map(n => [n.title, n.message].concat(n.variants)).reduce((a, b) => a.concat(b), []);
const pick = (p, kind, extras) => String(p.run('geodeMicroConfirmPickMessage(' + J(kind) + ', ' + J(extras) + ')'));
const feedback = p => JSON.parse(p.run('__feedback()'));
const overBudget = p => String(p.run('__text(geodeOverBudgetPlanBlockHtml(calcMonthlyLeftover(S)))'));
const expImpact = (p, amount) => modal(p, 'geodeExpModalImpactRefresh', 'geode-exp-impact-host', { en: 'Coffee', ea: String(amount), ed: OCT + '-14', ecat: 'food', er: 'no', geode_exp_edit_id: '' });
const goalsList = p => render(p, 'function (el) { __hosts.content = el; rGoals(el); }', ['glist']);
const GOAL = (status, date) => ({ goalId: 'gH', name: 'Toward Holiday', amount: 100, date, status, rec: 'no', intent: 'new' });
const INVEST = (status, date) => ({ investId: 'i1', name: 'ISA top-up', amount: 100, date, status, rec: 'no', intent: 'new' });
const has = (t, s) => t.indexOf(s) >= 0;

// ───────────────────────────── vocabulary ─────────────────────────────

/** Plan figures described as cash, actual spending or money already there. */
const CASH = /spare[ -]cash|cash left|available cash|room to spend|leftover cash|cash total|cash flow|cash is tight|spare capacity|safe to spend|in your account|in the bank/i;
const SPENDING = /no spending logged|log(ged)? spending|spending saved|you spent|your spending|spending exceeds|from spending/i;
const MOVED = /recorded|completed|paid|money moved|marked complete/i;

// ───────────────────────────── scenarios A–J ─────────────────────────────

function scenarios() {
  group('A–B  Monthly Left is a plan figure', () => {
    const p = page(CALM());
    const exp = expImpact(p, 100);
    check('A.modal', 'A. Positive Monthly Left (£1,450): the expense modal says "Left this month" and "on your plan", never cash',
      [exp, CASH.test(exp)], ['Impact | Left this month: £1450 → £1350 | This lowers left this month on your plan.', false]);
    const small = expImpact(p, 0.2);
    check('A.small', 'A. A tiny expense: "This doesn\u2019t really change what your plan leaves this month." (no "monthly cash total")', [small.indexOf('This doesn\u2019t really change what your plan leaves this month.') >= 0, CASH.test(small)], [true, false]);
    const pay = render(page(EMPTY()), 'rPayments', ['plist']);
    check('A.payments', 'A. Payments empty state: "…to see what your plan leaves after payments." (no cash left after planned outflows)',
      [has(pay, 'No contributions yet. Schedule debt, goals, investments, or bills to see what your plan leaves after payments.'), CASH.test(pay)], [true, false]);
    const neg = page(MLNEG());
    const ob = overBudget(neg);
    check('B.overBudget', 'B. Monthly Left −£500: the over-budget block compares planned outflows with planned income, as a plan statement',
      ob.slice(0, ob.indexOf('Your planned expenses') + 21), 'Over budget | −£500 | Based on what\u2019s entered, your planned payments and expenses come to £500 more than your planned income this month. Goals and debt steps will show once the plan is back in balance. | Your planned expenses');
    check('B.noCashClaim', 'B. No actual cash-flow claim: no cash, losing, overspending, "exceed income" or negative cash flow', /cash|losing|overspen|exceed income|negative/i.test(ob), false);
    check('B.figure', 'B. The plan figure itself is unchanged (−£500)', neg.run('calcMonthlyLeftover(S)'), -500);
    const tile = liveText('rMoney');
    check('B.tile', 'B. Money "Left this month" tile under £0 says "Your plan runs over this month" (not "Below plan this month")',
      [has(tile, "(left < 0 ? '<div data-geode-css=\"font-size:10px;color:var(--danger);margin-top:3px\">Your plan runs over this month</div>' : '')"), /Below plan this month/.test(tile)], [true, false]);
  });

  group('C–D  An expense plan is not actual spending', () => {
    const neg = page(MLNEG());
    check('C.overBudget', 'C. The expense breakdown is "Your planned expenses"', [has(overBudget(neg), 'Your planned expenses'), SPENDING.test(overBudget(neg))], [true, false]);
    const core = nudgeText(nudges(page(CALM({ goals: [] })), 'core'));
    const buffer = core.filter(s => /buffer/i.test(s));
    check('C.buffer', 'C. Buffer estimates come "from your planned expenses", not "from your spending"',
      [buffer.some(s => has(s, 'Based on your planned expenses, a rough buffer is about £1350')), buffer.filter(s => SPENDING.test(s))], [true, []]);
    check('C.progress', 'C. Dashboard progress no longer says expenses are "logged spending"', /log spending|spending/.test(liveText('geodeStageLProgressSignal')), false);
    const ov = render(page(EMPTY()), 'rMoneyOverview');
    check('D.overview', 'D. No expenses: the Money overview says "No expenses planned yet"', [has(ov, 'No expenses planned yet'), SPENDING.test(ov)], [true, false]);
    const ex = render(page(EMPTY()), 'rExpenses', ['elist']);
    check('D.expenses', 'D. No expenses: the Expenses list says "No expenses planned yet. Add a few categories to plan where your money goes."',
      [has(ex, 'No expenses planned yet. Add a few categories to plan where your money goes.'), SPENDING.test(ex)], [true, false]);
  });

  group('E–F  Scheduled is not completed', () => {
    const p = page(CALM());
    p.run('__resetFeedback();');
    p.contribute(GOAL('upcoming', OCT + '-25'));
    const sched = feedback(p);
    check('E.goal', 'E. Scheduling a future goal contribution says "Contribution scheduled."', sched, { acks: ['Contribution scheduled.'], toasts: [], note: '' });
    p.run('__resetFeedback(); __nowMs += 60000;');
    p.contribute(Object.assign(GOAL('upcoming', '2026-11-05'), { name: 'Next month' }));
    check('E.again', 'E. A second scheduled contribution says the same', feedback(p).acks, ['Contribution scheduled.']);
    p.run('__resetFeedback(); __nowMs += 60000;');
    p.contribute(Object.assign(GOAL('overdue', '2026-10-05'), { name: 'To confirm' }));
    check('E.confirm', 'E. A "Needs confirmation" contribution is still a plan: "Contribution scheduled."', feedback(p).acks, ['Contribution scheduled.']);
    check('E.pick', 'E. The picker never implies money moved for a goal or investment row that is not completed',
      [pick(p, 'payment', { goalId: 'gH' }), pick(p, 'payment', { investId: 'i1' })], ['Contribution scheduled.', 'Contribution scheduled.']);
    check('E.planSaves', 'E. Saving an expense, an import, a goal or an investment never says "Recorded"',
      [0, 1, 2].map(seed => ['expense', 'import', 'goal', 'invest'].map(k => pick(p, k, { _seed: seed, added: seed + 1 }))).reduce((a, b) => a.concat(b), []).filter(s => MOVED.test(s)), []);
    const q = page(CALM());
    q.run('__resetFeedback();');
    q.contribute(GOAL('paid', TODAY));
    check('F.goal', 'F. Completing a goal contribution keeps its completion wording', feedback(q).note, 'Goal contribution recorded for this month.');
    q.run('__resetFeedback(); geodeEmitPaymentCompletionFeedback({ id: "x1", status: "paid", investId: "i1", name: "ISA top-up", amount: 100 });');
    check('F.invest', 'F. Completing an investment contribution keeps its completion wording', feedback(q).note, 'Investment contribution recorded for this month.');
    check('F.deposit', 'F. A direct goal deposit still says "Recorded for this month."', pick(q, 'goal_dep', {}), 'Recorded for this month.');
    const save = liveText('geodeSavePayApply'), emit = liveText('geodeEmitPaymentCompletionFeedback');
    check('F.routing', 'F. Every completed save goes to the completion feedback, which announces goal and investment rows itself, so the picker\'s goal branch only sees plans',
      [/if \(st === 'paid' && savedPayRow\) \{\n\s*geodeEmitPaymentCompletionFeedback\(savedPayRow/.test(save), (save.match(/\n\s*savedPayRow = (existing|ex|row);/g) || []).length,
        /if \(kind === 'goal' \|\| kind === 'invest' \|\| kind === 'buffer'\) \{\n\s*geodeHomeNoteRecentCompletion\(kind\);\n\s*return;/.test(emit)], [true, 3, true]);
  });

  group('G–H  A goal target date is a target, not a deadline', () => {
    const lb = (p, d, r, s) => p.run('geodeGoalTargetDateLabel(' + J(d) + ', ' + J(r) + ', ' + J(s) + ')');
    const p = page(CALM());
    check('G.label', 'G. Passed and not reached: "Target date passed" (long and short), never "Overdue"', [lb(p, -3, false, false), lb(p, -3, false, true)], ['Target date passed', 'Target date passed']);
    check('G.other', 'Future and today keep their existing labels', [lb(p, 20, false, false), lb(p, 20, false, true), lb(p, 0, false, false), lb(p, 0, false, true), lb(p, null, false, false)], ['20 days left', '20 days', 'Due today', 'Today', '']);
    const passed = goalsList(page(CALM(goalAt({ targetDate: '2026-09-30' }))));
    check('G.list', 'G. Goals list: a passed date reads "(Target date passed)"', [has(passed, '(Target date passed)'), /overdue/i.test(passed)], [true, false]);
    check('H.label', 'H. Reached: no passed-date or due-today label', [lb(p, -3, true, false), lb(p, -3, true, true), lb(p, 0, true, false), lb(p, 20, true, true)], ['', '', '', '20 days']);
    const reached = goalsList(page(CALM(goalAt({ targetDate: '2026-09-30', saved: 2000, baseSaved: 2000 }))));
    check('H.list', 'H. Goals list: a reached goal with a passed date shows the date with no warning and no amber colour',
      [has(reached, 'Target date passed'), /overdue/i.test(reached), /color:#f5c234;margin-top:2px/.test(reached)], [false, false, false]);
    const reachedRaw = page(CALM(goalAt({ targetDate: '2026-09-30', saved: 2000, baseSaved: 2000 })));
    reachedRaw.run('__hosts.glist = __host(); var __gc = __host(); __hosts.content = __gc; rGoals(__gc);');
    check('H.colour', 'H. The reached goal\'s date line is not amber', /color:#f5c234;margin-top:2px/.test(reachedRaw.run('__hosts.glist.children.map(function (c) { return c.innerHTML; }).join("")')), false);
    const homeSite = liveText('rHome');
    check('G.home', 'G/H. Home focus goal badge uses the same label with "reached" from effective saved vs target, and no "Overdue"',
      [/geodeGoalTargetDateLabel\(dLeft, Number\(g\.amount\) > 0 && gEffH >= Number\(g\.amount\), false\)/.test(homeSite), /'Overdue'/.test(homeSite)], [true, false]);
    check('G.calc', 'No goal calculation changed (intelligence, effective saved, days left)',
      ['calcGoalIntelligence', 'geodeGoalEffectiveSaved', 'dl', 'ml', 'selectMostOffTrackGoal'].filter(n => cm.extractFunction(OLD, n).text !== fnText(n)), []);
  });

  group('I–J  Reality and receipts leave plan copy alone', () => {
    const plain = page(CALM()), real = page(CALM(RC(120)));
    check('I.guidance', 'I. A £120 balance still gives the accepted P3-6R guidance for a £300 step ("check", balance below step)',
      json(real, 'geodeRealityActionGuidance(300)'), { level: 'check', reasons: ['balance_below_step'], balanceAmount: 120, balanceDate: at(TODAY, 9), balanceDay: '12 Oct', balanceStale: false });
    check('I.plan', 'I. Plan figures and plan copy are identical with and without the balance',
      [measure(real), expImpact(real, 100), overBudget(page(MLNEG(RC(120)))), nudges(real, 'intent')],
      [measure(plain), expImpact(plain, 100), overBudget(page(MLNEG())), nudges(plain, 'intent')]);
    const withR = page(CALM({ incomeReceipts: [RECEIPT('inc1', 3000)] }));
    check('J.receipts', 'J. A recorded receipt changes no plan figure and no plan copy', [measure(withR), expImpact(withR, 100), nudges(withR, 'intent')], [measure(plain), expImpact(plain, 100), nudges(plain, 'intent')]);
    const negR = page(MLNEG({ incomeReceipts: [RECEIPT('inc1', 3000)] }));
    check('J.negative', 'J. With or without receipts the over-budget block is the same plan statement', overBudget(negR), overBudget(page(MLNEG())));
  });
}

// ───────────────────────────── live copy ─────────────────────────────

function liveCopy() {
  group('Copy  Nudges, Plan steps and modals read as plan', () => {
    const intent = nudges(page(PRIMARY(CALM())), 'intent');
    const gap = intent.filter(n => n.topic === 'priority_goal_gap')[0] || {};
    check('N.room', 'Plan room nudge: "Your plan still has room this month, …" with plan-labelled variants',
      [gap.message, gap.variants], ['Your plan still has room this month, but your focus goal "Holiday" has not been funded recently.', [
        'Your plan still has room this month, but your focus goal "Holiday" has not been funded recently.',
        'Your plan has some room this month, and your focus goal "Holiday" has not had a contribution lately.',
        'There\u2019s room in your plan this month, but your focus goal "Holiday" has not had any funds lately.']]);
    const up = nudges(page(CALM({ activityLog: [{ type: 'income', ts: at('2026-10-10', 9), delta: 200, amount: 3200 }] })), 'intent').filter(n => n.topic === 'income_allocation_gap')[0] || {};
    check('N.income', 'Planned income edit: "New room in your plan" and "Your planned income went up, …" (not "Your income has increased")',
      [up.title, up.message, up.variants], ['New room in your plan', 'Your plan has more room this month, but it isn\u2019t going toward debt, goals, or investing yet.', [
        'Your plan has more room this month, but it isn\u2019t going toward debt, goals, or investing yet.',
        'Your planned income went up, but the extra room isn\u2019t going toward debt, goals, or investing yet.',
        'Your plan has more room since your income changed, but it isn\u2019t set aside for debt, goals, or investing yet.']]);
    const tightP = page(PRIMARY(MLNEG(Object.assign(goalAt({ targetDate: '2026-11-30' }), { activityLog: [{ type: 'goal', ts: at('2026-10-10', 9), delta: 50, goalId: 'gH' }] }))));
    const tightIntent = nudges(tightP, 'intent').filter(n => n.topic === 'goal_budget_tension')[0] || {};
    check('N.tight', 'Tight plan: "You\u2019re funding a non-essential goal while your plan is tight. …"', tightIntent.message,
      'You\u2019re funding a non-essential goal while your plan is tight. Steadying the basics first may make progress easier to keep up.');
    const behind = nudges(tightP, 'core').filter(n => n.topic === 'goals_behind')[0] || {};
    check('N.steadier', 'Tight plan, primary goal behind: "Holiday still matters. Once your plan has a bit more room, even small adds help."', behind.message,
      'Holiday still matters. Once your plan has a bit more room, even small adds help.');
    const all = [].concat(nudgeText(intent), nudgeText(nudges(page(PRIMARY(CALM())), 'core')), [up.title, up.message].concat(up.variants || []), nudgeText(nudges(tightP, 'intent')), nudgeText(nudges(tightP, 'core')));
    check('N.vocab', 'No nudge in these plans calls plan room cash, capacity or spending', all.filter(s => CASH.test(s) || SPENDING.test(s) || /income has increased/i.test(s)), []);
    const edited = [gap.message, tightIntent.message, behind.message, up.title, up.message].concat(gap.variants || [], up.variants || []);
    check('N.emDash', 'The edited nudges, as shown, contain no em dash', [edited.length, edited.filter(s => !s || EM_DASH.test(s))], [11, []]);

    const p = page(CALM());
    const buf = ['NO_BUFFER_CONTEXT', 'BUFFER_IN_PROGRESS_ESTIMATED', 'BUFFER_ESTIMATABLE'].map(st => {
      p.run('geodeGetBufferReadinessState = function () { return ' + J(st) + '; };');
      return json(p, 'geodePlanBufferStepDisplay({ label: "Build your emergency fund", amount: 120 })');
    });
    check('P.buffer', 'Plan buffer step: the suggestion comes from "your plan", never "spare cash"',
      buf.map(b => [b.explainLine, b.amountCaption]), [
        ['Add monthly expenses first so Beynd can estimate a realistic buffer. For now, your plan suggests £120 this month. It isn\u2019t a fully sized target yet.', 'From your plan (not a sized target yet)'],
        ['Based on your monthly expenses (~£1350 for about 3 months). You\u2019ve already started building this buffer. Suggested by your plan this month: £120.', 'based on monthly expenses'],
        ['Based on your monthly expenses (~£1350 for about 3 months). Suggested by your plan this month: £120.', 'based on monthly expenses']]);
    const modalText = [
      modal(p, 'geodeGoalModalImpactRefresh', 'geode-goal-impact-host', { ga: '2000', gn: 'Car', gd: '' }),
      modal(p, 'geodeInvModalImpactRefresh', 'geode-inv-impact-host', { xb: '500' }),
      p.run('geodeCoachingLineForDelta(-20, "goal").line')
    ];
    check('P.modals', 'Goal, investment and linked-payment lines talk about the monthly plan, not monthly cash flow', [
      has(modalText[0], 'Doesn\u2019t change your monthly plan until you schedule a contribution.'), has(modalText[1], 'Regular contributions are what show up in your monthly plan.'),
      modalText[2], modalText.filter(s => CASH.test(s))], [true, true, 'Link a payment when you want this to count in your monthly plan.', []]);
  });

  group('Static  Live paths, classified', () => {
    const live = {
      geodePlanPageStepTitle: ['Invest what your plan leaves'], geodePlanPageOneLineExplain: ['Suggested by your plan this month.'],
      geodePlanPageInvestPriorityBodyHtml: ['After the basics, investing puts what your plan leaves to work.', 'This is optional guidance from your plan, not a commitment.'],
      geodePlanPageGenericPriorityBodyHtml: [], geodePlanStepDetailPageHtml: ['your debt-focused plan points its spare room at this balance.', 'This is a prompt to review what your plan leaves, not a recommendation to buy an investment.', 'This is optional guidance from your plan. Beynd uses what you entered, not a forecast.'],
      geodePlanPageHowPlanWorksSectionHtml: ['Growth style tilts what your plan leaves toward goals', 'Balanced style spreads what your plan leaves across', 'Rough split of what your plan leaves with this style'],
      geodePlanDetailSummaryContinuityLine: ['Optional once your plan has room this month.', 'Optional guidance from your plan this month.'],
      rPlan: ['to see how Beynd would split what your plan leaves.', 'Not enough room in your plan or data yet to build steps this month.'],
      geodePlanPageStatusSectionHtml: ['Your plan doesn\\u2019t leave much to split right now. The order below shows where things go once there\\u2019s room.'],
      openPlanStrategyModal: ['Tilts what your plan leaves toward paying balances down faster.'], geodeChooseHomePrimary: ['rather than splitting plan room.'],
      geodeMaybeAppendNudgeWit: [' Room in a plan works best with a job to do.'], geodePlanInvestStepDisplay: ['Already investing. Use plan room carefully'],
      geodeBufferActionCopy: ['Estimated from your planned expenses. Keep the momentum.'],
      getCoreNudges: ['Money with a job to do tends to go further than money still waiting on a decision.']
    };
    const names = Object.keys(live).filter(n => { try { fnText(n); return true; } catch (e) { return false; } });
    check('S.present', 'Each corrected live string is in its live function', names.map(n => [n, live[n].filter(s => !has(liveText(n), s))]).filter(x => x[1].length), []);
    // Every function except the dead ones: the bank-intelligence card (its data is always null), Quick Setup finish and
    // its one-off post-setup card inside rHome (only geodeQuickSetupFinish sets the flag), and legacy renderMonthPlan.
    const DEAD = ['geodeIntelBuildCardHtml', 'geodeIntelApplyBankEstimate', 'renderMonthPlan', 'geodeQuickSetupFinish'];
    const all = (SRC.match(/\nfunction [A-Za-z_$][\w$]*\(/g) || []).map(s => s.slice(10, -1));
    const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/[^:'"]\/\/[^'"\n]*$/gm, '');
    const POSTQS = /if \(sessionStorage\.getItem\('geode_qs_just_finished'\) === '1'\) \{[\s\S]*?\n {6}\} else \{/;
    const scan = re => all.filter(n => DEAD.indexOf(n) < 0).map(n => {
      let t; try { t = strip(liveText(n)); } catch (e) { return null; }
      if (n === 'rHome') t = t.replace(POSTQS, '');
      const lits = t.match(/'(?:[^'\\\n]|\\.)*'/g) || [];
      const hits = lits.filter(l => re.test(l));
      return hits.length ? [n, hits] : null;
    }).filter(Boolean);
    const DEFERRED = [['geodeApplyInvestmentBehaviourToSuggestedActions', ["'Balance new contributions with debt and buffer priorities when cash is tight.'"]]];
    check('S.cash', 'Live search: no plan figure called spare cash, cash left, available cash, room to spend, spare capacity, cash total or monthly cash flow (one deferred geode-pure mirror)',
      scan(/spare[ -]cash|cash left|available cash|room to spend|spare capacity|leftover cash|cash total|monthly cash flow|affect cash flow|cash flow is steadier|cash is tight/i), DEFERRED);
    check('S.spending', 'Live search: no expense plan called logged or actual spending', scan(/no spending logged|log spending|spending saved|spending exceeds|from spending|Estimated from your spending|spending breakdown/i), []);
    check('S.income', 'Live search: no "Your income has increased" and no "Below plan this month" or "exceed income"', scan(/income has increased|Below plan this month|exceed income/i), []);
    check('S.overdue', 'Live search: no goal or row is labelled "Overdue" to the user', scan(/^'Overdue'$|\(Overdue\)/), []);
    check('S.postQs', 'The post-setup card it skips is the dead one', [POSTQS.test(fnText('rHome')), (SRC.match(/setItem\('geode_qs_just_finished'/g) || []).length, /\ngeodeQuickSetupFinish\(|[^\w]geodeQuickSetupFinish\(\)/.test(SRC.replace(/\nfunction geodeQuickSetupFinish\(\)/, ''))], [true, 1, false]);
    check('S.deadIntel', 'The bank-intelligence card is dead: its data is only ever null', [(SRC.match(/_geodeIntelData\s*=(?!=)/g) || []).length, /_geodeIntelData\s*=\s*null;\}/.test(fnText('loadGeodeIntelligence')), /if \(!data\) return '';/.test(fnText('geodeIntelBuildCardHtml'))], [2, true, true]);
  });

  group('Copy  Natural, short, no em dash', () => {
    const changed = [];
    const oldLines = new Set(OLD.split('\n'));
    SRC.split('\n').forEach(l => { if (!oldLines.has(l)) changed.push(l); });
    const strings = changed.map(l => l.match(/'(?:[^'\\\n]|\\.)*'/g) || []).reduce((a, b) => a.concat(b), []).filter(s => /[a-z] [a-z]/i.test(s));
    check('C.emDash', 'No em dash in any new or edited line', changed.filter(l => EM_DASH.test(l) || /\\u2014/.test(l)), []);
    check('C.internal', 'No internal terms in new copy (posture, multiplier, floor, planRoom, suggestable, ledger, S.expenses)', strings.filter(s => /posture|multiplier|\bfloor\b|planRoom|suggestable|ledger|S\.expenses/i.test(s)), []);
    check('C.count', 'The edited copy was found (guards the scan)', strings.length >= 40, true);
  });
}

// ───────────────────────────── invariants ─────────────────────────────

function invariants() {
  group('Inv  Financial, Reality and strategy invariants', () => {
    const FINANCIAL = ['calcMonthlyLeftover', 'sumExpensesMonthly', 'sumPaymentsMonthlyOutflow', 'computeAffordabilityContext', 'getMonthPlan',
      'geodeStage62BreathingRoomFloor', 'geodeStage62RealityAdjustment', 'geodeGetContextPosture', 'geodeFinancialMemoryPlanModifiers',
      'assessPressure', 'togglePay', 'geodeRecomputeBalancesFromPayments', 'geodePaymentBalanceEffect', 'geodeRecordContributionTransition',
      'geodeRecordDebtPaymentTransition', 'geodeContributionLedger', 'geodeIncomeReceiptLedger', 'geodeLivingMonthComponents', 'geodeLivingMonthChanges',
      'geodeMonthBaselineCapture', 'geodeApplySavingsRelease', 'geodeRealityStatus', 'rebalanceSuggestedActions', 'getPriorityRebalanceContext',
      'geodeGetMainAction', 'geodePlanDetailActionForStep', 'openPayModal', 'evaluatePaymentFollowthrough', 'geodeActivityPaymentCompleted',
      'e5PaymentsLinkedSince', 'geodeLatestActionKind', 'geodeRunAffordGatedAction', 'geodeAffordGateBuildForPlanMoneyAction',
      'geodeRealityActionGuidance', 'geodeRealityActionTimingLine', 'geodeHomePlanFitLine', 'geodeBuildCoachingContext', 'getFinancialContext',
      'getIntentSignals', 'calcGoalIntelligence', 'geodeGoalEffectiveSaved', 'geodeHomeNoteRecentCompletion', 'geodeHomeMainActionHtml',
      'geodeSavePayApply', 'geodeEmitPaymentCompletionFeedback'];
    check('V.identical', 'Monthly Left, plans, payments, debts, goals, investments, ledgers, baseline, P3-4 changes, the plan, its order, the main action, Reality guidance, Ask and the evidence readers are byte-identical to P3-6R (' + BEFORE_REF + ')',
      FINANCIAL.filter(n => cm.extractFunction(OLD, n).text !== fnText(n)), []);
    const version = s => [(s.match(/\nvar BEYND_RUNTIME_VERSION = '([^']+)';/) || [])[1], (s.match(/\nvar GEODE_SCHEMA_VERSION = (\d+);/) || [])[1]];
    check('V.version', 'No schema bump; the runtime moves only with the P3-REL release (v1.0.79)', version(SRC), ['v1.0.79', version(OLD)[1]]);
    const states = [CALM(), MLNEG(), CALM(RC(120)), CALM(goalAt({ targetDate: '2026-09-30', saved: 2000, baseSaved: 2000 }))];
    check('V.copyOnly', 'Rendering every copy surface writes nothing to the plan (figures identical before and after)',
      states.map(s => { const p = page(s); const b = measure(p); expImpact(p, 100); overBudget(p); goalsList(p); render(p, 'rPayments', ['plist']); nudges(p, 'core'); nudges(p, 'intent'); return canon(measure(p)) === canon(b); }), [true, true, true, true]);
  });

  group('Static  Harness', () => {
    check('S.harness', 'The probe program extracted the production functions (none shimmed)', ENTRIES.filter(n => program().names.indexOf(n) < 0), []);
  });
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'Monthly Left becomes "cash left"': { m: [['geodeExpModalImpactRefresh', [["var line1 = hasChange ? 'Left this month: '", "var line1 = hasChange ? 'Cash left this month: '"]]]], run: [scenarios] },
  'plan room becomes "spare cash"': { m: [['geodePlanBufferStepDisplay', [["For now, your plan suggests ' +", "A provisional slice from spare cash this month is ' +"]]]], run: [liveCopy] },
  'expense plan becomes actual spending': { m: [['geodeOverBudgetPlanBlockHtml', [['Your planned expenses</div>', 'Your spending breakdown</div>']]]], run: [scenarios] },
  'empty expenses says no spending logged': { m: [['rMoneyOverview', [['No expenses planned yet</div>', 'No spending logged</div>']]]], run: [scenarios] },
  'future contribution says recorded': { m: [['geodeMicroConfirmPickMessage', [["if (extras.goalId || extras.investId) return 'Contribution scheduled.';", "if (extras.goalId || extras.investId) return 'Recorded for this month.';"]]]], run: [scenarios] },
  'completed loses completion semantics': { m: [['geodeHomeNoteRecentCompletion', [["else if (kind === 'goal') msg = 'Goal contribution recorded for this month.';", "else if (kind === 'goal') msg = 'Goal contribution scheduled.';"]]]], run: [scenarios] },
  'passed goal target becomes overdue': { m: [['geodeGoalTargetDateLabel', [["  return 'Target date passed';", "  return 'Overdue';"]]]], run: [scenarios] },
  'reached goal still gets the warning': { m: [['geodeGoalTargetDateLabel', [["  if (reached) return '';\n", '']]]], run: [scenarios] },
  'negative plan becomes an actual negative cash-flow claim': { m: [['geodeOverBudgetPlanBlockHtml', [["'Based on what\\u2019s entered, your planned payments and expenses come to ' + fm(over) + ' more than your planned income this month. '", "'Your cash flow is negative by ' + fm(over) + ' this month. '"]]]], run: [scenarios] },
  'an edited sentence gains an em dash': { m: [['getIntentAwareNudges', [["while your plan is tight. Steadying the basics first", "while your plan is tight \\u2014 steadying the basics first"]]]], run: [liveCopy] }
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
  scenarios();
  liveCopy();
  invariants();
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
