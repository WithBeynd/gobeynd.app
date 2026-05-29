// Beynd — pure foundation (Stage 81B)
// Extracted: toNum, Stage 75C, 75E, 77B, 82B plan mirrors. Classic global script; no S/DOM/storage.


// ── PURE FINANCE HELPERS ────────────────────────────
function toNum(v, fallback) {
  var n = Number(v);
  return isNaN(n) ? (fallback===undefined ? 0 : fallback) : n;
}

// ── PURE MONTH/TIME SCOPING UTILITIES (Stage 75C; shadow only, unwired) ──────────────
// Contract: these helpers do not read globals, do not mutate inputs, do not touch storage/DOM/window,
// and do not fall back to "today" unless an explicit input is provided via opts.
function geodePureMonthKey(input) {
  try {
    if (typeof input === 'string') {
      if (/^\d{4}-\d{2}$/.test(input)) return input;
      if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 7);
      return '';
    }
    if (input instanceof Date && !isNaN(input.getTime())) {
      var m = input.getMonth() + 1;
      return input.getFullYear() + '-' + (m < 10 ? '0' : '') + m;
    }
    if (typeof input === 'number' && isFinite(input)) {
      var d = new Date(input);
      if (isNaN(d.getTime())) return '';
      var mm = d.getMonth() + 1;
      return d.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm;
    }
  } catch (_ePm) {}
  return '';
}
function geodePureDateKey(input) {
  try {
    if (typeof input === 'string') {
      if (/^\d{4}-\d{2}-\d{2}/.test(input)) return input.slice(0, 10);
      return '';
    }
    if (input instanceof Date && !isNaN(input.getTime())) {
      var y = input.getFullYear();
      var m = String(input.getMonth() + 1).padStart(2, '0');
      var day = String(input.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    }
    if (typeof input === 'number' && isFinite(input)) {
      var d = new Date(input);
      if (isNaN(d.getTime())) return '';
      var yy = d.getFullYear();
      var mm = String(d.getMonth() + 1).padStart(2, '0');
      var dd = String(d.getDate()).padStart(2, '0');
      return yy + '-' + mm + '-' + dd;
    }
  } catch (_ePd) {}
  return '';
}
function geodePureDateCompare(a, b) {
  var da = geodePureDateKey(a);
  var db = geodePureDateKey(b);
  if (!da || !db) return null;
  if (da === db) return 0;
  return da < db ? -1 : 1;
}
function geodePureIsDateBefore(a, b) {
  return geodePureDateCompare(a, b) === -1;
}
function geodePureExpenseIsOneOff(expense) {
  if (!expense) return false;
  if (String(expense.type || '').toLowerCase() === 'one-off') return true;
  var rec = String(expense.rec || 'no').toLowerCase();
  return rec !== 'yes' && rec !== 'annual';
}
function geodePureExpenseMonthValue(expense) {
  var d = String((expense && (expense.date || expense.dueDate)) || '').slice(0, 10);
  if (!d || d.length < 7) return '';
  return /^\d{4}-\d{2}/.test(d) ? d.slice(0, 7) : '';
}
function geodePureExpenseMonthlyAmount(expense, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  var monthKey = geodePureMonthKey(opts.monthKey);
  if (!expense) return 0;
  if (expense._archived === true || expense._isStale === true || expense.expired === true) return 0;
  var rec = String(expense.rec || 'no').toLowerCase();
  var amt = toNum(expense.amount);
  if (amt <= 0) return 0;
  if (geodePureExpenseIsOneOff(expense)) {
    var eYm = geodePureExpenseMonthValue(expense);
    if (!eYm) return 0;
    if (monthKey && eYm !== monthKey) return 0;
    if (monthKey && eYm < monthKey) return 0;
  }
  if (rec === 'annual') return amt / 12;
  return amt;
}
function geodePurePaymentEffectiveStatus(payment, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  if (!payment) return '';
  var st = String(payment.status || '').toLowerCase();
  if (st === 'paid' || st === 'overdue') return st;
  if (st === 'upcoming' && payment.date) {
    var todayKey = geodePureDateKey(opts.today);
    var d = geodePureDateKey(payment.date);
    if (todayKey && d && d < todayKey) return 'overdue';
  }
  return st;
}
function geodePurePaymentCountsForMonth(payment, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  if (!payment) return false;
  var st = geodePurePaymentEffectiveStatus(payment, opts);
  if (st === 'overdue') return true;
  if (String(payment.status || '').toLowerCase() === 'overdue') return true;
  var rec = String(payment.rec || '').toLowerCase();
  if (rec === 'yes') {
    if (String(payment.status || '').toLowerCase() === 'paid') return String(payment.lastPaidYM || '') === monthKey;
    return true;
  }
  if (!payment.date) return true;
  var d = geodePureDateKey(payment.date);
  if (!d) return true; // fail-open like legacy Date parsing paths
  if (todayKey && d < todayKey) return true; // past-due one-time rows still count
  if (!monthKey) return false;
  return d.slice(0, 7) === monthKey;
}
function geodePurePaymentAmountForMonth(payment, opts) {
  return geodePurePaymentCountsForMonth(payment, opts) ? Math.max(0, toNum(payment && payment.amount)) : 0;
}
function geodePurePaymentConfirmedAmountForMonth(payment, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  var monthKey = geodePureMonthKey(opts.monthKey);
  if (!payment) return 0;
  var st = String(payment.status || '').toLowerCase();
  if (!(st === 'paid' || st === 'done' || st === 'completed')) return 0;
  var rec = String(payment.rec || '').toLowerCase();
  if (rec === 'yes') return String(payment.lastPaidYM || '') === monthKey ? Math.max(0, toNum(payment.amount)) : 0;
  if (!payment.date) return Math.max(0, toNum(payment.amount));
  var d = geodePureDateKey(payment.date);
  if (!d) return Math.max(0, toNum(payment.amount)); // fail-open on malformed dates
  if (!monthKey) return 0;
  return d.slice(0, 7) === monthKey ? Math.max(0, toNum(payment.amount)) : 0;
}
function geodePureSumMonthlyExpenses(state, opts) {
  state = state && typeof state === 'object' ? state : {};
  var ex = Array.isArray(state.expenses) ? state.expenses : [];
  var s = 0;
  for (var i = 0; i < ex.length; i++) s += geodePureExpenseMonthlyAmount(ex[i], opts);
  return s;
}
function geodePureSumPaymentOutflow(state, opts) {
  state = state && typeof state === 'object' ? state : {};
  var pay = Array.isArray(state.payments) ? state.payments : [];
  var s = 0;
  for (var i = 0; i < pay.length; i++) s += geodePurePaymentAmountForMonth(pay[i], opts);
  return s;
}
function geodePureSumConfirmedPaymentOutflow(state, opts) {
  state = state && typeof state === 'object' ? state : {};
  var pay = Array.isArray(state.payments) ? state.payments : [];
  var s = 0;
  for (var i = 0; i < pay.length; i++) s += geodePurePaymentConfirmedAmountForMonth(pay[i], opts);
  return s;
}
function geodePureMonthlyCashflow(state, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');
  var income = toNum(state.income);
  var monthlyExpenses = geodePureSumMonthlyExpenses(state, { monthKey: monthKey, today: todayKey });
  var paymentOutflow = geodePureSumPaymentOutflow(state, { monthKey: monthKey, today: todayKey });
  var confirmedPaymentOutflow = geodePureSumConfirmedPaymentOutflow(state, { monthKey: monthKey, today: todayKey });
  var planRoom = income - paymentOutflow - monthlyExpenses;
  var confirmedRoom = income - confirmedPaymentOutflow - monthlyExpenses;
  return {
    income: income,
    monthlyExpenses: monthlyExpenses,
    paymentOutflow: paymentOutflow,
    confirmedPaymentOutflow: confirmedPaymentOutflow,
    planRoom: planRoom,
    confirmedRoom: confirmedRoom,
    reasonCodes: reasonCodes
  };
}

// ── PURE DEBT PROGRESS FOUNDATIONS (Stage 77B; ports Stage 63A; shadow only) ─────────
// Contract: pure, deterministic from explicit inputs only; no globals, no hidden time, no storage/DOM/window, no mutation.
function geodePureDebtById(state, debtId) {
  state = state && typeof state === 'object' ? state : {};
  var list = Array.isArray(state.debts) ? state.debts : [];
  var id = String(debtId || '');
  if (!id) return null;
  for (var i = 0; i < list.length; i++) {
    var d = list[i];
    if (d && String(d.id || '') === id) return d;
  }
  return null;
}

function geodePurePaymentSameRow(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.id && b.id && String(a.id) === String(b.id)) return true;
  return false;
}

