# Handover — Stage 76–77 Ask Beynd Evolution

**Date:** May 2026  
**Status:** Stage 76 committed; Stage 77 built locally, **not committed** (hold until **user explicitly approves** commit). **77D-B:** **PASS** (console QA in [77D-B.2](../stages/77/77D-B.2-manual-qa-evidence.md)).  
**Primary reference:** Read this before any future Ask Beynd context, export, or guardrail work.

**Related docs:**

| Area | Path |
|------|------|
| Stage 76 series | [`docs/stages/76/README.md`](../stages/76/README.md) |
| Stage 77 series | [`docs/stages/77/README.md`](../stages/77/README.md) |
| Stage 76 handover (detail) | [`docs/handover-stage-76-ask-beynd-reasoning.md`](../handover-stage-76-ask-beynd-reasoning.md) |
| Architecture notes | [`docs/architecture-notes.md`](../architecture-notes.md) |
| Documentation policy | [`docs/stage-documentation-policy.md`](../stage-documentation-policy.md) |

---

## 1. Executive Summary

Stages **76** and **77** transformed Ask Beynd from a **partially grounded** financial assistant into an **interpreter of Beynd’s existing reasoning**. Ask Beynd does not run a second plan engine. It receives bounded text exports assembled from the same logic that powers Plan, Reality, affordability, and Home pressure surfaces.

### Before (pre–Stage 76)

| Gap | Effect |
|-----|--------|
| Limited plan awareness | Context was `P1: label (£X)` only — no `why`, affordability, or progress |
| Weak Reality awareness | Balance gap in prose; no Month Shift dual amounts in context |
| Weak spending awareness | Monthly expense total only; no over-budget amount, payment outflow, or categories |
| High skip-question risk | No guardrails; models invented payoff timelines and skip outcomes |

**Capability score (77A baseline):** ~**6.5 / 10**

### After (Stage 76 + uncommitted Stage 77)

| Addition | Effect |
|----------|--------|
| Plan rationale export | Bounded **PLAN RATIONALE** block from `geodePlanRationaleSnapshot` |
| Reality alignment (Rule C) | Usual plan amount + Reality-adjusted amount when Month Shift active |
| Skip / what-if guardrails | Always-on **SKIP / WHAT-IF LIMITS** in rationale assistant rules |
| Spending pressure awareness | **SPENDING / OVER-BUDGET CONTEXT** when `calcMonthlyLeftover(S) < 0` |
| Stronger behavioural grounding | Posture, PAO, month context, orchestration unchanged but richer plan/spend context |

**Current capability score (77D-A):** **7.5 / 10**

### Core principle (carry everywhere)

> **Ask Beynd translates Beynd’s intelligence. It must not invent new financial reasoning.**

---

## 2. What Was Built

### Stage 76 — Plan rationale & Reality alignment export

| Item | Purpose | Files | User value |
|------|---------|-------|------------|
| **`geodePlanRationaleSnapshot(state, opts)`** | Read-only plan reasoning read-model from `getMonthPlan()` + progress + affordability + alignment peek | `index.html` | Engine truth available for export (shadow hook: `window._geodePlanRationaleSnapshot`) |
| **`geodePlanRationaleAlignmentBlock()`** | Approved Month Shift overlay via `geodePeekActiveRealityPlanAlignment` only | `index.html` | Parity with Plan UI when alignment active |
| **Rule C in formatter** | Dual amounts when `alignment.active` | `geodeFormatPlanRationaleContextBlock` | “Why is this amount lower?” without baseline-only answers |
| **Ask Beynd integration (76D-B)** | Snapshot → formatter → `geodeBuildCoachingContext()` | `index.html` | “Why is Beynd suggesting this step?” grounded in plan `Why` lines |
| **Documentation policy** | No stage complete without `/docs` | `docs/stage-documentation-policy.md`, `docs/README.md`, stage 76 docs | Continuity for audits and handoffs |

**Stage 76 commits (representative):**

| SHA | Message |
|-----|---------|
| `cdc77e2` | `feat(ask): add shadow plan rationale snapshot` |
| `c4c9552` | `feat(ask): export Reality alignment in plan rationale snapshot` |
| `b1de9dd` | `feat(ask): add plan rationale block to Ask Beynd context` |

---

### Stage 77 — Capability guardrails & spending context (uncommitted)

