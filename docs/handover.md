# Beynd Plan Stabilisation — Handover

**Primary handover for Plan work after stabilisation.**  
**Stable HEAD:** `9796f2e`
**Series:** Plan stabilisation (post-81F rollback)  
**Status:** F.1–F.3 trust layer complete; engine baseline frozen

---

## Read this first

Before any Plan, Home, Reality, or payment edit:

1. [Plan stabilisation completed](./plan-stabilisation-completed.md)
2. [Plan backlog](./plan-backlog.md)
3. [Allowed language by readiness state](./allowed-language-by-readiness-state.md)
4. [F.3 final QA evidence](./stages/F.3/F.3-final-qa-evidence.md)
5. [Strategic systems (partial)](./strategic-systems-partial.md)
6. [Architecture notes](./architecture-notes.md)

---

## Audit-first operating model

Every change follows:

1. **READ-ONLY audit** — explain findings before editing
2. **Scoped build** — one concern; `index.html` or explicit file allow-list
3. **Post-build audit** — validation + manual QA checklist
4. **Commit** — only after PASS; user requests commit explicitly

Stage documentation policy: [`stage-documentation-policy.md`](./stage-documentation-policy.md)

Required audit sections: objective, scope, files touched / not touched, risks, validation, manual QA, commit readiness.

---

## Rollback lessons — failed 81F rebuild cycle

| Lesson | Application |
|--------|-------------|
| Large stacked rebuilds hide regressions | Ship stabilisation in committed slices (B, C, D, INV-B, F.1–F.3) |
| Display fixes that touch engine cause QA failures | Separate display layer from `getMonthPlan` |
| Copying debt semantics to optional invest failed | Product semantics differ — payment-derived basis for invest |
| Paragraph-heavy detail broke Plan UX consistency | Impact Snapshot = metric rows + bar + short note |
| Revert early | E.1/E.1.1 and INV-B.2 fully reverted before correct fix |

**Do not resume 81F-style multi-surface rebuilds without per-surface audit and rollback point.**

---

## Display layer vs engine layer

| Layer | Responsibility | Examples |
|-------|----------------|----------|
| **Engine** | Size steps from affordability, strategy, memory | `getMonthPlan`, `calcMonthlyLeftover`, `computeAffordabilityContext` |
| **Progress truth** | Paid/applied/scheduled/remaining from payments | `geodePlanStepProgress`, `geodePlanStepScheduledAmount` |
| **Action state** | Actionable headline for debt/goals/Home/SA | `geodePlanStepActionState` |
| **Display override** | Row/detail headline when trust requires | `geodePlanPageDebtStepAmountDisplay`, `geodePlanInvestHeadlineAmountDisplay`, `geodePlanStepRealityDisplay` |
| **Payment orchestration (F.3)** | Linked upsert intent, canonical row, SA reconcile | `geodeSavePayApply`, `geodeFindExistingLinkedPaymentForYm`, `geodeReconcileFrozenSuggestedActionsAfterLinkedSave` |

**Rule:** Engine amounts may move after user schedules (invest). Display may anchor to scheduled unpaid or gap after user acts (invest headline F.3B). Plan detail Apply (F.3A) uses Plan-specific resolver — Home viewOnly suppression does not apply on detail drill-in.

---

## Protected engine and flow functions

Do **not** change without explicit audit + approval:

| Function / area | Reason |
|-----------------|--------|
| `getMonthPlan` | Plan SSOT sizing and step order |
| `calcMonthlyLeftover` | Affordability spine |
| `computeAffordabilityContext` | Gate inputs |
| `paymentCountsForMonthlyOutflow` | Outflow counting canonical (follow-on read-model audit) |
| `geodePlanStepProgress` | Progress truth |
| `geodePlanStepActionState` | Action truth for Home/SA/debt display |
| Balance gate (`geodeRunAffordGatedAction`, afford build) | Safety |
| `geodeGetMainAction` priority order | Home orchestration |

**F.3 baseline (shipped `9796f2e`):** scoped changes to linked payment save orchestration only — SET/REPLACE upsert, merge-before-upsert, deferred follow-through, selective frozen SA reconcile. Do not regress to silent ADD stacking.

Plan stabilisation **read-only / display helpers** for invest:

- `geodeInvestScheduledThisMonth`
- `geodeInvestCommittedThisMonth`
- `geodePlanInvestHeadlineAmountDisplay` (F.3B)
- `geodePlanInvestPageAmountDisplay`
- `geodePlanDetailActionForStep` (F.3A)

---

## Do-not-touch list (default)

| Path | Notes |
|------|-------|
| `index.html` | Only when stage explicitly allows Plan work |
| `service-worker.js` | Bump only for approved release bundles (e.g. 80M-A) |
| `manifest.json`, `coaching.json` | Protected |
| `js/geode-pure/`, `worker/` | Extracted / worker code |
| `icons/`, `CNAME`, `.gitattributes` | Release infra |

During **docs-only** stages: all code paths above are frozen.

---

## Service-worker policy

