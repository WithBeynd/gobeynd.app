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
| **81D-2** | [Savings release shadow model](./81D-2-savings-release-shadow-model.md) | Build | Built — audit pending |
| **81D-3** | [Savings release confirmation sheet](./81D-3-savings-release-confirmation-sheet.md) | Build | Built — audit pending |
| **81D-3.1** | [Savings release backup & copy fix](./81D-3.1-savings-release-backup-copy-fix.md) | Fix | Built — audit pending |
| **81D-3.5** | [Auto-create / link emergency buffer goal](./81D-3.5-buffer-goal-truth-build.md) | Build | Built — audit pending |
| **81D-3.6** | [Buffer adequacy Plan gate fix](./81D-3.6-buffer-adequacy-plan-gate-fix.md) | Fix | Built — audit pending |
| **81D-3.7** | [Buffer action state copy refinement](./81D-3.7-buffer-action-state-copy-refinement.md) | Fix | Built — audit pending |

---

## Current state (May 2026)

- **81B-1** built locally — optional `interestType`, `lastProviderReviewAt`, `lastProviderBalance` on debts; Money debt health UI; no payment/net worth logic changes
- **81B-2** built locally — shadow principal estimate helpers; compute-on-read only; no UI or balance mutation
- **81B-2.2** built locally — compact conditional Debt Health inline copy; duplicate Review button removed
- **81B-2.3** built locally — debt card shows one factual line only; narrative in Edit Debt modal
- **81D-2** built locally — shadow savings release eligibility + preview; no apply/storage/UI
- **81D-3** built locally — first savings release apply + Plan overbudget confirmation sheet; `S.savingsReleases[]` + `activityLog`
- **81D-3.1** built locally — `savingsReleases` on backup whitelist; em-dash copy removed from release modal
- **81D-3.5** built locally — buffer contributions auto-create or link emergency goal on save (forward-only)
- **81D-3.6** built locally — Plan buffer step gated on adequacy, not goal existence alone
- **81D-3.7** built locally — state-aware buffer action copy (add vs contribute)
- Reflection / Ask savings release integration **deferred**

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

**81D-2**

- **`geodeSavingsReleaseSourceType`**, **`geodeSavingsReleaseEligibility`**, **`geodePreviewSavingsRelease`**
- **`geodeSavingsReleaseSourcesSnapshot`**, **`geodeSavingsReleaseSnapshot`** — `window._geodeSavingsReleaseSnapshot`

**81D-3**

- **`geodeNormalizeSavingsReleases`**, **`S.savingsReleases[]`**
- **`geodeApplySavingsRelease`** — mutates `baseSaved` / `baseBalance`; `activityLog` type `savings_release`
- **`geodeOpenSavingsReleaseModal`** — Plan overbudget entry only (**Use saved money**)
- Monthly Left, income, expenses, payments **unchanged** on release

**81D-3.1**

- **`geodeBeyndBackupRestorableKeyWhitelist`** — includes **`savingsReleases`**
- Savings Release modal copy: no em dashes in source labels or intro line

**81D-3.5**

- **`geodeEnsureEmergencyBufferGoalForPayment`** — create or link emergency goal for buffer contributions
- **`geodeSavePayApply`** — applies helper on new buffer payments (CTA flag or buffer-like name)
- Buffer CTAs prefill **`bufferContribution: true`**; session flag cleared on edit-existing

**81D-3.6**

- **`getMonthPlan` Step 2** — buffer step while `geodeGetBufferReadinessState !== 'BUFFER_COMPLETE'`
- **`remainingEmergencyNeeded`** — target minus effective saved minus scheduled unpaid buffer this month

**81D-3.7**

- **`geodeBufferActionCopy`**, **`geodeBufferHasScheduledUnpaidBuffer`**, **`geodeIsBufferMoneyAffordCta`**
- Home/Plan buffer CTAs: add emergency buffer vs contribute/add to buffer (copy only)

Do not change `geodeRecomputeBalancesFromPayments` or `computeSnapshotFigures` for debt truth work without explicit stage scope.
