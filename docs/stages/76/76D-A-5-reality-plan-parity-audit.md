# Stage 76D-A.5 — Ask Beynd Reality / Plan Parity Audit

**Type:** Read-only architecture audit  
**Verdict:** NEEDS ATTENTION — do not wire baseline-only snapshot  
**Date:** May 2026  

---

## Objective

Determine if Ask Beynd would **disagree with Plan UI** when rationale snapshot uses baseline amounts but user sees Month Shift display amounts.

---

## Scope

Map three amount layers: baseline engine, affordability Reality shrink, Month Shift display overlay.

---

## Files touched

None.

---

## Three amount layers

| Layer | Source | Affects `step.amount`? | In snapshot pre-76D-A.6? |
|-------|--------|------------------------|---------------------------|
| Baseline plan | `getMonthPlan()` | Yes | Yes |
| Affordability Reality | `geodeStage62RealityAdjustment` | Yes (via suggestableRoom) | Yes (`affordability.realityAdjustment`) |
| Month Shift overlay | `S.realityPlanAlignment` | **No** (display only) | **No** |

---

## Critical scenario

**Approved alignment active:** Plan row shows `geodePlanStepRealityDisplay` amounts; Ask Beynd and snapshot showed baseline → **HIGH** conflict risk.

---

## Recommended Ask Beynd rule (future)

**Rule C:** When `alignment.active`, state both usual plan amount and current Reality view amount. When reverted, usual plan only. Preview-only: do not state preview as current.

---

## Snapshot gap decision (pre-76D-A.6)

**Required before 76D-B:** `alignment` block with `stepAdjustments` (baselineAmount, displayAmount, action).

---

## Recommended next stage

**B** — Add minimal alignment fields to snapshot, then **76D-B** integration.

---

## Validation results

Static lifecycle map of Reality alignment (save, approve, peek, revert, stale).

---

## Manual QA requirements

With approved Month Shift: compare Plan row amount vs `snap.steps[i].amount` (must differ until alignment export).

---

## Commit readiness

N/A — audit drove 76D-A.6 build.

---

## Future dependencies

76D-A.6 alignment export → 76D-A.7 post-build audit → 76D-B.
