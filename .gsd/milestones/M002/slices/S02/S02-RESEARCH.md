# S02 (M002) — Research

**Date:** 2026-03-14

## Summary

S02 rebuilds the sync/close/PR pipeline around milestones instead of slices, and wires up a new `/issues pr` command. The existing `syncSlicesToIssues` iterates `RoadmapSlice[]` and creates one issue per slice — this gets replaced with a `syncMilestoneToIssue` that creates a single issue per milestone using the milestone title, vision, and success criteria as the issue body. The tool_result auto-close hook (watches for S##-SUMMARY.md writes to close slice issues) gets removed entirely — close is now driven by `Closes #N` in the PR body, handled by the platform on merge.

The new work is: a `lib/pr.ts` module that pushes the milestone branch and calls `provider.createPR()`, a `commands/pr.ts` handler for `/issues pr`, a `gsd_issues_pr` tool for LLM callers, and rewired sync that operates at the milestone level. The close module stays as a manual fallback (`/issues close M001` instead of `/issues close S01`) but loses its tool_result hook trigger.

Provider-layer work (createPR, readIntegrationBranch) is complete from S01. What's left is orchestration and command wiring.

## Recommendation

Build in three phases within S02:

1. **Milestone sync** — new `syncMilestoneToIssue()` in `lib/sync.ts` replacing `syncSlicesToIssues()`. Reads milestone ROADMAP.md for title and CONTEXT.md for vision/success criteria. Uses milestone ID as the ISSUE-MAP `localId`. Keep the existing function signature shape (SyncOptions/SyncResult) but change the unit from slices to milestone.

2. **PR creation pipeline** — new `lib/pr.ts` with `createMilestonePR()`. Pipeline: read integration branch from META.json → determine target branch (config or `main`) → push branch to remote → call `provider.createPR()` with `Closes #N`. New `commands/pr.ts` for `/issues pr`. New `gsd_issues_pr` tool.

3. **Hook removal and command updates** — remove tool_result auto-close hook from `index.ts`. Update `/issues close` to accept milestone ID instead of slice ID. Update `/issues sync` command and tool to use milestone-level sync. Register new `pr` subcommand.

This order lets each phase build on the previous: sync creates the ISSUE-MAP entry that PR needs for `Closes #N`, and the hook removal is safe once PR-driven close exists.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| CLI execution and error wrapping | `provider.createPR()` from S01, `ProviderError` | Already parses CLI output, carries diagnostic context |
| Issue map I/O | `loadIssueMap` / `saveIssueMap` | Validation, ENOENT handling, crash-safe writes |
| Integration branch reading | `readIntegrationBranch()` from S01 | Full resilience (missing file, corrupt JSON, invalid branch names) |
| Config loading | `loadConfig()` / `Config` type | Structural validation, setup guidance on missing file |
| GSD state reading | `readGSDState()` | Handles missing STATE.md gracefully |
| Provider instantiation | `createProvider(config, exec)` pattern in `index.ts` | Already used in 3 places — extract or copy |

## Existing Code and Patterns

- `src/lib/sync.ts` — **needs rewrite**. Current `syncSlicesToIssues` iterates slices, calls `provider.createIssue()` per slice, saves map after each. New `syncMilestoneToIssue` creates one issue for the milestone. Keep: crash-safe single-entry map save, epic assignment (best-effort), weight mapping (applied to milestone issue based on config/roadmap risk), event emission pattern, dry-run support.
- `src/lib/close.ts` — **needs update**. `closeSliceIssue` → rename to `closeMilestoneIssue`. Change parameter from `sliceId` to `milestoneId`. Logic is identical: find entry by `localId`, call `provider.closeIssue()`, handle already-closed. Event payload changes from `{ sliceId }` to `{ milestoneId }`.
- `src/index.ts` — **needs significant changes**: (1) Remove entire tool_result hook block (~30 lines), (2) Update `gsd_issues_sync` tool to call milestone-level sync, (3) Update `gsd_issues_close` tool to accept `milestone_id` instead of `slice_id`, (4) Register new `gsd_issues_pr` tool, (5) Add `pr` to SUBCOMMANDS and command handler switch.
- `src/commands/sync.ts` — **needs rewrite**. Currently reads roadmap slices and previews unmapped slices. New version: check if milestone is already mapped, show preview of milestone issue to create, confirm, create single issue.
- `src/commands/close.ts` — **needs update**. Parse milestone ID instead of slice ID. Call `closeMilestoneIssue` instead of `closeSliceIssue`.
- `src/providers/types.ts` — `CreatePROpts` already has `closesIssueId?: number`. No changes needed.
- `src/lib/state.ts` — `readIntegrationBranch()` and `readGSDState()` already exist. `parseRoadmapSlices()` may still be useful for the milestone issue body (listing slice titles) but is no longer the primary sync driver. Add `readMilestoneContext()` to read CONTEXT.md for vision/success criteria.
- `src/lib/issue-map.ts` — No changes needed. `IssueMapEntry.localId` will hold "M001" instead of "S01" — convention, not code change (D029).
- `src/lib/config.ts` — May need `target_branch?: string` on Config for PR target. Defaults to `main` if absent.

## Constraints

- **Branch push before PR** — `pi.exec("git", ["push", ...])` needed before `createPR()`. If the branch doesn't exist on the remote, PR creation fails on both platforms. The extension must push explicitly.
- **Integration branch = main scenario** — if META.json has `integrationBranch: "main"` (no milestone branch), there's no separate branch to PR from. The extension must detect this and report it as an error with a clear message.
- **ISSUE-MAP location** — currently stored at `dirname(roadmapPath)/ISSUE-MAP.json`, which is inside the milestone directory. This works naturally for milestone-level mapping — one map file per milestone.
- **Existing test suite** — 212 tests pass. Many sync/close tests are slice-level. Test migration is part of this slice. Expect ~30-40 tests to need rewriting.
- **No `Closes #N` in PR title** — must be in the body. Both platforms parse `Closes` from the body/description, not the title.
- **`closesIssueId` is `number`** on `CreatePROpts` — the ISSUE-MAP stores `issueId` as a number, so this aligns directly.

## Common Pitfalls

- **Branch not pushed** — PR creation fails silently or with an unhelpful error if the branch isn't on the remote. Push explicitly before `createPR()`, and check the exit code. If push fails, report the error and don't attempt PR creation.
- **Integration branch is main** — Can't create a PR from main to main. Detect this before attempting and give a clear error: "Milestone branch is 'main' — no PR needed (work is already on the target branch)."
- **Missing META.json** — `readIntegrationBranch()` returns `null`. Need a clear error message: "No integration branch configured for this milestone. Run GSD from a milestone branch."
- **Missing ISSUE-MAP entry for PR** — If sync wasn't run before `/issues pr`, there's no issue to close. PR creation should still work, but `Closes #N` can't be added. Make `closesIssueId` optional in the PR flow.
- **Milestone description building** — CONTEXT.md may not exist (older milestones). ROADMAP.md always exists. The description builder should gracefully handle missing CONTEXT.md.
- **Test isolation** — sync/close command tests use `process.chdir()`. Must restore cwd in afterEach. Existing tests already follow this pattern.
- **Epic assignment on milestone issue** — Epic config still applies. The `assignToEpic` function works with any issue IID, so it carries over unchanged.

## Open Risks

- **Branch push permissions** — the user may not have push access. The extension should surface the git error clearly rather than failing obscurely on the subsequent PR creation.
- **CONTEXT.md format** — the research assumes CONTEXT.md has frontmatter and a "User-Visible Outcome" section. If the format varies, the description builder needs to be lenient (fall back to title-only).
- **Test count impact** — rewriting sync from per-slice to per-milestone will change ~20 sync tests and ~8 close tests. The hook tests (~7) get removed entirely. New PR tests add ~15-20. Net effect: similar test count but significant churn.
- **Config `target_branch` migration** — adding an optional field to Config doesn't break validation (index signature allows extras), but existing configs won't have it. Default to `main` is safe.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| n/a | n/a | n/a |

## Sources

- `src/lib/sync.ts` — current slice-level sync pipeline (rewrite target)
- `src/lib/close.ts` — current slice-level close (update target)
- `src/index.ts` — tool_result hook, tool registrations, command routing (rewrite target)
- `src/commands/sync.ts` — current sync command handler (rewrite target)
- `src/commands/close.ts` — current close command handler (update target)
- `src/lib/state.ts` — readIntegrationBranch, readGSDState, parseRoadmapSlices (consumers)
- `src/providers/types.ts` — CreatePROpts, PRResult, IssueProvider.createPR (from S01)
- GSD git-service.ts — integration branch recording, auto_push behavior
- `.gsd/milestones/M002/M002-META.json` — example META.json with `integrationBranch` field
