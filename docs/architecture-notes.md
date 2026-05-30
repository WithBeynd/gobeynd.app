# Architecture Notes

## Home Main Action

The live primary Home action path is:

- `geodeGetMainAction`
- `geodeHomeMainActionHtml`
- `geodeRunMainAction`
- `geodeRunAffordGatedAction`
- `geodeAffordGateBuildForPlanMoneyAction`

This is the canonical Home Main Action system. Edit this path for current Home primary-action behaviour.

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

### Plan rationale snapshot (Stage 76 — shadow)

- **`geodePlanRationaleSnapshot(state, opts)`** — shadow-only export of plan reasoning (not wired to Ask Beynd as of 76D-A.7).
- **`geodePlanRationaleAlignmentBlock()`** — reads active Month Shift via `geodePeekActiveRealityPlanAlignment` only.
- **Allocation SSOT:** `getMonthPlan()`. **Explanation export SSOT (future):** snapshot. **Current Ask Beynd context:** `geodeBuildCoachingContext()` (lossy plan strip).
- **Amount rule for integration:** baseline in `steps[].amount`; display in `alignment.stepAdjustments` when `alignment.active` (Rule C).
- **Docs:** [`docs/stages/76/README.md`](./stages/76/README.md), [`docs/handover-stage-76-ask-beynd-reasoning.md`](./handover-stage-76-ask-beynd-reasoning.md).

Do not wire snapshot into Ask Beynd without alignment block and 76D-A.5 parity review.

## Cleanup Rule

Do not delete dormant functions without a dedicated cleanup audit.

Before removal, search for string-built handlers such as `onclick="..."`, global function references, and indirect call paths.

Avoid broad refactors inside `index.html` without explicit approval.
