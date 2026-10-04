#!/usr/bin/env node
/**
 * P3-5B income receipt evidence store: S.incomeReceipts, append-only receipt / void events beside the plan.
 *
 * Runs the production validators, ledger and writers (geodeIncomeReceipt*, geodeRecord / Void / CorrectIncomeReceipt in
 * index.html) inside the cross-month harness's simulated app — production save, store, rollback (P2-9) and revision
 * fencing (P2-10) — and the deployed v1.0.78 runtime (eee9015: its own load, save, persist, store and recurring sync,
 * via tests/month-baseline.js) on stored receipt lists. Checks: the understood shapes, the one pure ledger (duplicate
 * ids, voids, month ownership, purity), the writers and their results, failed writes, stale tabs, the month boundary,
 * the month baseline, financial invariance (Monthly Left, P3-4, positions, affordability), preservation of evidence this
 * runtime does not understand, old-runtime compatibility, export and the restore extractor — and mutants for each rule.
 *
 * Run: node tests/income-receipts.js
 */
'use strict';

const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const { OLD, OLD_REF, OLD_RUNTIME, OldPage, PLAN, pageOver, raw, stored, localNoon, at, ordinary } = mb;
const SRC = cm.readSource(cm.INDEX_HTML);

const results = [];
let group = '';
const canon = v => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object'
  ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}' : v === undefined ? 'undefined' : JSON.stringify(v));
const same = (a, b) => canon(a) === canon(b);
function check(id, text, actual, expected) {
  const ok = same(actual, expected);
  results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
}
function scenario(name, fn) {
  group = name;
  try { fn(); } catch (e) { results.push({ group, id: 'error', text: 'scenario threw', ok: false, detail: String(e && e.stack || e) }); }
}

// ───────────────────────────── helpers ─────────────────────────────

const J = v => JSON.stringify(v);
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const json = (page, expr) => { const t = page.run('JSON.stringify(' + expr + ')'); return t === undefined ? undefined : JSON.parse(t); };
const ledgerOf = (page, events, ym) => json(page, 'geodeIncomeReceiptLedger(' + (events === undefined ? 'undefined' : J(events)) + ', ' + J(ym) + ')');
const pageLedger = (page, ym) => json(page, 'geodeIncomeReceiptLedger(S.incomeReceipts, ' + J(ym) + ')');
const record = (page, input) => json(page, 'geodeRecordIncomeReceipt(' + J(input) + ')');
const voidReceipt = (page, id) => json(page, 'geodeVoidIncomeReceipt(' + J(id) + ')');
const correct = (page, id, input) => json(page, 'geodeCorrectIncomeReceipt(' + J(id) + ', ' + J(input) + ')');
const storedList = page => stored(page).incomeReceipts;
const memList = page => page.state().incomeReceipts;
const ids = list => list.map(e => e.id);
const watch = page => page.run('var __kw = 0, __ks = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY) __kw++; return __ks.call(localStorage, k, v); };');
const writes = page => { const n = page.run('__kw'); page.run('__kw = 0;'); return n; };
const clockAt = (page, ms) => page.run('__nowMs = ' + ms + ';');

const OCT = '2026-10';
/** A schema-3 October 2026 state (tests/month-baseline.js PLAN): income £3,000, Rent £1,000, Holiday £100, Food £400. */
const octText = over => J(Object.assign(PLAN(OCT), over || {}));
/** This runtime's page over that text on 12 October 2026, nothing written yet. */
const octPage = over => pageOver(octText(over), '2026-10-12');

const RAT = at('2026-10-12', 9);
const R = (id, amount, ym, extra) => Object.assign({ id, eventType: 'receipt', amount, ym, recordedAt: RAT, source: 'manual' }, extra || {});
const V = (id, voidsId, extra) => Object.assign({ id, eventType: 'void', voidsId, recordedAt: at('2026-10-13', 9), source: 'manual' }, extra || {});

/** Evidence a later runtime may write: another source, another event type, fields this runtime does not know. */
const FUTURE = [
  { id: 'inc_prov', eventType: 'receipt', amount: 2999.5, ym: OCT, date: '2026-10-09', recordedAt: at('2026-10-10', 8), source: 'provider', provider: { name: 'Bank', ref: 'tx-1' } },
  { id: 'inc_adj', eventType: 'adjustment', amount: -20, ym: OCT, recordedAt: at('2026-10-10', 9), source: 'smart_import' },
  { id: 'inc_more', eventType: 'receipt', amount: 100, ym: OCT, recordedAt: at('2026-10-10', 10), source: 'manual', forYm: '2026-11', corroboratedBy: ['inc_prov'] },
  'a string entry',
  { id: 'inc_pvoid', eventType: 'void', voidsId: 'inc_prov', recordedAt: at('2026-10-10', 11), source: 'provider' }
];

const fnText = n => cm.extractFunction(SRC, n).text;
/** Redefines production function n in the page with each [from, to] replaced (each anchor must occur once). */
function mutate(page, n, pairs) {
  let t = fnText(n);
  pairs.forEach(([from, to]) => {
    if (t.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in ' + n + ': ' + from);
    t = t.replace(from, () => to);
  });
  page.run(t);
}

/** computeAffordabilityContext and the production functions it reaches that the harness does not define. */
let AFFORD = null;
function affordCode() {
  if (AFFORD) return AFFORD;
  const probe = octPage();
  const have = new Map();
  const queue = ['computeAffordabilityContext'];
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n) || (n !== 'computeAffordabilityContext' && probe.run('typeof ' + n) !== 'undefined')) continue;
    const f = cm.extractFunction(SRC, n);
    have.set(n, f.text);
    cm.calledNames(f.text).forEach(c => queue.push(c));
  }
  AFFORD = [...have.values()].join('\n');
  return AFFORD;
}

// ───────────────────────────── validators ─────────────────────────────

