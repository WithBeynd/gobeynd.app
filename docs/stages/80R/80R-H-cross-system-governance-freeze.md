# Stage 80R-H — Cross-System Governance Freeze & Protected Surface Registry

**Type:** Constitutional governance specification (read-only audit; **no runtime changes**)  
**Verdict:** **PASS** (registry complete; cross-system boundaries codified)  
**Date:** June 2026  
**Status:** Constitutional baseline — supersedes informal cross-system assumptions for 80R+ and 80N+ work  
**Parents:** [80R-G Copy Freeze](./80R-G-release-continuity-qa-copy-freeze.md) · [80R-F Continuity Boundary](./80R-F-reality-reflection-continuity-boundary.md) · [80N-M Continuity Ownership](../../continuity-ownership-contract.md) · [Plan handover (post-81F)](../../handover.md)

---

## Before any recommendation

### 1. Why governance infrastructure is now necessary

Beynd has crossed from **single-system maturity** to **multi-system coexistence**:

- Deterministic Plan truth and affordability spine  
- Event-derived reserve accounting with archival history  
- Reality capture + Reflection opt-in interpretation  
- Tier-C suppression-first gates  
- `noticed.*` shadow semantics + atmosphere ownership  
- Canonical phrase freezes (80R-G)  
- Silence hierarchy (80R-F)  

Each subsystem is individually stable. **Instability now emerges at interfaces** — one grep, one import, one “helpful” copy line can collapse tiers or duplicate narrators without breaking unit behaviour inside any one module.

Constitutional registry makes **authority explicit** so future stages cannot silently expand scope.

### 2. Which failures from 81F this stage protects against

The failed **81F rebuild cycle** ([handover.md](../../handover.md)) documented:

| 81F failure mode | 80R-H protection |
|------------------|------------------|
| **Large stacked multi-surface rebuilds** hiding regressions | Per-surface allow/forbid registry + escalation rules requiring scoped stages |
| **Display fixes touching engine** causing QA failures | Protected surface registry: Plan math vs display vs interpretation separated |
| **Copying semantics across domains** (e.g. debt → invest) | Tier-boundary freeze: one canonical owner per signal |
| **Paragraph-heavy interpretive UI** breaking trust | Silence hierarchy + narrator precedence |
| **No rollback point** | Constitutional doc as review gate before cross-system wiring |
| **“Helpful by default” intelligence expansion** | Forbidden behaviours list + `noticed.*` / activityLog read bans |

80R-H does not reopen 81F work. It **constitutionalizes** the lesson: **cross-system edits require explicit authority checks**.

### 3. Which continuity systems now exist simultaneously

| Layer | Systems (runtime or governed shadow) |
|-------|--------------------------------------|
| **Tier 0 — Mathematical truth** | `getMonthPlan`, `calcMonthlyLeftover`, `computeAffordabilityContext`, `breathingRoomFloor`, payment canonicalisation, event-derived recompute, net worth |
| **Tier 1 — Factual / policy display** | Plan rows, overbudget truth, release apply/modal/toast, reserve classification copy, Home visibility policy, orchestration deferral |
| **Tier 1 — Archival continuity** | `savingsReleases[]`, Settings reserve use history, JSON backup |
| **Tier 2 — User-authored capture** | Reality `monthContext`, feeling chips, carry suggestion |
| **Tier 2 — Shadow interpretation** | `noticed.*` export, `geodeStabilityRoomSnapshot`, atmosphere derivation |
| **Tier 3 — Opt-in interpretive** | Reflection ExperienceModel, Tier-C (suppression-first) |
| **Silence systems** | Orchestration heldBack, quiet periods, entry gates, empty history section |
| **Telemetry (non-narrative)** | `activityLog` (write-biased), behaviour events (month-scoped, gated) |

These run **at the same time** in one app session. Without registry, any new consumer creates **parallel authority**.

### 4. Why future drift risk is cross-system, not local

| Local (low drift) | Cross-system (high drift) |
|-------------------|---------------------------|
| Fix recompute clamp | Reflection reads `savingsReleases.length` |
| Tweak buffer target display | Home disclosure queue adds “recent reserve use” |
| History formatter date fallback | `noticed.flexibility` ingests release events |
| Copy edit in modal only | Copy edit reused in Tier-C block |
| Plan buffer step visibility | Release → posture → pacing → Plan softening chain |

**Grep distance is one import.** Drift is architectural, not algorithmic.

### 5. Why this stage is constitutional, not feature-oriented

80R-H creates **law**, not product:

