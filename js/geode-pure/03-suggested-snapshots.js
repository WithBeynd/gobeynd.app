// Beynd — pure suggested-action snapshots (Stage 03B)
// Extracted: Stage 78A suggested-action shadow layer. Classic global script; requires 01-foundation.js and 02-plan-snapshots.js.


// ── PURE SUGGESTED ACTION SNAPSHOT (Stage 78A; candidate generator only; shadow, unwired) ──
// Contract: deterministic from explicit inputs; no globals, storage/DOM/window, batch freeze, adaptive, or follow-through.

function geodePureHasPositiveIncome(state) {
  state = state && typeof state === 'object' ? state : {};
  return !!state.incomeExplicitlySet && toNum(state.income) > 0;
}

function geodePureSuggestedActionTypeFromFamily(family) {
  var f = String(family || '');
  if (f === 'debt') return 'debt_payment';
  if (f === 'buffer') return 'buffer_contribution';
  if (f === 'goal') return 'goal_contribution';
  if (f === 'invest') return 'investment_contribution';
  return '';
}

function geodePureSuggestedActionCopy(family, step, state) {
  var f = String(family || '');
  var tn = step && step.targetName != null ? String(step.targetName).trim() : '';
  if (f === 'debt') {
    return {
      title: 'Pay toward debt',
      subtitle: 'Plan an extra payment toward ' + (tn || 'debt')
    };
  }
  if (f === 'buffer') {
    state = state && typeof state === 'object' ? state : {};
    var eg = geodePureFirstEmergencyGoalFromState(state);
    var esv = eg ? toNum(eg.saved) : 0;
    if (eg && esv > 0) {
      return {
        title: 'Plan a contribution',
        subtitle: 'Start with a suggested contribution toward your safety buffer'
      };
    }
    return {
      title: 'Plan a contribution',
      subtitle: 'Plan a contribution toward your safety buffer'
    };
  }
  if (f === 'goal') {
    return {
      title: 'Contribute to goal',
      subtitle: 'Choose a contribution toward ' + (tn || 'your goal')
    };
  }
  if (f === 'invest') {
    return {
      title: 'Plan a contribution',
      subtitle: 'Start with a suggested contribution toward your portfolio'
    };
  }
  return { title: '', subtitle: '' };
}

function geodePureSuggestedCandidateFromPlanStep(state, step, progressSnapshot, opts) {
  state = state && typeof state === 'object' ? state : {};
  step = step && typeof step === 'object' ? step : {};
  progressSnapshot = progressSnapshot && typeof progressSnapshot === 'object' ? progressSnapshot : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var family =
    step.family != null && String(step.family)
      ? String(step.family)
      : geodePurePlanStepFamilyFromLabel(step.label);
  var type = geodePureSuggestedActionTypeFromFamily(family);
  if (!type) return null;
  var planAmount = toNum(step.amount);
  if (!(planAmount > 0)) return null;

  if (family === 'buffer') {
    var egBuf = geodePureFirstEmergencyGoalFromState(state);
    var esvBuf = egBuf ? toNum(egBuf.saved) : 0;
    if (egBuf && esvBuf >= 500) return null;
  }

  var targetId = step.targetId != null ? String(step.targetId) : '';
  var targetName = step.targetName != null ? String(step.targetName) : '';
  var targetKind = step.targetKind != null ? String(step.targetKind) : '';
  if (family === 'invest') {
    if (!targetId) targetId = geodePureResolveInvestTargetId(step, state);
    if (!targetName) {
      var inv0 = (Array.isArray(state.investments) ? state.investments : [])[0];
      targetName = inv0 && inv0.name != null ? String(inv0.name) : '';
    }
    if (!targetKind) targetKind = 'investment';
  }

  var copy = geodePureSuggestedActionCopy(family, step, state);
  var stepId = step.stepId != null ? String(step.stepId) : '';
  var seq = step.sequenceIndex != null ? Number(step.sequenceIndex) : null;
  var prog = stepId && progressSnapshot.byStepId ? progressSnapshot.byStepId[stepId] : null;
  var mem = !!(step.memorySoftened || step.softenedByMemory);
  var memCodes =
    step.memoryReasonCodes && Array.isArray(step.memoryReasonCodes) ? step.memoryReasonCodes.slice(0, 6) : [];

  return {
    actionId: [type, stepId, String(targetId), seq != null && isFinite(seq) ? String(seq) : ''].join('|'),
    type: type,
    family: family,
    stepId: stepId,
    sequenceIndex: seq != null && isFinite(seq) ? seq : null,
    targetKind: targetKind,
    targetId: targetId,
    targetName: targetName,
    planAmount: planAmount,
    progressPhase: prog && prog.phase ? String(prog.phase) : 'none',
    progressApplied: prog && typeof prog.applied === 'number' ? toNum(prog.applied) : 0,
    memorySoftened: mem,
    softenedByMemory: mem,
    memoryReasonCodes: memCodes,
    title: copy.title,
    subtitle: copy.subtitle,
    priorityScore: null,
    reasonCodes: []
  };
}

