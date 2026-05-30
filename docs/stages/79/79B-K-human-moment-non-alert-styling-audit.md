# Stage 79B-K — Human Moment Non-Alert Styling Audit

**Type:** Read-only design audit  
**Verdict:** NEEDS ATTENTION  
**Date:** May 2026  

---

## Core finding

Home Human Moments render through **`geodeHomeHumanMomentStripHtml`**. Non-`supportive` moments (`tone: 'cautious'`) map to **`insight-card--warning`** — amber border and `--warn` title/icon. That visually competes with Over Budget, Needs Attention, and Main Action on **focused / over-budget** Home.

Human Moments are not alerts. Copy and selection can stay; **styling must not use warn tier**.

---

## Render paths (Home)

All Home HM HTML flows through **`geodeHomeHumanMomentStripHtml`**:

- `geodeHomeCoachingStripHtml` (orchestrated `human_moment`)
- `geodeHomeCoachingStripLegacyHtml` (fallback)

**Reality page** `geodeRealityHumanMoment` uses separate inline styling — out of scope for 79B-L.

---

## When HM appears under pressure

- **`geodeHumanMomentShouldSuppress`** does not block over-budget alone.
- **`homeBand === 'focused'`** (`left < 0`, no overdue) allows coaching strip + HM.
- **`homeBand === 'critical'`** suppresses entire strip (unchanged).

---

## Decision

| Option | Verdict |
|--------|---------|
| A. Always non-warning HM styling | **Recommended** — matches “HM never alert” |
| B. Neutral only under pressure | Partial |
| C. Suppress under pressure | Rejected (too blunt) |
| D. Hidden intelligence | Defer |

**Build:** 79B-L — in `geodeHomeHumanMomentStripHtml`, map `supportive` → `--positive`; all other tones → default `.insight-card` + `nudgeStyle('neutral')`. **No CSS file changes.**

---

## Next stage

[79B-L — Build Home Human Moment non-alert styling](./79B-L-build-human-moment-non-alert-styling.md)
