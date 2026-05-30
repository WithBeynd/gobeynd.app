# Stage 77D-A — Ask Beynd Capability Reassessment

**Type:** Read-only reassessment  
**Verdict:** **PASS** — Stage 77 feature work complete; proceed to 77D-B final post-audit  
**Date:** May 2026  
**Baseline:** Stage 76 committed (`b1de9dd`); Stage 77B + 77C built locally (77B-C / 77C-C PASS)  

---

## Objective

Reassess Ask Beynd capability after Stage 77B skip guardrails and Stage 77C over-budget context; confirm score improvement and recommend whether to add more Stage 77 features or stop for final audit.

---

## Scope

Read-only review of `geodeBuildCoachingContext`, formatters, and documentation. No code changes in this stage.

---

## Files touched

None (reassessment only). Artifact filed in **77D-B.1** documentation closure.

---

## Files intentionally not touched

All production code and prompts.

---

## Summary

| Metric | 77A (pre–77B/77C) | 77D-A (after 77B/77C) |
|--------|-------------------|------------------------|
| **Capability score** | **6.5 / 10** | **7.5 / 10** |
| Plan explanation | Good (3 steps) | Good + skip guardrails |
| Over-budget / categories | Weak | Good when `left < 0` |
| Skip / what-if | Critical risk | Guardrailed (not simulated) |
| Afford £X | Weak | Still weak (deferred) |
| Investment absence | Weak | Still weak (`noInvestNote` not in formatter) |

**Recommendation:** **Stop Stage 77 feature work.** Run **77D-B** final post-audit → then commit hold review. Do not build afford engine, skip simulator, or classifier in Stage 77.

---

## Capability map (condensed)

### Strong

- Plan explanation (first 3 steps + Why)
- Focus / first incomplete / orchestration
- Reality alignment (Rule C) when Month Shift active
- Over-budget explanation when `calcMonthlyLeftover(S) < 0`
- Spending pressure / flexible categories (protected excluded)
- Posture-aware coaching (no shame)

### Medium

- Debt reasoning (balances/APR/Why — not full payoff storytelling)
- Goal reasoning (progress % — limited pace math in text)
- Skip questions (rules reduce harm; outcomes not simulated)

### Weak

- Afford-new-amount (“can I afford £X?”)
- Why not investing (`noInvestNote` in snapshot only)
- Subscriptions / overdue specifics
- Steps 4+ in PLAN RATIONALE (bounded to 3)

---

## Risks

| Risk | Notes |
|------|--------|
| LLM rule non-compliance | Context rules help; manual QA still required |
| Afford / invest absence questions | High hallucination risk if asked |
| Step 4+ gap | Block states “showing N of M” |

---

## Validation results

Static review of context assembly order and exports (May 2026):

1. Income, net worth, spending total  
2. Balance sense-check  
3. Posture, PAO, month context, orchestration  
4. **SPENDING / OVER-BUDGET** (if `left < 0`)  
5. DEBTS, GOALS, INVESTMENTS  
6. **PLAN RATIONALE** (+ SKIP / WHAT-IF LIMITS) or legacy plan strip fallback  

Worker `MAX_CONTEXT_CHARS = 12000` — typical context remains under limit.

---

## Manual QA

**Manual QA still required before commit approval.**

Reassessment does not replace live Ask Beynd checks listed in 77B-C, 77C-C, and 77D-B.

---

## Future dependencies

- **77D-B** final post-audit (documentation + holistic diff)  
- **77D-B.1** documentation closure (file artifacts)  
- Stage 78+: `noInvestNote` export, overdue/subscription context (audit-first)  

---

## Commit readiness

**PASS** for “no more Stage 77 features needed.”  

**Do not commit** until 77D-B returns PASS (all gates) and user explicitly approves bundled commit:

`feat(ask): add skip guardrails and over-budget context for Ask Beynd`
