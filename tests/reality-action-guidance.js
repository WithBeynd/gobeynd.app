#!/usr/bin/env node
/**
 * P3-6R Reality-aware action guidance: the plan says what a step is, Reality may say when to act on it.
 *
 * Runs the production Reality qualifier (geodeRealityActionGuidance), the shared check before scheduling
 * (geodeAffordGateBuildForPlanMoneyAction → geodeRunAffordGatedAction → geodeOpenAffordabilityGateModal), the Home main
 * action (geodeGetMainAction, geodeHomeMainActionHtml), the Ask Beynd context (geodeBuildCoachingContext) and the plan
 * chain from index.html inside the cross-month harness's simulated app (tests/month-baseline.js pageOver).
 *
 * Checks: the authority levels (plan / timing guidance / never current affordability), scenarios A–K, the check's
 * behaviour, Home, Ask, copy, financial and strategy invariance, the P3-6D evidence rule, and a mutant per rule.
 *
 * Run: node tests/reality-action-guidance.js
 */
'use strict';

const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const ROOT = path.resolve(__dirname, '..');
const SRC = cm.readSource(cm.INDEX_HTML);
const BEFORE_REF = '404012f';
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
/**
 * tests/reality-decoupling.js WIDE with nothing past its date: Monthly Left £1,390, a 22% card, a Holiday goal and the
 * balanced style. The Home main action is the card's extra payment (£348).
 */
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
/** A balance entered on `iso` (default today, 12 Oct): 1 Oct is 11 days old, past the existing 7-day rule. */
const RC = (amount, iso) => ({ realityCheck: { amount, ym: OCT, date: at(iso || TODAY, 9) } });
const MC = o => ({ monthContext: Object.assign({ ym: OCT, protect: '', worried: '', success: '', updatedAt: at(TODAY, 9), dismissedYm: '' }, o) });
const RECEIPT = (id, amount) => ({ id, eventType: 'receipt', amount, ym: OCT, recordedAt: at('2026-10-10', 9), source: 'manual' });
const GOAL = (status, date) => ({ goalId: 'gH', name: 'Toward Holiday', amount: 100, date, status, rec: 'no', intent: 'new' });

// ───────────────────────────── program ─────────────────────────────

const PRELUDE = [
  'var __html = null;',
  'function openModal(h) { __html = String(h); }',
  'function removeModalDom() { __html = null; }',
  'function closeModal() { __html = null; }',
  'function mh(t) { return "<div class=\\"mh\\">" + t + "</div>"; }'
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
  'geodeRealityActionGuidance', 'geodeRealityActionTimingLine', 'geodeHomePlanFitLine', 'geodeAffordGateBuildForPlanMoneyAction',
  'geodeRunAffordGatedAction', 'geodeOpenAffordabilityGateModal', 'geodeAffordGateYes', 'geodeAffordGateNotSure', 'geodeAffordGatePause',
  'geodeHomeMainActionHtml', 'geodeGetMainAction', 'geodeBuildCoachingContext', 'getMonthPlan', 'computeAffordabilityContext',
  'calcMonthlyLeftover', 'geodeGetContextPosture', 'geodeFinancialMemoryPlanModifiers', 'geodeRealityStatus', 'geodeIncomeReceiptLedger',
  'geodeActivityPaymentCompleted', 'geodeLatestActionKind', 'geodeGetLatestActivity'
];

