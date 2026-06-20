# 80R-B — Source Classification Model

**Stage:** 80R-B  
**Type:** Governance specification + runtime audit (no implementation)  
**Verdict:** NEEDS ATTENTION (model defined; runtime flat eligibility must be tiered before expansion)  
**Parent:** [80R-A.1 — Savings Release Continuity Contract](./80R-A.1-savings-release-continuity-contract.md)  
**Related audits:** 80R-A, 80R-A.2  
**Related implementation (audited, not modified):** [81D-2](../81/81D-2-savings-release-shadow-model.md), [81D-3](../81/81D-3-savings-release-confirmation-sheet.md)

---

## Objective

Design a **reserve/source classification model** that differentiates emergency buffers, flexible savings, goal reserves, Cash ISA, investments, pensions, property, and unknown-purpose assets **before** further Savings Release runtime expansion.

**Core principle:** Classification preserves emotional truth, continuity meaning, and deterministic safety — **not** maximisation of available cash.

This stage is **not** release UI redesign, Plan rewrite, affordability mutation, reserve optimisation, investment liquidation logic, or Reflection interpretation expansion.

---

## Scope

| In scope | Out of scope |
|----------|--------------|
| Data structure audit | Runtime code changes |
| Reserve class hierarchy | Release ordering implementation |
| Classification precedence rules | New localStorage keys (future audited stage) |
| Eligibility tier model | Plan / affordability mutation |
| Runtime gap analysis | Home orchestration changes |
| Safe insertion-point map | service-worker bump |
| Future user-control assessment | Reflection blocks |

---

## Files touched

- `docs/stages/80R/80R-B-source-classification-model.md` (this file)

---

## Files intentionally not touched

- `index.html`, `service-worker.js`, backup/export runtime

---

## 1. Current reserve data structures (runtime audit)

### 1.1 Goal row schema

| Field | Type | Used for release? | Semantic weight |
|-------|------|-------------------|-----------------|
| `id` | string | Yes — `sourceId` | Identity |
| `name` | string | Display | Weak heuristic (buffer phrases) |
| `amount` | number | No | Target — Plan/buffer readiness |
| `saved` | number | Yes — effective balance | Display + eligibility |
| `baseSaved` | number | Yes — apply mutation | Confirmed baseline |
| `monthly` | number | No | Plan pace |
| `targetDate` | string/null | No | Display |
| `cat` | enum | **Partial** — `emergency` → buffer | Primary goal taxonomy |
| `isPrimary` | boolean | No | Plan focus |
| `col` | string | No | UI |

**Goal categories (`GOAL_LABELS`):** `holiday`, `emergency`, `home`, `car`, `education`, `wedding`, `business`, `retirement`, `tech`, `other`.

**Missing on goals:** `purpose`, `horizon`, liquidity, protection flag, reserve role, release lock.

### 1.2 Investment row schema

| Field | Type | Used for release? | Semantic weight |
|-------|------|-------------------|-----------------|
| `id` | string | Yes | Identity |
| `name` | string | Display | None for classification |
| `type` | enum | **No today** | **High** — should drive class |
| `balance` / `baseBalance` | number | Yes | Effective / apply |
| `returns` | number | No | Display |
| `platform` | string | No | Display |
| `notes` | string | No | User context only |
| `purpose` | `growth` \| `goal-linked` \| absent | **No today** | Medium |
| `horizon` | `short` \| `medium` \| `long` \| absent | **No today** | Medium |
| `contributionStyle` | `one-off` \| `recurring` \| absent | No (display only) | Low |
| `goalId` | string \| absent | **Partial** — linked_investment tag | High |

**Investment types (`INV_LABELS`):** `isa`, `stocks_isa`, `pension`, `stocks`, `crypto`, `savings`, `property`, `bonds`, `app`, `other`.

**Cash ISA:** No separate entity — user selects `type: 'isa'` or `'stocks_isa'` (or names account “Cash ISA”). Smart import recognises “cash isa” in payment text only.

### 1.3 Linked goal ↔ investment

