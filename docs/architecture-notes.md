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

**Not yet wired:** `focusGoal`, `sinceLastVisit`, full `askBeynd.emphasis`, coaching strip legacy fallback removal, `disclosureNeeded[]` (future hidden intelligence).

Do not reorder Home or change orchestration producers when adding gating for additional surfaces.

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

## Cleanup Rule

Do not delete dormant functions without a dedicated cleanup audit.

Before removal, search for string-built handlers such as `onclick="..."`, global function references, and indirect call paths.

Avoid broad refactors inside `index.html` without explicit approval.
