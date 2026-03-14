---
estimated_steps: 4
estimated_files: 3
---

# T02: Wire /issues import command and gsd_issues_import tool

**Slice:** S05 — Import Workflow
**Milestone:** M001

## Description

Create the `/issues import` command handler and register the `gsd_issues_import` LLM-callable tool. Both follow established patterns from sync/close — load config, resolve milestone, create provider, build filter from args, call `importIssues()`, return formatted markdown. The command handler parses `--milestone` and `--labels` flags; the tool accepts them as typed params. Replace the stub in index.ts's switch case.

## Steps

1. Create `src/commands/import.ts` with `handleImport()` following the close.ts pattern: parse `--milestone` and `--labels` flags from args string, load config, resolve milestone from args/config/GSD state, create provider, build `IssueFilter` with `state: "open"` default, call `importIssues()`, send result markdown via `ctx.ui.notify`. Handle empty results and errors with appropriate notifications.
2. In `src/index.ts`: register `gsd_issues_import` tool with TypeBox schema (`milestone?: string`, `labels?: string[]`). Execute loads config, resolves milestone, creates provider, calls `importIssues()`, returns markdown as `ToolResult`. Replace the `case "import"` stub with dynamic import of `handleImport`.
3. Create `src/commands/__tests__/import.test.ts` — test command handler with mock provider/config: happy path returns markdown, empty list notification, config error handling, flag parsing for milestone/labels. Test tool registration path via direct function call pattern.
4. Run full test suite to confirm zero regressions.

## Must-Haves

- [ ] `/issues import` command calls `importIssues()` and reports result via `ctx.ui.notify`
- [ ] Command parses `--milestone` and `--labels` flags from args
- [ ] `gsd_issues_import` tool registered with TypeBox schema
- [ ] Tool returns formatted markdown as `ToolResult`
- [ ] Import stub in index.ts switch replaced with real handler
- [ ] `gsd-issues:import-complete` event emitted through both paths
- [ ] Full test suite passes with zero regressions

## Verification

- `npx vitest run src/commands/__tests__/import.test.ts` — all command/tool tests pass
- `npx vitest run` — full suite green (158 + new tests), zero regressions
- `npx tsc --noEmit` — zero errors

## Inputs

- `src/lib/import.ts` — `importIssues()` function and `ImportToolSchema` from T01
- `src/commands/close.ts` — command handler pattern reference
- `src/commands/sync.ts` — `createProvider()` pattern, milestone resolution
- `src/index.ts` — tool registration pattern from `gsd_issues_sync` and `gsd_issues_close`
- `src/commands/__tests__/close.test.ts` — test pattern reference

## Expected Output

- `src/commands/import.ts` — `handleImport()` command handler
- `src/commands/__tests__/import.test.ts` — command and tool tests
- `src/index.ts` — `gsd_issues_import` tool registered, import case wired to real handler

## Observability Impact

- **`gsd-issues:import-complete` event** — emitted through both command and tool paths with `{ issueCount }`. Agents watching the event bus can confirm the pipeline ran and how many issues were fetched.
- **`ctx.ui.notify` (command path)** — sends the full formatted markdown to the user, or a clear empty-list message. The notify level (`info` vs `error`) signals success vs failure.
- **`ToolResult.content` (tool path)** — returns the formatted markdown as text, parseable by LLM callers. `ToolResult.details` carries `{ markdown, issueCount }` for structured inspection.
- **Provider errors** — surface as `ProviderError` with full CLI context through both paths — same observability as sync/close.
- **No new log points** — this is wiring, not new logic. Import-level diagnostics were established in T01.
