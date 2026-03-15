---
id: S01
parent: M003
milestone: M003
provides:
  - Config interface with max_slices_per_milestone and sizing_mode fields
  - Validation rules rejecting bad types/values for new config fields
  - Setup wizard prompts collecting max_slices (default 5) and sizing_mode (default best_try)
  - Summary output displaying new fields
  - validateMilestoneSize() function returning typed SizingResult
  - SizingResult type with valid, sliceCount, limit, mode, milestoneId fields
requires:
  - slice: none
    provides: first slice — no dependencies
affects:
  - S02
key_files:
  - src/lib/config.ts
  - src/lib/sizing.ts
  - src/commands/setup.ts
  - src/lib/__tests__/config.test.ts
  - src/lib/__tests__/sizing.test.ts
  - src/commands/__tests__/setup.test.ts
key_decisions:
  - max_slices_per_milestone and sizing_mode always written to config (not conditional on empty) — avoids ambiguity between "not set" and "default"
  - validateMilestoneSize does its own file I/O rather than taking content as param — matches sync.ts pattern, gives S02 a single-call API
  - sizing_mode defaults to best_try when absent — strict is opt-in
  - No limit configured skips roadmap I/O entirely — avoids unnecessary file reads
patterns_established:
  - Positive integer validation: type check → Number.isInteger → ≥1
  - Enum validation via direct equality (consistent with existing provider/close_reason)
  - SizingResult always has all fields populated — callers never check for missing properties
  - Missing roadmap throws with milestone ID and path for grep-ability
observability_surfaces:
  - validateConfig() returns structured {valid, errors[]} with descriptive messages including field name, expected type, actual value
  - Setup wizard Step 8 summary notification includes max_slices_per_milestone and sizing_mode
  - SizingResult return value — structured result with valid/sliceCount/limit/mode/milestoneId for caller inspection
  - Missing roadmap error includes milestone ID and path
drill_down_paths:
  - .gsd/milestones/M003/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M003/slices/S01/tasks/T02-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-14
---

# S01: Config, Setup, and Sizing Validation

**Extended config schema with milestone sizing fields, setup wizard collection, and `validateMilestoneSize()` function — all proven by 24 new tests across 3 test files.**

## What Happened

**T01** added `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` to the `Config` interface with validation rules in `validateConfig()`. The setup wizard got two new prompts after labels collection: an input for max slices (default "5") and a select for sizing mode (default best_try). Both values are always written to config. Step 8 summary displays both fields. 15 new config tests and 2 new setup tests added, plus 10 existing setup tests updated for the new prompt mocks.

**T02** created `src/lib/sizing.ts` with a `SizingResult` type and `validateMilestoneSize()` function. It composes existing `findRoadmapPath()` and `parseRoadmapSlices()` from state.ts. When no limit is configured, it returns valid immediately without reading the roadmap. When a limit exists, it reads the roadmap, counts slices, and compares. Mode defaults to "best_try" when absent. Missing roadmap throws with milestone ID and path. 9 tests cover all sizing scenarios using temp-dir-based real roadmap files.

## Verification

- `npx vitest run src/lib/__tests__/config.test.ts` — 37 tests pass (15 new)
- `npx vitest run src/commands/__tests__/setup.test.ts` — 13 tests pass (2 new, 10 updated)
- `npx vitest run src/lib/__tests__/sizing.test.ts` — 9 tests pass
- `npx vitest run` — 266 tests pass across 16 files, zero regressions
- Failure-path diagnostics verified: `validateConfig()` returns `{valid: false, errors: [...]}` with descriptive messages for all invalid field variants

## Requirements Advanced

- R002 — Extended config schema with `max_slices_per_milestone` and `sizing_mode` fields, validation, and setup wizard collection
- R018 — Config and setup surface for milestone sizing established; validation rules proven by tests
- R019 — `validateMilestoneSize()` correctly identifies oversized milestones, proven by 9 unit tests

## Requirements Validated

- none — R018 and R019 need S02's orchestration integration to be fully validated

## New Requirements Surfaced

- R018 (Milestone sizing config) — `/issues setup` collects max_slices and sizing_mode, persists to config
- R019 (Milestone size validation) — After planning, extension validates slice count against configured limit

## Requirements Invalidated or Re-scoped

- none

## Deviations

- T02 added a 9th test case ("includes milestoneId in the result for caller tracing") beyond the 8 originally planned — provides explicit tracing coverage.

## Known Limitations

- `validateMilestoneSize()` reads roadmap files from disk — no pure-function variant for contexts where content is already in memory.
- Sizing validation only counts slices in the roadmap — it doesn't assess slice complexity or estimated effort.

## Follow-ups

- none — S02 consumes these artifacts directly.

## Files Created/Modified

- `src/lib/config.ts` — Added max_slices_per_milestone and sizing_mode to Config interface, added validation rules
- `src/commands/setup.ts` — Added two prompts in Step 5, included new fields in config assembly and summary
- `src/lib/sizing.ts` — New module with SizingResult type and validateMilestoneSize() function
- `src/lib/__tests__/config.test.ts` — 15 new validation tests
- `src/commands/__tests__/setup.test.ts` — 2 new tests, 10 updated
- `src/lib/__tests__/sizing.test.ts` — 9 new test cases

## Forward Intelligence

### What the next slice should know
- `validateMilestoneSize(cwd, milestoneId, config)` is the single-call API — returns a fully-typed `SizingResult` with all fields always populated
- `result.limit === undefined` means no limit configured (validation skipped); `result.valid === false` means over-limit
- `result.mode` reflects the applied mode (from config or default "best_try") — S02 should use this to decide block vs warn behavior
- Setup always writes both fields to config with defaults (5 / best_try), so `config.max_slices_per_milestone` will be present for any config created via setup

### What's fragile
- `validateMilestoneSize()` depends on `findRoadmapPath()` and `parseRoadmapSlices()` from state.ts — if the roadmap format changes, the regex in parseRoadmapSlices will silently return 0 slices (treated as "planning hasn't happened")

### Authoritative diagnostics
- `npx vitest run src/lib/__tests__/sizing.test.ts` — 9 tests covering all sizing scenarios, fast temp-dir-based
- `validateConfig({max_slices_per_milestone: -1})` — returns structured error with field name and actual value

### What assumptions changed
- No assumptions changed — implementation matched plan closely
