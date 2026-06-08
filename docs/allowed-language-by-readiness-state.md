# Allowed Language by Readiness State

**Stage:** F.1-PRE  
**Baseline:** `ee4e85a`  
**Purpose:** Define what Beynd may say at each readiness state so copy never implies a plan exists before there is enough truth.  
**Scope:** Documentation only. Future F.1 build should branch display copy using a read-only readiness helper; this doc is the contract.

---

## Beynd voice (all states)

Copy must be:

- Natural and human
- Calm and conversational
- Grammatically correct
- Concise
- Free of em dashes
- Free of robotic phrasing and duplicated meaning
- Free of clutter and pressure framing
- Free of fake certainty
- Free of “AI coach” tone

Prefer short sentences. One idea per line on cards. Use “you can” and “Beynd is using what you entered” over “you should” and “Beynd recommends.”

---

## Truth layers

These layers are related but not identical. Copy must never collapse them.

| Layer | What it is | Examples in code (read-only) |
|-------|------------|------------------------------|
| **Engine truth** | Dynamic calculations and plan generation | `getMonthPlan`, `calcMonthlyLeftover`, `computeAffordabilityContext` |
| **Action-state truth** | Step not started, scheduled only, in progress, complete | `geodePlanStepProgress`, `geodePlanStepActionState` |
| **Payment truth** | Scheduled or paid this month | `geodePlanStepScheduledAmount`, `geodeInvestCommittedThisMonth` |
| **Display truth** | What a specific surface should show | Plan row/detail helpers, readiness branching |
| **Behavioural truth** | How Beynd frames the situation emotionally | This document |

**Principle:** A moving engine suggestion is not the same as a user commitment. Scheduled is not completed. Optional invest is not obligation. Display may anchor to payments after action without changing engine sizing.

---

## Readiness state map (technical hints)

Future helper `geodePlanReadinessState(state)` should derive display state from existing gates only (no engine mutation):

| State | Typical code signals |
|-------|----------------------|
| Blank | `geodeIsEmptyState()` |
| Setup | `hasOnboarded` + incomplete baseline (no positive income and/or !`geodeHasPlanContext()`) |
| Baseline | Positive income + context (`geodeHasPlanContext()` or meaningful user action) but !`planHasMeaningfulStep` |
| Preview / draft | `getMonthPlan()` returns steps but user has not acted; amounts may exist |
| Active | `planHasMeaningfulStep` + user may have scheduled/paid |
| Adaptive | Orthogonal overlay: `planCommitted`, Reality alignment, month shift |
| Reflection | Stability Room / Reflection surfaces; entry gate suggested |

States 5 to 7 can overlap Active. Copy picks the **most conservative** framing when layers disagree.

---

## 1. Blank state

**Meaning:** User has not entered enough meaningful financial information.

### What Beynd truly knows

- App is open; onboarding may not have finished
- No saved income and no debts, goals, expenses, payments, or investments

### What Beynd does not know yet

- Income, spending, debts, goals, or monthly room
- Any prioritised sequence for this month

### Allowed tone

Welcoming, orienting, low pressure. Invite the first small step.

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **No** |
| “Review” language | **No** |
| “Recommendation” language | **No** |

### Allowed words or phrases

- “Let’s build your starting picture.”
- “Add a few details so Beynd can guide you properly.”
- “Start with what you know.”
- “Set income when you are ready.”

### Forbidden words or phrases

- “Your plan”
- “Based on your plan”
- “Review your plan”
- “You are on track”
- “Beynd recommends”
- “Plan is live”
- “Follow this plan”

### Good copy examples

- “Start your plan with income.” (action-oriented setup, not possession of a plan)
- “Three steps to your first plan.” (future-facing, OK on empty Plan tab)

### Bad copy examples

- “Based on your plan today, a quick review can help you stay aligned.”
- “Your monthly plan” (as a page title when nothing exists)

---

## 2. Setup state

**Meaning:** User has started setup, but the financial picture is incomplete.

### What Beynd truly knows

- Some fields may exist (income saved as zero, partial Money entries, onboarding complete)
- Picture is partial; `geodeHasPlanContext()` may still be false

### What Beynd does not know yet

- Reliable monthly room or a prioritised sequence with amounts
- Whether spending baseline is representative

### Allowed tone

Patient, incremental. Emphasise “basics first.”

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **Limited** (“build your plan”, “plan setup”) |
| “Review” language | **Soft only** (“check what you entered”) |
| “Recommendation” language | **No** |

