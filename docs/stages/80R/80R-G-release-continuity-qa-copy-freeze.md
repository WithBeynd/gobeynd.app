# Stage 80R-G — Release Continuity QA & Copy Freeze

**Type:** Read-only QA + semantic baseline freeze (no runtime changes)  
**Verdict:** **PASS** (silence holds; copy baseline frozen; one known ambiguity documented)  
**Date:** June 2026  
**Parents:** [80R-F Continuity Boundary Contract](./80R-F-reality-reflection-continuity-boundary.md) · [80R-D.2.3 Release History](./80R-D.2.3-release-history-visibility.md) · [80R-D.2.2 Event-Derived Deduction](./80R-D.2.2-event-derived-reserve-deduction.md)

---

## Before any recommendation

### 1. Why semantic stability is now more important than new release features

The Savings Release stack is **functionally complete** for v1:

- Event-derived reserve accounting works  
- T0–T4 classification is deterministic  
- Archival history exists (Settings → Data)  
- Monthly Left and Plan math remain isolated  

Further **feature** work (Reflection acknowledgement, Home prompts, frequency analytics) would increase **semantic drift risk** without adding financial truth. Adjacent teams (Reality, Reflection, Tier-C, orchestration) are one import away from reading `savingsReleases[]` and narrating reserve use. A **copy and silence freeze** locks the baseline before any adjacent stage touches nearby code.

### 2. Continuity boundaries established in 80R-F

| Boundary | Ruling |
|----------|--------|
| **Tier 0** | Recompute + effective saved — release is math input only |
| **Tier 1** | Apply, modal, toast, Settings history — factual only |
| **Tier 2 emotional** | User-authored Reality month context — outranks ledger |
| **Tier 3 interpretive** | Reflection / Tier-C — **must not read release ledger in v1** |
| **Silence default** | Reality, Reflection, Tier-C, Home, orchestration silent on release |
| **Archival only** | History hidden when empty; no prompts |
| **Forbidden** | Inferred struggle/recovery, frequency summaries, reason-code narration in emotional layers |

### 3. Why silence-first architecture must now be regression-tested

80R-D.2.3 added **visibility** without **narration** — the highest-risk moment for accidental drift. A developer wiring history into Home, or Reflection reading release count, would violate 80R-F silently. Regression QA confirms:

- Visibility did not become prompts  
- History accumulation does not trigger summaries  
- Overbudget + release CTA + history do not stack into emotional diagnosis  

Silence must remain dominant **after** multiple releases, repeated months, and history growth.

### 4. Systems most at risk of semantic drift

| Risk rank | System | Drift mechanism |
|-----------|--------|-----------------|
| **1** | **Reflection / Stability Room** | `geodeStabilityRoomSnapshot` already composes posture + month context — tempting to add `savingsReleases.length` |
| **2** | **Tier-C / `noticed.flexibility`** | Name collision with “reserve flexibility” — must not read ledger |
| **3** | **Plan overbudget block** | Release CTA adjacent to “back in balance” — must not imply release fixes overbudget |
| **4** | **Home orchestration** | Deferred queue could gain release disclosure items |
| **5** | **Copy map (`geodeSavingsReleaseCopyForSource`)** | Single edit affects CTA, modal, preview, toast |
| **6** | **Modal reason dropdown** | User capture labels could leak into history or emotional layers |
| **7** | **Stale code comments** | e.g. “reduces base balances later” mislead future implementers |
| **8** | **activityLog** | Obvious hook for “recent release” nudges — currently write-only |

### 5. What this stage explicitly does NOT do

- No new features, UI, or orchestration hooks  
- No Reflection / Tier-C / Reality / Home changes  
- No copy edits (freeze documents current state)  
- No CSV/export redesign  
- No release recommendations or analytics  
- No runtime commits required for PASS  

---

## Task 1 — Cross-surface release wording audit

**Source:** `geodeSavingsReleaseCopyForSource`, modal/preview/toast/history, Plan overbudget CTA, Settings data drill (runtime inspection).

### Stable (canonical — frozen)

