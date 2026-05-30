# Stage 80E-D — Build Reality Context Continuity

**Type:** Implementation  
**Verdict:** Built — post-build audit pending  
**Date:** May 2026  
**Parent:** [80E-C audit](./80E-C-reality-context-continuity-audit.md)

---

## Objective

Preserve previous-month Reality human context as a carry-forward **suggestion**, without automatically applying it to the new month.

**Rule:** Carry forward context. Do not carry forward assumptions.

---

## Scope

| File | Change |
|------|--------|
| `index.html` | `monthContextCarry`; normalize on rollover; Reality form affordance |

---

## Schema

```js
S.monthContextCarry = {
  ym: 'YYYY-MM',      // source month
  protect: '',
  worried: '',
  success: '',
  savedAt: number
}
```

Written in `geodeNormalizeMonthContext` when `monthContext.ym` changes and prior month had any text. **Not** fed to Plan, Ask Beynd, or affordability until user **Save month context**.

---

## Reality UX

When current month empty and carry exists (expanded form only):

- Summary line: *From last month: …*
- Right-aligned **Use last month ›** — fills inputs only
- Placeholders mirror carry text
- **Save month context** still required

---

## Not touched

Onboarding, Quick Setup, Home, Plan, Ask Beynd, Month Shift, protected-spending logic, SW, pure modules.

---

## Service worker

**No bump.**

---

## Next

Post-build audit **80E-E**.
