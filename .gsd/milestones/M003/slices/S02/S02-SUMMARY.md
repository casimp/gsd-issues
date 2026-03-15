---
id: S02
parent: M003
milestone: M003
provides:
  - AutoPhase type union (import|plan|validate-size|split|sync|execute|pr|done)
  - AutoState interface with phase, milestoneId, splitAttempts, startedAt
  - AutoDeps interface with full dependency injection for testability
  - Lock file helpers: writeAutoLock, readAutoLock, clearAutoLock, isGSDAutoActive
  - State persistence: writeAutoState, readAutoState for .gsd/issues-auto.json
  - Phase prompt builders for all 7 LLM-facing phases (validate-size is internal)
  - startAuto() with mutual exclusion, lock/state init, first phase dispatch
  - advancePhase() with concurrent-dispatch guard, 500ms settle delay, phase transitions, split retry
  - stopAuto() cleans up lock and state
  - isAutoActive() for agent_end handler check
  - handleAuto() command handler with config validation, milestone resolution, stashed context
  - buildAutoDeps() constructs real AutoDeps from pi APIs and command context
  - gsd_issues_auto LLM-callable tool with TypeBox schema
  - agent_end handler with isAutoActive guard for auto-flow phase advancement
  - "auto" subcommand registered in SUBCOMMANDS with switch/case routing
  - ExtensionAPI extended with sendMessage() and on()
  - ExtensionCommandContext extended with waitForIdle() and newSession()
  - ExtensionContext minimal interface for lifecycle hooks
requires:
  - slice: S01
    provides: validateMilestoneSize(), Config with max_slices_per_milestone and sizing_mode fields, loadConfig()
affects:
  - S03 (README documentation of the auto-flow)
key_files:
  - src/lib/auto.ts
  - src/lib/__tests__/auto.test.ts
  - src/commands/auto.ts
  - src/commands/__tests__/auto.test.ts
  - src/index.ts
key_decisions:
  - D041 — AutoDeps interface uses full dependency injection for complete test isolation
  - D042 — Separate lock files for mutual exclusion (issues-auto.lock / auto.lock) with PID liveness checks
  - D043 — Stashed cmdCtx pattern for agent_end (newSession only on ExtensionCommandContext)
  - D044 — Split retry max 3 attempts in strict mode
  - D045 — ExtensionAPI.on() re-added for agent_end (supersedes D035 removal)
patterns_established:
  - Phase-based state machine with disk-persisted state and injected dependencies
  - _handlingAdvance boolean guard against concurrent dispatch
  - Command handler stashes context in module scope for reuse by event handlers
  - agent_end handler constructs deps from stashed context rather than storing deps directly
observability_surfaces:
  - gsd-issues:auto-phase event emitted on each phase transition with { phase, milestoneId }
  - .gsd/issues-auto.json tracks current phase, milestoneId, splitAttempts, startedAt
  - .gsd/issues-auto.lock tracks PID and phase for crash detection
  - startAuto returns error string on mutual exclusion block
  - handleAuto errors surface via ctx.ui.notify("error")
  - getStashedContext() returns null when inactive, non-null when active
drill_down_paths:
  - .gsd/milestones/M003/slices/S02/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S02/tasks/T02-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-14T20:53:00Z
---

# S02: Auto-Flow Orchestration

**Phase-based orchestration state machine driving full milestone lifecycle via pi.sendMessage/newSession, with mutual exclusion, split retry, and 43 tests.**

## What Happened

T01 built the core orchestration module (`src/lib/auto.ts`) — a state machine that transitions through `import → plan → validate-size → [split → re-validate] → sync → execute → pr → done`. All external dependencies (sendMessage, newSession, waitForIdle, validateMilestoneSize, file I/O) are injected via `AutoDeps` for full test isolation. Lock files provide mutual exclusion against GSD auto-mode (reads `.gsd/auto.lock`) and self (writes `.gsd/issues-auto.lock`), both with PID liveness checks for crash recovery. State persists to `.gsd/issues-auto.json`. `validate-size` is handled inline (no LLM turn); when oversized, strict mode retries split up to 3 times, best_try warns and proceeds. Extended `ExtensionAPI` with `sendMessage()`/`on()` and `ExtensionCommandContext` with `waitForIdle()`/`newSession()`. 26 unit tests.

T02 wired everything into the extension: `handleAuto()` command handler validates config, resolves milestone from args/config/GSD state, stashes `{ctx, pi}` in module scope for `agent_end` reuse, builds `AutoDeps` from real APIs. Registered `auto` subcommand, `gsd_issues_auto` tool with TypeBox schema, and `pi.on("agent_end", ...)` handler with `isAutoActive` guard. Fixed 5 existing test files that needed `sendMessage`/`on`/`waitForIdle`/`newSession` added to mock helpers after T01's type extensions. Fixed close.test.ts `tool_result hook removal` assertion (was checking absence of `on` which is now a real API method). 17 integration tests.

