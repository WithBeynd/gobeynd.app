#!/usr/bin/env node
/**
 * P3-5D income receipt experience — dependency-free: node tests/income-receipt-ux.js
 *
 * Runs the Month Pulse, its detail and the receipt dialog (geodeIncomeReceipt*, geodeMonthIncomeView, extracted from
 * index.html) on the cross-month harness's simulated app — the production P3-5B writers, save, store, rollback (P2-9)
 * and revision fencing (P2-10) — with a small DOM: production openModal / closeModal build and close the dialog, and
 * every action is a click on the rendered control, running its own onclick. render() re-renders the Pulse from the
 * committed page state as rHome does. Checks the matrix A–AT of the P3-5D brief: what the Pulse and the detail say
 * (none recorded / recorded / unreadable, stable, irregular, no plan, above plan), recording, the explicit timing choice,
 * the planned amount offered but never filled, correcting, removing, the duplicate prompt, invalid input, failed and
 * stale writes, the plan, Monthly Left and P3-4 left exactly as they were, banned wording, keyboard and focus, wrapping
 * markup and ordering — then each mutant of index.html must fail at least one check.
 * Exit code 0 when every check passes, 1 otherwise.
 */
'use strict';

const vm = require('vm');
const cm = require('./cross-month-financial-truth.js');
const mb = require('./month-baseline.js');

const { PLAN, pageOver, raw, at } = mb;
const SRC = cm.readSource(cm.INDEX_HTML);
const J = JSON.stringify;
const OCT = '2026-10';
const GBP = { sym: '\u00a3', code: 'GBP', loc: 'en-GB' };
/** October opened at income £2,800 (Monthly Left £1,190); the plan now says £3,000 — "What changed" has something to say. */
const BASELINE = { v: 1, ym: OCT, kind: 'month_open', observedAt: at('2026-10-01', 9), income: 2800, outgoings: 1000, allocations: 100,
  fromEarlier: 60, expensesRegular: 400, expensesOneOff: 50, monthlyLeft: 1190 };
const RAT = at('2026-10-11', 9);
const R = (id, amount, extra) => Object.assign({ id, eventType: 'receipt', amount, ym: OCT, recordedAt: RAT, source: 'manual' }, extra || {});
const V = (id, voidsId) => ({ id, eventType: 'void', voidsId, recordedAt: at('2026-10-11', 10), source: 'manual' });

const NONE = 'Income received hasn\u2019t been recorded this month.';
const BANNED = /\b(available|cash|left to spend|safe to spend|spare|disposable|bank balance|balance|remaining|outstanding|deposit(?:ed)?|confirmed|paid into|salary due|still expected|to come|overdue|missing|shortfall|covered|coverage)\b|%|\u00a30 received|\bof \u00a3/i;

// ───────────────────────────── page environment ─────────────────────────────

/** A small DOM: parsed markup, attributes, the selectors the dialog uses, focus, bubbling listeners and inline handlers. */
const DOM = String.raw`
function __DNode(tag) {
  this.tagName = tag ? String(tag).toUpperCase() : '#text';
  this.nodeType = tag ? 1 : 3;
  this.childNodes = []; this.parentNode = null; this.__attrs = {}; this.__cls = {}; this.__ls = {};
  this.id = ''; this.value = ''; this.checked = false; this.hidden = false; this.open = false; this.disabled = false; this.data = '';
  this.tabIndex = /^(BUTTON|INPUT|SUMMARY|A|SELECT|TEXTAREA)$/.test(this.tagName) ? 0 : -1;
  var cls = this.__cls;
  this.classList = { add: function (c) { cls[c] = true; }, remove: function (c) { delete cls[c]; }, contains: function (c) { return cls[c] === true; } };
}
var __dVoid = { input: 1, br: 1, img: 1, hr: 1, meta: 1 };
function __dDecode(s) { return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&'); }
__DNode.prototype.setAttribute = function (k, v) {
  k = String(k).toLowerCase(); v = String(v); this.__attrs[k] = v;
  if (k === 'id') this.id = v; else if (k === 'value') this.value = v; else if (k === 'checked') this.checked = true;
  else if (k === 'hidden') this.hidden = true; else if (k === 'open') this.open = true; else if (k === 'disabled') this.disabled = true;
  else if (k === 'tabindex') this.tabIndex = Number(v);
  else if (k === 'class') { var c = this.__cls; v.split(/\s+/).filter(Boolean).forEach(function (x) { c[x] = true; }); }
};
__DNode.prototype.getAttribute = function (k) { k = String(k).toLowerCase(); return Object.prototype.hasOwnProperty.call(this.__attrs, k) ? this.__attrs[k] : null; };
__DNode.prototype.hasAttribute = function (k) { return this.getAttribute(k) !== null; };
__DNode.prototype.removeAttribute = function (k) { delete this.__attrs[String(k).toLowerCase()]; };
__DNode.prototype.appendChild = function (c) { if (c.parentNode) c.remove(); c.parentNode = this; this.childNodes.push(c); return c; };
__DNode.prototype.remove = function () { var p = this.parentNode; if (p) { p.childNodes.splice(p.childNodes.indexOf(this), 1); this.parentNode = null; } if (__modal === this) __modal = null; };
__DNode.prototype.addEventListener = function (t, fn) { (this.__ls[t] = this.__ls[t] || []).push(fn); };
__DNode.prototype.focus = function () { document.activeElement = this; };
__DNode.prototype.querySelectorAll = function (s) { return __dAll(this, s); };
__DNode.prototype.querySelector = function (s) { return __dAll(this, s)[0] || null; };
Object.defineProperty(__DNode.prototype, 'className', { set: function (v) { this.setAttribute('class', v); }, get: function () { return Object.keys(this.__cls).join(' '); } });
Object.defineProperty(__DNode.prototype, 'children', { get: function () { return this.childNodes.filter(function (c) { return c.nodeType === 1; }); } });
Object.defineProperty(__DNode.prototype, 'firstElementChild', { get: function () { return this.children[0] || null; } });
Object.defineProperty(__DNode.prototype, 'nextElementSibling', { get: function () { var p = this.parentNode; if (!p) return null; var k = p.children; return k[k.indexOf(this) + 1] || null; } });
Object.defineProperty(__DNode.prototype, 'textContent', {
  get: function () { return this.nodeType === 3 ? this.data : this.childNodes.map(function (c) { return c.textContent; }).join(''); },
  set: function (v) { this.childNodes = []; var t = new __DNode(''); t.data = String(v); this.appendChild(t); }
});
Object.defineProperty(__DNode.prototype, 'innerHTML', {
  get: function () { return this.__html || ''; },
  set: function (html) { this.childNodes.forEach(function (c) { c.parentNode = null; }); this.childNodes = []; this.__html = String(html); __dParse(String(html), this); }
});
/** Rendered unless it, or an ancestor, is hidden, or it sits in a closed <details> other than as its summary. */
Object.defineProperty(__DNode.prototype, 'offsetParent', { get: function () {
  for (var n = this, child = null; n; child = n, n = n.parentNode) {
    if (n.hidden) return null;
    if (n.tagName === 'DETAILS' && !n.open && child && child.tagName !== 'SUMMARY') return null;
  }
  return this.parentNode;
} });
function __dParse(html, parent) {
  var re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+))?)*)\s*(\/?)>|([^<]+)/g;
  var stack = [parent], m;
  while ((m = re.exec(html))) {
    var top = stack[stack.length - 1];
    if (m[5] !== undefined) { var t = new __DNode(''); t.data = __dDecode(m[5]); top.appendChild(t); continue; }
    if (!m[2]) continue;
    var tag = m[2].toLowerCase();
    if (m[1]) { for (var i = stack.length - 1; i > 0; i--) if (stack[i].tagName === tag.toUpperCase()) { stack.length = i; break; } continue; }
    var el = new __DNode(tag);
    var ar = /([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, a;
    while ((a = ar.exec(m[3]))) el.setAttribute(a[1], __dDecode(a[2] !== undefined ? a[2] : a[3] !== undefined ? a[3] : a[4] !== undefined ? a[4] : ''));
    top.appendChild(el);
    if (!__dVoid[tag] && !m[4]) stack.push(el);
  }
}
function __dCompound(el, c) {
  var m = /^([a-zA-Z0-9]*)((?:#[\w-]+)?)((?:\[[^\]]+\])*)((?::checked)?)$/.exec(c);
  if (!m) throw new Error('unsupported selector: ' + c);
  if (m[1] && el.tagName !== m[1].toUpperCase()) return false;
  if (m[2] && el.id !== m[2].slice(1)) return false;
  var ar = /\[([\w-]+)(?:="([^"]*)")?\]/g, a;
  while ((a = ar.exec(m[3]))) { var v = el.getAttribute(a[1]); if (v === null || (a[2] !== undefined && v !== a[2])) return false; }
  return !m[4] || el.checked === true;
}
function __dMatch(el, toks, i) {
  if (!el || el.nodeType !== 1 || !__dCompound(el, toks[i])) return false;
  if (i === 0) return true;
  if (toks[i - 1] === '>') return __dMatch(el.parentNode, toks, i - 2);
  for (var p = el.parentNode; p; p = p.parentNode) if (__dMatch(p, toks, i - 1)) return true;
  return false;
}
function __dAll(root, sel) {
  var groups = sel.split(',').map(function (s) { return s.trim().replace(/\s*>\s*/g, ' > ').split(/\s+/); });
  var out = [];
  (function walk(n) { n.children.forEach(function (c) { if (groups.some(function (g) { return __dMatch(c, g, g.length - 1); })) out.push(c); walk(c); }); })(root);
  return out;
}
var __body = new __DNode('body');
document = {
  body: __body, activeElement: null,
  createElement: function (t) { return new __DNode(t || 'div'); },
  getElementById: function (id) { var f = null; (function walk(n) { n.children.forEach(function (c) { if (!f && c.id === id) f = c; if (!f) walk(c); }); })(__body); return f; },
  querySelector: function (s) { return __body.querySelector(s); },
  querySelectorAll: function (s) { return __body.querySelectorAll(s); }
};
function __fire(el, type, init) {
  var ev = Object.assign({ type: type, target: el, defaultPrevented: false, preventDefault: function () { this.defaultPrevented = true; } }, init || {});
  for (var n = el; n; n = n.parentNode) (n.__ls[type] || []).slice().forEach(function (fn) { fn.call(n, ev); });
  return ev;
}
function __handler(el, name) { var h = el.getAttribute(name); if (h) (new Function(h)).call(el); }
function __click(el) { if (!el) throw new Error('nothing to click'); __handler(el, 'onclick'); __fire(el, 'click'); }
function __text(n) { return (n.nodeType === 3 ? n.data : n.childNodes.map(__text).join(' ')).replace(/\s+/g, ' ').trim(); }
function __t(sel) { var e = document.querySelector(sel); return e ? __text(e) : ''; }
function __ts(sel) { return document.querySelectorAll(sel).map(__text); }
function __clickSel(sel) { __click(document.querySelector(sel)); __runTimers(); }
function __input(id, v) { var el = document.getElementById(id); el.value = v; __handler(el, 'oninput'); }
function __change(id, v) { var el = document.getElementById(id); el.value = v; __handler(el, 'onchange'); }
function __choose(v) {
  var pick = null;
  document.querySelectorAll('input[name="geode-ir-when"]').forEach(function (r) { r.checked = r.getAttribute('value') === v; if (r.checked) pick = r; });
  if (!pick) throw new Error('no timing choice ' + v);
  __handler(pick, 'onchange');
}
function __dialog() { var m = document.getElementById('modal'); return m && !m.classList.contains('mo-bg--closing') ? m : null; }
function __focusId() { var a = document.activeElement; return a ? (a.id || a.getAttribute('data-geode-income-action') || a.getAttribute('data-geode-receipt-action') + ':' + a.getAttribute('data-geode-receipt-id') || a.tagName) : null; }
`;

