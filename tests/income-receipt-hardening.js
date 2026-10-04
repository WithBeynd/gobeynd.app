#!/usr/bin/env node
/**
 * P3-5E income receipt hardening — dependency-free: node tests/income-receipt-hardening.js
 *
 * Real flows through the P3-5D receipt experience on the same simulated app as tests/income-receipt-ux.js (production
 * writers, save, store, rollback and revision fencing; every action a click on the rendered control): every receipt the
 * dialog can create stays reachable (no day outside the month Beynd shows, no correction out of it); a day or month
 * change while the dialog is open writes nothing; one action makes one write (double clicks, Record another twice,
 * Enter); the duplicate prompt reads active understood receipts only; a correction that changes nothing writes and says
 * nothing; the whole record → correct → remove loop with one and two receipts (aggregate, rows, focus, Monthly Left,
 * P3-4, storage, baseline, revision); reload and a second tab; amount parsing; label escaping; an income plan of £0
 * versus none entered; irregular income; dialog accessibility; Home never calls a payment overdue only because no outcome is
 * recorded — then each mutant of index.html must fail a check.
 * Exit code 0 when every check passes, 1 otherwise.
 */
'use strict';

const mb = require('./month-baseline.js');
const ux = require('./income-receipt-ux.js');

const { PLAN, pageOver, raw, at } = mb;
const { SRC, OCT, GBP, BASELINE, R, V, NONE, BANNED, page, install, val, T, TS, click, incomeLine, pulseText, dialogOpen, dialogText,
  calls, saves, reset, toasts, ledger, storedList, memList, incomePart, detailText, figures, openRecord, fill, submit, recordVia, openOn, errors } = ux;
const J = JSON.stringify;
const DAY_MSG = 'Choose a day in October. Beynd can only show this month\u2019s income records for now.';
const DATE_CHANGED = 'The date changed while this was open, so nothing was saved. Please try again.';
const ADD = ' Add income';
const RECORD = ' Record income received';

/** October's page (as tests/income-receipt-ux.js) loaded on `iso`, the clock then set to h:mi, the experience installed. */
function pageAt(src, over, iso, h, mi) {
  const p = pageOver(J(Object.assign(PLAN(OCT), { cur: GBP, incomeType: 'stable', incomeTypeUserSet: true, monthBaseline: BASELINE }, over || {})), iso);
  if (h != null) clockTo(p, iso, h, mi);
  return install(p, src);
}
const clockTo = (p, iso, h, mi) => p.run('__nowMs = ' + at(iso, h, mi || 0) + ';');
const reloadPage = p => p.run('__reload(); render(); __runTimers();');
const focusId = p => p.run('__focusId()');
const actionIds = p => val(p, 'document.querySelectorAll("[data-geode-receipt-action]").map(function (b) { return b.getAttribute("data-geode-receipt-action") + ":" + b.getAttribute("data-geode-receipt-id"); })');
const activeIds = p => (ledger(p) ? ledger(p).active.map(r => r.id) : []);
const rev = p => { const s = JSON.parse(raw(p)); return s._rev ? s._rev.seq : null; };
const promptShown = p => p.run('!!document.getElementById("geode-ir-duplicate")');
const clickTwice = (p, expr) => p.run('(function () { var b = ' + expr + '; __click(b); __click(b); })(); __runTimers();');
const recordAnother = 'document.querySelectorAll("#geode-ir-duplicate button").slice(-1)[0]';
const parsed = (p, s) => p.run('String(geodeIncomeReceiptParseAmount(' + J(s) + '))');

