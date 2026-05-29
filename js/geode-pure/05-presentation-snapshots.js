// Beynd — pure presentation snapshots (Stage 05B)
// Extracted: Stage 80A suggested presentation shadow layer. Classic global script; requires 01-foundation.js and 03-suggested-snapshots.js.


// ── PURE SUGGESTED PRESENTATION SNAPSHOT (Stage 80A; overlay modelling only; shadow, unwired) ──
// Mirrors production presentation overlays after adaptive display: priority1 order, context, buffer, invest.
// Does not assign window._geodeSuggestedActions, route execution, persistence, or UI.

function geodePurePresentationShallowCloneRow(a) {
  if (!a || typeof a !== 'object') return {};
  var copy = {};
  var k;
  for (k in a) {
    if (Object.prototype.hasOwnProperty.call(a, k)) copy[k] = a[k];
  }
  return copy;
}

function geodePurePresentationBridgeAdaptiveRow(row) {
  row = row && typeof row === 'object' ? row : {};
  var bridged = geodePurePresentationShallowCloneRow(row);
  var amt =
    bridged.displayAmount != null
      ? toNum(bridged.displayAmount)
      : bridged.amount != null
        ? toNum(bridged.amount)
        : bridged.suggestedAmount != null
          ? toNum(bridged.suggestedAmount)
          : toNum(bridged.planAmount);
  bridged.amount = amt;
  bridged.presentationAmount = amt;
  if (bridged.subtitleOverride != null && String(bridged.subtitleOverride) !== '') {
    bridged.subtitle = String(bridged.subtitleOverride);
  }
  return bridged;
}

function geodePurePresentationContextFlags(state, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  state = state && typeof state === 'object' ? state : {};
  if (opts.contextFlags && typeof opts.contextFlags === 'object') {
    return {
      noIncome: !!opts.contextFlags.noIncome,
      irregularIncome: !!opts.contextFlags.irregularIncome,
      hasDependants: !!opts.contextFlags.hasDependants
    };
  }
  var noIncome = !geodePureHasPositiveIncome(state);
  return {
    noIncome: noIncome,
    irregularIncome: String(state.incomeType || '') === 'irregular',
    hasDependants: !!state.hasDependants
  };
}

function geodePurePriority1StepFromPlan(planSnapshot) {
  planSnapshot = planSnapshot && typeof planSnapshot === 'object' ? planSnapshot : {};
  if (planSnapshot.priority1 && typeof planSnapshot.priority1 === 'object') return planSnapshot.priority1;
  if (planSnapshot.priorityStep && typeof planSnapshot.priorityStep === 'object') return planSnapshot.priorityStep;
  var steps = Array.isArray(planSnapshot.steps) ? planSnapshot.steps : [];
  return steps.length ? steps[0] : null;
}

function geodePurePriority1ActionTypeFromStep(step) {
  step = step && typeof step === 'object' ? step : {};
  if (step.family != null && String(step.family)) {
    return geodePureSuggestedActionTypeFromFamily(String(step.family));
  }
  var lb = String(step.label || '');
  if (!lb) return '';
  if (lb.indexOf('Reduce high') === 0) return 'debt_payment';
  if (lb === 'Build your emergency fund') return 'buffer_contribution';
  if (lb.indexOf('Restart progress on ') === 0 || lb.indexOf('Catch up on ') === 0) return 'goal_contribution';
  if (lb.indexOf('Invest what remains') === 0) return 'investment_contribution';
  return '';
}

function geodePureOrderSuggestedActionsForPriority1(actions, planSnapshot, state, opts) {
  var step = geodePurePriority1StepFromPlan(planSnapshot);
  var list = (actions || []).slice();
  if (!step || !list.length) {
    return { actions: list, priority1ReorderApplied: false, reasonCodes: ['priority1_step_missing'] };
  }
  var p1Type = geodePurePriority1ActionTypeFromStep(step);
  if (!p1Type) {
    return { actions: list, priority1ReorderApplied: false, reasonCodes: ['priority1_type_unresolved'] };
  }
  var wantId = step.targetId != null ? String(step.targetId) : '';
  if (!wantId && state && typeof state === 'object') {
    var ident = geodePurePlanStepIdentity(step, state, opts || {});
    wantId = ident.targetId != null ? String(ident.targetId) : '';
  }
  var best = -1;
  var i;
  for (i = 0; i < list.length; i++) {
    if (list[i].type !== p1Type) continue;
    if (wantId && String(list[i].targetId || '') !== wantId) continue;
    best = i;
    break;
  }
  if (best <= 0) {
    return { actions: list, priority1ReorderApplied: false, reasonCodes: ['priority1_already_first_or_no_match'] };
  }
  var item = list.splice(best, 1)[0];
  list.unshift(item);
  return { actions: list, priority1ReorderApplied: true, reasonCodes: ['priority1_reordered'] };
}

