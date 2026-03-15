---
estimated_steps: 5
estimated_files: 6
---

# T01: Rewrite sync and close for milestone-level operations

**Slice:** S02 — Milestone-level sync and PR creation
**Milestone:** M002

## Description

Shift the sync and close pipelines from per-slice to per-milestone. The sync function creates a single issue for the entire milestone (using ROADMAP.md title and CONTEXT.md vision/success criteria as the issue body), and close looks up entries by milestone ID instead of slice ID. This is the foundation — T02's PR pipeline and T03's command wiring depend on these functions.

## Steps

1. Add `readMilestoneContext(cwd, milestoneId)` to `src/lib/state.ts` — reads `.gsd/milestones/{MID}/{MID}-CONTEXT.md`, extracts content for building the issue description. Returns `{ title: string; body: string } | null` on missing file. Use the same ENOENT-to-null pattern as `readIntegrationBranch()`.
2. Rewrite `syncSlicesToIssues` → `syncMilestoneToIssue` in `src/lib/sync.ts`:
   - Replace `SyncOptions.slices: RoadmapSlice[]` with `milestoneId: string` and `cwd: string`
   - Load ISSUE-MAP, check if milestone already mapped (skip if so)
   - Read CONTEXT.md via `readMilestoneContext()` for description body; fall back to title-only if missing
   - Read ROADMAP.md for milestone title (first `# ` heading) and slice listing
   - Build description with vision, success criteria, and slice overview
   - Create single issue via `provider.createIssue()`
   - Persist map entry with `localId = milestoneId`
   - Keep: crash-safe save, epic assignment (best-effort), weight mapping, event emission, dry-run
   - Update `SyncResult`: `errors` uses `milestoneId` not `sliceId`
   - Export old `syncSlicesToIssues` name temporarily if needed for compilation, or remove and fix all consumers
3. Rename `closeSliceIssue` → `closeMilestoneIssue` in `src/lib/close.ts`:
   - Remove `sliceId` from `CloseOptions`, the `milestoneId` is now the localId for map lookup
   - Update `find()` to match `e.localId === milestoneId`
   - Update event payload: `{ milestone: milestoneId, issueId, url }` (drop `sliceId`)
4. Rewrite `src/lib/__tests__/sync.test.ts` for milestone model — test single-issue creation, skip-if-mapped, crash-safe persistence, dry-run preview, epic assignment, description building (with and without CONTEXT.md), weight mapping
5. Update `src/lib/__tests__/close.test.ts` — change all `sliceId` references to `milestoneId`, verify map lookup uses milestone ID, verify event payload

## Must-Haves

- [ ] `readMilestoneContext()` returns parsed content or null on missing file
- [ ] `syncMilestoneToIssue()` creates exactly one issue per call with milestoneId as localId
- [ ] `syncMilestoneToIssue()` skips if milestone already mapped in ISSUE-MAP
- [ ] `syncMilestoneToIssue()` crash-safe: saves map after issue creation
- [ ] `syncMilestoneToIssue()` handles missing CONTEXT.md gracefully (title-only description)
- [ ] `closeMilestoneIssue()` looks up by milestoneId, not sliceId
- [ ] Event payloads use milestoneId throughout
- [ ] All sync and close lib tests pass

## Verification

- `npx vitest run src/lib/__tests__/sync.test.ts src/lib/__tests__/close.test.ts src/lib/__tests__/state.test.ts` — all pass
- `npx tsc --noEmit` — clean

## Observability Impact

- Signals added/changed: `gsd-issues:sync-complete` event payload changes from `{ created: N, skipped: N, errors: N }` (where N was per-slice counts) to same shape but milestone-scoped (created is 0 or 1). Error entries use `milestoneId` key instead of `sliceId`.
- How a future agent inspects this: check ISSUE-MAP.json entries — `localId` will be "M001" format instead of "S01"
- Failure state exposed: sync errors include `milestoneId` in the error array for precise identification

## Inputs

- `src/lib/sync.ts` — current slice-level sync (rewrite target)
- `src/lib/close.ts` — current slice-level close (update target)
- `src/lib/state.ts` — `readIntegrationBranch()` pattern to follow for `readMilestoneContext()`
- `src/providers/types.ts` — `CreateIssueOpts`, `IssueMapEntry`, `IssueProvider` (unchanged)
- `src/lib/issue-map.ts` — `loadIssueMap`/`saveIssueMap` (unchanged)
- S01 summary: `IssueMapEntry.localId` holds milestone ID by convention (D029)

## Expected Output

- `src/lib/state.ts` — `readMilestoneContext()` added
- `src/lib/sync.ts` — `syncMilestoneToIssue()` replacing `syncSlicesToIssues()`
- `src/lib/close.ts` — `closeMilestoneIssue()` replacing `closeSliceIssue()`
- `src/lib/__tests__/sync.test.ts` — rewritten for milestone model
- `src/lib/__tests__/close.test.ts` — updated for milestone parameter
- `src/lib/__tests__/state.test.ts` — new `readMilestoneContext` tests added
