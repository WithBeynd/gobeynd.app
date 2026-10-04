#!/usr/bin/env node
/**
 * P3-4C month baseline: S.monthBaseline, the one record of the plan Beynd first recorded for the current month.
 *
 * Runs the production capture (geodeMonthBaseline* in index.html) inside the cross-month harness's simulated app, and
 * the deployed v1.0.78 runtime (eee9015: its own load, save, persist, store and rollback, with every production function
 * they reach) on stored records. Checks: the persisted shape and validator, the pure constructor, the three capture
 * points, month_open / first_observed, immutability, malformed / older / future records, failed writes, stale tabs,
 * old-runtime compatibility (schema 3 stays), export, the restore contract, and that no financial figure reads it.
 *
 * Run: node tests/month-baseline.js
 */
'use strict';

const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const cm = require('./cross-month-financial-truth.js');

const ROOT = path.resolve(__dirname, '..');
const OLD_REF = 'eee9015';
const OLD_RUNTIME = 'v1.0.78';

const results = [];
let group = '';
const norm = v => (Array.isArray(v) ? v.map(norm) : v && typeof v === 'object'
  ? Object.keys(v).sort().reduce((o, k) => { o[k] = norm(v[k]); return o; }, {}) : typeof v === 'number' ? Math.round(v * 100) / 100 : v);
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
function check(id, text, actual, expected) {
  const ok = same(actual, expected);
  results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + JSON.stringify(expected) + ', observed ' + JSON.stringify(actual) });
}
function scenario(name, fn) {
  group = name;
  try { fn(); } catch (e) { results.push({ group, id: 'error', text: 'scenario threw', ok: false, detail: String(e && e.stack || e) }); }
}

// ───────────────────────────── programs ─────────────────────────────

const PROGRAM = cm.init();
const NEW = PROGRAM.commit;

const git = file => execFileSync('git', ['show', OLD_REF + ':' + file], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).replace(/\r\n/g, '\n');
const cutFunction = (text, head) => {
  const a = text.indexOf(head);
  if (a < 0) throw new Error('no ' + head);
  return text.slice(0, a) + text.slice(text.indexOf('\n}\n', a) + 3);
};

/** Page chrome the deployed load() and save() reach that the scenarios do not observe. */
const OLD_SHIMS = String.raw`
function applyAppearance() {}
`;

/**
 * The deployed runtime: the harness environment without its save() and reload mirrors, eee9015's foundation, its
 * load / save / persist / recurring sync with every production function they reach (extracted transitively from its
 * index.html), its constants and its initial S.
 */
function buildOldProgram() {
  const src = git('index.html'), foundation = git('js/geode-pure/01-foundation.js');
  const env = cutFunction(cutFunction(cm.TEST_SHIMS, 'function save() {'), 'function __reload() {') + '\n' + OLD_SHIMS;
  const probe = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
  new vm.Script(env + '\n' + foundation).runInContext(probe);
  // Top-level vars as declared (the last declaration wins), each one statement, single- or multi-line.
  const vars = new Map();
  const declRe = /\nvar ([A-Za-z_$][\w$]*) = /g;
  let m;
  while ((m = declRe.exec(src))) {
    const start = m.index + 1, lineEnd = src.indexOf('\n', start);
    const end = /;\s*$/.test(src.slice(start, lineEnd)) ? lineEnd : (src.slice(start).search(/\n[\]})]+;\n/) + start + src.slice(start).match(/\n[\]})]+;\n/)[0].length - 1);
    vars.set(m[1], src.slice(start, end));
  }
  vars.delete('S');
  const have = new Map(), used = new Map();
  const queue = ['load', 'save', 'persistGeodeToLocalStorage', 'geodeStoreFinancialState', 'syncRecurringPayments', 'geodeFinancialWriteAllowed'];
  const words = text => new Set(text.match(/[A-Za-z_$][\w$]*/g) || []);
  for (let grew = true; grew;) {
    while (queue.length) {
      const n = queue.shift();
      if (have.has(n) || vm.runInContext('typeof ' + n, probe) !== 'undefined') continue;
      const f = cm.extractFunction(src, n);
      have.set(n, f);
      cm.calledNames(f.text).forEach(c => queue.push(c));
    }
    grew = false;
    const seen = words([...have.values()].map(f => f.text).join('\n') + '\n' + [...used.values()].join('\n'));
    vars.forEach((text, n) => {
      if (used.has(n) || !seen.has(n) || vm.runInContext('typeof ' + n, probe) !== 'undefined') return;
      used.set(n, text);
      cm.calledNames(text).forEach(c => queue.push(c));
      grew = true;
    });
  }
  const sAt = src.indexOf('\nvar S = {');
  const initialS = src.slice(sAt + 1, src.indexOf('\n};\n', sAt) + 3);
  const consts = [...used.values()].map(t => 'try {\n' + t + '\n} catch (e) {}');
  const code = env + '\n' + foundation + '\n' + [...have.values()].map(f => f.text).join('\n') + '\n' + consts.join('\n') + '\n' + initialS + '\n';
  return { script: new vm.Script(code, { filename: OLD_REF + '-runtime.js' }), src, names: [...have.keys()],
    version: (src.match(/\nvar BEYND_RUNTIME_VERSION = '([^']+)';/) || [])[1], schema: Number((src.match(/\nvar GEODE_SCHEMA_VERSION = (\d+);/) || [])[1]) };
}
const OLD = buildOldProgram();

const localNoon = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); };
const at = (iso, h, mi) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, h, mi || 0).getTime(); };
const clock = (page, ms) => page.run('__nowMs = ' + ms + ';');

/** A deployed v1.0.78 page over the given stored text. load() runs as at boot, then the first render's recurring sync. */
class OldPage {
  constructor(raw, iso) {
    this.ctx = vm.createContext({ console: { log() {}, info() {}, warn() {}, error() {} } });
    OLD.script.runInContext(this.ctx);
    this.run('__nowMs = ' + localNoon(iso) + '; __store = ' + JSON.stringify(raw) + ';');
    this.run('load(); _geodeBootstrap = false; syncRecurringPayments();');
  }
  run(code) { return vm.runInContext(code, this.ctx); }
  state() { return JSON.parse(this.run('JSON.stringify(S)')); }
}

