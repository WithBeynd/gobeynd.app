# Stage 81B-1 — Debt Health & Provider Review Awareness Build

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  

---

## Objective

Add debt health and provider-review awareness without mutating debt balances on payment, changing net worth formula, Plan, Reflection, or Ask Beynd context.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | Normalize debt health fields; Money debt card + modal UI; helpers |
| `docs/stages/81/*`, `docs/README.md`, `docs/architecture-notes.md` | Documentation |

---

## Files intentionally not touched

- `geodeRecomputeBalancesFromPayments`, `togglePay`, `computeSnapshotFigures`, Plan, Reflection, Ask Beynd, service worker, `coaching.json`, `js/geode-pure/`, `worker/`

---

## Implementation

### Normalization — `geodeNormalizeDebtHealthFields(state)`

On load (after `geodeNormalizeGoalInvestBaseFields`) and after `saveDebt`:

- `interestType` → `'fixed' | 'variable' | 'unknown'` (default `unknown`)
- `lastProviderReviewAt` → `YYYY-MM-DD` or `''`
- `lastProviderBalance` → finite number or `''`

### Persistence — `saveDebt()`

When user saves debt (existing balance-edit path):

- Writes `interestType` from modal select
- Sets `lastProviderReviewAt` to `geodeTodayLocalISO()`
- Sets `lastProviderBalance` to saved balance number

**No new auto-reduction path** — balance still only changes via user-entered amount in Edit Debt.

### Display helpers

- `geodeDebtInterestTypeLabel`
- `geodeDebtProviderReviewStatusCopy` / `geodeDebtProviderReviewNudgeCopy`
- `geodeDebtProviderReviewStaleAfterDays` — 45d (unknown/variable), 60d (fixed) for copy only
- `geodeDebtHealthCardHtml` — neutral “Debt health” block on Money debt cards

### UI

**Money → Debts card:** Debt health block with APR type, last provider save status, neutral nudge, **Review provider balance** button (opens Edit Debt modal).

**Edit Debt modal:** Balance provider copy; APR type select; last-review status when present.

---

## Behaviour unchanged

| Surface | Unchanged |
|---------|-----------|
| Net worth | Still `sum(debt.balance)` |
| Payment completion | Still no balance mutation; existing toast |
| Plan progress | Unchanged |
| Activity log | Still `debt` delta on manual save only |

---

## Risks

| Risk | Mitigation |
|------|------------|
| User thinks save auto-syncs provider | Copy states manual confirmation |
| Stale nudge feels like warning | Neutral `tx-3` styling; no badges |
| New fields on old backups | Normalize on load |

---

## Validation

```js
geodeNormalizeDebtHealthFields({ debts: [{ balance: 1000 }] });
// interestType === 'unknown', lastProviderReviewAt === ''

typeof geodeDebtHealthCardHtml === 'function' &&
  geodeDebtHealthCardHtml({ id: 'x', interestType: 'variable', balance: 1000 }).indexOf('Debt health') >= 0;
```

Manual QA:

1. Add debt → card shows debt health with “APR type not set”
2. Edit debt → set variable APR type → save → “Provider balance saved today”
3. Mark debt payment paid → balance unchanged; existing toast unchanged
4. Net worth unchanged until Edit Debt balance edited

---

## Service worker

**No bump** — Money sub-surface copy/fields only; no Ask/Reflection bundle change.

---

## Future dependencies

- **81B-2:** Shadow `estimatedPrincipalApplied` on payments (no balance write)
- **81B-3:** Explicit “Apply to balance” confirmation sheet
- Ask Beynd debt balance rules export (after 81B-3)

---

## Commit readiness

**NEEDS ATTENTION** — pending post-build diff audit and manual QA above.

Suggested commit message (when approved):

```
Add debt health fields and provider review awareness in Money (81B-1).
```
