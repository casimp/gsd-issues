# S01: Config, Setup, and Sizing Validation

**Goal:** `max_slices_per_milestone` and `sizing_mode` are persisted in config, setup wizard collects them, and `validateMilestoneSize()` correctly reports oversized milestones.
**Demo:** Unit tests prove config validation accepts/rejects the new fields, setup wizard collects them, and sizing validation returns correct results for normal, oversized, and edge-case milestones.

## Must-Haves

- `Config` interface has `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` fields
- `validateConfig()` rejects wrong types for new fields, accepts valid values, passes through when absent
- Setup wizard collects max_slices (default 5) and sizing_mode (default "best_try") after existing fields, before provider-specific config
- Setup summary includes the new fields
- `validateMilestoneSize()` in `src/lib/sizing.ts` reads roadmap, counts slices, compares to limit, returns `SizingResult`
- Sizing handles edge cases: no config limit (skip validation), no slices (distinct state), exactly-at-limit, over-limit
- All 242+ existing tests continue passing

## Tasks

- [x] **T01: Add config fields, validation rules, and setup wizard prompts** `est:45m`
  - Why: Establishes the schema and collection surface for milestone sizing config — prerequisite for the sizing validator and S02's orchestration
  - Files: `src/lib/config.ts`, `src/commands/setup.ts`, `src/lib/__tests__/config.test.ts`, `src/commands/__tests__/setup.test.ts`
  - Do: Add `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` to Config interface. Add validation in `validateConfig()`: max_slices must be positive integer when present, sizing_mode must be "strict" or "best_try" when present. In setup.ts, add two prompts after labels collection (Step 5) and before provider-specific config (Step 6): input for max_slices (default "5"), select for sizing_mode with strict/best_try options (default best_try). Include new fields in Step 8 summary output. Add config tests: accepts valid values, rejects wrong types (string for max_slices, number for sizing_mode), rejects zero/negative max_slices, accepts when fields absent. Add setup tests: mock UI returns for new prompts, verify config assembly includes fields, verify summary output shows fields.
  - Verify: `npx vitest run src/lib/__tests__/config.test.ts src/commands/__tests__/setup.test.ts` — all pass including new tests. `npx vitest run` — no regressions.
  - Done when: Config interface typed, validation catches bad values, setup collects and displays new fields, all tests green

- [x] **T02: Implement validateMilestoneSize() with unit tests** `est:45m`
  - Why: Core sizing logic that S02's orchestration loop will call to decide whether a milestone needs splitting
  - Files: `src/lib/sizing.ts`, `src/lib/__tests__/sizing.test.ts`
  - Do: Create `src/lib/sizing.ts` exporting `SizingResult` type (`{ valid: boolean, sliceCount: number, limit: number | undefined, mode: "strict" | "best_try", milestoneId: string }`) and `validateMilestoneSize(cwd: string, milestoneId: string, config: Config): Promise<SizingResult>`. Implementation: if `config.max_slices_per_milestone` is undefined, return valid with limit undefined. Read roadmap via `findRoadmapPath()` + `readFile()`. Parse with `parseRoadmapSlices()`. If 0 slices, return `{ valid: true, sliceCount: 0, ... }` (planning hasn't happened). Compare count to limit. Mode defaults to "best_try" when `config.sizing_mode` is absent. Create test file with cases: no limit configured (skip), under limit (valid), at limit (valid), over limit (invalid), 0 slices (valid, distinct), missing roadmap file (throws or returns error), mode passthrough from config.
  - Verify: `npx vitest run src/lib/__tests__/sizing.test.ts` — all pass. `npx vitest run` — full suite green.
  - Done when: `validateMilestoneSize()` correctly reports sizing for all cases, tested with real temp-dir roadmap files

## Observability / Diagnostics

- **Config validation errors**: `validateConfig()` returns all errors as a flat string array — caller gets structured visibility into exactly which fields failed and why. Error messages include field name, expected type, and actual value.
- **Setup wizard validation gate**: After `saveConfig()`, setup re-validates and surfaces any validation issues via `ctx.ui.notify(..., "error")` — the user sees exactly what went wrong without needing to inspect the file.
- **Sizing result structure**: `validateMilestoneSize()` returns a `SizingResult` with `valid`, `sliceCount`, `limit`, `mode`, and `milestoneId` — all inspectable by calling code. No silent swallowing; missing roadmap throws, missing config limit returns explicit `limit: undefined`.
- **Redaction**: No secrets involved in config validation or sizing. Config values (provider, milestone, labels) are display-safe.
- **Failure-path verification**: Config validation tests explicitly verify rejection of bad types, boundary values (0, negative, floats), and missing provider sections. Sizing tests verify over-limit, missing roadmap, and zero-slice edge cases.

## Verification

- `npx vitest run src/lib/__tests__/config.test.ts` — new field validation tests pass
- `npx vitest run src/commands/__tests__/setup.test.ts` — new prompt collection tests pass
- `npx vitest run src/lib/__tests__/sizing.test.ts` — sizing validation tests pass
- `npx vitest run` — full suite passes, no regressions
- Verify `validateConfig()` returns structured errors for invalid `max_slices_per_milestone` (e.g., `{valid: false, errors: [...]}` with descriptive message) — failure-path diagnostic check

## Files Likely Touched

- `src/lib/config.ts`
- `src/lib/__tests__/config.test.ts`
- `src/commands/setup.ts`
- `src/commands/__tests__/setup.test.ts`
- `src/lib/sizing.ts`
- `src/lib/__tests__/sizing.test.ts`
