# Stage 77C-B — Build Ask Beynd Spending / Over-Budget Context Block

**Type:** Implementation  
**Verdict:** Built — [77C-C post-build audit PASS](./77C-C-post-build-audit.md)  
**Date:** May 2026  

---

## Objective

Add a bounded **SPENDING / OVER-BUDGET CONTEXT** block to Ask Beynd when `calcMonthlyLeftover(S) < 0`, using the same flexible category aggregation as the Plan over-budget view.

---

## Scope

`index.html` — read-only helpers + context wiring. Plan over-budget HTML refactored to call shared category helper (same totals, same UI).

---

## Files touched

| File | Change |
|------|--------|
| `index.html` | `geodeAskBeyndFlexibleSpendingCategories`, `geodeFormatAskBeyndSpendingPressureContextBlock`, `geodeBuildCoachingContext` wiring; `geodeOverBudgetPlanBlockHtml` uses shared aggregator |

---

## Files intentionally not touched

- `coaching.json`, `service-worker.js`, `manifest.json`, `worker/`, `js/geode-pure/*`
- Ask Beynd UI, affordability math, `calcMonthlyLeftover`, protected/worried matchers

---

## Implementation summary

### `geodeAskBeyndFlexibleSpendingCategories(state, maxItems)`

- Read-only; mirrors Plan breakdown rules.
- Sums `geodeStage62MonthlyExpenseAmount` per expense; skips `geodeStage62ProtectedReasonForExpense`.
- Returns `[{ key, label, amount }]` sorted descending, capped at `maxItems` (default 5).

### `geodeFormatAskBeyndSpendingPressureContextBlock(state, sym)`

- Returns `''` when `calcMonthlyLeftover(state) >= 0`.
- Exports: income, expenses total, payment outflow, over-budget amount, month protect/worried (truncated), top flexible categories, assistant rules.
- `MAX_BLOCK` ~650 chars.

### `geodeBuildCoachingContext()`

- Appends spending block after orchestration, before DEBTS, when non-empty.

---

## Risks

- LLM may still ignore assistant rules.
- Duplicate protect/worried if MONTH CONTEXT also present (acceptable).

---

## Validation results

See [77C-C-post-build-audit.md](./77C-C-post-build-audit.md) — **PASS** (automated); manual QA still required before commit.

---

## Manual QA requirements

```js
var left = calcMonthlyLeftover(S);
var ctx = geodeBuildCoachingContext();
left < 0 ? ctx.indexOf('SPENDING / OVER-BUDGET') >= 0 : true;
```

Live: “Why am I over budget?” / “Where is my money going?” — use category lines only.

---

## Future dependencies

- 77C-C post-build audit
- **No git commit until Stage 77D post-audit approved**

---

## Commit readiness

**Hold commit.** Suggested message when allowed: `feat(ask): add over-budget spending context for Ask Beynd`
