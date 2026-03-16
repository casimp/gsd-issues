---
id: T02
parent: S01
milestone: M004
provides:
  - Smart entry flow for `/issues` no-subcommand (detect state → offer choices → dispatch)
  - Milestone scanner (scanMilestones), scope prompt builder (buildScopePrompt), completion detector (detectNewMilestones)
  - agent_end handler for scope completion detection via CONTEXT.md presence
  - gsd-issues:scope-complete event with { milestoneIds, count } payload
key_files:
  - src/lib/smart-entry.ts
  - src/commands/issues.ts
  - src/index.ts
  - src/lib/__tests__/smart-entry.test.ts
  - src/commands/__tests__/issues.test.ts
key_decisions:
  - Pre-scope milestone snapshot stored in module-level variable with getter/clearer exports for testability
  - agent_end handler uses dynamic import to avoid circular deps — same lazy pattern as existing command handlers
  - Import path falls back to fresh start on provider failure or zero issues — no dead-end states
  - CONTEXT.md file follows {MID}-CONTEXT.md naming convention (consistent with existing readMilestoneContext)
patterns_established:
  - Module-level state with explicit getter/clearer for cross-module coordination (preScopeMilestones)
  - Scope prompt uses structured markdown sections with conditional inclusion based on options
observability_surfaces:
  - gsd-issues:scope-complete event emitted with { milestoneIds, count } when agent creates new milestones
  - Scope prompt content visible in sendMessage call — inspectable via mock in tests
  - Pre-scope milestone snapshot accessible via getPreScopeMilestones() for debugging
duration: 20m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Build smart entry flow with milestone scanning and scope prompt

**Built `/issues` smart entry: detects project state, offers import-from-tracker or start-fresh, sends scope prompt to LLM via sendMessage, detects completion via agent_end milestone scanning.**

## What Happened

1. Created `src/lib/smart-entry.ts` with three functions: `scanMilestones()` reads `.gsd/milestones/` for dirs containing `{MID}-CONTEXT.md`, `buildScopePrompt()` constructs structured LLM instructions for creating milestones with filesystem paths and optional sizing/import context, `detectNewMilestones()` computes set difference between before/after snapshots.

2. Created `src/lib/__tests__/smart-entry.test.ts` with 21 tests covering: no dir, empty dir, dirs with/without CONTEXT.md, sorted output, file filtering; prompt with/without sizing/import/description; set difference edge cases.

3. Created `src/commands/issues.ts` with `handleSmartEntry()`: loads config gracefully, checks GSD state (active milestone → notify resume), scans existing milestones (found → offer resume or new), no milestones → select "Import from tracker" or "Start fresh". Import path fetches issues via provider and includes as context. Fresh path prompts for description. Both build scope prompt via `buildScopePrompt()` and send via `pi.sendMessage` with `triggerTurn: true`.

4. Wired smart entry into `src/index.ts`: replaced no-subcommand usage hint with `handleSmartEntry()` call. Added `agent_end` handler that snapshots milestones post-turn, compares with pre-scope snapshot, emits `gsd-issues:scope-complete` event when new CONTEXT.md files detected, then clears the one-shot snapshot.

5. Created `src/commands/__tests__/issues.test.ts` with 11 tests: resume via GSD state, resume existing milestone, fresh start with description, cancel on empty description, import without config warning, sizing constraint from config, pre-scope state recording, fall-through from existing to new, agent_end detection of new milestones, agent_end no-op when no scope in progress, agent_end clears state even without new milestones.

## Verification

- `npx vitest run -- --grep "smart-entry"` — 21 tests pass
- `npx vitest run -- --grep "issues command"` — 11 tests pass (issues.test.ts runs in full suite)
- `npx vitest run` — 302 tests pass across 18 test files (was 270 across 16)
- All 8 must-haves verified via tests

### Slice-level verification status (T02 is intermediate)

- ✅ `npx vitest run` — all 302 tests pass
- ✅ `src/lib/__tests__/smart-entry.test.ts` — all tests pass
- ✅ `src/lib/__tests__/config.test.ts` — existing + optional milestone tests pass
- ✅ `src/commands/__tests__/issues.test.ts` — smart entry tests pass
- ✅ Config validation errors list specific field names; milestone absence produces no error
- ⏳ `/issues auto` with smart entry + GSD auto — T03

## Diagnostics

- `gsd-issues:scope-complete` event: listen for `{ milestoneIds, count }` to know when scoping finishes.
- Scope prompt content: inspect `pi.sendMessage` calls — the full prompt is passed as `content` with `customType: "gsd-issues:scope-prompt"`.
- Pre-scope state: call `getPreScopeMilestones()` from `src/commands/issues.ts` to check if a scope is in progress (non-null = active, null = idle).
- Milestone presence: `scanMilestones(cwd)` returns current milestones on disk — no CONTEXT.md means scope didn't complete.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/smart-entry.ts` — new: scanMilestones, buildScopePrompt, detectNewMilestones
- `src/lib/__tests__/smart-entry.test.ts` — new: 21 tests for smart entry functions
- `src/commands/issues.ts` — new: handleSmartEntry command handler with module-level state
- `src/commands/__tests__/issues.test.ts` — new: 11 tests for smart entry command and scope completion
- `src/index.ts` — replaced no-subcommand usage hint with smart entry call; added agent_end handler for scope completion detection
