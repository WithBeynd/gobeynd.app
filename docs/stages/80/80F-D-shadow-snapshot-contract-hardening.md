# Stage 80F-D — Shadow Snapshot Contract Hardening

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** [80F-C audit](./80F-B-build-stability-room-shadow-snapshot.md) (80F-C contract gaps)

---

## Objective

Harden `geodeStabilityRoomSnapshot` contract before commit — metadata for future reflection/visual consumers. **Not UI.**

---

## Scope

| File | Change |
|------|--------|
| `index.html` | Contract fields on snapshot return only |

---

## Contract additions

### `snapshotIntent`

```js
{
  mode: 'reflection',
  generatedFrom: ['home', 'plan', 'reality', 'monthContext']
}
```

### Top-level eligibility

- **`active`** — `true` when not empty state and `S.hasOnboarded === true`
- **`reason`** — `empty_state` | `not_onboarded` | `quiet_period` | `reflection_eligible`

### `visualIntent`

```js
{
  computed: false,
  status: 'deferred',
  note: 'Visual register and Stability Room UI are not implemented; this export is data-only.'
}
```

### `heldBack.mutedLines`

Strips `onClickRoute` — exports `text`, `kind`, `reason` only (no executable routes).

### `audit.sideEffects`

Documents delegated normalize paths:

- `geodeGetMonthContext_may_normalize_monthContext`
- `geodeGetMonthContextCarry_may_normalize_carry`
- `geodeBehaviourContinuityProfile_may_normalize_behaviourEvents`

Plus plan-rationale side effects propagated from 80F-B.

---

## Not touched

Home, Plan, Reality, Ask Beynd, onboarding, CSS, SW, coaching.json, orchestration producers.

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
snap.snapshotIntent.mode === 'reflection';
snap.visualIntent.computed === false;
snap.active;
snap.reason;
snap.heldBack.mutedLines.every(function (m) { return !('onClickRoute' in m); });
```

---

## Next

Post-build audit **80F-E** (optional) or commit bundle with 80F-B.