/** This runtime's page over the given stored text (no constructor write): the harness reload. */
function pageOver(raw, iso) {
  const app = new cm.App({}, iso, NEW, { boot: false });
  app.run('__store = ' + JSON.stringify(raw) + '; __reload();');
  return app;
}
const raw = page => page.run('__store');
const stored = page => JSON.parse(raw(page));
const share = (from, to) => to.run('__store = ' + JSON.stringify(raw(from)) + ';');
const memBl = page => { const b = page.state().monthBaseline; return b === undefined ? null : b; };
const storedBl = page => { const b = stored(page).monthBaseline; return b === undefined ? null : b; };
const FIELDS = ['income', 'outgoings', 'allocations', 'fromEarlier', 'expensesRegular', 'expensesOneOff', 'monthlyLeft'];
const figs = b => (b ? FIELDS.map(k => b[k]) : null);
const look = b => (b ? [b.ym, b.kind, figs(b)] : null);
const ymOf = b => (b ? b.ym : null);
const countWrites = page => page.run('var __kw = 0, __ks = localStorage.setItem; localStorage.setItem = function (k, v) { if (k === KEY) __kw++; return __ks.call(localStorage, k, v); };');
const takeWrites = page => { const n = page.run('__kw'); page.run('__kw = 0;'); return n; };
/** Home's incidental write (lastSeenAt), an ordinary write with no action open. */
const ordinary = page => page.run('S.lastSeenAt = Date.now(); persistGeodeToLocalStorage()');
const formIncome = (page, v) => page.run('__fields = { mi: ' + JSON.stringify(String(v)) + ' }; __toasts = []; openModal(""); __runTimers(); saveInc(); __runTimers();');
const formExpense = (page, f) => page.run('__fields = ' + JSON.stringify(f) + '; __toasts = []; openModal(""); __runTimers(); saveExp(""); __runTimers();');
const call = (page, expr) => JSON.parse(page.run('JSON.stringify(' + expr + ')'));

const HOLIDAY = () => ({ id: 'gH', name: 'Holiday', amount: 2000, saved: 1000, baseSaved: 1000, monthly: 0, cat: 'other' });
/**
 * A schema-3 plan written in month ym: income £3,000; Rent £1,000 and a Holiday contribution £100 monthly (due the
 * 15th and 5th of ym); a parking fine £60 due 25 September 2026; Food £400 a month; a one-off Gift £50 dated 20 October 2026.
 */
const PLAN = ym => ({
  _schemaVersion: 3, income: 3000, incomeExplicitlySet: true, expectationGaps: [], expectationFloorYm: ym,
  payments: [
    { id: 'rent', name: 'Rent', amount: 1000, rec: 'yes', status: 'upcoming', date: ym + '-15' },
    { id: 'hol', name: 'Holiday monthly', amount: 100, rec: 'yes', status: 'upcoming', date: ym + '-05', goalId: 'gH' },
    { id: 'fine', name: 'Parking fine', amount: 60, rec: 'no', status: 'upcoming', date: '2026-09-25' }
  ],
  expenses: [
    { id: 'food', name: 'Food', amount: 400, rec: 'yes', cat: 'food', date: ym + '-01' },
    { id: 'gift', name: 'Gift', amount: 50, rec: 'no', cat: 'other', date: '2026-10-20' }
  ],
  goals: [HOLIDAY()], investments: [], debts: [], savingsReleases: [], debtPaymentEvents: [], activityLog: [], lastSuggestedActions: []
});
/** October 2026 plan figures of PLAN after the boundary: the fine is due from September (outstanding from earlier). */
const OCT = [3000, 1000, 100, 60, 400, 50, 1390];
/** September 2026 plan figures of PLAN: the fine is due this month, the Gift not yet. */
const SEP = [3000, 1060, 100, 0, 400, 0, 1440];
/** A page that last wrote PLAN('2026-09') on 20 September (its own September baseline included). */
const september = () => new cm.App(PLAN('2026-09'), '2026-09-20', NEW);
/** The deployed v1.0.78 runtime opening that September text on `iso` (its recurring sync writes October): the stored text it leaves. */
const oldWrite = (text, iso, code) => { const p = new OldPage(text, iso); if (code) p.run(code); return raw(p); };

// ───────────────────────────── shape, validator, constructor ─────────────────────────────

const VALID = { v: 1, ym: '2026-10', kind: 'month_open', observedAt: at('2026-10-08', 9), income: 3000, outgoings: 1000, allocations: 100,
  fromEarlier: 60, expensesRegular: 400, expensesOneOff: 50, monthlyLeft: 1390 };
const KEYS = ['v', 'ym', 'kind', 'observedAt'].concat(FIELDS);

