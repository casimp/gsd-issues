---
id: T01
parent: S01
milestone: M006
provides:
  - findOrphanMilestones(cwd) utility function
key_files:
  - src/lib/smart-entry.ts
  - src/lib/__tests__/smart-entry.test.ts
key_decisions:
  - ISSUE-MAP.json loaded per-milestone (not globally) — matches existing codebase pattern where map lives alongside roadmap inside the milestone dir
patterns_established:
  - Orphan detection: scanMilestones → per-milestone stat(SUMMARY.md) + loadIssueMap check — same ENOENT-catch pattern used throughout the codebase
observability_surfaces:
  - findOrphanMilestones returns string[] of orphan IDs — empty = clean, populated = orphans found
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Implement findOrphanMilestones utility

**Added `findOrphanMilestones(cwd)` to `smart-entry.ts` — composes scanMilestones, stat, and loadIssueMap to identify milestones that are neither completed nor tracked.**

## What Happened

Implemented `findOrphanMilestones(cwd)` in `src/lib/smart-entry.ts`. The function:
1. Calls `scanMilestones(cwd)` to get all milestone IDs with CONTEXT.md
2. For each milestone, checks `{MID}-SUMMARY.md` via `stat()` (ENOENT = not completed)
3. Loads `ISSUE-MAP.json` via `loadIssueMap()` and checks `entries.some(e => e.localId === mid)`
4. Collects milestones that fail both checks as orphans

Added import of `loadIssueMap` from `./issue-map.js`. Function is exported and follows the existing async/ENOENT patterns.

Wrote 12 test cases in a new `findOrphanMilestones` describe block covering: empty dir, empty milestones dir, single orphan, completed exclusion, mapped exclusion, non-matching localId, mixed state, multiple orphans sorted, all mapped, all completed, and both-completed-and-mapped.

## Verification

- `npx vitest run src/lib/__tests__/smart-entry.test.ts` — 32 tests passed (20 existing + 12 new)
- `npx vitest run` — 341 tests passed (full suite, no regressions)
- `npx tsc --noEmit` — zero type errors
- Function is exported and callable

### Slice-level verification status (T01 is intermediate):
- ✅ `npx vitest run src/lib/__tests__/smart-entry.test.ts` — passed
- ⬜ `npx vitest run src/commands/__tests__/issues.test.ts` — T02 work
- ✅ `npx vitest run` — passed (341 tests)
- ✅ `npx tsc --noEmit` — passed

## Diagnostics

Call `findOrphanMilestones(cwd)` to inspect orphan state. Returns `string[]` — empty means all milestones are completed or mapped. Non-ENOENT filesystem errors propagate with file paths. Corrupt ISSUE-MAP.json throws with path and entry index.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/smart-entry.ts` — added `findOrphanMilestones()` function and `loadIssueMap` import
- `src/lib/__tests__/smart-entry.test.ts` — added `findOrphanMilestones` import and 12 test cases in new describe block
- `.gsd/milestones/M006/slices/S01/S01-PLAN.md` — added Observability / Diagnostics section
- `.gsd/milestones/M006/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section
