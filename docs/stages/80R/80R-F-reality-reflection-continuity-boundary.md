# Stage 80R-F — Reality / Reflection Continuity Boundary Contract

**Type:** Governance specification (read-only audit; **no runtime changes**)  
**Verdict:** PASS (contract complete; implementation gated)  
**Date:** June 2026  
**Status:** Awaiting governance review — **do not commit until reviewed**  
**Parents:** [80R-A.1 Savings Release Continuity Contract](./80R-A.1-savings-release-continuity-contract.md) · [80R-D.2.3 Release History Visibility](./80R-D.2.3-release-history-visibility.md) · [80R-D.2.2 Event-Derived Deduction](./80R-D.2.2-event-derived-reserve-deduction.md)  
**Related:** [`../../continuity-ownership-contract.md`](../../continuity-ownership-contract.md) · [`../../continuity-law.md`](../../continuity-law.md)

---

## Before any recommendation

### 1. Which systems currently know reserve-use events

**Direct readers of `savingsReleases[]` (runtime inspection, June 2026):**

| System | Role | Acknowledgement type |
|--------|------|----------------------|
| **`geodeRecomputeBalancesFromPayments`** | Materializes `goal.saved` / `inv.balance` | Tier 0 mathematical truth |
| **`geodeSavingsReleaseDeductionSumForSource`** | Sums `event_derived` deductions per source | Tier 0 math helper |
| **`geodeNormalizeSavingsReleases`** | Load-time schema normalize | Persistence only |
| **Savings Release apply/preview stack** | `geodeApplySavingsRelease`, modal, toast, Plan overbudget CTA | Tier 1 factual confirm + copy |
| **Release history (80R-D.2.3)** | `geodeFormatSavingsReleaseHistoryEntry`, Settings → Data drill | Tier 1 archival continuity |
| **JSON backup envelope** | `savingsReleases` in allowed data keys | Device-owned archive |

**Indirect observers (effective saved changed; no event ledger read):**

| System | Observation |
|--------|-------------|
| **`geodeGoalEffectiveSavedFromState` / net worth** | Lower saved after release — asset display only |
| **`geodeGetBufferReadinessState` / Plan buffer step** | May re-show buffer step when target gap reopens — sequencing unchanged |
| **Goals UI, CSV summary** | Materialized balances reflect truth |

**Write-only shadow (not read by any UI):**

| System | Role |
|--------|------|
| **`appendActivityLog('savings_release', …)`** | Duplicate telemetry; trimmed ~75 days; no consumer |

**Confirmed non-readers (grep-verified):**

- `geodeStabilityRoomSnapshot` / Reflection stack  
- `geodeGetContextPosture`, `assessPressure`, `geodeRealityPageHtml`  
- `geodeHomeOrchestrationResolve`, `geodeOrchestrationSnapshot`  
- `noticed.*` export domains (`flexibility`, `resilience`, `recovery`, `pacing`, `pressure`)  
- Tier-C gates (`geodeTierCResilienceGate` and related)  
- Home hero / coaching / anticipatory lines  
- `beyondStatement`, CSV export event rows  

---

### 2. Which systems currently remain silent

| Surface | Silence on reserve use |
|---------|------------------------|
| **Reality** | No release reads; posture from Reality check, feeling chips, user month context |
| **Reflection** | Blocks from Stability Room snapshot; no `savingsReleases` in sources |
| **Tier-C** | Suppression-first; no release domain; atmosphere collision rules active |
| **Home** | No release reason codes; no history surfacing |
| **Orchestration** | No deferred items or disclosure for release |
| **`noticed.*`** | `flexibility` derives from user-authored protect/worried + posture — **not** release ledger |
| **Atmosphere** | Derived from posture, held-back signals, month context — **not** release events |
| **activityLog** | Write path only |

**Partial visibility (intentional, non-emotional):**

- Settings → **Reserve use history** (archival, hidden when empty)  
- Release modal / toast / Plan CTA (user-initiated action surfaces only)

---

### 3. Why silence-first behaviour is currently philosophically correct