function validators() {
  scenario('P3-5B VALIDATORS — the receipts and voids this runtime understands; anything else is not counted', () => {
    const p = octPage();
    const rv = e => p.call('geodeIncomeReceiptValid', [e]);
    const vv = e => p.call('geodeIncomeReceiptVoidValid', [e]);
    const rvRaw = code => p.run('geodeIncomeReceiptValid(' + code + ')');
    check('G.month-only', 'G. A receipt with a month and no day is understood (month-only evidence)', rv(R('a', 3000, OCT)), true);
    check('H.dated', 'H. A receipt dated a real day in its month is understood', rv(R('a', 3000, OCT, { date: '2026-10-28' })), true);
    check('I.date', 'I. A date in another month, an impossible day, a short date, an invalid month: not understood',
      [rv(R('a', 3000, OCT, { date: '2026-09-30' })), rv(R('a', 3000, OCT, { date: '2026-10-32' })), rv(R('a', 3000, OCT, { date: '2026-10-1' })), rv(R('a', 3000, '2026-13'))],
      [false, false, false, false]);
    check('QRS.amount', 'Q/R/S. Amount 0, negative, a string, null, NaN, Infinity: not understood',
      [rv(R('a', 0, OCT)), rv(R('a', -5, OCT)), rv(R('a', '3000', OCT)), rv(R('a', null, OCT)),
        rvRaw('Object.assign(' + J(R('a', 1, OCT)) + ', { amount: NaN })'), rvRaw('Object.assign(' + J(R('a', 1, OCT)) + ', { amount: Infinity })')],
      [false, false, false, false, false, false]);
    check('T.pence', 'T. Whole pence only: £10.50, £10.15 and £0.01 are understood; £10.005 and £0.001 are not (never rounded into evidence)',
      [10.5, 10.15, 0.01, 10.005, 0.001].map(a => rv(R('a', a, OCT))), [true, true, true, false, false]);
    check('OP.label', 'O/P. A trimmed label of 1–40 characters is understood; empty, untrimmed, 41 characters or a number is not',
      [rv(R('a', 1, OCT, { label: 'Salary' })), rv(R('a', 1, OCT, { label: '' })), rv(R('a', 1, OCT, { label: ' Salary' })),
        rv(R('a', 1, OCT, { label: 'x'.repeat(40) })), rv(R('a', 1, OCT, { label: 'x'.repeat(41) })), rv(R('a', 1, OCT, { label: 5 }))],
      [true, false, false, true, false, false]);
    check('shape', 'An empty id, recordedAt 0 or NaN, a missing or other source, another event type, an unknown field, an array, null: not understood',
      [rv(R('', 1, OCT)), rv(R('a', 1, OCT, { recordedAt: 0 })), rvRaw('Object.assign(' + J(R('a', 1, OCT)) + ', { recordedAt: NaN })'),
        rv(Object.assign(R('a', 1, OCT), { source: undefined })), rv(R('a', 1, OCT, { source: 'provider' })), rv(R('a', 1, OCT, { source: 'smart_import' })),
        rv(R('a', 1, OCT, { eventType: 'adjustment' })), rv(R('a', 1, OCT, { forYm: '2026-11' })), rv([R('a', 1, OCT)]), rv(null)],
      [false, false, false, false, false, false, false, false, false, false]);
    check('void.shape', 'A void is exactly id, eventType, voidsId, recordedAt and a source; any recorded source is read (a void only retires evidence); an extra field, a missing or empty voidsId, an empty source or a bad time is not',
      [vv(V('v', 'a')), vv(V('v', 'a', { source: 'provider' })), vv(V('v', 'a', { reason: 'duplicate' })), vv(Object.assign(V('v', 'a'), { voidsId: undefined })),
        vv(V('v', '')), vv(V('v', 'a', { source: '' })), vv(V('v', 'a', { recordedAt: -1 })), vv(R('a', 1, OCT))],
      [true, true, false, false, false, false, false, false]);
    check('pure', 'The validators read frozen events and change nothing',
      p.run('(function () { var r = Object.freeze(' + J(R('a', 3000, OCT, { date: '2026-10-28', label: 'Salary' })) + '), v = Object.freeze(' + J(V('v', 'a')) +
        '); var b = JSON.stringify([r, v]); return [geodeIncomeReceiptValid(r), geodeIncomeReceiptVoidValid(v), JSON.stringify([r, v]) === b]; })()'), [true, true, true]);
  });
}

// ───────────────────────────── ledger ─────────────────────────────

const EMPTY_MONTH = ym => ({ ym, total: null, count: 0, receipts: [] });

function ledger() {
  scenario('P3-5B LEDGER — one pure derivation: first id wins, voids retire, receipts belong to their month', () => {
    const p = octPage();
    const L = (events, ym) => ledgerOf(p, events, ym === undefined ? OCT : ym);
    const none = { receipts: [], voids: [], active: [], ignored: 0, month: EMPTY_MONTH(OCT) };
    check('A.absent', 'A. An absent list (undefined, null or not a list) is no receipt evidence recorded: no receipts, total null — never £0 received',
      [L(undefined), L(null), L({ a: 1 })], [none, none, none]);
    check('B.empty', 'B. An empty list is the same', L([]), none);
    const one = L([R('a', 3000, OCT, { date: '2026-10-28' })]);
    check('C.one', 'C. One October receipt: October total £3,000 from 1 receipt', [one.month.total, one.month.count, ids(one.active)], [3000, 1, ['a']]);
    const partial = [R('p1', 1500, OCT), R('p2', 1000, OCT, { date: '2026-10-20' })];
    const pl = L(partial);
    check('D.partial', 'D. £1,500 then £1,000: two receipts, £2,500; the first is unchanged; no remaining or outstanding figure exists',
      [pl.month.total, pl.month.count, same(pl.receipts[0], partial[0]), Object.keys(pl).sort(), Object.keys(pl.month).sort()],
      [2500, 2, true, ['active', 'ignored', 'month', 'receipts', 'voids'], ['count', 'receipts', 'total', 'ym']]);
    const twin = L([R('t1', 200, OCT, { date: '2026-10-10', label: 'Freelance' }), R('t2', 200, OCT, { date: '2026-10-10', label: 'Freelance' })]);
    check('E.twins', 'E. Two receipts with the same amount, date and label but different ids are two receipts (£400) — nothing is a duplicate by value',
      [twin.month.count, twin.month.total, twin.ignored], [2, 400, 0]);
    const dupR = L([R('x', 3000, OCT), R('x', 9999, OCT)]);
    check('F.receipt-id', 'F. A duplicate receipt id: the first instance in the list holds the id; the later one is ignored (counted in ignored, not removed)',
      [ids(dupR.active), dupR.month.total, dupR.ignored], [['x'], 3000, 1]);
    const dupV = L([R('a', 1, OCT), R('b', 2, OCT), V('v', 'a'), V('v', 'b')]);
    check('X.void-id', 'X. A duplicate void id: the first void holds the id and retires a; the second (naming b) is ignored, so b stays active',
      [ids(dupV.active), dupV.voids.map(v => v.voidsId), dupV.ignored], [['b'], ['a'], 1]);
    const shared1 = L([R('x', 5, OCT), V('x', 'x')]);
    const shared2 = L([V('x', 'y'), R('x', 5, OCT), R('y', 7, OCT)]);
    check('F.shared-id', 'A receipt and a void sharing an id: whichever comes first holds it. Receipt first: the void is ignored and the receipt stays active. Void first: that receipt is ignored and the void retires y',
      [ids(shared1.active), shared1.ignored, ids(shared2.receipts), ids(shared2.active), shared2.voids.map(v => v.voidsId), shared2.ignored], [['x'], 1, ['y'], [], ['y'], 1]);
    const voided = L([R('a', 3000, OCT), V('v', 'a')]);
    check('U.void', 'U. A void retires its receipt: it leaves the month (total null), stays among the understood receipts, and the void is effective',
      [ids(voided.receipts), ids(voided.active), ids(voided.voids), voided.month], [['a'], [], ['v'], EMPTY_MONTH(OCT)]);
    const twice = L([R('a', 3000, OCT), V('v2', 'a', { recordedAt: at('2026-10-14', 9) }), V('v1', 'a', { recordedAt: at('2026-10-13', 9) }), V('v0', 'a', { recordedAt: at('2026-10-13', 9) })]);
    check('Y.two-voids', 'Y. Several voids of one receipt retire it once: the earliest recordedAt (then lowest id) is the effective void; the others change nothing',
      [ids(twice.active), ids(twice.voids), twice.ignored], [[], ['v0'], 0]);
    const missing = L([R('a', 3000, OCT), V('v', 'nope'), V('w', 'v')]);
    check('W.nonexistent', 'W. A void naming no receipt, or naming a void, does nothing', [ids(missing.active), missing.voids], [['a'], []]);
    check('void.any-source', 'A void retires the receipt whatever either one\'s source: a provider-recorded void retires a manual receipt',
      ids(L([R('a', 3000, OCT), V('v', 'a', { source: 'provider' })]).active), []);
    const late = [R('late', 3000, OCT, { date: '2026-10-28', recordedAt: at('2026-11-03', 9) })];
    check('L.month', 'L. A receipt dated 28 October and recorded on 3 November belongs to October (its ym, never recordedAt): October £3,000, November no evidence',
      [L(late, OCT).month.total, L(late, '2026-11').month], [3000, EMPTY_MONTH('2026-11')]);
    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', OCT];
    const six = months.map((m, i) => R('m' + i, 3000 + i, m));
    check('AK.history', 'AK. Six months of receipts: each month selects only its own; a month with none has no evidence',
      months.map(m => L(six, m).month.total).concat([L(six, '2026-04').month.total]), [3000, 3001, 3002, 3003, 3004, 3005, null]);
    check('ym', 'Without a valid month the ledger still classifies, with no month section', [L(six, 'x').month, L(six, undefined).month === null, L(six, '2026-13').active.length], [null, false, 6]);
    const unknown = L([R('a', 3000, OCT)].concat(FUTURE));
    check('AR-AT.ignored', 'AR/AS/AT. A provider receipt, an unknown event type, a manual receipt with fields this runtime does not know and a non-object are not counted (ignored: 4); a void naming the uncounted provider receipt does nothing',
      [ids(unknown.active), unknown.ignored, unknown.voids, unknown.month.total], [['a'], 4, [], 3000]);

    const pure = JSON.parse(p.run('(function () {' +
      'function deepFreeze(o) { Object.getOwnPropertyNames(o).forEach(function (k) { if (o[k] && typeof o[k] === "object") deepFreeze(o[k]); }); return Object.freeze(o); }' +
      'var input = deepFreeze(' + J(partial.concat([V('v', 'p2'), R('p3', 50, OCT)], FUTURE)) + ');' +
      'var keepS = S, keepDate = Date, keepNow = Date.now, a, b, err = "";' +
      'S = { incomeReceipts: [' + J(R('decoy', 77777, OCT)) + '] };' +
      'Date.now = function () { throw new Error("clock read"); };' +
      'try { Date = function () { if (!arguments.length) throw new Error("clock read"); return new (Function.prototype.bind.apply(keepDate, [null].concat([].slice.call(arguments))))(); };' +
      ' a = geodeIncomeReceiptLedger(input, "2026-10"); b = geodeIncomeReceiptLedger(input, "2026-10"); }' +
      'catch (e) { err = String(e); } finally { Date = keepDate; Date.now = keepNow; S = keepS; }' +
      'return JSON.stringify({ err: err, same: JSON.stringify(a) === JSON.stringify(b), total: a && a.month.total,' +
      ' fresh: a ? [a !== b, a.active !== b.active, a.receipts !== b.receipts, a.month !== b.month, a.active[0] !== input[0], a.month.receipts[0] !== a.active[0], a.voids[0] !== input[2]] : null });' +
      '})()'));
    check('AH.frozen', 'Purity: a deep-frozen list, a decoy page state and a clock that throws when read (Date.now, new Date()) — the ledger reads none of them (calendar arithmetic on given dates only), and repeated calls give equal results in fresh containers and copies',
      pure, { err: '', same: true, total: 1550, fresh: [true, true, true, true, true, true, true] });
    const alias = JSON.parse(p.run('(function () { var input = ' + J(partial) + ', before = JSON.stringify(input);' +
      'var a = geodeIncomeReceiptLedger(input, "2026-10"); a.active[0].amount = 1; a.receipts[1].ym = "2026-01"; a.month.receipts.push({}); a.active.push({});' +
      'var c = geodeIncomeReceiptLedger(input, "2026-10");' +
      'return JSON.stringify([JSON.stringify(input) === before, c.month.total, c.active.length]); })()'));
    check('AH.alias', 'Changing a result changes neither the input nor the next result', alias, [true, 2500, 2]);
  });
}

