# 80R-C — Reserve Classification Runtime Gate

**Stage:** 80R-C  
**Type:** Runtime implementation (Savings Release layer only)  
**Verdict:** Built — post-build audit pending  
**Parent:** [80R-B — Source Classification Model](./80R-B-source-classification-model.md)  
**Contract:** [80R-A.1 — Savings Release Continuity Contract](./80R-A.1-savings-release-continuity-contract.md)

---

## Objective

Introduce **deterministic reserve classification** into the live Savings Release eligibility/runtime layer without changing Plan math, affordability, Monthly Left, overbudget handling, Reality, Reflection, or Home orchestration.

---

## Scope

| In scope | Out of scope |
|----------|--------------|
| `geodeReserveClassifySource` | Plan / `getMonthPlan` |
| T4 suppression in eligibility | Affordability / `breathingRoomFloor` |
| Source sort order | Modal copy pass (80R-C.1) |
| Metadata on eligibility/preview/rows | New localStorage schema |
| Dev hook `_geodeReserveClassifySource` | service-worker bump |

---

## Files touched

| File | Change |
|------|--------|
| `index.html` | Classification helper, eligibility gate, sort, snapshot metadata |
| `docs/stages/80R/80R-C-runtime-gate.md` | This file |

---

## Files intentionally not touched

- `service-worker.js`, `manifest.json`, `coaching.json`, `js/geode-pure/`, `worker/`, backup/export

---

## Classification hierarchy

| Tier | Class | Eligible | Hidden from UI |
|------|-------|----------|----------------|
| **T0** | `continuity_reserve` | Yes | No |
| **T1** | `flexible_reserve` | Yes | No |
| **T2** | `purpose_reserve`, `unknown_reserve` | Yes | No |
| **T3** | `future_capital` | Yes | No |
| **T4** | `locked_capital`, `protected_reserve` | **No** | **Yes** |

### Deterministic rules (precedence)

**Goals:** `releaseProtected` → T4 | `geodeIsEmergencyBufferGoal` → T0 | `cat: retirement` → T4 | named `cat` → T2 | else → T2 unknown

**Investments:** `releaseProtected` → T4 | `type: pension|property` → T4 | `horizon: long` → T4 | `type: savings` → T1 | `isa` + short → T1 | `goalId` or `purpose: goal-linked` → T2 | `isa|stocks_isa` → T1 short / T3 else | `stocks|crypto|bonds|app` → T3 | `horizon: medium` → T3 | else → T2 unknown

No AI. No behavioural scoring.

---

## Runtime insertion points

```
geodeSavingsReleaseResolveSource
        ↓
geodeReserveClassifySource(state, source)     ← NEW (80R-C)
        ↓
geodeSavingsReleaseEligibility                ← tier gate + metadata
        ↓
geodeSavingsReleaseSourcesSnapshot            ← sort rows
        ↓
geodeOpenSavingsReleaseModal / Preview        ← unchanged copy; sorted default source
        ↓
geodeApplySavingsRelease                      ← T4 blocked via eligibility
```

---

## Protected boundaries

Classification **must not** influence:

- `getMonthPlan`, `calcMonthlyLeftover`, `geodeAffordabilitySnapshot`
- `breathingRoomFloor`, debt sequencing, investment Plan sizing
- Home orchestration, Reality, Reflection, Tier-C
- `S` persistence schema (no new keys written)

Classification **may** influence:

- `eligible` boolean (T4 suppressed)
- Dropdown source order and default selection
- Runtime metadata: `reserveClass`, `reserveTier`, `copyKey` (future copy map)

---

## Eligibility law

1. Resolve source → compute balance as before.  
2. If balance ≤ 0 → ineligible (`zero_available`).  
3. Classify reserve → if T4 or `eligibleForRelease === false` → ineligible (`reserve_tier_suppressed`).  
4. Else → eligible (T0–T3).  

Apply path reuses eligibility — T4 cannot be applied via console bypass without changing classification rules.

---

## Ordering law

After building rows, `geodeSavingsReleaseSortSourceRows`:

1. `reserveTier` ascending (T0 first)  
2. `availableBalance` ascending (smaller first within tier)  
3. Stable `kind:sourceId` tie-break  

Modal `eligible[0]` after sort → lowest-tier, smallest-balance eligible source.

---

## Metadata fields (runtime only)

| Object | Fields added |
|--------|--------------|
| `geodeSavingsReleaseEligibility` output | `reserveClass`, `reserveTier`, `copyKey` |
| `geodePreviewSavingsRelease` output | same |
| Source snapshot rows | `reserveClass`, `reserveTier` on row + eligibility |
| Sources snapshot | `version: 2`, `audit.classificationVersion: 1` |

`copyKey` values: `continuity` | `flexible` | `tradeoff` | `future_capital` | `hidden` — **not consumed by UI in 80R-C** (80R-C.1 copy pass).

Future-safe: `entity.releaseProtected === true` → T4 (no schema migration; field ignored until user sets it).

---

## Future-safe extension path

| Stage | Work |
|-------|------|
| **80R-C.1** | Wire `copyKey` to modal preview + Plan CTA wording |
| **80R-C.2** | T3 extra acknowledgement checkbox |
| **80R-D** | Release history UI; optional `reserveClass` on `savingsReleases[]` (schema audit) |
| **80R-E** | Reality calm link to Plan (no apply) |

---

## Validation checklist

- [ ] Pension / property / long horizon → not in release dropdown  
- [ ] Emergency buffer → T0, appears first when smallest in tier  
- [ ] General goals / investments (T1–T3) still eligible  
- [ ] `calcMonthlyLeftover` unchanged by classification helpers  
- [ ] Plan page overbudget block still renders  
- [ ] `geodeApplySavingsRelease` rejects T4 sources  
- [ ] ReadLints clean; `git diff --check` pass  
- [ ] Only `index.html` + docs changed  

---

## Service worker

**No bump** — Savings Release eligibility layer only; no cache contract change.

---

## Manual QA (console)

```js
// Classify emergency goal
geodeReserveClassifySource(S, { kind: 'goal', id: S.goals[0].id });

// Snapshot — eligibleCount excludes T4
var snap = geodeSavingsReleaseSnapshot(S);
snap.sources.rows.map(function (r) {
  return r.sourceName + ' T' + r.reserveTier + ' ' + r.eligibility.eligible;
});

// Pension should not appear eligible
// (create test pension with balance > 0 if needed)
```

---

**Stage status:** Implementation complete. Post-build audit + manual QA recommended before commit.
