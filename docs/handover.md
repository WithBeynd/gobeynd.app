# Beynd Plan Stabilisation — Handover

**Primary handover for Plan work after stabilisation.**  
**Stable HEAD:** `ee4e85a`  
**Series:** Plan stabilisation (post-81F rollback)  
**Status:** Display baseline complete; engine baseline frozen

---

## Read this first

Before any Plan, Home, Reality, or payment edit:

1. [Plan stabilisation completed](./plan-stabilisation-completed.md)
2. [Plan backlog](./plan-backlog.md)
3. [Allowed language by readiness state](./allowed-language-by-readiness-state.md)
4. [Strategic systems (partial)](./strategic-systems-partial.md)
5. [Architecture notes](./architecture-notes.md)

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
| Large stacked rebuilds hide regressions | Ship stabilisation in committed slices (B, C, D, INV-B) |
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
| **Display override** | Row/detail headline when trust requires | `geodePlanPageDebtStepAmountDisplay`, `geodePlanInvestPageAmountDisplay`, `geodePlanStepRealityDisplay` |

**Rule:** Engine amounts may move after user schedules (invest). Display may anchor to committed payments after user acts (invest). Both can be true simultaneously — detail Impact Snapshot shows Plan amount; row may show committed.

---

## Protected engine and flow functions

Do **not** change without explicit audit + approval:

| Function / area | Reason |
|-----------------|--------|
| `getMonthPlan` | Plan SSOT sizing and step order |
| `calcMonthlyLeftover` | Affordability spine |
| `computeAffordabilityContext` | Gate inputs |
| `paymentCountsForMonthlyOutflow` | Outflow counting canonical (audit F.3) |
| `geodePlanStepProgress` | Progress truth |
| `geodePlanStepActionState` | Action truth for Home/SA/debt display |
| Payment save flow (`savePay`, `geodeSavePayApply`, upsert/merge) | Mutation + double-count risk |
| Balance gate (`geodeRunAffordGatedAction`, afford build) | Safety |
| `geodeGetMainAction` priority order | Home orchestration |

Plan stabilisation **added read-only helpers only** for invest display:

- `geodeInvestScheduledThisMonth`
- `geodeInvestCommittedThisMonth`
- `geodePlanInvestPageAmountDisplay`

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
- Plan stabilisation (`061e3d8`, `ee4e85a`) did **not** require service-worker bump.
- Do not bump SW for display-only Plan copy or metric row changes.

---

## No-reactive-patching rule

- Do not patch symptoms seen in QA without tracing to layer (engine vs progress vs display vs payment state).
- Failed invest fix (E.1) patched display using wrong semantic source (debt action state) — reverted.
- Sticky “committed” after delete → check payment array truth before caption logic.

---

## QA-first rule

Manual QA scenarios are part of definition of done:

- Plan: no action, scheduled only, partial paid, completed per step type
- Invest: schedule £96 of £196 → row stays £96; detail structured metrics
- Debt/buffer: regression spot-check after any Plan edit
- Balance gate: unchanged after display passes
- Delete/reschedule payment: committed display clears when payment truth clears

Record PASS in stage doc or audit return before commit.

---

## Behavioural philosophy principles

1. **Optional invest** — no “remaining obligation” or “schedule the remainder” framing for investment.
2. **Debt is different** — obligation and coverage gap semantics appropriate for debt display.
3. **Buffer target hierarchy** — one resolved target across Plan surfaces (`geodeResolveBufferTarget`).
4. **User confirmed truth** — balances and releases prefer explicit user action over inference.
5. **Calm disclosure** — Stability Room / Reflection hold suppressed signals; no alert duplication.
6. **Ask Beynd bounded context** — formatters only; no raw snapshot JSON; skip/what-if limits (77B-B).

---

## Current stable baseline philosophy

**HEAD `ee4e85a` is the Plan display contract:**

- Action-state truth wired (B)
- Debt display aligned to action state (C)
- Buffer persists and targets resolve consistently (D, D.2)
- Invest headline payment-derived after action; Impact Snapshot matches debt/buffer structure
- Engine invest sizing remains dynamic

**Next work is adjacent alignment, not Plan engine rework.**

---

## Recommended next stages

| Stage | Type | Focus |
|-------|------|-------|
| **F.1-PRE** | Docs | [Allowed language by readiness state](./allowed-language-by-readiness-state.md) |
| **F.1** | Audit + build | Onboarding-state copy vs readiness contract; `geodePlanReadinessState` |
| **F.2** | Audit (read-only) | Home / Suggested Actions investment display alignment with INV-B |
| **F.3** | Audit (read-only) | Payment upsert / counting canonicalisation |

Do not start F.2 build until F.2 audit return is PASS/NEEDS ATTENTION with explicit scope.

---

## Commit reference

| Commit | Message |
|--------|---------|
| `061e3d8` | feat(plan): stabilise action-state truth, debt display, and buffer target hierarchy |
| `ee4e85a` | feat(plan): anchor investment display to payment-derived committed basis |

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
