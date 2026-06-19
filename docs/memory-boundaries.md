# Memory Boundaries

**Stage:** 80N-M  
**Type:** Governance specification  
**Parent contract:** [`continuity-ownership-contract.md`](./continuity-ownership-contract.md)  
**Related law:** [`continuity-law.md`](./continuity-law.md)

---

## Purpose

Define **what Beynd may remember**, for how long, who may read it, and what must remain ephemeral or forbidden.

Memory exists to support **continuity softening and user-authored context** — not profiling, prediction, or emotional surveillance.

---

## Memory classification key

| Class | Meaning |
|-------|---------|
| **Allowed (live)** | May persist and affect permitted tiers |
| **Shadow-only** | May persist internally or export to Tier 2; no direct UI |
| **Ephemeral** | Session or compose-scoped; must not persist to `S` |
| **User-visible** | User can see and edit the stored value |
| **Internal-only** | System use only; never surface in UI |
| **Forbidden** | Must not be built |

---

## Signal-by-signal evaluation

### monthContext (protect / worried / success)

| Attribute | Value |
|-----------|-------|
| **Storage** | `S.monthContext`, scoped by `ym` |
| **Allowed?** | Yes |
| **Shadow-only?** | No — live in Reality + Reflection |
| **Ephemeral?** | No — month-scoped reset |
| **User-visible?** | **Yes** — user-authored |
| **Internal-only?** | No |
| **Forbidden?** | No |
| **May affect behaviour?** | Indirect — shift cap, afford protected rows (existing contracts) |
| **Notes** | Canonical user continuity anchor |

---

### monthContextCarry

| Attribute | Value |
|-----------|-------|
| **Storage** | `S.monthContextCarry` |
| **Allowed?** | Yes |
| **Shadow-only?** | No |
| **Ephemeral?** | No |
| **User-visible?** | **Yes** — suggestion / pre-fill only |
| **Internal-only?** | No |
| **Forbidden?** | Auto-applying carry to active context without user action |

---

### Feeling (still / moved / slow / unsure)

| Attribute | Value |
|-----------|-------|
| **Storage** | `sessionStorage` `geode_reality_feeling` |
| **Allowed?** | Yes (current design) |
| **Shadow-only?** | No — live in Reality chips |
| **Ephemeral?** | **Yes — session only** |
| **User-visible?** | Yes |
| **Internal-only?** | No |
| **Forbidden?** | **Persisting to `S` without explicit user contract (80N-M default: forbidden)** |
| **May affect behaviour?** | Yes — posture, shift cap, behaviour events (existing) |
| **Notes** | Session ephemeral is intentional anti-profiling measure |

---

### behaviourEvents + continuity profile (`often*`)

| Attribute | Value |
|-----------|-------|
| **Storage** | `S.behaviourEvents` (month-scoped by `ym`) |
| **Allowed?** | Yes — event log |
| **Shadow-only?** | **`often*` flags: shadow / Ask only until Tier D contract** |
| **Ephemeral?** | Month-scoped counts |
| **User-visible?** | **No (default)** — Plan banner for reverts only is exception |
| **Internal-only?** | Profile aggregation: yes |
| **Forbidden?** | User-facing “often slow” labels; cross-month `often*` persistence |
| **May affect behaviour?** | Ask coach hint only (existing); not Plan math |

| Flag | Allowed use | Forbidden use |
|------|-------------|---------------|
| `oftenRevertsShift` | Plan banner hint (reversibility) | Shame framing |
| `oftenSlowFeeling` | Ask hint (internal) | UI label, Tier-C, Home |
| `oftenApprovesShift` | Ask hint | “You always shift” copy |
| `oftenMovedFeeling` | Ask hint | Predictive pacing |

---

### financial memory profile

| Attribute | Value |
|-----------|-------|
| **Storage** | Derived from `S` history (~90d), not a separate trait store |
| **Allowed?** | Yes — confidence-gated softening |
| **Shadow-only?** | Partial — effects live in Plan; profile details internal |
| **Ephemeral?** | No — rolling window |
| **User-visible?** | **Partial** — via reason codes / future footnote only |
| **Internal-only?** | `confidence`, `evidenceCount` — **must remain internal** |
| **Forbidden?** | Surfacing confidence grade; “financial reliability score” |
| **May affect behaviour?** | Yes — Tier 0 multipliers when gates pass |

---

### bufferPreference

| Attribute | Value |
|-----------|-------|
| **Storage** | Computed per plan pass from memory modifiers |
| **Allowed?** | Yes — live Plan lever |
| **Shadow-only?** | No |
| **Ephemeral?** | No — re-derived each plan |
| **User-visible?** | Indirect via buffer step sizing |
| **Internal-only?** | No |
| **Forbidden?** | User-facing toggle without Plan contract |

---

### preserveBreathingRoom