| Rule | Function | Release effect |
|------|----------|----------------|
| Goal with linked inv balance > 0 | `geodeGoalHasPositiveLinkedInvestmentForState` | Goal row **excluded** from snapshot list |
| Progress SSOT | `geodeGoalEffectiveSavedFromState` | Uses linked inv balance for goal display |
| Release apply | `geodeApplySavingsRelease` | Must use **investment** row; tagged `linked_investment` |

### 1.4 Release event schema (`S.savingsReleases[]`)

| Field | Notes |
|-------|-------|
| `sourceType` | `buffer` \| `goal` \| `investment` \| `linked_investment` (runtime strings) |
| `sourceId`, `amount`, `reason`, `date`, `ym`, `relatedYm` | Audit trail |
| `remainingBalance`, `confirmedByUser`, `note` | Post-apply truth |

**Missing:** reserve class, tier, classification reason codes (future optional, audited).

### 1.5 Legacy / adjacent fields

| Field | Role |
|-------|------|
| `S.emergencyBuffer` | Legacy buffer **target** only (`geodeResolveBufferTarget`) |
| No `S.bufferBalance` | Buffer = emergency goal saved |
| No liquidity flag anywhere | — |
| `activityLog` `savings_release` | Ephemeral; not backup-restored |

### 1.6 Metadata summary

| Status | Fields |
|--------|--------|
| **Exists and usable** | `goal.cat`, `goal.name`, `investment.type`, `investment.purpose`, `investment.horizon`, `investment.goalId` |
| **Inferred today** | Buffer via `geodeIsEmergencyBufferGoal` (cat + conservative name phrases) |
| **Overloaded** | `investment.type:'savings'` vs goal savings; `isa` vs Cash ISA vs Stocks ISA |
| **Missing** | User protection flag, reserve role, release suppress, liquidity, explicit Cash ISA class |
| **Display-only today** | `purpose`, `horizon`, `contributionStyle` (`geodeInvMeta*` helpers) |

**Schema explosion not required** for v1 classification — existing fields sufficient with deterministic rules.

---

## 2. Current asset taxonomy and eligibility assumptions

### 2.1 Net worth / dashboard assets

```
netWorth = sum(goal effective saved) + unlinked investment balances − debt
```

- Linked investments count under goal effective saved, not unlinked bucket.
- Release reduces `baseSaved` / `baseBalance` → net worth drops correctly.

### 2.2 Current release eligibility (flat)

**Function:** `geodeSavingsReleaseEligibility`

| Check | Rule |
|-------|------|
| Resolve source | goal or investment by id |
| Linked goal | Goal ineligible → `use_linked_investment_row` |
| Balance | `availableBalance > 0` → **eligible** |
| Classification | `geodeSavingsReleaseSourceType` → label tag only |

**No use of:** `cat` (except buffer tag), `type`, `purpose`, `horizon`, protection.

### 2.3 Current source listing order

**Function:** `geodeSavingsReleaseSourcesSnapshot`

1. All goals (array order), skipping linked-inv goals  
2. All investments (array order)  

**Modal default:** `eligible[0]` — first eligible row in that order.

### 2.4 Current fallback behaviour

| Case | Behaviour |
|------|-----------|
| No sources | Modal empty state |
| No eligible (zero balance) | Empty state |
| Unknown source | `source_not_found` |
| Pension with balance | **Eligible** (same as buffer) |
| Goal `cat: retirement` | **Eligible** as generic goal |

---

## 3. Reserve classification hierarchy

### 3.1 Canonical reserve classes

| Class ID | Meaning | Maps from |
|----------|---------|-----------|
| **`continuity_reserve`** | Emergency / safety buffer | Emergency goal (`geodeIsEmergencyBufferGoal`) |
| **`flexible_reserve`** | Short-term, relatively flexible cash savings | `investment.type` ∈ `savings`; `isa`/`stocks_isa` + `horizon:'short'`; optional future goal heuristic |
| **`purpose_reserve`** | Earmarked goal or goal-linked capital | Non-emergency goals; investments with `goalId` or `purpose:'goal-linked'` |
| **`protected_reserve`** | User-declared do-not-suggest | Future `releaseProtected` flag |
| **`future_capital`** | Growth / medium-term investments | `stocks`, `crypto`, `bonds`, `app`, `stocks_isa` (default), `isa` + medium horizon, `other` invest |
| **`locked_capital`** | Pension, property, long-horizon locked | `type` ∈ `pension`, `property`; OR `horizon:'long'` on any investment |
| **`unknown_reserve`** | Insufficient metadata | Unclassified goal `cat:other`; investment missing type/horizon/purpose |