function geodePureDebtPaymentLooksLikeExtraAction(payment) {
  if (!payment) return false;
  var nm = String(payment.name || '').toLowerCase();
  return /\b(extra|overpay|overpayment|additional|top[\s-]*up|principal|reduce\s+high|accelerat|pay\s+down)\b/.test(nm);
}

function geodePureDebtMinimumPaymentAmount(debt) {
  if (!debt) return 0;
  var fields = [debt.minp, debt.min, debt.minimum, debt.minimumPayment];
  for (var i = 0; i < fields.length; i++) {
    var raw = fields[i];
    if (raw === '' || raw == null) continue;
    var n = toNum(raw);
    if (n > 0) return n;
  }
  return 0;
}

/** Monthly amount from one payment row toward this debt's minimum (pure; Stage 63A semantics). */
function geodePureDebtPaymentAmountTowardMinimum(payment, debt, state, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  if (!payment || !debt) return 0;
  var minp = geodePureDebtMinimumPaymentAmount(debt);
  if (minp <= 0) return 0;
  if (!geodePurePaymentCountsForMonth(payment, { monthKey: opts.monthKey, today: opts.today })) return 0;
  var amt = toNum(payment.amount);
  if (amt <= 0) return 0;
  if (geodePureDebtPaymentLooksLikeExtraAction(payment)) return 0;

  var threshold = minp * 0.85;
  var did = String(debt.id || '');
  var dname = String(debt.name || '').toLowerCase().trim();
  if (did && String(payment.debtId || '') === did) return amt;

  var pk = String(payment.payKind || '').toLowerCase();
  if (pk === 'debt' && did && String(payment.debtId || '') === did) return amt;

  var pnm = String(payment.name || '').toLowerCase();
  if (dname && pnm.indexOf(dname) >= 0 && amt >= threshold) return amt;
  return 0;
}

