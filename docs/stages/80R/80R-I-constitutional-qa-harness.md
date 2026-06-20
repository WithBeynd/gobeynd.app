# Stage 80R-I — Constitutional QA Harness & Drift Detection Specification

**Type:** Enforcement infrastructure specification (read-only; **no runtime changes**, **no CI implementation**)  
**Verdict:** **PASS** (harness architecture defined; operational tooling specified)  
**Date:** June 2026  
**Status:** Binding QA playbook for all post-80R / post-80N continuity work  
**Parents:** [80R-H Governance Freeze](./80R-H-cross-system-governance-freeze.md) · [80R-G Copy Freeze](./80R-G-release-continuity-qa-copy-freeze.md) · [80R-F Continuity Boundary](./80R-F-reality-reflection-continuity-boundary.md) · [Anti-Drift Governance](../../anti-drift-governance.md)

---

## Before any recommendation

### 1. Why constitutional governance now requires operational QA tooling

Governance documents (80R-F through 80R-H) define **law**. Law without **operational enforcement** erodes under development pressure — especially “small helpful” PRs that:

- Add one grep-visible consumer of `savingsReleases[]`  
- Reuse a “nice” phrase from flexible preview in Reflection  
- Wire `activityLog` into Home “awareness”  

Constitutional QA harness converts aspirational rules into **repeatable checks**: grep recipes, manual silence matrices, narrator collision rules, and escalation gates. Contributors run checks; reviewers block merges that skip them.

### 2. Which failures from 81F and post-81F this protects against

| Historical failure | Source | Harness protection |
|--------------------|--------|-------------------|
| **Stacked multi-surface rebuilds** hiding regressions | [handover.md](../../handover.md) 81F rollback | G3/G4 gates + cross-system grep matrix |
| **Display layer touching Plan engine** | Plan stabilisation docs | Tier 0 isolation checks; `getMonthPlan` input grep |
| **Copy/semantics copied across domains** | 81F invest/debt confusion | Phrase allow/block lists; single copy choke-point diff |
| **Interpretation density explosion** | 80N-N audits | Narrator collision framework; interpretation density metric |
| **“Helpful by default” intelligence** | anti-drift org warnings | Forbidden import scans; activityLog reader ban |
| **Release visibility → narration drift** | 80R-D.2.3 / 80R-G | Silence regression harness; release consumer allowlist |
| **Shadow semantics → live UI** | 80N-M continuity law | `noticed.*` consumer grep; parity harness |

Post-81F stabilisation (F.1–F.3) succeeded by **audit-first, scoped slices**. 80R-I codifies that operating model as **constitutional QA**, not ad hoc memory.

### 3. Why future risk is semantic/cross-system rather than mathematical

| Domain | Maturity | Residual risk |
|--------|----------|---------------|
| **Reserve recompute, Monthly Left, Plan sizing** | High — event-derived model shipped | Local math bugs (bounded) |
| **Silence hierarchy, narrator ownership, phrase semantics** | Governed but **not mechanically enforced** | Cross-system drift (unbounded) |

Failure modes are now predominantly:

- Wrong **surface** speaking  
- Wrong **phrase** implying recovery or affordability repair  
- Wrong **consumer** of ledger or activityLog  
- Wrong **stacking** of interpretive layers  

Math can be wrong and caught by scenario QA. Semantic drift **feels fine in isolation** and fails trust in composition.

### 4. Which governance laws are most vulnerable to silent drift

| Law | Vulnerability | Why |
|-----|---------------|-----|
| **Silence outranks explanation** (Continuity Law 1) | Home/Reflection “one more helpful line” | Low code cost, high UX impact |
| **User words outrank inference** (Law 3) | `noticed.flexibility` ↔ reserve flexibility conflation | Name collision |
| **No tier collapse** (80R-H) | Reflection reads `savingsReleases` | One import |
| **Release ≠ affordability repair** (80R-A.1) | Copy near overbudget card | Adjacent UI |
| **activityLog write-only** (80R-F) | First reader for “recent activity” strip | Obvious hook |
| **Tier-C suppression-first** | New domain without gate audit | Feature pressure |
| **Canonical phrase freeze** (80R-G) | Edits outside copy map review | Single-function choke point |
| **Orchestration visibility-only** | `disclosureNeeded` release items | Policy creep |

