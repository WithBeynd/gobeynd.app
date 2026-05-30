# Stage 80E-G — Build First-Run Introduction Copy Refinement

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** [80E-F audit](./80E-F-onboarding-introduction-trust-audit.md)

---

## Objective

Orient new users to **Reality** and **Ask Beynd** via first-run intro copy only — no new questions, fields, or routing changes.

**Rule:** Orient users. Do not interrogate users.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `#fr2` and `#fr3` copy in `pg-fr` only |

---

## Copy changes

### `#fr2` — Reality

Added paragraph after the three-step flow list:

> Reality helps you sense-check your plan against today and keep track of what matters this month. Nothing is pulled from your bank.

### `#fr3` — Ask Beynd + Home routing

Replaced single closing paragraph with:

> Ask Beynd can explain why your plan looks the way it does — optional, and your plan works without it.

> Your next step is on Home. Reality and Ask Beynd are there when you want more context.

---

## Not touched

- `pg-ob` / `ob1`–`ob3`  
- Quick Setup steps  
- Reality logic, Ask Beynd logic, Home, Plan, routing  
- `coaching.json` (Ask modal intro unchanged; optional later pass)  
- `service-worker.js`, `manifest.json`, `js/geode-pure/*`

---

## Service worker

**No bump.**

---

## Manual QA

- [ ] Fresh install / clear `geode_fr_intro_v1`: ob → fr1 → fr2 (Reality copy) → fr3 (Ask copy) → Home  
- [ ] Skip on fr2/fr3 still works  
- [ ] QS step 2 Reality line unchanged; no awkward duplication felt in sequence  
- [ ] First Ask open: modal intro still shows; consistent with fr3 tease  
- [ ] No API keys mentioned in first-run intro  

---

## Next

Post-build audit **80E-H** (optional).
