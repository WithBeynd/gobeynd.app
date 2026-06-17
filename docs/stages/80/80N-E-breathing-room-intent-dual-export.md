# Stage 80N-E — breathingRoomIntent Dual Export

**Type:** Implementation  
**Verdict:** Built  
**Date:** June 2026  
**Parent:** [80N-D parity spec](../80N-D implied), 80N-C parity helper

---

## Objective

Resolve `noticed.breathingRoomIntent` parity risk by exporting both Plan-path and posture-path memory modifier slices — shadow-only, no consumers.

---

## Why dual export exists

`geodeFinancialMemoryPlanModifiers` accepts asymmetric inputs:

| Path | Invocation | Used by |
|------|------------|---------|
| **planPath** | `(state, affordability, null)` | `getMonthPlan` |
| **posturePath** | `(state, null, posture)` | Former 80N-A snapshot only |

Afford-only pressure (reality below plan, low `suggestableRoom`) can activate Plan path but not posture path. Posture-only pressure (`review_first`, `cautious`) can activate posture path but not Plan path.

A single merged boolean would misstate live Plan behaviour or emotional observation.

---

## Export shape

```js
noticed.breathingRoomIntent: {
  planPath: { preserveBreathingRoom, bufferPreference, memorySoftened, reasonCodes, confidence },
  posturePath: { ... },
  aligned: boolean,
  confidence: 'high' | 'medium' | 'low' | 'partial',
  canonicalForExplanation: 'planPath',
  source: 'geodeFinancialMemoryPlanModifiers',
  legacyCompatibility: { note, ... },
  // flat fields mirror planPath (80N-A compatibility)
  preserveBreathingRoom, bufferPreference, memorySoftened, reasonCodes
}
```

---

## Ownership

| Field | Role |
|-------|------|
| **planPath** | Canonical for future Plan softening explanations (`bufferPreference`, multipliers) |
| **posturePath** | Emotional/context observation only — not Plan truth |
| **breathingRoomFloor** | Not in this export — Tier 0 via `computeAffordabilityContext` |
| **preserveBreathingRoom** | Intent flag; not read by `getMonthPlan` today |

Neither path changes behaviour in this stage — Tier 2 observe only.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeStabilityRoomSnapshot` dual export; `geodeNoticedParityCheck` updated |

---

## Not touched

`getMonthPlan`, `computeAffordabilityContext`, `geodeFinancialMemoryPlanModifiers`, UI, orchestration, Ask, Reflection, `service-worker.js`

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
snap.noticed.breathingRoomIntent.planPath;
snap.noticed.breathingRoomIntent.posturePath;
snap.noticed.breathingRoomIntent.canonicalForExplanation === 'planPath';
snap.noticed.breathingRoomIntent.aligned;

var r = window._geodeNoticedParityCheck();
r.domains.breathingRoomIntent.parity.exportPlanPathVsLivePlan.match;
r.domains.breathingRoomIntent.verdict;
```

---

## Manual QA

- [ ] No visible Home / Plan / Reality / Reflection change
- [ ] `planPath` matches live Plan modifier invocation when parity check runs
- [ ] Divergence between paths reported when afford-only or posture-only pressure
- [ ] Legacy flat fields mirror `planPath`