### 3.2 Class attribute matrix

| Class | Emotional availability | Release posture | Continuity meaning | Default visibility | Suppression | Stronger confirm? | Hidden entirely? |
|-------|------------------------|-----------------|--------------------|--------------------|-------------|---------------------|------------------|
| **continuity_reserve** | High (for pressure absorption) | Supported with buffer copy | Buffer doing its job | Show in overbudget flow | None | Standard confirm | No |
| **flexible_reserve** | Medium | Cautious | Flexible cash use | Show | None | Standard + tradeoff line | No |
| **purpose_reserve** | Low–medium | Tradeoff explicit | Goal progress shifts | Show | Never default | Standard + goal name tradeoff | No |
| **protected_reserve** | User-defined low | User blocked | User intent | **Hidden** | Hard | N/A unless override | Yes (default) |
| **future_capital** | Low | Last-resort | Long-term tradeoff | Show with warning | Deprioritise sort | **Extra friction** (checkbox ack) | No (v1) |
| **locked_capital** | Very low | Discouraged | Major life capital | **Hidden** in v1 | Hard | Strong + future override stage | **Yes** |
| **unknown_reserve** | Unknown → conservative | Conservative | Unclear intent | Show low in list | Deprioritise | Standard + “you chose this source” | No |

---

## 4. Classification sources and precedence

### 4.1 Deterministic precedence (no AI, no profiling)

Apply rules **top to bottom**; first match wins.

#### Goals (kind = goal)

| Priority | Condition | Class |
|----------|-----------|-------|
| P0 | Future: `goal.releaseProtected === true` | `protected_reserve` |
| P1 | `geodeIsEmergencyBufferGoal(goal)` | `continuity_reserve` |
| P2 | `geodeGoalHasPositiveLinkedInvestmentForState` | *Classify linked investment row instead* |
| P3 | `goal.cat === 'retirement'` | `locked_capital` (goal-side; rare) |
| P4 | `goal.cat` ∈ `holiday`, `home`, `car`, `wedding`, `education`, `business`, `tech` | `purpose_reserve` |
| P5 | `goal.cat === 'other'` or missing | `unknown_reserve` |

#### Investments (kind = investment)

| Priority | Condition | Class |
|----------|-----------|-------|
| P0 | Future: `investment.releaseProtected === true` | `protected_reserve` |
| P1 | `type === 'pension'` OR `type === 'property'` | `locked_capital` |
| P2 | `horizon === 'long'` | `locked_capital` |
| P3 | `type === 'savings'` | `flexible_reserve` |
| P4 | `type === 'isa'` AND `horizon === 'short'` | `flexible_reserve` |
| P5 | `goalId` set OR `purpose === 'goal-linked'` | `purpose_reserve` |
| P6 | `type === 'isa'` OR `type === 'stocks_isa'` | `flexible_reserve` if `horizon === 'short'`, else `future_capital` |
| P7 | `type` ∈ `stocks`, `crypto`, `bonds`, `app` | `future_capital` |
| P8 | `horizon === 'medium'` | `future_capital` |
| P9 | `type === 'other'` or missing metadata | `unknown_reserve` |

### 4.2 Incomplete metadata policy

| Situation | Rule |
|-----------|------|
| Investment with balance but empty `type`, `purpose`, `horizon` | **`unknown_reserve`** → tier 2 conservative, sort last among eligibles |
| Goal with only name (no cat) | **`unknown_reserve`** |
| Cash ISA stored as `stocks_isa` without horizon | **`future_capital`** (conservative — not assumed flexible) |
| User names goal “Emergency dental” | **Not** continuity_reserve (phrase guard in `geodeIsEmergencyBufferGoal`) |

**Forbidden:** behavioural inference, income profiling, “user usually releases from X”, LLM classification.

---

## 5. Release eligibility tiers

### 5.1 Tier model

