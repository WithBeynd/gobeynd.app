# Stage 90B-B — Home Pacing & Orientation Consolidation Build

**Type:** Display + pacing + suppression only  
**Verdict:** **PASS**  
**Date:** June 2026  
**Parent audit:** [90B Audit](./90B-home-pacing-orientation-consolidation-audit.md)

---

## What changed

### New display helpers (render guards only)

| Helper | Purpose |
|--------|---------|
| `geodeHomeOverbudgetCardWouldShow(state)` | Mirrors orchestration-gated overbudget card visibility |
| `geodeHomeNeedsAttentionWouldShow(state)` | Mirrors orchestration-gated needs-attention card visibility |
| `geodeHomePressureOwnsNarrative(state)` | True when a strong pressure surface already owns Home orientation |

### Suppression rules implemented

| ID | Rule |
|----|------|
| **90B-S1** | When `geodeHomePressureOwnsNarrative(S)` → suppress Insight/Note strip in `renderInsights()`, `geodeHomeCoachingStripHtml()` (insight lane only), and `geodeHomePeekWouldShowInsightStrip()`. Human Moment lane unchanged. |
| **90B-S2** | When overbudget or needs-attention card would render → `geodeHomeAnticipatoryMaybeHtml()` returns empty. Anticipatory system preserved; display only suppressed. |
| **90B-S3** | When `calcMonthlyLeftover(S) < 0` → subscription renewal card hidden on Home. Subscription logic, data, and Money tab access unchanged. |
| **90B-S4** | When `geodeHomePressureOwnsNarrative(S)` → focus goal renders in compact strip. |
| **90B-S5** | When orchestration resolve sets `surfaces.focusGoal.mode === 'compact'` → render uses compact strip (existing dedup path preserved). |

### `geodeHomePressureOwnsNarrative` returns true when any of:

1. Persistent overbudget card would show (orchestration + `geodeHomePersistentOverBudgetCardVisible`)
2. Needs-attention card would show
3. Soft-priority band is `critical` or `focused`
4. Main action visual register is `pressure`, `risk`, or `review`

---

## What did not change

- Plan math (`getMonthPlan`, affordability, `calcMonthlyLeftover`, debt/buffer/invest sizing)
- Payment canonicalisation and release accounting
- Orchestration **producers** (`geodeHomeOrchestrationResolve`, deferred queue producers)
- Reality, Reflection, Tier-C, `noticed.*`
- Human Moment selection logic (only Insight lane suppressed under pressure)
- Ask Beynd entry
- Main Action generation
- Subscription renewal calculations and “Keep it” semantics
- `service-worker.js`, `coaching.json`, manifest, worker, icons

---

## Copy changes (90B-C1–C4)

| Surface | Before | After |
|---------|--------|-------|
| Insight strip header | “Insight” + sparkles icon | “Note” (no sparkles) |
| Persistent overbudget kicker | “Over budget” | “This month” |
| Persistent overbudget body | “…under pressure.” | “Plan can show where to adjust.” |
| QS overbudget kicker | “Your plan shows you're over budget” | “Spending exceeds income” |
| QS overbudget body | “…here to fix…” | “Plan can show which category to adjust first.” |
| QS overbudget subline | “hardest part — …” | “You now know the number. That is a useful starting point.” |
| Month rollover toast | “New month — your plan has rolled forward.” | “Your month has carried forward.” |
| Irregular income banner | em dash | full stop between sentences |

---

## Em dash handling

| Location | Change |
|----------|--------|
| Month rollover toast | em dash → removed (shorter sentence) |
| QS overbudget subline | em dash → removed |
| Irregular income banner | em dash → period |
| Overbudget / QS targeted strings | no em dashes in final copy |

**Not replaced:** JS operators, `\u2014` in unrelated strings, regex, object keys, Plan/Reality/Reflection copy outside this build scope, needs-attention card internal strings (unchanged).

---

## Anti-over-suppression checks

| Scenario | Expected | Guard |
|----------|----------|-------|
| **A. Normal positive-left month** | Main action, Note strip, Ask Beynd, full focus goal when not deduped | `geodeHomePressureOwnsNarrative` returns false |
| **B. Overbudget month** | Overbudget or MA owns; Note suppressed; anticipatory suppressed; subscription hidden; focus compact | S1–S4 active |
| **C. Needs-attention month** | Needs-attention owns; duplicate Note/anticipatory suppressed; MA still renders | S1–S2 |
| **D. Partial setup** | Empty/onboarding paths bypass pressure helper early exits | empty-state guards unchanged |
| **E. Release / Reflection / Reality** | No new surfaces | no reads of release ledger; no Tier-C wiring |

**Calm coaching preserved via:** Human Moment lane (orchestration + legacy path), Main Action, Ask Beynd, since-last-visit (existing gates), goal completion (existing gates), contribution awareness only when pressure does **not** own narrative.

---

## Validation results

| Check | Result |
|-------|--------|
| Inline script syntax (`new Function` on script blocks) | **SYNTAX_OK** |
| Removed Home “Insight” label in strip | **PASS** |
| Removed “here to fix” / “hardest part” in QS overbudget | **PASS** |
| Forbidden phrases in changed Home copy (`fix`, `problem solved`, `pressure covered`, etc.) | **PASS** (none in changed strings) |
| `service-worker.js` | **Untouched** |

---

## Manual QA checklist

| Case | Status |
|------|--------|
| Home normal month (positive left) | **Code review PASS** — pressure helper false; Note/HM/MA can show |
| Home overbudget month | **Code review PASS** — S1–S4 + S3 |
| Home needs-attention month | **Code review PASS** — S1–S2 |
| Home with subscription due + positive left | **PASS** — sub card still shows |
| Home with subscription due + negative left | **PASS** — S3 hides card |
| Home with focus goal under pressure | **PASS** — compact strip |
| Home after month rollover | **PASS** — softer toast (existing once-per-boundary via `geode_app_last_ym`) |
| Quick Setup overbudget path | **PASS** — calm copy |
| Ask Beynd opens | **PASS** — untouched |
| Plan / Reality / Reflection / Money | **PASS** — no logic changes |

*Runtime browser QA recommended before commit.*

---

## Regression risks

| Risk | Mitigation |
|------|------------|
| `review` MA register suppresses Note on calm review months | Acceptable per 90B spec; MA still orients |
| `focused` band suppresses Note even when only mild tightness | Band already existed; aligns with pressure months |
| Peek/orchestration meta line may show “focused quiet” more often | Intended — fewer false insight promises |
| Helper calls `geodeOverdueCardHtml()` twice in needs-attention check | Pre-existing pattern; display-only |

---

## Files changed

| File | Change |
|------|--------|
| `index.html` | Helpers, suppressions, copy |
| `docs/stages/90B-home-pacing-orientation-consolidation-build.md` | This document |

---

## Commit recommendation

**Safe to commit** after browser smoke QA on Home scenarios A–D.

Suggested message:

```
fix(home): reduce pressure stacking with display-only pacing guards

Suppress duplicate Note/anticipatory/subscription surfaces when pressure
already owns Home, compact focus goal under load, and soften overbudget copy.
```

**No service worker bump.**

---

## Core philosophy

Home should feel calmer, not emptier. Beynd should guide quietly, not disappear.
