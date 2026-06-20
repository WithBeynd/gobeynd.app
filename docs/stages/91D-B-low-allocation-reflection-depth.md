# Stage 91D-B — Low-Allocation Reflection Depth

**Type:** Display + prioritization + copy only  
**Verdict:** **PASS**  
**Date:** June 2026  
**Parents:** [91D Moat Audit](./91D-reflection-moat-audit.md) · [91B Governance Contract](./91B-reality-centred-governance-contract.md)

---

## Pre-build audit summary

### Why low-allocation Reflection felt thin

| Path | Issue |
|------|-------|
| `showBackground` | Only `recovering` / `reflective` atmospheres; **protective + held-back** (common under pressure) skipped background block |
| `plan_protecting` | Generic “still guiding” copy when `suggestableRoom` is effectively zero |
| `month_so_far` | Generic atmosphere lines; no constrained-month framing |
| `completionAftermathActive` | Hook existed only to **suppress Tier-C**; never passed `true` from stack |
| Underused snapshot fields | `noticed.homeBand`, `planFocus.topSteps`, `breathingRoomIntent.memorySoftened` |

---

## What changed

### New read-only helpers (display only)

| Helper | Purpose |
|--------|---------|
| `geodeReflectionLowAllocationFromSnapshot(snapshot)` | Detects constrained month from existing snapshot fields |
| `geodeReflectionAftermathFromSession()` | Reads existing `window._geodeOverdueCleared` |
| `geodeReflectionBackgroundBody(lowAllocation, bgParts)` | Background copy variants |
| `geodeReflectionPlanProtectBody(...)` | Plan block copy variants |

### Prioritization adjustments

| Rule | Change |
|------|--------|
| **Background visibility** | Also show when `lowAllocation && atmosphere === 'protective' && heldBackSignals` |
| **Block order** | When `lowAllocation && background` block exists in protective/recovering: `matter → background → month_so_far → plan_protecting` |
| **Aftermath** | Pass `completionAftermathActive` from session flag into experience composer; **month_so_far** carries aftermath copy (not duplicated in plan_protect when month_so_far visible) |

### Copy changes (no forbidden words)

| Block | Low-allocation / constrained copy |
|-------|-------------------------------------|
| **background** headline | “What Home held back on purpose” |
| **background** body | “…stay manageable. Nothing here was forgotten.” |
| **plan_protecting** headline | “What still holds this month” |
| **plan_protecting** body | “There is little room for new allocation right now…” |
| **month_so_far** calm | “The month is tight on allocation, but it still holds together…” |
| **month_so_far** protective | “This month is carrying a lot…” |
| **month_so_far** recovering | “Home held some items back on purpose…” |
| **month_so_far** aftermath | “One urgent item is no longer competing for attention on Home…” |

---

## What did not change

- Max 3 blocks (frozen)
- No new block types
- No Home Reflection entry
- No new snapshot fields
- No activityLog / behaviourEvents / release reads
- No Tier-C expansion (aftermath still suppresses Tier-C gate)
- `geodeStabilityRoomSnapshot` producer unchanged (no new fields)
- RC-62, orchestration producers, Plan math

---

## Low-allocation detection (existing fields only)

`geodeReflectionLowAllocationFromSnapshot` returns true when any of:

1. `snapshot.noticed.homeBand` is `critical` or `focused`
2. `planFocus.topSteps` is empty
3. Sum of `topSteps[].amount` ≤ 0
4. `breathingRoomIntent.preserveBreathingRoom` or `memorySoftened` and sum ≤ 50

---

## Anti-overexpansion checks

| Check | Result |
|-------|--------|
| New block types | ❌ None |
| Block count > 3 | ❌ Unchanged cap |
| New persistence | ❌ None |
| New telemetry | ❌ None |
| activityLog ingestion | ❌ None |
| Release inference | ❌ None |
| Home entry | ❌ None |
| Forbidden copy (fix, recover, insight, coaching) | ✅ Avoided in user strings |
| Em dashes in new copy | ✅ None |

---

## Governance verification

| Rule | Status |
|------|--------|
| 91B RC-62 freeze | ✅ |
| RC-USER-AUTH (month context echo unchanged) | ✅ |
| 80R-F release silence | ✅ |
| Tier-C suppression-first | ✅ (aftermath suppresses Tier-C) |
| quiet_period unchanged | ✅ |
| Ask pointer subordinate | ✅ |

---

## Manual QA (code review)

| Scenario | Expected |
|----------|----------|
| A. Low leftover + month context | matter + constrained month_so_far and/or plan_protect |
| B. Overbudget + held-back | background block in protective atmosphere |
| C. No month context | matter block absent; other blocks per atmosphere |
| D. Quiet period critical | entry hidden (unchanged) |
| E. `_geodeOverdueCleared` | month_so_far aftermath line |
| F. Dismiss + revisit | session gate unchanged |
| G. No duplicate Home narration | cross-surface suppress preserved |
| H. No new pressure surfaces | copy only |

*Browser smoke recommended before commit.*

---

## Regression risks

| Risk | Mitigation |
|------|------------|
| Aftermath line overrides atmosphere copy | Only when not cross-surface neutralised |
| Duplicate aftermath in two blocks | plan_protect skips aftermath when month_so_far section visible |
| “recovery” register class | Internal CSS only; not user copy |
| Low-allocation false positive | Uses existing homeBand + topSteps only |

---

## Commit recommendation

Safe after browser Reflection smoke on constrained month + held-back + aftermath session.

Suggested message:

```
feat(reflection): deepen low-allocation continuity copy from existing snapshot fields
```

No service worker bump.

---

## Core philosophy

Reflection helps users remain psychologically steady when optimization has run out, without becoming emotionally authoritative.