// ───────────────────────────── draft ─────────────────────────────

function draft() {
  scenario('P3-5B INPUT — explicit amount, month, optional day and label, judged against the supplied local day', () => {
    const p = octPage();
    const D = (input, today) => json(p, 'geodeIncomeReceiptDraft(' + J(input) + ', ' + J(today === undefined ? '2026-10-12' : today) + ')');
    check('G.no-date', 'G. No day stays no day — never today, the 1st, the last day or the recording day; an empty or null date is no date',
      [D({ amount: 3000, ym: OCT }), D({ amount: 3000, ym: OCT, date: '' }), D({ amount: 3000, ym: OCT, date: null })],
      [{ draft: { amount: 3000, ym: OCT } }, { draft: { amount: 3000, ym: OCT } }, { draft: { amount: 3000, ym: OCT } }]);
    check('JK.future', 'J/K. Money cannot have arrived later than today: 13 October (today the 12th) and November are refused; today and earlier months are accepted',
      [D({ amount: 1, ym: OCT, date: '2026-10-13' }).reason, D({ amount: 1, ym: '2026-11' }).reason, D({ amount: 1, ym: OCT, date: '2026-10-12' }).draft.date, D({ amount: 1, ym: '2025-12' }).draft.ym],
      ['future_date', 'future_month', '2026-10-12', '2025-12']);
    check('P.label', 'P. A label is trimmed; a blank one is no label; over 40 characters after trimming, or not text, is refused',
      [D({ amount: 1, ym: OCT, label: '  Salary ' }).draft.label, has(D({ amount: 1, ym: OCT, label: '   ' }).draft, 'label'),
        D({ amount: 1, ym: OCT, label: '  ' + 'x'.repeat(40) + ' ' }).draft.label.length, D({ amount: 1, ym: OCT, label: 'x'.repeat(41) }).reason, D({ amount: 1, ym: OCT, label: 5 }).reason],
      ['Salary', false, 40, 'invalid_label', 'invalid_label']);
    check('invalid', 'Bad input is refused with its reason: no object, a list, a string amount, £10.005, a bad month, a day in another month, an unreadable clock',
      [D(null).reason, D([]).reason, D({ amount: '3000', ym: OCT }).reason, D({ amount: 10.005, ym: OCT }).reason, D({ amount: 1, ym: '2026-1' }).reason,
        D({ amount: 1, ym: OCT, date: '2026-09-30' }).reason, D({ amount: 1, ym: OCT }, 'x').reason],
      ['invalid_input', 'invalid_input', 'invalid_amount', 'invalid_amount', 'invalid_month', 'invalid_date', 'invalid_clock']);
  });
}

// ───────────────────────────── writers ─────────────────────────────

