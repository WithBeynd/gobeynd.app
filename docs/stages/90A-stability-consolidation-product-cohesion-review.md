# Stage 90A — Stability Consolidation & Product Cohesion Review

**Type:** Read-only holistic product cohesion audit (no runtime changes)  
**Verdict:** **NEEDS ATTENTION** (architecture coherent; visible experience still busy on Home / legacy nudge paths)  
**Date:** June 2026  
**Parents:** [80R-H Governance Freeze](../80R/80R-H-cross-system-governance-freeze.md) · [80R-I QA Harness](../80R/80R-I-constitutional-qa-harness.md) · [80R-G Copy Freeze](../80R/80R-G-release-continuity-qa-copy-freeze.md) · [Plan handover](../../handover.md)

---

## Before any recommendation

### 1. Why Beynd has entered stability-consolidation phase

The **80R series** closed the reserve ledger, silence hierarchy, constitutional registry, and QA harness. **Plan stabilisation (post-81F)** closed engine/display separation. Further capability adds **cross-system semantic risk** without improving trust.

The product is in **consolidation**: make the visible experience match the philosophy already encoded in governance — not add intelligence.

### 2. Why governance maturity is ahead of visible UX cohesion

| Layer | Maturity |
|-------|----------|
| **Governance** | 80R-F/G/H/I, 80N-M continuity law, anti-drift, phrase freezes, G1–G4 gates |
| **Engine** | Deterministic Plan, affordability isolation, event-derived reserves |
| **Experiential** | Mixed — Reality/Reflection/release calm; Home still stacks orientation + nudges + alerts |

Users experience **HTML render order and copy**, not constitutional docs. Governance says silence-first; Home still renders many optional strips when bands allow.

### 3. Which systems are architecturally mature

- **Plan engine** — `getMonthPlan`, affordability spine, action-state display layer (post-81F)  
- **Reserve accounting** — event-derived recompute, classification, apply isolation  
- **Release continuity** — factual copy, Settings archival history, no emotional narration  
- **Reality capture** — user-authored context, manual sense-check, no ledger inference  
- **Reflection** — opt-in, gated, ExperienceModel blocks, suppression-first  
- **Tier-C / noticed.*** — shadow + parity + collision metadata (not over-promoted to live)  
- **Orchestration producers** — `geodeHomeOrchestrationResolve`, deferred queue, surface gating (79B+)  

### 4. Why experiential coherence matters more than new capability

Trust erodes when the app **feels** like it is analysing the user while docs claim observational calm. A single new “helpful” Home strip undermines 80R-F silence law more than a new Plan helper would improve truth.

**Cohesion IS the product** at this stage: pacing, hierarchy, visual rest, tone consistency.

### 5. What this stage explicitly must NOT become

- Feature roadmap or intelligence expansion  
- Reflection / Tier-C / release enhancements  
- Home orchestration **additions** (only suppression/simplification recommendations)  
- Redesign project or behavioural analytics  
- Growth-hacking, engagement loops, gamification  

---

## Task 1 — Emotional pacing audit

### Where the product feels calm

| Surface | Evidence |
|---------|----------|
| **Reality** | Manual compare copy; “won’t change anything unless you choose”; collapsed month-context card; optional Reflection entry |
| **Reflection** | Opt-in entry; max blocks; soft register classes; exit to Reality |
| **Release** | User-initiated modal; truth lines; toast factual; history hidden when empty |
| **Settings / reserve history** | Archival tone; low emphasis; no prompts |
| **Plan (non-overbudget)** | Step rows with explain lines; deterministic pacing note when present |
| **Empty states** | Income-first Home; no auto-modals |

### Where it still feels busy

