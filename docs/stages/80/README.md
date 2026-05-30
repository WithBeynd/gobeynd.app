# Stage 80 — Visual Intelligence & Home Alert Refinement

Ordered documentation after Stage 79B Home hierarchy wiring.

**Commit policy:** Post-build audit PASS and explicit user approval per sub-stage.

---

## Stage map

| Stage | Type | Document | Verdict | Commit |
|-------|------|----------|---------|--------|
| 80A | VI / Hidden Intelligence architecture audit | [80A-visual-hidden-intelligence-architecture-audit.md](./80A-visual-hidden-intelligence-architecture-audit.md) | NEEDS ATTENTION | — |
| 80B-A | Alert duplication collapse audit | [80B-A-home-alert-duplication-collapse-audit.md](./80B-A-home-alert-duplication-collapse-audit.md) | NEEDS ATTENTION | — |
| 80B-B | Build — alert dedup phase 1 | [80B-B-build-home-alert-dedup-phase-1.md](./80B-B-build-home-alert-dedup-phase-1.md) | Built | `46ff1e1` |
| 80B-C | Post-build audit (80B-B) | — | **PASS** | — |
| 80C-A | Main Action route value audit | [80C-A-main-action-route-value-audit.md](./80C-A-main-action-route-value-audit.md) | NEEDS ATTENTION | — |
| 80C-B | Build — MA route value presentation tier | [80C-B-build-main-action-route-value-tier.md](./80C-B-build-main-action-route-value-tier.md) | Built (local) | *held* |
| 80C-C | Post-build audit (80C-B) | — | **PASS** | — |
| 80C-D | Review Plan presentation polish (incl. D.1 inline affordance) | [80C-D-review-plan-presentation-polish.md](./80C-D-review-plan-presentation-polish.md) | Built (local) | *held* |
| 80E-C | Reality context continuity audit | [80E-C-reality-context-continuity-audit.md](./80E-C-reality-context-continuity-audit.md) | NEEDS ATTENTION | — |
| 80E-D | Build — Reality context continuity | [80E-D-build-reality-context-continuity.md](./80E-D-build-reality-context-continuity.md) | Built (local) | *held* |
| 80E-F | Onboarding introduction & trust audit | [80E-F-onboarding-introduction-trust-audit.md](./80E-F-onboarding-introduction-trust-audit.md) | NEEDS ATTENTION | — |
| 80E-G | Build — first-run intro copy refinement | [80E-G-build-first-run-intro-copy.md](./80E-G-build-first-run-intro-copy.md) | Built (local) | *held* |
| 80E-G.1 | First-run intro trigger audit | [80E-G.1-first-run-intro-trigger-audit.md](./80E-G.1-first-run-intro-trigger-audit.md) | NEEDS ATTENTION | — |
| 80E-G.2 | Build — first-run intro trigger fix | [80E-G.2-build-first-run-intro-trigger-fix.md](./80E-G.2-build-first-run-intro-trigger-fix.md) | Built (local) | *held* |
| 80F-A | Stability Room shadow snapshot audit | [80F-A-stability-room-shadow-snapshot-audit.md](./80F-A-stability-room-shadow-snapshot-audit.md) | NEEDS ATTENTION | — |
| 80F-B | Build — Stability Room shadow snapshot | [80F-B-build-stability-room-shadow-snapshot.md](./80F-B-build-stability-room-shadow-snapshot.md) | Built (local) | *held* |
| 80F-D | Shadow snapshot contract hardening | [80F-D-shadow-snapshot-contract-hardening.md](./80F-D-shadow-snapshot-contract-hardening.md) | Built (local) | *held* |
| 80F-F | Visual reflection architecture audit | [80F-F-visual-reflection-architecture-audit.md](./80F-F-visual-reflection-architecture-audit.md) | NEEDS ATTENTION | — |
| 80G-B | Build — Stability Room visual model shadow | [80G-B-build-stability-room-visual-model.md](./80G-B-build-stability-room-visual-model.md) | Built (local) | *held* |
| 80G-B.1 | Atmosphere naming alignment (`room`) | [80G-B.1-atmosphere-naming-alignment.md](./80G-B.1-atmosphere-naming-alignment.md) | Built (local) | *held* |
| 80G-B.2 | Visual model contract completion | [80G-B.2-visual-model-contract-completion.md](./80G-B.2-visual-model-contract-completion.md) | Built (local) | *held* |
| 80G-B.3 | Visual model no-go contract | [80G-B.3-visual-model-no-go-contract.md](./80G-B.3-visual-model-no-go-contract.md) | Built (local) | *held* |
| 80H-A | Reflection entry gate architecture audit | [80H-A-reflection-entry-gate-architecture-audit.md](./80H-A-reflection-entry-gate-architecture-audit.md) | NEEDS ATTENTION | — |
| 80H-B | Build — reflection entry gate shadow | [80H-B-build-reflection-entry-gate-shadow.md](./80H-B-build-reflection-entry-gate-shadow.md) | Built (local) | *held* |
| 80H-B.1 | Entry gate contract alignment | [80H-B.1-reflection-entry-gate-contract-alignment.md](./80H-B.1-reflection-entry-gate-contract-alignment.md) | Built (local) | *held* |

---

## Key functions (index.html)

| Function | Role |
|----------|------|
| `geodeHomeMainActionAlertDedupContext` | Read-only MA vs alert dedup signals (80B-B) |
| `geodeHomeOrchestrationResolve` | Sets `surfaces.overBudget.show` with dedup rules (80B-B) |
| `geodeHomeOrchSurfaceShowResolved` | Render consumer (79B-B) |
| `geodeMainActionRouteValue` | Read-only MA presentation tier (80C-B) |
| `geodeGetMonthContextCarry` | Prior-month Reality context for carry affordance (80E-D) |
| `geodeStabilityRoomSnapshot` | Shadow Stability Room reflection read-model (80F-B) |
| `geodeStabilityRoomVisualModel` | Shadow visual/atmosphere interpreter (80G-B) |
| `geodeStabilityRoomEntryGate` | Shadow entry visibility gate (80H-B) |

---

## Related docs

- [Architecture notes — Home alert dedup](../../architecture-notes.md)
- [Stage 79 — Home hierarchy](../79/README.md)
