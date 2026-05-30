# Stage 80C-D — Review Plan Presentation Polish

**Type:** Presentation-only refinement  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** 80C-B route value tier (unchanged logic)

---

## Objective

Polish low-value **Review your plan** secondary Main Action presentation after browser review — copy and affordance only.

---

## Changes

### Hint copy (80C-D)

**Before:** Plan has little to allocate this month yet — you can still review it when ready.

**After:** Plan has little to allocate this month. You can still review it when ready.

### Secondary affordance (80C-D → 80C-D.1)

| Iteration | Affordance |
|-----------|------------|
| 80C-D | Full-width `btn btn-s` — **Plan view →** |
| **80C-D.1** | Inline right-aligned text control — **Plan view ›** (no `btn` classes, not full-width) |

Same `geodeRunMainAction()` handler and Plan route; action object unchanged.

---

## Scope

| Touched | Not touched |
|---------|-------------|
| `geodeHomeMainActionHtml` hint + secondary affordance when `_maBtnTier === 'secondary'` | `geodeGetMainAction`, `geodeRunMainAction`, `geodeMainActionRouteValue` |
| | Plan, routing, alert dedup, coaching strip, CSS files, SW |

Primary Main Action states unchanged (`btn btn-p` full-width).

---

## Service worker

**No bump.**

---

## Next

Final post-build audit for 80C-B + 80C-D presentation slice.
