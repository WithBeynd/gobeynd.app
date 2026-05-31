# Stage 81 — Debt truth, net worth & savings release

Financial truth audit and phased build for debt balance updates, provider review, and (deferred) savings release.

---

## Stages

| ID | Document | Type | Verdict |
|----|----------|------|---------|
| **81A** | [Debt, net worth & savings release truth audit](./81A-debt-net-worth-savings-release-truth-audit.md) | Audit | NEEDS ATTENTION |
| **81B** | [Debt truth, interest awareness design audit](./81B-debt-truth-interest-awareness-design-audit.md) | Design audit | NEEDS ATTENTION |
| **81B-1** | [Debt health & provider review awareness build](./81B-1-debt-health-provider-review-awareness.md) | Build | Built — audit pending |

---

## Current state (May 2026)

- **81B-1** built locally — optional `interestType`, `lastProviderReviewAt`, `lastProviderBalance` on debts; Money debt health UI; no payment/net worth logic changes
- Savings release remains **not implemented** (81A finding)

---

## Canonical code (81B-1)

- **`geodeNormalizeDebtHealthFields`**
- **`geodeDebtHealthCardHtml`**
- **`saveDebt`** — sets provider review metadata on user save
- **`openDebtModal`** / **`rDebts`** — awareness UI

Do not change `geodeRecomputeBalancesFromPayments` or `computeSnapshotFigures` for debt truth work without explicit stage scope.
