# Stage 81 — Debt truth, net worth & savings release

Financial truth audit and phased build for debt balance updates, provider review, and (deferred) savings release.

---

## Stages

| ID | Document | Type | Verdict |
|----|----------|------|---------|
| **81A** | [Debt, net worth & savings release truth audit](./81A-debt-net-worth-savings-release-truth-audit.md) | Audit | NEEDS ATTENTION |
| **81B** | [Debt truth, interest awareness design audit](./81B-debt-truth-interest-awareness-design-audit.md) | Design audit | NEEDS ATTENTION |
| **81B-1** | [Debt health & provider review awareness build](./81B-1-debt-health-provider-review-awareness.md) | Build | Built — audit pending |
| **81B-2** | [Debt principal estimate shadow model](./81B-2-debt-principal-estimate-shadow-model.md) | Build | Built — audit pending |
| **81B-2.2** | [Debt health placement refinement](./81B-2.2-debt-health-placement-refinement.md) | Build | Built — audit pending |
| **81B-2.3** | [Debt card minimal Debt Health display](./81B-2.3-debt-card-minimal-debt-health-display.md) | Build | Built — audit pending |

---

## Current state (May 2026)

- **81B-1** built locally — optional `interestType`, `lastProviderReviewAt`, `lastProviderBalance` on debts; Money debt health UI; no payment/net worth logic changes
- **81B-2** built locally — shadow principal estimate helpers; compute-on-read only; no UI or balance mutation
- **81B-2.2** built locally — compact conditional Debt Health inline copy; duplicate Review button removed
- **81B-2.3** built locally — debt card shows one factual line only; narrative in Edit Debt modal
- Savings release remains **not implemented** (81A finding)

---

## Canonical code

**81B-1**

- **`geodeNormalizeDebtHealthFields`**
- **`saveDebt`** — sets provider review metadata on user save
- **`openDebtModal`** / **`rDebts`** — awareness UI

**81B-2**

- **`geodeEstimateDebtPrincipalApplied`** — per-payment principal estimate (read-only)
- **`geodeDebtPrincipalEstimateSnapshot`** — paid debt payment rollup; `window._geodeDebtPrincipalEstimateSnapshot`

**81B-2.2**

- **`geodeDebtShouldShowHealthOnCard`** — conditional visibility (existing state only)
- **`geodeDebtPaidPaymentSinceProviderReview`**

**81B-2.3**

- **`geodeDebtHealthCardMinimalCopy`** — single factual card line
- **`geodeDebtHealthCardHtml`** — minimal display; **`geodeDebtProviderReviewNudgeCopy`** not on card

Do not change `geodeRecomputeBalancesFromPayments` or `computeSnapshotFigures` for debt truth work without explicit stage scope.