- Who may speak  
- Who must stay silent  
- What may never be an input or output  
- Which changes require governance escalation  

No UI, no orchestration wiring, no intelligence. Future features must **cite and obey** this registry or amend it through governance review.

---

## Task 1 — Protected surface registry

### Authority type definitions

| Authority | Definition | Canonical holders |
|-----------|------------|-------------------|
| **Mathematical** | Deterministic numbers that change financial truth | Plan engine, recompute, payments |
| **Emotional (user-authored)** | Words the user explicitly entered | Reality month context, optional notes |
| **Emotional (ambient)** | Non-causal register for interpretive surfaces | atmosphere |
| **Silence** | Withholding explanation under load | orchestration deferral, quiet, Tier-C HARD_SUPPRESS |
| **Orchestration** | Which surfaces may render — not what they mean | `geodeHomeOrchestrationResolve`, `geodeOrchestrationSnapshot` |
| **Continuity (archival)** | Factual event record without interpretation | `savingsReleases[]`, Settings history |

---

### Canonical registry table

| Surface / System | Allowed responsibilities | Forbidden responsibilities | Authority level |
|------------------|-------------------------|---------------------------|-----------------|
| **Plan (`getMonthPlan`)** | Step sequence, sizing, overbudget arithmetic, buffer gap visibility from effective saved, factual release **entry** CTA | Affordability mutation from release; emotional diagnosis; `noticed.*` consumption; reserve history display; “problem solved” after release | **Mathematical + Tier 1 factual** |
| **Monthly Left (`calcMonthlyLeftover`)** | Income − outflows − expenses flow truth | Reserve state, release events, emotional modifiers | **Mathematical only** |
| **Affordability / `breathingRoomFloor`** | Suggestable room, floor sizing (protected contracts) | Release ledger reads; release-based softening | **Mathematical only** |
| **Reality** | Month context capture; feeling chips; sense-check; carry suggestion; shift preview UX | Release apply; release narration; posture from `savingsReleases[]`; auto-fill context from release; Tier-C | **User-authored capture (Tier 2 input)** |
| **Reflection** | Opt-in calm blocks; echo user context when gated | Release ledger reads; behavioural analysis; auto-blocks on release; AI emotional finance narration | **Tier 3 interpretive (opt-in)** |
| **Tier-C** | Max one suppression-gated block; resilience domain (existing law) | Release acknowledgement; reserve flexibility narration; append-mode stacking | **Tier 3 (suppressed by default)** |
| **Home** | Orientation; surface visibility; main action; deferral execution | Deep interpretation; release prompts; history links; `noticed.*` narration | **Orchestration visibility (Tier 1 policy)** |
| **Orchestration** | Band, deferral, disclosure queue policy, reason codes (internal) | Plan math; release-specific disclosure; emotional copy generation | **Silence + visibility policy** |
| **Atmosphere** | Ambient register (calm / protective / reflective / recovering / room) | Causal linkage to release; user moral judgement | **Ambient display (non-policy)** |
| **`noticed.*`** | Shadow export vocabulary; parity/collision metadata | User-facing CTAs; direct UI render without gate; Plan inputs | **Shadow Tier 2 (observational)** |
| **Release apply stack** | User-confirmed event; `savingsReleases[]`; recompute trigger; Tier 1 confirm copy | Plan resequence; Monthly Left mutation; orchestration writes | **Mathematical event + Tier 1 factual** |
| **Release history (80R-D.2.3)** | Archival list; source, amount, date, balance after, user note | Reason codes; frequency summaries; prompts; emotional framing | **Continuity archival (Tier 1)** |
| **Reserve classification (`geodeReserveClassifySource`)** | T0–T4 deterministic rules; copyKey for release surfaces only | User-facing tier labels in history; eligibility from emotional state | **Tier 1 semantic (release-only)** |
| **`activityLog`** | Bounded telemetry write | UI nudges; interpretation; release frequency; Reflection inputs | **Telemetry (non-authoritative)** |
| **Release reason codes** | User-selected modal metadata; stored on record | History display; emotional layers; orchestration triggers | **Capture metadata (modal-only)** |
| **Future export (CSV D.2.4+)** | Archival columns if governed | Interpretive summaries; behavioural columns | **Continuity archival extension** |
| **Continuity copy (`geodeSavingsReleaseCopyForSource`)** | Single choke point for release phrasing | Non-release surfaces; strengthened emotional language | **Tier 1 copy (frozen 80R-G)** |
| **Financial memory** | Confidence-gated Plan softening (existing contract) | Release-triggered modifiers; persistent emotional model | **Tier 0 effect / Tier 1–2 explain** |
| **Net worth / Goals display** | Materialized balances | Release event prose; recovery deltas | **Mathematical display** |

