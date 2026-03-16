# S01: Orphan Milestone Guard Utility and Entry Point Wiring — UAT

**Milestone:** M006
**Written:** 2026-03-16

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: The guard is a pure filesystem check with deterministic behavior — no UI rendering, no network calls, no runtime state beyond file existence. Contract tests fully cover all paths.

## Preconditions

- Repository cloned with test dependencies installed (`npm install`)
- No running servers or external services needed
- Tests use temp dirs — no side effects on real `.gsd/` state

## Smoke Test

Run `npx vitest run src/commands/__tests__/issues.test.ts -t "orphan milestone guard"` — should see 11 tests pass across both handler describe blocks.

## Test Cases

### 1. findOrphanMilestones returns empty for no milestones

1. Create a temp dir with `.gsd/milestones/` but no subdirectories
2. Call `findOrphanMilestones(tempDir)`
3. **Expected:** Returns `[]`

### 2. findOrphanMilestones identifies a single orphan

1. Create `.gsd/milestones/M001/M001-CONTEXT.md` (no SUMMARY.md, no ISSUE-MAP.json)
2. Call `findOrphanMilestones(tempDir)`
3. **Expected:** Returns `["M001"]`

### 3. Completed milestones excluded from orphan detection

1. Create `.gsd/milestones/M001/M001-CONTEXT.md` and `.gsd/milestones/M001/M001-SUMMARY.md`
2. Call `findOrphanMilestones(tempDir)`
3. **Expected:** Returns `[]` — M001 has SUMMARY.md so it's completed

### 4. Mapped milestones excluded from orphan detection

1. Create `.gsd/milestones/M001/M001-CONTEXT.md`
2. Create `.gsd/milestones/M001/ISSUE-MAP.json` with `[{"localId": "M001", "remoteId": "1", ...}]`
3. Call `findOrphanMilestones(tempDir)`
4. **Expected:** Returns `[]` — M001 has a matching ISSUE-MAP entry

### 5. Non-matching localId still counts as orphan

1. Create `.gsd/milestones/M001/M001-CONTEXT.md`
2. Create `.gsd/milestones/M001/ISSUE-MAP.json` with `[{"localId": "M002", ...}]`
3. Call `findOrphanMilestones(tempDir)`
4. **Expected:** Returns `["M001"]` — localId "M002" doesn't match "M001"

### 6. Mixed state returns only orphans

1. Create M001 with SUMMARY.md (completed), M002 with ISSUE-MAP (mapped), M003 with only CONTEXT.md (orphan)
2. Call `findOrphanMilestones(tempDir)`
3. **Expected:** Returns `["M003"]`

### 7. handleSmartEntry blocks on orphan

1. Set up temp dir with an orphan milestone (CONTEXT.md, no SUMMARY.md, no ISSUE-MAP.json)
2. Call `handleSmartEntry(ctx, pi)` with process.cwd() pointing to temp dir
3. **Expected:** `ctx.ui.notify()` called with warning containing "orphan" and the milestone ID. Function returns without calling any config loading or state detection.

### 8. handleAutoEntry blocks on orphan

1. Set up temp dir with an orphan milestone
2. Call `handleAutoEntry(ctx, pi)` with process.cwd() pointing to temp dir
3. **Expected:** `ctx.ui.notify()` called with warning containing "orphan" and the milestone ID. Function returns without calling `scanMilestones()` or dispatching `/gsd auto`.

### 9. handleSmartEntry proceeds when no orphans

1. Set up temp dir with no milestones (or all milestones mapped/completed)
2. Call `handleSmartEntry(ctx, pi)`
3. **Expected:** Function proceeds past the guard to config loading / state detection. `ctx.ui.notify()` is NOT called with an orphan warning.

### 10. handleAutoEntry proceeds when no orphans

1. Set up temp dir with no milestones (or all milestones mapped/completed)
2. Call `handleAutoEntry(ctx, pi)`
3. **Expected:** Function proceeds past the guard to `scanMilestones()` / resume logic.

## Edge Cases

### Empty ISSUE-MAP.json (valid JSON, no entries)

1. Create `.gsd/milestones/M001/M001-CONTEXT.md` and `.gsd/milestones/M001/ISSUE-MAP.json` with `[]`
2. Call `findOrphanMilestones(tempDir)`
3. **Expected:** Returns `["M001"]` — empty entries array means no matching localId

### Multiple orphans returned sorted

1. Create orphan milestones M003, M001, M005 (all with only CONTEXT.md)
2. Call `findOrphanMilestones(tempDir)`
3. **Expected:** Returns `["M001", "M003", "M005"]` — sorted by milestone ID

### Block message format

1. Create two orphan milestones M001 and M003
2. Trigger `handleSmartEntry()`
3. **Expected:** Notify message reads: `Blocked: 2 orphan milestones found: M001, M003. Use /issues sync to push them to the tracker, or remove/archive them before starting new work.`

## Failure Signals

- `findOrphanMilestones` returns orphans for completed milestones (SUMMARY.md present) — false positive
- `findOrphanMilestones` misses milestones that have CONTEXT.md but no SUMMARY.md and no ISSUE-MAP entry — false negative
- Either handler proceeds past the guard when orphans exist — guard is not blocking
- Either handler blocks when all milestones are mapped or completed — guard is over-blocking
- Existing tests fail because they create milestones without ISSUE-MAP.json — guard interfering with non-orphan test scenarios

## Requirements Proved By This UAT

- R027 — Orphan milestone guard at flow entry: all detection paths (orphan, completed, mapped, mixed) and both entry point handlers are covered

## Not Proven By This UAT

- Runtime behavior with a real `.gsd/` directory (tests use temp dirs with mocked contexts)
- UX quality of the block message (phrasing, clarity) — only format is verified
- Recovery path after blocking (user must manually `/issues sync` or remove milestones — those commands are tested elsewhere)

## Notes for Tester

- All test cases are implemented as vitest tests. Run `npx vitest run` to execute the full suite (350 tests).
- The guard tests mock `process.cwd()` via `vi.spyOn` — they don't modify the real working directory.
- If adding new tests that create milestones for `handleSmartEntry` or `handleAutoEntry`, always include an ISSUE-MAP.json with a matching localId entry, or the orphan guard will block the handler before reaching your test's actual logic.