function geodePureAdjustActionsForContext(actions, contextFlags) {
  contextFlags = contextFlags && typeof contextFlags === 'object' ? contextFlags : {};
  var out = [];
  var idx;
  for (idx = 0; idx < (actions || []).length; idx++) {
    var a = actions[idx];
    if (!a) continue;
    var copy = geodePurePresentationShallowCloneRow(a);
    if (!contextFlags.noIncome && copy.type === 'investment_contribution') {
      if (contextFlags.hasDependants && contextFlags.irregularIncome) {
        copy.title = 'Buffer first — income varies and others depend on you';
      } else if (contextFlags.hasDependants) {
        copy.title = 'Consider building a stronger buffer before investing';
      } else if (contextFlags.irregularIncome) {
        copy.title = 'Income varies — buffer before investing';
      }
    }
    out.push(copy);
  }
  return out;
}

function geodePureApplyBufferReadinessToActions(actions, bufferReadinessState) {
  var st = bufferReadinessState != null ? String(bufferReadinessState) : '';
  var list = actions || [];
  var out = [];
  var dropped = [];
  var syntheticPrompts = [];
  var i, a;
  for (i = 0; i < list.length; i++) {
    a = list[i];
    if (!a) continue;
    if (a.type !== 'buffer_contribution') {
      out.push(a);
      continue;
    }
    if (!st) {
      out.push(a);
      continue;
    }
    if (st === 'BUFFER_COMPLETE') {
      dropped.push({
        actionId: a.actionId != null ? String(a.actionId) : '',
        type: a.type,
        targetId: a.targetId != null ? String(a.targetId) : '',
        reason: 'BUFFER_COMPLETE'
      });
      continue;
    }
    if (st === 'NO_BUFFER_CONTEXT') {
      syntheticPrompts.push({
        promptKind: 'add_expenses_for_buffer',
        replacesActionId: a.actionId != null ? String(a.actionId) : ''
      });
      out.push({
        type: 'context_prompt',
        promptKind: 'add_expenses_for_buffer',
        title: 'Add monthly expenses to estimate your safety buffer',
        subtitle: 'Beynd needs a spending baseline before sizing a buffer.',
        amount: 0,
        presentationAmount: 0,
        _isBufferContextPrompt: true,
        presentationKind: 'context_prompt',
        overlayFlags: {
          isBufferContextPrompt: true,
          promptKind: 'add_expenses_for_buffer',
          bufferReadiness: st
        }
      });
      continue;
    }
    if (st === 'BUFFER_ESTIMATABLE') {
      var b1 = geodePurePresentationShallowCloneRow(a);
      b1.title = 'Start building your estimated safety buffer';
      b1.subtitle = 'Based on your monthly expenses';
      b1._bufferReadiness = 'BUFFER_ESTIMATABLE';
      out.push(b1);
      continue;
    }
    if (st === 'BUFFER_IN_PROGRESS_ESTIMATED') {
      var b1e = geodePurePresentationShallowCloneRow(a);
      b1e.title = 'Continue building your estimated safety buffer';
      b1e.subtitle = 'You\u2019ve already started — keep going';
      b1e._bufferReadiness = 'BUFFER_IN_PROGRESS_ESTIMATED';
      out.push(b1e);
      continue;
    }
    if (st === 'BUFFER_IN_PROGRESS') {
      var b2 = geodePurePresentationShallowCloneRow(a);
      b2.title = 'Continue building your safety buffer';
      b2.subtitle = 'Keep adding to your emergency fund';
      b2._bufferReadiness = 'BUFFER_IN_PROGRESS';
      out.push(b2);
      continue;
    }
    out.push(a);
  }
  return { actions: out, dropped: dropped, syntheticPrompts: syntheticPrompts };
}