function shapeAndValidator() {
  scenario('P3-4C SHAPE AND VALIDATOR — one plan record, eleven fields, reconciled; anything else is malformed', () => {
    const app = pageOver(JSON.stringify(PLAN('2026-10')), '2026-10-08');
    const valid = b => app.call('geodeMonthBaselineValid', [b]);
    const without = k => { const c = Object.assign({}, VALID); delete c[k]; return c; };
    const withField = (k, v) => Object.assign({}, VALID, { [k]: v });
    check('shape.valid', 'The record { v, ym, kind, observedAt, income, outgoings, allocations, fromEarlier, expensesRegular, expensesOneOff, monthlyLeft } is valid, for either kind',
      [valid(VALID), valid(withField('kind', 'first_observed'))], [true, true]);
    check('shape.keys', 'Exactly those keys: each one missing, or any extra field (an item list, names, a delta, a history), is malformed',
      [KEYS.map(k => valid(without(k))), ['items', 'names', 'delta', 'history', 'receipts'].map(k => valid(withField(k, [])))],
      [KEYS.map(() => false), [false, false, false, false, false]]);
    check('shape.version-kind', 'v must be the number 1; kind exactly month_open or first_observed',
      [valid(withField('v', 2)), valid(withField('v', '1')), valid(withField('kind', 'opening')), valid(withField('kind', 'MONTH_OPEN')), valid(withField('kind', ''))],
      [false, false, false, false, false]);
    check('shape.month', 'ym a real YYYY-MM month; observedAt a finite time inside that month (local time)',
      [valid(withField('ym', '2026-13')), valid(withField('ym', '2026-1')), valid(withField('ym', 202610)), valid(withField('ym', '')),
        valid(withField('observedAt', at('2026-09-30', 23, 59))), valid(withField('observedAt', at('2026-11-01', 0))), valid(withField('observedAt', at('2026-10-01', 0))),
        valid(withField('observedAt', NaN)), valid(withField('observedAt', Infinity)), valid(withField('observedAt', String(VALID.observedAt)))],
      [false, false, false, false, false, false, true, false, false, false]);
    check('shape.money', 'Each plan figure a finite number: a string, NaN, Infinity or null is malformed',
      FIELDS.map(k => [valid(withField(k, String(VALID[k]))), valid(withField(k, NaN)), valid(withField(k, Infinity)), valid(withField(k, null))]),
      FIELDS.map(() => [false, false, false, false]));
    check('shape.reconcile', 'income − outgoings − allocations − fromEarlier − expensesRegular − expensesOneOff = monthlyLeft within £0.005: £0.004 out passes, £0.01 out fails',
      [valid(withField('monthlyLeft', 1390.004)), valid(withField('monthlyLeft', 1390.01)), valid(withField('outgoings', 999))], [true, false, false]);
    check('shape.impossible', 'Not a record at all: null, an array, a string, a number',
      [valid(null), valid([VALID]), valid(JSON.stringify(VALID)), valid(1)], [false, false, false, false]);
    const frozen = JSON.stringify(VALID);
    app.run('var __b = ' + frozen + '; geodeMonthBaselineValid(__b); geodeMonthBaselineValid(Object.freeze(__b));');
    check('shape.pure', 'The validator changes nothing (a frozen record validates; the object is unchanged)', app.run('JSON.stringify(__b)'), frozen);
    const status = (b, ym) => app.call('geodeMonthBaselineStatus', [b, ym]);
    check('shape.status', 'Status for October: none → absent, malformed → malformed, October → current, September → older, November → future',
      [status(undefined, '2026-10'), status(null, '2026-10'), status(withField('v', 2), '2026-10'), status(VALID, '2026-10'),
        status(Object.assign({}, VALID, { ym: '2026-09', observedAt: at('2026-09-08', 9) }), '2026-10'), status(Object.assign({}, VALID, { ym: '2026-11', observedAt: at('2026-11-08', 9) }), '2026-10')],
      ['absent', 'absent', 'malformed', 'current', 'older', 'future']);
  });

  scenario('P3-4C PURE CONSTRUCTOR — the record from the ready Living Month model, nothing else', () => {
    const app = pageOver(JSON.stringify(PLAN('2026-10')), '2026-10-08');
    app.run('var __m = geodeLivingMonthModel(S, Date.now()), __mText = JSON.stringify(__m);');
    const make = (kind, t) => call(app, 'geodeMonthBaselineFromModel(__m, ' + JSON.stringify(kind) + ', ' + t + ')');
    const t0 = at('2026-10-08', 9);
    const rec = make('month_open', t0);
    check('ctor.figures', 'From the October model of PLAN: income £3,000; Rent £1,000 outgoings; Holiday £100 allocations; the September fine £60 from earlier; Food £400 regular; Gift £50 one-off; Monthly Left £1,390 — the model\'s own plan figures',
      [rec.v, rec.ym, rec.kind, rec.observedAt === t0, figs(rec), call(app, '[__m.plan.incomePlanned, __m.plan.paymentsCountedTotal, __m.plan.budgetTotal, __m.plan.monthlyLeft]')],
      [1, '2026-10', 'month_open', true, OCT, [3000, 1160, 450, 1390]]);
    check('ctor.reconcile', 'The components reconcile to the model\'s Monthly Left, and to the plan totals (payments = outgoings + allocations + fromEarlier; expenses = regular + one-off)',
      [Math.abs(rec.income - rec.outgoings - rec.allocations - rec.fromEarlier - rec.expensesRegular - rec.expensesOneOff - rec.monthlyLeft) <= 0.005,
        rec.outgoings + rec.allocations + rec.fromEarlier, rec.expensesRegular + rec.expensesOneOff], [true, 1160, 450]);
    app.run('__nowMs = ' + at('2027-03-03', 3) + ';');
    const later = make('first_observed', t0);
    check('ctor.pure', 'Pure: kind and observedAt come only from its arguments (a different clock changes nothing); the model is not changed; each call returns a fresh object; no write',
      [later.observedAt === t0, later.kind, app.run('JSON.stringify(__m) === __mText'),
        app.run('(function () { var a = geodeMonthBaselineFromModel(__m, "month_open", ' + t0 + '), b = geodeMonthBaselineFromModel(__m, "month_open", ' + t0 + '); a.income = 1; return b.income === 3000 && a !== b; })()')],
      [true, 'first_observed', true, true]);
    check('ctor.refuse', 'No record from a model that is not ready (boundary pending, wrong schema, invalid clock) or with an unknown kind or a time outside the month',
      [call(app, 'geodeMonthBaselineFromModel(Object.assign({}, __m, { status: "boundary_pending" }), "month_open", ' + t0 + ')'),
        call(app, 'geodeMonthBaselineFromModel(Object.assign({}, __m, { status: "schema_not_current" }), "month_open", ' + t0 + ')'),
        call(app, 'geodeMonthBaselineFromModel(null, "month_open", ' + t0 + ')'),
        make('opening', t0), make('month_open', at('2026-09-30', 12)), make('month_open', 'NaN')],
      [null, null, null, null, null, null]);
    const oneOff = JSON.parse(JSON.stringify(PLAN('2026-10')));
    oneOff.payments.push({ id: 'isa', name: 'ISA top-up', amount: 250, rec: 'no', status: 'paid', date: '2026-10-03', investId: 'iA', lastPaidYM: '2026-10' });
    oneOff.investments = [{ id: 'iA', name: 'ISA', type: 'isa', balance: 5000, baseBalance: 5000 }];
    oneOff.expenses.push({ id: 'vet', name: 'Vet', amount: 120.37, rec: 'no', cat: 'other', date: '2026-10-02' }, { id: 'tv', name: 'TV licence', amount: 169.5, rec: 'annual', cat: 'bills', date: '2026-10-11' });
    const app2 = pageOver(JSON.stringify(oneOff), '2026-10-08');
    const r2 = call(app2, 'geodeMonthBaselineFromModel(geodeLivingMonthModel(S, Date.now()), "first_observed", Date.now())');
    check('ctor.reconcile.mixed', 'A completed one-off investment contribution counts as an allocation; an annual expense is regular plan, a dated one-off is one-off plan; pence reconcile',
      [r2.allocations, r2.expensesOneOff, Math.abs(r2.income - r2.outgoings - r2.allocations - r2.fromEarlier - r2.expensesRegular - r2.expensesOneOff - r2.monthlyLeft) <= 0.005,
        r2.monthlyLeft === call(app2, 'calcMonthlyLeftover(S)')],
      [350, 170.37, true, true]);
  });
}

// ───────────────────────────── capture ─────────────────────────────

