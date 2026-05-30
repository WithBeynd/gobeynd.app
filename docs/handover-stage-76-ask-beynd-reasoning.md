# Stage 76 Handover — Ask Beynd Reasoning & Plan Rationale Snapshot

**Date:** May 2026  
**Status:** In progress — shadow export complete; Ask Beynd **not wired**  
**Commits:**

| Stage | SHA | Message |
|-------|-----|---------|
| 76C-B | `cdc77e2` | `feat(ask): add shadow plan rationale snapshot` |
| 76D-A.6 | *pending* | `feat(ask): export Reality alignment in plan rationale snapshot` |

**Documentation index:** [`docs/stages/76/README.md`](./stages/76/README.md)

---

## Build philosophy (carry forward)

- **Audit-first** for Ask Beynd and plan reasoning — map sources before changing context or prompts.
- **Translator, not inventor** — Ask Beynd should narrate `getMonthPlan()` + affordability + alignment, not guess allocation rules.
- **Shadow before wire** — `geodePlanRationaleSnapshot` proven in console before `geodeBuildCoachingContext` changes.
- **Rule C for amounts** — when Month Shift active, expose baseline **and** display amounts.
- **No stage complete without `/docs`** — see [stage-documentation-policy.md](./stage-documentation-policy.md).

---

## Problem solved (76A–76B)

Ask Beynd received `P1: label (£X)` while Plan UI and `getMonthPlan()` already had rich `why`, affordability gates, and progress. The gap was **export**, not engine intelligence.

---

## What was built

### `geodePlanRationaleSnapshot(state, opts)` (76C-B)

Shadow read-model in `index.html` (~25592+):

- Plan headline, affordability, per-step rationale, progress, firstIncomplete, reality, cautions, askBeyndGuidance
- Single direct `getMonthPlan()` via `opts.plan || getMonthPlan()`
- Hook: `window._geodePlanRationaleSnapshot`

### `alignment` block (76D-A.6)

- `geodePlanRationaleAlignmentBlock()` via `geodePeekActiveRealityPlanAlignment` only
- Closes parity gap with Plan UI when Month Shift approved
- Does **not** change `steps[].amount` (baseline preserved)

---

## What was intentionally not changed

- Ask Beynd UI, `geodeBuildCoachingContext`, prompts, worker, coaching.json
- Plan math, Reality logic, Month Shift approve/revert flows
- Home, Main Action, Plan/Reality visible copy
- `js/geode-pure/*` (identity helpers consumed read-only)

---

## Three amount layers (memorize)

1. **Baseline** — `getMonthPlan().steps[].amount` (includes affordability Reality shrink in engine)
2. **Affordability Reality** — `plan.affordability.realityAdjustment` (reduces suggestable room)
3. **Month Shift overlay** — `S.realityPlanAlignment` (display only) → exported in `snap.alignment`

Plan UI: row amount = layer 3 when active, else layer 1 (+ progress remaining).  
Main Action: layer 1 / progress only (no overlay).  
Ask Beynd today: layer 1 label+amount string only.

---

## Risks still open

| Risk | Mitigation |
|------|------------|
| Double `getMonthPlan()` via peek stale check | Pass shared `opts.plan`; document in audit |
| `amountRationale` sparse on non-debt steps | Use `reasonDetail` + affordability in 76D-B copy |
| Skip / what-if questions | Not in snapshot; guidance tells LLM not to invent |
| Worker vs BYOK prompt drift | Separate backlog; 76D-B should be context-only first |

---

## Manual QA (before 76D-B)

```js
var plan = getMonthPlan();
var snap = geodePlanRationaleSnapshot(S, { plan: plan, generatedAt: Date.now() });
snap.alignment;
snap.steps.map(function(s){ return [s.label, s.amount, s.reasonHeadline]; });
// With Month Shift: snap.alignment.stepAdjustments vs Plan row amounts
```

---

## Next stage: 76D-B (recommended)

1. Add `geodeFormatPlanRationaleContextBlock(snap)` (or equivalent) — **serialize only**, no prompt rewrite unless scoped.
2. Call snapshot once from Ask Beynd path; pass `opts.plan` from same `getMonthPlan()` if context still needs plan strip.
3. Implement rule **C** in coaching guidance string when `alignment.active`.
4. Post-build audit + update this handover.

**Do not:** replace full `geodeBuildCoachingContext` (debts, goals, posture still required).

---

## Related docs

- [Stage 55C Reality-to-Plan alignment](./handover-stage-55c-reality-to-plan-alignment.md) — overlay lifecycle
- [Architecture notes](./architecture-notes.md) — Ask Beynd + snapshot pointers
- [Stage documentation policy](./stage-documentation-policy.md)

---

## Commit readiness

| Item | Status |
|------|--------|
| 76C-B | Committed `cdc77e2` |
| 76D-A.6 | **Uncommitted** — PASS in 76D-A.7; ready to commit |
| 76D-B | Not started |
