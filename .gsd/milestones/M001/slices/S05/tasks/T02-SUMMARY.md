---
id: T02
parent: S05
milestone: M001
provides:
  - "/issues import" command handler with --milestone and --labels flag parsing
  - gsd_issues_import LLM-callable tool with TypeBox schema
  - Import stub in index.ts replaced with real handler wiring
key_files:
  - src/commands/import.ts
  - src/commands/__tests__/import.test.ts
  - src/index.ts
key_decisions:
  - "Filter defaults to state:'open' — import is primarily for fetching active work"
  - "Tool accepts state/assignee params beyond what the command parses — LLM callers get richer filtering"
patterns_established:
  - "Import tool follows sync/close tool pattern: load config → resolve milestone → create provider → call pipeline → return ToolResult"
  - "Command handler follows close.ts pattern: parseFlags → loadConfig → resolve milestone → create provider → try/catch with notify"
observability_surfaces:
  - "gsd-issues:import-complete event emitted through both command and tool paths with { issueCount }"
  - "ctx.ui.notify delivers full formatted markdown (command path)"
  - "ToolResult.details carries { markdown, issueCount } for structured inspection (tool path)"
  - "Provider errors surface as ProviderError with full CLI context through both paths"
duration: 1 step
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Wire /issues import command and gsd_issues_import tool

**Wired the `/issues import` command handler and `gsd_issues_import` LLM-callable tool — both call `importIssues()` from T01, with flag parsing for command and typed params for tool.**

## What Happened

Created `src/commands/import.ts` with `handleImport()` following the close.ts pattern: parses `--milestone` and `--labels` flags (both `--flag value` and `--flag=value` syntax), loads config, resolves milestone from flags/config/GSD state, builds an `IssueFilter` with `state: "open"` default, calls `importIssues()`, and sends formatted markdown via `ctx.ui.notify`.

In `src/index.ts`: registered `gsd_issues_import` tool with the `ImportToolSchema` from T01 (milestone, labels, state, assignee params). The tool follows the same config → milestone → provider → filter → import pipeline. Replaced the stub `case "import"` in the switch with a dynamic import of `handleImport`. Added the import for `importIssues`, `ImportToolSchema`, and `ImportToolParams`.

Created 13 tests covering: happy path markdown output, event emission, empty list notification, config error, provider error, --milestone flag parsing, --labels flag parsing, --flag=value syntax, GitHub provider path, tool registration verification, tool execute with results, tool execute with empty results, and switch-case wiring confirmation (no "not yet implemented" stub).

## Verification

- `npx vitest run src/commands/__tests__/import.test.ts` — ✅ 13 tests pass
- `npx vitest run src/lib/__tests__/import.test.ts` — ✅ 17 tests pass
- `npx vitest run` — ✅ 188 tests pass (all 13 files), zero regressions
- `npx tsc --noEmit` — ✅ zero errors

## Diagnostics

- `gsd-issues:import-complete` event — watch in pi event bus to confirm pipeline ran. Payload: `{ issueCount }`.
- Command path: `ctx.ui.notify` receives full markdown or "No issues found." message. Level is `info` for success, `error` for failures.
- Tool path: `ToolResult.content[0].text` has the markdown. `ToolResult.details` has `{ markdown, issueCount }`.
- Provider errors: `ProviderError` with `provider`, `operation`, `exitCode`, `stderr`, `command` fields — same as sync/close.

## Deviations

- Tool accepts `state` and `assignee` params beyond what the command-line handler parses. The command always filters `state: "open"` since that's the primary import use case. LLM callers get the full filter surface from the TypeBox schema established in T01.

## Known Issues

None.

## Files Created/Modified

- `src/commands/import.ts` — `handleImport()` command handler with flag parsing and provider integration
- `src/commands/__tests__/import.test.ts` — 13 tests for command handler, tool registration, and switch wiring
- `src/index.ts` — registered `gsd_issues_import` tool, replaced import stub with real handler, added import-related imports
- `.gsd/milestones/M001/slices/S05/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
