# S02: Auto-Flow Orchestration — Research

**Date:** 2026-03-14

## Summary

S02 must implement `/issues auto` — a single command that orchestrates the full milestone lifecycle (import → plan → validate size → split → create issues → execute → PR) using pi's `sendMessage()` and `ctx.newSession()` APIs. This is the highest-risk slice in M003 because gsd-issues has never driven sessions — it has only registered passive commands and tools.

The research confirms the approach is viable. GSD auto-mode (`~/.gsd/agent/extensions/gsd/auto.ts`, 3463 lines) provides a comprehensive reference implementation for the `newSession() → sendMessage() → agent_end` cycle. The pi extension API types are fully documented in `@gsd/pi-coding-agent` and expose everything needed: `ExtensionCommandContext.newSession()`, `ExtensionCommandContext.waitForIdle()`, and `ExtensionAPI.sendMessage()`. The gsd-issues `ExtensionAPI` interface in `src/index.ts` needs extending to include `sendMessage`, `on`, and the `ExtensionCommandContext` needs `waitForIdle` and `newSession`.

The primary risk is testing orchestration logic that depends on pi runtime APIs. The approach: extract the orchestration state machine into a pure-function module (`src/lib/auto.ts`) that takes injected dependencies (sendMessage, newSession, waitForIdle, validateMilestoneSize, etc.), making it fully testable with mocks. The actual `/issues auto` command handler in `src/commands/auto.ts` is thin wiring.

## Recommendation

**Build a phase-based orchestration loop with injected dependencies.**

The auto-flow is a sequential state machine, not a concurrent system. Each phase produces a prompt, sends it via `sendMessage`, waits for the agent to finish (via `agent_end` hook), then advances to the next phase. Phases: `import → plan → validate-size → [split → re-validate] → sync → execute → pr → done`.

