# Beynd Documentation Index

Project documentation for audits, builds, handovers, and architecture memory.

---

## Policies

| Document | Purpose |
|----------|---------|
| [Stage documentation policy](./stage-documentation-policy.md) | Completion gate: what must exist before a stage is done |

---

## Plan stabilisation (June 2026)

**Stable HEAD:** `9796f2e`

| Document | Purpose |
|----------|---------|
| [**Handover — Plan stabilisation**](./handover.md) | **Primary reference** — audit-first model, protected functions, F.1–F.3 shipped |
| [Plan stabilisation completed](./plan-stabilisation-completed.md) | Stages B, C, D, D.2, INV-B — goals, principles, QA |
| [Allowed language by readiness state](./allowed-language-by-readiness-state.md) | F.1-PRE copy contract — what Beynd may say before a plan truly exists |
| [Plan backlog](./plan-backlog.md) | Open items, dependency order, trust/regression notes |
| [Strategic systems (partial)](./strategic-systems-partial.md) | Stability Room, Savings Release, Debt Review, Reality, adaptive philosophy |

---

## Architecture (durable)

| Document | Purpose |
|----------|---------|
| [Architecture notes](./architecture-notes.md) | Canonical paths, dormant code, Ask Beynd / plan rationale pointers |

---

## Handovers

| Document | Series | Status |
|----------|--------|--------|
| [**Plan stabilisation handover**](./handover.md) | Post-81F / Plan | **Primary reference** — F.3 shipped at `9796f2e` |
| [**Stage 76–77 — Ask Beynd evolution**](./handovers/handover-stage-76-77-ask-beynd-evolution.md) | 76–77 | Primary reference for Ask Beynd work |
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
- **80E-F / 80E-G** — first-run intro copy for Reality / Ask Beynd; **80E-G.2** trigger fix
- **80F-B / 80F-D** — `geodeStabilityRoomSnapshot` shadow read-model
- **80G-B / 80G-B.1 / 80G-B.2 / 80G-B.3** — `geodeStabilityRoomVisualModel` shadow visual interpreter (`mode: 'reflection'`, `noGo`; atmosphere `room`; no UI)
- **80H-B / 80H-B.1** — `geodeStabilityRoomEntryGate` shadow entry gate (`label`/`dismissLabel`, `justSavedMonthContext`; no UI)
- **80I-A / 80I-B / 80I-C.1** — experience ViewModel architecture audit + shadow copy composer + contract hardening (`density`, audit/noGo flags, block `source`; no UI)
- **80J-A / 80J-B / 80J-D / 80J-E** — Reality reflection entry audit + inline link + in-card footer hierarchy
- **80K-A / 80K-B** — Reflection surface architecture audit + Money `msub='reflection'` sub-surface (ExperienceModel render only)
- **80L-A / 80L-B** — Reflection → Ask Beynd integration audit + modal overlay with bounded context (no auto-send)
- **80M-A** — Reflection bundle release prep: service worker **v1.0.73** bump for user-facing Reflection surface + Ask integration (**80J / 80K / 80L**); no Reflection/Ask/UI logic changed in 80M-A; commit after **80M-B** final audit
- **80M-C.1 / 80M-C.2** — month context skip audit + visit-scoped empty skip (`geode_month_context_skip_visit`; “Skip for now” = not this visit, not this month)

### Stage 81 — Debt truth & net worth

See [`docs/stages/81/README.md`](./stages/81/README.md).

**Current state (May 2026):**

- **81A / 81B** audits — dual-ledger truth gap documented (payments vs confirmed balances)
- **81B-1** built locally — debt health fields + provider review awareness in Money (no payment balance mutation, no Ask/Plan changes)
- **81B-2** built locally — shadow `geodeEstimateDebtPrincipalApplied` + snapshot (no balance/net worth/UI wiring)
- **81B-2.2** built locally — Debt Health compact inline + conditional display; Review button removed
- **81B-2.3** built locally — debt card one factual line only; provider narrative in Edit Debt modal
- **81D-2** built locally — shadow savings release eligibility + preview (no apply/storage/UI)
- **81D-3** built locally — savings release confirmation sheet; Plan overbudget **Use saved money**; `S.savingsReleases[]` + `activityLog`; Monthly Left unchanged on release
- **81D-3.1** built locally — `savingsReleases` on backup whitelist; Savings Release copy em-dash compliance
- **81D-3.5** built locally — buffer contributions auto-create or link emergency goal on save (forward-only; no backfill)
- **81D-3.6** built locally — Plan buffer step uses adequacy gate (fixes 81D-3.5 Plan regression)
- **81D-3.7** built locally — state-aware buffer action copy (add vs contribute; copy only)

---

## External / generated

| Path | Notes |
|------|-------|
| `beynd-verification-audit-report.csv` | Untracked verification export; not part of stage gate |