| Surface | Phrase / pattern |
|---------|------------------|
| **CTA (default)** | `Use part of a reserve` |
| **CTA (buffer)** | `Use part of your buffer` |
| **CTA (flexible)** | `Use part of this reserve` |
| **CTA (investment)** | `Use part of an investment reserve` |
| **CTA (goal)** | `Use part of a saved amount` |
| **Modal title** | `Record reserve use` / class-specific “Use part of…” |
| **Intro** | `This records reserve use. It reduces your saved balance and does not change Monthly Left or your income and spending lines.` |
| **Preview empty** | `Choose a source and enter an amount… Monthly Left will not change.` |
| **Preview labels** | `Amount recorded`, `Remaining balance`, `Net worth`, `Available` |
| **Truth line** | `This does not change Monthly Left. It records that part of your reserve supported the month.` |
| **Plan truth (overbudget)** | `The plan still reflects the month as it stands.` |
| **Tradeoff (default)** | `This may trade against what this money was set aside for.` |
| **Tradeoff (investment)** | `This would trade against longer-term growth.` |
| **Confirm** | `Confirm release` |
| **Success (fallback)** | `Recorded. Your reserve balance now reflects what you used.` |
| **Success (primary)** | `Recorded. [name] now shows [amount].` |
| **History section title** | `Reserve use history` |
| **History intro** | `A factual record of reserve use on this device. This does not change Monthly Left or your plan.` |
| **History row footnote** | `Recorded as reserve use` |
| **History balance** | `Balance after: [amount]` |
| **History type labels** | `Buffer`, `Investment reserve`, `Linked investment reserve`, `Saved amount` |
| **Modal empty** | `No reserves are available to record right now.` |
| **Reserve reduce** | `Your reserve balance will reduce by [amount].` |
| **Buffer preview** | `This buffer can support the month if you choose.` |
| **Default preview** | `This can support the month if you choose.` |

### Ambiguous (frozen — do not amplify)

| Phrase | Location | Concern | Freeze ruling |
|--------|----------|---------|---------------|
| `This can give the month a little more room.` | T2 `flexible_reserve` `previewLine` | Soft cash-flow / affordability hint while truth line denies Monthly Left change | **Frozen as-is.** Future copy edits require 80R-G amendment. **Do not** reuse this phrasing in other tiers or surfaces. |
| `part of your reserve supported the month` | `truthLine` | Mild continuity framing; acceptable with adjacent Monthly Left denial | **Frozen.** Do not strengthen to “helped” / “eased pressure”. |
| `Confirm release` | confirm button | Technical “release” vs user “record use” | **Frozen.** Low risk. |
| Modal **Reason** dropdown labels | User capture only (`Tight month / over budget`, `Emergency`, etc.) | Could feel judgemental if ever surfaced in history or Reflection | **Must remain modal-only.** `geodeSavingsReleaseReasonLabel` exists but has **no UI consumer** today — keep it that way. |

### Unsafe — none found in user-facing release copy

Verified **absent** from release surfaces:

- Pressure covered / remaining pressure  
- Use saved money  
- Problem solved / stability restored  
- You relied on / you needed  
- Recovery / coping / struggle framing  
- Affordability repair implication in toast or history  
- Release frequency / dependency language  

### Adjacent (not release copy — stable in context)

| Phrase | Surface | Ruling |
|--------|---------|--------|
| `back in balance` | Plan overbudget card | Refers to **income vs expenses**, not release outcome — **stable** |
| `Over budget` | Plan overbudget kicker | Cash-flow truth — **stable** |
| Export CSV subtitle | Settings | `Spreadsheet summary. Not a full restore file.` — no release mention — **stable** |

### Non-user-facing drift (document only — no runtime fix this stage)

| Location | Stale content | Risk |
|----------|---------------|------|
| `geodeSavingsReleaseSnapshot` audit note ~7281 | `apply build reduces base balances later` | Misleads devs (D.2.2 is event-derived) |
| Comment ~6816 | `preview only until explicit release build` | Outdated (81D-3+ shipped) |

