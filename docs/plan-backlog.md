# Plan Stabilisation — Backlog

**Baseline for backlog:** `ee4e85a`  
**Last updated:** DOCS-STABILISATION-A (June 2026)

Items below are **not** part of the stable Plan display baseline. Order reflects recommended dependency sequence, not urgency alone.

---

## Summary table

| Item | Trust impact | Regression risk | Depends on | Status | Next stage |
|------|--------------|-----------------|------------|--------|------------|
| Onboarding-state copy | Medium | Low | None | Open | **F.1** |
| Home/SA investment alignment | High | Medium | INV-B stable | Open | **F.2** |
| Payment upsert canonicalisation | High | High | Audit first | Open | **F.3** |
| Reality continuity | Medium | Medium | 80E-D stable | Partial | Later |
| Debt Review Balance | Medium | High | 81B series | Partial | Later |
| Stability Room entry | Medium | Low | 80F–80M bundle | Shadow | Later |
| Savings Release surface | High | High | 81D-3 stable | Partial | Later |
| Multiple-investment semantics | Medium | Medium | F.3 optional | Open | Deferred |
| Invest plan-room stickiness | Low | High | Product decision | **Deferred** | — |

---

## 1. Onboarding-state copy (F.1)

### Trust impact

First-run and post-onboarding copy shapes whether users trust Plan as guidance vs prescription. Misaligned onboarding can prime obligation framing before Plan stabilisation semantics apply.

### Regression risk

Low if copy-only. Risk rises if onboarding gates or flags are inferred from partial data.

### Dependency order

**First.** No code dependency on other backlog items. Audit before edit.

### Current status

Open. Plan stabilisation complete; onboarding surfaces not yet aligned to optional-invest and display-vs-engine language.

### Recommended next stage

**F.1-PRE** (complete): [Allowed language by readiness state](./allowed-language-by-readiness-state.md).

**F.1 — onboarding-state audit + build:** map gates to readiness states; add `geodePlanReadinessState`; branch anticipatory card, Plan header, QS completion copy per language contract.

---

## 2. Home / Suggested Actions investment alignment (F.2)

### Trust impact

**High.** Plan row shows payment-derived committed amount after invest action; Home main action and SA may still use `geodePlanStepActionState.actionAmount` (coverage gap vs dynamic suggestion). Users can see Plan £96 vs Home £71-style divergence.

### Regression risk

Medium. Home orchestration touches main action, SA merge, and afford gate. Must not change `geodeGetMainAction` priority order without audit.

### Dependency order

After **INV-B** committed (`ee4e85a`). Optional after F.1 if onboarding copy references Home/Plan parity.

### Current status

Open. Explicitly out of scope for INV-B/B.1/B.2.

### Recommended next stage

**F.2 — Home/SA invest display audit** (read-only): trace `geodeMainActionFromPriorityStep`, `geodePlanStepActionStateForSuggestedAction`, invest branch; recommend display-only alignment or documented intentional divergence.

---

## 3. Payment upsert canonicalisation (F.3)

### Trust impact

**High.** `geodeUpsertLinkedPaymentForThisMonth` **adds** to existing same-month linked rows instead of replacing. Delete/reschedule flows can leave stale or stacked committed totals. Affects invest, debt, goal, buffer display truth.

### Regression risk

**High.** Payment save flow is protected during Plan stabilisation. Multiple counting implementations exist (globals + shadow closures per E.2 audit notes).

### Dependency order

After display stabilisation; requires dedicated audit before any save-flow edit.

### Current status

Open. Known trap from INV-B manual QA (sticky committed when paid twin or upsert stack remains).

### Recommended next stage

**F.3 — payment counting canonicalisation audit**: inventory `paymentCountsForMonthlyOutflow`, `paymentCountsForMonthlyOutflowDisplay`, `geodePaymentCountsAsPaidInCurrentMonth`, upsert/merge paths; propose single read model without changing save behaviour in audit pass.

