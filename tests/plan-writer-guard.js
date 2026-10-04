#!/usr/bin/env node
'use strict';
/**
 * Beynd plan-writer guard (P3-4B) — dependency-free: node tests/plan-writer-guard.js
 *
 * A plan writer changes what Monthly Left is computed from: S.income, the S.payments or S.expenses arrays, or a field
 * that decides whether and how much a payment or expense row counts this month (PLAN_FIELDS). Over index.html's inline
 * scripts, statically:
 *   - every write of that shape is found, and its target traced inside its function to the state (S), a parameter, or
 *     a fresh local object (literal, DOM node, deep copy); only fresh local objects are not plan writes;
 *   - every plan writer is admitted: geodePrepareFinancialMutation() or geodeModalCommitBegin() is checked before its
 *     first plan write, or every function that reaches it is admitted before the call; a writer reached from markup,
 *     a string handler, top-level code or as a value must admit itself;
 *   - the only other writers are EXCEPTIONS, each with its class, its reason and checks that keep the reason true;
 *   - the Payments render neither merges nor saves; the legacy same-month merge runs only inside the payment save;
 *   - the bank estimate admits after its confirm and before its first change;
 *   - inline handlers and the pure modules write no plan state;
 *   - mutants that add an unadmitted plan write of each shape are caught.
 * Exit code 0 when every check passes, 1 otherwise.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n');
const INDEX = read('index.html');
const PURE = fs.readdirSync(path.join(ROOT, 'js/geode-pure')).filter(f => f.endsWith('.js')).sort()
  .map(f => ({ file: f, text: read('js/geode-pure/' + f) }));

/** Row fields read by paymentCountsForMonthlyOutflow, geodePaymentMonthAmount and sumExpensesMonthly (and the model's kinds). */
const PLAN_FIELDS = ['amount', 'status', 'date', 'dueDate', 'rec', 'lastPaidAmount', 'lastPaidYM', 'goalId', 'investId', 'debtId',
  'type', 'expired', '_archived', '_isStale'];
const PLAN_KEYS = ['income', 'payments', 'expenses'];
const ADMIT = /!\s*(?:geodePrepareFinancialMutation|geodeModalCommitBegin)\s*\(\s*\)/;

/**
 * Writers allowed without admission. Each names its class (B boundary recurrence, C load / migration, D new-plan
 * construction, F dead code, L a local object the scanner cannot trace through a parameter or global), why it cannot
 * move a figure outside an action, and the callees whose writes it owns. The checks in EXCEPTION PROOFS keep each
 * reason true.
 */
const EXCEPTIONS = {
  syncRecurringPayments: { cls: 'B', covers: ['rollupRecurringPaymentDueDates', 'rollupRecurringExpenseDueDates'],
    why: 'The month-boundary roll. geodePrepareFinancialMutation runs it, and stores it, before an action opens; outside an action it only rolls rows whose occurrence has passed.' },
  geodeArchiveExpiredOneOffExpenses: { cls: 'B', covers: [],
    why: 'Removes only one-off expenses dated before this month, which sumExpensesMonthly already skips by the same predicate: no figure changes.' },
  load: { cls: 'C', covers: ['migratePaymentFlowFields'],
    why: 'Rebuilds S from storage at load, before any action can exist; migration normalises stored fields.' },
  geodeSchema2Transition: { cls: 'C', covers: [],
    why: 'The schema-2 transition at load; on a failed transition it restores the rows it read (S.payments = back.payments).' },
  ob3Finish: { cls: 'D', covers: [],
    why: 'First-run onboarding: builds a new plan before the app launches. Only the first-run page (shown at boot while hasOnboarded is not true) calls it, and nothing sets hasOnboarded back to false.' },
  geodeQuickSetupFinish: { cls: 'F', covers: [],
    why: 'Dead: nothing references it. Wiring it up fails this guard until it admits.' },
  geodePresentationParityBridgePostAdaptiveRows: { cls: 'L', covers: [],
    why: 'Not a plan object: writes .amount on a geodeAdaptiveParityDeepClone copy of a suggested action, for the parity harness only.' },
  geodeK71TransformNudgeInPlace: { cls: 'L', covers: [],
    why: 'Not a plan object: writes .type on a Home nudge from geodeHighlightFullRankedCache, which holds only cloneHighlightNudge copies.' }
};

// ───────────────────────────── source model ─────────────────────────────

const TOKEN = /((?<=(?:^|[=(,:[!&|?{};]|\breturn)\s*)\/(?![*/])(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*)|(\/\*[\s\S]*?\*\/)|(\/\/[^\n]*)|('(?:\\.|[^'\\\n])*')|("(?:\\.|[^"\\\n])*")|(`(?:\\.|[^`\\])*`)/gm;
const blank = s => s.replace(/[^\n]/g, ' ');
const KEY_RE = new RegExp('\\[\\s*([\'"])(' + PLAN_KEYS.concat(PLAN_FIELDS).join('|') + ')\\1\\s*\\]', 'g');
const IDENT = /[\w$]/;

/**
 * The page source as two same-length texts: `code` keeps only inline-script code (strings, regexes and comments
 * blanked to their delimiters; markup blanked), `noComments` keeps strings and markup (comments blanked). A bracketed
 * plan key (S['income']) is rewritten to its dotted form first.
 */
function model(src) {
  let code = '';
  let noComments = '';
  let at = 0;
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + m[0].indexOf('>') + 1;
    const html = src.slice(at, start).replace(/<!--[\s\S]*?-->/g, blank);
    code += blank(html);
    noComments += html;
    const body = m[1].replace(KEY_RE, (t, q, k) => ('.' + k).padEnd(t.length, ' '));
    code += body.replace(TOKEN, (t, rx, block, line) => block || line ? blank(t) : t[0] + blank(t.slice(1, -1)) + t[t.length - 1]);
    noComments += body.replace(TOKEN, (t, rx, block, line) => block || line ? blank(t) : t);
    at = start + m[1].length;
  }
  const tail = src.slice(at).replace(/<!--[\s\S]*?-->/g, blank);
  code += blank(tail);
  noComments += tail;

  const defs = [];
  const fnRe = /\nfunction ([A-Za-z_$][\w$]*)\s*\(([^)]*)\)/g;
  while ((m = fnRe.exec(code))) {
    const start = m.index + 1;
    const eol = code.indexOf('\n', start);
    const firstLine = code.slice(start, eol < 0 ? code.length : eol);
    const opens = (firstLine.match(/\{/g) || []).length;
    const closes = (firstLine.match(/\}/g) || []).length;
    const end = opens > 0 && opens === closes && /\}\s*$/.test(firstLine) ? start + firstLine.length : code.indexOf('\n}', start) + 2;
    defs.push({ name: m[1], start, end, params: m[2].split(',').map(s => s.trim()).filter(Boolean), code: code.slice(start, end) });
  }
  const ownerAt = i => {
    let lo = 0;
    let hi = defs.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (defs[mid].end <= i) lo = mid + 1;
      else if (defs[mid].start > i) hi = mid - 1;
      else return defs[mid];
    }
    return null;
  };
  return { src, code, noComments, defs, ownerAt, lineOf: i => src.slice(0, i).split('\n').length };
}