**Freeze ruling:** Future code touch in release module should update comments; not required for 80R-G PASS.

---

## Task 2 — Silence regression audit

| Check | Result | Evidence |
|-------|--------|----------|
| Reflection silent on release | **PASS** | `geodeStabilityRoomSnapshot` sources: orchestration, posture, month context, plan rationale — **no** `savingsReleases` |
| Reality silent | **PASS** | `geodeGetContextPosture`, `assessPressure` — no ledger reads |
| Tier-C silent | **PASS** | Gates use atmosphere, parity, user load — no release domain |
| Home silent | **PASS** | `geodeHomeOrchestrationResolve` — no release reason codes |
| No orchestration hooks | **PASS** | No deferred/disclosure items for release |
| No hidden prompts to history | **PASS** | History only in Settings; section empty when no events |
| Multiple releases | **PASS** | List capped at 50; no count summary, no “often” language |
| Repeated months | **PASS** | No month-over-month release analytics |
| Overbudget + release CTA | **PASS** | CTA factual; `planTruthLine` denies plan change; overbudget amount unchanged by release |
| History accumulation | **PASS** | Archival rows only; no behavioural interpretation |

**Silence still dominates** after visibility addition.

---

## Task 3 — Adjacent-system drift audit

| System | Current coupling | Future risk |
|--------|------------------|-------------|
| **Overbudget flow** | Secondary CTA opens modal; primary CTA edits expenses | Medium — copy must never say release closes gap |
| **Goals cards** | Show materialized saved only | Low — numbers without release prose |
| **activityLog** | Write-only `savings_release` | **High if read** — forbidden for UI nudges |
| **CSV export** | Materialized balances; no event rows | Low until D.2.4 — must stay archival |
| **JSON backup** | Full `savingsReleases[]` | Low — device-owned archive |
| **Onboarding** | No release mention | Low |
| **`geodeReserveClassifySource`** | Internal T0–T4; copyKey only | Medium — tiers must not appear in history UI |
| **`noticed.flexibility`** | Reality feeling + month context | **High name collision** — must never ingest ledger |
| **Atmosphere** | Posture / held-back / month context | Medium — must not derive from release count |

**Hidden semantic assumption to guard:** “Flexibility” in product language means **user-authored context**, not **reserve use events**.

---

## Task 4 — Legacy compatibility audit

| Scenario | Behaviour | Verdict |
|----------|-----------|---------|
| **`base_delta` records** | Display in history via formatter (no mode filter) | **PASS** — factual archive; math may differ (legacy) |
| **`event_derived` records** | Display + math deduct | **PASS** |
| **Missing `sourceId` / deleted goal** | Row skipped at normalize if no sourceId or amount ≤ 0; else name `Reserve` | **PASS** — calm degradation |
| **Missing date** | Falls back to `createdAt` | **PASS** |
| **Missing `remainingBalance`** | Row shown without “Balance after” line | **PASS** |
| **`confirmedByUser: false`** | Excluded from history | **PASS** |
| **Double narration** | History + toast same session only | **PASS** — both factual; no Reflection echo |
| **Reason codes in history** | **Not shown** | **PASS** |

No “corrupted continuity” messaging exists.

---

## Task 5 — Governance freeze recommendations

### Canonical copy phrases (binding set)

All phrases listed in **Task 1 — Stable** are **frozen**. Changes require:

1. Explicit stage ID  
2. Copy audit against forbidden list below  
3. 80R-F boundary check  
4. Silence regression checklist (below)

### Permanently forbidden phrases (release surfaces)

- Pressure covered / remaining pressure / pressure managed  
- Use saved money  
- Problem solved / back on track / stability restored  
- You relied on / you needed / under pressure (system voice)  
- Recovery / coping / struggle / failure / irresponsible  
- Healthy / unhealthy / responsible / careless (financial judgement)  
- Release frequency / often / pattern / dependency  
- Monthly Left improved / gap closed (by release)  
- Emergency support activated / pressure absorbed  

### Surfaces permanently forbidden from release narration (v1)