function checksFor(src) {
  const results = [];
  let group = '';
  const section = (name, fn) => {
    group = name;
    try {
      fn();
    } catch (e) {
      results.push({ group, id: 'section.threw', text: 'The section ran to the end', ok: false, detail: String(e && e.message) });
    }
  };
  const check = (id, text, actual, expected) => {
    const ok = J(actual) === J(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + J(expected) + ', observed ' + J(actual) });
  };
  const P = over => page(src, over);

  section('HISTORICAL RECEIPTS — every receipt the dialog can create or move stays reachable (§3–6)', () => {
    const tries = ['2026-09-30', '2025-10-12', '2026-01-01'].map(d => {
      const q = P();
      recordVia(q, { amount: '900', timing: 'day', date: d });
      return [calls(q).length, errors(q)[2], dialogOpen(q), memList(q)];
    });
    check('H.earlier-day', 'Another day in an earlier month (30 Sep, a year ago, January) is not recorded: the message names October; no writer call; nothing stored',
      tries, Array(3).fill([0, DAY_MSG, true, undefined]));

    const b = P({ incomeReceipts: [R('inc_a', 3000)] });
    openRecord(b);
    const recordBounds = val(b, '[document.getElementById("geode-ir-date").getAttribute("min"), document.getElementById("geode-ir-date").getAttribute("max")]');
    b.run('geodeIncomeReceiptClose(); __runTimers();');
    openOn(b, 'correct', 'inc_a');
    const correctBounds = val(b, '[document.getElementById("geode-ir-date").getAttribute("min"), document.getElementById("geode-ir-date").getAttribute("max")]');
    check('H.picker', 'The day picker offers only October up to today, when recording and when correcting', [recordBounds, correctBounds], [['2026-10-01', '2026-10-12'], ['2026-10-01', '2026-10-12']]);

    const c = P();
    openRecord(c);
    check('H.choices', 'Exactly three timing choices; "day not known" is this month; there is no month picker or list to choose another month',
      [val(c, 'document.querySelectorAll(\'input[name="geode-ir-when"]\').map(function (r) { return r.getAttribute("value"); })'),
        TS(c, '#modal fieldset label').slice(-1)[0], c.run('document.querySelectorAll(\'#modal select, #modal input[type="month"]\').length')],
      [['today', 'day', 'month'], 'This month \u2014 day not known', 0]);
    fill(c, { amount: '900', timing: 'month' });
    submit(c);
    check('H.month-only', 'Month-only is October evidence with no day: the only month-only receipt the dialog can create', calls(c), [['record', { amount: 900, ym: OCT }]]);

    const m = P();
    recordVia(m, { amount: '1000', timing: 'today' });
    recordVia(m, { amount: '200', timing: 'day', date: '2026-10-03' });
    recordVia(m, { amount: '300', timing: 'month' });
    const ids = activeIds(m);
    check('H.manageable', 'Every way of recording (Today, a day in October, October with no day) gives a receipt listed with its own Correct and Remove record',
      [ids.length, actionIds(m).sort()], [3, ids.map(id => 'correct:' + id).concat(ids.map(id => 'remove:' + id)).sort()]);

    const mv = P({ incomeReceipts: [R('inc_m', 3000)] });
    openOn(mv, 'correct', 'inc_m');
    fill(mv, { timing: 'day', date: '2026-09-15' });
    submit(mv);
    const refused = [calls(mv).filter(x => x[0] === 'correct'), errors(mv)[2], activeIds(mv)];
    if (!dialogOpen(mv)) openOn(mv, 'correct', activeIds(mv)[0]);
    fill(mv, { timing: 'day', date: '2026-10-03' });
    submit(mv);
    check('H.correct-stays', 'Correcting into September is not saved (a message on the day; still listed); correcting to 3 Oct saves and stays listed',
      [refused, ledger(mv).active.map(r => [r.amount, r.date]), actionIds(mv).length], [[[], DAY_MSG, ['inc_m']], [[3000, '2026-10-03']], 2]);

    const o = P({ incomeReceipts: [R('inc_sep', 700, { ym: '2026-09', date: '2026-09-20' })] });
    reset(o);
    const before = raw(o);
    o.run('geodeIncomeReceiptCorrect("inc_sep", null); geodeIncomeReceiptRemove("inc_sep", null); __runTimers();');
    check('H.no-orphan-door', 'An earlier month\'s receipt (stored by an earlier runtime or another device) has no control and opens no dialog; nothing writes; October says none recorded',
      [actionIds(o), dialogOpen(o), calls(o), raw(o) === before, incomeLine(o)], [[], false, [], true, NONE + RECORD]);
  });

  section('DAY AND MONTH CHANGE WHILE THE DIALOG IS OPEN (§11)', () => {
    const midnight = (over, f, mode) => {
      const p = pageAt(src, over, '2026-10-31', 23, 58);
      if (mode === 'correct') openOn(p, 'correct', 'inc_a'); else openRecord(p);
      fill(p, f);
      const shown = T(p, '#modal fieldset label');
      const before = raw(p);
      clockTo(p, '2026-11-01', 0, 1);
      reset(p);
      submit(p);
      return [shown.indexOf('Today (31 Oct)') >= 0, calls(p), raw(p) === before, dialogOpen(p), toasts(p)];
    };
    const expectNone = [true, [], true, false, [DATE_CHANGED]];
    check('B.today', 'Opened 31 Oct ("Today (31 Oct)"), submitted at 00:01 on 1 Nov: nothing written — never stored as 1 Nov, never as 31 Oct after the month ended; the user is told',
      midnight({}, { amount: '3000', timing: 'today' }), expectNone);
    check('B.month-only', 'October with no day, submitted on 1 Nov: nothing written', midnight({}, { amount: '3000', timing: 'month' }), expectNone);
    check('B.another-day', 'Another day (30 Oct), submitted on 1 Nov: nothing written', midnight({}, { amount: '3000', timing: 'day', date: '2026-10-30' }), expectNone);
    check('B.correct', 'A correction opened 31 Oct and saved on 1 Nov: nothing written', midnight({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05' })] }, { amount: '2900' }, 'correct'), expectNone);

    const d = pageAt(src, {}, '2026-10-12', 23, 59);
    openRecord(d);
    fill(d, { amount: '3000', timing: 'today' });
    clockTo(d, '2026-10-13', 0, 0);
    submit(d);
    const first = [calls(d), toasts(d)];
    openRecord(d);
    const label = T(d, '#modal fieldset label');
    fill(d, { amount: '3000', timing: 'today' });
    submit(d);
    check('B.midnight', 'Within the month too: "Today (12 Oct)" submitted on 13 Oct writes nothing; reopened it says Today (13 Oct) and records 13 Oct',
      [first, label.indexOf('Today (13 Oct)') >= 0, ledger(d).active.map(r => r.date)], [[[], [DATE_CHANGED]], true, ['2026-10-13']]);
  });

  section('ONE ACTION, ONE WRITE (§13–14)', () => {
    const a = P();
    openRecord(a);
    fill(a, { amount: '3000', timing: 'today' });
    clickTwice(a, 'document.getElementById("geode-ir-submit")');
    check('D.double-click', 'Two clicks on Record before the dialog has gone: one writer call, one save, one receipt', [calls(a).length, saves(a), activeIds(a).length], [1, 1, 1]);

    const e = P();
    openRecord(e);
    fill(e, { amount: '3000', timing: 'today' });
    e.run('var el = document.getElementById("geode-ir-amount"); __fire(el, "keydown", { key: "Enter" }); __fire(el, "keydown", { key: "Enter" }); __runTimers();');
    check('D.enter', 'Enter in a field submits nothing (no form, no implicit submit): no writer call; the dialog stays',
      [calls(e), dialogOpen(e), e.run('document.querySelectorAll("#modal form").length')], [[], true, 0]);

    const r = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-12' })] });
    recordVia(r, { amount: '3000', timing: 'today' });
    const prompted = promptShown(r);
    clickTwice(r, recordAnother);
    check('D.record-another', 'Record another pressed twice: one writer call — two receipts in all, the earlier one and this one', [prompted, calls(r).length, activeIds(r).length], [true, 1, 2]);

    const v = P({ incomeReceipts: [R('inc_a', 3000)] });
    openOn(v, 'remove', 'inc_a');
    clickTwice(v, 'document.getElementById("geode-ir-remove")');
    check('D.remove', 'Remove record pressed twice: one void call, one save', [calls(v), saves(v)], [[['void', 'inc_a']], 1]);

    const c = P({ incomeReceipts: [R('inc_a', 3000)] });
    openOn(c, 'correct', 'inc_a');
    fill(c, { amount: '2900' });
    clickTwice(c, 'document.getElementById("geode-ir-submit")');
    check('D.correct', 'Save correction pressed twice: one correct call, one save, one active receipt', [calls(c).length, saves(c), ledger(c).active.map(x => x.amount)], [1, 1, [2900]]);

    const f = P();
    openRecord(f);
    fill(f, { amount: '3000', timing: 'today' });
    f.run('__storageFault = "throw";');
    submit(f);
    f.run('__storageFault = ""; _geodeWriteFailedTask = false;');
    submit(f);
    check('D.retry', 'A failed write saved nothing, so pressing Record again is a new attempt: two calls, one receipt', [calls(f).length, activeIds(f).length, storedList(f).length], [2, 1, 1]);
  });

  section('DUPLICATE PROMPT — active understood receipts only, never identity (§8)', () => {
    const DAY = '2026-10-12';
    const asks = (over, f) => {
      const p = P(over);
      recordVia(p, f);
      return [promptShown(p), calls(p).length];
    };
    const today3000 = { amount: '3000', timing: 'today' };
    check('I.voided', 'A removed receipt of the same amount and day: no prompt; recorded at once', asks({ incomeReceipts: [R('inc_a', 3000, { date: DAY }), V('inc_v', 'inc_a')] }, today3000), [false, 1]);
    check('I.unknown-source', 'An entry from a source this runtime does not understand: no prompt', asks({ incomeReceipts: [R('inc_x', 3000, { date: DAY, source: 'smart_import' })] }, today3000), [false, 1]);
    check('I.unknown-event', 'An event type this runtime does not understand: no prompt',
      asks({ incomeReceipts: [{ id: 'inc_u', eventType: 'adjustment', amount: 3000, ym: OCT, date: DAY, recordedAt: at(DAY, 9), source: 'manual' }] }, today3000), [false, 1]);
    check('I.other-month', 'The same amount in September: no prompt for October', asks({ incomeReceipts: [R('inc_s', 3000, { ym: '2026-09', date: '2026-09-12' })] }, { amount: '3000', timing: 'month' }), [false, 1]);
    check('I.month-only-twin', 'Both with no day, same amount, same month: the prompt asks first', asks({ incomeReceipts: [R('inc_m', 3000)] }, { amount: '3000', timing: 'month' }), [true, 0]);
    check('I.dated-vs-month', 'A dated receipt and a no-day one are not matched (different evidence): no prompt', asks({ incomeReceipts: [R('inc_m', 3000)] }, today3000), [false, 1]);

    const k = P({ incomeReceipts: [R('inc_a', 3000, { date: DAY })] });
    openOn(k, 'correct', 'inc_a');
    fill(k, { amount: '2900' });
    submit(k);
    reset(k);
    recordVia(k, today3000);
    const original = [promptShown(k), calls(k).length];
    reset(k);
    recordVia(k, { amount: '2900', timing: 'today' });
    check('I.corrected', 'After correcting £3,000 to £2,900: recording £3,000 is not prompted (the original is retired); recording £2,900 is', [original, promptShown(k)], [[false, 1], true]);

    const g = P({ incomeReceipts: [R('inc_a', 3000, { date: DAY })] });
    recordVia(g, today3000);
    g.run('__click(' + recordAnother + '); __runTimers();');
    check('I.genuine-twins', 'Two genuine identical salaries: prompted once, Record another keeps both — the prompt never merges or refuses',
      ledger(g).active.map(r => [r.amount, r.date]), [[3000, DAY], [3000, DAY]]);
  });

  section('A CORRECTION THAT CHANGES NOTHING (§9)', () => {
    const n = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05', label: 'Salary' })] });
    const before = raw(n);
    reset(n);
    openOn(n, 'correct', 'inc_a');
    fill(n, { label: '  Salary ' });
    submit(n);
    check('J.no-op', 'Save correction with nothing changed (a label differing only by spaces): no writer call, no save, no message, the dialog closes, focus back on Correct; storage, revision and baseline as they were',
      [calls(n), saves(n), toasts(n), dialogOpen(n), focusId(n), raw(n) === before], [[], 0, [], false, 'correct:inc_a', true]);
  });

  section('RECORD → RENDER → CORRECT → RENDER → REMOVE → RENDER (§10)', () => {
    const L = P();
    const start = figures(L);
    const rev0 = rev(L);
    openRecord(L);
    fill(L, { amount: '2500', timing: 'today', label: 'Salary' });
    submit(L);
    const id1 = activeIds(L)[0];
    const s1 = [incomeLine(L), incomePart(L), focusId(L), rev(L) - rev0, storedList(L).map(e => e.eventType), toasts(L)];
    openOn(L, 'correct', id1);
    fill(L, { amount: '2400' });
    submit(L);
    const id2 = activeIds(L)[0];
    const s2 = [incomeLine(L), incomePart(L).rows, focusId(L), rev(L) - rev0, storedList(L).map(e => e.eventType), toasts(L).slice(-1)];
    openOn(L, 'remove', id2);
    click(L, '#geode-ir-remove');
    const s3 = [incomeLine(L), incomePart(L), focusId(L), rev(L) - rev0, storedList(L).map(e => e.eventType), toasts(L).slice(-1)];
    check('K.record', 'Record: "£2,500 recorded as received this month"; one row (Salary · £2,500 income recorded · 12 Oct); focus on Add income; one revision; one receipt event',
      s1, ['\u00a32,500 recorded as received this month.' + ADD,
        { heading: 'Income \u00a32,500 recorded as received', rows: [['Salary', '\u00a32,500 income recorded \u00b7 12 Oct', ['Correct', 'Remove record']]], note: 'Planned income \u00a33,000' },
        'add', 1, ['receipt'], ['Income recorded.']]);
    check('K.correct', 'Correct to £2,400: the total and the row follow; the old receipt is retired, not edited; one more revision', s2,
      ['\u00a32,400 recorded as received this month.' + ADD, [['Salary', '\u00a32,400 income recorded \u00b7 12 Oct', ['Correct', 'Remove record']]], 'add', 2,
        ['receipt', 'void', 'receipt'], ['Correction saved.']]);
    check('K.remove', 'Remove: none recorded again (no £0); no Income part; focus on Record income received; history kept; one more revision', s3,
      [NONE + RECORD, null, 'record', 3, ['receipt', 'void', 'receipt', 'void'], ['Income record removed.']]);
    check('K.untouched', 'Through all three: plan, Monthly Left, remainder, counted payments, P3-4 changes, the baseline, gaps and activity log exactly as before', figures(L), start);

    const two = P();
    const start2 = figures(two);
    recordVia(two, { amount: '3000', timing: 'today' });
    recordVia(two, { amount: '500', timing: 'day', date: '2026-10-03', label: 'Freelance' });
    const t1 = [incomeLine(two), incomePart(two).rows.map(r => r[0] + ' | ' + r[1])];
    const [free, salary] = [ledger(two).active.find(r => r.amount === 500).id, ledger(two).active.find(r => r.amount === 3000).id];
    openOn(two, 'correct', free);
    fill(two, { amount: '600' });
    submit(two);
    const t2 = incomeLine(two);
    openOn(two, 'remove', salary);
    click(two, '#geode-ir-remove');
    const t3 = [incomeLine(two), incomePart(two).rows.map(r => r[0] + ' | ' + r[1]), focusId(two)];
    const lastId = activeIds(two)[0];
    openOn(two, 'remove', lastId);
    click(two, '#geode-ir-remove');
    check('K.two', 'Two receipts: £3,500 listed by day (Freelance 3 Oct, then 12 Oct); correcting Freelance to £600 → £3,600; removing the salary → £600; removing the last → none recorded; figures untouched',
      [t1, t2, t3, incomeLine(two), figures(two)],
      [['\u00a33,500 recorded as received this month.' + ADD, ['Freelance | \u00a3500 income recorded \u00b7 3 Oct', 'Income recorded | \u00a33,000 \u00b7 12 Oct']],
        '\u00a33,600 recorded as received this month.' + ADD,
        ['\u00a3600 recorded as received this month.' + ADD, ['Freelance | \u00a3600 income recorded \u00b7 3 Oct'], 'add'],
        NONE + RECORD, start2]);
  });

  section('RELOAD AND A SECOND TAB (§12, §35–36)', () => {
    const p = P();
    recordVia(p, { amount: '2500', timing: 'today' });
    reloadPage(p);
    const r1 = incomeLine(p);
    openOn(p, 'correct', activeIds(p)[0]);
    fill(p, { amount: '2400' });
    submit(p);
    reloadPage(p);
    const r2 = [incomeLine(p), activeIds(p).length];
    openOn(p, 'remove', activeIds(p)[0]);
    click(p, '#geode-ir-remove');
    reloadPage(p);
    const r3 = incomeLine(p);
    recordVia(p, { amount: '1200', timing: 'month' });
    reloadPage(p);
    check('AH.reload', 'Each step survives a reload from storage: recorded → corrected (one active) → removed (none recorded); a no-day receipt reloads as "October · no day recorded"',
      [r1, r2, r3, incomePart(p).rows[0][1]], ['\u00a32,500 recorded as received this month.' + ADD, ['\u00a32,400 recorded as received this month.' + ADD, 1], NONE + RECORD,
        '\u00a31,200 \u00b7 October \u00b7 no day recorded']);

    const base = raw(P());
    const A = install(pageOver(base, '2026-10-12'), src);
    const B = install(pageOver(base, '2026-10-12'), src);
    openRecord(A);
    fill(A, { amount: '3000', timing: 'today' });
    recordVia(B, { amount: '2500', timing: 'today' });
    A.run('__store = ' + J(raw(B)) + ';');
    reset(A);
    submit(A);
    const stale = [calls(A).length, A.run('__staleGate') !== '', errors(A)[4], memList(A), incomeLine(A), toasts(A)];
    reloadPage(A);
    check('AH.two-tabs', 'A has the dialog open; B records £2,500; A submits £3,000: refused, reload gate, "nothing was saved", no receipt or total in A, no success. After reload A shows B\'s £2,500 only',
      [stale, incomeLine(A), activeIds(A).length], [[1, true, 'Nothing was saved. Beynd changed in another tab or window \u2014 reload to continue.', undefined, NONE + RECORD, []],
        '\u00a32,500 recorded as received this month.' + ADD, 1]);
  });

  section('AMOUNT INPUT (§15)', () => {
    const p = P();
    const table = {
      '1': '1', '1.2': '1.2', '1.20': '1.2', '1,000': '1000', '\u00a31,000': '1000', '\u00a3 1,000.50': '1000.5', '0.01': '0.01', ' 2 500 ': '2500', '2\u00a0500': '2500',
      '12,500,000': '12500000', '.5': '0.5', '+5': '5', '1e3': 'NaN', '1E3': 'NaN', '2,50': 'NaN', '1.000,50': 'NaN', '1,0000': 'NaN', '1000,5': 'NaN', ',5': 'NaN',
      'abc': 'NaN', '--5': 'NaN', '0x10': 'NaN', 'Infinity': 'NaN', '1.2.3': 'NaN', '\u00a3': '', '': ''
    };
    const keys = Object.keys(table);
    check('O.parse', 'Ordinary amounts, thousands commas, a leading £ and pasted spaces read as typed; scientific notation, decimal commas (2,50), broken groups and words are not numbers — never reinterpreted',
      keys.map(k => [k, parsed(p, k)]), keys.map(k => [k, table[k]]));
    const tryAmount = a => {
      const q = P();
      openRecord(q);
      fill(q, { amount: a, timing: 'today' });
      const label = T(q, '#geode-ir-submit');
      submit(q);
      return [label, calls(q).length, errors(q)[0]];
    };
    check('O.dynamic', 'In the dialog: 2,50 and 1e3 are refused in words; £1,000,000,000,000 is too large to record (the button never shows it); 0.001 and -5 are the writer\'s refusals; nothing is recorded',
      ['2,50', '1e3', '1,000,000,000,000', '0.001', '-5'].map(tryAmount),
      [['Record income received', 0, 'Enter the amount in numbers, like 2500 or 2500.50.'], ['Record income received', 0, 'Enter the amount in numbers, like 2500 or 2500.50.'],
        ['Record income received', 0, 'That amount is too large to record.'], ['Record income received', 1, 'Enter an amount more than zero, with no more than two decimal places.'],
        ['Record income received', 1, 'Enter an amount more than zero, with no more than two decimal places.']]);
    const big = P();
    recordVia(big, { amount: '\u00a3999,999,999,999.99', timing: 'today' });
    check('O.largest', 'The largest amount accepted is held to the penny', ledger(big).active.map(r => r.amount), [999999999999.99]);
  });

  section('LABELS ARE TEXT (§16)', () => {
    const labels = ['<img src=x onerror=alert(1)>', '"Tom & Jerry\'s" <b>bold</b>', '\ud83d\udcb7 Salary', 'A'.repeat(40), 'Sal\nary <script>x</script>'];
    const p = P();
    labels.forEach((l, i) => recordVia(p, { amount: String(100 + i), timing: 'today', label: l }));
    const injected = p.run('document.querySelectorAll("#tab-home img, #tab-home b, #tab-home script").length');
    const titles = incomePart(p).rows.map(r => r[0]);
    const aria = val(p, 'document.querySelectorAll(\'[data-geode-receipt-action="correct"]\').map(function (b) { return b.getAttribute("aria-label"); })');
    const id = ledger(p).active.find(r => r.amount === 100).id;
    openOn(p, 'correct', id);
    const prefill = val(p, 'document.getElementById("geode-ir-label").value');
    const dialogInjected = p.run('document.querySelectorAll("#modal img, #modal b, #modal script").length');
    p.run('geodeIncomeReceiptClose(); __runTimers();');
    openOn(p, 'remove', id);
    const removeText = dialogText(p);
    const rowCss = p.run('document.querySelector(\'[data-geode-month-income-receipt="1"] > div\').getAttribute("data-geode-css") || document.querySelector(\'[data-geode-month-income-receipt="1"] > div\').getAttribute("style") || ""');
    check('P.escaped', 'Markup-looking labels, quotes, ampersands, emoji, a 40-letter word and a line break stay text everywhere: no element is created; titles, aria-labels, the correction field and the remove summary show them literally; rows wrap',
      [injected, titles.slice().sort(), aria.every(a => labels.some(l => a.indexOf(l.replace(/\s+/g, ' ').trim()) >= 0 || a.indexOf(l.trim()) >= 0)), prefill, dialogInjected,
        removeText.indexOf('<img src=x onerror=alert(1)>') >= 0, /overflow-wrap:anywhere/.test(rowCss)],
      [0, labels.map(l => l.replace(/\s+/g, ' ').trim()).sort(), true, '<img src=x onerror=alert(1)>', 0, true, true]);
  });

  section('AN INCOME PLAN OF £0 VERSUS NONE ENTERED (§31)', () => {
    const note = over => { const p = P(over); return [incomePart(p) && incomePart(p).note, incomeLine(p)]; };
    const rec = { incomeReceipts: [R('inc_a', 500, { date: '2026-10-05' })] };
    check('AE.explicit-zero', 'Income entered as £0: "No planned income this month."', note(Object.assign({ income: 0, incomeExplicitlySet: true }, rec)),
      ['No planned income this month.', '\u00a3500 recorded as received this month.' + ADD]);
    check('AE.unset', 'Income never entered: "Planned income hasn\u2019t been set." — not known is never said to be none', note(Object.assign({ income: 0, incomeExplicitlySet: false }, rec)),
      ['Planned income hasn\u2019t been set.', '\u00a3500 recorded as received this month.' + ADD]);
    check('AE.unset-none', 'Income never entered, nothing recorded: only the evidence sentence — no plan claim', note({ income: 0, incomeExplicitlySet: false }), [null, NONE + RECORD]);
    const q = P({ income: 0, incomeExplicitlySet: false });
    openRecord(q);
    check('AE.no-offer', 'With no income plan the dialog offers no planned amount', q.run('document.querySelectorAll("[data-geode-ir-planned]").length'), 0);
  });

  section('IRREGULAR INCOME (§30)', () => {
    const IRR = { incomeType: 'irregular' };
    const PROGRESS = /progress|target|to go|toward|so far|\d+\s?%|\bof \u00a3|remaining|left to receive|behind|ahead of/i;
    const look = receipts => {
      const p = P(Object.assign({ incomeReceipts: receipts }, IRR));
      const text = pulseText(p) + ' ' + detailText(p);
      const income = incomeLine(p) + ' ' + (incomePart(p) ? J(incomePart(p)) : '');
      return [incomeLine(p), incomePart(p) && incomePart(p).note, PROGRESS.test(income), BANNED.test(income), /Monthly Left|left if the month goes to plan/.test(incomeLine(p)), text.length > 0];
    };
    check('AD.none', 'Nothing recorded: "Planned income can vary." then the evidence sentence', look([]), ['Planned income can vary. ' + NONE + RECORD, null, false, false, false, true]);
    check('AD.partial', 'Partial (£1,000 of a £3,000 plan): the amount recorded and the plan, side by side — no progress, share or remainder',
      look([R('inc_a', 1000, { date: '2026-10-05' })]), ['\u00a31,000 recorded as received this month.' + ADD, 'Planned income \u00a33,000 \u00b7 irregular', false, false, false, true]);
    check('AD.above', 'Above plan (£3,500): no surplus or "ahead" figure', look([R('inc_a', 3500, { date: '2026-10-05' })]),
      ['\u00a33,500 recorded as received this month.' + ADD, 'Planned income \u00a33,000 \u00b7 irregular', false, false, false, true]);
    check('AD.multiple', 'Several receipts: one total, each listed; still no progress wording', look([R('inc_a', 1000, { date: '2026-10-05' }), R('inc_b', 800, { date: '2026-10-09' })]),
      ['\u00a31,800 recorded as received this month.' + ADD, 'Planned income \u00a33,000 \u00b7 irregular', false, false, false, true]);
  });

  section('DIALOG ACCESSIBILITY — remove and duplicate confirmations (§17)', () => {
    const p = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-12' })] });
    openOn(p, 'remove', 'inc_a');
    const opened = [focusId(p), val(p, '__dialog().firstElementChild.getAttribute("role")'), val(p, '__dialog().firstElementChild.getAttribute("aria-labelledby")'), T(p, '#geode-ir-title')];
    p.run('document.getElementById("geode-ir-remove").focus(); __fire(document.activeElement, "keydown", { key: "Tab" });');
    const wrapped = val(p, 'document.activeElement.getAttribute("aria-label")');
    p.run('__fire(document.activeElement, "keydown", { key: "Escape" }); __runTimers();');
    check('Q.remove', 'Remove: a named modal dialog; focus starts on Keep record; Tab from Remove record wraps to Close; Escape closes and focus returns to that receipt\'s Remove record; nothing written',
      [opened, wrapped, dialogOpen(p), focusId(p), activeIds(p)], [['geode-ir-keep', 'dialog', 'geode-ir-title', 'Remove this income record?'], 'Close', false, 'remove:inc_a', ['inc_a']]);
    reset(p);
    recordVia(p, { amount: '3000', timing: 'today' });
    const dup = [focusId(p), p.run('document.getElementById("geode-ir-duplicate").getAttribute("role")'), TS(p, '#geode-ir-duplicate button')];
    click(p, '#geode-ir-duplicate button');
    check('Q.duplicate', 'The duplicate prompt takes focus and is announced (role alert) with two worded buttons; Cancel closes, records nothing and returns focus to Add income',
      [dup, dialogOpen(p), calls(p), focusId(p)], [['geode-ir-duplicate', 'alert', ['Cancel', 'Record another']], false, [], 'add']);
    const e = P();
    openRecord(e);
    fill(e, { amount: '2,50', timing: 'today' });
    submit(e);
    check('Q.error', 'An error is announced (role alert) beside the field, which is marked invalid, described by it and focused',
      dialogOpen(e) ? [e.run('document.querySelectorAll("#geode-ir-amount-error [role=alert]").length'), val(e, 'document.getElementById("geode-ir-amount").getAttribute("aria-invalid")'),
        val(e, 'document.getElementById("geode-ir-amount").getAttribute("aria-describedby")'), focusId(e)] : ['dialog closed: recorded', calls(e)], [1, 'true', 'geode-ir-amount-error', 'geode-ir-amount']);
  });

  return results;
}

function staticChecks(src) {
  const results = [];
  const cm = require('./cross-month-financial-truth.js');
  const check = (id, text, actual, expected) => {
    const ok = J(actual) === J(expected);
    results.push({ group: 'STATIC — the hardening rules in the source', id, text, ok, detail: ok ? '' : 'expected ' + J(expected) + ', observed ' + J(actual) });
  };
  const fn = n => cm.extractFunction(src, n).text;
  const submitFn = fn('geodeIncomeReceiptSubmit');
  const at = s => submitFn.indexOf(s);
  check('static.day-fixed', 'Submit compares today with the day the dialog opened before building, prompting or calling a writer',
    [at('today !== ctx.today') > 0, at('today !== ctx.today') < at('geodeIncomeReceiptInput('), at('today !== ctx.today') < at('geodeRecordIncomeReceipt('),
      fn('geodeIncomeReceiptRecord').indexOf('today: today') > 0, fn('geodeIncomeReceiptCorrect').indexOf('today: today') > 0], [true, true, true, true, true]);
  check('static.same-month', 'Another day is checked against the dialog\'s month (ctx.monthYm) before any input is built', /slice\(0, 7\) !== ctx\.monthYm/.test(fn('geodeIncomeReceiptInput')), true);
  check('static.dup-source', 'The duplicate prompt reads only this month\'s active understood receipts (geodeLivingMonthReceipts(...).receipts)',
    [at('geodeLivingMonthReceipts(S, built.input.ym)') > 0, /geodeIncomeReceiptLikelyDuplicate\(month\.receipts,/.test(submitFn), /incomeReceipts/.test(submitFn)], [true, true, false]);
  check('static.no-month-picker', 'The dialog has no month picker or list: a receipt cannot be pointed at another month',
    /type="month"|<select/.test(fn('geodeIncomeReceiptFormHtml')), false);
  return results;
}

/**
 * §24: Home's Needs attention card and Main Action, run from the production source in a bare context on 12 October
 * 2026 — a scheduled payment whose day has passed with no outcome recorded is "due … no outcome recorded", never
 * overdue; a paid or future payment is not listed; the Main Action title still routes as the due-payments path.
 */
function dueChecks(src) {
  const results = [];
  const vm = require('vm');
  const cm = require('./cross-month-financial-truth.js');
  const check = (id, text, actual, expected) => {
    const ok = J(actual) === J(expected);
    results.push({ group: 'DUE WITH NO OUTCOME — Home never calls a payment overdue from missing evidence (§24)', id, text, ok, detail: ok ? '' : 'expected ' + J(expected) + ', observed ' + J(actual) });
  };
  const RealDate = Date;
  class Oct12 extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(2026, 9, 12, 10, 0); }
    static now() { return new RealDate(2026, 9, 12, 10, 0).getTime(); }
  }
  const ctx = vm.createContext({
    Date: Oct12, Math, String, Number, JSON, Array, Object,
    S: {
      payments: [
        { id: 'p1', name: 'Phone', amount: 40, date: '2026-10-10', status: 'upcoming' },
        { id: 'p2', name: 'Dentist', amount: 90, date: '2026-10-11', status: 'overdue' },
        { id: 'p3', name: 'Rent', amount: 900, date: '2026-10-01', status: 'paid' },
        { id: 'p4', name: 'Gym', amount: 30, date: '2026-10-20', status: 'upcoming' }
      ],
      goals: [], debts: []
    },
    fm: n => '\u00a3' + n, goTab: () => {}, geodeHomeResolvedPlanStepForDedup: () => null, geodeGoalEffectiveSavedFromState: () => 0,
    geodeMainActionVisualRegister: () => 'neutral'
  });
  ['escHtmlLite', 'geodeOverdueItems', 'geodeHomePlanStepDebtGoalIds', 'geodeOverdueCardHtml', 'geodeHomeMainActionAlertDedupContext']
    .forEach(n => vm.runInContext(cm.extractFunction(src, n).text, ctx));
  const html = vm.runInContext('geodeOverdueCardHtml()', ctx);
  const rows = (html.match(/<div data-geode-css="font-size:11px;color:var\(--notice\)">[^<]*<\/div>/g) || []).map(s => s.replace(/<[^>]+>/g, ''));
  const names = (html.match(/font-weight:600">[^<]*</g) || []).map(s => s.slice(17, -1));
  const daysAgo = iso => { const d = new RealDate(iso); d.setHours(0, 0, 0, 0); return Math.round((new RealDate(2026, 9, 12) - d) / 86400000); };
  const due = n => 'Due ' + n + ' day' + (n === 1 ? '' : 's') + ' ago \u00b7 no outcome recorded';
  check('U.card', 'Needs attention lists Phone (scheduled, day passed) and Dentist (marked needs confirmation) as due with no outcome recorded; Rent (paid) and Gym (later) are not listed',
    [names, rows], [['Phone', 'Dentist'], [due(daysAgo('2026-10-10')), due(daysAgo('2026-10-11'))]]);
  check('U.words', 'The card never says overdue, late, missed, unpaid or behind', /overdue|\blate\b|missed|unpaid|behind/i.test(html.replace(/<[^>]+>/g, ' ')), false);
  check('U.main-action', 'The Main Action title "Confirm due payments first" still routes as the due-payments path for alert dedup',
    vm.runInContext('geodeHomeMainActionAlertDedupContext(S, { title: "Confirm due payments first" }).maIsOverduePath', ctx), true);
  const literals = src.match(/'(?:\\.|[^'\\\n])*'/g) || [];
  check('U.titles', 'Every Main Action and primary-focus title for this path says "Confirm due payments first"; no "Clear overdue items first" remains',
    [literals.filter(s => s === "'Confirm due payments first'").length, src.indexOf('Clear overdue items first')], [5, -1]);
  check('U.home-lines', 'No Home line or note says a payment is overdue: the card, the subscription deferral, the pacing sketch and the Plan pacing note',
    ["' overdue</div>'", 'until overdue items are cleared', 'Overdue items stay out of this sketch', 'If something is overdue', 'while overdue items need attention']
      .filter(w => src.indexOf(w) >= 0), []);
  return results;
}

const MUTANTS = {
  'due item called overdue on Home': [[`">Due ' + item.daysLate + ' day' + (item.daysLate===1?'':'s') + ' ago \\u00b7 no outcome recorded</div>';`,
    `">' + item.daysLate + ' day' + (item.daysLate===1?'':'s') + ' overdue</div>';`]],
  'Main Action says clear overdue': [["      out.title = 'Confirm due payments first';", "      out.title = 'Clear overdue items first';"]],
  'renamed title no longer routes': [["    title.indexOf('confirm due payments') >= 0 ||", "    title.indexOf('clear overdue') >= 0 ||"]],
  'another day in any month': [['    if (String(form.date).slice(0, 7) !== ctx.monthYm) {', '    if (false) {']],
  'picker has no lower bound': [[`class="fi" min="' + escHtmlLite(String(cfg.monthYm || '') + '-01') + '" max="`, `class="fi" max="`]],
  'Today follows the clock at submit': [['  if (!today || today !== ctx.today) {', '  if (!today) {']],
  'comma read as a thousands separator anywhere': [[String.raw`  if (!/\d/.test(s) || !/^[+\-]?(\d{1,3}(,\d{3})+|\d+)?(\.\d*)?$/.test(s)) return NaN;`,
    String.raw`  s = s.replace(/,/g, ''); if (!/^[+\-]?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;`]],
  'huge amount recorded': [["  return typeof n === 'number' && n >= 1e12;", '  return false;']],
  'unset plan said to be none': [[String.raw`      : d.income.planSet ? 'No planned income this month.' : 'Planned income hasn\u2019t been set.');`, "      : 'No planned income this month.');"]],
  'explicit £0 said to be unset': [['    planSet: income.explicitlySet === true,', '    planSet: false,']],
  'no submit lock': [["  if (!ctx || (ctx.mode !== 'record' && ctx.mode !== 'correct') || !geodeModalCommitOpen()) return;", "  if (!ctx || (ctx.mode !== 'record' && ctx.mode !== 'correct')) return;"],
    ['  window._geodeReceiptForm = null;\n  window._geodeReceiptReturn = null;\n  setTimeout(function () {', '  window._geodeReceiptReturn = null;\n  setTimeout(function () {\n    window._geodeReceiptForm = null;']],
  'remove not locked': [["  if (!ctx || ctx.mode !== 'remove' || !geodeModalCommitOpen()) return;", "  if (!ctx || ctx.mode !== 'remove') return;"],
    ['  window._geodeReceiptForm = null;\n  window._geodeReceiptReturn = null;\n  setTimeout(function () {', '  window._geodeReceiptReturn = null;\n  setTimeout(function () {\n    window._geodeReceiptForm = null;']],
  'duplicate counts removed receipts': [['    var twin = month ? geodeIncomeReceiptLikelyDuplicate(month.receipts, built.input) : null;',
    '    var twin = geodeIncomeReceiptLikelyDuplicate(geodeIncomeReceiptLedger(S.incomeReceipts).receipts, built.input);']],
  'duplicate counts any entry': [['    var twin = month ? geodeIncomeReceiptLikelyDuplicate(month.receipts, built.input) : null;',
    "    var twin = geodeIncomeReceiptLikelyDuplicate((S.incomeReceipts || []).filter(function (e) { return e.eventType !== 'void' && !(S.incomeReceipts || []).some(function (v) { return v.voidsId === e.id; }); }), built.input);"]],
  'no-op correction writes': [['  if (ctx.mode === \'correct\' && geodeIncomeReceiptUnchanged(ctx.original, built.input)) {', '  if (false) {']],
  'no-op correction says saved': [['  if (ctx.mode === \'correct\' && geodeIncomeReceiptUnchanged(ctx.original, built.input)) {\n    geodeIncomeReceiptClose();',
    '  if (ctx.mode === \'correct\' && geodeIncomeReceiptUnchanged(ctx.original, built.input)) {\n    geodeSuccessToast(\'Correction saved.\');\n    geodeIncomeReceiptClose();']],
  'label rendered as markup': [[`'<div data-geode-css="font-size:12px;font-weight:600;color:var(--tx-1);line-height:1.4">' + escHtmlLite(title) + '</div>' +\n      '<div data-geode-css="font-size:10px;color:var(--tx-3);line-height:1.45">' + escHtmlLite(meta([r.label`,
    `'<div data-geode-css="font-size:12px;font-weight:600;color:var(--tx-1);line-height:1.4">' + title + '</div>' +\n      '<div data-geode-css="font-size:10px;color:var(--tx-3);line-height:1.45">' + escHtmlLite(meta([r.label`]],
  'stale write shown as recorded': [["  geodeIncomeReceiptShowError({ field: 'message', message: geodeIncomeReceiptOutcomeMessage(status) });\n  render();",
    "  if (status === 'refused') { closeModal(); geodeSuccessToast(savedText); }\n  geodeIncomeReceiptShowError({ field: 'message', message: geodeIncomeReceiptOutcomeMessage(status) });\n  render();"]]
};

function main() {
  const results = checksFor(SRC).concat(staticChecks(SRC), dueChecks(SRC));
  Object.keys(MUTANTS).forEach(name => {
    let src = SRC;
    MUTANTS[name].forEach(([from, to]) => {
      if (src.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html: ' + name + ' — ' + from);
      src = src.replace(from, () => to);
    });
    let caught;
    let by = [];
    try {
      const r = checksFor(src).concat(staticChecks(src), dueChecks(src));
      by = r.filter(x => !x.ok).map(x => x.id);
      caught = by.length > 0;
    } catch (e) {
      caught = true;
      by = ['threw: ' + String(e && e.message).slice(0, 60)];
    }
    results.push({ group: 'MUTANTS — each hardening defect is caught', id: 'mutant.' + name.replace(/\s+/g, '-'), text: 'Caught: ' + name + (caught ? ' (by ' + [...new Set(by)].slice(0, 5).join(', ') + ')' : ''),
      ok: caught, detail: caught ? '' : 'every check still passed' });
  });
  let failed = 0;
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(24) + ' ' + r.text + (r.ok ? '' : '\n        ' + r.detail));
  });
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
