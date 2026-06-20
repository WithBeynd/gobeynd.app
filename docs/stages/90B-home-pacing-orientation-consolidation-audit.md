# Stage 90B — Home Pacing & Orientation Consolidation (Read-Only Audit)

**Type:** Read-only cohesion audit — **no runtime changes in this stage**  
**Verdict:** **NEEDS ATTENTION** (clear suppressions and pacing rules identified; safe to implement in 90B-B)  
**Date:** June 2026  
**Parents:** [90A Cohesion Review](./90A-stability-consolidation-product-cohesion-review.md) · [80R-I QA Harness](../80R/80R-I-constitutional-qa-harness.md) · [80R-H Governance Freeze](../80R/80R-H-cross-system-governance-freeze.md)

---

## Before implementation

This document completes the **audit only**. No `index.html` edits until governance review of recommendations. Any build (90B-B) must be **display + pacing + suppression only**, G1–G3 escalation, and full **SILENCE-REG** from 80R-I.

---

## Task 1 — Home narrative stack map

**Render order in `rHome()` (populated, non-empty user):**

| # | Surface | Purpose | Emotional tone | Ownership layer | Urgency | Duplicated elsewhere? | Implied by another? | Silence better? |
|---|---------|---------|----------------|-----------------|---------|----------------------|---------------------|-----------------|
| 1 | **Hero + net worth** | Orientation anchor; wealth snapshot | Tracker-neutral / prominent | Tier 0 display | Low–med | Money overview | — | Partially (details in `<details>` OK) |
| 2 | **Tagline** | “Your next money move…” | Productivity | Tier 1 | Low | Plan CTA copy | — | Could soften |
| 3 | **Anticipatory strip** | Daily first-open guidance | Coaching / light urgency | Tier 1 interpretive | Med | Main action, Insights | Often | **Yes** when pressure cards show |
| 4 | **Since last visit** | Continuity on return | Observational | Tier 1 | Low | — | — | **Yes** under load (partially gated) |
| 5 | **Post-QS Reality prompt** | Optional sense-check invite | Calm, opt-in | Tier 2 bridge | Low | Reality entry | — | OK (session, dismissible) |
| 6 | **Quick Setup completion card** | Setup affirmation / overbudget recovery | Motivational / repair | Tier 1 | Med–high | Plan overbudget | — | Overbudget variant: **yes** |
| 7 | **Stability mode card** | No-income guidance | Protective | Tier 1 | Med | — | — | OK (conditional) |
| 8 | **Irregular income banner** | Mode disclosure | System-visible | Tier 1 policy | Low | Plan copy | — | Could collapse |
| 9 | **Overbudget card** | Cash-flow pressure truth | Urgent (pressure register) | Tier 0 truth display | **High** | Plan overbudget block | Main action (partial) | One instance enough |
| 10 | **Needs attention** | Overdue obligations | Urgent | Tier 0/action | **High** | Main action overdue path | — | Dedup exists |
| 11 | **Goal completion card** | Celebrate completed goal | Positive coaching | Tier 1 | Low | — | — | OK (already hidden if overbudget/overdue) |
| 12 | **Main action** | Primary next step | Action-oriented | Tier 1 orientation | **High** | Plan SA, Insights | Overbudget/overdue | **Canonical** primary |
| 13 | **Subscription renewal card** | Renewal awareness | “Worth a quick look” | Tier 1 admin | Med | Main action defer line | — | **Suppress** when pressure |
| 14 | **Coaching strip** | Insights or Human Moment | Interpretive / coach | Tier 1–2 | Med | Main action, Reality | Main action family | **Often yes** |
| 15 | **Deferred meta line** | Focused-band quiet note | System meta | Orchestration | Low | metaLine in resolve | — | Borderline |
| 16 | **Ask Beynd** | AI entry | Coach-adjacent | Product | Med | — | — | OK (emphasis quiet under load) |
| 17 | **Shortcuts** | My finances / My goals | Navigation | Tier 1 | Low | Tab bar | — | OK |
| 18 | **Focus goal** | Progress preview | Productivity / tracker | Tier 0 display | Med | Plan steps, Goals tab | Main action goal | **Compact default** |

**Empty state:** Hero + income-first CTA + plan setup + quick setup — appropriately calm.

---

## Task 2 — Pressure duplication audit

