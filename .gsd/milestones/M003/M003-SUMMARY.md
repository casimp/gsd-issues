---
id: M003
provides:
  - Config fields max_slices_per_milestone and sizing_mode with validation and setup wizard collection
  - validateMilestoneSize() single-call API returning typed SizingResult
  - Phase-based auto-flow state machine (import → plan → validate-size → [split] → sync → execute → pr → done)
  - /issues auto command and gsd_issues_auto LLM-callable tool
  - Mutual exclusion with GSD auto-mode via separate lock files with PID liveness checks
  - State persistence (.gsd/issues-auto.json) and lock files (.gsd/issues-auto.lock) for crash recovery
  - agent_end handler advancing orchestration phases via stashed command context
  - Split retry logic (strict mode 3x, best_try warns and proceeds)
  - README documenting full workflow with mermaid diagram covering manual and auto paths
key_decisions:
  - D038 — validateMilestoneSize does its own file I/O (single-call API for callers)
  - D039 — sizing_mode defaults to best_try (strict is opt-in)
  - D040 — Sizing fields always written to config (no ambiguity between "not set" and "default")
  - D041 — AutoDeps interface for full dependency injection (zero direct pi/fs imports in auto.ts)
  - D042 — Separate lock files for mutual exclusion (filesystem-based, no shared memory)
  - D043 — Stashed cmdCtx pattern for agent_end (newSession only on ExtensionCommandContext)
  - D044 — Split retry max 3 attempts in strict mode
  - D045 — ExtensionAPI.on() re-added for agent_end (supersedes D035)
patterns_established:
  - Phase-based state machine with disk-persisted state and injected dependencies
  - Concurrent dispatch guard (_handlingAdvance boolean) preventing re-entrant phase transitions
  - Module-scope stashed context for event handlers that need richer context than the event provides
  - Positive integer validation pattern (type check → Number.isInteger → ≥1)
  - SizingResult always fully populated — callers never check for missing properties
observability_surfaces:
  - gsd-issues:auto-phase event emitted on each phase transition with { phase, milestoneId }
  - .gsd/issues-auto.json tracks current phase, milestoneId, splitAttempts, startedAt
  - .gsd/issues-auto.lock tracks PID and phase for crash detection
  - validateConfig() returns structured {valid, errors[]} with descriptive messages for sizing fields
  - SizingResult return value with valid/sliceCount/limit/mode/milestoneId for caller inspection
requirement_outcomes:
  - id: R018
    from_status: active
    to_status: validated
    proof: Config interface extended with both fields, validateConfig() rejects invalid values (15 tests), setup wizard collects with defaults (13 setup tests), validateMilestoneSize() consumes config fields in orchestration (9 sizing tests). 309 tests total.
  - id: R019
    from_status: active
    to_status: validated
    proof: validateMilestoneSize() returns typed SizingResult covering no-limit skip, under/at/over limit, 0 slices, missing roadmap (9 tests). Integrated into auto-flow validate-size phase — oversized triggers split in strict, warn in best_try (3 orchestration tests).
  - id: R021
    from_status: active
    to_status: validated
    proof: 43 orchestration tests cover all 8 phases, split retry (strict 3x, best_try warn), mutual exclusion (GSD lock, own stale lock, PID liveness), lock/state persistence, newSession cancellation, concurrent dispatch guard, prompt construction, command/tool/agent_end wiring. README documents the flow with mermaid diagram (S03 grep checks pass).
duration: 90m
verification_result: passed
completed_at: 2026-03-14
---

# M003: Milestone Sizing and Auto-Flow Orchestration

**Sizing constraint enforcement and phase-based orchestration state machine driving full milestone lifecycle via pi.sendMessage/newSession — 43 new orchestration tests, 309 total, zero regressions.**

## What Happened

Three slices built incrementally toward a single-command milestone lifecycle.

**S01** extended the config schema with `max_slices_per_milestone` (positive integer, default 5) and `sizing_mode` ("strict" | "best_try", default best_try). The setup wizard got two new prompts after labels collection. `validateMilestoneSize()` in `src/lib/sizing.ts` composes existing `findRoadmapPath()` and `parseRoadmapSlices()` to return a fully-typed `SizingResult` — no limit skips roadmap I/O entirely, otherwise reads/counts/compares. 24 new tests across 3 files.

**S02** built the orchestration core — a state machine in `src/lib/auto.ts` that transitions through `import → plan → validate-size → [split → re-validate] → sync → execute → pr → done`. All external dependencies injected via `AutoDeps` for full test isolation. Lock files provide mutual exclusion against GSD auto-mode (reads `.gsd/auto.lock`) and self (writes `.gsd/issues-auto.lock`), both with PID liveness checks for crash recovery. The `validate-size` phase is handled inline (no LLM turn); when oversized, strict mode retries split up to 3 times, best_try warns and proceeds. `handleAuto()` command handler validates config, resolves milestone, stashes context for `agent_end` reuse. Registered `/issues auto` subcommand, `gsd_issues_auto` tool, and `agent_end` handler. 43 new tests.

**S03** rewrote the README with auto-flow documentation — mermaid diagram showing both manual and auto paths, sizing config examples, updated tool/command/event counts. All content cross-checked against source.

