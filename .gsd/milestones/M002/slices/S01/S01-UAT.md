# S01: PR/MR provider support and milestone-level mapping — UAT

**Milestone:** M002
**Written:** 2026-03-14

## UAT Type

- UAT mode: artifact-driven
- Why this mode is sufficient: S01 adds types, implementations, and state helpers with no command/tool wiring. All behavior is exercised through mock-exec tests. No runtime, UI, or user interaction to verify.

## Preconditions

- Node.js ≥18 installed
- Project dependencies installed (`npm install`)
- All 212 tests passing (`npx vitest run`)
- TypeScript compiles cleanly (`npx tsc --noEmit`)

## Smoke Test

Run `npx vitest run src/providers/__tests__/github.test.ts src/providers/__tests__/gitlab.test.ts src/lib/__tests__/state.test.ts` — 76 tests pass including all new createPR and readIntegrationBranch tests.

## Test Cases

### 1. GitHubProvider.createPR creates a PR with correct CLI args

1. Examine `src/providers/__tests__/github.test.ts` — find the "creates a PR and returns parsed URL" test
2. Verify it mocks `gh pr create` with `--title`, `--body`, `--base`, `--head` flags
3. Verify the mock returns a stdout containing a GitHub PR URL (e.g. `https://github.com/owner/repo/pull/42`)
4. Verify the test asserts `result.url` matches and `result.number` is `42`
5. **Expected:** Test passes, `createPR()` constructs the right CLI command and parses the URL

### 2. GitLabProvider.createPR creates an MR with correct CLI args

1. Examine `src/providers/__tests__/gitlab.test.ts` — find the "creates an MR" test
2. Verify it mocks `glab mr create` with `--title`, `--description`, `--target-branch`, `--source-branch`, `--yes`, `--no-editor`
3. Verify the mock returns a stdout containing a GitLab MR URL (e.g. `https://gitlab.com/owner/repo/-/merge_requests/7`)
4. Verify the test asserts `result.url` matches and `result.number` is `7`
5. **Expected:** Test passes, `createPR()` constructs the right CLI command and parses the URL

### 3. createPR includes Closes #N when closesIssueId is set

1. Examine both provider test files — find tests for `closesIssueId`
2. Verify that when `closesIssueId: "15"` is passed, the body/description arg contains `Closes #15`
3. **Expected:** Both providers append `Closes #N` to the PR body text

### 4. createPR supports draft mode

1. Examine both provider test files — find draft-related tests
2. Verify that `draft: true` adds `--draft` to the CLI args
3. Verify that `draft: false` or omitted does not add `--draft`
4. **Expected:** Draft flag is passed through correctly to both CLIs

### 5. createPR throws ProviderError on CLI failure

1. Examine both provider test files — find exit failure tests
2. Verify that when the mock exec returns a non-zero exit code, a `ProviderError` is thrown
3. Verify the error carries `provider`, `operation` ("createPR"), `exitCode`, `stderr`, and `command`
4. **Expected:** ProviderError with full diagnostic context is thrown

### 6. createPR throws on unparseable stdout

1. Examine both provider test files — find parse failure tests
2. Verify that when the mock exec returns exit code 0 but stdout that doesn't contain a valid URL, an error is thrown
3. Verify the error message includes the raw stdout
4. **Expected:** Parse failure error includes raw CLI output for diagnosis

### 7. readIntegrationBranch reads valid META.json

1. Examine `src/lib/__tests__/state.test.ts` — find the readIntegrationBranch tests
2. Verify the "returns integrationBranch" test writes a valid META.json with `{ "integrationBranch": "main" }` and reads it back
3. **Expected:** Returns `"main"`

### 8. readIntegrationBranch returns null for missing file

1. Find the "returns null when META.json is missing" test
2. Verify it reads from a path with no META.json file
3. **Expected:** Returns `null`, no exception thrown

### 9. readIntegrationBranch returns null for corrupt JSON

1. Find the "returns null for invalid JSON" test
2. Verify it writes non-JSON content to the META.json path
3. **Expected:** Returns `null`, no exception thrown

### 10. readIntegrationBranch validates branch name

1. Find the "returns null for invalid branch name" test
2. Verify it tests a branch name with shell metacharacters (e.g. `; rm -rf /`)
3. **Expected:** Returns `null` — invalid characters are rejected by VALID_BRANCH_NAME regex

## Edge Cases

### Branch names with slashes and dots

1. Find the "handles branch names with slashes and dots" test
2. Verify it tests a branch name like `feature/my-branch.1`
3. **Expected:** Returns the branch name — slashes and dots are valid in VALID_BRANCH_NAME

### Whitespace-only branch name

1. Find the "returns null for whitespace-only" test
2. Verify it tests `"   "` as the integrationBranch value
3. **Expected:** Returns `null` — trimmed to empty string, rejected

### Milestone IDs with random suffixes

1. Find the "handles milestone IDs with suffixes" test
2. Verify it uses a milestone ID like `M001-eh88as` in the path
3. **Expected:** Reads the file at the correct path using the full milestone ID

## Failure Signals

- Any test failure in `github.test.ts`, `gitlab.test.ts`, or `state.test.ts`
- `npx tsc --noEmit` reports type errors — IssueProvider interface mismatch
- Test count drops below 212 — indicates a test was deleted or broken
- Mock provider objects in `close.test.ts` or `sync.test.ts` missing `createPR` — would cause type errors

## Requirements Proved By This UAT

- R014 (partial) — `createPR()` CLI wrapping and URL parsing proven via mock tests on both providers
- R015 (partial) — `readIntegrationBranch()` META.json reading proven, milestone-keyed convention established

## Not Proven By This UAT

- R014 full — PR creation pipeline (branch push + PR command + close-on-merge) requires S02
- R015 full — Milestone-level sync/close orchestration requires S02
- Runtime CLI behavior — all tests use mock exec, not real `gh`/`glab` CLIs
- Integration with `/issues pr` command — command wiring is S02 scope

## Notes for Tester

- This is a pure contract-level slice. There's nothing to test in a running app — all verification is through the test suite.
- To manually inspect what the providers would do, read the test files and trace the CLI args. The mock exec pattern makes the expected CLI commands explicit.
- The `VALID_BRANCH_NAME` regex matches GSD core's validation. If GSD core changes its regex, this should be updated to match.