/** Monthly amount from one expense row that represents this debt's minimum (pure; conservative matching). */
function geodePureExpenseAmountTowardDebtMinimum(expense, debt, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  if (!expense || !debt) return 0;
  var minp = geodePureDebtMinimumPaymentAmount(debt);
  if (minp <= 0) return 0;

  var monthly = geodePureExpenseMonthlyAmount(expense, { monthKey: opts.monthKey, today: opts.today });
  if (!(monthly > 0)) return 0;

  var threshold = minp * 0.85;
  if (monthly < threshold) return 0;

  var dname = String(debt.name || '').toLowerCase().trim();
  var nm = String(expense.name || '').toLowerCase();
  if (dname && nm.indexOf(dname) >= 0) return monthly;

  // Optional, explicit-only relaxation for single-debt setups (never inferred implicitly).
  if (opts && opts.assumeSingleDebtMinimum === true) {
    if (/debt\s+minimum|^min\s*payment|minimum\s*payment\b/i.test(nm)) return monthly;
  }
  return 0;
}

function geodePureDebtMinimumRepresentedAmount(state, debtId, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var debt = geodePureDebtById(state, debtId);
  if (!debt) {
    reasonCodes.push('debt_not_found');
    return {
      debtId: String(debtId || ''),
      minimum: 0,
      represented: 0,
      remaining: 0,
      paymentRepresented: 0,
      expenseRepresented: 0,
      paymentIds: [],
      expenseIds: [],
      reasonCodes: reasonCodes
    };
  }

  var minp = geodePureDebtMinimumPaymentAmount(debt);
  if (!(minp > 0)) {
    reasonCodes.push('minimum_missing_or_nonpositive');
    return {
      debtId: String(debt.id || ''),
      minimum: 0,
      represented: 0,
      remaining: 0,
      paymentRepresented: 0,
      expenseRepresented: 0,
      paymentIds: [],
      expenseIds: [],
      reasonCodes: reasonCodes
    };
  }

  var pay = Array.isArray(state.payments) ? state.payments : [];
  var exp = Array.isArray(state.expenses) ? state.expenses : [];
  var rawPaySum = 0;
  var rawExpSum = 0;
  var paymentIds = [];
  var expenseIds = [];

  for (var pi = 0; pi < pay.length; pi++) {
    var p = pay[pi];
    var add = geodePureDebtPaymentAmountTowardMinimum(p, debt, state, { monthKey: monthKey, today: todayKey });
    if (add > 0) {
      rawPaySum += add;
      if (p && p.id != null) paymentIds.push(String(p.id));
    }
  }

  for (var ei = 0; ei < exp.length; ei++) {
    var e = exp[ei];
    var eAdd = geodePureExpenseAmountTowardDebtMinimum(e, debt, {
      monthKey: monthKey,
      today: todayKey,
      assumeSingleDebtMinimum: opts.assumeSingleDebtMinimum === true
    });
    if (eAdd > 0) {
      rawExpSum += eAdd;
      if (e && e.id != null) expenseIds.push(String(e.id));
    }
  }

  var represented = Math.min(minp, rawPaySum + rawExpSum);
  var paymentRepresented = Math.min(minp, rawPaySum);
  var expenseRepresented = Math.min(Math.max(0, minp - paymentRepresented), rawExpSum);
  var remaining = Math.max(0, minp - represented);

  return {
    debtId: String(debt.id || ''),
    minimum: minp,
    represented: represented,
    remaining: remaining,
    paymentRepresented: paymentRepresented,
    expenseRepresented: expenseRepresented,
    paymentIds: paymentIds,
    expenseIds: expenseIds,
    reasonCodes: reasonCodes
  };
}

