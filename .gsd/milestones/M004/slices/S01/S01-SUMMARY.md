---
id: S01
parent: M004
milestone: M004
provides:
  - M003 orchestration fully removed (~3000 lines of code and tests deleted)
  - config.milestone optional — setup wizard allows skipping, validateConfig accepts missing milestone
  - Smart entry flow for `/issues` (detect state → offer choices → dispatch scope prompt)
  - Milestone scanner (scanMilestones), scope prompt builder (buildScopePrompt), completion detector (detectNewMilestones)
  - agent_end handler for scope completion detection via CONTEXT.md diffing
  - `/issues auto` wired to smart entry → GSD auto-mode chain with resume shortcut
  - Events: gsd-issues:scope-complete, gsd-issues:auto-start, gsd-issues:auto-dispatch
requires:
  - slice: none
    provides: first slice in M004
affects:
  - S02
key_files:
  - src/lib/smart-entry.ts
  - src/commands/issues.ts
  - src/index.ts
  - src/lib/config.ts
  - src/commands/setup.ts
  - src/lib/__tests__/smart-entry.test.ts
  - src/commands/__tests__/issues.test.ts
key_decisions:
  - D046: Remove M003 orchestration state machine entirely
  - D047: `/issues` as smart entry mirroring GSD's pattern
  - D049: config.milestone becomes optional
  - D051: Module-scoped auto flag for agent_end chaining
  - D052: Scope completion via CONTEXT.md diffing
patterns_established:
  - Module-level state with explicit getter/clearer for cross-module coordination
  - Scope prompt uses structured markdown sections with conditional inclusion
  - Optional config fields validated only when present (same pattern for all optional fields)
observability_surfaces:
  - gsd-issues:scope-complete event with { milestoneIds, count } payload
  - gsd-issues:auto-start event with { milestoneIds, trigger } payload
  - gsd-issues:auto-dispatch customType on sendMessage calls
  - isAutoRequested() / getPreScopeMilestones() for runtime state inspection
  - validateConfig() error messages list all invalid fields with types
drill_down_paths:
  - .gsd/milestones/M004/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T02-SUMMARY.md
  - .gsd/milestones/M004/slices/S01/tasks/T03-SUMMARY.md
duration: 65m
verification_result: passed
completed_at: 2026-03-14
---

# S01: Scope phase and milestone-free entry

**Removed M003 orchestration, built smart entry flow that detects project state, scopes work via LLM, and chains into GSD auto-mode — all without requiring a pre-existing milestone ID.**

## What Happened

**T01 — Cleared the decks.** Deleted `lib/auto.ts`, `commands/auto.ts`, and their test files (~3000 lines). Removed `gsd_issues_auto` tool registration, orchestration `agent_end` handler, and auto case from `index.ts`. Made `Config.milestone` optional with type-only validation when present. Updated setup wizard with a skip option using a `__skip__` sentinel value.

**T02 — Built the smart entry core.** Created `lib/smart-entry.ts` with three functions: `scanMilestones()` reads `.gsd/milestones/` for directories containing `{MID}-CONTEXT.md`; `buildScopePrompt()` constructs structured LLM instructions with optional sizing constraint and import context; `detectNewMilestones()` computes set difference for completion detection. Created `commands/issues.ts` with `handleSmartEntry()` that checks GSD state (active milestone → resume), scans existing milestones (found → offer resume or new), or offers import-from-tracker / start-fresh choice. Wired into `index.ts` with an `agent_end` handler that diffs milestone snapshots and emits `gsd-issues:scope-complete`.

**T03 — Wired `/issues auto`.** Added `handleAutoEntry()` with two paths: existing milestones → skip scope, emit `gsd-issues:auto-start` with `trigger: "resume"`, send `/gsd auto` immediately; no milestones → set auto flag, run smart entry, let `agent_end` chain to `/gsd auto` after scope completes. Auto flag cleared on both success and failure paths.

## Verification

- `npx vitest run` — 308 tests pass across 18 test files (was 309 before M003 deletion, net +38 new tests minus ~43 deleted)
- `npx tsc --noEmit` — clean compilation
- `npx vitest run -- --grep "config"` — all config tests pass, milestone absence produces no error
- `npx vitest run -- --grep "smart-entry"` — 21 tests pass
- `npx vitest run -- --grep "issues command"` — 17 tests pass
- Deleted files confirmed absent from filesystem
- No references to deleted modules (`auto.ts`, `gsd_issues_auto`, `AutoPhase`, etc.)
- Observability events (`scope-complete`, `auto-start`, `auto-dispatch`) verified present in source