1. **Release is asset truth, not emotional truth.** The user recorded that part of a reserve balance was used. That is ledger continuity — not evidence of struggle, recovery, or character.

2. **The user did not ask Beynd to interpret.** Confirm sheet copy is factual (“record reserve use”, “Monthly Left unchanged”). Silence elsewhere respects agency.

3. **Reserves exist to be used sometimes.** Acknowledging every release emotionally would reframe normal flexibility as an event Beynd must comment on — contradicting *“sometimes reserves are doing their job.”*

4. **Continuity visibility now exists without narration.** 80R-D.2.3 gives an archival trace. Emotional layers do not need to duplicate it.

5. **Interpretation surfaces already have richer, user-authored inputs.** Reality month context (`protect`, `worried`, `success`) and feeling chips are the legitimate emotional layer. Release events must not override or infer those fields.

6. **Silence protects against failure framing.** Any automatic “you used savings” line risks implying the month went wrong — violating *“the month evolves; the user does not fail.”*

---

### 4. The risk of “parallel emotional narrators”

Beynd already has multiple **interpretation-capable** layers that can speak about the same month from different angles:

| Narrator | Typical register |
|----------|------------------|
| Reality month context | User-authored protect / worried / success |
| `assessPressure` / PAO | Cash headroom, overdue, worry flags (internal + selective UI) |
| Atmosphere | calm / protective / reflective / recovering (ambient) |
| Reflection blocks | Month-so-far, what matters, pacing note |
| Tier-C (resilience domain) | Optional single interpretive block |
| Release history | Factual reserve-use rows |
| Plan overbudget card | Income/expense gap truth + optional release CTA |

**If reserve use enters multiple narrators without governance:**

- **Duplication** — same idea (“flexibility”, “tight month”, “heavy month”) in three places feels surveilled.  
- **Emotional stacking** — archival history + Reflection pacing + Reality worry echo = escalating concern without user request.  
- **Hidden recovery implication** — “you used buffer” near “recovering” atmosphere implies Beynd thinks the user is bouncing back.  
- **Authority confusion** — user cannot tell whether release **caused** posture change or Plan softening.  
- **Tier collapse** — Tier 0 ledger event treated as Tier 3 emotional evidence.

**Continuity Law already binds:** silence outranks explanation; atmosphere outranks analysis; user words outrank inference. 80R-F extends that law specifically to **Savings Release**.

---

### 5. Why this stage is governance-only

Runtime is **stable** after 80R-D.2.2 / 80R-D.2.3:

- Reserve ledger correct  
- Monthly Left isolated  
- Archival history available  
- Emotional surfaces correctly silent  

The unresolved question is **ownership**, not implementation:

> *Who, if anyone, is allowed to emotionally acknowledge reserve flexibility?*

Answering that in code without a contract would invite semantic drift, orchestration creep, and Reflection/Tier-C expansion by accident. This stage defines boundaries **before** any future build — and explicitly forbids builds that violate them.

**No runtime edits. No new UI. No wiring. Governance review required before commit.**

---

## Task 1 — Continuity ownership map

### Canonical ownership table