/** Index of the bracket matching the one at i, scanning in direction dir (−1 left, +1 right). */
function matchBracket(text, i, dir) {
  const open = text[i];
  const pairs = { ')': '(', ']': '[', '}': '{', '(': ')', '[': ']', '{': '}' };
  const close = pairs[open];
  let depth = 0;
  for (let k = i; k >= 0 && k < text.length; k += dir) {
    if (text[k] === open) depth++;
    else if (text[k] === close && --depth === 0) return k;
  }
  return -1;
}

/** The member chain ending just before position i (an identifier root, a call, or a parenthesised group). */
function chainBefore(code, i) {
  let j = i;
  let call = false;
  for (;;) {
    let k = j - 1;
    while (k >= 0 && /\s/.test(code[k])) k--;
    if (k < 0) return null;
    const c = code[k];
    if (c === ']') { j = matchBracket(code, k, -1); if (j < 0) return null; continue; }
    if (c === ')') {
      const open = matchBracket(code, k, -1);
      if (open < 0) return null;
      let p = open - 1;
      while (p >= 0 && /\s/.test(code[p])) p--;
      if (p >= 0 && (IDENT.test(code[p]) || code[p] === ']' || code[p] === ')')) { call = true; j = open; continue; }
      return { root: null, group: code.slice(open + 1, k), call, text: code.slice(open, i) };
    }
    if (IDENT.test(c)) {
      let s = k;
      while (s > 0 && IDENT.test(code[s - 1])) s--;
      let p = s - 1;
      while (p >= 0 && /\s/.test(code[p])) p--;
      if (p >= 0 && code[p] === '.' && code[p - 1] !== '.') { j = p; continue; }
      let root = code.slice(s, k + 1);
      const text = code.slice(s, i).replace(/\s+/g, '');
      if (root === 'window' && /^window\.S(?![\w$])/.test(text)) root = 'S';
      return { root, group: null, call, text };
    }
    return null;
  }
}

/** The expression starting at i, up to the end of its statement or argument. */
function exprAfter(code, i) {
  let k = i;
  while (k < code.length) {
    const c = code[k];
    if (c === '(' || c === '[' || c === '{') { const e = matchBracket(code, k, 1); if (e < 0) break; k = e + 1; continue; }
    if (c === ';' || c === ',' || c === ')' || c === ']' || c === '}' || c === '\n') break;
    k++;
  }
  return code.slice(i, k);
}

/** Top-level alternatives of an expression: a || b, a && b, c ? a : b, a ?? b. */
function alternatives(expr) {
  const out = [];
  let depth = 0;
  let last = 0;
  for (let k = 0; k < expr.length; k++) {
    const c = expr[k];
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (depth === 0 && ((c === '|' && expr[k + 1] === '|') || (c === '&' && expr[k + 1] === '&') || (c === '?' && expr[k + 1] === '?'))) {
      out.push(expr.slice(last, k)); last = k + 2; k++;
    } else if (depth === 0 && (c === '?' || c === ':')) { out.push(expr.slice(last, k)); last = k + 1; }
  }
  out.push(expr.slice(last));
  return out.map(s => s.trim()).filter(Boolean);
}

