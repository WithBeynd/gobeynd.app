// Beynd — pure adaptive snapshots (Stage 04B)
// Extracted: Stage 79A mode + 79B display shadow layers. Classic global script; requires 01-foundation.js.


// ── PURE ADAPTIVE MODE SNAPSHOT (Stage 79A; mode selection only; shadow, unwired) ──
// Contract: recommends per-family adaptive modes from follow-through history; no amounts, subtitles, persistence, or S.

var GEODE_PURE_ADAPTIVE_MIN_EVIDENCE = 3;
var GEODE_PURE_ADAPTIVE_ROLL_WINDOW = 5;

function geodePureFollowthroughOutcomeIsTracked(outcome) {
  return outcome === 'followed' || outcome === 'partial' || outcome === 'ignored';
}

function geodePureFollowthroughFamilyFromActionType(actionType) {
  if (actionType === 'debt_payment') return 'debt';
  if (actionType === 'goal_contribution') return 'goal';
  if (actionType === 'investment_contribution') return 'invest';
  if (actionType === 'buffer_contribution') return 'buffer';
  return null;
}

function geodePureAdaptiveOutcomeRollPoints(outcome) {
  if (outcome === 'followed') return 1;
  if (outcome === 'partial') return 0.5;
  return 0;
}

function geodePureAdaptiveTrailingFollowedStreak(recentOldestFirst) {
  var c = 0;
  var j;
  var list = recentOldestFirst || [];
  for (j = list.length - 1; j >= 0; j--) {
    if (list[j].outcome === 'followed') c++;
    else break;
  }
  return c;
}

function geodePureFollowthroughRecentForFamily(state, family, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var fam = String(family || '');
  if (fam !== 'debt' && fam !== 'goal' && fam !== 'invest' && fam !== 'buffer') return [];
  var maxN =
    opts.maxN != null && isFinite(Number(opts.maxN))
      ? Math.max(1, Math.floor(Number(opts.maxN)))
      : opts.windowSize != null && isFinite(Number(opts.windowSize))
        ? Math.max(1, Math.floor(Number(opts.windowSize)))
        : GEODE_PURE_ADAPTIVE_ROLL_WINDOW;
  var hist = Array.isArray(state.followthroughOutcomeHistory) ? state.followthroughOutcomeHistory : [];
  var rows = [];
  var i, row, f;
  for (i = 0; i < hist.length; i++) {
    row = hist[i];
    if (!row || typeof row.ts !== 'number') continue;
    if (!geodePureFollowthroughOutcomeIsTracked(row.outcome)) continue;
    f = geodePureFollowthroughFamilyFromActionType(row.type);
    if (f !== fam) continue;
    rows.push({ outcome: row.outcome, ts: row.ts });
  }
  rows.sort(function (a, b) {
    return a.ts - b.ts;
  });
  if (rows.length > maxN) rows = rows.slice(-maxN);
  return rows;
}

function geodePureAdaptiveRollRawTier(recent, opts) {
  opts = opts && typeof opts === 'object' ? opts : {};
  var minEvidence =
    opts.minEvidence != null && isFinite(Number(opts.minEvidence))
      ? Math.max(1, Math.floor(Number(opts.minEvidence)))
      : GEODE_PURE_ADAPTIVE_MIN_EVIDENCE;
  var n = recent ? recent.length : 0;
  if (n < minEvidence) return 'full';
  if (geodePureAdaptiveTrailingFollowedStreak(recent) >= 3) return 'full';
  var sum = 0;
  var i;
  for (i = 0; i < n; i++) {
    sum += geodePureAdaptiveOutcomeRollPoints(recent[i].outcome);
  }
  var avg = sum / n;
  if (avg >= 0.75) return 'full';
  if (avg >= 0.4) return 'lighter';
  return 'encouragement_only';
}

function geodePureAdaptiveStepwiseMode(lastMode, rawTier) {
  lastMode = lastMode === 'lighter' || lastMode === 'encouragement_only' ? lastMode : 'full';
  if (rawTier === 'full') return 'full';
  if (rawTier === 'lighter') {
    if (lastMode === 'encouragement_only') return 'lighter';
    return 'lighter';
  }
  if (lastMode === 'full') return 'lighter';
  if (lastMode === 'lighter') return 'encouragement_only';
  return 'encouragement_only';
}