| Surface | Evidence |
|---------|----------|
| **Home (populated user)** | Vertical stack: hero → anticipatory → since-last-visit → post-QS cards → stability/irregular banners → overbudget → needs attention → goal completion → main action → subscription → **coaching strip (Insights/Human Moment)** → deferred meta → Ask Beynd → shortcuts → focus goal |
| **Home transients** | `geodeArmHumanMomentTransient`, `geodeArmHomeAnticipatoryTransient`; completion toasts on new day |
| **Coaching strip** | `renderInsights()` → `combineHighlightsNudges` — behaviour/intent/context ranked nudges |
| **Quick Setup completion** | Motivational overbudget card (“You've done the hard part — you now know the number”) |
| **Money sub-surfaces** | Goals list density (buttons per card); multiple tabs under Money |
| **Month rollover** | Toast on every month change in `render()` |

### Systems competing for emotional attention (same visit)

1. Overbudget card + Main Action (both pressure-register)  
2. Coaching strip Insights + Main Action insight kind  
3. Anticipatory strip + Human Moment + Insights (orchestration reduces but legacy fallback exists)  
4. Post-QS Reality prompt + Plan readiness messaging  
5. Subscription “Worth a quick look” + Needs Attention overdue  

**Orchestration gating (79B-B/E)** mitigates but **does not eliminate** stacking when `homeBand` is `open` or `focused`.

---

## Task 2 — Surface hierarchy audit

### Intended hierarchy (constitutional)

| Rank | Surface | Meaning lives here |
|------|---------|-------------------|
| 1 | **Plan** | What the month suggests (deterministic truth) |
| 2 | **Home** | One orientation step + visibility arbitration |
| 3 | **Money** | Data entry and instruments |
| 4 | **Reality** | User-authored month meaning + optional sense-check |
| 5 | **Reflection** | Opt-in quieter read |
| 6 | **Settings** | Device data, archival history |

### Observed hierarchy (experiential)

| Issue | Detail |
|-------|--------|
| **Home feels co-equal with Plan** | Net worth hero + multiple cards rival Plan as “meaning centre” |
| **Insights strip elevates interpretation** | “Insight” label + sparkles icon — competes with Main Action |
| **Ask Beynd always visible** | Correct for product, but adds AI affordance on already dense Home |
| **Reality/Reflection buried** | Money sub-routes — good for calm, weak for **discoverability of continuity** (acceptable trade) |
| **Reserve history** | Settings → Data — correctly archival; users may not know it exists (silence-by-design) |

**Clarity gap:** Users may not understand that **Plan = truth**, **Reality = their words**, **Reflection = optional read** — because Home still presents **multiple interpretive strips**.

---

## Task 3 — Visual calmness audit

### Strengths

- Design tokens: `--motion-calm`, `--vi-register-*`, soft borders, dark/off-white palettes  
- Reflection/Reality pages: consistent `reality-page` layout, staggered soft enter  
- Pressure/recovery registers visually distinct but not neon  
- Empty history = empty section (visual silence)  
- Modal release preview: muted preview host, truth line footer  

### Weaknesses

- **Home card count** in default band — low visual breathing room between blocks  
- **Uppercase kickers** (“OVER BUDGET”, “WORTH A QUICK LOOK”) — fintech urgency register  
- **Hero net worth** large typographic dominance — tracker-like anchor  
- **Insight strip** card chrome + icon header — productiveness cue  
- **Goal focus card** on Home duplicates Money/Goals information  

### Silence visually exists?

**Partially.** Reflection empty state, hidden history, orchestration-off coaching strip = yes.  
**Home under load** = silence is **policy-governed** but **not always visually obvious** — many cards still render.

**Calmer than typical fintech?** **Reality/Reflection/release: yes.** **Home populated: often no** — closer to proactive personal finance dashboard.

---

## Task 4 — Continuity-feel audit

### Currently feels (strong)

- **Adaptive** — Plan adjusts to income type, memory softening (disclosed), buffer readiness  
- **Stable** — deterministic numbers; release doesn’t rewrite Monthly Left  
- **Observational** — Reality compare; Reflection blocks; release truth lines  
- **Non-judgemental** — release copy; Reality “won’t change unless you choose”  
- **Continuity-oriented** — month context carry; archival release history  

### Still feels (inherited budgeting-app DNA)

- **Task-heavy** — Main Action + shortcuts + goal CTAs + payment reminders  
- **Productivity-driven** — Insights, follow-through nudges, completion toasts, streak/recovery hooks in code paths  
- **Optimisation-oriented** — “See what to reduce”, spending breakdown hints on overbudget Plan  
- **Mechanically financial** — net worth hero, subscription renewal math on card  

**Gap:** Architecture says *“the month evolves; the user does not fail”* — Quick Setup overbudget copy partially contradicts (*“That's exactly what Beynd is here to fix”* — repair framing).

---

## Task 5 — Cross-system harmony audit

| Pair | Harmony | Friction |
|------|---------|----------|
| **Plan ↔ Release** | Strong — truth lines, planTruthLine, buffer gap math | Overbudget “back in balance” adjacent to release CTA (contextually OK) |
| **Plan ↔ Reality** | Strong — manual compare, shift preview optional | — |
| **Reality ↔ Reflection** | Strong — entry gate, shared visual language | — |
| **Home ↔ Plan** | Moderate — both surface pressure | Duplicate overbudget signalling |
| **Home ↔ Governance silence** | **Weak** — Insights/HM still active paths | Legacy `geodeHomeCoachingStripLegacyHtml` fallback |
| **Release ↔ Rest of app** | Strong — silent outside Settings/modal | — |
| **Atmosphere (hero) ↔ Tier-C** | Aligned in code; not user-visible as one system | — |

**Silence hierarchy experientially noticeable?** **Only when strips are off.** When orchestration allows coaching + anticipatory + overbudget, user **feels managed**, not silent.

---

## Task 6 — “Too much system” audit

| Area | Over-visible intelligence | User may feel |
|------|---------------------------|---------------|
| **Home Insights** | `combineHighlightsNudges`, behaviour habits, intent signals | “App is watching my saves” |
| **Orchestration meta line** | “Keeping Home focused…” | Aware of internal band logic |
| **Irregular income banner** | “Buffer-first mode” | System mode exposed |
| **Stability mode card** | No-income path | Named mode |
| **Human Moment / Anticipatory** | Transient strips | Layered coaching |
| **Ask Beynd** | Always on Home | AI layer present |
| **Governance** | Invisible (good) | — |
| **Reserve T0–T4** | Not shown to user (good) | — |

**Risk:** Beynd feels **architecturally sophisticated** to builders and **dashboard-busy** to users on Home — while Reality/Reflection feel like a different product tone.

**Target feel:** *human and calm* — Reality/Reflection/release meet this; Home is the main outlier.

---

## Task 7 — Stability consolidation recommendations

**Scope: cohesion only — no new intelligence, no orchestration expansion.**

### Recommended (safe, silence-preserving)

| ID | Recommendation | Type | Escalation |
|----|----------------|------|------------|
| **90A-R1** | **Home strip budget** — when overbudget card OR main action pressure register shows, suppress coaching strip Insights path unless explicit HM (extend orch dedup; display-only) | Pacing / suppression | G3 |
| **90A-R2** | **Reduce Home vertical stack** — defer subscription card when overbudget visible (partially exists; tighten fallback paths) | Hierarchy | G3 |
| **90A-R3** | **Copy tighten Quick Setup overbudget** — replace repair/fix framing with observational Plan orientation (align 80R-G) | Copy | G2 |
| **90A-R4** | **Focus goal on Home** — default compact strip only; full card behind expand (reduce duplicate Goals UI) | Visual calm | G1 |
| **90A-R5** | **Month rollover toast** — consider quieter inline meta or dismissible once-per-month (reduce interruption) | Pacing | G2 |
| **90A-R6** | **Insight label softening** — “Insight” → neutral “Note” or remove sparkles header when strip survives (copy/visual G2) | Tone | G2 |
| **90A-R7** | **Document Home as orientation-only** in handover — engineer-facing hierarchy reminder | Docs | G1 |
| **90A-R8** | **Run 80R-I SILENCE-REG** after any Home cohesion pass | QA | Required |

### Not recommended

- More personalization, behavioural interpretation, predictive nudges  
- Reflection/release acknowledgement on Home  
- New orchestration disclosure surfaces  
- Engagement loops, streaks UI expansion  
- Gamification or optimization pressure copy  

### Critical cohesion fix required?

**No FAIL-level runtime bug identified.** Cohesion gaps are **pacing and hierarchy**, not mathematical or governance violations. **No emergency runtime edit** warranted in 90A.

---

## Task 8 — Final cohesion review

### A. Verdict: **NEEDS ATTENTION**

Architecture and governance are **PASS-grade**. Experiential cohesion **lags on Home density and legacy Highlights/coaching path** — the product does not yet feel uniformly as calm as the constitution.

### B. Strongest areas of product cohesion

- Event-derived reserve + factual release surfaces  
- Reality manual compare + user-authored month context  
- Reflection opt-in governance and visual language  
- Plan engine truth + display-layer separation (post-81F)  
- Settings archival reserve history (silence when empty)  
- Constitutional / QA documentation stack (80R-H/I)  

### C. Highest remaining experiential inconsistencies

1. **Home vertical stacking** — many simultaneous cards/strips  
2. **Coaching strip / Highlights** — budgeting-app nudge DNA vs silence hierarchy  
3. **Dual pressure signalling** — overbudget card + main action + Plan  
4. **Net worth hero prominence** — tracker anchor vs orientation  
5. **Tone shift** — Reality calm vs Home “Insight” / “Worth a quick look”  
6. **Quick Setup motivational repair copy** — mild philosophy drift  

### D. Areas that feel most “Beynd”

- Reality page compare + month context footer  
- Reflection surface (when entered intentionally)  
- Release modal truth lines + Settings history  
- Plan overbudget block with explicit Monthly Left honesty (in modal preview)  
- Empty-state income-first Home (before stack accumulates)  

### E. Areas still inheriting budgeting-app DNA

- Home Insights / `combineHighlightsNudges`  
- Net worth hero + breakdown  
- Subscription renewal cards with monthly/yearly math  
- Completion toasts / streak-adjacent recovery code paths  
- Goals focus card duplication  
- “Insight” branding with sparkles  
- Spending breakdown “close the gap” hints on Plan overbudget  

### F. Safest next phase after consolidation

**90B — Home Pacing & Orientation Consolidation (display-only)**

- Implement 90A-R1–R4 under G1–G3 gates  
- Full 80R-I SILENCE-REG + narrator collision check  
- No new intelligence; orchestration **suppression only**  
- No Plan engine, release accounting, or Reflection composition changes  

Alternative parallel track (lower UX impact): **90C — Copy & tone alignment pass** (G2 only) for Quick Setup, Insight labels, subscription kicker softening.

**Do not proceed to:** new AI layers, Reflection expansion, release features, behavioural memory rollout, or 81F-style multi-surface rebuilds.

---

## Protected (unchanged)

All runtime and schemas listed in stage brief. Governance contracts remain authoritative.

---

## Files touched

| File | Change |
|------|--------|
| `docs/stages/90A-stability-consolidation-product-cohesion-review.md` | This review |

## Files intentionally not touched

- `index.html` (inspection only)  
- All governance and runtime surfaces  

---

## Service worker

**No bump.**

---

## Core philosophy (binding)

> The product experience must remain calmer than the intelligence behind it.  
> Beynd should feel human and calm — not architecturally sophisticated.  
> Intelligence should disappear into the experience.

Governance maturity must now be matched by **experiential restraint** — starting with Home pacing, not new capability.
