#!/usr/bin/env node
'use strict';
/**
 * Beynd P3-5C income receipt read model — dependency-free: node tests/income-receipt-read-model.js
 *
 * geodeLivingMonthModel and everything it reaches run from index.html in the Living Month harness
 * (tests/living-month-read-model.js): a simulated clock, storage / DOM / save / sync traps and a decoy page state S.
 * Checks the model's income contract and Happened items against the P3-5B receipt ledger:
 *   - none_recorded (received null, never £0) / recorded (received = the ledger's month total) / unavailable (a stored
 *     field that is not a list: never repaired, never read as none);
 *   - planned and received stay separate: outstanding and received coverage are always null; nothing enters the plan,
 *     available, payments, expenses, Still ahead, expectation gaps, the P3-4 components or changes;
 *   - one Happened item per active receipt of the model's month — no void, voided, other-month, unknown or future
 *     evidence; no day invented; no deduplication against payments, contributions or releases;
 *   - pure: the supplied state only (decoy S), deep-frozen states, no writes, fresh results;
 *   - the Pulse and detail surfaces show nothing new (P3-5D owns receipt wording).
 * Then each mutant of index.html must fail at least one check.
 * Exit code 0 when every check passes, 1 otherwise.
 */
const vm = require('vm');
const lm = require('./living-month-read-model.js');

const { INDEX, buildProgram, newContext, canon, writeTrap, objectsIn, words, base, bill, paidMonthly, billEvent, expense, at, NOW } = lm;
const NOV = at(2026, 11, 10);

const R = (id, amount, ym, extra) => Object.assign({ id, eventType: 'receipt', amount, ym, recordedAt: at(2026, 10, 14, 9), source: 'manual' }, extra || {});
const V = (id, voidsId, recordedAt) => ({ id, eventType: 'void', voidsId, recordedAt: recordedAt || at(2026, 10, 14, 10), source: 'manual' });
const INCOME_KEYS = ['state', 'planned', 'explicitlySet', 'type', 'certainty', 'received', 'outstanding', 'reason'];

/** The same plan (rent paid, phone ahead, an expense) under different receipt evidence. */
const plan = extra => base(Object.assign({
  payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('phone', 40, '2026-10-20')],
  billPaymentEvents: [billEvent('rent', 1200, '2026-10', at(2026, 10, 1, 9))],
  expenses: [expense('groceries', 400, 'yes', '2026-10-01')]
}, extra || {}));
const VARIANTS = {
  none: () => plan(),
  empty: () => plan({ incomeReceipts: [] }),
  full: () => plan({ incomeReceipts: [R('inc_full', 3000, '2026-10')] }),
  partial: () => plan({ incomeReceipts: [R('inc_p1', 1500, '2026-10'), R('inc_p2', 1000, '2026-10', { date: '2026-10-09' })] }),
  above: () => plan({ incomeReceipts: [R('inc_above', 3200, '2026-10', { label: 'Salary' })] }),
  voided: () => plan({ incomeReceipts: [R('inc_v', 3000, '2026-10'), V('inc_vv', 'inc_v')] }),
  corrected: () => plan({ incomeReceipts: [R('inc_old', 3000, '2026-10'), V('inc_cv', 'inc_old'), R('inc_new', 2900, '2026-10', { recordedAt: at(2026, 10, 14, 10) })] }),
  unknown: () => plan({ incomeReceipts: [R('inc_ob', 3000, '2026-10', { source: 'open_banking' }), { id: 'inc_adj', eventType: 'adjustment', amount: 50, ym: '2026-10', recordedAt: 1, source: 'manual' }, 'x'] }),
  malformed: () => plan({ incomeReceipts: { inc_a: R('inc_a', 3000, '2026-10') } })
};

