# 80N-I — noticed.* Copy Map Helper

**Stage:** 80N-I  
**Type:** Copy governance infrastructure (metadata only)  
**Files:** `index.html`, this doc  

---

## Purpose

Implement the 80N-G language contract as a **read-only code helper** so future Tier-C consumers can look up approved phrasing rules without rendering copy or wiring UI.

---

## Helpers

### `geodeNoticedCopyMap(domain, field, opts)`

Returns structured metadata only:

| Field | Meaning |
|-------|---------|
| `approvedTone` | Voice register (`observational_calm`, `echo_user_words`, etc.) |
| `safePhrases` | `{ approved, soft, reflective }` example phrases (not auto-rendered) |
| `forbiddenPhrases` | Explicit banned strings |
| `forbiddenCategories` | Governance categories |
| `surfaceEligibility` | Which surfaces may consume later |
| `confidenceRule` | How to hedge (`hedge_with_may_or_appeared`) |
| `renderForbiddenDefault` | Default: do not render without explicit gate |
| `requiresUserRequest` / `requiresOptIn` | Ask / Reflection gates |
| `requiresParityPass` / `requiresCollisionGate` | 80N-C / 80N-H gates |
| `preferredSurface` | First authorised surface when eligible |
| `fallbackSilence` | Prefer silence when uncertain |
| `permanentlyInternal` | Never user-facing |
| `mayDriveBehaviour` / `mayDriveDeferral` | Always `false` |

**Subfield maps:** `geodeNoticedCopyMap('breathingRoomIntent', 'planPath')`, `('pacing', 'mode')`, etc.

### `geodeNoticedCopyMapAudit(opts)`

Debug report: covered domains, internal-only list, display-safe list, gating requirements, surfaces allowed later, safety contract flags.

**Console exposure:**

- `window.geodeNoticedCopyMap`
- `window.geodeNoticedCopyMapAudit`
- `window._geodeNoticedCopyMapAudit` (last report)

---

## Domain map

| Domain | Preferred surface | Internal? | Key safety |
|--------|-------------------|-----------|------------|
| `pacing` | Stability Room | No | Defer to Plan note; never `band` / `reasonCodes` |
| `resilience` | Stability Room | No | Explain deferral only; never drive deferral |
| `recovery` | Reflection | No | No streak pressure |
| `continuity` | Reflection (Tier D) | No | No “usual month”; no raw `often*` |
| `flexibility` | Stability / Reflection | No | Echo user protect/worried |
| `breathingRoomIntent` | Plan detail or Stability | No | `planPath` canonical; `posturePath` observational |
| `pressure` | **None** | **Yes** | Permanent Tier A |

---

## Forbidden language (summary)

- Personality / discipline grading  
- Mental-health framing  
- Certainty / prediction / “usual month”  
- Shame / optimisation pressure  
- Raw `reasonCodes`, pressure bands, scores  
- “Beynd knows you” / AI certainty theatre  

---

## Future consumer rules

1. Call `geodeNoticedCopyMap` **after** `geodeNoticedParityCheck` PASS for domain.  
2. Call `snap.stabilityMetadata.narratorCollisions` — respect `recommendSilence`.  
3. Max **one** Tier-C block per surface (80N-H).  
4. Never render `pressure` or raw codes.  
5. Plan amounts: only `breathingRoomIntent.planPath` phrasing.  

**No consumer wired in 80N-I.**

---

## Why no UI was added

80N-I is governance infrastructure only. Visible copy requires 80N-J with parity + collision gates.

---

## Console QA

```js
geodeNoticedCopyMap('pacing');
geodeNoticedCopyMap('pressure');
geodeNoticedCopyMap('breathingRoomIntent');
geodeNoticedCopyMap('breathingRoomIntent', 'planPath');
window._geodeNoticedCopyMapAudit && window._geodeNoticedCopyMapAudit();
geodeNoticedCopyMapAudit();
```

---

## Validation

- ReadLints `index.html`
- Inline script syntax (Node)
- `git diff --check -- index.html docs`
- `service-worker.js` unchanged
- No render path calls `geodeNoticedCopyMap`

---

## Next stage

**80N-J** — first single Tier-C Stability block using copy map + `stabilityMetadata` collision gate.
