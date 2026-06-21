# 80R-B — Reserve Tier Runtime Protection

**Type:** Savings Release classification + eligibility + copy (runtime)  
**Verdict:** PASS  
**Parent:** [80R-B Source Classification Model](./80R-B-source-classification-model.md) · [80R-C Runtime Gate](./80R-C-runtime-gate.md) · [80R-C.1 Semantic Continuity](./80R-C.1-savings-release-semantic-continuity.md)

---

## What changed (this pass)

| Item | Change |
|------|--------|
| `classifyReserveTier(account)` | Public T0–T4 label wrapper |
| `geodeSavingsReleaseFirstEligibleRow(state)` | First sorted eligible row for Plan CTA |
| `geodeSavingsReleaseCopyForSource` | Calmer continuity wording; no false relief |
| `geodeOverBudgetPlanBlockHtml` | Tier-aware CTA; hidden when no eligible reserve |
| Release audit notes | Removed stale `shadowOnly` on live eligibility path |

## Unchanged

- `getMonthPlan`, `calcMonthlyLeftover`, Stage 62, affordability
- `geodeApplySavingsRelease` ledger semantics (T4 blocked via eligibility)
- Home orchestration, Reflection, Tier-C, service-worker

## Tier law

| Tier | Eligible | UI |
|------|----------|-----|
| T0 continuity | Yes | First in sort |
| T1 flexible | Yes | |
| T2 purpose/unknown | Yes | |
| T3 future capital | Yes | Tradeoff copy |
| T4 locked/protected | **No** | Hidden |

## QA matrix

See console harness in post-build validation.