## Requirements Advanced

- R021 (Auto-flow orchestration) — M003 orchestration removed and replaced with smart entry → GSD auto chain. The extension no longer reimplements GSD's planning/execution loop.
- R011 (Slash commands) — `/issues` no-subcommand now runs smart entry instead of printing usage hint. `/issues auto` re-wired to smart entry → GSD auto.
- R002 (Config with interactive setup) — `config.milestone` now optional; setup wizard allows skipping milestone selection.

## Requirements Validated

- none — R021 is partially reworked but not fully validated until S02 proves the multi-milestone loop

## New Requirements Surfaced

- R022 (Scope phase) — partially proven: scope prompt construction, completion detection, and state machine path all tested at contract level. Runtime prompt quality remains UAT.
- R023 (/issues scope command) — partially proven: smart entry flow implements the scope path. No standalone `/issues scope` subcommand yet (deferred to S02 or later if needed).
- R025 (No milestone ID at entry) — proven: `/issues` and `/issues auto` both work without a milestone in config or GSD state.
- R026 (Resume still works) — proven: existing milestones detected and resume path dispatches `/gsd auto` directly.

## Requirements Invalidated or Re-scoped

- R021 — re-scoped: the M003 orchestration state machine is deleted. Auto-flow is now a thin layer over GSD's own auto-mode, not a parallel state machine. Previous validation (43 tests) no longer applies.

## Deviations

None.

## Known Limitations

- No standalone `/issues scope` subcommand — scope is accessible only through `/issues` smart entry and `/issues auto`. Can be added as a simple alias if needed.
- Multi-milestone not yet supported — if scope creates multiple milestones, only the first is used. S02 adds the loop.
- Scope prompt quality is untested at runtime — validated only by contract tests with mocked pi APIs. First real `/issues` run is the UAT.

## Follow-ups

- S02 must extend `AutoState` with `milestoneIds: string[]` and loop through all scoped milestones
- S02 should add sync confirmation after scope completion (currently deferred — user prompted but flow continues)

## Files Created/Modified

- `src/lib/auto.ts` — deleted (M003 state machine)
- `src/lib/__tests__/auto.test.ts` — deleted (state machine tests)
- `src/commands/auto.ts` — deleted (auto command handler)
- `src/commands/__tests__/auto.test.ts` — deleted (auto command tests)
- `src/index.ts` — removed auto tool/handler/agent_end hook; added smart entry routing and scope completion agent_end handler
- `src/lib/config.ts` — milestone field optional, validation updated
- `src/lib/__tests__/config.test.ts` — updated/added optional milestone tests
- `src/commands/setup.ts` — milestone skip option, conditional config assembly
- `src/commands/__tests__/setup.test.ts` — added skip-milestone tests
- `src/lib/smart-entry.ts` — new: scanMilestones, buildScopePrompt, detectNewMilestones
- `src/lib/__tests__/smart-entry.test.ts` — new: 21 tests
- `src/commands/issues.ts` — new: handleSmartEntry, handleAutoEntry, auto flag management
- `src/commands/__tests__/issues.test.ts` — new: 17 tests (smart entry + scope detection + auto entry)

## Forward Intelligence

### What the next slice should know
- The `agent_end` handler in `index.ts` already detects new milestones and can chain to `/gsd auto`. S02 needs to extend this to loop through multiple milestones.
- `detectNewMilestones(before, after)` returns a string array — S02 can store all of them in `milestoneIds`.
- The auto flag pattern (`_autoRequested` with getter/clearer) is a simple boolean. S02 may need to extend it with a milestone index for loop state.

### What's fragile
- Module-level state (`_preScopeMilestones`, `_autoRequested`) — relies on the extension staying loaded for the duration of scope + auto. If pi reloads extensions mid-flow, state is lost.
- `agent_end` fires after every LLM turn — the CONTEXT.md diffing must be robust against partial state (LLM creates one file but not another).

### Authoritative diagnostics
- `scanMilestones(cwd)` — ground truth for what milestones exist on disk. If scope seems broken, call this first.
- `isAutoRequested()` — check if auto flag is stuck. Should be `false` when idle.
- `gsd-issues:scope-complete` event — if it fires, the `agent_end` handler successfully detected new milestones.

### What assumptions changed
- Originally planned `detectScopedMilestones(cwd, deps)` with injected deps — actually built as pure functions (`scanMilestones`, `detectNewMilestones`) with no deps injection needed since they only do filesystem reads.