function checksFor(src) {
  const results = [];
  let group = '';
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const section = name => { group = name; };

  const program = buildProgram(src, ['geodeMonthBaselineFromModel', 'geodeMonthPulseView', 'geodeMonthPulseHtml', 'geodeMonthDetailView']);
  const ctx = newContext(program);
  const parse = obj => ctx.__parse(JSON.stringify(obj));
  const vmDate = ms => vm.runInContext('new Date(' + ms + ')', ctx);
  const trapLog = () => JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', ctx));
  const decoy = obj => vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(obj)) + ');', ctx);
  /** The model of a fresh copy of `raw` at `ms` (default 15 Oct 2026), copied out of the context. */
  const modelOf = (raw, ms) => {
    vm.runInContext('__nowMs = ' + (ms == null ? NOW : ms) + '; __trapLog = [];', ctx);
    return JSON.parse(JSON.stringify(ctx.geodeLivingMonthModel(parse(raw), vmDate(ms == null ? NOW : ms))));
  };
  const incomeItems = m => (m.happened || []).filter(e => e.type === 'income_recorded');
  const incomeOf = m => INCOME_KEYS.map(k => m.income[k]);
  decoy(Object.assign(base({ income: 12345, incomeType: 'irregular', incomeReceipts: [R('inc_decoy', 9999, '2026-10')] }),
    { cur: { sym: '\u00a3', code: 'GBP', loc: 'en-GB' } }));

  section('P3-5C NO EVIDENCE — none recorded is not £0 received');
  const none = modelOf(VARIANTS.none());
  check('A.no-field', 'A. No incomeReceipts field: income none_recorded, received / outstanding null, reason no_receipt_recorded; received coverage null; no income item in Happened',
    [Object.keys(none.income), none.income.state, none.income.received, none.income.outstanding, none.income.reason, none.available.receivedCoverage, incomeItems(none).length],
    [INCOME_KEYS, 'none_recorded', null, null, 'no_receipt_recorded', null, 0]);
  check('B.empty', 'B. An empty list: the same model as no field', canon(modelOf(VARIANTS.empty())), canon(none));
  const stableNone = modelOf(base({ income: 3000, incomeType: 'stable' }));
  const irregularNone = modelOf(base({ income: 1600, incomeType: 'irregular' }));
  check('O.stable-none', 'O. A stable plan with no receipt: none_recorded, received null — planned income is still only a plan',
    [stableNone.income.state, stableNone.income.received, stableNone.income.type, stableNone.plan.incomePlanned], ['none_recorded', null, 'stable', 3000]);
  check('P.irregular-none', 'P. An irregular plan with no receipt: none_recorded, received null, type kept for later wording',
    [irregularNone.income.state, irregularNone.income.received, irregularNone.income.type, irregularNone.income.certainty], ['none_recorded', null, 'irregular', 'irregular_plan']);

  section('P3-5C UNREADABLE EVIDENCE — a stored field that is not a list is neither repaired nor read as none');
  ['object', 'string', 'number', 'null'].forEach((kind, i) => {
    const raw = plan({ incomeReceipts: [{ inc_a: R('inc_a', 3000, '2026-10') }, 'receipts', 3000, null][i] });
    const st = parse(raw);
    const before = canon(st);
    let m = null, err = '';
    try { vm.runInContext('__trapLog = [];', ctx); m = JSON.parse(JSON.stringify(ctx.geodeLivingMonthModel(st, vmDate(NOW)))); } catch (e) { err = String(e); }
    check('C.' + kind, 'C. incomeReceipts is ' + (kind === 'null' ? 'null' : 'a ' + kind) + ': no error; ready; income unavailable (receipt_evidence_unreadable), received null; no income item; the plan as without receipts; the field left exactly as stored',
      [err, m && m.status, m && m.income.state, m && m.income.received, m && m.income.outstanding, m && m.income.reason, m && incomeItems(m).length, m && canon(m.plan) === canon(none.plan), canon(st) === before],
      ['', 'ready', 'unavailable', null, null, 'receipt_evidence_unreadable', 0, true, true]);
  });

  section('P3-5C RECORDED — received is the ledger\'s total; each active receipt is its own Happened item');
  const full = modelOf(VARIANTS.full());
  check('D.one', 'D. One October receipt (£3,000): recorded, received £3,000, reason receipts_recorded, outstanding null',
    [full.income.state, full.income.received, full.income.reason, full.income.outstanding], ['recorded', 3000, 'receipts_recorded', null]);
  check('D.item', 'D. Its Happened item: income_recorded from incomeReceipts, identified by the receipt id, recorded by the user, month-only (no day)',
    incomeItems(full), [{ id: 'inc_full', type: 'income_recorded', domain: 'income', amount: 3000, value: null, paymentId: null, entityId: null, occurrenceYm: null,
      occurrenceInMonth: true, eventDate: null, recordedAt: at(2026, 10, 14, 9), timeBasis: 'received_month', recordedBy: 'user', evidenceSource: 'incomeReceipts',
      origin: 'manual', paymentName: null, entityName: null, label: null }]);
  const partial = modelOf(VARIANTS.partial());
  check('E.partial', 'E. £1,500 and £1,000: received £2,500; two distinct items (never collapsed into one)',
    [partial.income.received, incomeItems(partial).map(e => [e.id, e.amount])], [2500, [['inc_p1', 1500], ['inc_p2', 1000]]]);
  const twins = modelOf(plan({ incomeReceipts: [R('inc_t1', 1000, '2026-10', { date: '2026-10-09', label: 'Salary' }), R('inc_t2', 1000, '2026-10', { date: '2026-10-09', label: 'Salary' })] }));
  check('F.identical', 'F. Two identical legitimate receipts (amount, day, label): both count (£2,000) and both are listed — no duplicate inference',
    [twins.income.received, incomeItems(twins).map(e => e.id)], [2000, ['inc_t1', 'inc_t2']]);
  const monthOnly = incomeItems(modelOf(plan({ incomeReceipts: [R('inc_m', 700, '2026-10', { recordedAt: at(2026, 10, 12, 9) })] })))[0];
  check('G.month-only', 'G. A month-only receipt counts in October with timeBasis received_month and no day — not the recording day, the 1st or today',
    [monthOnly.timeBasis, monthOnly.eventDate], ['received_month', null]);
  const dated = modelOf(plan({ incomeReceipts: [R('inc_d', 700, '2026-10', { date: '2026-10-09', recordedAt: at(2026, 10, 14, 9) })] }));
  check('H.dated', 'H. A dated receipt: timeBasis received_date, eventDate its own date (9 Oct) — never the day it was recorded (14 Oct)',
    [incomeItems(dated)[0].timeBasis, incomeItems(dated)[0].eventDate, dated.income.received], ['received_date', '2026-10-09', 700]);
  const labelled = modelOf(plan({ payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('Salary', 40, '2026-10-20')],
    incomeReceipts: [R('inc_l', 3000, '2026-10', { label: 'Salary' })] }));
  const plainSalary = modelOf(plan({ payments: [paidMonthly('rent', 1200, '2026-10-01'), bill('Salary', 40, '2026-10-20')] }));
  check('I.label', 'I. A label is display text only: kept on the item; never a payment or entity name; a payment named "Salary" is untouched',
    [incomeItems(labelled)[0].label, incomeItems(labelled)[0].paymentName, incomeItems(labelled)[0].entityName, canon(labelled.payments) === canon(plainSalary.payments)],
    ['Salary', null, null, true]);

  section('P3-5C PLANNED AND RECEIVED — two truths side by side; nothing is due, outstanding or missing');
  const below = modelOf(plan({ incomeReceipts: [R('inc_b', 2500, '2026-10')] }));
  const above = modelOf(VARIANTS.above());
  [['J.equal', full, 3000], ['K.below', below, 2500], ['L.above', above, 3200]].forEach(([id, m, received]) => {
    check(id, id.slice(0, 1) + '. Planned £3,000, received £' + received.toLocaleString('en-GB') + ': plan.incomePlanned and income.planned stay £3,000; outstanding null; no difference anywhere in income',
      [m.plan.incomePlanned, m.income.planned, m.income.received, m.income.outstanding, Object.keys(m.income),
        received !== 3000 && Object.values(m.income).indexOf(Math.abs(3000 - received)) >= 0],
      [3000, 3000, received, null, INCOME_KEYS, false]);
  });
  check('L.no-surplus', 'L. Above plan: no extra, surplus, disposable, spare, shortfall, remaining or missing key anywhere in the model (the calendar\'s daysRemaining aside); its keys are those of the model without receipts',
    [words(above).filter(w => w.startsWith('k:') && w !== 'k:daysRemaining' && /extra|surplus|disposable|spare|above|shortfall|remaining|missing|incomeDue|dueIncome/i.test(w)),
      canon(words(above).filter(w => w.startsWith('k:') && w !== 'k:label')) === canon(words(full).filter(w => w.startsWith('k:') && w !== 'k:label'))], [[], true]);
  const noPlan = modelOf(base({ income: 0, incomeExplicitlySet: false, incomeType: 'none', incomeReceipts: [R('inc_np', 500, '2026-10')] }));
  check('M.no-plan', 'M. Plan £0 and a £500 receipt: recorded, received £500 — evidence needs no plan; type none, certainty no_income_plan',
    [noPlan.income.state, noPlan.income.received, noPlan.income.type, noPlan.income.certainty, noPlan.plan.incomePlanned, noPlan.income.outstanding],
    ['recorded', 500, 'none', 'no_income_plan', 0, null]);
  const irregular = modelOf(base({ income: 1600, incomeType: 'irregular', incomeReceipts: [R('inc_ir', 800, '2026-10')] }));
  check('N.irregular', 'N. Irregular plan £1,600, receipt £800: recorded £800 by the same rules; no remainder, expected remainder or shortfall',
    [irregular.income.state, irregular.income.received, irregular.income.type, irregular.income.outstanding, irregular.plan.incomePlanned], ['recorded', 800, 'irregular', null, 1600]);

  section('P3-5C VOIDS AND CORRECTIONS — the ledger\'s active evidence only');
  const voided = modelOf(VARIANTS.voided());
  check('Q.voided', 'Q. The only receipt voided: none_recorded, received null; no income item; the void is not £−3,000 income',
    [voided.income.state, voided.income.received, incomeItems(voided).length, (voided.happened || []).filter(e => typeof e.amount === 'number' && e.amount < 0).length],
    ['none_recorded', null, 0, 0]);
  const oneLeft = modelOf(plan({ incomeReceipts: [R('inc_x', 3000, '2026-10'), R('inc_y', 400, '2026-10'), V('inc_xv', 'inc_x')] }));
  check('R.one-left', 'R. One voided, one active: received is the active one (£400), listed alone',
    [oneLeft.income.received, incomeItems(oneLeft).map(e => e.id)], [400, ['inc_y']]);
  const corrected = modelOf(VARIANTS.corrected());
  check('S.corrected', 'S. £3,000 corrected to £2,900: received £2,900; Happened lists the replacement only — no £3,000, −£3,000 and £2,900 movements',
    [corrected.income.received, incomeItems(corrected).map(e => [e.id, e.amount]), (corrected.happened || []).length], [2900, [['inc_new', 2900]], 2]);
  const moved = { incomeReceipts: [R('inc_oct', 3000, '2026-10'), V('inc_mv', 'inc_oct', at(2026, 11, 3, 9)), R('inc_nov', 3000, '2026-11', { recordedAt: at(2026, 11, 3, 9) })] };
  const octMoved = modelOf(base(moved));
  const novMoved = modelOf(base(moved), NOV);
  check('T.moved', 'T. An October receipt corrected to November: October\'s model has none recorded (the old receipt is not active, the replacement is November\'s); November\'s counts it',
    [octMoved.income.state, octMoved.income.received, incomeItems(octMoved).length, novMoved.status, novMoved.income.received, incomeItems(novMoved).map(e => e.id)],
    ['none_recorded', null, 0, 'ready', 3000, ['inc_nov']]);

  section('P3-5C MONTHS AND UNKNOWN EVIDENCE — the model\'s own month; nothing ignored by the ledger is counted');
  const pastRaw = base({ incomeReceipts: [R('inc_sep', 3000, '2026-09', { date: '2026-09-28', recordedAt: at(2026, 10, 2, 9) })] });
  const past = modelOf(pastRaw);
  check('U.past', 'U. A September receipt (recorded in October): October has none recorded and lists nothing — no "recorded this month for September" item',
    [past.income.state, past.income.received, incomeItems(past).length], ['none_recorded', null, 0]);
  const futureRaw = base({ incomeReceipts: [R('inc_dec', 3000, '2026-12'), R('inc_oct2', 100, '2026-10')] });
  const futureState = parse(futureRaw);
  const futureBefore = canon(futureState);
  vm.runInContext('__nowMs = ' + NOW + ';', ctx);
  const future = JSON.parse(JSON.stringify(ctx.geodeLivingMonthModel(futureState, vmDate(NOW))));
  check('V.future', 'V. A stored December receipt: not in October (received £100, the October one); the stored list unchanged',
    [future.income.received, incomeItems(future).map(e => e.id), canon(futureState) === futureBefore], [100, ['inc_oct2'], true]);
  const unknown = modelOf(VARIANTS.unknown());
  check('W-X.unknown', 'W/X. An open-banking receipt, an adjustment event and a string entry: none counted or listed, none turned into manual evidence',
    [unknown.income.state, unknown.income.received, incomeItems(unknown).length], ['none_recorded', null, 0]);

  section('P3-5C OTHER EVIDENCE — identity only: no matching by amount or day');
  const rel = { id: 'rel_oct', sourceType: 'goal', sourceId: 'g1', amount: 300, reason: 'emergency', date: '2026-10-08', ym: '2026-10', relatedYm: '2026-10',
    remainingBalance: 1200, createdAt: at(2026, 10, 8, 10), confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' };
  const goal = [{ id: 'g1', name: 'Buffer', target: 3000, saved: 1200, baseSaved: 1500 }];
  const relOnly = modelOf(base({ goals: goal, savingsReleases: [rel] }));
  const relAndReceipt = modelOf(base({ goals: goal, savingsReleases: [rel], incomeReceipts: [R('inc_r', 300, '2026-10', { date: '2026-10-08' })] }));
  check('Y.release', 'Y. A £300 release on 8 Oct is never income: alone, none recorded; beside a £300 receipt dated 8 Oct, both are listed (release and income_recorded) and received is £300',
    [relOnly.income.state, relOnly.income.received, (relAndReceipt.happened || []).map(e => [e.type, e.id]).sort(), relAndReceipt.income.received],
    ['none_recorded', null, [['income_recorded', 'inc_r'], ['release', 'rel_oct']], 300]);
  const contribRaw = extra => base(Object.assign({
    goals: [{ id: 'g1', name: 'Holiday', target: 2000, saved: 400, baseSaved: 300 }],
    payments: [paidMonthly('save-holiday', 100, '2026-10-04', { goalId: 'g1' })],
    contributionEvents: [{ id: 'ce_1', eventType: 'completion', paymentId: 'save-holiday', entityType: 'goal', entityId: 'g1', occurrenceYm: '2026-10',
      amount: 100, recurrence: 'monthly', dueDateSnapshot: '2026-10-04', recordedAt: at(2026, 10, 4, 9), source: 'mark_completed' }]
  }, extra || {}));
  const contribOnly = modelOf(contribRaw());
  const contribAndReceipt = modelOf(contribRaw({ incomeReceipts: [R('inc_c', 100, '2026-10', { date: '2026-10-04', recordedAt: at(2026, 10, 4, 9) })] }));
  check('Z.contribution', 'Z. A £100 contribution and a £100 receipt on 4 Oct, recorded at the same moment: both kept — the contribution\'s item, event and totals unchanged, the receipt listed and received',
    [canon(contribAndReceipt.payments) === canon(contribOnly.payments), (contribAndReceipt.happened || []).map(e => [e.type, e.id]).sort(), contribAndReceipt.income.received],
    [true, [['contribution_recorded', 'ce_1'], ['income_recorded', 'inc_c']], 100]);
  const payOnly = modelOf(plan());
  const payAndReceipt = modelOf(plan({ incomeReceipts: [R('inc_pay', 1200, '2026-10', { date: '2026-10-01', recordedAt: at(2026, 10, 1, 9) })] }));
  check('AA.payment', 'AA. A £1,200 bill settled 1 Oct and a £1,200 receipt dated 1 Oct: both kept; done, done total and the settlement event unchanged',
    [canon(payAndReceipt.payments) === canon(payOnly.payments), (payAndReceipt.happened || []).map(e => [e.type, e.id]).sort(), payAndReceipt.income.received],
    [true, [['income_recorded', 'inc_pay'], ['settlement_recorded', 'bpe_rent_2026-10_c1']], 1200]);

  section('P3-5C AUTHORITY — the plan, available, payments, expenses, gaps, components and changes never move');
  const names = Object.keys(VARIANTS);
  const models = names.map(n => modelOf(VARIANTS[n]()));
  const same = pick => names.map((n, i) => [n, canon(pick(models[i])) === canon(pick(models[0]))]);
  const allTrue = names.map(n => [n, true]);
  check('AE.monthly-left', 'AE/§31. None, empty, full, partial, above plan, voided, corrected, unknown and unreadable evidence: identical plan (Monthly Left included), available (plan remainder), payments (done / ahead totals) and expenses',
    same(m => [m.plan, m.available, m.payments, m.expenses]), allTrue);
  check('AE.left-value', 'Monthly Left is the production figure, £1,360, and the plan remainder is it', [models[0].plan.monthlyLeft, models[0].available.planRemainder], [1360, 1360]);
  check('AH.still-ahead', 'AH. Still ahead is the phone bill only in every variant — no planned income, no receipt',
    names.map((n, i) => [n, models[i].payments.ahead.map(x => x.id)]), names.map(n => [n, ['phone']]));
  const bare = modelOf(base({ income: 3000 }));
  check('AH.bare', 'A stable £3,000 plan with no payments and no receipt: nothing still ahead, aheadTotal 0', [bare.payments.ahead, bare.payments.aheadTotal], [[], 0]);
  check('AI.gaps', 'AI. Planned income and no receipt create no expectation gap: earlier is the same in every variant; a bare plan has none',
    [same(m => m.earlier), bare.earlier], [allTrue, { basis: 'evidence_only', gapCount: 0, gapMonths: [] }]);
  check('AF.outstanding', 'AF. Outstanding is null in every variant (none, partial, full, above, voided, corrected, unknown, unreadable) and for irregular and no-plan receipts',
    names.map((n, i) => [n, models[i].income.outstanding]).concat([['irregular', irregular.income.outstanding], ['no-plan', noPlan.income.outstanding]]),
    names.map(n => [n, null]).concat([['irregular', null], ['no-plan', null]]));
  check('AG.coverage', 'AG. Received coverage is null in every variant, its reason no_opening_position; income carries no coverage of its own',
    names.map((n, i) => [n, models[i].available.receivedCoverage, models[i].available.reason, 'receivedCoverage' in models[i].income]),
    names.map(n => [n, null, 'no_opening_position', false]));

  const baselineFrom = (raw, kind) => {
    vm.runInContext('__nowMs = ' + NOW + ';', ctx);
    return JSON.parse(JSON.stringify(ctx.geodeMonthBaselineFromModel(ctx.geodeLivingMonthModel(parse(raw), vmDate(NOW)), kind, at(2026, 10, 3, 9))));
  };
  const earlierPlan = plan({ income: 2800, expenses: [expense('groceries', 450, 'yes', '2026-10-01')] });
  const record = baselineFrom(earlierPlan, 'first_observed');
  check('AB.before', 'AB. A receipt present when the baseline is taken gives the record taken without it (plan figures only)',
    canon(baselineFrom(Object.assign(earlierPlan, { incomeReceipts: [R('inc_bl', 3000, '2026-10')] }), 'first_observed')), canon(record));
  const withRecord = names.map(n => modelOf(Object.assign(VARIANTS[n](), { monthBaseline: record })));
  check('AC-AD.changes', 'AC/AD/§30. With a record from 3 Oct (income £2,800, groceries £450), receipts added later, voided or corrected leave model.changes deep-equal — a receipt is not a plan change',
    [withRecord[0].changes.available, withRecord[0].changes.components.income.delta, names.map((n, i) => [n, canon(withRecord[i].changes) === canon(withRecord[0].changes)])],
    [true, 200, allTrue]);
  check('AD.components', 'The P3-4 components are identical in every variant (income is planned income, £3,000)',
    [ctx.geodeLivingMonthComponents(parse(models[0])).income, names.map((n, i) => [n, canon(ctx.geodeLivingMonthComponents(parse(models[i]))) === canon(ctx.geodeLivingMonthComponents(parse(models[0])))])],
    [3000, allTrue]);

  section('P3-5C READINESS — a model that is not ready exposes no receipt evidence');
  const withReceipts = extra => base(Object.assign({ incomeReceipts: [R('inc_nr', 3000, '2026-10')] }, extra));
  const refused = [
    ['boundary_pending', modelOf(withReceipts({ payments: [bill('rent', 1200, '2026-09-01')] }))],
    ['schema_not_current', modelOf(withReceipts({ _schemaVersion: 4 }))],
    ['clock_month_mismatch', JSON.parse(JSON.stringify(ctx.geodeLivingMonthModel(parse(withReceipts()), vmDate(NOV))))]
  ];
  check('AJ.non-ready', 'AJ. Boundary pending, another schema, another month: the minimal model as before — income not_tracked, received null, no Happened',
    refused.map(([s, m]) => [m.status, m.income.state, m.income.received, m.income.reason, m.happened]),
    refused.map(([s]) => [s, 'not_tracked', null, 'no_income_evidence', null]));

  section('P3-5C PURITY — the supplied state only, read and never written; fresh results');
  const rawA = plan({ incomeReceipts: [R('inc_A', 3000, '2026-10', { label: 'Salary' }), R('inc_A2', 500, '2026-10', { date: '2026-10-09' }), V('inc_Av', 'inc_gone')] });
  const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
  let frozenModel = null, frozenErr = '';
  try { vm.runInContext('__nowMs = ' + NOW + ';', ctx); frozenModel = JSON.parse(JSON.stringify(ctx.geodeLivingMonthModel(deepFreeze(parse(rawA)), vmDate(NOW)))); } catch (e) { frozenErr = String(e); }
  const modelA = modelOf(rawA);
  check('AK.frozen', 'AK. A deep-frozen state with receipts is read without error and gives the same model', [frozenErr, canon(frozenModel) === canon(modelA)], ['', true]);
  check('AL.decoy', 'AL. The page state S holds a £9,999 receipt and £12,345 income; the supplied state\'s receipts alone are read (£3,500, its two ids)',
    [modelA.income.received, incomeItems(modelA).map(e => e.id), modelOf(plan()).income.state], [3500, ['inc_A', 'inc_A2'], 'none_recorded']);
  const trapped = parse(rawA);
  const writes = [];
  vm.runInContext('__nowMs = ' + NOW + '; __trapLog = [];', ctx);
  const live = ctx.geodeLivingMonthModel(writeTrap(trapped, writes), vmDate(NOW));
  check('purity.no-writes', 'No write at any depth of the state (receipts included); no storage, DOM, save or sync', [writes, trapLog()], [[], []]);
  const st2 = parse(rawA);
  const stText = canon(st2);
  vm.runInContext('__nowMs = ' + NOW + ';', ctx);
  const m1 = ctx.geodeLivingMonthModel(st2, vmDate(NOW));
  const m2 = ctx.geodeLivingMonthModel(st2, vmDate(NOW));
  const stateObjects = objectsIn(st2, new Set());
  const shared = [...objectsIn(m1, new Set())].filter(o => stateObjects.has(o)).length;
  const items1 = m1.happened.filter(e => e.type === 'income_recorded');
  items1[0].amount = 1; items1[0].label = 'changed'; m1.income.received = 0; m1.happened.push({ type: 'income_recorded', amount: 5 });
  check('AM.isolation', 'AM. Repeated calls are equal and separate; no result object is part of the state; changing a result changes neither the state, its receipts nor the next result',
    [canon(m2) === canon(live), m1 !== m2, shared, canon(st2) === stText, canon(ctx.geodeLivingMonthModel(st2, vmDate(NOW))) === canon(m2)], [true, true, 0, true, true]);

  section('P3-5C SURFACES — nothing new is shown before P3-5D');
  const detailOf = m => canon(ctx.geodeMonthDetailView(parse(m)));
  check('PD.detail', 'The detail beneath the Pulse is identical with or without receipts (receipt items stay in the model; they are not "also recorded" payments)',
    names.map((n, i) => [n, detailOf(models[i]) === detailOf(models[0])]), allTrue);
  check('PD.detail-release', 'Beside a release, the detail lists the release only', ctx.geodeMonthDetailView(parse(relAndReceipt)).also.map(e => e.id), ['rel_oct']);
  const html = m => ctx.geodeMonthPulseHtml(ctx.geodeMonthPulseView(parse(m)));
  const noteRe = /<div data-geode-month-pulse-income="1"[^>]*>[^<]*<\/div>/;
  const hNone = html(models[0]);
  check('PD.pulse-none', 'With none recorded (and with unreadable evidence) the Pulse is unchanged, the not-tracked note included',
    [noteRe.test(hNone), html(models[names.indexOf('empty')]) === hNone, html(models[names.indexOf('malformed')]) === hNone, html(models[names.indexOf('voided')]) === hNone], [true, true, true, true]);
  check('PD.pulse-recorded', 'With receipts recorded the Pulse shows no received figure, coverage or receipt: only the not-tracked note is withdrawn',
    ['full', 'partial', 'above', 'corrected'].map(n => { const h = html(models[names.indexOf(n)]); return [n, h === hNone.replace(noteRe, ''), /receiv|receipt|cover|3,200|2,900|2,500/i.test(h.replace(/<[^>]*>/g, ' '))]; }),
    ['full', 'partial', 'above', 'corrected'].map(n => [n, true, false]));

  return results;
}