### Allowed words or phrases

- “A few more details will help Beynd understand this month.”
- “You can add the basics first and refine later.”
- “Beynd is still learning your month.”
- “Add spending so Beynd can see this month clearly.”

### Forbidden words or phrases

- “Your monthly plan is ready”
- “Based on your plan today”
- “Here is your best next step”
- Any certainty about priorities
- “You are on track”
- “Plan complete”

### Good copy examples

- “Add monthly income in Settings to see how Beynd would allocate spare cash.”
- “Add debts, expenses, goals, or payments to see whether you are on track.” (status panel when gated)

### Bad copy examples

- “Your plan is live. Adjust spending anytime.” (after Quick Setup with thin steps)
- “Worth a quick look” + “Based on your plan today…” (Home anticipatory card)

---

## 3. Baseline state

**Meaning:** Enough income, spending, debt, or goal information exists for Beynd to understand the financial picture, but no meaningful active plan sequence exists yet (`planHasMeaningfulStep` false).

### What Beynd truly knows

- Income and/or expenses and/or linked items
- Leftover estimate may exist; order of priorities may be implied by engine but not surfaced as actionable steps with amounts

### What Beynd does not know yet

- Which steps the user will act on
- That a “plan” is something the user owns or follows

### Allowed tone

Informative, provisional. “Starting point” not “finished plan.”

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **Conditional** (“plan taking shape”, “monthly picture”) |
| “Review” language | **Yes** (“review the picture”, “sense-check what you entered”) |
| “Recommendation” language | **No** |

### Allowed words or phrases

- “Beynd has enough to start shaping guidance.”
- “This gives Beynd a starting point.”
- “You can review the picture before acting.”
- “Not enough spare cash yet to build plan steps this month.”

### Forbidden words or phrases

- “Complete your plan”
- “Follow this plan”
- “You should”
- Pressure language (“don’t fall behind”, “you need to”)
- “Based on your plan today” (implies finished plan)

### Good copy examples

- “Little to allocate this month.” (Plan status when total suggested is zero)
- “Review your setup” (Main action CTA when steps empty)

### Bad copy examples

- “Follow your monthly plan”
- “Your monthly plan is complete”

---

## 4. Preview / draft plan state

**Meaning:** Beynd can generate a suggested sequence (`planHasMeaningfulStep` true) but the user has not acted yet on steps this month.

### What Beynd truly knows

- Engine-generated step order and suggested amounts
- Progress is not started or scheduled-only for some steps

### What Beynd does not know yet

- What the user will commit to
- That optional steps (invest) are obligations

### Allowed tone

Suggestive, optional. Clear that this is guidance from what they entered.

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **Yes, qualified** (“suggested plan”, “this month’s plan”) |
| “Review” language | **Yes** |
| “Recommendation” language | **Soft** (“suggested”, “looks most important”) |

### Allowed words or phrases

- “Here’s what looks most important this month.”
- “This is a suggested plan, not a commitment.”
- “You can adjust this before taking action.”
- “Optional spare-cash guidance. Beynd uses what you entered, not a forecast.”

### Forbidden words or phrases

- “You have committed”
- “You need to complete”
- “You are behind”
- “You must”
- “Schedule the remainder” (invest)

### Good copy examples

- “Plan amount” on Impact Snapshot (debt/buffer/invest detail)
- “Current suggestion” when no invest payment yet

### Bad copy examples

- “Remaining on this step” for optional invest
- “You owe the rest”

---

## 5. Active plan state

**Meaning:** Meaningful plan steps exist and the user may have scheduled or completed actions this month.

### What Beynd truly knows

- Step sequence, amounts, progress, scheduled unpaid, paid this month
- Action-state phase per step (not started, scheduled, in progress, done)

### What Beynd does not know yet

- Future spending or balance truth unless user enters Reality check
- That every pound is allocated or that user “should” finish every step

### Allowed tone

Factual, steady. Celebrate progress without guilt.

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **Yes** |
| “Review” language | **Yes** |
| “Recommendation” language | **Soft only** |

### Allowed words or phrases

- “Here’s what looks most important now.”
- “This step is scheduled.”
- “This still looks unfinished.”
- “Beynd is using what you entered.”
- “Marked complete this month” (metric label)
- “Committed this month” (invest display only when payment truth exists; avoid on every surface)

### Forbidden words or phrases

- Wording that treats scheduled as completed
- Wording that treats optional investment as obligation
- Wording that allocates every pound
- Wording that creates guilt (“you failed”, “you are short”)
- “You must finish”

