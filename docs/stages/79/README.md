# Stage 79 — Home Hierarchy & Orchestration Wiring

Ordered documentation for Visual Intelligence Home hierarchy work after Stage 78B.

**Commit policy:** Do not commit until post-build audit PASS and explicit user approval per sub-stage.

---

## Stage map

| Stage | Type | Document | Verdict | Commit |
|-------|------|----------|---------|--------|
| 79A | Home hierarchy / hidden intelligence audit | [79A-home-hierarchy-hidden-intelligence-audit.md](./79A-home-hierarchy-hidden-intelligence-audit.md) | NEEDS ATTENTION | — |
| 79B-A | Orchestration wiring design audit | [79B-A-home-hierarchy-orchestration-wiring-audit.md](./79B-A-home-hierarchy-orchestration-wiring-audit.md) | NEEDS ATTENTION | — |
| 79B-B | Build — over-budget + needs-attention gating | [79B-B-build-home-hierarchy-pass.md](./79B-B-build-home-hierarchy-pass.md) | Built | `8dc9855` |
| 79B-C | Post-build audit (79B-B) | — | **PASS** | — |
| 79B-D | Alert duplication / MA dominance audit | [79B-D-home-alert-main-action-dominance-audit.md](./79B-D-home-alert-main-action-dominance-audit.md) | NEEDS ATTENTION | — |
| 79B-E | Build — coaching strip orchestration parity | [79B-E-build-coaching-strip-parity.md](./79B-E-build-coaching-strip-parity.md) | Built (local) | *held* |

---

## Key functions (index.html)

| Function | Role |
|----------|------|
| `geodeHomeOrchestrationResolve(state)` | Computes `surfaces.*.show` (producer — do not change in consumer passes) |
| `geodeHomeOrchSurfaceShowResolved(key, fallbackFn)` | Read resolve flag with fallback (79B-B) |
| `geodeHomeCoachingStripHtml()` | Coaching strip render; obeys `coachingStrip.show` (79B-E) |
| `rHome()` | Caches `window._geodeHomeOrchestrationResolve` before HTML |

---

## Scope boundary

79B-E completes coaching strip consumer parity. Alert dedup, Main Action reorder, focus goal wiring, and hidden intelligence remain **future** stages.

---

## Related docs

- [Architecture notes — Home orchestration render gating](../../architecture-notes.md)
- [Stage 76–77 Ask Beynd handover](../../handovers/handover-stage-76-77-ask-beynd-evolution.md)
