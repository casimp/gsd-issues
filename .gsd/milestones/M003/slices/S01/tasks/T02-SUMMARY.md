---
id: T02
parent: S01
milestone: M003
provides:
  - "SizingResult type and validateMilestoneSize() function in src/lib/sizing.ts"
  - "9 unit tests covering normal, edge, and error sizing scenarios"
key_files:
  - src/lib/sizing.ts
  - src/lib/__tests__/sizing.test.ts
key_decisions:
  - "When no limit is configured, sliceCount is returned as 0 (roadmap not read) rather than reading the roadmap unnecessarily — avoids I/O when validation is skipped"
patterns_established:
  - "Sizing result always includes all fields (valid, sliceCount, limit, mode, milestoneId) — callers never need to check for missing properties"
  - "Missing roadmap throws with milestone ID and expected path — consistent with existing error patterns in loadConfig"
observability_surfaces:
  - "SizingResult return value — structured result with valid/sliceCount/limit/mode/milestoneId for caller inspection"
  - "Missing roadmap error includes milestone ID and path for grep-ability"
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Implement validateMilestoneSize() with unit tests

**Created `validateMilestoneSize()` with typed `SizingResult` return and 9 unit tests covering all sizing scenarios.**

## What Happened

Created `src/lib/sizing.ts` with a `SizingResult` type and `validateMilestoneSize()` function that composes existing `findRoadmapPath()` and `parseRoadmapSlices()` from state.ts. The function reads the milestone's roadmap, parses slice lines, and compares count against `config.max_slices_per_milestone`. Returns a fully-typed result with `valid`, `sliceCount`, `limit`, `mode`, and `milestoneId`.

Key behaviors:
- No limit configured → returns valid immediately with `limit: undefined`, skips roadmap I/O
- 0 slices in roadmap → valid (planning hasn't happened)
- At limit → valid; over limit → invalid
- Missing roadmap file → throws with milestone ID and expected path
- Mode defaults to `"best_try"` when `config.sizing_mode` is absent

Created 9 tests in `src/lib/__tests__/sizing.test.ts` using temp-dir-based real roadmap files.

## Verification

- `npx vitest run src/lib/__tests__/sizing.test.ts` — 9/9 tests pass
- `npx vitest run` — 266/266 tests pass across 16 files, zero regressions

Slice-level verification status:
- ✅ `npx vitest run src/lib/__tests__/config.test.ts` — passes (from T01)
- ✅ `npx vitest run src/commands/__tests__/setup.test.ts` — passes (from T01)
- ✅ `npx vitest run src/lib/__tests__/sizing.test.ts` — passes
- ✅ `npx vitest run` — full suite green (266 tests)
- ✅ `validateConfig()` returns structured errors for invalid `max_slices_per_milestone` — verified in T01

All slice verification checks pass. This is the final task of the slice.

## Diagnostics

- Call `validateMilestoneSize(cwd, milestoneId, config)` — inspect the `SizingResult` fields to understand exactly what happened
- For "no limit" scenarios: `result.limit === undefined` distinguishes from "under limit" where `result.limit` is a number
- Missing roadmap errors include the milestone ID — grep for "Roadmap not found for milestone" in error output
- `result.mode` always reflects the applied mode, whether from config or default

## Deviations

- Added a 9th test case ("includes milestoneId in the result for caller tracing") beyond the 8 specified — provides explicit coverage that milestoneId passes through correctly for different milestone values.

## Known Issues

None.

## Files Created/Modified

- `src/lib/sizing.ts` — New module with `SizingResult` type and `validateMilestoneSize()` function
- `src/lib/__tests__/sizing.test.ts` — 9 test cases covering no-limit, under/at/over limit, 0 slices, missing roadmap, mode default, mode passthrough, milestoneId tracing
- `.gsd/milestones/M003/slices/S01/tasks/T02-PLAN.md` — Added missing Observability Impact section (pre-flight fix)
