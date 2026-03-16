---
id: M006
provides:
  - findOrphanMilestones(cwd) utility function in src/lib/smart-entry.ts
  - Orphan milestone guard at top of handleSmartEntry() and handleAutoEntry() in src/commands/issues.ts
key_decisions:
  - D055: findOrphanMilestones placed in smart-entry.ts alongside scanMilestones (same domain, same I/O patterns)
  - D056: Guard fires before all other logic in both entry points — before config loading, state detection, or resume dispatch
patterns_established:
  - Guard-at-entry pattern: await findOrphanMilestones(cwd), check length, notify + return if non-empty
  - Orphan detection: scanMilestones → per-milestone stat(SUMMARY.md) + loadIssueMap check
  - Tests creating milestones must include ISSUE-MAP.json to pass the guard (or create milestones after enabling hooks)
observability_surfaces:
  - ctx.ui.notify() warning-level message with orphan IDs when guard blocks entry
  - findOrphanMilestones(cwd) returns string[] for direct inspection — empty = clean, populated = orphans found
requirement_outcomes:
  - id: R027
    from_status: active
    to_status: validated
    proof: 21 new tests across utility (10) and command (11) layers cover all detection paths — orphan, completed, mapped, mixed state — and both entry point handlers. 350 total tests pass, zero type errors.
duration: 25m
verification_result: passed
completed_at: 2026-03-16
---

# M006: Orphan Milestone Guard

**Both `/issues` and `/issues auto` block with a warning listing orphan milestone IDs when unmapped in-progress milestones exist on disk — proven by 21 new tests and 350 total passing.**

## What Happened

Single slice (S01) delivered the full feature in two tasks. T01 designed `findOrphanMilestones(cwd)` in `src/lib/smart-entry.ts` — the function composes `scanMilestones()`, `stat()` for SUMMARY.md, and `loadIssueMap()` to identify milestones that have CONTEXT.md but lack both a completion marker and an ISSUE-MAP.json entry with matching localId. Returns a sorted `string[]` of orphan IDs. 10 test cases cover: empty dir, single orphan, completed exclusion, mapped exclusion, non-matching localId, mixed state, multiple orphans sorted, all mapped, all completed.

T02 wired the guard into both entry points in `src/commands/issues.ts`. In `handleSmartEntry()`, the guard is the first check after `const cwd`, before config loading or state detection. In `handleAutoEntry()`, it fires after clearing the prompted-flow flag and setting cwd, before `scanMilestones()` or resume dispatch. Both guards call `findOrphanMilestones(cwd)` and on non-empty result: emit a `ctx.ui.notify()` warning with the orphan count, IDs, and resolution suggestions (`/issues sync` or remove/archive), then return early. 11 test cases cover both handlers blocking on orphans and passing through when clean.

T02 also updated 7 existing tests that created milestones without ISSUE-MAP.json so the orphan guard doesn't interfere.

Note: T01's code didn't land in the worktree despite its summary existing. T02 re-implemented the utility alongside the guard wiring — no functional impact.

## Cross-Slice Verification

Single slice — no cross-slice integration needed. Each success criterion verified:

| Success Criterion | Evidence |
|---|---|
| `/issues` with orphan shows block message | 11 command-layer tests: orphan blocks `handleSmartEntry`, returns early with warning listing IDs |
| `/issues auto` with orphan shows block message | 11 command-layer tests: orphan blocks `handleAutoEntry`, returns early with warning listing IDs |
| Completed milestones not flagged | Utility test: milestone with SUMMARY.md excluded from orphan list; command test: completed milestone passes guard |
| Mapped milestones pass guard | Utility test: milestone with ISSUE-MAP.json entry containing matching localId excluded; command test: mapped milestone passes guard |
| All existing tests pass | 350 tests pass across 18 test files (up from 330+), zero failures |
| Zero type errors | `npx tsc --noEmit` clean |

## Requirement Changes

- R027: active → validated — `findOrphanMilestones(cwd)` identifies unmapped in-progress milestones (10 utility tests). Guard at top of both `handleSmartEntry()` and `handleAutoEntry()` blocks with warning and returns early (11 command tests). Completed milestones (SUMMARY.md) and mapped milestones (ISSUE-MAP.json with matching localId) are excluded. 350 tests total, zero type errors.

## Forward Intelligence

### What the next milestone should know
- Both `/issues` and `/issues auto` entry points now have an orphan guard as their first logic. Any new entry point behavior must come after the orphan check. The guard pattern is simple: call `findOrphanMilestones(cwd)`, check length, notify + return if non-empty.

### What's fragile
- Tests that create milestones in `.gsd/milestones/` without ISSUE-MAP.json will fail because the guard blocks them. Any new test creating milestones for either handler must include an ISSUE-MAP.json with a matching localId or a SUMMARY.md.

### Authoritative diagnostics
- Call `findOrphanMilestones(cwd)` directly to inspect orphan state — returns `string[]`, empty = clean. The `ctx.ui.notify()` warning includes orphan count, IDs, and two resolution paths.

### What assumptions changed
- No assumptions changed. The implementation followed the plan exactly.

## Files Created/Modified

- `src/lib/smart-entry.ts` — added `loadIssueMap` import and `findOrphanMilestones()` function
- `src/lib/__tests__/smart-entry.test.ts` — added 10 test cases in new `findOrphanMilestones` describe block
- `src/commands/issues.ts` — added `findOrphanMilestones` import and guard at top of both `handleSmartEntry()` and `handleAutoEntry()`
- `src/commands/__tests__/issues.test.ts` — added 11 orphan guard test cases, updated 7 existing tests for guard compatibility
