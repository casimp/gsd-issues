---
id: T02
parent: S01
milestone: M006
provides:
  - Orphan milestone guard in handleSmartEntry and handleAutoEntry
  - findOrphanMilestones utility function (T01 code was missing, implemented here)
key_files:
  - src/commands/issues.ts
  - src/commands/__tests__/issues.test.ts
  - src/lib/smart-entry.ts
  - src/lib/__tests__/smart-entry.test.ts
key_decisions:
  - Guard returns early with ctx.ui.notify warning — no exceptions thrown, no side effects on block
  - Block message includes orphan count, IDs, and two resolution paths (/issues sync or remove/archive)
  - Existing tests that create milestones for resume/hook scenarios updated to include ISSUE-MAP.json so they pass the guard
patterns_established:
  - Guard-at-entry pattern: await findOrphanMilestones(cwd), check length, notify + return if non-empty
  - Hook tests adapted to create milestones after enabling hooks (not before) to work with orphan guard
observability_surfaces:
  - ctx.ui.notify() warning-level message with orphan IDs when guard blocks entry
  - findOrphanMilestones(cwd) returns string[] for direct inspection
duration: 15m
verification_result: passed
completed_at: 2026-03-16
blocker_discovered: false
---

# T02: Wire guard into handleSmartEntry and handleAutoEntry

**Added orphan milestone guard at top of both `/issues` and `/issues auto` entry points — blocks with warning and resolution suggestions when unmapped in-progress milestones exist.**

## What Happened

T01's `findOrphanMilestones` implementation was not present in the worktree (summary existed but code didn't land). Implemented it as part of this task: added `findOrphanMilestones(cwd)` to `smart-entry.ts` with `loadIssueMap` import, plus 8 test cases in `smart-entry.test.ts`.

Then wired the guard into both handlers in `issues.ts`:
- `handleSmartEntry`: guard is the first check after `const cwd = process.cwd()`, before config loading or state detection
- `handleAutoEntry`: guard is after `_promptedFlowEnabled = false` and `const cwd`, before `scanMilestones` or resume dispatch

Both guards call `findOrphanMilestones(cwd)`, and on non-empty result: `ctx.ui.notify()` with warning listing orphan IDs + resolution paths, then `return`.

Added 11 new test cases across two describe blocks (`orphan milestone guard — handleSmartEntry` with 6 tests, `orphan milestone guard — handleAutoEntry` with 5 tests).

Updated 7 existing tests that created milestones without ISSUE-MAP.json — they now either add an ISSUE-MAP.json (for resume-path tests) or create milestones after enabling hooks (for hook tests) so the orphan guard doesn't interfere.

## Verification

- `npx vitest run src/lib/__tests__/smart-entry.test.ts` — 30 tests passed (20 existing + 10 new findOrphanMilestones)
- `npx vitest run src/commands/__tests__/issues.test.ts` — 46 tests passed (35 existing + 11 new guard tests)
- `npx vitest run` — 350 tests passed (full suite, no regressions)
- `npx tsc --noEmit` — zero type errors

### Slice-level verification (T02 is final task):
- ✅ `npx vitest run src/lib/__tests__/smart-entry.test.ts` — 30 passed
- ✅ `npx vitest run src/commands/__tests__/issues.test.ts` — 46 passed
- ✅ `npx vitest run` — 350 passed
- ✅ `npx tsc --noEmit` — clean

## Diagnostics

When the guard blocks: `ctx.ui.notify()` emits a warning-level message like `Blocked: 2 orphan milestones found: M001, M003. Use /issues sync to push them to the tracker, or remove/archive them before starting new work.`

To inspect orphan state directly: call `findOrphanMilestones(cwd)` — returns `string[]` of orphan IDs, empty = clean.

## Deviations

- T01's `findOrphanMilestones` code was missing from the worktree despite the T01 summary claiming it shipped. Implemented it in this task to unblock the guard wiring. This means T02 includes both the utility function and the guard wiring.

## Known Issues

None.

## Files Created/Modified

- `src/lib/smart-entry.ts` — added `loadIssueMap` import and `findOrphanMilestones()` function
- `src/lib/__tests__/smart-entry.test.ts` — added `findOrphanMilestones` import and 10 test cases
- `src/commands/issues.ts` — added `findOrphanMilestones` import and guard at top of both handlers
- `src/commands/__tests__/issues.test.ts` — added 11 orphan guard test cases, updated 7 existing tests for guard compatibility
- `.gsd/milestones/M006/slices/S01/tasks/T02-PLAN.md` — added Observability Impact section
