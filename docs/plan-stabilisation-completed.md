# Plan Stabilisation — Completed Work

**Stable baseline:** `ee4e85a` (`feat(plan): anchor investment display to payment-derived committed basis`)  
**Prior stabilisation commit:** `061e3d8` (`feat(plan): stabilise action-state truth, debt display, and buffer target hierarchy`)  
**Scope:** `index.html` Plan display and read-only helpers only. Engine sizing unchanged.

This document records what was stabilised after the unstable 81F rebuild stack was rolled back, and before further Plan-adjacent work (F.1 onward).

---

## Operating principle

**Engine truth stays dynamic. Display truth follows user action where trust requires it.**

Plan step amounts from `getMonthPlan()` continue to recalculate from live affordability and strategy ratios. Display layers may show payment-derived or action-state-derived figures when that better matches what the user committed or moved.

---

## 1. Action-state truth stabilisation (Stage B)

**Commit:** `061e3d8`

### Behavioural goal

Plan, Home, and Suggested Actions should agree on whether a step is not started, scheduled only, in progress, completed, or still actionable — without mutating plan sizing or payment state.

### Display-layer principle

- **`geodePlanStepScheduledAmount`** — read-only scheduled unpaid amount per step type.
- **`geodePlanStepActionState`** — structured action/progress truth (`coverageGap`, `actionAmount`, `isScheduledOnly`, `isCompleted`, etc.).
- **`geodePlanStepProgress`** — unchanged; action state reads from it.
- Wiring into Home main action, suggested actions merge, and Plan row status labels.

### Intentionally NOT changed

- `getMonthPlan` step amounts and ordering
- `calcMonthlyLeftover`, `computeAffordabilityContext`
- Payment save flow
- Balance gate

### Regression risk avoided

- Home/SA showing a different “next amount” than Plan progress math without a defined rule
- Partial schedule misclassified as complete or not started

### Manual QA expectations

- Schedule a contribution without marking paid → status **Scheduled**; action state `isScheduledOnly` where applicable
- Mark partial paid → **In progress**; remaining/action amount coherent across Plan row and SA
- Mark full plan amount paid → **Completed**
- Debt and buffer steps unaffected

---

## 2. Debt display alignment (Stage C)

**Commit:** `061e3d8`

### Behavioural goal

Plan debt row and detail headline amounts should match action-state truth (scheduled, gap, completed), not raw dynamic `step.amount` alone after the user has acted.

### Display-layer principle

- **`geodePlanPageIsDebtStep`**, **`geodePlanPageDebtStepAmountDisplay`**
- Debt branch in **`geodePlanPageStepRowAmountDisplay`** and **`geodePlanStepDetailPageHtml`** before generic partial overrides
- Uses **`geodePlanStepActionState`** — debt is obligation-framed; action-state headline is correct product semantics

### Intentionally NOT changed

- Debt minimum vs extra recognition in payment sums (backlog)
- `getMonthPlan` debt step sizing
- Payment save flow

### Regression risk avoided

- Plan debt row reverting to recalculated suggestion after partial schedule
- Detail header contradicting row amount

### Manual QA expectations

- Reduce-high / Pay-down steps show scheduled amount when scheduled-only
- Partial pay shows remaining or action amount consistent with detail metrics
- Completed debt step shows coherent completed headline

---

## 3. Buffer persistence (Stage D)

**Commit:** `061e3d8`

### Behavioural goal

Buffer Plan row should remain visible when scheduled unpaid contributions cover the sizing gap but target savings are still outstanding — user should not see the step vanish because scheduled math zeroed the display gap.

### Display-layer principle

- **`getMonthPlan` Step 2 only:** split `actualRemainingNeed` (target − saved) from `unscheduledGap` (actual − scheduled unpaid)
- Row persists when scheduled covers gap but target outstanding; `bufferStepAmount = ef || schedBufPlan`
- Display helpers consume persisted step presence and amounts

### Intentionally NOT changed

- Buffer contribution counting rules
- Goal save flow
- Non-buffer plan steps

### Regression risk avoided

- Buffer step disappearing from Plan when user had scheduled buffer payments
- False “complete” appearance when target not met

### Manual QA expectations

- Schedule buffer payment short of target → step remains on Plan
- Mark buffer paid toward target → progress coherent
- Buffer detail metrics unchanged in structure

---

## 4. Buffer target hierarchy (Stage D.2)

**Commit:** `061e3d8`

### Behavioural goal

One consistent buffer target across Plan intro, step display, readiness, and detail — goal amount when set, else emergency buffer field, else monthly × 3, else 0.

### Display-layer principle

- **`geodeResolveBufferTarget(state)`** — read-only hierarchy
- Wired into `getMonthPlan` Step 2 sizing input, **`geodeGetBufferReadinessState`**, **`geodePlanBufferStepDisplay`**, Plan intro and detail buffer target copy

