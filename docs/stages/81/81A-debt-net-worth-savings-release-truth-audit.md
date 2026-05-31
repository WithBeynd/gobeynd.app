# Stage 81A — Debt, Net Worth and Savings Release Truth Audit

**Type:** Read-only audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Objective

Audit debt, net worth, contribution, savings, investment, and overbudget release logic before any build.

---

## Core finding

Beynd splits **cash-flow truth** (contributions → “left this month”) from **balance truth** (manual debt/goal/investment edits → net worth). Debt payments do **not** reduce `debt.balance`. Goal/investment paid contributions **do** auto-increase balances via `geodeRecomputeBalancesFromPayments()`.

---

## Debt state model

| Field | Role |
|-------|------|
| `balance` | User-confirmed liability; net worth input |
| `apr`, `minp` | Plan/display; optional |
| `id`, `name`, `cat` | Identity |

**Balance mutation:** `saveDebt()` only. Payments never reduce debt balance.

---

## Net worth

```js
netWorth = totalSaved + unlinkedInvestments - totalDebt
```

Paid debt contributions change plan/cash left only — not net worth until manual debt edit.

---

## Savings release

**None implemented.** Overbudget surfaces spending edit CTAs only. Docs defer Savings Release to future Plan/Stability Room architecture.

---

## Recommendation

Close truth gap in phased builds: provider review awareness (81B-1) → shadow estimates (81B-2) → explicit apply-to-balance (81B-3). Not silent auto-reduction.

---

## Next stage

[81B — Debt truth & interest awareness design audit](./81B-debt-truth-interest-awareness-design-audit.md)
