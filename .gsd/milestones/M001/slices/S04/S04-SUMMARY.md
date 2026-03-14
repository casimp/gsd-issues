---
id: S04
parent: M001
milestone: M001
provides:
  - closeSliceIssue() orchestration function with config-driven provider options
  - tool_result lifecycle hook that auto-closes mapped issues on S##-SUMMARY.md writes
  - /issues close command handler with CLI arg parsing
  - gsd_issues_close LLM-callable tool with TypeBox schema
  - ToolResultEvent type and on() method on ExtensionAPI
  - gsd-issues:close-complete event emission
requires:
  - slice: S01
    provides: IssueProvider.closeIssue(), loadIssueMap()
  - slice: S02
    provides: loadConfig(), Config type
affects:
  - S06
key_files:
  - src/lib/close.ts
  - src/commands/close.ts
  - src/index.ts
  - src/lib/__tests__/close.test.ts
  - src/commands/__tests__/close.test.ts
key_decisions:
  - Hook matches WRITE_TOOLS set (write, Write, write_file, create_file, edit_file) — covers pi's known write tool names
  - Already-closed detection checks both stderr and message for "already closed" or "already been closed" strings
  - Hook catches all errors silently including config load failures — never disrupts the tool pipeline
patterns_established:
  - Close orchestration follows same emit/options pattern as sync (emit optional callback, config-driven provider options)
  - Command handler follows handleSync pattern (args, ctx, pi signature with dynamic import)
observability_surfaces:
  - gsd-issues:close-complete event with { milestone, sliceId, issueId, url } payload
  - CloseResult return type distinguishes { closed: true, issueId, url } from { closed: false, reason }
  - ProviderError fields (provider, operation, exitCode, stderr, command) available in catch blocks
  - Hook failures are silent — check provider logs or issue tracker state if close didn't fire
drill_down_paths:
  - .gsd/milestones/M001/slices/S04/tasks/T01-SUMMARY.md
duration: 1 task
verification_result: passed
completed_at: 2026-03-14
---

# S04: Auto-close on slice completion

**Delivered auto-close lifecycle hook, close orchestration, `/issues close` command, and `gsd_issues_close` LLM tool — all sharing the same `closeSliceIssue()` function with config-driven provider behavior.**

## What Happened

Built `closeSliceIssue()` in `src/lib/close.ts` — loads ISSUE-MAP.json, finds the entry by sliceId, calls `provider.closeIssue()` with `doneLabel` from config (GitLab) and `reason` from `config.github.close_reason` (GitHub), catches already-closed ProviderErrors as success, and emits `gsd-issues:close-complete` with `{ milestone, sliceId, issueId, url }`.

Added `ToolResultEvent` interface and `on()` method to `ExtensionAPI` in `src/index.ts`. Wired a `tool_result` hook in the extension factory that matches a set of write tools (`write`, `Write`, `write_file`, `create_file`, `edit_file`) against the `S##-SUMMARY.md` path pattern under `.gsd/milestones/`. The hook is fire-and-forget — all errors caught silently, never disrupts the tool pipeline. Guards for `isError` results, non-write tools, non-matching paths, missing config, and missing map entries.

Created `src/commands/close.ts` with `handleClose()` that parses slice ID from positional or `--slice` arg, resolves milestone, and delegates to `closeSliceIssue()`. Replaced the close stub in the switch statement with dynamic import. Registered `gsd_issues_close` tool with TypeBox schema (`slice_id: string`, optional `milestone_id: string`).

## Verification

- `npx vitest run src/lib/__tests__/close.test.ts` — 8 tests pass (GitLab close with done label, GitHub close with close reason, no-mapping returns closed:false, already-closed treated as success, event emission, no event when not closed, rethrows real errors, missing map file)
- `npx vitest run src/commands/__tests__/close.test.ts` — 14 tests pass (command happy path, missing args, missing config, no mapping, provider errors, tool registration shape, tool execute, hook registration, summary write triggers close, non-summary skipped, error result skipped, non-write tool skipped, missing config skipped silently, wrong directory skipped)
- `npx vitest run` — all 158 tests pass (0 regressions across S01–S04)
- `npx tsc --noEmit` — 0 type errors

## Requirements Advanced

- R004 — Close orchestration, lifecycle hook, command, and tool all implemented and contract-tested
- R006 — GitLab done label (`T::Done` default) applied on close via config-driven `doneLabel` option
- R007 — GitHub close reason passed through config-driven `reason` option
- R008 — ISSUE-MAP.json consumed by close to resolve slice→issue mapping
- R010 — `gsd-issues:close-complete` event emitted on pi.events bus
- R011 — `/issues close` command wired into subcommand routing
- R012 — `gsd_issues_close` tool registered with TypeBox schema

## Requirements Validated

- R004 — Close workflow proven via 22 contract tests: orchestration handles both providers with config-driven options, lifecycle hook fires on legitimate summary writes and guards against all edge cases (non-write tools, error results, missing config, missing mapping, wrong paths), command and tool both delegate to shared close function. All that remains is UAT on real remotes.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- Added more tests than minimum (8 close + 14 command/hook vs 6 + 8 planned) — rethrows-real-error, missing-map-file, and additional hook guard tests added for better coverage.

## Known Limitations

- Close reads ISSUE-MAP.json but does not mark entries as closed in the map — the source of truth for closed status is the remote issue tracker
- No retry logic on transient provider failures — close is fire-once
- UAT on real GitLab/GitHub remotes deferred to post-S06

## Follow-ups

- S05: Import workflow
- S06: npm packaging, then UAT on real remotes across all workflows

## Files Created/Modified

- `src/lib/close.ts` — close orchestration with `closeSliceIssue()` and `CloseResult` type
- `src/lib/__tests__/close.test.ts` — 8 tests for close orchestration
- `src/commands/close.ts` — `/issues close` command handler
- `src/commands/__tests__/close.test.ts` — 14 tests for command, tool, and hook
- `src/index.ts` — `ToolResultEvent` type, `on()` method, tool_result hook, close tool registration, close command wiring
- `src/commands/__tests__/sync.test.ts` — added `on` to mock ExtensionAPI (compatibility fix)

## Forward Intelligence

### What the next slice should know
- ExtensionAPI now has `registerTool()`, `exec()`, `events`, and `on()` — the type surface is mature enough for import tool registration without new interface changes
- The `createProvider(config, exec)` factory pattern exists in both `index.ts` and `commands/sync.ts` — S06 packaging should consider extracting to a shared module if import also needs it

### What's fragile
- WRITE_TOOLS set is hardcoded (`write`, `Write`, `write_file`, `create_file`, `edit_file`) — if pi adds new write tool names, the hook won't match them
- Already-closed detection relies on string matching in stderr/message ("already closed" / "already been closed") — CLI output format changes could break this

### Authoritative diagnostics
- `gsd-issues:close-complete` event on `pi.events` — if it fires, close succeeded; if it doesn't fire, check the hook guards (tool name, path pattern, config, map entry)
- `CloseResult` return from `closeSliceIssue()` — `closed: false` with `reason: "no-mapping"` means the slice has no entry in ISSUE-MAP.json

### What assumptions changed
- None — implementation matched the plan closely