### Intentionally NOT changed

- Emergency goal creation on payment save (separate 81D-3.5 flow)
- Affordability engine

### Regression risk avoided

- Plan showing 3× expenses target while detail referenced goal amount (or vice versa)
- Buffer step sized against wrong target basis

### Manual QA expectations

- With emergency goal + amount → Plan/detail target matches goal
- Without goal, with `S.emergencyBuffer` → uses that field
- With expenses only → ~3× monthly expenses estimate
- No expenses/goal → neutral buffer context copy

---

## 5. Investment committed-basis display semantics (INV-B / INV-B.1)

**Commit:** `ee4e85a`

### Behavioural goal

After the user schedules or pays an investment contribution this month, Plan row and detail **headline** should show what they committed (scheduled + paid), not a recalculated engine suggestion that moved because scheduling reduced `suggestableRoom`.

Investment is **optional** — no “remaining obligation” headline semantics.

### Display-layer principle

- **`geodeInvestScheduledThisMonth(state, investId)`** — unpaid upcoming/overdue invest payments this month (`paymentCountsForMonthlyOutflowDisplay`)
- **`geodeInvestCommittedThisMonth(state, investId)`** — `{ scheduled, paid, committed }`
- **`geodePlanInvestPageAmountDisplay`** — if `committed > 0`, headline = committed; else dynamic `step.amount`
- Invest branch in **`geodePlanPageStepRowAmountDisplay`** and detail header **before** generic partial overrides that force `prog.remaining` / `step.amount`

### Intentionally NOT changed

- `getMonthPlan` invest sizing (`budget × investRatio`)
- `geodePlanStepProgress` / `geodePlanStepActionState` internals
- Copying debt-style action-state headline rules for invest (failed E.1 / E.1.1 — reverted)

### Regression risk avoided

- User schedules £96 of £196 suggestion → Plan later showing £71 recalculated suggestion as headline
- Treating optional invest as debt-like “you owe the rest”

### Manual QA expectations

- Suggest £196, schedule £96, no further movement → row/header **£96**
- Delete scheduled payment only → headline returns to dynamic suggestion
- Paid payment remains → committed headline remains (payment truth)

---

## 6. Investment Impact Snapshot restoration (INV-B.1 / INV-B.2-FIX)

**Commit:** `ee4e85a`

### Behavioural goal

Investment detail Impact Snapshot should match debt/buffer structure (metric rows, progress bar, short note) while keeping optional invest framing — not a long paragraph or duplicate “Committed this month” labels.

### Display-layer principle

Structured rows in **`geodePlanStepDetailPageHtml`** (`detailInvest` branch):

| State | Metrics |
|-------|---------|
| No action | Plan amount · Marked complete £0 · Remaining · bar |
| Scheduled only | Plan amount · Scheduled · Marked complete £0 · Next step · no bar |
| Paid / in progress | Plan amount · Scheduled (if any) · Marked complete · Remaining · bar |
| Completed | Plan amount · Marked complete · Remaining £0 · bar |

Short impact note only:

> This is optional spare-cash guidance. Beynd uses what you entered, not a forecast.

**`geodePlanPageInvestPriorityBodyHtml`** — payment-derived optional body copy (no “Schedule the remainder”).

Row/header: amount + status badge only (no permanent “Committed this month” caption under row).

### Intentionally NOT changed

- Engine `prog.suggested` / `prog.remaining` calculation
- Home / Suggested Actions invest amounts (backlog F.2)
- Payment save / upsert flow

### Regression risk avoided

- Detail page visually breaking from other Plan detail pages
- Long em-dash paragraphs inside Impact Snapshot (failed INV-B.2 — fixed in B.2-FIX)
- Duplicate committed labels (row + header + metrics + Plan note)

### Manual QA expectations

- Detail Impact Snapshot scannable like debt step
- Scheduled-only: Next step row, no misleading 0% bar
- No em dashes in edited invest user-facing copy
- Debt/buffer detail blocks unchanged

---

## Failed attempts (do not repeat)

| Attempt | Issue | Resolution |
|---------|-------|------------|
| E.1 / E.1.1 | Debt-style `geodePlanStepActionState` headline for invest | Reverted — gap semantics wrong for optional invest |
| INV-B.2 (first) | Long paragraph + em dashes in Impact Snapshot | Reverted in B.2-FIX — restored metric rows |

---

## Related commits (context only)

| Commit | Summary |
|--------|---------|
| `061e3d8` | B + C + D + D.2 |
| `ee4e85a` | INV-B + B.1 + B.2-FIX (single commit) |

---

## See also

- [Plan backlog](./plan-backlog.md)
- [Strategic systems (partial)](./strategic-systems-partial.md)
- [Handover](./handover.md)