function capture() {
  scenario('P3-4C A/B — the boundary roll on the 1st, or a first open on the 8th, after a September write: month_open, in the roll\'s own write', () => {
    const first = september();
    const sepBl = memBl(first);
    first.run('save();');
    countWrites(first);
    first.at('2026-10-01'); first.run('__reload();');
    const s = stored(first);
    check('A.boundary', 'A. The page last wrote on 20 September (with its September record, first_observed); opened on 1 October the boundary roll stores October\'s record — month_open, the post-roll plan — in that one write (the rolled rows and the record together, no second write)',
      [look(sepBl), takeWrites(first), look(s.monthBaseline), s.payments.map(p => [p.id, p.date]), s.monthBaseline.observedAt === s._rev.at, s.monthBaseline.observedAt === localNoon('2026-10-01')],
      [['2026-09', 'first_observed', SEP], 1, ['2026-10', 'month_open', OCT], [['rent', '2026-10-15'], ['hol', '2026-10-05'], ['fine', '2026-09-25']], true, true]);

    const eighth = september();
    eighth.advance('2026-10-08', 'reload');
    check('B.eighth', 'B. First opened on 8 October with only the September revision behind it: month_open, observed on the 8th (capture may be later than the 1st)',
      [look(storedBl(eighth)), storedBl(eighth).observedAt === localNoon('2026-10-08')], [['2026-10', 'month_open', OCT], true]);

    const flat = JSON.parse(JSON.stringify(PLAN('2026-09')));
    flat.payments = [{ id: 'fine', name: 'Parking fine', amount: 60, rec: 'no', status: 'upcoming', date: '2026-09-25' }];
    delete flat.expenses[0].date;
    const quiet = new cm.App(flat, '2026-09-20', NEW);
    quiet.run('save();');
    countWrites(quiet);
    quiet.at('2026-10-08'); quiet.run('__reload();');
    const beforeWrite = [takeWrites(quiet), storedBl(quiet).ym];
    ordinary(quiet);
    check('B.ordinary', 'B, nothing to roll: the October open writes nothing (the September record stays, unused); the first ordinary write (Home\'s lastSeenAt) stores October\'s record — month_open, since the text it replaces was written in September',
      [beforeWrite, takeWrites(quiet), look(storedBl(quiet))], [[0, '2026-09'], 1, ['2026-10', 'month_open', [3000, 0, 0, 60, 400, 50, 2490]]]);

    const edge = (revAt, nowMs) => {
      const s = PLAN('2026-10');
      s.payments = s.payments.slice(2);
      s._rev = { seq: 5, id: 'rev_edge_5', by: OLD_RUNTIME, at: revAt };
      const page = pageOver(JSON.stringify(s), '2026-10-01');
      clock(page, nowMs);
      ordinary(page);
      return storedBl(page).kind;
    };
    check('B.midnight', 'Strictly before local midnight: a replaced revision at 23:59:59.999 on 30 September → month_open; at 00:00:00.000 on 1 October → first_observed',
      [edge(at('2026-10-01', 0) - 1, at('2026-10-01', 0, 5)), edge(at('2026-10-01', 0), at('2026-10-01', 0, 5))], ['month_open', 'first_observed']);
  });

  scenario('P3-4C C/D/R(§22) — mid-month introduction: a v1.0.78 write in October means first_observed', () => {
    const sep = september();
    const octText = oldWrite(raw(sep), '2026-10-03');
    const oct = JSON.parse(octText);
    const page = pageOver(octText, '2026-10-08');
    countWrites(page);
    const opened = [takeWrites(page), call(page, 'geodeMonthBaselineStatus(S.monthBaseline, currentYM())'), call(page, 'geodeLivingMonthModel(S, Date.now()).changes')];
    ordinary(page);
    check('C.october-rev', 'C/D. v1.0.78 opened the September text on 3 October: its own sync rolled October and wrote (revision by v1.0.78, 3 October), carrying the September record unchanged. This runtime opening it on the 8th writes nothing, finds the record older (unused; changes unavailable, baseline_month_mismatch), and its first write records first_observed — the October revision proves nothing about the opening plan',
      [oct._rev.by, oct._rev.at === localNoon('2026-10-03'), look(oct.monthBaseline), opened, takeWrites(page), look(storedBl(page))],
      [OLD_RUNTIME, true, ['2026-09', 'first_observed', SEP], [0, 'older', { available: false, reason: 'baseline_month_mismatch' }], 1, ['2026-10', 'first_observed', OCT]]);

    const lastSept = oldWrite(raw(september()), '2026-09-28', 'S.lastSeenAt = Date.now(); persistGeodeToLocalStorage();');
    const late = pageOver(lastSept, '2026-10-08');
    check('R22.september', '§22: when v1.0.78\'s last write was in September (28th), this runtime\'s October roll records month_open',
      [JSON.parse(lastSept)._rev.by, look(storedBl(late))], [OLD_RUNTIME, ['2026-10', 'month_open', OCT]]);
  });

  scenario('P3-4C E–I — the first financial action before any baseline: the committed pre-action plan, stored with the action', () => {
    const octText = oldWrite(raw(september()), '2026-10-03');
    const run = act => {
      const page = pageOver(octText, '2026-10-08');
      countWrites(page);
      act(page);
      return [takeWrites(page), look(storedBl(page)), stored(page).income];
    };
    const PRE = ['2026-10', 'first_observed', OCT];
    check('F.income', 'F. Income edited £3,000 → £2,900 as the month\'s first action (saveInc): one write holds both the new income and the baseline — of the plan before the edit (income £3,000, Monthly Left £1,390), never £2,900',
      run(p => formIncome(p, 2900)), [1, PRE, 2900]);
    check('G.payment', 'G. Rent edited £1,000 → £1,200 through the payment form: the baseline keeps Rent at £1,000',
      run(p => p.editPayment('rent', { amount: '1200' })), [1, PRE, 3000]);
    check('H.expense', 'H. A new £75 monthly expense through the expense form: the baseline keeps expenses at £450',
      run(p => formExpense(p, { en: 'Gym', ea: '75', ed: '2026-10-08', ecat: 'other', er: 'yes' })), [1, PRE, 3000]);
    check('I.contribution', 'I. Completing the Holiday contribution (togglePay): the baseline is the pre-action plan, stored in the completion\'s write',
      run(p => p.toggle('hol')), [1, PRE, 3000]);
    const e = pageOver(octText, '2026-10-08');
    e.run('if (geodePrepareFinancialMutation()) { S.income = 2500; save(); }');
    check('E.example', 'E. §14\'s example: a figure of £900 (here Monthly Left £1,390) changed to £800 (here £890) by the first action is baselined at the committed value, never the post-action one',
      [storedBl(e).monthlyLeft, call(e, 'calcMonthlyLeftover(S)')], [1390, 890]);
  });

  scenario('P3-4C J/K — once stored, the month\'s record never changes', () => {
    const page = september();
    page.advance('2026-10-08', 'reload');
    const first = raw(page) && JSON.stringify(storedBl(page));
    const views = [];
    page.render(); views.push(JSON.stringify(storedBl(page)) === first);
    page.reload(); views.push(JSON.stringify(storedBl(page)) === first);
    page.advance('2026-10-30', 'reload'); views.push(JSON.stringify(storedBl(page)) === first);
    check('J.render-reload', 'J. Render, reload, and a visit on 30 October leave the October record byte-identical', views, [true, true, true]);
    formIncome(page, 3300); page.editPayment('rent', { amount: '900' }); page.toggle('hol'); page.toggle('hol'); page.del('fine');
    formExpense(page, { en: 'Gym', ea: '75', ed: '2026-10-30', ecat: 'other', er: 'yes' });
    ordinary(page); ordinary(page); page.run('save(); save();');
    check('K.repeated', 'K. Income, payment, completion (and undo), deletion and expense actions, ordinary writes and repeated saves: the plan moved (Monthly Left £1,775) but the record is exactly the one first stored',
      [JSON.stringify(storedBl(page)) === first, JSON.stringify(memBl(page)) === first, call(page, 'calcMonthlyLeftover(S)')], [true, true, 1775]);
  });

  scenario('P3-4C L — while the boundary is held nothing is captured', () => {
    const s2 = JSON.parse(JSON.stringify(PLAN('2026-09')));
    s2._schemaVersion = 2;
    delete s2.expectationGaps; delete s2.expectationFloorYm;
    const text = JSON.stringify(Object.assign(s2, { _rev: { seq: 2, id: 'rev_s2_2', by: 'v1.0.77', at: localNoon('2026-09-20') } }));
    const page = new cm.App({}, '2026-10-08', NEW, { boot: false });
    page.run('var caches = {}; __otherStorage.setItem(GEODE_SHELL_KEY, "v1.0.77"); __store = ' + JSON.stringify(text) + '; __reload();');
    const held = [page.run('geodeShellReadiness()'), page.run('geodeBoundaryTransitionOutstanding(S)'), call(page, 'geodeLivingMonthModel(S, Date.now()).status')];
    ordinary(page); formIncome(page, 3100);
    check('L.held', 'Schema 2 behind a pending shell (the schema-3 transition, and so the October boundary, held): the model is not ready, and neither ordinary writes nor actions store a record',
      [held, memBl(page), storedBl(page)], [['pending', true, 'schema_not_current'], null, null]);
    const pending = pageOver(JSON.stringify(PLAN('2026-09')), '2026-09-20');
    pending.at('2026-10-08');
    check('L.boundary-pending', 'A schema-3 state seen in October before its roll: the model reports boundary_pending and the capture gives no record (it can never baseline the un-rolled plan)',
      [call(pending, 'geodeLivingMonthModel(S, Date.now()).status'), call(pending, 'geodeMonthBaselineCapture(S)')], ['boundary_pending', null]);
  });

  scenario('P3-4C M/N/O — malformed and older records are replaced; a future record is never used or replaced', () => {
    const withRecord = b => { const s = PLAN('2026-10'); s.payments = s.payments.slice(2); s.monthBaseline = b; s._rev = { seq: 3, id: 'rev_m_3', by: OLD_RUNTIME, at: localNoon('2026-10-03') }; return JSON.stringify(s); };
    const PLAIN = [3000, 0, 0, 60, 400, 50, 2490];
    const replaced = b => { const page = pageOver(withRecord(b), '2026-10-08'); ordinary(page); return look(storedBl(page)); };
    check('M.malformed', 'M. A malformed record (figures as strings; NaN money as stored null; an unknown kind; not reconciling) is treated as absent: the next write replaces it with a valid first_observed record',
      [replaced(Object.assign({}, VALID, { income: '3000' })), replaced(Object.assign({}, VALID, { monthlyLeft: null })), replaced(Object.assign({}, VALID, { kind: 'opening' })),
        replaced(Object.assign({}, VALID, { monthlyLeft: 1 })), replaced('garbage')],
      [0, 1, 2, 3, 4].map(() => ['2026-10', 'first_observed', PLAIN]));
    check('N.older', 'N. A September record in October is not used and is replaced on the next safe capture',
      replaced(Object.assign({}, VALID, { ym: '2026-09', observedAt: at('2026-09-08', 9) })), ['2026-10', 'first_observed', PLAIN]);

    const nov = Object.assign({}, VALID, { ym: '2026-11', observedAt: at('2026-11-02', 9) });
    const page = pageOver(withRecord(nov), '2026-10-08');
    const novText = JSON.stringify(storedBl(page));
    ordinary(page); formIncome(page, 3100); page.reload(); page.render();
    const during = [JSON.stringify(storedBl(page)) === novText, call(page, 'geodeMonthBaselineStatus(S.monthBaseline, currentYM())'), call(page, 'geodeLivingMonthModel(S, Date.now()).changes.reason')];
    page.advance('2026-11-02', 'reload'); ordinary(page);
    check('O.clock-rollback', 'O. Clock moved back: storage holds a November record while the clock says October. It is never used (status future; changes unavailable, baseline_month_mismatch) and never replaced — writes, an action, reload and render keep it byte-identical, and no October record is invented. Back in November it is that month\'s record, unchanged',
      [during, JSON.stringify(storedBl(page)) === novText], [[true, 'future', 'baseline_month_mismatch'], true]);
  });

  scenario('P3-4C P/Q — six months away gives only the current month; a new user mid-month is first_observed', () => {
    const april = new cm.App(PLAN('2026-04'), '2026-04-20', NEW);
    april.advance('2026-10-08', 'reload');
    const s = stored(april);
    check('P.absence', 'P. Last written 20 April; opened 8 October: one October record (month_open — the replaced text is from April), the April record gone, nothing for May–September (no history field, no fabricated months)',
      [look(s.monthBaseline), Object.keys(s).filter(k => /baseline/i.test(k)), s.monthBaseline.observedAt === localNoon('2026-10-08')],
      [['2026-10', 'month_open', [3000, 1000, 100, 60, 400, 50, 1390]], ['monthBaseline'], true]);

    const fresh = new cm.App(Object.assign(PLAN('2026-10'), { payments: [], activityLog: [] }), '2026-10-08', NEW);
    check('Q.new-user', 'Q. A new user finishing onboarding on 8 October: the first write (nothing stored before) records first_observed, never month_open',
      look(storedBl(fresh)), ['2026-10', 'first_observed', [3000, 0, 0, 0, 400, 50, 2550]]);
  });

  scenario('P3-4C §15 LIFECYCLE — authority begins only with a successful write', () => {
    const octText = oldWrite(raw(september()), '2026-10-03');
    const cancel = pageOver(octText, '2026-10-08');
    cancel.run('openModal(""); __runTimers(); geodeModalCommitBegin(); geodeModalCommitRelease();');
    const afterCancel = [ymOf(memBl(cancel)), ymOf(storedBl(cancel)), cancel.run('_geodeMonthBaselinePending !== null')];
    ordinary(cancel);
    check('M15.cancel', 'A commit taken and released (cancelled) stores nothing and puts nothing in S (the September record stays, unused); the record it prepared (the committed plan) is stored by the next write while that committed text still stands',
      [afterCancel, look(storedBl(cancel))], [['2026-09', '2026-09', true], ['2026-10', 'first_observed', OCT]]);

    const abandoned = pageOver(octText, '2026-10-08');
    abandoned.run('geodePrepareFinancialMutation(); S.income = 2000;');
    ordinary(abandoned);
    check('M15.abandoned', 'An action that changed S but never saved: the next write stores the record of the committed plan (£3,000), not the abandoned change',
      [storedBl(abandoned).income, stored(abandoned).income], [3000, 2000]);

    const lost = pageOver(octText, '2026-10-08');
    lost.run('geodePrepareFinancialMutation(); _geodeMonthBaselinePending = null; S.income = 2000; save();');
    const postMutation = [ymOf(storedBl(lost)), stored(lost).income];
    ordinary(lost);
    check('M15.post-mutation', 'A write that ends an action with no prepared record never captures (it would baseline the mutated plan; the September record stays); the next ordinary write records the plan as now committed (£2,000), first_observed',
      [postMutation, look(storedBl(lost))], [['2026-09', 2000], ['2026-10', 'first_observed', [2000, 1000, 100, 60, 400, 50, 390]]]);

    const late = pageOver(octText, '2026-10-08');
    clock(late, at('2026-10-31', 23, 59));
    late.run('geodePrepareFinancialMutation(); S.income = 2900;');
    const prepared = late.run('_geodeMonthBaselinePending.record.ym');
    clock(late, at('2026-11-01', 0, 1));
    late.run('save();');
    const novWrite = [ymOf(storedBl(late)), stored(late).income];
    ordinary(late);
    const unrolled = [call(late, 'geodeLivingMonthModel(S, Date.now()).status'), ymOf(storedBl(late))];
    late.render();
    check('M15.stale-pending', 'A record prepared before an action on 31 October is never stored in November: the action\'s write at 00:01 on 1 November stores no record (the October one is stale, and an action\'s write never captures its own result). Before November\'s roll an ordinary write stores none either (boundary pending); the roll then records November from the committed plan (first_observed: the text it replaces was written on 1 November)',
      [prepared, novWrite, unrolled, look(storedBl(late)).slice(0, 2), storedBl(late).income], ['2026-10', ['2026-09', 2900], ['boundary_pending', '2026-09'], ['2026-11', 'first_observed'], 2900]);
  });

  scenario('P3-4C R/S — a failed write or read-back mismatch leaves no record; the next write retries', () => {
    const octText = oldWrite(raw(september()), '2026-10-03');
    ['throw', 'lose'].forEach(fault => {
      const page = pageOver(octText, '2026-10-08');
      page.run('__storageFault = ' + JSON.stringify(fault) + ';');
      formIncome(page, 2900);
      const failed = [ymOf(memBl(page)), ymOf(storedBl(page)), page.state().income, raw(page) === octText];
      ordinary(page);
      const failedOrdinary = [ymOf(memBl(page)), raw(page) === octText];
      page.run('__storageFault = "";');
      page.run('__runTimers();');
      formIncome(page, 2800);
      check((fault === 'throw' ? 'R' : 'S') + '.' + fault, (fault === 'throw' ? 'R. setItem throws' : 'S. The write does not read back') +         ' during the month\'s first action: S goes back to the committed text (P2-9) — no October record in memory or storage (only the unused September one), storage byte-identical; an ordinary write while still failing stores nothing either. The next successful action stores the record of the committed plan (£3,000), never the failed £2,900',
        [failed, failedOrdinary, look(storedBl(page)), stored(page).income], [['2026-09', '2026-09', 3000, true], ['2026-09', true], ['2026-10', 'first_observed', OCT], 2800]);
    });
    const page = september();
    page.advance('2026-10-08', 'reload');
    const kept = JSON.stringify(storedBl(page));
    page.run('__storageFault = "throw";'); formIncome(page, 2900); page.run('__storageFault = ""; __runTimers();');
    check('R.existing', 'A failed write never touches an existing record (memory and storage keep it)', [JSON.stringify(memBl(page)) === kept, JSON.stringify(storedBl(page)) === kept], [true, true]);
  });

  scenario('P3-4C T/U — stale tabs cannot overwrite, recreate or reclassify; two near-concurrent attempts store one record', () => {
    const octText = oldWrite(raw(september()), '2026-10-03');
    const tabA = pageOver(octText, '2026-10-08'), tabB = pageOver(octText, '2026-10-08');
    ordinary(tabA);
    const recA = raw(tabA);
    share(tabA, tabB);
    formIncome(tabB, 2500); ordinary(tabB); tabB.run('save()');
    check('T.stale', 'T. Two tabs on the same October text. A\'s write stores the record. B (loaded before) then acts, writes and saves: every write refused (P2-10, B goes stale "foreign"), so B can neither overwrite A\'s record nor store its own; storage byte-identical',
      [raw(tabB) === recA, tabB.run('_geodeRuntimeStale'), look(storedBl(tabB))], [true, 'foreign', ['2026-10', 'first_observed', OCT]]);
    tabB.run('__reload();');
    check('T.reload', 'B\'s reload adopts A\'s record unchanged', JSON.stringify(memBl(tabB)) === JSON.stringify(JSON.parse(recA).monthBaseline), true);

    const sepText = raw(september());
    const twoB = pageOver(sepText, '2026-09-30');
    const twoA = pageOver(sepText, '2026-10-08');
    const recU = raw(twoA);
    share(twoA, twoB);
    twoB.at('2026-10-08'); twoB.render(); formIncome(twoB, 2100);
    const reclass = pageOver(recU, '2026-10-09');
    ordinary(reclass);
    check('U.two', 'U. Two pages hold the same September text; both would roll October. A rolls first and stores October\'s record (month_open). B\'s roll and its action then re-read storage, see the newer revision and are refused (stale "foreign"): no second record, no reclassification, storage byte-identical. A page opened after A keeps A\'s record through its own writes',
      [storedBl(twoA).kind, twoB.run('_geodeRuntimeStale'), raw(twoB) === recU, JSON.stringify(storedBl(reclass)) === JSON.stringify(JSON.parse(recU).monthBaseline)],
      ['month_open', 'foreign', true, true]);

    const same = pageOver(octText, '2026-10-08');
    same.run('geodePrepareFinancialMutation(); geodePrepareFinancialMutation();');
    formIncome(same, 2900); formIncome(same, 2700);
    check('U.same-page', 'Repeated prepares and two quick actions on one page store one record (the first committed plan)', look(storedBl(same)), ['2026-10', 'first_observed', OCT]);
  });
}