### 5. Why this stage is enforcement infrastructure, not product expansion

80R-I specifies **how to verify** governance — not **what to build**:

- QA matrices and grep recipes  
- Manual silence scenarios  
- Review gate checklists  
- Drift scenario playbook  

No runtime hooks, no CI pipeline implementation, no new surfaces. Future **80R-I.1** (optional) may implement automated scripts; this stage defines the contract they must satisfy.

---

## Task 1 — Constitutional QA matrix

| Governance area | Protected by | Failure symptom | Detection method | Escalation |
|-----------------|--------------|-----------------|------------------|------------|
| **Silence hierarchy** | 80R-F, Continuity Law 1 | Reflection/Tier-C/Home narrate release; prompts to history | Silence regression scenarios (Task 3); grep release consumers outside allowlist | **G3** |
| **Narrator ownership** | 80R-H registry, anti-drift §Parallel narrator | Same idea explained on Plan + Reflection + Home same session | Narrator collision matrix (Task 4); manual session walkthrough | **G3** |
| **Tier 0 isolation** | 80R-H, handover protected functions | Monthly Left changes after release; Plan amounts from `noticed.*` | Manual release QA; grep `getMonthPlan` for new interpretive inputs | **G4** |
| **Release continuity** | 80R-D.2.2, 80R-G | Double deduct; reason codes in history; frequency copy | Math scenario QA; grep history HTML for `reason`; phrase scan | **G2–G3** |
| **Home neutrality** | 80R-F, 80R-H | Release disclosure in orchestration; history links on Home | Grep `geodeHomeOrchestrationResolve` + Home render for `savingsRelease` | **G3–G4** |
| **Reflection suppression** | 80R-F, Stability Room law | Auto blocks on release; ledger in snapshot sources | Grep `geodeStabilityRoomSnapshot` for `savingsReleases`; entry gate scenarios | **G4** |
| **Tier-C authority** | 80N gates, 80R-F | Release domain; PASS without suppression in heldBack | Dev console: `geodeNoticedParityCheck()`; Tier-C gate audit path | **G4** |
| **activityLog isolation** | 80R-F, 80R-H | UI reads `savings_release` type | Grep `activityLog` + `savings_release` readers | **G4** |
| **Reserve semantics (T0–T4)** | 80R-C, 80R-G | Tiers shown in history UI; classification mutates Plan | Grep history formatter for `reserveTier`; classification → Plan grep | **G2–G3** |
| **Canonical phrases** | 80R-G allowlist | Drift from frozen CTAs/truth lines | Diff `geodeSavingsReleaseCopyForSource`; allowlist match | **G2** |
| **Forbidden phrases** | 80R-G, anti-drift §Forbidden | recovery, relied on, pressure managed in user strings | Blocklist grep across `index.html` release-adjacent regions | **G2** |
| **Orchestration boundaries** | 80R-H, continuity ownership | New release reasonCodes; disclosure copy | Diff orchestration functions; grep `disclosureNeeded` + release | **G3** |
| **User-authored supremacy** | Continuity Law 3 | Reality context replaced by inferred release summary | Grep Reality save paths for `savingsReleases`; manual context QA | **G4** |

---

## Task 2 — Drift-detection registry

### Allowlist — permitted `savingsReleases` readers (baseline)

Any **new** file/function consumer outside this list → **G3 minimum**:

```
geodeSavingsReleaseDeductionSumForSource
geodeRecomputeBalancesFromPayments
geodeNormalizeSavingsReleases
geodeApplySavingsRelease
geodePreviewSavingsRelease / geodeSavingsReleaseEligibility / geodeSavingsReleaseAvailableBalance
geodeFormatSavingsReleaseHistoryEntry
geodeSavingsReleaseHistoryEntries
geodeSavingsReleaseHistorySectionHtml
exportJSONBackup / geodeBeyndBackupAllowedDataKeys (persistence only)
```