/** Page chrome the experience reaches that is not under test, and Home's render. */
const UX_SHIMS = String.raw`
/** Icons are chrome: the close button's icon markup (GEODE_ICONS) is not under test. */
function geodeSvg() { return ''; }
/** render(): production render() runs rHome, whose Month Pulse is exactly this call (rHome's own options). */
var __host = null, __renders = 0;
function render() { __renders++; if (__host) __host.innerHTML = geodeHomeMonthPulseHtml(S, new Date(), { dueShownElsewhere: false, detailOpen: window._geodeMonthDetailOpen === true }); }
function __mount() { __host = document.createElement('div'); __host.id = 'tab-home'; document.body.appendChild(__host); render(); }
`;

/** Every writer call (with its input) and every save, counted around the production functions. */
const WRAP = String.raw`
var __calls = [], __saves = 0;
(function () {
  var rec = geodeRecordIncomeReceipt, vo = geodeVoidIncomeReceipt, co = geodeCorrectIncomeReceipt, sv = save;
  geodeRecordIncomeReceipt = function (i) { __calls.push(['record', JSON.parse(JSON.stringify(i))]); return rec.apply(null, arguments); };
  geodeVoidIncomeReceipt = function (id) { __calls.push(['void', id]); return vo.apply(null, arguments); };
  geodeCorrectIncomeReceipt = function (id, i) { __calls.push(['correct', id, JSON.parse(JSON.stringify(i))]); return co.apply(null, arguments); };
  save = function () { __saves++; return sv.apply(null, arguments); };
})();
`;

const UX_FNS = ['geodeMonthIncomeView', 'geodeIncomeReceiptParseAmount', 'geodeIncomeReceiptAmountTooLarge', 'geodeIncomeReceiptSubmitLabel', 'geodeIncomeReceiptInput', 'geodeIncomeReceiptReasonMessage',
  'geodeIncomeReceiptOutcomeMessage', 'geodeIncomeReceiptLikelyDuplicate', 'geodeIncomeReceiptDuplicateText', 'geodeIncomeReceiptFormHtml', 'geodeIncomeReceiptRemoveHtml',
  'geodeIncomeReceiptModel', 'geodeIncomeReceiptFind', 'geodeMonthDetailToggled', 'geodeIncomeReceiptRemember', 'geodeIncomeReceiptDismissed', 'geodeIncomeReceiptClose',
  'geodeIncomeReceiptDialogReady', 'geodeIncomeReceiptRecord', 'geodeIncomeReceiptCorrect', 'geodeIncomeReceiptRemove', 'geodeIncomeReceiptFormRead',
  'geodeIncomeReceiptClearDuplicate', 'geodeIncomeReceiptShowError', 'geodeIncomeReceiptAmountChanged', 'geodeIncomeReceiptUsePlanned', 'geodeIncomeReceiptTimingChanged',
  'geodeIncomeReceiptShowDuplicate', 'geodeIncomeReceiptUnchanged', 'geodeIncomeReceiptSubmit', 'geodeIncomeReceiptRemoveConfirm', 'geodeIncomeReceiptAfterWrite'];
const ENTRIES = ['geodeHomeMonthPulseHtml', 'geodeMonthPulseView', 'geodeMonthPulseHtml', 'geodeMonthDetailView', 'geodeMonthDetailHtml', 'geodeMonthChangeView'].concat(UX_FNS);
const ENSURE = ['calcMonthlyLeftover', 'geodeLivingMonthModel'];

const PROGRAMS = new Map();
/** The experience from `src`: its entry functions always, and any production function they reach that the page lacks. */
function programFor(src) {
  if (PROGRAMS.has(src)) return PROGRAMS.get(src);
  const probe = new cm.App({}, '2026-10-12', mb.NEW, { boot: false });
  probe.run(DOM + UX_SHIMS);
  const have = new Map();
  const queue = ENTRIES.concat(ENSURE);
  while (queue.length) {
    const n = queue.shift();
    if (have.has(n)) continue;
    if (ENTRIES.indexOf(n) < 0 && probe.run('typeof ' + n) !== 'undefined') continue;
    const f = cm.extractFunction(src, n);
    have.set(n, f.text);
    cm.calledNames(f.text).forEach(c => queue.push(c));
  }
  const script = new vm.Script(DOM + UX_SHIMS + [...have.values()].join('\n') + '\n' + WRAP, { filename: 'income-receipt-ux-program.js' });
  PROGRAMS.set(src, script);
  return script;
}

