# Stage 80J-A — Reality Reflection Entry Experience Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION (design-ready)  
**Date:** May 2026  
**Baseline:** `693fa06` — shadow reflection experience model committed

---

## Objective

Design the future Reality entry affordance for Reflection before any UI is built.

**Core question:** How should a user discover Reflection from Reality without noise, tasks, dashboards, or another alert?

**Principle:** One tap from Reality after meaningful month-context save — not a permanent prompt.

---

## Reality page order (top → bottom)

1. Exit (`Done` / `Back`)
2. Header — Reality check
3. Status card
4. Monthly compare (estimate / balance / difference)
5. Human moment (optional; may suppress when plan-shift offer + caution)
6. Plan alignment offer — “See how this month could shift”
7. Update check — balance save
8. Feeling chips (session-only)
9. **This month** — collapsed summary or expanded form

---

## Safest insertion point

**Below collapsed “This month” summary** after save collapses the form — inside the month-context group, not a page-level banner.

**Avoid:** status/compare area, adjacent to plan-shift offer, on expanded form, after balance/feeling-only actions.

---

## Stack caller (future UI)

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
var vm = geodeStabilityRoomVisualModel(snap);
var gate = geodeStabilityRoomEntryGate(snap, vm, {
  trigger: 'reality_month_context_save',
  justSavedMonthContext: true,
  dismissedThisMonth: false
});
var exp = geodeStabilityRoomExperienceModel(snap, vm, gate, { maxBlocks: 3 });
```

### Session contract (80J-B)

| Signal | Storage | Purpose |
|--------|---------|---------|
| `justSavedMonthContext` | sessionStorage | Set on MC save; cleared on dismiss / leave Reality |
| Reflection dismiss | sessionStorage | Blocks suggest until next MC save; not `S.monthContext.dismissedYm` |

Render arrow only when `gate.visibility === 'suggested'`.

---

## Copy separation

| Surface | Copy |
|---------|------|
| Plan alignment | See how this month **could shift** |
| Reflection entry | See how this month **fits together** |

---

## Next

[80J-B — Build Reality inline reflection entry](./80J-B-build-reality-inline-reflection-entry.md)
