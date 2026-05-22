# Stage 55C Handover — Reality-to-Plan Alignment

**Date:** 22 May 2026 (commit `8dafbc7` authored 22:44 +0100)  
**Current top commit:** `8dafbc7` — `polish(reality): calm home after approved plan shift`  
**Status:** Pushed and audited (55C-1 through 55C-4F post-push)  
**Cache version:** `v1.0.60` — unchanged  
**Note:** `service-worker.js` was intentionally not changed in Stage 55C.

---

## Build philosophy (carry forward)

- **Audit-first.** Pre-edit audits map behaviour, eligibility, and call sites before any `index.html` change.
- **No false passes.** Post-edit, post-commit, and post-push audits require direct code evidence.
- **Every edit must explain what, why, and expected outcome** before implementation.
- **Beynd is a calm financial partner**, not a warning bell or generic budgeting tool.
- **`service-worker.js` must not be bumped** until a broader user-facing release milestone is explicitly approved.

---

## B. Product vision

Beynd is **not** a transaction tracker or a permanent warning surface. It should **observe, coach, guide, and partner** with the user.

| Surface | Role |
|---------|------|
| **Reality** | Holds the truth — monthly estimate vs available today, human moment, month context. |
| **Preview** | Shows **what could shift** in plan steps (deterministic before/after). |
| **Approval** | Makes **Plan display** the adjusted month view via `S.realityPlanAlignment` (overlay only). |
| **Base plan maths** | Remains intact — `getMonthPlan()`, `calcMonthlyLeftover()`, income, expenses, payments unchanged. |
| **Home** | Stays **calm and neutral** — no alignment card; caution Human Moment suppressed after user acts. |
| **Ask Beynd** | Explains **why** later — must **not** generate deterministic preview amounts. |

---

## C. Problem solved

### User gap (before Stage 55C)

Reality could show that the month no longer fit the plan (negative gap, “worth reviewing”), but users could not efficiently move from **“Reality has changed”** to **“my plan now reflects this month.”**

### Why Beynd needed this without open banking

Open banking is not available yet. Beynd needs **high-leverage manual signals** (Reality check) plus **intelligent, controlled plan-step adjustment preview** — not automatic plan rewrites or duplicate coaching noise on Home.

### Outcome after Stage 55C

The first **useful** Reality-to-Plan Alignment loop:

**Reality check → See how this month could shift → Preview shifts → Use this month’s shift → Plan overlay → Revert if needed.**

---

## D. Stage-by-stage summary (committed)

### 1. `c2073c8` — feat(reality): add plan alignment preview engine

- Added **deterministic helper-only** preview engine (55C-1).
- **No UI**, **no state**, **no modal**, **no Plan overlay**, **no visible user change**.
- Functions: `geodeRealityPlanAlignmentInputsHash`, `geodeRealityPlanAlignmentPlanSignature`, `geodeEligibilityForRealityPlanAlignment`, `geodeRealityPlanAlignmentProtectedDebtStep`, `geodeBuildRealityPlanAlignmentPreview`.

### 2. `fbb6a5f` — fix(reality): relax eligibility to show preview on meaningful negative gap

- Fixed eligibility so **large negative gaps** do not hide the offer via `stale_reality`.
- **Removed** `rs.confidence === 'low'` and `rs.activitySinceCheck` as alignment blockers (55C-2E).
- **Kept** `daysOld > 7` as true stale Reality blocker.
- **Kept** `geodeHasOverdue` and `committed_reductions` gates.

### 3. `df3c1de` — feat(reality): add approval + Plan overlay for Reality-to-Plan preview

- Added month-scoped **`S.realityPlanAlignment`**.
- Modal CTAs: **Use this month’s shift** / **Not now**.
- Plan **display overlay** via `geodePlanStepRealityDisplay`.
- Plan banner: **Following your Reality shift** + revert **Use your usual plan this month**.
- Stale invalidation on load, new Reality save, signature/hash mismatch, step done.
- **Base plan maths unchanged** — overlay only.

### 4. `8dafbc7` — polish(reality): calm home after approved plan shift

