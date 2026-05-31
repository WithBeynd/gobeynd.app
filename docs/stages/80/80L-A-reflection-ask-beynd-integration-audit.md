# Stage 80L-A — Reflection Ask Beynd Integration Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION (design-ready)  
**Date:** May 2026  
**Baseline:** 80K-B Reflection Money sub-surface (local)

---

## Objective

Design whether and how Reflection connects to Ask Beynd without turning Reflection into chat, duplicating Plan, or creating unsupported advice.

**Core question:** When a user sees “Ask Beynd about this month” on Reflection, what should happen?

---

## Key finding

Beynd has **no Ask tab**. Ask Beynd is a **modal** opened via `geodeOpenAskBeynd()` (primary entry: Home button). Reflection integration must open the same modal as an overlay — not navigate to a tab.

---

## Recommended v1 (80L-B)

1. Tap Ask pointer on Reflection → resolve stack → build bounded Reflection context
2. Store **one-shot in-memory** pending block (not `localStorage`)
3. Open Ask Beynd modal over Reflection — **no auto-send**
4. Pre-fill textarea: **“Help me understand this month”**
5. On first **Ask** tap, append Reflection block to `geodeBuildCoachingContext()` after `MONTH CONTEXT`, then clear pending
6. Opening Ask from Home (non-Reflection) clears pending block

**Context source:** `geodeReflectionAskContext(...)` exports **ExperienceModel display copy only** — not raw snapshot, visual model, or gate internals.

**Auto-send:** Forbidden.

**Reject:** inline chat in Reflection (Option C), raw snapshot export, Ask tab.

---

## Context contract

Future helper:

```js
geodeReflectionAskContext(snapshot, visualModel, entryGate, experienceModel, opts)
```

- Max ~1200 chars; up to 3 block headline/body pairs
- Atmosphere label + assistant de-dup rules
- `snapshot.quiet.shouldStayQuiet` → gentler pacing rule only

---

## Next

[80L-B — Build Reflection Ask integration](./80L-B-build-reflection-ask-integration.md)
