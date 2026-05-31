# Stage 80I-B — Build Reflection Experience ViewModel Shadow

**Type:** Implementation (80I-B) + contract hardening (80I-C.1)  
**Verdict:** Built (local)  
**Date:** May 2026  
**Parent:** [80I-A experience ViewModel architecture audit](./80I-A-reflection-experience-viewmodel-architecture-audit.md)

---

## Objective

Shadow-only **`geodeStabilityRoomExperienceModel(snapshot, visualModel, entryGate, opts)`** — composes bounded human copy blocks for future Reflection UI.

**Rule:** Snapshot calculates → visual model interprets → entry gate decides availability → **experience model composes copy** → UI renders later.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeStabilityRoomExperienceModel` + hook |

---

## Helper

```js
geodeStabilityRoomExperienceModel(snapshot, visualModel, entryGate, opts)
```

**Returns `null` when:** missing inputs, or `entryGate.visibility === 'hidden'`, or no composable blocks.

**Output:**

| Field | Purpose |
|-------|---------|
| `title` / `subtitle` / `exitLabel` | Shell copy (future UI) |
| `density` | `light` / `roomy` / `standard` (80I-C.1) |
| `blocks[]` | `{ id, register, registerClass, headline, body, visible, priority, spacing, source }` |
| `askPointer` | Optional footer link metadata |
| `motion` | From visual model |
| `noGo` | `noCharts`, `noAmountsTable`, `noTrafficLights`, `noRecommendations`, `noRawInternals` |
| `audit` | `shadowOnly`, `noUi`, `noRoutes`, `noStorage`, `noCalculations`, versions, `entryGateVisibility` |

### v1 block ids

- `what_matters_this_month`
- `month_so_far`
- `background` or `plan_protecting` (atmosphere pick)
- Max **3** body blocks (`opts.maxBlocks`)

---

## Not touched

Snapshot, visual model, entry gate, Reality save, UI, CSS, routes, SW, coaching.json.

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
var vm = geodeStabilityRoomVisualModel(snap);
var gate = geodeStabilityRoomEntryGate(snap, vm, { trigger: 'none' });
var exp = geodeStabilityRoomExperienceModel(snap, vm, gate);
exp && exp.blocks.length;
exp && exp.blocks[0].id;
window._geodeStabilityRoomExperienceModel === exp;
```

---

## Next

Post-build audit **80I-C**; no arrow or surface UI until PASS.