- **Suppressed** Home caution Human Moment while active alignment exists (`geodeHumanMomentShouldSuppress`).
- **Preserved** insight fallback via `renderInsights()` in `geodeHomeCoachingStripHtml`.
- Alignment copy: **Protected priorities stay as they are** (not debt-only wording).
- **Zero-flex offer gate** via `geodeRealityPlanAlignmentHasShiftRows`.
- **No** new Home alignment card.

---

## E. Current user flow (final)

1. User updates **Reality balance** (current month).
2. Beynd compares Reality to **monthly plan** (`geodeRealityStatus` gap vs `calcMonthlyLeftover`).
3. If **meaningfully negative gap**, flexible rows exist, and gates pass, Reality shows:
   - **See how this month could shift**
   - **Your plan steps, before and after.**
   - **View shift**
4. Modal opens: **How this month could shift** (no figures strip; changed rows focus).
5. User can:
   - **Not now** — closes modal; no state stored.
   - **Use this month’s shift** — stores `S.realityPlanAlignment`; toast *This month’s plan view updated.*
6. **Plan** shows adjusted overlay amounts on reduced/paused steps.
7. **Plan** shows slim banner:
   - **This month**
   - **Following your Reality shift**
   - **Use your usual plan this month**
8. **Revert** clears overlay; toast *Back to your usual plan.*
9. **New Reality save** clears old alignment (`geodeClearRealityPlanAlignment` before save).
10. **Home:** caution Human Moment **suppressed** while alignment active; **insights** may still render via `renderInsights()`.

---

## F. Technical implementation map

All logic lives in **`index.html`** unless noted.

### Preview engine (55C-1 — do not casually rewrite algorithm)

| Function | Purpose |
|----------|---------|
| `geodeRealityPlanAlignmentInputsHash` | Stable hash for current-month Reality check |
| `geodeRealityPlanAlignmentPlanSignature` | Stable signature from plan step labels + amounts |
| `geodeEligibilityForRealityPlanAlignment` | Read-only gates → `reasonCode` |
| `geodeRealityPlanAlignmentProtectedDebtStep` | Debt-label protection (`Reduce high…`, `Pay down …`) |
| `geodeBuildRealityPlanAlignmentPreview` | Deterministic before/after rows; returns `null` if not eligible |

### Offer and modal (55C-2 / 55C-4C)

| Function | Purpose |
|----------|---------|
| `geodeRealityPlanAlignmentOfferHtml` | Compact Reality offer; hidden if active alignment or no shift rows |
| `geodeOpenRealityPlanAlignmentPreview` | Opens modal; zero-flex defensive path |
| `geodeRealityPlanAlignmentPreviewModalHtml` | Modal body + CTAs |
| `geodeRealityPlanAlignmentPreviewRowHtml` | Single step row (before → after) |
| `geodeRealityPlanAlignmentHasShiftRows` | True if any `reduce` / `pause` row (55C-4C) |

### Approval and state (55C-3)

| Function | Purpose |
|----------|---------|
| `geodeApproveRealityPlanAlignmentFromPreview` | Persist approved snapshot |
| `geodeNormalizeRealityPlanAlignment` | Clear invalid on `load()` |
| `geodeRealityPlanAlignmentIsStale` | Hash, signature, step done, label mismatch |
| `geodeGetActiveRealityPlanAlignment` | Active approved alignment or null |
| `geodeClearRealityPlanAlignment` | Delete state + persist |
| `geodeRevertRealityPlanAlignment` | User revert from Plan banner |

### Plan overlay (55C-3)

| Function | Purpose |
|----------|---------|
| `geodeGetRealityPlanStepAdjustment` | Lookup adjustment for step index |
| `geodePlanStepRealityDisplay` | Display-only amount/caption overlay |
| `geodeRealityPlanAlignmentPlanBannerHtml` | Slim Plan banner + revert |

### Touched render / save / Home points

| Location | Change |
|----------|--------|
| `geodeRealityPageHtml` | Injects offer after comparison + human moment |
| `geodeSaveRealityCheckFromPage` | Clears alignment on save |
| `geodeSaveRealityCheck` | Clears alignment on save |
| `geodePlanPagePrioritiesStackHtml` | Overlay on stack amounts |
| `geodePlanStepDetailPageHtml` | Overlay on detail hero + caption |
| `rPlan` | Injects Plan banner |
| `load` | `geodeNormalizeRealityPlanAlignment(S)` |
| `geodeHumanMomentShouldSuppress` | Suppress HM when active alignment (55C-4C) |
| `geodeBeyndBackupRestorableKeyWhitelist` | Includes `realityPlanAlignment` |