The slices connected cleanly: S01's `validateMilestoneSize()` consumed directly by S02's validate-size phase, S02's orchestration documented by S03's README. No cross-slice integration issues.

## Cross-Slice Verification

| Success Criterion | Evidence |
|---|---|
| `/issues setup` collects `max_slices_per_milestone` and `mode`, persists to config | 15 config validation tests + 13 setup tests pass. Fields always written with defaults (D040). |
| After planning, gsd-issues validates slice count against configured limit | `validateMilestoneSize()` returns typed SizingResult — 9 sizing tests cover all scenarios (no limit, under, at, over, 0 slices, missing roadmap). |
| Oversized milestones trigger agent-driven split | S02 tests: "validate-size with oversized milestone triggers split in strict mode", "best_try mode warns and proceeds to sync on oversized". Split prompts constructed and verified. |
| `/issues auto` drives full lifecycle via pi.sendMessage and ctx.newSession | "transitions through happy path: import→plan→validate-size→sync→execute→pr→done" test passes. Command handler, tool, agent_end handler all wired. 43 orchestration tests. |
| Strict mode blocks, best_try warns | "strict mode errors after max split attempts" (3x retry then error), "best_try mode warns and proceeds to sync on oversized" — both tests pass. |
| README documents workflow with mermaid diagram | S03 grep checks: gsd_issues_auto, max_slices_per_milestone ×3, sizing_mode ×3, auto-phase, /issues auto ×5, "Five tools", "status stubbed" all present. Mermaid syntax balanced (3 subgraph / 3 end). |

Full suite: `npx vitest run` — 309 tests across 18 files, zero regressions.

## Requirement Changes

- R018: active → validated — Config extended with max_slices_per_milestone and sizing_mode, validation rejects bad values (15 tests), setup wizard collects with defaults (13 tests), fields consumed by orchestration validate-size phase
- R019: active → validated — validateMilestoneSize() returns typed SizingResult (9 tests), integrated into auto-flow state machine with split retry on oversized
- R021: active → validated — 43 orchestration tests cover phase transitions, split retry, mutual exclusion, lock/state persistence, command/tool/agent_end wiring. README documents the flow.

## Forward Intelligence

### What the next milestone should know
- The extension now has 309 contract tests but zero runtime UAT against real GitHub/GitLab remotes — that's the primary validation gap across M001–M003
- `/issues auto` orchestration is proven at the contract level (mocked pi APIs) but has never driven a real session — first real use will likely surface prompt quality issues and timing assumptions
- The extension registers 5 tools (sync, close, import, pr, auto), 7 subcommands (setup, sync, import, close, pr, auto, status — status stubbed), and emits 5 event types
- `parseRoadmapSlices()` uses a regex that silently returns 0 slices if roadmap format changes — sizing validation would treat this as "planning hasn't happened" rather than an error

### What's fragile
- The stashed context pattern (module-scope `_stashedCtx`) couples command handler lifetime to event handler lifetime — if pi's lifecycle changes how commands vs events receive context, this breaks
- The 500ms settle delay in `advancePhase()` is a hardcoded constant — disk I/O latency variance could cause phase reads to race
- `parseRoadmapSlices()` regex — silent 0-count on format changes, not a hard failure

### Authoritative diagnostics
- `npx vitest run` (309 tests) — single source of truth for contract verification
- `.gsd/issues-auto.json` at runtime — shows exact phase, milestone, and split attempt count
- `gsd-issues:auto-phase` events — runtime signal for phase monitoring
- `validateConfig({max_slices_per_milestone: -1})` — returns structured error with field name and actual value

### What assumptions changed
- Expected ~15 unit tests for auto.ts — delivered 26 (more edge cases than anticipated)
- Expected existing test suite to pass after ExtensionAPI type extensions — 5 test files needed mock helper updates (predictable but not planned)
- The stashed context pattern (D043) was adopted directly from GSD auto — worked cleanly without adaptation

## Files Created/Modified

- `src/lib/config.ts` — Added max_slices_per_milestone and sizing_mode to Config interface and validation
- `src/commands/setup.ts` — Added two setup wizard prompts for sizing fields, included in summary
- `src/lib/sizing.ts` — New module: SizingResult type and validateMilestoneSize() function
- `src/lib/__tests__/config.test.ts` — 15 new validation tests for sizing fields
- `src/commands/__tests__/setup.test.ts` — 2 new tests, 10 updated for new prompt mocks
- `src/lib/__tests__/sizing.test.ts` — 9 new test cases
- `src/lib/auto.ts` — New module: orchestration state machine with all exports
- `src/lib/__tests__/auto.test.ts` — 26 unit tests for phase transitions and edge cases
- `src/commands/auto.ts` — New: command handler with stashed context, milestone resolution, AutoDeps
- `src/commands/__tests__/auto.test.ts` — 17 integration tests
- `src/index.ts` — Extended type declarations, auto subcommand, agent_end handler, gsd_issues_auto tool
- `src/commands/__tests__/sync.test.ts` — Mock helper updates for new API methods
- `src/commands/__tests__/close.test.ts` — Mock helper updates + fixed tool_result hook test assertion
- `src/commands/__tests__/import.test.ts` — Mock helper updates
- `src/commands/__tests__/pr.test.ts` — Mock helper updates
- `README.md` — Full rewrite with auto-flow documentation, mermaid diagram, updated counts
