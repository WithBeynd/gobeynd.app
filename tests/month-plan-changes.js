#!/usr/bin/env node
/**
 * P3-4D month plan changes: geodeLivingMonthModel(state, now).changes — how the current month plan differs from the
 * month's baseline record (S.monthBaseline, P3-4C). Plan movement only: never money received, paid out or held.
 *
 * The pure matrix runs the production model (and every function it reaches) in the Living Month harness: storage, the
 * DOM, save and recurrence are traps, the clock is simulated, and the page state S is a decoy. Baselines are made by
 * the production constructor from the plan before a change, so both sides use the one component derivation. Checks: the
 * output contract, availability reasons, sign convention, reconciliation, the penny threshold, direction, each
 * component, settlements, contributions, debt payments, releases, valuations, expectation gaps, baseline kind and
 * time, purity, the state argument, independence from the old snapshot comparison, and source mutants. End-to-end
 * flows then run in the cross-month harness's simulated app: the change model follows real actions while the record
 * and storage stay as P3-4C left them.
 *
 * Run: node tests/month-plan-changes.js
 */
'use strict';

const vm = require('vm');
const lm = require('./living-month-read-model.js');
const cm = require('./cross-month-financial-truth.js');

const { INDEX, canon, base, bill, paidMonthly, billEvent, expense, at, NOW } = lm;
const NAMES = ['income', 'outgoings', 'allocations', 'fromEarlier', 'expensesRegular', 'expensesOneOff'];
/** The record's observation time: 8 October, 09:00 — later than the month's start, as month_open records may be. */
const OBS = at(2026, 10, 8, 9);
const clone = o => JSON.parse(JSON.stringify(o));

// ───────────────────────────── fixtures (clock: 15 Oct 2026) ─────────────────────────────

/**
 * Income £3,000. Rent £1,000 (due 20th), phone £100 (18th) and a card payment £200 (28th) are scheduled outgoings; the
 * Holiday contribution £100 (25th) an allocation; a dentist one-off £100 due 20 September is from earlier; food £500 a
 * month is regular expense plan. Components [3000, 1300, 100, 100, 500, 0], Monthly Left £1,000.
 */
function plan(edit) {
  const s = base({
    income: 3000,
    goals: [{ id: 'g1', name: 'Holiday', target: 2000, saved: 400, baseSaved: 300 }],
    debts: [{ id: 'd1', name: 'Card', balance: 5000, apr: 20, minp: 150 }],
    investments: [{ id: 'i1', name: 'ISA', balance: 5000, baseBalance: 5000,
      valuations: [{ id: 'val_sep', value: 5000, date: '2026-09-01', recordedAt: at(2026, 9, 1, 9), source: 'manual' }] }],
    payments: [
      bill('rent', 1000, '2026-10-20'),
      bill('phone', 100, '2026-10-18'),
      bill('card', 200, '2026-10-28', { debtId: 'd1' }),
      bill('hol', 100, '2026-10-25', { goalId: 'g1' }),
      bill('dentist', 100, '2026-09-20', { rec: 'no' })
    ],
    expenses: [expense('food', 500, 'yes', '2026-10-01')]
  });
  if (edit) edit(s);
  return s;
}
const row = (s, id) => s.payments.filter(p => p.id === id)[0];
const put = (s, id, r) => { s.payments = s.payments.map(p => (p.id === id ? r : p)); };
const drop = (s, id) => { s.payments = s.payments.filter(p => p.id !== id); };
const BASE_FIGS = [3000, 1300, 100, 100, 500, 0];
const GIFT = () => expense('gift', 75, 'no', '2026-10-12');
const contributionEvent = amount => ({ id: 'ce_hol', eventType: 'completion', paymentId: 'hol', entityType: 'goal', entityId: 'g1', occurrenceYm: '2026-10',
  amount, recurrence: 'monthly', dueDateSnapshot: '2026-10-25', recordedAt: at(2026, 10, 14, 9), source: 'mark_completed' });
const debtEvent = amount => ({ id: 'dpe_card', eventType: 'completion', paymentId: 'card', debtId: 'd1', amount, occurrenceYm: '2026-10', recordedAt: at(2026, 10, 14, 9),
  dueDateSnapshot: '2026-10-28', debtNameSnapshot: 'Card', paymentNameSnapshot: 'card', recurrenceSnapshot: 'monthly', source: 'mark_completed' });