| Pressure signal | Surfaces that may co-express | Classification |
|-----------------|------------------------------|----------------|
| **Overbudget / tight month** | Overbudget card, Main action (pressure register), Insights (`tight_month` filtered only if persistent card visible), Anticipatory (`under_pressure`), Plan | **Canonical:** Main action OR overbudget card (one). **Redundant:** both + Insights. **Suppressible:** Insights when either visible; anticipatory when overbudget shown |
| **Overdue obligations** | Needs attention, Main action (overdue path), Insights (partial skip), Anticipatory (`overdue`) | **Canonical:** Needs attention OR main action overdue. **Existing:** orch hides overbudget if needs attention wins |
| **Spend recovery** | Main action pressure + overbudget | **Existing:** orch hides overbudget if `maIsSpendRecovery` | **Conditional** — good |
| **Subscription + pressure** | Sub card + overbudget + main action | **Suppressible:** sub card when `left < 0` or overbudget visible (orch only hides on `critical`, not `focused`/overbudget) |
| **Goal urgency** | Main action goal + Focus goal full card + Insights goal topic | **Existing:** compact focus when deduped; semantic-family gate on Insights | **Suppressible:** full focus card when `left < 0` or overbudget |
| **Recovery / streak** | Main action footers (recovery, identity streak), completion toast | **Suppressible:** already partially gated by `_suppressDecorFooters` | **Atmosphere-breaking** if stacked with pressure cards |
| **Quick Setup overbudget** | QS card + Plan + Home overbudget later | **Redundant:** repair narrative + persistent card | **Conditional** — session-only |

### Dedup matrix (existing vs gaps)

| Rule | Status |
|------|--------|
| Overbudget vs needs attention | ✅ Orchestration (`dedup_needs_attention_priority`) |
| Overbudget vs main spend recovery | ✅ Orchestration (`dedup_main_action_spend_recovery`) |
| Insights `tight_month` vs overbudget card | ✅ `geodeHomePersistentOverBudgetCardVisible` filter |
| Insights vs main action same family | ✅ `geodeInsightTopicMatchesMainKind` |
| Focus goal compact vs main action goal | ✅ When same goalId |
| Coaching strip vs critical band | ✅ Suppressed (`home_band_critical`) |
| Subscription vs critical band | ✅ Hidden |
| **Insights vs main action pressure (non-tight topics)** | ⚠️ **Gap** — e.g. debt insight while MA is overbudget path |
| **Anticipatory vs overbudget same visit** | ⚠️ **Gap** |
| **Subscription vs overbudget (non-critical band)** | ⚠️ **Gap** |
| **Full focus goal vs pressure month** | ⚠️ **Gap** |

---

## Task 3 — Emotional pacing audit

### Visual density spikes

- **Hero → anticipatory → pressure cards → main action → coaching → shortcuts → focus goal** = up to 8–10 blocks before tab exit  
- Uppercase kickers: OVER BUDGET, NEEDS ATTENTION, WORTH A QUICK LOOK, GOAL REACHED  
- **Insight** header with sparkles icon — strongest “system coach” signal  

### Stacked coaching / interpretation

| Stack | When |
|-------|------|
| Anticipatory + Human Moment/Insight | First open of day, `homeBand` open |
| Main action recovery/streak footer + Insight | Recovery state, non-critical band |
| Insight + Ask Beynd | Default open band |
| Deferred meta + Insight | Focused band without insight |

### Productivity / repair language (samples)

| Copy | Location | Issue |
|------|----------|-------|
| “Review where this month is under **pressure**” | Overbudget card | Acceptable truth; stacks emotionally |
| “That's exactly what Beynd is here to **fix**” | QS overbudget | Repair framing |
| “You've done the hard part” | QS overbudget | Motivational productivity |
| “**Insight**” + sparkles | Coaching strip | AI/coach visibility |
| “A consistent **pattern** is forming” | Main action streak footer | Profiling-adjacent |
| “Your plan has **adjusted**” | Since last visit | System agency |

### Where silence would improve trust

- After Main action owns the month (pressure register)  
- When overbudget card visible  
- When Needs attention visible  
- After anticipatory strip already fired  
- During `homeBand === 'focused'` (partially done for coaching)  

### Compact mode should win

- Focus goal (orchestration already defines `compact` — **render should default compact wider**)  
- Subscription card (muted line only under critical — extend to overbudget)  
- Hero breakdown (already `<details>` — good)  

### Progressive disclosure candidates

- Focus goal full card → expand on tap  
- Irregular income banner → settings link only  
- Insight strip → suppress entirely when main action + pressure card present  

---

## Task 4 — Orientation hierarchy audit

### Ideal Home hierarchy (target state)

| Tier | What belongs | Default visibility |
|------|--------------|-------------------|
| **Primary** | One orientation artifact: **Main action** OR single pressure truth (overbudget **xor** needs attention, already orch-gated) | Always one clear lead |
| **Secondary** | Net worth hero (ambient), one shortcut row | Always |
| **Conditional** | Subscription, goal completion, post-QS prompts | When band open and no pressure |
| **Ambient** | Since last visit, anticipatory (transient) | Rare, transient |
| **Deferred / hidden under pressure** | Insights, full focus goal, subscription card, streak/recovery footers, meta line | **Off** when `left < 0`, overdue, or main action pressure register |
| **Product entry** | Ask Beynd (quiet emphasis under load) | Persistent but visually subordinate |