function geodePureAdaptiveNormalizeStoredMode(mode) {
  var m = String(mode || '');
  if (m === 'lighter' || m === 'encouragement_only') return m;
  return 'full';
}

function geodePureAdaptiveModeForFamily(state, family, opts) {
  state = state && typeof state === 'object' ? state : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var fam = String(family || '');
  var reasonCodes = [];
  var minEvidence =
    opts.minEvidence != null && isFinite(Number(opts.minEvidence))
      ? Math.max(1, Math.floor(Number(opts.minEvidence)))
      : GEODE_PURE_ADAPTIVE_MIN_EVIDENCE;
  var windowSize =
    opts.windowSize != null && isFinite(Number(opts.windowSize))
      ? Math.max(1, Math.floor(Number(opts.windowSize)))
      : GEODE_PURE_ADAPTIVE_ROLL_WINDOW;
  if (fam !== 'debt' && fam !== 'goal' && fam !== 'invest' && fam !== 'buffer') {
    return {
      family: fam,
      mode: 'full',
      previousMode: 'full',
      rawTier: 'full',
      evidenceCount: 0,
      followedStreak: 0,
      reasonCodes: ['invalid_family']
    };
  }
  var storedMap =
    opts.adaptiveDisplayModeByFamily && typeof opts.adaptiveDisplayModeByFamily === 'object'
      ? opts.adaptiveDisplayModeByFamily
      : {};
  var previousMode = geodePureAdaptiveNormalizeStoredMode(storedMap[fam]);
  var recent = geodePureFollowthroughRecentForFamily(state, fam, { maxN: windowSize });
  var evidenceCount = recent.length;
  var followedStreak = geodePureAdaptiveTrailingFollowedStreak(recent);
  if (evidenceCount < minEvidence) {
    reasonCodes.push('insufficient_evidence');
    return {
      family: fam,
      mode: 'full',
      previousMode: previousMode,
      rawTier: 'full',
      evidenceCount: evidenceCount,
      followedStreak: followedStreak,
      reasonCodes: reasonCodes
    };
  }
  if (followedStreak >= minEvidence) {
    reasonCodes.push('followed_streak_full');
    return {
      family: fam,
      mode: 'full',
      previousMode: previousMode,
      rawTier: 'full',
      evidenceCount: evidenceCount,
      followedStreak: followedStreak,
      reasonCodes: reasonCodes
    };
  }
  var rawTier = geodePureAdaptiveRollRawTier(recent, { minEvidence: minEvidence });
  var mode = geodePureAdaptiveStepwiseMode(previousMode, rawTier);
  if (mode !== previousMode) reasonCodes.push('stepwise_mode_adjusted');
  if (rawTier !== mode) reasonCodes.push('raw_tier_stepwise_applied');
  return {
    family: fam,
    mode: mode,
    previousMode: previousMode,
    rawTier: rawTier,
    evidenceCount: evidenceCount,
    followedStreak: followedStreak,
    reasonCodes: reasonCodes
  };
}

/**
 * Shadow-only adaptive mode snapshot (Stage 79A).
 * Recommends per-family display modes; does not change amounts, subtitles, or persisted tiers.
 */