---

## 4. Reality continuity

### Trust impact

Medium. Month context carry (`80E-D`) and Reality alignment affect Plan pacing notes and user sense of “this month vs last month.”

### Regression risk

Medium. Touches Reality save, plan alignment banner, and optional shift preview.

### Dependency order

Independent of Plan row display; coordinate with `geodePeekActiveRealityPlanAlignment` if Plan copy references Reality.

### Current status

**Partial.** `80E-D` built; full continuity and Reflection entry bundle released (`80M`). Plan Reality banner read-only.

### Recommended next stage

Audit-only pass on month context + Plan alignment parity before new Reality edits.

---

## 5. Debt Review Balance

### Trust impact

Medium. Users need confidence that displayed debt balance matches provider reality without silent payment-driven mutation.

### Regression risk

High if payment apply logic changes. 81B series keeps `debt.balance` user-confirmed.

### Dependency order

After 81B-1 / 81B-2.x stable; before Reflection long-form debt interpretation.

### Current status

**Partial.** Provider review metadata, debt health card, shadow principal estimate exist. No payment balance auto-apply.

### Recommended next stage

Design audit for “review balance” UX without mutating net worth from payments.

---

## 6. Stability Room entry

### Trust impact

Medium. Holds suppressed Home signals and offers calmer disclosure — reduces alert fatigue if wired carefully.

### Regression risk

Low for shadow models; medium once UI routes exist (auto-open, notification drawer forbidden in contract).

### Dependency order

After 80F–80I shadow contracts; Reflection surface (`80K-B`) already consumes experience model.

### Current status

**Shadow only.** Snapshot, visual model, entry gate, experience model — no Home primary entry.

### Recommended next stage

Entry gate storage + dismiss contract audit before any Home chip/link.

---

## 7. Savings Release surface

### Trust impact

**High.** Confirmed savings release affects user trust in buffer truth and Plan overbudget paths.

### Regression risk

**High.** `S.savingsReleases[]`, backup whitelist, Plan gate fixes (81D-3.6) already intertwined.

### Dependency order

After buffer target hierarchy stable (`061e3d8` / D.2).

### Current status

**Partial.** 81D-3 confirmation sheet, buffer goal truth (81D-3.5), adequacy gate (81D-3.6), copy refinement (81D-3.7).

### Recommended next stage

End-to-end QA doc + Reflection/Stability Room copy guardrails before broad surfacing.

---

## 8. Multiple-investment semantics

### Trust impact

Medium. All Plan invest helpers use `investments[0].id` only — multi-portfolio users may see wrong committed basis.

### Regression risk

Medium. Requires consistent investId matching across progress, display, and payments.

### Dependency order

After F.3 payment audit; may combine with F.2 if Home shows invest actions.

### Current status

Open. Acceptable limitation documented in INV audits.

### Recommended next stage

Product decision + read-only inventory of investId assumptions.

---

## 9. Investment plan-room stickiness (deferred)

### Trust impact

Low for display-only path. Engine recalculating suggest after schedule is **correct**; stickiness would change product meaning of “plan amount.”

### Regression risk

**High** if implemented in `getMonthPlan` or affordability.

### Dependency order

**Decision deferred.** Display-layer committed basis (`ee4e85a`) chosen instead.

### Current status

**Deferred.** Do not implement engine freeze without explicit product sign-off.

### Recommended next stage

None until product revisits engine vs display contract.

---

## Explicitly complete (do not re-open without regression)

- Action-state truth (B)
- Debt Plan display alignment (C)
- Buffer step persistence (D)
- Buffer target hierarchy (D.2)
- Investment committed-basis display (INV-B)
- Investment Impact Snapshot structure (INV-B.2-FIX)

---

## See also

- [Plan stabilisation completed](./plan-stabilisation-completed.md)
- [Handover](./handover.md)
