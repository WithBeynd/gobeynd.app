# Stage 80H-A — Reflection Entry Gate Architecture Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION (design-ready)  
**Date:** May 2026  
**Baseline:** `b7640ec` — shadow visual reflection model

---

## Objective

Design entry gate architecture for Reflection / Stability Room before any UI affordance.

**Core question:** When should Reflection be `hidden`, `available`, or `suggested`?

**Principle:** Useful on demand — not another alert system.

---

## Shadow inputs (reliability)

| Signal | Gate use |
|--------|----------|
| `snapshot.active` / `snapshot.reason` | Hard blocks |
| `snapshot.quiet.shouldStayQuiet` | Blocks **suggested** |
| `humanContext.monthContext.hasAny` | Primary Reality-first suggest signal |
| `heldBack.*` / `planFocus.*` / `reality.*` | Content threshold |
| `visualModel.entryCopy.suggest` | Copy source only — **not** eligibility |
| `visualModel.noGo` | Product constraints |

**Gap:** `visualModel.entryCopy.eligible` is too broad for inline suggest — gate must narrow.

---

## Entry states

| State | Meaning |
|-------|---------|
| `hidden` | No value or hard block |
| `available` | Useful if user seeks it (Settings/manual later) |
| `suggested` | One inline `›` after **Save month context** only |

**Never:** urgency, badges, auto-open, notification drawer, Home entry.

---

## Reality-first suggest rules

**Suggested only when:**

1. `opts.trigger === 'reality_month_context_save'`
2. `reason === 'reflection_eligible'`
3. `!quiet.shouldStayQuiet`
4. `monthContext.hasAny === true`
5. Content threshold met
6. `noGo.autoOpen === false` (no auto-open room)

**Not suggested on:** balance-only save, feeling chips, carry-without-save, Home, quiet period.

**Copy:** `See how this month fits together ›` (from visual model when month context present).

---

## Proposed shadow helper

```js
geodeStabilityRoomEntryGate(snapshot, visualModel, opts)
// opts.trigger: 'reality_month_context_save' | 'manual' | 'settings' | 'none'
```

**Output:** `visibility`, `entrySurface`, `entryStyle`, `suggestCopy`, `dismissCopy`, `reason`, `audit`.

**Dismiss persistence:** deferred to future UI stage.

---

## Sequence

**80H-B** — shadow entry gate → **80H-C** audit → pause → **80H-D** Reality inline arrow UI (later).

---

## Next

[80H-B — Build reflection entry gate shadow](./80H-B-build-reflection-entry-gate-shadow.md)