| System | Owns | Must never own |
|--------|------|----------------|
| **Plan (`getMonthPlan`)** | Deterministic sequencing; overbudget arithmetic; buffer step visibility from **effective saved**; optional release **entry** CTA (user tap) | Release apply; emotional diagnosis; affordability mutation from release; release history display; “problem solved” framing |
| **Savings Release stack** | User-confirmed event; `savingsReleases[]`; Tier 0 asset materialization via recompute; Tier 1 confirm copy | Plan math; Monthly Left; orchestration; Reflection blocks; behavioural inference |
| **Release history (80R-D.2.3)** | Archival factual list; source name, amount, date, balance after, user note | Interpretation; frequency summaries; reason-code display; notifications |
| **Reality** | User-authored month context; feeling capture; balance sense-check; carry suggestion | Release apply; release amount suggestion; inferring posture **from release alone**; auto-opening release modal |
| **Reflection** | Opt-in calm month read; ExperienceModel blocks; user-triggered entry from Reality | Release apply; urgency; prescriptive “you should release”; AI emotional finance narration |
| **Stability Room / `geodeStabilityRoomSnapshot`** | Read-model assembly for Reflection; atmosphere derivation; shadow metadata | Release ledger reads (today); release-driven block generation (forbidden without new stage + this contract amendment) |
| **Tier-C (`noticed.*` → Reflection only)** | Suppression-first optional interpretive block; collision gates; parity checks | Release event reads; release-frequency inference; dependency framing; permanent release narration |
| **`noticed.*` domains** | Observational export vocabulary; parity / collision metadata | User-facing release CTAs; direct narration of `savingsReleases[]`; profiling |
| **Home orchestration** | Band, deferral, orientation, routing | Release modal; release prompts; release history; emotional acknowledgement of reserve use |
| **`activityLog`** | Bounded event telemetry (write path) | Canonical release history; emotional interpretation; UI surfacing of `savings_release` rows |
| **Atmosphere** | Ambient emotional register (calm / protective / reflective / recovering / room) | Reserve-use causality; “because you released” linkage |
| **Orchestration (`geodeOrchestrationSnapshot`, `geodeHomeOrchestrationResolve`)** | Visibility instructions; deferral; disclosure queue | Release-specific reason codes; release-driven home band elevation |
| **Net worth / Goals display** | Materialized asset truth after recompute | Release event narrative; “recovery” delta copy |

### Authority type clarification

| Authority type | Owner | Release relationship |
|----------------|-------|----------------------|
| **Mathematical truth** | Recompute + effective saved | Release **is** input to math via `event_derived` deductions |
| **Continuity acknowledgement** | Release history (archival); optional future user-authored bridges | Factual only today |
| **Emotional interpretation** | User month context + feeling; atmosphere (display register) | **Must not** derive from release ledger |
| **Pacing authority** | Plan memory modifiers (Tier 0 contract); `breathingRoomFloor` (protected) | **Must not** change because of release |
| **Silence authority** | Orchestration deferral, quiet periods, Tier-C HARD_SUPPRESS, empty history section | **Default** for all emotional surfaces re: release |

---

## Task 2 — Silence law (release-specific)

### Default rule

**Silence is the default for all emotional and interpretive surfaces regarding reserve use.**

Release events are **archival facts** until a future governed stage explicitly permits narrower acknowledgement.

### When silence is preferable

| Condition | Law |
|-----------|-----|
| User has not opened archival history | No other surface should mention release |
| Same session as apply | Toast + optional history only; no Reflection/Tier-C/Reality echo |
| `shouldStayQuiet` / high user load | HARD_SUPPRESS all interpretive layers including any future release acknowledgement |
| User month context empty | Do not infer worry/protect from release |
| Release reason was `overbudget` / `emergency` | Reason codes **never** surface in emotional layers (already excluded from history UI) |
| Multiple pressure signals already visible | Silence prevents stacking (Plan overbudget + Reality worry + release narration) |

### When acknowledgement becomes duplication

Acknowledgement is **duplication** (forbidden) when:

- Archival history already shows the event **and** another surface restates it interpretively  
- Reality protect/worried already captures the month **and** Reflection adds release-based flexibility prose  
- Atmosphere is `reflective` or `recovering` **and** Tier-C adds resilience/pacing about the same month  
- Home deferred an item **and** a secondary surface explains reserve use anyway  

### When reserve use should remain archival only

**Always**, unless a future stage satisfies §4 permitted boundaries **and** passes governance review:

- Settings → Reserve use history  
- JSON backup restore envelope  
- Post-apply toast (remaining balance — factual)  
- Release modal preview (pre-confirm math only)

### When continuity should remain implicit

- Buffer step reappearing on Plan (math-visible, no release mention required)  
- Goal saved amount decreasing on Goals card (truth-visible, no commentary required)  
- Net worth delta on dashboard (aggregate truth, no event narration required)

**Implicit continuity is sufficient.** Explicit emotional acknowledgement is optional and gated — never automatic.

---

## Task 3 — Parallel narrator risk analysis

### Scenario matrix

