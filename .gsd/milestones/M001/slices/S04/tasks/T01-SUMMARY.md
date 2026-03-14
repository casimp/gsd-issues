---
id: T01
parent: S04
milestone: M001
provides:
  - closeSliceIssue() orchestration function
  - tool_result lifecycle hook for auto-close on summary write
  - /issues close command handler
  - gsd_issues_close LLM-callable tool
  - ToolResultEvent type and on() method on ExtensionAPI
key_files:
  - src/lib/close.ts
  - src/commands/close.ts
  - src/index.ts
key_decisions:
  - Hook matches WRITE_TOOLS set (write, Write, write_file, create_file, edit_file) — covers pi's known write tool names
  - Already-closed detection checks both stderr and message for "already closed" or "already been closed" strings
  - Hook catches all errors silently including config load failures — never disrupts the tool pipeline
patterns_established:
  - Close orchestration follows same emit/options pattern as sync (emit optional callback, config-driven provider options)
  - Command handler follows handleSync pattern (args, ctx, pi signature with dynamic import)
observability_surfaces:
  - gsd-issues:close-complete event with { milestone, sliceId, issueId, url } payload
  - CloseResult return type distinguishes success from no-mapping
  - ProviderError fields (provider, operation, exitCode, stderr, command) available in catch blocks
duration: 1 task
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Close orchestration, hook wiring, command, and tool

**Delivered complete auto-close feature: closeSliceIssue() orchestration, tool_result hook that auto-closes on S##-SUMMARY.md writes, /issues close command, and gsd_issues_close LLM tool — all delegating to the same close function.**

## What Happened

Built the close orchestration in `src/lib/close.ts` with `closeSliceIssue()` that loads ISSUE-MAP.json, finds the entry by sliceId, calls `provider.closeIssue()` with config-driven `doneLabel` (GitLab) and `reason` (GitHub), catches already-closed ProviderErrors as success, and emits `gsd-issues:close-complete`.

Added `ToolResultEvent` interface and `on()` method to `ExtensionAPI` in `src/index.ts`. Wired a `tool_result` hook in the extension factory that matches write tools against the `S##-SUMMARY.md` path pattern in `.gsd/milestones/` structure. The hook never throws — all errors are caught silently.

Created `src/commands/close.ts` with `handleClose()` that parses slice ID from positional or `--slice` arg, resolves milestone, and delegates to `closeSliceIssue()`.

Replaced the close stub in the switch statement with dynamic import of `handleClose`. Registered `gsd_issues_close` tool with TypeBox schema (`slice_id: string`, optional `milestone_id: string`).

Updated existing sync test mock to include the new `on` method on ExtensionAPI.

## Verification

- `npx vitest run src/lib/__tests__/close.test.ts` — 8 tests pass (GitLab/GitHub close, no-mapping, already-closed, event emission, no event when not closed, rethrows real errors, missing map file)
- `npx vitest run src/commands/__tests__/close.test.ts` — 14 tests pass (command happy path, missing args, missing config, no mapping, provider errors, tool registration shape, tool execute, hook registration, summary write triggers close, non-summary skipped, error result skipped, non-write tool skipped, missing config skipped silently, wrong directory skipped)
- `npx vitest run` — all 158 tests pass (was 136), 0 regressions across S01–S04
- `npx tsc --noEmit` — 0 type errors

## Diagnostics

- Listen for `gsd-issues:close-complete` event on `pi.events` to observe auto-close behavior
- Inspect ISSUE-MAP.json for mapping state — close reads but does not modify the map
- `CloseResult` return type: `{ closed: true, issueId, url }` or `{ closed: false, reason: "no-mapping" }`
- ProviderError carries full diagnostic context (provider, operation, exitCode, stderr, command)
- Hook failures are silent — check provider logs or issue state if close didn't fire

## Deviations

- Added 8 tests instead of minimum 6 for close orchestration (added missing-map-file and rethrows-real-error cases)
- Added 14 tests instead of minimum 8 for command/hook (more thorough hook coverage)

## Known Issues

None.

## Files Created/Modified

- `src/lib/close.ts` — close orchestration module with `closeSliceIssue()` and `CloseResult` type
- `src/lib/__tests__/close.test.ts` — 8 tests covering close orchestration edge cases
- `src/commands/close.ts` — command handler for `/issues close`
- `src/commands/__tests__/close.test.ts` — 14 tests covering command, tool, and hook behavior
- `src/index.ts` — updated with `ToolResultEvent` type, `on()` method, tool_result hook, close tool registration, close command wiring
- `src/commands/__tests__/sync.test.ts` — added `on` to mock ExtensionAPI (compatibility fix)
