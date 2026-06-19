# Continuity Law

**Stage:** 80N-M  
**Type:** Hard governance principles  
**Authority:** Binding on all future interpretation, memory, and Stability work  
**Parent contract:** [`continuity-ownership-contract.md`](./continuity-ownership-contract.md)

---

## Purpose

Continuity Law defines **non-negotiable principles** that protect Beynd from becoming a behavioural scoring engine, predictive psychology system, or invisible optimisation layer.

These laws apply to **all tiers** (0–3) and **all surfaces** (Plan, Reality, Home, Reflection, Stability Room, Ask Beynd).

Violation of Continuity Law is grounds for **FAIL** in stage audits regardless of UX polish.

---

## The twelve laws

### Law 1 — Silence outranks explanation

| | |
|---|---|
| **Rationale** | Explanation under load feels like surveillance. Home deferral is continuity. |
| **Examples** | heldBack → background block; quiet period → no Reflection entry; Tier-C HARD_SUPPRESS when `shouldStayQuiet` |
| **Protected behaviours** | Orchestration deferral, muted lines, max 3 Reflection blocks, empty pacing note when band open |
| **Forbidden** | “Beynd noticed…” stacking on Home; second interpretive block when atmosphere owns quiet; append-mode Tier-C |

---

### Law 2 — Atmosphere outranks analysis

| | |
|---|---|
| **Rationale** | Emotional register is sufficient; analysis feels clinical. |
| **Examples** | `atmosphere === recovering` → Tier-C suppressed; `month_so_far` selects tone from atmosphere not PAO dimensions |
| **Protected behaviours** | Visual model atmosphere derivation; atmosphere-led block ordering |
| **Forbidden** | Surfacing `pressure.dimensions` to user; raw reason codes in Reflection; scoring atmosphere |

---

### Law 3 — User words outrank inferred interpretation

| | |
|---|---|
| **Rationale** | Agency is continuity. Inference without consent is surveillance. |
| **Examples** | `what_matters_this_month` echoes protect/worried/success verbatim; flexibility domain collision HIGH when month context present |
| **Protected behaviours** | Reality capture; carry as suggestion not auto-fill of active context |
| **Forbidden** | Replacing user context with inferred summary; “Based on your patterns you want to protect…” |

---

### Law 4 — Continuity must remain reversible

| | |
|---|---|
| **Rationale** | Irreversible adaptation feels punitive. |
| **Examples** | Reality shift preview + revert; “easy to reverse” Plan banner on repeated reverts; optional shifted view |
| **Protected behaviours** | `reality_shift_reverted` events; shift cap not permanent lock |
| **Forbidden** | Auto-applying shift without preview; persisting “locked pace” flags; one-way memory penalties |

---

### Law 5 — Continuity must remain explainable

| | |
|---|---|
| **Rationale** | Softening without explanation becomes hidden control. |
| **Examples** | `memoryReasonCodes` on plan steps; alignment summary; future planPath breathing-room footnote |
| **Protected behaviours** | Plan detail transparency; Ask can explain held-back items |
| **Forbidden** | Silent multiplier changes; undiscoverable memory effects; “trust the algorithm” copy |

---

### Law 6 — Interpretation must remain observational

| | |
|---|---|
| **Rationale** | Observation describes; authority prescribes. |
| **Examples** | `noticed.*` audit.shadowOnly; Tier-C copy from approved phrases only; “So far this month reads steady” |
| **Protected behaviours** | Parity check; copy map metadata; INTERNAL_ONLY for pressure |
| **Forbidden** | Diagnostic labels (“you are stressed”); grades; confidence shown as user-facing score |

---

### Law 7 — Guidance outranks optimisation

| | |
|---|---|
| **Rationale** | Beynd orients; it does not maximise efficiency at emotional cost. |
| **Examples** | Sequence holds when pace gentles; “smaller steps; sequence stays the same” |
| **Protected behaviours** | Debt minimum protection; buffer target as orientation not shame |
| **Forbidden** | “You could save £X more if…” pressure; efficiency rankings; guilt-based invest nudges |

---

### Law 8 — Calmness outranks completeness

| | |
|---|---|
| **Rationale** | Complete explanation overwhelms; incomplete calm preserves safety. |
| **Examples** | maxBlocks: 3; Tier-C replace-not-append; Plan pacing note returns empty when calm |
| **Protected behaviours** | Entry gate dismiss; “Not now” on Reflection |
| **Forbidden** | “Full picture” dumps; all noticed domains in one view; exhaustive reason code lists |

---

### Law 9 — Continuity must never become invisible behavioural control

| | |
|---|---|
| **Rationale** | Invisible throttling breaks trust permanently. |
| **Examples** | Memory softening gated by confidence; disclosed reason codes |
| **Protected behaviours** | Explicit memory modifier path in getMonthPlan (existing contract only) |
| **Forbidden** | New silent caps; orchestration mutating Plan; feeling → permanent Plan lock |

---

### Law 10 — No hidden emotional orchestration

| | |
|---|---|
| **Rationale** | Emotional orchestration without visibility is manipulation. |
| **Examples** | heldBack disclosed in Reflection background; disclosureNeeded audit trail |
| **Protected behaviours** | Orchestration reason codes; shadow metadata narratorCollisions |
| **Forbidden** | Undocumented deferral drivers; mood-based surface hiding without user path to understand |

---

### Law 11 — No “usual-you” profiling

| | |
|---|---|
| **Rationale** | Pattern labels feel like judgment and enable prediction drift. |
| **Examples** | `oftenSlowFeeling` remains Ask/shadow only |
| **Protected behaviours** | Month-scoped event counts without labels in UI |
| **Forbidden** | “You usually…” copy; usual month logic; habitual fragility inference surfaced to user |

---

### Law 12 — No inferred personality systems

| | |
|---|---|
| **Rationale** | Personality models are surveillance infrastructure. |
| **Examples** | Posture is situational classifier, not stored trait; no user type enum |
| **Protected behaviours** | Session feeling; month-scoped behaviour events |
| **Forbidden** | Persistent trait storage; segmentation; psychographic profiles; confidence-as-identity |

---

## Enforcement matrix

| Law | Primary enforcement | Audit hook |
|-----|---------------------|------------|
| 1 Silence | Orchestration + Tier-C gate | Suppression rate; block count |
| 2 Atmosphere | Visual model + gate | atmosphere_owns_quiet verdicts |
| 3 User words | Experience model order | flexibility collision HIGH |
| 4 Reversibility | Reality shift UX | revert event path |
| 5 Explainability | Plan detail / future footnote | memoryReasonCodes presence |
| 6 Observational | noticed Tier 2 + copy map | shadowOnly audit flag |
| 7 Guidance | Pacing copy | optimisation language grep |
| 8 Calmness | maxBlocks, empty notes | interpretation density metric |
| 9 Invisible control | Memory confidence gates | silent modifier audit |
| 10 Emotional orch | heldBack disclosure | undisclosed deferral grep |
| 11 Usual-you | Memory boundaries doc | “usually” copy grep |
| 12 Personality | No trait persistence | S schema review |

---

## Amendment process

Continuity Law may only be amended by:

1. Documented governance stage (e.g. 80N-x)
2. Explicit rationale for why the law constrains legitimate product need
3. Anti-drift safeguards updated in [`anti-drift-governance.md`](./anti-drift-governance.md)
4. No silent runtime change bundled with law amendment

**Default:** When in doubt, add silence — do not add interpretation.
