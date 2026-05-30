# Stage 77A — Ask Beynd Capability Assessment

**Type:** Read-only capability assessment  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  
**Baseline:** `b1de9dd` — Stage 76 complete  

---

## Objective

Assess what Ask Beynd can answer well after Stage 76, what remains weak, and what should be built next.

---

## Scope

Read-only audit of Ask Beynd context, prompts, and supporting engine exports. No code changes.

---

## Files touched

None (assessment only).

---

## Files intentionally not touched

All production code and prompts.

---

## Summary

| Metric | Result |
|--------|--------|
| Capability score | **6.5 / 10** (up from ~5 pre–Stage 76) |
| Strongest | Plan explanation (top 3 steps), posture coaching, Rule C alignment |
| Weakest | Skip/what-if, afford-new-amount, over-budget categories, investment absence |

---

## Findings

- Stage 76 PLAN RATIONALE block closes the plan *rationale export* gap for three steps.
- Skip/what-if remains **Critical** hallucination risk — one-line “do not invent skip outcomes” guardrail insufficient.
- Snapshot stores `debtProjectionNote` / `goalStatusWhy` but formatter does not export them (correct for skip inversion risk).
- Recommended next: **77B** skip guardrail (context-only), then optional over-budget context export.

---

## Risks

- LLM invents payoff timelines, interest impact, and target-date shifts on skip questions.
- Steps 4+ not in rationale block.
- Worker vs BYOK prompt drift (general “do not invent figures” only).

---

## Validation results

Static context inventory and question matrix (see audit transcript / 77B-A).

---

## Manual QA requirements

After 77B-B: ask skip/what-if questions; verify no invented months, interest, or target dates.

---

## Future dependencies

- 77B-A skip guardrail audit → 77B-B build → 77B-C post-build audit
- Optional 77C over-budget context export
- **No commit until Stage 77D post-audit approved**

---

## Commit readiness

N/A — assessment artifact. Informed 77B workstream.
