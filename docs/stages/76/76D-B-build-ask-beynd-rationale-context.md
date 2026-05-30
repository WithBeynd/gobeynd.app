# Stage 76D-B — Build Ask Beynd Plan Rationale Context Block

**Type:** Implementation  
**Verdict:** Built — pending post-build audit  
**Date:** May 2026  

---

## Objective

Wire `geodePlanRationaleSnapshot` into Ask Beynd via a concise bounded text block so Ask Beynd can explain existing plan reasoning without becoming a second plan engine.

---

## Scope

`index.html` only — context assembly path. No UI, worker, prompts, or plan/Reality logic changes.

---

## Files touched

| File | Change |
|------|--------|
| `index.html` | `geodePlanRationaleTruncateLine`, `geodeFormatPlanRationaleContextBlock`, `geodeBuildCoachingContext` integration |

---

## Files intentionally not touched

- `coaching.json`, `service-worker.js`, `manifest.json`, `worker/`, `js/geode-pure/*`
- Ask Beynd UI, Home, Main Action, Plan, Reality, Month Shift

---

## Implementation summary

### `geodePlanRationaleTruncateLine(text, maxLen)`

Truncates rationale lines for context export.

### `geodeFormatPlanRationaleContextBlock(snap, sym)`

- Returns bounded plain text (~2500 char max).
- Includes: month, strategy, summary, first incomplete, up to **3 steps** with usual amount, why, progress.
- **Rule C:** When `alignment.active`, per-step usual + Reality-adjusted (or paused) amounts from `alignment.stepAdjustments`.
- Affordability: suggestable room + up to 6 reason codes; up to 8 cautions.
- Embedded assistant rules (no invent skip outcomes; dual amounts when aligned; soften certainty without Reality data).

### `geodeBuildCoachingContext()`

1. `var plan = getMonthPlan()` once.
2. `geodePlanRationaleSnapshot(S, { plan: plan, generatedAt: Date.now() })`.
3. `planRationaleBlock = geodeFormatPlanRationaleContextBlock(planSnap, sym)`.
4. If block non-empty → append **`PLAN RATIONALE`** block **instead of** legacy `THIS MONTH'S PLAN` strip.
5. If snapshot/formatter fails → fallback to legacy `P1: label (£X)` strip.

Debts, goals, investments, posture, balance blocks unchanged.

---

## Risks

- Peek stale check inside snapshot may still trigger indirect second `getMonthPlan()` (documented in snapshot audit).
- Formatter truncation may omit step 4+ (by design).

---

## Validation results

Pending post-build audit (76D-B-post-build).

---

## Manual QA requirements

```js
// Context includes PLAN RATIONALE block
var ctx = geodeBuildCoachingContext();
ctx.indexOf('PLAN RATIONALE') >= 0;

// With Month Shift approved: dual amounts in context
// ctx should contain "usual plan" and "Reality view this month"
```

Ask Beynd: “Why is my first plan step this amount?” — should cite Why line from block.

---

## Future dependencies

- Post-build audit
- Optional: `coaching.json` / worker one-line alignment hint (not in this stage)
- Monitor context size vs 12k worker limit

---

## Commit readiness

**Ready after post-build audit.** Suggested message: `feat(ask): add plan rationale block to Ask Beynd context`
