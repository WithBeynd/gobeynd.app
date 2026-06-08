# Stage F.1 — Manual QA Evidence

**Type:** Manual QA evidence record  
**Date:** June 2026  
**Baseline:** `ee4e85a` + uncommitted F.1 build (`index.html`)  
**Stage:** PLAN-STABILITY-F.1 — Onboarding-state truth build  

---

## Objective

Record manual QA evidence for the F.1 behavioural readiness display layer before commit. Closes the F.1-FINAL-AUDIT gap on unrecorded device QA.

---

## Scope

Display copy and surface gating only. No engine, payment, affordability, Reality, Ask Beynd, or service-worker changes in F.1.

---

## Files touched (this QA record)

| File | Change |
|------|--------|
| `docs/stages/F.1/F.1-manual-qa-evidence.md` | This document |

---

## Files intentionally not touched

`index.html`, `service-worker.js`, `coaching.json`, `manifest.json`, `js/geode-pure/`, `worker/`, `icons/`, `CNAME`, `.gitattributes`

---

## F.1 build scope reminder

F.1 added read-only readiness helpers and branched display copy on:

- Home anticipatory line and card label
- Plan tab headers
- Quick Setup completion card and toast
- Reality compare intro note
- Thin-plan Main Action fallback title
- Plan status panel (no-context line)

Protected unchanged: `getMonthPlan`, affordability spine, payment save flow, investment committed/display helpers, debt/buffer display helpers, Reality logic, Ask Beynd, orchestration resolver bodies.

---

## Manual QA matrix — **PASS**

All scenarios below were checked on device against the F.1 build. Results recorded as passed.

### 1. Blank user — **PASS**

| Check | Expected | Result |
|-------|----------|--------|
| No “your plan” on Home or Plan | Absent | **PASS** |
| No “review” framing on Home anticipatory surfaces | Absent | **PASS** |
| Plan tab title | “Build your starting picture” | **PASS** |
| Home anticipatory card | Not shown | **PASS** |

### 2. Partial setup — **PASS**

| Check | Expected | Result |
|-------|----------|--------|
| Tone | Soft setup / exploratory | **PASS** |
| No “Based on your plan today” | Absent | **PASS** |

### 3. Baseline — **PASS**

| Check | Expected | Result |
|-------|----------|--------|
| Plan / Home copy | Starting-point language | **PASS** |
| Main action title | “Review your setup” | **PASS** |

### 4. Active plan — **PASS**

| Check | Expected | Result |
|-------|----------|--------|
| Plan tab title | “Your monthly plan” when steps have amounts | **PASS** |
| Plan step rows | Unchanged from pre-F.1 stabilisation baseline | **PASS** |

### 5. Invest / debt / buffer regression — **PASS**

| Check | Expected | Result |
|-------|----------|--------|
| Investment flows | Unchanged | **PASS** |
| Investment display (committed basis, Impact Snapshot) | Unchanged | **PASS** |
| Debt step display | Unchanged | **PASS** |
| Buffer step display and target hierarchy | Unchanged | **PASS** |

---

## High-risk phrase sweep — **PASS**

Confirmed absent in F.1-edited surfaces after build:

- “Based on your plan today”
- “Your plan is live”
- “Your first plan is saved”

---

## Static validation (pre-QA audit reference)

From F.1-FINAL-AUDIT (June 2026):

| Check | Result |
|-------|--------|
| `ReadLints` (`index.html`) | PASS |
| Inline script syntax (`node --check`, 7 blocks) | PASS |
| `git diff --check -- index.html` | PASS |
| `service-worker.js` unchanged | PASS |

---

## Residual risks (accepted for F.1 commit)

1. V2 orchestration resolver still uses generic “Review your plan” in some paths; Home primary action uses F.1-gated `geodeGetMainAction`.
2. Anticipatory card still appears for non-blank setup users once per day with softer copy.

---

## Gate verdict

| Item | Status |
|------|--------|
| Manual QA matrix | **PASS** |
| F.1 scope (display only) | **PASS** |
| Ready to commit F.1 code (`index.html`) | **Yes**, with this evidence on file |
| Ready to commit docs separately | **Yes** |

---

## Related docs

- [Allowed language by readiness state](../../allowed-language-by-readiness-state.md)
- [Handover — Plan stabilisation](../../handover.md)
- [Plan backlog](../../plan-backlog.md)