| Tier | Class(es) | Release eligible? | Overbudget flow | UX friction | Copy posture | Reflection later? |
|------|-----------|-------------------|-----------------|-------------|--------------|-------------------|
| **T0** | `continuity_reserve` | Yes | Allowed | Standard | Buffer / temporary support | Yes — calm, optional |
| **T1** | `flexible_reserve` | Yes | Allowed | Standard | Flexible reserve | Yes — light |
| **T2** | `purpose_reserve`, `unknown_reserve` | Yes | Allowed | Standard + tradeoff | Goal / intentional tradeoff | Yes — tradeoff echo |
| **T3** | `future_capital` | Yes (v1) | Allowed with warning | **Extra ack** | Long-term tradeoff | Yes — non-urgent |
| **T4** | `locked_capital`, `protected_reserve` | **No** (default) | Hidden | N/A | N/A | No |

### 5.2 Tier vs current runtime

| Tier | Current `eligible` | Gap |
|------|-------------------|-----|
| T0–T2 | true if balance > 0 | No tier distinction |
| T3 | true (same as T0) | **No warning friction** |
| T4 | **true today** for pension/property | **Should be false** |

### 5.3 Visibility levels

| Level | Meaning |
|-------|---------|
| `visible_default` | In dropdown; may be default selection |
| `visible_deprioritised` | In dropdown; never default |
| `visible_warning` | In dropdown; requires extra ack (T3) |
| `hidden` | Not in release dropdown (T4) |

---

## 6. Current release code audit vs model

### 6.1 Function map

| Function | Flat eligibility? | Classification hook safe? | Emotional leak? |
|----------|--------------------|---------------------------|-----------------|
| `geodeSavingsReleaseSourceType` | N/A — tag only | **Extend** — add `reserveClass` sibling | Low — Buffer vs Goal label |
| `geodeSavingsReleaseEligibility` | **Yes** — balance only | **Primary insert** — tier + visibility | None |
| `geodeSavingsReleaseAvailableBalance` | Balance SSOT | Read-only | None |
| `geodePreviewSavingsRelease` | Inherits eligibility | **Copy branch** by tier | **“Pressure covered”** — discouraged |
| `geodeSavingsReleaseSourcesSnapshot` | Array order | **Sort** by tier | None |
| `geodeSavingsReleaseSnapshot` | Aggregates flat sources | Read-only metadata | Stale `shadowOnly` audit note |
| `geodeOpenSavingsReleaseModal` | `eligible[0]` default | **Default pick** + intro copy | “Use saved money” CTA (Plan) |
| `geodeConfirmSavingsRelease` | No tier check | **Pre-apply gate** for T3 ack / T4 block | None |
| `geodeApplySavingsRelease` | Applies if eligible | **Optional** — record `reserveClass` on event | None |
| `geodeOverBudgetPlanBlockHtml` | Always shows release btn | No classification | “Use saved money” |

### 6.2 Where tier branching belongs (safe)

```
geodeReserveClassifySource(state, resolved)     ← NEW read-only (80R-C)
        ↓
geodeSavingsReleaseEligibility                  ← add tier, visibility, class; tighten eligible for T4
        ↓
geodeSavingsReleaseSourcesSnapshot            ← sort rows; filter hidden
        ↓
geodeOpenSavingsReleaseModal / Preview HTML     ← copy + default source + T3 ack UI
        ↓
geodeApplySavingsRelease                        ← optional class on release record
```

### 6.3 Where tier branching must NOT go

- `getMonthPlan`, `geodeAffordabilitySnapshot`, `calcMonthlyLeftover`
- `breathingRoomFloor`, debt sequencing, invest sizing
- Home orchestration resolve / main action
- Reflection composer / Tier-C gates
- `geodeFinancialMemoryPlanModifiers`
- Smart import / statement classification

---

## 7. Continuity-safe runtime insertion points

### 7.1 May influence (release surface only)

