# S04: Auto-close on slice completion

**Goal:** When a slice summary file is written, the mapped remote issue is automatically closed with provider-appropriate behavior. Manual close via command and LLM tool also work.
**Demo:** Write an `S##-SUMMARY.md` file through a mock tool_result event → the corresponding issue in ISSUE-MAP.json is closed via the provider, done label applied (GitLab) or close reason set (GitHub), and `gsd-issues:close-complete` event emitted.

## Must-Haves

- `closeSliceIssue()` orchestration loads map, calls `provider.closeIssue()` with config-driven options, returns structured result
- `tool_result` hook watches for write tool results matching `.gsd/milestones/{M}/slices/{S}/{S}-SUMMARY.md` pattern
- Hook guards: skips `isError` results, non-write tools, non-matching paths, missing config, missing map entries
- Hook is fire-and-forget: catches all errors, never throws into the tool pipeline
- Already-closed issues treated as success (catch ProviderError, don't log false alarm)
- `/issues close` command with UI feedback delegates to `closeSliceIssue()`
- `gsd_issues_close` tool registered via `pi.registerTool()` with TypeBox schema
- `gsd-issues:close-complete` event emitted with `{ milestone, sliceId, issueId, url }` payload
- `ExtensionAPI.on()` method added to local types

## Proof Level

- This slice proves: contract (mock-based — provider calls and hook behavior verified via test doubles)
- Real runtime required: no (UAT deferred to real remotes)
- Human/UAT required: no

## Verification

- `npx vitest run src/lib/__tests__/close.test.ts` — close orchestration: happy path both providers, missing map entry → no-op, already-closed → success, event emission, config-driven done label and close reason
- `npx vitest run src/commands/__tests__/close.test.ts` — command handler: happy path, error handling, tool registration, tool execute. Hook wiring: summary write triggers close, non-summary write skipped, error result skipped, missing config skipped, idempotent on re-write
- `npx vitest run` — all tests pass (S01–S04), no regressions
- `npx tsc --noEmit` — zero type errors

## Observability / Diagnostics

- Runtime signals: `gsd-issues:close-complete` event with milestone/sliceId/issueId/url payload
- Inspection surfaces: ISSUE-MAP.json shows mapping state; close result returned from tool/command
- Failure visibility: ProviderError carries provider/operation/exitCode/stderr/command; hook failures caught and logged silently (no disruption to agent flow)
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `IssueProvider.closeIssue()` (S01), `loadIssueMap()` (S01), `loadConfig()` (S02), `createProvider()` (S03/index.ts), `ExtensionAPI` types (S02/S03)
- New wiring introduced in this slice: `pi.on("tool_result")` lifecycle hook — the first event listener in this extension
- What remains before the milestone is truly usable end-to-end: S05 (import workflow), S06 (packaging), UAT on real remotes

## Tasks

- [x] **T01: Close orchestration, hook wiring, command, and tool** `est:45m`
  - Why: Delivers all S04 functionality — the close module, the lifecycle hook, and the user/LLM entry points. These are tightly coupled (hook and command both call the same close function) and the total code is ~200 lines of implementation, making separate tasks artificial.
  - Files: `src/lib/close.ts`, `src/index.ts`, `src/commands/close.ts`, `src/lib/__tests__/close.test.ts`, `src/commands/__tests__/close.test.ts`
  - Do: (1) Create `src/lib/close.ts` with `closeSliceIssue({ provider, config, sliceId, milestoneId, mapPath, emit })` — loads map, finds entry by localId, calls `provider.closeIssue()` with `doneLabel` from `config.done_label` and `reason` from `config.github?.close_reason`, emits `gsd-issues:close-complete`, returns `{ closed: true, issueId, url }` or `{ closed: false, reason }`. Catch ProviderError on already-closed and return success. (2) Add `on()` method to `ExtensionAPI` interface in `src/index.ts`. (3) Wire `pi.on("tool_result", handler)` in the extension factory — handler extracts `event.input.path`, matches against `/\.gsd\/milestones\/([^/]+)\/slices\/([^/]+)\/\2-SUMMARY\.md$/`, resolves path against cwd, loads config (catch → return), loads map, calls `closeSliceIssue()`. All wrapped in try/catch, never throws. (4) Create `src/commands/close.ts` with `handleClose(args, ctx, pi)` — parses optional `--slice` and `--milestone` args, falls back to GSD state, calls `closeSliceIssue()`, reports via `ctx.ui.notify`. (5) Replace close stub in index.ts switch with dynamic import. (6) Register `gsd_issues_close` tool with TypeBox schema (`slice_id`, `milestone_id` params). (7) Write tests covering: close happy path GitLab (done label), close happy path GitHub (close reason), missing map entry returns `{ closed: false }`, already-closed returns `{ closed: true }`, event emission; hook triggers on summary write, hook skips non-summary, hook skips error results, hook skips missing config, command happy path, tool execute.
  - Verify: `npx vitest run` — all tests pass including new close/hook tests. `npx tsc --noEmit` — clean.
  - Done when: `tool_result` hook fires on summary write in tests, close module handles all edge cases, command and tool both delegate to close module, all 136+ tests pass with no regressions.

## Files Likely Touched

- `src/lib/close.ts`
- `src/lib/__tests__/close.test.ts`
- `src/commands/close.ts`
- `src/commands/__tests__/close.test.ts`
- `src/index.ts`
