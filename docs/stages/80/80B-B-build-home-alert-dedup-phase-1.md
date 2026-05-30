# Stage 80B-B — Build Home Alert Duplication Collapse Phase 1

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Baseline:** `85fe613`

---

## Objective

Reduce duplicate Home alert signals by suppressing the persistent Over Budget card when a higher-priority alert or spend-recovery Main Action already communicates the pressure state.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeHomeMainActionAlertDedupContext`; dedup rules in `geodeHomeOrchestrationResolve` |
| `docs/stages/80/*`, README, architecture-notes | Documentation |

---

## Files intentionally not touched

- `geodeGetMainAction`, `geodeOverdueCardHtml`, Over Budget card HTML in `rHome`
- Main Action, Plan, Reality, Ask Beynd, coaching strip, Insights, HM
- CSS, SW, `coaching.json`, `js/geode-pure/*`

---

## Rules (phase 1)

1. If **Needs Attention** is active → `surfaces.overBudget.show = false` (`dedup_needs_attention_priority`)
2. If **Main Action** is spend-recovery / pressure register → `surfaces.overBudget.show = false` (`dedup_main_action_spend_recovery`)
3. **Needs Attention card not suppressed** in this phase
4. **No muted detail lines** yet

---

## Implementation

### Helper

`geodeHomeMainActionAlertDedupContext(state, action)` — read-only; returns `maIsSpendRecovery` (via `geodeMainActionVisualRegister === 'pressure'`), `maIsOverduePath` (for future phase 2).

### Orchestration

After `overBudget`, `needsAttention`, and `mainAction` flags are computed in `geodeHomeOrchestrationResolve`, apply dedup before return. Append `disclosureNeeded` entries when suppressing (Stability Room feed; no Home UI).

`rHome` unchanged — still uses `geodeHomeOrchSurfaceShowResolved('overBudget', ...)`.

---

## Validation

Manual: over-budget + overdue → OB card hidden, NA + MA visible. Spend-recovery MA + OB → OB hidden.

---

## Service worker

**No bump** — orchestration show-flag only.

---

## Next

Post-build audit **80B-C**.
