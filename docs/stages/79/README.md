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
| 79B-F | Post-build audit (79B-E) | — | **PASS** | — |
| 79B-G | Insight/HM contextual relevance audit | *(chat — superseded by 79B-H)* | NEEDS ATTENTION | — |
| 79B-H | Insight pressure reframe audit | [79B-H-insight-pressure-reframe-audit.md](./79B-H-insight-pressure-reframe-audit.md) | NEEDS ATTENTION | — |
| 79B-I | Build — pressure-aware safety Insight reframe | [79B-I-build-pressure-aware-safety-insight.md](./79B-I-build-pressure-aware-safety-insight.md) | Built (local) | *held* |

---

## Key functions (index.html)

| Function | Role |
|----------|------|
| `geodeHomeOrchSurfaceShowResolved` | Alert gating (79B-B) |
| `geodeHomeCoachingStripHtml` | Coaching strip parity (79B-E) |
| `geodeHomeSafetyInsightUnderPressure` | Pressure reframe gate (79B-I) |
| `geodeHomeSafetyInsightPressureCopy` | Pressure-aware safety Insight copy (79B-I) |
| `geodeInsightPolishBody` / `renderInsights` | Home Insight display |

---

## Related docs

- [Architecture notes — Home orchestration render gating](../../architecture-notes.md)
- [Stage 76–77 Ask Beynd handover](../../handovers/handover-stage-76-77-ask-beynd-evolution.md)
