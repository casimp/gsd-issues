---
id: T01
parent: S02
milestone: M002
provides:
  - syncMilestoneToIssue() — creates one issue per milestone with CONTEXT.md + ROADMAP.md description
  - closeMilestoneIssue() — closes issue by milestoneId lookup instead of sliceId
  - readMilestoneContext() — reads CONTEXT.md with ENOENT-to-null pattern
  - Updated command handlers and index.ts wiring for milestone-level operations
key_files:
  - src/lib/sync.ts
  - src/lib/close.ts
  - src/lib/state.ts
  - src/lib/__tests__/sync.test.ts
  - src/lib/__tests__/close.test.ts
  - src/lib/__tests__/state.test.ts
  - src/commands/sync.ts
  - src/commands/close.ts
  - src/commands/__tests__/sync.test.ts
  - src/commands/__tests__/close.test.ts
  - src/index.ts
key_decisions:
  - Issue title sourced from ROADMAP.md first heading (falls back to CONTEXT.md heading, then milestoneId)
  - Issue description built from CONTEXT.md body + ROADMAP.md slice listing + gsd metadata tag
  - Weight computed from highest-risk slice in the roadmap (not individual slice risk)
  - Epic warning event payload uses milestoneId instead of sliceId
  - Close command accepts milestone ID positionally or via --milestone flag, falls back to config milestone
patterns_established:
  - readMilestoneContext() follows same ENOENT-to-null pattern as readIntegrationBranch()
  - sync tests use setupMilestoneFiles() helper to create CONTEXT.md + ROADMAP.md in temp dirs
observability_surfaces:
  - gsd-issues:sync-complete event payload: { milestone, created, skipped, errors } — created is 0 or 1, errors use milestoneId key
  - gsd-issues:close-complete event payload: { milestone, issueId, url } — no sliceId field
  - gsd-issues:epic-warning event payload: { milestoneId, issueId, warning }
  - ISSUE-MAP.json entries: localId holds milestone ID (e.g. "M001")
duration: 25m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Rewrite sync and close for milestone-level operations

**Shifted sync and close pipelines from per-slice to per-milestone: one issue per milestone, milestone ID as localId everywhere, description built from CONTEXT.md + ROADMAP.md.**

## What Happened

Added `readMilestoneContext()` to `state.ts` following the same ENOENT-to-null pattern as `readIntegrationBranch()`. It reads `{MID}-CONTEXT.md`, extracts the title (stripping " — Context" suffix) and body (from Project Description section onward).

Rewrote `syncSlicesToIssues` → `syncMilestoneToIssue` in `sync.ts`. The function now takes `milestoneId` and `cwd` instead of `slices[]`, reads CONTEXT.md and ROADMAP.md to build a rich description, creates exactly one issue per call, and uses milestoneId as the localId in ISSUE-MAP. Weight is computed from the highest-risk slice in the roadmap. All existing behaviors preserved: crash-safe persistence, epic assignment (best-effort), dry-run preview, event emission.

Renamed `closeSliceIssue` → `closeMilestoneIssue` in `close.ts`. Removed `sliceId` from `CloseOptions` — the function now finds the map entry by `milestoneId`. Event payload simplified to `{ milestone, issueId, url }`.

Updated all consumers: `commands/sync.ts` (previews milestone instead of unmapped slices), `commands/close.ts` (parses milestone ID instead of slice ID), `index.ts` (both tools use new functions, tool_result hook uses milestoneId for close). Also updated all command-level tests to match the new milestone model.

Note: T03 was scoped to handle the command/tool/hook wiring, but since T01 already touches all the consumer files to get compilation clean, the command-level updates were done here. T03 can focus on PR tool registration, hook removal, and `pr` subcommand wiring.

## Verification

- `npx vitest run src/lib/__tests__/sync.test.ts src/lib/__tests__/close.test.ts src/lib/__tests__/state.test.ts` — 61 tests pass
- `npx vitest run` — all 215 tests pass (13 files, 0 failures)
- `npx tsc --noEmit` — clean, no type errors

Slice-level verification status (partial, T01 is not the final task):
- ✅ `npx vitest run` — 215 tests pass (target 212+)
- ✅ `npx tsc --noEmit` — clean
- ✅ New sync tests: milestone-level sync creates single issue, skips mapped milestones, crash-safe persistence, dry-run, epic assignment, description from CONTEXT.md + ROADMAP.md
- ⬜ New PR tests: not yet (T02)
- ✅ Updated close tests: milestone ID parameter, event payload uses milestoneId
- ✅ Command tests: `/issues sync` milestone preview, `/issues close M001`
- ⬜ Command tests for `/issues pr`: not yet (T02/T03)
- ⬜ Index tests: hook removal not yet (T03), new tool registrations not yet (T03)

## Diagnostics

- Inspect `ISSUE-MAP.json` — entries now have `localId: "M001"` format instead of `"S01"`
- `gsd-issues:sync-complete` event: `{ milestone: "M001", created: 0|1, skipped: 0|1, errors: 0|1 }`
- `gsd-issues:close-complete` event: `{ milestone: "M001", issueId, url }` — no `sliceId` field
- Sync errors: `result.errors[].milestoneId` identifies which milestone failed

## Deviations

- Updated command handlers (`commands/sync.ts`, `commands/close.ts`) and `index.ts` wiring in T01 instead of deferring to T03. This was necessary because the consumer files import the renamed functions and wouldn't compile without updating. T03 can focus on PR tool registration, hook removal, and `pr` subcommand routing.

## Known Issues

None.

## Files Created/Modified

- `src/lib/state.ts` — added `readMilestoneContext()` and `MilestoneContext` type
- `src/lib/sync.ts` — rewrote from slice-level to milestone-level sync (`syncMilestoneToIssue`)
- `src/lib/close.ts` — renamed to `closeMilestoneIssue`, removed sliceId from options/events
- `src/commands/sync.ts` — updated for milestone-level preview and sync
- `src/commands/close.ts` — updated to parse milestone ID instead of slice ID
- `src/index.ts` — updated tool definitions and hook to use new function names and milestone model
- `src/lib/__tests__/sync.test.ts` — rewritten for milestone model (20 tests)
- `src/lib/__tests__/close.test.ts` — updated for milestone parameter (8 tests)
- `src/lib/__tests__/state.test.ts` — added readMilestoneContext tests (6 new tests, 33 total)
- `src/commands/__tests__/sync.test.ts` — updated for milestone-level sync command (10 tests)
- `src/commands/__tests__/close.test.ts` — updated for milestone ID close command (14 tests)
