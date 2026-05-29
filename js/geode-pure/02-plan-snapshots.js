// Beynd — pure plan/progress snapshots (Stage 82D)
// Extracted: geodePlanSnapshot + Stage 77C progress helpers. Classic global script; requires 01-foundation.js.


// ── PURE PLAN SNAPSHOT (Stage 76B; minimal core; shadow only, unwired) ──────────────
// Contract: deterministic from explicit inputs only; no globals, no hidden time, no storage/DOM/window, no mutation.
// This is a decision-model core only: structured steps + signature; no progress / first-incomplete / UI copy.
function geodePlanSnapshot(state, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey);
  var todayKey = geodePureDateKey(opts.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var strategy = String(opts.strategy || state.planStrategy || 'balanced');
  var stratCfg = geodePureStrategyConfig(strategy);

  // Prefer explicit inputs from opts; fallback to pure derivations only.
  var cashflow = opts.cashflow && typeof opts.cashflow === 'object'
    ? opts.cashflow
    : geodePureMonthlyCashflow(state, { monthKey: monthKey, today: todayKey });
  var afford = opts.affordability && typeof opts.affordability === 'object' ? opts.affordability : null;
  var suggestableRoom =
    afford && typeof afford.suggestableRoom === 'number' && isFinite(afford.suggestableRoom)
      ? afford.suggestableRoom
      : cashflow && typeof cashflow.planRoom === 'number'
        ? cashflow.planRoom
        : 0;
  if (!afford) reasonCodes.push('affordability_fallback_cashflow');

  // Memory modifiers must be explicit (do not call memory profile/modifiers here).
  var mm = opts.memoryModifiers && typeof opts.memoryModifiers === 'object' ? opts.memoryModifiers : null;
  if (!mm) reasonCodes.push('memory_modifiers_missing_default_1x');
  var debtMult = mm && isFinite(Number(mm.debtExtraMultiplier)) ? Number(mm.debtExtraMultiplier) : 1;
  var goalMult = mm && isFinite(Number(mm.goalRecoveryMultiplier)) ? Number(mm.goalRecoveryMultiplier) : 1;
  var invMult = mm && isFinite(Number(mm.investmentMultiplier)) ? Number(mm.investmentMultiplier) : 1;
  var bufferPref = mm && typeof mm.bufferPreference === 'string' ? mm.bufferPreference : 'normal';

  // Lightweight “context” flags derived from explicit state only (no geodeCtx()).
  var incomeType = String(state.incomeType || 'stable');
  var isIrregular = incomeType === 'irregular';
  var hasDeps = !!state.hasDependants;
  if (isIrregular) {
    stratCfg = {
      debtRatio: Math.min(stratCfg.debtRatio, 0.35),
      goalRatio: stratCfg.goalRatio,
      investRatio: Math.max(stratCfg.investRatio - 0.2, 0.3),
      emergencyCapRatio: Math.min(stratCfg.emergencyCapRatio + 0.2, 0.8)
    };
  }
  if (hasDeps) {
    stratCfg = {
      debtRatio: stratCfg.debtRatio,
      goalRatio: stratCfg.goalRatio,
      investRatio: Math.max(stratCfg.investRatio - 0.15, 0.3),
      emergencyCapRatio: Math.max(stratCfg.emergencyCapRatio, 0.7)
    };
  }

  var debts = Array.isArray(state.debts) ? state.debts : [];
  var goals = Array.isArray(state.goals) ? state.goals : [];
  var investments = Array.isArray(state.investments) ? state.investments : [];

  var budget = Math.max(0, toNum(suggestableRoom));
  var steps = [];

  function pushStep(rawStep) {
    if (!rawStep || typeof rawStep.amount !== 'number') return;
    if (!(rawStep.amount > 0)) return;
    steps.push(rawStep);
  }
  function roundAmt(x) {
    return Math.max(0, Math.round(toNum(x)));
  }

  // Step: high-interest debt extra (APR > 10)
  var worstDebt = geodePureSelectWorstHighAprDebt(debts, 10);
  if (worstDebt && budget > 50) {
    var overpay0 = Math.min(roundAmt(budget * stratCfg.debtRatio), 500, roundAmt(worstDebt.balance));
    overpay0 = Math.max(overpay0, 50);
    var overpay = geodePureFinancialMemorySoftenedAmount(overpay0, debtMult, 50, false);
    if (overpay > 0 && budget >= overpay) {
      pushStep({
        priority: 1,
        label: 'Reduce high‑interest ' + String(worstDebt.name || 'debt'),
        amount: overpay,
        originalAmount: overpay0,
        memorySoftened: overpay < overpay0,
        memoryReasonCodes: mm && Array.isArray(mm.reasonCodes) ? mm.reasonCodes.slice(0, 6) : []
      });
      budget -= overpay;
    }
  }

  // Step: emergency buffer (only when no emergency goal exists)
  var hasEmergencyGoal = false;
  for (var gi = 0; gi < goals.length; gi++) {
    if (geodePureIsEmergencyBufferGoal(goals[gi])) { hasEmergencyGoal = true; break; }
  }
  if (!hasEmergencyGoal && budget > 0 && steps.length < 4) {
    var emCap = stratCfg.emergencyCapRatio;
    if (bufferPref === 'preserve') {
      emCap = Math.min(0.85, Math.max(emCap, emCap + 0.05));
    }
    var ef0 = Math.min(roundAmt(budget * emCap), budget);
    // Growth: reserve a small slice for goals when any goal exists.
    if (strategy === 'growth' && goals.length > 0) {
      var reserve = Math.min(50, roundAmt(budget * 0.1));
      ef0 = Math.min(ef0, Math.max(0, budget - reserve));
    }
    if (ef0 > 0) {
      pushStep({
        priority: 2,
        label: 'Build your emergency fund',
        amount: ef0,
        originalAmount: ef0,
        memorySoftened: false,
        memoryReasonCodes: []
      });
      budget -= ef0;
    }
  }

  // Step: moderate-interest debt (Debt-focused only, only when no high-interest step fired)
  var hasHighDebtStep = false;
  for (var si = 0; si < steps.length; si++) {
    if (steps[si] && String(steps[si].label || '').indexOf('Reduce high') === 0) { hasHighDebtStep = true; break; }
  }
  if (strategy === 'debt' && !hasHighDebtStep && budget > 50) {
    var moderateDebt = geodePureSelectWorstDebtAboveApr(debts, 5);
    if (moderateDebt) {
      var mod0 = Math.min(roundAmt(budget * stratCfg.debtRatio), 300, roundAmt(moderateDebt.balance));
      if (mod0 > 0) mod0 = Math.max(mod0, 50);
      var mod = geodePureFinancialMemorySoftenedAmount(mod0, debtMult, 50, false);
      if (mod > 0 && budget >= mod) {
        pushStep({
          priority: 2,
          label: 'Pay down ' + String(moderateDebt.name || 'debt'),
          amount: mod,
          originalAmount: mod0,
          memorySoftened: mod < mod0,
          memoryReasonCodes: mm && Array.isArray(mm.reasonCodes) ? mm.reasonCodes.slice(0, 6) : []
        });
        budget -= mod;
      }
    }
  }

  // Step: goal contribution (minimal, date-free). Prefer primary goal, else first.
  function pickPrimaryGoal(goals0) {
    for (var i = 0; i < goals0.length; i++) if (goals0[i] && goals0[i].isPrimary) return goals0[i];
    for (var j = 0; j < goals0.length; j++) if (goals0[j]) return goals0[j];
    return null;
  }
  var g0 = pickPrimaryGoal(goals);
  if (g0 && budget > 20) {
    var gTarget = toNum(g0.amount);
    var gSaved = toNum(g0.saved);
    var gRemaining = Math.max(0, gTarget - gSaved);
    if (gRemaining > 0) {
      var goal0 = Math.min(Math.max(20, roundAmt(budget * stratCfg.goalRatio)), roundAmt(gRemaining), budget);
      var goalAmt = geodePureFinancialMemorySoftenedAmount(goal0, goalMult, 20, false);
      if (goalAmt > 0 && budget >= goalAmt) {
        pushStep({
          priority: 2,
          label: 'Catch up on ' + String(g0.name || 'goal'),
          amount: goalAmt,
          originalAmount: goal0,
          memorySoftened: goalAmt < goal0,
          memoryReasonCodes: mm && Array.isArray(mm.reasonCodes) ? mm.reasonCodes.slice(0, 6) : []
        });
        budget -= goalAmt;
      }
    }
  }

  // Step: invest remainder
  if (budget > 50) {
    var inv0 = roundAmt(budget * stratCfg.investRatio);
    var invAmt = geodePureFinancialMemorySoftenedAmount(inv0, invMult, 50, true);
    if (invAmt > 0 && budget >= invAmt) {
      pushStep({
        priority: 3,
        label: 'Invest what remains',
        amount: invAmt,
        originalAmount: inv0,
        memorySoftened: invAmt < inv0,
        memoryReasonCodes: mm && Array.isArray(mm.reasonCodes) ? mm.reasonCodes.slice(0, 6) : []
      });
      budget -= invAmt;
    }
  }

  // Stable ordering: by priority then insertion order. Attach sequenceIndex and identity metadata.
  steps.sort(function (a, b) {
    var pa = a && a.priority != null ? a.priority : 9;
    var pb = b && b.priority != null ? b.priority : 9;
    if (pa !== pb) return pa - pb;
    return 0;
  });
  var outSteps = [];
  for (var k = 0; k < steps.length; k++) {
    var st = steps[k];
    if (!st) continue;
    var ident = geodePurePlanStepIdentity(st, state, { monthKey: monthKey });
    outSteps.push(Object.assign({}, st, {
      sequenceIndex: k,
      stepId: ident.stepId,
      family: ident.family,
      kind: ident.kind,
      targetKind: ident.targetKind,
      targetId: ident.targetId,
      targetName: ident.targetName,
      signatureAmount: ident.signatureAmount,
      matchMethod: ident.matchMethod,
      confidence: ident.confidence
    }));
  }
  var planSignature = geodePurePlanSignatureFromSteps(outSteps, state, { monthKey: monthKey });

  return {
    version: 1,
    monthKey: monthKey,
    today: todayKey,
    steps: outSteps,
    firstIncompleteStep: null,
    priorityStep: null,
    planSignature: planSignature,
    totals: null,
    progress: null,
    affordability: afford
      ? Object.assign({}, afford, { _source: 'opts' })
      : { suggestableRoom: toNum(suggestableRoom), _source: 'cashflow', monthKey: monthKey, today: todayKey },
    posture: null,
    memoryModifiers: mm
      ? {
          debtExtraMultiplier: debtMult,
          goalRecoveryMultiplier: goalMult,
          investmentMultiplier: invMult,
          bufferPreference: bufferPref,
          reasonCodes: Array.isArray(mm.reasonCodes) ? mm.reasonCodes.slice(0, 12) : [],
          confidence: typeof mm.confidence === 'string' ? String(mm.confidence) : 'unknown'
        }
      : null,
    sequencing: {
      strategy: strategy,
      ratios: Object.assign({}, stratCfg),
      budget: {
        suggestableRoom: toNum(suggestableRoom),
        initialBudget: toNum(suggestableRoom),
        remainingBudget: toNum(budget)
      }
    },
    caps: {
      floors: { debt: 50, goal: 20, invest: 50, buffer: 25 }
    },
    sourceSignals: {
      usedMonthKey: !!monthKey,
      usedToday: !!todayKey,
      usedAffordability: !!afford,
      usedCashflowFallback: !afford,
      usedMemoryModifiers: !!mm,
      strategy: strategy,
      isIrregular: isIrregular,
      hasDependants: hasDeps,
      hasDebts: debts.length > 0,
      hasGoals: goals.length > 0,
      hasInvestments: investments.length > 0
    },
    reasonCodes: reasonCodes.slice(),
    audit: opts.audit === true ? {
      shadowOnly: true,
      limitations: [
        'no_progress',
        'no_first_incomplete_step',
        'no_priority_step',
        'no_computeAffordabilityContext',
        'no_memory_modifiers_derivation',
        'goal_logic_simplified',
        'buffer_logic_simplified'
      ],
      inputs: {
        monthKey: monthKey,
        today: todayKey
      }
    } : null
  };
}

