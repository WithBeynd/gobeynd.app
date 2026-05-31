# Stage 80L-B — Build Reflection → Ask Beynd Integration

**Type:** Implementation  
**Verdict:** Built (local)  
**Date:** May 2026  
**Parent:** [80L-A Reflection Ask integration audit](./80L-A-reflection-ask-beynd-integration-audit.md)

---

## Objective

Connect Reflection to Ask Beynd safely. Reflection stays a **meaning surface**; Ask stays a **conversation surface**.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | Context formatter, pending block, modal opts, pointer tap |
| `coaching.json` | `askBeynd.reflection` prefill, intro, starters |

---

## Helpers

### `geodeReflectionAskContext(snapshot, visualModel, entryGate, experienceModel, opts)`

Bounded text block for Ask context only:

- Exports `title`, `subtitle`, up to 3 block headline/body pairs
- Human atmosphere label from `visualModel.atmosphere`
- Origin line + assistant rules (de-dup vs MONTH CONTEXT / PLAN RATIONALE)
- Optional gentler pacing when `snapshot.quiet.shouldStayQuiet`
- Max ~1200 chars; returns `''` when not composable

Does **not** export raw snapshot, gate reason codes, block `source`/`id`, or audit fields.

### Session pending (in-memory)

- `_geodeReflectionAskContextPending` — set on pointer tap; consumed on first `geodeBuildCoachingContext()` during send; cleared when opening Ask without `reflectionOrigin`

### `geodeReflectionAskPointerTap()`

1. Resolve `geodeReflectionStackForSurface(S)`
2. Build context via `geodeReflectionAskContext`
3. Set pending block
4. `geodeOpenAskBeynd({ reflectionOrigin: true, prefill })` — **no auto-send**

### `geodeOpenAskBeynd(opts)`

- `reflectionOrigin: true` → Reflection intro/starters via `geodeGetAskBeyndReflectionUiCopy`
- `prefill` → sets `#beynd-input` after modal open
- Non-Reflection open clears pending block
- Skips first-run intro when opened from Reflection

### `geodeGetAskBeyndReflectionUiCopy(state)`

Reflection-specific modal copy from `coaching.json` `askBeynd.reflection`; stability-first starter filter when Home load is high.

---

## UI

- Reflection Ask pointer → **button** with `›` affordance
- Opens existing Ask Beynd modal overlay (Reflection remains underneath)
- User must tap **Ask** to send

---

## Unchanged

- Worker, service worker, manifest, pure modules
- `geodeStabilityRoom*` shadow helpers (no edits)
- Plan rationale block and SKIP/WHAT-IF LIMITS
- No Ask tab, inline chat, auto-send, recommendations, new providers

---

## Manual QA

1. Reflection surface with Ask pointer visible → tap pointer
2. Ask modal opens; textarea pre-filled; **no** immediate send
3. Edit question → tap Ask → reply uses Reflection read in context (first send only)
4. Open Ask from Home → no Reflection block unless opened from Reflection again
5. Starters on Reflection open require explicit tap (no auto-send)

---

## Next

Post-build audit **80L-C** (read-only).
