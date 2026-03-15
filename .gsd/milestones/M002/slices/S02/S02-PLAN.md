# S02: Milestone-level sync and PR creation

**Goal:** Sync creates one issue per milestone, `/issues pr` creates a PR from milestone branch to target with `Closes #N`, tool_result auto-close hook removed.
**Demo:** Run `/issues sync` on a milestone → one issue created. Run `/issues pr` → PR created with `Closes #N`. Hook no longer fires on summary writes.

## Must-Haves

- `syncMilestoneToIssue()` creates one issue per milestone using ROADMAP.md title and CONTEXT.md vision/success criteria as body
- `closeMilestoneIssue()` accepts milestone ID instead of slice ID for localId lookup
- `readMilestoneContext()` reads CONTEXT.md and gracefully handles missing files
- `createMilestonePR()` pushes branch, calls `provider.createPR()` with `Closes #N`, handles missing integration branch and same-branch errors
- `commands/pr.ts` handles `/issues pr` with milestone resolution, confirmation, and error reporting
- `commands/sync.ts` rewritten for milestone-level sync with single-issue preview
- `commands/close.ts` updated for milestone ID argument
- `gsd_issues_sync` tool updated for milestone-level sync
- `gsd_issues_close` tool accepts `milestone_id` instead of `slice_id`
- `gsd_issues_pr` tool registered for LLM callers
- `tool_result` hook removed from `index.ts`
- `pr` added to SUBCOMMANDS and command routing
- All existing tests updated — no regressions, 212+ tests pass

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run` — all tests pass (target: 212+, accounting for removed hook tests and added PR/sync/close tests)
- `npx tsc --noEmit` — no type errors
- New sync tests: milestone-level sync creates single issue, skips mapped milestones, crash-safe persistence, dry-run, epic assignment, description from CONTEXT.md + ROADMAP.md
- New PR tests: push + createPR pipeline, Closes #N in body, missing integration branch error, same-branch error, missing ISSUE-MAP entry (PR without close), push failure handling
- Updated close tests: milestone ID parameter, event payload uses milestoneId
- Command tests: `/issues sync` milestone preview, `/issues pr` full flow, `/issues close M001`
- Index tests: hook removal verified (no `tool_result` handler), new tool registrations

## Observability / Diagnostics

- Runtime signals: `gsd-issues:sync-complete` payload changes from `{ sliceId }` errors to `{ milestoneId }` errors; new `gsd-issues:pr-complete` event with `{ milestoneId, prUrl, prNumber }`
- Inspection surfaces: ISSUE-MAP.json entries keyed by milestone ID; PR creation errors carry full ProviderError context
- Failure visibility: `createMilestonePR` reports branch push failure before attempting PR; missing integration branch and same-branch detected pre-flight with clear error messages
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `IssueProvider.createPR()`, `CreatePROpts`, `PRResult` from S01; `readIntegrationBranch()` from S01; `loadIssueMap`/`saveIssueMap`; `loadConfig`; `readGSDState`
- New wiring introduced in this slice: `gsd_issues_pr` tool, `pr` subcommand in index.ts, milestone-level sync/close replacing slice-level
- What remains before the milestone is truly usable end-to-end: S03 (import re-scope, test migration for remaining slice-level tests, command cleanup)

## Tasks

- [x] **T01: Rewrite sync and close for milestone-level operations** `est:1h`
  - Why: Core pipeline shift — everything else (PR, commands, tools) depends on milestone-level sync/close
  - Files: `src/lib/sync.ts`, `src/lib/close.ts`, `src/lib/state.ts`, `src/lib/__tests__/sync.test.ts`, `src/lib/__tests__/close.test.ts`, `src/lib/__tests__/state.test.ts`
  - Do: (1) Add `readMilestoneContext(cwd, milestoneId)` to state.ts — reads CONTEXT.md, extracts title/vision/success criteria, returns null on missing file. (2) Rewrite `syncSlicesToIssues` → `syncMilestoneToIssue` in sync.ts — single issue per milestone, builds description from ROADMAP.md title + CONTEXT.md content, uses milestone ID as localId, keeps crash-safe save, epic assignment, weight, dry-run. (3) Update SyncOptions to take milestoneId instead of slices[]. (4) Rename `closeSliceIssue` → `closeMilestoneIssue` in close.ts — change sliceId param to milestoneId, use milestoneId as localId for map lookup, update event payload. (5) Rewrite sync tests for milestone model, update close tests for milestone parameter.
  - Verify: `npx vitest run src/lib/__tests__/sync.test.ts src/lib/__tests__/close.test.ts src/lib/__tests__/state.test.ts` — all pass, `npx tsc --noEmit` clean
  - Done when: `syncMilestoneToIssue` creates one issue per milestone, `closeMilestoneIssue` finds entries by milestone ID, both have comprehensive tests

- [x] **T02: Build PR creation pipeline and command** `est:45m`
  - Why: PR creation is the new close mechanism — replaces the tool_result hook with platform-native close-on-merge
  - Files: `src/lib/pr.ts`, `src/lib/__tests__/pr.test.ts`, `src/commands/pr.ts`, `src/commands/__tests__/pr.test.ts`
  - Do: (1) Create `lib/pr.ts` with `createMilestonePR(opts)` — reads integration branch via `readIntegrationBranch()`, validates source ≠ target, pushes branch via `exec("git", ["push", ...])`, calls `provider.createPR()` with `Closes #N` from ISSUE-MAP entry, returns PRResult. Default target branch to config `target_branch` or `main`. (2) Add `PrToolSchema` TypeBox schema. (3) Create `commands/pr.ts` with `handlePr()` — resolve milestone, load map, check for existing issue, confirm, call `createMilestonePR()`, report result. (4) Write tests for both — mock exec for push, mock provider for createPR, cover all error paths.
  - Verify: `npx vitest run src/lib/__tests__/pr.test.ts src/commands/__tests__/pr.test.ts` — all pass, `npx tsc --noEmit` clean
  - Done when: `createMilestonePR` handles push + PR + Closes #N, error paths covered, command handles full interactive flow

