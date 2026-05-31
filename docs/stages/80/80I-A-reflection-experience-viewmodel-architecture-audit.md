# Stage 80I-A — Reflection Experience ViewModel Architecture Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION (design-ready)  
**Date:** May 2026  
**Baseline:** `2fcd54a` — shadow entry gate committed

---

## Objective

Design **`geodeStabilityRoomExperienceModel`** — composes bounded human copy blocks from snapshot + visual model + entry gate. **Not UI.**

**Stack:** snapshot → visual model → entry gate → **experience model** → future UI

---

## ExperienceModel role

| Should | Should not |
|--------|------------|
| Compose copy, order blocks, tone, visibility | Calculate finance, orchestration, recommendations |
| Apply atmosphere + VI registers | Expose posture codes, raw arrays, amounts |
| Respect `entryGate.visibility === 'hidden'` | DOM, storage, routes |

---

## Human-first

Block 1 = **`humanContext.monthContext`** (protect / worried / success) when `hasAny`. Never open with money, diff, or held-back raw data.

---

## v1 blocks (max 3 body + footer)

| Id | Headline | Source |
|----|----------|--------|
| `what_matters_this_month` | What you said matters | monthContext |
| `month_so_far` | Looking at the month so far | synthesized from atmosphere (not "Beynd noticed") |
| `background` | What stayed in the background | mutedLines / deferred humanCopy |
| `plan_protecting` | What your plan is protecting | headlineSummary / strategy name |
| Ask pointer (footer) | Ask Beynd about this month | conditional |

**Pick C or D** by atmosphere: recovering/reflective → background; calm/protective/room → plan_protecting.

---

## Atmosphere ordering

| Atmosphere | Block order |
|------------|-------------|
| calm | A → B → D |
| reflective | A → B → C |
| protective | A → D → B |
| recovering | A → C → B |
| room | A → B → D |

**room** = flexibility / space, never opportunity or spare money.

---

## Copy rules

- No em dashes; short conversational sentences
- Prohibited: You should, You must, At risk, Warning, Danger, Opportunity, Optimise, action item
- No Reality amounts, diff, status labels duplicated

---

## Next

[80I-B — Build reflection experience ViewModel shadow](./80I-B-build-reflection-experience-viewmodel-shadow.md)