| Item | Purpose | Files | User value |
|------|---------|-------|------------|
| **77A capability assessment** | Baseline 6.5/10; ranked risks | `docs/stages/77/77A-*.md` | Prioritised 77B / 77C |
| **SKIP / WHAT-IF LIMITS (77B-B)** | Always-on assistant rules in PLAN RATIONALE | `geodeFormatPlanRationaleContextBlock` | Reduces invented skip outcomes; explains direction only |
| **`geodeAskBeyndFlexibleSpendingCategories`** | Shared flexible category totals (protected excluded) | `index.html` | Same rules as Plan over-budget breakdown |
| **`geodeFormatAskBeyndSpendingPressureContextBlock`** | Over-budget block when `left < 0` | `index.html` | “Why am I over budget?” / “where is money going?” |
| **Plan HTML refactor** | `geodeOverBudgetPlanBlockHtml` uses shared helper | `index.html` | Parity; no new over-budget math |
| **Documentation expansion** | Audits, builds, README, architecture notes | `docs/stages/77/*` | Commit gate and audit trail |

**Stage 77:** No git commit yet. Hold per repository instruction until **77D-B final post-audit PASS**.

---

## 3. Architectural Pattern

The established pipeline for Ask Beynd reasoning:

```
Existing Beynd intelligence (getMonthPlan, affordability, Reality, progress, month context)
        ↓
Snapshot / export (read-only read-model, e.g. geodePlanRationaleSnapshot)
        ↓
Formatter (bounded plain text, e.g. geodeFormatPlanRationaleContextBlock)
        ↓
Ask Beynd context (geodeBuildCoachingContext)
        ↓
Ask Beynd explanation (worker or BYOK; user sees chat only)
```

### Rules of the pattern

| Do | Do not |
|----|--------|
| Export fields the engine already computes | Teach the LLM new allocation rules |
| Cap size (char limits, max steps, max categories) | Inject full JSON snapshots |
| Use try/catch; fallback to thinner context | Change plan math to “help” Ask Beynd |
| Add assistant **rules** (guardrails) | Add skip/afford **simulators** in the LLM path |
| One `getMonthPlan()` per context build when possible | Scatter uncached plan calls without documentation |

**We do not teach AI new financial logic. We expose existing Beynd logic safely.**

### Key functions (`index.html`)

| Function | Role |
|----------|------|
| `geodePlanRationaleSnapshot` | Plan + alignment + affordability export |
| `geodeFormatPlanRationaleContextBlock` | PLAN RATIONALE + Rule C + SKIP limits |
| `geodeAskBeyndFlexibleSpendingCategories` | Flexible category aggregation |
| `geodeFormatAskBeyndSpendingPressureContextBlock` | Over-budget context |
| `geodeBuildCoachingContext` | Single assembly point for Ask Beynd |
| `geodeAskBeynd` | UI unchanged; passes `context` string only |

**Worker limit:** `MAX_CONTEXT_CHARS = 12000` in `worker/src/index.js`. Typical combined context remains under limit; monitor heavy debt/goal lists.

---

## 4. Important Rules

### Rule C — Reality alignment amounts

When `snap.alignment.active` (approved Month Shift for current month):

- State **usual plan amount** and **Reality-adjusted amount** (or paused) for adjusted steps.
- **Never** describe only the usual plan amount for an adjusted step.
- Reality-adjusted view is **this month only** — not a skip simulation.

Baseline amounts remain in `steps[].amount`; display amounts are in `alignment.stepAdjustments`.

### Skip guardrail

- Explain **why** the step exists (Why line, debts/goals context).
- Describe **direction only** (e.g. slower progress, interest continues on balances).
- **Do not** simulate skip, delay, reduce, or pause outcomes.
- **Do not** invent payoff dates, interest saved/lost, penalties, or target-date shifts.
- **Do not** reverse or extrapolate `debtProjectionNote` (not exported to Ask Beynd by design).

### Protected spending rule

- Month context **“keep in mind”** and protected expense rows are **not bad spending**.
- Flexible category breakdown **excludes** protected items (same as Plan over-budget view).
- Suggest reviewing **flexible** categories first — not protected priorities.

### No-shame principle

- Pressure ≠ failure; over-budget ≠ moral judgment.
- Assistant rules explicitly say: do not shame the user.
- Coaching tone from posture/PAO remains; exports add facts, not verdicts.

---

## 5. What Was Intentionally Deferred