| Scenario | Surfaces active | Risk | Required response |
|----------|-----------------|------|-------------------|
| Reality user wrote “worried about bills” | Reality context + maybe atmosphere `reflective` | Medium — user words OK | **Do not** add release narration; echo user words only in Reflection if gated |
| Reflection “what matters” block | Reflection + month context | Low if echo-only | **Forbidden:** append release inference |
| Tier-C resilience block | Tier-C + atmosphere | High if release linked | Tier-C **must remain silent** on release in v1 |
| Release history visible in Settings | History + user navigates intentionally | Low | History is opt-in depth; no prompts to open it |
| Plan overbudget + release CTA + history same week | Plan + modal + history | Medium stacking | Plan CTA stays factual; no Home prompt; no Reflection auto-block |
| `assessPressure` high + recent release | Internal PAO + history | High if wired | PAO **must not** read `savingsReleases[]` for scoring |

### Suppression hierarchy (release-aware extension)

When multiple narrators could speak about the same month:

```
1. Tier 0 math (always allowed — numbers only, no prose about release)
2. User-initiated release surfaces (modal, toast, history view)
3. User-authored Reality month context (protect / worried / success)
4. Atmosphere (ambient — must not cite release)
5. Reflection blocks (opt-in — must not cite release without future contract)
6. Tier-C (max one block — must not cite release in v1)
7. Orchestrated prompts (forbidden for release)
```

### Narrator precedence

| If conflict | Winner |
|-------------|--------|
| Release history vs Reflection interpretation | **History wins as fact**; Reflection must not reinterpret |
| User month context vs inferred release struggle | **User words win** |
| Atmosphere `recovering` vs any release acknowledgement | **Silence wins** (Tier-C already HARD_SUPPRESS) |
| Plan overbudget truth vs release “relief” copy | **Plan truth wins**; release copy must state Monthly Left unchanged |
| Silence law vs optional acknowledgement stage | **Silence wins** unless explicit opt-in + governance amendment |

### Silence fallback

When in doubt: **say nothing outside archival/history and user-initiated release flows.**

---

## Task 4 — Permitted acknowledgement boundaries

### Allowed (today or future with explicit stage)

| Class | Example | Surface |
|-------|---------|---------|
| **Mathematical truth** | Saved £28 after £32 release | Goals, net worth, Plan buffer gap |
| **Factual confirm** | “Recorded. Emergency Buffer now shows £28.” | Toast |
| **Archival continuity** | “Emergency Buffer · −£32 · 20 Jun 2026 · Recorded as reserve use” | Settings history |
| **User-initiated action** | “Use part of a reserve” → modal | Plan overbudget CTA |
| **User-authored continuity** | User types in Reality protect/worried (their words) | Reality |
| **Optional reflective framing (future, gated)** | User opens Reflection **after** saving month context; block echoes protect/worried — **not** release | Reflection (existing law) |

### Forbidden (permanent without contract breach)

| Class | Forbidden example |
|-------|-------------------|
| Inferred struggle | “Looks like a heavy month” **because** release occurred |
| Inferred recovery | “Stability restored”, “getting back on track” |
| Dependency framing | “You relied on savings”, “you needed your buffer” |
| Pressure attribution | “You were under pressure”, “pressure managed” |
| Frequency interpretation | “You’ve used reserves several times lately” |
| Behavioural scoring | Release count → user load / resilience score |
| Hidden pacing | Softening Plan because release happened |
| AI coping narrative | “It’s okay that you needed this” (system voice) |
| Reason-code narration | Surfacing `emergency` / `overbudget` reason in emotional layers |
| Orchestrated prompts | “Review your recent reserve use” on Home |

### Copy test (binding)

Before any future release acknowledgement ships, copy must pass:

1. **Could this sentence exist without the release event?** If no → too causal.  
2. **Does this imply the user failed?** If yes → forbidden.  
3. **Does this duplicate archival history?** If yes → forbidden unless user explicitly opened both.  
4. **Does this change what the user should do?** If yes → forbidden (no recommendations).

---

## Task 5 — Reality boundary

