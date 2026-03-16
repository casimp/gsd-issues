---
id: S02
parent: M004
milestone: M004
provides:
  - agent_end auto-sync hook (ROADMAP.md detection → syncMilestoneToIssue)
  - agent_end auto-PR hook (SUMMARY.md detection → createMilestonePR)
  - Hook idempotency via module-level sets (synced/PR'd milestones)
  - auto_pr config field (boolean, default true)
  - /issues scope subcommand routing to handleSmartEntry()
  - README rewritten for post-M004 architecture
requires:
  - slice: S01
    provides: scanMilestones, detectNewMilestones, module-scoped auto flags, scope completion detection, handleSmartEntry
affects: []
key_files:
  - src/index.ts
  - src/lib/config.ts
  - src/commands/issues.ts
  - src/commands/__tests__/issues.test.ts
  - src/lib/__tests__/config.test.ts
  - README.md
key_decisions:
  - Hooks run inside the existing single agent_end handler (deterministic ordering with scope detection)
  - Hook state (sets + flag) in commands/issues.ts following S01's module-scoped state pattern
  - Dynamic imports inside agent_end for sync/PR/provider-factory to avoid circular deps
  - auto_pr defaults to true — PR creation is automatic unless explicitly opted out (D050)
patterns_established:
  - markSynced/markPrd + isSynced/isPrd for set-based idempotency in hooks
  - clearHookState() for test cleanup alongside clearPreScopeMilestones/clearAutoRequested
observability_surfaces:
  - "gsd-issues:auto-sync event with { milestoneId } on hook-triggered sync"
  - "gsd-issues:auto-pr event with { milestoneId } on hook-triggered PR"
  - "isHooksEnabled(), isSynced(id), isPrd(id) for module-level state inspection"
  - "console.error with milestone ID context on hook failures"
drill_down_paths:
  - .gsd/milestones/M004/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S02/tasks/T02-SUMMARY.md
duration: ~45m
verification_result: passed
completed_at: 2026-03-14
---

# S02: Multi-milestone sequencing, /issues scope, and README

**Extended agent_end with auto-sync and auto-PR hooks that react to GSD's filesystem artifacts, added `/issues scope` subcommand, and rewrote README for the current architecture.**

## What Happened

**T01 — agent_end hooks for auto-sync and auto-PR.** Added `auto_pr?: boolean` to Config with validation. Built hook state management in `commands/issues.ts`: `_syncedMilestones` and `_prdMilestones` sets for dedup, `_hooksEnabled` flag set when `/issues auto` triggers. Extended the agent_end handler with two hook blocks gated on `isHooksEnabled()`:

- **Sync hook:** scans milestones for ROADMAP.md + not in ISSUE-MAP.json + not in synced set → calls `syncMilestoneToIssue()`, marks synced, emits `gsd-issues:auto-sync`.
- **PR hook:** scans for SUMMARY.md + in ISSUE-MAP.json + not in PR'd set + `auto_pr !== false` → calls `createMilestonePR()`, marks PR'd, emits `gsd-issues:auto-pr`.

Both wrapped in try/catch — errors logged, never thrown. 10 hook behavior tests + 4 config tests added.

**T02 — /issues scope subcommand and README rewrite.** Added `"scope"` to SUBCOMMANDS array with routing to `handleSmartEntry()`. Rewrote README from scratch: three entry points (start fresh, start from existing issues, resume), hooks-based auto flow (no state machine), updated commands/events/tools/config tables, zero stale M003 references. 2 scope tests added.

## Verification

- `npx vitest run` — 324 tests pass (308 existing + 14 config + 10 hook + 2 scope, net 16 new)
- `npx tsc --noEmit` — clean compilation
- `npx vitest run -t "agent_end hooks"` — 10 hook tests pass
- `npx vitest run -t "issues scope"` — 2 scope tests pass
- `npx vitest run -t "gracefully"` — 3 error/failure-path tests pass
- `grep -c "issues-auto.json|issues-auto.lock|auto.lock|gsd_issues_auto|AutoPhase|auto-phase" README.md` — returns 0
- `grep -in "state machine|mutual exclusion" README.md` — no matches

## Requirements Advanced

- R024 (Multi-milestone sequencing) — agent_end hooks auto-sync on ROADMAP.md and auto-PR on SUMMARY.md, enabling per-milestone lifecycle during multi-milestone auto runs
- R023 (/issues scope command) — standalone `/issues scope` subcommand routing to handleSmartEntry()
- R021 (Auto-flow orchestration) — extended with hooks for automatic sync and PR during auto-mode

## Requirements Validated

- R024 — Contract tests prove sync fires on ROADMAP.md detection, PR fires on SUMMARY.md detection, both are idempotent and no-op when hooks disabled. Combined with S01's scope→auto chain, the full multi-milestone loop is proven.
- R023 — `/issues scope` routes to handleSmartEntry(), appears in completions. Contract tested.
- R021 — Full auto-flow now proven: smart entry → scope → `/gsd auto` → hooks auto-sync/PR. No manual intervention needed from scope through PR.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Added `markSynced` and `markPrd` as exported functions (not in original plan) — needed for tests to set up pre-conditions without going through the full hook flow.
- Vitest `-t` flag used instead of plan's `--grep` flag (vitest v3 doesn't support `--grep`). No impact on coverage.

## Known Limitations

- Hook-triggered sync doesn't show the interactive preview/confirm that `/issues sync` does — it's fully automatic in auto-mode, which is by design but means the user has no chance to review before issue creation during auto-flow.
- `auto_pr` only controls automatic PR creation in hooks — manual `/issues pr` is unaffected regardless of the setting.

## Follow-ups

- none — this is the final slice of M004

## Files Created/Modified

- `src/lib/config.ts` — Added `auto_pr?: boolean` to Config interface and validation
- `src/lib/__tests__/config.test.ts` — 4 tests for auto_pr validation
- `src/commands/issues.ts` — Hook state management (sets, flag, getters/clearers/markers), _hooksEnabled set in handleAutoEntry
- `src/index.ts` — Extended agent_end with sync/PR hooks, added `scope` subcommand routing
- `src/commands/__tests__/issues.test.ts` — 10 hook tests + 2 scope tests, clearHookState in afterEach
- `README.md` — Complete rewrite for current architecture

## Forward Intelligence

### What the next slice should know
- This is M004's final slice. The extension is feature-complete for the defined requirements.

### What's fragile
- Hook state is module-scoped (sets + flag) — if the extension is ever loaded multiple times or hot-reloaded, state won't reset. Fine for normal pi extension lifecycle.
- Dynamic imports in agent_end (sync, PR, provider-factory) mean import errors surface at runtime, not startup. Tests cover the happy path but unusual module resolution issues would only appear in production.

### Authoritative diagnostics
- `isHooksEnabled()`, `isSynced(id)`, `isPrd(id)` — module-level getters for hook state inspection
- `gsd-issues:auto-sync` and `gsd-issues:auto-pr` events — grep pi event logs for these
- `console.error` with `[gsd-issues] auto-sync hook failed for` / `auto-pr hook failed for` prefixes

### What assumptions changed
- No assumptions changed — S02 executed as planned