| Capability | Why not built (Stage 76–77) |
|------------|----------------------------|
| Affordability checker / “can I afford £X?” engine | Requires **deterministic** math, not LLM inference; high hallucination risk |
| Question classifier / routing | Architecture creep; always-on guardrails preferred |
| Skip simulator | Would invent outcomes; contradicts translator principle |
| Debt payoff projection engine for Ask | `debtProjectionNote` inversion risk; export deferred |
| Subscription exports | Token/clutter; Home has cards, not in Ask path yet |
| Overdue item exports | PAO mentions overdue generically only |
| Investment absence (`noInvestNote`) | In snapshot headline but **not** in formatter yet |
| Steps 4+ in PLAN RATIONALE | Bounded to 3 steps by design (~2800 char cap) |
| Worker / `coaching.json` prompt rewrites | Context-first policy; avoid BYOK/worker drift until needed |
| Ask Beynd UI changes | Out of scope — context only |
| Plan/Reality/Home visible copy | Out of scope |

Reasons cluster into: **hallucination risk**, **non-deterministic**, **scope creep**, **architecture risk**.

---

## 6. Current Capability Assessment

### Strong (7.5/10 tier)

- Plan explanation (first 3 steps + strategy + Why)
- Focus / prioritisation (first incomplete, orchestration, posture)
- Reality alignment explanation (Rule C when active)
- Over-budget explanation when `left < 0` (income, payments, expenses, categories)
- Spending pressure / “where is money going” (flexible categories)
- Posture-aware coaching (no shame, stability-first)

### Medium

- Debt reasoning (balances, APR, step Why — not full payoff storytelling)
- Goal reasoning (progress % — not full pace math in Ask text)
- Skip questions (guardrails reduce harm; outcomes still not simulated)

### Weak

- Afford-new-amount (“can I afford £X?”)
- Why not investing (`noInvestNote` not in Ask context)
- Subscriptions (no export)
- Overdue specifics (no named items in context)

**Score: 7.5 / 10** — material improvement from 6.5; not “complete” Ask Beynd intelligence.

---

## 7. Known Risk Areas

| Risk | Severity | Mitigation |
|------|----------|------------|
| **A. LLM rule non-compliance** | Medium–High | Bounded rules in context; manual QA on skip/over-budget questions; do not rely on prompts alone |
| **B. Affordability questions** | High | Worker/BYOK already soften certainty; future deterministic mini-check (Stage 78+) |
| **C. Investment absence** | High | Do not invent “no invest step”; export `noInvestNote` in small follow-up |
| **D. Step 4+ gap** | Medium | Block states “showing N of M steps”; avoid inventing later steps |
| **E. Subscription gap** | Medium | Defer or bounded due-soon export |
| **F. Overdue-item gap** | Medium | PAO line only; optional capped export later |

**Operational mitigations:**

- Keep exports **read-only** and **bounded**.
- Never export merchant names or full payment schedules in Stage 76–77 pattern.
- Post-build audits (77B-C, 77C-C, 77D-B) before commit.
- Commit hold until 77D-B PASS.

---

## 8. Documentation Policy

Per [`docs/stage-documentation-policy.md`](../stage-documentation-policy.md):

A stage is not complete until documentation exists for:

| Artifact | Typical filename |
|----------|------------------|
| Audit (design) | `*-audit.md` |
| Build report | `*-build-*.md` |
| Post-build audit | `*-post-build-audit.md` |
| Stage README update | `docs/stages/NN/README.md` |
| Handover update | handover doc (this file for 76–77 arc) |

**Why:** New chats, auditors, and future agents must reconstruct **what**, **why**, and **what not** without re-reading `index.html` (33k+ lines).

**Stage 77 documentation:** Full audit trail on disk (77D-B.1). **Console manual QA PASS** (77D-B.2). Optional live Ask Beynd BYOK spot-checks recommended; commit requires **explicit user approval**.

---

## 9. Commit / Release State

| Stage | Git state | Notes |
|-------|-----------|-------|
| **Stage 76** | **Committed** | Through `b1de9dd` (plan rationale block in Ask Beynd context) |
| **Stage 77** | **NOT committed** | Local changes: 77B skip guardrails + 77C spending block + docs |

### Stage 77 commit hold

**Active until:** `77D-B` final post-audit **PASS**

**Do not commit or push** Stage 77 work before that approval (repository instruction).

### Intended bundled commit (after approval)

