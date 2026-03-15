---
id: T01
parent: S01
milestone: M002
provides:
  - CreatePROpts and PRResult types in provider type system
  - createPR() on IssueProvider interface
  - GitHubProvider.createPR() implementation (gh pr create)
  - GitLabProvider.createPR() implementation (glab mr create)
key_files:
  - src/providers/types.ts
  - src/providers/github.ts
  - src/providers/gitlab.ts
  - src/providers/__tests__/github.test.ts
  - src/providers/__tests__/gitlab.test.ts
key_decisions:
  - URL extraction uses separate regexes per entity type (PR_URL_RE, MR_URL_RE) rather than reusing ISSUE_URL_RE — keeps parse logic explicit and diagnosable
  - Body mutation (appending Closes #N) happens before arg construction, not via separate CLI flags — matches how both CLIs handle body text
patterns_established:
  - createPR follows same run()-based pattern as createIssue — build args, call run(), parse stdout, throw ProviderError on failure
observability_surfaces:
  - ProviderError on createPR failure carries provider, operation ("createPR"), exitCode, stderr, and full CLI command string
  - Parse failure errors include raw stdout for diagnosing CLI output format changes
duration: 20m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Add createPR() types and implement on both providers

**Added `CreatePROpts`/`PRResult` types, `createPR()` to `IssueProvider`, and implemented on both `GitHubProvider` and `GitLabProvider` with URL parsing from CLI stdout.**

## What Happened

Added `CreatePROpts` and `PRResult` to `src/providers/types.ts` and extended `IssueProvider` with `createPR()`. Implemented on both providers following the existing `run()` helper pattern:

- **GitHubProvider**: builds `gh pr create --title --body --base --head` args, optionally `--draft`, appends `Closes #N` to body when `closesIssueId` set, parses PR URL with `/\/pull\/(\d+)/`
- **GitLabProvider**: builds `glab mr create --title --description --target-branch --source-branch --yes --no-editor` args, optionally `--draft`, appends `Closes #N` to description when `closesIssueId` set, parses MR URL with `/\/merge_requests\/(\d+)/`

Also updated mock provider objects in `close.test.ts` and `sync.test.ts` to include the new `createPR` method on the interface.

## Verification

- `npx vitest run src/providers/__tests__/github.test.ts` — 26 tests pass (7 new createPR tests)
- `npx vitest run src/providers/__tests__/gitlab.test.ts` — 23 tests pass (8 new createPR tests)
- `npx vitest run` — all 203 tests pass (was 188, +15 new)
- `npx tsc --noEmit` — no type errors

### Slice-level verification
- `npx vitest run` — **pass** (203 tests, all passing)
- GitHubProvider.createPR tests — **pass** (7 tests)
- GitLabProvider.createPR tests — **pass** (8 tests)
- readIntegrationBranch tests — **not yet** (T02 scope)
- Failure-path diagnostic check — **pass** (ProviderError fields verified in dedicated tests on both providers)

## Diagnostics

- `ProviderError` instances from `createPR()` carry: `provider` ("github"|"gitlab"), `operation` ("createPR"), `exitCode`, `stderr`, `command` (full CLI string)
- On parse failure (exit code 0 but no URL in stdout): error message includes raw stdout for diagnosing CLI format changes
- Tests verify these diagnostic fields directly

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/providers/types.ts` — added `CreatePROpts`, `PRResult` types and `createPR()` to `IssueProvider` interface
- `src/providers/github.ts` — added `createPR()` implementation with `PR_URL_RE`, imported new types
- `src/providers/gitlab.ts` — added `createPR()` implementation with `MR_URL_RE`, imported new types
- `src/providers/__tests__/github.test.ts` — added 7 createPR tests (success, closesIssueId, draft, no-draft, exit failure, parse failure, cwd)
- `src/providers/__tests__/gitlab.test.ts` — added 8 createPR tests (success, --yes/--no-editor, branch flags, closesIssueId, draft, exit failure, parse failure, cwd)
- `src/lib/__tests__/close.test.ts` — added `createPR` stub to mock provider
- `src/lib/__tests__/sync.test.ts` — added `createPR` stub to two mock providers
- `.gsd/milestones/M002/slices/S01/S01-PLAN.md` — added failure-path diagnostic verification step
- `.gsd/milestones/M002/slices/S01/tasks/T01-PLAN.md` — added Observability Impact section
