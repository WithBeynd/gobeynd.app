# Stage 79B-H — Insight Pressure Reframe Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Core finding

Suppressing safety/buffer Insight when `left < 0` (79B-G direction) is **too blunt**. Beynd should support users before, during, and after pressure. The mismatch is **copy and tone**, not presence: “Continue building your estimated buffer…” while over-budget competes with the Over Budget card and Main Action.

---

## Decision

| Approach | Verdict |
|----------|---------|
| Suppress safety Insight when over-budget | Rejected — too blunt |
| **Reframe under pressure** | **Recommended** |

**Pressure trigger:** `calcMonthlyLeftover(state) < 0`  
**Topics:** `safety`, `irregular_safety`  
**Display choke point:** `geodeInsightPolishBody` + `type: 'neutral'` override in `renderInsights`  
**Do not change:** `getCoreNudges` source strings, orchestration, Plan math, CSS

---

## Pressure-aware copy (canonical)

> Your buffer is still part of your safety plan. This month, focus on keeping the plan steady first.

Variants for rotation; no “continue building”, “keep going”, or release/spare-cash language.

---

## Visual treatment

Force **`type: 'neutral'`** when reframed — avoids `insight-card--warning`. No CSS stage required.

---

## Peek parity

`geodeHomePeekWouldShowInsightStrip` checks primary eligibility, not polished copy — **no peek change** for reframe-only.

---

## Deferred

- Human Moment warn styling under pressure  
- Savings Release / Pressure Room UI  
- `getCoreNudges` copy edits  

---

## Next stage

[79B-I — Build pressure-aware safety Insight reframe](./79B-I-build-pressure-aware-safety-insight.md)
