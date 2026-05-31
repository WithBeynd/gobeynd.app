# Stage 80J-B — Build Reality Inline Reflection Entry

**Type:** Implementation  
**Verdict:** Built (local)  
**Date:** May 2026  
**Parent:** [80J-A Reality reflection entry audit](./80J-A-reality-reflection-entry-experience-audit.md)

---

## Objective

First user-facing Reflection affordance: optional **inline link** on Reality after meaningful month-context save. **Not** the Reflection surface (80K).

---

## Scope

| File | Change |
|------|------|
| `index.html` | Session flags, gate resolve, inline HTML, save/exit wiring |

---

## Session helpers

| Helper | Key | Purpose |
|--------|-----|---------|
| `geodeSetReflectionJustSavedMonthContext` | `geode_reflection_just_saved_mc` | Set on MC save when fields non-empty |
| `geodeGetReflectionEntryDismissed` | `geode_reflection_entry_dismissed` | Session dismiss — not `S.monthContext.dismissedYm` |

**Clear just-saved:** dismiss, expand MC form, exit Reality, navigate to Reality fresh, leave `msub !== 'reality'`.

**Clear dismiss:** new MC save.

---

## UI

- **`geodeRealityReflectionEntryHtml()`** — below collapsed “This month” row only
- Renders when `geodeRealityReflectionEntryGateForReality(S).visibility === 'suggested'`
- **Inline link** (`label` + `›`) + **Not now** — no card, banner, badge, or CSS file
- **Tap primary:** toast only until 80K (`geodeRealityReflectionEntryTap`)
- **Dismiss:** `geodeRealityReflectionEntryDismiss()` — session flags + re-render

---

## Unchanged

Snapshot, visual model, entry gate, experience model helpers; Plan, Home, Ask; SW; coaching.json; no routes / sub-surface / storage schema.

---

## Service worker

**No bump** (narrow affordance; Reflection surface not shipped).

---

## Manual QA

1. Reality → expand This month → fill fields → **Save month context**
2. Collapsed summary shows inline **See how this month fits together ›** + **Not now**
3. **Not now** removes row; re-save shows again
4. Save balance / feeling chips alone — no entry
5. Leave Reality and return — no entry without fresh save

---

## Next

Post-build audit **80J-C**; Reflection surface **80K**.