// ───────────────────────────── v1.0.78 compatibility (§18) ─────────────────────────────

function oldRuntime() {
  scenario('P3-4C §18 — the deployed ' + OLD_RUNTIME + ' (' + OLD_REF + ') keeps the record, executably', () => {
    check('V0.identity', 'The program is ' + OLD_REF + '\'s own code: runtime ' + OLD_RUNTIME + ', schema 3, its real load / save / persist / store / rollback (and ' + OLD.names.length + ' functions they reach); it has no baseline code of its own',
      [OLD.version, OLD.schema, ['load', 'save', 'persistGeodeToLocalStorage', 'geodeStoreFinancialState', 'geodeRestoreCommittedState', 'geodeFinancialWriteAllowed'].every(n => OLD.names.indexOf(n) >= 0),
        OLD.src.indexOf('monthBaseline') < 0], [OLD_RUNTIME, 3, true, true]);

    const page = september();
    page.advance('2026-10-08', 'reload');
    const text = raw(page), rec = JSON.stringify(JSON.parse(text).monthBaseline);
    const oldPage = new OldPage(text, '2026-10-12');
    check('V.load', 'V/A. ' + OLD_RUNTIME + '\'s load() on text holding the October record: the record is in its S exactly (its key copy keeps unknown fields), and its boot writes nothing new over it',
      [JSON.stringify(oldPage.state().monthBaseline) === rec, raw(oldPage) === text], [true, true]);

    oldPage.run('S.income = 3400; save();');
    const afterSave = stored(oldPage);
    check('W.save', 'W/B. Its save() after a financial change (income £3,400): the stored text keeps the record byte-for-byte beside the change, under a ' + OLD_RUNTIME + ' revision',
      [JSON.stringify(afterSave.monthBaseline) === rec, afterSave.income, afterSave._rev.by], [true, 3400, OLD_RUNTIME]);

    oldPage.run('S.payments[0].status = "paid"; S.payments[0].lastPaidYM = "2026-10"; save(); S.expenses.push({ id: "gym", name: "Gym", amount: 75, rec: "yes", cat: "other", date: "2026-10-12" }); save(); S.lastSeenAt = Date.now(); persistGeodeToLocalStorage();');
    const ordinaryOld = stored(oldPage);
    check('D18.ordinary', 'D. Its ordinary writes — a completion, an expense, the incidental persist — never edit the record\'s contents',
      [JSON.stringify(ordinaryOld.monthBaseline) === rec, ordinaryOld.expenses.length], [true, 3]);

    const before = raw(oldPage);
    oldPage.run('__storageFault = "throw"; S.income = 9999; save(); __storageFault = "lose"; S.income = 8888; save(); __storageFault = "";');
    check('X.rollback', 'X/C. Its failed writes (setItem throws; no read-back) restore its committed text: the record in memory is unchanged, storage byte-identical',
      [JSON.stringify(oldPage.state().monthBaseline) === rec, oldPage.state().income, raw(oldPage) === before], [true, 3400, true]);

    oldPage.run('__nowMs = ' + localNoon('2026-11-03') + '; syncRecurringPayments();');
    const novOld = stored(oldPage);
    const back = pageOver(raw(oldPage), '2026-11-05');
    const keptOld = JSON.stringify(storedBl(back)) === rec;
    ordinary(back);
    check('V.boundary', 'Its November roll (a ' + OLD_RUNTIME + ' write in November) carries the October record unchanged; this runtime then finds it older and its first write records November as first_observed (the replaced revision is from November)',
      [JSON.stringify(novOld.monthBaseline) === rec, keptOld, look(storedBl(back)).slice(0, 2)], [true, true, ['2026-11', 'first_observed']]);

    // E. fencing between runtimes, in both directions
    const base = raw(september());
    const shared = pageOver(base, '2026-09-21');
    const oldTab = new OldPage(raw(shared), '2026-09-21');
    shared.at('2026-10-08'); shared.run('syncRecurringPayments();');
    const newRec = raw(shared);
    oldTab.run('__store = ' + JSON.stringify(newRec) + '; S.income = 100; save(); persistGeodeToLocalStorage();');
    check('E18.old-fenced', 'E. An open ' + OLD_RUNTIME + ' tab, loaded before this runtime stored October\'s record: its save and persist re-read storage, see a newer revision and refuse (stale "foreign"); the record is byte-identical',
      [oldTab.run('_geodeRuntimeStale'), raw(oldTab) === newRec, JSON.parse(newRec).monthBaseline.kind], ['foreign', true, 'month_open']);

    const newTab = pageOver(base, '2026-09-30');
    const oldWriter = new OldPage(base, '2026-10-08');
    oldWriter.run('S.income = 3200; save();');
    newTab.run('__store = ' + JSON.stringify(raw(oldWriter)) + ';');
    const oldText = raw(newTab);
    newTab.at('2026-10-08'); newTab.render(); formIncome(newTab, 3600); ordinary(newTab);
    check('E18.new-fenced', 'E. The reverse: this runtime\'s page loaded the September text on 30 September; ' + OLD_RUNTIME + ' then wrote October (its roll and income £3,200). This page\'s own roll, action and write in October are refused (stale), so it neither overwrites that text nor stores a record into it',
      [newTab.run('_geodeRuntimeStale'), raw(newTab) === oldText], ['foreign', true]);
    newTab.run('__reload();'); ordinary(newTab);
    check('E18.after', 'After reloading onto ' + OLD_RUNTIME + '\'s October text this runtime records October as first_observed (that text was written in October), with the plan v1.0.78 left (income £3,200)',
      look(storedBl(newTab)), ['2026-10', 'first_observed', [3200, 1000, 100, 60, 400, 50, 1590]]);
  });
}

