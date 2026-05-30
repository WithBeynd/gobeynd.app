# Stage 79B-B — Build Home Orchestration Gating (Over-Budget + Needs Attention)

**Type:** Implementation  
**Verdict:** Built — 79B-C post-build audit pending  
**Date:** May 2026  

---

## Objective

Make Home render obey existing `geodeHomeOrchestrationResolve` decisions for two surfaces only:

1. Persistent over-budget card  
2. Needs Attention / overdue card  

No reorder, visual redesign, plan math changes, orchestration producer edits, or hidden intelligence UI.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `geodeHomeOrchSurfaceShowResolved`; `rHome()` gating for over-budget + needs-attention |
| `docs/stages/79/*` | 79A, 79B-A, README, this build doc |
| `docs/README.md` | Stage 79 index entry |
| `docs/architecture-notes.md` | Home orchestration render gating section |

---

## Files intentionally not touched

- `service-worker.js`, `coaching.json`, `manifest.json`, `worker/`, `js/geode-pure/*`, icons, CNAME
- `geodeHomeOrchestrationResolve`, `geodeOrchestrationSnapshot`, `geodeDeferredQueueSnapshot`, `geodeGetMainAction`
- Hero, Main Action order/logic, subscription, coaching strip, Ask Beynd, focus goal, CSS

---

## Implementation summary

### `geodeHomeOrchSurfaceShowResolved(surfaceKey, fallbackFn)`

- Reads `window._geodeHomeOrchestrationResolve.surfaces[surfaceKey].show` when boolean.
- On missing resolve or unset flag, calls `fallbackFn()` (same pattern as subscription card in `rHome`).
- Placed immediately after `geodeHomeOrchestrationResolve` definition.

### `rHome()` changes

After `window._geodeHomeOrchestrationResolve = geodeHomeOrchestrationResolve(S)`:

**Over-budget:** render persistent card only when:

```js
geodeHomeOrchSurfaceShowResolved('overBudget', function () {
  return geodeHomePersistentOverBudgetCardVisible(S);
})
```

**Needs Attention:** append `geodeOverdueCardHtml()` only when:

```js
geodeHomeOrchSurfaceShowResolved('needsAttention', function () {
  return geodeOverdueCardHtml() !== '';
})
```

Render order unchanged. Post-QS over-budget completion card (session-scoped) is **not** gated — it runs before orchestration resolve path for returning users and uses separate session logic.

---

## Behaviour note

Today `geodeHomeOrchestrationResolve` uses the **same conditions** as the legacy helpers for these two surfaces. Expected visible Home output is **unchanged** when resolve succeeds. The win is **parity**: future resolve changes (e.g. suppress needs-attention when Main Action covers overdue) will flow to render without another `rHome` edit.

When resolve throws or is null, fallbacks preserve pre-79B-B behaviour.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Resolve null → no cards | Fallback to legacy helpers |
| Needs-attention fallback calls HTML helper twice | Only when resolve missing; acceptable for narrow pass |
| Drift if resolve conditions change without fallback update | 79B-C audit should compare resolve vs fallback |

---

## Validation (79B-C)

```js
window._geodeHomeOrchestrationResolve = geodeHomeOrchestrationResolve(S);
var r = window._geodeHomeOrchestrationResolve;
typeof geodeHomeOrchSurfaceShowResolved === 'function';
// over-budget parity when resolve present:
r.surfaces.overBudget.show === geodeHomePersistentOverBudgetCardVisible(S);
// needs-attention parity when resolve present:
r.surfaces.needsAttention.show === (geodeOverdueCardHtml() !== '');
```

Manual: Home with over-budget only, overdue only, both, neither — compare to pre-build screenshots.

---

## Service worker

**No bump** for this presentation-only pass unless bundled at a named release.

---

## Next

[79B-C post-build audit](./README.md) — verify diff scope, parity, no protected-file changes.
