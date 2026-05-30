# Stage 80C-B — Build Main Action Route Value Presentation Tier

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Baseline:** `46ff1e1`

---

## Objective

Prevent low-value **“Review your plan”** from using a full primary CTA when Plan has no actionable steps. **Presentation-only** — no change to `geodeGetMainAction`, Plan, or run handlers.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeMainActionRouteValue`; tier in `geodeHomeMainActionHtml` |
| `docs/stages/80/*`, README, architecture-notes | Documentation |

---

## Files intentionally not touched

- `geodeGetMainAction`, Plan/Money/Reality/Ask routing logic
- Over Budget, Needs Attention, alert dedup, coaching strip
- CSS files, SW, `coaching.json`, pure modules

---

## Helper

**`geodeMainActionRouteValue(action, state, opts)`** — read-only.

Returns `{ tier: 'primary'|'secondary', reason, planStepsActionable }`.

**Secondary when:** generic **Review your plan** / **Stay on track** + **Review plan** CTA + no amount + Plan has no actionable steps (`!steps`, no `amount > 0`, or `totalS <= 0`, or `!geodeHasPlanContext()`).

**Stays primary:** amounts, overdue, spend-recovery, setup/income/spending CTAs, plan complete, enriched titles (buffer, subscription, debt sub).

---

## Presentation

In `geodeHomeMainActionHtml`, after display title enrichment:

- `tier === 'secondary'` → `btn btn-s` instead of `btn btn-p`; optional display-only hint line.
- Same `geodeRunMainAction()` — run handler unchanged.

---

## Service worker

**No bump.**

---

## Next

Post-build audit **80C-C**.