### May Reality EVER acknowledge reserve use?

**Default: No.**

Reality owns **user-authored** difficult-month context and sense-check capture — not ledger events.

| Question | Ruling |
|----------|--------|
| May Reality read `savingsReleases[]`? | **No** (current and v1 contract) |
| May Reality show “you used reserves”? | **No** |
| May Reality infer posture from release? | **No** — *reserve use alone must not define emotional posture* |
| May Reality link to Settings history? | **No** — no funnels from emotional capture to ledger |
| May Plan overbudget CTA remain? | **Yes** — Plan surface, user-initiated, factual copy (already governed under Release stack) |

### User-authored context outranks reserve events

If user writes protect/worried/success, that text is the **only** legitimate Reality emotional signal. Release events must not:

- Pre-fill worried  
- Suggest protect topics  
- Change feeling chip defaults  
- Alter `geodeGetContextPosture` inputs  

### Reserve use and month posture

Posture inputs today: Reality check gap, feeling chips, income type, dependants, user month context.

**Release count, amount, or recency are not posture inputs** — permanently, unless this contract is formally amended with a user-opt-in capture stage (not recommended).

---

## Task 6 — Reflection boundary

### May Reflection mention reserve flexibility?

**Default: No.**

Reflection must not become **AI emotional finance narration.**

| Question | Ruling |
|----------|--------|
| Read `savingsReleases[]` in Reflection stack? | **Forbidden** (current + v1) |
| Mention “reserve use” in blocks? | **Forbidden** without future gated stage |
| Is archival history sufficient? | **Yes** — for users who want a trace; Reflection is not required to duplicate |
| Require user-authored context first? | **Yes** — any future acknowledgement must require saved month context **and** explicit user entry to Reflection |
| Require opt-in continuity? | **Yes** — no auto-block on apply day; no block triggered solely by release |

### Reflection must remain

- Opt-in (Reality entry gate / user tap)  
- Block-capped (existing ExperienceModel limits)  
- Suppression-first (quiet, atmosphere, collision rules)  
- Echo-biased toward user words — not ledger inference  

### Forbidden Reflection patterns

- “You used part of your buffer this month”  
- “Flexibility helped carry the month”  
- “Reserves absorbed pressure” (system voice)  
- Any block triggered by `savingsReleases.length > 0` alone  

---

## Task 7 — Tier-C boundary

### Ruling: Tier-C remains **permanently silent on reserve use** in v1

Narrow future exception requires **all** of:

1. Explicit governance amendment (new stage, not 80R-F)  
2. User-authored month context present (`hasAny`)  
3. User opt-in Reflection session (not apply-day auto)  
4. `geodeNoticedParityCheck` pass  
5. Collision gate pass — no atmosphere `recovering`/`reflective`  
6. `userLoad` not high/critical  
7. `shouldStayQuiet` false  
8. Max one Tier-C block already enforced  
9. Copy map audit — no forbidden phrases  
10. Copy echoes user words only — **never** release ledger  

**Recommended default for product philosophy:** maintain **permanent silence** on release for Tier-C. The resilience domain explains held-back plan signals — not reserve spending.

### Existing suppression assets (must preserve)

| Gate | Effect |
|------|--------|
| `quiet.shouldStayQuiet` | HARD_SUPPRESS |
| `userLoad` high/critical | HARD_SUPPRESS |
| `atmosphere === recovering \|\| reflective` | HARD_SUPPRESS |
| `parityPass === false` | HARD_SUPPRESS |
| `recommendSilence` / collision HIGH | HARD_SUPPRESS |
| `max_one_tier_c` | HARD_SUPPRESS |

### Atmosphere precedence

Atmosphere **outranks** Tier-C. Release events must not influence atmosphere derivation.

---

## Task 8 — Final governance contract

### A. Verdict: **PASS**

Runtime silence matches philosophical intent. Archival visibility (80R-D.2.3) closes the continuity gap without emotional narration. This contract formalizes boundaries so future work cannot drift.

### B. Canonical ownership hierarchy

