# Stage Documentation Policy

**Effective:** From Stage 76D-A.7 onward (May 2026)  
**Owner:** Beynd engineering / agent workflow  
**Location:** All stage artifacts live under [`/docs`](./README.md).

---

## Rule

No stage is **complete** until the required documentation exists in the repository.

Documentation is a **first-class project asset** — not an optional chat transcript or memory note.

---

## Required artifacts by stage type

| Stage type | Required documents |
|------------|-------------------|
| **Audit** (read-only) | Audit report under `docs/stages/<series>/` |
| **Build** (code change) | Build report + post-build audit |
| **Design audit** | Design audit report |
| **Architecture review** | Architecture review report |
| **Regression / release** | Regression or release assessment report |
| **Handover** (when series completes or pauses) | Handover note under `docs/handover-*.md` |

---

## Standard document sections

Every stage document **must** include:

1. **Objective** — what the stage was trying to prove or deliver  
2. **Scope** — read-only vs implementation; files in scope  
3. **Files touched** — actual paths changed (or “none” for audits)  
4. **Files intentionally not touched** — protected surfaces  
5. **Risks** — behavioural, parity, mutation, UX, security  
6. **Validation results** — linter, diff-check, syntax, automated checks  
7. **Manual QA requirements** — console steps, user flows, edge cases  
8. **Future dependencies** — what must happen before the next stage  
9. **Commit readiness** — PASS / NEEDS ATTENTION / FAIL + commit message hint if applicable  

---

## Naming convention

```
docs/stages/<series>/<stage-id>-<short-slug>.md
docs/handover-stage-<series>-<topic>.md
```

Examples:

- `docs/stages/76/76C-B-build-plan-rationale-snapshot.md`
- `docs/handover-stage-76-ask-beynd-reasoning.md`

---

## Index and continuity

- [`docs/README.md`](./README.md) — master index of policies, handovers, and stage series  
- [`docs/architecture-notes.md`](./architecture-notes.md) — durable architecture facts (update when behaviour surfaces change)  
- Stage series README (e.g. `docs/stages/76/README.md`) — ordered list of stages with verdicts and commit SHAs  

---

## Agent / developer workflow

1. **Before build:** pre-implementation audit documented (or referenced)  
2. **After build:** build report + post-build audit before declaring complete  
3. **Before commit:** commit readiness section filled; protected files verified  
4. **After merge:** handover updated if the series state changed materially  

Chat transcripts are **not** a substitute for `/docs` files.

---

## Purpose

- **Continuity** — resume work on any machine without relying on IDE chat history  
- **Architectural memory** — preserve *why* Beynd behaves as it does  
- **Onboarding** — new contributors read docs before touching plan / Reality / Ask Beynd  
- **Laptop independence** — repo is the source of truth  
- **Behavioural preservation** — reasoning architecture auditable over time  
