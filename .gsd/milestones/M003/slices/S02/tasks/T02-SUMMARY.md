---
id: T02
parent: S02
milestone: M003
provides:
  - handleAuto() command handler for /issues auto with config validation, milestone resolution, stashed context
  - getStashedContext() / clearStashedContext() for agent_end handler reuse
  - buildAutoDeps() constructs real AutoDeps from pi APIs and command context
  - gsd_issues_auto LLM-callable tool with TypeBox schema
  - agent_end handler with isAutoActive guard for auto-flow phase advancement
  - "auto" subcommand in SUBCOMMANDS array with switch/case routing
key_files:
  - src/commands/auto.ts
  - src/commands/__tests__/auto.test.ts
  - src/index.ts
key_decisions:
  - Tool execute delegates to handleAuto via args string construction rather than duplicating resolution logic
  - agent_end handler uses dynamic imports to avoid circular dependencies and keep the handler lazy
  - Stashed context stored in module scope with explicit getter/setter/clear pattern for testability
  - Fixed existing close.test.ts assertion that checked for absence of pi.on() — now checks no tool_result handler registered
patterns_established:
  - Command handler stashes context in module scope for reuse by event handlers
  - agent_end handler constructs deps from stashed context rather than storing deps directly
observability_surfaces:
  - agent_end handler no-ops silently when isAutoActive returns false (avoids GSD auto interference)
  - All handleAuto errors surface via ctx.ui.notify("error") — config, milestone, mutual exclusion
  - Stashed context is inspectable via getStashedContext() — null when inactive
duration: 20m
verification_result: passed
completed_at: 2026-03-14T20:53:00Z
blocker_discovered: false
---

# T02: Wire command handler, agent_end event, and integration tests

**Wired `/issues auto` command, agent_end event handler, and gsd_issues_auto tool into the extension factory with 17 integration tests.**

## What Happened

Created `src/commands/auto.ts` with:
- `handleAuto()` — validates config, resolves milestone from args/config/GSD state, stashes `{ctx, pi}` in module scope, builds `AutoDeps` from real pi APIs, calls `startAuto()`, reports errors via notify
- `getStashedContext()` / `clearStashedContext()` — module-scope getter/clear for agent_end handler
- `buildAutoDeps()` — constructs `AutoDeps` from `ExtensionCommandContext` and `ExtensionAPI`
- `hasUI` guard to prevent auto-flow in non-interactive sessions

Wired into `src/index.ts`:
- Added `"auto"` to `SUBCOMMANDS` array
- Added `case "auto"` in command switch routing to `handleAuto`
- Registered `gsd_issues_auto` tool with TypeBox schema (`milestone_id` optional param)
- Registered `pi.on("agent_end", ...)` handler with `isAutoActive` guard — constructs deps from stashed context and delegates to `advancePhase()`
- Updated descriptions and usage messages to include "auto"

Fixed pre-existing test failures:
- Updated test helpers in sync, close, import, pr, setup test files to include `sendMessage`, `on`, `waitForIdle`, `newSession` after T01's API extensions
- Fixed close.test.ts `tool_result hook removal` test — was checking `"on" in pi` is false, which is wrong now that `on` is a real API method. Changed to verify no `tool_result` handler is registered via `on`.

## Verification

- `npx vitest run src/commands/__tests__/auto.test.ts` — 17 tests pass
- `npx vitest run` — 309 tests pass (292 after T01 + 17 new), zero regressions
- `grep "auto" src/index.ts` — shows subcommand registration, agent_end handler, tool registration

### Slice-level verification status (final task):
- ✅ `npx vitest run src/lib/__tests__/auto.test.ts` — 26 state machine unit tests pass
- ✅ `npx vitest run src/commands/__tests__/auto.test.ts` — 17 integration tests pass
- ✅ `npx vitest run` — 309 tests, zero regressions

## Diagnostics

- `getStashedContext()` returns null when auto hasn't been started, non-null when active
- `handleAuto` errors include: config validation failures, milestone resolution, mutual exclusion blocks — all via `ctx.ui.notify("error")`
- agent_end handler is completely transparent when auto is inactive (returns immediately)
- Same lock/state file surfaces from T01 apply: `.gsd/issues-auto.json`, `.gsd/issues-auto.lock`

## Deviations

- Fixed existing test helpers across 5 test files (sync, close, import, pr, setup) to include `sendMessage`/`on`/`waitForIdle`/`newSession` — these were missing after T01's type extensions.
- Fixed close.test.ts `tool_result hook removal` assertion — was checking for absence of `on` property which is now a real API method.
- Config validation requires `milestone` field, so tests for "milestone from args but not config" and "milestone from GSD state" were adjusted to use valid configs.

## Known Issues

None.

## Files Created/Modified

- `src/commands/auto.ts` — new: command handler with stashed context, milestone resolution, AutoDeps construction
- `src/commands/__tests__/auto.test.ts` — new: 17 integration tests (command, agent_end, subcommand, tool)
- `src/index.ts` — modified: auto subcommand, agent_end handler, gsd_issues_auto tool registration
- `src/commands/__tests__/sync.test.ts` — modified: added sendMessage/on/waitForIdle/newSession to test helpers
- `src/commands/__tests__/close.test.ts` — modified: same helper updates + fixed tool_result hook test
- `src/commands/__tests__/import.test.ts` — modified: same helper updates
- `src/commands/__tests__/pr.test.ts` — modified: same helper updates
- `src/commands/__tests__/setup.test.ts` — modified: added waitForIdle/newSession to makeCtx