const release = () => ({ id: 'rel_oct', sourceType: 'goal', sourceId: 'g1', amount: 300, reason: 'emergency', date: '2026-10-08', ym: '2026-10', relatedYm: '2026-10',
  remainingBalance: 100, createdAt: at(2026, 10, 8, 10), confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' });
const rentGap = () => ({ id: 'gap_rent_2026-07', domain: 'bill', targetId: 'rent', paymentId: 'rent', recurrence: 'monthly', fromYm: '2026-07', toYm: '2026-09',
  expectedAmount: 1000, dueDay: 20, templateNameSnapshot: 'rent', targetNameSnapshot: '', seenYm: '2026-06', capturedAt: at(2026, 10, 1, 8), capturedBy: 'rev_x', source: 'month_boundary' });

// ───────────────────────────── the pure matrix (run per source, so mutants can be judged) ─────────────────────────────

function checksFor(src) {
  const results = [];
  let group = '';
  /** A section that throws fails as one check and the next section still runs. */
  const section = (name, fn) => {
    group = name;
    try { fn(); } catch (e) { results.push({ group, id: 'section.threw', text: 'the section threw', ok: false, detail: String(e && e.message || e) }); }
  };
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const program = lm.buildProgram(src, ['geodeMonthBaselineFromModel', 'geodeLivingMonthChanges']);
  const ctx = lm.newContext(program);
  vm.runInContext('__nowMs = ' + NOW + ';', ctx);
  const parse = o => ctx.__parse(JSON.stringify(o));
  const vmDate = ms => vm.runInContext('new Date(' + ms + ')', ctx);
  const trapLog = () => JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', ctx));
  const clearTraps = () => vm.runInContext('__trapLog = [];', ctx);
  const modelOf = (state, nowMs) => { clearTraps(); return ctx.geodeLivingMonthModel(state, vmDate(nowMs == null ? NOW : nowMs)); };
  const model = (raw, nowMs) => modelOf(parse(raw), nowMs);
  /** The production record of a plan, as P3-4C would store it (plain data). */
  const record = (raw, kind, observedAt) => clone(ctx.geodeMonthBaselineFromModel(model(raw), kind || 'month_open', observedAt == null ? OBS : observedAt));
  const withRecord = (raw, rec) => Object.assign(clone(raw), { monthBaseline: rec });
  /** The changes of `after` against the record of `before`. */
  const compare = (before, after, kind) => model(withRecord(after, record(before, kind))).changes;
  const brief = c => (c.available ? [c.monthlyLeftDelta, c.direction, c.changed, NAMES.map(n => c.components[n].delta)] : ['unavailable', c.reason]);
  const movedNames = c => NAMES.filter(n => c.components[n].changed);
  const direct = (current, baseline) => ctx.geodeLivingMonthChanges(parse(current), parse(baseline), '2026-10');
  vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(plan(s => { s.income = 99999; }))) + ');', ctx);

  const a = compare(plan(), plan());
  const pureRaw = withRecord(plan(s => { s.income = 3200; }), record(plan()));
  const pureChanges = model(pureRaw).changes;

  section('P3-4D CONTRACT — the shape of changes, and the one component derivation', () => {
    check('contract.keys', 'available, basis plan, baseline { kind, ym, observedAt }, monthlyLeftDelta, direction, changed, components; each component { baseline, current, delta, changed }',
      [Object.keys(a), a.basis, Object.keys(a.baseline), Object.keys(a.components), NAMES.map(n => Object.keys(a.components[n]).join(','))],
      [['available', 'basis', 'baseline', 'monthlyLeftDelta', 'direction', 'changed', 'components'], 'plan', ['kind', 'ym', 'observedAt'], NAMES, NAMES.map(() => 'baseline,current,delta,changed')]);
    const m0 = model(plan());
    const comp = ctx.geodeLivingMonthComponents(m0);
    const rec0 = record(plan());
    check('contract.one-derivation', 'The record and the current side are the same derivation: the components of the plan equal its record field for field, and reconcile to the model\'s Monthly Left (£1,000)',
      [NAMES.concat(['monthlyLeft']).map(n => comp[n] === rec0[n]), NAMES.map(n => comp[n]), comp.monthlyLeft === m0.plan.monthlyLeft, m0.plan.monthlyLeft],
      [NAMES.concat(['monthlyLeft']).map(() => true), BASE_FIGS, true, 1000]);
    check('contract.components-ready-only', 'The derivation gives nothing for a model that is not ready (never zeros)',
      [ctx.geodeLivingMonthComponents(Object.assign({}, m0, { status: 'boundary_pending' })), ctx.geodeLivingMonthComponents(null)], [null, null]);
    check('contract.no-cash', 'No key or value in changes names cash, receipts, actual income or spending, a bank balance, safe-to-spend or disposable money, or better / worse',
      lm.words(compare(plan(), plan(s => { s.income = 3200; row(s, 'rent').amount = 1100; s.expenses.push(GIFT()); })))
        .filter(w => /^k:.*(cash|receiv|actual|spent|spending|bank|safe|disposable|receipt)/i.test(w) || /^v:.*(cash|receiv|actual|spent|spending|bank|better|worse|good|bad|improv|deteriorat)/i.test(w)),
      []);
  });

  section('P3-4D A–P — each component, its sign, and Monthly Left (delta = current − baseline)', () => {
    check('A.no-change', 'A. The same plan: available, every delta 0, Monthly Left unchanged, nothing changed; baseline and current shown per component',
      [brief(a), NAMES.map(n => [a.components[n].baseline, a.components[n].current]), a.baseline], [[0, 'unchanged', false, [0, 0, 0, 0, 0, 0]],
        BASE_FIGS.map(v => [v, v]), { kind: 'month_open', ym: '2026-10', observedAt: OBS }]);
    const cases = [
      ['B.income-up', 'B. Planned income £3,000 → £3,200: income +£200, Monthly Left +£200 (higher) — planned, never received', s => { s.income = 3200; }, [200, 'higher', true, [200, 0, 0, 0, 0, 0]]],
      ['C.income-down', 'C. Planned income £3,000 → £2,800: income −£200, Monthly Left −£200 (lower)', s => { s.income = 2800; }, [-200, 'lower', true, [-200, 0, 0, 0, 0, 0]]],
      ['D.outgoings-up', 'D. Rent £1,000 → £1,050: scheduled outflows +£50, Monthly Left −£50', s => { row(s, 'rent').amount = 1050; }, [-50, 'lower', true, [0, 50, 0, 0, 0, 0]]],
      ['E.outgoings-down', 'E. Rent £1,000 → £950: scheduled outflows −£50, Monthly Left +£50', s => { row(s, 'rent').amount = 950; }, [50, 'higher', true, [0, -50, 0, 0, 0, 0]]],
      ['F.allocation-up', 'F. Holiday contribution £100 → £200: allocations +£100 (never outgoings), Monthly Left −£100', s => { row(s, 'hol').amount = 200; }, [-100, 'lower', true, [0, 0, 100, 0, 0, 0]]],
      ['G.allocation-down', 'G. Holiday contribution removed: allocations −£100, Monthly Left +£100', s => { drop(s, 'hol'); }, [100, 'higher', true, [0, 0, -100, 0, 0, 0]]],
      ['J.regular-up', 'J. Food £500 → £580: regular expense plan +£80, Monthly Left −£80', s => { s.expenses[0].amount = 580; }, [-80, 'lower', true, [0, 0, 0, 0, 80, 0]]],
      ['K.regular-down', 'K. Food £500 → £420: regular expense plan −£80, Monthly Left +£80', s => { s.expenses[0].amount = 420; }, [80, 'higher', true, [0, 0, 0, 0, -80, 0]]],
      ['L.one-off-up', 'L. A one-off £75 expense plan added (dated 12 October): one-off expense plan +£75, Monthly Left −£75', s => { s.expenses.push(GIFT()); }, [-75, 'lower', true, [0, 0, 0, 0, 0, 75]]],
      ['N.offset', 'N. Income +£100 and rent +£100: the plan changed (changed true) but Monthly Left did not (unchanged)', s => { s.income = 3100; row(s, 'rent').amount = 1100; }, [0, 'unchanged', true, [100, 100, 0, 0, 0, 0]]],
      ['O.net-positive', 'O. Income +£300, food +£80: Monthly Left +£220 (higher)', s => { s.income = 3300; s.expenses[0].amount = 580; }, [220, 'higher', true, [300, 0, 0, 0, 80, 0]]],
      ['P.net-negative', 'P. Income +£50, Holiday +£100, a £75 one-off: Monthly Left −£125 (lower)', s => { s.income = 3050; row(s, 'hol').amount = 200; s.expenses.push(GIFT()); }, [-125, 'lower', true, [50, 0, 100, 0, 0, 75]]]
    ];
    cases.forEach(([id, text, edit, expected]) => {
      const c = compare(plan(), plan(edit));
      check(id, text, brief(c), expected);
    });
    check('M.one-off-down', 'M. Baseline with the £75 one-off, now removed: one-off expense plan −£75, Monthly Left +£75',
      brief(compare(plan(s => { s.expenses.push(GIFT()); }), plan())), [75, 'higher', true, [0, 0, 0, 0, 0, -75]]);
    const dentistPaid = s => { Object.assign(row(s, 'dentist'), { status: 'paid' }); };
    check('H.from-earlier-up', 'H. The September dentist was completed when the record was made (no month counts it now), and the completion was later undone: from earlier +£100, outgoings unmoved, Monthly Left −£100',
      brief(compare(plan(dentistPaid), plan())), [-100, 'lower', true, [0, 0, 0, 100, 0, 0]]);
    const fromEarlierDown = compare(plan(), plan(dentistPaid));
    check('I.from-earlier-down', 'I. The September dentist completed after the record: from earlier −£100 and Monthly Left +£100 — not disguised as a scheduled outflow change (outgoings 0)',
      [brief(fromEarlierDown), movedNames(fromEarlierDown)], [[100, 'higher', true, [0, 0, 0, -100, 0, 0]], ['fromEarlier']]);
    NAMES.forEach(n => {
      const c = compare(plan(), plan(s => { s.income = 3123.45; row(s, 'rent').amount = 987.65; row(s, 'hol').amount = 150.5; dentistPaid(s); s.expenses[0].amount = 512.34; s.expenses.push(GIFT()); }));
      check('sign.' + n, 'Sign convention: ' + n + ' delta is exactly current − baseline', c.components[n].delta === c.components[n].current - c.components[n].baseline, true);
    });
  });

  section('P3-4D Q–X — settlements, contributions, debts, releases, valuations and gaps follow production Monthly Left', () => {
    const phonePaid = amount => s => {
      put(s, 'phone', paidMonthly('phone', 100, '2026-10-18', { lastPaidAmount: amount }));
      s.billPaymentEvents = [billEvent('phone', amount, '2026-10', at(2026, 10, 14, 9))];
    };
    const q = compare(plan(), plan(phonePaid(100)));
    const qModel = model(withRecord(plan(phonePaid(100)), record(plan())));
    check('Q.settled-same', 'Q. Phone planned £100, completed for £100: no plan change (changed false, Monthly Left delta 0) — the completion stays visible in Happened and done',
      [brief(q), qModel.happened.filter(e => e.type === 'settlement_recorded').map(e => [e.paymentId, e.amount]), qModel.payments.done.map(x => x.id)],
      [[0, 'unchanged', false, [0, 0, 0, 0, 0, 0]], [['phone', 100]], ['phone']]);
    check('R.settled-more', 'R. Phone planned £100, completed for £120 (Monthly Left counts £120): scheduled outflows +£20, Monthly Left −£20 — never +£120',
      brief(compare(plan(), plan(phonePaid(120)))), [-20, 'lower', true, [0, 20, 0, 0, 0, 0]]);
    const holPaid = amount => s => {
      put(s, 'hol', paidMonthly('hol', 100, '2026-10-25', { goalId: 'g1', lastPaidAmount: amount }));
      s.contributionEvents = [contributionEvent(amount)];
      s.goals[0].saved = 400 + amount;
    };
    check('S.contribution-same', 'S. Contribution planned £100, completed £100 (goal saved +£100): no plan change',
      brief(compare(plan(), plan(holPaid(100)))), [0, 'unchanged', false, [0, 0, 0, 0, 0, 0]]);
    const t = compare(plan(), plan(holPaid(130)));
    check('T.contribution-more', 'T. Contribution planned £100, completed £130: allocations +£30, Monthly Left −£30; nothing else moves',
      [brief(t), movedNames(t)], [[-30, 'lower', true, [0, 0, 30, 0, 0, 0]], ['allocations']]);
    const cardPaid = amount => s => {
      put(s, 'card', paidMonthly('card', 200, '2026-10-28', { debtId: 'd1', lastPaidAmount: amount }));
      s.debtPaymentEvents = [debtEvent(amount)];
      s.debts[0].balance = 5000 - amount;
    };
    const u = compare(plan(), plan(cardPaid(200)));
    const u2 = compare(plan(), plan(cardPaid(250)));
    check('U.debt', 'U. Card payment planned £200, completed £200 (debt balance £4,800): no plan change. Completed £250: scheduled outflows +£50 only — no debt balance, principal or interest field anywhere',
      [brief(u), brief(u2), lm.words(u2).filter(w => /debt|balance|principal|interest/i.test(w))], [[0, 'unchanged', false, [0, 0, 0, 0, 0, 0]], [-50, 'lower', true, [0, 50, 0, 0, 0, 0]], []]);
    const relState = plan(s => { s.savingsReleases = [release()]; s.goals[0].saved = 100; });
    const v = compare(plan(), relState);
    check('V.release', 'V. A £300 release from Holiday (goal saved £400 → £100), plan otherwise identical: no plan change; Happened shows the release',
      [brief(v), model(relState).happened.filter(e => e.type === 'release').map(e => e.amount)], [[0, 'unchanged', false, [0, 0, 0, 0, 0, 0]], [300]]);
    const valState = plan(s => { s.investments[0].valuations.push({ id: 'val_oct', value: 5400, date: '2026-10-12', recordedAt: at(2026, 10, 12, 9), source: 'manual' }); s.investments[0].balance = 5400; });
    check('W.valuation', 'W. The ISA valued at £5,400 on 12 October (balance £5,000 → £5,400): no plan change; Happened shows the valuation',
      [brief(compare(plan(), valState)), model(valState).happened.filter(e => e.type === 'valuation').map(e => e.value)], [[0, 'unchanged', false, [0, 0, 0, 0, 0, 0]], [5400]]);
    const gapState = plan(s => { s.expectationGaps = [rentGap()]; });
    const resolved = plan(s => { s.expectationGaps = [rentGap()]; s.billPaymentEvents = [billEvent('rent', 1000, '2026-08', at(2026, 10, 9, 9))]; });
    check('X.gaps', 'X. An expectation gap added (rent July–September), or one month of it resolved by a recorded completion: no plan change; the gaps stay evidence only',
      [brief(compare(plan(), gapState)), brief(compare(gapState, resolved)), model(gapState).earlier.gapCount, model(resolved).earlier.gapCount],
      [[0, 'unchanged', false, [0, 0, 0, 0, 0, 0]], [0, 'unchanged', false, [0, 0, 0, 0, 0, 0]], 3, 2]);
  });

  section('P3-4D Y/Z — baseline kind and observation time are metadata, kept as recorded', () => {
    const y = compare(plan(), plan(s => { s.income = 3200; }), 'month_open');
    const z = compare(plan(), plan(s => { s.income = 3200; }), 'first_observed');
    check('Y.month-open', 'Y. A month_open record observed on 8 October: kind month_open, observedAt 8 October 09:00 exactly (not moved to the 1st, not a payment time)',
      [y.baseline, y.baseline.observedAt === at(2026, 10, 8, 9)], [{ kind: 'month_open', ym: '2026-10', observedAt: OBS }, true]);
    check('Z.first-observed', 'Z. A first_observed record: kind first_observed, never collapsed into month_open; the deltas are the same arithmetic',
      [z.baseline.kind, brief(z)], ['first_observed', brief(y)]);
  });

  section('P3-4D AA–AE — availability: unknown never becomes zero', () => {
    const reasonFor = rec => model(withRecord(plan(), rec)).changes;
    const OCT_REC = record(plan());
    check('AA.none', 'AA. No record: { available: false, reason: no_month_baseline } and nothing else', model(plan()).changes, { available: false, reason: 'no_month_baseline' });
    check('AB.malformed', 'AB. A malformed record (income as text, not reconciling, an extra field, an unknown kind, garbage): invalid_month_baseline — never a zero baseline',
      [Object.assign({}, OCT_REC, { income: '3000' }), Object.assign({}, OCT_REC, { monthlyLeft: 1 }), Object.assign({}, OCT_REC, { items: [] }),
        Object.assign({}, OCT_REC, { kind: 'opening' }), 'garbage'].map(reasonFor),
      [0, 1, 2, 3, 4].map(() => ({ available: false, reason: 'invalid_month_baseline' })));
    check('AC.older', 'AC. A September record in October: baseline_month_mismatch',
      reasonFor(Object.assign({}, OCT_REC, { ym: '2026-09', observedAt: at(2026, 9, 8, 9) })), { available: false, reason: 'baseline_month_mismatch' });
    check('AD.future', 'AD. A November record in October (a clock moved back): baseline_month_mismatch',
      reasonFor(Object.assign({}, OCT_REC, { ym: '2026-11', observedAt: at(2026, 11, 2, 9) })), { available: false, reason: 'baseline_month_mismatch' });
    const pendingRaw = withRecord(plan(s => { row(s, 'rent').date = '2026-09-20'; }), OCT_REC);
    check('AE.not-ready', 'AE. A valid October record but no ready model: the reason is the model\'s own (boundary pending, schema 2, a November clock, an invalid clock, no state)',
      [model(pendingRaw).changes, model(Object.assign(withRecord(plan(), OCT_REC), { _schemaVersion: 2 })).changes, model(withRecord(plan(), OCT_REC), at(2026, 11, 2)).changes,
        modelOf(parse(withRecord(plan(), OCT_REC)), NaN).changes, modelOf(null).changes],
      ['boundary_pending', 'schema_not_current', 'clock_month_mismatch', 'invalid_clock', 'invalid_state'].map(r => ({ available: false, reason: r })));
  });

  section('P3-4D AF/AG — penny precision and reconciliation', () => {
    const noisy = compare(plan(s => { s.expenses = [expense('food', 0.3, 'yes', '2026-10-01')]; }),
      plan(s => { s.expenses = [expense('food', 0.1, 'yes', '2026-10-01'), expense('snacks', 0.2, 'yes', '2026-10-01')]; }));
    const noise = noisy.components.expensesRegular.delta;
    check('AF.float-noise', 'AF. Food £0.30 split into £0.10 + £0.20: the raw delta is floating-point noise (non-zero, below 1e-9) and is no change — no "changed by £0.00"',
      [noise !== 0, Math.abs(noise) < 1e-9, noisy.components.expensesRegular.changed, noisy.direction, noisy.changed], [true, true, false, 'unchanged', false]);
    const subPenny = compare(plan(s => { s.income = 3000.004; }), plan(s => { s.income = 3000.006; }));
    check('AF.sub-penny', 'AF. Income £3,000.004 → £3,000.006: a raw 0.2p movement is no change (components are not rounded first, which would read £0.01)',
      [subPenny.components.income.changed, subPenny.changed, subPenny.direction, Math.abs(subPenny.components.income.delta - 0.002) < 1e-9], [false, false, 'unchanged', true]);
    const B0 = oneOff => ({ v: 1, ym: '2026-10', kind: 'month_open', observedAt: OBS, income: 3000, outgoings: 1000, allocations: 0, fromEarlier: 0,
      expensesRegular: 0, expensesOneOff: oneOff, monthlyLeft: 2000 - oneOff });
    const C0 = oneOff => ({ income: 3000, outgoings: 1000, allocations: 0, fromEarlier: 0, expensesRegular: 0, expensesOneOff: oneOff, monthlyLeft: 2000 - oneOff });
    const edge = (from, to) => { const c = direct(C0(to), B0(from)); return [c.components.expensesOneOff.delta === to - from, c.components.expensesOneOff.changed, c.direction, c.changed]; };
    check('AG.threshold', 'AG. One rule, |delta| ≥ £0.005 is movement: +0.49p none; exactly +0.5p, +0.51p moved (Monthly Left lower); −0.49p none; exactly −0.5p moved (higher)',
      [edge(0, 0.0049), edge(0, 0.005), edge(0, 0.0051), edge(0.0049, 0), edge(0.005, 0)],
      [[true, false, 'unchanged', false], [true, true, 'lower', true], [true, true, 'lower', true], [true, false, 'unchanged', false], [true, true, 'higher', true]]);
    const off = d => direct(Object.assign(C0(0), { monthlyLeft: 2000 + d }), B0(0));
    check('AG.reconcile', 'Deltas must reconcile to the Monthly Left delta within £0.005: 0.4p apart is available; 0.6p or £10 apart is changes_not_reconciled (no balancing figure)',
      [off(0.004).available, off(0.006), off(10)], [true, { available: false, reason: 'changes_not_reconciled' }, { available: false, reason: 'changes_not_reconciled' }]);
    check('AG.direct-reasons', 'The comparison alone: no current plan gives plan_not_ready; an absent record no_month_baseline',
      [ctx.geodeLivingMonthChanges(null, parse(B0(0)), '2026-10'), ctx.geodeLivingMonthChanges(parse(C0(0)), undefined, '2026-10')],
      [{ available: false, reason: 'plan_not_ready' }, { available: false, reason: 'no_month_baseline' }]);
  });

  section('P3-4D AH–AJ — purity and the state argument', () => {
    const pureState = parse(pureRaw);
    const before = canon(pureState);
    const writes = [];
    const pm = modelOf(lm.writeTrap(pureState, writes));
    check('purity.trap', 'No write to the state or its record at any depth; no storage, DOM, save, sync or render reached; state and record deep-equal after',
      [pm.changes.available, writes, trapLog(), canon(pureState) === before], [true, [], [], true]);
    check('AH.frozen', 'AH. A deep-frozen state and record give the same changes', (function () {
      const freeze = o => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(k => freeze(o[k])); } return o; };
      return canon(modelOf(freeze(parse(pureRaw))).changes) === canon(pm.changes);
    })(), true);
    const decoy = plan(s => { s.income = 12345; });
    decoy.monthBaseline = Object.assign(record(decoy), { observedAt: at(2026, 10, 2, 9) });
    vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(decoy)) + ');', ctx);
    const underDecoy = canon(model(pureRaw).changes);
    const noRecordUnderDecoy = model(plan()).changes;
    vm.runInContext('S = {};', ctx);
    check('AI.decoy-S', 'AI. The page state S holding another plan and another valid October record changes nothing: the supplied state\'s record decides (with none supplied, none is borrowed from S)',
      [underDecoy === canon(model(pureRaw).changes), underDecoy === canon(pm.changes), noRecordUnderDecoy], [true, true, { available: false, reason: 'no_month_baseline' }]);
    const r1 = modelOf(pureState).changes, r2 = modelOf(pureState).changes;
    const stateObjects = lm.objectsIn(pureState, new Set());
    r1.components.income.delta = -1; r1.baseline.kind = 'x'; r1.components.outgoings = null;
    check('AJ.fresh', 'AJ. Repeated calls give equal, separate objects; mutating one result changes neither the next, the state nor the record; no result object belongs to the state',
      [r1 !== r2, canon(r2) === canon(pm.changes), canon(pureState) === before, [...lm.objectsIn(r2, new Set())].filter(o => stateObjects.has(o)).length], [true, true, true, 0]);
  });

  section('P3-4D §29 — independent of the old confirmed-only and snapshot comparison', () => {
    const closure = entries => {
      const have = new Map(), queue = entries.slice();
      while (queue.length) {
        const n = queue.shift();
        if (have.has(n)) continue;
        let f;
        try { f = lm.extractFunction(src, n); } catch (e) { continue; }
        have.set(n, f.text);
        lm.calledNames(f.text).forEach(c => queue.push(c));
      }
      return [...have.values()].join('\n').replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
    };
    const OLD_WORDS = ['calcMonthlyLeftoverConfirmedOnly', 'sumPaymentsMonthlyOutflowConfirmedOnly', 'lastSnapshot', '_pendingCompareBaseline', 'captureMonthlySnapshot', 'setLastSnapshotBeforeChange'];
    const changesCode = closure(['geodeLivingMonthChanges', 'geodeLivingMonthComponents']);
    check('old.static', 'Nothing the model reaches names the confirmed-only figure, lastSnapshot, _pendingCompareBaseline or the snapshot writers; the change code also names no activity log or snapshots',
      [OLD_WORDS.filter(w => closure(['geodeLivingMonthModel']).indexOf(w) >= 0), OLD_WORDS.concat(['activityLog', 'snapshots']).filter(w => changesCode.indexOf(w) >= 0)], [[], []]);
    const oldSystem = s => {
      s.lastSnapshot = { leftThisMonth: 99, totalDebt: 1, totalSaved: 2, totalInvestments: 3, netWorth: 4, ts: at(2026, 10, 1, 9) };
      s.snapshots = { '2026-10': { leftThisMonth: 50 }, '2026-09': { leftThisMonth: 7000 } };
      s.activityLog = [{ ts: at(2026, 10, 9, 9), type: 'income', delta: 5000 }, { ts: at(2026, 10, 10, 9), type: 'payment', delta: -400 }];
    };
    vm.runInContext('var _pendingCompareBaseline = { leftThisMonth: 1, income: 1 };', ctx);
    const withOld = model(withRecord(plan(s => { s.income = 3200; oldSystem(s); }), record(plan(oldSystem)))).changes;
    check('old.behaviour', 'A different lastSnapshot, monthly snapshots, activity log (income and payment entries) and a page _pendingCompareBaseline change nothing: the same +£200 income plan change',
      [withOld.available, canon(withOld) === canon(pureChanges)], [true, true]);
  });

  return results;
}

