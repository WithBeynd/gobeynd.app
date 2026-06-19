# Anti-Drift Governance

**Stage:** 80N-M  
**Type:** Ongoing audit and detection specification  
**Parent contract:** [`continuity-ownership-contract.md`](./continuity-ownership-contract.md)  
**Related:** [`continuity-law.md`](./continuity-law.md), [`memory-boundaries.md`](./memory-boundaries.md)

---

## Purpose

Provide **repeatable detection methods** for continuity ownership drift — when interpretation quietly becomes authority, when parallel narrators stack, or when Beynd begins to feel manipulative or surveillance-like.

This document is the audit playbook for all future 80N-x and interpretation stages.

---

## Core drift thesis

> **Interpretation must never quietly become authority.**

Drift is not always a bug — it is often **well-intentioned intelligence expansion**. Anti-drift governance exists to catch expansion before user trust erodes.

---

## How future audits should detect drift

### 1. Ownership audit (every interpretation stage)

| Check | Method |
|-------|--------|
| Signal has single canonical owner | Ownership matrix in continuity-ownership-contract |
| No new consumer of `noticed.*` without gate stage | Grep `noticed.` consumers outside parity/Tier-C |
| No Plan math reads new interpretive flags | Grep getMonthPlan inputs |
| Orchestration unchanged unless declared | Diff `geodeHomeOrchestrationResolve` only in orch stages |

### 2. Parity audit

```js
window._geodeNoticedParityCheck();
```

| Result | Verdict |
|--------|---------|
| `pass: true` | Continue |
| Any domain mismatch | FAIL — do not promote to live |

### 3. Suppression audit (Tier-C)

```js
var snap = geodeStabilityRoomSnapshot(S, { generatedAt: Date.now() });
var vm = geodeStabilityRoomVisualModel(snap);
var gate = geodeStabilityRoomEntryGate(snap, vm, { trigger: 'none' });
var exp = geodeStabilityRoomExperienceModel(snap, vm, gate, { maxBlocks: 3 });
exp && exp.audit.tierCGateVerdict;
```

| Expectation | Healthy system |
|-------------|----------------|
| PASS rate | Low in heldBack scenarios (suppression-first) |
| HARD_SUPPRESS dominance | When atmosphere recovering / background shows |
| PASS without collision review | **FAIL** — likely gate regression |

### 4. Collision metadata audit

Inspect `snapshot.stabilityMetadata.narratorCollisions`:

| Risk | Action |
|------|--------|
| HIGH on live domain | Must not ship live copy |
| MEDIUM on Tier-C path | SOFT_SUPPRESS expected |
| recommendSilence: true | Must suppress |

### 5. Memory boundary audit

| Grep / review | Fail condition |
|---------------|----------------|
| New `localStorage` interpretation keys | Surveillance drift |
| `often*` in HTML render paths | Profiling drift |
| `confidence` in user copy | Scoring drift |
| Feeling in `S` persistence | Personality drift |
| preserveBreathingRoom in getMonthPlan | Hidden control drift |

### 6. Copy language audit

Scan user-facing strings for forbidden semantic trends (see below).

Use [`allowed-language-by-readiness-state.md`](./allowed-language-by-readiness-state.md) as voice baseline.

---

## Warning signs (organisational)

| Sign | Meaning |
|------|---------|
| “Let’s surface noticed X to help users” | Tier 2 → live without gate |
| “Users want more personalised feedback” | Personalisation pressure |
| “We should remember how they felt” | Feeling persistence drift |
| “Beynd should anticipate hard weeks” | Predictive psychology |
| “One more block won’t hurt” | Calmness law erosion |
| “Confidence is low so soften silently” | Invisible control |

---

## Forbidden semantic trends

### Language patterns — DO NOT SHIP

| Pattern | Example | Why |
|---------|---------|-----|
| Usual-you | “You usually struggle mid-month” | Profiling |
| Diagnosis | “You seem stressed about money” | Therapy drift |
| Grade | “Your financial confidence is low” | Scoring |
| Failure | “You fell behind on your plan” | Punitive |
| Certainty | “Beynd knows this month will be tight” | False authority |
| Compliance praise | “Great job staying on track” | Productivity framing |
| Nudge escalation | “You keep skipping reflection” | Dependency loop |
| AI authority | “Beynd noticed you need to slow down” | Interpretation as command |
| Optimisation | “You could allocate £X more efficiently” | Efficiency over calm |
| Surveillance | “Based on your patterns over 90 days…” | Memory as judgment |

### Language patterns — ALLOWED

