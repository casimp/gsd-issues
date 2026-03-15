# S02: Auto-Flow Orchestration

**Goal:** `/issues auto` drives the full milestone lifecycle — import, plan, size-check, split, create issues, execute, PR — using pi.sendMessage and ctx.newSession, with mutual exclusion against GSD auto-mode.
**Demo:** Integration tests prove the orchestration state machine transitions through all phases correctly, handles oversized milestones (split + retry in strict mode), respects strict/best_try behavior, and blocks when GSD auto is already running.

## Must-Haves

- Phase-based state machine: `import → plan → validate-size → [split → re-validate] → sync → execute → pr → done`
- Injected dependencies for full testability (sendMessage, newSession, waitForIdle, validateMilestoneSize, file I/O)
- `agent_end` handler with concurrent-dispatch guard (same pattern as GSD auto's `_handlingAgentEnd`)
- Mutual exclusion: check `.gsd/auto.lock` before starting, write `.gsd/issues-auto.lock` during run, clean up on stop/crash
- Lock file crash recovery: detect stale locks via PID check
- Split prompt construction with full roadmap content and clear instructions
- Strict mode: block and retry split up to 3 times if still oversized; best_try mode: warn and proceed
- 500ms settle delay after `agent_end` before reading disk state
- `newSession()` cancellation handling (graceful stop)
- Phase state persisted to `.gsd/issues-auto.json` for crash recovery
- Extended `ExtensionAPI` with `sendMessage`, `on`; extended `ExtensionCommandContext` with `waitForIdle`, `newSession`
- `/issues auto` command registered with `auto` added to subcommand completions
- `gsd-issues:auto-phase` event emitted on phase transitions
- All 266 existing tests continue passing

## Proof Level

- This slice proves: integration (orchestration state machine driven by mocked pi APIs)
- Real runtime required: no (pi APIs mocked — real end-to-end is UAT in S03)
- Human/UAT required: no (deferred to S03/UAT)

## Verification

- `npx vitest run src/lib/__tests__/auto.test.ts` — state machine unit tests pass: phase transitions, split retry, strict/best_try, lock management, prompt construction
- `npx vitest run src/commands/__tests__/auto.test.ts` — integration tests pass: command wiring, agent_end handler, mutual exclusion, newSession cancellation
- `npx vitest run` — all tests pass (266 existing + new), zero regressions

## Observability / Diagnostics

- Runtime signals: `gsd-issues:auto-phase` event emitted on each phase transition with `{ phase, milestoneId }` payload
- Inspection surfaces: `.gsd/issues-auto.json` on disk shows current phase, milestone, timestamp; `.gsd/issues-auto.lock` shows PID and phase
- Failure visibility: lock file persists on crash with PID and last phase; `SizingResult` from validate-size phase includes sliceCount/limit/mode for caller inspection; split retry count tracked in state
- Redaction constraints: none (no secrets in auto-flow)

## Integration Closure

- Upstream surfaces consumed: `validateMilestoneSize()` from `src/lib/sizing.ts` (S01), `loadConfig()` from `src/lib/config.ts`, `syncMilestoneToIssue()` from `src/lib/sync.ts`, `createMilestonePR()` from `src/lib/pr.ts`, `importIssues()` from `src/lib/import.ts`
- New wiring introduced in this slice: `pi.on("agent_end", ...)` event registration, `/issues auto` command, `pi.sendMessage()` calls from orchestration loop, `ctx.newSession()` for fresh sessions
- What remains before the milestone is truly usable end-to-end: README documentation (S03), real end-to-end UAT run

## Tasks

- [x] **T01: Build orchestration state machine with lock management and unit tests** `est:2h`
  - Why: The state machine is the core of S02 — all phases, transitions, prompt construction, split retry, mutual exclusion, and crash recovery live here. Tests prove it works with injected mocks before any wiring.
  - Files: `src/lib/auto.ts`, `src/lib/__tests__/auto.test.ts`, `src/index.ts`
  - Do: (1) Extend `ExtensionAPI` with `sendMessage()` and `on()` methods, extend `ExtensionCommandContext` with `waitForIdle()` and `newSession()`. (2) Create `src/lib/auto.ts` with: `AutoPhase` enum (`import | plan | validate-size | split | sync | execute | pr | done`), `AutoState` interface (phase, milestoneId, splitAttempts, startedAt), `AutoDeps` interface for all injected dependencies (sendMessage, newSession, waitForIdle, validateMilestoneSize, loadConfig, emit, readFile, writeFile, existsSync, unlinkSync). (3) Implement `startAuto(milestoneId, deps)` that checks mutual exclusion (GSD auto.lock + own lock via PID), writes own lock, calls newSession, sends first phase prompt. (4) Implement `advancePhase(deps)` — the `agent_end` handler body: reads state from disk, builds the next phase's prompt, calls newSession + sendMessage. Includes `_handlingAgentEnd` guard, 500ms settle delay. (5) Implement `stopAuto(deps)` — clears lock, clears state. (6) Phase prompt builders for each phase. (7) Split logic: when validate-size returns `valid: false`, construct split prompt with full roadmap content; in strict mode retry up to 3 times, in best_try warn and proceed. (8) Lock file helpers: `writeAutoLock()`, `readAutoLock()`, `clearAutoLock()`, `isGSDAutoActive()`. (9) Unit tests in `src/lib/__tests__/auto.test.ts` covering: phase transitions through all phases, split retry in strict mode, best_try warn-and-proceed, mutual exclusion detection, lock file write/read/clear, newSession cancellation stops flow, prompt construction includes milestone context, 500ms settle delay. All deps mocked.
  - Verify: `npx vitest run src/lib/__tests__/auto.test.ts` passes all tests; `npx vitest run` shows zero regressions
  - Done when: `src/lib/auto.ts` exports `startAuto`, `advancePhase`, `stopAuto`, `isAutoActive` with full phase coverage proven by ≥15 unit tests

- [x] **T02: Wire command handler, agent_end event, and integration tests** `est:1.5h`
  - Why: The orchestration module needs to be connected to pi's extension API — command registration, event handler, and tool. Integration tests prove the full wiring works.
  - Files: `src/commands/auto.ts`, `src/commands/__tests__/auto.test.ts`, `src/index.ts`
  - Do: (1) Create `src/commands/auto.ts` with `handleAuto(args, ctx, pi)` — validates config exists, resolves milestone, stashes cmdCtx for agent_end reuse, calls `startAuto()` with real dependencies wired. (2) Add `auto` to SUBCOMMANDS array and switch/case in `src/index.ts`. (3) Register `pi.on("agent_end", handler)` in the extension factory — handler checks `isAutoActive()` before calling `advancePhase()`, no-ops when inactive. (4) Register `gsd_issues_auto` tool with `milestone_id` param. (5) Integration tests in `src/commands/__tests__/auto.test.ts`: mock pi API (sendMessage, on, newSession, waitForIdle, exec), verify command starts orchestration, verify agent_end handler advances phases, verify mutual exclusion blocks with message, verify newSession cancellation stops cleanly, verify inactive auto no-ops in agent_end.
  - Verify: `npx vitest run src/commands/__tests__/auto.test.ts` passes; `npx vitest run` shows zero regressions with all 266+ existing tests passing
  - Done when: `/issues auto` is registered, `agent_end` handler wired, all integration tests pass, existing 266 tests still pass

## Files Likely Touched

- `src/lib/auto.ts` — new: orchestration state machine, phase transitions, lock management, prompt builders
- `src/lib/__tests__/auto.test.ts` — new: unit tests for state machine
- `src/commands/auto.ts` — new: command handler wiring
- `src/commands/__tests__/auto.test.ts` — new: integration tests
- `src/index.ts` — extended types, auto subcommand, agent_end registration, tool registration
