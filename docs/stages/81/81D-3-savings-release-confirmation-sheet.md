# Stage 81D-3 — Savings Release Confirmation Sheet

**Type:** Implementation  
**Verdict:** Built — post-build audit pending (81D-3-C)  
**Date:** May 2026  
**Parent:** [81D-2 savings release shadow model](./81D-2-savings-release-shadow-model.md)

---

## Objective

Build the **first actual savings release flow**: user confirms a release from an eligible saved balance, the app mutates confirmed base fields, records the event, and re-renders — without changing Monthly Left, income, expenses, or payments.

**Core principle:** Using savings is not failure. Sometimes savings are doing their job.

---

## Entry point

**Plan overbudget block only.**

Secondary action below primary **Edit monthly spending**:

- **Use saved money** → confirmation sheet/modal

**Not in this stage:** Home, Reflection, Ask Beynd, Goal cards.

---

## Flow

Plan overbudget block → Use saved money → confirmation sheet → choose eligible source → enter amount → preview impact → confirm release → reduce source balance → record release event → save and render.

---

## Storage

`S.savingsReleases[]` — normalized on load via **`geodeNormalizeSavingsReleases`**.

| Field | Purpose |
|-------|---------|
| `id` | Unique event id |
| `sourceType` | `buffer` \| `goal` \| `investment` \| `linked_investment` |
| `sourceId` | Goal or investment id |
| `amount` | Released amount (after cap) |
| `reason` | `overbudget` \| `essential` \| `emergency` \| `planned_use` \| `manual` |
| `date` | Local ISO date |
| `ym` | Event month |
| `relatedYm` | Month context (overbudget entry uses current month) |
| `remainingBalance` | Available after release |
| `createdAt` | Timestamp |
| `confirmedByUser` | User confirmed in sheet |
| `note` | Optional free text |

No migration required. Old data without `savingsReleases` loads safely as `[]`.

---

## Apply rules — `geodeApplySavingsRelease(event)`

Uses 81D-2 helpers for validation and preview; mutates **confirmed base fields only**:

| Source | Mutation |
|--------|----------|
| Buffer / normal goal | `goal.baseSaved` ↓ |
| Unlinked investment | `investment.baseBalance` ↓ |
| Linked investment | `investment.baseBalance` ↓ only (not `goal.saved`) |

Then:

1. **`geodeRecomputeBalancesFromPayments()`**
2. Append to **`S.savingsReleases`**
3. **`appendActivityLog('savings_release', -amount, …)`**
4. **`setLastSnapshotBeforeChange()`** before mutation
5. **`save()`** + **`render()`**

**Does not change:** Monthly Left, income, expenses, payments, Plan math; does not delete goals or investments.

Amount over available balance is **capped** in preview and apply (not hard-rejected).

---

## Confirmation sheet

Modal pattern (`openModal` / `mh` / `closeModal`).

| Field | Notes |
|-------|-------|
| Source dropdown | Eligible rows from `geodeSavingsReleaseSourcesSnapshot` |
| Amount | Capped to available in preview |
| Reason | overbudget, essential, emergency, planned_use, manual |
| Note | Optional |

**Preview:** amount released, remaining balance, net worth impact, pressure relief when Monthly Left &lt; 0 (Pressure covered / Remaining pressure), truth note, linked-investment explanation when applicable.

**Post-confirm toast:** “Recorded. Your saved balance now reflects what you used.”

---

## Linked investment rules

Goals with linked investment balance are **not** eligible as goal rows. Release from the linked **investment** row; preview explains the release is recorded against the investment.

---

## Deferred

- Reflection integration
- Ask Beynd context
- Goal card entry
- Home permanent element
- **`service-worker.js` bump** (not in this stage)

---

## Canonical code

- **`geodeNormalizeSavingsReleases`**
- **`geodeApplySavingsRelease`**
- **`geodeOpenSavingsReleaseModal`**, **`geodeConfirmSavingsRelease`**, **`geodeSavingsReleaseModalImpactRefresh`**
- **`geodeOverBudgetPlanBlockHtml`** — secondary **Use saved money** CTA
- Reuses **`geodeSavingsReleaseSnapshot`**, **`geodePreviewSavingsRelease`**, **`geodeSavingsReleaseEligibility`**

---

## Validation

Standard stage gate: ReadLints `index.html`, `git diff --check`, protected files unchanged, JSON/SW checks, manual QA A–H.
