# Stage 79B-D — Home Alert Duplication & Main Action Dominance Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Baseline:** `8dc9855` — over-budget + needs-attention orchestration gating (79B-B)  
**Date:** May 2026  

---

## Core finding

Home can stack up to **three** pressure-tier surfaces before Main Action (over-budget + needs-attention + MA) in critical states. Main Action is structurally below alerts but **visually drowned**. Coaching strip can bypass orchestration when `coachingStrip.show === false` via legacy fallback.

---

## Duplication severity

| Pair | Severity |
|------|----------|
| Over-budget card + MA “Bring spend back to plan” | **High** |
| Needs-attention + MA “Clear overdue items first” | **High** (headline); card adds item names |
| Over-budget + overdue + MA | **Severe** (triple stack) |
| Coaching strip + MA (focused/open) | **Medium** when legacy bypass fires |
| Subscription + MA | **Low–medium** (critical defers to muted line) |
| Focus goal + MA goal step | **Low** (compact dedup exists) |

---

## Main Action dominance rules (product)

| Band | Rule |
|------|------|
| **Critical** | One alert tier max → Main Action immediately after → no coaching strip |
| **Focused** | Main Action dominant → at most one secondary surface |
| **Open** | Hero atmosphere may lead; MA visible; coaching optional |

---

## Coaching strip fallback gap

`geodeHomeCoachingStripHtml()` when `_orchStrip.show === false`:

- If `geodeHomeCoachingStripCanSafelySkip` → blank ✓
- Else → **legacy HM/Insight** ⚠️ (orchestration override)

Critical band (`reason: home_band_critical`) is safe. **Open/focused** with resolve `show: false` and no safe-skip reason can still render legacy content.

**Recommended next build:** **79B-E** — when orchestration says `show === false`, always return blank; legacy only when resolve missing.

---

## Single critical alert tier (future)

Data exists (`homeBand`, over-budget, overdue items, muted lines). Requires display-only summary helper + detail preservation (muted line or hidden intelligence). **Defer** until coaching parity and alert dedup design complete.

---

## Safest build sequence

1. **79B-E** — coaching strip parity (this audit’s pick)  
2. Collapse over-budget when MA pressure path  
3. Critical alert summary design  
4. Collapse needs-attention with muted item detail  
5. Wire focus goal compact/full from resolve  

---

## Next stage

[79B-E — Build coaching strip orchestration parity](./79B-E-build-coaching-strip-parity.md)