const RANK = { LOCAL: 0, PARAM: 1, UNKNOWN: 2, PLAN: 3 };
const worst = list => list.reduce((a, b) => (RANK[b] > RANK[a] ? b : a), 'LOCAL');
/** Values that are fresh objects or primitives: never a plan object. */
const FRESH = /^(?:\{|new\s|document\s*\.|Object\s*\.\s*(?:assign\s*\(\s*\{|create\s*\(|keys\s*\()|JSON\s*\.\s*parse\s*\(|geodeCloneStateForUiCalc\s*\(|String\s*\(|Number\s*\(|Boolean\s*\(|toNum\s*\(|parseFloat\s*\(|parseInt\s*\(|Math\s*\.|Date\s*\.|['"`]|-?\.?\d|null\b|undefined\b|true\b|false\b|NaN\b|Infinity\b|function\b|typeof\b|void\b|!|~|(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>)/;
/** Methods whose result shares the receiver's elements. */
const SHARING = new Set(['slice', 'filter', 'concat', 'map', 'find', 'findLast', 'sort', 'reverse', 'flat', 'splice', 'pop', 'shift', 'at']);
const ITERATORS = new Set(['forEach', 'map', 'filter', 'some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'flatMap', 'reduce', 'reduceRight', 'sort']);

/** Where a value comes from, inside one function: PLAN (the state or its rows), PARAM, UNKNOWN (treated as plan) or LOCAL. */
function classifyExpr(fn, expr, depth) {
  return worst(alternatives(expr).map(part => {
    if (FRESH.test(part)) return 'LOCAL';
    if (part[0] === '[') return /(?<![\w$.])S(?![\w$])/.test(part) ? 'PLAN' : 'LOCAL';
    if (part[0] === '(') {
      const e = matchBracket(part, 0, 1);
      if (e < 0) return 'UNKNOWN';
      const inner = classifyExpr(fn, part.slice(1, e), depth);
      const rest = part.slice(e + 1).trim();
      return rest && /^\.\s*[A-Za-z_$][\w$]*\s*\(/.test(rest) && !SHARING.has(rest.match(/^\.\s*([A-Za-z_$][\w$]*)/)[1]) ? 'LOCAL' : inner;
    }
    const m = part.match(/^([A-Za-z_$][\w$]*)/);
    if (!m) return 'LOCAL';
    const rest = part.slice(m[1].length);
    const calls = [];
    const callRe = /\.\s*([A-Za-z_$][\w$]*)\s*\(|^\s*\(/g;
    let c;
    while ((c = callRe.exec(rest))) calls.push(c[1] || '()');
    if (calls[0] === '()') return 'UNKNOWN';
    if (calls.length && calls.some(n => !SHARING.has(n))) return 'LOCAL';
    if (m[1] === 'S' || (m[1] === 'window' && /^\.\s*S(?![\w$])/.test(rest))) return 'PLAN';
    return provenance(fn, m[1], depth + 1);
  }));
}

/** Provenance of a name inside one function, from its parameters, callback parameters, loops and assignments. */
function provenance(fn, name, depth) {
  if (name === 'S') return 'PLAN';
  if (name === 'document' || name === 'Math' || name === 'JSON' || name === 'console') return 'LOCAL';
  fn.memo = fn.memo || new Map();
  if (fn.memo.has(name)) return fn.memo.get(name);
  if (depth > 8) return 'UNKNOWN';
  fn.memo.set(name, 'UNKNOWN');
  const code = fn.code;
  const sources = [];
  const esc = name.replace(/\$/g, '\\$');
  if (fn.params.includes(name)) sources.push('PARAM');
  const fnExpr = /function\s*([A-Za-z_$][\w$]*)?\s*\(([^)]*)\)/g;
  const arrow = /(?:\(([^()]*)\)|(?<![\w$.])([A-Za-z_$][\w$]*))\s*=>/g;
  const lists = [];
  let m;
  while ((m = fnExpr.exec(code))) if (m.index > 0) lists.push([m.index, m[2]]);
  while ((m = arrow.exec(code))) lists.push([m.index, m[1] != null ? m[1] : m[2]]);
  lists.forEach(([idx, raw]) => {
    const params = raw.split(',').map(s => s.trim());
    const pos = params.indexOf(name);
    if (pos < 0) return;
    const before = code.slice(0, idx).match(/\.\s*([A-Za-z_$][\w$]*)\s*\(\s*$/);
    if (before && ITERATORS.has(before[1])) {
      const element = /^reduce/.test(before[1]) ? pos === 1 : before[1] === 'sort' ? pos <= 1 : pos === 0;
      if (!element) { sources.push('LOCAL'); return; }
      const dot = idx - before[0].length;
      const recv = chainBefore(code, dot);
      if (!recv) sources.push('UNKNOWN');
      else if (recv.group != null) sources.push(classifyExpr(fn, recv.group, depth));
      else sources.push(classifyExpr(fn, recv.text, depth));
    } else {
      sources.push('PARAM');
    }
  });
  if (new RegExp('catch\\s*\\(\\s*' + esc + '\\s*\\)').test(code)) sources.push('LOCAL');
  const loop = new RegExp('for\\s*\\(\\s*(?:var|let|const)?\\s*' + esc + '\\s+(of|in)\\s+', 'g');
  while ((m = loop.exec(code))) sources.push(m[1] === 'in' ? 'LOCAL' : classifyExpr(fn, exprAfter(code, m.index + m[0].length), depth));
  const assign = new RegExp('(?<![\\w$.])' + esc + '\\s*=(?![=>])', 'g');
  while ((m = assign.exec(code))) sources.push(classifyExpr(fn, exprAfter(code, m.index + m[0].length).trim(), depth));
  const result = sources.length ? worst(sources) : 'UNKNOWN';
  fn.memo.set(name, result);
  return result;
}

const ASSIGN = '\\s*(?:\\*\\*|<<|>>>?|[-+*/%&|^]|\\|\\||&&|\\?\\?)?=(?!=)';
const W_KEY = new RegExp('\\.\\s*(' + PLAN_KEYS.join('|') + ')(?![\\w$])(?=' + ASSIGN + '|\\s*\\[[^\\]\\n]*\\]' + ASSIGN +
  '|\\s*\\.\\s*(?:push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin)\\s*\\(|\\s*\\.\\s*length' + ASSIGN + ')', 'g');
const W_FIELD = new RegExp('\\.\\s*(' + PLAN_FIELDS.join('|') + ')(?![\\w$])(?=' + ASSIGN + '|\\s*(?:\\+\\+|--))', 'g');
const W_DELETE = /(?<![\w$.])delete\s+/g;
const W_ASSIGN_OBJ = /(?<![\w$.])Object\s*\.\s*(?:assign|defineProperty|defineProperties)\s*\(\s*/g;

/** Every plan-shaped write in the inline scripts: [{ owner, at, kind, text, prov }]. */
function writeSites(M) {
  const sites = [];
  const add = (at, kind, chain) => {
    if (!chain) return;
    const owner = M.ownerAt(at);
    const fn = owner || { code: '', params: [], name: '(top level)' };
    let prov;
    if (chain.call) prov = 'UNKNOWN';
    else if (chain.group != null) prov = classifyExpr(fn, chain.group, 0);
    else prov = provenance(fn, chain.root, 0);
    sites.push({ owner: owner ? owner.name : '(top level)', def: owner, at, kind, text: chain.text, prov });
  };
  let m;
  W_KEY.lastIndex = 0;
  while ((m = W_KEY.exec(M.code))) {
    const chain = chainBefore(M.code, m.index);
    if (chain && (chain.group != null || /^(?:window\.)?[A-Za-z_$][\w$]*$/.test(chain.text))) add(m.index, m[1], chain);
  }
  W_FIELD.lastIndex = 0;
  while ((m = W_FIELD.exec(M.code))) add(m.index, '.' + m[1], chainBefore(M.code, m.index));
  W_DELETE.lastIndex = 0;
  while ((m = W_DELETE.exec(M.code))) {
    const operand = exprAfter(M.code, m.index + m[0].length).trim();
    const hit = operand.match(new RegExp('\\.\\s*(' + PLAN_FIELDS.concat(PLAN_KEYS).join('|') + ')\\s*$|\\.\\s*(?:payments|expenses)\\s*\\[[^\\]]*\\]\\s*$'));
    if (!hit) continue;
    const start = m.index + m[0].length;
    const dot = start + operand.lastIndexOf(hit[0]);
    add(m.index, 'delete', chainBefore(M.code, dot));
  }
  W_ASSIGN_OBJ.lastIndex = 0;
  while ((m = W_ASSIGN_OBJ.exec(M.code))) {
    const first = exprAfter(M.code, m.index + m[0].length).trim();
    const fn = M.ownerAt(m.index) || { code: '', params: [], name: '(top level)' };
    if (!first || FRESH.test(first)) continue;
    const prov = classifyExpr(fn, first, 0);
    sites.push({ owner: fn.name, def: M.ownerAt(m.index), at: m.index, kind: 'Object.assign', text: first, prov });
  }
  return sites;
}

/** For every top-level function name: code callers (with the first call offset), and whether it is entered otherwise. */
function references(M, names) {
  const want = new Set(names);
  const refs = new Map(names.map(n => [n, { callers: new Map(), entry: [] }]));
  const tok = /(?<![\w$.])([A-Za-z_$][\w$]*)/g;
  let m;
  while ((m = tok.exec(M.code))) {
    const n = m[1];
    if (!want.has(n)) continue;
    const before = M.code.slice(Math.max(0, m.index - 12), m.index);
    if (/function\s+$/.test(before)) continue;
    const after = M.code.slice(m.index + n.length, m.index + n.length + 4);
    const owner = M.ownerAt(m.index);
    const r = refs.get(n);
    if (!/^\s*\(/.test(after)) { r.entry.push('value reference in ' + (owner ? owner.name : 'top level') + ' (line ' + M.lineOf(m.index) + ')'); continue; }
    if (!owner) { r.entry.push('top-level call (line ' + M.lineOf(m.index) + ')'); continue; }
    if (owner.name === n) continue;
    const prev = r.callers.get(owner);
    if (prev == null || m.index - owner.start < prev) r.callers.set(owner, m.index - owner.start);
  }
  const strRe = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = strRe.exec(M.noComments))) {
    if (!want.has(m[1]) || M.code[m.index] === m[1][0]) continue;
    refs.get(m[1]).entry.push('markup or string handler (line ' + M.lineOf(m.index) + ')');
  }
  return refs;
}

function admitAt(def) {
  const m = def.code.match(ADMIT);
  return m ? m.index : Infinity;
}

/**
 * The guard verdict for every plan writer: 'self' (admits before its first plan write), 'callers' (every path to it is
 * admitted or owned by an exception), 'exception', or a failure reason.
 */
function verdicts(M) {
  const sites = writeSites(M).filter(s => s.prov !== 'LOCAL');
  const byDef = new Map();
  sites.forEach(s => {
    const k = s.def || '(top level)';
    if (!byDef.has(k)) byDef.set(k, []);
    byDef.get(k).push(s);
  });
  const allNames = [...new Set(M.defs.map(d => d.name))];
  const refs = references(M, allNames);
  const memo = new Map();
  const inAction = (def, seen) => {
    if (memo.has(def)) return memo.get(def);
    if (seen.has(def)) return false;
    seen.add(def);
    const r = refs.get(def.name);
    let ok = !!r && !r.entry.length && r.callers.size > 0;
    if (ok) {
      for (const [caller, callAt] of r.callers) {
        const ex = EXCEPTIONS[caller.name];
        if (admitAt(caller) < callAt) continue;
        if (ex && ex.covers.includes(def.name)) continue;
        if (inAction(caller, seen)) continue;
        ok = false;
        break;
      }
    }
    seen.delete(def);
    memo.set(def, ok);
    return ok;
  };
  const out = [];
  byDef.forEach((list, def) => {
    if (def === '(top level)') { list.forEach(s => out.push({ name: '(top level)', verdict: 'FAIL: plan write outside any function', sites: [s] })); return; }
    const first = Math.min(...list.map(s => s.at - def.start));
    let verdict;
    if (EXCEPTIONS[def.name]) verdict = 'exception ' + EXCEPTIONS[def.name].cls;
    else if (admitAt(def) < first) verdict = 'self';
    else if (inAction(def, new Set())) verdict = 'callers';
    else {
      const r = refs.get(def.name);
      verdict = 'FAIL: unadmitted' + (r.entry.length ? ' (entered by ' + r.entry[0] + ')' : r.callers.size ? ' (reached from ' +
        [...r.callers.keys()].filter(c => admitAt(c) === Infinity).map(c => c.name).slice(0, 3).join(', ') + ')' : ' (no callers)');
    }
    out.push({ name: def.name, verdict, sites: list, def });
  });
  return { out, refs, sites };
}

// ───────────────────────────── checks ─────────────────────────────

function canon(v) {
  if (v === undefined) return 'undefined';
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  return '{' + Object.keys(v).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
}

function checksFor(src) {
  const results = [];
  let group = '';
  const check = (id, text, actual, expected) => {
    const ok = canon(actual) === canon(expected);
    results.push({ group, id, text, ok, detail: ok ? '' : 'expected ' + canon(expected) + ', observed ' + canon(actual) });
  };
  const section = name => { group = name; };

  const M = model(src);
  const { out, refs } = verdicts(M);
  const def = name => { const list = M.defs.filter(d => d.name === name); return list[list.length - 1]; };
  const verdictOf = name => (out.find(v => v.name === name) || { verdict: 'not a writer' }).verdict;
  const callersOf = name => [...refs.get(name).callers.keys()].map(d => d.name).sort();

  section('SCANNER — it sees plan writes of every shape and tells fresh local objects apart by provenance');
  check('scan.writers', 'Known writers are found: income, array reassign, push, row alias, iteration callback, merge, helper with a row parameter',
    ['saveInc', 'delExp', 'geodeSpendingQuickAdd', 'togglePay', 'geodeSavePayApply', 'geodeMergeDuplicateLinkedContributionsSameMonth',
      'advancePaymentDueDateOneMonth', 'geodeIntelApplyBankEstimate', 'ob3Finish'].map(n => verdictOf(n) !== 'not a writer'), Array(9).fill(true));
  check('scan.locals', 'Writes to a deep copy, a fresh object or a DOM node are not plan writes (decided from where the object comes from, not by name)',
    ['geodePayModalImpactRefresh', 'geodeExpModalImpactRefresh', 'geodeLivingMonthModel', 'geodeLivingMonthPaymentItem', 'toast', 'geodeDebtPaymentSummary']
      .map(verdictOf), Array(6).fill('not a writer'));
  check('scan.defs', 'The page defines its functions in inline scripts the scanner reads', M.defs.length > 1000, true);

  section('ADMISSION — every plan writer admits, is reached only through admitted paths, or is a named exception');
  const failures = out.filter(v => /^FAIL/.test(v.verdict));
  check('admit.all', 'No plan writer bypasses geodePrepareFinancialMutation / geodeModalCommitBegin',
    failures.map(v => v.name + ': ' + v.verdict + ' — ' + v.sites.slice(0, 2).map(s => s.text + ' ' + s.kind + ' @' + M.lineOf(s.at)).join('; ')), []);
  check('admit.exceptions', 'The exception list is exactly the documented one, and every entry is still a plan writer',
    Object.keys(EXCEPTIONS).map(n => [n, verdictOf(n)]),
    Object.keys(EXCEPTIONS).map(n => [n, 'exception ' + EXCEPTIONS[n].cls]));
  check('admit.covers', 'An exception owns writes only in callees nothing else reaches',
    Object.keys(EXCEPTIONS).flatMap(n => EXCEPTIONS[n].covers.map(c => [c, callersOf(c)])),
    Object.keys(EXCEPTIONS).flatMap(n => EXCEPTIONS[n].covers.map(c => [c, [n]])));

  section('PAYMENTS RENDER AND SAVE SCOPE — the legacy same-month merge never runs over every group: not while the list renders, not around a payment save');
  const rp = def('rPayments').code;
  check('render.no-merge', 'rPayments calls neither the merge nor any write (save, persist, store)',
    ['geodeMergeDuplicateLinkedContributionsSameMonth(', 'save(', 'persistGeodeToLocalStorage(', 'geodeStoreFinancialState('].map(k => new RegExp('(?<![\\w$.])' + k.replace('(', '\\(')).test(rp)),
    [false, false, false, false]);
  check('render.merge-callers', 'The merge runs only inside geodeSavePayApply (its linked upsert), which only admitted saves reach; savePay, render and import never call it',
    [callersOf('geodeMergeDuplicateLinkedContributionsSameMonth'), refs.get('geodeMergeDuplicateLinkedContributionsSameMonth').entry, verdictOf('geodeSavePayApply'),
      verdictOf('geodeMergeDuplicateLinkedContributionsSameMonth')],
    [['geodeSavePayApply'], [], 'callers', 'callers']);
  const mergeCalls = [];
  const mergeCallRe = /(?<![\w$.]|function\s)geodeMergeDuplicateLinkedContributionsSameMonth\s*\(([^\n]*)\);/g;
  let mc;
  while ((mc = mergeCallRe.exec(M.noComments))) mergeCalls.push([(M.ownerAt(mc.index) || { name: '(top level)' }).name, mc[1].replace(/\s+/g, ' ').trim()]);
  const ups = M.noComments.slice(def('geodeSavePayApply').start, def('geodeSavePayApply').end);
  check('merge.scoped', 'The one merge call passes the upsert\'s own group (unpaid, this link, frequency and month), before the upsert looks up that group\'s row',
    [mergeCalls, ups.indexOf('geodeMergeDuplicateLinkedContributionsSameMonth(') < ups.indexOf('geodeFindExistingLinkedPaymentForYm(\'goal\', gid, ym, rec)')],
    [[['geodeSavePayApply', "geodeDuplicateLinkedContributionKey({ status: 'upcoming', goalId: gid, investId: invid, rec: rec, date: dt })"]], true]);
  const mergeSrc = M.noComments.slice(def('geodeMergeDuplicateLinkedContributionsSameMonth').start, def('geodeMergeDuplicateLinkedContributionsSameMonth').end);
  const keySrc = M.noComments.slice(def('geodeDuplicateLinkedContributionKey').start, def('geodeDuplicateLinkedContributionKey').end);
  check('merge.only-key', 'The merge groups rows by the key helper, merges only the group it is given, and merges nothing for an empty key; the key never covers paid, debt or separately added rows',
    [/if \(arguments\.length && !onlyKey\) return false;/.test(mergeSrc), /var key = geodeDuplicateLinkedContributionKey\(p\);\s*if \(!key \|\| \(onlyKey && key !== onlyKey\)\) continue;/.test(mergeSrc),
      /if \(!p \|\| String\(p\.status \|\| ''\) === 'paid' \|\| p\.debtId \|\| p\.directContribution === true\) return '';/.test(keySrc)],
    [true, true, true]);

  section('BANK ESTIMATE — the dormant income writer admits after its confirm and before its first change');
  const be = def('geodeIntelApplyBankEstimate').code;
  const pos = k => be.indexOf(k);
  check('bank.order', 'confirm → geodePrepareFinancialMutation → snapshot → activity log → S.income → save',
    [pos('confirm(') < pos('!geodePrepareFinancialMutation()'), pos('!geodePrepareFinancialMutation()') < pos('setLastSnapshotBeforeChange('),
      pos('setLastSnapshotBeforeChange(') < pos('appendActivityLog('), pos('appendActivityLog(') < pos('S.income ='), pos('S.income =') < pos('save()'),
      verdictOf('geodeIntelApplyBankEstimate')], [true, true, true, true, true, 'self']);

  section('EXCEPTION PROOFS — each exception\'s reason still holds');
  const prep = def('geodePrepareFinancialMutation').code;
  check('B.sync', 'The boundary roll runs inside geodePrepareFinancialMutation, before the action opens; its rollups are reached only from it',
    [/(?<![\w$.])syncRecurringPayments\s*\(/.test(prep), callersOf('rollupRecurringPaymentDueDates'), callersOf('rollupRecurringExpenseDueDates')],
    [true, ['syncRecurringPayments'], ['syncRecurringPayments']]);
  const arch = def('geodeArchiveExpiredOneOffExpenses').code;
  const sum = def('sumExpensesMonthly').code;
  check('B.archive', 'Archive removes exactly the expenses sumExpensesMonthly skips: one-offs dated before this month (same predicate, same month)',
    [/var ym = currentYM\(\);/.test(arch), /if \(!e \|\| !geodeExpenseIsExpiredOneOff\(e, ym\)\) \{\s*if \(e\) keep\.push\(e\);\s*continue;/.test(arch),
      /if \(changed\) state\.expenses = keep;/.test(arch), (arch.match(/state\.expenses\s*=/g) || []).length,
      /var nowYM = currentYM\(\);/.test(sum), /geodeExpenseIsExpiredOneOff\(e, nowYM\)\) continue;/.test(sum)],
    [true, true, true, 1, true, true]);
  check('C.load', 'Migration is reached only from load', callersOf('migratePaymentFlowFields'), ['load']);
  const hasOnboardedWrites = (M.noComments.match(/(?<![\w$])hasOnboarded\s*=(?!=)\s*[^;\n]*/g) || []).map(s => s.replace(/\s*=\s*/, ' = ').replace(/\s+/g, ' ').trim());
  check('D.onboarding', 'ob3Finish: no code calls it, only the two first-run buttons; the first-run page opens only while hasOnboarded is not true; nothing sets hasOnboarded to false',
    [callersOf('ob3Finish'), (M.noComments.match(/onclick="ob3Finish\(\)"/g) || []).length, refs.get('ob3Finish').entry.length,
      /if \(S\.hasOnboarded !== true\) \{\s*document\.getElementById\('pg-ob'\)\.style\.display = 'block';/.test(src),
      (src.match(/pg-ob'\)\.style\.display\s*=\s*'block'/g) || []).length,
      hasOnboardedWrites.filter(s => !/^hasOnboarded = (?:true|typeof S\.hasOnboarded === 'boolean' \? S\.hasOnboarded : coercePersistedBoolean\(S\.hasOnboarded\) \|\| S\.ready)$/.test(s))],
    [[], 2, 2, true, 1, []]);
  check('F.dead', 'geodeQuickSetupFinish is referenced nowhere (no caller, handler, string or value)',
    [callersOf('geodeQuickSetupFinish'), refs.get('geodeQuickSetupFinish').entry, (src.match(/geodeQuickSetupFinish/g) || []).length], [[], [], 1]);
  check('L.parity-bridge', 'The parity bridge writes only a JSON deep copy of each action, and only the parity harness calls it',
    [/row = geodeAdaptiveParityDeepClone\(a\);[\s\S]*row\.amount = amt;/.test(def('geodePresentationParityBridgePostAdaptiveRows').code),
      /^\s*if \(v === undefined\) return undefined;\s*if \(v === null\) return null;\s*try \{\s*return JSON\.parse\(JSON\.stringify\(v\)\);/.test(def('geodeAdaptiveParityDeepClone').code.replace(/^function[^{]*\{/, '')),
      callersOf('geodePresentationParityBridgePostAdaptiveRows'), refs.get('geodePresentationParityBridgePostAdaptiveRows').entry],
    [true, true, ['geodeSuggestedPresentationParityHarness'], []]);
  const cacheWrites = (M.code.match(/(?<![\w$.])geodeHighlightFullRankedCache\s*(?:=(?!=)[^;\n]*|\.\s*(?:push|unshift|splice|concat|fill)\s*\([^\n]*|\[[^\]\n]*\]\s*=(?!=))/g) || [])
    .map(s => s.replace(/\s+/g, ' '));
  check('L.nudge', 'The K7.1 nudge transform is called only on geodeHighlightFullRankedCache entries; the cache is only ever emptied or filled with cloneHighlightNudge copies',
    [callersOf('geodeK71TransformNudgeInPlace'), refs.get('geodeK71TransformNudgeInPlace').entry,
      /var arr = geodeHighlightFullRankedCache;[\s\S]*geodeK71TransformNudgeInPlace\(arr\[ci\]\);/.test(def('geodeApplyK71ContextToHighlightCache').code),
      cacheWrites.filter(s => !/^geodeHighlightFullRankedCache = \[\]$|^geodeHighlightFullRankedCache\.push\(cloneHighlightNudge\(/.test(s)),
      /^\s*if \(!n\) return null;\s*var o = \{/.test(def('cloneHighlightNudge').code.replace(/^function[^{]*\{/, ''))],
    [['geodeApplyK71ContextToHighlightCache'], [], true, [], true]);
  check('clone.deep', 'The UI calculation copy is a JSON deep copy, so writes to its rows stay local; when it cannot be made the copy is null (never a shallow copy sharing S\'s rows)',
    /^\s*state = state \|\| S;\s*try \{\s*return JSON\.parse\(JSON\.stringify\(state\)\);\s*\} catch \(e\) \{\s*return null;\s*\}\s*\}\s*$/.test(def('geodeCloneStateForUiCalc').code.replace(/^function[^{]*\{/, '')), true);
  const failsClosed = (name, re) => re.test(M.noComments.slice(def(name).start, def(name).end));
  check('clone.callers', 'Every UI copy caller drops its preview when the copy is null (payment and expense previews clear their host; Quick Setup shows no total)',
    [callersOf('geodeCloneStateForUiCalc'), refs.get('geodeCloneStateForUiCalc').entry, callersOf('geodeQuickSetupBuildTempState'), refs.get('geodeQuickSetupBuildTempState').entry,
      failsClosed('geodePayModalImpactRefresh', /var temp = geodeCloneStateForUiCalc\(S\);\s*if \(!temp\) \{\s*host\.innerHTML = '';\s*return;\s*\}/),
      failsClosed('geodeExpModalImpactRefresh', /var temp = geodeCloneStateForUiCalc\(S\);\s*if \(!temp\) \{\s*host\.innerHTML = '';\s*return;\s*\}/),
      failsClosed('geodeQuickSetupBuildTempState', /var t = geodeCloneStateForUiCalc\(S\);\s*if \(!t\) return null;/),
      failsClosed('geodeQuickSetupLiveLeft', /var temp = geodeQuickSetupBuildTempState\(qs\);\s*if \(!temp\) return '';/)],
    [['geodeExpModalImpactRefresh', 'geodePayModalImpactRefresh', 'geodeQuickSetupBuildTempState'], [], ['geodeQuickSetupLiveLeft'], [], true, true, true, true]);

  section('HANDLERS AND PURE MODULES — no plan write outside the inline functions');
  const handlerWrites = [];
  const handlerRe = /\son[a-z]+\s*=\s*(\\?["'])([\s\S]*?)\1/g;
  let h;
  while ((h = handlerRe.exec(src))) {
    if (/(?<![\w$.])(?:window\.)?S\s*(?:\.\s*(?:income|payments|expenses)|\[)/.test(h[2])) handlerWrites.push(M.lineOf(h.index) + ': ' + h[2].slice(0, 60));
  }
  check('handlers', 'No inline event handler (markup or built in a string) touches S.income, S.payments or S.expenses', handlerWrites, []);
  check('pure', 'js/geode-pure never references the page state S or window.S',
    PURE.filter(p => /(?<![\w$.])(?:window\.)?S\s*\.\s*(?:income|payments|expenses)|window\.S(?![\w$])/.test(p.text)).map(p => p.file), []);

  return { results, inventory: out };
}

// ───────────────────────────── mutants ─────────────────────────────

const RP = 'function rPayments(el) {\n  var sorted=';
const inRender = line => [RP, 'function rPayments(el) {\n  ' + line + '\n  var sorted='];
const MUTANTS = {
  'render merge restored': inRender('var mergedDupes = false;\n  try {\n    mergedDupes = !!geodeMergeDuplicateLinkedContributionsSameMonth();\n  } catch (eRp0) {}\n  if (mergedDupes) {\n    try {\n      save();\n    } catch (eRp) {}\n  }'),
  'bank estimate unadmitted': ["    if (!confirm('Adjust your plan to reflect your current spending from your account? Your income in Beynd will be updated.')) return;\n    if (!geodePrepareFinancialMutation()) return;\n",
    "    if (!confirm('Adjust your plan to reflect your current spending from your account? Your income in Beynd will be updated.')) return;\n"],
  'income form unadmitted': ['    if (!geodeModalCommitBegin()) return;\n    var prevInc = Number(S.income) || 0;', '    var prevInc = Number(S.income) || 0;'],
  'admission after the change': ['function delExp(id){if(!geodePrepareFinancialMutation())return;S.expenses=S.expenses.filter(function(e){return e.id!==id;});save();',
    'function delExp(id){S.expenses=S.expenses.filter(function(e){return e.id!==id;});if(!geodePrepareFinancialMutation())return;save();'],
  'unchecked admission': ['  if (!geodePrepareFinancialMutation()) return;\n\n  exp.amount = last.oldAmount;', '  geodePrepareFinancialMutation();\n\n  exp.amount = last.oldAmount;'],
  'render row alias write': inRender("var __p = S.payments[0]; if (__p) __p.status = 'paid';"),
  'render callback write': inRender('S.expenses.forEach(function (e) { e.amount = 0; });'),
  'render loop alias write': inRender("var __l = S.expenses; for (var __e of __l) __e.rec = 'no';"),
  'render find alias write': inRender('var __r = (S.payments || []).find(function (x) { return x.id; }); if (__r) __r.amount = 0;'),
  'render array push': inRender('S.expenses.push({ amount: 1 });'),
  'render compound income': inRender('S.income += 1;'),
  'render bracket write': inRender("S['income'] = 1;"),
  'render delete field': inRender('delete S.payments[0].lastPaidAmount;'),
  'render window.S write': inRender('window.S.expenses = [];'),
  'render Object.assign row': inRender('Object.assign(S.payments[0], { amount: 1 });'),
  'render reaches a row helper': inRender('advancePaymentDueDateOneMonth(S.payments[0]);'),
  'render reaches onboarding': inRender('ob3Finish();'),
  'onboarding reset': inRender('S.hasOnboarded = false;'),
  'dead writer wired': ['onclick="openPayModal(null)">+ Schedule contribution', 'onclick="geodeQuickSetupFinish()">+ Schedule contribution'],
  'inline handler write': ['onclick="openPayModal(null)">+ Schedule contribution', 'onclick="S.income=0;save()">+ Schedule contribution'],
  'new unadmitted writer': [RP, 'function geodeMutantApply() { S.expenses = []; save(); }\n' + RP],
  'archive removes a counted expense': ['    if (!e || !geodeExpenseIsExpiredOneOff(e, ym)) {', '    if (!e || !geodeExpenseIsOneOff(e)) {'],
  'merge called from another render': ['function rPayments(el) {', 'function rPaymentsMutantHelper() { geodeMergeDuplicateLinkedContributionsSameMonth(); }\nfunction rPayments(el) {\n  rPaymentsMutantHelper();'],
  'nudge transform on a plan row': inRender('geodeK71TransformNudgeInPlace(S.expenses[0]);'),
  'parity bridge on plan rows': inRender('geodePresentationParityBridgePostAdaptiveRows(S.payments);'),
  'nudge cache holds plan rows': ['    geodeHighlightFullRankedCache.push(cloneHighlightNudge(fullRanked[_ci]));', '    geodeHighlightFullRankedCache.push(S.expenses[_ci]);'],
  'UI copy made shallow': ['  try {\n    return JSON.parse(JSON.stringify(state));\n  } catch (e) {\n    return null;',
    '  try {\n    return Object.assign({}, state);\n  } catch (e) {\n    return null;'],
  'UI copy falls back to shared rows': ['    return JSON.parse(JSON.stringify(state));\n  } catch (e) {\n    return null;',
    '    return JSON.parse(JSON.stringify(state));\n  } catch (e) {\n    return { income: toNum(state.income), payments: (state.payments || []).slice(), expenses: (state.expenses || []).slice() };'],
  'payment preview ignores a failed copy': ["  if (!temp) {\n    host.innerHTML = '';\n    return;\n  }\n  if (!Array.isArray(temp.payments))", '  if (!Array.isArray(temp.payments))'],
  'expense preview ignores a failed copy': ["  if (!temp) {\n    host.innerHTML = '';\n    return;\n  }\n  if (!Array.isArray(temp.expenses))", '  if (!Array.isArray(temp.expenses))'],
  'Quick Setup copy falls back': ['  if (!t) return null;\n  if (!Array.isArray(t.expenses))', '  if (!t) t = {};\n  if (!Array.isArray(t.expenses))'],
  'Quick Setup total ignores a failed copy': ["    if (!temp) return '';\n    var left = calcMonthlyLeftover(temp);", '    var left = calcMonthlyLeftover(temp);'],
  'global merge in ordinary save': ['  if (!geodeModalCommitBegin()) return;\n  if (!geodeSavePayApply(',
    '  if (!geodeModalCommitBegin()) return;\n  geodeMergeDuplicateLinkedContributionsSameMonth();\n  if (!geodeSavePayApply('],
  'global merge after the save': ["  geodeRecordContributionTransition(savedPayContributionBefore, savedPayRow, 'payment_form');\n  if (savedPayRowId",
    "  geodeRecordContributionTransition(savedPayContributionBefore, savedPayRow, 'payment_form');\n  geodeMergeDuplicateLinkedContributionsSameMonth(geodeDuplicateLinkedContributionKey(savedPayRow));\n  if (savedPayRowId"],
  'upsert merge unscoped': ["geodeMergeDuplicateLinkedContributionsSameMonth(geodeDuplicateLinkedContributionKey({ status: 'upcoming', goalId: gid, investId: invid, rec: rec, date: dt }));",
    'geodeMergeDuplicateLinkedContributionsSameMonth();'],
  'merge ignores its key': ['    if (!key || (onlyKey && key !== onlyKey)) continue;', '    if (!key) continue;'],
  'empty key merges every group': ['  if (arguments.length && !onlyKey) return false;\n', ''],
  'key merges paid rows': ["  if (!p || String(p.status || '') === 'paid' || p.debtId", '  if (!p || p.debtId'],
  'merge in Smart Import': ['function geodeSmartImportConfirm() {', 'function geodeSmartImportConfirm() {\n  geodeMergeDuplicateLinkedContributionsSameMonth();']
};

function main() {
  const { results, inventory } = checksFor(INDEX);
  Object.keys(MUTANTS).forEach(name => {
    const [from, to] = MUTANTS[name];
    if (INDEX.split(from).length !== 2) throw new Error('mutant anchor must occur exactly once in index.html: ' + name);
    let by;
    try {
      by = checksFor(INDEX.replace(from, () => to)).results.filter(r => !r.ok).map(r => r.id);
    } catch (e) {
      by = ['threw: ' + e.message];
    }
    results.push({ group: 'MUTANTS — each unadmitted plan write is caught by the checks above', id: 'mutant.' + name.replace(/\s+/g, '-'),
      text: 'Caught: ' + name + (by.length ? ' (by ' + by.join(', ') + ')' : ''), ok: by.length > 0, detail: by.length ? '' : 'every check still passed' });
  });

  let failed = 0;
  let last = '';
  results.forEach(r => {
    if (r.group !== last) { console.log('\n== ' + r.group); last = r.group; }
    if (!r.ok) failed++;
    console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(34) + ' ' + r.text + (r.ok ? '' : '\n        ' + r.detail));
  });
  if (process.argv.includes('--inventory')) {
    console.log('\nPlan writers:');
    inventory.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(v => console.log('  ' + v.name.padEnd(52) + ' ' + v.verdict));
  }
  console.log('\nPlan writers: ' + inventory.length);
  console.log('\nSummary: PASS: ' + (results.length - failed) + '  FAIL: ' + failed);
  console.log(failed ? 'RESULT: NOT CLEAN' : 'RESULT: CLEAN');
  process.exit(failed ? 1 : 0);
}

main();
