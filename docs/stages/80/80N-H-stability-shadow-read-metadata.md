# 80N-H — Stability Room Shadow-Read Metadata Pass

**Stage:** 80N-H  
**Type:** Plumbing validation (metadata only)  
**Files:** `index.html`, this doc  

---

## Objective

Prove Stability Room can hold `noticed.*` metadata references without becoming a second narrator or changing any user-visible copy.

---

## Pipeline audit (pre-build)

| Layer | Function | Role | Reads `noticed.*`? |
|-------|----------|------|------------------|
| Snapshot | `geodeStabilityRoomSnapshot` | Assembles Tier-2 `noticed.*` + **`stabilityMetadata`** | Producer |
| Visual | `geodeStabilityRoomVisualModel` | Atmosphere, sections, VI register | Legacy `contextPosture` only; **passthrough** `shadowRead.stabilityMetadata` |
| Gate | `geodeStabilityRoomEntryGate` | Reflection entry visibility | No |
| Experience | `geodeStabilityRoomExperienceModel` | Bounded copy blocks (Reflection UI) | No nested noticed; **passthrough** `shadowRead.stabilityMetadata` |
| Reflection | `geodeReflectionStackForSurface` | snap → vm → gate → exp | Unchanged render path |

### Atmosphere ownership

- **Owner:** `geodeStabilityRoomVisualModel` (posture, heldBack, month context)
- **Not influenced by:** `stabilityMetadata` (diagnostic atmosphere mirror in metadata helper is collision-only, not wired to VM)

### Quiet / disclosure ownership

- **Owner:** `geodeHomeOrchestrationResolve` → snapshot `heldBack` / `quiet`
- **Experience:** `background` block when heldBack + recovering/reflective atmosphere
- **`noticed.resilience`:** re-export only; future Tier C must defer when `background` block active

### Parallel narrator risks (current)

| Risk | Canonical owner today | Future noticed domain |
|------|----------------------|------------------------|
| Gentle pacing | `geodeFormatPlanPagePacingNote` (Plan) | `noticed.pacing` |
| Quiet Home | Experience `background` block | `noticed.resilience` |
| Month intent | Experience `what_matters_this_month` | `noticed.flexibility` |
| Recovery rhythm | Plan pacing note line | `noticed.recovery` |
| Month-so-far tone | Experience `month_so_far` (atmosphere) | `noticed.pacing` / posture |

---

## What was added

### `geodeStabilityRoomShadowMetadata(snapshot)`

Read-only helper. Attached as `snapshot.stabilityMetadata`.

**Includes:**

- Per-domain eligibility (`domains.*`)
- Display-safe / Tier-C-later flags
- `renderForbidden: true` on all domains
- `narratorCollisions` (pacing, resilience, continuity, recovery, flexibility, breathingRoomIntent)
- `deduplicationReadiness` (canonical owners, defer list, exclusive-later list)
- `pipeline` audit flags (`influencesAtmosphere: false`, etc.)

**Does not:**

- Emit copy, DOM, or badges
- Call orchestration or Plan
- Mutate snapshot fields used by VM/experience for rendering

### Passthrough (non-rendering)

- `geodeStabilityRoomVisualModel.shadowRead.stabilityMetadata`
- `geodeStabilityRoomExperienceModel.shadowRead.stabilityMetadata`

Both set `passthroughOnly: true` and `influencesModel: false` / `influencesBlocks: false`.

### Parity helper

`geodeNoticedParityCheck` consumers updated:

- `shadowMetadataReads: ['geodeStabilityRoomSnapshot:stabilityMetadata']`
- `shadowMetadataRenderForbidden: true`

---

## Deduplication readiness

| Existing narrative | Remain canonical | Future noticed should |
|--------------------|------------------|------------------------|
| Plan pacing note | Yes on Plan tab | Defer on Plan; silence in Stability if note exists on same session surface |
| `month_so_far` | Yes in Reflection | Defer pacing when atmosphere already gentle |
| `background` | Yes when heldBack | Defer resilience quiet copy |
| `what_matters_this_month` | Yes | Defer flexibility protect/worried echo |
| Breathing room softening | Plan detail footnote OR Stability (exclusive) | `planPath` only; never `posturePath` for amounts |

**Exclusive later:** `breathingRoomIntent.planPath` (one surface only)  
**Remain hidden forever:** `pressure`, raw `reasonCodes`, `often*` flags, `posturePath` as Plan copy

---

## Console QA

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
snap.audit.shadowOnly === true;
snap.noticed.pacing;
snap.stabilityMetadata.shadowOnly === true;
snap.stabilityMetadata.renderForbidden === true;
snap.stabilityMetadata.pipeline.influencesAtmosphere === false;
snap.stabilityMetadata.narratorCollisions.pacing;
window._geodeNoticedParityCheck();
```

---

## Validation checklist

- [ ] No visible UI / Reflection copy changes
- [ ] No new DOM
- [ ] No orchestration / Plan / afford changes
- [ ] No service-worker bump
- [ ] ReadLints clean on `index.html`
- [ ] `git diff --check` clean

---

## Next stage

**80N-I** — `geodeNoticedCopyMap` read-only helper (still no UI), then **80N-J** first single Tier-C Stability block with collision gate.