| Concern | Insertion point |
|---------|-----------------|
| Dropdown visibility | `geodeSavingsReleaseSourcesSnapshot` filter |
| Source sort order | Same + `geodeReserveClassifySource` sort key |
| Default selected source | `geodeOpenSavingsReleaseModal` — first `visible_default` by tier |
| Preview copy | `geodeSavingsReleasePreviewBlockHtml` — tier copy map |
| Confirm friction | Modal — T3 checkbox; block T4 |
| Release record metadata | `geodeApplySavingsRelease` — optional `reserveClass` field (audited schema) |
| Reality bridge (future) | Static copy — “record in Plan if savings absorbed pressure” — **no class logic** |

### 7.2 Must never influence

| Protected surface | Reason |
|-------------------|--------|
| Plan math / steps | Continuity law |
| Affordability / suggestableRoom | Not affordability repair |
| Monthly Left | Cash-flow SSOT |
| Buffer target / readiness functions | Separate from release class |
| Investment Plan contributions | No liquidation unlock |
| Home surface ranking | No release promotion |
| Orchestration suppress | No hidden reserve optimisation |

---

## 8. Source-ordering philosophy

### 8.1 Recommended default order (contract)

**Principle:** Surface **continuity-appropriate** sources first for default selection — **not** “max cash” or “emotionally easiest to spend.”

| Sort key (ascending) | Class / tier |
|----------------------|--------------|
| 1 | T0 `continuity_reserve` |
| 2 | T1 `flexible_reserve` |
| 3 | T2 `purpose_reserve` |
| 4 | T2 `unknown_reserve` |
| 5 | T3 `future_capital` |
| — | T4 hidden — excluded from list |

Within tier: **higher balance last** (avoid defaulting to largest investment).

### 8.2 Explicit answers

| Question | Answer |
|----------|--------|
| Investments before flexible savings? | **No** — T1 goals/invest savings before T3 stocks/crypto |
| Pension/property ever appear? | **No** in v1 (T4 hidden) |
| Protected goals appear automatically? | **No** — hidden when flag exists |
| User can still pick lower-priority source? | Yes if visible (T2/T3); must not auto-select T3 |
| Safest first vs flexible first? | **Continuity first** for default only; user override always available |

---

## 9. Future user controls

| Control | Purpose | Runtime now? | Schema needed? |
|---------|---------|--------------|----------------|
| **`releaseProtected`** on goal/invest | Never suggest / hide from release | No | Yes — audited boolean |
| **“Never suggest this source”** | Same as protected | No | Same |
| **Reserve purpose selection** | User picks flexible vs purpose vs future | No | Optional enum — defer |
| **Reserve flexibility preference** | Global tone only | No | Defer |
| **Release lock** (account-level) | Hard block all release | No | Defer — high friction |
| **Future-capital marking** | User reclassify T3 ↔ T4 edge | No | Optional — use `horizon` today |

**Recommendation:** First runtime flag: **`releaseProtected`** only (80R-D+ schema audit). All others future-only.

---

## 10. Implementation guardrails

1. Classification is **deterministic lookup** — not behavioural scoring.  
2. Classification **must not** trigger predictive release or orchestration.  
3. Sort order must be **explainable** (“buffer listed first by design”).  
4. Suppression (T4) must be **reversible** via metadata edit / unprotect.  
5. Classification **must not** change Plan outcomes or affordability inputs.  
6. Investments **must not** silently become emergency cash (T3 ≠ T0 copy).  
7. Unknown reserves **default conservative** (T2 + deprioritised).  
8. New persisted fields require **backup whitelist audit**.  
9. Dev hooks remain read-only until post-build audit.  

---

## 11. Insertion-point map (diagram)

```
                    USER DATA
         goals[]          investments[]
              \              /
               geodeReserveClassifySource()  ← 80R-C (read-only)
                        |
          +-------------+-------------+
          |             |             |
     visibility      sortKey      copyKey
          |             |             |
 geodeSavingsReleaseEligibility / SourcesSnapshot
          |
 geodeOpenSavingsReleaseModal ──→ geodePreviewSavingsRelease
          |
 geodeConfirmSavingsRelease (T3 ack gate)
          |
 geodeApplySavingsRelease ──→ S.savingsReleases[] (+ optional reserveClass)

EXCLUDED: getMonthPlan, affordability, calcMonthlyLeftover, Home orch, Reflection
```

---

## 12. Proposed helper contract (spec-only)

