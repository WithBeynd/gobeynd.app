# Plan Stabilisation — Backlog

**Baseline for backlog:** `9796f2e`
**Last updated:** F.3 docs closure (June 2026)

F.1, F.2, and F.3 are **shipped**. Items below are future work — not part of the stable trust-layer baseline. Order reflects recommended dependency sequence, not urgency alone.

---

## Summary table

| Item | Trust impact | Regression risk | Depends on | Status | Next stage |
|------|--------------|-----------------|------------|--------|------------|
| Payment counting read-model | Medium | Medium | F.3 shipped | Open | Audit first |
| Reality continuity | Medium | Medium | 80E-D stable | Partial | Later |
| Multiple-investment semantics | Medium | Medium | F.3 shipped | Open | Product + audit |
| Investment plan-room transparency | Low | Low | F.3B shipped | Open | Product + docs |
| Invest plan-room stickiness | Low | High | Product decision | **Deferred** | — |
| Debt Review Balance | Medium | High | 81B series | Partial | Later |
| Stability Room / Reflection entry | Medium | Low | 80F–80M bundle | Shadow | Later |
| Savings Release surface | High | High | 81D-3 stable | Partial | Later |

---

## Explicitly complete (do not re-open without regression)

- Action-state truth (B)
- Debt Plan display alignment (C)
- Buffer step persistence (D)
- Buffer target hierarchy (D.2)
- Investment committed-basis display (INV-B)
- Investment Impact Snapshot structure (INV-B.2-FIX)
- **F.1** — Onboarding-state / readiness copy (`b3d2dc6`)
- **F.2** — Home/SA invest display alignment (`3f4a5d7`)
- **F.3** — Linked payment SET canonicalisation, invest headline, Plan detail Apply (`9796f2e`)

Evidence: [F.3 final QA evidence](./stages/F.3/F.3-final-qa-evidence.md)

---

## 1. Payment counting read-model audit

### Trust impact

Medium. F.3 canonicalised linked **upsert** and display headlines; multiple counting implementations still exist (`paymentCountsForMonthlyOutflow`, `paymentCountsForMonthlyOutflowDisplay`, `geodePaymentCountsAsPaidInCurrentMonth`, merge paths). Read-model consistency reduces drift risk without changing save behaviour.

### Regression risk

Medium if save paths are touched. **Audit-only first** — inventory and propose single read model; no save-flow edit without dedicated stage.

### Dependency order

After **F.3** (`9796f2e`).

### Current status

Open. Follow-on from F.3 pre-audit notes; not blocking F.3 ship.

### Recommended next stage

Read-only audit: map counting functions to surfaces; document intentional divergence or recommend display-only alignment.

---

## 2. Reality continuity

### Trust impact

Medium. Month context carry (`80E-D`) and Reality alignment affect Plan pacing notes and user sense of “this month vs last month.”

### Regression risk

Medium. Touches Reality save, plan alignment banner, and optional shift preview.

### Dependency order

Independent of F.3 payment truth; coordinate with `geodePeekActiveRealityPlanAlignment` if Plan copy references Reality.

### Current status

**Partial.** `80E-D` built; full continuity and Reflection entry bundle released (`80M`). Plan Reality banner read-only.

### Recommended next stage

Audit-only pass on month context + Plan alignment parity before new Reality edits.

---

## 3. Debt Review Balance

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

## 4. Stability Room / Reflection entry

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

## 5. Savings Release surface

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

## 6. Multiple-investment semantics

### Trust impact

Medium. Plan invest helpers use primary investment (`investments[0].id`) — multi-portfolio users may see wrong committed basis.

### Regression risk

Medium. Requires consistent investId matching across progress, display, and payments.

### Dependency order

After F.3 payment canonicalisation.

### Current status

Open. Acceptable limitation documented in INV audits.

### Recommended next stage

Product decision + read-only inventory of investId assumptions.

---

## 7. Investment plan-room transparency

### Trust impact

Low for users who understand optional invest. Engine `getMonthPlan` invest suggest can move after schedule while display shows committed/scheduled truth (by design since INV-B / F.3B).

### Regression risk

Low if display/docs only; **high** if engine stickiness is proposed.

### Dependency order

After F.3B headline semantics shipped.

### Current status

Open as **product communication** item. Users may ask why Plan amount and headline differ after action.

### Recommended next stage

Short in-app or docs note: engine suggest vs payment-derived display contract (no engine freeze without sign-off).

---

## 8. Investment plan-room stickiness (deferred)

### Trust impact

Low for display-only path. Engine recalculating suggest after schedule is **correct**; stickiness would change product meaning of “plan amount.”

### Regression risk

**High** if implemented in `getMonthPlan` or affordability.

### Dependency order

**Decision deferred.** Display-layer committed basis (`ee4e85a`) and F.3B headline chosen instead.

### Current status

**Deferred.** Do not implement engine freeze without explicit product sign-off.

### Recommended next stage

None until product revisits engine vs display contract.

---

## Archived — shipped F series (reference only)

### F.1 — Onboarding-state copy — **SHIPPED** `b3d2dc6`

Readiness-state language contract; `geodePlanReadinessState`; gated Home/Plan/QS copy. Evidence: [F.1 manual QA](./stages/F.1/F.1-manual-qa-evidence.md).

### F.2 — Home/SA investment alignment — **SHIPPED** `3f4a5d7`

Home/SA invest display aligned to committed basis; viewOnly after commitment; no gap CTA pressure.

### F.3 — Payment upsert canonicalisation — **SHIPPED** `9796f2e`

SET/REPLACE linked upsert; paid/unpaid separation; follow-through timing; selective frozen SA reconcile; F.3B invest headline; F.3A Plan detail Apply. Evidence: [F.3 final QA](./stages/F.3/F.3-final-qa-evidence.md).

---

## See also

- [Plan stabilisation completed](./plan-stabilisation-completed.md)
- [Handover](./handover.md)
