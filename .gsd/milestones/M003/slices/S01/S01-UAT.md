# S01: Config, Setup, and Sizing Validation — UAT

**Milestone:** M003
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: All deliverables are library functions and config schema — no live runtime, no UI, no services. Validation is fully testable via unit tests and direct function calls.

## Preconditions

- Repository cloned and dependencies installed (`npm install`)
- All 266 tests passing (`npx vitest run`)
- No `.gsd/issues.json` needed for sizing tests (they use temp dirs)

## Smoke Test

Run `npx vitest run src/lib/__tests__/sizing.test.ts src/lib/__tests__/config.test.ts` — all tests pass, confirming both config validation and sizing logic are working.

## Test Cases

### 1. Config accepts valid max_slices_per_milestone values

1. Call `validateConfig()` with a complete valid config including `max_slices_per_milestone: 5`
2. Call again with `max_slices_per_milestone: 1` (minimum valid)
3. Call again with `max_slices_per_milestone: 100` (large valid)
4. **Expected:** All three return `{valid: true, errors: []}`

### 2. Config rejects invalid max_slices_per_milestone values

1. Call `validateConfig()` with `max_slices_per_milestone: "five"` (string)
2. Call with `max_slices_per_milestone: 0` (zero)
3. Call with `max_slices_per_milestone: -3` (negative)
4. Call with `max_slices_per_milestone: 2.5` (float)
5. **Expected:** All four return `{valid: false, errors: [...]}` with descriptive error messages including the field name and what was wrong

### 3. Config accepts valid sizing_mode values

1. Call `validateConfig()` with `sizing_mode: "strict"`
2. Call with `sizing_mode: "best_try"`
3. **Expected:** Both return `{valid: true, errors: []}`

### 4. Config rejects invalid sizing_mode values

1. Call `validateConfig()` with `sizing_mode: "relaxed"` (invalid string)
2. Call with `sizing_mode: 42` (number)
3. Call with `sizing_mode: true` (boolean)
4. **Expected:** All three return `{valid: false, errors: [...]}` with error indicating sizing_mode must be "strict" or "best_try"

### 5. Config accepts absent sizing fields

1. Call `validateConfig()` with a valid config that has neither `max_slices_per_milestone` nor `sizing_mode`
2. **Expected:** Returns `{valid: true, errors: []}` — fields are optional

### 6. Setup wizard collects sizing fields with defaults

1. In setup test, mock UI to return default "5" for max_slices input and "best_try" for sizing_mode select
2. Run the setup handler
3. **Expected:** Assembled config includes `max_slices_per_milestone: 5` and `sizing_mode: "best_try"`

### 7. Setup wizard accepts custom sizing values

1. Mock UI to return "10" for max_slices and "strict" for sizing_mode
2. Run the setup handler
3. **Expected:** Assembled config includes `max_slices_per_milestone: 10` and `sizing_mode: "strict"`

### 8. Setup summary displays sizing fields

1. Run the setup handler with custom values (max_slices: 10, sizing_mode: strict)
2. Inspect the summary notification output
3. **Expected:** Summary includes lines showing `max_slices_per_milestone: 10` and `sizing_mode: strict`

### 9. Sizing validation — no limit configured

1. Call `validateMilestoneSize(cwd, "M001", {})` with config missing `max_slices_per_milestone`
2. **Expected:** Returns `{valid: true, sliceCount: 0, limit: undefined, mode: "best_try", milestoneId: "M001"}`

### 10. Sizing validation — under limit

1. Create a temp roadmap with 3 slices, set `config.max_slices_per_milestone: 5`
2. Call `validateMilestoneSize()`
3. **Expected:** Returns `{valid: true, sliceCount: 3, limit: 5, mode: "best_try", milestoneId: ...}`

### 11. Sizing validation — at limit

1. Create a temp roadmap with 5 slices, set `config.max_slices_per_milestone: 5`
2. Call `validateMilestoneSize()`
3. **Expected:** Returns `{valid: true, sliceCount: 5, limit: 5, ...}` — exactly at limit is valid

### 12. Sizing validation — over limit

1. Create a temp roadmap with 7 slices, set `config.max_slices_per_milestone: 5`
2. Call `validateMilestoneSize()`
3. **Expected:** Returns `{valid: false, sliceCount: 7, limit: 5, ...}`

### 13. Sizing validation — zero slices in roadmap

1. Create a temp roadmap with no slice lines (just heading and text)
2. Set `config.max_slices_per_milestone: 5`
3. Call `validateMilestoneSize()`
4. **Expected:** Returns `{valid: true, sliceCount: 0, ...}` — planning hasn't happened yet

### 14. Sizing validation — missing roadmap

1. Point `validateMilestoneSize()` at a cwd with no roadmap file for the given milestone
2. **Expected:** Throws an error containing the milestone ID and expected path

### 15. Sizing validation — mode passthrough

1. Call with `config.sizing_mode: "strict"`, valid milestone
2. **Expected:** `result.mode === "strict"` — mode passes through from config

### 16. Sizing validation — mode defaults to best_try

1. Call with no `sizing_mode` in config
2. **Expected:** `result.mode === "best_try"` — default applied

## Edge Cases

### Float max_slices_per_milestone

1. Call `validateConfig()` with `max_slices_per_milestone: 3.7`
2. **Expected:** Rejected — must be a positive integer

### max_slices_per_milestone of 1

1. Create a temp roadmap with 1 slice, set limit to 1
2. Call `validateMilestoneSize()`
3. **Expected:** `{valid: true, sliceCount: 1, limit: 1}`

### Roadmap with checked and unchecked slices

1. Create a temp roadmap with mix of `- [x]` and `- [ ]` slice lines (5 total)
2. Call `validateMilestoneSize()` with limit 3
3. **Expected:** Counts all slice lines (both checked and unchecked) — returns `{valid: false, sliceCount: 5, limit: 3}`

## Failure Signals

- Any vitest test failure in config.test.ts, setup.test.ts, or sizing.test.ts
- `validateConfig()` returning `{valid: true}` for invalid field values
- `validateMilestoneSize()` returning `valid: true` when sliceCount > limit
- `validateMilestoneSize()` silently returning instead of throwing on missing roadmap
- Setup summary notification missing the new fields

## Requirements Proved By This UAT

- R002 — Extended config schema validated: new fields accepted when valid, rejected when invalid, collected via setup wizard
- R018 — Milestone sizing config: setup collects max_slices and sizing_mode with defaults, persists to config
- R019 — Milestone size validation: validateMilestoneSize() correctly identifies under/at/over limit, handles no-limit and zero-slice cases

## Not Proven By This UAT

- R021 — Auto-flow orchestration (`/issues auto`) — deferred to S02
- Runtime behavior of setup wizard with a real terminal (tests use mocked UI)
- Integration of sizing validation into an orchestration loop (S02)
- Strict mode blocking behavior vs best_try warning behavior in a real workflow (S02)

## Notes for Tester

- All test cases above are covered by the existing vitest suite — running `npx vitest run` is the fastest way to validate everything
- The sizing tests use real temp directories with actual roadmap files, not mocks — they exercise the full I/O path
- `parseRoadmapSlices()` uses a regex that matches `- [ ] **S##:` and `- [x] **S##:` patterns — non-standard roadmap formats won't be counted