```
feat(ask): add skip guardrails and over-budget context for Ask Beynd
```

**Files expected in bundle:** `index.html`, `docs/stages/77/*`, `docs/README.md`, `docs/architecture-notes.md`, this handover.

**Not in bundle:** `beynd-verification-audit-report.csv` (untracked verification export).

### Release state

- No release bundle cut for Stage 77 yet.
- No user-facing UI changes in Stage 77 — context-only.
- Evaluate release messaging with product owner after commit.

---

## 10. Service Worker Policy

> **Do NOT bump `service-worker.js` `CACHE_VERSION` after every edit.**

### Policy

- Group cache bumps at **meaningful user-facing milestones**.
- Stage 76–77 work is **Ask Beynd context only** (off-device string sent to model).
- **No** Ask Beynd modal UI changes, **no** Plan/Home/Reality visible copy changes in Stage 77.

### Therefore (current)

- **No service-worker bump** for Stage 77 work in isolation.
- Stage 55C explicitly avoided SW bump; same discipline applies.

### When to evaluate cache bump

Only after **all** of:

1. Stage 77 **77D-B** final post-audit PASS  
2. Stage 77 **commit approved** and pushed (if applicable)  
3. **Release bundle** decided (what ships together to users)  

If the release is “Ask Beynd smarter answers” with no static asset changes, SW bump may still be **unnecessary**. If combined with other UI/asset changes, bump **once** at release cut.

**Protected file:** `service-worker.js` — treat changes as release-level, not per-stage default.

---

## 11. Future Roadmap (Stage 78+)

### High value (context export pattern)

| Item | Approach |
|------|----------|
| Investment absence | Export one line `noInvestNote` from plan into PLAN RATIONALE (no new math) |
| Overdue context | Capped names/amounts from `geodeOverdueItems` — read-only |
| Subscription context | Capped due-soon list — read-only |

### Later (deterministic engines)

| Item | Approach |
|------|----------|
| Affordability mini-check | Small deterministic helper; refusal if not computable |
| Contribution flexibility checker | Engine-backed; not LLM |

### Do not build as AI-led

| Item | Reason |
|------|--------|
| Skip simulator | Invented outcomes |
| Payoff simulator | Invented timelines |
| Projection guessing | Hallucination |

---

## 12. Next Recommended Actions

### Immediate

1. **User explicitly approves** Stage 77 bundled commit.  
2. Commit bundle (exclude `beynd-verification-audit-report.csv`).  
3. Evaluate **release bundle** and **service-worker bump** necessity (Section 10).

### After commit

- Stage 78: pick **one** export (recommend `noInvestNote` or overdue) — audit-first, same pattern.
- Monitor Ask Beynd answers in production/BYOK for rule adherence.
- Consider one-line worker prompt alignment **only if** context-only ship proves insufficient.

---

## 13. Lessons Learned

### What worked

- **Audit-first workflow** — 76A/77A/77B-A/77C-A before code.  
- **Documentation policy** — stages leave artifacts, not just diffs.  
- **Bounded exports** — char caps, max 3 steps, max 5 categories.  
- **Shared helpers** — `geodeAskBeyndFlexibleSpendingCategories` shared with Plan HTML.  
- **Conservative architecture** — translator, not inventor; no new plan math.  
- **Commit hold** — 77 stays uncommitted until holistic 77D-B sign-off.

### What did not work (or should not repeat)

- **Large speculative builds** without audit.  
- **Exposing AI without context** (pre-76 `P1: label` only).  
- **Mixing UI work and reasoning work** in one stage.  
- **Assuming AI can infer** missing finance data (categories, skip outcomes, afford £X).  
- **Exporting projection notes** without inversion guardrails (debtProjectionNote).  
- **Prompt-only fixes** while context remained thin.

---

## Quick reference — `geodeBuildCoachingContext()` order

1. Income, net worth, monthly spending total  
2. Balance / Reality sense-check  
3. Context posture  
4. Month pacing (PAO) — conditional  
5. Month context — conditional  
6. Home pacing (orchestration) — conditional  
7. **SPENDING / OVER-BUDGET** — only if `calcMonthlyLeftover(S) < 0`  
8. DEBTS, GOALS, INVESTMENTS  
9. **PLAN RATIONALE** (includes SKIP / WHAT-IF LIMITS + Rule C) — or legacy plan strip fallback  

---

*End of handover — Stage 76–77 Ask Beynd evolution.*