function geodeAdaptiveModeSnapshot(state, suggestedActionSnapshot, opts) {
  state = state && typeof state === 'object' ? state : {};
  suggestedActionSnapshot =
    suggestedActionSnapshot && typeof suggestedActionSnapshot === 'object' ? suggestedActionSnapshot : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(opts.monthKey || suggestedActionSnapshot.monthKey);
  var todayKey = geodePureDateKey(opts.today || suggestedActionSnapshot.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');

  var families = ['debt', 'goal', 'invest', 'buffer'];
  var byFamily = {};
  var recommendedAdaptiveDisplayModeByFamily = {};
  var fi, row;
  for (fi = 0; fi < families.length; fi++) {
    row = geodePureAdaptiveModeForFamily(state, families[fi], opts);
    byFamily[families[fi]] = row;
    recommendedAdaptiveDisplayModeByFamily[families[fi]] = row.mode;
  }

  var familiesInSuggested = { debt: 0, buffer: 0, goal: 0, invest: 0 };
  var cand = Array.isArray(suggestedActionSnapshot.candidates) ? suggestedActionSnapshot.candidates : [];
  for (fi = 0; fi < cand.length; fi++) {
    if (cand[fi] && cand[fi].family && familiesInSuggested[cand[fi].family] != null) {
      familiesInSuggested[cand[fi].family] += 1;
    }
  }

  return {
    version: 1,
    monthKey: monthKey,
    today: todayKey,
    byFamily: byFamily,
    recommendedAdaptiveDisplayModeByFamily: recommendedAdaptiveDisplayModeByFamily,
    sourceSignals: {
      usedSuggestedActionSnapshot: !!(suggestedActionSnapshot && suggestedActionSnapshot.version),
      suggestedCandidateFamilyCounts: familiesInSuggested,
      minEvidence: GEODE_PURE_ADAPTIVE_MIN_EVIDENCE,
      rollWindow: GEODE_PURE_ADAPTIVE_ROLL_WINDOW,
      stepwiseFromOptsAdaptiveDisplayModeByFamily: !!(
        opts.adaptiveDisplayModeByFamily && typeof opts.adaptiveDisplayModeByFamily === 'object'
      )
    },
    reasonCodes: reasonCodes,
    audit: opts.audit === true
      ? {
          shadowOnly: true,
          limitations: [
            'mode_selection_only',
            'not_wired_to_production',
            'no_amount_changes',
            'no_subtitle_changes',
            'no_persistence',
            'does_not_write_adaptiveDisplayModeByFamily'
          ],
          inputs: { monthKey: monthKey, today: todayKey }
        }
      : null
  };
}

// ── PURE ADAPTIVE DISPLAY SNAPSHOT (Stage 79B; display recommendations only; shadow, unwired) ──
// Contract: applies adaptiveModeSnapshot modes to cloned suggested actions; no persistence or production mutation.

var GEODE_PURE_ADAPTIVE_USEFUL_FLOORS = { debt: 50, goal: 25, invest: 50, buffer: 25 };

function geodePureAdaptiveDisplayFinalizeRow(row, reasonCodes) {
  var r = Object.assign({}, row, { reasonCodes: reasonCodes || [] });
  r.subtitleOverrideKey = r.adaptiveSubtitleKey != null ? String(r.adaptiveSubtitleKey) : null;
  return r;
}

function geodePureBuildAdaptiveDisplayByActionId(actions) {
  var map = {};
  var list = Array.isArray(actions) ? actions : [];
  var i, row, id;
  for (i = 0; i < list.length; i++) {
    row = list[i];
    if (!row || row.actionId == null || String(row.actionId) === '') continue;
    id = String(row.actionId);
    map[id] = row;
  }
  return map;
}

function geodePureRoundAdaptiveStarterAmount(original) {
  var n = Math.max(0, Number(original) || 0);
  if (n <= 0) return 0;
  var r = Math.round((n * 0.6) / 5) * 5;
  r = Math.max(5, Math.min(r, Math.floor(n)));
  return r;
}

function geodePureRoundAdaptiveEncouragementAmount(original) {
  var n = Math.max(0, Number(original) || 0);
  if (n <= 0) return 0;
  var r = Math.round((n * 0.5) / 5) * 5;
  r = Math.max(5, Math.min(r, Math.floor(n)));
  return r;
}

function geodePureAdaptiveUsefulFloorForAction(a) {
  if (!a || !a.type) return 0;
  if (a.type === 'debt_payment') return 50;
  if (a.type === 'goal_contribution') return 25;
  if (a.type === 'investment_contribution') return 50;
  if (a.type === 'buffer_contribution') return 25;
  return 0;
}

function geodePureAdaptiveApplyUsefulFloor(a, amount) {
  var original = Math.max(
    0,
    Number(a && a.originalAmount != null ? a.originalAmount : a && (a.suggestedAmount != null ? a.suggestedAmount : a.amount)) || 0
  );
  var amt = Math.max(0, Number(amount) || 0);
  var floor = geodePureAdaptiveUsefulFloorForAction(a);
  if (floor <= 0 || amt <= 0 || original < floor || amt >= floor) return amt;
  return Math.min(original, floor);
}

function geodePureAdaptiveSubtitleRecommendation(actionType) {
  var t = String(actionType || '');
  if (t === 'debt_payment') {
    return {
      adaptiveSubtitleKey: 'suggestedActions.adaptiveSubtitles.debt_payment',
      subtitleOverride:
        'Start with a smaller extra payment this month \u2014 your plan still targets the full amount when you are ready.'
    };
  }
  if (t === 'goal_contribution') {
    return {
      adaptiveSubtitleKey: 'suggestedActions.adaptiveSubtitles.goal_contribution',
      subtitleOverride:
        'A smaller contribution still keeps progress moving \u2014 the full suggestion is on Plan when you want it.'
    };
  }
  if (t === 'investment_contribution') {
    return {
      adaptiveSubtitleKey: 'suggestedActions.adaptiveSubtitles.investment_contribution',
      subtitleOverride:
        'Start smaller on the recurring amount \u2014 match the full plan when ready.'
    };
  }
  return {
    adaptiveSubtitleKey: 'suggestedActions.adaptiveSubtitles.default',
    subtitleOverride:
      'Even a modest buffer step helps \u2014 build toward the full plan suggestion over time.'
  };
}

function geodePureResolveAdaptiveModeForAction(action, adaptiveModeSnapshot) {
  action = action && typeof action === 'object' ? action : {};
  adaptiveModeSnapshot = adaptiveModeSnapshot && typeof adaptiveModeSnapshot === 'object' ? adaptiveModeSnapshot : {};
  var fam =
    action.family != null && String(action.family)
      ? String(action.family)
      : geodePureFollowthroughFamilyFromActionType(action.type);
  if (!fam) return 'full';
  var rec = adaptiveModeSnapshot.recommendedAdaptiveDisplayModeByFamily;
  if (rec && (rec[fam] === 'full' || rec[fam] === 'lighter' || rec[fam] === 'encouragement_only')) {
    return rec[fam];
  }
  var by = adaptiveModeSnapshot.byFamily && adaptiveModeSnapshot.byFamily[fam];
  if (by && (by.mode === 'full' || by.mode === 'lighter' || by.mode === 'encouragement_only')) {
    return by.mode;
  }
  return 'full';
}

/** Clone one suggested action row with displayAmount / subtitle recommendations (mirrors applyAdaptiveLayer row logic). */
function geodePureApplyAdaptiveDisplayToActionRow(action, mode, opts) {
  action = action && typeof action === 'object' ? action : {};
  opts = opts && typeof opts === 'object' ? opts : {};
  var reasonCodes = [];
  var o = Object.assign({}, action);
  var base = toNum(
    o.suggestedAmount != null ? o.suggestedAmount : o.planAmount != null ? o.planAmount : o.amount
  );
  var adaptiveMode = mode === 'lighter' || mode === 'encouragement_only' ? mode : 'full';
  o.originalAmount = base;
  o.adaptiveMode = adaptiveMode;
  o.displayAmount = base;
  o.subtitleOverride = null;
  o.adaptiveSubtitleKey = null;
  o.amountRule = 'full';
  o.usefulFloor = geodePureAdaptiveUsefulFloorForAction(o);
  o.floorApplied = false;
  o.memorySoftenedSkippedReduction = !!(o.memorySoftened || o.softenedByMemory);

  if (adaptiveMode === 'full') {
    reasonCodes.push('adaptive_mode_full');
    return geodePureAdaptiveDisplayFinalizeRow(o, reasonCodes);
  }

  if (o.memorySoftened || o.softenedByMemory) {
    var afterFloor = geodePureAdaptiveApplyUsefulFloor(o, base);
    o.displayAmount = Math.min(base, afterFloor);
    o.amountRule = 'memory_floor_only';
    o.memorySoftenedSkippedReduction = true;
    if (o.usefulFloor > 0 && base < o.usefulFloor && o.displayAmount === base) {
      reasonCodes.push('memory_softened_below_useful_floor');
    } else if (o.displayAmount !== base) {
      o.floorApplied = true;
      reasonCodes.push('memory_softened_useful_floor_applied');
    } else {
      reasonCodes.push('memory_softened_no_multiplier_reduction');
    }
    return geodePureAdaptiveDisplayFinalizeRow(o, reasonCodes);
  }

  if (adaptiveMode === 'lighter') {
    o.displayAmount = geodePureRoundAdaptiveStarterAmount(base);
    o.amountRule = 'lighter_60_round5';
    reasonCodes.push('adaptive_lighter_amount');
    return geodePureAdaptiveDisplayFinalizeRow(o, reasonCodes);
  }

  o.displayAmount = geodePureRoundAdaptiveEncouragementAmount(base);
  o.amountRule = 'encouragement_50_round5';
  var subRec = geodePureAdaptiveSubtitleRecommendation(o.type);
  o.adaptiveSubtitleKey = subRec.adaptiveSubtitleKey;
  o.subtitleOverride = subRec.subtitleOverride;
  reasonCodes.push('adaptive_encouragement_amount');
  reasonCodes.push('adaptive_subtitle_override');
  return geodePureAdaptiveDisplayFinalizeRow(o, reasonCodes);
}

/**
 * Shadow-only adaptive display snapshot (Stage 79B).
 * Applies adaptiveModeSnapshot modes to cloned suggestedActionSnapshot.actions; does not persist or mutate inputs.
 */
function geodeAdaptiveDisplaySnapshot(state, suggestedActionSnapshot, adaptiveModeSnapshot, opts) {
  state = state && typeof state === 'object' ? state : {};
  suggestedActionSnapshot =
    suggestedActionSnapshot && typeof suggestedActionSnapshot === 'object' ? suggestedActionSnapshot : {};
  adaptiveModeSnapshot = adaptiveModeSnapshot && typeof adaptiveModeSnapshot === 'object' ? adaptiveModeSnapshot : {};
  opts = opts && typeof opts === 'object' ? opts : {};

  var reasonCodes = [];
  var monthKey = geodePureMonthKey(
    opts.monthKey || suggestedActionSnapshot.monthKey || adaptiveModeSnapshot.monthKey
  );
  var todayKey = geodePureDateKey(opts.today || suggestedActionSnapshot.today || adaptiveModeSnapshot.today);
  if (!monthKey) reasonCodes.push('missing_monthKey');
  if (!todayKey) reasonCodes.push('missing_today');
  if (!suggestedActionSnapshot.version) reasonCodes.push('suggested_action_snapshot_missing');

  var srcActions = Array.isArray(suggestedActionSnapshot.actions) ? suggestedActionSnapshot.actions : [];
  var outActions = [];
  var ai, act, mode;
  for (ai = 0; ai < srcActions.length; ai++) {
    act = srcActions[ai];
    if (!act) continue;
    mode = geodePureResolveAdaptiveModeForAction(act, adaptiveModeSnapshot);
    outActions.push(geodePureApplyAdaptiveDisplayToActionRow(act, mode, opts));
  }

  var recommendedAdaptiveDisplayModeByFamily =
    adaptiveModeSnapshot.recommendedAdaptiveDisplayModeByFamily &&
    typeof adaptiveModeSnapshot.recommendedAdaptiveDisplayModeByFamily === 'object'
      ? Object.assign({}, adaptiveModeSnapshot.recommendedAdaptiveDisplayModeByFamily)
      : { debt: 'full', goal: 'full', invest: 'full', buffer: 'full' };

  return {
    version: 1,
    monthKey: monthKey,
    today: todayKey,
    actions: outActions,
    byActionId: geodePureBuildAdaptiveDisplayByActionId(outActions),
    primary: outActions[0] || null,
    secondary: outActions[1] || null,
    recommendedAdaptiveDisplayModeByFamily: recommendedAdaptiveDisplayModeByFamily,
    adaptiveModes: recommendedAdaptiveDisplayModeByFamily,
    usefulFloors: Object.assign({}, GEODE_PURE_ADAPTIVE_USEFUL_FLOORS),
    sourceSignals: {
      usedSuggestedActionSnapshot: !!(suggestedActionSnapshot && suggestedActionSnapshot.version),
      usedAdaptiveModeSnapshot: !!(adaptiveModeSnapshot && adaptiveModeSnapshot.version),
      actionCount: outActions.length,
      preservesMemorySoftenedRules: true,
      contractStage: '79B-1'
    },
    reasonCodes: reasonCodes,
    audit: opts.audit === true
      ? {
          shadowOnly: true,
          limitations: [
            'display_recommendations_only',
            'not_wired_to_production',
            'no_persistence',
            'subtitle_override_inline_fallback_not_geodeCopy',
            'does_not_mutate_suggested_or_mode_snapshots'
          ],
          inputs: { monthKey: monthKey, today: todayKey, actionCount: outActions.length }
        }
      : null
  };
}
