# Stage 81D-2 — Savings Release Shadow Model

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** [81D savings release architecture audit](./81A-debt-net-worth-savings-release-truth-audit.md) (81D conversation deliverable)

---

## Objective

Add a **shadow-only** savings release model that identifies eligible buffer, goal, investment, and linked-investment sources and previews the impact of a user-confirmed release — **without** mutating balances, net worth, Monthly Left, storage, or UI.

**Core principle:** Using savings is not failure. Sometimes savings are doing their job.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | Savings release shadow helpers + dev hooks |
| `docs/stages/81/*`, `docs/README.md`, `docs/architecture-notes.md` | Documentation |

---

## Files intentionally not touched

- `saveGoal`, `saveInv`, `doDep`, `geodeRecomputeBalancesFromPayments`, `computeSnapshotFigures`, `calcMonthlyLeftover`
- Plan, Home, Reality, Reflection, Ask Beynd, `activityLog`
- `service-worker.js`, `coaching.json`, `js/geode-pure/`, `worker/`

---

## Implementation

### `geodeSavingsReleaseSourceType(state, source)`

Classifies a goal or investment source:

| Returns | When |
|---------|------|
| `buffer` | Emergency / safety buffer goal (`geodeIsEmergencyBufferGoal`) |
| `goal` | Standard goal (no linked investment balance) |
| `investment` | Unlinked investment |
| `linked_investment` | Investment with `goalId`, or goal whose progress uses linked investments |
| `unknown` | Unresolved source |

**Source input:** `{ kind: 'goal' \| 'investment', id }` or a goal/investment row.

### `geodeSavingsReleaseResolveSource(state, source)`

Normalizes source rows for downstream helpers.

### `geodeSavingsReleaseEligibility(state, source, opts)`

Returns `{ eligible, sourceType, sourceId, sourceName, availableBalance, confirmedBase, reasonCodes, shadowOnly: true }`.

- Goals with linked investment balance > 0 → **not eligible** as goal (`use_linked_investment_row`)
- Available balance uses `geodeGoalEffectiveSavedFromState` or investment `balance` (read-only)

### `geodePreviewSavingsRelease(state, source, amount, opts)`

Preview only:

| Field | Meaning |
|-------|---------|
| `netWorthBefore` / `netWorthAfter` | Hypothetical asset reduction |
| `monthlyLeftBefore` / `monthlyLeftAfter` | **Same** — flow ledger unchanged |
| `monthlyLeftUnchanged` | Always `true` in shadow model |
| `remainingAfter` | Available minus release amount |

Does not write `baseSaved`, `baseBalance`, or `activityLog`.

### `geodeSavingsReleaseSourcesSnapshot(state, opts)`

Lists all goals (non-linked-inv) and investments with per-row eligibility.

### `geodeSavingsReleaseSnapshot(state, opts)`

Rollup: `cashFlow.overBudget`, `netWorth` figures, `sources` snapshot.

**Dev hooks:** `window._geodeSavingsReleaseSnapshot`, `_geodePreviewSavingsRelease`, `_geodeSavingsReleaseSourceType`, `_geodeSavingsReleaseEligibility`

---

## Behaviour unchanged

| Surface | Unchanged |
|---------|-----------|
| Balances / net worth / Monthly Left | No mutation |
| Overbudget UI | Still spending-edit CTA only |
| Release storage | None |

---

## Console QA

```js
var snap = geodeSavingsReleaseSnapshot(S, { generatedAt: Date.now() });
snap.cashFlow.overBudget;
snap.sources.eligibleCount;

geodeSavingsReleaseSourceType(S, { kind: 'goal', id: S.goals[0].id });

var prev = geodePreviewSavingsRelease(S, { kind: 'goal', id: S.goals[0].id }, 100);
prev.monthlyLeftUnchanged;
prev.netWorthAfter < prev.netWorthBefore;
```

---

## Service worker

**No bump** — shadow helpers only.

---

## Future dependencies

- **81D-3:** Explicit release sheet + `baseSaved` / `baseBalance` apply + `S.savingsReleases[]`
- Reflection / Ask rules (after apply build)

---

## Commit readiness

Pending post-build audit. Do not commit until user requests.