function geodePureApplyInvestmentBehaviourToActions(actions, investmentBehaviourState) {
  var ib = investmentBehaviourState != null ? String(investmentBehaviourState) : '';
  var list = actions || [];
  var out = [];
  var i, a, c, ix, pack;
  for (i = 0; i < list.length; i++) {
    a = list[i];
    if (!a) continue;
    if (a.type !== 'investment_contribution') {
      out.push(a);
      continue;
    }
    c = geodePurePresentationShallowCloneRow(a);
    if (!ib || ib === 'NO_INVESTMENT_CONTEXT') {
      out.push(c);
      continue;
    }
    if (ib === 'INVESTMENT_WITH_PRESSURE' || ib === 'WITH_PRESSURE') {
      ix = Math.abs(String(c.targetId || '').length + Math.round(toNum(c.amount))) % 3;
      pack = [
        {
          title: 'Build your buffer before investing more',
          subtitle: 'Keep investing modestly while stabilising your essentials.',
          beh: 'WITH_PRESSURE'
        },
        {
          title: 'Keep investing modestly while stabilising essentials',
          subtitle: 'Debt and stability may need attention before increasing investments.',
          beh: 'WITH_PRESSURE'
        },
        {
          title: 'Maintain investment momentum',
          subtitle: 'Balance new contributions with debt and buffer priorities when cash is tight.',
          beh: 'WITH_PRESSURE'
        }
      ][ix];
      c.title = pack.title;
      c.subtitle = pack.subtitle;
      c._investBehaviour = pack.beh;
      out.push(c);
      continue;
    }
    if (ib === 'INVESTMENT_IN_PROGRESS' || ib === 'IN_PROGRESS') {
      c.title = 'Plan a contribution';
      c.subtitle = 'Build on the portfolio and contributions you already have.';
      c._investBehaviour = 'IN_PROGRESS';
      out.push(c);
      continue;
    }
    out.push(c);
  }
  return out;
}

function geodePurePresentationRouteHint(row) {
  row = row && typeof row === 'object' ? row : {};
  if (row.type === 'context_prompt' && row.promptKind === 'add_expenses_for_buffer') {
    return {
      kind: 'money_tab',
      promptKind: 'add_expenses_for_buffer',
      requiresPositiveAmount: false
    };
  }
  var amt = toNum(row.presentationAmount != null ? row.presentationAmount : row.amount);
  if (!(amt > 0)) {
    return { kind: 'none', requiresPositiveAmount: true };
  }
  return {
    kind: 'pay_modal',
    actionType: String(row.type || ''),
    requiresPositiveAmount: true,
    prefillKind: String(row.type || '')
  };
}

function geodePurePresentationFinalizeRow(row, reasonCodes) {
  row = row && typeof row === 'object' ? row : {};
  var flags = {
    bufferReadiness: row._bufferReadiness != null ? String(row._bufferReadiness) : null,
    investBehaviour: row._investBehaviour != null ? String(row._investBehaviour) : null,
    isBufferContextPrompt: !!row._isBufferContextPrompt,
    promptKind: row.promptKind != null ? String(row.promptKind) : null
  };
  var kind =
    row.presentationKind != null
      ? String(row.presentationKind)
      : row.type === 'context_prompt'
        ? 'context_prompt'
        : 'action';
  return Object.assign({}, row, {
    presentationTitle: String(row.title || '').trim(),
    presentationSubtitle: String(row.subtitle || '').trim(),
    presentationKind: kind,
    overlayFlags: flags,
    routeHint: geodePurePresentationRouteHint(row),
    reasonCodes: reasonCodes || []
  });
}

function geodePurePresentationRowKey(a) {
  if (!a) return '';
  if (a.actionId != null && String(a.actionId) !== '') return String(a.actionId);
  return [String(a.type || ''), String(a.targetId || '')].join('|');
}

function geodePureBuildPresentationByActionId(actions) {
  var map = {};
  var list = Array.isArray(actions) ? actions : [];
  var i, row, id;
  for (i = 0; i < list.length; i++) {
    row = list[i];
    if (!row) continue;
    id = row.actionId != null && String(row.actionId) !== '' ? String(row.actionId) : geodePurePresentationRowKey(row);
    if (!id) continue;
    map[id] = row;
  }
  return map;
}

/**
 * Shadow-only suggested presentation snapshot (Stage 80A).
 * Models production presentation overlays on cloned adaptive-display rows; no routing execution or persistence.
 */
