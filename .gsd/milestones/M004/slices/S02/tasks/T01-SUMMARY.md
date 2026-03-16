---
id: T01
parent: S02
milestone: M004
provides:
  - auto_pr config field with validation
  - Hook state management (synced/PR'd sets, hooks-enabled flag)
  - agent_end sync hook (ROADMAP.md + unmapped → sync)
  - agent_end PR hook (SUMMARY.md + mapped + auto_pr → PR)
key_files:
  - src/lib/config.ts
  - src/commands/issues.ts
  - src/index.ts
  - src/lib/__tests__/config.test.ts
  - src/commands/__tests__/issues.test.ts
key_decisions:
  - Hooks run inside the existing single agent_end handler rather than registering a second one — keeps event ordering deterministic
  - Hook state (sets + flag) lives in commands/issues.ts following the existing module-scoped state pattern from S01
  - Dynamic imports inside the agent_end handler for sync/PR/provider-factory to avoid circular deps and keep lazy loading
patterns_established:
  - markSynced/markPrd + isSynced/isPrd for set-based idempotency in hooks
  - clearHookState() for test cleanup alongside clearPreScopeMilestones/clearAutoRequested
observability_surfaces:
  - gsd-issues:auto-sync event with { milestoneId } on hook-triggered sync
  - gsd-issues:auto-pr event with { milestoneId } on hook-triggered PR
  - isHooksEnabled(), isSynced(id), isPrd(id) for module-level state inspection
  - console.error with milestone ID context on hook failures
duration: 30m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Add agent_end hooks for auto-sync and auto-PR

**Extended agent_end with two filesystem-watching hooks: auto-sync on ROADMAP.md detection and auto-PR on SUMMARY.md completion, both idempotent and non-blocking. Added `auto_pr` config field.**

## What Happened

1. Added `auto_pr?: boolean` to Config interface and a boolean type check in `validateConfig()`. Four tests cover true/false/absent/invalid.

2. Added hook state management in `commands/issues.ts`: `_syncedMilestones` and `_prdMilestones` sets for dedup, `_hooksEnabled` flag set when `/issues auto` triggers (both resume and scope paths). Exported getters/clearers: `isSynced`, `isPrd`, `isHooksEnabled`, `clearHookState`, `markSynced`, `markPrd`.

3. Extended the agent_end handler in `index.ts` — restructured from early-return to block-scoped scope detection, then added two hook blocks gated on `isHooksEnabled()`:
   - **Sync hook:** scans milestones for ROADMAP.md + not in ISSUE-MAP.json + not in synced set → calls `syncMilestoneToIssue()`, marks synced, emits `gsd-issues:auto-sync`.
   - **PR hook:** scans for SUMMARY.md + in ISSUE-MAP.json + not in PR'd set + `auto_pr !== false` → calls `createMilestonePR()`, marks PR'd, emits `gsd-issues:auto-pr`.
   
   Both wrapped in try/catch — errors logged to console.error with milestone context, never thrown.

4. Wrote 10 hook behavior tests covering all cases: sync fires, sync skips synced, sync skips mapped, PR fires, PR skips PR'd, PR respects auto_pr:false, hooks no-op when disabled, hooks handle missing config, sync error caught, PR error caught.

## Verification

- `npx vitest run` — 322 tests pass (308 existing + 4 config + 10 hook)
- `npx tsc --noEmit` — clean compilation
- `npx vitest run src/commands/__tests__/issues.test.ts --reporter=verbose` — all 27 tests pass including 10 new agent_end hook tests
- Slice-level checks (partial — T01 is intermediate):
  - `npx vitest run` ✅ (322 pass)
  - `npx tsc --noEmit` ✅
  - `npx vitest run -- --grep "agent_end hooks"` ✅
  - Hook error/failure-path tests ✅
  - `grep` for stale README refs — not applicable to T01
  - `npx vitest run -- --grep "issues scope"` — T02 scope (not yet implemented)

## Diagnostics

- **Runtime signals:** `gsd-issues:auto-sync` and `gsd-issues:auto-pr` events emitted with `{ milestoneId }` payload
- **State inspection:** `isHooksEnabled()`, `isSynced(id)`, `isPrd(id)` — module-level getters
- **Failure state:** Hook errors logged to `console.error` with `[gsd-issues] auto-sync hook failed for {mid}:` prefix — grep-friendly. Errors never propagate to crash the agent_end handler.

## Deviations

- Added `markSynced` and `markPrd` as exported functions (not in original plan) — needed for tests to set up pre-conditions without going through the full hook flow. These also serve as the internal API the hooks use.

## Known Issues

None.

## Files Created/Modified

- `src/lib/config.ts` — Added `auto_pr?: boolean` to Config interface and boolean validation in `validateConfig()`
- `src/lib/__tests__/config.test.ts` — Added 4 tests for auto_pr validation (true, false, absent, invalid)
- `src/commands/issues.ts` — Added hook state management: sets, flag, getters/clearers/markers, _hooksEnabled set in handleAutoEntry
- `src/index.ts` — Extended agent_end handler with sync and PR hook blocks
- `src/commands/__tests__/issues.test.ts` — Added 10 hook behavior tests, added IssueMapEntry import, added clearHookState to all afterEach blocks
- `.gsd/milestones/M004/slices/S02/S02-PLAN.md` — Added failure-path verification step (pre-flight fix)
