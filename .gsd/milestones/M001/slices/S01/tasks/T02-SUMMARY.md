---
id: T02
parent: S01
milestone: M001
provides:
  - GitLabProvider implementing IssueProvider via glab CLI
  - GitHubProvider implementing IssueProvider via gh CLI
key_files:
  - src/providers/gitlab.ts
  - src/providers/github.ts
  - src/providers/__tests__/gitlab.test.ts
  - src/providers/__tests__/github.test.ts
key_decisions:
  - GitLab maps 'open' filter to 'opened' and 'opened' state response to 'open' — normalizes GitLab's non-standard state naming
  - GitHub maps 'OPEN'/'CLOSED' responses to lowercase — normalizes GitHub's uppercase JSON state values
  - GitHub --body always passed (empty string default) to prevent interactive editor mode
  - GitLab close + done label is two separate CLI calls (close then update) — glab doesn't support both in one command
patterns_established:
  - Private run() helper centralizes exec + ProviderError throwing — each provider method stays focused on arg construction and output parsing
  - URL parsing via regex /\/issues\/(\d+)/ shared between both providers — validated as positive integer, fails loudly on malformed output
  - Optional CLI args built conditionally with explicit undefined checks — no args array mutation after initial construction
observability_surfaces:
  - ProviderError thrown on non-zero exit code with { provider, operation, exitCode, stderr, command } — identifies exactly which CLI call failed
  - ProviderError also thrown on malformed stdout (successful exit but unparseable output) — catches CLI output format changes
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: GitLab and GitHub Provider Implementations with Tests

**Implemented both IssueProvider providers wrapping glab/gh CLIs with full arg construction, URL→ID parsing, and error handling — 34 new tests, 50 total passing.**

## What Happened

Implemented `GitLabProvider` in `src/providers/gitlab.ts` wrapping `glab` CLI. Constructor takes `ExecFn` and optional `projectPath`. All four IssueProvider methods build explicit arg arrays: `createIssue` uses `--yes --no-editor` for non-interactive mode and parses IID from the stdout URL via `/\/issues\/(\d+)/` regex. `closeIssue` is two calls — `glab issue close` then optionally `glab issue update --label` for done labels. `listIssues` uses `--output json` and normalizes GitLab's `opened` state to `open`. `addLabels` uses `glab issue update --label` with comma-joined labels.

Implemented `GitHubProvider` in `src/providers/github.ts` with the same pattern. `createIssue` always passes `--body` (empty string default) to avoid editor mode. `closeIssue` supports `--reason` flag for completed/not-planned. `listIssues` uses `--json number,title,state,url,labels,milestone,assignees` with field selection and normalizes GitHub's uppercase `OPEN`/`CLOSED` states. `addLabels` uses `gh issue edit --add-label`.

Both providers use a private `run()` method that handles exec invocation and throws `ProviderError` with full diagnostic context on non-zero exit codes.

## Verification

- `npx vitest run` — 50 tests pass across 4 test files (8 detect, 8 issue-map, 15 gitlab, 19 github)
- `npx tsc --noEmit` — clean, zero errors

Slice-level verification (all checks pass — S01 complete):
- ✅ `src/providers/__tests__/gitlab.test.ts` — create parses URL→IID, close calls correct args + done label, list parses JSON, error on non-zero exit
- ✅ `src/providers/__tests__/github.test.ts` — create parses URL→number, close passes `--reason`, list parses `--json` output, error on non-zero exit
- ✅ `src/providers/__tests__/detect.test.ts` — SSH/HTTPS for github.com and gitlab.com, unknown host returns null
- ✅ `src/lib/__tests__/issue-map.test.ts` — round-trip, empty file, corrupt file error
- ✅ `npx tsc --noEmit` — type-checks cleanly

## Diagnostics

- Catch `ProviderError` and inspect `.provider` (github|gitlab), `.operation` (createIssue|closeIssue|listIssues|addLabels), `.exitCode`, `.stderr`, `.command`
- Malformed CLI output (URL without issue number) also throws `ProviderError` with exit code 0 — distinguishes "CLI succeeded but output changed" from "CLI failed"
- Run `npx vitest run` to verify provider layer is intact

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/providers/gitlab.ts` — GitLabProvider implementing IssueProvider via glab CLI
- `src/providers/github.ts` — GitHubProvider implementing IssueProvider via gh CLI
- `src/providers/__tests__/gitlab.test.ts` — 15 tests covering create/close/list/addLabels/projectPath
- `src/providers/__tests__/github.test.ts` — 19 tests covering create/close/list/addLabels/projectPath