```javascript
// 80R-C — read-only; no side effects
function geodeReserveClassifySource(state, resolved) {
  return {
    reserveClass: 'continuity_reserve' | 'flexible_reserve' | ...,
    tier: 0 | 1 | 2 | 3 | 4,
    visibility: 'visible_default' | 'visible_deprioritised' | 'visible_warning' | 'hidden',
    releaseEligible: boolean,        // false for T4
    sortKey: number,                 // lower = earlier in list
    copyKey: string,                 // maps to 80R-A.1 framing table
    reasonCodes: string[],           // e.g. ['type_pension', 'horizon_long']
    classificationVersion: 1
  };
}
```

**Must not** mutate `state`. **Must not** call Plan or affordability.

---

## 13. Current runtime gaps

| Gap | Severity | Tier stage |
|-----|----------|------------|
| Pension/property releasable | **High** | 80R-C |
| Flat balance-only eligibility | **High** | 80R-C |
| First-array-index default source | **Medium** | 80R-C |
| `purpose` / `horizon` / `type` ignored | **Medium** | 80R-C |
| “Pressure covered” preview copy | **Medium** | 80R-C.1 copy pass |
| “Use saved money” Plan CTA | **Medium** | 80R-C.1 |
| No `reserveClass` on release record | **Low** | 80R-D schema |
| No release history UI | **Low** | 80R-D |
| No user protection flag | **Low** | 80R-E schema |

---

## 14. Future-safe metadata recommendations

| Recommendation | Rationale |
|----------------|-----------|
| **Use existing fields first** | `type`, `horizon`, `purpose`, `goal.cat` |
| Add `releaseProtected: boolean` (optional) | Minimal schema; high user agency |
| Add optional `reserveClass` on `savingsReleases[]` entries | Audit trail; backup audit required |
| Do **not** add liquidity enum yet | Real liquidity is product/legal — user declaration only |
| Encourage Cash ISA users to set `horizon:'short'` or `type:'savings'` | UX nudge in invest modal — copy-only stage |
| Document `stocks_isa` ≠ Cash ISA in help copy | Classification conservatism |

---

## 15. Final recommendation

### Verdict: **NEEDS ATTENTION**

Model is definable without schema explosion; **current runtime violates T4 contract** (pension/property eligible) and **flattens T0–T3**.

### Safest next implementation stage

**80R-C — Read-only classification helper + eligibility tier gate**

1. Implement `geodeReserveClassifySource` (read-only).  
2. Extend `geodeSavingsReleaseEligibility` with tier + `releaseEligible: false` for T4.  
3. Sort/filter in `geodeSavingsReleaseSourcesSnapshot`.  
4. **No** modal copy change in same commit (or 80R-C.1 immediately after).  
5. Post-build audit before Plan CTA copy pass.

**Sequence:** 80R-B ✅ → **80R-C** → 80R-C.1 (copy) → 80R-D (history UI) → 80R-E (Reality bridge) → 80R-F (Reflection).

### Do-not-build-yet

- Auto-sort that hides T2 without user visibility  
- Orchestration promoting release by tier  
- Affordability coupling  
- Reflection same-day release blocks  
- Predictive “recommended source”  
- Liquidity-based scoring  
- Required release to proceed  

---

## 16. Unresolved questions

| # | Question | Default stance |
|---|----------|----------------|
| 1 | Is `stocks_isa` ever flexible (T1)? | **No** unless `horizon:'short'` |
| 2 | Goal `cat: retirement` — T4? | **Yes** — treat as locked_capital |
| 3 | T3 extra ack — checkbox vs second confirm? | Checkbox (80R-C.1 UX spec) |
| 4 | Persist `reserveClass` on release record? | Yes — optional field, audited |
| 5 | Override path for T4 pension release? | Defer to product stage 80R-G |

---

## See also

- [80R-A.1 — Savings Release Continuity Contract](./80R-A.1-savings-release-continuity-contract.md)
- [`continuity-ownership-contract.md`](../../continuity-ownership-contract.md)
- [`memory-boundaries.md`](../../memory-boundaries.md)

---

**Stage status:** Specification + runtime audit complete. No runtime changes. No commit required.
