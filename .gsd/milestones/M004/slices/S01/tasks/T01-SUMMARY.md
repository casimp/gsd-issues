---
id: T01
parent: S01
milestone: M004
provides:
  - M003 orchestration fully removed from codebase
  - config.milestone is optional in Config type and validateConfig()
  - setup wizard supports skipping milestone selection
key_files:
  - src/index.ts
  - src/lib/config.ts
  - src/commands/setup.ts
  - src/lib/__tests__/config.test.ts
  - src/commands/__tests__/setup.test.ts
key_decisions:
  - Milestone skip uses "__skip__" sentinel value in ui.select, converted to undefined before config assembly
  - Kept "auto" in SUBCOMMANDS list and usage/error strings so T03 can re-wire without touching those
patterns_established:
  - Optional config fields follow same validation pattern: check type only when key is present in object
observability_surfaces:
  - validateConfig() surfaces all errors in one thrown message — milestone absence no longer appears in error list
  - Config summary in setup shows "(not set)" when milestone is skipped
duration: 25m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Remove M003 orchestration and make config.milestone optional

**Deleted ~3000 lines of orchestration code and tests, made milestone optional in config schema and setup wizard.**

## What Happened

1. Deleted `src/lib/auto.ts`, `src/lib/__tests__/auto.test.ts`, `src/commands/auto.ts`, `src/commands/__tests__/auto.test.ts` — the M003 state machine and its tests.
2. Cleaned `src/index.ts`: removed `gsd_issues_auto` tool registration, orchestration `agent_end` handler, `case "auto"` in command switch, and updated module docstring. Kept "auto" in SUBCOMMANDS for T03 re-wiring.
3. Made `Config.milestone` optional (`milestone?: string`) and updated `validateConfig()` to treat milestone as optional — only checks type when present.
4. Updated setup wizard: milestone select includes a "(skip — no milestone)" option; empty milestone list prompt allows empty input to skip; config assembly uses conditional spread; summary shows "(not set)" for missing milestone.
5. Updated existing config tests that expected "Missing required field: milestone" — replaced with tests for optional milestone acceptance. Added tests: config without milestone validates, config with milestone validates, round-trip without milestone works. Added setup tests: skip via select sentinel, skip via empty input on empty milestone list.

## Verification

- `npx vitest run` — 270 tests pass across 16 test files
- `grep -r 'auto\.ts\|auto\.js\|gsd_issues_auto\|isAutoActive\|advancePhase\|startAuto\|AutoDeps\|AutoPhase\|AutoState' src/ --include='*.ts'` — zero hits (clean removal)
- `npx vitest run -- --grep "config"` — all config tests pass including new optional milestone tests
- Deleted files confirmed absent from filesystem

### Slice-level verification status (T01 is intermediate — partial pass expected)

- ✅ `npx vitest run` — all tests pass
- ⏳ `src/lib/__tests__/smart-entry.test.ts` — T02
- ✅ `src/lib/__tests__/config.test.ts` — existing + new optional milestone tests pass
- ⏳ `src/commands/__tests__/issues.test.ts` — T02/T03
- ✅ Config validation errors list specific field names; milestone absence produces no error

## Diagnostics

- `validateConfig()` error messages list all invalid fields with expected vs actual types — a future agent can inspect these to understand why a config is rejected.
- Setup wizard summary displays "(not set)" for skipped milestone — visible in the TUI after running `/issues setup`.
- No auto-related signals remain (`gsd-issues:auto-phase` events, `isAutoActive` guard). These will be replaced by smart entry signals in T02.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/auto.ts` — deleted (M003 state machine)
- `src/lib/__tests__/auto.test.ts` — deleted (state machine tests)
- `src/commands/auto.ts` — deleted (auto command handler)
- `src/commands/__tests__/auto.test.ts` — deleted (auto command tests)
- `src/index.ts` — removed auto tool registration, agent_end handler, auto case in switch, updated docstring
- `src/lib/config.ts` — milestone field optional, validation updated
- `src/lib/__tests__/config.test.ts` — updated "missing milestone" test → optional milestone tests, added round-trip test
- `src/commands/setup.ts` — milestone skip option in select, empty input handling, conditional config assembly, summary display
- `src/commands/__tests__/setup.test.ts` — added skip-milestone-via-select and skip-milestone-via-empty-input tests
- `.gsd/milestones/M004/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
- `.gsd/milestones/M004/slices/S01/S01-PLAN.md` — added diagnostic verification step (pre-flight fix)
