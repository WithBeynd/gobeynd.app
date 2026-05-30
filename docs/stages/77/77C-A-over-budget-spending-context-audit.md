# Stage 77C-A — Ask Beynd Over-Budget / Spending Context Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION — proceed with separate bounded context block  
**Date:** May 2026  

---

## Objective

Determine the safest way to give Ask Beynd bounded over-budget / spending-pressure context without a new recommendation engine.

---

## Scope

Read-only audit of over-budget sources, `geodeBuildCoachingContext`, and Plan/Home helpers.

---

## Files touched

None (audit only).

---

## Files intentionally not touched

All production code; worker; coaching.json; UI.

---

## Findings (summary)

- Over-budget SSOT: `calcMonthlyLeftover(state) < 0`; amount = `abs(left)`.
- Plan UI aggregates top flexible categories via `geodeOverBudgetPlanBlockHtml` (excludes protected expenses).
- Ask Beynd had income, expense total, signed leftover — **not** payment outflow, over-budget label, or category breakdown.
- Recommended: **`geodeAskBeyndFlexibleSpendingCategories`** + **`geodeFormatAskBeyndSpendingPressureContextBlock`** when `left < 0`.

---

## Risks

- LLM invents category £ without export.
- Confusing expenses-only total with full over-budget cause (payments omitted).
- Merchant-level export increases shame/privacy risk.

---

## Validation results

Static map of helpers and context inventory.

---

## Manual QA requirements

After 77C-B: `left < 0` → context includes `SPENDING / OVER-BUDGET`; Ask “why am I over budget?” cites listed categories only.

---

## Future dependencies

77C-B build → 77C-C post-build audit. No commit until Stage 77D post-audit.

---

## Commit readiness

N/A — audit artifact.
