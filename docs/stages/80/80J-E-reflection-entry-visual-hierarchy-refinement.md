# Stage 80J-E — Reflection Entry Visual Hierarchy Refinement

**Type:** Visual hierarchy refinement  
**Verdict:** Built (local)  
**Date:** May 2026  
**Parent:** [80J-D visual hierarchy audit](./80J-D-reflection-entry-visual-hierarchy-audit.md)

---

## Objective

Move Reflection entry **inside** the collapsed “This month” card footer so it reads as part of the card, not floating helper text.

**Not:** new triggers, routes, storage, or shadow helper changes.

---

## Changes

### Collapsed card structure

Replaced single outer `<button>` with:

1. Bordered card container (same visual shell)
2. Expand tap target — title, optional line, summary, Edit
3. **In-card footer** — Reflection entry when gate is `suggested`

### Target layout

```text
This month                                      Edit
Optional. Helps Beynd coach this month.
In mind: rent
────────────────────────────────────────────
See how this month fits together ›
                              Not now
```

- Footer: subtle `border-top`, padding aligned to card
- Primary link: full-width block on its own line
- **Not now:** second row, right-aligned, softer opacity

---

## Unchanged

Session flags, gate resolve, tap toast, dismiss behaviour, shadow stack helpers, SW, coaching.json.

---

## Manual QA

1. Save month context → Reflection appears **inside** card below summary
2. Tap summary/header area → still expands form
3. Tap Reflection link → toast only
4. Tap Not now → footer removed
5. No Reflection row outside card border

---

## Next

Post-build audit **80J-F** (optional); then **80K** Reflection surface.