function writers() {
  scenario('P3-5B RECORD — explicit evidence, one admitted write, nothing else changed', () => {
    const p = octPage();
    watch(p);
    ordinary(p);
    check('A.lazy', 'A. Load and an ordinary write never add the field: absent stays absent in memory and storage', [has(p.state(), 'incomeReceipts'), has(stored(p), 'incomeReceipts')], [false, false]);
    const before = stored(p);
    writes(p);
    const r1 = record(p, { amount: 1500, ym: OCT });
    const list1 = storedList(p);
    check('G.record', 'G. A month-only receipt: saved in one write as exactly { id, eventType, amount, ym, recordedAt, source } — no date invented — with a random inc_ id and the recording time',
      [r1.status, /^inc_/.test(r1.id), writes(p), list1.length, Object.keys(list1[0]), list1[0].recordedAt, list1[0].id === r1.id, same(memList(p), list1)],
      ['saved', true, 1, 1, ['id', 'eventType', 'amount', 'ym', 'recordedAt', 'source'], localNoon('2026-10-12'), true, true]);
    const first = J(list1[0]);
    const r2 = record(p, { amount: 1000, ym: OCT, date: '2026-10-09' });
    check('H.D.partial', 'H/D. A dated £1,000 after the £1,500: appended; the first receipt byte-identical; October £2,500 from 2',
      [r2.status, storedList(p)[1].date, J(storedList(p)[0]) === first, pageLedger(p, OCT).month.total, pageLedger(p, OCT).month.count], ['saved', '2026-10-09', true, 2500, 2]);
    const t1 = record(p, { amount: 200, ym: OCT, date: '2026-10-10', label: 'Freelance' });
    const t2 = record(p, { amount: 200, ym: OCT, date: '2026-10-10', label: 'Freelance' });
    check('E.twins', 'E. The same amount, day and label recorded twice: two receipts with different ids, both counted (no duplicate detection)',
      [t1.status, t2.status, t1.id !== t2.id, pageLedger(p, OCT).month.count, pageLedger(p, OCT).month.total], ['saved', 'saved', true, 4, 2900]);
    record(p, { amount: 50, ym: OCT, label: '  Gift  ' });
    record(p, { amount: 25, ym: OCT, label: '   ' });
    const l5 = storedList(p);
    check('O.label', 'O/P. A label is stored trimmed; a blank label is not stored at all', [l5[4].label, has(l5[5], 'label')], ['Gift', false]);
    writes(p);
    const text = raw(p);
    const bad = [{ amount: 0, ym: OCT }, { amount: -5, ym: OCT }, { amount: '3000', ym: OCT }, { amount: 10.005, ym: OCT }, { amount: 1, ym: OCT, date: '2026-09-30' },
      { amount: 1, ym: OCT, date: '2026-10-13' }, { amount: 1, ym: '2026-11' }, { amount: 1, ym: OCT, label: 'x'.repeat(41) }].map(i => record(p, i));
    const nan = [json(p, 'geodeRecordIncomeReceipt({ amount: NaN, ym: "2026-10" })'), json(p, 'geodeRecordIncomeReceipt({ amount: Infinity, ym: "2026-10" })')];
    check('I-T.refused', 'I/J/K/P/Q/R/S/T. Zero, negative, text, £10.005, a day in another month, a future day, a future month, a 41-character label, NaN, Infinity: refused with a reason, no write, nothing changed',
      [bad.map(r => r.status + ':' + r.reason), nan.map(r => r.status + ':' + r.reason), writes(p), raw(p) === text, p.run('_geodeFinancialActionOpen')],
      [['invalid:invalid_amount', 'invalid:invalid_amount', 'invalid:invalid_amount', 'invalid:invalid_amount', 'invalid:invalid_date', 'invalid:future_date', 'invalid:future_month', 'invalid:invalid_label'],
        ['invalid:invalid_amount', 'invalid:invalid_amount'], 0, true, 0]);
    const above = record(p, { amount: 3200, ym: OCT });
    const after = stored(p);
    check('M.above', 'M. £3,200 against planned £3,000 is accepted as it is; planned income stays £3,000',
      [above.status, after.income, after.incomeExplicitlySet], ['saved', 3000, true]);
    check('AC.activity', '§31. No receipt write touches the plan, its type or the activity log: income, income type, activity log and every plan row are as before the receipts',
      [after.income, after.incomeType, same(after.activityLog, before.activityLog), same(after.payments, before.payments), same(after.expenses, before.expenses),
        (after.activityLog || []).filter(e => e && e.type === 'income').length],
      [before.income, before.incomeType, true, true, true, 0]);

    const z = octPage({ income: 0 });
    const n = record(z, { amount: 500, ym: OCT, label: 'Bonus' });
    check('N.no-plan', 'N. With planned income £0 a £500 receipt is accepted; planned income stays £0', [n.status, stored(z).income, pageLedger(z, OCT).month.total], ['saved', 0, 500]);

    const broken = octPage({ incomeReceipts: { not: 'a list' } });
    watch(broken);
    const brokenText = raw(broken);
    check('store.unreadable', 'A stored value that is not a list is never replaced: record, void and correct answer unavailable and write nothing',
      [record(broken, { amount: 1, ym: OCT }).status, voidReceipt(broken, 'x').status, correct(broken, 'x', { amount: 1, ym: OCT }).status, writes(broken), raw(broken) === brokenText],
      ['unavailable', 'unavailable', 'unavailable', 0, true]);
  });

  scenario('P3-5B VOID AND CORRECT — retire, never delete; a correction is one write of void and replacement', () => {
    const q = octPage();
    watch(q);
    const a = record(q, { amount: 3000, ym: OCT, date: '2026-10-09', label: 'Salary' }).id;
    const snapA = J(storedList(q)[0]);
    writes(q);
    const v = voidReceipt(q, a);
    const l = storedList(q);
    check('U.void', 'U. Voiding an active receipt: saved in one write; the receipt stays stored byte-identical; one void { id, eventType, voidsId, recordedAt, source: manual } is appended; October has no evidence',
      [v.status, writes(q), l.length, J(l[0]) === snapA, Object.keys(l[1]), l[1].voidsId, l[1].source, pageLedger(q, OCT).month, ids(pageLedger(q, OCT).receipts)],
      ['saved', 1, 2, true, ['id', 'eventType', 'voidsId', 'recordedAt', 'source'], a, 'manual', EMPTY_MONTH(OCT), [a]]);
    const text = raw(q);
    check('VW.refused', 'V/W. Voiding it again answers already_voided; an unknown id not_found; an empty id invalid — no write, nothing changed, no action left open',
      [voidReceipt(q, a).status, voidReceipt(q, 'inc_missing').status, voidReceipt(q, '').status, writes(q), raw(q) === text, q.run('_geodeFinancialActionOpen')],
      ['already_voided', 'not_found', 'invalid', 0, true, 0]);

    const c = octPage();
    watch(c);
    const orig = record(c, { amount: 3000, ym: OCT, date: '2026-10-09' }).id;
    const origText = J(storedList(c)[0]);
    writes(c);
    const z = correct(c, orig, { amount: 3100, ym: OCT, date: '2026-10-09' });
    const lz = storedList(c);
    check('Z.amount', 'Z. Correcting the amount: one write appends the void and the replacement; the original stays stored, retired; the replacement is the one active receipt (£3,100)',
      [z.status, writes(c), lz.length, J(lz[0]) === origText, [lz[1].eventType, lz[1].voidsId, lz[1].id === z.voidId], [lz[2].eventType, lz[2].amount, lz[2].id === z.id],
        lz[1].recordedAt === lz[2].recordedAt, ids(pageLedger(c, OCT).active), pageLedger(c, OCT).month.total],
      ['saved', 1, 3, true, ['void', orig, true], ['receipt', 3100, true], true, [z.id], 3100]);
    const aa = correct(c, z.id, { amount: 3100, ym: OCT, date: '2026-10-05' });
    check('AA.date', 'AA. Correcting the day within October: the replacement holds 5 October; still £3,100 in October', [aa.status, pageLedger(c, OCT).active.map(r => r.date), pageLedger(c, OCT).month.total], ['saved', ['2026-10-05'], 3100]);
    const ab = correct(c, aa.id, { amount: 3100, ym: '2026-09', date: '2026-09-30' });
    check('AB.month', 'AB. Correcting the day to 30 September moves the evidence: October no evidence, September £3,100; five events stored, none removed',
      [ab.status, pageLedger(c, OCT).month.total, pageLedger(c, '2026-09').month.total, storedList(c).length], ['saved', null, 3100, 7]);
    writes(c);
    const ct = raw(c);
    check('correct.refused', 'Correcting a retired receipt answers already_voided, an unknown one not_found, bad input invalid (before anything is prepared) — no write',
      [correct(c, orig, { amount: 1, ym: OCT }).status, correct(c, 'nope', { amount: 1, ym: OCT }).status, correct(c, ab.id, { amount: 0, ym: OCT }).reason, writes(c), raw(c) === ct],
      ['already_voided', 'not_found', 'invalid_amount', 0, true]);

    const u = octPage({ incomeReceipts: FUTURE });
    check('void.not-understood', 'Evidence this runtime does not understand cannot be voided or corrected by it (not_found); it is left as written',
      [voidReceipt(u, 'inc_prov').status, correct(u, 'inc_more', { amount: 1, ym: OCT }).status, same(storedList(u), FUTURE)], ['not_found', 'not_found', true]);
  });
}

// ───────────────────────────── failure, stale tabs ─────────────────────────────