---

## G. State model — `S.realityPlanAlignment`

```javascript
{
  version: 1,
  ym: 'YYYY-MM',              // currentYM() at approval
  status: 'approved',
  approvedAt: 1710000000000,  // Date.now()
  source: 'reality_preview',
  inputsHash: '...',          // from preview / geodeRealityPlanAlignmentInputsHash
  planSignature: '...',       // from preview / geodeRealityPlanAlignmentPlanSignature
  stepAdjustments: [
    {
      stepIndex: 1,
      action: 'reduce',       // or 'pause'
      baselineAmount: 1599,
      displayAmount: 934,
      appliedAmountAtApproval: 0,
      stepLabel: 'Build your emergency fund'
    }
  ]
}
```

### Clarifications

- Stores **`reduce` / `pause` rows only** — not full plan, not all rows.
- Does **not** mutate income, expenses, payments, goals, debts, or `reductionPlan`.
- **Month-scoped** (`ym` must match `currentYM()`).
- **Cleared** when stale (hash, signature, step completed, wrong month, invalid structure).
- **Not** written on “Not now” or preview-only inspection.

---

## H. Protected logic (do not casually edit)

| Area | Why |
|------|-----|
| `getMonthPlan` | Authoritative plan sequence and amounts |
| `calcMonthlyLeftover` / `calcLeftover` / `sumExpensesMonthly` | Monthly maths |
| `geodeRealityStatus` | Gap and confidence for Reality |
| Income / expense / payment / goal / debt **records** | Money truth |
| `reductionPlan` and **Intel** flows | Separate product (merchant reductions) |
| **Home Main Action** | Urgent next action; not alignment UI |
| **Ask Beynd** worker / provider | No LLM amounts for alignment |
| **Smart Import** | Unrelated |
| **Subscription** logic | Unrelated |
| **`service-worker.js`** | Cache bump is release-level decision |

Preview **engine** (`geodeBuildRealityPlanAlignmentPreview`, eligibility) may be extended only with audit + explicit approval.

---

## I. What was intentionally not changed

- No **base plan maths** changes.
- No **automatic** plan changes without user approval.
- No **Home alignment card** or Home prompt for alignment.
- No **Ask Beynd CTA** inside alignment modal.
- No **Adjust manually**, **Keep original plan**, or **Use adjusted plan** (disabled/tease) copy.
- No long **footer / safety** paragraphs in modal (55C-2C tone).
- No **figures strip** duplicating Reality comparison in modal.
- No **`service-worker` cache bump** in Stage 55C.
- No **open banking** integration.
- No use of **`reductionPlan`** for Reality alignment.
- No **Plan overview** total recalculation from overlay.
- **Reality-page** Human Moment unchanged by 55C-4C (Home only).

---

## J. Human Moment and Home behaviour

| Phase | Behaviour |
|-------|-----------|
| **Before user acts** | Home caution Human Moment can appear when posture/gap warrant (`geodePickHumanMoment`). |
| **After approve** | Caution Human Moment **suppressed** while `geodeGetActiveRealityPlanAlignment` is valid. |
| **Insights** | `geodeHomeCoachingStripHtml` falls through to **`renderInsights()`** — coaching not removed. |
| **No replacement Home card** | Plan banner carries “following shift”; Home stays uncluttered. |
| **After revert or stale clear** | Human Moment rules **return** to normal. |

Copy note: “Step 1 protected” is **incorrect product language**. Code protects **debt-labelled** steps and shows **Protected priorities stay as they are** in the modal — not “Step 1” by index.

---

## K. Known gaps / backlog

