---
estimated_steps: 5
estimated_files: 4
---

# T01: Add config fields, validation rules, and setup wizard prompts

**Slice:** S01 — Config, Setup, and Sizing Validation
**Milestone:** M003

## Description

Extend the Config interface with two new optional fields for milestone sizing control, add validation rules following the existing hand-rolled pattern, and extend the setup wizard to collect these values with sensible defaults. This task closes the config schema and collection surface — T02 builds the sizing logic on top.

## Steps

1. Add `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` to the `Config` interface in `src/lib/config.ts`
2. Add validation rules in `validateConfig()`:
   - `max_slices_per_milestone`: when present, must be a number and a positive integer (≥1). Reject 0, negative, floats, strings.
   - `sizing_mode`: when present, must be `"strict"` or `"best_try"`. Reject other strings, numbers, booleans.
3. In `src/commands/setup.ts`, add two prompts in Step 5 (after labels, before Step 6 provider-specific):
   - Input for max slices with default "5" — parse to number for config assembly
   - Select for sizing mode with options `[{value: "best_try", label: "Best try (warn and proceed)"}, {value: "strict", label: "Strict (block until right-sized)"}]`
4. Include new fields in Step 8 summary output
5. Add tests: config validation tests for new fields (accept valid, reject wrong types, accept absent), setup tests for new prompt flow (mock UI, verify assembly, verify summary)

## Must-Haves

- [ ] Config interface has both new typed optional fields
- [ ] validateConfig rejects: non-number max_slices, non-positive-integer max_slices (0, -1, 2.5), invalid sizing_mode values
- [ ] validateConfig accepts: valid values, absent fields (backward compat)
- [ ] Setup wizard collects max_slices (default 5) and sizing_mode (default best_try)
- [ ] Summary output includes max_slices_per_milestone and sizing_mode
- [ ] All existing tests continue passing

## Verification

- `npx vitest run src/lib/__tests__/config.test.ts` — all pass including new validation tests
- `npx vitest run src/commands/__tests__/setup.test.ts` — all pass including new prompt tests
- `npx vitest run` — full suite green, no regressions

## Observability Impact

- **New validation error messages**: `validateConfig()` now emits errors for `max_slices_per_milestone` (type, range) and `sizing_mode` (enum). A future agent can call `validateConfig({...bad values...})` and inspect `result.errors` to see structured rejection reasons.
- **Setup summary extended**: The Step 8 summary notification now includes `max_slices_per_milestone` and `sizing_mode` — visible in test assertions via `ui.notify` mock calls.
- **Backward compatibility preserved**: Absent fields produce no errors — existing configs remain valid. This is verified by existing "allows extra fields" and "accepts valid" tests continuing to pass.

## Inputs

- `src/lib/config.ts` — Config interface and validateConfig pattern to extend
- `src/commands/setup.ts` — Setup wizard flow to extend
- `src/lib/__tests__/config.test.ts` — Existing test patterns to follow
- `src/commands/__tests__/setup.test.ts` — Mock UI pattern to follow

## Expected Output

- `src/lib/config.ts` — Config interface with new fields, validateConfig with new rules
- `src/commands/setup.ts` — Two new prompts in Step 5, summary updated in Step 8
- `src/lib/__tests__/config.test.ts` — New tests for max_slices_per_milestone and sizing_mode validation
- `src/commands/__tests__/setup.test.ts` — New tests for setup prompt collection and summary display