function failures() {
  scenario('P3-5B FAILED WRITES (P2-9) — a write that does not land leaves no evidence, in memory or storage', () => {
    const fresh = octPage();
    fresh.run('__storageFault = "throw";');
    const r0 = record(fresh, { amount: 3000, ym: OCT });
    fresh.run('__storageFault = ""; __runTimers();');
    check('AD.first', 'AD. The first receipt write throws: failed; the field is absent again in memory and storage',
      [r0.status, has(fresh.state(), 'incomeReceipts'), has(stored(fresh), 'incomeReceipts')], ['failed', false, false]);

    ['throw', 'lose'].forEach(fault => {
      const f = octPage();
      watch(f);
      const keep = record(f, { amount: 3000, ym: OCT }).id;
      const text0 = raw(f);
      const attempt = op => {
        f.run('__storageFault = ' + J(fault) + ';');
        const r = op();
        f.run('__storageFault = ""; __runTimers();');
        return [r.status, raw(f) === text0, f.run('JSON.stringify(S) === _geodeCommittedText && _geodeCommittedText === __store'), ids(pageLedger(f, OCT).active), memList(f).length];
      };
      const name = fault === 'throw' ? 'setItem throws' : 'read-back mismatch';
      check((fault === 'throw' ? 'AD' : 'AF') + '.record', (fault === 'throw' ? 'AD' : 'AF') + '. ' + name + ' on a record: failed; storage byte-identical; memory is the committed text; no new receipt',
        attempt(() => record(f, { amount: 500, ym: OCT })), ['failed', true, true, [keep], 1]);
      check((fault === 'throw' ? 'AE' : 'AF') + '.void', (fault === 'throw' ? 'AE' : 'AF') + '. ' + name + ' on a void: failed; the receipt is still active; no void remains',
        attempt(() => voidReceipt(f, keep)), ['failed', true, true, [keep], 1]);
      check((fault === 'throw' ? 'AC' : 'AF') + '.correct', (fault === 'throw' ? 'AC' : 'AF') + '. ' + name + ' on a correction: failed; neither the void nor the replacement remains; the original is still active',
        attempt(() => correct(f, keep, { amount: 3100, ym: OCT })), ['failed', true, true, [keep], 1]);
      writes(f);
      const healed = correct(f, keep, { amount: 3100, ym: OCT });
      check('heal.' + fault, 'Once storage works the same correction is saved in one write, with no residue of the failed attempts (three events)',
        [healed.status, writes(f), storedList(f).length, pageLedger(f, OCT).month.total], ['saved', 1, 3, 3100]);
    });
  });

  scenario('P3-5B STALE TABS (P2-10) — a page another window has written behind records, voids and corrects nothing', () => {
    const seed = octPage();
    const id0 = record(seed, { amount: 1000, ym: OCT }).id;
    const base = raw(seed);
    const A = pageOver(base, '2026-10-12');
    const ra = record(A, { amount: 2000, ym: OCT });
    const textA = raw(A);
    const stale = op => {
      const B = pageOver(base, '2026-10-12');
      B.run('__store = ' + J(textA) + ';');
      const r = op(B);
      return [r.status, raw(B) === textA, memList(B).length, B.run('_geodeRuntimeStale')];
    };
    check('AG.record', 'AG. Tab A records £2,000; tab B (loaded before) records: refused at admission; A\'s text stands; B\'s memory holds no new receipt; B is stale (foreign)',
      [ra.status].concat(stale(B => record(B, { amount: 2000, ym: OCT }))), ['saved', 'refused', true, 1, 'foreign']);
    check('AH.void', 'AH. Tab B voids the receipt both tabs saw: refused; nothing written', stale(B => voidReceipt(B, id0)), ['refused', true, 1, 'foreign']);
    check('AI.correct', 'AI. Tab B corrects it: refused; nothing written', stale(B => correct(B, id0, { amount: 1100, ym: OCT })), ['refused', true, 1, 'foreign']);
    const B = pageOver(base, '2026-10-12');
    B.run('__store = ' + J(textA) + ';');
    record(B, { amount: 5, ym: OCT });
    B.run('__reload();');
    const after = record(B, { amount: 300, ym: OCT });
    check('AG.reload', 'After reloading, B sees A\'s receipt and records on top of it: three receipts, £3,300',
      [ids(pageLedger(B, OCT).active).slice(0, 2), after.status, pageLedger(B, OCT).month.total], [[id0, ra.id], 'saved', 3300]);
  });
}

// ───────────────────────────── boundary, history, baseline ─────────────────────────────

/** The baseline an ordinary October write captures over a state holding `list` (default: two receipts) as its receipts. */
function seededBaseline(mut, list) {
  const p = octPage({ incomeReceipts: list || [R('inc_a', 3000, OCT), R('inc_b', 2000, '2026-09')] });
  if (mut) mut(p);
  ordinary(p);
  const bl = stored(p).monthBaseline;
  return bl ? ['ym', 'income', 'outgoings', 'allocations', 'fromEarlier', 'expensesRegular', 'expensesOneOff', 'monthlyLeft'].map(k => bl[k]) : null;
}

function boundary() {
  scenario('P3-5B MONTH BOUNDARY AND HISTORY — evidence is never rolled, copied, reset or turned into plan', () => {
    const b = octPage();
    record(b, { amount: 3000, ym: OCT, date: '2026-10-09', label: 'Salary' });
    record(b, { amount: 400, ym: OCT });
    const octList = J(storedList(b));
    b.at('2026-11-03');
    b.render();
    const rolled = stored(b);
    check('AJ.session', 'AJ. The November roll (same session) stores the list byte-identical: October £3,400 still, November no evidence, planned income unchanged',
      [J(rolled.incomeReceipts) === octList, pageLedger(b, OCT).month.total, pageLedger(b, '2026-11').month, rolled.income, rolled.payments.find(x => x.id === 'rent').date],
      [true, 3400, EMPTY_MONTH('2026-11'), 3000, '2026-11-15']);
    b.run('__reload();');
    const nov = record(b, { amount: 3000, ym: '2026-11' });
    check('AJ.reload', 'After a reload a November receipt is November\'s; October\'s two are byte-identical before it',
      [J(storedList(b).slice(0, 2)) === octList, nov.status, pageLedger(b, '2026-11').month.total, pageLedger(b, OCT).month.total], [true, 'saved', 3000, 3400]);

    const pr = octPage();
    pr.toggle('rent');
    pr.at('2026-11-03');
    watch(pr);
    const first = record(pr, { amount: 3000, ym: '2026-11' });
    const st = stored(pr);
    check('AJ.prepare', 'A receipt as the first November action, before any render: admission processes the boundary first (its own write: rent reset for November), then the receipt\'s write',
      [first.status, writes(pr), st.payments.find(x => x.id === 'rent').status, st.payments.find(x => x.id === 'rent').date, st.incomeReceipts.length, pageLedger(pr, '2026-11').month.total],
      ['saved', 2, 'upcoming', '2026-11-15', 1, 3000]);

    const months = ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', OCT];
    const seeded = months.map((m, i) => R('inc_h' + i, 3000 + i, m, { date: m + '-25' })).concat(FUTURE);
    const h = octPage({ incomeReceipts: seeded });
    ordinary(h);
    h.advance('2026-11-03', 'reload');
    h.render();
    record(h, { amount: 3006, ym: '2026-11' });
    h.at('2027-04-20');
    h.render();
    ordinary(h);
    const hl = storedList(h);
    check('AK.six-months', 'AK/§40. Six months of history and later evidence through an ordinary write, the November roll, a November receipt and a five-month absence: every event kept in order, byte-identical; each month still its own',
      [same(hl.slice(0, seeded.length), seeded), hl.length, months.concat(['2026-11', '2027-04']).map(m => pageLedger(h, m).month.total)],
      [true, seeded.length + 1, [3000, 3001, 3002, 3003, 3004, 3005, 3006, null]]);
  });

  scenario('P3-5B BASELINE — a receipt may join the write that stores the month\'s baseline; it never moves a figure', () => {
    const p = octPage();
    const plan = json(p, 'geodeLivingMonthComponents(geodeLivingMonthModel(S, Date.now()))');
    const left = json(p, 'calcMonthlyLeftover(S)');
    check('AL.none', 'AL. Before: no baseline stored', has(stored(p), 'monthBaseline'), false);
    record(p, { amount: 3000, ym: OCT });
    const bl = stored(p).monthBaseline;
    const fields = ['income', 'outgoings', 'allocations', 'fromEarlier', 'expensesRegular', 'expensesOneOff', 'monthlyLeft'];
    check('AL.incidental', 'AL. The receipt\'s write stores October\'s baseline (taken from the committed pre-action plan): its figures are the plan\'s; Monthly Left and the components are unchanged',
      [bl.ym, fields.map(k => bl[k]), json(p, 'calcMonthlyLeftover(S)'), same(json(p, 'geodeLivingMonthComponents(geodeLivingMonthModel(S, Date.now()))'), plan)],
      [OCT, fields.map(k => plan[k]), left, true]);
    const blText = J(bl);
    p.at('2026-10-20');
    const id = record(p, { amount: 200, ym: OCT }).id;
    voidReceipt(p, id);
    correct(p, storedList(p)[0].id, { amount: 3100, ym: OCT });
    check('AM.kept', 'AM. Later receipts, a void and a correction leave the stored baseline byte-identical', J(stored(p).monthBaseline) === blText, true);
    check('AL.seeded', 'A state that already holds receipts (this month\'s and last month\'s) when its baseline is first captured gets the baseline a state without them gets',
      seededBaseline(), seededBaseline(null, []));
  });
}

