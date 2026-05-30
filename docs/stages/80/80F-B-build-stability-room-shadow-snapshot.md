# Stage 80F-B — Build Stability Room Shadow Snapshot

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** [80F-A audit](./80F-A-stability-room-shadow-snapshot-audit.md)

---

## Objective

Build read-only `geodeStabilityRoomSnapshot(state, opts)` — assembles existing intelligence into a shadow reflection read-model. **Not UI.**

**Rule:** Compose existing helpers only. No new recommendations, alerts, actions, or plan math.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeStabilityRoomSnapshot` + `window._geodeStabilityRoomSnapshot` hook |

---

## Helper

```js
geodeStabilityRoomSnapshot(state, opts)
```

**Composes:**

| Section | Sources |
|---------|---------|
| `noticed` | `geodeHomeOrchestrationResolve.orchestration`, `geodeGetContextPosture`, `assessPressure` |
| `heldBack` | `disclosureNeeded`, `deferredItems`, `mutedLines`, `surfaces.*` from resolve |
| `humanContext` | `geodeGetMonthContext`, `geodeGetMonthContextCarry` (`suggestionOnly`), behaviour profile, feeling |
| `reality` | Slice from `geodePlanRationaleSnapshot.reality` |
| `planFocus` | Lean slice from plan rationale (strategy, first incomplete, top 3 steps, alignment, cautions) |
| `askBeynd` | Resolve emphasis + orchestration mode; pointer topics only |
| `quiet` | Empty state, user load, PAO `suppressTopics` |
| `audit` | `shadowOnly`, `sources[]`, `sideEffects[]` |

**Opts:** `monthKey`, `generatedAt`, `plan` (pass to avoid double `getMonthPlan()`).

---

## Not touched

Home, Plan, Reality, Ask Beynd, onboarding, CSS, SW, `coaching.json`, `js/geode-pure/*`

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
snap.version;
snap.heldBack.disclosureNeeded;
snap.humanContext.carrySuggestion.suggestionOnly;
window._geodeStabilityRoomSnapshot === snap;
```

---

## Manual QA

- [ ] Empty state: `emptyState === true`, minimal sections
- [ ] Over-budget dedup: `heldBack.disclosureNeeded` populated
- [ ] Month context saved: `humanContext.monthContext.hasAny`
- [ ] Carry present: `carrySuggestion.suggestionOnly === true`
- [ ] No Home / Plan / Reality UI change

---

## Next

Post-build audit **80F-C** (optional).
