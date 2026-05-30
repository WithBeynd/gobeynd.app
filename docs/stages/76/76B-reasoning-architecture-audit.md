# Stage 76B — Plan Reasoning Architecture Audit

**Type:** Read-only audit  
**Verdict:** NEEDS ATTENTION (integration gap, not missing engine)  
**Date:** May 2026  

---

## Objective

Map where Beynd’s plan reasoning lives and whether Ask Beynd can become a **translator** of existing intelligence rather than an inferring LLM.

---

## Scope

Map `getMonthPlan()`, step fields, affordability, Reality, progress, Main Action; compare to Ask Beynd context.

---

## Files touched

None (audit only).

---

## Files intentionally not touched

All code; no changes.

---

## Findings (summary)

- Plan engine **knows WHY** — distributed across `step.why`, `note`, `explain`, `plan.affordability.reasonCodes`, `summary`, etc.
- Ask Beynd receives **WHAT** only (label + amount).
- Gap is **export/integration**, not new allocation logic.
- Recommended: read-only `geodePlanRationaleSnapshot` assembler (designed in 76C-A).

---

## Risks

- Duplicating allocation logic in any export layer would drift from `getMonthPlan()`.
- Month Shift is display-only; must not be conflated with affordability Reality shrink.

---

## Validation results

Static trace of call graph and step object fields.

---

## Manual QA requirements

Compare Plan step detail copy to what Ask Beynd would see in `geodeBuildCoachingContext` plan strip.

---

## Future dependencies

76C-A design → 76C-B implementation.

---

## Commit readiness

N/A — audit only.