function geodePureDebtFormatMinimumRepresentation(debtId, minp, rawPaySum, rawExpSum, paymentIds, expenseIds, reasonCodes) {
  var represented = Math.min(minp, rawPaySum + rawExpSum);
  var paymentRepresented = Math.min(minp, rawPaySum);
  var expenseRepresented = Math.min(Math.max(0, minp - paymentRepresented), rawExpSum);
  return {
    debtId: String(debtId || ''),
    minimum: minp,
    represented: represented,
    remaining: Math.max(0, minp - represented),
    paymentRepresented: paymentRepresented,
    expenseRepresented: expenseRepresented,
    paymentIds: paymentIds || [],
    expenseIds: expenseIds || [],
    reasonCodes: reasonCodes || []
  };
}

function geodePureDebtMinimumRepresentedAmountExcludingPayment(state, debtId, excludedPayment, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var debt = geodePureDebtById(state, debtId);
  if (!debt) {
    reasonCodes.push('debt_not_found');
    return geodePureDebtFormatMinimumRepresentation(debtId, 0, 0, 0, [], [], reasonCodes);
  }

  var minp = geodePureDebtMinimumPaymentAmount(debt);
  if (!(minp > 0)) {
    reasonCodes.push('minimum_missing_or_nonpositive');
    return geodePureDebtFormatMinimumRepresentation(debt.id, 0, 0, 0, [], [], reasonCodes);
  }

  var pay = Array.isArray(state.payments) ? state.payments : [];
  var exp = Array.isArray(state.expenses) ? state.expenses : [];
  var rawPaySum = 0;
  var rawExpSum = 0;
  var paymentIds = [];
  var expenseIds = [];
  var payOpts = { monthKey: monthKey, today: todayKey };

  for (var pi = 0; pi < pay.length; pi++) {
    var p = pay[pi];
    if (geodePurePaymentSameRow(p, excludedPayment)) continue;
    var add = geodePureDebtPaymentAmountTowardMinimum(p, debt, state, payOpts);
    if (add > 0) {
      rawPaySum += add;
      if (p && p.id != null) paymentIds.push(String(p.id));
    }
  }

  for (var ei = 0; ei < exp.length; ei++) {
    var e = exp[ei];
    var eAdd = geodePureExpenseAmountTowardDebtMinimum(e, debt, {
      monthKey: monthKey,
      today: todayKey,
      assumeSingleDebtMinimum: opts.assumeSingleDebtMinimum === true
    });
    if (eAdd > 0) {
      rawExpSum += eAdd;
      if (e && e.id != null) expenseIds.push(String(e.id));
    }
  }

  return geodePureDebtFormatMinimumRepresentation(debt.id, minp, rawPaySum, rawExpSum, paymentIds, expenseIds, reasonCodes);
}