const MEASURE = `
function __text(h) { return String(h || '').replace(/<[^>]*>/g, ' | ').replace(/&#39;|&#x27;/g, "'").replace(/\\s*\\|\\s*(\\|\\s*)*/g, ' | ').replace(/^\\s*\\|\\s*|\\s*\\|\\s*$/g, '').trim(); }
function __measure() {
  var a = computeAffordabilityContext(S);
  var plan = getMonthPlan();
  var post = geodeGetContextPosture(S);
  var mods = geodeFinancialMemoryPlanModifiers(S, a, null);
  var main = geodeGetMainAction(S);
  return JSON.stringify({
    ml: calcMonthlyLeftover(S), planRoom: a.planRoom, floor: a.breathingRoomFloor, room: a.suggestableRoom,
    multiplier: a.realityAdjustment ? a.realityAdjustment.postureMultiplier : null,
    steps: plan.steps.map(function (s) { return [s.label, s.amount, s.priority]; }),
    posture: post.posture, mods: [mods.debtExtraMultiplier, mods.goalRecoveryMultiplier, mods.investmentMultiplier, mods.reasonCodes],
    main: main ? [main.title, main.amount, main.cta] : null
  });
}
function __gate(amount) {
  var g = geodeAffordGateBuildForPlanMoneyAction(amount, 'Schedule contribution', 'goal');
  __html = null; window._geodeAffordGatePending = null;
  sessionStorage.removeItem('geode_aff_ok_' + g.sig); sessionStorage.removeItem('geode_aff_pause_' + g.sig);
  var ran = 0;
  geodeRunAffordGatedAction(function () { ran++; }, g);
  var html = __html || '';
  var buttons = (html.match(/<button[^>]*>[^<]*<\\/button>/g) || []).map(__text);
  geodeAffordGateYes();
  var yes = { ran: ran, ok: sessionStorage.getItem('geode_aff_ok_' + g.sig), open: __html !== null };
  sessionStorage.removeItem('geode_aff_ok_' + g.sig);
  geodeRunAffordGatedAction(function () { ran++; }, g);
  geodeAffordGateNotSure();
  var notSure = { ran: ran, open: __html !== null };
  return JSON.stringify({ guidance: g.guidance, amount: g.amount, sig: g.sig, text: __text(html), buttons: buttons, behaviour: [yes, notSure] });
}
function __home() {
  var t = __text(geodeHomeMainActionHtml(false));
  var g = window._geodeMainActionGate;
  return JSON.stringify({ text: t, amount: g ? g.amount : null, guidance: g ? g.guidance : null });
}
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
  PROGRAM = { script: new vm.Script(PRELUDE + '\n' + globals.join('\n') + '\n' + code + '\n' + MEASURE, { filename: 'reality-action-guidance-program' }), names: [...have.keys()] };
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
function page(state, feeling) {
  const p = mb.pageOver(J(state), TODAY);
  program().script.runInContext(p.ctx);
  if (MUT) MUT.forEach(([n, pairs]) => p.run(mutantText(n, pairs)));
  if (feeling) p.run('sessionStorage.setItem("geode_reality_feeling", ' + J(feeling) + ');');
  return p;
}
const json = (p, expr) => { const t = p.run('JSON.stringify(' + expr + ')'); return t === undefined ? undefined : JSON.parse(t); };
const measure = p => JSON.parse(p.run('__measure()'));
const gateOf = (p, amount) => JSON.parse(p.run('__gate(' + J(amount) + ')'));
const homeOf = p => JSON.parse(p.run('__home()'));
const askOf = p => String(p.run('geodeBuildCoachingContext()'));
const look = (state, feeling, amount) => gateOf(page(state, feeling), amount === undefined ? 300 : amount);

// ───────────────────────────── vocabulary ─────────────────────────────

/** Level 3 and the retired Reality shift: nothing Beynd may say from a typed-in balance. */
const CLAIMS = /safe to spend|you can afford|can(\u2019|')t afford|cannot afford|insufficient funds|you(\u2019|')re short|\bshort by\b|behind by|reality gap|\bgap\b|\baligned\b|understated|overstated|shortfall|difference|no money|available|all (of )?your money|right now you have/i;
const NONE = { level: 'none', reasons: [], balanceAmount: null, balanceDate: 0, balanceDay: '', balanceStale: false };
const NORMAL_GATE = 'Before you schedule | £300 fits your plan for this month. Take a moment to see if it still feels right. | This step comes from your monthly plan, not your bank. | You can still edit the amount before saving.';
const has = (t, s) => t.indexOf(s) >= 0;

// ───────────────────────────── authority levels ─────────────────────────────

function levels() {
  group('Levels  Plan, timing guidance, never current affordability', () => {
    const plain = look(CALM());
    check('L1.plan', 'Level 1: with no Reality signal the check says the step fits the monthly plan (and where it comes from), nothing about today',
      [plain.guidance, plain.text.indexOf(NORMAL_GATE) === 0], [NONE, true]);
    const low = look(CALM(RC(120)));
    check('L2.timing', 'Level 2: a Reality signal adds one timing sentence and keeps "fits your plan"',
      [low.guidance.level, has(low.text, '£300 still fits your plan for this month.'), has(low.text, 'it\u2019s worth checking the timing before you schedule this.'), has(low.text, 'This step comes from your monthly plan, not your bank.')],
      ['check', true, true, true]);
    const texts = ['none', 'low', 'zero', 'stale', 'slow', 'unsure', 'moved', 'worried'].map(k => ({
      none: plain, low, zero: look(CALM(RC(0))), stale: look(CALM(RC(120, '2026-10-01'))), slow: look(CALM(), 'slow'), unsure: look(CALM(), 'unsure'),
      moved: look(CALM(), 'moved'), worried: look(CALM(MC({ worried: 'Car repair' })))
    }[k].text));
    check('L3.never', 'Level 3 never: no check says the step is affordable, safe to spend, short, behind, a gap or a difference', texts.filter(t => CLAIMS.test(t)), []);
  });
}

// ───────────────────────────── scenarios A–K ─────────────────────────────

function scenarios() {
  group('A–C  Plan step £300 with and without a balance', () => {
    const base = measure(page(CALM()));
    const A = look(CALM());
    check('A.normal', 'A. No Reality signals: the normal check, unchanged copy, no qualifier', [A.guidance, A.text, A.amount], [NONE, NORMAL_GATE + ' | Continue with this amount | Not sure yet | No, pause this for now', 300]);
    const still = look(CALM(), 'still');
    check('A.still', 'A. "Still on track" alone manufactures no caution: identical to no signal', [still.guidance, still.text], [A.guidance, A.text]);
    const B = look(CALM(RC(120)), 'still');
    check('B.qualifier', 'B. Fresh £120, still on track: qualifier "check" for the balance alone, dated 12 Oct, never stale',
      B.guidance, { level: 'check', reasons: ['balance_below_step'], balanceAmount: 120, balanceDate: at(TODAY, 9), balanceDay: '12 Oct', balanceStale: false });
    check('B.copy', 'B. "£300 still fits your plan for this month. The balance you noted on 12 Oct was £120, so it\u2019s worth checking the timing before you schedule this."',
      has(B.text, '£300 still fits your plan for this month. | The balance you noted on 12 Oct was £120, so it\u2019s worth checking the timing before you schedule this.'), true);
    check('B.amount', 'B. The amount stays £300 and the plan is unchanged (steps, room, floor, Monthly Left, main action)', [B.amount, measure(page(CALM(RC(120)), 'still'))], [300, base]);
    check('B.noClaim', 'B. No shortage or affordability claim and no calculated difference (£180 never appears)', [CLAIMS.test(B.text), /£180\b/.test(B.text)], [false, false]);
    check('B.later', 'B. The check offers a later date instead of implying today', has(B.text, 'You can change the amount or pick a later date before saving.'), true);
    const C = look(CALM(RC(500)), 'still');
    check('C.enough', 'C. Fresh £500 against £300: no balance caution, the normal check', [C.guidance, C.text], [NONE, A.text]);
    check('C.equal', 'C. A balance equal to the step is not "larger than the balance": no caution', look(CALM(RC(300))).guidance, NONE);
  });

  group('D–E  Feeling and month context shape wording, not a second reduction', () => {
    const slowM = measure(page(CALM(), 'slow'));
    const D = look(CALM(), 'slow');
    check('D.strategy', 'D. "Slow down" already softens the plan through the existing strategy (review_first, room ×0.62)', [slowM.posture, slowM.multiplier], ['review_first', 0.62]);
    check('D.qualifier', 'D. No balance, slow down: "soft", the feeling only, no balance fields', D.guidance, Object.assign({}, NONE, { level: 'soft', reasons: ['feeling_slow'] }));
    check('D.copy', 'D. "There\u2019s no need to do this today if you\u2019d rather take it slower." and no balance claim',
      [has(D.text, 'There\u2019s no need to do this today if you\u2019d rather take it slower.'), /balance/i.test(D.text), D.amount], [true, false, 300]);
    const E = page(CALM(Object.assign(RC(120), MC({ worried: 'Car repair' }))), 'slow');
    const Em = measure(E), Eg = gateOf(E, 300);
    const sameNoBalance = measure(page(CALM(MC({ worried: 'Car repair' })), 'slow'));
    check('E.qualifier', 'E. Fresh £120, slow down, worried: "check" with every reason, balance first',
      [Eg.guidance.level, Eg.guidance.reasons], ['check', ['balance_below_step', 'feeling_slow', 'month_worried']]);
    check('E.strategyOnly', 'E. The plan comes only from the existing strategy: identical to the same feeling and context with no balance', Em, sameNoBalance);
    check('E.noSecond', 'E. Reality adds no second reduction: the check keeps the amount it was given and Home keeps the plan amount',
      [Eg.amount, homeOf(E).amount === sameNoBalance.main[1]], [300, true]);
    check('E.oneLine', 'E. One timing sentence (the balance), not one per reason', [has(Eg.text, 'The balance you noted on 12 Oct was £120'), has(Eg.text, 'take it slower'), has(Eg.text, 'keeping an eye on')], [true, false, false]);
    const others = [['unsure', look(CALM(), 'unsure')], ['moved', look(CALM(), 'moved')], ['protect', look(CALM(MC({ protect: 'Rent' })))], ['success', look(CALM(MC({ success: 'Calm month' })))]];
    check('E.otherSignals', 'Not sure, things moved and protect give their own light line; "success would feel like" adds nothing',
      others.map(([k, g]) => [k, g.guidance.level, g.guidance.reasons, (g.text.match(/\| ([^|]*(timing|date|rush)[^|]*) \|/) || [])[1] || '']),
      [['unsure', 'soft', ['feeling_unsure'], 'If you\u2019re not sure, it\u2019s fine to check the timing before you schedule it.'],
        ['moved', 'soft', ['feeling_moved'], 'Things have shifted a bit, so pick a date that works for you.'],
        ['protect', 'soft', ['month_protect'], 'With what you\u2019re keeping an eye on this month, there\u2019s no rush to do this today.'],
        ['success', 'none', [], '']]);
    check('E.lastMonth', 'Last month\'s context is not this month\'s', look(Object.assign(CALM(), { monthContext: { ym: '2026-09', protect: 'Rent', worried: 'Car', success: '', updatedAt: at('2026-09-20', 9), dismissedYm: '' } })).guidance, NONE);
  });

  group('F–H  Stale, zero and missing balances', () => {
    const F = look(CALM(RC(120, '2026-10-01')));
    check('F.stale', 'F. £120 from 1 Oct (11 days): "soft", marked stale, never "check"', [F.guidance.level, F.guidance.reasons, F.guidance.balanceStale, F.guidance.balanceDay], ['soft', ['stale_balance_below_step'], true, '1 Oct']);
    check('F.copy', 'F. "The last balance you noted was on 1 Oct, so a quick timing check may help." The old amount is not shown as current',
      [has(F.text, 'The last balance you noted was on 1 Oct, so a quick timing check may help.'), /£120/.test(F.text), /latest|current|today\u2019s balance/i.test(F.text)], [true, false, false]);
    check('F.edge', 'Exactly 7 days old is still fresh (existing rule: stale after 7 days)', look(CALM(RC(120, '2026-10-05'))).guidance.level, 'check');
    const G = look(CALM(RC(0)));
    check('G.zero', 'G. An explicit £0 is evidence: "check", balance £0', [G.guidance.level, G.guidance.balanceAmount], ['check', 0]);
    check('G.copy', 'G. "The balance you noted on 12 Oct was £0, …" and never "no money"', [has(G.text, 'The balance you noted on 12 Oct was £0, so it\u2019s worth checking the timing before you schedule this.'), /no money|nothing left|empty/i.test(G.text)], [true, false]);
    const H = look(CALM());
    check('H.missing', 'H. No balance is not £0: no balance reason, no balance fields', [H.guidance.balanceAmount, H.guidance.reasons], [null, []]);
    check('H.lastMonth', 'A September balance is not this month\'s: treated as missing', look(Object.assign(CALM(), { realityCheck: { amount: 50, ym: '2026-09', date: at('2026-09-28', 9) } })).guidance, NONE);
    check('H.noAmount', 'No proposed amount (or £0) gives no qualifier at all', [json(page(CALM(RC(0))), 'geodeRealityActionGuidance(0)'), json(page(CALM(RC(0))), 'geodeRealityActionGuidance(null)')], [NONE, NONE]);
  });

  group('I–K  Income type, receipts and a plan that is over', () => {
    const irr = { incomeType: 'irregular', incomeTypeUserSet: true };
    const stableG = look(CALM(RC(120)), 'slow').guidance, irrG = look(CALM(Object.assign({}, irr, RC(120))), 'slow').guidance;
    check('I.same', 'I. Irregular income: the same Reality inputs give the same qualifier (income type stays with the existing strategy)', irrG, stableG);
    check('I.strategy', 'I. The irregular plan is untouched by the balance', measure(page(CALM(Object.assign({}, irr, RC(120))))), measure(page(CALM(irr))));
    check('I.static', 'I. The qualifier reads no income type', /incomeType|income/i.test(fnText('geodeRealityActionGuidance').replace(/^\/\*\*[\s\S]*?\*\//, '')), false);
    const withR = page(CALM(Object.assign({ incomeReceipts: [RECEIPT('inc1', 3000)] }, RC(120))));
    check('J.receipts', 'J. A full receipt changes neither the qualifier nor the plan', [gateOf(withR, 300).guidance, measure(withR)], [look(CALM(RC(120))).guidance, measure(page(CALM(RC(120))))]);
    check('J.static', 'J. The qualifier and its wording read no receipts', ['geodeRealityActionGuidance', 'geodeRealityActionTimingLine', 'geodeHomePlanFitLine'].filter(n => /incomeReceipts|geodeIncomeReceipt/.test(fnText(n))), []);
    const neg = page(MLNEG());
    const Kg = gateOf(neg, 300), Kh = homeOf(neg);
    check('K.plan', 'K. Monthly Left −£500 stays a plan figure; no Reality signal means no qualifier and no cash verdict',
      [neg.run('calcMonthlyLeftover(S)'), Kg.guidance, /cash|can(\u2019|')t afford|short/i.test(Kg.text + ' ' + Kh.text)], [-500, NONE, false]);
    check('K.withBalance', 'K. With a £120 balance the plan figure is the same and the only addition is the timing sentence', [page(MLNEG(RC(120))).run('calcMonthlyLeftover(S)'), CLAIMS.test(gateOf(page(MLNEG(RC(120))), 300).text)], [-500, false]);
  });
}

// ───────────────────────────── the check before scheduling ─────────────────────────────

function gateBehaviour() {
  group('Gate  The check works the same; only its wording reads Reality', () => {
    const variants = { none: look(CALM()), low: look(CALM(RC(120))), zero: look(CALM(RC(0))), stale: look(CALM(RC(120, '2026-10-01'))), high: look(CALM(RC(5000))), slow: look(CALM(), 'slow') };
    const ref = variants.none;
    check('O.behaviour', 'Continue, Not sure yet and the remembered OK behave identically for every balance and feeling', Object.keys(variants).filter(k => canon(variants[k].behaviour) !== canon(ref.behaviour)), []);
    check('O.buttons', 'Same three choices everywhere', Object.keys(variants).filter(k => canon(variants[k].buttons) !== canon(ref.buttons)), []);
    check('O.sig', 'The remembered choice (session key) does not depend on Reality', Object.keys(variants).filter(k => variants[k].sig !== ref.sig), []);
    check('O.amount', 'The check never changes the amount it was given', Object.keys(variants).map(k => variants[k].amount), [300, 300, 300, 300, 300, 300]);
    const used = (state, feeling) => { const p = page(state, feeling); gateOf(p, 300); homeOf(p); askOf(p); return p; };
    const p = used(CALM(Object.assign(RC(120), MC({ worried: 'Car repair' }))), 'slow'), q = used(CALM(MC({ worried: 'Car repair' })));
    check('O.notStored', 'The qualifier is not stored: after the check, Home and Ask, S has no key a page without Reality signals lacks, and no guidance in it',
      [Object.keys(json(p, 'S')).filter(k => k !== 'realityCheck').sort(), /guidance|balance_below_step|feeling_slow|month_worried/.test(p.run('JSON.stringify(S)'))], [Object.keys(json(q, 'S')).sort(), false]);
  });
}

// ───────────────────────────── Home ─────────────────────────────

function home() {
  group('Home  Main action: fits the month, not "do it now"', () => {
    const none = homeOf(page(CALM()));
    const plan = measure(page(CALM()));
    check('Q.normal', 'No Reality signal: the £348 card step says "Fits your plan for this month."', [none.amount, plan.main[1], has(none.text, '£348 | Fits your plan for this month. | Schedule extra payment')], [348, 348, true]);
    const low = homeOf(page(CALM(RC(120))));
    check('Q.caution', 'Fresh £120: "Fits your plan for this month. No rush to do it today." and the same £348', [low.amount, has(low.text, '£348 | Fits your plan for this month. No rush to do it today. | Schedule extra payment')], [348, true]);
    check('Q.once', 'The balance itself is said once, in the check, not on Home', [/£120|balance/i.test(low.text)], [false]);
    const slow = homeOf(page(CALM(), 'slow'));
    check('Q.soft', 'Slow down: the same light line on the strategy-softened amount', [has(slow.text, 'Fits your plan for this month. No rush to do it today.'), slow.amount === measure(page(CALM(), 'slow')).main[1]], [true, true]);
    const order = ['none', 'zero', 'low', 'high', 'stale'].map(k => measure(page(CALM({ none: {}, zero: RC(0), low: RC(120), high: RC(5000), stale: RC(120, '2026-10-01') }[k]))));
    check('Q.order', 'Steps, their order and amounts, and the main action are identical for £0, £120, £5,000, stale and no balance', order.filter(m => canon(m) !== canon(order[0])).length, 0);
  });
}

// ───────────────────────────── Ask ─────────────────────────────

function ask() {
  group('Ask  A short timing note from the same qualifier', () => {
    const line = (t, prefix) => (t.split('\n').find(l => l.indexOf(prefix) === 0) || '');
    const none = askOf(page(CALM())), low = askOf(page(CALM(RC(120)))), stale = askOf(page(CALM(RC(120, '2026-10-01')))), high = askOf(page(CALM(RC(5000))));
    const lowLine = line(low, 'User-entered balance snapshot: ');
    check('K.none', 'No balance and no feeling: no timing note and no ACTION TIMING block', [line(none, 'User-entered balance snapshot: '), /ACTION TIMING|timing/i.test(none)], ['User-entered balance snapshot: none this month.', false]);
    check('K.check', 'Fresh £120: the snapshot line says the next step is larger, to check timing, that it still fits the plan and that affordability now is unknown',
      lowLine, 'User-entered balance snapshot: £120 on 12 Oct. The next plan step (£348) is larger than this, so suggest checking the timing before scheduling it. The step still fits the monthly plan, and this balance may not be all of the user\u2019s money: it does not show what they can afford right now.');
    check('K.noGap', 'No numeric gap: the only figures are the balance and the step (never £228)', (lowLine.match(/£\d+/g) || []), ['£120', '£348']);
    check('K.confined', 'Everything outside the snapshot line is identical with and without a balance (P3-6B / P3-6C)',
      [low, stale, high].map(t => t.replace(/User-entered balance snapshot: [^\n]*/, '') === none.replace(/User-entered balance snapshot: [^\n]*/, '')), [true, true, true]);
    check('K.stale', 'Stale: treated as old, at most a light timing check, no step figure', line(stale, 'User-entered balance snapshot: '),
      'User-entered balance snapshot: £120 on 1 Oct. It is more than a week old, so treat it as old. At most suggest a light timing check for the next plan step.');
    check('K.high', 'Fresh £5,000: just the snapshot', line(high, 'User-entered balance snapshot: '), 'User-entered balance snapshot: £5000 on 12 Oct.');
    const slow = askOf(page(CALM(MC({ worried: 'Car repair' })), 'slow'));
    const block = slow.slice(slow.indexOf('ACTION TIMING'), slow.indexOf('\n\n', slow.indexOf('ACTION TIMING')));
    check('K.feeling', 'Slow down and a worry: one ACTION TIMING block, guidance only, no figure',
      block, 'ACTION TIMING (guidance only, not a financial fact)\nThe user said they want to slow down today and they have a worry this month. The next plan step still fits the monthly plan; there is no need to push acting on it today.');
    check('K.words', 'No Ask timing text claims affordability, a gap, a difference or alignment', [lowLine, stale, block].filter(t => /difference|\bgap\b|aligned|overstat|understat|safe to spend|available now|cash left/i.test(t)).length, 0);
  });
}

// ───────────────────────────── copy ─────────────────────────────

function copy() {
  group('Copy  Natural, short, no em dash', () => {
    const p = page(CALM());
    const reasons = ['balance_below_step', 'stale_balance_below_step', 'feeling_slow', 'feeling_unsure', 'feeling_moved', 'month_worried', 'month_protect'];
    const lines = reasons.map(r => p.run('geodeRealityActionTimingLine(' + J({ level: 'soft', reasons: [r], balanceAmount: 120, balanceDay: '4 Oct' }) + ')'));
    const undated = ['balance_below_step', 'stale_balance_below_step'].map(r => p.run('geodeRealityActionTimingLine(' + J({ level: 'soft', reasons: [r], balanceAmount: 120, balanceDay: '' }) + ')'));
    const homeLines = ['none', 'soft', 'check'].map(l => p.run('geodeHomePlanFitLine(' + J({ level: l }) + ')'));
    const gates = [look(CALM()).text, look(CALM(RC(120))).text, look(CALM(), 'slow').text];
    const askStrings = (fnText('geodeBuildCoachingContext').match(/'[^'\n]*(timing|plan step|slow down|not sure today|things have moved|worry this month|protect this month)[^'\n]*'/g) || []);
    const all = [].concat(lines, undated, homeLines, gates, askStrings);
    check('C.lines', 'Every timing sentence', lines, [
      'The balance you noted on 4 Oct was £120, so it\u2019s worth checking the timing before you schedule this.',
      'The last balance you noted was on 4 Oct, so a quick timing check may help.',
      'There\u2019s no need to do this today if you\u2019d rather take it slower.',
      'If you\u2019re not sure, it\u2019s fine to check the timing before you schedule it.',
      'Things have shifted a bit, so pick a date that works for you.',
      'With what you\u2019re keeping an eye on this month, there\u2019s no rush to do this today.',
      'With what you\u2019re keeping an eye on this month, there\u2019s no rush to do this today.']);
    check('C.undated', 'Without a recorded day the sentences still read naturally', undated, [
      'The balance you noted this month was £120, so it\u2019s worth checking the timing before you schedule this.',
      'The last balance you noted is over a week old, so a quick timing check may help.']);
    check('C.home', 'Home lines', homeLines, ['Fits your plan for this month.', 'Fits your plan for this month. No rush to do it today.', 'Fits your plan for this month. No rush to do it today.']);
    check('C.claims', 'No sentence says safe to spend, you can afford, insufficient funds, you\u2019re short, behind by, Reality gap, aligned, understated or overstated',
      [].concat(lines, undated, homeLines, gates).filter(s => CLAIMS.test(s)), []);
    check('C.internal', 'No internal terms (posture, multiplier, floor, strategy engine, reason code, confidence)', all.filter(s => /posture|multiplier|\bfloor\b|strategy engine|reason code|confidence/i.test(s)), []);
    check('C.emDash', 'No em dash in any new or edited sentence', all.filter(s => EM_DASH.test(s) || /\\u2014/.test(s)), []);
    check('C.live', 'The Ask strings checked are the live ones', askStrings.length >= 4, true);
  });
}

// ───────────────────────────── invariants and evidence ─────────────────────────────

function invariants() {
  group('N  Financial and strategy invariants', () => {
    const old = execFileSync('git', ['show', BEFORE_REF + ':index.html'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
    const FINANCIAL = ['calcMonthlyLeftover', 'sumExpensesMonthly', 'sumPaymentsMonthlyOutflow', 'computeAffordabilityContext', 'getMonthPlan',
      'geodeStage62BreathingRoomFloor', 'geodeStage62RealityAdjustment', 'geodeGetContextPosture', 'geodeFinancialMemoryPlanModifiers', 'geodeFinancialMemoryProfile',
      'assessPressure', 'togglePay', 'geodeSavePayApply', 'geodeRecomputeBalancesFromPayments', 'geodePaymentBalanceEffect', 'geodeRecordContributionTransition',
      'geodeRecordDebtPaymentTransition', 'geodeContributionLedger', 'geodeIncomeReceiptLedger', 'geodeLivingMonthComponents', 'geodeLivingMonthChanges',
      'geodeMonthBaselineCapture', 'geodeApplySavingsRelease', 'geodeRealityStatus', 'rebalanceSuggestedActions', 'getPriorityRebalanceContext',
      'geodeGetMainAction', 'geodePlanDetailActionForStep', 'openPayModal', 'evaluatePaymentFollowthrough', 'geodeActivityPaymentCompleted',
      'e5PaymentsLinkedSince', 'geodeLatestActionKind', 'geodeRunAffordGatedAction', 'geodeAffordGateYes', 'geodeAffordGateNotSure', 'geodeAffordGatePause'];
    check('N.identical', 'Monthly Left, payments, income and expense plans, debts, goals, investments, ledgers, receipts, baseline, P3-4 changes, the plan, its order, the main action, the payment form, follow-through, the P3-6D evidence readers and the check\'s choices are byte-identical to P3-6D (' + BEFORE_REF + ')',
      FINANCIAL.filter(n => cm.extractFunction(old, n).text !== fnText(n)), []);
    const base = measure(page(CALM()));
    const balances = [RC(0), RC(0.01), RC(120), RC(348), RC(5000), RC(120, '2026-10-01')].map(r => measure(page(CALM(r))));
    check('N.balance', 'No balance (£0, 1p, £120, £348, £5,000, stale) changes Monthly Left, room, floor, steps, order or the main action', balances.filter(m => canon(m) !== canon(base)).length, 0);
    const feelings = ['slow', 'moved', 'unsure'].map(f => [f, measure(page(CALM(), f)).multiplier]);
    check('N.feeling', 'Feeling still adapts strategy exactly as accepted (×0.62 / ×0.78 / ×0.62)', feelings, [['slow', 0.62], ['moved', 0.78], ['unsure', 0.62]]);
    check('N.context', 'Month context still adapts strategy exactly as accepted (worried ×0.78, protect ×0.86)',
      [measure(page(CALM(MC({ worried: 'Car repair' })))).multiplier, measure(page(CALM(MC({ protect: 'Rent' })))).multiplier], [0.78, 0.86]);
  });

  group('P3-6D  Scheduled is not completed', () => {
    const p = page(CALM());
    p.contribute(GOAL('upcoming', OCT + '-25'));
    const sched = json(p, '[geodeActivityPaymentCompleted(geodeGetLatestActivity(S)), geodeLatestActionKind(geodeGetLatestActivity(S))]');
    p.run('__nowMs += 60000;');
    p.contribute(GOAL('paid', TODAY));
    const done = json(p, '[geodeActivityPaymentCompleted(geodeGetLatestActivity(S)), geodeLatestActionKind(geodeGetLatestActivity(S))]');
    check('D.evidence', 'A scheduled goal contribution is planned (payment_scheduled); a completed one is behaviour (goal_payment)', [sched, done], [[false, 'payment_scheduled'], [true, 'goal_payment']]);
  });

  group('Static  One qualifier, no subtraction, no decision authority', () => {
    const body = fnText('geodeRealityActionGuidance').replace(/^\/\*\*[\s\S]*?\*\//, '');
    check('S.noSubtraction', 'The qualifier never subtracts, reads Monthly Left or room, or stores anything', /\s-\s|-=|calcMonthlyLeftover|planRoom|suggestableRoom|save\(|setItem|localStorage|S\.\w+\s*=[^=]/.test(body), false);
    check('S.oneSource', 'Home, the check and Ask all take their wording from geodeRealityActionGuidance (built once per check)',
      [/guidance: geodeRealityActionGuidance\(amt\)/.test(fnText('geodeAffordGateBuildForPlanMoneyAction')), /geodeRealityActionTimingLine\(g\.guidance\)/.test(fnText('geodeOpenAffordabilityGateModal')),
        /geodeHomePlanFitLine\(window\._geodeMainActionGate\.guidance\)/.test(fnText('geodeHomeMainActionHtml')), /geodeRealityActionGuidance\(nextStepAmt\)/.test(fnText('geodeBuildCoachingContext'))], [true, true, true, true]);
    check('S.modalReadsNoBalance', 'The check\'s modal renders the qualifier it was given; it reads no balance itself', /realityCheck|geodeRealityStatus|geodeRealityActionGuidance/.test(fnText('geodeOpenAffordabilityGateModal') + fnText('geodeRealityActionTimingLine')), false);
    check('S.harness', 'The probe program extracted the production functions (none shimmed)', ENTRIES.filter(n => program().names.indexOf(n) < 0), []);
  });
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'balance changes the recommendation amount': { m: [['getMonthPlan', [['    overpay = geodeFinancialMemorySoftenedAmount(overpay, memoryMods.debtExtraMultiplier, 50, false);', '    overpay = geodeFinancialMemorySoftenedAmount(overpay, memoryMods.debtExtraMultiplier, 50, false);\n    if (S.realityCheck && S.realityCheck.ym === currentYM() && toNum(S.realityCheck.amount) < 300) overpay = Math.max(50, Math.round(overpay / 2));']]]], run: [scenarios] },
  'balance changes the recommendation order': { m: [['getMonthPlan', [['  return {\n    steps: steps,', '  if (S.realityCheck && S.realityCheck.ym === currentYM()) steps = steps.slice().reverse();\n  return {\n    steps: steps,']]]], run: [home] },
  'balance minus Monthly Left returns': { m: [['geodeRealityActionGuidance', [['  var feeling = geodeGetRealityFeeling();', '  if (rs.hasData) { out.gap = rs.amount - calcMonthlyLeftover(S); if (out.gap < 0 && out.reasons.indexOf(\'balance_below_step\') < 0) out.reasons.push(\'balance_below_step\'); }\n  var feeling = geodeGetRealityFeeling();']]]], run: [scenarios] },
  'a numeric shortage is displayed': { m: [['geodeOpenAffordabilityGateModal', [['      escHtmlLite(timingLine) +', '      escHtmlLite(timingLine + (g.guidance.balanceAmount != null ? \' You\\u2019re \' + fm(g.amount - g.guidance.balanceAmount) + \' short.\' : \'\')) +']]]], run: [scenarios] },
  'missing balance becomes £0': { m: [['geodeRealityActionGuidance', [['  if (rs.hasData && amt > rs.amount) {', '  if (!rs.hasData) rs = { hasData: true, amount: 0, date: 0, daysOld: 0, stale: false };\n  if (rs.hasData && amt > rs.amount) {']]]], run: [scenarios] },
  'stale balance is called current': { m: [['geodeRealityActionGuidance', [["    out.reasons.push(rs.stale ? 'stale_balance_below_step' : 'balance_below_step');", "    out.reasons.push('balance_below_step');"]]]], run: [scenarios] },
  'caution claims unaffordability': { m: [['geodeRealityActionTimingLine', [["      ', so it\\u2019s worth checking the timing before you schedule this.';", "      ', so you can\\u2019t afford this right now.';"]]]], run: [levels] },
  'feeling causes a second numeric reduction in R': { m: [['geodeAffordGateBuildForPlanMoneyAction', [['      amount: amt,', "      amount: geodeGetRealityFeeling() === 'slow' ? Math.round(amt * 0.62) : amt,"]]]], run: [scenarios] },
  'no-Reality guidance changes': { m: [['geodeRealityActionGuidance', [["  var out = { level: 'none',", "  var out = { level: 'soft',"]]]], run: [scenarios] },
  'Ask receives a numeric Reality gap': { m: [['geodeBuildCoachingContext', [["        balTiming = ' The next plan step (' + sym + nextStepAmt + ') is larger than this,", "        balTiming = ' The next plan step (' + sym + nextStepAmt + ') is ' + sym + (nextStepAmt - Math.round(toNum(rs.amount))) + ' larger than this,"]]]], run: [ask] },
  'completed / scheduled evidence regresses': { m: [['geodeActivityPaymentCompleted', [['  if (e.completed === false) return false;', '  if (e.completed === false) return true;']]]], run: [invariants] },
  'new copy introduces an em dash': { m: [['geodeRealityActionTimingLine', [["  if (top === 'feeling_slow') return 'There\\u2019s no need to do this today if you\\u2019d rather take it slower.';", "  if (top === 'feeling_slow') return 'No need to do this today \\u2014 take it slower.';"]]]], run: [copy] }
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
  levels();
  scenarios();
  gateBehaviour();
  home();
  ask();
  copy();
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
