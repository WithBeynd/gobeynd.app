# Stage 80N-A — Shadow noticed.* Assembly Pass

**Type:** Implementation  
**Verdict:** Built  
**Date:** June 2026  
**Parent:** PACING-SHADOW-EXPORT-SPEC, PLAN-STABILITY-REALITY-AUDIT

---

## Objective

Add Tier-2 `noticed.*` interpretation domains inside `geodeStabilityRoomSnapshot` — observational assembly only. No consumers, no UI, no Plan/orchestration changes.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeStabilityRoomSnapshot` — `noticed.pacing`, `resilience`, `recovery`, `continuity`, `flexibility`, `breathingRoomIntent`, `pressure`; `audit.noticedTier` / `noticedDomains` |

---

## Not touched

`getMonthPlan`, affordability, Home orchestration, Reality, Ask Beynd, Reflection UI, `service-worker.js`, `coaching.json`, `js/geode-pure/*`

---

## New export shape (under `snapshot.noticed`)

| Domain | Source |
|--------|--------|
| `pacing` | `assessPressure` (`pacingMode`, band, pacing reason codes) |
| `resilience` | resolve + `quiet` (`shouldStayQuiet`, suppress topics, held-back counts) |
| `recovery` | `assessPressure.recovery` |
| `continuity` | carry + `geodeBehaviourContinuityProfile` |
| `flexibility` | feeling + month context + posture |
| `breathingRoomIntent` | `geodeFinancialMemoryPlanModifiers` (read-only; null afford) |
| `pressure` | `assessPressure` dimensions + reason codes (`internalOnly: true`) |

Legacy flat `noticed` fields (`homeBand`, `contextPosture`, `pressureBand`, etc.) preserved for `geodeStabilityRoomVisualModel`.

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
snap.audit.noticedTier === 2;
snap.noticed.pacing && snap.noticed.pacing.source === 'assessPressure';
snap.noticed.breathingRoomIntent && snap.noticed.breathingRoomIntent.source === 'geodeFinancialMemoryPlanModifiers';
snap.noticed.pressure && snap.noticed.pressure.internalOnly === true;
snap.noticed.contextPosture.posture; // visual model compat
window._geodeStabilityRoomSnapshot === snap;
```

---

## Manual QA

- [ ] No Home / Plan / Reality / Reflection visible change
- [ ] `geodeStabilityRoomVisualModel(snap)` still returns model (uses `noticed.contextPosture`)
- [ ] `noticed.*` domains populated when onboarded with data