// ── PURE PLAN PROGRESS SNAPSHOT (Stage 77C; shadow only, unwired) ───────────────────
// Contract: deterministic from explicit inputs; uses planSnapshot step metadata (stepId/family/targetId), not labels.
function geodePureFirstEmergencyGoalFromState(state) {
  state = state && typeof state === 'object' ? state : {};
  var list = Array.isArray(state.goals) ? state.goals : [];
  for (var i = 0; i < list.length; i++) {
    var g = list[i];
    if (g && geodePureIsEmergencyBufferGoal(g)) return g;
  }
  return null;
}

function geodePureSumConfirmedForGoalId(state, goalId, opts) {
  if (!goalId) return 0;
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var sum = 0;
  var pay = Array.isArray(state.payments) ? state.payments : [];
  for (var i = 0; i < pay.length; i++) {
    var p = pay[i];
    if (!p || String(p.goalId || '') !== String(goalId)) continue;
    sum += geodePurePaymentConfirmedAmountForMonth(p, opts);
  }
  return sum;
}

function geodePureSumConfirmedForInvestId(state, investId, opts) {
  if (!investId) return 0;
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var sum = 0;
  var pay = Array.isArray(state.payments) ? state.payments : [];
  for (var i = 0; i < pay.length; i++) {
    var p = pay[i];
    if (!p || String(p.investId || '') !== String(investId)) continue;
    sum += geodePurePaymentConfirmedAmountForMonth(p, opts);
  }
  return sum;
}