// ───────────────────────────── export, restore contract, authority ─────────────────────────────

function exportAndRestore() {
  scenario('P3-4C Y / W — export carries the record; the restore contract (defined, not implemented)', () => {
    const page = september();
    page.advance('2026-10-08', 'reload');
    const env = page.backup();
    check('Y.export', 'Y. The backup export includes monthBaseline exactly as stored (it exports the whole state); the restore extractor (no caller yet) does not carry it — restore needs explicit support later',
      [JSON.stringify(env.data.monthBaseline) === JSON.stringify(storedBl(page)), page.restorable(env).monthBaseline === undefined], [true, true]);

    /** The contract a future restore must meet: what an imported record becomes, judged by the restored month's clock. Never month_open from a restore. */
    const contract = (b, ym) => { const s = page.call('geodeMonthBaselineStatus', [b, ym]); return s === 'current' ? 'keep' : s === 'future' ? 'ignore' : s === 'malformed' ? 'reject' : 'capture_first_observed'; };
    const restoredWrite = b => {
      const s = PLAN('2026-10'); s.payments = s.payments.slice(2); if (b !== undefined) s.monthBaseline = b;
      s._rev = { seq: 1, id: 'rev_restore_1', by: 'v1.0.79', at: localNoon('2026-10-08') };
      const p = pageOver(JSON.stringify(s), '2026-10-08'); ordinary(p); return storedBl(p);
    };
    const cur = Object.assign({}, VALID, { kind: 'first_observed' });
    check('W.contract', 'W. Restore contract: a valid current-month record is kept; none, an older or a malformed one leads to first_observed at the next capture (the restored text is written now, so it cannot prove the month\'s opening plan); a future record is ignored. The capture already behaves so on a restored text written today',
      [contract(cur, '2026-10'), contract(undefined, '2026-10'), contract(Object.assign({}, VALID, { ym: '2026-09', observedAt: at('2026-09-03', 9) }), '2026-10'),
        contract(Object.assign({}, VALID, { v: 9 }), '2026-10'), contract(Object.assign({}, VALID, { ym: '2026-12', observedAt: at('2026-12-03', 9) }), '2026-10'),
        JSON.stringify(restoredWrite(cur)) === JSON.stringify(cur), restoredWrite(undefined).kind, restoredWrite({ v: 9 }).kind, restoredWrite(Object.assign({}, VALID, { ym: '2026-09', observedAt: at('2026-09-03', 9) })).kind],
      ['keep', 'capture_first_observed', 'capture_first_observed', 'reject', 'ignore', true, 'first_observed', 'first_observed', 'first_observed']);
  });

  scenario('P3-4C Z — no financial result reads the record (adding, removing or changing it changes nothing)', () => {
    const variants = { none: undefined, valid: VALID, changed: Object.assign({}, VALID, { income: 9000, monthlyLeft: 7390 }), malformed: { v: 1, ym: 'x' },
      future: Object.assign({}, VALID, { ym: '2026-12', observedAt: at('2026-12-03', 9) }), older: Object.assign({}, VALID, { ym: '2026-09', observedAt: at('2026-09-03', 9) }) };
    const outcome = b => {
      const s = PLAN('2026-09'); if (b !== undefined) s.monthBaseline = b;
      s._rev = { seq: 2, id: 'rev_z_2', by: OLD_RUNTIME, at: localNoon('2026-09-20') };
      const page = pageOver(JSON.stringify(s), '2026-09-20');
      page.run('S.monthBaseline = ' + (b === undefined ? 'undefined' : JSON.stringify(b)) + ';');
      const modelApartFromChanges = () => { const m = call(page, 'geodeLivingMonthModel(S, Date.now())'); const c = m.changes; delete m.changes; return [m, c]; };
      const [sepModel, sepChanges] = modelApartFromChanges();
      const sep = [JSON.parse(page.run('__snapshot()')), sepModel];
      page.toggle('rent'); page.editPayment('hol', { amount: '150' });
      page.at('2026-10-08'); page.render();
      const st = page.state();
      delete st.monthBaseline; delete st._rev;
      const model = modelApartFromChanges()[0];
      return { figures: JSON.stringify([sep, JSON.parse(page.run('__snapshot()')), model, call(page, 'geodeOverdueItems()'), st]), changes: sepChanges };
    };
    const all = Object.keys(variants).map(k => outcome(variants[k]));
    check('Z.invariance', 'Z/§27. The same September state with no record, a valid one, one with different figures, a malformed, a future and an older one: Monthly Left, goals, investments, rows, overdue items, the Living Month model apart from its change comparison, ledgers, expectation gaps and every stored field after a completion, an edit and the October roll are identical',
      all.map(x => x.figures === all[0].figures), all.map(() => true));
    check('Z.changes', 'Only the model\'s change comparison (P3-4D) reads the record, and only to compare: in September, none → no_month_baseline; October, changed-figure and December records → baseline_month_mismatch; malformed → invalid_month_baseline; a September record → available (plan movement against it)',
      all.map(x => (x.changes.available ? 'available' : x.changes.reason)),
      ['no_month_baseline', 'baseline_month_mismatch', 'baseline_month_mismatch', 'invalid_month_baseline', 'baseline_month_mismatch', 'available']);
  });
}