function geodePureSuggestedFreezeSignature(actions) {
  var parts = [];
  var i, x;
  for (i = 0; i < (actions || []).length; i++) {
    x = actions[i];
    if (!x || !x.type) continue;
    parts.push(
      [x.type, String(x.targetId || ''), Math.round(toNum(x.planAmount != null ? x.planAmount : x.amount))].join(':')
    );
  }
  return parts.join('|');
}

/** Stage 78A-1: coaching.json key paths only (no copy load). */
function geodePureSuggestedCoachingKeysForType(type) {
  var t = String(type || '');
  if (!t) return { titleKey: '', subtitleKey: '' };
  return {
    titleKey: 'suggestedActions.homeCardCopy.' + t + '.title',
    subtitleKey: 'suggestedActions.homeCardCopy.' + t + '.sub'
  };
}

/** Stage 78A-1/78A-2: additive contract fields; does not change amounts, order, or eligibility. */
function geodePureEnrichSuggestedActionContract(row, overlapCtx) {
  if (!row || typeof row !== 'object') return row;
  overlapCtx = overlapCtx && typeof overlapCtx === 'object' ? overlapCtx : {};
  var keys = geodePureSuggestedCoachingKeysForType(row.type);
  var amt = toNum(row.planAmount);
  var mainFam = String(overlapCtx.mainActionFamily || '');
  var priFam = String(overlapCtx.priorityFamily || '');
  var fam = String(row.family || '');
  return Object.assign({}, row, {
    titleKey: keys.titleKey,
    subtitleKey: keys.subtitleKey,
    suggestedAmount: amt,
    displayAmount: null,
    overlapWithFirstIncomplete: !!(mainFam && fam && fam === mainFam),
    overlapWithPriority: !!(priFam && fam && fam === priFam),
    sourceSignals: {
      contractStage: '78A-2',
      usesInlineTitleSubtitle: !!(row.title || row.subtitle),
      coachingKeysReferenceOnly: true,
      displayAmountDeferred: true
    }
  });
}

function geodePureSuggestedFamiliesCountFromCandidates(candidates) {
  var counts = { debt: 0, buffer: 0, goal: 0, invest: 0 };
  var list = Array.isArray(candidates) ? candidates : [];
  var i, fam;
  for (i = 0; i < list.length; i++) {
    fam = list[i] && list[i].family ? String(list[i].family) : '';
    if (fam === 'debt') counts.debt += 1;
    else if (fam === 'buffer') counts.buffer += 1;
    else if (fam === 'goal') counts.goal += 1;
    else if (fam === 'invest') counts.invest += 1;
  }
  return counts;
}

function geodePureSuggestedActionSnapshotFinish(base, candidates, actions, overlapCtx) {
  var enrichedCandidates = (candidates || []).map(function (c) {
    return geodePureEnrichSuggestedActionContract(c, overlapCtx);
  });
  var enrichedActions = (actions || []).map(function (a) {
    return geodePureEnrichSuggestedActionContract(a, overlapCtx);
  });
  return Object.assign({}, base, {
    candidates: enrichedCandidates,
    actions: enrichedActions,
    primary: enrichedActions[0] || null,
    secondary: enrichedActions[1] || null,
    families: geodePureSuggestedFamiliesCountFromCandidates(enrichedCandidates),
    freezeSignature: geodePureSuggestedFreezeSignature(enrichedActions)
  });
}

