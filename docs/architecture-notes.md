# Architecture Notes

## Home Main Action

The live primary Home action path is:

- `geodeGetMainAction`
- `geodeHomeMainActionHtml`
- `geodeRunMainAction`
- `geodeRunAffordGatedAction`
- `geodeAffordGateBuildForPlanMoneyAction`

This is the canonical Home Main Action system. Edit this path for current Home primary-action behaviour.

## Home Orchestration Render Gating (Stage 79B-B)

Home orchestration **producers** (do not change for presentation-only passes):

- `geodeOrchestrationSnapshot`
- `geodeDeferredQueueSnapshot`
- `geodeHomeOrchestrationResolve`

**Consumer pattern:** `rHome()` caches `window._geodeHomeOrchestrationResolve = geodeHomeOrchestrationResolve(S)` before building HTML. Surfaces should read `resolve.surfaces.<key>.show` via `geodeHomeOrchSurfaceShowResolved(surfaceKey, fallbackFn)` with a null-safe fallback to the legacy direct helper.

**Wired in 79B-B:** `overBudget`, `needsAttention`.

**Wired in 79B-E:** `coachingStrip` — when `surfaces.coachingStrip.show === false`, `geodeHomeCoachingStripHtml()` returns blank (no legacy HM/Insight override). Legacy path remains only when resolve is missing.

**Not yet wired:** `focusGoal`, `sinceLastVisit`, full `askBeynd.emphasis`, `disclosureNeeded[]` (future hidden intelligence).

Do not reorder Home or change orchestration producers when adding gating for additional surfaces.

## Home alert dedup (Stage 80B-B phase 1)

Persistent **Over Budget** card (`surfaces.overBudget`) yields in `geodeHomeOrchestrationResolve` when:

1. **`needsAttention.show`** — overdue priority (`dedup_needs_attention_priority`)
2. **Main Action spend-recovery** — `geodeHomeMainActionAlertDedupContext` → `maIsSpendRecovery` via `geodeMainActionVisualRegister === 'pressure'` (`dedup_main_action_spend_recovery`)

Read-only helper: **`geodeHomeMainActionAlertDedupContext(state, action)`**. Render still via **`geodeHomeOrchSurfaceShowResolved('overBudget', ...)`** — do not add parallel gates in `rHome`.

**Not in phase 1:** Needs Attention suppression, muted detail lines, combined alert summary. `disclosureNeeded` entries appended on suppress for future Stability Room.

## Home Main Action route value tier (Stage 80C-B)

Read-only **`geodeMainActionRouteValue(action, state, opts)`** — presentation only in **`geodeHomeMainActionHtml`**.

When generic **Review your plan** / **Stay on track** + **Review plan** CTA has no amount and Plan lacks actionable steps (`!geodeHasPlanContext`, no steps, no `amount > 0`, `totalS <= 0`, or no incomplete step):

- Button tier **`btn-s`** instead of **`btn-p`**
- Display-only hint line; secondary affordance **Plan view ›** inline (80C-D.1); **`geodeRunMainAction`** unchanged

Enriched titles (buffer, subscription, debt sub) stay **primary**. Do **not** change **`geodeGetMainAction`** for tier logic.

## Home Insight pressure reframe (Stage 79B-I)

Safety/buffer Home **Insight** (not Human Moment) uses display-only reframe when `calcMonthlyLeftover(state) < 0`:

- **`geodeHomeSafetyInsightUnderPressure(state, topic)`** — gate for topics `safety` / `irregular_safety`.
- **`geodeHomeSafetyInsightPressureCopy(state, topic, rawBody, vIx)`** — steady-plan-first copy; does **not** change `getCoreNudges`.
- **`geodeInsightPolishBody`** consumes pressure copy; **`renderInsights`** forces `type: 'neutral'` when reframed.

Calm-month forward-building copy in `getCoreNudges` remains unchanged. Do not imply Savings Release or buffer withdrawal in reframe copy.

## Home Human Moment non-alert styling (Stage 79B-L)

Home **Human Moment** strip (`geodeHomeHumanMomentStripHtml`) must not use `insight-card--warning`:

- **`supportive`** tone → `insight-card--positive` (unchanged).
- **`cautious`** and other non-supportive tones → default `.insight-card` + `nudgeStyle('neutral')` — no amber warn tier.

Do not change HM selection, copy, or orchestration when adjusting styling. Reality-page HM (`geodeRealityHumanMoment`) is a separate surface.

## Suggested Actions And Insights

`geodeHomePrepareSuggestedActionsList` populates `_geodeSuggestedActions`.

This system is still used for Insight, import summary copy, and deduplication paths, including `renderInsights`. It is not the live Home primary action card.

