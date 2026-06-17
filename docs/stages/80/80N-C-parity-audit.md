# Stage 80N-C — noticed.* Parity Audit

**Type:** Pre-build audit  
**Verdict:** NEEDS ATTENTION (expected shadow limitation)  
**Date:** June 2026  
**Parent:** 80N-A shadow export, 80N-B consumer readiness audit

---

## Objective

Validate Tier-2 `noticed.*` export completeness, source ownership, and fidelity before any consumer wiring.

---

## 1. Export completeness

| Domain | Present | Source | Type | Status |
|--------|---------|--------|------|--------|
| `noticed.pacing` | Yes | `assessPressure` | Live PAO re-export | Coherent |
| `noticed.resilience` | Yes | resolve + `quiet` / `heldBack` | Derived same snapshot | Coherent |
| `noticed.recovery` | Yes | PAO `recovery` | Live (streak via localStorage input) | Coherent |
| `noticed.continuity` | Yes | carry + behaviour profile | Live persisted + derived | Coherent |
| `noticed.flexibility` | Yes | feeling + month context + posture | Live capture + derived | Coherent |
| `noticed.breathingRoomIntent` | Yes | memory modifiers (null afford) | Shadow path | **Partial fidelity** |
| `noticed.pressure` | Yes | PAO dimensions | Internal-only Tier 2 | Coherent |

Legacy flat fields (`contextPosture`, `pressureBand`, `homeBand`, etc.) remain for visual model.

---

## 2. Source ownership

| Concern | Canonical owner | Export role |
|---------|-----------------|-------------|
| Pacing classification | PAO | Re-export |
| Resilience / quiet | Orchestration resolve + PAO suppress | Aggregate |
| Recovery phase | PAO (reads `geodeGetRecoveryState`) | Re-export |
| Continuity | `behaviourEvents` + carry | Observe |
| Flexibility | Reality capture + posture | Echo + interpret |
| Breathing-room **intent** | Memory modifiers | Shadow observe |
| Breathing-room **floor** | `computeAffordabilityContext` | Not in `noticed.*` (Tier 0) |
| Pressure dimensions | PAO | Internal-only |

---

## 3. Parity findings (pre-build)

### A. Resilience

Export should match `snapshot.quiet` + `heldBack` counts from same snapshot build. **Expected: aligned.**

### B. Pacing

Export `mode` / `band` should match fresh `assessPressure` output. **Expected: aligned.**

### C. Recovery

- **Canonical for export:** PAO `recovery.phase`
- **Input:** `geodeGetRecoveryState` → `localStorage` streak keys
- **Risk:** streak not in `S`; stale if localStorage cleared
- **Duplication:** none in export path; PAO is single classifier

### D. Continuity

Month-scoped counts only — observational, not predictive. Carry is `suggestionOnly`.

### E. Flexibility

User-authored `protect` / `worried` must be preserved verbatim in export. Posture/tone are derived.

### F. breathingRoomIntent (critical)

| Path | Afford input | Used by |
|------|--------------|---------|
| Snapshot export | `null` | `geodeStabilityRoomSnapshot` |
| Plan live | `computeAffordabilityContext` | `getMonthPlan` |

**Known divergence:** `hasCurrentPressure` in memory modifiers can be true on Plan path (afford reason codes, `suggestableRoom`) but false on null-afford snapshot path → `preserveBreathingRoom` may be **under-reported** in export.

**Verdict:** Acceptable shadow limitation for Tier 2 observe-only — **must be fixed before user-facing explanation** of softening.

**Not incorrect export behaviour** for current scope; **future parity risk** for Stability/Ask copy.

### G. Pressure isolation

`internalOnly: true`. No Home/Plan/Ask/Reflection consumers. Visual model reads `contextPosture` only.

---

## 4. Consumer readiness

| Surface | Reads nested `noticed.*`? |
|---------|---------------------------|
| Home | No |
| Plan | No |
| Suggested Actions | No |
| Reality | No |
| Reflection | No (experience model uses `heldBack`, not `noticed.*`) |
| Stability visual model | No (legacy `contextPosture` only) |
| Ask Beynd | No |

---

## 5. Governance

| Tier | Responsibility |
|------|----------------|
| Tier 0 | afford, Plan, payments |
| Tier 1 | display, orchestration |
| Tier 2 | `noticed.*` export |
| Tier 3 | future reflective UI |

`noticed.*` remains Tier 2 only.

---

## 6. Recommended build

Add `geodeNoticedParityCheck` / `window._geodeNoticedParityCheck()` — debug-only structured comparison, no UI.

---

## Non-goals

No consumer wiring, no copy, no orchestration, no Plan changes.
