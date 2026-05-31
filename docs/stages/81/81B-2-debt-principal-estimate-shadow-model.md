# Stage 81B-2 — Debt Principal Estimate Shadow Model

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** [81B design audit](./81B-debt-truth-interest-awareness-design-audit.md)

---

## Objective

Add a **shadow-only** debt principal estimate model that can estimate likely principal impact after paid debt payments, without changing debt balances, net worth, Plan, Home, Reflection, Ask Beynd, or payment completion logic.

**Core principle:** `debt.balance` remains provider-confirmed. Estimates are temporary awareness, not permanent truth.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeEstimateDebtPrincipalApplied`, `geodeDebtPrincipalEstimateSnapshot`, dev hooks |
| `docs/stages/81/*`, `docs/README.md`, `docs/architecture-notes.md` | Documentation |

---

## Files intentionally not touched

- `togglePay`, `geodeRecomputeBalancesFromPayments`, `computeSnapshotFigures`
- Plan, Home, Reflection, Ask Beynd
- `service-worker.js`, `coaching.json`, `js/geode-pure/`, `worker/`

---

## Implementation

### `geodeEstimateDebtPrincipalApplied(debt, payment, opts)`

Read-only helper for one debt-linked payment row.

**Opts:**

| Opt | Default | Role |
|-----|---------|------|
| `requirePaid` | `true` | Skip unless `payment.status === 'paid'` |
| `state` | `S` | Minimum-vs-extra split for mixed payments |

**Payment kind** (aligns with Plan minimum/extra rules):

- **Extra** — `geodeDebtPaymentLooksLikeExtraAction(p)` or no minimum on debt
- **Minimum** — amount attributed to remaining minimum only
- **Mixed** — both minimum and extra portions on one payment

**Estimate rules** (81B design):

| Portion | APR known | Principal estimate |
|---------|-----------|-------------------|
| Minimum | Yes | `max(0, minPortion − monthlyInterest(apr, balance))` |
| Minimum | No | **No estimate** (`principalApplied: null`) |
| Extra | Yes | `min(extraPortion, balance − minPrincipal)` |
| Extra | No | `min(extraPortion, balance)` with **low** confidence |

**Interest assumption labels:** `fixed_apr_illustrative`, `variable_apr_illustrative`, `apr_illustrative`, or `none`.

**Confidence:** `none` | `low` | `moderate` — never presented as confirmed truth.

**Return shape:** `{ principalApplied, paymentAmount, paymentKind, interestAssumption, confidence, monthlyInterestEstimate, applicable, reasonCodes, shadowOnly: true }`

**Does not** write `estimatedPrincipalApplied` on payment rows (deferred to avoid touching payment completion; compute-on-read only).

### `geodeDebtPrincipalEstimateSnapshot(state, opts)`

Shadow aggregator over paid debt-linked payments.

**Opts:** `paidOnly` (default `true`), `currentMonthOnly` (default `false`), `generatedAt`

**Return:** `{ version, rowCount, totalEstimatedPrincipal, rows[], reasonCodes, audit: { shadowOnly: true } }`

**Dev hooks:** `window._geodeDebtPrincipalEstimateSnapshot`, `window._geodeEstimateDebtPrincipalApplied`

---

## Behaviour unchanged

| Surface | Unchanged |
|---------|-----------|
| `debt.balance` | Still only via `saveDebt()` |
| Net worth | Still `sum(debt.balance)` |
| Payment completion | `togglePay` unchanged; no new payment fields |
| Plan / Home / Reflection / Ask | No wiring |

---

## Console QA

```js
var debt = S.debts[0];
var pay = S.payments.find(function (p) {
  return p.debtId === debt.id && p.status === 'paid';
});
geodeEstimateDebtPrincipalApplied(debt, pay, { state: S });

var snap = geodeDebtPrincipalEstimateSnapshot(S, { generatedAt: Date.now() });
snap.audit.shadowOnly;
snap.totalEstimatedPrincipal;
window._geodeDebtPrincipalEstimateSnapshot === snap;
```

---

## Service worker

**No bump** — shadow helpers only; no UI or Ask bundle change.

---

## Future dependencies

- **81B-3:** Explicit “Apply to balance” confirmation (uses estimates from this helper)
- Optional: persist `estimatedPrincipalApplied` on payment at completion (requires dedicated stage if payment row writes are desired)
- Reflection / Home labeled preview (separate stages)

---

## Commit readiness

Pending post-build audit. Do not commit until user requests.