function geodeSuggestedPresentationSnapshot(state, suggestedActionSnapshot, adaptiveDisplaySnapshot, opts) {
  state = state && typeof state === 'object' ? state : {};
  suggestedActionSnapshot =
    suggestedActionSnapshot && typeof suggestedActionSnapshot === 'object' ? suggestedActionSnapshot : {};
  adaptiveDisplaySnapshot =
    adaptiveDisplaySnapshot && typeof adaptiveDisplaySnapshot === 'object' ? adaptiveDisplaySnapshot : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(
    opts.monthKey || suggestedActionSnapshot.monthKey || adaptiveDisplaySnapshot.monthKey
  );
  var todayKey = geodePureDateKey(opts.today || suggestedActionSnapshot.today || adaptiveDisplaySnapshot.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');
  if (!adaptiveDisplaySnapshot.version) reasonCodes.push('adaptive_display_snapshot_missing');

  var planSnapshot = opts.planSnapshot && typeof opts.planSnapshot === 'object' ? opts.planSnapshot : {};
  var contextFlags = geodePurePresentationContextFlags(state, opts);
  var bufferReadinessState =
    opts.bufferReadinessState != null ? String(opts.bufferReadinessState) : '';
  var investmentBehaviourState =
    opts.investmentBehaviourState != null ? String(opts.investmentBehaviourState) : '';
  if (!bufferReadinessState) reasonCodes.push('buffer_readiness_state_missing_pass_through');
  if (!investmentBehaviourState) reasonCodes.push('investment_behaviour_state_missing_pass_through');

  var srcAdaptive = Array.isArray(adaptiveDisplaySnapshot.actions) ? adaptiveDisplaySnapshot.actions : [];
  var bridged = [];
  var ai;
  for (ai = 0; ai < srcAdaptive.length; ai++) {
    if (srcAdaptive[ai]) bridged.push(geodePurePresentationBridgeAdaptiveRow(srcAdaptive[ai]));
  }

  var orderRes = geodePureOrderSuggestedActionsForPriority1(bridged, planSnapshot, state, opts);
  var ordered = orderRes.actions || [];
  if (orderRes.reasonCodes && orderRes.reasonCodes.length) {
    reasonCodes = reasonCodes.concat(orderRes.reasonCodes);
  }

  var contextAdjusted = geodePureAdjustActionsForContext(ordered, contextFlags);
  var bufferRes = geodePureApplyBufferReadinessToActions(contextAdjusted, bufferReadinessState);
  var afterBuffer = bufferRes.actions || [];
  var investAdjusted = geodePureApplyInvestmentBehaviourToActions(afterBuffer, investmentBehaviourState);

  var outActions = [];
  var ri, row, finalized;
  for (ri = 0; ri < investAdjusted.length; ri++) {
    row = investAdjusted[ri];
    if (!row) continue;
    finalized = geodePurePresentationFinalizeRow(row, ['presentation_overlay_applied']);
    outActions.push(finalized);
  }

  return {
    version: 1,
    monthKey: monthKey,
    today: todayKey,
    actions: outActions,
    byActionId: geodePureBuildPresentationByActionId(outActions),
    primary: outActions[0] || null,
    secondary: outActions[1] || null,
    overlayState: {
      bufferReadinessState: bufferReadinessState || null,
      investmentBehaviourState: investmentBehaviourState || null,
      contextFlags: contextFlags,
      priority1ReorderApplied: !!orderRes.priority1ReorderApplied
    },
    dropped: bufferRes.dropped || [],
    syntheticPrompts: bufferRes.syntheticPrompts || [],
    sourceSignals: {
      usedSuggestedActionSnapshot: !!(suggestedActionSnapshot && suggestedActionSnapshot.version),
      usedAdaptiveDisplaySnapshot: !!(adaptiveDisplaySnapshot && adaptiveDisplaySnapshot.version),
      actionCountIn: srcAdaptive.length,
      actionCountOut: outActions.length,
      overlayStages: ['priority1_order', 'context_adjust', 'buffer_readiness', 'investment_behaviour']
    },
    reasonCodes: reasonCodes,
    audit: opts.audit === true
      ? {
          shadowOnly: true,
          limitations: [
            'presentation_overlay_only',
            'not_wired_to_production',
            'no_window_assignment',
            'no_route_execution',
            'no_persistence',
            'buffer_and_invest_state_from_opts',
            'does_not_mutate_input_snapshots'
          ],
          inputs: {
            monthKey: monthKey,
            today: todayKey,
            actionCountIn: srcAdaptive.length,
            actionCountOut: outActions.length
          }
        }
      : null
  };
}
