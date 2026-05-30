# Stage 80H-B — Build Reflection Entry Gate Shadow

**Type:** Implementation  
**Verdict:** Built — contract aligned in **80H-B.1** (80H-C audit)  
**Date:** May 2026  
**Parent:** [80H-A entry gate architecture audit](./80H-A-reflection-entry-gate-architecture-audit.md)

---

## Objective

Shadow-only **`geodeStabilityRoomEntryGate(snapshot, visualModel, opts)`** — decides `hidden` / `available` / `suggested` without UI, routes, or dismiss storage.

**Rule:** Snapshot calculates → visual model interprets → **entry gate decides visibility** → UI expresses later.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeStabilityRoomEntryGate` + `window._geodeStabilityRoomEntryGate` |

---

## Helper

```js
geodeStabilityRoomEntryGate(snapshot, visualModel, opts)
```

**`opts`:**

| Opt | Purpose |
|-----|---------|
| `trigger` | `'reality_month_context_save'` \| `'manual'` \| `'settings'` \| `'none'` |
| `justSavedMonthContext` | **Required `true` for `suggested`** |
| `dismissedThisMonth` | When `true`, blocks `suggested` |

**Output:**

| Field | Purpose |
|-------|---------|
| `visibility` | `hidden` \| `available` \| `suggested` |
| `entrySurface` | `'reality'` when suggested; else `null` |
| `entryStyle` | `'inline_arrow'` when suggested; else `null` |
| `label` | Suggest copy — no route |
| `dismissLabel` | `'Not now'` when suggested |
| `reason` | Primary gate decision code |
| `reasonCodes` | Code array |
| `suppressReason` | Why suggest withheld (e.g. `missing_just_saved_flag`) |
| `trigger` | Echo of opts trigger |
| `frequency` | `once_per_save_event` \| `on_demand` \| `null` |
| `audit` | `shadowOnly`, `noHomeEntry`, `noAutoOpen`, `noRoutes`, `noStorage` |

### Suggested (narrow)

Only when **all**:

- `trigger === 'reality_month_context_save'`
- `justSavedMonthContext === true`
- `dismissedThisMonth !== true`
- `snapshot.reason === 'reflection_eligible'`
- `!quiet.shouldStayQuiet`
- `monthContext.hasAny`
- content threshold + ≥1 visible section
- `noGo.autoOpen === false`

Does **not** use `visualModel.entryCopy.eligible` for suggest.

---

## Not touched

Reality save flow, Home, Plan, Ask, CSS, routes, SW, coaching.json, dismiss persistence.

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
var vm = geodeStabilityRoomVisualModel(snap);
var gate = geodeStabilityRoomEntryGate(snap, vm, { trigger: 'none' });
gate.visibility;
var gateSave = geodeStabilityRoomEntryGate(snap, vm, {
  trigger: 'reality_month_context_save',
  justSavedMonthContext: true,
  dismissedThisMonth: false
});
gateSave.visibility;
gateSave.audit.noStorage === true;
window._geodeStabilityRoomEntryGate === gateSave;
```

---

## Next

Post-build audit **80H-C** (re-run after **80H-B.1**); Reality inline arrow UI deferred.
