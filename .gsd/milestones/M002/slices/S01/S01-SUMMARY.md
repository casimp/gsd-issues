---
id: S01
parent: M002
milestone: M002
provides:
  - createPR() method on IssueProvider interface
  - GitHubProvider.createPR() wrapping gh pr create with URL parsing
  - GitLabProvider.createPR() wrapping glab mr create with URL parsing
  - CreatePROpts and PRResult types in providers/types.ts
  - readIntegrationBranch(cwd, milestoneId) in lib/state.ts
  - VALID_BRANCH_NAME regex exported from lib/state.ts
  - Convention that IssueMapEntry.localId holds milestone ID (not slice ID)
requires:
  - slice: M001/S01
    provides: IssueProvider interface, ExecFn type, ProviderError class
affects:
  - M002/S02
  - M002/S03
key_files:
  - src/providers/types.ts
  - src/providers/github.ts
  - src/providers/gitlab.ts
  - src/lib/state.ts
  - src/providers/__tests__/github.test.ts
  - src/providers/__tests__/gitlab.test.ts
  - src/lib/__tests__/state.test.ts
key_decisions:
  - D029 — IssueMapEntry.localId holds milestone ID (convention shift, no code change)
  - D030 — createPR body includes Closes #N for platform-native close-on-merge
patterns_established:
  - createPR follows same run()-based pattern as createIssue — build args, call run(), parse stdout, throw ProviderError on failure
  - readIntegrationBranch follows same async readFile + ENOENT-to-null pattern as readGSDState
  - Separate URL regexes per entity type (PR_URL_RE, MR_URL_RE) rather than reusing ISSUE_URL_RE
observability_surfaces:
  - ProviderError on createPR failure carries provider, operation, exitCode, stderr, and command fields
  - Parse failure errors include raw stdout for diagnosing CLI output format changes
  - readIntegrationBranch returns null on all expected failure modes — only unexpected I/O errors propagate
drill_down_paths:
  - .gsd/milestones/M002/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S01/tasks/T02-SUMMARY.md
duration: 30m
verification_result: passed
completed_at: 2026-03-14
---

# S01: PR/MR provider support and milestone-level mapping

**Extended IssueProvider with `createPR()` on both providers, added `readIntegrationBranch()` for META.json reading, and established milestone-keyed ISSUE-MAP convention.**

## What Happened

Two tasks, both straightforward builds on the M001 foundation.

**T01** added `CreatePROpts` and `PRResult` types to the provider type system and implemented `createPR()` on both providers. GitHubProvider builds `gh pr create --title --body --base --head` args, parses PR URL with `/\/pull\/(\d+)/`. GitLabProvider builds `glab mr create --title --description --target-branch --source-branch --yes --no-editor` args, parses MR URL with `/\/merge_requests\/(\d+)/`. Both support `--draft` and append `Closes #N` to the body when `closesIssueId` is set. ProviderError on failure carries full diagnostic context. 15 new tests across both providers.

**T02** added `readIntegrationBranch(cwd, milestoneId)` to state.ts. Reads `.gsd/milestones/{MID}/{MID}-META.json`, parses JSON, validates `integrationBranch` against `VALID_BRANCH_NAME` regex (`/^[a-zA-Z0-9_\-\/.]+$/`), returns the branch name or `null` on any failure (missing file, corrupt JSON, missing/invalid field). 9 new tests covering all edge cases.

## Verification

- `npx vitest run` — 212 tests pass (up from 188 baseline)
- `npx tsc --noEmit` — no type errors
- GitHubProvider.createPR: 7 tests (success, closesIssueId, draft, no-draft, exit failure, parse failure, cwd)
- GitLabProvider.createPR: 8 tests (success, --yes/--no-editor, branch flags, closesIssueId, draft, exit failure, parse failure, cwd)
- readIntegrationBranch: 9 tests (valid branch, missing file, invalid JSON, missing field, empty string, whitespace-only, invalid characters, milestone ID with suffix, branch names with slashes/dots)
- Failure-path diagnostics: ProviderError fields verified by dedicated tests on both providers

## Requirements Advanced

- R014 — `createPR()` implemented on both providers with mock-exec tests proving CLI arg construction and URL parsing. `Closes #N` body injection tested. Full pipeline deferred to S02.
- R015 — `IssueMapEntry.localId` milestone convention established (D029), `readIntegrationBranch()` reads META.json with full resilience. Sync/close orchestration rebuild deferred to S02.
- R008 — Milestone-keyed convention confirmed. No code changes needed — `localId` is already a string field.

## Requirements Validated

- none — S01 proves contract-level pieces; end-to-end validation requires S02 wiring

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None. Both tasks executed as planned.

## Known Limitations

- `createPR()` is implemented but not wired to any command or tool — S02 will build the `/issues pr` command and milestone sync
- `readIntegrationBranch()` is implemented but not consumed — S02 will use it to determine the PR target branch
- ISSUE-MAP milestone convention is established by decision (D029) but no code enforces milestone-only writes — S02's sync will be the first consumer

## Follow-ups

- none — all work identified during execution aligns with the S02 plan

## Files Created/Modified

- `src/providers/types.ts` — added `CreatePROpts`, `PRResult` types and `createPR()` to `IssueProvider` interface
- `src/providers/github.ts` — added `createPR()` implementation with `PR_URL_RE`
- `src/providers/gitlab.ts` — added `createPR()` implementation with `MR_URL_RE`
- `src/providers/__tests__/github.test.ts` — added 7 createPR tests
- `src/providers/__tests__/gitlab.test.ts` — added 8 createPR tests
- `src/lib/state.ts` — added `VALID_BRANCH_NAME` regex and `readIntegrationBranch()` function
- `src/lib/__tests__/state.test.ts` — added 9 readIntegrationBranch tests
- `src/lib/__tests__/close.test.ts` — added `createPR` stub to mock provider
- `src/lib/__tests__/sync.test.ts` — added `createPR` stub to two mock providers

## Forward Intelligence

### What the next slice should know
- `createPR()` follows the exact same pattern as `createIssue()` — build args, run(), parse stdout. The exec function injection is the same, so S02 tests can use the same mock pattern.
- `readIntegrationBranch()` returns `null` on all failure modes. S02 should decide what the default target branch is when META.json doesn't specify one (likely `main`).
- The `closesIssueId` parameter on `CreatePROpts` is a string (the issue number), not a full URL. Both providers construct the `Closes #N` syntax from it.

### What's fragile
- URL regex parsing (`PR_URL_RE`, `MR_URL_RE`) depends on CLI output format — if `gh` or `glab` change their stdout format, parsing breaks. The error message includes raw stdout to make this diagnosable.
- `VALID_BRANCH_NAME` regex is permissive (alphanumeric, `_`, `-`, `/`, `.`). Exotic branch names with spaces or unicode will be rejected — this matches GSD core's pattern.

### Authoritative diagnostics
- `ProviderError` on `createPR` carries `provider`, `operation` ("createPR"), `exitCode`, `stderr`, `command` — same structure as `createIssue` errors
- `readIntegrationBranch` returning `null` means "not configured" — thrown exceptions mean actual I/O failures

### What assumptions changed
- none — both tasks matched the plan exactly