## Verification

- `npx vitest run src/lib/__tests__/auto.test.ts` — 26 unit tests pass (phase transitions, split retry strict/best_try, mutual exclusion, lock/state round-trip, newSession cancellation, prompt construction, settle delay, concurrent dispatch guard, done phase cleanup)
- `npx vitest run src/commands/__tests__/auto.test.ts` — 17 integration tests pass (command starts orchestration, agent_end advances phases, mutual exclusion blocks with message, newSession cancellation stops cleanly, inactive auto no-ops, tool wiring, subcommand registration)
- `npx vitest run` — 309 tests pass (266 pre-S02 + 43 new), zero regressions
- Observability: `gsd-issues:auto-phase` event emissions verified in tests, lock/state file writes verified via filesystem reads in test assertions

## Requirements Advanced

- R021 — `/issues auto` orchestration now implemented: state machine, command, tool, agent_end handler, mutual exclusion, split retry

## Requirements Validated

- R021 — Contract-level proof: 43 tests cover phase transitions (all 8 phases), split retry (strict 3x, best_try warn), mutual exclusion (GSD lock, own stale lock, PID liveness), lock/state persistence, newSession cancellation, concurrent dispatch guard, prompt construction, command wiring, agent_end handler, tool registration. Runtime UAT deferred to S03/human testing.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Added `ExtensionContext` as a minimal interface (not explicitly in T01 plan step 1, but described in plan body). Needed for type completeness since `agent_end` handlers receive it, not `ExtensionCommandContext`.
- Fixed 5 existing test files (sync, close, import, pr, setup) to include new API methods in mock helpers — unplanned but required after T01's type extensions.
- Fixed close.test.ts `tool_result hook removal` assertion — was incorrectly checking `"on" in pi` is false, which broke when `on` became a real API method. Changed to verify no `tool_result` handler registered.

## Known Limitations

- Real end-to-end testing with actual pi.sendMessage/newSession not covered — all pi APIs are mocked. Runtime UAT is deferred to human testing.
- `/issues status` remains stubbed (out of scope for this milestone).
- No automatic integration with `/gsd auto` workflow — mutual exclusion blocks concurrent use but doesn't provide a unified command.

## Follow-ups

- S03: README documentation needs to cover the auto-flow with a mermaid diagram including the new orchestration phases, strict/best_try behavior, and split retry.
- Runtime UAT: Run `/issues auto` on a real project to validate the full lifecycle with actual pi APIs.

## Files Created/Modified

- `src/lib/auto.ts` — new: orchestration state machine with all exports (startAuto, advancePhase, stopAuto, isAutoActive, lock/state helpers, prompt builders)
- `src/lib/__tests__/auto.test.ts` — new: 26 unit tests covering all transitions and edge cases
- `src/commands/auto.ts` — new: command handler with stashed context, milestone resolution, AutoDeps construction
- `src/commands/__tests__/auto.test.ts` — new: 17 integration tests (command, agent_end, tool, subcommand)
- `src/index.ts` — modified: extended type declarations, auto subcommand, agent_end handler, gsd_issues_auto tool
- `src/commands/__tests__/sync.test.ts` — modified: added sendMessage/on/waitForIdle/newSession to test helpers
- `src/commands/__tests__/close.test.ts` — modified: same helper updates + fixed tool_result hook test
- `src/commands/__tests__/import.test.ts` — modified: same helper updates
- `src/commands/__tests__/pr.test.ts` — modified: same helper updates
- `src/commands/__tests__/setup.test.ts` — modified: added waitForIdle/newSession to makeCtx

## Forward Intelligence

### What the next slice should know
- The auto-flow is fully wired but only proven with mocked pi APIs. S03's README should document the flow accurately but note that runtime UAT is pending.
- The extension now registers 5 tools (sync, close, import, pr, auto) and 6 subcommands (setup, sync, import, close, pr, auto, status — status stubbed).
- Prompt builders in `src/lib/auto.ts` (lines ~200-360) contain the exact prompts sent to the LLM for each phase — these should inform the README's workflow description.

### What's fragile
- The stashed context pattern (module-scope `_stashedCtx`) — if pi's lifecycle changes how commands vs events receive context, this coupling breaks. It's the same pattern GSD auto uses, so it should be stable.
- The 500ms settle delay is a hardcoded constant — if disk I/O latency changes significantly, phase reads could race.

### Authoritative diagnostics
- `npx vitest run` (309 tests, zero regressions) — the single source of truth for contract verification
- `.gsd/issues-auto.json` at runtime — shows exact phase, milestone, and split attempt count
- `gsd-issues:auto-phase` events — the runtime signal for phase monitoring

### What assumptions changed
- Expected ~15 unit tests for T01 — delivered 26 (more edge cases than anticipated)
- Expected the existing test suite to pass after type extensions — 5 test files needed mock helper updates (predictable but not in the plan)