function geodePureSumBufferContributions(state, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var eg = geodePureFirstEmergencyGoalFromState(state);
  var sum = 0;
  var pay = Array.isArray(state.payments) ? state.payments : [];
  for (var i = 0; i < pay.length; i++) {
    var p = pay[i];
    if (!p) continue;
    var confirmed = geodePurePaymentConfirmedAmountForMonth(p, opts);
    if (!(confirmed > 0)) continue;
    if (eg && p.goalId && String(p.goalId) === String(eg.id)) sum += confirmed;
    else if (geodePurePaymentNameLooksLikeBuffer(p.name)) sum += confirmed;
  }
  return sum;
}

function geodePureResolveInvestTargetId(step, state) {
  step = step && typeof step === 'object' ? step : {};
  state = state && typeof state === 'object' ? state : {};
  if (step.targetId && (String(step.family || '') === 'invest' || String(step.targetKind || '') === 'investment')) {
    return String(step.targetId);
  }
  var inv = Array.isArray(state.investments) ? state.investments : [];
  if (inv[0] && inv[0].id != null) return String(inv[0].id);
  return '';
}

/** Per-step progress from structured metadata (mirrors geodePlanStepProgress phase rules). */
function geodePurePlanStepProgressCore(state, step, opts) {
  state = state && typeof state === 'object' ? state : {};
  step = step && typeof step === 'object' ? step : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var sug = toNum(step.amount);
  var family = String(step.family || '');
  var targetKind = String(step.targetKind || '');
  var targetId = step.targetId != null ? String(step.targetId) : '';
  var applied = 0;
  var scheduledIntent = 0;
  var hasScheduledIntent = false;
  var debtExtra = null;
  var sourceSignals = { family: family, targetKind: targetKind, targetId: targetId };

  if (!family && step.label) {
    family = geodePurePlanStepFamilyFromLabel(step.label);
    reasonCodes.push('family_from_label_fallback');
  }
  if (!targetId && step.label && family !== 'unknown') {
    var ident = geodePurePlanStepIdentity(step, state, opts);
    targetId = ident.targetId || '';
    targetKind = ident.targetKind || targetKind;
    if (ident.matchMethod) sourceSignals.matchMethod = ident.matchMethod;
  }

  if (sug <= 0) {
    return {
      suggested: sug,
      applied: 0,
      scheduledIntent: 0,
      hasScheduledIntent: false,
      remaining: 0,
      ratio: 0,
      phase: 'none',
      displayPhase: 'none',
      debtExtra: null,
      sourceSignals: sourceSignals,
      reasonCodes: reasonCodes.concat(['no_suggested_amount'])
    };
  }

  var pay = Array.isArray(state.payments) ? state.payments : [];
  var pi;

  if (family === 'debt' && targetId) {
    applied = geodePureDebtPaidExtraProgress(state, targetId, opts);
    for (pi = 0; pi < pay.length; pi++) {
      var se = geodePureDebtScheduledExtraProgress(state, targetId, pay[pi], opts);
      if (se > 0) {
        hasScheduledIntent = true;
        scheduledIntent += se;
      }
    }
    debtExtra = {
      paidExtra: applied,
      scheduledExtraTotal: scheduledIntent,
      minimumCoverage: geodePureDebtMinimumRepresentedAmount(state, targetId, opts)
    };
    sourceSignals.debtId = targetId;
  } else if (family === 'buffer') {
    applied = geodePureSumBufferContributions(state, opts);
    var egBuf = geodePureFirstEmergencyGoalFromState(state);
    for (pi = 0; pi < pay.length; pi++) {
      var pb = pay[pi];
      if (!pb || pb.status === 'paid') continue;
      var stb = geodePurePaymentEffectiveStatus(pb, opts);
      if (stb !== 'upcoming' && stb !== 'overdue') continue;
      if (!geodePurePaymentCountsForMonth(pb, opts)) continue;
      var bufHit = false;
      if (geodePurePaymentNameLooksLikeBuffer(pb.name)) bufHit = true;
      else if (!pb.goalId && !pb.debtId && !pb.investId && String(pb.payKind || '') === 'buffer') bufHit = true;
      else if (String(pb.name || '').toLowerCase().indexOf('buffer') >= 0) bufHit = true;
      else if (egBuf && pb.goalId && String(pb.goalId) === String(egBuf.id)) bufHit = true;
      if (bufHit) {
        hasScheduledIntent = true;
        scheduledIntent += toNum(pb.amount);
      }
    }
    sourceSignals.bufferTarget = targetId || 'buffer:emergency';
  } else if (family === 'goal' && targetId) {
    applied = geodePureSumConfirmedForGoalId(state, targetId, opts);
    for (pi = 0; pi < pay.length; pi++) {
      var pg = pay[pi];
      if (!pg || pg.status === 'paid') continue;
      var stg = geodePurePaymentEffectiveStatus(pg, opts);
      if (stg !== 'upcoming' && stg !== 'overdue') continue;
      if (!geodePurePaymentCountsForMonth(pg, opts)) continue;
      if (String(pg.goalId || '') === String(targetId)) {
        hasScheduledIntent = true;
        scheduledIntent += toNum(pg.amount);
      }
    }
    sourceSignals.goalId = targetId;
  } else if (family === 'invest') {
    var invId = geodePureResolveInvestTargetId(step, state);
    applied = geodePureSumConfirmedForInvestId(state, invId, opts);
    for (pi = 0; pi < pay.length; pi++) {
      var pv = pay[pi];
      if (!pv || pv.status === 'paid') continue;
      var stv = geodePurePaymentEffectiveStatus(pv, opts);
      if (stv !== 'upcoming' && stv !== 'overdue') continue;
      if (!geodePurePaymentCountsForMonth(pv, opts)) continue;
      if (invId && String(pv.investId || '') === String(invId)) {
        hasScheduledIntent = true;
        scheduledIntent += toNum(pv.amount);
      }
    }
    sourceSignals.investId = invId;
    if (!invId) reasonCodes.push('invest_target_unresolved');
  } else {
    reasonCodes.push('unknown_or_unsupported_family');
  }

  var remaining = Math.max(0, sug - applied);
  var ratio = sug > 0 ? Math.min(1, applied / sug) : 0;
  var phase = 'none';
  if (applied <= 0) phase = hasScheduledIntent ? 'partial' : 'none';
  else if (remaining < 1) phase = 'done';
  else phase = 'partial';

  var displayPhase = phase;
  if (phase === 'partial' && applied <= 0) displayPhase = 'scheduled';

  return {
    suggested: sug,
    applied: applied,
    scheduledIntent: scheduledIntent,
    hasScheduledIntent: hasScheduledIntent,
    remaining: remaining,
    ratio: ratio,
    phase: phase,
    displayPhase: displayPhase,
    debtExtra: debtExtra,
    sourceSignals: sourceSignals,
    reasonCodes: reasonCodes
  };
}