- Bump **`CACHE_VERSION`** only for user-facing bundle releases with completed audit (see 80M-A pattern).
- **80M-A rule:** version string only — no install/activate/fetch logic changes in bump commit.
- Plan stabilisation through F.3 (`061e3d8` … `9796f2e`) did **not** require service-worker bump.
- Do not bump SW for display-only Plan copy or F.3 payment orchestration unless release bundle approved.

---

## No-reactive-patching rule

- Do not patch symptoms seen in QA without tracing to layer (engine vs progress vs display vs payment state).
- Failed invest fix (E.1) patched display using wrong semantic source (debt action state) — reverted.
- Sticky “committed” after delete → check payment array truth before caption logic.
- Repeat schedule stacking → F.3 SET canonicalisation is baseline; do not revert to ADD without audit.

---

## QA-first rule

Manual QA scenarios are part of definition of done:

- Plan: no action, scheduled only, partial paid, completed per step type
- Invest: repeat schedule SET; paid + scheduled headline shows scheduled not sum; Plan Apply adjusts unpaid row
- Debt/buffer/goal: repeat schedule replaces intended amount; regression spot-check after any Plan edit
- Balance gate: unchanged after display passes
- Delete/reschedule payment: committed display clears when payment truth clears

Record PASS in stage doc or audit return before commit. See [F.3 final QA evidence](./stages/F.3/F.3-final-qa-evidence.md).

---

## Behavioural philosophy principles

1. **Optional invest** — no “remaining obligation” or “schedule the remainder” framing for investment on Home/SA.
2. **Debt is different** — obligation and coverage gap semantics appropriate for debt display.
3. **Buffer target hierarchy** — one resolved target across Plan surfaces (`geodeResolveBufferTarget`).
4. **User confirmed truth** — balances and releases prefer explicit user action over inference.
5. **Calm disclosure** — Stability Room / Reflection hold suppressed signals; no alert duplication.
6. **Ask Beynd bounded context** — formatters only; no raw snapshot JSON; skip/what-if limits (77B-B).
7. **Scheduled is not completed (F.3)** — linked saves SET this month’s intended amount; paid and unpaid rows stay separate.

---

## Current stable baseline philosophy

**HEAD `9796f2e` is the Plan trust-layer contract:**

- Action-state truth wired (B)
- Debt display aligned to action state (C)
- Buffer persists and targets resolve consistently (D, D.2)
- Invest headline payment-derived; Impact Snapshot structured metrics (INV-B, F.3B)
- F.1 readiness copy gated on behavioural state
- F.2 Home/SA invest display aligned; no gap pressure after commitment
- F.3 linked payment canonicalisation; Plan detail Apply resolver
- Engine invest sizing remains dynamic

**Next work is adjacent alignment and backlog items — not Plan engine rework.**

---

## Shipped stages (F series)

| Stage | Commit | Summary |
|-------|--------|---------|
| **F.1** | `b3d2dc6` | Readiness-state copy; `geodePlanReadinessState` |
| **F.2** | `3f4a5d7` | Home/SA invest display aligned to committed basis; viewOnly after commitment |
| **F.3** | `9796f2e` | Payment SET canonicalisation; invest headline; Plan detail Apply |

---

## Recommended next stages

See [Plan backlog](./plan-backlog.md). Active items (post-F.3):

| Priority | Type | Focus |
|----------|------|-------|
| 1 | Audit (read-only) | Payment counting read-model (`paymentCountsForMonthlyOutflow` vs display paths) |
| 2 | Audit / build | Reality continuity |
| 3 | Product + audit | Multiple-investment semantics (`investments[0]` assumptions) |
| 4 | Product | Investment plan-room transparency (display vs engine suggest) |
| — | **Deferred** | Invest plan-room engine stickiness |
| Later | Partial | Debt Review Balance, Savings Release, Stability Room / Reflection entry |

Do not start payment counting or Reality edits without read-only audit return.

---

## Commit reference

| Commit | Message |
|--------|---------|
| `061e3d8` | feat(plan): stabilise action-state truth, debt display, and buffer target hierarchy |
| `ee4e85a` | feat(plan): anchor investment display to payment-derived committed basis |
| `b3d2dc6` | feat(plan): gate onboarding copy on behavioural readiness state (F.1) |
| `3f4a5d7` | feat(plan): align Home and SA invest display to committed payment basis (F.2) |
| `9796f2e` | feat(plan): canonicalise linked payments and fix invest Plan apply (F.3) |

---

## Other handovers (historical)

| Document | Topic |
|----------|-------|
| [Stage 76–77 Ask Beynd evolution](./handovers/handover-stage-76-77-ask-beynd-evolution.md) | Ask / plan rationale |
| [Stage 55C Reality-to-Plan](./handover-stage-55c-reality-to-plan-alignment.md) | Reality alignment |
| [Stage 76 reasoning detail](./handover-stage-76-ask-beynd-reasoning.md) | Plan rationale snapshot |

---

## See also

- [Documentation index](./README.md)
