# Stage 53 Mini Milestone Handover — Data Trust, Calm Re-entry, and Subscription Decision Respect

**Date:** 21 May 2026  
**Current top commit:** `f761d4a` — `fix(subscriptions): respect Keep it for renewal instance`

---

## Build philosophy

- **Audit-first.** Pre-edit audits map behaviour and call sites before any `index.html` change.
- **No false passes.** Post-edit and post-commit/post-push audits require direct code evidence; say UNKNOWN when evidence is missing.
- **Every edit must explain what, why, and expected outcome** before implementation.
- **Avoid duplication, clutter, accidental removals, and broken existing logic.** Extend existing helpers and gates rather than parallel Home surfaces.
- **Cursor must not recommend edits without evidence** from the codebase (grep, diff, line references).
- **`service-worker.js` must not be bumped** until a meaningful user-facing release milestone is explicitly approved.

---

## Summary of completed work

| Area | Stages | Theme |
|------|--------|--------|
| **A.** Recurring expense date roll-forward | 50C / 50D | Data trust — due dates stay current for recurring spending |
| **B.** Since-last-visit welcome-back line | 51B | Calm re-entry — muted Home line when safe |
| **C.** Subscription Keep it renewal-instance suppression | 52B | Decision respect — no re-nag within the same renewal |

All three shipped as **`index.html` only**. No `service-worker.js` changes. **`CACHE_VERSION` remained `v1.0.60`.**

---

## A. Recurring expense date roll-forward (Stages 50C / 50D)

### Problem found

Recurring **expense** due dates in Spending could fall behind the current month/year. `syncRecurringPayments()` early-returned when there were **no payments**, so **expense-only** users never got expense roll-forward. Payment roll-forward existed; expense roll-forward did not.

### What changed

- Added `rollupRecurringExpenseDueDates()` — monthly (`rec === 'yes'`) steps month-by-month until `>= startOfMonth`; annual (`rec === 'annual'`) steps year-by-year.
- Wired into `syncRecurringPayments()` with `if (rollupRecurringExpenseDueDates()) changed = true`.
- **50D guard fix:** `syncRecurringPayments()` no longer requires `S.payments.length`; payment reset loop wrapped; rollups still run for expense-only users.

### Why it matters (behavioural coaching)

Beynd is not a stale spreadsheet. Trustworthy due dates support subscription nudges, month context, and calm coaching without wrong “overdue” or missing renewal windows.

### Release record

| Field | Value |
|-------|--------|
| **Commit** | `8a7924a` |
| **Message** | `fix(expenses): roll recurring expense due dates forward` |
| **Files changed** | `index.html` only |

### Protected areas not changed

Plan maths (`sumExpensesMonthly` etc.), Home card order, Main Action, Needs Attention, Ask Beynd, Smart Import, Reality Check, appearance/theme, `service-worker.js`, `CACHE_VERSION`.

### Expected user outcome

Recurring expenses show **current-month (or current-year) due dates** after sync/load, including users with **no payment rows**. Plan totals unchanged (roll-forward updates `e.date` for trust/nudges, not monthly sum logic).

### Smoke-test status

Committed, pushed, post-push audited. (Stage 50 series.)

---

## B. Since-last-visit welcome-back line (Stage 51B)

### Problem found

`geodeRenderSinceLastVisit(prevVisitTs)` existed with copy but **zero call sites**. `S.lastSeenAt` was written in `rHome()` but not read for display before the next visit overwrote it.

### What changed

- Added `geodeHomeShouldShowSinceLastVisit(prevLastSeen, ctx)` — read-only suppression gates.
- In `rHome()`: capture `var prevLastSeen = S.lastSeenAt` after empty-state return; after Home hero, guarded `h += geodeRenderSinceLastVisit(prevLastSeen)`.
- `geodeRenderSinceLastVisit` **copy unchanged**.

### Why it matters (behavioural coaching)

Calm re-entry when the user returns — not an alarm. Suppressed when Home is urgent (critical band, overdue, over-budget, recovery, completed-goal ack, post-setup/Reality prompts, empty state).

### Release record

| Field | Value |
|-------|--------|
| **Commit** | `d5f79d1` |
| **Message** | `feat(home): wire since-last-visit welcome-back line` |
| **Files changed** | `index.html` only |

### Protected areas not changed

`geodeHomeMainActionHtml`, `geodeGetRecoveryState`, `geodeUpdateOnTrackStreak`, Needs Attention, over-budget logic, Main Action priority, plan maths, Ask Beynd, Smart Import, Reality Check, appearance/theme, subscription reminder logic, `service-worker.js`, `CACHE_VERSION`.

### Expected user outcome

On a **calm** return visit, a **muted line under the Home hero** reflects activity since last visit (or “no changes” / idle copy). No line when Home is in a critical or high-friction state. **Normal streak alone does not suppress** the line.

### Smoke-test status

Committed, pushed, post-push audited (Stage 51E).

---

## C. Subscription Keep it renewal-instance suppression (Stage 52B)

### Problem found

**Keep it** used day-scoped localStorage (`geode_sub_reviewed_day_v1`: `{ day, ids }`). Same subscription could **reappear at T-3, T-1, or T** after a new calendar day even though the user already decided to keep it for that renewal.

### What changed

