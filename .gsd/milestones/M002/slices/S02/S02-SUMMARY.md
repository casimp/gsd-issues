---
id: S02
parent: M002
milestone: M002
provides:
  - syncMilestoneToIssue() — creates one issue per milestone with description from CONTEXT.md + ROADMAP.md
  - closeMilestoneIssue() — closes issue by milestoneId lookup
  - readMilestoneContext() — reads CONTEXT.md with ENOENT-to-null pattern
  - createMilestonePR() — pushes branch and creates PR/MR with Closes #N
  - handlePr() — interactive /issues pr command with preview, confirmation, error reporting
  - gsd_issues_pr tool — LLM-callable PR creation
  - tool_result hook removed — close is now explicit only (command/tool or PR merge)
  - All commands and tools operate at milestone level
requires:
  - slice: S01
    provides: IssueProvider.createPR(), CreatePROpts, PRResult, readIntegrationBranch(), milestone-keyed IssueMapEntry convention
affects:
  - S03
key_files:
  - src/lib/sync.ts
  - src/lib/close.ts
  - src/lib/state.ts
  - src/lib/pr.ts
  - src/commands/sync.ts
  - src/commands/close.ts
  - src/commands/pr.ts
  - src/index.ts
  - src/lib/__tests__/sync.test.ts
  - src/lib/__tests__/close.test.ts
  - src/lib/__tests__/state.test.ts
  - src/lib/__tests__/pr.test.ts
  - src/commands/__tests__/sync.test.ts
  - src/commands/__tests__/close.test.ts
  - src/commands/__tests__/pr.test.ts
key_decisions:
  - D031: PR target branch resolved as explicit param > readIntegrationBranch() > "main"
  - D032: tool_result hook fully removed — close is PR-driven via Closes #N, manual /issues close as fallback
  - D033: Milestone issue weight from highest-risk slice in ROADMAP.md
  - D034: Milestone issue description built from CONTEXT.md body + ROADMAP.md slice listing + gsd metadata tag
  - D035: ExtensionAPI.on() removed from interface — clean break, not just unused
patterns_established:
  - readMilestoneContext() follows ENOENT-to-null pattern from readIntegrationBranch()
  - PR command follows same arg parsing pattern as close (positional, --milestone, --target)
  - createMilestonePR follows options-bag pattern with emit/dryRun consistent with syncMilestoneToIssue
  - All command test makePi() helpers no longer include on property
observability_surfaces:
  - gsd-issues:sync-complete event: { milestone, created, skipped, errors } — created is 0 or 1
  - gsd-issues:close-complete event: { milestone, issueId, url } — no sliceId field
  - gsd-issues:pr-complete event: { milestoneId, prUrl, prNumber }
  - gsd-issues:epic-warning event: { milestoneId, issueId, warning }
  - ISSUE-MAP.json entries: localId holds milestone ID (e.g. "M001")
  - Hook removal verifiable: grep "tool_result" src/index.ts returns 0 matches
  - Four tool registrations: gsd_issues_sync, gsd_issues_close, gsd_issues_import, gsd_issues_pr
drill_down_paths:
  - .gsd/milestones/M002/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T02-SUMMARY.md
  - .gsd/milestones/M002/slices/S02/tasks/T03-SUMMARY.md
duration: ~55min
verification_result: passed
completed_at: 2026-03-14
---

# S02: Milestone-level sync and PR creation

**Rewrote sync/close from per-slice to per-milestone, built PR creation pipeline with Closes #N, removed tool_result auto-close hook, registered gsd_issues_pr tool.**

## What Happened

Three tasks shifted the entire extension from slice-level to milestone-level operations.

**T01** rebuilt the core pipeline. `syncSlicesToIssues` → `syncMilestoneToIssue` creates exactly one issue per milestone call, building the description from CONTEXT.md body and ROADMAP.md slice listing. `closeSliceIssue` → `closeMilestoneIssue` finds entries by milestoneId. `readMilestoneContext()` added to state.ts with the same ENOENT-to-null pattern. All command handlers (`sync.ts`, `close.ts`) and `index.ts` tool definitions were updated to compile against the new APIs.

**T02** built `createMilestonePR()` in `lib/pr.ts` — reads integration branch from META.json, validates source ≠ target, pushes branch, calls `provider.createPR()` with `Closes #N` from ISSUE-MAP lookup, emits `gsd-issues:pr-complete`. `handlePr()` in `commands/pr.ts` provides the interactive flow with preview, confirmation, and error reporting. `PrToolSchema` exported for tool registration.

**T03** wired everything into `index.ts`: removed the entire tool_result lifecycle hook (~50 lines), registered `gsd_issues_pr` tool, added `"pr"` to SUBCOMMANDS and command routing. Removed `ToolResultEvent` type and `pi.on()` from `ExtensionAPI` interface — clean break. Updated all test files to match the simplified interface.

## Verification

- `npx vitest run` — 235 tests pass (15 files, 0 failures). Target was 212+.
- `npx tsc --noEmit` — clean, no type errors
- `grep "tool_result" src/index.ts` — 0 matches (hook fully removed)
- `grep 'name: "gsd_issues_' src/index.ts` — 4 tool registrations (sync, close, import, pr)
- SUBCOMMANDS includes "pr", command handler routes to handlePr
- New sync tests: milestone-level creates single issue, skips mapped, crash-safe, dry-run, epic assignment, description from CONTEXT.md + ROADMAP.md
- New PR tests: push + createPR pipeline, Closes #N, missing integration branch, same-branch, push failure, dry-run, event emission, target branch resolution, title fallback
- Updated close tests: milestone ID parameter, event payload uses milestoneId
- Command tests: `/issues sync` milestone preview, `/issues close M001`, `/issues pr` full flow

