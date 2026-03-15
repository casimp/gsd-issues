---
estimated_steps: 3
estimated_files: 2
---

# T02: Add readIntegrationBranch() to state helpers

**Slice:** S01 — PR/MR provider support and milestone-level mapping
**Milestone:** M002

## Description

Add `readIntegrationBranch(cwd, milestoneId)` to `src/lib/state.ts`. This function reads the `integrationBranch` field from a milestone's META.json file (`.gsd/milestones/{MID}/{MID}-META.json`). S02 will use this to determine the target branch when creating a PR. The function must be resilient to missing files, corrupt JSON, missing fields, and invalid branch names — following the same pattern used in GSD core's git-service.

## Steps

1. Add `readIntegrationBranch(cwd: string, milestoneId: string): Promise<string | null>` to `src/lib/state.ts`:
   - Construct path: `join(cwd, ".gsd", "milestones", milestoneId, `${milestoneId}-META.json`)`
   - Read file with `readFile` (async, consistent with existing `readGSDState`)
   - Return `null` on ENOENT (file missing)
   - Parse JSON, return `null` on parse error (corrupt file)
   - Extract `data.integrationBranch`, return `null` if not a string, empty, or whitespace-only
   - Validate branch name with `/^[a-zA-Z0-9_\-\/.]+$/` (matches GSD core's `VALID_BRANCH_NAME`), return `null` if invalid
   - Return the branch name string on success

2. Export the branch validation regex as `VALID_BRANCH_NAME` for potential reuse.

3. Add tests to `src/lib/__tests__/state.test.ts`:
   - Reads valid integration branch from well-formed META.json
   - Returns `null` when META.json doesn't exist
   - Returns `null` when META.json contains invalid JSON
   - Returns `null` when `integrationBranch` field is missing from the JSON object
   - Returns `null` when `integrationBranch` is an empty string
   - Returns `null` when `integrationBranch` contains invalid characters (e.g. spaces, shell metacharacters)
   - Works with milestone IDs that have random suffixes (e.g. `M001-eh88as`)

## Must-Haves

- [ ] `readIntegrationBranch` exported from `src/lib/state.ts`
- [ ] Returns `null` for missing file, corrupt JSON, missing field, empty/invalid branch name
- [ ] Branch name validation matches GSD core pattern (`/^[a-zA-Z0-9_\-\/.]+$/`)
- [ ] Async implementation consistent with existing `readGSDState` pattern

## Verification

- `npx vitest run src/lib/__tests__/state.test.ts` — all existing 18 tests + new readIntegrationBranch tests pass
- `npx tsc --noEmit` — no type errors

## Inputs

- `src/lib/state.ts` — existing state helpers (`readGSDState`, `findRoadmapPath`)
- GSD core `git-service.ts` — reference implementation of `readIntegrationBranch` and `VALID_BRANCH_NAME`
- META.json format: `{ "integrationBranch": "main" }` at `.gsd/milestones/{MID}/{MID}-META.json`

## Observability Impact

- `readIntegrationBranch` returns `null` on every failure mode (missing file, corrupt JSON, missing/empty/invalid field) — callers distinguish "no branch configured" from success by checking for `null`
- No thrown errors on expected failures — ENOENT and parse errors are swallowed to `null`, only unexpected I/O errors propagate
- `VALID_BRANCH_NAME` regex exported for callers to reuse the same validation without duplicating logic
- Future agent inspects: check return value against `null` to determine if META.json is properly configured; regex match on branch name to diagnose validation failures

## Expected Output

- `src/lib/state.ts` — updated with `readIntegrationBranch()` and `VALID_BRANCH_NAME`
- `src/lib/__tests__/state.test.ts` — ~7 new tests in a `readIntegrationBranch` describe block
