# S01: Provider Abstraction and Core Types — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 is a library-only slice with no runtime integration. All verification is via unit tests against mock exec functions and TypeScript type checking. Real CLI integration is deferred to S03.

## Preconditions

- Node.js installed (v18+)
- `npm install` completed in project root
- No real glab/gh CLI required (all tests use mocks)

## Smoke Test

Run `npx vitest run && npx tsc --noEmit` — expect 50 tests passing across 4 files and zero type errors.

## Test Cases

### 1. Provider detection resolves SSH remotes correctly

1. Open `src/providers/__tests__/detect.test.ts`
2. Verify test "detects github from SSH remote" mocks `git remote get-url origin` returning `git@github.com:user/repo.git`
3. Verify test "detects gitlab from SSH remote" mocks returning `git@gitlab.com:group/project.git`
4. Run `npx vitest run src/providers/__tests__/detect.test.ts`
5. **Expected:** Both tests pass, `detectProvider` returns `'github'` and `'gitlab'` respectively

### 2. Provider detection resolves HTTPS remotes correctly

1. Verify test "detects github from HTTPS remote" mocks returning `https://github.com/user/repo.git`
2. Verify test "detects gitlab from HTTPS remote" mocks returning `https://gitlab.com/group/project.git`
3. **Expected:** Both tests pass, correct provider returned for each

### 3. Provider detection returns null for unknown hosts

1. Verify test for unknown host (e.g., `bitbucket.org`) exists
2. **Expected:** `detectProvider` returns `null`, does not throw

### 4. GitLab createIssue parses IID from stdout URL

1. Open `src/providers/__tests__/gitlab.test.ts`
2. Find the createIssue test — verify mock exec returns stdout containing a URL like `https://gitlab.com/group/project/-/issues/42`
3. **Expected:** `createIssue` returns `{ iid: 42, url: "..." }` with IID parsed from the URL

### 5. GitLab createIssue passes correct CLI args

1. In the same test, verify the exec function receives args including `issue`, `create`, `--title`, `--yes`, `--no-editor`
2. Verify optional args (`--milestone`, `--assignee`, `--weight`, `--label`) are included when provided in `CreateIssueOpts`
3. **Expected:** Args array matches expected glab CLI syntax

### 6. GitLab closeIssue makes two CLI calls

1. Find the closeIssue test with a done label
2. **Expected:** Mock exec is called twice — first `glab issue close <iid>`, then `glab issue update <iid> --label <doneLabel>`

### 7. GitLab listIssues normalizes state

1. Find the listIssues test
2. Verify mock returns JSON with `state: "opened"`
3. **Expected:** Parsed result has `state: "open"` (normalized)

### 8. GitHub createIssue always passes --body

1. Open `src/providers/__tests__/github.test.ts`
2. Find the createIssue test with no description provided
3. **Expected:** Args include `--body` with empty string value — prevents interactive editor

### 9. GitHub closeIssue passes --reason flag

1. Find the closeIssue test with a reason
2. **Expected:** Args include `--reason completed` (or `--reason "not planned"`)

### 10. GitHub listIssues normalizes uppercase states

1. Find the listIssues test
2. Verify mock returns JSON with `state: "OPEN"`
3. **Expected:** Parsed result has `state: "open"` (lowercased)

### 11. Issue-map round-trip persistence

1. Open `src/lib/__tests__/issue-map.test.ts`
2. Find the round-trip test — verify it writes entries with `saveIssueMap`, reads back with `loadIssueMap`
3. **Expected:** Read data matches written data exactly

### 12. Issue-map handles missing file gracefully

1. Find the missing file test
2. **Expected:** `loadIssueMap` returns `[]` (empty array), does not throw

### 13. ProviderError carries diagnostic fields

1. Open `src/providers/__tests__/github.test.ts`
2. Find the test "throws ProviderError on non-zero exit code with diagnostic fields"
3. **Expected:** Caught error has `.provider`, `.operation`, `.exitCode`, `.stderr`, `.command` fields populated correctly

### 14. ProviderError on malformed stdout

1. Find the test "throws ProviderError on malformed stdout"
2. Verify mock exec returns exit code 0 but stdout without `/issues/\d+` pattern
3. **Expected:** `ProviderError` thrown with exit code 0 — distinguishes "CLI succeeded but output format changed" from "CLI failed"

### 15. TypeScript compilation

1. Run `npx tsc --noEmit`
2. **Expected:** Zero errors, zero warnings

## Edge Cases

### Corrupt ISSUE-MAP.json

1. Find the corrupt JSON test in `issue-map.test.ts`
2. Verify file contains invalid JSON (e.g., `{not json}`)
3. **Expected:** `loadIssueMap` throws with error message containing the file path

### Non-array ISSUE-MAP.json

1. Find the test where file contains valid JSON but not an array (e.g., `{}`)
2. **Expected:** `loadIssueMap` throws — structural validation rejects non-array data

### Invalid IssueMapEntry structure

1. Find the test with entries missing required fields
2. **Expected:** `loadIssueMap` throws — validates each entry has required fields with correct types

### Git remote command failure

1. Find the detect test where exec returns non-zero exit code
2. **Expected:** `detectProvider` returns `null`, does not throw

### Empty stdout from git remote

1. Find the detect test where exec returns empty stdout
2. **Expected:** `detectProvider` returns `null`

## Failure Signals

- Any vitest test failure — indicates a contract break in the provider layer
- `npx tsc --noEmit` errors — type system violations
- `ProviderError` without diagnostic fields — would indicate the error class is broken
- `loadIssueMap` returning data instead of throwing on corrupt files — validation bypass

## Requirements Proved By This UAT

- R001 — Provider abstraction with auto-detection: contract-level proof via mock tests (both providers implement IssueProvider, detectProvider resolves remotes)
- R008 — ISSUE-MAP.json mapping persistence: round-trip, validation, and error handling tested

## Not Proven By This UAT

- R001 real runtime — actual glab/gh CLI calls against live remotes (deferred to S03)
- R003, R004, R005 — sync/close/import workflows not yet built
- R006, R007 — GitLab extras and GitHub-specific features (partially in provider args, full proof in S03)
- Self-hosted instance detection — only github.com and gitlab.com supported

## Notes for Tester

- All tests are mock-based — you don't need glab or gh installed
- The test suite runs in ~1 second, so iterate quickly
- If investigating a failure, `ProviderError` fields are the first thing to inspect
- State normalization (GitLab `opened`→`open`, GitHub `OPEN`→`open`) is intentional and tested — downstream code should always see lowercase `open`/`closed`
