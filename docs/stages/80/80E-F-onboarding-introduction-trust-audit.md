# Stage 80E-F — Onboarding Introduction & Trust Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  
**Baseline:** `a4e1349` — 80E-D committed (`feat(reality): carry forward monthly context as suggestion`)

---

## Objective

Audit how new users are introduced to **Reality** and **Ask Beynd** without onboarding fatigue or duplicating Quick Setup.

**Core question:** How should Beynd explain:

- **Reality** = current truth and monthly context  
- **Ask Beynd** = explain why your plan looks this way  

…without adding forms or questions?

---

## Executive summary

New users get a solid financial baseline (onboarding + Quick Setup) but **no coherent first explanation** of Reality and Ask Beynd. Reality is mentioned fragmentally (QS step 2, post-QS Home nudge, Money card). Ask Beynd is introduced only on first modal open — late and generic.

**Recommendation:** Keep onboarding at **3 steps, zero new fields**. Refine **`pg-fr` first-run intro (copy-only)** — not onboarding, not Quick Setup. Do not add API-key setup or month-context forms to intro flows.

---

## Current surfaces

| Surface | Reality | Ask Beynd |
|---------|---------|-----------|
| Onboarding (`pg-ob`) | No | No |
| First-run intro (`pg-fr`) | No | No |
| Quick Setup step 2 | Balance sense-check hint only | No |
| Post-QS Home nudge | Balance-only optional prompt | No |
| Money overview card | Balance comparison CTA | No |
| Ask first-open modal | No | Generic intro + privacy foot |

---

## Duplication risk

| If added to… | Risk |
|--------------|------|
| Onboarding ob3+ | **High** — income type already in ob3 + QS |
| Onboarding | **High** — dependants, financial facts |
| First-run intro (copy-only) | **Low** — orients without re-asking |
| New Home card | Medium — post-QS Reality nudge exists |

---

## Verdicts

| Area | Verdict |
|------|---------|
| **Overall** | NEEDS ATTENTION |
| **Onboarding fatigue** | At budget — 3 steps OK; do not expand |
| **Reality intro** | NEEDS ATTENTION — fragmented; monthly context unnamed in intro |
| **Ask Beynd intro** | NEEDS ATTENTION — modal-only; missing “explain your plan” hook |

---

## Recommended copy locations

| Copy | File | Element |
|------|------|---------|
| Reality routing | `index.html` | `#fr2` `.fr-p` |
| Ask Beynd routing | `index.html` | `#fr3` `.fr-p` |
| Ask detail (optional later) | `coaching.json` | `askBeynd.firstRunIntro` |

---

## Surfaces to avoid

- `pg-ob` / `ob1`–`ob3`  
- Quick Setup steps  
- Reality page logic  
- Ask Beynd modal structure / BYOK flow  
- New Home orchestration surfaces  

---

## Service worker

**No bump** for first-run intro copy-only changes.

---

## Next

[80E-G — Build first-run intro copy refinement](./80E-G-build-first-run-intro-copy.md)
