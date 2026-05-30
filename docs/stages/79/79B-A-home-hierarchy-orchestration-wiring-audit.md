# Stage 79B-A — Home Hierarchy & Orchestration Wiring Design Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Objective

Design the safest first Home hierarchy improvement by auditing how orchestration decisions can influence Home render without reorder, visual redesign, plan math changes, or hidden intelligence UI.

---

## Orchestration resolve map

`geodeHomeOrchestrationResolve(state)` feeds from:

- `geodeOrchestrationSnapshot` — `homeBand`, `userLoad`, `primaryFocus`, `askBeyndMode`
- `geodeDeferredQueueSnapshot` — `deferredItems`, `disclosureNeeded`, muted lines
- `geodeHomeSoftPriorityContext` — band override (`open` / `focused` / `critical`)

### Surfaces computed

| Key | Show when |
|-----|-----------|
| `overBudget` | `left < 0`, onboarded, meaningful expenses, not QS just finished |
| `needsAttention` | Overdue items after Main Action dedup |
| `mainAction` | `geodeGetMainAction` truthy |
| `subscriptionCard` | Subs due; false when critical |
| `coachingStrip` | HM/insight; false when critical |
| `focusGoal`, `sinceLastVisit`, `askBeynd`, etc. | Various |

Pure-module snapshots (`js/geode-pure/*`) are **instrumentation only** — they do not change Home render.

---

## Render / orchestration parity gap

| Surface | Orchestration | rHome (pre-79B-B) | Gap | Risk |
|---------|---------------|-------------------|-----|------|
| Over-budget | `surfaces.overBudget.show` | `geodeHomePersistentOverBudgetCardVisible` | Not wired | Low if fallback |
| Needs Attention | `surfaces.needsAttention.show` | Always calls HTML helper | Not wired | Low if fallback |
| Subscription | `subscriptionCard.show` | Partial | Mostly aligned | Low |
| Coaching | `coachingStrip.show` | Partial + legacy fallback | Medium | Medium clutter |
| Main Action | `mainAction.show` | Direct helper | No show gate gap | Low |

---

## Safest 79B-B build candidate

**B — Gate over-budget + needs-attention via `resolve.surfaces.*.show`**

- Null-safe fallback to existing direct helpers (preserves behaviour when resolve fails).
- No reorder, CSS, orchestration producer changes, or new cards.
- Establishes pattern for 79B-C (reorder, coaching parity, dedup alert + Main Action).

### Surfaces to touch (79B-B)

- `rHome()` persistent over-budget block
- `rHome()` needs-attention / `geodeOverdueCardHtml()` call
- Optional shared helper: `geodeHomeOrchSurfaceShowResolved`

### Surfaces not to touch (79B-B)

Hero, QS prompts, Main Action logic/order, subscription, coaching, Ask Beynd, focus goal, orchestration producers, CSS, service worker.

---

## Visual register source-of-truth

- **Canonical today:** `--vi-*` tokens, `.main-action-card--*`, inline vi-pressure/vi-review on alert cards.
- **`.vi-register-*`:** defined in CSS, **zero HTML references** — defer wiring to 79B-C or later.

---

## Service worker

No bump for audit or presentation-only 79B-B unless bundled at named release.

---

## Next stage

[79B-B — Build Home orchestration gating](./79B-B-build-home-hierarchy-pass.md)