// ───────────────────────────── invariance ─────────────────────────────

/** PLAN with a debt and its payment, and an investment, so every position is present. */
const RICH = () => ({
  debts: [{ id: 'dCard', name: 'Card', balance: 1200, apr: 19.9, minp: 50 }],
  investments: [{ id: 'iISA', name: 'ISA', balance: 5000, baseBalance: 5000, monthly: 0 }],
  payments: PLAN(OCT).payments.concat([{ id: 'card', name: 'Card payment', amount: 50, rec: 'yes', status: 'upcoming', date: '2026-10-20', debtId: 'dCard' }])
});

const VARIANTS = {
  none: () => {},
  one: p => record(p, { amount: 3000, ym: OCT }),
  multiple: p => { record(p, { amount: 1500, ym: OCT }); record(p, { amount: 1000, ym: OCT, date: '2026-10-09' }); record(p, { amount: 200, ym: OCT, label: 'Freelance' }); },
  voided: p => voidReceipt(p, record(p, { amount: 3000, ym: OCT }).id),
  corrected: p => correct(p, record(p, { amount: 3000, ym: OCT }).id, { amount: 3100, ym: OCT, date: '2026-10-05' }),
  past: p => record(p, { amount: 3000, ym: '2026-09', date: '2026-09-28' }),
  future: p => p.run('S.incomeReceipts = ' + J(FUTURE) + '; persistGeodeToLocalStorage();')
};

/** Everything financial the page shows or stores, apart from the receipt list and the revision stamp. */
function figures(page) {
  const st = page.state();
  delete st.incomeReceipts;
  delete st._rev;
  return J({
    state: st,
    left: json(page, 'calcMonthlyLeftover(S)'),
    confirmed: json(page, 'calcMonthlyLeftoverConfirmedOnly(S)'),
    payments: json(page, 'sumPaymentsMonthlyOutflow(S.payments)'),
    expenses: json(page, 'sumExpensesMonthly(S.expenses)'),
    model: json(page, 'geodeLivingMonthModel(S, Date.now())'),
    components: json(page, 'geodeLivingMonthComponents(geodeLivingMonthModel(S, Date.now()))'),
    snapshot: JSON.parse(page.run('__snapshot()')),
    debt: st.debts.map(d => d.balance),
    afford: json(page, 'computeAffordabilityContext(S)')
  });
}

/** The variant's outcome: figures after the receipts, and after the same completion, edit and November reload. */
function invarianceRun(name, mut) {
  const p = octPage(RICH());
  p.run(affordCode());
  if (mut) mut(p);
  ordinary(p);
  VARIANTS[name](p);
  const now = figures(p);
  p.toggle('rent');
  p.editPayment('hol', { amount: '150' });
  p.advance('2026-11-03', 'reload');
  p.run(affordCode());
  if (mut) mut(p);
  return [now, figures(p)];
}

function invariance() {
  scenario('P3-5B AUTHORITY — identical plans give identical figures, whatever receipt evidence sits beside them', () => {
    const names = Object.keys(VARIANTS);
    const all = names.map(n => invarianceRun(n));
    const afford = JSON.parse(all[0][0]).afford;
    check('AP.reached', 'The affordability engine itself runs here (its real code, with every function it reaches): plan room £1,340 from income £3,000', [afford.planRoom, afford.income], [1340, 3000]);
    check('AN-AQ.now', 'AN/AO/AP/AQ/§29. No receipts, one, several, a voided one, a corrected one, a past-month one, evidence from a later runtime: Monthly Left, the confirmed-only remainder, payment and expense totals, the Living Month model (its change comparison included), the P3-4 components and baseline, goals, investments, debts, affordability and every stored field but the receipt list are identical',
      names.map((n, i) => [n, all[i][0] === all[0][0]]), names.map(n => [n, true]));
    check('AN-AQ.after', 'And after the same completion, edit and November reload', names.map((n, i) => [n, all[i][1] === all[0][1]]), names.map(n => [n, true]));
  });
}

// ───────────────────────────── old runtime, export ─────────────────────────────