/** Unpaid/scheduled + expense minimum slot used before counting paid extras (Stage 63A). */
function geodePureDebtMinimumRepresentedAmountForUnpaidOrNonPaymentRows(state, debtId, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var debt = geodePureDebtById(state, debtId);
  if (!debt) {
    reasonCodes.push('debt_not_found');
    return geodePureDebtFormatMinimumRepresentation(debtId, 0, 0, 0, [], [], reasonCodes);
  }

  var minp = geodePureDebtMinimumPaymentAmount(debt);
  if (!(minp > 0)) {
    reasonCodes.push('minimum_missing_or_nonpositive');
    return geodePureDebtFormatMinimumRepresentation(debt.id, 0, 0, 0, [], [], reasonCodes);
  }

  var pay = Array.isArray(state.payments) ? state.payments : [];
  var exp = Array.isArray(state.expenses) ? state.expenses : [];
  var rawPaySum = 0;
  var rawExpSum = 0;
  var paymentIds = [];
  var expenseIds = [];
  var payOpts = { monthKey: monthKey, today: todayKey };

  for (var pi = 0; pi < pay.length; pi++) {
    var p = pay[pi];
    if (!p) continue;
    if (geodePurePaymentConfirmedAmountForMonth(p, payOpts) > 0) continue;
    if (geodePureDebtPaymentLooksLikeExtraAction(p)) continue;
    var add = geodePureDebtPaymentAmountTowardMinimum(p, debt, state, payOpts);
    if (add > 0) {
      rawPaySum += add;
      if (p.id != null) paymentIds.push(String(p.id));
    }
  }

  for (var ei = 0; ei < exp.length; ei++) {
    var e = exp[ei];
    var eAdd = geodePureExpenseAmountTowardDebtMinimum(e, debt, {
      monthKey: monthKey,
      today: todayKey,
      assumeSingleDebtMinimum: opts.assumeSingleDebtMinimum === true
    });
    if (eAdd > 0) {
      rawExpSum += eAdd;
      if (e && e.id != null) expenseIds.push(String(e.id));
    }
  }

  return geodePureDebtFormatMinimumRepresentation(debt.id, minp, rawPaySum, rawExpSum, paymentIds, expenseIds, reasonCodes);
}

/** Paid-this-month amount above represented minimum (mirrors geodeSumPaymentsForDebtThisMonth). */
function geodePureDebtPaidExtraProgress(state, debtId, opts) {
  if (!debtId) return 0;
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  var payOpts = { monthKey: monthKey, today: todayKey };
  var debt = geodePureDebtById(state, debtId);
  var minp = geodePureDebtMinimumPaymentAmount(debt);
  var sum = 0;
  var pay = Array.isArray(state.payments) ? state.payments : [];
  var remainingMinimumForPaid = 0;

  if (minp > 0 && debt) {
    var slot = geodePureDebtMinimumRepresentedAmountForUnpaidOrNonPaymentRows(state, debtId, opts);
    remainingMinimumForPaid = Math.max(0, minp - slot.represented);
  }

  for (var i = 0; i < pay.length; i++) {
    var p = pay[i];
    if (!p || String(p.debtId || '') !== String(debtId)) continue;
    if (!(geodePurePaymentConfirmedAmountForMonth(p, payOpts) > 0)) continue;
    var amt = toNum(p.amount);
    if (amt <= 0) continue;
    if (minp <= 0 || geodePureDebtPaymentLooksLikeExtraAction(p)) {
      sum += amt;
      continue;
    }
    var extra = Math.max(0, amt - remainingMinimumForPaid);
    sum += extra;
    remainingMinimumForPaid = Math.max(0, remainingMinimumForPaid - amt);
  }
  return sum;
}

/** Scheduled/unpaid extra portion for one linked payment row (mirrors geodeDebtScheduledExtraAmountForPlanProgress). */
function geodePureDebtScheduledExtraProgress(state, debtId, payment, opts) {
  if (!payment || String(payment.debtId || '') !== String(debtId || '')) return 0;
  opts = opts && typeof opts === 'object' ? opts : {};
  if (!geodePurePaymentCountsForMonth(payment, opts)) return 0;

  var st = geodePurePaymentEffectiveStatus(payment, opts);
  if (st !== 'upcoming' && st !== 'overdue') return 0;

  var amt = toNum(payment.amount);
  if (amt <= 0) return 0;

  var debt = geodePureDebtById(state, debtId);
  var minp = geodePureDebtMinimumPaymentAmount(debt);
  if (minp <= 0) return amt;
  if (geodePureDebtPaymentLooksLikeExtraAction(payment)) return amt;

  var representedWithoutThis = geodePureDebtMinimumRepresentedAmountExcludingPayment(state, debtId, payment, opts);
  var remainingMinimum = Math.max(0, minp - representedWithoutThis.represented);
  return Math.max(0, amt - remainingMinimum);
}

