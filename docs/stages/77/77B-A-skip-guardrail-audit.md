# Stage 77B-A — Ask Beynd Skip Guardrail Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION — proceed to 77B-B with Option A  
**Date:** May 2026  

---

## Objective

Design the smallest safe way to prevent Ask Beynd from inventing deterministic skip outcomes without building a skip simulation engine.

---

## Scope

Skip/what-if guardrails only. Read-only audit of `geodeFormatPlanRationaleContextBlock`, snapshot fields, prompts.

---

## Files touched

None (audit only).

---

## Files intentionally not touched

All production code; worker; coaching.json; UI.

---

## Current skip capability

**WEAK** — single assistant rule: “Do not invent skip outcomes.” Snapshot `askBeyndGuidance` references `debtProjectionNote` but is not exported to Ask Beynd context.

---

## Recommended design (77B-B)

| Decision | Choice |
|----------|--------|
| Implementation | **Option A** — extend PLAN RATIONALE assistant rules |
| Detection | **None** — always-on (~300–400 chars) |
| Export debtProjectionNote / goalStatusWhy | **No** — inversion risk |
| Separate SKIP block | **No** — same formatter, same integration point |

---

## Guardrail content (summary)

- Beynd does not simulate skip/delay/reduce outcomes.
- Do not invent dates, interest, balances, penalties, target shifts.
- Use Why + debts/goals for purpose; direction only.
- Preserve user agency; no “can/cannot afford to skip.”
- Debt extras vs minimums — do not infer contractual obligation.
- Goals/buffer/invest: slower progress only, not quantified.
- Reality shift active → flexibility; not a skip simulation.

---

## Risks

- LLM may ignore rules — mitigate with 77B-C manual QA.
- “Can I do less?” overlaps afford-X — guardrail must cover partial pay without simulation.

---

## Validation results

Static audit of context fields and question matrix.

---

## Manual QA requirements

After build: “What happens if I skip this?” / “Can I skip?” / “Can I do less?” / pause goal / don’t pay step — no invented quantified impact.

---

## Future dependencies

77B-B build → 77B-C post-build audit. No commit until 77D post-audit.

---

## Commit readiness

N/A — audit artifact.