/** This runtime's page over October's plan (+ over) on 12 October 2026, the experience installed and Home rendered. */
function page(src, over) {
  const p = pageOver(J(Object.assign(PLAN(OCT), { cur: GBP, incomeType: 'stable', incomeTypeUserSet: true, monthBaseline: BASELINE }, over || {})), '2026-10-12');
  return install(p, src);
}
function install(p, src) {
  programFor(src).runInContext(p.ctx);
  p.run('__mount();');
  return p;
}

// ───────────────────────────── page helpers ─────────────────────────────

const val = (p, expr) => { const t = p.run('JSON.stringify(' + expr + ')'); return t === undefined ? undefined : JSON.parse(t); };
const T = (p, sel) => p.call('__t', [sel]);
const TS = (p, sel) => val(p, '__ts(' + J(sel) + ')');
const click = (p, sel) => p.call('__clickSel', [sel]);
const incomeLine = p => T(p, '[data-geode-month-pulse-income="1"]');
const pulseText = p => T(p, '[data-geode-month-pulse="1"]');
const dialogOpen = p => p.run('!!__dialog()');
const dialogText = p => (p.run('!!__dialog()') ? p.run('__text(__dialog())') : '');
const calls = p => val(p, '__calls');
const saves = p => p.run('__saves');
const reset = p => p.run('__calls = []; __saves = 0; __toasts = []; __acks = [];');
const toasts = p => val(p, '__toasts').concat(val(p, '__acks'));
const ledger = p => val(p, 'Array.isArray(S.incomeReceipts) ? geodeIncomeReceiptLedger(S.incomeReceipts, "2026-10") : null');
const storedList = p => JSON.parse(raw(p)).incomeReceipts;
const memList = p => val(p, 'S.incomeReceipts');
/** The detail's Income part: heading, rows [title, meta, actions] and the planned-income line ('' when absent). */
function incomePart(p) {
  return val(p, '(function () { var ul = document.querySelector(\'[data-geode-month-detail-list="income"]\'); if (!ul) return null;' +
    ' var h = ul.parentNode.querySelector(\'[data-geode-month-detail-heading="1"]\');' +
    ' return { heading: __text(h), rows: ul.children.map(function (li) { var d = li.children; return [__text(d[0].children[0]), __text(d[0].children[1]), d[1].children.map(__text)]; }),' +
    ' note: ul.nextElementSibling ? __text(ul.nextElementSibling) : "" }; })()');
}
const detailText = p => T(p, '[data-geode-month-detail="1"]');
const figures = p => val(p, '(function () { var m = geodeLivingMonthModel(S, new Date()); return { monthlyLeft: calcMonthlyLeftover(S), plan: m.plan, remainder: m.available.planRemainder,' +
  ' income: S.income, incomeType: S.incomeType, payments: m.payments.countedTotal, ahead: m.payments.ahead.map(function (x) { return x.id; }), changes: m.changes,' +
  ' changeView: geodeMonthChangeView(m.changes), baseline: S.monthBaseline, gaps: S.expectationGaps, activity: S.activityLog }; })()');
const changesShown = p => T(p, '[data-geode-month-detail-list="changes"]');

/** Opens the record dialog from the Pulse's income action. */
const openRecord = p => click(p, '[data-geode-income-action]');
function fill(p, f) {
  if (f.amount !== undefined) p.call('__input', ['geode-ir-amount', f.amount]);
  if (f.timing) p.call('__choose', [f.timing]);
  if (f.date !== undefined) p.call('__change', ['geode-ir-date', f.date]);
  if (f.label !== undefined) p.call('__input', ['geode-ir-label', f.label]);
}
const submit = p => click(p, '#geode-ir-submit');
function recordVia(p, f) { openRecord(p); fill(p, f); submit(p); }
const openOn = (p, action, id) => click(p, '[data-geode-receipt-action="' + action + '"][data-geode-receipt-id="' + id + '"]');
const errors = p => val(p, '["amount", "when", "date", "label"].map(function (k) { var e = document.getElementById("geode-ir-" + k + "-error"); return e ? __text(e) : null; })' +
  '.concat([document.getElementById("geode-ir-message") ? __text(document.getElementById("geode-ir-message")) : null])');
const activeId = () => 'S.incomeReceipts && geodeIncomeReceiptLedger(S.incomeReceipts).active.map(function (r) { return r.id; })';

// ───────────────────────────── checks ─────────────────────────────

