# Stage 76A — Ask Beynd Intelligence Audit

**Type:** Read-only audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Objective

Assess whether Ask Beynd acts as a grounded financial coach or a generic LLM over summary text.

---

## Scope

Read-only audit of Ask Beynd flow: UI → `geodeBuildCoachingContext` → worker/BYOK → prompts.

**Files in scope:** `index.html`, `coaching.json`, `service-worker.js`, `manifest.json`, `js/geode-pure/*`, `worker/src/index.js`

---

## Files touched

None (audit only).

---

## Files intentionally not touched

All production files; no implementation.

---

## Findings (summary)

- Ask Beynd is a **partially grounded** assistant (~5/10 intelligence for plan questions).
- Context includes income, debts, goals, posture, Reality gap prose, plan steps as **`P1: label (£amount)` only**.
- **Missing from context:** step `why`/`note`, affordability gates, payment schedule, Month Shift overlay, Main Action, sequencing rules.
- Two prompt paths: worker default system prompt vs BYOK `coaching.json` `systemPromptBase`.

---

## Risks

- LLM invents rationale for “why this amount” and “why this order” today.
- Reality gap in prose without alignment overlay → display mismatch if user approved Month Shift.

---

## Validation results

Static code audit; no automated tests.

---

## Manual QA requirements

Open Ask Beynd; ask “why is P1 this amount?” — response will infer unless user has full mental model from Plan tab.

---

## Future dependencies

- Stage 76B reasoning map → 76C snapshot → 76D integration.
- Do not expand prompts until rationale export exists.

---

## Commit readiness

N/A — audit artifact only. Documented in repo for continuity.