function oldRuntime() {
  scenario('P3-5B §37 — the deployed ' + OLD_RUNTIME + ' (' + OLD_REF + ') keeps an unknown top-level array, executably', () => {
    check('AU.identity', 'The program is ' + OLD_REF + '\'s own code: runtime ' + OLD_RUNTIME + ', schema 3, its real load / save / persist / store / rollback and recurring sync; it has no receipt code of its own',
      [OLD.version, OLD.schema, ['load', 'save', 'persistGeodeToLocalStorage', 'geodeStoreFinancialState', 'geodeRestoreCommittedState', 'geodeFinancialWriteAllowed', 'syncRecurringPayments'].every(n => OLD.names.indexOf(n) >= 0),
        OLD.src.indexOf('incomeReceipts') < 0], [OLD_RUNTIME, 3, true, true]);

    const w = octPage();
    const kept = record(w, { amount: 3000, ym: OCT, date: '2026-10-09', label: 'Salary' }).id;
    voidReceipt(w, record(w, { amount: 40, ym: OCT }).id);
    w.run('S.incomeReceipts = S.incomeReceipts.concat(' + J(FUTURE) + '); persistGeodeToLocalStorage();');
    const text = raw(w);
    const list = J(JSON.parse(text).incomeReceipts);
    check('AR-AT.this-runtime', 'AR/AS/AT. This runtime\'s own writes after that (a receipt, a reload, an ordinary write) keep the unknown source, the unknown event type, the extra fields and the non-object entry in place, byte-identical',
      (() => { const n = pageOver(text, '2026-10-12'); record(n, { amount: 1, ym: OCT }); n.run('__reload();'); ordinary(n); return [J(storedList(n).slice(0, JSON.parse(list).length)) === list, storedList(n).length]; })(),
      [true, JSON.parse(list).length + 1]);

    const old = new OldPage(text, '2026-10-12');
    check('AU.load', 'AU. Its load() on that text: the list is in its S exactly (its key copy keeps unknown fields), and its boot writes nothing over it',
      [J(old.state().incomeReceipts) === list, raw(old) === text], [true, true]);
    old.run('S.income = 3400; save();');
    const afterSave = stored(old);
    check('AU.save', 'AU. Its save() after a financial change (income £3,400): the stored list byte-for-byte beside the change, under a ' + OLD_RUNTIME + ' revision',
      [J(afterSave.incomeReceipts) === list, afterSave.income, afterSave._rev.by], [true, 3400, OLD_RUNTIME]);
    old.run('S.payments[0].status = "paid"; S.payments[0].lastPaidYM = "2026-10"; save(); S.expenses.push({ id: "gym", name: "Gym", amount: 75, rec: "yes", cat: "other", date: "2026-10-12" }); save(); S.lastSeenAt = Date.now(); persistGeodeToLocalStorage();');
    check('AU.ordinary', 'Its ordinary writes — a completion, an expense, the incidental persist — keep the list', [J(stored(old).incomeReceipts) === list, stored(old).expenses.length], [true, 3]);
    const before = raw(old);
    old.run('__storageFault = "throw"; S.income = 9999; S.incomeReceipts = []; save(); __storageFault = "";');
    const thrown = [J(old.state().incomeReceipts) === list, old.state().income, raw(old) === before];
    old.run('__storageFault = "lose"; S.income = 8888; S.incomeReceipts.length = 0; save(); __storageFault = "";');
    check('AV.rollback', 'AV. Its failed writes — setItem throws, and a read-back mismatch — after clearing the list in memory: its committed text comes back, list included; storage byte-identical',
      [thrown, [J(old.state().incomeReceipts) === list, old.state().income, raw(old) === before]], [[true, 3400, true], [true, 3400, true]]);
    old.run('__nowMs = ' + localNoon('2026-11-03') + '; syncRecurringPayments();');
    const novOld = stored(old);
    const back = pageOver(raw(old), '2026-11-05');
    ordinary(back);
    check('AW.boundary', 'AW. Its November roll carries the list unchanged; this runtime then reads October\'s evidence from it as before (£3,000, the provider and future entries uncounted) and keeps the list on its next write',
      [J(novOld.incomeReceipts) === list, novOld.payments.find(x => x.id === 'rent').date, pageLedger(back, OCT).month.total, ids(pageLedger(back, OCT).active), J(storedList(back)) === list],
      [true, '2026-11-15', 3000, [kept], true]);

    const oldTab = new OldPage(text, '2026-10-12');
    const newTab = pageOver(text, '2026-10-12');
    record(newTab, { amount: 700, ym: OCT });
    const newText = raw(newTab);
    oldTab.run('__store = ' + J(newText) + '; S.income = 100; save(); S.incomeReceipts = []; persistGeodeToLocalStorage();');
    check('AX.old-fenced', 'AX. An open ' + OLD_RUNTIME + ' tab, loaded before this runtime recorded a receipt: its save and persist re-read storage, see a newer revision and refuse (foreign); the receipt stands',
      [oldTab.run('_geodeRuntimeStale'), raw(oldTab) === newText, JSON.parse(newText).incomeReceipts.length], ['foreign', true, JSON.parse(list).length + 1]);
    const newTab2 = pageOver(text, '2026-10-12');
    const oldWriter = new OldPage(text, '2026-10-12');
    oldWriter.run('S.income = 3200; save();');
    const oldText = raw(oldWriter);
    newTab2.run('__store = ' + J(oldText) + ';');
    const refused = record(newTab2, { amount: 700, ym: OCT });
    const stillOld = raw(newTab2) === oldText;
    newTab2.run('__reload();');
    const saved = record(newTab2, { amount: 700, ym: OCT });
    check('AX.new-fenced', 'AX. The reverse: ' + OLD_RUNTIME + ' writes income £3,200 behind this runtime\'s page; its receipt is refused and that text stands; after a reload it is recorded on top of it, with the earlier list intact',
      [refused.status, stillOld, saved.status, stored(newTab2).income, J(storedList(newTab2).slice(0, JSON.parse(list).length)) === list], ['refused', true, 'saved', 3200, true]);
  });

  scenario('P3-5B EXPORT AND RESTORE — export carries the list verbatim; the unwired restore extractor drops it', () => {
    const e = octPage({ incomeReceipts: [R('inc_a', 3000, OCT)].concat(FUTURE) });
    record(e, { amount: 20, ym: OCT });
    const env = e.backup();
    check('AY.export', 'AY. The backup export holds incomeReceipts exactly as stored (unknown entries included)', J(env.data.incomeReceipts) === J(storedList(e)), true);
    const rest = e.restorable(env);
    check('AZ.restore', 'AZ. The restore extractor (no caller yet) strips incomeReceipts — a future restore must carry the list verbatim, never normalised',
      [has(rest.state, 'incomeReceipts'), rest.strippedKeys.indexOf('incomeReceipts') >= 0], [false, true]);
  });
}

// ───────────────────────────── mutants ─────────────────────────────

