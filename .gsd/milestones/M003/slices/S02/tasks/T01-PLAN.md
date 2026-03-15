---
estimated_steps: 9
estimated_files: 3
---

# T01: Build orchestration state machine with lock management and unit tests

**Slice:** S02 — Auto-Flow Orchestration
**Milestone:** M003

## Description

Build the core orchestration module (`src/lib/auto.ts`) that drives the full `/issues auto` lifecycle as a phase-based state machine with injected dependencies. This is the architectural center of S02 — all phase logic, prompt construction, split retry, mutual exclusion, crash recovery, and lock management live here. Unit tests prove every transition with mocked dependencies before any wiring.

Also extend the local `ExtensionAPI` and `ExtensionCommandContext` types in `src/index.ts` to include `sendMessage`, `on`, `waitForIdle`, and `newSession` — these are available on pi's real API object at runtime but missing from gsd-issues' local type declarations.

## Steps

1. **Extend pi API types in `src/index.ts`** — Add `sendMessage()` and `on()` to `ExtensionAPI`. Add `waitForIdle()` and `newSession()` to `ExtensionCommandContext`. Match the signatures from pi's real types. Keep `ExtensionContext` as a minimal interface (no newSession/waitForIdle) since `agent_end` handlers receive it, not `ExtensionCommandContext`.

2. **Define types and interfaces in `src/lib/auto.ts`** — `AutoPhase` type union (`"import" | "plan" | "validate-size" | "split" | "sync" | "execute" | "pr" | "done"`). `AutoState` interface (phase, milestoneId, splitAttempts, startedAt). `AutoDeps` interface with all injected dependencies: sendMessage, newSession, waitForIdle, validateMilestoneSize, loadConfig, emit, plus file I/O (readFile, writeFile, existsSync, unlinkSync) and cwd.

3. **Implement lock file helpers** — `writeAutoLock(cwd, phase, milestoneId)`, `readAutoLock(cwd)`, `clearAutoLock(cwd)`, `isGSDAutoActive(cwd)`. Lock file at `.gsd/issues-auto.lock` with PID, phase, milestoneId, timestamp. GSD auto detection reads `.gsd/auto.lock` and checks PID liveness (same `process.kill(pid, 0)` pattern from crash-recovery.ts).

4. **Implement state persistence** — `writeAutoState(cwd, state)` and `readAutoState(cwd)` for `.gsd/issues-auto.json`. State tracks current phase, milestoneId, splitAttempts, startedAt.

5. **Implement phase prompt builders** — One function per phase that constructs the prompt string. Import phase: tell LLM to import issues and assess scope. Plan phase: tell LLM to plan the milestone with max_slices constraint. Validate-size phase: internal (no LLM call — just runs validateMilestoneSize). Split phase: include full roadmap content, max_slices limit, and clear instructions to restructure. Sync/execute/pr phases: targeted prompts for each workflow step.

6. **Implement `startAuto(milestoneId, deps)`** — Check mutual exclusion (GSD auto.lock exists + PID alive → block; own lock exists + PID alive → block). Write own lock. Write initial state (phase: "import"). Call `deps.newSession()` (handle cancellation). Send import phase prompt via `deps.sendMessage()`. Emit `gsd-issues:auto-phase` event.

7. **Implement `advancePhase(deps)`** — The `agent_end` handler body. `_handlingAdvance` boolean guard against concurrent dispatch. 500ms settle delay (`await new Promise(r => setTimeout(r, 500))`). Read state from disk. Determine next phase. For validate-size: run `validateMilestoneSize()` directly (no LLM turn). If invalid and strict mode: increment splitAttempts, if < 3 go to split phase, else error and stop. If invalid and best_try: warn and proceed to sync. For all LLM phases: call `newSession()` (handle cancellation), send phase prompt, update state on disk. On "done" phase: clear lock, clear state, emit completion event.

8. **Implement `stopAuto(deps)`** — Clear lock file, clear state file, reset `_handlingAdvance` guard. Export `isAutoActive(cwd)` for the agent_end handler to check.

9. **Write unit tests in `src/lib/__tests__/auto.test.ts`** — Create mock `AutoDeps` factory. Test cases: (a) phase transitions through happy path (import→plan→validate-size→sync→execute→pr→done), (b) validate-size with oversized milestone triggers split phase, (c) strict mode retries split up to 3 times then errors, (d) best_try mode warns and proceeds on oversized, (e) mutual exclusion: GSD auto.lock with live PID blocks start, (f) mutual exclusion: stale GSD lock (dead PID) allows start, (g) own stale lock allows start, (h) lock file write/read/clear round-trip, (i) newSession cancellation stops auto, (j) prompt construction includes milestone ID, (k) split prompt includes roadmap content, (l) state persistence round-trip, (m) 500ms settle delay is called, (n) concurrent advancePhase calls are guarded, (o) done phase clears lock and state.

## Must-Haves

- [ ] `ExtensionAPI` extended with `sendMessage()` and `on()` matching pi's real signatures
- [ ] `ExtensionCommandContext` extended with `waitForIdle()` and `newSession()`
- [ ] `AutoPhase`, `AutoState`, `AutoDeps` types exported
- [ ] Lock file helpers: write, read, clear, isGSDAutoActive — all work with PID checks
- [ ] State persistence: write/read `.gsd/issues-auto.json`
- [ ] Phase prompt builders for all 8 phases (validate-size is internal, no prompt needed — 7 prompts total)
- [ ] `startAuto()` with mutual exclusion, lock, state init, first phase dispatch
- [ ] `advancePhase()` with concurrent-dispatch guard, settle delay, phase transitions, split retry logic
- [ ] `stopAuto()` cleans up lock and state
- [ ] ≥15 unit tests covering all transitions, edge cases, and failure modes

## Verification

- `npx vitest run src/lib/__tests__/auto.test.ts` — all tests pass
- `npx vitest run` — 266+ tests pass, zero regressions
- `grep -c "it(" src/lib/__tests__/auto.test.ts` returns ≥15

## Observability Impact

- Signals added: `gsd-issues:auto-phase` event on phase transitions; `.gsd/issues-auto.json` tracks current phase; `.gsd/issues-auto.lock` tracks PID and phase
- How a future agent inspects this: read `.gsd/issues-auto.json` for current phase and milestone; check lock file for crash detection
- Failure state exposed: lock file persists on crash with PID; split retry count in state; startAuto returns error message on mutual exclusion block

## Inputs

- `src/index.ts` — current `ExtensionAPI` and `ExtensionCommandContext` interfaces to extend
- `src/lib/sizing.ts` — `validateMilestoneSize()` signature and `SizingResult` type
- `~/.gsd/agent/extensions/gsd/auto.ts` — reference patterns: `_handlingAgentEnd`, `newSession()` cancellation, `sendMessage()` usage, 500ms settle delay
- `~/.gsd/agent/extensions/gsd/crash-recovery.ts` — lock file pattern: `writeLock`, `clearLock`, `readCrashLock`, `isLockProcessAlive`
- S01 summary — `validateMilestoneSize(cwd, milestoneId, config)` returns `SizingResult` with `.valid`, `.mode`, `.sliceCount`, `.limit`

## Expected Output

- `src/lib/auto.ts` — orchestration state machine module with all exports
- `src/lib/__tests__/auto.test.ts` — ≥15 unit tests proving all phase transitions and edge cases
- `src/index.ts` — extended type declarations (no functional changes to existing code)
