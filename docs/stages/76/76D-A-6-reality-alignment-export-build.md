# Stage 76D-A.6 — Reality Alignment Export Build

**Type:** Implementation (shadow snapshot extension)  
**Verdict:** Built — pending post-build audit (76D-A.7)  
**Commit:** *Uncommitted at documentation time*  
**Date:** May 2026  

---

## Objective

Extend `geodePlanRationaleSnapshot` with `alignment` block so future Ask Beynd can represent active Month Shift without changing Plan/Reality UI.

---

## Scope

`index.html` only. Export existing approved alignment; no create/approve/revert/normalize/preview.

---

## Files touched

| File | Change |
|------|--------|
| `index.html` | +57 / −1: `geodePlanRationaleAlignmentBlock`, `alignment` on snapshot, audit metadata |

---

## Files intentionally not touched

- `coaching.json`, `service-worker.js`, `manifest.json`, `js/geode-pure/*`, `worker/`
- Ask Beynd, Plan UI, Reality UI, Month Shift logic

---

## Implementation summary

**New helper:** `geodePlanRationaleAlignmentBlock(state, stepsOut, monthKey)`

- Reads via **`geodePeekActiveRealityPlanAlignment(state)` only**
- Inactive default: `{ active: false, status: 'none', ym, summary: '', stepAdjustments: [] }`
- Active: copies persisted `stepAdjustments` with `stepIndex`, `stepId`, `stepLabel`, `action`, `baselineAmount`, `displayAmount`, `appliedAmountAtApproval`
- `steps[].amount` remains **baseline**; display amounts only in `alignment.stepAdjustments`

**Audit metadata:**

- `alignmentPeekUsed: true`
- `sideEffectsAcknowledged` includes `geodePeekActiveRealityPlanAlignment_stale_check_may_recall_plan`

---

## Risks

- Peek stale check may call `getMonthPlan()` indirectly (second engine call).
- `summary` string matches existing Plan banner text (export metadata, not new UI).

---

## Validation results

See [76D-A.7 post-build audit](./76D-A-7-post-build-audit.md): PASS.

---

## Manual QA requirements

**No alignment:**

```js
var snap = geodePlanRationaleSnapshot(S, { generatedAt: Date.now() });
snap.alignment; // active: false, stepAdjustments: []
snap.steps.map(s => [s.label, s.amount]);
```

**Active Month Shift:**

```js
snap.alignment.active === true;
snap.steps[adj.stepIndex].amount === adj.baselineAmount;
```

---

## Future dependencies

Commit 76D-A.6 → **76D-B** Ask Beynd context serialization with rule C.

---

## Commit readiness

**Ready after 76D-A.7 PASS** — suggested message: `feat(ask): export Reality alignment in plan rationale snapshot`