/** Shadow-only debt step applied + scheduled intent (uses step.targetId when present). */
function geodePureDebtProgressForPlanStep(state, step, opts) {
  state = state && typeof state === 'object' ? state : {};
  step = step && typeof step === 'object' ? step : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var debtId = '';
  if (String(step.family || '') === 'debt' && step.targetId) debtId = String(step.targetId);
  else if (String(step.targetKind || '') === 'debt' && step.targetId) debtId = String(step.targetId);

  if (!debtId) {
    reasonCodes.push('no_debt_target');
    return {
      debtId: '',
      applied: 0,
      scheduledExtraTotal: 0,
      hasScheduledIntent: false,
      minimumCoverage: null,
      reasonCodes: reasonCodes
    };
  }

  var applied = geodePureDebtPaidExtraProgress(state, debtId, opts);
  var pay = Array.isArray(state.payments) ? state.payments : [];
  var scheduledExtraTotal = 0;
  var hasScheduledIntent = false;
  var pi;
  for (pi = 0; pi < pay.length; pi++) {
    var se = geodePureDebtScheduledExtraProgress(state, debtId, pay[pi], opts);
    if (se > 0) {
      hasScheduledIntent = true;
      scheduledExtraTotal += se;
    }
  }

  return {
    debtId: debtId,
    applied: applied,
    scheduledExtraTotal: scheduledExtraTotal,
    hasScheduledIntent: hasScheduledIntent,
    minimumCoverage: geodePureDebtMinimumRepresentedAmount(state, debtId, opts),
    reasonCodes: reasonCodes
  };
}

