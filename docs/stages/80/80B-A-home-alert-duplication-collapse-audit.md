# Stage 80B-A — Home Alert Duplication Collapse Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Baseline:** `85fe613`  
**Date:** May 2026  

---

## Core finding

Stage 79B wired alert surfaces to orchestration resolve, but Home can still stack **Over Budget + Needs Attention + Main Action** with repeated pressure semantics. Main Action should dominate; alert cards should not duplicate it.

---

## Duplication severity

| Scenario | Severity |
|----------|----------|
| Over-budget + overdue + MA overdue | **Severe** (triple stack) |
| Over-budget + MA spend-recovery | **High** |
| Overdue + MA “Clear overdue items first” | **High** (header dup; NA has item detail) |
| Over-budget only + MA plan step | **Medium** |

---

## Over Budget audit

- **Visible when:** `calcMonthlyLeftover < 0`, onboarded, meaningful expenses (`geodeHomePersistentOverBudgetCardVisible`)
- **Unique value:** £ monthly gap, explicit label, tap → Plan
- **Yields when:** Needs Attention active OR MA spend-recovery (`geodeMainActionVisualRegister === 'pressure'`)

---

## Needs Attention audit

- **Unique value:** Item names, days overdue, amounts
- **Phase 1:** Do **not** suppress NA card (detail loss without muted lines)
- **Phase 2:** Suppress NA when MA overdue + muted top-item line under MA

---

## Combined critical recommendation

**Suppress Over Budget when Needs Attention is active** (overdue priority). Optionally suppress OB when MA is spend-recovery path.

---

## Implementation design

- **Location:** `geodeHomeOrchestrationResolve` — set `surfaces.overBudget.show = false` with dedup reason codes
- **Helper:** `geodeHomeMainActionAlertDedupContext(state, action)` — read-only
- **Render:** `rHome` continues via `geodeHomeOrchSurfaceShowResolved` — no duplicate gates
- **Do not touch:** MA logic, card HTML/copy, Plan, Reality, Ask, coaching strip, CSS, SW

---

## Safest first build (80B-B phase 1)

1. Suppress Over Budget when `needsAttention.show`
2. Suppress Over Budget when MA is spend-recovery / pressure register

**Not in phase 1:** NA suppression, muted detail lines, combined summary card

---

## Next stage

[80B-B — Build alert dedup phase 1](./80B-B-build-home-alert-dedup-phase-1.md)