Key design choices:
1. **Injected dependencies** — `sendMessage`, `newSession`, `waitForIdle`, file I/O, provider creation are all passed in. Tests mock them freely.
2. **State tracked on disk** — The auto-flow writes its current phase to `.gsd/issues-auto.json` (separate from GSD's `auto.lock`). On crash recovery, it reads this file and resumes.
3. **Mutual exclusion via `.gsd/auto.lock`** — Before starting, check if GSD auto-mode's lock file exists. If it does and the process is alive, block. gsd-issues writes its own lock too.
4. **`agent_end` as the advancement hook** — Register `pi.on("agent_end", handler)` to advance the state machine after each LLM turn completes.
5. **Phase prompts are plain strings** — Each phase constructs a prompt telling the LLM what to do (e.g., "Import issues from the tracker and plan milestone M001 with a max of 5 slices"). No GSD-WORKFLOW.md injection — the LLM already has it from its system prompt.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Slice count validation | `validateMilestoneSize()` from S01 | Already tested, returns typed `SizingResult` |
| Roadmap parsing | `parseRoadmapSlices()` from state.ts | Battle-tested regex, used by sync too |
| Provider creation | `createProvider()` from provider-factory.ts | Used by 5+ consumers, handles both providers |
| Issue sync | `syncMilestoneToIssue()` from sync.ts | Crash-safe, epic assignment, all tested |
| PR creation | `createMilestonePR()` from pr.ts | Push + PR + `Closes #N` handling |
| Config loading | `loadConfig()` from config.ts | Validation included |
| Lock file pattern | `.gsd/auto.lock` (GSD auto-mode) | Well-proven pattern for mutual exclusion + crash recovery |

## Existing Code and Patterns

- `~/.gsd/agent/extensions/gsd/auto.ts` — **Reference implementation** for session orchestration. Key patterns:
  - `cmdCtx.newSession()` returns `{ cancelled: boolean }` — must check and stop if cancelled
  - `pi.sendMessage({ customType, content, display }, { triggerTurn: true })` injects a prompt and triggers an LLM turn
  - `pi.on("agent_end", handler)` is the advancement hook — fires after each LLM turn
  - `_handlingAgentEnd` guard prevents concurrent dispatch (multiple events fire)
  - Lock file written AFTER `newSession()` to capture session file path
  - 500ms delay after `agent_end` to let files settle before reading disk state
- `src/index.ts` — Extension factory. Current `ExtensionAPI` interface is minimal (registerCommand, registerTool, exec, events). Needs: `sendMessage`, `on`. `ExtensionCommandContext` needs: `waitForIdle`, `newSession`.
- `src/lib/sizing.ts` — `validateMilestoneSize(cwd, milestoneId, config)` → `SizingResult`. `result.valid === false` means over-limit. `result.mode` determines block vs warn.
- `src/lib/sync.ts` — `syncMilestoneToIssue()` creates the tracker issue. Already handles crash-safe map writes.
- `src/lib/pr.ts` — `createMilestonePR()` pushes branch and creates PR with `Closes #N`.
- `src/lib/import.ts` — `importIssues()` formats tracker issues as markdown. `rescopeIssues()` handles re-scope flow.
- `src/commands/setup.ts` — Interactive setup wizard. Pattern to follow for any new interactive command.
- `~/.gsd/agent/extensions/gsd/crash-recovery.ts` — Lock file pattern: `writeLock()` / `clearLock()` / `readCrashLock()` / `isLockProcessAlive()`. gsd-issues should check for `.gsd/auto.lock` (GSD's lock) and write `.gsd/issues-auto.lock` (its own lock).

## Constraints

- **Cannot import from GSD core** — gsd-issues is a separate npm package. Cannot call `isAutoActive()` or import types from `@gsd/pi-coding-agent`. Must detect GSD auto state via file system (`.gsd/auto.lock`).
- **ExtensionAPI interface must be extended locally** — `sendMessage()`, `on()` need to be added to gsd-issues' local type declarations in `src/index.ts`. These are already available on pi's real API object at runtime.
- **`ctx.newSession()` is only on `ExtensionCommandContext`** — Only available in command handlers (`/issues auto`), not in event handlers. The `agent_end` handler receives `ExtensionContext` (no `newSession`). GSD auto solves this by stashing `cmdCtx` from the initial command call.
- **266 existing tests must continue passing** — No regressions allowed. New functionality needs its own test file(s).
- **`agent_end` fires on ALL agent turns** — Including ones not triggered by gsd-issues. The handler must check whether gsd-issues auto is actually active before advancing.
- **sendMessage `triggerTurn: true` queues a turn** — It doesn't block. The LLM processes it asynchronously. The extension sees completion via the `agent_end` event.

## Common Pitfalls

- **Concurrent `agent_end` handling** — Multiple events can fire before the first handler finishes (every `await` yields). GSD auto uses a `_handlingAgentEnd` boolean guard. gsd-issues must do the same.
- **Stashing `cmdCtx` for later use** — `newSession()` is only on `ExtensionCommandContext`. The initial `/issues auto` call must stash the `ctx` reference for use in the `agent_end` handler's dispatch loop. GSD auto does exactly this (`let cmdCtx: ExtensionCommandContext | null = null`).
- **newSession cancellation** — `cmdCtx.newSession()` can return `{ cancelled: true }` if the user aborts. Must handle gracefully.
- **Split quality depends on prompt engineering** — The split prompt must include the full roadmap content plus clear instructions about where to cut. The LLM decides — gsd-issues just validates the result and retries in strict mode if still oversized.
- **File settle delay** — After `agent_end`, files may not be fully flushed to disk. GSD auto waits 500ms. gsd-issues should follow the same pattern before reading disk state.
- **Lock file cleanup on crash** — If gsd-issues crashes, the lock file persists. On next start, check `isLockProcessAlive(pid)` to distinguish crash from concurrent run.

## Open Risks

- **Split retry loop** — In strict mode, if the agent fails to split satisfactorily after N attempts, the auto-flow must give up gracefully. Need a max retry count (2-3 attempts) and clear error messaging.
- **Prompt quality** — The split prompt is novel and unproven. The LLM must understand: (a) the current roadmap is oversized, (b) it needs to restructure into multiple milestones each ≤ max_slices, (c) the restructuring must preserve all work items. Getting this right may require iteration.
- **Execution phase is the hardest to test** — The `execute` phase delegates to GSD's own planning/execution flow. Testing requires carefully staged disk state (CONTEXT.md, ROADMAP.md, etc.) and verification that the right prompts are sent.
- **Event handler registration order** — If both GSD auto and gsd-issues auto register `agent_end` handlers, both fire on every agent turn. gsd-issues must be a no-op when its auto is not active, and must never interfere with GSD auto's handler.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extensions | `zenobi-us/dotfiles@creating-pi-extensions` (26 installs) | available |
| pi extensions | `scientiacapital/skills@extension-authoring` (23 installs) | available |

These skills cover general extension authoring patterns but this work is specific enough that the pi extension type definitions (already examined in research) provide better guidance than generic skills.

## Sources

- pi extension API types — full interface definitions at `/home/casimp/.nvm/versions/node/v20.20.0/lib/node_modules/gsd-pi/packages/pi-coding-agent/dist/core/extensions/types.d.ts`
- GSD auto-mode implementation — reference orchestration at `~/.gsd/agent/extensions/gsd/auto.ts` (3463 lines)
- GSD crash recovery — lock file pattern at `~/.gsd/agent/extensions/gsd/crash-recovery.ts`
- S01 summary — sizing validation API at `.gsd/milestones/M003/slices/S01/S01-SUMMARY.md`
- sendMessage signature: `pi.sendMessage<T>(message: { customType, content, display, details }, options?: { triggerTurn?: boolean, deliverAs?: "steer" | "followUp" | "nextTurn" }): void`
- newSession signature: `ctx.newSession(options?: { parentSession?: string, setup?: (sm) => Promise<void> }): Promise<{ cancelled: boolean }>`
- waitForIdle signature: `ctx.waitForIdle(): Promise<void>`
- agent_end event: `pi.on("agent_end", async (event: AgentEndEvent, ctx: ExtensionContext) => { ... })` — note: receives `ExtensionContext`, not `ExtensionCommandContext`