// ── PURE PLAN IDENTITY + SIGNATURE HELPERS (Stage 75E; shadow only, unwired) ─────────
// Contract: pure, deterministic from explicit inputs only; no globals, no storage/DOM/window, no mutation.
function geodePurePlanStepFamilyFromLabel(label) {
  var lb = String(label || '').trim();
  if (!lb) return 'unknown';
  if (lb.indexOf('Reduce high') === 0 || lb.indexOf('Pay down ') === 0) return 'debt';
  if (lb === 'Build your emergency fund') return 'buffer';
  if (lb.indexOf('Restart progress on ') === 0) return 'goal';
  if (lb.indexOf('Catch up on ') === 0) return 'goal';
  if (lb.indexOf('Invest what remains') === 0) return 'invest';
  return 'unknown';
}
function geodePurePlanStepKindFromLabel(label) {
  var lb = String(label || '').trim();
  if (!lb) return 'unknown';
  if (lb.indexOf('Reduce high') === 0) return 'debt_high_apr_extra';
  if (lb.indexOf('Pay down ') === 0) return 'debt_moderate_extra';
  if (lb === 'Build your emergency fund') return 'buffer_emergency';
  if (lb.indexOf('Restart progress on ') === 0) return 'goal_restart';
  if (lb.indexOf('Catch up on ') === 0) return 'goal_catch_up';
  if (lb.indexOf('Invest what remains') === 0) return 'invest_remainder';
  return 'unknown';
}
function geodePurePlanStepTargetFromLabel(step, state) {
  step = step && typeof step === 'object' ? step : {};
  state = state && typeof state === 'object' ? state : {};
  var label = String(step.label || '').trim();
  var family = geodePurePlanStepFamilyFromLabel(label);
  var out = {
    targetKind: '',
    targetId: '',
    targetName: '',
    matchMethod: 'none',
    confidence: 'low'
  };
  if (family === 'debt') {
    out.targetKind = 'debt';
    // Mirrors existing conventions, but stays pure (explicit state only).
    var debtName = '';
    if (label.indexOf('Reduce high') === 0) {
      var parts = label.split('interest ');
      debtName = parts.length > 1 ? String(parts[parts.length - 1] || '').trim() : '';
      out.matchMethod = 'label_split_interest';
    } else if (label.indexOf('Pay down ') === 0) {
      debtName = label.slice('Pay down '.length).trim();
      out.matchMethod = 'label_prefix_pay_down';
    }
    out.targetName = debtName;
    var debts = Array.isArray(state.debts) ? state.debts : [];
    for (var i = 0; i < debts.length; i++) {
      var d = debts[i];
      if (!d) continue;
      if (String(d.name || '').trim() === debtName) {
        out.targetId = d.id != null ? String(d.id) : '';
        out.matchMethod = out.matchMethod + '+name_exact';
        out.confidence = out.targetId ? 'high' : 'medium';
        return out;
      }
    }
    out.confidence = debtName ? 'medium' : 'low';
    return out;
  }
  if (family === 'goal') {
    out.targetKind = 'goal';
    var goalName = '';
    if (label.indexOf('Restart progress on ') === 0) {
      goalName = label.slice('Restart progress on '.length).trim();
      out.matchMethod = 'label_prefix_restart';
    } else if (label.indexOf('Catch up on ') === 0) {
      goalName = label.slice('Catch up on '.length).trim();
      out.matchMethod = 'label_prefix_catch_up';
    }
    out.targetName = goalName;
    var goals = Array.isArray(state.goals) ? state.goals : [];
    for (var j = 0; j < goals.length; j++) {
      var g = goals[j];
      if (!g) continue;
      if (String(g.name || '').trim() === goalName) {
        out.targetId = g.id != null ? String(g.id) : '';
        out.matchMethod = out.matchMethod + '+name_exact';
        out.confidence = out.targetId ? 'high' : 'medium';
        return out;
      }
    }
    out.confidence = goalName ? 'medium' : 'low';
    return out;
  }
  if (family === 'invest') {
    out.targetKind = 'investment';
    // Label does not currently embed investment identity; keep conservative.
    out.matchMethod = 'unresolvable_from_label';
    out.confidence = 'low';
    return out;
  }
  if (family === 'buffer') {
    out.targetKind = 'buffer';
    out.targetId = 'buffer:emergency';
    out.targetName = 'Emergency buffer';
    out.matchMethod = 'synthetic_singleton';
    out.confidence = 'medium';
    return out;
  }
  return out;
}
function geodePurePlanStepSignatureAmount(step) {
  step = step && typeof step === 'object' ? step : {};
  return Math.round(toNum(step.amount));
}
function geodePurePlanStepIdentity(step, state, opts) {
  step = step && typeof step === 'object' ? step : {};
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var monthKey = geodePureMonthKey(opts.monthKey);
  var label = String(step.label || '').trim();
  var family = geodePurePlanStepFamilyFromLabel(label);
  var kind = geodePurePlanStepKindFromLabel(label);
  var tgt = geodePurePlanStepTargetFromLabel(step, state);
  var signatureAmount = geodePurePlanStepSignatureAmount(step);
  var stepId = [
    'plan',
    monthKey || '',
    family || 'unknown',
    kind || 'unknown',
    tgt.targetKind || '',
    String(tgt.targetId || '')
  ].join(':');
  return {
    stepId: stepId,
    family: family,
    kind: kind,
    targetKind: tgt.targetKind,
    targetId: tgt.targetId,
    targetName: tgt.targetName,
    matchMethod: tgt.matchMethod,
    confidence: tgt.confidence,
    monthKey: monthKey,
    signatureAmount: signatureAmount
  };
}
function geodePurePlanSignatureFromSteps(steps, state, opts) {
  steps = Array.isArray(steps) ? steps : [];
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var parts = [];
  for (var i = 0; i < steps.length; i++) {
    var id = geodePurePlanStepIdentity(steps[i], state, opts);
    if (!id || !id.stepId) continue;
    parts.push(id.stepId + ':' + String(id.signatureAmount));
  }
  return parts.join('|');
}

// ── PURE PLAN DEPENDENCY MIRRORS (Stage 82B; shadow-only; ports production helpers) ──
// Contract: deterministic from explicit inputs; no globals, storage/DOM/window, no mutation.

