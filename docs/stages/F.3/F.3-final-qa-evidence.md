# Stage F.3 — Final QA Evidence

**Type:** Manual QA + post-push audit record  
**Date:** June 2026  
**Shipped commit:** `9796f2e` — `feat(plan): canonicalise linked payments and fix invest Plan apply`  
**Branch:** `main` (pushed, working tree clean at audit)  
**Bundle:** F.3 canonicalisation + F.3B invest headline semantics + F.3A Plan detail Apply resolver  

---

## Objective

Record that the full F.3 trust-layer bundle passed manual QA, final pre-commit audit, and post-push baseline audit before docs closure.

---

## Scope shipped at `9796f2e`

| Slice | Focus |
|-------|--------|
| **F.3** | Linked payment SET/REPLACE canonicalisation; merge before/after upsert; paid/unpaid separation; follow-through after canonical row; selective frozen SA reconcile; intent propagation (`_geodePayIntent: 'set'`) |
| **F.3B** | Plan invest headline no longer sums paid + scheduled (`geodePlanInvestHeadlineAmountDisplay`) |
| **F.3A** | Plan detail Apply uses `geodePlanDetailActionForStep` (not Home invest viewOnly suppression) |

**Files changed in commit:** `index.html` only (+597 / −61 vs `3f4a5d7`).

---

## Files intentionally not touched (F.3 commit)

`service-worker.js`, `manifest.json`, `coaching.json`, `js/geode-pure/`, `worker/`, `icons/`, `CNAME`, `.gitattributes`, `docs/` (code commit was index-only).

---

## Protected baseline — unchanged in F.3

| Area | Verdict |
|------|---------|
| `getMonthPlan` body | Unchanged |
| `calcMonthlyLeftover` | Unchanged |
| `computeAffordabilityContext` | Unchanged |
| `paymentCountsForMonthlyOutflow` | Unchanged |
| `geodePlanStepProgress` formula | Unchanged |
| `geodePlanStepActionState` formula | Unchanged |
| Debt minimum-payment logic | Unchanged |
| Investment sizing (`getMonthPlan`) | Unchanged |
| Buffer target logic | Unchanged |
| Reality logic | Unchanged |
| Ask Beynd | Unchanged |
| F.1 readiness copy (`geodePlanReadinessState` helpers) | Unchanged |
| F.2 Home/SA invest viewOnly suppression (`geodePlanInvestHomeDisplayCopy`) | Unchanged |

---

## Manual QA matrix — **PASS**

All scenarios checked on device against the F.3 bundle before commit.

| # | Scenario | Result |
|---|----------|--------|
| 1 | Invest: repeat schedule same month (SET, one unpaid row) | **PASS** |
| 2 | Invest: replace amount (£96 → £120) | **PASS** |
| 3 | Invest: paid only, step complete | **PASS** |
| 4 | Invest: paid £96 + scheduled £95 (headline £95, not £191) | **PASS** |
| 5 | Plan detail Apply: schedule, adjust scheduled, hide when done | **PASS** |
| 6 | Home/SA: no investment gap pressure after commitment (F.2 regression) | **PASS** |
| 7 | Debt: repeat schedule from Main Action / Plan | **PASS** |
| 8 | Buffer: repeat schedule | **PASS** |
| 9 | Goal: repeat schedule | **PASS** |
| 10 | F.1 readiness copy regression | **PASS** |
| 11 | Cross-page coherence (Plan / Home / Money totals) | **PASS** |

---

## Pre-commit final audit (F.3-FINAL-AUDIT) — **PASS**

| Check | Result |
|-------|--------|
| Only `index.html` changed | **PASS** |
| `service-worker.js` unchanged | **PASS** |
| Protected files unchanged | **PASS** |
| `getMonthPlan` / progress / action-state formulas | **PASS** |
| SET linked upsert (`payLinkedIntent !== 'add'` → replace) | **PASS** |
| Paid/unpaid merge buckets separate | **PASS** |
| Follow-through after canonical row resolve | **PASS** |
| Selective frozen SA reconcile | **PASS** |
| Invest headline not paid+scheduled sum | **PASS** |
| Plan Apply not Home viewOnly path | **PASS** |
| ReadLints `index.html` | **PASS** |
| Inline script syntax | **PASS** |
| `git diff --check -- index.html` | **PASS** |
| Forbidden invest pressure copy in new strings | **PASS** |

---

## Post-push audit (F.3-POST-PUSH-AUDIT) — **PASS**

| Check | Result |
|-------|--------|
| Branch `main`, up to date with `origin/main` | **PASS** |
| Working tree clean | **PASS** |
| HEAD `9796f2e` | **PASS** |
| F.3 logic present at HEAD | **PASS** |
| Static validation (lints, syntax, diff --check) | **PASS** |

---

## Residual risks (accepted at ship)

1. **Invest progress edge:** `phase === 'done'` can coexist with unpaid scheduled row; F.3A scheduled branch handles Plan Apply; monitor in production.
2. **`geodeInvestCommittedThisMonth.committed`** still sums paid + scheduled internally for `hasCommitted` gating; headline uses F.3B helper only.
3. **Linked save** skips full `geodeInvalidateDecisionCaches` by design; selective SA reconcile + `render()` on save.
4. **Payment counting read-model** still has multiple implementations — follow-on audit in backlog (not F.3 scope).

---

## Gate verdict

| Item | Status |
|------|--------|
| Manual QA | **PASS** |
| Pre-commit audit | **PASS** |
| Post-push audit | **PASS** |
| Shipped at `9796f2e` | **Yes** |
| Docs closure (this file) | **Ready to commit separately** |

---

## Related docs

- [Handover — Plan stabilisation](../../handover.md)
- [Plan backlog](../../plan-backlog.md)
- [F.1 manual QA evidence](../F.1/F.1-manual-qa-evidence.md)
