# Stage 79B-I — Build Pressure-Aware Safety Insight Reframe

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  

---

## Objective

When `calcMonthlyLeftover(S) < 0`, reframe Home safety/buffer **Insight** copy from forward-building (“continue building…”) to pressure-aware support (“steady the plan first”) without suppressing the Insight or changing `getCoreNudges`.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeHomeSafetyInsightUnderPressure`, `geodeHomeSafetyInsightPressureCopy`; `geodeInsightPolishBody`; `renderInsights` type override |
| `docs/stages/79/79B-H-*.md`, `79B-I-*.md`, README updates | Documentation |

---

## Files intentionally not touched

- `getCoreNudges`, orchestration producers, Main Action, alert cards, HM selection, Plan/Reality math, CSS, SW, `coaching.json`, pure modules

---

## Implementation

### Helpers (near `geodeInsightPolishBody`)

- **`geodeHomeSafetyInsightUnderPressure(state, topic)`** — true when topic is `safety` or `irregular_safety` and `calcMonthlyLeftover(state) < 0`.
- **`geodeHomeSafetyInsightPressureCopy(state, topic, rawBody, vIx)`** — returns 3-variant pressure copy or `null`.

### `geodeInsightPolishBody`

Before calm-month `safety` polish, call pressure copy for `safety` and `irregular_safety`.

### `renderInsights`

When primary topic is under pressure reframe, set **`type: 'neutral'`** so Insight avoids `insight-card--warning`.

---

## Behaviour

| State | Safety Insight |
|-------|----------------|
| `left < 0` | Reframes; neutral card |
| `left >= 0` | Unchanged (`getCoreNudges` copy + existing polish) |

Peek/orchestration eligibility unchanged (reframe is display-only).

---

## Validation

```js
calcMonthlyLeftover(S) < 0 &&
  geodeHomeSafetyInsightUnderPressure(S, 'safety') &&
  geodeHomeSafetyInsightPressureCopy(S, 'safety', '', 0).indexOf('steady') >= 0;

calcMonthlyLeftover(S) >= 0 &&
  geodeHomeSafetyInsightPressureCopy(S, 'safety', 'Continue building', 0) === null;
```

Manual: over-budget + buffer-in-progress profile — Insight must not say “continue building”; calm month unchanged.

---

## Service worker

**No bump** for this presentation-only pass.

---

## Next

Post-build audit (79B-J) — diff scope + manual QA matrix from 79B-H.