function geodePureMonthlyInterest(debtOrApr, balance) {
  if (debtOrApr && typeof debtOrApr === 'object') {
    return (toNum(debtOrApr.apr) / 100 / 12) * toNum(debtOrApr.balance);
  }
  return (toNum(debtOrApr) / 100 / 12) * toNum(balance);
}

function geodePureStrategyConfig(strategy) {
  var m = {
    debt: { debtRatio: 0.55, goalRatio: 0.4, investRatio: 0.55, emergencyCapRatio: 0.4 },
    balanced: { debtRatio: 0.4, goalRatio: 0.5, investRatio: 0.7, emergencyCapRatio: 0.6 },
    growth: { debtRatio: 0.25, goalRatio: 0.55, investRatio: 0.85, emergencyCapRatio: 0.4 }
  };
  var k = strategy;
  if (!m[k]) k = 'balanced';
  return m[k];
}

/** Among debts with balance > 0 and APR above threshold, pick highest monthly interest cost (tie: larger balance). */
function geodePureSelectWorstHighAprDebt(debts, aprThreshold) {
  var list = debts || [];
  var thr = aprThreshold === undefined ? 10 : aprThreshold;
  var worst = null;
  var i, d, apr, bal, mi, wmi;
  for (i = 0; i < list.length; i++) {
    d = list[i];
    if (!d) continue;
    apr = toNum(d.apr);
    bal = toNum(d.balance);
    if (bal <= 0 || apr <= thr) continue;
    mi = geodePureMonthlyInterest(d.apr, bal);
    if (!worst) {
      worst = d;
      continue;
    }
    wmi = geodePureMonthlyInterest(worst.apr, worst.balance);
    if (mi > wmi || (mi === wmi && bal > toNum(worst.balance))) worst = d;
  }
  return worst;
}

/** Selects worst-APR debt at or above minApr (inclusive). */
function geodePureSelectWorstDebtAboveApr(debts, minApr) {
  var list = debts || [];
  var thr = minApr === undefined ? 5 : minApr;
  var worst = null;
  var i, d, apr, bal, mi, wmi;
  for (i = 0; i < list.length; i++) {
    d = list[i];
    if (!d) continue;
    apr = toNum(d.apr);
    bal = toNum(d.balance);
    if (bal <= 0 || apr < thr) continue;
    mi = geodePureMonthlyInterest(d.apr, bal);
    if (!worst) {
      worst = d;
      continue;
    }
    wmi = geodePureMonthlyInterest(worst.apr, worst.balance);
    if (mi > wmi || (mi === wmi && bal > toNum(worst.balance))) worst = d;
  }
  return worst;
}

function geodePureFinancialMemorySoftenedAmount(amount, multiplier, minUseful, allowSkip) {
  var amt = Math.max(0, Math.round(toNum(amount)));
  var m = Number(multiplier);
  if (!isFinite(m) || m >= 1 || amt <= 0) return amt;
  if (m <= 0) return allowSkip ? 0 : amt;
  var softened = Math.floor(amt * m);
  minUseful = Math.max(0, Number(minUseful) || 0);
  if (minUseful > 0 && softened < minUseful) {
    return allowSkip ? 0 : amt;
  }
  return Math.max(0, softened);
}

function geodePureIsEmergencyBufferGoal(goal) {
  if (!goal) return false;
  if (goal.cat === 'emergency') return true;
  var nm = String(goal.name || '').toLowerCase().trim();
  if (!nm) return false;
  if (nm === 'emergency' || nm === 'buffer') return true;
  if (nm.indexOf('emergency fund') >= 0) return true;
  if (nm.indexOf('safety buffer') >= 0) return true;
  if (nm.indexOf('rainy day') >= 0) return true;
  return false;
}

function geodePurePaymentNameLooksLikeBuffer(paymentOrName) {
  var s = String(
    paymentOrName && typeof paymentOrName === 'object' && paymentOrName.name != null
      ? paymentOrName.name
      : paymentOrName || ''
  )
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return false;
  var needles = [
    'emergency buffer',
    'safety buffer',
    'emergency fund',
    'starter buffer',
    'buffer payment',
    'buffer contribution',
    'emergency savings',
    'rainy day',
    'rainy-day'
  ];
  var i;
  for (i = 0; i < needles.length; i++) {
    if (s.indexOf(needles[i]) >= 0) return true;
  }
  return false;
}
