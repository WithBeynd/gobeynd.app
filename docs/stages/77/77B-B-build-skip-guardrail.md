# Stage 77B-B — Build Ask Beynd Skip / What-If Guardrail

**Type:** Implementation  
**Verdict:** Built — [77B-C post-build audit PASS](./77B-C-post-build-audit.md)  
**Date:** May 2026  

---

## Objective

Add concise always-on skip/what-if guardrails to PLAN RATIONALE assistant rules so Ask Beynd explains why steps exist without inventing skip outcomes.

---

## Scope

`index.html` — `geodeFormatPlanRationaleContextBlock` only. No UI, worker, prompts, plan/Reality logic.

---

## Files touched

| File | Change |
|------|--------|
| `index.html` | Extended assistant rules; `MAX_BLOCK` 2500 → 2800 |

---

## Files intentionally not touched

- `coaching.json`, `service-worker.js`, `manifest.json`, `worker/`, `js/geode-pure/*`
- Ask Beynd UI, plan math, progress, Reality, Month Shift

---

## Implementation summary

Extended `geodeFormatPlanRationaleContextBlock` assistant rules with **SKIP / WHAT-IF LIMITS**:

- No skip/delay/reduce/pause simulation
- No invented payoff dates, interest, balances, penalties, target-date shifts
- No reversal of projection text
- Use Why + debts/goals; direction only
- User agency; no afford-to-skip inference
- Debt extra payments vs minimums — no contractual claims unless in context
- Goals/buffer/invest — slower progress, not quantified
- Tight month / active Reality shift — flexibility; review Plan/Reality
- When alignment active — Reality-adjusted view is not a skip simulation

Did **not** export `debtProjectionNote` or `goalStatusWhy`. No question detection.

---

## Risks

- Block truncation if profile very large — `MAX_BLOCK` bumped to 2800
- LLM may still ignore rules — 77B-C manual QA required

---

## Validation results

See [77B-C-post-build-audit.md](./77B-C-post-build-audit.md) — **PASS** (automated); manual QA still required before commit.

---

## Manual QA requirements

```js
var ctx = geodeBuildCoachingContext();
ctx.indexOf('SKIP / WHAT-IF LIMITS') >= 0;
ctx.indexOf('does not simulate') >= 0; // or equivalent wording
```

Live Ask Beynd:

1. “What happens if I skip my first plan step?” — Why + no exact outcome
2. “Can I skip this?” — choice, not afford-to-skip
3. “Can I do less?” — no simulated partial outcome
4. With Month Shift — Reality view, not new simulation

---

## Future dependencies

- 77B-C post-build audit
- Optional: over-budget context (77C)
- **No git commit until Stage 77D post-audit approved**

---

## Commit readiness

**Hold commit** per repository instruction until 77D post-audit. Suggested message when allowed: `feat(ask): add skip what-if guardrails to plan rationale context`
