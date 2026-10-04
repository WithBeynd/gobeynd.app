#!/usr/bin/env node
/**
 * P3-4E user-facing plan change explanation: what the Month Pulse and its detail say about model.changes (P3-4D), and
 * the retirement of the old confirmed-only "since last update" narratives.
 *
 * The pure matrix runs the production Living Month model and presentation (geodeHomeMonthPulseHtml and every function
 * it reaches) in the Living Month harness: storage, the DOM, save and recurrence are traps, the clock is simulated and
 * the page state S is a decoy that supplies only the currency. Baselines are made by the production constructor from
 * the plan before a change. Checks: the glance cue, the detail's What changed section, wording by baseline kind,
 * omission of unchanged components, offsetting changes, settlements, releases / valuations / gaps, unavailable
 * changes, the empty-plan baseline, Quick Setup overlap, accessibility and wrapping markup, a static guard (the
 * presentation reads model.changes only; the retired narratives stay retired) and source mutants. End-to-end flows run
 * real actions in the cross-month harness and render the resulting model through the production presentation.
 *
 * Run: node tests/month-plan-change-copy.js
 */
'use strict';

const vm = require('vm');
const fs = require('fs');
const path = require('path');
const lm = require('./living-month-read-model.js');
const cm = require('./cross-month-financial-truth.js');

const { INDEX, canon, base, bill, paidMonthly, billEvent, expense, at, NOW } = lm;
const COACHING = fs.readFileSync(path.join(__dirname, '..', 'coaching.json'), 'utf8');
const NAMES = ['income', 'outgoings', 'allocations', 'fromEarlier', 'expensesRegular', 'expensesOneOff'];
const LABELS = { income: 'Planned income', outgoings: 'Scheduled payments', allocations: 'Planned contributions', fromEarlier: 'From earlier months',
  expensesRegular: 'Regular expense plan', expensesOneOff: 'One-off expense plan' };
const GBP = { sym: '\u00a3', code: 'GBP', loc: 'en-GB' };
/** The record's observation time: 8 October, 09:00. */
const OBS = at(2026, 10, 8, 9);
const clone = o => JSON.parse(JSON.stringify(o));
const PRESENTATION = ['geodeMonthChangeView', 'geodeMonthChangeDay'];
/** Claims a plan-change statement must never make. */
const FORBIDDEN = /\b(cash|bank|balance|receiv\w*|receipt|spent|spend|spending|overspent|actual\w*|better|worse|improv\w*|deteriorat\w*|saved|gain\w*|lost|loss|debt|overdraft|shortfall|overdue|unpaid|missed|late|no change|nothing changed)\b/i;

