---
id: T03
parent: S03
milestone: M001
provides:
  - "handleSync(args, ctx, pi) — interactive /issues sync command with preview + confirmation"
  - "gsd_issues_sync tool — LLM-callable sync without confirmation, returns structured ToolResult"
  - "Extended ExtensionAPI with registerTool, exec, events"
  - "createProvider(config, exec) — factory for GitLab/GitHub provider instantiation"
key_files:
  - src/commands/sync.ts
  - src/commands/__tests__/sync.test.ts
  - src/index.ts
key_decisions:
  - "D022: Tool mode skips confirmation — LLM acts on user intent"
  - "D023: Provider created from config at call site — simple branching, not extracted"
patterns_established:
  - "Tool registration at extension load time via pi.registerTool() with TypeBox schema"
  - "Command handler receives pi API as third argument for exec/events access"
  - "ToolResult structure: { content: [{type:'text', text}], details?: SyncResult }"
observability_surfaces:
  - "ToolResult.content[0].text — sync summary with created/skipped/error counts"
  - "ToolResult.details — full SyncResult object for LLM inspection"
  - "ctx.ui.notify — sync results in command mode (info or warning level based on errors)"
  - "gsd-issues:sync-complete event — emitted by both command and tool paths"
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T03: Wire sync command, register tool, extend extension API

**Connected sync module to both user-facing surfaces — `/issues sync` command with interactive preview/confirm flow and `gsd_issues_sync` LLM-callable tool with structured result reporting.**

## What Happened

Extended `ExtensionAPI` in `src/index.ts` with `registerTool(name, definition)`, `exec: ExecFn`, and `events: { emit }`. Added `ToolResult` and `ToolDefinition` types matching the pi extension contract.

Created `src/commands/sync.ts` with `handleSync` — loads config, resolves milestone from config or GSD state, reads roadmap, parses slices, computes unmapped set, shows preview with slice IDs/titles, asks `ctx.ui.confirm("Create N issues?")`, runs `syncSlicesToIssues`, reports results via `ctx.ui.notify`.

Registered `gsd_issues_sync` tool at extension load time using `pi.registerTool()` with the TypeBox schema from sync.ts. Tool execute function runs the full sync pipeline without confirmation (LLM-driven) and returns structured `ToolResult` with text summary and SyncResult details.

Replaced the sync stub in the index.ts switch statement with dynamic import of `handleSync`.

## Verification

- `npx vitest run src/commands/__tests__/sync.test.ts` — 11 tests pass (happy path, decline, nothing-to-do, config error, GitLab/GitHub provider instantiation, preview content, error reporting, tool registration schema, tool execute success, tool nothing-to-sync)
- `npx vitest run` — 136 tests pass across 9 test files (all S01 + S02 + S03)
- `npx tsc --noEmit` — zero type errors
- All slice-level verification checks pass (this is the final task of S03)

## Diagnostics

- **Command path:** `ctx.ui.notify` shows preview before confirm, reports results with created/skipped/error counts. Error-containing results use `"warning"` level.
- **Tool path:** `ToolResult.content[0].text` has human-readable summary. `ToolResult.details` contains full `SyncResult` object for structured inspection.
- **Both paths:** `gsd-issues:sync-complete` event emitted via `pi.events.emit` with `{ milestone, created, skipped, errors }` payload.
- **Config errors:** Surface as `ctx.ui.notify("error")` in command mode, thrown in tool mode.

## Deviations

None.

## Known Issues

- `createProvider()` is duplicated between `src/index.ts` (tool) and `src/commands/sync.ts` (command) — trivial factory, not worth extracting yet (D023).

## Files Created/Modified

- `src/index.ts` — Extended ExtensionAPI types, added tool registration, replaced sync stub, added imports
- `src/commands/sync.ts` — New: handleSync with preview/confirm/sync flow
- `src/commands/__tests__/sync.test.ts` — New: 11 tests covering command and tool paths
- `.gsd/milestones/M001/slices/S03/tasks/T03-PLAN.md` — Added Observability Impact section (pre-flight fix)
- `.gsd/DECISIONS.md` — Appended D022 (tool skips confirmation), D023 (provider factory at call site)