Do not assume `_geodeSuggestedActions[0]` is the visible Home Main Action.

## Dormant Old Home Helpers

These helpers belong to an older Home card system:

- `geodeHomePrimaryActionHtml`
- `geodeHomeSecondaryActionHtml`
- `openSuggestedAction`
- `geodeRunAlsoThisMonthAction`

Do not edit these as if they affect the current Home Main Action. Only change them when explicitly reviving or removing the old Home card system.

## Manual Reality And Dormant Bank Intelligence

Live manual Reality paths:

- `geodeRealityPageHtml`
- `geodeRealityStatus`
- Reality Check modal helpers
- **`geodeGetMonthContextCarry`** / **`monthContextCarry`** — prior-month suggest only (80E-D); active month context still via Save on Reality form

## First-run intro (Stage 80E-G / 80E-G.2)

One-time **`pg-fr`** screens (`fr1`–`fr3`) after onboarding; keyed **`geode_fr_intro_v1`** (`FR_KEY`). **80E-G** copy-only orientation; **80E-G.2** trigger fix.

**Show gate (`maybeShowFirstRunIntro`):** `S.hasOnboarded === true` and `FR_KEY` not set. Do **not** gate on `_geodeFirstBoot` (page-load KEY absence).

- **`#fr2`** — Reality: sense-check + monthly context; manual, no bank pull
- **`#fr3`** — Ask Beynd: optional plan explanation; Home as next step

**Reset All Data:** `wipeLocalAppStateAndReload` clears `FR_KEY` with `geode_v6` so intro can show again after re-onboarding.

Do not add fields, onboarding steps, or API-key setup to first-run intro. Quick Setup step 2 and post-QS Home nudge remain separate balance-focused hints.

## Stability Room shadow snapshot (Stage 80F-B / 80F-D)

Read-only **`geodeStabilityRoomSnapshot(state, opts)`** — assembles orchestration resolve, plan rationale slice, posture, month context, and held-back Home signals. Hook: **`window._geodeStabilityRoomSnapshot`**.

**Contract (80F-D):** `snapshotIntent.mode === 'reflection'`; top-level `active` / `reason`; `visualIntent.computed === false` (UI deferred); `heldBack.mutedLines` without routes; `audit.sideEffects` lists normalize delegates.

**Not UI.** First consumer of dormant `disclosureNeeded[]`. Do not wire to Home until post-build audit passes.

**Visual model (80G-B / 80G-B.1 / 80G-B.2 / 80G-B.3):** **`geodeStabilityRoomVisualModel(snapshot)`** — `mode: 'reflection'`, `generatedAt`, `sourceSnapshotVersion`, `noGo` (`trafficLights`, `autoOpen`, `notificationDrawer`); atmosphere tokens (`calm`/`reflective`/`protective`/`recovering`/`room`; never `opportunity`); VI register (`calm`/`guidance`/`review`/`recovery`/`progress` only); section visibility; entry copy hints. Hook: **`window._geodeStabilityRoomVisualModel`**. Never `pressure`/`risk`/`error`.

**Entry gate (80H-B / 80H-B.1):** **`geodeStabilityRoomEntryGate(snapshot, visualModel, opts)`** — `visibility` (`hidden`/`available`/`suggested`); `label`/`dismissLabel`; `suggested` only when `trigger === 'reality_month_context_save'` **and** `justSavedMonthContext === true` **and** `dismissedThisMonth !== true`. Hook: **`window._geodeStabilityRoomEntryGate`**. `audit.noHomeEntry` / `noAutoOpen` / `noRoutes` / `noStorage` all `true`. No UI, routes, or dismiss storage yet.

**Experience model (80I-B / 80I-C.1):** **`geodeStabilityRoomExperienceModel(snapshot, visualModel, entryGate, opts)`** — bounded human copy blocks (`what_matters_this_month`, `month_so_far`, `background` or `plan_protecting`); `density` (`light`/`roomy`/`standard`); block `source`; returns `null` when gate is `hidden`. Hook: **`window._geodeStabilityRoomExperienceModel`**. `audit.noUi` / `noRoutes` / `noStorage` / `noCalculations` and `noGo.noRawInternals` etc. all `true`. Max 3 blocks. No UI, routes, or storage.

**Reality inline entry (80J-B / 80J-E):** **`geodeRealityReflectionEntryGateForReality(state)`** + **`geodeRealityReflectionEntryHtml()`** — session-only flags; inline link in **collapsed month-context card footer** when gate is `suggested` (80J-E). Primary tap opens Reflection sub-surface (80K-B).

