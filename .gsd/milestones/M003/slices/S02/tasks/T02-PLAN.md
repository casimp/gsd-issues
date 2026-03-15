---
estimated_steps: 5
estimated_files: 3
---

# T02: Wire command handler, agent_end event, and integration tests

**Slice:** S02 — Auto-Flow Orchestration
**Milestone:** M003

## Description

Connect the orchestration state machine from T01 to pi's extension API. Register `/issues auto` as a command, wire the `agent_end` event handler, register the `gsd_issues_auto` LLM-callable tool, and write integration tests that prove the full wiring works with mocked pi APIs.

The command handler is thin — it validates config, resolves the milestone, stashes `cmdCtx` for reuse in `agent_end`, and calls `startAuto()`. The event handler checks `isAutoActive()` and delegates to `advancePhase()`. The tool is a thin wrapper around the command logic.

## Steps

1. **Create `src/commands/auto.ts`** — Export `handleAuto(args: string, ctx: ExtensionCommandContext, pi: ExtensionAPI)`. Guard `ctx.hasUI`. Load config via `loadConfig()`. Resolve milestone from args, config, or GSD state (same pattern as sync/close/pr handlers). Stash `cmdCtx` in module scope for `agent_end` handler reuse. Build real `AutoDeps` from pi APIs (sendMessage from pi.sendMessage, newSession/waitForIdle from ctx, validateMilestoneSize from sizing.ts, loadConfig, emit from pi.events.emit, file I/O from node:fs). Call `startAuto(milestoneId, deps)`. Handle errors with `ctx.ui.notify()`.

2. **Wire into `src/index.ts`** — Add `"auto"` to `SUBCOMMANDS` array. Add `case "auto"` in the switch that imports and calls `handleAuto`. Register `pi.on("agent_end", handler)` in the extension factory — handler imports `isAutoActive` and `advancePhase` from `src/lib/auto.ts`, checks `isAutoActive(cwd)`, and if active calls `advancePhase(deps)` where deps are constructed from the stashed context. The handler must be a no-op when auto is not active (critical: avoids interfering with GSD auto's own agent_end handler). Register `gsd_issues_auto` tool with `milestone_id` optional param — executes same logic as command handler.

3. **Export `getStashedContext()` from `src/commands/auto.ts`** — The `agent_end` handler in index.ts needs the stashed `cmdCtx` to construct deps. Export a getter that returns null when auto hasn't been started. The agent_end handler constructs `AutoDeps` using the stashed context's `newSession`/`waitForIdle` plus `pi.sendMessage`.

4. **Write integration tests in `src/commands/__tests__/auto.test.ts`** — Create a mock pi factory that provides all API methods (registerCommand, registerTool, exec, events, sendMessage, on). Test cases: (a) handleAuto loads config and calls startAuto, (b) handleAuto without config notifies error, (c) handleAuto resolves milestone from args/config/state, (d) agent_end handler no-ops when auto inactive, (e) agent_end handler calls advancePhase when active, (f) mutual exclusion: handleAuto blocks when GSD auto is running (mock auto.lock with live PID), (g) newSession cancellation in handleAuto stops cleanly, (h) auto subcommand appears in completions, (i) tool registration with correct schema.

5. **Run full test suite and verify zero regressions** — `npx vitest run` must show all 266 existing tests plus new tests passing.

## Must-Haves

- [ ] `handleAuto()` exported from `src/commands/auto.ts` with config validation and milestone resolution
- [ ] `cmdCtx` stashed in module scope with `getStashedContext()` getter
- [ ] `"auto"` added to `SUBCOMMANDS` and switch/case routing
- [ ] `pi.on("agent_end", ...)` registered in extension factory with isAutoActive guard
- [ ] `gsd_issues_auto` tool registered with TypeBox schema
- [ ] ≥8 integration tests covering command, event handler, mutual exclusion, and edge cases
- [ ] All 266 existing tests still pass

## Verification

- `npx vitest run src/commands/__tests__/auto.test.ts` — all tests pass
- `npx vitest run` — all tests pass, zero regressions
- `grep "auto" src/index.ts` shows subcommand registration, agent_end handler, and tool registration

## Inputs

- `src/lib/auto.ts` — T01's orchestration module: `startAuto`, `advancePhase`, `stopAuto`, `isAutoActive`, `AutoDeps`
- `src/index.ts` — current extension factory, SUBCOMMANDS, command/tool registration patterns
- `src/commands/sync.ts` — reference pattern for command handler structure (config loading, milestone resolution, pi passing)
- `src/commands/__tests__/sync.test.ts` — reference pattern for command test structure

## Expected Output

- `src/commands/auto.ts` — command handler with stashed context
- `src/commands/__tests__/auto.test.ts` — ≥8 integration tests
- `src/index.ts` — auto subcommand, agent_end handler, auto tool registered

## Observability Impact

- **agent_end handler** no-ops silently when auto is inactive (`isAutoActive` guard). When active, it delegates to `advancePhase()` which emits `gsd-issues:auto-phase` events on each transition.
- **Stashed context** (`getStashedContext()`) returns null when auto hasn't been started — a future agent can inspect this to determine if auto-flow wiring is active.
- **Command handler** reports all errors via `ctx.ui.notify()` with `"error"` level — config validation failures, milestone resolution failures, and mutual exclusion blocks are all visible to the user.
- **Tool registration** (`gsd_issues_auto`) surfaces auto-flow initiation results as structured `ToolResult` for LLM callers.
- No new files or event types — uses the existing `gsd-issues:auto-phase` event from T01 and the existing lock/state file surfaces.