function textOf(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
const cueOf = html => { const m = html.match(/<div data-geode-month-pulse-change="1"[^>]*>([\s\S]*?)<\/div>/); return m ? textOf(m[1]) : ''; };
const detailOf = html => { const m = html.match(/<details data-geode-month-detail="1"[^>]*>([\s\S]*)<\/details>/); return m ? m[1] : null; };
const summaryLabelOf = html => { const m = html.match(/<summary[^>]*>([\s\S]*?)<\/summary>/); return m ? textOf(m[1]) : ''; };
/** The What changed section of the detail: its heading through to the next heading, or null. */
function changeSectionOf(html) {
  const d = detailOf(html);
  if (!d) return null;
  const i = d.indexOf('<span>What changed</span>');
  if (i < 0) return null;
  const start = d.lastIndexOf('<h3', i);
  const next = d.indexOf('<h3', i);
  const tail = d.indexOf('<div data-geode-css="margin-top:12px">', i);
  const end = [next, tail].filter(x => x > 0).sort((a, b) => a - b)[0];
  return d.slice(start, end === undefined ? d.length : end);
}
const changeSummaryOf = sec => { const m = sec && sec.match(/<p[^>]*>([\s\S]*?)<\/p>/); return m ? textOf(m[1]) : ''; };
const changeRowsOf = sec => {
  const m = sec && sec.match(/<ul data-geode-month-detail-list="changes"[^>]*>([\s\S]*?)<\/ul>/);
  return m ? (m[1].match(/<li[\s\S]*?<\/li>/g) || []).map(li => (li.match(/<span[^>]*>([\s\S]*?)<\/span>/g) || []).map(textOf)) : [];
};

// ───────────────────────────── fixtures (clock: 15 Oct 2026) ─────────────────────────────

/**
 * Income £3,000. Rent £1,000, phone £100 and a card payment £200 are scheduled outgoings; the Holiday contribution
 * £100 an allocation; a dentist one-off £100 due 20 September is from earlier; food £500 a month is regular expense
 * plan. Monthly Left £1,000.
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
const GIFT = () => expense('gift', 75, 'no', '2026-10-12');
const dentistPaid = s => { Object.assign(row(s, 'dentist'), { status: 'paid' }); };
const phonePaid = amount => s => {
  put(s, 'phone', paidMonthly('phone', 100, '2026-10-18', { lastPaidAmount: amount }));
  s.billPaymentEvents = [billEvent('phone', amount, '2026-10', at(2026, 10, 14, 9))];
};
const holPaid = amount => s => {
  put(s, 'hol', paidMonthly('hol', 100, '2026-10-25', { goalId: 'g1', lastPaidAmount: amount }));
  s.contributionEvents = [{ id: 'ce_hol', eventType: 'completion', paymentId: 'hol', entityType: 'goal', entityId: 'g1', occurrenceYm: '2026-10',
    amount, recurrence: 'monthly', dueDateSnapshot: '2026-10-25', recordedAt: at(2026, 10, 14, 9), source: 'mark_completed' }];
  s.goals[0].saved = 400 + amount;
};
const cardPaid = amount => s => {
  put(s, 'card', paidMonthly('card', 200, '2026-10-28', { debtId: 'd1', lastPaidAmount: amount }));
  s.debtPaymentEvents = [{ id: 'dpe_card', eventType: 'completion', paymentId: 'card', debtId: 'd1', amount, occurrenceYm: '2026-10', recordedAt: at(2026, 10, 14, 9),
    dueDateSnapshot: '2026-10-28', debtNameSnapshot: 'Card', paymentNameSnapshot: 'card', recurrenceSnapshot: 'monthly', source: 'mark_completed' }];
  s.debts[0].balance = 5000 - amount;
};
const released = s => {
  s.savingsReleases = [{ id: 'rel_oct', sourceType: 'goal', sourceId: 'g1', amount: 300, reason: 'emergency', date: '2026-10-08', ym: '2026-10', relatedYm: '2026-10',
    remainingBalance: 100, createdAt: at(2026, 10, 8, 10), confirmedByUser: true, note: '', balanceMutationMode: 'event_derived' }];
  s.goals[0].saved = 100;
};
const valued = s => {
  s.investments[0].valuations.push({ id: 'val_oct', value: 5400, date: '2026-10-12', recordedAt: at(2026, 10, 12, 9), source: 'manual' });
  s.investments[0].balance = 5400;
};
const gapped = s => {
  s.expectationGaps = [{ id: 'gap_rent_2026-07', domain: 'bill', targetId: 'rent', paymentId: 'rent', recurrence: 'monthly', fromYm: '2026-07', toYm: '2026-09',
    expectedAmount: 1000, dueDay: 20, templateNameSnapshot: 'rent', targetNameSnapshot: '', seenYm: '2026-06', capturedAt: at(2026, 10, 1, 8), capturedBy: 'rev_x', source: 'month_boundary' }];
};

const OPEN = 'since the start of October';
const SEEN = 'since Beynd first recorded this month\u2019s plan on 8 Oct';
const cueText = (amount, dir, kind) => 'Your plan remainder is \u00a3' + amount + ' ' + dir + ' ' + (kind === 'first_observed' ? 'since 8 Oct' : OPEN) + '.';
const movedText = (amount, dir, kind) => 'Your plan remainder is \u00a3' + amount + ' ' + dir + ' ' + (kind === 'first_observed' ? SEEN : OPEN) + '.';
const UNCHANGED = { month_open: 'Your month plan hasn\u2019t changed since the start of October.', first_observed: 'Your month plan hasn\u2019t changed since Beynd first recorded it on 8 Oct.' };
const OFFSET = { month_open: 'Your plan has changed since the start of October, but the overall plan remainder is unchanged.',
  first_observed: 'Your plan has changed since Beynd first recorded it on 8 Oct, but the overall plan remainder is unchanged.' };
const LABEL_PLAIN = 'See what\u2019s happened and what\u2019s ahead';
const LABEL_CHANGED = 'See what\u2019s happened, what\u2019s ahead and what changed';

// ───────────────────────────── source helpers ─────────────────────────────

function fnText(src, name) { return lm.extractFunction(src, name).text; }
const noComments = t => t.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
const noStrings = t => noComments(t).replace(/'(?:\\.|[^'\\\n])*'/g, "''");
/** Names of the functions whose bodies contain `needle` (by the nearest preceding top-level declaration). */
function enclosing(src, needle) {
  const out = [];
  let i = src.indexOf(needle);
  while (i >= 0) {
    const decl = src.lastIndexOf('\nfunction ', i);
    const m = /^\nfunction (\w+)/.exec(src.slice(decl, decl + 120));
    if (m && src.slice(decl + 1, i).indexOf('\nfunction ') < 0) out.push(m[1]);
    i = src.indexOf(needle, i + needle.length);
  }
  return out;
}

// ───────────────────────────── the pure matrix (run per source, so mutants can be judged) ─────────────────────────────

function checksFor(src) {
  const results = [];
  let group = '';
  const section = (name, fn) => {
    group = name;
    try { fn(); } catch (e) { results.push({ group, id: 'section.threw', text: 'the section threw', ok: false, detail: String(e && e.stack || e) }); }
  };
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const program = lm.buildProgram(src, ['geodeMonthBaselineFromModel', 'geodeHomeMonthPulseHtml', 'geodeMonthChangeView', 'geodeDashboardV2SingleInsight',
    'extendLastSnapshotFigures', 'computeSnapshotFigures']);
  const ctx = lm.newContext(program);
  vm.runInContext('__nowMs = ' + NOW + ';', ctx);
  const parse = o => ctx.__parse(JSON.stringify(o));
  const vmDate = ms => vm.runInContext('new Date(' + ms + ')', ctx);
  const trapLog = () => JSON.parse(vm.runInContext('JSON.stringify(__trapLog)', ctx));
  const clearTraps = () => vm.runInContext('__trapLog = [];', ctx);
  const setS = obj => vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify(obj)) + ');', ctx);
  const decoy = () => setS(Object.assign(plan(s => { s.income = 99999; s.expenses[0].amount = 1; }), { cur: GBP }));
  decoy();
  const model = raw => ctx.geodeLivingMonthModel(parse(raw), vmDate(NOW));
  const record = (raw, kind, observedAt) => clone(ctx.geodeMonthBaselineFromModel(model(raw), kind || 'month_open', observedAt == null ? OBS : observedAt));
  const withRecord = (raw, rec) => Object.assign(clone(raw), { monthBaseline: rec });
  const pulse = (raw, opts) => { clearTraps(); return ctx.geodeHomeMonthPulseHtml(parse(raw), vmDate(NOW), opts); };
  const fmx = v => ctx.fmExact(v);

  /** Every applicable assertion for one before → after pair; returns what was shown. */
  function shown(id, text, before, after, kind, expected) {
    const raw = withRecord(after, record(before, kind));
    const state = parse(raw);
    const writes = [];
    clearTraps();
    const html = ctx.geodeHomeMonthPulseHtml(lm.writeTrap(state, writes), vmDate(NOW));
    const traps = trapLog();
    const c = model(raw).changes;
    const sec = changeSectionOf(html);
    const rows = changeRowsOf(sec);
    const said = [cueOf(html), changeSummaryOf(sec), rows];
    check(id, text, said, [expected.cue, expected.summary, expected.rows]);
    check(id + '.model', 'The cue amount is |monthlyLeftDelta| and each row is a component the model marks changed, at |delta|, in model order; unchanged components are omitted',
      [cueOf(html).indexOf(fmx(Math.abs(c.monthlyLeftDelta))) >= 0 || c.direction === 'unchanged',
        rows.map(r => r[0]), rows.map(r => r[1])],
      [true, NAMES.filter(n => c.components[n].changed).map(n => LABELS[n]),
        NAMES.filter(n => c.components[n].changed).map(n => fmx(Math.abs(c.components[n].delta)) + (c.components[n].delta > 0 ? ' higher' : ' lower'))]);
    const said2 = (cueOf(html) + ' ' + (sec ? textOf(sec) : '')).trim();
    check(id + '.words', 'No cash, receipt, spending, actual, judgement, debt, overdue or "no change" wording; no signed amounts; income only as Planned income; no release, valuation or gap',
      [FORBIDDEN.test(said2) ? said2.match(FORBIDDEN)[0] : '', /[-+\u2212]\s*\u00a3|\u00a3\s*[-\u2212]|[\u2191\u2193]/.test(said2),
        /(?<!Planned )\bincome\b/i.test(said2), /releas|valu|gap|expected/i.test(said2)], ['', false, false, false]);
    check(id + '.kind', 'Wording matches baseline.kind: "start of October" only for month_open; first_observed names the day Beynd first recorded the plan',
      [c.baseline.kind, /start of October/.test(said2) ? 'open' : /8 Oct/.test(said2) ? 'seen' : said2 ? 'other' : 'none'],
      [kind || 'month_open', (kind || 'month_open') === 'month_open' ? 'open' : 'seen']);
    const implied = NAMES.reduce((s, n) => s + (n === 'income' ? 1 : -1) * c.components[n].delta, 0);
    check(id + '.reconcile', 'The components shown reconcile to the remainder movement shown (income raises it; the others lower it)', Math.abs(implied - c.monthlyLeftDelta) <= 0.005, true);
    check(id + '.pure', 'Rendering writes nothing to the state and reaches no storage, DOM, save or sync', [writes, traps], [[], []]);
    check(id + '.label', 'The disclosure names what changed only when the plan changed', summaryLabelOf(html), expected.rows.length || expected.cue ? LABEL_CHANGED : LABEL_PLAIN);
    return { html, c, sec };
  }
  const moved = (amount, dir, rows, kind) => ({ cue: cueText(amount, dir, kind), summary: movedText(amount, dir, kind), rows });
  const still = kind => ({ cue: '', summary: UNCHANGED[kind || 'month_open'], rows: [] });

  section('P3-4E STATIC — the presentation reads model.changes only; the old narratives stay retired', () => {
    const code = PRESENTATION.map(n => noStrings(fnText(src, n))).join('\n');
    check('static.declared', 'index.html declares each P3-4E presentation function once', PRESENTATION.map(n => src.split('\nfunction ' + n + '(').length - 1), [1, 1]);
    check('static.changes-only', 'The change view names no baseline record, plan row, income, ledger, gap, snapshot, activity log, state, model, Monthly Left function, storage, DOM or clock',
      ['monthBaseline', 'payments', 'expenses', '.income', 'Events', 'expectationGaps', 'lastSnapshot', 'activityLog', 'calcMonthly', 'toNum', 'model', 'state',
        'localStorage', 'sessionStorage', 'document', 'window', 'Date.now', 'new Date()'].filter(w => code.indexOf(w) >= 0)
        .concat(/(?<![\w$.])S\b/.test(code) ? ['S'] : []), []);
    check('static.no-recompute', 'No second delta: the view reads delta and monthlyLeftDelta, never current, and subtracts nothing',
      [/\.current\b/.test(code), /[\w\]\)]\s+-\s+[\w(]/.test(code), code.indexOf('Math.abs(c.delta)') >= 0, code.indexOf('Math.abs(changes.monthlyLeftDelta)') >= 0], [false, false, true, true]);
    check('static.wired', 'The detail view takes the change view of model.changes; the Pulse and detail read it from the view (no other model field explains change)',
      [fnText(src, 'geodeMonthDetailView').indexOf('changes: geodeMonthChangeView(model.changes)') >= 0, fnText(src, 'geodeMonthPulseHtml').indexOf('view.detail && view.detail.changes') >= 0,
        noStrings(fnText(src, 'geodeMonthDetailHtml')).split('d.changes').length - 1 >= 3, ['geodeMonthPulseHtml', 'geodeMonthDetailHtml', 'geodeMonthPulseView', 'geodeMonthDetailView'].filter(n => /monthBaseline|\.changes\.components|monthlyLeftDelta/.test(fnText(src, n)))],
      [true, true, true, []]);
    const rHome = fnText(src, 'rHome');
    const prompt = rHome.slice(rHome.indexOf("if (sessionStorage.getItem('geode_post_qs_reality_prompt') === '1') {"), rHome.indexOf('} catch (_ePostQsPrompt) {}'));
    const qsDone = noComments(fnText(src, 'geodeQsDone'));
    check('static.qs-overlap', 'Quick Setup overlap: the live finish (geodeQsDone) raises only the figure-free "Your first plan is ready" prompt; the "Spending exceeds income −£X" card\'s flag is set only by geodeQuickSetupFinish, which nothing calls',
      [qsDone.indexOf("sessionStorage.setItem('geode_post_qs_reality_prompt', '1');") >= 0, /geode_qs_just_finished/.test(qsDone), prompt.length > 0 && !/fm\(|fmExact\(|\\u00a3/.test(prompt),
        src.split('geodeQuickSetupFinish').length - 1], [true, false, true, 1]);
    check('retired.functions', 'The dead "since last update" Dashboard functions and the Stage J comparison toast are gone',
      ['getSinceLastUpdateSummary', 'getDashboardProgressSummary', 'geodeDashboardV2NetWorthTrendLine', 'geodeDashboardV2SinceLastUpdateBlock', 'geodeStageJToastAfterSave']
        .filter(n => src.indexOf(n) >= 0), []);
    check('retired.confirmed-only', 'calcMonthlyLeftoverConfirmedOnly feeds no user-facing narrative: only the affordability engine and the snapshot record call it, and no snapshot remainder is compared',
      [enclosing(src, 'calcMonthlyLeftoverConfirmedOnly(').filter(n => n !== 'calcMonthlyLeftoverConfirmedOnly').sort(), /(ls|base|prev)\.leftThisMonth/.test(src)],
      [['computeAffordabilityContext', 'extendLastSnapshotFigures'], false]);
    check('retired.copy', 'No spending / less-left / "plan has adjusted" comparison copy remains in index.html or coaching.json',
      ['Spending increased', "' less left this month", "' more left this month", "' spent'", 'Spending change', 'plan has adjusted', 'plan numbers shifted', 'Spending nudged', 'Spending eased',
        'Spending shifted', 'Spending moved', 'spending change', 'below your plan'].filter(w => src.indexOf(w) >= 0 || COACHING.indexOf(w) >= 0), []);
    check('retired.alerts', 'Post-save alerts read the plan figure the Pulse shows, in the Pulse\'s words', [fnText(src, 'checkAlerts').indexOf('var left = calcMonthlyLeftover(S);') >= 0,
      fnText(src, 'checkAlerts').indexOf("'Your current plan is ' + fm(Math.abs(left)) + ' over.'") >= 0], [true, true]);
    check('retired.insight', 'The Dashboard progress line speaks of debt and net worth only', [/Spending|LeftoverConfirmedOnly|leftThisMonth/.test(fnText(src, 'geodeDashboardV2SingleInsight'))], [false]);
  });

  section('P3-4E A–S — the matrix: cue, detail sentence and changed components', () => {
    shown('A', 'A. month_open, no change: no glance cue; the detail says calmly that the plan hasn\'t changed since the start of October', plan(), plan(), 'month_open', still('month_open'));
    shown('B', 'B. first_observed, no change: the same, since Beynd first recorded the plan on 8 Oct — never "start of October"', plan(), plan(), 'first_observed', still('first_observed'));
    shown('C', 'C. Remainder higher (rent £1,000 → £950): £50 higher; scheduled payments £50 lower', plan(), plan(s => { row(s, 'rent').amount = 950; }), 'month_open',
      moved(50, 'higher', [['Scheduled payments', '\u00a350 lower']]));
    shown('C.seen', 'C (first_observed). The same change against a first_observed record: "since 8 Oct" in the glance; the detail names the day Beynd first recorded the plan',
      plan(), plan(s => { row(s, 'rent').amount = 950; }), 'first_observed', moved(50, 'higher', [['Scheduled payments', '\u00a350 lower']], 'first_observed'));
    shown('D', 'D. Remainder lower (rent £1,000 → £1,050): £50 lower; scheduled payments £50 higher', plan(), plan(s => { row(s, 'rent').amount = 1050; }), 'month_open',
      moved(50, 'lower', [['Scheduled payments', '\u00a350 higher']]));
    shown('E', 'E. Planned income £3,000 → £3,200', plan(), plan(s => { s.income = 3200; }), 'month_open', moved(200, 'higher', [['Planned income', '\u00a3200 higher']]));
    shown('F', 'F. Planned income £3,000 → £2,800', plan(), plan(s => { s.income = 2800; }), 'month_open', moved(200, 'lower', [['Planned income', '\u00a3200 lower']]));
    shown('G', 'G. Phone £100 → £130: scheduled payments £30 higher, remainder £30 lower', plan(), plan(s => { row(s, 'phone').amount = 130; }), 'month_open',
      moved(30, 'lower', [['Scheduled payments', '\u00a330 higher']]));
    shown('H', 'H. Phone removed: scheduled payments £100 lower, remainder £100 higher', plan(), plan(s => { drop(s, 'phone'); }), 'month_open',
      moved(100, 'higher', [['Scheduled payments', '\u00a3100 lower']]));
    shown('I', 'I. Holiday contribution £100 → £200: planned contributions £100 higher — never spending', plan(), plan(s => { row(s, 'hol').amount = 200; }), 'month_open',
      moved(100, 'lower', [['Planned contributions', '\u00a3100 higher']]));
    shown('J', 'J. Holiday contribution removed: planned contributions £100 lower', plan(), plan(s => { drop(s, 'hol'); }), 'month_open',
      moved(100, 'higher', [['Planned contributions', '\u00a3100 lower']]));
    shown('K', 'K. From earlier higher (the September dentist\'s completion undone): from earlier months £100 higher — no arrears or missed-payment inference',
      plan(dentistPaid), plan(), 'month_open', moved(100, 'lower', [['From earlier months', '\u00a3100 higher']]));
    shown('L', 'L. From earlier lower (the September dentist completed): from earlier months £100 lower — no "cleared" or "paid off" inference',
      plan(), plan(dentistPaid), 'month_open', moved(100, 'higher', [['From earlier months', '\u00a3100 lower']]));
    shown('M', 'M. Food £500 → £580: regular expense plan £80 higher', plan(), plan(s => { s.expenses[0].amount = 580; }), 'month_open',
      moved(80, 'lower', [['Regular expense plan', '\u00a380 higher']]));
    shown('N', 'N. Food £500 → £420: regular expense plan £80 lower', plan(), plan(s => { s.expenses[0].amount = 420; }), 'month_open',
      moved(80, 'higher', [['Regular expense plan', '\u00a380 lower']]));
    shown('O', 'O. A £75 one-off added: one-off expense plan £75 higher', plan(), plan(s => { s.expenses.push(GIFT()); }), 'month_open',
      moved(75, 'lower', [['One-off expense plan', '\u00a375 higher']]));
    shown('P', 'P. The £75 one-off removed: one-off expense plan £75 lower', plan(s => { s.expenses.push(GIFT()); }), plan(), 'month_open',
      moved(75, 'higher', [['One-off expense plan', '\u00a375 lower']]));
    shown('Q', 'Q. Several, net higher (income +£300, food +£80): £220 higher; both rows, in model order', plan(), plan(s => { s.income = 3300; s.expenses[0].amount = 580; }), 'month_open',
      moved(220, 'higher', [['Planned income', '\u00a3300 higher'], ['Regular expense plan', '\u00a380 higher']]));
    shown('R', 'R. Several, net lower (income +£50, Holiday +£100, a £75 one-off): £125 lower', plan(), plan(s => { s.income = 3050; row(s, 'hol').amount = 200; s.expenses.push(GIFT()); }), 'month_open',
      moved(125, 'lower', [['Planned income', '\u00a350 higher'], ['Planned contributions', '\u00a3100 higher'], ['One-off expense plan', '\u00a375 higher']]));
    const s = shown('S', 'S. Offsetting (income +£100, rent +£100): no glance cue; the detail says the plan changed but the remainder is unchanged, and lists both — never "no change"',
      plan(), plan(s2 => { s2.income = 3100; row(s2, 'rent').amount = 1100; }), 'month_open',
      { cue: '', summary: OFFSET.month_open, rows: [['Planned income', '\u00a3100 higher'], ['Scheduled payments', '\u00a3100 higher']] });
    check('S.contract', 'S relies on the P3-4D contract: changed true with direction unchanged', [s.c.changed, s.c.direction, s.c.monthlyLeftDelta], [true, 'unchanged', 0]);
    shown('S.seen', 'S (first_observed). Offsetting against a first_observed record', plan(), plan(s2 => { s2.income = 3100; row(s2, 'rent').amount = 1100; }), 'first_observed',
      { cue: '', summary: OFFSET.first_observed, rows: [['Planned income', '\u00a3100 higher'], ['Scheduled payments', '\u00a3100 higher']] });
  });

  section('P3-4E T–AC — settlements, contributions, debts, releases, valuations, gaps, irregular income, a negative plan', () => {
    const t = shown('T', 'T. Phone planned £100, completed for £100: Happened shows it; no plan-change message', plan(), plan(phonePaid(100)), 'month_open', still());
    check('T.happened', 'T. The completion is in Happened', /<span>Happened<\/span>/.test(detailOf(t.html)) && /phone/.test(textOf(detailOf(t.html))), true);
    const u = shown('U', 'U. Phone planned £100, completed for £120: scheduled payments £20 higher — never £120', plan(), plan(phonePaid(120)), 'month_open',
      moved(20, 'lower', [['Scheduled payments', '\u00a320 higher']]));
    check('U.not-120', 'U. The change explanation never mentions the £120 completion amount', textOf(u.sec).indexOf('\u00a3120') < 0 && cueOf(u.html).indexOf('\u00a3120') < 0, true);
    shown('V', 'V. Contribution planned £100, completed £100: no plan-change message', plan(), plan(holPaid(100)), 'month_open', still());
    shown('W', 'W. Contribution £100 → £130 completed: planned contributions £30 higher', plan(), plan(holPaid(130)), 'month_open',
      moved(30, 'lower', [['Planned contributions', '\u00a330 higher']]));
    shown('X', 'X. Card payment planned £200, completed £200: no plan-change message, nothing about the debt', plan(), plan(cardPaid(200)), 'month_open', still());
    const y = shown('Y', 'Y. A £300 release only: no plan-change message; the release stays in Happened', plan(), plan(released), 'month_open', still());
    check('Y.happened', 'Y. The release is listed in Happened, outside What changed', [/released from Holiday/.test(textOf(detailOf(y.html))), /releas/i.test(textOf(y.sec))], [true, false]);
    const z = shown('Z', 'Z. A valuation only: no plan-change message; the valuation stays in Happened', plan(), plan(valued), 'month_open', still());
    check('Z.happened', 'Z. The valuation is listed in Happened, outside What changed', [/value recorded/.test(textOf(detailOf(z.html))), /valu/i.test(textOf(z.sec))], [true, false]);
    const aa = shown('AA', 'AA. An expectation gap only: no plan-change message; the earlier-months note stays separate', plan(), plan(gapped), 'month_open', still());
    check('AA.note', 'AA. The earlier-months note is outside What changed', [/Earlier months have/.test(textOf(detailOf(aa.html))), /Earlier months have/.test(textOf(aa.sec))], [true, false]);
    const irregular = edit => plan(s => { s.incomeType = 'irregular'; if (edit) edit(s); });
    const ab = shown('AB', 'AB. Irregular income £3,000 → £3,200: "Planned income · £200 higher" — never "Income £200 higher"', irregular(), irregular(s => { s.income = 3200; }), 'month_open',
      moved(200, 'higher', [['Planned income', '\u00a3200 higher']]));
    check('AB.note', 'AB. The Pulse keeps its irregular-income line', /Planned income can vary/.test(ab.html), true);
    const ac = shown('AC', 'AC. Negative current plan (rent £1,000 → £3,000): the Pulse states the plan is £1,000 over; the cue says only £2,000 lower — no debt, overdraft or shortfall',
      plan(), plan(s => { row(s, 'rent').amount = 3000; }), 'month_open', moved('2,000', 'lower', [['Scheduled payments', '\u00a32,000 higher']]));
    check('AC.one-alarm', 'AC. One "over" statement in the glance (the existing P3-2 line), not repeated by the cue', [(textOf(ac.html.split('<details')[0]).match(/\bover\b/g) || []).length, /over/.test(cueOf(ac.html))], [1, false]);
  });

  section('P3-4E AD–AH — unavailable changes, the empty-plan baseline and Quick Setup overlap', () => {
    const none = (id, text, raw, reason) => {
      const html = pulse(raw);
      const c = model(raw).changes;
      check(id, text, [c.available, c.reason, cueOf(html), changeSectionOf(html), summaryLabelOf(html), /\u00a30 (higher|lower)|no change|hasn/i.test(textOf(html)), ctx.geodeMonthChangeView(parse(c))],
        [false, reason, '', null, LABEL_PLAIN, false, null]);
    };
    none('AD', 'AD. No baseline: nothing said about change — no £0, no "no change", no error or repair request', plan(), 'no_month_baseline');
    const bad = Object.assign(record(plan()), { income: '3000' });
    none('AE', 'AE. Malformed baseline: nothing said', withRecord(plan(), bad), 'invalid_month_baseline');
    const older = Object.assign(record(plan()), { ym: '2026-09', observedAt: at(2026, 9, 8, 9) });
    none('AF', 'AF. A September record in October: nothing said', withRecord(plan(), older), 'baseline_month_mismatch');
    const future = Object.assign(record(plan()), { ym: '2026-11', observedAt: at(2026, 11, 8, 9) });
    none('AF.future', 'AF. A November record (clock moved back): nothing said', withRecord(plan(), future), 'baseline_month_mismatch');
    const readyModel = model(withRecord(plan(s => { row(s, 'rent').amount = 1050; }), record(plan())));
    check('AG', 'AG. Boundary pending (or any non-ready status): no Pulse, no detail, no cue — even with changes that would otherwise be shown',
      ['boundary_pending', 'schema_not_current', 'clock_month_mismatch'].map(st => [ctx.geodeMonthPulseView(Object.assign({}, readyModel, { status: st })), ctx.geodeMonthDetailView(Object.assign({}, readyModel, { status: st }))]),
      Array(3).fill([null, null]));
    check('AG.reasons', 'Every unavailable reason gives no change view', ['no_month_baseline', 'invalid_month_baseline', 'baseline_month_mismatch', 'changes_not_reconciled', 'plan_not_ready', 'boundary_pending']
      .map(r => ctx.geodeMonthChangeView(parse({ available: false, reason: r }))), Array(6).fill(null));
    const empty = base({ income: 0 });
    const emptyRec = record(empty, 'first_observed');
    const after = plan();
    const html = pulse(withRecord(after, emptyRec));
    const c = model(withRecord(after, emptyRec)).changes;
    check('AH.empty-baseline', 'AH. A baseline recording no plan (every component £0, as before a first Quick Setup): the model has changes, but there is nothing to compare with, so nothing is said',
      [NAMES.map(n => emptyRec[n]), c.available, c.changed, cueOf(html), changeSectionOf(html), ctx.geodeMonthChangeView(parse(c))], [[0, 0, 0, 0, 0, 0], true, true, '', null, null]);
  });

  section('P3-4E CONTRACT — model values only, pence, accessibility and wrapping', () => {
    const synth = (delta, extra) => Object.assign({
      available: true, basis: 'plan', baseline: { kind: 'month_open', ym: '2026-10', observedAt: at(2026, 10, 1, 0) }, monthlyLeftDelta: delta, direction: delta > 0 ? 'higher' : delta < 0 ? 'lower' : 'unchanged',
      changed: true,
      components: { income: { baseline: 10, current: 999, delta: 12.34, changed: true }, outgoings: { baseline: 1, current: 1, delta: 0, changed: false },
        allocations: { baseline: 0, current: 0, delta: 0, changed: false }, fromEarlier: { baseline: 0, current: 0, delta: 0, changed: false },
        expensesRegular: { baseline: 5, current: 50, delta: 0.4, changed: true }, expensesOneOff: { baseline: 0, current: 0, delta: 0, changed: false } }
    }, extra || {});
    const v = ctx.geodeMonthChangeView(parse(synth(-7.5)));
    check('contract.model-values', 'A synthetic change whose deltas match neither current − baseline nor each other: the view shows exactly the model\'s deltas and monthlyLeftDelta (no UI recomputation), pence kept',
      [v.cue, v.rows.map(r => [r.label, r.text])], ['Your plan remainder is \u00a37.50 lower since the start of October.', [['Planned income', '\u00a312.34 higher'], ['Regular expense plan', '\u00a30.40 higher']]]);
    check('contract.bad-input', 'A component missing or non-numeric, an unknown kind or month, or no observation day: no view rather than a guess',
      [ctx.geodeMonthChangeView(parse(Object.assign(synth(5), { components: { income: synth(5).components.income } }))),
        ctx.geodeMonthChangeView(parse(synth(5, { baseline: { kind: 'opening', ym: '2026-10', observedAt: 1 } }))),
        ctx.geodeMonthChangeView(parse(synth(5, { baseline: { kind: 'month_open', ym: '2026-13', observedAt: 1 } }))),
        ctx.geodeMonthChangeView(parse(synth(5, { baseline: { kind: 'first_observed', ym: '2026-10', observedAt: null } }))),
        ctx.geodeMonthChangeView(parse(synth(5, { monthlyLeftDelta: '5' }))), ctx.geodeMonthChangeView(null)], [null, null, null, null, null, null]);
    const raw = withRecord(plan(s => { s.income = 3300; s.expenses[0].amount = 580; }), record(plan(), 'first_observed'));
    const html = pulse(raw);
    const sec = changeSectionOf(html);
    check('acc.structure', 'What changed is an h3 heading inside the native disclosure, its sentence a paragraph and its components a list — label and amount in one list item',
      [/<h3 data-geode-month-detail-heading="1"[^>]*><span>What changed<\/span><\/h3>/.test(sec), (sec.match(/<ul data-geode-month-detail-list="changes"/g) || []).length, (sec.match(/<li /g) || []).length,
        changeRowsOf(sec).every(r => r.length === 2)], [true, 1, 2, true]);
    check('acc.words', 'Direction is in words (higher / lower / unchanged), never colour, arrows or signs alone; the cue is said once (the detail sentence is the long form, not a repeat)',
      [changeRowsOf(sec).every(r => / (higher|lower)$/.test(r[1])), /[\u2191\u2193\u25b2\u25bc]|var\(--(ok|danger|good|bad)\)/.test(sec + cueOf(html)), cueOf(html) === changeSummaryOf(sec)], [true, false, false]);
    check('layout.wrap', 'The long first_observed cue and labels wrap (overflow-wrap:anywhere, min-width:0); amounts stay whole (nowrap) beside them; no fixed widths',
      [/data-geode-month-pulse-change="1" data-geode-css="[^"]*overflow-wrap:anywhere/.test(html), /<span data-geode-css="min-width:0;overflow-wrap:anywhere[^"]*">Planned income/.test(sec),
        /white-space:nowrap[^"]*">\u00a3300 higher/.test(sec), /(?:^|;)\s*(min-)?width:\s*\d+px/.test((sec + html.match(/data-geode-month-pulse-change="1"[^>]*>/)[0]).replace(/min-width:0/g, ''))], [true, true, true, false]);
    check('layout.order', 'Detail order: Happened → Still ahead → What changed', (detailOf(html).match(/<span>(Happened|Still ahead|What changed)<\/span>/g) || []).map(textOf),
      ['Happened', 'Still ahead', 'What changed']);
    const quietMonth = base({ income: 3000 });
    const qRaw = withRecord(base({ income: 3200 }), record(quietMonth));
    const q = pulse(qRaw);
    check('layout.change-only', 'A month with nothing beneath the glance but a plan change: the detail opens to What changed alone; with no change it stays absent',
      [summaryLabelOf(q), ((detailOf(q) || '').match(/<h3/g) || []).length, changeRowsOf(changeSectionOf(q)), detailOf(pulse(withRecord(quietMonth, record(quietMonth))))],
      [LABEL_CHANGED, 1, [['Planned income', '\u00a3200 higher']], null]);
  });

  section('P3-4E AI (pure) — the retired confirmed-only Dashboard line cannot contradict a settlement', () => {
    const before = Object.assign(plan(), { cur: GBP });
    setS(before);
    const snap = clone(ctx.extendLastSnapshotFigures(ctx.computeSnapshotFigures()));
    setS(Object.assign(plan(phonePaid(100)), { cur: GBP, lastSnapshot: snap }));
    const line = ctx.geodeDashboardV2SingleInsight();
    decoy();
    check('AI.dashboard', 'AI. After a £100 phone completion (no plan change), the Dashboard progress line makes no spending or less-left claim (the old confirmed-only line said "Spending increased")',
      [/spend|less left|more left/i.test(line), snap.leftThisMonth > 0], [false, true]);
  });
  return results;
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'cue from a component': [["'Your plan remainder is ' + fmExact(Math.abs(changes.monthlyLeftDelta))", "'Your plan remainder is ' + fmExact(Math.abs(changes.components.income.delta))"]],
  'first_observed called the month start': [["  var opened = changes.baseline.kind === 'month_open';", '  var opened = true;']],
  'unchanged components listed': [['    if (c.changed) rows.push(', '    if (true) rows.push(']],
  'offset called unchanged plan': [["      : changes.changed === true\n        ? 'Your plan has changed '", "      : false\n        ? 'Your plan has changed '"]],
  'signed amounts': [['text: fmExact(Math.abs(c.delta))', 'text: fmExact(c.delta)']],
  'unavailable shown as zero': [['  if (!changes || changes.available !== true || !changes.baseline || !changes.components) return null;',
    "  if (!changes) return null; if (changes.available !== true) return { changed: false, cue: 'Your plan remainder is \\u00a30 higher since the start of October.', summary: 'No change to your month plan.', rows: [] };"]],
  'empty baseline compared': [['  if (!planned || typeof changes.monthlyLeftDelta', '  if (typeof changes.monthlyLeftDelta']],
  'income label loses plan': [["['income', 'Planned income']", "['income', 'Income']"]],
  'expenses called spending': [["['expensesRegular', 'Regular expense plan']", "['expensesRegular', 'Regular spending']"]],
  'change-only month hidden': [['|| d.earlierGapCount || changed)) return', '|| d.earlierGapCount)) return']],
  'change view reads the record': [['    changes: geodeMonthChangeView(model.changes)', '    changes: geodeMonthChangeView(model.changes) || (model.monthBaseline ? null : null)']],
  'live setup raises the figure card': [["    sessionStorage.setItem('geode_post_qs_reality_prompt', '1');\n  } catch (_eQsPromptSs) {}", "    sessionStorage.setItem('geode_post_qs_reality_prompt', '1'); sessionStorage.setItem('geode_qs_just_finished', '1');\n  } catch (_eQsPromptSs) {}"]],
  'alerts back on confirmed-only': [['  syncRecurringPayments();\n  var left = calcMonthlyLeftover(S);\n  var inc = toNum(S.income);', '  syncRecurringPayments();\n  var left = calcMonthlyLeftoverConfirmedOnly(S);\n  var inc = toNum(S.income);']],
  'spending line restored': [["  if (dd < -eps) return 'You reduced your debt since your last update.';",
    "  if (dd < -eps) return 'You reduced your debt since your last update.';\n  if (calcMonthlyLeftoverConfirmedOnly(S) < ls.leftThisMonth - eps) return 'Spending increased. Worth a quick look at your plan.';"]],
  'since-visit causal claim restored': [["'You made updates since your last visit.'", "'You made updates recently. Your plan has adjusted.'"]]
};