### Grep-based drift checks (run on every G2+ PR touching `index.html`)

| ID | Detection rule | Why dangerous | Tier |
|----|----------------|---------------|------|
| **DR-01** | `rg 'savingsReleases' index.html` → diff against allowlist | Ledger → interpretation pipe | **G3** |
| **DR-02** | `rg "savings_release" index.html` → must be write (`appendActivityLog`) only | Telemetry → nudges | **G4** |
| **DR-03** | `rg 'geodeSavingsReleaseCopyForSource\|geodeOverBudgetPlanBlockHtml' index.html` on PR | Unreviewed semantic change | **G2** |
| **DR-04** | `rg 'noticed\.' index.html` new consumers outside parity/Tier-C | Shadow → authority | **G3–G4** |
| **DR-05** | `rg 'getMonthPlan' index.html` + review new parameters/flags | Hidden pacing | **G4** |
| **DR-06** | `rg 'calcMonthlyLeftover\|breathingRoomFloor' index.html` + `savingsRelease` same hunk | Affordability coupling | **G4** |
| **DR-07** | `rg 'geodeHomeOrchestrationResolve\|geodeOrchestrationSnapshot' index.html` diff | Orchestration expansion | **G3** |
| **DR-08** | `rg 'geodeStabilityRoomSnapshot\|geodeReflectionStackForSurface' index.html` diff | Reflection coupling | **G3–G4** |
| **DR-09** | Blocklist scan (Task 5) in changed hunks | Emotional drift | **G2** |
| **DR-10** | `rg 'recovery\|relied on\|stability restored\|pressure managed\|problem solved' index.html` near release functions (±80 lines) | Recovery framing at release boundary | **G2** |

### Dev-console checks (manual — existing runtime inspection hooks)

| Check | Command / path | Pass criterion |
|-------|----------------|----------------|
| **Parity** | `geodeNoticedParityCheck(S, { log: true })` | `pass: true` before any `noticed.*` promotion |
| **Orchestration read-only** | `geodeHomeOrchestrationResolve(S)` | No release-related `reasonCodes` or `disclosureNeeded` |
| **Release snapshot** | `geodeSavingsReleaseSnapshot(S)` | `monthlyLeftUnchanged` / preview audit notes consistent |
| **Stability snapshot sources** | `geodeStabilityRoomSnapshot(S)` → inspect `sources` | No `savingsReleases` source |
| **Tier-C suppress path** | Stability Room compose + `exp.audit.tierCGateVerdict` | HARD_SUPPRESS in heldBack / recovering scenarios |

*Note: 80R-I does not add these hooks — it standardizes their use in review.*

### Continuity duplication check

**Rule CD-01:** If archival history shows release **and** another surface mentions reserve use same session → **FAIL** unless user navigated to Settings explicitly (no prompts).

**Rule CD-02:** If overbudget card visible **and** release modal truth lines missing `planTruthLine` when `monthlyLeft < 0` → **G2 FAIL**.

### Orchestration-coupling check

**Rule OC-01:** `disclosureNeeded`, `deferredItems`, `reasonCodes` must not contain `release`, `savings_release`, `reserve_use` tokens.

**Rule OC-02:** Home band elevation must not read `savingsReleases.length`.

---

## Task 3 — Silence regression harness

**Category:** `SILENCE-REG` — mandatory for all **G3+** changes; recommended for every release-adjacent **G2** change.

### Scenario matrix

