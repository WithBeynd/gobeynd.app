# Stage 76 — Ask Beynd Reasoning & Plan Rationale Snapshot

Ordered documentation for the Ask Beynd intelligence and plan rationale export workstream.

---

## Stage map

| Stage | Type | Document | Verdict | Commit |
|-------|------|----------|---------|--------|
| 76A | Audit | [76A-ask-beynd-intelligence-audit.md](./76A-ask-beynd-intelligence-audit.md) | NEEDS ATTENTION | — |
| 76B | Audit | [76B-reasoning-architecture-audit.md](./76B-reasoning-architecture-audit.md) | NEEDS ATTENTION | — |
| 76C-A | Design audit | [76C-A-snapshot-design-audit.md](./76C-A-snapshot-design-audit.md) | DESIGN READY | — |
| 76C-B | Build | [76C-B-build-plan-rationale-snapshot.md](./76C-B-build-plan-rationale-snapshot.md) | Built | `cdc77e2` |
| 76C-C | Post-build audit | [76C-C-post-build-audit.md](./76C-C-post-build-audit.md) | PASS | — |
| 76D-A | Verification audit | [76D-A-snapshot-verification-audit.md](./76D-A-snapshot-verification-audit.md) | NEEDS ATTENTION | — |
| 76D-A.5 | Parity audit | [76D-A-5-reality-plan-parity-audit.md](./76D-A-5-reality-plan-parity-audit.md) | NEEDS ATTENTION | — |
| 76D-A.6 | Build | [76D-A-6-reality-alignment-export-build.md](./76D-A-6-reality-alignment-export-build.md) | Built | *uncommitted* |
| 76D-A.7 | Post-build audit | [76D-A-7-post-build-audit.md](./76D-A-7-post-build-audit.md) | PASS | — |
| — | Handover | [../handover-stage-76-ask-beynd-reasoning.md](../handover-stage-76-ask-beynd-reasoning.md) | In progress | — |

---

## Key functions (index.html)

| Function | Role |
|----------|------|
| `geodeBuildCoachingContext()` | Current Ask Beynd context (lossy plan strip) |
| `geodePlanRationaleSnapshot(state, opts)` | Shadow plan rationale export |
| `geodePlanRationaleAlignmentBlock()` | Alignment slice for snapshot (76D-A.6) |
| `getMonthPlan()` | Allocation SSOT |
| `geodePeekActiveRealityPlanAlignment()` | Read-only active Month Shift overlay |

---

## Next stage (recommended)

**76D-B** — Wire snapshot serialization into Ask Beynd context only (not UI). Use rule **C**: when `alignment.active`, expose both baseline (`steps[].amount`) and display (`alignment.stepAdjustments[].displayAmount`).