// ───────────────────────────── end to end (cross-month harness + production presentation) ─────────────────────────────

function endToEnd() {
  const results = [];
  const group = 'P3-4E END TO END — real actions, the real model, the production presentation';
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const program = lm.buildProgram(INDEX, ['geodeMonthPulseHtml', 'geodeMonthPulseView']);
  const ctx = lm.newContext(program);
  vm.runInContext('S = __parse(' + JSON.stringify(JSON.stringify({ cur: GBP })) + ');', ctx);
  const NEW = cm.init().commit;
  const call = (page, expr) => JSON.parse(page.run('JSON.stringify(' + expr + ')'));
  const shownBy = (page, opts) => ctx.geodeMonthPulseHtml(ctx.geodeMonthPulseView(ctx.__parse(JSON.stringify(call(page, 'geodeLivingMonthModel(S, Date.now())')))), opts);
  const inject = (page, names) => names.forEach(n => page.run(cm.extractFunction(INDEX, n).text.replace(/^function (\w+)/, n + ' = function')));
  const alerts = page => { page.run('__toasts = []; geodeShouldSuppressPostSaveAlerts = function () { return false; }; checkAlerts();'); return JSON.parse(page.run('JSON.stringify(__toasts)')); };
  const formIncome = (page, v) => page.run('__fields = { mi: ' + JSON.stringify(String(v)) + ' }; __toasts = []; openModal(""); __runTimers(); saveInc(); __runTimers();');
  const PLAN = ym => ({
    _schemaVersion: 3, income: 3000, incomeExplicitlySet: true, expectationGaps: [], expectationFloorYm: ym,
    payments: [
      { id: 'rent', name: 'Rent', amount: 1000, rec: 'yes', status: 'upcoming', date: ym + '-15' },
      { id: 'hol', name: 'Holiday monthly', amount: 100, rec: 'yes', status: 'upcoming', date: ym + '-05', goalId: 'gH' }
    ],
    expenses: [{ id: 'food', name: 'Food', amount: 400, rec: 'yes', cat: 'food', date: ym + '-01' }],
    goals: [{ id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' }],
    investments: [], debts: [], savingsReleases: [], debtPaymentEvents: [], activityLog: [], lastSuggestedActions: []
  });

  const page = new cm.App(PLAN('2026-09'), '2026-09-20', NEW);
  page.advance('2026-10-08', 'reload');
  inject(page, ['checkAlerts', 'geodeHasPositiveIncome']);
  const opened = shownBy(page);
  const alertsBefore = alerts(page);
  page.toggle('rent');
  const settled = shownBy(page);
  check('E2E.settle', 'Opened in October (month_open record), then Rent completed for its planned £1,000: no cue, What changed says the plan hasn\'t changed, and the post-save alerts are exactly as before the completion',
    [cueOf(opened), cueOf(settled), changeSummaryOf(changeSectionOf(settled)), changeRowsOf(changeSectionOf(settled)), alerts(page)],
    ['', '', UNCHANGED.month_open, [], alertsBefore]);
  check('E2E.toast', 'A completion toast is its own confirmation: no "Left this month ↑/↓" or "plan numbers shifted" comparison',
    [page.run('geodeStageLToastAfterSave("Marked complete.", "payment", { debtId: "d1" })'), page.run('geodeStageLToastAfterSave("Saved.", "", {})')], ['Marked complete.', 'Saved.']);
  formIncome(page, 3200);
  const raised = shownBy(page);
  check('E2E.income', 'Planned income £3,000 → £3,200 through the income form: "Your plan remainder is £200 higher since the start of October."; Planned income · £200 higher',
    [cueOf(raised), changeRowsOf(changeSectionOf(raised))], [cueText(200, 'higher'), [['Planned income', '\u00a3200 higher']]]);
  formIncome(page, 1200);
  const over = shownBy(page);
  const left = call(page, 'calcMonthlyLeftover(S)');
  check('AI.alerts', 'AI. With the plan over, the post-save alert states the same plan figure as the Pulse, in its words — not a confirmed-only "left this month" figure',
    [alerts(page), textOf(over).indexOf('Your current plan is \u00a3' + (-left).toLocaleString('en-GB') + ' over') >= 0, left < 0],
    [['Your current plan is \u00a3' + (-left).toLocaleString('en-GB') + ' over.'], true, true]);

  const spyFlag = app => app.run("var __qsFlag = []; (function () { var set = sessionStorage.setItem;" +
    " sessionStorage.setItem = function (k, v) { if (/^geode_(qs|post_qs)/.test(k)) __qsFlag.push(k); return set.call(sessionStorage, k, v); }; })();");
  const fresh = new cm.App({ _schemaVersion: 3, income: 0, payments: [], expenses: [], goals: [], investments: [], debts: [], activityLog: [] }, '2026-10-08', NEW);
  spyFlag(fresh);
  fresh.quickSetup({ income: '2500', incomeType: 'regular', hasDependants: false, expenses: { housing: '1900', food: '600', transport: '150', bills: '120' }, debt: { total: '', min: '' } });
  const qs = shownBy(fresh);
  const qsChanges = call(fresh, 'geodeLivingMonthModel(S, Date.now()).changes');
  check('AH.quick-setup', 'AH. A first Quick Setup leaving the plan £270 over: the baseline is the empty plan before setup, so no cue and no What changed — the Pulse states the plan once and the setup card speaks for itself',
    [qsChanges.available, qsChanges.baseline.kind, qsChanges.monthlyLeftDelta, cueOf(qs), changeSectionOf(qs), (textOf(qs).match(/\bover\b/g) || []).length],
    [true, 'first_observed', -270, '', null, 1]);
  check('AH.flag', 'AH. The live Quick Setup raises only the figure-free "Your first plan is ready" prompt, never the "Spending exceeds income −£X" card',
    JSON.parse(fresh.run('JSON.stringify(__qsFlag)')), ['geode_post_qs_reality_prompt']);
  const rerun = new cm.App(PLAN('2026-09'), '2026-09-20', NEW);
  rerun.advance('2026-10-08', 'reload');
  rerun.quickSetup({ income: '1500', incomeType: 'regular', hasDependants: false, expenses: { housing: '900', food: '300', transport: '', bills: '' }, debt: { total: '', min: '' } });
  const again = shownBy(rerun);
  check('AH.rerun', 'AH. Re-running Quick Setup mid-month over a month_open record: one cue states the plan movement since the start of October; the remainder line and the prompt carry the only other statements (no figure repeated)',
    [/^Your plan remainder is \u00a3[\d,]+ (higher|lower) since the start of October\.$/.test(cueOf(again)), (textOf(again.split('<details')[0]).match(/since/g) || []).length,
      changeRowsOf(changeSectionOf(again))], [true, 1, [['Planned income', '\u00a31,500 lower'], ['Regular expense plan', '\u00a31,200 higher']]]);
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
    results.push({ group: 'P3-4E MUTANTS — each defect is caught by the checks above', id: 'mutant.' + name.replace(/\s+/g, '-'),
      text: 'Caught: ' + name + (by.length ? ' (by ' + by.slice(0, 6).join(', ') + (by.length > 6 ? ', …' : '') + ')' : ''), ok: by.length > 0, detail: by.length ? '' : 'every check still passed' });
  });

  console.log('Beynd month plan change explanation (P3-4E)');
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
