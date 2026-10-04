#!/usr/bin/env node
/**
 * P3-6B Reality Check decision decoupling: the balance the user enters (S.realityCheck) is dated evidence only.
 *
 * Runs the production plan chain (getMonthPlan → computeAffordabilityContext → breathing-room floor → pace softening),
 * posture, the affordability gate, Home, Ask Beynd context and the Reality page from index.html inside the
 * cross-month harness's simulated app (tests/month-baseline.js pageOver: production load, save and store), on states
 * that differ only in their Reality balance, its age, a legacy realityPlanAlignment overlay, or income receipts.
 *
 * Checks: recommendation invariance (step amounts, order, suggestable room, floor, posture, confidence), Monthly Left
 * invariance, the balance record across record / reload / edit / month change, the legacy overlay, the gate, Home,
 * Ask, the Reality page, receipt non-integration, static decision-authority and copy guards — and a mutant per rule.
 *
 * Run: node tests/reality-decoupling.js
 */
'use strict';

const vm = require('vm');
const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const SRC = cm.readSource(cm.INDEX_HTML);
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
/** tests/month-baseline.js PLAN (Monthly Left £1,390) with a 22% APR card and the balanced style: debt, buffer, goal and investment steps. */
const WIDE = over => Object.assign(mb.PLAN(OCT), {
  planStrategy: 'balanced', cur: { code: 'GBP', sym: '£' },
  debts: [{ id: 'd1', name: 'Card', balance: 2000, apr: 22, minp: 50 }],
  goals: [Object.assign({ targetDate: '2027-01-31' }, { id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' })]
}, over || {});
/** The same plan with a regular £890 bill: Monthly Left £500. */
const ML500 = over => { const s = WIDE(over); s.expenses = s.expenses.concat([{ id: 'bills', name: 'Bills', amount: 890, rec: 'yes', cat: 'bills', date: OCT + '-02' }]); return s; };
/** A regular £1,890 bill: Monthly Left −£500. */
const MLNEG = over => { const s = WIDE(over); s.expenses = s.expenses.concat([{ id: 'bills', name: 'Bills', amount: 1890, rec: 'yes', cat: 'bills', date: OCT + '-02' }]); return s; };

const RC = (amount, iso, h) => ({ realityCheck: { amount, ym: OCT, date: at(iso || TODAY, h === undefined ? 9 : h) } });
/** An overlay as pre-P3-6B "How this month could shift" approval stored it. */
const OVERLAY = {
  status: 'approved', version: 1, ym: OCT, approvedAt: at('2026-10-10', 9), inputsHash: 'h1', planSignature: 'sig1',
  realityBalance: 200, monthlyLeft: 1390, gap: -1190,
  stepAdjustments: [
    { stepId: 'debt:d1', label: 'Reduce high\u2011interest Card', baseAmount: 300, adjustedAmount: 120, delta: -180 },
    { stepId: 'invest', label: 'Invest what remains', baseAmount: 200, adjustedAmount: 0, delta: -200 }
  ]
};
const RECEIPT = (id, amount) => ({ id, eventType: 'receipt', amount, ym: OCT, recordedAt: at('2026-10-10', 9), source: 'manual' });

/** The Reality variants of §18 / §24 for one plan. */
const VARIANTS = {
  none: {},
  pence: RC(0.01),
  zero: RC(0),
  low: RC(200),
  equal500: RC(500),
  equal1390: RC(1390),
  high: RC(5000),
  stale: RC(200, '2026-10-01'),
  lastMonth: { realityCheck: { amount: 200, ym: '2026-09', date: at('2026-09-20', 9) } },
  overlayOnly: { realityPlanAlignment: OVERLAY },
  overlayLow: Object.assign(RC(200), { realityPlanAlignment: OVERLAY })
};

// ───────────────────────────── program ─────────────────────────────

/** UI the probe drives: the modal and its header are recorded, not drawn. */
const PRELUDE = [
  'var __html = null;',
  'function openModal(h) { __html = String(h); }',
  'function removeModalDom() { __html = null; }',
  'function closeModal() { __html = null; }',
  'function mh(t) { return "<div class=\\"mh\\">" + t + "</div>"; }'
].join('\n');
/** Production globals the installed functions read. */
const GLOBALS = ['_geodeReflectionAskContextPending'].map(n => {
  const m = SRC.match(new RegExp('\\nvar ' + n + ' = [^\\n]*;\\n'));
  if (!m) throw new Error('production global not found: ' + n);
  return m[0].trim();
}).join('\n');

const ENTRIES = [
  'getMonthPlan', 'computeAffordabilityContext', 'geodeStage62BreathingRoomFloor', 'geodeStage62RealityAdjustment',
  'geodeGetContextPosture', 'geodeFinancialMemoryPlanModifiers', 'geodeFinancialMemoryProfile', 'geodeRealityStatus',
  'geodeRealityRecordedDay', 'geodeRunAffordGatedAction', 'geodeOpenAffordabilityGateModal', 'geodeAffordGateYes',
  'geodeAffordGateNotSure', 'geodeAffordabilityRealityLine', 'geodePickHumanMoment', 'geodeHomeRealityEntryHtml',
  'geodeRealityMoneyTileStatusLine', 'geodeRealityPageHtml', 'geodeSaveRealityCheckFromPage', 'geodeBuildCoachingContext',
  'geodeNormalizeRealityPlanAlignment', 'geodeIncomeReceiptLedger', 'calcMonthlyLeftover'
];

const MEASURE = `
function __measure() {
  var a = computeAffordabilityContext(S);
  var plan = getMonthPlan();
  var post = geodeGetContextPosture(S);
  var mods = geodeFinancialMemoryPlanModifiers(S, a, null);
  return JSON.stringify({
    ml: calcMonthlyLeftover(S),
    planRoom: a.planRoom, floor: a.breathingRoomFloor, before: a.suggestableBeforeReality, room: a.suggestableRoom,
    multiplier: a.realityAdjustment ? a.realityAdjustment.postureMultiplier : null,
    confidence: a.confidence, codes: a.reasonCodes,
    steps: plan.steps.map(function (s) { return [s.label, s.amount, s.priority]; }),
    posture: post.posture, tone: post.tone, postureCodes: post.reasonCodes,
    mods: mods ? [mods.debtExtraMultiplier, mods.goalRecoveryMultiplier, mods.investmentMultiplier, mods.bufferPreference, mods.preserveBreathingRoom, mods.reasonCodes] : null
  });
}
function __gate() {
  __html = null; window._geodeAffordGatePending = null;
  sessionStorage.removeItem('geode_aff_ok_s1'); sessionStorage.removeItem('geode_aff_pause_s1');
  var ran = 0, g = { needsAffordGate: true, sig: 's1', amount: 200 };
  geodeRunAffordGatedAction(function () { ran++; }, g);
  var first = { ran: ran, html: __html || '' };
  geodeAffordGateYes();
  var yes = { ran: ran, ok: sessionStorage.getItem('geode_aff_ok_s1'), open: __html !== null };
  geodeRunAffordGatedAction(function () { ran++; }, g);
  var again = { ran: ran, open: __html !== null };
  sessionStorage.removeItem('geode_aff_ok_s1');
  geodeRunAffordGatedAction(function () { ran++; }, g);
  geodeAffordGateNotSure();
  var notSure = { ran: ran, open: __html !== null, ok: sessionStorage.getItem('geode_aff_ok_s1') };
  return JSON.stringify({ first: first, yes: yes, again: again, notSure: notSure });
}
`;

let PROGRAM = null;
function program() {
  if (PROGRAM) return PROGRAM;
  const probe = mb.pageOver(J(WIDE()), TODAY);
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
  PROGRAM = { script: new vm.Script(PRELUDE + '\n' + GLOBALS + '\n' + [...have.values()].join('\n') + '\n' + MEASURE, { filename: 'reality-decoupling-program' }), names: [...have.keys()], missing: [...missing] };
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

/** This runtime's page over state on iso, the production chain installed (and the active mutant). */
function page(state, iso, feeling) {
  const p = mb.pageOver(J(state), iso || TODAY);
  program().script.runInContext(p.ctx);
  if (MUT) MUT.forEach(([n, pairs]) => p.run(mutantText(n, pairs)));
  if (feeling) p.run('sessionStorage.setItem("geode_reality_feeling", ' + J(feeling) + ');');
  return p;
}
const measure = p => JSON.parse(p.run('__measure()'));
const json = (p, expr) => { const t = p.run('JSON.stringify(' + expr + ')'); return t === undefined ? undefined : JSON.parse(t); };
const without = (o, keys) => { const c = Object.assign({}, o); keys.forEach(k => delete c[k]); return c; };

/** Measures each Reality variant over one plan. */
function matrix(plan, names, feeling) {
  const out = {};
  names.forEach(n => { out[n] = measure(page(plan(VARIANTS[n]), TODAY, feeling)); });
  return out;
}
const sameAll = (m, ref) => Object.keys(m).every(k => canon(m[k]) === canon(m[ref]));
const diffs = (m, ref) => Object.keys(m).filter(k => canon(m[k]) !== canon(m[ref]));

const FORBIDDEN = /difference|overstat|understat|\baligned\b|shortfall|surplus|\bgap\b|below your plan|above your plan|confirms the plan|safe to spend|available|cash remaining/i;

// ───────────────────────────── §18 / §24 A–J: recommendation invariance ─────────────────────────────

function invarianceMl500() {
  group('A–J  Monthly Left £500 — every Reality variant gives the same plan', () => {
    const m = matrix(ML500, Object.keys(VARIANTS));
    check('A.baseline', 'A. No Reality balance: Monthly Left £500, the plan has steps and a floor', [m.none.ml, m.none.steps.length > 0, m.none.floor > 0], [500, true, true]);
    check('B–J.identical', 'B £200, C £500, D £5,000, F £0, £0.01, G stale, last month, J overlay (with or without a balance): step amounts, order, room, floor, posture, confidence and memory modifiers identical to A',
      diffs(m, 'none'), []);
    check('A–J.ml', 'Monthly Left is £500 in every variant', Object.keys(m).map(k => m[k].ml), Object.keys(m).map(() => 500));
    check('A–J.noRealityCodes', 'No reason code mentions reality, balance or a gap', Object.keys(m).some(k => m[k].codes.concat(m[k].postureCodes, (m[k].mods || [])[5] || []).some(c => /reality|balance|gap/i.test(c))), false);
  });
  group('E  Monthly Left −£500, balance £5,000 — no room is invented', () => {
    const m = matrix(MLNEG, ['none', 'high', 'overlayLow']);
    check('E.room', 'E. Monthly Left −£500: suggestable room £0 and no steps, with or without a £5,000 balance or an overlay',
      Object.keys(m).map(k => [m[k].ml, m[k].room, m[k].steps.length]), [[-500, 0, 0], [-500, 0, 0], [-500, 0, 0]]);
    check('E.identical', 'E. Every variant identical to no balance', diffs(m, 'none'), []);
  });
}

// ───────────────────────────── K–N: each step type ─────────────────────────────

function invarianceSteps() {
  group('K–N  Debt, buffer, goal and investment steps do not move with the balance', () => {
    const m = matrix(WIDE, ['none', 'pence', 'zero', 'low', 'equal1390', 'high', 'stale', 'overlayOnly', 'overlayLow']);
    const labels = m.none.steps.map(s => s[0]);
    check('KLMN.present', 'The fixture produces a debt, buffer, goal and investment step (Monthly Left £1,390)',
      [labels.some(l => /^Reduce high/.test(l)), labels.indexOf('Build your emergency fund') >= 0, labels.some(l => /^(Catch up on|Restart progress on)/.test(l)), labels.indexOf('Invest what remains') >= 0],
      [true, true, true, true]);
    const step = (k, re) => (m[k].steps.find(s => re.test(s[0])) || null);
    [['K.debt', 'K. Debt step', /^Reduce high/], ['L.buffer', 'L. Buffer step', /^Build your emergency fund$/],
      ['M.goal', 'M. Goal step', /^(Catch up on|Restart progress on)/], ['N.invest', 'N. Investment step', /^Invest what remains$/]].forEach(([id, t, re]) => {
      check(id, t + ' amount and position identical for £0, £0.01, £200, £1,390 (equal), £5,000, stale and a legacy overlay',
        Object.keys(m).map(k => [step(k, re), m[k].steps.findIndex(s => re.test(s[0]))]), Object.keys(m).map(() => [step('none', re), m.none.steps.findIndex(s => re.test(s[0]))]));
    });
    check('KLMN.all', 'Whole measure (room, floor, posture, confidence, modifiers) identical across the variants', diffs(m, 'none'), []);
  });
}

// ───────────────────────────── P: posture and the floor (legitimate sources preserved) ─────────────────────────────

function posture() {
  group('P  Posture and the floor come from the feeling, never the balance', () => {
    const calm = matrix(ML500, ['none', 'low', 'high', 'overlayLow']);
    check('P.calm', 'P. No feeling: posture unknown / calm for every balance', Object.keys(calm).map(k => [calm[k].posture, calm[k].tone, calm[k].multiplier]),
      Object.keys(calm).map(() => ['unknown', 'calm', 1]));
    const moved = matrix(ML500, ['none', 'low', 'high', 'overlayLow'], 'moved');
    check('P.moved', 'P. "Something moved" still sets protect_flexibility, raises the floor and softens the pace — the same for every balance',
      [moved.none.posture, moved.none.floor > calm.none.floor, moved.none.multiplier, sameAll(moved, 'none')], ['protect_flexibility', true, 0.78, true]);
    const slow = matrix(ML500, ['none', 'low', 'high'], 'slow');
    check('P.slow', 'P. "Slower pace" still sets review_first (×0.62) — the same for every balance', [slow.none.posture, slow.none.multiplier, sameAll(slow, 'none')], ['review_first', 0.62, true]);
    const irregular = matrix(over => ML500(Object.assign({ incomeType: 'irregular', hasDependants: true }, over)), ['none', 'low', 'high']);
    check('P.irregular', 'P. Irregular income with dependants: the profile raises the floor (×1.18 ×1.18) but posture stays unknown with or without a balance',
      [irregular.none.posture, irregular.none.floor > calm.none.floor, sameAll(irregular, 'none')], ['unknown', true, true]);
    const p = page(ML500(VARIANTS.low));
    check('P.inputs', 'P. Posture inputs carry no Reality balance field', Object.keys(json(p, 'geodeGetContextPosture(S).inputs')).sort(), ['hasDependants', 'incomeType', 'planStrategy', 'realityFeeling']);
  });
}

// ───────────────────────────── O: the gate ─────────────────────────────

function gate() {
  group('O  Affordability gate works from the plan alone', () => {
    const run = v => JSON.parse(page(ML500(VARIANTS[v])).run('__gate()'));
    const none = run('none');
    check('O.opens', 'O. A gated step opens the check once, from the plan; nothing runs until the user continues', [none.first.ran, /Continue with this amount/.test(none.first.html), /This step comes from your monthly plan, not your bank\./.test(none.first.html)], [0, true, true]);
    check('O.copy', 'O. The gate never asks for or mentions a balance', [/balance|reality check|add my/i.test(none.first.html)], [false]);
    check('O.yes', 'O. Continue runs the step once, remembers OK and closes the check', none.yes, { ran: 1, ok: '1', open: false });
    check('O.again', 'O. The remembered OK is trusted next time without reopening the check', none.again, { ran: 2, open: false });
    check('O.notSure', 'O. Not sure yet closes without running or remembering', none.notSure, { ran: 2, open: false, ok: null });
    const all = ['pence', 'zero', 'low', 'equal500', 'high', 'stale', 'overlayLow'].map(v => [v, canon(run(v)) === canon(none)]);
    check('O.invariant', 'O. Identical gate behaviour for £0.01, £0, £200, £500, £5,000, stale and an overlay', all.filter(x => !x[1]).map(x => x[0]), []);
  });
}

// ───────────────────────────── Q: Home ─────────────────────────────

function home() {
  group('Q  Home makes no balance-versus-plan claim', () => {
    /** Nothing overdue (no September fine, Holiday due the 25th), so pressure does not own Home and the Reality entry can show. */
    const calmPlan = over => {
      const s = ML500(over);
      s.payments = s.payments.filter(x => x.id !== 'fine').map(x => (x.id === 'hol' ? Object.assign({}, x, { date: OCT + '-25' }) : x));
      return s;
    };
    const look = v => {
      const p = page(calmPlan(VARIANTS[v]));
      return { moment: json(p, 'geodePickHumanMoment(S)'), entry: p.run('geodeHomeRealityEntryHtml(S)'), tile: p.run('geodeRealityMoneyTileStatusLine(S)'), main: json(p, 'geodeGetMainAction(S)') };
    };
    const vs = ['none', 'pence', 'zero', 'low', 'equal500', 'high', 'stale', 'overlayLow'];
    const L = {};
    vs.forEach(v => { L[v] = look(v); });
    check('Q.moment', 'Q. Home human moment identical for every balance (no gap-driven line)', vs.filter(v => canon(L[v].moment) !== canon(L.none.moment)), []);
    check('Q.main', 'Q. Home main action (the plan step and its amount) identical for every balance', [L.none.main && L.none.main.amount > 0, vs.filter(v => canon(L[v].main) !== canon(L.none.main))], [true, []]);
    check('Q.words', 'Q. No Home line says overstated / understated / difference / gap / safe to spend', vs.filter(v => FORBIDDEN.test(J(L[v]))), []);
    check('Q.entry', 'Q. The Home entry only offers to note or update a balance; it carries no amount',
      [/Note today\u2019s balance/.test(L.none.entry), /Update the balance you noted/.test(L.low.entry), /Update the balance you noted/.test(L.high.entry), vs.some(v => /£/.test(L[v].entry))], [true, true, true, false]);
    check('Q.tile', 'Q. Money tile: when it was recorded, never how it compares', [L.none.tile, L.low.tile, L.high.tile, L.stale.tile], ['Not added this month', 'Balance recorded 12 Oct', 'Balance recorded 12 Oct', 'Balance recorded 1 Oct']);
  });
}

// ───────────────────────────── R: Ask Beynd ─────────────────────────────

function ask() {
  group('R  Ask Beynd gets the snapshot, never a comparison', () => {
    const ctx = v => { const p = page(ML500(VARIANTS[v])); const r = p.run('(function(){ var c = geodeBuildCoachingContext(); return typeof c === "string" ? c : JSON.stringify(c); })()'); return String(r); };
    const none = ctx('none'), low = ctx('low'), high = ctx('high'), stale = ctx('stale'), overlay = ctx('overlayLow');
    check('R.none', 'R. No balance: "User-entered balance snapshot: none this month."', none.indexOf('User-entered balance snapshot: none this month.') >= 0, true);
    check('R.snapshot', 'R. A balance is sent only as "User-entered balance snapshot: £X on <day>."',
      [low.indexOf('User-entered balance snapshot: £200 on 12 Oct.') >= 0, high.indexOf('User-entered balance snapshot: £5000 on 12 Oct.') >= 0, stale.indexOf('User-entered balance snapshot: £200 on 1 Oct.') >= 0], [true, true, true]);
    const block = t => { const a = t.indexOf('BALANCE YOU ENTERED'); return a < 0 ? '' : t.slice(a, t.indexOf('\n\n', a) < 0 ? undefined : t.indexOf('\n\n', a)); };
    check('R.block', 'R. The balance block is two lines: the label and the snapshot — no difference, gap, alignment or sense label',
      [low, high, stale, overlay].map(t => { const b = block(t); return [b.split('\n').length, FORBIDDEN.test(b.replace('not compared with the plan', '')), /sense|reality check|vs\b/i.test(b)]; }),
      [[2, false, false], [2, false, false], [2, false, false], [2, false, false]]);
    const strip = t => t.replace(/User-entered balance snapshot: [^\n]*/, '');
    check('R.rest', 'R. Everything outside the snapshot line is identical for every balance and the overlay', [strip(low) === strip(none), strip(high) === strip(none), strip(overlay) === strip(none)], [true, true, true]);
    check('R.noCompare', 'R. No context line pairs the balance with Monthly Left (overstated, understated, below/above the plan, Reality shift)',
      [low, high, overlay].some(t => /overstat|understat|below (your|the) plan|above (your|the) plan|could shift|reality shift|balance gap|balance vs/i.test(t)), false);
  });
}

// ───────────────────────────── S: the Reality page ─────────────────────────────

function realityPage() {
  group('S  Reality page shows the evidence, not a verdict', () => {
    const html = (v, iso) => page(ML500(v), iso).run('geodeRealityPageHtml()');
    const text = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
    const rec = text(html(RC(500, '2026-10-04'), '2026-10-04'));
    check('S.target', 'S. "Reality Check / Balance you entered / £500 / Recorded / 4 Oct" in that order',
      ['Reality Check', 'Balance you entered', '£500', 'Recorded', '4 Oct'].map(s => rec.indexOf(s)).every((i, k, a) => i >= 0 && (k === 0 || i > a[k - 1])), true);
    check('S.note', 'S. The neutral note: a snapshot you entered; the plan is tracked separately', rec.indexOf('This is a snapshot you entered. Your monthly plan is tracked separately.') >= 0, true);
    const low = text(html(VARIANTS.low)), high = text(html(VARIANTS.high)), none = text(html({})), stale = text(html(VARIANTS.stale)), overlay = text(html(VARIANTS.overlayLow));
    check('S.noDifference', 'S. No Difference row, no Monthly estimate, no aligned / overstated / understated, never "available" or "safe to spend"',
      [low, high, none, stale, overlay].map(t => [/Difference/.test(t), /Monthly estimate/i.test(t), FORBIDDEN.test(t)]), [0, 1, 2, 3, 4].map(() => [false, false, false]));
    check('S.noData', 'S. No balance: "Not added this month" and Add balance', [/Not added this month/.test(none), /Add balance/.test(none), /Recorded/.test(none)], [true, true, false]);
    check('S.entry', 'S. Entry stays: Balance today, Save balance; Update balance once one exists', [/Balance today/.test(low), /Save balance/.test(low), /Update balance/.test(low)], [true, true, true]);
    check('S.stale', 'S. A stale balance says when it was recorded, and offers the same balance today', [/Recorded 1 Oct/.test(stale), /Recorded more than a week ago\./.test(stale), /Same balance today/.test(stale)], [true, true, true]);
    check('S.noShift', 'S. A stored legacy overlay renders no shift offer, banner or adjusted amount', [/shift/i.test(overlay), /£120|£180/.test(overlay), text(html(VARIANTS.overlayLow)) === text(html(VARIANTS.low))], [false, false, true]);
    check('S.amountOnly', 'S. With a balance, the only money on the page is the balance itself', (low.match(/£\d[\d,]*/g) || []), ['£200']);
  });
}

// ───────────────────────────── H, I, T, U: the record ─────────────────────────────

function record() {
  group('H/I/T/U  The balance record survives — and changes nothing else', () => {
    const p = page(ML500());
    const m0 = measure(p);
    p.run('__fields.rc_page_amount = "200"; __toasts = []; geodeSaveRealityCheckFromPage();');
    const nowMs = p.run('__nowMs');
    check('H.entered', 'H. Entered today: S.realityCheck is { amount, ym, date } in memory and in the store', [json(p, 'S.realityCheck'), mb.stored(p).realityCheck, p.run('__toasts.join("|")')],
      [{ amount: 200, ym: OCT, date: nowMs }, { amount: 200, ym: OCT, date: nowMs }, 'Saved.']);
    check('H.plan', 'H. Recording changes no step, room, floor, posture or Monthly Left', measure(p), m0);
    p.run('save(); __reload();');
    check('T.reload', 'T. Reload: the balance remains and the plan is unchanged', [json(p, 'S.realityCheck'), canon(measure(p)) === canon(m0)], [{ amount: 200, ym: OCT, date: nowMs }, true]);
    p.run('__nowMs += 3600000; __fields.rc_page_amount = "5000"; geodeSaveRealityCheckFromPage(); save(); __reload();');
    check('I.updated', 'I. Updated today and reloaded: the new balance and its new time remain; the plan is unchanged',
      [json(p, 'S.realityCheck'), canon(measure(p)) === canon(m0)], [{ amount: 5000, ym: OCT, date: nowMs + 3600000 }, true]);
    p.run('__toasts = []; __fields.rc_page_amount = ""; geodeSaveRealityCheckFromPage();');
    check('I.invalid', 'I. An empty amount is refused and the record kept', [p.run('__toasts.join("|")'), json(p, 'S.realityCheck').amount], ['Enter a valid amount.', 5000]);
    const nov = page(ML500(Object.assign({}, VARIANTS.low)));
    const novPlain = page(ML500());
    [nov, novPlain].forEach(x => x.advance('2026-11-03', 'reload'));
    check('U.rollover', 'U. Month change: an October balance is not current in November (existing rule)', [json(nov, 'geodeRealityStatus()'), nov.run('geodeRealityMoneyTileStatusLine(S)')], [{ hasData: false }, 'Not added this month']);
    check('U.plan', 'U. November plan identical with or without the old balance', canon(measure(nov)) === canon(measure(novPlain)), true);
  });
}

// ───────────────────────────── J / §20: legacy overlay ─────────────────────────────

function overlay() {
  group('J  A legacy realityPlanAlignment overlay stays stored and inert', () => {
    const p = page(WIDE(VARIANTS.overlayLow));
    check('J.kept', 'J. A current-month overlay is not deleted merely to clean storage (load and save keep it)', [canon(json(p, 'S.realityPlanAlignment')) === canon(OVERLAY), canon(mb.stored(p).realityPlanAlignment) === canon(OVERLAY)], [true, true]);
    const m = measure(p), plain = measure(page(WIDE(VARIANTS.low)));
    check('J.inert', 'J. It changes no step (the stored £120 / £0 are never applied), room or floor', [canon(m) === canon(plain), m.steps.some(s => s[1] === 120)], [true, false]);
    check('J.notAuthority', 'J. Nothing reads it into the plan, snapshot or Ask — its fields stay exactly as stored', canon(json(p, 'S.realityPlanAlignment')), canon(OVERLAY));
    p.run('geodeNormalizeRealityPlanAlignment(S);');
    check('J.normalizeOct', 'J. Normalizing in October keeps it', canon(json(p, 'S.realityPlanAlignment')) === canon(OVERLAY), true);
    p.advance('2026-11-03', 'reload');
    p.run('geodeNormalizeRealityPlanAlignment(S);');
    check('J.expires', 'J. Past its month the existing rule drops it', json(p, 'S.realityPlanAlignment === undefined'), true);
  });
}

// ───────────────────────────── V/W/X: receipts are not an input ─────────────────────────────

function receipts() {
  group('V/W/X  Income receipts do not enter room', () => {
    const vs = {
      none: ML500(), full: ML500({ incomeReceipts: [RECEIPT('inc1', 3000)] }), partial: ML500({ incomeReceipts: [RECEIPT('inc1', 1000)] }),
      noneLow: ML500(Object.assign({}, VARIANTS.low)), fullLow: ML500(Object.assign({ incomeReceipts: [RECEIPT('inc1', 3000)] }, VARIANTS.low)),
      partialHigh: ML500(Object.assign({ incomeReceipts: [RECEIPT('inc1', 1000)] }, VARIANTS.high))
    };
    const m = {};
    Object.keys(vs).forEach(k => { m[k] = measure(page(vs[k])); });
    check('VWX.ledger', 'V/W. The receipts are understood evidence (ledger totals £3,000 and £1,000)',
      [json(page(vs.full), 'geodeIncomeReceiptLedger(S.incomeReceipts, "2026-10").month.total'), json(page(vs.partial), 'geodeIncomeReceiptLedger(S.incomeReceipts, "2026-10").month.total')], [3000, 1000]);
    check('VWX.identical', 'V present, W partial, X none — with or without a balance: identical plan, room, floor and Monthly Left', diffs(m, 'none'), []);
  });
}

// ───────────────────────────── §21 / §22: static guards ─────────────────────────────

/** Every production function reachable from roots (shims ignored): the full static closure, except below names in stop. */
function staticClosure(roots, stop) {
  const have = new Map(), queue = roots.slice();
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || (stop && stop.indexOf(n) >= 0)) continue;
    let f;
    try { f = cm.extractFunction(SRC, n); } catch (e) { have.set(n, null); continue; }
    have.set(n, f.text);
    cm.calledNames(f.text).forEach(c => queue.push(c));
  }
  return [...have.entries()].filter(([, t]) => t !== null);
}

function guards() {
  group('§21/§22  Static guards', () => {
    const DECISIONS = ['getMonthPlan', 'computeAffordabilityContext', 'geodeStage62BreathingRoomFloor', 'geodeStage62RealityAdjustment',
      'geodeGetContextPosture', 'geodeFinancialMemoryPlanModifiers', 'geodeFinancialMemoryProfile', 'geodeRunAffordGatedAction',
      'geodeAffordGateYes', 'geodeAffordGateNotSure', 'geodeOpenAffordabilityGateModal'];
    const closure = staticClosure(DECISIONS);
    const readers = closure.filter(([, t]) => /realityCheck|geodeRealityStatus|realityPlanAlignment|geodeRealityRecordedDay/.test(t)).map(([n]) => n);
    check('G.authority', 'No function reachable from room, plan steps, floor, posture, memory modifiers or the gate reads S.realityCheck, geodeRealityStatus or S.realityPlanAlignment (' + closure.length + ' functions)', readers, []);
    check('G.closureSize', 'The static closure really covers the plan chain (getMonthPlan reaches computeAffordabilityContext and the floor)',
      ['computeAffordabilityContext', 'geodeStage62BreathingRoomFloor', 'geodeGetContextPosture', 'geodeFinancialMemoryPlanModifiers'].every(n => closure.some(([m]) => m === n)), true);
    const receiptReaders = staticClosure(['computeAffordabilityContext', 'getMonthPlan'], ['save']).filter(([, t]) => /incomeReceipts|geodeIncomeReceipt/.test(t)).map(([n]) => n);
    check('G.receipts', 'No function reachable from room or plan steps reads income receipts (save() is a write: its month-baseline capture records receipts as P3-5 evidence, and returns nothing to the plan)', receiptReaders, []);
    check('G.receiptsViaSave', 'The only receipt path from the plan chain is that save() → month-baseline capture',
      staticClosure(['computeAffordabilityContext', 'getMonthPlan']).filter(([, t]) => /incomeReceipts|geodeIncomeReceipt/.test(t)).map(([n]) => n).every(n => staticClosure(['geodeMonthBaselineCapture']).some(([m]) => m === n)), true);
    const SURFACES = ['geodeRealityPageHtml', 'geodeRealityMoneyTileStatusLine', 'geodeHomeRealityEntryHtml', 'geodeRealityHumanMoment',
      'geodeRealityHumanMomentBodyFromPosture', 'geodeRealityContinuityOrientationLine', 'geodeAffordabilityRealityLine', 'geodeOpenAffordabilityGateModal', 'geodeRealityStatus'];
    const strings = t => (t.replace(/data-geode-css="[^"]*"/g, '').match(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"/g) || []).join(' ');
    check('G.copy', 'Reality surfaces carry no difference / gap / aligned / overstated / understated / shortfall / surplus / safe-to-spend copy',
      SURFACES.filter(n => FORBIDDEN.test(strings(fnText(n)))), []);
    check('G.status', 'geodeRealityStatus returns evidence only: no gap, status or confidence field', /\b(gap|status|confidence|calcMonthlyLeftover|calcLeftover)\b/.test(fnText('geodeRealityStatus').replace(/function geodeRealityStatus/, '')), false);
    check('G.retired', 'The Reality shift and its helpers are gone from index.html',
      ['How this month could shift', 'geodeBuildRealityPlanAlignmentPreview', 'geodeGetActiveRealityPlanAlignment', 'geodeGetRealityPlanStepAdjustment', 'geodePlanStepRealityDisplay',
        'geodeRealityPlanAlignmentOfferHtml', 'geodeRealityDifferenceExplain', 'geodeAffordGateRealityFirmEnough', 'geodeRealityCheckCardHtml', 'geodePlanRationaleSenseLabel', 'realityGap', 'reality_mismatch', 'reality_balance_below_plan']
        .filter(s => SRC.indexOf(s) >= 0), []);
    check('G.wording', 'No overstated / understated wording anywhere in index.html', /overstat|understat/i.test(SRC), false);
    check('G.harness', 'The probe program extracted the production chain (no decision function shimmed)', ENTRIES.filter(n => program().names.indexOf(n) < 0), []);
  });
}

// ───────────────────────────── mutants (§25) ─────────────────────────────

const LOW_RC = 'S.realityCheck && S.realityCheck.ym === currentYM() && toNum(S.realityCheck.amount) < 300';
const MUTANTS = {
  'balance subtracts from room': { m: [['computeAffordabilityContext', [['    suggestableRoom = realityAdjustment.suggestableAfterReality;\n', '    suggestableRoom = realityAdjustment.suggestableAfterReality;\n    if (state.realityCheck && state.realityCheck.ym === currentYM()) suggestableRoom = Math.max(0, Math.min(suggestableRoom, toNum(state.realityCheck.amount) - breathingRoomFloor));\n']]]], run: [invarianceMl500] },
  'low balance raises the floor': { m: [['geodeStage62BreathingRoomFloor', [['  return Math.max(0, Math.round(base));', '  var __rs = geodeRealityStatus(); if (__rs.hasData && __rs.amount < calcMonthlyLeftover(state)) base *= 1.22;\n  return Math.max(0, Math.round(base));']]]], run: [invarianceMl500] },
  'Reality sets protect_flexibility': { m: [['geodeGetContextPosture', [["  var tone = 'calm';\n", "  var tone = 'calm';\n  var __rs = geodeRealityStatus(); if (__rs.hasData && __rs.amount < calcMonthlyLeftover(state)) { posture = 'protect_flexibility'; tone = 'cautious'; reasonCodes.push('reality_balance_below_plan'); }\n"]]]], run: [posture] },
  'confidence uses the gap': { m: [['computeAffordabilityContext', [['  var out = {\n', '  var __rs = geodeRealityStatus(); if (__rs.hasData && Math.abs(__rs.amount - planRoom) > 150) confidence = \'low\';\n  var out = {\n']]]], run: [invarianceMl500] },
  'gate requires balance near Monthly Left': { m: [['geodeRunAffordGatedAction', [['    if (okOn) {', '    var __rs = geodeRealityStatus(); if (okOn && (!__rs.hasData || Math.abs(__rs.amount - calcMonthlyLeftover(S)) > 150)) okOn = false;\n    if (okOn) {']]]], run: [gate] },
  'old shift renders': { m: [['geodeRealityPageHtml', [['  h += ev;\n', '  h += ev;\n  if (S.realityPlanAlignment) h += \'<div>How this month could shift</div>\';\n']]]], run: [realityPage] },
  'legacy overlay changes a recommendation': { m: [['getMonthPlan', [['  // Rank priorities 1..3 even if fewer items exist.', '  if (S.realityPlanAlignment && S.realityPlanAlignment.stepAdjustments) steps.forEach(function (s) { s.amount = Math.round(s.amount / 2); });\n  // Rank priorities 1..3 even if fewer items exist.']]]], run: [overlay] },
  'Home says overstated': { m: [['geodePickHumanMoment', [['function geodePickHumanMoment(state) {', 'function geodePickHumanMoment(state) {\n  var __rs = geodeRealityStatus(); if (__rs.hasData && __rs.amount < calcMonthlyLeftover(S)) return { title: \'Reality\', body: \'Your plan may be overstated.\' };']]]], run: [home] },
  'Ask receives the comparison': { m: [['geodeBuildCoachingContext', [["    var balanceBlock = balanceCtxLines.join('\\n');", "    if (rs.hasData) balanceCtxLines.push('Difference from plan: ' + sym + Math.round(toNum(rs.amount) - calcMonthlyLeftover(S)));\n    var balanceBlock = balanceCtxLines.join('\\n');"]]]], run: [ask] },
  'page renders Difference': { m: [['geodeRealityPageHtml', [["  ev += '</div>';\n\n  var h = '';", "  if (rs.hasData) ev += '<div class=\"reality-row\"><span class=\"reality-key\">Difference</span><span>' + fm(toNum(rs.amount) - calcMonthlyLeftover(S)) + '</span></div>';\n  ev += '</div>';\n\n  var h = '';"]]]], run: [realityPage] },
  'low balance changes the debt step': { m: [['getMonthPlan', [['    overpay = geodeFinancialMemorySoftenedAmount(overpay, memoryMods.debtExtraMultiplier, 50, false);', '    overpay = geodeFinancialMemorySoftenedAmount(overpay, memoryMods.debtExtraMultiplier, 50, false);\n    if (' + LOW_RC + ') overpay = Math.max(50, Math.round(overpay / 2));']]]], run: [invarianceSteps] },
  'low balance changes the buffer step': { m: [['getMonthPlan', [['    var ef = Math.min(Math.round(budget * emCap), unscheduledGap, budget);', '    var ef = Math.min(Math.round(budget * emCap), unscheduledGap, budget);\n    if (' + LOW_RC + ') ef = Math.round(ef / 2);']]]], run: [invarianceSteps] },
  'low balance changes the goal step': { m: [['getMonthPlan', [['    topup = geodeFinancialMemorySoftenedAmount(topup, memoryMods.goalRecoveryMultiplier, 20, false);', '    topup = geodeFinancialMemorySoftenedAmount(topup, memoryMods.goalRecoveryMultiplier, 20, false);\n    if (' + LOW_RC + ') topup = Math.max(20, Math.round(topup / 2));']]]], run: [invarianceSteps] },
  'low balance changes the investment step': { m: [['getMonthPlan', [['    invest = geodeFinancialMemorySoftenedAmount(invest, memoryMods.investmentMultiplier, 50, true);', '    invest = geodeFinancialMemorySoftenedAmount(invest, memoryMods.investmentMultiplier, 50, true);\n    if (' + LOW_RC + ') invest = Math.round(invest / 2);']]]], run: [invarianceSteps] },
  'receipts enter the room calculation': { m: [['computeAffordabilityContext', [['  var planRoom = calcMonthlyLeftover(state);', '  var planRoom = calcMonthlyLeftover(state) + (geodeIncomeReceiptLedger(state.incomeReceipts, currentYM()).month.total || 0) * 0.1;']]]], run: [receipts] },
  'memory profile reads the balance': { m: [['geodeFinancialMemoryPlanModifiers', [['function geodeFinancialMemoryPlanModifiers(state, affordability, posture) {', 'function geodeFinancialMemoryPlanModifiers(state, affordability, posture) {\n  var __rs = geodeRealityStatus(); if (__rs.hasData && __rs.amount < calcMonthlyLeftover(state)) return { debtExtraMultiplier: 0.7, goalRecoveryMultiplier: 0.7, investmentMultiplier: 0.5, bufferPreference: \'preserve\', realityShiftMultiplier: 1, preserveBreathingRoom: true, reasonCodes: [\'reality_balance_below_plan\'], confidence: \'moderate\' };']]]], run: [invarianceSteps] }
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
  invarianceMl500();
  invarianceSteps();
  posture();
  gate();
  home();
  ask();
  realityPage();
  record();
  overlay();
  receipts();
  guards();
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  let cur = '';
  results.forEach(r => {
    if (r.section !== cur) { cur = r.section; console.log('\n== ' + cur); }
    console.log((r.ok ? '  PASS ' : '  FAIL ') + r.id + '  ' + r.text + (r.ok ? '' : '\n         ' + r.detail));
  });
  console.log('\n== MUTANTS (§25): each must be killed by a check above');
  const ms = runMutants();
  ms.forEach(m => console.log((m.killed ? '  KILLED   ' : '  SURVIVED ') + m.name + (m.killed ? '  (' + m.by.join(', ') + ')' : '') + (m.note ? '  ' + m.note : '')));
  const survived = ms.filter(m => !m.killed).length;
  console.log('\nSummary: PASS: ' + pass + ' FAIL: ' + fail + '  MUTANTS: ' + (ms.length - survived) + '/' + ms.length + ' killed  (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
  const ok = fail === 0 && survived === 0;
  console.log('RESULT: ' + (ok ? 'PASS' : 'FAIL'));
  process.exit(ok ? 0 : 1);
}

main();