```
Tier 0 — Mathematical truth
  recompute · effective saved · net worth · Plan buffer gap visibility

Tier 1 — Factual release & archival continuity
  apply · confirm copy · toast · Settings reserve use history · backup

Tier 2 — User-authored emotional continuity
  Reality month context · feeling chips · carry suggestion (not auto-applied)

Tier 2 — Ambient register (non-causal)
  atmosphere · orchestration band (must not read release ledger)

Tier 3 — Opt-in interpretive (suppression-first)
  Reflection blocks · Tier-C (must not read release ledger in v1)

Forbidden tier collapse
  release event → emotional posture · pacing · affordability · orchestration
```

### C. Silence hierarchy

1. **Silence** (default for Reality / Reflection / Tier-C / Home re: release)  
2. **Archival facts** (history — user navigates intentionally)  
3. **User words** (month context)  
4. **User-initiated release flows** (modal / toast)  
5. **Mathematical visibility** (balances, Plan gap — no release prose)  

Never invert: emotional interpretation must not outrank silence.

### D. Forbidden continuity behaviours

- Inferring struggle, recovery, or dependency from release  
- Release-frequency analytics or “pattern” summaries  
- Surfacing reason codes in emotional layers  
- Orchestrated prompts to review release history  
- Auto Reflection block on apply  
- Tier-C narration of reserve flexibility (v1)  
- PAO / posture / atmosphere inputs from `savingsReleases[]`  
- Plan / affordability / breathingRoomFloor mutation from release  
- Multiple surfaces narrating the same release in one session  
- Persistent “release profile” in `S`  

### E. What future stages may safely build

| Stage type | Allowed if… |
|------------|-------------|
| **80R-D.2.4 CSV release rows** | Read-only export extension; no new interpretation; schema addendum audited |
| **Release history UX polish** | Still Settings/archival; still hidden when empty; no prompts |
| **Optional user note improvements** | User-authored only |
| **Legacy `base_delta` migration tool** | Math integrity only |
| **Reality bridge (spec-only first)** | User-opt-in; copy map; no ledger reads without amendment |
| **Reflection echo (spec-only first)** | Requires month context + user entry; echo user words; no release read |

Each stage requires: copy audit, collision audit, explicit amendment to this contract if boundaries change.

### F. What must remain permanently impossible

Without a full governance revision and explicit product decision:

- Behavioural scoring from release count or amount  
- Release dependency / “ reliance” insights  
- AI coping narratives tied to release  
- Predictive or automated release suggestions  
- Hidden pacing authority from release events  
- Reserve-based affordability mutation  
- Emotional profiling stored in `S` from release patterns  
- Home / Plan / orchestration prompts driven by release history  
- Tier-C as default interpreter of reserve flexibility  
- Psychological narration of the user from ledger events  

---

## Protected (unchanged by this stage)

`getMonthPlan`, affordability, `calcMonthlyLeftover`, `breathingRoomFloor`, debt sequencing, investment sizing, release accounting, release apply path, payment canonicalisation, Reflection runtime, Tier-C runtime, Home orchestration, `service-worker.js`, localStorage schema, export schema.

---

## Files touched

| File | Change |
|------|--------|
| `docs/stages/80R/80R-F-reality-reflection-continuity-boundary.md` | This contract |

## Files intentionally not touched

- `index.html` (read-only inspection only)  
- `service-worker.js`, backup/export runtime, all protected surfaces  

---

## Service worker

**No bump.**

---

## Recommended next stage (post governance review)

**80R-G — Release continuity QA & copy freeze** (optional): manual cross-surface QA checklist confirming silence holds after any adjacent work; no new features.

**80R-D.2.4 — CSV release rows** (optional, separate): archival export only if users request spreadsheet audit — not emotional continuity.

**Do not recommend next:** behavioural analytics, release scoring, Reality/Reflection auto-acknowledgement builds, orchestration hooks, predictive release, Plan modifications.

---

## Core philosophy (binding)

> Sometimes reserves are doing their job.  
> Beynd may preserve continuity around that truth.  
> Beynd must never psychologically narrate the user.

Release history preserves continuity.  
It must not become behavioural judgement.
