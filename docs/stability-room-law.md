# Stability Room Law

**Stage:** 80N-M  
**Type:** Future surface governance  
**Parent contract:** [`continuity-ownership-contract.md`](./continuity-ownership-contract.md)  
**Runtime reference:** [`stages/80/80N-J-minimal-live-tier-c-runtime.md`](./stages/80/80N-J-minimal-live-tier-c-runtime.md)

---

## Purpose

Define what **Stability Room may become** when routed as a distinct surface — without duplicating Reflection, becoming therapy, or elevating interpretation to authority.

**Current state (80N-M):** Stability Room UI is **deferred**. `geodeStabilityRoomSnapshot` sets `visualIntent.status: 'deferred'`. **Reflection is the live Tier-3 consumer** via `geodeReflectionSurfaceHtml` → experience model.

Stability Room Law applies to:
- Future dedicated route
- Any split from Reflection
- All Tier-C and `noticed.*` live promotion paths

---

## What Stability Room is

Stability Room is Beynd’s **opt-in explainability chamber** — a calm place to understand how the month fits together after Home has already done its job of orientation and deferral.

It answers (when asked):
- What you said matters
- What stayed quiet on Home and why (at high level)
- How the month reads so far (atmosphere, not analysis)
- What your plan is protecting (orientation, not optimisation)

It does **not** answer:
- What you should feel
- How reliable you are
- What will happen next month
- How to optimise harder

---

## Allowed capabilities

| Capability | Boundaries |
|------------|------------|
| **Calm explainability** | Copy-map phrases only; no raw reason codes |
| **Continuity interpretation** | Echo user words; carry as suggestion; no inferred narrative |
| **Pacing awareness** | Paraphrase gentle pace; defer to Plan pacing note if present (collision) |
| **Resilience understanding** | heldBack disclosure via background or gated Tier-C — not both |
| **Breathing-room explanation** | `planPath` only; exclusive with Plan detail footnote |
| **Adaptive month understanding** | “Month evolved” framing; reversible; non-punitive |

---

## Forbidden capabilities

| Forbidden | Why |
|-----------|-----|
| Therapy framing | AI therapist drift |
| Emotional diagnosis | Surveillance; false authority |
| Behavioural scoring | Grading user |
| Psychological authority | “You are anxious about money” |
| Persistent emotional modelling | Profiling infrastructure |
| Predictive coaching | “Next week will be hard” |
| Optimisation pressure | Efficiency over calm |
| Intervention systems | Hidden behavioural control |
| Pressure dimension UI | Permanent INTERNAL_ONLY |
| Multi-domain Tier-C stack | Parallel narrators |
| Append 4th+ block | Calmness law violation |

---

## Ideal cadence

| Rule | Specification |
|------|---------------|
| **Entry** | Opt-in only — never auto-open |
| **Frequency** | User-initiated; no push cadence |
| **Session** | Dismiss respected; no nag loop |
| **Cross-visit** | No “you haven’t reflected in X days” |
| **Tier-C** | Ephemeral per compose — no rotation memory |
| **Same session** | Entry gate may suggest once; not repeatedly |

---

## Ideal emotional posture

Stability Room speaks as a **calm witness**, not a coach or clinician.

| Posture | Copy shape |
|---------|------------|
| **Declarative** | “So far this month reads steady from here.” |
| **Non-judgmental** | No failure, no praise for compliance |
| **Optional** | “Not now” always available |
| **Reversible** | Shifts and context edits remain user-controlled |
| **Incomplete by design** | max 3 blocks; silence when nothing to say |

**Headline law:** Tier-C uses “A quieter read” — never “Beynd noticed” as authority headline.

---

## Silence conditions

Stability Room (and Reflection experience model) **must not compose** when:

| Condition | Source |
|-----------|--------|
| Empty state | `snapshot.emptyState` |
| Not onboarded | `snapshot.reason === 'not_onboarded'` |
| Quiet period | `quiet.shouldStayQuiet` |
| User load critical/high | orchestration |
| Entry gate hidden | user dismiss |
| Completion aftermath | gate flag |
| Parity fail | Tier-C HARD_SUPPRESS |
| No eligible blocks | experience model returns null |

**Default:** Silence. Composition is the exception.

---

## Replacement-not-append law

| Rule | Detail |
|------|--------|
| **Max blocks** | 3 |
| **Tier-C** | Replaces `month_so_far` only — never appends 4th |
| **Background vs Tier-C** | Background canonical → Tier-C HARD_SUPPRESS |
| **what_matters** | Never replaced by any Tier-C or noticed domain |
| **One quiet narrator** | background OR Tier-C resilience — not both |

Block priority order varies by atmosphere but **never exceeds maxBlocks**.

---

## Atmosphere supremacy law

Atmosphere is the **canonical emotional register** for Stability/Reflection compose.

| Atmosphere | Effect |
|------------|--------|
| `recovering` | Tier-C HARD_SUPPRESS (`atmosphere_owns_quiet`); background preferred |
| `reflective` | Tier-C HARD_SUPPRESS; month_so_far + background may stack (within max) |
| `protective` | plan_protecting may precede month_so_far |
| `calm` | Minimal blocks; pacing note on Plan may suffice (collision) |
| `room` | Encouraging but not spend pressure |

**Tier-C allowed atmospheres:** `calm`, `protective`, `room` only (when all other gates PASS).

---

## Relationship to Reflection (current)

Until route split:

| Concern | Owner |
|---------|-------|
| Experience compose | Reflection runtime (frozen — no 80N-M changes) |
| Snapshot assembly | Shared read-only pipeline |
| Tier-C insertion | Experience model post-blockMap |
| Entry gate | Reflection entry contract |

**Future split requirement:** Stability Room route must consume same snapshot + gate law; must not fork interpretation logic without parity stage.

---

## Relationship to other surfaces

| Surface | Stability Room must… |
|---------|---------------------|
| **Reality** | Never re-capture; only echo saved context |
| **Home** | Explain deferral, not re-orchestrate |
| **Plan** | Never duplicate amounts; may reference orientation |
| **Ask Beynd** | Pointer only — not duplicate chat |
| **noticed.*** | Read via gate — never authoritative |

---

## Domain promotion rules (noticed → live)

| Domain | Live promotion | Condition |
|--------|----------------|-----------|
| `resilience` | Tier-C only (v1) | Full gate stack PASS |
| `pacing` | **Not yet** | Requires collision law with Plan note |
| `recovery` | **Not yet** | HIGH collision with plan note |
| `continuity` | **Not yet** | Tier D + copy map + opt-in |
| `flexibility` | **Never live** | User words in what_matters only |
| `breathingRoomIntent` | Plan detail OR Stability — exclusive | planPath footnote stage |
| `pressure` | **Never** | INTERNAL_ONLY permanent |

---

## Copy governance

All live Stability copy must flow through:

1. `geodeNoticedCopyMap(domain, field, opts)` — approved phrases
2. `geodeNoticedTierCGate` — verdict
3. Collision metadata — narratorCollisions
4. [`allowed-language-by-readiness-state.md`](./allowed-language-by-readiness-state.md) — voice

**Forbidden:** Inline improvised copy in new consumers; raw `reasonCodes` in UI; dimension levels as labels.

---

## Future route checklist (before build)

- [ ] Shadow-read contract complete (80N-H parity)
- [ ] Collision law updated for any new domain
- [ ] Copy map entries for all live phrases
- [ ] Route split does not duplicate Reflection entry
- [ ] No orchestration mutation
- [ ] Anti-drift audit PASS
- [ ] Manual QA suppression dominance verified

---

## Amendment

Stability Room Law changes require governance stage with:
- Explicit allowed/forbidden delta
- Collision law update
- Anti-drift doc update
- No bundled runtime unless build stage declared