- Home (including orchestration disclosure)  
- Reality (page, month context auto-fill, posture)  
- Reflection / Stability Room blocks  
- Tier-C  
- Goals list / dashboard hero  
- Notifications / prompts / streaks  
- CSV summary prose (until governed D.2.4)  

### Future-stage guardrails

1. **No `savingsReleases` reads** in Reflection, Reality, Tier-C, Home, orchestration without 80R-F amendment.  
2. **Reason codes** stay out of history and emotional layers.  
3. **Copy changes** only through `geodeSavingsReleaseCopyForSource` — single choke point.  
4. **Visibility** remains opt-in navigation (Settings), hidden when empty.  
5. **Do not amplify** frozen ambiguous `flexible` preview line elsewhere.  
6. **activityLog** must not become a nudge source for release.  

### QA checklist for future release-related work

- [ ] Grep: no new `savingsReleases` readers outside allowlist (recompute, apply, preview, history, backup)  
- [ ] Grep: no `savings_release` activityLog readers  
- [ ] Copy audit: no forbidden phrases  
- [ ] Monthly Left unchanged after apply (manual)  
- [ ] Plan overbudget amount unchanged after apply (manual)  
- [ ] Reflection/Reality/Home render unchanged after release (manual)  
- [ ] History section still hidden when `savingsReleases.length === 0`  
- [ ] No new prompts linking to history  
- [ ] Tier-C / atmosphere gates still suppress without release inputs  
- [ ] 80R-F silence hierarchy preserved  

---

## Task 6 — Final review

### A. Verdict: **PASS**

- Silence regression: **PASS**  
- No unsafe user-facing copy: **PASS**  
- One frozen ambiguity (`flexible` preview line): documented, not blocking  
- Legacy compatibility: **PASS**  
- No runtime changes required  

### B. Canonical continuity wording set

See **Task 1 — Stable** table (binding).

### C. Permanently silent systems (v1)

Reality · Reflection · Tier-C · Home · orchestration · atmosphere (re: release) · `noticed.*` (re: ledger) · activityLog consumers · CSV event narration.

### D. High-risk future drift areas

1. Reflection stack adding ledger reads  
2. `noticed.flexibility` name collision with reserve flexibility  
3. Home deferred disclosure for release  
4. Reason codes surfacing in history or emotional UI  
5. Stale dev comments encouraging base-balance mutation  
6. Copy drift in `geodeSavingsReleaseCopyForSource`  
7. activityLog → nudge pipeline  

### E. What future stages may safely modify

| Stage | Allowed |
|-------|---------|
| **80R-D.2.4** | CSV release rows (archival columns only) |
| **Copy micro-stage** | T2 flexible preview tighten **only** with freeze amendment |
| **Comment hygiene** | Dev comments in release module only |
| **Legacy migration** | `base_delta` → `event_derived` tooling (math integrity) |

Each requires silence QA checklist pass.

### F. What must remain governance-protected

- Release accounting + apply path  
- Monthly Left / affordability / breathingRoomFloor isolation  
- 80R-F silence hierarchy  
- Forbidden phrase list  
- Surface forbidden list  
- Reason codes modal-only  
- No behavioural scoring from release data  

---

## Protected (unchanged)

`getMonthPlan`, affordability, `calcMonthlyLeftover`, `breathingRoomFloor`, debt sequencing, investment sizing, release accounting, release apply path, payment canonicalisation, Reality/Reflection/Tier-C runtime, orchestration hierarchy, `service-worker.js`, localStorage schema, export schema.

---

## Files touched

| File | Change |
|------|--------|
| `docs/stages/80R/80R-G-release-continuity-qa-copy-freeze.md` | This document |

## Files intentionally not touched

- `index.html` (inspection only)  
- All runtime surfaces  

---

## Service worker

**No bump.**

---

## Core philosophy (binding)

> Sometimes reserves are doing their job.  
> Beynd may preserve factual continuity around that.  
> Silence, user authorship, and financial truth must remain dominant.

Reserve use must never become behavioural narration.
