# Stage 80K-A — Reflection Surface Architecture Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION (design-ready)  
**Date:** May 2026  
**Baseline:** 80J committed — Reality inline Reflection entry live; ExperienceModel shadow ready

---

## Objective

Design the first Reflection **surface** before UI is built — routing, stack caller, and render contract only.

**Core question:** Where does Reflection live in navigation, and what may the UI read?

**Principle:** Mirror Reality’s full-page Money sub-surface pattern; render **only** from `geodeStabilityRoomExperienceModel` output — no new shadow composer, no snapshot recalculation in UI.

---

## Pipeline (unchanged)

```
geodeStabilityRoomSnapshot
  → geodeStabilityRoomVisualModel
  → geodeStabilityRoomEntryGate
  → geodeStabilityRoomExperienceModel
  → UI
```

---

## Routing recommendation

| Signal | Value |
|--------|-------|
| Tab | `money` |
| Sub-surface | `msub = 'reflection'` |
| Pattern | Early return in `rMoney()` — same as `msub === 'reality'` |

**Exit:** `geodeExitReflectionSurface()` → `msub = 'reality'` (not `geodeExitRealitySurface()`).

**Tab switch:** `goTab()` resets `reflection` → `overview` when leaving Money (same as Reality).

---

## Proposed helpers (80K-B)

| Helper | Role |
|--------|------|
| `geodeReflectionStackForSurface(state)` | Snapshot → visual → gate → experience; returns `null` when gate hidden or no blocks |
| `geodeNavigateToReflectionFromReality()` | Entry tap: clear just-saved, set `tab='money'`, `msub='reflection'`, `render()` |
| `geodeReflectionSurfaceHtml()` | HTML from `stack.exp` only |
| `geodeExitReflectionSurface()` | Back to Reality sub-surface |

**Wire:** replace `geodeRealityReflectionEntryTap` toast with `geodeNavigateToReflectionFromReality()`.

**Extend:** `rMoney()`, `rMsub()`, `goTab()`.

---

## Render contract

**May render from ExperienceModel:**

- `title`, `subtitle`, `density`, `exitLabel`
- `blocks[]` — `headline`, `body`, `registerClass`, `spacing`, `visible`
- `motion` — stagger/reveal timing only
- `askPointer.label` — static copy only (no Ask route in 80K-B)

**Must not render in UI:**

- `source`, block `id`, `audit`, `noGo`, raw snapshot fields
- Charts, tables, amounts, traffic lights, recommendations, actions, forms

**Styling:** Reuse Reality page shell (`reality-page`, `reality-topbar`, `reality-head`) + existing `.vi-register-*` classes from blocks.

---

## Entry trigger (preserve 80J)

Reflection surface reachable from inline entry only when:

- Meaningful month-context save (non-empty protect / worried / success)
- `justSavedMonthContext` session flag set
- Gate `visibility === 'suggested'`
- Not dismissed this session

Navigate clears `justSaved` so entry does not re-offer on return to Reality.

**Fallback:** If stack resolves empty while `msub === 'reflection'`, fall back to Reality page.

---

## Out of scope (80K-B)

- New shadow model or composer
- Home entry, notifications, badges
- Ask integration (tap/route)
- Persistent storage schema changes
- Service worker bump (optional follow-up)

---

## Next

[80K-B — Build Reflection Money sub-surface](./80K-B-build-reflection-money-subsurface.md)