| Attribute | Value |
|-----------|-------|
| **Storage** | Memory modifiers output |
| **Allowed?** | **Shadow intent only** |
| **Shadow-only?** | **Yes** |
| **Ephemeral?** | Re-derived each snapshot |
| **User-visible?** | **No (until planPath explain stage)** |
| **Internal-only?** | Yes |
| **Forbidden?** | Plan math input; Home copy; emotional steering label |
| **Notes** | Twin of bufferPreference for explain vocabulary; not live lever |

---

### recoveryState (streak heuristic)

| Attribute | Value |
|-----------|-------|
| **Storage** | `localStorage` streak keys |
| **Allowed?** | **Legacy internal — do not expand** |
| **Shadow-only?** | Effective yes — drives PAO recovery phase only |
| **Ephemeral?** | Cross-session (latent risk) |
| **User-visible?** | **No** |
| **Internal-only?** | **Yes** |
| **Forbidden?** | Surfacing streak to user; expanding streak logic; streak-based shame |
| **Notes** | Highest latent surveillance risk in current architecture |

---

### resilience (noticed domain)

| Attribute | Value |
|-----------|-------|
| **Storage** | Per snapshot compose |
| **Allowed?** | Yes — Tier 2 export |
| **Shadow-only?** | Tier 2; Tier-C gated live slice |
| **Ephemeral?** | **Yes — per compose** |
| **User-visible?** | Only via gated Tier-C replace |
| **Internal-only?** | Export metadata |
| **Forbidden?** | Tier-C persistence; acknowledgement tracking |

---

### pressure (noticed domain)

| Attribute | Value |
|-----------|-------|
| **Storage** | Per snapshot |
| **Allowed?** | Internal classifier input only |
| **Shadow-only?** | **Permanent internal** |
| **Ephemeral?** | Per compose |
| **User-visible?** | **Forbidden permanently** |
| **Internal-only?** | **Yes — INTERNAL_ONLY gate** |
| **Forbidden?** | Any UI surface, Ask direct quote, Tier-C domain |

---

### pacing memory / pacingMode

| Attribute | Value |
|-----------|-------|
| **Storage** | PAO per pass; `noticed.pacing` export |
| **Allowed?** | Yes — classifier |
| **Shadow-only?** | Export yes; Plan note is Tier 1 paraphrase |
| **Ephemeral?** | Per pass |
| **User-visible?** | Plan pacing note; atmosphere paraphrase |
| **Internal-only?** | PAO dimensions |
| **Forbidden?** | Cross-month pacing profile; “your pace is usually gentle” |

---

### “Usual month” semantics

| Attribute | Value |
|-----------|-------|
| **Allowed?** | **Forbidden entirely** |
| **Rationale** | Predictive continuity → profiling → coercion |
| **Alternative** | Observational carry + current month context only |

---

### Repeated hesitation interpretation

| Attribute | Value |
|-----------|-------|
| **Allowed?** | **Forbidden as inference** |
| **Notes** | Revert counts may inform reversibility copy only — not hesitation diagnosis |
| **Forbidden** | “You seem hesitant”; delay scoring; nudge escalation |

---

### behavioural confidence

| Attribute | Value |
|-----------|-------|
| **Storage** | `financialMemoryProfile.confidence` |
| **Allowed?** | Internal gate only |
| **Shadow-only?** | **Yes** |
| **User-visible?** | **Forbidden** |
| **Forbidden?** | Any user-facing confidence indicator |

---

## Persistence tier summary

| Tier | What may persist | Where |
|------|------------------|-------|
| **User-authored** | monthContext, carry | `S` |
| **Financial truth** | payments, debts, goals, snapshots | `S` |
| **Event log** | behaviourEvents (month-scoped) | `S` |
| **Session** | feeling, dismiss flags, skip visit | sessionStorage |
| **Legacy internal** | streak | localStorage (do not expand) |
| **Never** | personality, usual-month, Tier-C history, pressure UI | — |

---

## Promotion rules (memory → interpretation → behaviour)

Any promotion requires documented stage:

| From | To | Requires |
|------|-----|----------|
| Internal profile | User-visible copy | Copy map + opt-in + Continuity Law review |
| Shadow flag | Plan math input | Tier 0 stage + explainability path |
| Session feeling | `S` persistence | Explicit user contract + anti-profiling review |
| Event counts | UI labels | Tier D contract — **default forbidden** |
| noticed.* | Live UI | Tier-C gate spec + collision law |

---

## Audit checklist

- [ ] No new `localStorage` keys for interpretation
- [ ] No `often*` in UI without Tier D stage
- [ ] No confidence surfaced to user
- [ ] Feeling remains session-scoped unless stage amends
- [ ] preserveBreathingRoom not wired to getMonthPlan
- [ ] pressure remains INTERNAL_ONLY
- [ ] No cross-month behavioural trait object in `S`
