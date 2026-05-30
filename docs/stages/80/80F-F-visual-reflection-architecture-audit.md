# Stage 80F-F — Visual Reflection Architecture Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  
**Baseline:** `0b2bec9` — `feat(stability): add shadow reflection snapshot`

---

## Objective

Design future visual architecture for Stability / Reflection Room **without building UI**.

**Core question:** How should Beynd reveal reflection intelligence in a premium, calm, non-traffic-light way without cluttering Home?

---

## Core finding

- **Data layer ready:** `geodeStabilityRoomSnapshot` committed (80F-B/D).
- **Visual layer deferred:** `visualIntent.computed === false`.
- **Full room UI too early** — competes with Home one-signal rule.

**Recommended sequence:** **80G-B** visual model shadow → **80G-C** entry gate shadow → pause → optional Reality affordance → full room later.

---

## Entry model (recommended)

| Phase | Entry |
|-------|-------|
| **Now** | None automatic |
| **First affordance** | Reality post **Save month context** — opt-in text link |
| **Avoid** | Permanent Home card, badge, floating icon, notification drawer |

---

## Trigger rules

**Hard block:** `active === false`, `empty_state`, `not_onboarded`.

**Soft block:** `quiet_period` — Settings/manual only.

**Content threshold (opt-in suggest):** any of month context saved, `disclosureNeeded`, deferred `humanCopy`, reality data, alignment active, carry suggestion.

**Avoid as triggers:** over-budget alone, needs-attention, traffic-light semantics, “you can afford”.

---

## Visual atmosphere (non-traffic-light)

Allowed VI registers for room: **calm, guidance, review, recovery, progress**.

**Never:** risk, error, pressure, green/amber/red traffic-light framing.

| Atmosphere | When | VI register |
|------------|------|-------------|
| Calm | Open month, reflection eligible | calm |
| Reflective | Month context, disclosure | guidance / review |
| Protective | protect_flexibility posture, dependants | calm |
| Recovering | Held-back Home signals | recovery |
| Room | growth_room posture (rare) | progress |

---

## Snapshot → UI rule

**Snapshot calculates. UI expresses.** UI must not recalculate financial logic.

---

## Safest next build

**80G-B** — `geodeStabilityRoomVisualModel(snapshot)` shadow-only.

---

## Next

[80G-B — Build Stability Room visual model shadow](./80G-B-build-stability-room-visual-model.md)
