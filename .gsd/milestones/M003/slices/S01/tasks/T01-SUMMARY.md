---
id: T01
parent: S01
milestone: M003
provides:
  - Config interface with max_slices_per_milestone and sizing_mode fields
  - Validation rules for new fields in validateConfig()
  - Setup wizard prompts for new fields with defaults
  - Summary output includes new fields
key_files:
  - src/lib/config.ts
  - src/commands/setup.ts
  - src/lib/__tests__/config.test.ts
  - src/commands/__tests__/setup.test.ts
key_decisions:
  - max_slices_per_milestone always written to config (not conditional on empty) since it has a default of 5 — avoids ambiguity between "not set" and "default"
  - sizing_mode always written to config for same reason
patterns_established:
  - Positive integer validation pattern: type check first, then Number.isInteger + ≥1
  - Enum validation uses direct equality comparison (consistent with existing provider/close_reason pattern)
observability_surfaces:
  - validateConfig() returns structured {valid, errors[]} with descriptive messages for new fields
  - Setup wizard Step 8 summary notification includes max_slices_per_milestone and sizing_mode
duration: 20m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Add config fields, validation rules, and setup wizard prompts

**Extended Config with `max_slices_per_milestone` and `sizing_mode`, added validation rules rejecting bad types/values, added setup wizard collection prompts with defaults, updated summary output, and added 15 new tests.**

## What Happened

1. Added `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` to the `Config` interface in `src/lib/config.ts`.
2. Added validation in `validateConfig()`: max_slices checks type (must be number), then range (must be positive integer ≥1, rejecting 0, negatives, floats). sizing_mode checks enum membership (must be "strict" or "best_try", rejecting other strings, numbers, booleans).
3. In `src/commands/setup.ts`, added two prompts after labels collection (Step 5): input for max slices (default "5"), select for sizing mode with best_try/strict options. Both values are always included in the assembled config object.
4. Extended Step 8 summary output with `max_slices_per_milestone` and `sizing_mode` lines.
5. Added 15 new config validation tests (accept valid, reject string/zero/negative/float max_slices, reject invalid/number/boolean sizing_mode, accept absent fields). Updated all 10 existing setup tests to include mock returns for the two new prompts. Added 2 new setup tests: custom values collection and summary content verification.

## Verification

- `npx vitest run src/lib/__tests__/config.test.ts` — 37 tests pass (15 new)
- `npx vitest run src/commands/__tests__/setup.test.ts` — 13 tests pass (2 new, 10 updated)
- `npx vitest run` — 257 tests pass, 15 files, zero regressions
- Failure-path diagnostic check: tests verify `validateConfig()` returns `{valid: false, errors: [...]}` with descriptive messages for all invalid max_slices_per_milestone variants and invalid sizing_mode values

## Diagnostics

- Call `validateConfig({...})` with bad values to see structured error output — errors include field name, expected type, and actual value
- In setup tests, inspect `ui.notify.mock.calls` to verify summary content includes new fields

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/config.ts` — Added two fields to Config interface, added validation rules in validateConfig()
- `src/commands/setup.ts` — Added two prompts in Step 5, included new fields in config assembly and summary output
- `src/lib/__tests__/config.test.ts` — Added 15 new validation tests for max_slices_per_milestone and sizing_mode
- `src/commands/__tests__/setup.test.ts` — Updated 10 existing tests with new mock returns, added 2 new tests for custom values and summary display
- `.gsd/milestones/M003/slices/S01/S01-PLAN.md` — Added Observability / Diagnostics section, enhanced Verification section
- `.gsd/milestones/M003/slices/S01/tasks/T01-PLAN.md` — Added Observability Impact section
