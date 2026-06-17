# Stage 80N-C — Post-Build Audit

**Type:** Post-build verification  
**Verdict:** PASS (with documented shadow limitation)  
**Date:** June 2026  
**Parent:** [80N-C parity audit](./80N-C-parity-audit.md)

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeNoticedParityCheck` + `window._geodeNoticedParityCheck` |
| `docs/stages/80/80N-C-parity-audit.md` | Pre-build audit |
| `docs/stages/80/80N-C-post-build-audit.md` | This doc |

---

## Not touched

`getMonthPlan`, affordability, Home orchestration, Reflection/Stability UI, Ask prompts, Reality, payments, `service-worker.js`, protected assets.

---

## Helper

```js
window._geodeNoticedParityCheck(opts?)
// alias: window.geodeNoticedParityCheck
// last report: window._geodeNoticedParityLast
```

**Behaviour:**

- Builds `geodeStabilityRoomSnapshot` (existing path)
- Recomputes canonical sources for comparison
- Returns structured `report` with `domains.*.parity`
- Logs `[geodeNoticedParityCheck] PASS|NEEDS ATTENTION` to console by default
- Does not persist, render, or wire consumers

**Opts:** `{ plan, monthKey, log: false }` to suppress console log.

---

## Parity checks implemented

| Check | Compares |
|-------|----------|
| Resilience | `noticed.resilience` vs `quiet` + `heldBack` |
| Pacing | `noticed.pacing` vs fresh PAO |
| Recovery | `noticed.recovery` vs PAO + documents streak source |
| Continuity | `noticed.continuity` vs carry + behaviour profile |
| Flexibility | `noticed.flexibility` vs feeling + month context + posture |
| breathingRoomIntent | export vs null-afford path vs Plan-path modifiers |
| Pressure | `internalOnly` + isolation flags |

---

## Key finding (breathingRoomIntent)

When Plan path sets `preserveBreathingRoom` via afford-driven `hasCurrentPressure` but shadow path (null afford) does not, parity reports:

- `verdict: 'acceptable_shadow_limitation'`
- `warnings: ['breathingRoomIntent: null-afford snapshot may under-report vs Plan path']`

**Do not fix in this stage.** Document for future Tier-2 parity hardening before user-facing copy.

---

## Consumer verification

No new reads of nested `noticed.*` added. Only `geodeStabilityRoomVisualModel` continues to use `noticed.contextPosture`.

---

## Validation

| Check | Result |
|-------|--------|
| ReadLints `index.html` | Pass |
| Inline script syntax (7 blocks) | Pass |
| `git diff --check` | Pass |
| service-worker unchanged | Pass |
| Visible copy / DOM | Unchanged |

---

## Console QA

```js
var r = window._geodeNoticedParityCheck();
r.tier === 2;
r.shadowOnly === true;
r.domains.resilience;
r.domains.breathingRoomIntent.verdict;
r.domains.pressure.isolation.internalOnly === true;
window._geodeNoticedParityLast === r;
```

**Manual scenarios (dev console):**

- Calm month → pacing `mode: full`, resilience `quiet: false` (typical)
- Pressured month → pacing `mode: gentle`, pressure dimensions elevated
- After memory pressure patterns → check `breathingRoomIntent` shadow vs plan path divergence
- Month with carry → `continuity.hasCarry: true`
- Recovery emerging → `recovery.phase: emerging`, `label: finding_rhythm`

No visible UX change expected in any scenario.

---

## Residual risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Null-afford under-report | Medium (future) | Parity helper surfaces before consumer wiring |
| Snapshot build side effects | Low | Pre-existing normalizers; documented |
| Pressure field names (`obligationRisk`) | Low | `internalOnly`; no UI |

---

## Recommended next stage

**80N-D (proposed): breathingRoomIntent parity spec** — read-only doc defining whether Tier-2 export should call afford for observe-only parity, without changing Plan.

**Or:** **80E — Stability Room entry experience audit** — before experience model reads `noticed.*`.

**Do not yet:** Wire Reflection experience blocks to `noticed.*` copy.

---

## Success criteria

| Criterion | Met |
|-----------|-----|
| Fidelity verified | Yes (with documented gap) |
| Parity gaps documented | Yes |
| No UI changes | Yes |
| No orchestration changes | Yes |
| No behavioural changes | Yes |
| Shadow layer isolated | Yes |

**Result:** better understanding — not more behaviour.