- [x] **T03: Wire tools, remove hook, and update command routing** `est:45m`
  - Why: Integration wiring — connects the new milestone-level modules to the extension entry point and updates existing commands
  - Files: `src/index.ts`, `src/commands/sync.ts`, `src/commands/close.ts`, `src/commands/__tests__/sync.test.ts`, `src/commands/__tests__/close.test.ts`
  - Do: (1) Remove entire tool_result hook block from index.ts (~50 lines). (2) Update `gsd_issues_sync` tool: call `syncMilestoneToIssue` instead of `syncSlicesToIssues`, remove roadmap-slice parsing, check if milestone already mapped. (3) Update `gsd_issues_close` tool: accept `milestone_id` param instead of `slice_id`, call `closeMilestoneIssue`. (4) Register `gsd_issues_pr` tool: accept `milestone_id` param, call `createMilestonePR`. (5) Add `"pr"` to SUBCOMMANDS, add case to handler switch. (6) Rewrite `commands/sync.ts` for milestone-level: check if milestone mapped, preview single issue, confirm, create. (7) Update `commands/close.ts`: parse milestone ID instead of slice ID, call `closeMilestoneIssue`. (8) Update command tests for new sync/close/pr flows.
  - Verify: `npx vitest run` — all 212+ tests pass (some removed, some added), `npx tsc --noEmit` clean
  - Done when: All tools and commands operate at milestone level, hook removed, full test suite green

## Files Likely Touched

- `src/lib/sync.ts`
- `src/lib/close.ts`
- `src/lib/state.ts`
- `src/lib/pr.ts` (new)
- `src/lib/__tests__/sync.test.ts`
- `src/lib/__tests__/close.test.ts`
- `src/lib/__tests__/state.test.ts`
- `src/lib/__tests__/pr.test.ts` (new)
- `src/commands/sync.ts`
- `src/commands/close.ts`
- `src/commands/pr.ts` (new)
- `src/commands/__tests__/sync.test.ts`
- `src/commands/__tests__/close.test.ts`
- `src/commands/__tests__/pr.test.ts` (new)
- `src/index.ts`