function geodePureSuggestedRebalanceContext(state, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  if (opts.rebalanceContext && typeof opts.rebalanceContext === 'object') {
    return Object.assign({}, opts.rebalanceContext);
  }
  state = state && typeof state === 'object' ? state : {};
  var eg = geodePureFirstEmergencyGoalFromState(state);
  var sv = eg ? toNum(eg.saved) : 0;
  return {
    recentDebtAction: false,
    recentGoalAction: false,
    recentInvestmentAction: false,
    recentInvestmentBalanceBump: false,
    bufferStarted: sv > 0,
    bufferAdequate: sv >= 500,
    hardDebtWarning: false,
    softDebtWarning: false,
    primaryGoalBehind: false
  };
}

/** E.5-style scoring on candidate rows (plan amounts unchanged). */
function geodePureRebalanceSuggestedCandidates(candidates, state, ctx) {
  if (!candidates || !candidates.length) return [];
  state = state && typeof state === 'object' ? state : {};
  ctx = ctx || geodePureSuggestedRebalanceContext(state, {});
  var rows = candidates.map(function (c) {
    var base =
      c.type === 'debt_payment' ? 100 : c.type === 'buffer_contribution' ? 80 : c.type === 'goal_contribution' ? 70 : 60;
    var adj = 0;
    if (c.type === 'debt_payment') {
      if (ctx.recentDebtAction) adj -= 25;
      if (ctx.hardDebtWarning) adj += 15;
    } else if (c.type === 'buffer_contribution') {
      if (ctx.bufferStarted) adj -= 30;
      if (ctx.bufferAdequate) adj -= 50;
    } else if (c.type === 'goal_contribution') {
      if (ctx.recentGoalAction) adj += 20;
      if (ctx.primaryGoalBehind) adj += 15;
    } else if (c.type === 'investment_contribution') {
      if (ctx.recentInvestmentAction) adj += 20;
      else if (ctx.recentInvestmentBalanceBump) adj += 8;
      if (state.planStrategy === 'growth') adj += 20;
      if (ctx.bufferStarted && ctx.recentDebtAction) adj += 10;
    }
    return Object.assign({}, c, { priorityScore: base + adj });
  });
  rows.sort(function (x, y) {
    return (y.priorityScore || 0) - (x.priorityScore || 0);
  });
  return rows;
}

/**
 * Shadow-only suggested-action candidate snapshot (Stage 78A).
 * Uses planSnapshot step metadata + progressSnapshot.byStepId; does not freeze, adapt, or follow-through.
 */
