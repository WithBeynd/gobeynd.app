# Beynd Documentation Index

Project documentation for audits, builds, handovers, and architecture memory.

---

## Policies

| Document | Purpose |
|----------|---------|
| [Stage documentation policy](./stage-documentation-policy.md) | Completion gate: what must exist before a stage is done |

---

## Architecture (durable)

| Document | Purpose |
|----------|---------|
| [Architecture notes](./architecture-notes.md) | Canonical paths, dormant code, Ask Beynd / plan rationale pointers |

---

## Handovers

| Document | Series | Status |
|----------|--------|--------|
| [**Stage 76–77 — Ask Beynd evolution**](./handovers/handover-stage-76-77-ask-beynd-evolution.md) | 76–77 | **Primary reference** — read before future Ask Beynd work |
| [Stage 55C — Reality-to-Plan alignment](./handover-stage-55c-reality-to-plan-alignment.md) | 55C | Complete |
| [Stage 53 mini milestone](./handover-stage-53-mini-milestone.md) | 53 | Reference |
| [Stage 76 — Ask Beynd reasoning (detail)](./handover-stage-76-ask-beynd-reasoning.md) | 76 | Complete (`b1de9dd`) |

---

## Stage series

### Stage 76 — Ask Beynd reasoning & plan rationale snapshot

See [`docs/stages/76/README.md`](./stages/76/README.md) for ordered audits, builds, and verdicts.

**State:** PLAN RATIONALE context block wired (`b1de9dd`).

### Stage 77 — Ask Beynd capability & guardrails

See [`docs/stages/77/README.md`](./stages/77/README.md) and **[`docs/handovers/handover-stage-76-77-ask-beynd-evolution.md`](./handovers/handover-stage-76-77-ask-beynd-evolution.md)** (primary handover).

**State:** Complete (`c1a0aab` — skip guardrails + over-budget Ask context). Capability score (77D-A): **7.5 / 10**.

### Stage 79 — Home hierarchy & orchestration wiring

See [`docs/stages/79/README.md`](./stages/79/README.md).

**Current state (May 2026):**

- **79B-B through 79B-L** committed through `85fe613`
- No service-worker bump for 79B presentation passes alone

### Stage 80 — Visual Intelligence & Home alert refinement

See [`docs/stages/80/README.md`](./stages/80/README.md).

**Current state (May 2026):**

- **80A / 80B-A** architecture + alert dedup audits documented
- **80B-B** committed (`46ff1e1`); **80B-C PASS**
- **80C-B / 80C-D** built locally — MA route value tier + Review Plan inline affordance (80C-D.1)
- **80C-C** post-build audit **PASS** (80C-B logic)
- **80E-D** built locally — Reality `monthContextCarry` + Use last month affordance

---

## External / generated

| Path | Notes |
|------|-------|
| `beynd-verification-audit-report.csv` | Untracked verification export; not part of stage gate |
