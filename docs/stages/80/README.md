# Stage 80 — Visual Intelligence & Home Alert Refinement

Ordered documentation after Stage 79B Home hierarchy wiring.

**Commit policy:** Post-build audit PASS and explicit user approval per sub-stage.

---

## Stage map

| Stage | Type | Document | Verdict | Commit |
|-------|------|----------|---------|--------|
| 80A | VI / Hidden Intelligence architecture audit | [80A-visual-hidden-intelligence-architecture-audit.md](./80A-visual-hidden-intelligence-architecture-audit.md) | NEEDS ATTENTION | — |
| 80B-A | Alert duplication collapse audit | [80B-A-home-alert-duplication-collapse-audit.md](./80B-A-home-alert-duplication-collapse-audit.md) | NEEDS ATTENTION | — |
| 80B-B | Build — alert dedup phase 1 | [80B-B-build-home-alert-dedup-phase-1.md](./80B-B-build-home-alert-dedup-phase-1.md) | Built (local) | *held* |
| 80B-C | Post-build audit (80B-B) | — | Pending | — |
| 80C | Main Action dominance audit | — | Planned | — |
| 80D | Stability Room shadow snapshot audit (no UI) | — | Planned | — |

---

## Key functions (index.html)

| Function | Role |
|----------|------|
| `geodeHomeMainActionAlertDedupContext` | Read-only MA vs alert dedup signals (80B-B) |
| `geodeHomeOrchestrationResolve` | Sets `surfaces.overBudget.show` with dedup rules (80B-B) |
| `geodeHomeOrchSurfaceShowResolved` | Render consumer (79B-B) |

---

## Related docs

- [Architecture notes — Home alert dedup](../../architecture-notes.md)
- [Stage 79 — Home hierarchy](../79/README.md)