| # | Item | Notes |
|---|------|--------|
| 1 | **Adaptive protection model** | Current protection is **debt-label based** (`Reduce high…`, `Pay down …`). Buffer-first plans, dependants, irregular income, urgent goals, and strategy-specific first steps need a dedicated audit before engine changes. |
| 2 | **Plan detail / snapshot polish** | Impact snapshot “Plan amount” may still show **base** `prog.suggested` while hero shows overlay — verify on device. |
| 3 | **Ask Beynd context** | Later: explain approved shift using deterministic alignment summary; **never invent amounts**. |
| 4 | **Afford gate / scheduling** | Scheduling flows may not reflect overlay display amounts yet. |
| 5 | **Plan overview totals** | Deferred; `calcMonthlyLeftover` remains authoritative. |
| 6 | **Shortfall copy dedupe** | Optional if “Protected priorities stay as they are” repeats in one modal. |
| 7 | **Zero-flex UX** | Offer gated; defensive modal + toast path remains for edge cases. |
| 8 | **Cache release** | `service-worker.js` still `v1.0.60`; bump only when broader release approved. |

---

## L. Manual smoke tests (passed / repeat after future edits)

- [ ] Negative gap → offer **See how this month could shift** visible.
- [ ] **View shift** opens modal **How this month could shift**.
- [ ] **Use this month’s shift** creates overlay + Plan banner.
- [ ] **Not now** closes modal; **no** `S.realityPlanAlignment`.
- [ ] Protected priorities (e.g. debt step) **unchanged** in preview and Plan.
- [ ] Flexible later steps show **reduce/pause** overlay.
- [ ] **Use your usual plan this month** restores baseline Plan view.
- [ ] **New Reality save** clears alignment; offer can return if eligible.
- [ ] Home **caution Human Moment suppressed** after approval.
- [ ] Home **insights** still appear when HM suppressed (`renderInsights`).
- [ ] **Overdue** / **positive gap** / **stale >7 days** / **committed reductions** suppress offer.
- [ ] No Home clutter; no Ask Beynd in alignment modal.
- [ ] Plan maths and scheduled payments **unchanged** in storage.

---

## M. Risk areas

| Risk | Mitigation mindset |
|------|-------------------|
| User thinks overlay **changed payments** | Plan banner + overlay captions; no “scheduled” language |
| Protection **too debt-label dependent** | Stage 56A adaptive audit before engine change |
| Stack/detail **mismatch** if bypassing `geodePlanStepRealityDisplay` | Always use shared display helper |
| **Stale alignment** if new save paths skip clear | Any Reality save must call clear helper |
| Home becomes **warning-heavy** again | Do not re-enable caution HM during active alignment |
| **Too many CTAs / footers** in modal | Keep Use / Not now only |
| **Cursor false PASS** without device smoke | Repeat checklist in §L |

---

## N. Recommended next stage

### Primary recommendation: **Stage 56A — Read-only audit for adaptive protected priorities**

**Goal:** Define how Beynd decides what stays protected based on **plan strategy**, **income type**, **dependants**, **urgency**, **partially applied steps**, and **user context** — **without** changing `getMonthPlan` prematurely.

**Deliverable:** Audit-only doc + decision table (protect / flex / summarize) before any engine edit.

### Alternative entry

**Stage 56A — Documentation / QA:** Test alignment across **~10 user archetypes** (debt-first, buffer-first, growth, dependants, overdue, stale, zero-flex, shortfall, post-approve Home calm) before changing protection logic.

### Not recommended as immediate next step

- Full **55C-4** UI polish only (shortfall dedupe) without addressing protection semantics — lower priority than 56A if founder concern is “Step 1” / strategy fit.

---

## O. Build discipline going forward

1. **Audit first** — read-only, cite line numbers and `reasonCode` paths.
2. Explain **what, why, expected outcome** before every edit.
3. **No broad edits** — smallest useful diff; `index.html` only unless explicitly expanded.
4. **No service-worker bump** until major milestone release sign-off.
5. **No false PASS** — distinguish CODE-INSPECTED vs device-verified.
6. Every recommendation must respect **calm partner** vision: Reality = truth, Preview = shift, Plan = approved view, Home = calm, Ask Beynd = why.

---

## Quick commit chain (Stage 55C only)

```
8dafbc7 polish(reality): calm home after approved plan shift
df3c1de feat(reality): add approval + Plan overlay for Reality-to-Plan preview
fbb6a5f fix(reality): relax eligibility to show preview on meaningful negative gap
c2073c8 feat(reality): add plan alignment preview engine
```

**Parent before 55C:** `65e7f5d` — Stage 53 mini milestone handover (separate feature set).

---

*End of Stage 55C handover.*
