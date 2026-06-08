# Strategic Systems — Partial Build Inventory

**Purpose:** Record what exists, what is missing, and safest direction for partially-built strategic systems adjacent to Plan stabilisation.  
**Baseline:** `ee4e85a`  
**Policy:** Shadow/read-only layers must pass audit before UI wiring.

---

## 1. Stability Room / Reflection

### What exists already

| Layer | Function / surface | Status |
|-------|-------------------|--------|
| Snapshot | `geodeStabilityRoomSnapshot` | Shadow read-model |
| Visual model | `geodeStabilityRoomVisualModel` | Contract: `mode: 'reflection'`, `noGo` flags |
| Entry gate | `geodeStabilityRoomEntryGate` | Shadow; Reality month-context save trigger |
| Experience model | `geodeStabilityRoomExperienceModel` | Bounded copy blocks; no UI storage |
| Reality entry | `geodeRealityReflectionEntryHtml`, inline footer link | **Live** (80J-B / 80J-E) |
| Reflection surface | Money `msub='reflection'`, `geodeReflectionSurfaceHtml` | **Live** (80K-B) |
| Ask integration | `geodeOpenAskBeynd({ reflectionOrigin })` | **Live** (80L-B); no auto-send |
| Release | Service worker **v1.0.73** (80M-A) | Bundle refresh for Reflection |

Dev hooks: `window._geodeStabilityRoomSnapshot`, `_geodeStabilityRoomVisualModel`, `_geodeStabilityRoomEntryGate`, `_geodeStabilityRoomExperienceModel`.

### What is missing

- Home primary entry to Stability Room (contract: `noHomeEntry`, `noAutoOpen`)
- Persistent dismiss storage for entry gate (audit required)
- Charts, notification drawer, pressure/atmosphere misuse guards in production UI
- Plan tab integration (intentionally separate from Plan stabilisation)

### Safest future direction

1. Audit entry gate dismiss + month rollover behaviour before Home chip.
2. Wire ExperienceModel to Reflection only; keep Home as redirect, not duplicate surface.
3. Never auto-open from orchestration suppress events without explicit user action.

### Major risks

- Alert suppression (`disclosureNeeded`) without a visible outlet → user loses awareness
- Auto-open or drawer patterns forbidden in 80G-B.3 contract
- Ask context leakage from raw snapshot JSON (forbidden — use formatters only)

---

## 2. Savings Release

### What exists already

| Layer | Status |
|-------|--------|
| Shadow eligibility | `81D-2` preview model |
| Confirmation sheet | `81D-3` live UI |
| Persisted releases | `S.savingsReleases[]`, `activityLog` |
| Plan overbudget path | **Use saved money** affordance |
| Backup whitelist | `81D-3.1` |
| Buffer goal auto-link on save | `81D-3.5` |
| Plan buffer adequacy gate | `81D-3.6` |
| Buffer action copy | `81D-3.7` |

Monthly Left unchanged on release (by design in 81D-3).

### What is missing

- Broad Stability Room / Reflection narration of release history
- Cross-surface copy parity (Home insight reframe must not imply release without gate)
- Long-term audit trail UI for user review
- Integration with Ask Beynd explanatory rules (export audit pending)

### Safest future direction

1. Read-only release history surface before editable undo.
2. Keep net worth / Monthly Left SSOT rules documented before any “apply to plan room” feature.
3. Coordinate with `geodeResolveBufferTarget` hierarchy — never double-count buffer goal vs releases.

### Major risks

- User believes release increased spendable plan room when Monthly Left unchanged
- Plan buffer step regression if adequacy gate bypassed
- Backup/restore dropping `savingsReleases` (mitigated in 81D-3.1 — re-verify on export changes)

---

## 3. Debt Review Balance

### What exists already

| Layer | Status |
|-------|--------|
| Confirmed balance SSOT | `debt.balance` for net worth |
| Health metadata | `interestType`, `lastProviderReviewAt`, `lastProviderBalance` (81B-1) |
| Card minimal line | `geodeDebtHealthCardMinimalCopy` (81B-2.3) |
| Shadow principal estimate | `geodeEstimateDebtPrincipalApplied` (81B-2); no UI |
| Provider review copy | Edit Debt modal only |