// ───────────────────────────── mutants ─────────────────────────────

function mutants() {
  scenario('P3-4C MUTANTS — each rule is load-bearing', () => {
    const src = PROGRAM.src;
    const fn = n => cm.extractFunction(src, n).text;
    const mutate = (page, n, from, to) => { const t = fn(n); if (t.indexOf(from) < 0) throw new Error('mutant anchor missing in ' + n + ': ' + from); page.run(t.replace(from, to)); };
    const octText = oldWrite(raw(september()), '2026-10-03');

    const ignoresAction = pageOver(octText, '2026-10-08');
    mutate(ignoresAction, 'geodeMonthBaselinePrepare', 'var record = geodeMonthBaselineCapture(', 'var record = null && geodeMonthBaselineCapture(');
    mutate(ignoresAction, 'geodeMonthBaselineStage', 'if (!record && !actionWasOpen)', 'if (!record)');
    formIncome(ignoresAction, 2900);
    check('mut.post-mutation', 'Without the pre-action record and the action-open rule, the first action baselines its own result (£2,900) — F would fail', storedBl(ignoresAction).income, 2900);

    const rewrites = september();
    rewrites.advance('2026-10-08', 'reload');
    const firstAt = storedBl(rewrites).observedAt;
    mutate(rewrites, 'geodeMonthBaselineStage', "if (status === 'current' || status === 'future' || ", 'if (');
    rewrites.at('2026-10-20'); formIncome(rewrites, 3300); ordinary(rewrites);
    check('mut.immutable', 'With the current-record check removed a later ordinary write replaces the record (new time, new income) — J/K would fail',
      [storedBl(rewrites).observedAt === firstAt, storedBl(rewrites).income], [false, 3300]);

    const nov = Object.assign({}, VALID, { ym: '2026-11', observedAt: at('2026-11-02', 9) });
    const s = PLAN('2026-10'); s.payments = s.payments.slice(2); s.monthBaseline = nov; s._rev = { seq: 3, id: 'rev_f_3', by: OLD_RUNTIME, at: localNoon('2026-10-03') };
    const future = pageOver(JSON.stringify(s), '2026-10-08');
    mutate(future, 'geodeMonthBaselineStage', "status === 'future' || ", '');
    ordinary(future);
    check('mut.future', 'Treating a future record as replaceable lets a rolled-back clock overwrite November with October — O would fail', storedBl(future).ym, '2026-10');

    const lenient = pageOver(JSON.stringify(PLAN('2026-10')), '2026-10-08');
    mutate(lenient, 'geodeMonthBaselineKind', 'replacedRev.at < start', 'replacedRev.at <= start');
    check('mut.midnight', 'A non-strict midnight comparison labels a revision written at 00:00 on the 1st month_open — B.midnight would fail',
      lenient.call('geodeMonthBaselineKind', [{ seq: 1, id: 'r', by: OLD_RUNTIME, at: at('2026-10-01', 0) }, '2026-10']), 'month_open');

    const clockKind = pageOver(octText, '2026-10-08');
    mutate(clockKind, 'geodeMonthBaselineCapture', 'raw === _geodeKnownRaw ? _geodeKnownRev : null', '{ seq: 1, id: "x", by: "x", at: 0 }');
    ordinary(clockKind);
    check('mut.proof', 'Without the replaced revision as proof every capture is month_open — C would fail', storedBl(clockKind).kind, 'month_open');

    const engine = pageOver(JSON.stringify(Object.assign(PLAN('2026-10'), { monthBaseline: Object.assign({}, VALID, { income: 9000, monthlyLeft: 7390 }) })), '2026-10-08');
    const leftBefore = call(engine, 'calcMonthlyLeftover(S)');
    mutate(engine, 'calcMonthlyLeftover', 'var income = toNum(state.income);', 'var income = state.monthBaseline ? toNum(state.monthBaseline.income) : toNum(state.income);');
    check('mut.authority', 'An engine that read the record would move Monthly Left by £6,000 — Z would fail', call(engine, 'calcMonthlyLeftover(S)') - leftBefore, 6000);
  });
}

function main() {
  shapeAndValidator();
  capture();
  oldRuntime();
  exportAndRestore();
  mutants();
  console.log('Beynd month baseline (P3-4C)');
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