### Home should orient, not narrate constantly

**Current gap:** Main action (orient) + Overbudget (narrate pressure) + Insight (narrate interpretation) + Focus goal (narrate progress) can coexist in `open` band.

**Target rule (90B-B):** At most **two** interpretive/coaching blocks visible: **Main action** + at most one of {overbudget card, needs attention, insight strip, anticipatory}.

---

## Task 5 — Insights / Highlights audit

### Current behaviour

- **`renderInsights()`** → `combineHighlightsNudges` → max **one** card  
- Header: **“Insight”** + sparkles  
- Sources: financial context, behaviour habits, intent signals, smart nudges v2  
- Suppressions already: empty state, no income, no expenses, critical soft band, tight_month when overbudget card visible, semantic family match to main action, goal repeat skip  

### “Insight” framing assessment

| Question | Finding |
|----------|---------|
| Too system-visible? | **Yes** — label and sparkles read as coach/productivity |
| Duplicates Reality/Reflection? | **Partially** — posture-filtered pool overlaps worry/flexibility themes; Reality is user-authored, Insight is system-ranked |
| Should suppress during overbudget? | **Yes — broaden:** suppress entire strip when persistent overbudget **or** main action pressure register (not only `tight_month` topic) |
| Should suppress during strong MA ownership? | **Yes — extend** semantic-family gate to “any pressure month” not only topic match |
| Recovering / streak footers | Main action footers separate from strip; strip already off in critical band |

### Avoid

- Expanding Highlights pool  
- Second insight card  
- “AI finance coach” copy in strip  
- Wiring `noticed.*` to Home  

### Recommended suppression rule **INS-SUP-01**

```
IF (overbudget_card_visible OR main_action_pressure_register OR needs_attention_visible)
  THEN coaching_strip_insight = suppressed
UNLESS human_moment explicitly wins AND no pressure card (existing HM lane)
```

---

## Task 6 — Focus Goal audit

| Aspect | Current | Recommendation |
|--------|---------|----------------|
| **Visibility** | If goals.length > 0, always show bottom section | Yield entirely when `left < 0` or overbudget (optional) |
| **Compact rule** | When main action insight kind = goal and same goalId | **Extend compact default** to all pressure months |
| **Full card** | Progress bar, days left, saved/target | **Progressive disclosure** — compact row default |
| **Duplication** | Mirrors Plan goal step + Goals tab | Acceptable as ambient if compact |
| **Orchestration** | `focusGoal.mode` compact/full in v2 snapshot | **Wire render to prefer resolve.surfaces.focusGoal.mode** (display-only; fallback to current dedup) |
| **Productivity feel** | Full card reads as savings tracker | Compact aligns with Beynd calm |

---

## Task 7 — Month rollover / transition audit

| Mechanism | Copy / behaviour | Assessment |
|-----------|------------------|------------|
| **`render()` month change toast** | “New month — your plan has rolled forward.” (4200ms) | **Aggressive restart** — fires on any tab render after month boundary |
| **Plan roll-forward** | Engine truth | Correct |
| **Completion toast** | `geodePickHomeCompletionMessage` on overdue cleared + new day | Celebratory — OK isolated |
| **Since last visit** | “plan has adjusted” / “still reflects last setup” | Mild system agency |
| **Anticipatory** | Daily strip | Evolving-month OK if transient |

### Recommendation **ROL-01**

Replace or gate month toast: show **once per month** (localStorage key), softer copy e.g. “This month’s plan is ready.” or inline hero meta — not interruptive toast on every render navigation.

---

## Task 8 — Quick Setup audit

| Element | Copy tone | Issue |
|---------|-----------|-------|
| Success card | “Beynd has a suggested sequence…” | OK |
| Overbudget QS | “over budget”, “here to **fix**”, “hardest part”, “See what to reduce” | **Repair + optimisation** |
| Post-QS Reality | “optional and manual” | ✅ Calm |
| Empty Home | “Start your plan with income” | ✅ Clear readiness |

### Recommendation **QS-01** (G2 copy)

- Remove “fix” / “hardest part” framing  
- Replace with observational orientation: “Your entries show spending above income this month. Plan can show where to adjust.”  
- Do not imply full plan intelligence before `geodePlanReadinessState` active  

---

## Task 9 — Final recommendations (implementation spec for 90B-B)

### Suppressions (priority order)

