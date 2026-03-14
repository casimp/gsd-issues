---
estimated_steps: 7
estimated_files: 5
---

# T01: Close orchestration, hook wiring, command, and tool

**Slice:** S04 — Auto-close on slice completion
**Milestone:** M001

## Description

Deliver the complete auto-close feature: a `closeSliceIssue()` orchestration function, a `tool_result` lifecycle hook that detects summary file writes and triggers close, a `/issues close` command for manual invocation, and a `gsd_issues_close` LLM-callable tool. All entry points delegate to the same close function. The hook must never throw or block the tool pipeline.

## Steps

1. Create `src/lib/close.ts` — `closeSliceIssue(opts)` loads ISSUE-MAP.json via `loadIssueMap()`, finds entry by `localId === sliceId`, returns `{ closed: false, reason: "no-mapping" }` if not found. Calls `provider.closeIssue()` with `doneLabel` from `config.done_label` and `reason` from `config.github?.close_reason`. Catches `ProviderError` where stderr/message suggests already-closed and treats as success. Emits `gsd-issues:close-complete` with `{ milestone, sliceId, issueId, url }`. Returns `{ closed: true, issueId, url }`.

2. Add `on()` method to `ExtensionAPI` interface in `src/index.ts`: `on(event: "tool_result", handler: (event: ToolResultEvent, ctx: ExtensionCommandContext) => void | Promise<void>): void`. Define `ToolResultEvent` interface: `{ toolName: string; input: Record<string, unknown>; content: unknown; isError: boolean }`.

3. Wire `pi.on("tool_result", handler)` in the default export of `src/index.ts`. Handler logic: (a) if `event.isError` → return, (b) if `event.toolName` is not a write tool → return, (c) extract `event.input.path` as string, resolve against `process.cwd()`, (d) match against regex for `S##-SUMMARY.md` in the `.gsd/milestones` path structure, extracting milestoneId and sliceId, (e) load config (catch → return silently), (f) construct provider and mapPath, (g) call `closeSliceIssue()` — all in try/catch, never throws.

4. Create `src/commands/close.ts` — `handleClose(args, ctx, pi)` parses args for slice ID (positional or `--slice`), resolves milestone from config or GSD state, calls `closeSliceIssue()`, reports result via `ctx.ui.notify()`.

5. Replace close stub in `src/index.ts` switch statement with dynamic import of `handleClose`. Register `gsd_issues_close` tool via `pi.registerTool()` with TypeBox schema (`slice_id: string`, optional `milestone_id: string`).

6. Write `src/lib/__tests__/close.test.ts` — tests for: GitLab close with done label, GitHub close with reason, missing map entry → no-op, already-closed issue → success, event emission, no event when not closed.

7. Write `src/commands/__tests__/close.test.ts` — tests for: command happy path, command error handling, tool registration shape, tool execute. Hook behavior: summary write triggers close, non-summary path skipped, error result skipped, missing config skipped silently, write to wrong directory skipped.

## Must-Haves

- [ ] `closeSliceIssue()` calls `provider.closeIssue()` with config-driven doneLabel and reason
- [ ] Missing map entry returns `{ closed: false }` without error
- [ ] Already-closed issue treated as success (ProviderError caught)
- [ ] `gsd-issues:close-complete` event emitted on successful close
- [ ] `tool_result` hook matches only `S##-SUMMARY.md` in correct directory structure
- [ ] Hook never throws — all errors caught silently
- [ ] Hook skips `isError` results and non-write tools
- [ ] `/issues close` command replaces stub, delegates to `closeSliceIssue()`
- [ ] `gsd_issues_close` tool registered with TypeBox schema
- [ ] `ExtensionAPI` interface updated with `on()` method and `ToolResultEvent` type

## Verification

- `npx vitest run src/lib/__tests__/close.test.ts` — all close orchestration tests pass
- `npx vitest run src/commands/__tests__/close.test.ts` — all command/hook tests pass
- `npx vitest run` — all tests pass (S01–S04), no regressions from existing 136 tests
- `npx tsc --noEmit` — zero type errors

## Observability Impact

- Signals added: `gsd-issues:close-complete` event with `{ milestone, sliceId, issueId, url }` payload
- How a future agent inspects this: listen for the event on `pi.events`, or check ISSUE-MAP.json for mapping state, or inspect `CloseResult` returned from command/tool
- Failure state exposed: ProviderError fields (provider, operation, exitCode, stderr, command) available in catch blocks; hook failures caught silently to prevent disruption

## Inputs

- `src/providers/types.ts` — `IssueProvider.closeIssue()`, `CloseIssueOpts`, `ProviderError`, `ExecFn`
- `src/lib/issue-map.ts` — `loadIssueMap()` for reading mapping
- `src/lib/config.ts` — `loadConfig()`, `Config` type with `done_label` and `github.close_reason`
- `src/index.ts` — `ExtensionAPI` interface, `createProvider()` factory, tool/command registration patterns from S03
- `src/commands/sync.ts` — reference for command handler pattern (args, ctx, pi signature)
- `src/lib/sync.ts` — reference for event emission pattern and TypeBox schema

## Expected Output

- `src/lib/close.ts` — close orchestration module with `closeSliceIssue()` and `CloseResult` type
- `src/lib/__tests__/close.test.ts` — 6+ tests covering close orchestration edge cases
- `src/commands/close.ts` — command handler for `/issues close`
- `src/commands/__tests__/close.test.ts` — 8+ tests covering command, tool, and hook behavior
- `src/index.ts` — updated with `on()` type, tool_result hook, close tool registration, close command wiring
