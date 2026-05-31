# Stage 80M-A — Reflection Release Service Worker Bump

**Type:** Release preparation (cache version only)  
**Verdict:** Prepared (local) — **final audit required before commit**  
**Date:** May 2026  

---

## Objective

Prepare the **Reflection bundle** for release by bumping `CACHE_VERSION` once so clients receive fresh `index.html` and related static assets after Stages **80J**, **80K**, and **80L** (held locally).

---

## Reflection bundle scope (no logic changed in this stage)

| Stage | Role |
|-------|------|
| **80J** | Reality inline reflection entry (gate + link + visual hierarchy) |
| **80K** | Reflection Money sub-surface (`msub='reflection'`) |
| **80L** | Reflection → Ask Beynd integration (modal overlay, bounded context) |

This stage does **not** change Reflection, Ask Beynd, Reality, Plan, Home, or routing code.

---

## Code change

| File | Change |
|------|--------|
| `service-worker.js` | `CACHE_VERSION` **v1.0.72 → v1.0.73** only |

### Explicitly unchanged

- `install`, `activate`, `fetch`, and `message` handlers
- `PRECACHE_URLS`
- `index.html`, `coaching.json`, `manifest.json`
- `js/geode-pure/*`, `worker/`, `icons/`
- Reflection logic
- Ask Beynd logic
- UI (no presentation changes in this bump)

---

## Why bump

User-facing **Reflection surface** and **Ask integration** ship in `index.html` / `coaching.json` from prior 80J–80L builds. A single cache bump invalidates stale shells and precached assets without altering service worker behaviour.

---

## Validation (run before commit)

```text
node --check service-worker.js
node --check js/geode-pure/01-foundation.js
node --check js/geode-pure/02-plan-snapshots.js
node --check js/geode-pure/03-suggested-snapshots.js
node --check js/geode-pure/04-adaptive-snapshots.js
node --check js/geode-pure/05-presentation-snapshots.js
node -e "JSON.parse(require('fs').readFileSync('coaching.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))"
git diff --check -- index.html coaching.json docs service-worker.js
```

Confirm protected files unchanged except `service-worker.js` and allowed `docs/` paths.

---

## Commit policy

- **Do not commit** until **Stage 80M-B** final release audit **PASS** and explicit user approval.
- **Do not push** until commit is approved.
- Stage only `service-worker.js` and documentation for this release-prep step unless 80M-B expands scope.

---

## Next

**[80M-B](./80M-B-reflection-release-final-audit.md)** — final post-push / pre-commit release audit (when filed).
