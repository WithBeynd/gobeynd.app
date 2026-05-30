# Stage 80C-A — Main Action Dominance and Route Value Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Baseline:** `46ff1e1`  
**Date:** May 2026  

---

## Core finding

Main Action is visually dominant but **route value is uneven**. Home **“Review your plan”** → Plan **“Not enough spare cash…”** / **“Little to allocate…”** → **“Review actions on Home”** creates a **Home → Plan → Home** loop for thin or low-allocation profiles.

Dominance must include **destination usefulness**, not only card size.

---

## Review Plan loop

**Home shows “Review your plan” when:** `getMonthPlan()` has no steps or no step with `amount > 0` (and not over-budget MA suppress).

**Plan shows dead-end copy when:** `plan.steps.length === 0` or status `totalS <= 0`, plus alignment footer back to Home.

**Frequency:** Moderate — common for low `suggestableRoom`, expenses-only, no debt/buffer steps.

---

## Recommendation

- **Do not** change `geodeGetMainAction` priority logic in first build.
- Add read-only **`geodeMainActionRouteValue(action, state)`**.
- **Presentation only:** downgrade generic low-value “Review plan” from full **`btn-p`** to **`btn-s`**; keep enriched titles (buffer, subscription) as primary.
- Phase 2: optional route to Money / muted hints.

---

## Next stage

[80C-B — Build Main Action route value presentation tier](./80C-B-build-main-action-route-value-tier.md)
