# Stage 81B — Debt Truth, Interest Awareness and Balance Update Design Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Objective

Design a truthful debt balance update model recognising variable interest, minimum vs extra payments, manual provider balances, and user confirmation.

---

## Key decisions

| Question | Recommendation |
|----------|----------------|
| Auto-reduce on paid? | **No** — explicit apply or provider save only |
| Estimate vs confirm? | Estimate on payment; **confirmed** on `saveDebt` or explicit apply |
| Variable APR? | `interestType: fixed \| variable \| unknown` |
| Net worth | **Confirmed balance only** in v1; optional labeled estimate later |
| Safest first build | **Provider review awareness** (81B-1), not full auto-reduction |

---

## Recommended fields (future)

On `S.debts[]`: `interestType`, `lastProviderReviewAt`, `lastProviderBalance`  
On payments (later): `estimatedPrincipalApplied`, `appliedPrincipalAmount`

---

## Build options

| Option | Verdict |
|--------|---------|
| A — Provider review awareness | **Do first** |
| B — Shadow estimates | Second |
| C — Explicit apply confirmation | Third |
| D — Full auto-reduction | Reject for v1 |

---

## Next stage

[81B-1 — Debt health & provider review awareness build](./81B-1-debt-health-provider-review-awareness.md)