## Requirements Advanced

- R003 — Sync now operates at milestone level: one issue per milestone with CONTEXT.md + ROADMAP.md description
- R004 — Close is now PR-driven via `Closes #N` in PR body; manual `/issues close` as fallback. tool_result hook removed.
- R006 — GitLab extras (epic, weight, labels) apply to milestone-level issues
- R007 — GitHub support (milestones, labels) applies to milestone-level issues
- R008 — ISSUE-MAP.json stores milestone→issue mappings (localId holds milestone ID)
- R009 — Sync prompts confirmation before creating milestone issue
- R010 — Events updated: sync-complete/close-complete use milestone payloads, new pr-complete event
- R011 — Commands updated: `/issues sync`, `/issues close`, `/issues pr` all at milestone level
- R012 — Tools updated: gsd_issues_sync, gsd_issues_close use milestone params, gsd_issues_pr registered
- R014 — PR/MR creation implemented: pushes branch, creates PR with `Closes #N`, both providers
- R015 — Milestone-level issue tracking fully operational: one issue per milestone, milestone ID as localId

## Requirements Validated

- R014 — Contract-proved: createMilestonePR pushes branch, calls provider.createPR() with Closes #N, handles missing branch/same-branch/push failure. 25 tests (14 lib + 11 command).
- R015 — Contract-proved: syncMilestoneToIssue creates one issue per milestone, closeMilestoneIssue uses milestoneId, ISSUE-MAP keyed by milestone ID. 235 tests total, milestone model throughout.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- R004 — Re-scoped: close mechanism changed from tool_result auto-close hook (D007) to PR-driven close-on-merge (D032). Manual `/issues close` remains as fallback.

## Deviations

- T01 updated command handlers and index.ts wiring that was planned for T03. Necessary because consumer files import the renamed functions and wouldn't compile otherwise. T03 focused on PR tool registration, hook removal, and pr subcommand routing.

## Known Limitations

- PR creation requires the milestone branch to exist and be pushable to the remote. If auto_push is off in git config, the push step will fail with a clear error.
- `readIntegrationBranch()` reads META.json — if GSD doesn't write META.json for a milestone, PR creation falls back to targeting `main`.
- Import re-scope flow not yet built (S03).

## Follow-ups

- S03: Import re-scope flow — close originals, create milestone issues
- S03: Remaining slice-level test references in import tests should be verified/migrated

## Files Created/Modified

- `src/lib/sync.ts` — rewrote from slice-level to milestone-level sync
- `src/lib/close.ts` — renamed to closeMilestoneIssue, milestone ID parameter
- `src/lib/state.ts` — added readMilestoneContext() and MilestoneContext type
- `src/lib/pr.ts` — new: createMilestonePR(), PrToolSchema, PrToolParams
- `src/commands/sync.ts` — updated for milestone-level preview and sync
- `src/commands/close.ts` — updated to parse milestone ID
- `src/commands/pr.ts` — new: handlePr() interactive command
- `src/index.ts` — hook removed, gsd_issues_pr registered, pr subcommand routed, ExtensionAPI simplified
- `src/lib/__tests__/sync.test.ts` — rewritten for milestone model (20 tests)
- `src/lib/__tests__/close.test.ts` — updated for milestone parameter (8 tests)
- `src/lib/__tests__/state.test.ts` — added readMilestoneContext tests (33 total)
- `src/lib/__tests__/pr.test.ts` — new: 14 tests
- `src/commands/__tests__/sync.test.ts` — updated for milestone sync (11 tests)
- `src/commands/__tests__/close.test.ts` — updated, hook tests removed (8 tests)
- `src/commands/__tests__/pr.test.ts` — new: 11 tests

## Forward Intelligence

### What the next slice should know
- All sync/close/PR functions use the same options-bag pattern with `emit` (event bus callback) and `dryRun` — follow this for any new functions
- `createProvider(config, exec)` factory is duplicated in index.ts and commands — still not extracted (D023). If S03 adds a fourth consumer, extract it.
- Import tests still use the original import patterns from M001 — they weren't rewritten in S02 because import functionality wasn't touched

### What's fragile
- `readMilestoneContext()` parses CONTEXT.md by looking for "## Project Description" or taking body after first heading — if CONTEXT.md format changes, description extraction breaks
- PR title uses same ROADMAP→CONTEXT→milestoneId fallback chain as sync — these are independent implementations, not shared. If title logic changes, update both.

### Authoritative diagnostics
- `grep 'name: "gsd_issues_' src/index.ts` — shows all registered tools (should be 4)
- `grep "tool_result" src/index.ts` — confirms hook removal (should be 0)
- `npx vitest run` — 235 tests, 15 files, comprehensive coverage of milestone model

### What assumptions changed
- Planned T03 to handle all command/tool wiring — T01 had to do most of it because the renamed functions wouldn't compile without updating consumers. T03 became focused on PR tool, hook removal, and pr subcommand only.