// ───────────────────────────── source mutants ─────────────────────────────

const MUTANTS = {
  'wrong sign for outgoings': [['components.income.delta - components.outgoings.delta', 'components.income.delta + components.outgoings.delta']],
  'wrong sign for expenses': [['-\n    components.expensesRegular.delta - components.expensesOneOff.delta;', '+\n    components.expensesRegular.delta + components.expensesOneOff.delta;']],
  'allocations included in outgoings': [['outgoings: model.plan.paymentsCountedTotal - allocations - fromEarlier,', 'outgoings: model.plan.paymentsCountedTotal - fromEarlier,']],
  'fromEarlier included in outgoings': [['outgoings: model.plan.paymentsCountedTotal - allocations - fromEarlier,', 'outgoings: model.plan.paymentsCountedTotal - allocations,']],
  'release included in change': [
    ['    income: model.plan.incomePlanned,\n    outgoings: model.plan.paymentsCountedTotal',
      "    income: model.plan.incomePlanned + (model.happened || []).filter(function (e) { return e.type === 'release'; }).reduce(function (t, e) { return t + e.amount; }, 0),\n    outgoings: model.plan.paymentsCountedTotal"],
    ['    monthlyLeft: model.plan.monthlyLeft\n  };\n}', "    monthlyLeft: model.plan.monthlyLeft + (model.happened || []).filter(function (e) { return e.type === 'release'; }).reduce(function (t, e) { return t + e.amount; }, 0)\n  };\n}"]],
  'valuation included in change': [
    ['    income: model.plan.incomePlanned,\n    outgoings: model.plan.paymentsCountedTotal',
      "    income: model.plan.incomePlanned + (model.happened || []).filter(function (e) { return e.type === 'valuation'; }).reduce(function (t, e) { return t + e.value; }, 0),\n    outgoings: model.plan.paymentsCountedTotal"],
    ['    monthlyLeft: model.plan.monthlyLeft\n  };\n}', "    monthlyLeft: model.plan.monthlyLeft + (model.happened || []).filter(function (e) { return e.type === 'valuation'; }).reduce(function (t, e) { return t + e.value; }, 0)\n  };\n}"]],
  'settlement treated as full delta': [
    ['outgoings: model.plan.paymentsCountedTotal - allocations - fromEarlier,', 'outgoings: model.plan.paymentsCountedTotal + model.payments.doneTotal - allocations - fromEarlier,'],
    ['    monthlyLeft: model.plan.monthlyLeft\n  };\n}', '    monthlyLeft: model.plan.monthlyLeft - model.payments.doneTotal\n  };\n}']],
  'global S baseline used': [['state.monthBaseline, cal.ym)', 'S.monthBaseline, cal.ym)']],
  'round before reconcile': [
    ['    var d = current[n] - baseline[n];', '    var d = Math.round(current[n] * 100) / 100 - Math.round(baseline[n] * 100) / 100;'],
    ['  var monthlyLeftDelta = current.monthlyLeft - baseline.monthlyLeft;', '  var monthlyLeftDelta = Math.round(current.monthlyLeft * 100) / 100 - Math.round(baseline.monthlyLeft * 100) / 100;']],
  'malformed baseline treated as zero': [["  if (status !== 'current') {\n    return { available: false",
    "  if (status === 'malformed') baseline = { kind: 'first_observed', ym: ym, observedAt: 0, income: 0, outgoings: 0, allocations: 0, fromEarlier: 0, expensesRegular: 0, expensesOneOff: 0, monthlyLeft: 0 };\n  else if (status !== 'current') {\n    return { available: false"]],
  'older baseline used': [["  if (status !== 'current') {\n    return { available: false", "  if (status !== 'current' && status !== 'older') {\n    return { available: false"]],
  'balancing figure forced': [["  if (!(Math.abs(monthlyLeftDelta - implied) <= 0.005)) return { available: false, reason: 'changes_not_reconciled' };", '  monthlyLeftDelta = implied;']],
  'float noise reported': [['    return Math.abs(d) >= 0.005;', '    return d !== 0;']],
  'confirmed-only remainder': [['    monthlyLeft: model.plan.monthlyLeft\n  };\n}', '    monthlyLeft: model.plan.incomePlanned - model.payments.doneTotal - model.plan.budgetTotal\n  };\n}']]
};