---

## Task 2 — Tier-boundary freeze

### Hard rules (binding)

1. **No tier collapse** — Tier 0 events must not automatically become Tier 2–3 emotional evidence.  
2. **No emotional inference from Tier 0 alone** — balances, release counts, overbudget flags do not imply struggle, recovery, or character.  
3. **No orchestration from shadow semantics** — `noticed.*`, atmosphere, stabilityMetadata must not drive Plan math or payment behaviour.  
4. **No Tier-C authority expansion** — Tier-C cannot gain new domains or release inputs without constitutional amendment.  
5. **No Reality posture from reserve history** — `savingsReleases[]` is not a posture input. Ever (v1 constitution).  
6. **No Reflection behavioural analysis** — Reflection blocks echo; they do not diagnose.

### Inputs that can NEVER become (without constitutional amendment)

| Forbidden input → consumer | Examples |
|----------------------------|----------|
| `savingsReleases[]` → Reality posture | Release count → “heavy month” |
| `savingsReleases[]` → Reflection blocks | Auto “you used buffer” block |
| `savingsReleases[]` → Tier-C | Resilience from reserve use |
| `savingsReleases[]` → Home orchestration | Disclosure “review reserve use” |
| `savingsReleases[]` → affordability / breathingRoomFloor | Hidden pacing |
| `activityLog` release rows → any UI nudge | “Recent release” strip |
| `noticed.*` → Plan math | flexibility → step sizing |
| Release reason codes → emotional UI | “Emergency” → worry echo |
| Atmosphere → Plan mutation | recovering → suppress invest permanently |

### Outputs that can NEVER become (without amendment)

| Source | Forbidden output |
|--------|------------------|
| Release apply | Monthly Left change, overbudget resolution, Plan resequence |
| Release history | Frequency analytics, dependency score, prompts |
| Reflection | Prescriptive release suggestion |
| Tier-C | Release flexibility narration (v1) |
| Orchestration | Release-driven home band elevation |
| Export | Behavioural interpretation columns |

### Must remain observational forever (shadow tier)

- `geodeStabilityRoomShadowMetadata` narrator collision markers (unless promoted via full gate stage)  
- `geodeNoticedParityCheck` audit paths  
- `_geodeLastSavingsReleaseAudit` dev window  

Promotion to live UI requires: parity pass, collision gate, copy map audit, 80R-H escalation tier **G3+**.

---

## Task 3 — Silence hierarchy freeze

### Precedence (highest wins first)

```
1. SILENCE (default for interpretive layers re: release & under load)
2. User-authored words (Reality month context, user notes)
3. Archival facts (history — opt-in navigation only)
4. User-initiated release flows (modal, toast — factual)
5. Mathematical visibility (balances, Plan gaps — no release prose)
6. Ambient atmosphere (non-causal, suppresses Tier-C when recovering/reflective)
7. Opt-in Reflection / Tier-C (lowest — most gated)
```

### When silence MUST win

| Condition | Required outcome |
|-----------|------------------|
| `shouldStayQuiet === true` | No new interpretive copy anywhere |
| `userLoad` high/critical | Tier-C HARD_SUPPRESS; no stacking |
| Atmosphere `recovering` or `reflective` | Tier-C HARD_SUPPRESS; no release narration |
| Same session: overbudget + release apply | Toast/history only; no Reflection auto-entry |
| History empty | No section, no prompts (80R-D.2.3 law) |
| User month context empty | No inferred worry from ledger |
| Multiple pressure signals already visible | No additional release interpretive layer |
| Governance review not completed | No cross-system wiring |

### Narrator precedence (collision law)

**One idea, one surface per session** unless user explicitly navigates to archival depth.

Atmosphere **outranks** Tier-C analysis.  
User words **outrank** `noticed.flexibility` export.  
Archival history **outranks** reinterpretation — Reflection must not reframe ledger rows.

---

## Task 4 — Cross-system drift audit