function checksFor(src) {
  const results = [];
  let group = '';
  const canon = v => (Array.isArray(v) ? '[' + v.map(canon).join(',') + ']' : v && typeof v === 'object'
    ? '{' + Object.keys(v).sort().map(k => J(k) + ':' + canon(v[k])).join(',') + '}' : v === undefined ? 'undefined' : J(v));
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const scenario = (name, fn) => {
    group = name;
    try { fn(); } catch (e) { results.push({ group, id: 'error', text: 'scenario threw', ok: false, detail: String(e && e.stack || e) }); }
  };
  const P = over => page(src, over);
  /** Everything the experience may say, for the wording checks: Pulse, detail, open dialog, toasts. */
  const said = p => [pulseText(p), dialogText(p)].concat(toasts(p)).join(' | ');

  scenario('PULSE — none recorded, recorded and unreadable; never £0, never due', () => {
    const a = P();
    check('A.none-stable', 'A. No receipts, stable plan: "Income received hasn\'t been recorded this month." and the "Record income received" action; no Income part; no £0',
      [incomeLine(a), TS(a, '[data-geode-income-action]'), incomePart(a), /\u00a30\b/.test(pulseText(a)), BANNED.test(pulseText(a))],
      [NONE + ' Record income received', ['Record income received'], null, false, false]);
    const b = P({ income: 1600, incomeType: 'irregular' });
    check('B.none-irregular', 'B. No receipts, irregular plan: planned income can vary; none recorded — no amount still to come',
      [incomeLine(b), BANNED.test(pulseText(b))], ['Planned income can vary. ' + NONE + ' Record income received', false]);
    const c = P({ income: 0, monthBaseline: undefined });
    check('C.none-no-plan', 'C. No receipts, no plan: the same line and action (recording needs no plan); nothing is due', [incomeLine(c), BANNED.test(pulseText(c))],
      [NONE + ' Record income received', false]);
    const ab = P({ incomeReceipts: { inc_a: R('inc_a', 3000) } });
    reset(ab);
    ab.run('geodeIncomeReceiptRecord(null); __runTimers();');
    check('AB.unreadable', 'AB. Unreadable store: no income line, no record / correct / remove control, no Income part; opening the dialog anyway shows none and calls no writer; the field stays as stored',
      [incomeLine(ab), TS(ab, '[data-geode-income-action], [data-geode-receipt-action]'), incomePart(ab), dialogOpen(ab), calls(ab), memList(ab), JSON.parse(raw(ab)).incomeReceipts],
      ['', [], null, false, [], { inc_a: R('inc_a', 3000) }, { inc_a: R('inc_a', 3000) }]);
    check('AI.no-zero', 'AI. None recorded is never £0 received: no £0 anywhere in the Pulse of a month without receipts (stable, irregular, no plan)',
      [a, b, c].map(p => /\u00a30(?![\d,.])/.test(pulseText(p).replace(/\u00a30 left if the month goes to plan/, ''))), [false, false, false]);
  });

  scenario('RECORD — explicit amount, explicit timing, the planned amount offered never filled, one writer call', () => {
    const p = P();
    reset(p);
    openRecord(p);
    const opened = [dialogOpen(p), p.run('document.getElementById("geode-ir-amount").value'), val(p, 'document.querySelectorAll(\'input[name="geode-ir-when"]:checked\').length'),
      T(p, '#geode-ir-submit'), T(p, '[data-geode-ir-planned]'), p.run('document.getElementById("geode-ir-date").getAttribute("max")'), p.run('document.getElementById("geode-ir-day").hidden'),
      p.run('document.getElementById("geode-ir-label").getAttribute("maxlength")'), p.run('document.getElementById("geode-ir-label-box").open'), calls(p)];
    check('K.opens-empty', 'Recording opens empty: no amount, no timing chosen, "Record income received"; "Use planned amount · £3,000" offered; the date field (max today) hidden until "Another day"; label collapsed, 40 characters; no writer call',
      opened, [true, '', 0, 'Record income received', 'Use planned amount \u00b7 \u00a33,000', '2026-10-12', true, '40', false, []]);
    click(p, '[data-geode-ir-planned]');
    check('M.use-planned', 'M. "Use planned amount" fills the field only when pressed; the button then reads "Record £3,000 received"; still nothing recorded',
      [p.run('document.getElementById("geode-ir-amount").value'), T(p, '#geode-ir-submit'), calls(p), memList(p)], ['3000', 'Record \u00a33,000 received', [], undefined]);
    submit(p);
    check('N.timing-required', 'N. With no timing chosen nothing is recorded — no month-only or today default: "Choose when you received it."',
      [errors(p)[1], calls(p), dialogOpen(p), memList(p)], ['Choose when you received it.', [], true, undefined]);
    fill(p, { timing: 'today' });
    submit(p);
    const r = ledger(p).active[0];
    check('D.recorded', 'D. Recorded: one record call with { amount 3000, ym 2026-10, date today } and one save; the dialog closes; the receipt is stored',
      [calls(p), saves(p), dialogOpen(p), [r.amount, r.ym, r.date, r.source], storedList(p).length], [[['record', { amount: 3000, ym: OCT, date: '2026-10-12' }]], 1, false, [3000, OCT, '2026-10-12', 'manual'], 1]);
    check('D.pulse', 'D. One receipt equal to the plan: "£3,000 recorded as received this month." and "Add income"; the Income part lists it, the plan on its own line',
      [incomeLine(p), incomePart(p)], ['\u00a33,000 recorded as received this month. Add income',
        { heading: 'Income \u00a33,000 recorded as received', rows: [['Income recorded', '\u00a33,000 \u00b7 12 Oct', ['Correct', 'Remove record']]], note: 'Planned income \u00a33,000' }]);
    check('S.after-save', 'S. After saving: the Pulse re-rendered from the committed state; "Income recorded." — no plan, Monthly Left or spending claim', [toasts(p), BANNED.test(said(p)), /plan changed|monthly left|more to spend/i.test(said(p))],
      [['Income recorded.'], false, false]);

    const e = P();
    recordVia(e, { amount: '2500', timing: 'today' });
    const ePart = incomePart(e);
    check('E.below', 'E. Below the plan: two independent figures; no difference, share or amount still due',
      [incomeLine(e), ePart.note, /\u00a3500\b|of \u00a3|remaining|outstanding|short/i.test(incomeLine(e) + J(ePart) + detailText(e))], ['\u00a32,500 recorded as received this month. Add income', 'Planned income \u00a33,000', false]);
    const f = P();
    recordVia(f, { amount: '3200', timing: 'today' });
    const fPart = incomePart(f);
    check('F.above', 'F. Above the plan: £3,200 recorded and planned income £3,000, side by side; no surplus figure in the income line or the Income part',
      [incomeLine(f), fPart.note, /\u00a3200\b|surplus|extra|spare|above/i.test(incomeLine(f) + J(fPart))], ['\u00a33,200 recorded as received this month. Add income', 'Planned income \u00a33,000', false]);
    const g = P({ income: 0, monthBaseline: undefined });
    openRecord(g);
    const offered = T(g, '[data-geode-ir-planned]');
    fill(g, { amount: '500', timing: 'today' });
    submit(g);
    check('G.no-plan', 'G. With no plan: no planned amount offered; £500 recorded; "No planned income this month."',
      [offered, incomeLine(g), incomePart(g).note], ['', '\u00a3500 recorded as received this month. Add income', 'No planned income this month.']);
    const h = P();
    recordVia(h, { amount: '1500', timing: 'day', date: '2026-10-03' });
    recordVia(h, { amount: '1000', timing: 'today' });
    check('H.two-partial', 'H. Two partial receipts: £2,500 recorded; each listed by its own day; still no amount due',
      [incomeLine(h), incomePart(h).rows.map(r => r[1]), /remaining|outstanding|\u00a3500\b/i.test(detailText(h))],
      ['\u00a32,500 recorded as received this month. Add income', ['\u00a31,500 \u00b7 3 Oct', '\u00a31,000 \u00b7 12 Oct'], false]);
  });

  scenario('TIMING AND LABEL — the day received, month-only evidence, labels', () => {
    const j = P();
    recordVia(j, { amount: '3000', timing: 'month' });
    const rj = ledger(j).active[0];
    check('J.month-only', 'J. "This month — day not known": ym 2026-10 and no date at all; shown "October · no day recorded"',
      [calls(j)[0], 'date' in rj, incomePart(j).rows[0][1], T(j, '[data-geode-month-detail-list="income"]').indexOf('12 Oct') < 0],
      [['record', { amount: 3000, ym: OCT }], false, '\u00a33,000 \u00b7 October \u00b7 no day recorded', true]);
    const k = P();
    recordVia(k, { amount: '3000', timing: 'day', date: '2026-10-05' });
    const rk = ledger(k).active[0];
    check('K.dated', 'K. "Another day" 5 Oct: date 2026-10-05; shown 5 Oct — the day received, never when it was recorded (12 Oct)',
      [rk.date, incomePart(k).rows[0][1], new Date(rk.recordedAt).getDate()], ['2026-10-05', '\u00a33,000 \u00b7 5 Oct', 12]);
    const sep = P();
    recordVia(sep, { amount: '900', timing: 'day', date: '2026-09-28' });
    check('K.past-month', 'P3-5E: an earlier month\'s day is not recorded (Beynd could not show it again): a message on the day, no writer call, the dialog open; the picker starts at 1 Oct',
      [calls(sep), errors(sep)[2], dialogOpen(sep), val(sep, 'document.getElementById("geode-ir-date").getAttribute("min")'), memList(sep)],
      [[], 'Choose a day in October. Beynd can only show this month\u2019s income records for now.', true, '2026-10-01', undefined]);
    const l = P();
    recordVia(l, { amount: '3000', timing: 'today', label: '  Salary ' });
    check('L.label', 'L. Label: display only — "Salary" titles the row, "£3,000 income recorded · 12 Oct"; the plan untouched',
      [ledger(l).active[0].label, incomePart(l).rows[0].slice(0, 2), val(l, 'S.income')], ['Salary', ['Salary', '\u00a33,000 income recorded \u00b7 12 Oct'], 3000]);
    const m = P();
    const long = 'Freelance-invoice-for-the-autumn-project';
    recordVia(m, { amount: '1200', timing: 'today', label: long });
    const mHtml = m.run('__host.innerHTML');
    check('M.long-label', 'M. A 40-character unbroken label is kept whole and wraps (overflow-wrap: anywhere); the actions name it',
      [long.length, incomePart(m).rows[0][0], /data-geode-month-income-receipt="1"[^>]*>\s*<div data-geode-css="min-width:0;overflow-wrap:anywhere">/.test(mHtml),
        val(m, 'document.querySelector(\'[data-geode-receipt-action="correct"]\').getAttribute("aria-label")')],
      [40, long, true, 'Correct: ' + long + ', \u00a31,200, 12 Oct']);
    const m2 = P();
    openRecord(m2);
    fill(m2, { amount: '100', timing: 'today' });
    m2.run('document.getElementById("geode-ir-label").value = ' + J('x'.repeat(41)) + ';');
    submit(m2);
    check('M.label-too-long', 'A 41-character label (past maxlength) is the writer\'s invalid_label: said beside the label, nothing saved',
      [errors(m2)[3], m2.run('document.getElementById("geode-ir-label").getAttribute("aria-invalid")'), dialogOpen(m2), memList(m2)],
      ['Keep the label to 40 characters or fewer.', 'true', true, undefined]);
  });

  scenario('VOIDS, CORRECTIONS AND REMOVAL — one writer call each; history kept', () => {
    const o = P({ incomeReceipts: [R('inc_a', 1000, { date: '2026-10-02' }), R('inc_b', 2000, { date: '2026-10-04' }), V('inc_v', 'inc_b')] });
    check('O.active-only', 'O. One active and one voided: only the active receipt is listed and counted', [incomeLine(o), incomePart(o).rows.map(r => r[1])],
      ['\u00a31,000 recorded as received this month. Add income', ['\u00a31,000 \u00b7 2 Oct']]);

    const p = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05', label: 'Salary' })] });
    reset(p);
    openOn(p, 'correct', 'inc_a');
    const pre = [p.run('document.getElementById("geode-ir-amount").value'), val(p, 'document.querySelector(\'input[name="geode-ir-when"]:checked\').getAttribute("value")'),
      p.run('document.getElementById("geode-ir-date").value'), p.run('document.getElementById("geode-ir-day").hidden'), p.run('document.getElementById("geode-ir-label").value'),
      T(p, '#geode-ir-submit'), T(p, '#geode-ir-title'), T(p, '[data-geode-ir-planned]')];
    check('P.prefilled', 'Correct opens on the receipt itself: £3,000, "Another day" 2026-10-05, "Salary"; "Save correction"; no planned amount offered',
      pre, ['3000', 'day', '2026-10-05', false, 'Salary', 'Save correction', 'Correct income record', '']);
    fill(p, { amount: '2900' });
    submit(p);
    const lp = ledger(p);
    check('P.amount', 'P. Correcting the amount: one correct call, one save; the original stays stored, retired by a void; the replacement is active',
      [calls(p).map(c => c[0]), saves(p), storedList(p).map(e => e.eventType), lp.active.map(r => [r.amount, r.date, r.label]), incomeLine(p)],
      [['correct'], 1, ['receipt', 'void', 'receipt'], [[2900, '2026-10-05', 'Salary']], '\u00a32,900 recorded as received this month. Add income']);

    const q = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05' })] });
    openOn(q, 'correct', 'inc_a');
    fill(q, { date: '2026-10-03' });
    submit(q);
    check('Q.date', 'Q. Correcting the day: 3 Oct', [ledger(q).active.map(r => r.date), incomePart(q).rows[0][1]], [['2026-10-03'], '\u00a33,000 \u00b7 3 Oct']);

    const r = P({ incomeReceipts: [R('inc_m', 3000)] });
    openOn(r, 'correct', 'inc_m');
    const mPre = [val(r, 'document.querySelector(\'input[name="geode-ir-when"]:checked\').getAttribute("value")'), r.run('document.getElementById("geode-ir-date").value')];
    fill(r, { timing: 'day', date: '2026-10-09' });
    submit(r);
    const r2 = P({ incomeReceipts: [R('inc_d', 3000, { date: '2026-10-05' })] });
    openOn(r2, 'correct', 'inc_d');
    fill(r2, { timing: 'month' });
    submit(r2);
    check('R.month-only', 'R. A month-only receipt opens as month-only (no date shown); it can gain a day; a dated one can become month-only (no date kept)',
      [mPre, ledger(r).active.map(x => x.date), ledger(r2).active.map(x => 'date' in x), incomePart(r2).rows[0][1]],
      [['month', ''], ['2026-10-09'], [false], '\u00a33,000 \u00b7 October \u00b7 no day recorded']);

    const s = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-01' })] });
    openOn(s, 'correct', 'inc_a');
    fill(s, { date: '2026-09-30' });
    submit(s);
    check('S.moves-month', 'S. P3-5E: correcting 1 Oct to 30 Sep is not saved (the receipt would leave the only month Beynd shows): a message on the day; no writer call; still 1 Oct',
      [calls(s).filter(c => c[0] === 'correct'), errors(s)[2], incomeLine(s), val(s, 'geodeIncomeReceiptLedger(S.incomeReceipts, "2026-09").month.total'), ledger(s).active.map(r => r.date)],
      [[], 'Choose a day in October. Beynd can only show this month\u2019s income records for now.', '\u00a33,000 recorded as received this month. Add income', null, ['2026-10-01']]);

    const same = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05' })] });
    reset(same);
    openOn(same, 'correct', 'inc_a');
    submit(same);
    check('P.unchanged', 'Saving a correction that changes nothing writes nothing and closes', [calls(same), saves(same), dialogOpen(same)], [[], 0, false]);

    const t = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05', label: 'Salary' })] });
    reset(t);
    openOn(t, 'remove', 'inc_a');
    const confirm = [T(t, '#geode-ir-title'), dialogText(t), calls(t)];
    check('T.confirm', 'Remove record asks first: "Remove this income record?", what it is, and that planned income won\'t change; "Keep record" / "Remove record"; nothing written yet',
      confirm, ['Remove this income record?', 'Remove this income record? Close Salary \u00b7 \u00a33,000 \u00b7 5 Oct This removes it from Beynd\u2019s recorded income. It won\u2019t change your planned income. Keep record Remove record', []]);
    click(t, '#geode-ir-remove');
    check('T.remove-last', 'T. Removing the last receipt: one void call, one save; the receipt stays stored, retired; none recorded again — no negative, no £0',
      [calls(t), saves(t), storedList(t).map(e => e.eventType), incomeLine(t), incomePart(t), /-\u00a3|\u2212|\u00a30\b/.test(pulseText(t)), toasts(t)],
      [[['void', 'inc_a']], 1, ['receipt', 'void'], NONE + ' Record income received', null, false, ['Income record removed.']]);
    const n = P({ incomeReceipts: [R('inc_a', 3000)] });
    openOn(n, 'remove', 'inc_a');
    click(n, '#geode-ir-remove');
    check('N.void-only', 'N. Voiding the only receipt (month-only): none recorded', [incomeLine(n), val(n, activeId())], [NONE + ' Record income received', []]);
    const u = P({ incomeReceipts: [R('inc_a', 1000, { date: '2026-10-02' }), R('inc_b', 2000, { date: '2026-10-04' })] });
    openOn(u, 'remove', 'inc_b');
    click(u, '#geode-ir-remove');
    check('U.remove-one', 'U. Removing one of several: the other stays; the total is the remaining evidence', [incomeLine(u), val(u, activeId())],
      ['\u00a31,000 recorded as received this month. Add income', ['inc_a']]);
    const keep = P({ incomeReceipts: [R('inc_a', 3000)] });
    reset(keep);
    openOn(keep, 'remove', 'inc_a');
    click(keep, '#geode-ir-keep');
    check('U.keep', '"Keep record" closes and changes nothing', [calls(keep), dialogOpen(keep), val(keep, activeId())], [[], false, ['inc_a']]);
  });

  scenario('DUPLICATE PROMPT — a check, never a refusal', () => {
    const v = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-12', label: 'Salary' })] });
    reset(v);
    recordVia(v, { amount: '3000', timing: 'today', label: 'Bonus' });
    const prompt = [T(v, '#geode-ir-duplicate'), calls(v), dialogOpen(v), val(v, 'document.getElementById("geode-ir-duplicate").getAttribute("role")')];
    check('V.prompt', 'Same amount on the same day (labels differ — they play no part): "You already recorded £3,000 for 12 Oct. Record another?", in words; no writer call yet',
      prompt, ['Possible duplicate You already recorded \u00a33,000 for 12 Oct. Record another? Cancel Record another', [], true, 'alert']);
    click(v, '#geode-ir-duplicate button');
    check('V.cancel', 'V. Cancel: the dialog closes, nothing recorded', [calls(v), dialogOpen(v), val(v, activeId())], [[], false, ['inc_a']]);
    const w = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-12' })] });
    reset(w);
    recordVia(w, { amount: '3000', timing: 'today' });
    click(w, '#geode-ir-duplicate [onclick="geodeIncomeReceiptSubmit(true)"]');
    check('W.record-another', 'W/I. "Record another": recorded once — two identical genuine receipts, both listed and counted',
      [calls(w).map(c => c[0]), val(w, activeId()).length, incomeLine(w), incomePart(w).rows.map(r => r[1])],
      [['record'], 2, '\u00a36,000 recorded as received this month. Add income', ['\u00a33,000 \u00b7 12 Oct', '\u00a33,000 \u00b7 12 Oct']]);
    const mo = P({ incomeReceipts: [R('inc_m', 3000)] });
    recordVia(mo, { amount: '3000', timing: 'month' });
    const moText = T(mo, '#geode-ir-duplicate');
    const dated = P({ incomeReceipts: [R('inc_m', 3000)] });
    reset(dated);
    recordVia(dated, { amount: '3000', timing: 'today' });
    const other = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-11' })] });
    reset(other);
    recordVia(other, { amount: '3000', timing: 'today' });
    check('V.matching', 'Month-only matches month-only in the same month only; a dated receipt never matches a month-only one; another day is no match',
      [moText, calls(dated).length, calls(other).length], ['Possible duplicate You already recorded \u00a33,000 for October (no day recorded). Record another? Cancel Record another', 1, 1]);
    const pure = P();
    const dup = (list, input) => pure.call('geodeIncomeReceiptLikelyDuplicate', [list, input]);
    check('V.rule', 'The rule alone: amount and day (or both month-only, amount and month); recordedAt and label never matter',
      [dup([R('a', 50, { date: '2026-10-01', recordedAt: 1 })], { amount: 50, ym: OCT, date: '2026-10-01', label: 'x' }) !== null,
        dup([R('a', 50, { date: '2026-10-01' })], { amount: 50.01, ym: OCT, date: '2026-10-01' }), dup([R('a', 50)], { amount: 50, ym: '2026-09' }),
        dup([R('a', 50, { date: '2026-10-01' })], { amount: 50, ym: OCT })], [true, null, null, null]);
  });

  scenario('INVALID INPUT AND FAILED WRITES — nothing optimistic', () => {
    const x = P();
    reset(x);
    openRecord(x);
    const tryAmount = a => { fill(x, { amount: a, timing: 'today' }); submit(x); return [errors(x)[0], x.run('document.getElementById("geode-ir-amount").getAttribute("aria-invalid")')]; };
    check('X.invalid-amount', 'X. Blank, text, £0, negative and three decimals: a plain message beside the amount (aria-invalid), nothing saved, the dialog open',
      [tryAmount(''), tryAmount('abc'), tryAmount('0'), tryAmount('-5'), tryAmount('10.005'), memList(x), dialogOpen(x)],
      [['Enter the amount you received.', 'true'], ['Enter the amount in numbers, like 2500 or 2500.50.', 'true'],
        ['Enter an amount more than zero, with no more than two decimal places.', 'true'], ['Enter an amount more than zero, with no more than two decimal places.', 'true'],
        ['Enter an amount more than zero, with no more than two decimal places.', 'true'], undefined, true]);
    check('X.accessible-error', 'The amount\'s error is tied to it (aria-describedby) and announced (role="alert"); focus is on the field to fix',
      [x.run('document.getElementById("geode-ir-amount").getAttribute("aria-describedby")'), val(x, 'document.querySelector(\'#geode-ir-amount-error [role="alert"]\') !== null'), x.run('__focusId()')],
      ['geode-ir-amount-error', true, 'geode-ir-amount']);
    fill(x, { amount: '\u00a32,500.50', timing: 'today' });
    submit(x);
    check('X.formatted', 'A typed "£2,500.50" is £2,500.50', [ledger(x).active.map(r => r.amount)], [[2500.5]]);
    const y = P();
    openRecord(y);
    fill(y, { amount: '100', timing: 'day', date: '2026-10-20' });
    submit(y);
    check('Y.future', 'Y. A later day (20 Oct, today the 12th): the writer\'s future_date, said beside the date; nothing saved',
      [errors(y)[2], memList(y), dialogOpen(y)], ['That day hasn\u2019t happened yet. Choose today or an earlier day.', undefined, true]);
    const y2 = P();
    openRecord(y2);
    fill(y2, { amount: '100', timing: 'day' });
    submit(y2);
    check('Y.no-day', '"Another day" without a day asks for it', [errors(y2)[2], memList(y2)], ['Choose the day you received it.', undefined]);

    const z = P();
    reset(z);
    openRecord(z);
    fill(z, { amount: '3000', timing: 'today' });
    z.run('__storageFault = "throw";');
    submit(z);
    check('Z.failed', 'Z. The write fails: no receipt in memory or storage; the dialog stays open saying nothing was saved; the Pulse still says none recorded; no success message',
      [calls(z).length, memList(z), JSON.parse(raw(z)).incomeReceipts, dialogOpen(z), errors(z)[4], incomeLine(z), val(z, '__acks')],
      [1, undefined, undefined, true, 'Nothing was saved. Please try again.', NONE + ' Record income received', []]);
    z.run('__storageFault = ""; _geodeWriteFailedTask = false;');

    const base = raw(P());
    const A = pageOver(base, '2026-10-12');
    const aa = pageOver(base, '2026-10-12');
    install(aa, src);
    A.run('S.lastSeenAt = Date.now(); persistGeodeToLocalStorage();');
    aa.run('__store = ' + J(raw(A)) + ';');
    reset(aa);
    recordVia(aa, { amount: '3000', timing: 'today' });
    check('AA.stale', 'AA. Another window wrote first: the writer is refused; the reload gate shows; the dialog says nothing was saved; no receipt; no success message',
      [calls(aa).length, aa.run('__staleGate') !== '', errors(aa)[4], memList(aa), raw(aa) === raw(A), val(aa, '__acks'), incomeLine(aa)],
      [1, true, 'Nothing was saved. Beynd changed in another tab or window \u2014 reload to continue.', undefined, true, [], NONE + ' Record income received']);

    const gone = P({ incomeReceipts: [R('inc_a', 3000)] });
    openOn(gone, 'correct', 'inc_a');
    gone.run('S.incomeReceipts.push(' + J(V('inc_v2', 'inc_a')) + '); save();');
    reset(gone);
    fill(gone, { amount: '2000' });
    submit(gone);
    check('AD.already', 'Correcting a receipt removed meanwhile: already_voided — nothing saved, said plainly', [calls(gone).length, errors(gone)[4], val(gone, activeId())],
      [1, 'This income record has already been changed or removed. Nothing was saved.', []]);
  });

  scenario('AUTHORITY — the plan, Monthly Left, P3-4, Still ahead and gaps never move', () => {
    const p = P();
    const before = figures(p);
    const shownBefore = changesShown(p);
    recordVia(p, { amount: '3000', timing: 'today', label: 'Salary' });
    const afterRecord = figures(p);
    const id = val(p, activeId())[0];
    openOn(p, 'correct', id);
    fill(p, { amount: '3100' });
    submit(p);
    const afterCorrect = figures(p);
    openOn(p, 'remove', val(p, activeId())[0]);
    click(p, '#geode-ir-remove');
    const afterRemove = figures(p);
    check('AC.record', 'AC. P3-4 after recording: the baseline, the changes and the "What changed" rows exactly as before', [afterRecord.changes, afterRecord.changeView, afterRecord.baseline, changesShown(p) === shownBefore],
      [before.changes, before.changeView, before.baseline, true]);
    check('AD.correct', 'AD. P3-4 after correcting: unchanged', [afterCorrect.changes, afterCorrect.changeView, afterCorrect.baseline], [before.changes, before.changeView, before.baseline]);
    check('AE.remove', 'AE. P3-4 after removing: unchanged', [afterRemove.changes, afterRemove.changeView, afterRemove.baseline], [before.changes, before.changeView, before.baseline]);
    check('AF.monthly-left', 'AF. Monthly Left, the plan, planned income and its type, and the plan remainder are the same after record, correct and remove',
      [afterRecord, afterCorrect, afterRemove].map(f => [f.monthlyLeft, f.plan, f.remainder, f.income, f.incomeType, f.payments]),
      Array(3).fill([before.monthlyLeft, before.plan, before.remainder, before.income, before.incomeType, before.payments]));
    check('AM.still-ahead', 'AM. No receipt is ever Still ahead; Still ahead says nothing about income', [afterRecord.ahead, before.ahead, /income/i.test(T(p, '[data-geode-month-detail-list="ahead"]'))],
      [before.ahead, before.ahead, false]);
    check('AN.gaps', 'AN/§43. No expectation gap and no activity log entry comes from receipts', [afterRemove.gaps, afterRemove.activity], [before.gaps, before.activity]);
    check('AF.cue', 'The Pulse\'s plan-change cue is the same before and after', T(p, '[data-geode-month-pulse-change="1"]'), 'Your plan remainder is \u00a3200 higher since the start of October.');
  });

  scenario('WORDING — stable and irregular; no outstanding, coverage or Available Now', () => {
    const ag = P({ income: 1600, incomeType: 'irregular', monthBaseline: undefined });
    recordVia(ag, { amount: '1000', timing: 'today' });
    check('AG.irregular', 'AG. Irregular: "£1,000 recorded as received this month."; "Planned income £1,600 · irregular" — no remaining, still expected or to come',
      [incomeLine(ag), incomePart(ag).note, BANNED.test(said(ag) + detailText(ag))], ['\u00a31,000 recorded as received this month. Add income', 'Planned income \u00a31,600 \u00b7 irregular', false]);
    const ah = P();
    recordVia(ah, { amount: '1234', timing: 'today' });
    check('AH.stable', 'AH. Stable: "Planned income £3,000" — no salary due, remaining salary or income outstanding', [incomePart(ah).note, BANNED.test(said(ah) + detailText(ah))], ['Planned income \u00a33,000', false]);
    const m = val(ah, 'geodeLivingMonthModel(S, new Date())');
    check('AJ.AK.model', 'AJ/AK. The model still has no outstanding or coverage figure (null)', [m.income.outstanding, m.available.receivedCoverage], [null, null]);
    openRecord(ah);
    check('AL.dialog', 'AL. The dialog says nothing of cash, available, spending or balances', BANNED.test(dialogText(ah)), false);
    check('W.happened', '§33. A receipt is never "recorded as completed": the detail lists it once, as income recorded', [/recorded as completed/.test(T(ah, '[data-geode-month-detail-list="income"]')),
      TS(ah, '[data-geode-month-detail-list="also"] li').length, (detailText(ah).match(/\u00a31,234/g) || []).length], [false, 0, 2]);
  });

  scenario('ORDERING, LONG FIGURES AND LAYOUT', () => {
    const at2 = P({ incomeReceipts: [R('inc_m1', 100, { recordedAt: at('2026-10-02', 9) }), R('inc_d9', 200, { date: '2026-10-09', recordedAt: at('2026-10-03', 9) }),
      R('inc_d3', 300, { date: '2026-10-03', recordedAt: at('2026-10-10', 9) }), R('inc_m2', 400, { recordedAt: at('2026-10-04', 9) })] });
    check('AT.ordering', 'AT. Dated receipts by the day received (not when recorded), then month-only ones with no day invented',
      incomePart(at2).rows.map(r => r[1]), ['\u00a3300 \u00b7 3 Oct', '\u00a3200 \u00b7 9 Oct', '\u00a3100 \u00b7 October \u00b7 no day recorded', '\u00a3400 \u00b7 October \u00b7 no day recorded']);
    const as = P();
    openRecord(as);
    fill(as, { amount: '1234567.89' });
    const label = T(as, '#geode-ir-submit');
    fill(as, { timing: 'today' });
    submit(as);
    check('AS.long-currency', 'AS. £1,234,567.89: exact in the confirm button and the Pulse; the line wraps (overflow-wrap: anywhere)',
      [label, incomeLine(as), /data-geode-month-pulse-income="1" data-geode-css="[^"]*overflow-wrap:anywhere/.test(as.run('__host.innerHTML'))],
      ['Record \u00a31,234,567.89 received', '\u00a31,234,567.89 recorded as received this month. Add income', true]);
    const lay = P({ incomeReceipts: [R('inc_a', 3000, { label: 'Salary' })] });
    const pulseHtml = lay.run('__host.innerHTML');
    const part = pulseHtml.slice(pulseHtml.indexOf('data-geode-month-detail-list="income"'), pulseHtml.indexOf('</ul>', pulseHtml.indexOf('data-geode-month-detail-list="income"')));
    openRecord(lay);
    const formHtml = lay.run('__dialog().innerHTML');
    const widths = h => (h.match(/(?<![-\w])width:\d+px/g) || []);
    const responsive = [/display:flex;flex-wrap:wrap;gap:6px/.test(part), /white-space:nowrap/.test(part + formHtml), widths(part), widths(formHtml),
      /min-height:32px/.test(part), (formHtml.match(/min-width:\d+px/g) || []).length];
    check('AO.390', 'AO. 390px: receipt rows and their actions wrap (flex-wrap), nothing is nowrap, no fixed width besides the 18px radios; actions keep a 32px touch height',
      responsive, [true, false, [], ['width:18px', 'width:18px', 'width:18px'], true, 0]);
    check('AP.820', 'AP. 820px: the dialog is the existing sheet (max-width 430px, centred) — no new layout; text containers wrap', [/overflow-wrap:anywhere/.test(formHtml), lay.run('__dialog().firstElementChild.className')],
      [true, 'mo']);
    check('AQ.1280', 'AQ. 1280px: the Income part stays inside the Pulse card\'s disclosure (no new page, card or route)',
      [val(lay, 'document.querySelectorAll(\'[data-geode-month-detail="1"] [data-geode-month-detail-list="income"]\').length'), val(lay, 'document.querySelectorAll("section").length')], [1, 1]);
  });

  scenario('KEYBOARD AND FOCUS', () => {
    const p = P({ incomeReceipts: [R('inc_a', 3000, { date: '2026-10-05' })] });
    openRecord(p);
    const dialog = [p.run('__focusId()'), val(p, '__dialog().firstElementChild.getAttribute("role")'), val(p, '__dialog().firstElementChild.getAttribute("aria-modal")'),
      val(p, '__dialog().firstElementChild.getAttribute("aria-labelledby")'), T(p, '#geode-ir-title'), T(p, 'legend'), TS(p, 'label[for]').length];
    check('AR.open', 'AR. Opening moves focus to the amount; the sheet is a modal dialog named by its title; the timing choice is a fieldset with a legend; every field has a label',
      dialog, ['geode-ir-amount', 'dialog', 'true', 'geode-ir-title', 'Record income received', 'When did you receive it?', 3]);
    p.run('__fire(document.activeElement, "keydown", { key: "Escape" }); __runTimers();');
    check('AR.escape', 'Escape closes it and focus returns to the Pulse\'s income action', [dialogOpen(p), p.run('__focusId()')], [false, 'add']);
    openOn(p, 'correct', 'inc_a');
    click(p, '#modal [aria-label="Close"]');
    check('AR.return', 'Closing a correction returns focus to that receipt\'s Correct button', p.run('__focusId()'), 'correct:inc_a');
    openOn(p, 'correct', 'inc_a');
    p.run('__fire(__dialog(), "click"); __runTimers();');
    check('AR.backdrop', 'A backdrop click closes it and also returns focus', [dialogOpen(p), p.run('__focusId()')], [false, 'correct:inc_a']);
    openOn(p, 'remove', 'inc_a');
    const removeFocus = p.run('__focusId()');
    click(p, '#geode-ir-remove');
    check('AR.remove', 'Remove opens on "Keep record"; after removal focus goes to the Pulse\'s income action (the row is gone)', [removeFocus, p.run('__focusId()')], ['geode-ir-keep', 'record']);
    openRecord(p);
    p.run('document.getElementById("geode-ir-submit").parentNode.querySelectorAll("button").slice(-1)[0].focus();');
    p.run('__fire(document.activeElement, "keydown", { key: "Tab" });');
    check('AR.trap', 'Tab from the last control (Cancel) wraps to the first, the Close button: focus stays in the dialog',
      [val(p, 'document.activeElement.className'), val(p, 'document.activeElement.getAttribute("aria-label")')], ['mo-close', 'Close']);
    check('AR.explicit', 'Every action is a native button with words — Correct and Remove record are never icon-only', [TS(p, '#modal button').filter(t => !t).length,
      p.run('document.querySelector(\'[data-geode-income-action]\').tagName')], [0, 'BUTTON']);
  });

  return results;
}

