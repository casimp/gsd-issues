---
estimated_steps: 5
estimated_files: 5
---

# T03: Wire tools, remove hook, and update command routing

**Slice:** S02 — Milestone-level sync and PR creation
**Milestone:** M002

## Description

Integration wiring — connect T01's milestone sync/close and T02's PR pipeline to the extension entry point. Remove the tool_result auto-close hook (replaced by PR-driven close), update all three LLM tools for the milestone model, register the new `gsd_issues_pr` tool, update command handlers and their tests.

## Steps

1. Update `src/index.ts`:
   - Remove the entire `tool_result` lifecycle hook block (WRITE_TOOLS, SUMMARY_REGEX, `pi.on("tool_result", ...)` — approximately lines 366–419)
   - Update imports: `syncMilestoneToIssue` replaces `syncSlicesToIssues`, `closeMilestoneIssue` replaces `closeSliceIssue`, add `createMilestonePR` and `PrToolSchema`
   - Update `gsd_issues_sync` tool: remove roadmap/slice parsing, call `syncMilestoneToIssue()` with milestoneId. Check if milestone already mapped first, return early if so. Update description text.
   - Update `gsd_issues_close` tool: rename param from `slice_id` to `milestone_id` (required string), call `closeMilestoneIssue()`. Update result messages.
   - Register `gsd_issues_pr` tool: params from `PrToolSchema` (optional `milestone_id`, optional `target_branch`), call `createMilestonePR()`, return PR URL and number.
   - Add `"pr"` to SUBCOMMANDS array
   - Add `case "pr"` to command handler switch, importing `handlePr` from `./commands/pr.js`
2. Rewrite `src/commands/sync.ts` for milestone-level:
   - Remove roadmap reading and slice parsing
   - Check if milestone already mapped in ISSUE-MAP → "Already synced" message
   - Show preview of the milestone issue to create (title, labels, assignee)
   - Confirm with user → call `syncMilestoneToIssue()`
   - Report result (created or error)
3. Update `src/commands/close.ts`:
   - Rename arg parser: `parseSliceId` → `parseMilestoneId`, update help text to "Usage: /issues close <milestone_id>"
   - Call `closeMilestoneIssue()` instead of `closeSliceIssue()`
   - Update result messages from "slice" to "milestone"
4. Rewrite `src/commands/__tests__/sync.test.ts` for milestone model — remove slice-based test scenarios, add: milestone already mapped, milestone sync preview + confirm, sync result reporting, error handling
5. Update `src/commands/__tests__/close.test.ts` — change all slice references to milestone, verify arg parsing accepts milestone IDs (M001), verify correct function calls

## Must-Haves

- [x] tool_result hook completely removed from index.ts
- [x] `gsd_issues_sync` tool calls `syncMilestoneToIssue()`
- [x] `gsd_issues_close` tool accepts `milestone_id` param and calls `closeMilestoneIssue()`
- [x] `gsd_issues_pr` tool registered with correct schema and calls `createMilestonePR()`
- [x] `"pr"` in SUBCOMMANDS and command routing
- [x] `commands/sync.ts` operates at milestone level
- [x] `commands/close.ts` operates at milestone level
- [x] All 212+ tests pass (some removed, some added — net should be similar or higher)

## Verification

- `npx vitest run` — all tests pass, no regressions
- `npx tsc --noEmit` — clean
- Verify hook removal: grep for `tool_result` in index.ts — should not appear
- Verify all tools registered: grep for `gsd_issues_sync`, `gsd_issues_close`, `gsd_issues_pr` in index.ts

## Inputs

- `src/lib/sync.ts` — T01's `syncMilestoneToIssue()`, `SyncToolSchema`
- `src/lib/close.ts` — T01's `closeMilestoneIssue()`
- `src/lib/pr.ts` — T02's `createMilestonePR()`, `PrToolSchema`
- `src/commands/pr.ts` — T02's `handlePr()`
- `src/index.ts` — current entry point with slice-level tools and hook (rewrite target)
- `src/commands/sync.ts` — current slice-level sync command (rewrite target)
- `src/commands/close.ts` — current slice-level close command (update target)

## Expected Output

- `src/index.ts` — hook removed, three tools updated/added, pr subcommand wired
- `src/commands/sync.ts` — rewritten for milestone-level sync
- `src/commands/close.ts` — updated for milestone ID
- `src/commands/__tests__/sync.test.ts` — rewritten for milestone model
- `src/commands/__tests__/close.test.ts` — updated for milestone model

## Observability Impact

- **Removed signal:** `tool_result` lifecycle hook no longer fires — no auto-close on summary writes. Issue close is now explicit via `/issues close` or `gsd_issues_close` tool.
- **New tool surface:** `gsd_issues_pr` tool is LLM-callable. Emits `gsd-issues:pr-complete` event with `{ milestoneId, prUrl, prNumber }`.
- **Inspection:** All three tools (`gsd_issues_sync`, `gsd_issues_close`, `gsd_issues_pr`) registered and discoverable via `pi.registerTool`.
- **Failure visibility:** Config/state resolution errors return structured `ToolResult` text. PR pipeline errors propagate with full context (push failure, same-branch, missing integration branch).
- **Verification grep:** `grep "tool_result" src/index.ts` returns 0 matches confirms hook removal. `grep "gsd_issues_" src/index.ts` returns 4 tool registrations (sync, close, import, pr).