function mutants() {
  scenario('P3-5B MUTANTS — each rule is load-bearing', () => {
    const caught = (id, text, observed, clean) => check(id, text + ' — caught', !same(observed, clean), true);
    const RECORD_TAIL = "  S.incomeReceipts.push(receipt);\n  return geodeIncomeReceiptCommit({ status: 'saved', id: receipt.id });";

    const inv = mut => { const a = invarianceRun('none', mut), b = invarianceRun('multiple', mut); return [a[0] === b[0], a[1] === b[1]]; };
    caught('mut.income', 'A receipt that raises planned income breaks invariance',
      inv(p => mutate(p, 'geodeRecordIncomeReceipt', [[RECORD_TAIL, '  S.income = toNum(S.income) + receipt.amount;\n' + RECORD_TAIL]])), [true, true]);
    caught('mut.left', 'Monthly Left counting this month\'s receipts breaks invariance',
      inv(p => mutate(p, 'calcMonthlyLeftover', [['var income = toNum(state.income);', 'var income = toNum(state.income) + (geodeIncomeReceiptLedger(state.incomeReceipts, currentYM()).month.total || 0);']])), [true, true]);
    caught('mut.baseline', 'A baseline whose income (and remainder) include receipts differs from the one captured without them (AL.seeded)',
      seededBaseline(p => mutate(p, 'geodeMonthBaselineFromModel', [['    income: c.income,', '    income: c.income + (geodeIncomeReceiptLedger(S.incomeReceipts, model.month.ym).month.total || 0),'],
        ['    monthlyLeft: c.monthlyLeft', '    monthlyLeft: c.monthlyLeft + (geodeIncomeReceiptLedger(S.incomeReceipts, model.month.ym).month.total || 0)']])), seededBaseline(null, []));
    caught('mut.delta', 'A P3-4 comparison whose current income includes receipts breaks invariance',
      inv(p => mutate(p, 'geodeLivingMonthChanges', [["  if (!current) return { available: false, reason: 'plan_not_ready' };",
        "  if (!current) return { available: false, reason: 'plan_not_ready' };\n  current = Object.assign({}, current, { income: current.income + (geodeIncomeReceiptLedger(S.incomeReceipts, ym).month.total || 0) });"]])), [true, true]);
    caught('mut.afford', 'Affordability counting receipts breaks invariance',
      inv(p => mutate(p, 'computeAffordabilityContext', [['  var income = toNum(state.income);\n  var planRoom', '  var income = toNum(state.income) + (geodeIncomeReceiptLedger(state.incomeReceipts, currentYM()).month.total || 0);\n  var planRoom']])), [true, true]);

    const prepareRun = mut => { const pr = octPage(); pr.toggle('rent'); pr.at('2026-11-03'); if (mut) mut(pr); record(pr, { amount: 3000, ym: '2026-11' }); return stored(pr).payments.find(x => x.id === 'rent').status; };
    caught('mut.no-prepare', 'A receipt appended without geodePrepareFinancialMutation lands on an unprocessed boundary (rent still paid)',
      prepareRun(p => mutate(p, 'geodeRecordIncomeReceipt', [["  if (!geodePrepareFinancialMutation()) return { status: 'refused' };\n", '']])), 'upcoming');

    const failRun = (mut, fault) => {
      const f = octPage(); if (mut) mut(f);
      f.run('__storageFault = ' + J(fault || 'throw') + ';'); const r = record(f, { amount: 1, ym: OCT }); f.run('__storageFault = ""; __runTimers();');
      return [r.status, has(stored(f), 'incomeReceipts'), has(f.state(), 'incomeReceipts')];
    };
    caught('mut.second-path', 'A receipt stored through a second persistence path (a direct storage write, no read-back) claims saved when the write was lost',
      failRun(p => mutate(p, 'geodeIncomeReceiptCommit', [['  var result = save();', "  localStorage.setItem(KEY, JSON.stringify(S));\n  var result = 'saved';"]]), 'lose'), ['failed', false, false]);
    caught('mut.false-success', 'A writer reporting success after a failed save says saved',
      failRun(p => mutate(p, 'geodeIncomeReceiptCommit', [["  if (result === 'saved') return saved;", "  if (result === 'saved' || result === 'failed') return saved;"]])), ['failed', false, false]);

    const voidRun = mut => { const q = octPage(); if (mut) mut(q); const a = record(q, { amount: 3000, ym: OCT }).id; voidReceipt(q, a); return storedList(q).map(e => e.id === a ? 'receipt' : e.eventType); };
    caught('mut.delete', 'A void that deletes the receipt leaves it out of storage',
      voidRun(p => mutate(p, 'geodeVoidIncomeReceipt', [['  S.incomeReceipts.push(voidEvent);', '  S.incomeReceipts = S.incomeReceipts.filter(function (e) { return e.id !== receiptId; });']])), ['receipt', 'void']);

    const correctRun = mut => { const c = octPage(); if (mut) mut(c); const id = record(c, { amount: 3000, ym: OCT }).id; watch(c); correct(c, id, { amount: 3100, ym: OCT }); return writes(c); };
    caught('mut.two-saves', 'A correction that saves the void first takes two writes',
      correctRun(p => mutate(p, 'geodeCorrectIncomeReceipt', [['  S.incomeReceipts.push(voidEvent);\n', '  S.incomeReceipts.push(voidEvent);\n  save();\n']])), 1);

    const rollRun = mut => { const b = octPage(); if (mut) mut(b); record(b, { amount: 3000, ym: OCT }); const l = J(storedList(b)); b.at('2026-11-03'); b.render(); return J(storedList(b)) === l; };
    const ROLL = '  var ym = currentYM();\n  var changed = false;';
    caught('mut.roll-deletes', 'A boundary that drops earlier months\' receipts changes the stored list',
      rollRun(p => mutate(p, 'syncRecurringPayments', [[ROLL, ROLL + '\n  if (crossing && Array.isArray(S.incomeReceipts)) S.incomeReceipts = S.incomeReceipts.filter(function (r) { return r.ym === ym; });']])), true);
    caught('mut.roll-copies', 'A boundary that copies receipts forward changes the stored list',
      rollRun(p => mutate(p, 'syncRecurringPayments', [[ROLL, ROLL + '\n  if (crossing && Array.isArray(S.incomeReceipts)) S.incomeReceipts.slice().forEach(function (r) { S.incomeReceipts.push(Object.assign({}, r, { id: r.id + "_n", ym: ym })); });']])), true);

    const keepRun = mut => { const u = octPage({ incomeReceipts: FUTURE }); if (mut) mut(u); record(u, { amount: 1, ym: OCT }); return same(storedList(u).slice(0, FUTURE.length), FUTURE); };
    const NEW_LIST = '  if (!Array.isArray(S.incomeReceipts)) S.incomeReceipts = [];\n  var receipt';
    caught('mut.drop-source', 'A writer that normalises away unknown-source evidence loses it',
      keepRun(p => mutate(p, 'geodeRecordIncomeReceipt', [[NEW_LIST, "  if (!Array.isArray(S.incomeReceipts)) S.incomeReceipts = [];\n  S.incomeReceipts = S.incomeReceipts.filter(function (e) { return !e || typeof e !== 'object' || e.source === 'manual'; });\n  var receipt"]])), true);
    caught('mut.drop-type', 'A writer that normalises away unknown event types loses them',
      keepRun(p => mutate(p, 'geodeRecordIncomeReceipt', [[NEW_LIST, "  if (!Array.isArray(S.incomeReceipts)) S.incomeReceipts = [];\n  S.incomeReceipts = S.incomeReceipts.filter(function (e) { return !e || typeof e !== 'object' || e.eventType === 'receipt' || e.eventType === 'void'; });\n  var receipt"]])), true);

    const dateRun = mut => { const d = octPage(); if (mut) mut(d); record(d, { amount: 1, ym: OCT }); return has(storedList(d)[0], 'date'); };
    caught('mut.today', 'A month-only receipt defaulted to today gains a date',
      dateRun(p => mutate(p, 'geodeIncomeReceiptDraft', [["  if (draft.ym > today.slice(0, 7)) return { reason: 'future_month' };", "  if (!draft.date) draft.date = today;\n  if (draft.ym > today.slice(0, 7)) return { reason: 'future_month' };"]])), false);

    const lateRun = mut => { const p = octPage(); if (mut) mut(p); return ledgerOf(p, [R('late', 3000, OCT, { date: '2026-10-28', recordedAt: at('2026-11-03', 9) })], '2026-11').month.count; };
    caught('mut.recorded-month', 'Month ownership by recordedAt puts an October receipt in November',
      lateRun(p => mutate(p, 'geodeIncomeReceiptLedger', [['return r.ym === ym;', 'return geodeDateToLocalISO(new Date(r.recordedAt)).slice(0, 7) === ym;']])), 0);

    const twinRun = mut => { const p = octPage(); if (mut) mut(p); return ledgerOf(p, [R('t1', 200, OCT, { date: '2026-10-10' }), R('t2', 200, OCT, { date: '2026-10-10' })], OCT).month.count; };
    caught('mut.value-identity', 'Identity by amount and date collapses two genuine receipts into one',
      twinRun(p => mutate(p, 'geodeIncomeReceiptLedger', [["    owned[e.id] = receipt ? 'receipt' : 'void';",
        "    if (receipt && owned['k' + e.amount + e.ym + (e.date || '')]) { ignored++; continue; }\n    if (receipt) owned['k' + e.amount + e.ym + (e.date || '')] = 'value';\n    owned[e.id] = receipt ? 'receipt' : 'void';"]])), 2);

    const logRun = mut => { const p = octPage(); if (mut) mut(p); record(p, { amount: 3000, ym: OCT }); return (stored(p).activityLog || []).filter(e => e && e.type === 'income').length; };
    caught('mut.activity', 'A receipt written to the activity log as type income appears there',
      logRun(p => mutate(p, 'geodeRecordIncomeReceipt', [[RECORD_TAIL, "  appendActivityLog('income', receipt.amount);\n" + RECORD_TAIL]])), 0);

    const globalRun = mut => { const p = octPage(); if (mut) mut(p); p.run('S.incomeReceipts = ' + J([R('decoy', 777, OCT)]) + ';'); return ledgerOf(p, [R('a', 3000, OCT)], OCT).month.total; };
    caught('mut.global-state', 'A ledger that reads the page state counts the page\'s receipts instead of its argument',
      globalRun(p => mutate(p, 'geodeIncomeReceiptLedger', [['  var list = Array.isArray(events) ? events : [];', '  var list = Array.isArray(S && S.incomeReceipts) ? S.incomeReceipts : [];']])), 3000);

    const mutateRun = mut => { const p = octPage(); if (mut) mut(p); return p.run('(function () { var input = ' + J([R('a', 3000, OCT), V('v', 'a')]) + ', b = JSON.stringify(input); geodeIncomeReceiptLedger(input, "2026-10"); return JSON.stringify(input) === b; })()'); };
    caught('mut.mutates', 'A ledger that marks the events it reads changes its input',
      mutateRun(p => mutate(p, 'geodeIncomeReceiptLedger', [["    owned[e.id] = receipt ? 'receipt' : 'void';", "    owned[e.id] = receipt ? 'receipt' : 'void';\n    e.counted = true;"]])), true);
  });
}

function main() {
  validators();
  ledger();
  draft();
  writers();
  failures();
  boundary();
  invariance();
  oldRuntime();
  mutants();
  console.log('Beynd income receipt evidence (P3-5B)');
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL').padEnd(6) + r.id.padEnd(22) + ' ' + r.text + (r.detail ? '\n' + ' '.repeat(30) + r.detail : ''));
  });
  const failed = results.filter(r => !r.ok).length;
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