| Coupling point | Failure mode | Protected boundary | Future review gate |
|----------------|--------------|-------------------|-------------------|
| **`noticed.flexibility`** | Name collision → ingest release as “flexibility” | Domain reads Reality feeling + month context only | **G3** + parity + 80R-F amendment |
| **`activityLog`** | “Recent release” Home hint | Write-only; no readers in UI | **G4** any new reader |
| **Reserve history** | Prompt on Home to open Settings | Hidden when empty; no links | **G2** copy + **G3** if new surface |
| **Overbudget flow** | Copy implies release fixes gap | planTruthLine + Monthly Left isolation | **G2** any overbudget/release copy touch |
| **Onboarding** | “You can release savings when tight” | No release coaching in onboarding | **G2** onboarding copy |
| **Home disclosure queue** | `disclosureNeeded` release item | Orchestration forbidden release disclosure | **G3** orchestration diff |
| **Future CSV export** | “Release count this month” column | Archival columns only | **G2** + export schema addendum |
| **Continuity summaries** | “Often used reserves” AI line | Forbidden phrase registry | **G4** any AI layer |
| **Future AI / Ask Beynd** | Coping narrative from release history | AI must not read release for emotional inference | **G4** + security review |
| **`geodeSavingsReleaseCopyForSource`** | Amplify flexible preview elsewhere | Single choke point; 80R-G frozen | **G2** |
| **Plan buffer reappearance** | Implied “failed buffer” | Math-only visibility | **G1** display audit |
| **Financial memory** | Release triggers preserveBreathingRoom | Memory reads existing contracts only | **G3** memory stage |

---

## Task 5 — Canonical phrase freeze registry

**Binding set** — full list in [80R-G Task 1 Stable](./80R-G-release-continuity-qa-copy-freeze.md).

### Canonical safe phrases (release — abbreviated)

- `Record reserve use` / `Use part of a reserve` (and class variants)  
- `This records reserve use. It reduces your saved balance and does not change Monthly Left…`  
- `This does not change Monthly Left.`  
- `The plan still reflects the month as it stands.`  
- `Recorded. [name] now shows [amount].`  
- `Recorded as reserve use`  
- `Reserve use history`  
- `A factual record of reserve use on this device.`  

### Permanently forbidden phrases (all surfaces)

- Pressure covered / remaining pressure / pressure managed  
- Use saved money  
- Problem solved / back on track / stability restored  
- You relied on / you needed / under pressure *(system voice)*  
- Recovery / coping / struggle / failure / irresponsible  
- Healthy / unhealthy / responsible / careless  
- Often / frequently / pattern / dependency *(release context)*  
- Monthly Left improved / gap closed *(by release)*  
- Emergency support activated / pressure absorbed  
- Beynd noticed you… *(stacking)*  

### Permanently forbidden framing patterns

| Pattern | Example | Why |
|---------|---------|-----|
| **Recovery framing** | “Getting back on track after using savings” | Implies failure + recovery arc |
| **Dependency framing** | “You’ve been drawing on reserves a lot” | Behavioural surveillance |
| **Inferred emotional state** | “This must have been stressful” | Psychological narration |
| **Financial morality** | “Good choice” / “Risky move” | Moral judgement |
| **Problem solved** | “That should help with the overbudget gap” | Affordability lie |
| **Hidden authority** | “Beynd recommends releasing…” | Removes agency |
| **Tier bleed** | Showing T3 copy on T0 balance card | Collapse |

### Frozen ambiguity (do not amplify)

- `This can give the month a little more room.` — flexible preview only ([80R-G](./80R-G-release-continuity-qa-copy-freeze.md))

---

## Task 6 — Governance escalation rules

### Escalation tiers

| Tier | Trigger | Required reviews |
|------|---------|------------------|
| **G1 — Display-only** | Plan/Goals/history formatter display tweak; no new readers | Stage audit; manual spot QA |
| **G2 — Copy** | Any edit to `geodeSavingsReleaseCopyForSource`, overbudget copy, history intro | 80R-G forbidden phrase scan; diff review |
| **G3 — Cross-system** | New `savingsReleases` reader; orchestration diff; Reflection/Tier-C/Reality touch | 80R-F boundary check; silence regression; parity if `noticed.*` involved |
| **G4 — Authority expansion** | activityLog UI reader; AI narration; new Tier-C domain; Home disclosure; export behavioural columns; affordability/release coupling | Full constitutional amendment; 80R-H update; manual QA matrix; user governance sign-off |

### Change → escalation map

| Change type | Minimum tier |
|-------------|--------------|
| New release copy line | **G2** |
| New Reflection reference to reserves | **G4** |
| New Tier-C domain | **G4** |
| activityLog reader | **G4** |
| Home continuity hint | **G3** (hint) / **G4** (release-specific) |
| Export enrichment (archival columns) | **G2** |
| Export enrichment (summaries/analytics) | **G4** |
| Reserve analytics / frequency | **Forbidden** |
| New orchestration reason code for release | **G3** |
| Comment-only in release module | **G1** |