| ID | Setup | Expected visible | Expected silent | Forbidden |
|----|-------|------------------|-----------------|-----------|
| **SR-01** | Zero releases | Goals saved amounts; Plan as usual | History section absent | Any “reserve use” copy outside modal entry |
| **SR-02** | Single release £32 from buffer | Toast; saved £28; history row in Settings | Reflection, Reality, Home, Tier-C mention | Monthly Left change; overbudget amount change |
| **SR-03** | SR-02 + overbudget Plan | Overbudget card; release CTA; modal truth lines | Auto Reflection entry triggered by release | “Gap closed” / “back on track” after release |
| **SR-04** | 5 releases same month | History list (max 50); materialized saved | Frequency summary; “often” language | Home prompt to review history |
| **SR-05** | Releases across 3 months | History chronological; backup includes events | Month-over-month analytics | “Pattern” / dependency copy |
| **SR-06** | Release + saved month context | Reality shows user words only | System inferring worry from release | protect/worried pre-filled from ledger |
| **SR-07** | Release + quiet / high load | Factual toast only | Tier-C block; extra Home lines | Stacked interpretive blocks |
| **SR-08** | Legacy `base_delta` + new `event_derived` | History shows both calmly | “Corrupted” / “invalid” messaging | Double-subtract without migration |
| **SR-09** | Deleted goal; old release row | Row skipped or name `Reserve` | Crash; shame copy | — |
| **SR-10** | User opens Reflection after release | Reflection blocks per existing gates only | Release-specific new blocks | “You used buffer” system voice |

### Silence regression pass criteria

- **PASS:** All expected silent systems produce no release narration in scenarios SR-01–SR-10.  
- **NEEDS ATTENTION:** Visible copy ambiguous but not forbidden (e.g. flexible preview only in modal).  
- **FAIL:** Any forbidden behaviour column triggered.

---

## Task 4 — Narrator collision framework

### Narrator precedence matrix (same session, same theme)

Higher row **suppresses or outranks** lower for the same interpretive theme:

| Rank | Narrator | Themes owned |
|------|----------|--------------|
| 1 | **Silence / deferral** | All — when quiet, load, or heldBack |
| 2 | **User-authored Reality context** | protect, worried, success |
| 3 | **Archival release history** | Factual reserve-use rows (Settings only) |
| 4 | **Plan factual layers** | Overbudget arithmetic, buffer gap math, pacing note (PAO paraphrase) |
| 5 | **User-initiated release modal/toast** | Confirm + remaining balance |
| 6 | **Atmosphere** | Ambient register — non-causal |
| 7 | **Reflection blocks** | Opt-in month read |
| 8 | **Tier-C** | Single gated block |

### Suppression resolution rules

| Conflict | Resolution |
|----------|------------|
| Silence vs any narrator | Silence wins |
| User words vs `noticed.flexibility` export | User words win in live copy |
| History vs Reflection reinterpretation | History is fact; Reflection must not reframe |
| Atmosphere `recovering`/`reflective` vs Tier-C | Tier-C HARD_SUPPRESS |
| Plan overbudget truth vs release “relief” | Plan truth wins; Monthly Left unchanged |
| Home deferral vs secondary explanation | Deferral wins — no append |

### Duplication detection rules

**DUP-01:** Same **theme** (flexibility, pressure, recovery, pace) in **≥2 live surfaces** without documented suppress → **G3 FAIL**.

**DUP-02:** Release event referenced in **toast + history + third surface** same session → **G3 FAIL** (toast + history allowed; third forbidden).

**DUP-03:** Interpretation density **>4** interpretive strings same theme per visit → **NEEDS ATTENTION** ([anti-drift](../../anti-drift-governance.md)).

---

## Task 5 — Protected phrase registry (operational)

### Allowlist — canonical release phrases (must match exactly when used)

Source of truth: [80R-G Task 1 Stable](./80R-G-release-continuity-qa-copy-freeze.md).

**Operational check:** On G2 PRs, diff `geodeSavingsReleaseCopyForSource` and history section strings; any new user-facing sentence requires explicit allowlist amendment in 80R-G.

### Blocklist — forbidden in all user-facing strings (release-adjacent and continuity)

```
pressure covered
pressure managed
remaining pressure
use saved money
problem solved
back on track
stability restored
you relied on
you needed
under pressure
getting back on
recovery
coping
struggle
failure
irresponsible
financially healthy
financially unhealthy
dependency
often used
frequently used
pattern of
beynd noticed
emergency support activated
pressure absorbed
gap closed
monthly left improved
```

### Frozen ambiguity registry (allowed only in specified location)

| Phrase | Location | Rule |
|--------|----------|------|
| `This can give the month a little more room.` | T2 flexible `previewLine` only | Do not copy elsewhere |
| `part of your reserve supported the month` | `truthLine` only | Do not strengthen |