// ───────────────────────────── end to end (cross-month harness) ─────────────────────────────

function endToEnd() {
  const results = [];
  const group = 'P3-4D END TO END — the change model follows real actions; the record and storage stay as P3-4C left them';
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const NEW = cm.init().commit;
  const r2 = v => Math.round(v * 100) / 100;
  const call = (page, expr) => JSON.parse(page.run('JSON.stringify(' + expr + ')'));
  const changes = page => call(page, 'geodeLivingMonthModel(S, Date.now()).changes');
  const sum = c => (c.available ? [r2(c.monthlyLeftDelta), c.direction, c.changed, NAMES.map(n => r2(c.components[n].delta))] : ['unavailable', c.reason]);
  const raw = page => page.run('__store');
  const storedBl = page => JSON.stringify(JSON.parse(raw(page)).monthBaseline);
  const formIncome = (page, v) => page.run('__fields = { mi: ' + JSON.stringify(String(v)) + ' }; __toasts = []; openModal(""); __runTimers(); saveInc(); __runTimers();');
  const formExpense = (page, f) => page.run('__fields = ' + JSON.stringify(f) + '; __toasts = []; openModal(""); __runTimers(); saveExp(""); __runTimers();');
  const PLAN = ym => ({
    _schemaVersion: 3, income: 3000, incomeExplicitlySet: true, expectationGaps: [], expectationFloorYm: ym,
    payments: [
      { id: 'rent', name: 'Rent', amount: 1000, rec: 'yes', status: 'upcoming', date: ym + '-15' },
      { id: 'hol', name: 'Holiday monthly', amount: 100, rec: 'yes', status: 'upcoming', date: ym + '-05', goalId: 'gH' },
      { id: 'fine', name: 'Parking fine', amount: 60, rec: 'no', status: 'upcoming', date: '2026-09-25' }
    ],
    expenses: [{ id: 'food', name: 'Food', amount: 400, rec: 'yes', cat: 'food', date: ym + '-01' }],
    goals: [{ id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' }],
    investments: [], debts: [], savingsReleases: [], debtPaymentEvents: [], activityLog: [], lastSuggestedActions: []
  });

  const page = new cm.App(PLAN('2026-09'), '2026-09-20', NEW);
  page.advance('2026-10-08', 'reload');
  const rec = storedBl(page);
  const opened = changes(page);
  check('E2E.open', 'Opened on 8 October after a September write: the roll stores the month_open record (P3-4C) and changes are available with nothing moved',
    [JSON.parse(rec).kind, opened.baseline.kind, sum(opened)], ['month_open', 'month_open', [0, 'unchanged', false, [0, 0, 0, 0, 0, 0]]]);
  page.toggle('rent');
  check('E2E.settle', 'Rent completed for its planned £1,000 (togglePay): no plan change', sum(changes(page)), [0, 'unchanged', false, [0, 0, 0, 0, 0, 0]]);
  page.toggle('fine');
  check('E2E.from-earlier', 'The September parking fine completed in October: from earlier −£60, Monthly Left +£60, outgoings unmoved', sum(changes(page)), [60, 'higher', true, [0, 0, 0, -60, 0, 0]]);
  page.toggle('fine');
  formIncome(page, 3200);
  check('E2E.income', 'The fine\'s completion undone, then planned income £3,000 → £3,200 through the income form: income +£200, Monthly Left +£200', sum(changes(page)), [200, 'higher', true, [200, 0, 0, 0, 0, 0]]);
  formExpense(page, { en: 'Vet', ea: '75', ed: '2026-10-08', ecat: 'other', er: 'no' });
  const after = changes(page);
  check('E2E.one-off', 'A £75 one-off expense through the expense form: one-off expense plan +£75; net Monthly Left +£125', sum(after), [125, 'higher', true, [200, 0, 0, 0, 0, 75]]);
  const stored = JSON.parse(raw(page));
  check('E2E.read-only', 'Through every action the stored record is byte-identical (P3-4D never rewrites it) and nothing new is persisted: no changes or delta field in storage',
    [storedBl(page) === rec, JSON.stringify(page.state().monthBaseline) === rec, Object.keys(stored).filter(k => /change|delta/i.test(k))], [true, true, []]);

  const bad = JSON.parse(raw(page));
  bad.monthBaseline = Object.assign({}, bad.monthBaseline, { income: '3000' });
  const badText = JSON.stringify(bad);
  const view = new cm.App({}, '2026-10-09', NEW, { boot: false });
  view.run('__store = ' + JSON.stringify(badText) + '; __reload();');
  view.run('var __kw = 0, __ks = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY) __kw++; return __ks.call(localStorage, k, v); };');
  const seen = [changes(view), changes(view)];
  check('E2E.malformed-untouched', 'A malformed stored record: changes unavailable (invalid_month_baseline); reading the model writes nothing, never repairs or replaces the record (capture remains P3-4C\'s, at its next write)',
    [seen[0], seen[1], view.run('__kw'), raw(view) === badText, JSON.stringify(view.state().monthBaseline) === JSON.stringify(bad.monthBaseline)],
    [{ available: false, reason: 'invalid_month_baseline' }, { available: false, reason: 'invalid_month_baseline' }, 0, true, true]);
  return results;
}

// ───────────────────────────── run ─────────────────────────────

function main() {
  const results = checksFor(INDEX).concat(endToEnd());
  Object.keys(MUTANTS).forEach(name => {
    let mutated = INDEX;
    MUTANTS[name].forEach(([from, to]) => {
      if (INDEX.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html: ' + name + ': ' + from);
      mutated = mutated.replace(from, () => to);
    });
    let by;
    try {
      by = checksFor(mutated).filter(r => !r.ok).map(r => r.id);
    } catch (e) {
      by = ['threw: ' + e.message];
    }
    results.push({ group: 'P3-4D MUTANTS — each defect is caught by the checks above', id: 'mutant.' + name.replace(/\s+/g, '-'),
      text: 'Caught: ' + name + (by.length ? ' (by ' + by.slice(0, 6).join(', ') + (by.length > 6 ? ', …' : '') + ')' : ''), ok: by.length > 0, detail: by.length ? '' : 'every check still passed' });
  });

  console.log('Beynd month plan changes (P3-4D)');
  let failed = 0;
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(30) + ' ' + r.text + (r.ok ? '' : '\n        ' + r.detail));
  });
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
