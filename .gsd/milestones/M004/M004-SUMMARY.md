---
id: M004
provides:
  - Smart entry flow — `/issues` and `/issues auto` work without a pre-existing milestone ID
  - Scope phase — LLM creates right-sized milestones from work description or imported issues
  - agent_end hooks — auto-sync on ROADMAP.md creation, auto-PR on SUMMARY.md completion
  - `/issues scope` subcommand for standalone scoping
  - config.milestone optional — setup wizard allows skipping
  - auto_pr config field for controlling automatic PR creation
  - M003 orchestration state machine fully removed (~3000 lines)
key_decisions:
  - D046: Remove M003 orchestration state machine entirely — thin hooks over GSD, not parallel state machine
  - D047: `/issues` as smart entry mirroring GSD's showSmartEntry() pattern
  - D048: Hooks not orchestration for post-milestone actions (agent_end + filesystem artifacts)
  - D049: config.milestone becomes optional
  - D050: auto_pr defaults to true
  - D051: Module-scoped auto flag for agent_end chaining
  - D052: Scope completion via CONTEXT.md diffing
patterns_established:
  - Module-level state with explicit getter/clearer for cross-module coordination (auto flag, hook sets)
  - agent_end hooks that react to GSD filesystem artifacts (CONTEXT.md, ROADMAP.md, SUMMARY.md)
  - Set-based idempotency for hook dedup (synced/PR'd milestone sets)
  - Scope prompt with structured markdown sections and conditional inclusion of sizing/import context
observability_surfaces:
  - "gsd-issues:scope-complete event with { milestoneIds, count }"
  - "gsd-issues:auto-start event with { milestoneIds, trigger }"
  - "gsd-issues:auto-sync event with { milestoneId }"
  - "gsd-issues:auto-pr event with { milestoneId }"
  - "isAutoRequested(), isHooksEnabled(), isSynced(id), isPrd(id) for runtime state inspection"
  - "console.error with milestone ID context on hook failures"
requirement_outcomes:
  - id: R021
    from_status: active
    to_status: validated
    proof: "Smart entry → scope → GSD auto chain (17 S01 tests). agent_end hooks auto-sync on ROADMAP.md and auto-PR on SUMMARY.md (10 S02 tests). Full lifecycle proven: scope → plan → sync → execute → PR. 324 tests total."
  - id: R022
    from_status: active
    to_status: validated
    proof: "buildScopePrompt() constructs structured prompt with optional sizing/import context (21 tests). Completion detection via CONTEXT.md diffing in agent_end handler (3 tests). gsd-issues:scope-complete event emitted."
  - id: R023
    from_status: active
    to_status: validated
    proof: "/issues scope subcommand routes to handleSmartEntry(), appears in argument completions. 2 tests."
  - id: R024
    from_status: active
    to_status: validated
    proof: "agent_end hooks auto-sync on ROADMAP.md detection, auto-PR on SUMMARY.md detection. Both idempotent via set-based dedup. 10 hook tests. Combined with S01's scope→auto chain, multi-milestone loop proven."
  - id: R025
    from_status: active
    to_status: validated
    proof: "config.milestone optional (D049), smart entry detects state and routes accordingly. 17 tests cover all entry paths."
  - id: R026
    from_status: active
    to_status: validated
    proof: "Resume via GSD state (active milestone) and via existing milestones on disk. 3 tests cover resume paths."
duration: ~110m
verification_result: passed
completed_at: 2026-03-14
---

# M004: Start From Work, Not Milestones

**Removed the M003 orchestration state machine and replaced it with smart entry, a scope phase, and agent_end hooks — users now start from work, not milestone IDs.**

## What Happened

**S01 cleared the decks and built the foundation.** Deleted ~3000 lines of M003 orchestration code (state machine, auto command, lock files, split retry) and replaced the entry point with a smart entry flow that mirrors GSD's own `showSmartEntry()` pattern. Created three core primitives: `scanMilestones()` reads `.gsd/milestones/` for directories with CONTEXT.md files, `buildScopePrompt()` constructs structured LLM instructions with optional sizing/import context, and `detectNewMilestones()` computes set difference for completion detection. Wired `/issues` as a contextual entry point (detect state → offer choices → dispatch scope prompt) and `/issues auto` as the one-command lifecycle driver (scope → `/gsd auto` via module-scoped flag and agent_end chaining). Made `config.milestone` optional so setup doesn't require a pre-existing milestone.

**S02 extended agent_end with auto-sync and auto-PR hooks, added `/issues scope`, and rewrote the README.** The agent_end handler now reacts to GSD's filesystem artifacts: when ROADMAP.md appears in a milestone directory that isn't mapped in ISSUE-MAP.json, it auto-syncs; when SUMMARY.md appears in a mapped milestone with `auto_pr !== false`, it creates a PR. Both hooks are idempotent (set-based dedup), non-blocking (errors logged, never thrown), and gated on a `_hooksEnabled` flag set only during `/issues auto`. Added `auto_pr` config field. Routed `/issues scope` to `handleSmartEntry()` for standalone scoping. Rewrote README from scratch documenting three entry points with zero references to milestone IDs as user input.

## Cross-Slice Verification

| Success Criterion | Evidence |
|---|---|
| `/issues auto` with no milestone starts scope phase | `handleAutoEntry()` in issues.ts: no milestones → sets auto flag, runs smart entry, agent_end chains to `/gsd auto` after scope (17 tests) |
| `/issues auto` with active milestone resumes | `handleAutoEntry()` resume path: existing milestones → skip scope, emit `gsd-issues:auto-start` with `trigger: "resume"`, send `/gsd auto` directly (3 tests) |
| After scoping, detects created milestone and transitions to plan | agent_end handler in index.ts: pre-scope snapshot diffed against post-scope scan, new CONTEXT.md files trigger `gsd-issues:scope-complete` and chain to `/gsd auto` (3 tests) |
| Scope prompt includes imports and max_slices constraint | `buildScopePrompt()`: `importContext` included as structured section (line 107-115), `maxSlices` included as sizing constraint (line 74). 21 smart-entry tests. |
| `/issues scope` runs independently | index.ts line 453: `case "scope"` routes to `handleSmartEntry()`, appears in SUBCOMMANDS completions (2 tests) |
| Multi-milestone: auto-flow processes each through sync→PR | agent_end hooks: auto-sync on ROADMAP.md detection (unmapped → syncMilestoneToIssue), auto-PR on SUMMARY.md detection (mapped + complete → createMilestonePR). Both idempotent. 10 hook tests. |
| All tests pass | 324 tests pass across 18 test files. `tsc --noEmit` clean. |
| README documents three entry points without milestone IDs as user input | README lines 11-15: "Start fresh", "Start from existing issues", "Resume". `grep -c "milestone ID" README.md` returns 0. |

Import prompt verified: old "assess the scope for this milestone" phrasing absent (`grep` returns 0). New phrasing: "Use them as context for scoping the milestone" in smart-entry.ts.

## Requirement Changes

- R021: active → validated — Auto-flow re-scoped from parallel state machine to thin layer over GSD auto-mode. 324 tests total prove scope → plan → sync → execute → PR lifecycle.
- R022: active → validated — Scope phase proven by contract tests: prompt construction, completion detection, event emission.
- R023: active → validated — `/issues scope` subcommand routes to handleSmartEntry(), 2 tests.
- R024: active → validated — Multi-milestone sequencing via agent_end hooks with set-based idempotency, 10 tests.
- R025: active → validated — config.milestone optional, smart entry handles all entry paths, 17 tests.
- R026: active → validated — Resume via GSD state and via existing milestones, 3 tests.

## Forward Intelligence

### What the next milestone should know
- The extension is feature-complete for all defined requirements (R001-R026, minus deferred R017/R020). No active requirements remain unmapped.
- The architecture is now a thin event-driven layer over GSD: `/issues auto` dispatches `/gsd auto` via sendMessage, and agent_end hooks react to GSD's filesystem artifacts. There is no parallel orchestration.
- All four LLM-callable tools (sync, close, import, pr) use TypeBox schemas and the single-arg registerTool API (D028).

### What's fragile
- Module-level state (`_autoRequested`, `_hooksEnabled`, `_syncedMilestones`, `_prdMilestones`, `_preScopeMilestones`) — all rely on the extension staying loaded for the duration of a flow. If pi reloads extensions mid-flow, state is lost.
- Dynamic imports in agent_end (sync, PR, provider-factory) — import errors surface at runtime, not startup. Tests cover happy paths but unusual module resolution issues would only appear in production.
- Scope prompt quality is untested at runtime — validated only by contract tests with mocked pi APIs. First real `/issues` run is the actual UAT.

### Authoritative diagnostics
- `scanMilestones(cwd)` — ground truth for what milestones exist on disk
- `isAutoRequested()`, `isHooksEnabled()`, `isSynced(id)`, `isPrd(id)` — module-level state getters for debugging stuck flows
- `gsd-issues:scope-complete`, `gsd-issues:auto-sync`, `gsd-issues:auto-pr` events — grep pi event logs for lifecycle tracing

### What assumptions changed
- Originally planned to extend M003's state machine with a scope phase — ended up deleting the state machine entirely (D046). The orchestration was duplicating what GSD already does; hooks are simpler and more reliable.
- Originally planned `AutoState.milestoneIds: string[]` for multi-milestone — instead used agent_end hooks that process milestones independently on each LLM turn, which is simpler and naturally handles any number of milestones without loop state.

## Files Created/Modified

- `src/lib/auto.ts` — deleted (M003 state machine, ~600 lines)
- `src/lib/__tests__/auto.test.ts` — deleted (26 state machine tests)
- `src/commands/auto.ts` — deleted (auto command handler, ~160 lines)
- `src/commands/__tests__/auto.test.ts` — deleted (17 auto command tests)
- `src/lib/smart-entry.ts` — new: scanMilestones, buildScopePrompt, detectNewMilestones
- `src/lib/__tests__/smart-entry.test.ts` — new: 21 tests
- `src/commands/issues.ts` — new: handleSmartEntry, handleAutoEntry, hook state management
- `src/commands/__tests__/issues.test.ts` — new: 29 tests (smart entry + scope + auto + hooks)
- `src/index.ts` — removed auto tool/handler; added smart entry routing, scope completion detection, auto-sync/PR hooks
- `src/lib/config.ts` — milestone optional, auto_pr field, validation updates
- `src/lib/__tests__/config.test.ts` — updated/added optional milestone and auto_pr tests
- `src/commands/setup.ts` — milestone skip option
- `src/commands/__tests__/setup.test.ts` — added skip-milestone tests
- `README.md` — complete rewrite for post-M004 architecture
