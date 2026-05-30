# Stage 79 — Home Hierarchy & Orchestration Wiring

Ordered documentation for Visual Intelligence Home hierarchy work after Stage 78B.

**Commit policy:** Do not commit until **79B-C post-build audit PASS** (or explicit user approval per sub-stage).

---

## Stage map

| Stage | Type | Document | Verdict | Commit |
|-------|------|----------|---------|--------|
| 79A | Home hierarchy / hidden intelligence audit | [79A-home-hierarchy-hidden-intelligence-audit.md](./79A-home-hierarchy-hidden-intelligence-audit.md) | NEEDS ATTENTION | — |
| 79B-A | Orchestration wiring design audit | [79B-A-home-hierarchy-orchestration-wiring-audit.md](./79B-A-home-hierarchy-orchestration-wiring-audit.md) | NEEDS ATTENTION | — |
| 79B-B | Build — over-budget + needs-attention gating | [79B-B-build-home-hierarchy-pass.md](./79B-B-build-home-hierarchy-pass.md) | Built (local) | *held* |
| 79B-C | Post-build audit | *pending* | — | — |

---

## Key functions (index.html)

| Function | Role |
|----------|------|
| `geodeHomeOrchestrationResolve(state)` | Computes `surfaces.*.show` and band metadata (producer — do not change in 79B-B) |
| `geodeHomeOrchSurfaceShowResolved(key, fallbackFn)` | Read resolve flag with fallback (79B-B consumer) |
| `geodeHomePersistentOverBudgetCardVisible(state)` | Over-budget fallback visibility |
| `geodeOverdueCardHtml()` | Needs Attention card HTML |
| `rHome()` | Home render; caches `window._geodeHomeOrchestrationResolve` |

---

## Scope boundary

79B-B wires **two surfaces only**. Reorder, coaching parity, focus goal, Ask Beynd emphasis, hidden intelligence portal, and `.vi-register-*` wiring are **79B-C+**.

---

## Related docs

- [Architecture notes — Home orchestration render gating](../../architecture-notes.md)
- Stage 78B Visual Intelligence Refresh (chat audit)
- [Stage 76–77 Ask Beynd handover](../../handovers/handover-stage-76-77-ask-beynd-evolution.md)
