# Stage 80K-B — Build Reflection Money Sub-Surface

**Type:** Implementation  
**Verdict:** Built (local)  
**Date:** May 2026  
**Parent:** [80K-A Reflection surface architecture audit](./80K-A-reflection-surface-architecture-audit.md)

---

## Objective

First Reflection **surface**: Money sub-surface `msub='reflection'` rendering directly from `geodeStabilityRoomExperienceModel` — no new shadow layer, no UI-side recalculation.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | Stack helper, navigate/exit, surface HTML, router wiring, entry tap |

---

## Helpers

### `geodeReflectionStackForSurface(state)`

Read-only stack for surface render:

```js
snap → vm → gate (reality_month_context_save + session flags) → exp
```

Returns `null` when gate is `hidden` or experience has no blocks. Hook: `window._geodeReflectionStackForSurface`.

### `geodeNavigateToReflectionFromReality()`

- Resolves stack; no-op if empty
- Clears `geode_reflection_just_saved_mc`
- Sets `tab = 'money'`, `msub = 'reflection'`, syncs tab bar, `render()`

### `geodeReflectionSurfaceHtml()`

- Reuses Reality page shell classes (`reality-page`, `reality-topbar`, `reality-head`, `reality-exit`)
- Renders `title`, `subtitle`, `blocks[]` with `registerClass` + motion delays from `exp`
- Static `askPointer.label` when visible — no Ask route
- Does **not** render `source`, `id`, or `audit`

### `geodeExitReflectionSurface()`

- `tab = 'money'`, `msub = 'reality'`, tab bar sync, `render()`
- Does **not** call `geodeExitRealitySurface()`

---

## Router wiring

| Location | Change |
|----------|--------|
| `geodeRealityReflectionEntryTap()` | Calls `geodeNavigateToReflectionFromReality()` (replaces toast) |
| `rMoney()` | Early return for `msub === 'reflection'`; fallback to Reality if HTML empty |
| `rMsub()` | `reflection` branch |
| `goTab()` | Reset `reflection` → `overview` when switching away from Money |
| `rMoney()` just-saved clear | Preserved for both `reality` and `reflection` |

---

## Unchanged

- `geodeStabilityRoomSnapshot`, visual model, entry gate, experience model implementations
- Session dismiss helpers (80J)
- Plan, Home, Ask routes
- coaching.json, manifest, worker, icons
- No charts, tables, forms, actions, badges, traffic lights, persistent storage

---

## Service worker

**No bump** (allowed-file list; narrow surface addition — bump optional before ship).

---

## Manual QA

1. Reality → save month context (non-empty fields) → inline entry appears
2. Tap **See how this month fits together ›** → Reflection surface opens (`msub='reflection'`)
3. Title, subtitle, and up to 3 copy blocks render from experience model
4. **Back to Reality** returns to Reality sub-surface (not Money overview)
5. Switch tab away from Money → returns to overview; re-enter Money normally
6. Dismiss entry or save empty context → no surface via entry
7. Direct `msub='reflection'` with no eligible stack → falls back to Reality

---

## Next

Post-build audit **80K-C** (read-only).
