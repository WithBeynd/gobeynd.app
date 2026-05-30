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

**Current state (May 2026):**

- 77B-B + 77C-B built locally; **77B-C / 77C-C / 77D-A / 77D-B** audit docs on disk (77D-B.1 closure)
- **77D-B verdict:** **PASS** (77D-B.2 console QA recorded); **user commit approval still required**
- Capability score (77D-A): **7.5 / 10**
- Next: user approves commit → bundled `feat(ask): add skip guardrails and over-budget context for Ask Beynd`

---

## External / generated

| Path | Notes |
|------|-------|
| `beynd-verification-audit-report.csv` | Untracked verification export; not part of stage gate |
