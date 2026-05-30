# Stage 80A — Visual Intelligence & Hidden Intelligence Architecture Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  
**Baseline:** `85fe613` — Stage 79B complete (Home hierarchy wiring + HM non-alert)

---

## Objective

Step back after Stage 79B and audit surface responsibilities, Hidden Intelligence / Stability Room feasibility, and Visual Intelligence next steps — without building UI.

---

## Home hierarchy after 79B (resolved)

- Over Budget and Needs Attention obey orchestration resolve
- Coaching strip obeys orchestration when hidden
- Safety Insight reframes under over-budget pressure
- Home Human Moments no longer use warning styling

## Home hierarchy (still unresolved)

- Alert + Main Action duplication (over-budget card, needs-attention card, MA stack)
- Orchestration consumers incomplete: `focusGoal`, `sinceLastVisit`, full `askBeynd.emphasis`, `disclosureNeeded[]`
- Reality HM still uses amber styling (deferred)

---

## Surface responsibility map (summary)

| Surface | Primary job |
|---------|-------------|
| **Home** | What matters now; one next action |
| **Plan** | What to do this month and why |
| **Money** | Record and review transaction truth |
| **Goals** | Long-horizon targets |
| **Reality** | Update today’s balance truth |
| **Ask Beynd** | Explain reasoning conversationally |
| **Stability Room** *(future)* | What Beynd noticed but did not interrupt Home with |
| **Settings** | Preferences and configuration |

---

## Hidden Intelligence / Stability Room

| Dimension | Verdict |
|-----------|---------|
| User problem | Visibility into suppressed coaching/deferred items under load |
| Feeds | `deferredItems[]`, `disclosureNeeded[]`, suppressed HM/Insight |
| vs Ask Beynd | Passive inventory vs active dialogue |
| vs Plan | Meta “held back” layer vs execution steps |
| Clutter risk | High if surfaced as Home alert; low if opt-in |
| Naming | **Stability Room** (user-facing); avoid “panic room” |
| Timing | **Useful concept; premature UI** — pure snapshot before UI |

---

## Savings Release (context only)

- **Plan-only** when built; never tease on Home until architecture exists
- Over Budget card = structural signal → Plan
- Stability Room may link to Plan later; must not imply funds available

---

## Recommended sequence

1. **80B-A** — Alert duplication collapse audit  
2. **80B-B** — Alert dedup phase 1 build  
3. **80B-C** — Post-build audit  
4. **80C** — Main Action dominance audit  
5. **80D** — Stability Room shadow snapshot audit (no UI)

---

## Next stage

[80B-A — Home alert duplication collapse audit](./80B-A-home-alert-duplication-collapse-audit.md)