function geodeSuggestedActionSnapshot(state, planSnapshot, progressSnapshot, opts) {
  state = state && typeof state === 'object' ? state : {};
  planSnapshot = planSnapshot && typeof planSnapshot === 'object' ? planSnapshot : {};
  progressSnapshot = progressSnapshot && typeof progressSnapshot === 'object' ? progressSnapshot : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey || planSnapshot.monthKey);
  var todayKey = geodePureDateKey(opts.today || planSnapshot.today);
  var maxActions =
    opts.maxActions != null && isFinite(Number(opts.maxActions)) ? Math.max(0, Math.floor(Number(opts.maxActions))) : 2;
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var emptyBase = {
    version: 1,
    monthKey: monthKey,
    today: todayKey,
    planSignature: planSnapshot.planSignature != null ? String(planSnapshot.planSignature) : '',
    maxActions: maxActions,
    rebalance: { applied: false, context: null, reasonCodes: ['skipped'] },
    overlapHints: {
      mainActionFamily: '',
      priorityStepFamily: '',
      dedupeWithMainAction: false,
      reasonCodes: []
    },
    sourceSignals: {
      usedPlanSnapshot: true,
      usedProgressSnapshot: !!(progressSnapshot && progressSnapshot.byStepId),
      labelFallbackUsed: false
    },
    reasonCodes: reasonCodes.slice(),
    audit: opts.audit === true
      ? {
          shadowOnly: true,
          limitations: [
            'candidate_generator_only',
            'not_wired_to_production',
            'no_adaptive_display',
            'no_batch_freeze',
            'no_followthrough',
            'rebalance_context_conservative_without_opts_rebalanceContext'
          ],
          inputs: { monthKey: monthKey, today: todayKey, maxActions: maxActions }
        }
      : null
  };

  if (!geodePureHasPositiveIncome(state)) {
    reasonCodes.push('no_positive_income');
    emptyBase.reasonCodes = reasonCodes;
    return geodePureSuggestedActionSnapshotFinish(emptyBase, [], [], {
      mainActionFamily: '',
      priorityFamily: ''
    });
  }

  var steps = Array.isArray(planSnapshot.steps) ? planSnapshot.steps : [];
  if (!steps.length) reasonCodes.push('no_plan_steps');

  var debtC = null;
  var bufC = null;
  var goalC = null;
  var invC = null;
  var labelFallbackUsed = false;
  var si, stp, cand;
  for (si = 0; si < steps.length; si++) {
    stp = steps[si];
    if (!stp) continue;
    if (!(stp.family != null && String(stp.family)) && stp.label) labelFallbackUsed = true;
    cand = geodePureSuggestedCandidateFromPlanStep(state, stp, progressSnapshot, opts);
    if (!cand) continue;
    if (cand.family === 'debt') debtC = cand;
    else if (cand.family === 'buffer') bufC = cand;
    else if (cand.family === 'goal') goalC = cand;
    else if (cand.family === 'invest') invC = cand;
  }

  var candidates = [];
  if (debtC) candidates.push(debtC);
  if (bufC) candidates.push(bufC);
  if (goalC) candidates.push(goalC);
  if (invC) candidates.push(invC);

  var preCap = [];
  if (debtC) preCap.push(debtC);
  if (preCap.length < maxActions && bufC) preCap.push(bufC);
  if (preCap.length < maxActions && goalC) preCap.push(goalC);
  if (preCap.length < maxActions && invC) preCap.push(invC);

  var rebalanceCtx = geodePureSuggestedRebalanceContext(state, opts);
  var rebalanceReasonCodes = [];
  if (!opts.rebalanceContext) rebalanceReasonCodes.push('rebalance_context_conservative_default');

  var actions = geodePureRebalanceSuggestedCandidates(preCap.slice(), state, rebalanceCtx);
  actions = actions.slice(0, maxActions);

  var mainActionFamily = '';
  var fic = progressSnapshot.firstIncompleteStep;
  if (fic && fic.progress && fic.progress.family) mainActionFamily = String(fic.progress.family);
  else if (fic && fic.step && fic.step.family) mainActionFamily = String(fic.step.family);

  var priorityStepFamily = '';
  if (steps[0] && steps[0].family) priorityStepFamily = String(steps[0].family);
  else if (steps[0] && steps[0].label) priorityStepFamily = geodePurePlanStepFamilyFromLabel(steps[0].label);

  var priorityFamily = priorityStepFamily;
  var pic = progressSnapshot.priorityIncompleteStep;
  if (pic && pic.progress && pic.progress.family) priorityFamily = String(pic.progress.family);
  else if (pic && pic.step && pic.step.family) priorityFamily = String(pic.step.family);

  var overlapReasonCodes = [];
  var dedupeWithMainAction = false;
  if (actions.length && mainActionFamily && actions[0].family === mainActionFamily) {
    dedupeWithMainAction = true;
    overlapReasonCodes.push('first_action_matches_main_incomplete_family');
  }

  if (!candidates.length) reasonCodes.push('no_action_candidates');

  return geodePureSuggestedActionSnapshotFinish(
    {
      version: 1,
      monthKey: monthKey,
      today: todayKey,
      planSignature: planSnapshot.planSignature != null ? String(planSnapshot.planSignature) : '',
      maxActions: maxActions,
      rebalance: {
        applied: preCap.length > 0,
        context: rebalanceCtx,
        reasonCodes: rebalanceReasonCodes
      },
      overlapHints: {
        mainActionFamily: mainActionFamily,
        priorityStepFamily: priorityStepFamily,
        dedupeWithMainAction: dedupeWithMainAction,
        reasonCodes: overlapReasonCodes
      },
      sourceSignals: {
        usedPlanSnapshot: true,
        usedProgressSnapshot: !!(progressSnapshot && progressSnapshot.byStepId),
        labelFallbackUsed: labelFallbackUsed
      },
      reasonCodes: reasonCodes,
      audit: opts.audit === true
        ? {
            shadowOnly: true,
            limitations: [
              'candidate_generator_only',
              'not_wired_to_production',
              'no_adaptive_display',
              'no_batch_freeze',
              'no_followthrough',
              'rebalance_context_conservative_without_opts_rebalanceContext'
            ],
            inputs: { monthKey: monthKey, today: todayKey, maxActions: maxActions }
          }
        : null
    },
    candidates,
    actions,
    { mainActionFamily: mainActionFamily, priorityFamily: priorityFamily }
  );
}