**Reflection surface (80K-B):** Money sub-surface **`msub='reflection'`** — **`geodeReflectionStackForSurface`** → **`geodeReflectionSurfaceHtml()`** renders ExperienceModel copy only. Entry via **`geodeNavigateToReflectionFromReality()`**; exit via **`geodeExitReflectionSurface()`** (returns to Reality, not overview). No Home entry, charts, or persistent storage.

**Reflection → Ask Beynd (80L-B):** Ask pointer opens existing **`geodeOpenAskBeynd({ reflectionOrigin, prefill })`** modal overlay — no tab, no inline chat, **no auto-send**. **`geodeReflectionAskContext`** exports experienceModel display copy only; appended once via in-memory **`_geodeReflectionAskContextPending`** on first Ask send. Plan rationale / SKIP limits unchanged.

**Reflection bundle release (80M-A / 80M-B):** Release cut bumps **`CACHE_VERSION`** once (**v1.0.73** after 80M-A) so clients refresh static assets for the **80J + 80K + 80L** bundle. **80M-A** changes **`service-worker.js` version string only** — no install/activate/fetch/message logic, no Reflection/Ask/UI edits. **Final audit (80M-B) required before commit.**

**Month context skip (80M-C.2):** Empty **Skip for now** uses session-only **`geode_month_context_skip_visit`** — hides prompt for current Reality visit; clears on leave Reality, save, or month rollover. Persisted **`dismissedYm`** unchanged for non-empty skip path only. Does not affect Reflection entry triggers.

Dormant or future-facing paths:

- `geodeRealityCheckCardHtml`
- `geodeIntelBuildCardHtml`
- `geodeIntelInjectCard`
- `loadGeodeIntelligence`

Bank-sync, connected-account, synced, or actual-income wording in dormant Intel code must not be treated as current product truth.

## Ask Beynd

Current Ask Beynd is a user-provided API key model.

Future backlog work may move to a Beynd-managed API backend. Never put a Beynd Ltd provider key in frontend code. Before changing Ask Beynd architecture, audit all context sent off-device.

### Plan rationale snapshot (Stage 76)

- **`geodePlanRationaleSnapshot(state, opts)`** — plan reasoning export; also updates `window._geodePlanRationaleSnapshot`.
- **`geodeFormatPlanRationaleContextBlock(snap, sym)`** — bounded Ask Beynd text block (76D-B); includes always-on **SKIP / WHAT-IF LIMITS** assistant rules (77B-B) — no skip simulation.
- **`geodeFormatAskBeyndSpendingPressureContextBlock(state, sym)`** — over-budget spending block when `calcMonthlyLeftover < 0` (77C-B); uses `geodeAskBeyndFlexibleSpendingCategories` (same rules as Plan over-budget breakdown).
- **`geodeBuildCoachingContext()`** — includes plan rationale block when snapshot succeeds; spending pressure block when over budget; legacy plan strip as fallback.
- **Allocation SSOT:** `getMonthPlan()`. **Explanation export:** snapshot → formatter → Ask Beynd context.
- **Amount rule (Rule C):** baseline in step lines; when `alignment.active`, formatter adds Reality-adjusted amounts per step.
- **Docs:** [`docs/stages/76/README.md`](./stages/76/README.md), [`docs/handover-stage-76-ask-beynd-reasoning.md`](./handover-stage-76-ask-beynd-reasoning.md).

Do not inject full JSON snapshot into Ask Beynd context.

## Debt health & provider review (Stage 81B-1)

**`debt.balance`** remains the user-confirmed provider balance for net worth. Optional metadata on `S.debts[]`:

- **`interestType`** — `'fixed' | 'variable' | 'unknown'` (default `unknown`)
- **`lastProviderReviewAt`** — `YYYY-MM-DD` when user last saved debt via **`saveDebt`**
- **`lastProviderBalance`** — balance figure at last save (audit/display; net worth still uses **`balance`**)

**Normalize:** **`geodeNormalizeDebtHealthFields(state)`** on load and after **`saveDebt`**.

**Display only:** **`geodeDebtHealthCardHtml`**, **`geodeDebtProviderReviewNudgeCopy`** — Money debt cards + Edit Debt modal. Stale copy thresholds: 45d (unknown/variable), 60d (fixed). No badges, no auto-reduction on payment.

**Not in 81B-1:** payment balance apply, `estimatedPrincipalApplied`, Ask Beynd debt rules export, savings release.

**Docs:** [`docs/stages/81/README.md`](./stages/81/README.md).

## Cleanup Rule

Do not delete dormant functions without a dedicated cleanup audit.

Before removal, search for string-built handlers such as `onclick="..."`, global function references, and indirect call paths.

Avoid broad refactors inside `index.html` without explicit approval.