// ───────────────────────────── static ─────────────────────────────

function staticChecks(src) {
  const results = [];
  const check = (id, text, actual, expected) => {
    const ok = J(actual) === J(expected);
    results.push({ group: 'STATIC — wording and wiring of the receipt experience', id, text, ok, detail: ok ? '' : 'expected ' + J(expected) + ', observed ' + J(actual) });
  };
  const fnText = n => cm.extractFunction(src, n).text;
  const strings = t => (t.match(/'(?:\\.|[^'\\\n])*'/g) || []).map(s => s.slice(1, -1).replace(/\\u2019/g, '\u2019').replace(/\\u00b7/g, '\u00b7').replace(/\\u2014/g, '\u2014'));
  const detail = fnText('geodeMonthDetailHtml');
  const receiptPart = detail.slice(detail.indexOf('function receiptButton('), detail.indexOf('if (d.done.length || d.also.length || d.ahead.length) {'));
  const pulse = fnText('geodeMonthPulseHtml');
  const pulsePart = pulse.slice(pulse.indexOf('var incomeText ='), pulse.indexOf("return h + '</section>';"));
  const userText = UX_FNS.map(fnText).concat([receiptPart, pulsePart]).map(strings).flat().filter(s => !/^[\w-]+$|^[#\[.]|data-geode|<|geode[A-Z]/.test(s));
  check('static.wording', '§44/§9: no receipt text claims cash, availability, a balance, a deposit or bank confirmation, an amount remaining, outstanding or due, or £0 received',
    userText.filter(s => BANNED.test(s) || /salary due|paid into your account|deposit confirmed/i.test(s)), []);
  check('static.no-void-word', '§25: the user never sees the word "void"', userText.filter(s => /\bvoid/i.test(s)), []);
  check('static.labels', 'The actions say what they do: Record income received, Add income, Correct, Remove record, Save correction, Record another, Keep record',
    ['Record income received', 'Add income', 'Correct', 'Remove record', 'Save correction', 'Record another', 'Keep record', 'Use planned amount \\u00b7 ']
      .map(w => ["'" + w + "'", '>' + w + '<', "'" + w].some(s => src.indexOf(s) >= 0)),
    Array(8).fill(true));
  const others = ['geodeQuickSetup', 'geodeOnboard', 'geodeSmartImport', 'geodeRealityCheck', 'openIncModal', 'saveInc'];
  check('static.surfaces', '§48–50: the experience names no onboarding, Quick Setup, Smart Import, Reality Check or income-plan form; and none of them names it',
    [UX_FNS.filter(n => others.some(o => fnText(n).indexOf(o) >= 0)),
      src.split('\nfunction ').filter(f => others.some(o => f.indexOf(o) === 0)).filter(f => /geodeIncomeReceipt|geodeMonthIncomeView/.test(f.slice(0, f.indexOf('\n}')))).length], [[], 0]);
  return results;
}

// ───────────────────────────── mutants ─────────────────────────────

const MUTANTS = {
  'prefill amount from the plan': [["amount: '', timing: '', date: '', label: '', monthYm", "amount: String(model.income.planned), timing: '', date: '', label: '', monthYm"]],
  'Today selected on open': [["amount: '', timing: '', date: '', label: '', monthYm", "amount: '', timing: 'today', date: '', label: '', monthYm"]],
  'no choice becomes month-only': [["  else return { field: 'when', message: 'Choose when you received it.' };", '  else input = { amount: amount, ym: ctx.monthYm };']],
  'no evidence rendered as £0': [["incomeText = (view.incomeType === 'irregular' ? 'Planned income can vary. ' : '') + 'Income received hasn\\u2019t been recorded this month.';",
    "incomeText = fmExact(0) + ' received this month.';"]],
  'receipt changes the plan': [["    if (m) m.setAttribute('data-geode-commit', '1');\n    closeModal();", "    if (m) m.setAttribute('data-geode-commit', '1');\n    S.income = 9999; save();\n    closeModal();"]],
  'UI appends the receipt itself': [['geodeRecordIncomeReceipt(built.input);',
    "(S.incomeReceipts = (Array.isArray(S.incomeReceipts) ? S.incomeReceipts : []).concat([Object.assign({ id: 'inc_ui', eventType: 'receipt' }, built.input, { recordedAt: Date.now(), source: 'manual' })]), save(), { status: 'saved' });"]],
  'remove deletes the event': [['geodeIncomeReceiptAfterWrite(geodeVoidIncomeReceipt(ctx.id),',
    'geodeIncomeReceiptAfterWrite((S.incomeReceipts = S.incomeReceipts.filter(function (r) { return r.id !== ctx.id; }), save(), { status: \'saved\' }),']],
  'correct makes two saves': [['geodeCorrectIncomeReceipt(ctx.id, built.input)', '(geodeVoidIncomeReceipt(ctx.id), geodeRecordIncomeReceipt(built.input))']],
  'duplicate prompt refuses': [["if (ctx.mode === 'record' && confirmed !== true) {", "if (ctx.mode === 'record') {"]],
  'month-only gets a date': [['  } else if (form.timing === \'month\') input = { amount: amount, ym: ctx.monthYm };', '  } else if (form.timing === \'month\') input = { amount: amount, ym: ctx.monthYm, date: ctx.today };']],
  'recordedAt shown as the day received': [['return { id: e.id, amount: e.amount, date: e.eventDate || null, label: e.label || null, i: i };',
    'return { id: e.id, amount: e.amount, date: geodeDateToLocalISO(new Date(e.recordedAt)), label: e.label || null, i: i };']],
  'irregular shows an amount remaining': [["(d.income.irregular ? ' \\u00b7 irregular' : '')", "(d.income.irregular ? ' \\u00b7 ' + fmExact(d.income.planned - d.income.received) + ' remaining' : '')"]],
  'plan-change toast after saving': [['    geodeSuccessToast(savedText);', "    geodeSuccessToast(savedText);\n    toast('Your plan changed: Monthly Left is higher.');"]],
  'unreadable store opens the dialog and repairs': [["model.income && model.income.state !== 'unavailable' ? model : null;", 'model.income ? model : null;'],
    ["  geodeIncomeReceiptShowError({ field: 'message', message: geodeIncomeReceiptOutcomeMessage(status) });\n  render();",
      "  if (status === 'unavailable') { S.incomeReceipts = []; save(); }\n  geodeIncomeReceiptShowError({ field: 'message', message: geodeIncomeReceiptOutcomeMessage(status) });\n  render();"],
    ["} else if (view.incomeState === 'none_recorded') {", "} else if (view.incomeState === 'none_recorded' || view.incomeState === 'unavailable') {"]],
  'receipts listed as completed payments': [["return e && e.type !== 'income_recorded' && !cited[", 'return e && !cited[']],
  'available wording': [["incomeText = fmExact(view.incomeReceived) + ' recorded as received this month.';", "incomeText = fmExact(view.incomeReceived) + ' received \\u2014 available to spend this month.';"]],
  'failed write closes as saved': [["  if (status === 'saved') {\n    var m", "  if (status === 'saved' || status === 'failed') {\n    var m"]],
  'focus not returned': [['      if (el && el.focus) el.focus();\n    } catch (_eIrF) {}', '    } catch (_eIrF) {}']]
};

function main() {
  const results = checksFor(SRC).concat(staticChecks(SRC));
  Object.keys(MUTANTS).forEach(name => {
    let src = SRC;
    MUTANTS[name].forEach(([from, to]) => {
      if (SRC.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html: ' + name + ' — ' + from);
      src = src.replace(from, () => to);
    });
    let caught;
    let by = [];
    try {
      const r = checksFor(src).concat(staticChecks(src));
      by = r.filter(x => !x.ok).map(x => x.id);
      caught = by.length > 0;
    } catch (e) {
      caught = true;
      by = ['threw'];
    }
    results.push({ group: 'MUTANTS — each defect of the experience is caught', id: 'mutant.' + name.replace(/\s+/g, '-'), text: 'Caught: ' + name + (caught ? ' (by ' + [...new Set(by)].slice(0, 5).join(', ') + ')' : ''),
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

if (require.main === module) main();
else {
  module.exports = { SRC, OCT, GBP, BASELINE, R, V, NONE, BANNED, UX_FNS, page, install, val, T, TS, click, incomeLine, pulseText, dialogOpen, dialogText,
    calls, saves, reset, toasts, ledger, storedList, memList, incomePart, detailText, figures, openRecord, fill, submit, recordVia, openOn, errors, activeId };
}