- New key: `geode_sub_reviewed_renewals_v2` (`GEODE_SUB_REVIEWED_RENEWALS_LS`).
- Instance key: `id|YYYY-MM-DD|toNum(amount).toFixed(2)` via `geodeSubRenewalInstanceKey(expense)`.
- Load/save/mark/check helpers for renewal instances.
- `geodeListSubscriptionReminderItems` filters with `!geodeSubIsReviewedForRenewal(row)` (derived row has `id`, `date`, `amount`).
- `geodeSubKeepIt` resolves expense by id → `geodeSubMarkReviewedForRenewal(_subExp)`; next-modal chain preserved.
- Legacy day-scoped helpers **kept** but **no longer** used for suppression.

### Why it matters (behavioural coaching)

Beynd respects **“I’m keeping this for this renewal”** — not daily re-nagging. Reminders return when **date**, **amount**, or **expense id** changes (including Stage 50 roll-forward).

### Release record

| Field | Value |
|-------|--------|
| **Commit** | `f761d4a` |
| **Message** | `fix(subscriptions): respect Keep it for renewal instance` |
| **Files changed** | `index.html` only |

### Protected areas not changed

`geodeSubscriptionReminderDiffOk`, `geodeExpenseIsSubscriptionRenewalEligible`, subscription sort/prioritisation (except reviewed filter), `geodeHomeSoftPriorityContext`, `rHome` subscription card layout, Main Action, Needs Attention, plan maths, `rollupRecurringExpenseDueDates`, Ask Beynd, Smart Import, Reality Check, appearance/theme, `service-worker.js`, `CACHE_VERSION`.

### Expected user outcome

After **Keep it** at e.g. T-7, the same **id + due date + amount** stays hidden through T-3, T-1, and T, across **days and reloads**. New renewal cycle or edit → reminder can show again in trigger windows (T-7, T-3, T-1, T).

### Smoke-test status

Committed, pushed, post-push audited (Stage 52E). **User confirmed manual smoke test passed after Stage 52E.**

---

## Current app state after these milestones

| Item | State |
|------|--------|
| **`index.html`** | Updated and pushed through `f761d4a` |
| **`service-worker.js`** | Unchanged across Stages 50–52 |
| **`CACHE_VERSION`** | `v1.0.60` |
| **Git** | Local and remote `main` confirmed in sync at `f761d4a` after Stage 52E |
| **Client delivery** | Existing users may **not** load the latest `index.html` immediately until a future **cache bump**, hard refresh, or cache bypass; renewal suppression also uses **device localStorage** once new script runs |

**Commit stack on `main` (recent):**

1. `8a7924a` — recurring expense roll-forward  
2. `d5f79d1` — since-last-visit welcome-back  
3. `f761d4a` — Keep it renewal-instance suppression  

---

## Logic to protect going forward

Do not change without explicit audit + approval:

| Area | Symbols / behaviour |
|------|---------------------|
| Expense roll-forward | `rollupRecurringExpenseDueDates`, `syncRecurringPayments` guard for expense-only users |
| Welcome-back gates | `geodeHomeShouldShowSinceLastVisit` suppression rules |
| Welcome-back copy | `geodeRenderSinceLastVisit` (unless copy change explicitly approved) |
| Keep it instance key | `geodeSubRenewalInstanceKey` |
| Keep it check/mark | `geodeSubIsReviewedForRenewal`, `geodeSubMarkReviewedForRenewal` |
| Subscription list gate | `geodeListSubscriptionReminderItems` reviewed filter |
| Keep it UX chain | `geodeSubKeepIt` next-modal behaviour |

---

## Backlog still open

- **Home month-context check-in** — needs careful pre-edit audit (clutter risk on Home).
- **Ask Beynd onboarding / discoverability** — audit needed.
- **Likely-completed contribution Home prompt** — audit needed.
- **One-off expense expiry + Beynd Statement** — schema design required.
- **Reality adapting the Plan** — strategic, high-risk; do not rush.
- **Off-white / light appearance production hardening** — separate track.
- **`service-worker` cache bump** — deferred until approved release milestone.

---

## Future build warnings

1. Do **not** add another Home surface without checking **critical / focused / open** soft-prioritisation (`geodeHomeSoftPriorityContext`).
2. Do **not** duplicate Main Action, Needs Attention, subscription card, Human Moment, or Insight copy.
3. Do **not** silently mutate **plan maths**.
4. Do **not** change Ask Beynd provider/worker flow without a **separate audit**.
5. Do **not** touch **`service-worker.js`** unless a release **cache bump** is explicitly approved.
6. Do **not** treat older Claude master-plan backlog as current — **verify in code first**.

---

## Recommended next audit candidate

**Home month-context check-in** — **read-only pre-edit audit only** (Stage 54A-style). Map call sites, soft-priority interaction, and clutter risk before any wiring.

---

## Audit trail reference (Stages 50–52)

| Stage | Type | Outcome |
|-------|------|---------|
| 50A–50G | Expense roll-forward audits | PASS; pushed `8a7924a` |
| 51A–51E | Welcome-back audits | PASS; pushed `d5f79d1` |
| 52A–52E | Keep it suppression audits | PASS; pushed `f761d4a` |

---

*Handover created for Stage 53 documentation. Not committed by agent.*