| Pattern | Example |
|---------|---------|
| Observational | “So far this month reads steady from here.” |
| User echo | “You want to protect [user words].” |
| Reversible | “This shifted view stays optional.” |
| Guide not command | “Smaller steps may fit better this month.” |
| Deferral explain | “Home kept a few things quiet on purpose.” |
| Orientation | “Your plan is still guiding what matters.” |

---

## Detection categories

### Parallel narrator detection

**Definition:** Two or more surfaces explain the same idea in the same session without collision suppression.

| Idea | Canonical owner | Parallel risk |
|------|-----------------|---------------|
| Gentle pace | Plan pacing note OR month_so_far | Plan + Reflection |
| Quiet Home | background block | background + Tier-C |
| Recovery | Plan “one clear step” | Plan note + noticed.recovery |
| User worry | what_matters | flexibility domain UI |
| Memory softening | Plan detail reason | Stability + Plan both explain |

**Detection:**
- List active narrators per user session scenario
- Map to collision metadata domains
- FAIL if two live narrators same idea without documented cross-surface suppress

**Metric — interpretation density:**
- Count user-facing interpretive strings per visit (Plan note + Reflection blocks + Home muted + Ask hint)
- **Threshold:** >4 interpretive strings same theme → NEEDS ATTENTION

---

### Emotional stacking

**Definition:** Multiple emotional frames in one compose (e.g. protective + recovering + diagnostic).

**Detection:**
- Reflection blocks >3 → impossible (hard cap)
- atmosphere + Tier-C + background all firing → gate failure
- Cautious tone + encouraging tone same block → copy review FAIL

---

### Hidden pacing penalties

**Definition:** Amount changes without explainability path tied to interpretive signal.

**Detection:**
- New multiplier in memory modifiers without reason code
- Feeling/posture directly in getMonthPlan without Tier 0 stage
- Orchestration affecting plan generation

**Protected path:** `geodeFinancialMemoryPlanModifiers` → reasonCodes → plan step memoryReasonCodes

---

### Silent orchestration mutation

**Definition:** Home visibility rules change plan behaviour or interpretive export without stage doc.

**Detection:**
- Diff orchestration in non-orchestration stages
- New deferral reason without disclosure path
- deferredItems without Reflection background eligibility

---

### Over-personalisation

**Definition:** System acts as if it knows user traits beyond current month + session.

**Detection:**
- Cross-month `often*` aggregation
- Streak surfacing
- Carry auto-applied as active context
- “Welcome back, you usually…” copy

---

### False certainty

**Definition:** Copy implies prediction or knowledge user did not provide.

**Detection:**
- Future tense without factual basis (payment dates OK)
- “Will be tight” / “likely to fail”
- Confidence levels paraphrased as fact

---

### AI therapist drift

**Definition:** Emotional processing, validation loops, or mental-health framing.

**Detection:**
- “How does that make you feel” patterns
- Coping strategy language
- Attachment / dependency CTAs
- Repeated reflection nudges

---

## Audit verdict matrix

| Finding | Verdict |
|---------|---------|
| New noticed consumer without gate | **FAIL** |
| pressure surfaced | **FAIL** |
| Tier-C append mode | **FAIL** |
| Personality persistence | **FAIL** |
| Parallel narrators un suppressed | **NEEDS ATTENTION** |
| Streak expansion | **NEEDS ATTENTION** |
| often* in UI without Tier D | **NEEDS ATTENTION** |
| Cross-surface pacing dup | **NEEDS ATTENTION** |
| Suppression-first Tier-C working | **PASS** |
| Parity pass | **PASS** |

---

## Required audit outputs (template)

Every interpretation stage report must include:

1. **Ownership delta** — what new signal ownership changed (should be none unless declared)
2. **Narrator map** — who speaks what per scenario
3. **Suppression evidence** — gate verdicts for 3+ scenarios
4. **Parity result** — pass/fail
5. **Memory delta** — new persistence keys (should be none)
6. **Copy scan** — forbidden pattern grep results
7. **Verdict** — PASS / NEEDS ATTENTION / FAIL

---

## Escalation

| Severity | Response |
|----------|----------|
| FAIL | Do not ship; revert or gate |
| NEEDS ATTENTION | Spec fix before live promotion |
| PASS | Document and monitor next stage |

---

## Relationship to stage series

| Stage type | Anti-drift requirement |
|------------|------------------------|
| 80N-x shadow | Parity + shadowOnly audit |
| 80N-x live Tier-C | Gate + suppression QA |
| 80N-x UI | Copy map + collision + density |
| Plan math | Not interpretation — out of scope unless memory boundary crossed |

---

## Most important principle

When audit is ambiguous:

**Reduce ambiguity by adding silence and ownership clarity — not by adding intelligence.**