### High-risk wording patterns (regex / review flags)

| Pattern | Risk |
|---------|------|
| `\b(recover\|recovery\|recovering)\b` near release copy | Recovery framing |
| `\b(relie\|relief\|relieved)\b` after release confirm | Affordability repair implication |
| `\b(healthy\|unhealthy\|responsible\|irresponsible)\b` + money | Moral judgement |
| `\b(often\|frequently\|usually\|pattern)\b` + reserve/savings | Behavioural profiling |
| `\b(helped\|saved you\|got you through)\b` system voice | Coping narrative |
| `\b(recommend\|suggest you release)\b` | Hidden authority |

---

## Task 6 — Governance review gates

### G1 — Display-only

| Field | Requirement |
|-------|-------------|
| **Examples** | History date formatting; goal card layout; comment hygiene |
| **Reviewers** | Stage author + one reviewer |
| **Audits** | Stage scope doc; files touched/not touched |
| **Regression** | Spot manual QA for affected surface |
| **Constitutional refs** | 80R-H registry row (display column only) |

### G2 — Semantic copy

| Field | Requirement |
|-------|-------------|
| **Examples** | `geodeSavingsReleaseCopyForSource`; overbudget adjacent copy; history intro |
| **Reviewers** | Stage author + copy/governance reviewer |
| **Audits** | DR-03, DR-09, DR-10; allowlist/blocklist; 80R-G compliance |
| **Regression** | SILENCE-REG SR-02, SR-03 if release-related |
| **Constitutional refs** | 80R-G, 80R-H Task 5 |

### G3 — Cross-system coupling

| Field | Requirement |
|-------|-------------|
| **Examples** | New ledger reader; orchestration diff; Reflection snapshot change |
| **Reviewers** | Stage author + continuity governance reviewer |
| **Audits** | DR-01–DR-08; OC-01/02; CD-01/02; narrator collision |
| **Regression** | Full SILENCE-REG SR-01–SR-10; parity if `noticed.*` touched |
| **Constitutional refs** | 80R-F, 80R-H, continuity-law |

### G4 — Authority expansion

| Field | Requirement |
|-------|-------------|
| **Examples** | activityLog UI; AI narration; new Tier-C domain; affordability←release; Home release prompts |
| **Reviewers** | Stage author + governance owner + explicit product sign-off |
| **Audits** | Full drift registry; constitutional amendment PR updating 80R-H |
| **Regression** | SILENCE-REG + Tier-C suppress matrix + Plan math isolation proof |
| **Constitutional refs** | 80R-H amendment; continuity-ownership-contract; anti-drift FAIL criteria |

**No G4 change ships without written amendment to 80R-H §Permanently forbidden.**

---

## Task 7 — Constitutional drift scenarios

| Scenario | Likely drift mechanism | Protected boundary | Amendment process |
|----------|------------------------|-------------------|-------------------|
| **AI assistant expansion** | Ask Beynd reads release history for “supportive” replies | AI must not infer emotional state from ledger | G4 + AI governance addendum |
| **Export analytics** | CSV “releases this month” summary column | Archival columns only — no aggregates | G2 schema addendum or G4 if behavioural |
| **Home helpfulness** | “Recent reserve use” muted line | Home visibility-only | G4 — forbidden without amendment |
| **Continuity summaries** | “You’ve used reserves N times” | No frequency language | **Forbidden** — block at review |
| **activityLog readers** | Highlights rotation uses `savings_release` | Write-only telemetry | G4 |
| **Reflection personalization** | Blocks keyed on `savingsReleases.length` | Opt-in echo only | G4 + 80R-F amendment |
| **Onboarding intelligence** | “Tip: release savings when tight” | No release coaching in onboarding | G2 onboarding review |
| **Predictive pacing** | Release count → memory modifier | Plan math isolation | **Forbidden** / G4 |

### Amendment process (binding)

1. Draft constitutional delta (which law changes, why).  
2. Update 80R-H + affected stage contract (80R-F/G).  
3. Extend 80R-I drift registry + phrase lists.  
4. Run full SILENCE-REG + escalation tier audits.  
5. Explicit governance approval — no silent ship.