| ID | Change | Tier | Files |
|----|--------|------|-------|
| **90B-S1** | Suppress `renderInsights()` when overbudget visible OR main action pressure register OR needs attention visible | G3 | `renderInsights` / `geodeHomeCoachingStripHtml` guard |
| **90B-S2** | Suppress anticipatory strip when overbudget or needs attention will render same frame | G3 | `geodeHomeAnticipatoryMaybeHtml` |
| **90B-S3** | Hide subscription card when `calcMonthlyLeftover < 0` (not only critical band) | G3 | `rHome` subscription visibility |
| **90B-S4** | Default focus goal to **compact** when `left < 0` or overbudget; full card opt-in | G1 | `rHome` focus section |
| **90B-S5** | Wire focus goal render to `resolve.surfaces.focusGoal.mode` when orch present | G3 | `rHome` |
| **90B-S6** | Suppress since-last-visit when coaching strip would have shown (optional tighten) | G1 | existing guards |

### Wording shifts (G2 — no new intelligence)

| ID | Change |
|----|--------|
| **90B-C1** | “Insight” → “Note” or remove sparkles header |
| **90B-C2** | Quick Setup overbudget copy (QS-01) |
| **90B-C3** | Soften overbudget card last clause (“under pressure” → “this month” optional) |
| **90B-C4** | Month rollover toast (ROL-01) |

### Pacing rules (binding for 90B-B)

**PR-01:** Max one pressure card (overbudget xor needs attention) — already orch.  
**PR-02:** Max one coaching surface (anticipatory xor insight xor HM) per visit.  
**PR-03:** Main action always visible if present; never suppressed by Insights.  
**PR-04:** Under pressure month, no full focus goal card.  
**PR-05:** No new orchestration producers — **render guards only**.

### Progressive disclosure

- Focus goal full → `<details>` or tap-to-expand  
- Keep hero breakdown in `<details>`  

### NOT recommended

- New cards, Highlights topics, orchestration rewrites, HM expansion, streak UI, engagement loops  

---

## Task 10 — Governance check

| Check | Result |
|-------|--------|
| Hidden behavioural pressure added | ❌ Must not — suppressions reduce pressure |
| Emotional manipulation | ❌ QS copy fix removes motivational repair |
| Urgency escalation | ❌ Suppressions decrease urgency stacking |
| Silent orchestration drift | ✅ Render guards only; producers untouched |
| Narration stacking | ✅ INS-SUP-01 directly addresses |
| Tier-C leakage to Home | ✅ No Tier-C reads in rHome |
| Plan / affordability mutation | ✅ Display only |
| 80R-I SILENCE-REG | **Required** after 90B-B |

---

## Success criteria (post 90B-B)

Home should feel:

- **Calmer** — fewer simultaneous coaching blocks  
- **Lighter** — compact focus, fewer uppercase kickers competing  
- **More spacious** — pressure months show one truth + one action  
- **Emotionally coherent** with Reality/Reflection/release  
- **Less narratively crowded** — Insights yield to Main action  

While preserving:

- Plan truth, orchestration truth, orientation clarity, adaptive awareness (without extra narration)

---

## Final review summary

### A. Verdict: **NEEDS ATTENTION**

Audit complete. Cohesion gaps are **pacing and suppression**, not architectural failure. Safe to proceed to **90B-B** implementation with listed guards only.

### B. Strongest existing cohesion assets

- Orchestration dedup (overbudget vs needs attention vs spend recovery)  
- Critical band coaching suppression  
- Insight vs main action semantic-family gate  
- Goal completion hidden under pressure  
- Reality/Reflection/release calm (unchanged)  
- Transient anticipatory auto-dismiss  

### C. Highest experiential inconsistencies

1. Insight strip still viable alongside pressure surfaces (open band)  
2. Full focus goal card during tight months  
3. Subscription card during overbudget (non-critical)  
4. Anticipatory + pressure same session  
5. QS repair copy  
6. Month rollover toast  
7. “Insight” branding  

### D. Safest next phase

**90B-B — Home Pacing Build (display-only)** implementing 90B-S1–S5 and 90B-C1–C2 first; then C3–C4; run **SILENCE-REG SR-02, SR-03, SR-07**.

---

## Protected (unchanged in audit)

`getMonthPlan`, affordability, payment canonicalisation, debt sequencing, breathingRoomFloor, Tier-C, `noticed.*`, Reflection logic, orchestration **producers**, action-state truth, Reality persistence, SW, schemas, governance contracts.

---

## Files touched

| File | Change |
|------|--------|
| `docs/stages/90B-home-pacing-orientation-consolidation-audit.md` | This audit |

## Files intentionally not touched

- `index.html` (inspection only)

---

## Service worker

**No bump.**

---

## Core philosophy

> The experience should feel calmer than the systems behind it.  
> Home should orient — not narrate constantly.  
> Intelligence should disappear into the experience.