### Mandatory checks by tier

**All G2+:** grep forbidden phrases; grep new `savingsReleases` consumers.  
**All G3+:** silence regression checklist ([80R-G](./80R-G-release-continuity-qa-copy-freeze.md)); confirm Monthly Left unchanged after release.  
**All G4:** update this registry; 80R-F review; no ship without explicit governance approval.

---

## Task 7 — Final constitutional contract

### A. Verdict: **PASS**

Cross-system boundaries are documentable, current runtime aligns with registry, and constitutional freeze can govern future work. No runtime changes required.

### B. Protected authority hierarchy

```
CONSTITUTION (80R-H)
  └── Silence law (default)
  └── Tier 0 — Mathematical truth (Plan, Monthly Left, recompute, payments)
  └── Tier 1 — Factual / policy / archival (release copy, history, orchestration visibility)
  └── Tier 2 — User-authored + shadow observational (Reality context, noticed.* export)
  └── Tier 3 — Opt-in interpretive (Reflection, Tier-C) — suppression-first
```

**Supremacy rules:** Silence > user words > archival facts > atmosphere > Tier-C.  
Mathematical truth is **orthogonal** — never overridden by interpretation.

### C. Permanently protected systems

- `getMonthPlan`, `calcMonthlyLeftover`, `computeAffordabilityContext`, `breathingRoomFloor`  
- Payment canonicalisation, release accounting, release apply path  
- Reflection runtime composition (gate structure)  
- Tier-C suppression gates  
- Home orchestration hierarchy (visibility-only role)  
- Reality capture semantics  
- `service-worker.js`, localStorage schema, export schema structure  

### D. Permanently forbidden system behaviours

- Tier collapse (ledger → emotional diagnosis)  
- Parallel narrators without collision suppression  
- Bypassing silence hierarchy under load  
- Affordability / Monthly Left mutation from release  
- Release-frequency or dependency inference  
- activityLog → UI nudges  
- `noticed.*` → Plan math  
- Orchestration release disclosure prompts  
- Persistent emotional model in `S` from release patterns  
- AI psychological narration of reserve use  
- 81F-style multi-surface unscoped rebuilds  

### E. Future-stage review requirements

Every stage touching continuity or interpretation must declare:

1. **Escalation tier (G1–G4)**  
2. **Registry rows affected** (Task 1 table)  
3. **Silence regression pass/fail**  
4. **Copy freeze compliance** (if any user-facing string)  
5. **Files touched vs protected list**  

Stages that cannot answer (1)–(5) are **blocked**.

### F. Highest future architectural risks

1. **Reflection stack** adding `savingsReleases` to `geodeStabilityRoomSnapshot` sources  
2. **`noticed.flexibility`** misread as reserve-flexibility domain  
3. **Home `disclosureNeeded`** queue as release prompt pipe  
4. **activityLog** first UI consumer  
5. **Ask Beynd / future AI** ingesting release history for “supportive” narrative  
6. **Export analytics** disguised as archival columns  
7. **Copy choke-point drift** amplifying frozen ambiguous flexible line  
8. **81F-pattern stacked PRs** bypassing per-surface audit  

---

## Protected (unchanged by this stage)

All runtime listed in stage brief. This document adds **governance only**.

---

## Files touched

| File | Change |
|------|--------|
| `docs/stages/80R/80R-H-cross-system-governance-freeze.md` | This registry |

## Files intentionally not touched

- `index.html` (inspection only)  
- All runtime surfaces  

---

## Related constitutional documents

| Document | Role |
|----------|------|
| [continuity-ownership-contract.md](../../continuity-ownership-contract.md) | 80N-M ownership matrix |
| [continuity-law.md](../../continuity-law.md) | Twelve binding laws |
| [anti-drift-governance.md](../../anti-drift-governance.md) | Audit playbook |
| [80R-F](./80R-F-reality-reflection-continuity-boundary.md) | Release-specific silence boundaries |
| [80R-G](./80R-G-release-continuity-qa-copy-freeze.md) | Release phrase freeze |
| [handover.md](../../handover.md) | 81F rollback lessons |

---

## Service worker

**No bump.**

---

## Core philosophy (binding)

> Financial truth must remain deterministic.  
> Continuity must remain calm.  
> User authorship must outrank interpretation.  
> Silence must remain a first-class architectural outcome.

No continuity or interpretive system may silently gain authority outside its governed boundary.