// ───────────────────────────── mutants ─────────────────────────────

const RECEIVED = '    received: recorded ? receipts.total : null,';
const READ = '  return geodeIncomeReceiptLedger(list, ym).month;';
const EACH = '  (receipts ? receipts.receipts : []).forEach(function (r) {';
const MUTANTS = {
  'received is planned income from S': [RECEIVED, '    received: recorded ? toNum(S.income) : null,'],
  'received 0 when no evidence': [RECEIVED, '    received: recorded ? receipts.total : 0,'],
  'received is plan minus something': [RECEIVED, '    received: recorded ? planned - receipts.total : null,'],
  'outstanding derived': ['    outstanding: null,\n    reason: !receipts', '    outstanding: recorded ? planned - receipts.total : planned,\n    reason: !receipts'],
  'receipt changes Monthly Left': ['  var receipts = geodeLivingMonthReceipts(state, cal.ym);\n', '  var receipts = geodeLivingMonthReceipts(state, cal.ym);\n  if (receipts && receipts.count) monthlyLeft += receipts.total;\n'],
  'receipt changes P3-4': ['    income: model.plan.incomePlanned,', '    income: model.plan.incomePlanned + (model.income.received || 0),'],
  'receipt added to Still ahead': ['  model.payments = { countedTotal:', "  if (receipts) receipts.receipts.forEach(function (r) { ahead.push({ id: r.id, kind: 'income', amount: r.amount, state: 'scheduled' }); aheadTotal += r.amount; });\n  model.payments = { countedTotal:"],
  'planned income in Still ahead': ['  model.payments = { countedTotal:', "  if (incomePlanned > 0 && !(receipts && receipts.count)) ahead.push({ id: 'income', kind: 'income', amount: incomePlanned, state: 'scheduled' });\n  model.payments = { countedTotal:"],
  'no receipt creates an expectation gap': ['  model.earlier = geodeLivingMonthEarlierGaps(state, cal.ym);', "  model.earlier = geodeLivingMonthEarlierGaps(state, cal.ym);\n  if (model.income.state === 'none_recorded' && model.income.planned > 0) { model.earlier.gapCount++; model.earlier.gapMonths.push(cal.ym); }"],
  'void appears as negative income': [EACH, "  var __l = geodeIncomeReceiptLedger(state.incomeReceipts); __l.voids.forEach(function (v) { var t = __l.receipts.filter(function (x) { return x.id === v.voidsId; })[0]; if (t && t.ym === cal.ym) out.push({ id: v.id, type: 'income_recorded', amount: -t.amount, recordedAt: v.recordedAt, evidenceSource: 'incomeReceipts' }); });\n" + EACH],
  'recordedAt used as the day': ['eventDate: r.date || null,', 'eventDate: r.date || geodeDateToLocalISO(new Date(r.recordedAt)),'],
  'recordedAt replaces the date': ['eventDate: r.date || null,', 'eventDate: geodeDateToLocalISO(new Date(r.recordedAt)),'],
  'page state instead of the supplied state': ['  var list = state.incomeReceipts;', '  var list = S.incomeReceipts;'],
  'direct sum bypasses the ledger': [READ, "  var rs = (list || []).filter(function (r) { return r && r.ym === ym && r.eventType === 'receipt'; });\n  return { ym: ym, total: rs.reduce(function (t, r) { return t + r.amount; }, 0), count: rs.length, receipts: rs };"],
  'Happened collapses partial receipts': [EACH, "  (receipts && receipts.count ? [{ id: 'income_' + receipts.ym, amount: receipts.total, recordedAt: 0, source: 'manual' }] : []).forEach(function (r) {"],
  'release mistaken for a receipt': [READ, "  return geodeIncomeReceiptLedger((list || []).concat((state.savingsReleases || []).map(function (r) { return { id: r.id, eventType: 'receipt', amount: r.amount, ym: r.ym, recordedAt: r.createdAt, source: 'manual' }; })), ym).month;"],
  'receipt deduplicated by amount': [EACH, '  (receipts ? receipts.receipts : []).filter(function (r) { return !out.some(function (e) { return e.amount === r.amount; }); }).forEach(function (r) {'],
  'unreadable read as none': ['  if (list !== undefined && !Array.isArray(list)) return null;', '  if (list !== undefined && !Array.isArray(list)) list = [];'],
  'unreadable repaired': ['  if (list !== undefined && !Array.isArray(list)) return null;', '  if (list !== undefined && !Array.isArray(list)) { state.incomeReceipts = []; list = []; }'],
  'reader sorts the stored list': ['  var list = state.incomeReceipts;', '  var list = state.incomeReceipts;\n  if (Array.isArray(list)) list.sort(function (a, b) { return a.recordedAt - b.recordedAt; });'],
  'non-ready model exposes receipts': ["    income: { state: 'not_tracked', planned: null, explicitlySet: null, type: null, certainty: null, received: null,",
    "    income: { state: 'not_tracked', planned: null, explicitlySet: null, type: null, certainty: null, received: state && Array.isArray(state.incomeReceipts) && cal ? geodeIncomeReceiptLedger(state.incomeReceipts, cal.ym).month.total : null,"],
  'detail lists receipts': ["return e && e.type !== 'income_recorded' && !cited[", 'return e && !cited['],
  'coverage computed': ["  model.available = { planRemainder: monthlyLeft, receivedCoverage: null, reason: 'no_opening_position' };",
    "  model.available = { planRemainder: monthlyLeft, receivedCoverage: model.income.received != null && incomePlanned > 0 ? model.income.received / incomePlanned : null, reason: 'no_opening_position' };"]
};

function main() {
  const results = checksFor(INDEX);
  Object.keys(MUTANTS).forEach(name => {
    const [from, to] = MUTANTS[name];
    if (INDEX.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html: ' + name);
    let by;
    try {
      by = checksFor(INDEX.replace(from, () => to)).filter(r => !r.ok).map(r => r.id);
    } catch (e) {
      by = ['threw: ' + e.message];
    }
    results.push({ group: 'P3-5C MUTANTS — each rule is load-bearing', id: 'mutant.' + name.replace(/\s+/g, '-'),
      text: 'Caught: ' + name + (by.length ? ' (by ' + by.slice(0, 4).join(', ') + (by.length > 4 ? ', …' : '') + ')' : ''), ok: by.length > 0, detail: by.length ? '' : 'every check still passed' });
  });

  let failed = 0;
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(22) + ' ' + r.text + (r.ok ? '' : '\n        ' + r.detail));
  });
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