---

## Task 8 — Final constitutional QA contract

### A. Verdict: **PASS**

Harness architecture is spec-complete. Existing dev hooks (`geodeNoticedParityCheck`, orchestration snapshots, release snapshot) are sufficient for **manual** enforcement until optional automation (80R-I.1).

### B. Constitutional QA architecture

```
┌─────────────────────────────────────────────────────────┐
│ 80R-H / 80R-F / 80R-G / continuity-law (constitution)   │
└───────────────────────────┬─────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────┐
│ 80R-I QA harness (this document)                        │
│  • QA matrix (Task 1)                                   │
│  • Drift registry DR-01–DR-10 (Task 2)                  │
│  • SILENCE-REG SR-01–SR-10 (Task 3)                     │
│  • Narrator collision DUP/CD/OC rules (Task 4)          │
│  • Phrase allow/block/ambiguity (Task 5)                │
│  • Gates G1–G4 (Task 6)                                 │
└───────────────────────────┬─────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              │ Per-PR / per-stage review │
              │ (grep + manual + console) │
              └───────────────────────────┘
```

### C. Highest-risk future drift vectors

1. Reflection / Stability Room ingesting `savingsReleases`  
2. `noticed.flexibility` misread as reserve flexibility  
3. activityLog first UI consumer  
4. Ask Beynd / AI coping narratives from history  
5. Home `disclosureNeeded` release items  
6. Copy choke-point amplifying frozen ambiguous line  
7. Export “helpful” summary columns  
8. G3 work bundled without SILENCE-REG  

### D. Mandatory future review categories

| Category | When required |
|----------|---------------|
| **SILENCE-REG** | G3+, all release-adjacent G2 |
| **PHRASE-SCAN** | All G2+ |
| **LEDGER-ALLOWLIST** | Any `savingsReleases` grep hit outside allowlist |
| **NARRATOR-COLLISION** | Reflection, Tier-C, Home, orchestration, Plan copy changes |
| **TIER-0-ISOLATION** | Plan, affordability, release apply, recompute changes |
| **PARITY** | Any `noticed.*` or Stability Room promotion |

### E. Permanently protected governance laws

- Silence outranks explanation  
- User words outrank inference  
- Tier 0 mathematical isolation (Monthly Left, Plan engine, breathingRoomFloor)  
- Release ≠ affordability repair  
- activityLog non-narrative (no UI readers without G4 amendment)  
- Tier-C suppression-first  
- No behavioural scoring from release data  
- No frequency / dependency summaries  
- Orchestration visibility-only (no release disclosure)  

### F. What future contributors must never bypass

- Escalation tier declaration (G1–G4)  
- DR-01 allowlist check for `savingsReleases` consumers  
- Blocklist scan on user-facing copy changes  
- SILENCE-REG for cross-system touches  
- 80R-H forbidden behaviours list  
- Constitutional amendment for G4 authority expansion  
- “Small helpful PR” exemption — **does not exist**  

---

## Optional future work (out of scope for 80R-I)

**80R-I.1 — Scripted harness (optional):** Shell/Node script running DR-01–DR-10 + blocklist; outputs PASS/NEEDS ATTENTION/FAIL report. Not CI-mandatory unless separately adopted.

**Do not recommend:** emotional analytics, behavioural scoring, hidden profiling, AI diagnosis, predictive reserve, adaptive psychological modelling, orchestration expansion, hidden continuity weighting.

---

## Protected (unchanged)

All runtime and schemas listed in stage brief. This document adds **QA enforcement spec only**.

---

## Files touched

| File | Change |
|------|--------|
| `docs/stages/80R/80R-I-constitutional-qa-harness.md` | This specification |

## Files intentionally not touched

- `index.html` (inspection only)  
- All runtime surfaces  

---

## Service worker

**No bump.**

---

## Core philosophy (binding)

> Financial truth must remain deterministic.  
> Continuity must remain calm.  
> User authorship must outrank interpretation.  
> Silence must remain enforceable through tooling, not dependent on memory.

Governance must survive future development pressure.
