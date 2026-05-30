# Stage 76D-B — Ask Beynd Context Integration Audit

**Type:** Read-only integration design audit  
**Verdict:** NEEDS ATTENTION — safe to proceed with concise rationale block  
**Date:** May 2026  

---

## Objective

Determine the safest way to integrate `geodePlanRationaleSnapshot` into Ask Beynd context without clutter, contradiction, hallucination, token bloat, or duplicate coaching.

---

## Scope

Read-only audit of Ask Beynd flow, `geodeBuildCoachingContext`, snapshot, worker limits. No code changes in this stage.

---

## Files touched

None (audit only).

---

## Files intentionally not touched

All production code; prompts; UI.

---

## Findings (summary)

- Ask Beynd path: `geodeAskBeynd` → `geodeBuildCoachingContext()` → `geodeBeyndAiComplete` → worker (`MAX_CONTEXT_CHARS = 12000`).
- Current context includes debts/goals/posture/Reality prose but plan steps as **`P1: label (£X)` only** — no rationale, affordability, or alignment.
- Snapshot holds full rationale + alignment; not wired before 76D-B build.
- **Recommended:** Option B — concise text block, max 3 steps, ~2500 char cap; **not** full JSON.
- **Rule C:** When `alignment.active`, never state baseline as sole current amount.

---

## Risks

- Double `getMonthPlan()` — mitigate with shared `opts.plan`.
- Token bloat — cap formatter output.
- Contradiction under Month Shift — Rule C + alignment rows in block.

---

## Validation results

Static flow map and context inventory.

---

## Manual QA requirements

After build: Ask “why is step 1 this amount?” with/without active Month Shift; verify dual amounts when aligned.

---

## Future dependencies

76D-B build → post-build audit → handover update.

---

## Commit readiness

N/A — audit artifact. Informed 76D-B implementation.

---

## Recommendation

**A — Proceed to 76D-B build with concise context block.**