function geodePlanProgressSnapshot(state, planSnapshot, opts) {
  state = state && typeof state === 'object' ? state : {};
  planSnapshot = planSnapshot && typeof planSnapshot === 'object' ? planSnapshot : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey || planSnapshot.monthKey);
  var todayKey = geodePureDateKey(opts.today || planSnapshot.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var progressOpts = { monthKey: monthKey, today: todayKey };
  if (opts.assumeSingleDebtMinimum === true) progressOpts.assumeSingleDebtMinimum = true;

  var steps = Array.isArray(planSnapshot.steps) ? planSnapshot.steps.slice() : [];
  steps.sort(function (a, b) {
    var ia = a && a.sequenceIndex != null ? a.sequenceIndex : 999;
    var ib = b && b.sequenceIndex != null ? b.sequenceIndex : 999;
    return ia - ib;
  });

  var byStepId = {};
  var completedSteps = [];
  var incompleteSteps = [];
  var partialSteps = [];
  var scheduledSteps = [];
  var meaningfulCount = 0;
  var completedCount = 0;

  var protectedMinimumCoverage = { byDebtId: {} };
  var debtExtraCoverage = { byDebtId: {} };
  var contributionCoverage = { byTargetKey: {} };

  var si;
  for (si = 0; si < steps.length; si++) {
    var step = steps[si];
    if (!step) continue;
    var stepId = step.stepId != null ? String(step.stepId) : '';
    if (!stepId) {
      var identFallback = geodePurePlanStepIdentity(step, state, progressOpts);
      stepId = identFallback.stepId || '';
    }
    if (!stepId) {
      reasonCodes.push('step_missing_stepId');
      continue;
    }

    var core = geodePurePlanStepProgressCore(state, step, progressOpts);
    var sugAmt = toNum(step.amount);

    if (sugAmt > 0) meaningfulCount++;

    var famRow = String(step.family || '');
    var tidRow = step.targetId != null ? String(step.targetId) : '';
    var minProtectedAmt =
      core.debtExtra && core.debtExtra.minimumCoverage
        ? toNum(core.debtExtra.minimumCoverage.represented)
        : 0;

    byStepId[stepId] = {
      stepId: stepId,
      sequenceIndex: step.sequenceIndex != null ? step.sequenceIndex : si,
      family: famRow,
      kind: String(step.kind || ''),
      targetId: tidRow,
      targetKind: String(step.targetKind || ''),
      suggested: core.suggested,
      applied: core.applied,
      scheduledIntent: core.scheduledIntent,
      scheduledAmount: core.scheduledIntent,
      completedAmount: core.applied,
      minimumProtectedAmount: minProtectedAmt,
      extraEligibleAmount: core.applied,
      hasScheduledIntent: core.hasScheduledIntent,
      hasCompletedIntent: core.applied > 0,
      remaining: core.remaining,
      ratio: core.ratio,
      phase: core.phase,
      displayPhase: core.displayPhase,
      debtExtra: core.debtExtra,
      sourceSignals: core.sourceSignals,
      reasonCodes: core.reasonCodes
    };

    if (core.phase === 'done') {
      completedSteps.push(stepId);
      if (sugAmt > 0) completedCount++;
    } else if (sugAmt > 0) {
      incompleteSteps.push(stepId);
    }
    if (core.phase === 'partial') partialSteps.push(stepId);
    if (core.displayPhase === 'scheduled' || (core.hasScheduledIntent && core.applied <= 0)) {
      scheduledSteps.push(stepId);
    }

    var fam = famRow;
    var tid = tidRow;
    if (fam === 'debt' && tid) {
      if (!protectedMinimumCoverage.byDebtId[tid]) {
        protectedMinimumCoverage.byDebtId[tid] = geodePureDebtMinimumRepresentedAmount(state, tid, progressOpts);
      }
      debtExtraCoverage.byDebtId[tid] = {
        debtId: tid,
        paidExtra: core.applied,
        scheduledExtraTotal: core.scheduledIntent,
        minimumCoverage: protectedMinimumCoverage.byDebtId[tid]
      };
    } else if (fam === 'goal' && tid) {
      var gKey = 'goal:' + tid;
      contributionCoverage.byTargetKey[gKey] = {
        targetKind: 'goal',
        targetId: tid,
        confirmedThisMonth: core.applied,
        scheduledThisMonth: core.scheduledIntent
      };
    } else if (fam === 'invest') {
      var invResolved = geodePureResolveInvestTargetId(step, state);
      if (invResolved) {
        var iKey = 'investment:' + invResolved;
        contributionCoverage.byTargetKey[iKey] = {
          targetKind: 'investment',
          targetId: invResolved,
          confirmedThisMonth: core.applied,
          scheduledThisMonth: core.scheduledIntent
        };
      }
    } else if (fam === 'buffer') {
      contributionCoverage.byTargetKey['buffer:emergency'] = {
        targetKind: 'buffer',
        targetId: tid || 'buffer:emergency',
        confirmedThisMonth: core.applied,
        scheduledThisMonth: core.scheduledIntent
      };
    }
  }

  var firstIncompleteStep = null;
  var priorityIncompleteStep = null;
  for (si = 0; si < steps.length; si++) {
    var stInc = steps[si];
    if (!stInc || toNum(stInc.amount) <= 0) continue;
    var sid = stInc.stepId != null ? String(stInc.stepId) : '';
    if (!sid) continue;
    var progInc = byStepId[sid];
    if (!progInc || progInc.phase === 'done') continue;
    var incPayload = {
      stepId: sid,
      sequenceIndex: progInc.sequenceIndex,
      step: stInc,
      progress: progInc
    };
    if (!firstIncompleteStep) firstIncompleteStep = incPayload;
    if (!priorityIncompleteStep) priorityIncompleteStep = incPayload;
    break;
  }

  var completionRate = meaningfulCount > 0 ? completedCount / meaningfulCount : 0;

  return {
    version: 1,
    monthKey: monthKey,
    today: todayKey,
    planSignature: planSnapshot.planSignature != null ? String(planSnapshot.planSignature) : '',
    byStepId: byStepId,
    completionRate: completionRate,
    completedSteps: completedSteps,
    incompleteSteps: incompleteSteps,
    partialSteps: partialSteps,
    scheduledSteps: scheduledSteps,
    firstIncompleteStep: firstIncompleteStep,
    priorityIncompleteStep: priorityIncompleteStep,
    protectedMinimumCoverage: protectedMinimumCoverage,
    contributionCoverage: contributionCoverage,
    debtExtraCoverage: debtExtraCoverage,
    sourceSignals: {
      stepCount: steps.length,
      meaningfulStepCount: meaningfulCount,
      usedPlanSnapshot: true,
      usedStructuredMetadata: true
    },
    reasonCodes: reasonCodes,
    audit: opts.audit === true
      ? {
          shadowOnly: true,
          limitations: ['not_wired_to_production', 'invest_target_may_fallback_first_instrument'],
          inputs: { monthKey: monthKey, today: todayKey }
        }
      : null
  };
}