### What is missing

- Guided “review balance” flow that updates confirmed balance without payment side-effects
- Reflection/Ask export of debt truth rules
- Persistence of user-dismissed provider review nudges (helper exists, not on card)

### Safest future direction

1. Modal-only balance confirm path that writes `debt.balance` + review timestamps explicitly.
2. Never infer balance from payment sum without user confirm.
3. Keep shadow principal estimate out of net worth until product signs dual-ledger policy.

### Major risks

- Silent balance mutation from payment completion
- Provider review stale copy implying incorrect legal/financial advice
- Plan debt steps sized against stale balance

---

## 4. Reality continuity

### What exists already

| Layer | Status |
|-------|--------|
| Month context carry | `geodeGetMonthContextCarry`, `monthContextCarry` (80E-D) |
| Use last month affordance | Reality UI |
| Plan alignment | `geodePeekActiveRealityPlanAlignment`, reduce/pause preview rows |
| Plan banner | `geodeRealityPlanAlignmentPlanBannerHtml` (read-only shift follow) |
| Step display override | `geodePlanStepRealityDisplay` (display-only) |
| First-run intro | 80E-G / 80E-G.2 Reality orientation |

### What is missing

- Full parity audit between Reality preview amounts and Plan row headlines post-stabilisation
- Reflection entry dismiss persistence across months (partial — visit-scoped skip in 80M-C.2)
- Export of alignment state to Ask Beynd beyond plan rationale snapshot

### Safest future direction

1. Audit Reality-adjusted Plan rows against debt/invest display rules separately (invest: committed basis may diverge from Reality pause/reduce).
2. Copy-only continuity before new persistence fields.
3. Never mutate `getMonthPlan` from Reality without explicit user approve persist path.

### Major risks

- User approves Reality shift then sees Plan invest committed headline unchanged (may be correct — document)
- Month context skip hides prompt for visit but user expects persistence
- Alignment revert (`geodeRevertRealityPlanAlignment`) edge cases with scheduled payments

---

## 5. Adaptive behavioural planning philosophy

### What exists already

| Layer | Status |
|-------|--------|
| Adaptive display mode | Per-family tiers (E.3); display-only reorder |
| Adaptive SA subtitles | Smaller first-step copy when harder families detected |
| Adaptive nudges | Invest harder / goal partial / debt momentum messages |
| Financial memory softening | `geodeFinancialMemorySoftenedAmount` in plan sizing (engine — do not conflate with display) |
| Coaching.json | External coaching strip content |

### What is missing

- Unified policy doc linking adaptive engine softening vs display committed basis
- User-visible explanation when memory softens invest amount but committed display differs
- Stability Room as outlet for suppressed adaptive signals

### Safest future direction

1. Keep adaptive **copy** changes separate from Plan **amount SSOT** (`getMonthPlan`).
2. Any adaptive invest headline must respect INV-B rule: committed after action, suggestion before.
3. Audit before wiring adaptive mode to Home main action amounts.

### Major risks

- Adaptive system implies failure when user intentionally chose smaller invest
- Double softening (engine memory + Reality reduce + adaptive subtitle)
- Nudge fatigue if Stability Room not wired when alerts suppressed

---

## Cross-system dependency map

```
Plan stabilisation (ee4e85a)
    ├── Home/SA invest alignment (F.2) ──► Adaptive philosophy
    ├── Payment canonicalisation (F.3) ──► Savings Release / Invest committed
    ├── Reality continuity ──► Plan alignment banner / geodePlanStepRealityDisplay
    └── Buffer hierarchy ──► Savings Release / 81D-3.x

Stability Room shadow ──► Reflection live ──► Ask Beynd (bounded context)
Debt Review Balance ──► 81B metadata (no auto-apply)
```

---

## See also

- [Architecture notes](./architecture-notes.md) — canonical paths and shadow contracts
- [Plan backlog](./plan-backlog.md)
- [Handover](./handover.md)