### Good copy examples

- “Scheduled this month: £96” + “Next step: Mark complete when money moves.”
- “In progress” status badge on Plan row

### Bad copy examples

- Showing recalculated invest suggestion as headline after user scheduled £96
- “Schedule the remainder this month” (invest)

---

## 6. Adaptive plan state

**Meaning:** Reality shift, committed reduction plan (`planCommitted`), payments, or progress have changed how the month looks relative to the original view.

### What Beynd truly knows

- Overlay adjustments (Reality alignment, applied reductions)
- Payment and progress truth for the month
- Engine may still recalculate suggestions

### What Beynd does not know yet

- Whether user accepts the new framing
- That the user “failed” relative to an earlier view

### Allowed tone

Neutral shift. Preserve agency. No blame.

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **Yes, with shift framing** |
| “Review” language | **Yes** |
| “Recommendation” language | **Avoid** |

### Allowed words or phrases

- “Your month has shifted a little.”
- “Beynd is adjusting the guidance around what you entered.”
- “This is different from your original view.”
- “Following your Reality shift” (Plan banner when alignment active)
- “Was £X · from Reality” (reduce display)

### Forbidden words or phrases

- “Your plan changed because you failed”
- “You are off track”
- “Beynd corrected your plan”
- Language that removes user agency
- “Beynd fixed your mistakes”

### Good copy examples

- “Spend matches your plan.” (when `planCommitted` and reductions applied, user chose commit)
- “Bring spend back to plan.” (when above committed pace)

### Bad copy examples

- “You broke your plan.”
- Long explanatory paragraphs inside Impact Snapshot

---

## 7. Reflection / Stability Room state

**Meaning:** Beynd helps the user understand the month, protect room, or make sense of decisions (Reflection surface, Stability Room experience model, optional entry from Reality).

### What Beynd truly knows

- Orchestration snapshot, month context, posture, held-back signals (shadow/read models)
- Display copy blocks from experience model (bounded, no raw JSON)

### What Beynd does not know yet

- What the user should do next (Reflection is understanding-first)
- Clinical or diagnostic truth about the user

### Allowed tone

Calm, spacious, non-judgemental. Understanding over fixing.

### Language permissions

| Category | Allowed? |
|----------|----------|
| “Plan” language | **Soft** (“this month”, “what matters”) |
| “Review” language | **Yes** (“pause and review”) |
| “Recommendation” language | **No** |

### Allowed words or phrases

- “This may be a month to protect space.”
- “You have done enough to pause and review.”
- “This is about understanding, not fixing everything.”
- “What matters this month” (experience block title)

### Forbidden words or phrases

- Judgement (“you handled this badly”)
- Diagnosis (“you are bad with money”)
- Over-explaining (long paragraphs)
- Generic motivational copy (“you’ve got this!”)
- Pressure to act immediately

### Good copy examples

- Short experience blocks (max 3) from `geodeStabilityRoomExperienceModel`
- Ask Beynd from Reflection with bounded context, no auto-send

### Bad copy examples

- Dumping plan rationale JSON into Reflection
- Auto-opening Stability Room without user action

---

## Quick reference: language permissions by state

| State | Plan | Review | Recommend |
|-------|------|--------|-----------|
| Blank | No | No | No |
| Setup | Limited | Soft | No |
| Baseline | Conditional | Yes | No |
| Preview / draft | Qualified | Yes | Soft |
| Active | Yes | Yes | Soft |
| Adaptive | Yes (shift) | Yes | Avoid |
| Reflection | Soft | Yes | No |

---

## Surfaces to gate in F.1 build (from audit)

Priority copy branches should use readiness state before changing strings:

1. `geodeHomeAnticipatoryMaybeHtml` / `geodeHomeAnticipatoryLine`
2. `rPlan` header and subtitle
3. Quick Setup completion card and toast
4. `geodeGetMainAction` fallback titles (display strings only)
5. Reality compare note (“Based on your plan for this month”)

Do not change engine functions listed in [handover.md](./handover.md).

---

## Related docs

- [Handover](./handover.md): F.1 sequence and protected functions
- [Plan backlog](./plan-backlog.md): F.1 onboarding-state task
- [Plan stabilisation completed](./plan-stabilisation-completed.md): display vs engine separation

---

## Changelog

| Date | Stage | Note |
|------|-------|------|
| June 2026 | F.1-PRE | Initial allowed-language contract |
