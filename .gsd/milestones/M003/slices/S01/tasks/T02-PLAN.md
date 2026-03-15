---
estimated_steps: 4
estimated_files: 2
---

# T02: Implement validateMilestoneSize() with unit tests

**Slice:** S01 — Config, Setup, and Sizing Validation
**Milestone:** M003

## Description

Create the sizing validation module that S02's orchestration loop will call to determine whether a milestone exceeds the configured slice limit. The function reads the milestone's roadmap, counts slices via `parseRoadmapSlices()`, and compares against `config.max_slices_per_milestone`. Returns a typed `SizingResult` that tells the caller exactly what happened — valid, oversized, no limit configured, or no slices yet.

## Steps

1. Create `src/lib/sizing.ts` with:
   - `SizingResult` type: `{ valid: boolean, sliceCount: number, limit: number | undefined, mode: "strict" | "best_try", milestoneId: string }`
   - `validateMilestoneSize(cwd: string, milestoneId: string, config: Config): Promise<SizingResult>`
   - Implementation: check `config.max_slices_per_milestone` — if undefined, return valid with limit undefined. Read roadmap via `findRoadmapPath(cwd, milestoneId)` + `readFile()`. Parse with `parseRoadmapSlices()`. Return result with `valid: sliceCount <= limit`, mode from `config.sizing_mode ?? "best_try"`.
2. Handle edge cases: missing roadmap file (throw with clear message including milestone ID), 0 slices (valid — planning hasn't happened), exactly at limit (valid)
3. Create `src/lib/__tests__/sizing.test.ts` with temp-dir-based tests:
   - No limit configured → valid, limit undefined
   - Under limit → valid
   - At limit → valid
   - Over limit → invalid
   - 0 slices → valid, sliceCount 0
   - Missing roadmap file → throws
   - Mode defaults to "best_try" when config.sizing_mode absent
   - Mode passthrough when config.sizing_mode set to "strict"
4. Run full test suite to confirm no regressions

## Must-Haves

- [ ] `SizingResult` type exported from `src/lib/sizing.ts`
- [ ] `validateMilestoneSize()` uses existing `findRoadmapPath()` and `parseRoadmapSlices()` — no hand-rolled parsing
- [ ] Handles undefined limit gracefully (skip validation)
- [ ] Handles 0 slices as a distinct valid state
- [ ] Mode defaults to "best_try" when absent from config
- [ ] All test cases pass

## Verification

- `npx vitest run src/lib/__tests__/sizing.test.ts` — all sizing tests pass
- `npx vitest run` — full suite green

## Inputs

- `src/lib/config.ts` — Config type with new fields from T01
- `src/lib/state.ts` — `findRoadmapPath()` and `parseRoadmapSlices()` to compose

## Expected Output

- `src/lib/sizing.ts` — `SizingResult` type and `validateMilestoneSize()` function
- `src/lib/__tests__/sizing.test.ts` — 8+ test cases covering normal, edge, and error scenarios

## Observability Impact

- **New signal — `SizingResult` return value**: Every call to `validateMilestoneSize()` returns a structured `SizingResult` with `valid`, `sliceCount`, `limit`, `mode`, and `milestoneId`. Callers can inspect all fields to understand exactly why a milestone passed or failed sizing.
- **Failure visibility — missing roadmap**: When the roadmap file doesn't exist, the function throws with a message including the milestone ID and expected path — a future agent can grep for the milestone ID in error output.
- **No-limit passthrough**: When `config.max_slices_per_milestone` is undefined, result has `limit: undefined` and `valid: true` — distinguishable from "under limit" (which has a numeric limit).
- **Mode source**: `mode` in the result reflects `config.sizing_mode ?? "best_try"` — callers can verify which mode was applied without re-reading config.
