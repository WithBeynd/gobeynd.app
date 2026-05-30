# Stage 79A — Home Hierarchy / Hidden Intelligence / Onboarding Context Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Objective

Audit Home hierarchy, orchestration consumption, onboarding surfaces, and feasibility of a future hidden intelligence room — without building UI.

---

## Core finding

Beynd already computes orchestration and deferred/disclosure decisions via `geodeHomeOrchestrationResolve`, `geodeOrchestrationSnapshot`, and `geodeDeferredQueueSnapshot`. **`rHome()` does not fully obey those decisions.**

| Surface | Orchestration computed? | rHome consumes? |
|---------|-------------------------|-----------------|
| Persistent over-budget | Yes (`surfaces.overBudget`) | **No** (direct `geodeHomePersistentOverBudgetCardVisible`) |
| Needs Attention | Yes (`surfaces.needsAttention`) | **No** (always `geodeOverdueCardHtml()`) |
| Subscription card | Yes | **Partial** |
| Coaching strip | Yes | **Partial** (legacy fallback gap) |
| Focus goal | Yes | **No** |
| Since-last-visit | Yes | **No** (parallel guards) |
| `disclosureNeeded[]` | Yes | **Never rendered** |

---

## Home render order (non-empty)

Hero → anticipatory → since-last-visit → post-QS prompts → stability mode → irregular-income strip → **over-budget** → **needs attention** → goal completion → **Main Action** → subscription → coaching strip → deferred meta → Ask Beynd → shortcuts → focus goal.

Main Action is below two alert-tier cards when both fire — correct alert-first order, but duplicate alert + Main Action semantics remain.

---

## Dominant signal rule (product)

Home must show **one clear dominant signal**. Suppressed intelligence may exist but must not become clutter.

Recommended bands:

- **Critical:** one alert tier → Main Action → muted defer lines; no coaching strip
- **Focused:** Main Action dominant → at most one secondary surface
- **Open/calm:** Hero atmosphere may lead; Main Action still visible

---

## Hidden intelligence (defer)

- `disclosureNeeded[]` and most `deferredItems[]` are computed but not rendered on Home today.
- A future hidden room should consume deferred/disclosure data **after** render obeys orchestration gates.
- **Do not build** portal / magic door / modal in Stage 79A or 79B-B.

---

## Onboarding (unchanged)

- Quick Setup completion cards are session-scoped (`geode_qs_just_finished`, `geode_post_qs_reality_prompt`).
- Ask Beynd first-run is modal-only (`S.askBeyndFirstRunShown`).

---

## Recommendation

Proceed to **79B-A** (orchestration wiring design) then **79B-B** (gate over-budget + needs-attention only). Defer reorder, coaching parity, focus goal, and hidden intelligence UI.

---

## Next stage

[79B-A — Home orchestration wiring audit](./79B-A-home-hierarchy-orchestration-wiring-audit.md)
