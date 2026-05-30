# Stage 80G-B — Build Stability Room Visual Model Shadow

**Type:** Implementation  
**Verdict:** Built — contract completed in **80G-B.2** (atmosphere aligned in **80G-B.1**)  
**Date:** May 2026  
**Parent:** [80F-F visual reflection architecture audit](./80F-F-visual-reflection-architecture-audit.md)

---

## Objective

Build shadow-only `geodeStabilityRoomVisualModel(snapshot, opts)` — interprets snapshot for future UI atmosphere, sections, and entry copy. **Not UI.**

**Rule:** Snapshot calculates. Visual model interprets. UI will later express.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeStabilityRoomVisualModel` + `window._geodeStabilityRoomVisualModel` hook |

---

## Helper

```js
geodeStabilityRoomVisualModel(snapshot, opts)
```

**Input:** output of `geodeStabilityRoomSnapshot` (does not call snapshot unless caller passes it).

**Output:**

| Field | Purpose |
|-------|---------|
| `version` | Visual model schema version (`1`) |
| `mode` | Always `'reflection'` |
| `generatedAt` | From snapshot, opts, or `Date.now()` |
| `sourceSnapshotVersion` | `snapshot.version` (default `1`) |
| `atmosphere` | `calm` \| `reflective` \| `protective` \| `recovering` \| `room` |
| `viRegister` | `calm` \| `guidance` \| `review` \| `recovery` \| `progress` only |
| `viRegisterClass` | e.g. `vi-register-guidance` for future UI |
| `copyTone` | `declarative` \| `cautious` \| `encouraging` |
| `sections[]` | `{ id, visible, priority, register, headline }` |
| `entryCopy` | `{ eligible, suggest, dismiss }` — no routes |
| `motion` | `{ revealMs, staggerMs }` defaults |
| `audit` | `shadowOnly`, snapshot reason, `forbiddenRegisters` |

**Forbidden registers:** `pressure`, `risk`, `error` — never emitted.

---

## Section ids

- `what_matters_this_month`
- `what_beynd_noticed`
- `what_home_kept_quiet`
- `what_plan_protecting`
- `what_reality_changed`
- `ask_beynd_explain`
- `what_can_wait`

---

## Not touched

Home, Plan, Reality, Ask Beynd, CSS, routes, SW, coaching.json, snapshot assembler logic.

---

## Service worker

**No bump.**

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
var model = geodeStabilityRoomVisualModel(snap);
model.mode === 'reflection';
model.generatedAt;
model.sourceSnapshotVersion;
model.viRegister;
model.audit.forbiddenRegisters.indexOf('risk') >= 0;
model.sections.filter(function (s) { return s.visible; });
window._geodeStabilityRoomVisualModel === model;
```

---

## Next

Post-build audit **80G-D**; contract **80G-B.2**; entry gate shadow (future).
