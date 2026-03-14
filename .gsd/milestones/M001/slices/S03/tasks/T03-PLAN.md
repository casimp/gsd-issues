---
estimated_steps: 5
estimated_files: 3
---

# T03: Wire sync command, register tool, extend extension API

**Slice:** S03 — Sync Workflow
**Milestone:** M001

## Description

Connect the sync module to user-facing surfaces: the `/issues sync` slash command and the `gsd_issues_sync` LLM-callable tool. Extend the local ExtensionAPI types to include `registerTool`, `exec`, and `events`. Replace the sync stub in index.ts. The command handler loads config, instantiates the provider, reads the roadmap, shows a preview, asks for confirmation, and runs sync.

## Steps

1. Extend `ExtensionAPI` in `src/index.ts` with: `exec: ExecFn` (matching the signature from types.ts), `events: { emit(event: string, payload: unknown): void }`, and `registerTool(name: string, definition: ToolDefinition): void` where `ToolDefinition` has `description: string`, `parameters: TSchema` (from TypeBox), and `execute(params: unknown, ctx: ExtensionCommandContext): Promise<ToolResult>`. Define `ToolResult` as `{ content: Array<{ type: 'text', text: string }>, details?: unknown }`.
2. Create `src/commands/sync.ts` with `handleSync(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void>`. Flow: load config → read GSD state for milestone → find roadmap path → read roadmap file → parse slices → load existing map → compute unmapped count → if zero unmapped, notify and return → show preview (list unmapped slices with titles) → `ctx.ui.confirm("Create N issues?")` → if declined, notify and return → call `syncSlicesToIssues()` with provider, config, slices, map path, pi.exec, pi.events.emit → report results (created count, skipped count, any errors).
3. Register `gsd_issues_sync` tool in `src/index.ts` using `pi.registerTool()` with the TypeBox schema from sync.ts. The tool's execute function: load config, resolve milestone (from params or GSD state), find roadmap, parse slices, run sync. No confirmation in tool mode (the LLM is acting on user intent). Return structured `ToolResult` with text summary.
4. Replace the `case "sync"` stub in the index.ts switch statement to dynamic-import and call `handleSync`.
5. Write `src/commands/__tests__/sync.test.ts` covering: happy path creates issues after confirmation, user declines aborts with notification, no unmapped slices reports nothing to do, config load failure propagates error, provider instantiation from config type (gitlab → GitLabProvider, github → GitHubProvider), tool registration called with correct schema.

## Must-Haves

- [ ] ExtensionAPI extended with registerTool, exec, events
- [ ] `/issues sync` routes to handleSync (no longer stub)
- [ ] handleSync shows preview and requires confirmation before creating
- [ ] `gsd_issues_sync` tool registered with TypeBox schema
- [ ] Tool execute function runs sync without confirmation (LLM-driven)
- [ ] Both command and tool report results (created, skipped, errors)
- [ ] All prior S01/S02 tests still pass

## Verification

- `npx vitest run src/commands/__tests__/sync.test.ts` — all tests pass
- `npx vitest run` — all tests pass (S01 + S02 + S03)
- `npx tsc --noEmit` — zero type errors

## Inputs

- `src/lib/sync.ts` (from T02) — syncSlicesToIssues, SyncToolSchema, SyncResult
- `src/lib/state.ts` (from T01) — parseRoadmapSlices, readGSDState, findRoadmapPath
- `src/lib/config.ts` — loadConfig, Config
- `src/providers/types.ts` — ExecFn, IssueProvider
- `src/providers/gitlab.ts` — GitLabProvider constructor
- `src/providers/github.ts` — GitHubProvider constructor
- `src/index.ts` — current ExtensionAPI types and command routing

## Observability Impact

- **New signals:** `gsd_issues_sync` tool becomes LLM-callable — future agents can trigger sync via tool interface and inspect structured `ToolResult` with created/skipped/error counts.
- **Inspection:** After sync, check `ToolResult.content[0].text` for summary, `ToolResult.details` for full `SyncResult` object. For the command path, sync results are reported via `ctx.ui.notify`.
- **Failure visibility:** Config load errors surface as `ctx.ui.notify("error")` in command path, thrown errors in tool path. Provider instantiation failures include the provider type that was attempted. The tool path propagates errors to the LLM caller via ToolResult error text.
- **Registration:** `pi.registerTool("gsd_issues_sync", ...)` called at extension load — verify by checking tool availability in the LLM tool list.

## Expected Output

- `src/commands/sync.ts` — handleSync exported, confirmation flow, provider instantiation
- `src/commands/__tests__/sync.test.ts` — 8+ tests covering command and tool paths
- `src/index.ts` — ExtensionAPI extended, tool registered, sync stub replaced
