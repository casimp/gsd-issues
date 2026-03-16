---
id: S01
parent: M006
milestone: M006
provides:
  - findOrphanMilestones(cwd) utility function
  - Orphan milestone guard in handleSmartEntry and handleAutoEntry
requires: []
affects: []
key_files:
  - src/lib/smart-entry.ts
  - src/lib/__tests__/smart-entry.test.ts
  - src/commands/issues.ts
  - src/commands/__tests__/issues.test.ts
key_decisions:
  - D055: findOrphanMilestones placed in smart-entry.ts alongside scanMilestones (same domain, same I/O patterns)
  - D056: Guard fires before all other logic in both entry points — before config loading, state detection, or resume dispatch
  - ISSUE-MAP.json loaded per-milestone (not globally) — matches existing codebase pattern
  - Guard returns early with ctx.ui.notify warning — no exceptions thrown, no side effects on block
  - Block message includes orphan count, IDs, and two resolution paths (/issues sync or remove/archive)
patterns_established:
  - Guard-at-entry pattern: await findOrphanMilestones(cwd), check length, notify + return if non-empty
  - Orphan detection: scanMilestones → per-milestone stat(SUMMARY.md) + loadIssueMap check — same ENOENT-catch pattern used throughout the codebase
  - Existing tests creating milestones must include ISSUE-MAP.json to pass the guard (or create milestones after enabling hooks)
observability_surfaces:
  - ctx.ui.notify() warning-level message with orphan IDs when guard blocks entry
  - findOrphanMilestones(cwd) returns string[] for direct inspection — empty = clean, populated = orphans found
drill_down_paths:
  - .gsd/milestones/M006/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M006/slices/S01/tasks/T02-SUMMARY.md
duration: 25m
verification_result: passed
completed_at: 2026-03-16
---

# S01: Orphan Milestone Guard Utility and Entry Point Wiring

**Both `/issues` and `/issues auto` now block with a warning listing orphan milestone IDs when unmapped in-progress milestones exist on disk — proven by 21 new tests across utility and command layers.**

## What Happened

T01 designed and implemented `findOrphanMilestones(cwd)` in `src/lib/smart-entry.ts`. The function composes `scanMilestones()`, `stat()`, and `loadIssueMap()` to identify milestones that have CONTEXT.md but lack both a SUMMARY.md (not completed) and an ISSUE-MAP.json entry with matching localId (not tracked). Returns a sorted `string[]` of orphan IDs. 10 test cases cover: empty dir, single orphan, completed exclusion, mapped exclusion, non-matching localId, mixed state, multiple orphans sorted, all mapped, all completed.

T02 wired the guard into both entry points in `src/commands/issues.ts`. In `handleSmartEntry()`, the guard is the first check after `const cwd`, before config loading or state detection. In `handleAutoEntry()`, it fires after clearing the prompted-flow flag and setting cwd, before `scanMilestones()` or resume dispatch. Both guards call `findOrphanMilestones(cwd)` and on non-empty result: emit a `ctx.ui.notify()` warning with the orphan count, IDs, and resolution suggestions (`/issues sync` or remove/archive), then return early. 11 test cases cover: orphan blocks both handlers, no-orphan passes through, completed milestone not blocked, mapped milestone not blocked.

T02 also updated 7 existing tests that created milestones without ISSUE-MAP.json — they now include ISSUE-MAP.json entries or create milestones after enabling hooks, so the orphan guard doesn't interfere.

Note: T01's code didn't land in the worktree despite the summary existing. T02 re-implemented the utility function alongside the guard wiring.

## Verification

- `npx vitest run src/lib/__tests__/smart-entry.test.ts` — 30 tests passed (20 existing + 10 new)
- `npx vitest run src/commands/__tests__/issues.test.ts` — 46 tests passed (35 existing + 11 new guard tests)
- `npx vitest run` — 350 tests passed (full suite, no regressions, up from 330+)
- `npx tsc --noEmit` — zero type errors

## Requirements Advanced

- R027 — Orphan milestone guard at flow entry: fully implemented and proven by contract tests. Both `/issues` and `/issues auto` block when orphans exist, pass when all milestones are completed or mapped.

## Requirements Validated

- R027 — Guard is proven by 21 new tests covering all detection paths (orphan, completed, mapped, mixed) and both entry point handlers. Contract verification is complete and sufficient — the guard is fully deterministic with no runtime/operational concerns.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T01's `findOrphanMilestones` code was missing from the worktree despite the T01 summary claiming it shipped. T02 re-implemented both the utility function and the guard wiring. No functional impact — the implementation matches T01's design.

## Known Limitations

- none — this is the only slice in M006 and all success criteria are met.

## Follow-ups

- none

## Files Created/Modified

- `src/lib/smart-entry.ts` — added `loadIssueMap` import and `findOrphanMilestones()` function
- `src/lib/__tests__/smart-entry.test.ts` — added `findOrphanMilestones` import and 10 test cases in new describe block
- `src/commands/issues.ts` — added `findOrphanMilestones` import and guard at top of both `handleSmartEntry()` and `handleAutoEntry()`
- `src/commands/__tests__/issues.test.ts` — added 11 orphan guard test cases across two describe blocks, updated 7 existing tests for guard compatibility

## Forward Intelligence

### What the next slice should know
- This is the only slice in M006. The milestone is functionally complete. If there's a next milestone, note that both entry points now have a guard that runs before any other logic — any new entry point behavior must come after the orphan check.

### What's fragile
- Existing tests that create milestones on disk without ISSUE-MAP.json will fail because the guard blocks them. Any new test creating milestones in the `.gsd/milestones/` dir for either handler must include an ISSUE-MAP.json with a matching localId or a SUMMARY.md.

### Authoritative diagnostics
- Call `findOrphanMilestones(cwd)` directly to inspect orphan state — returns `string[]`, empty = clean. The `ctx.ui.notify()` warning message includes the full orphan list when the guard fires.

### What assumptions changed
- No assumptions changed. The implementation followed the plan exactly (aside from the T01 code-loss deviation, which had no functional impact).
