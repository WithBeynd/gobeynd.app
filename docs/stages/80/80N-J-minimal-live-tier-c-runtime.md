# 80N-J — Minimal Live Tier-C Runtime

**Stage:** 80N-J  
**Type:** Governance proof (first live Tier-C block)  
**Files:** `index.html`, this doc  

---

## Runtime law

| Principle | Implementation |
|-----------|----------------|
| Silence first | Gate default is suppress unless `PASS` |
| Replace not append | Tier-C replaces `month_so_far` only |
| Atmosphere supremacy | No Tier-C when `background` composes or atmosphere is recovering/reflective |
| Observational only | Copy from `geodeNoticedCopyMap('resilience')` |
| Ephemeral | No persistence; per compose pass only |
| Reflection only | `surface: 'reflection'` hard requirement |
| One domain | `resilience` only |
| One archetype | `quiet_background_ack` |

---

## Helpers

### `geodeNoticedTierCGate(snapshot, domain, opts)`

Read-only verdict contract:

- `PASS` | `SOFT_SUPPRESS` | `HARD_SUPPRESS` | `INTERNAL_ONLY`
- Never mutates snapshot, orchestration, Plan, or atmosphere

### `geodeTierCSlotDecision(snapshot, visualModel, composeCtx, opts)`

- `composeCtx.blockMap` — pre-order block preview
- Returns `tierCBlock`, `omitBlockIds`, `gate`
- Max 1 Tier-C block; replace `month_so_far` when PASS

---

## Suppression hierarchy

1. User `what_matters_this_month` (never replaced)
2. `background` (canonical quiet — Tier-C HARD_SUPPRESS if would show)
3. `month_so_far` (replaced by Tier-C when PASS)
4. Tier-C resilience (first live slice)

---

## Why resilience only

- Copy map `preferredSurface: stabilityRoom` / Reflection path
- Explains quiet without driving deferral
- Narrowest emotional surface vs pacing/breathing room

---

## Why Reflection only

- No Home/Plan/Ask wire
- Experience model is sole insertion point
- Dedicated Stability Room route still deferred

---

## Why ephemeral

- No localStorage/session Tier-C memory
- Proves governance without surveillance or grading

---

## Forbidden future drift

- Additional domains without new gate spec
- Append 4th block
- “Beynd noticed” headline
- Persistence / acknowledgement / rotation
- Orchestration or Plan hooks
- `pressure` or raw reason codes in UI

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
var vm = geodeStabilityRoomVisualModel(snap);
var gate = geodeStabilityRoomEntryGate(snap, vm, { trigger: 'none' });
var exp = geodeStabilityRoomExperienceModel(snap, vm, gate, { maxBlocks: 3 });
exp && exp.audit.tierCGateVerdict;
window._geodeTierCLastGate;
window._geodeTierCLastSlotDecision;
```

---

## Validation

- ReadLints `index.html`
- Inline script syntax
- `git diff --check`
- `service-worker.js` unchanged
- Manual Reflection QA per stage checklist
