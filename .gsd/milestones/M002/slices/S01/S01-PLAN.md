# S01: PR/MR provider support and milestone-level mapping

**Goal:** Extend IssueProvider with `createPR()` for both GitLab and GitHub, add `readIntegrationBranch()` for reading META.json, and establish that ISSUE-MAP entries are keyed by milestone ID.
**Demo:** Mock-exec tests prove both providers can create PRs and return parseable URLs. State tests prove META.json reading handles present, missing, and corrupt files.

## Must-Haves

- `CreatePROpts` and `PRResult` types defined in `providers/types.ts`
- `createPR(opts)` method on `IssueProvider` interface
- `GitLabProvider.createPR()` wraps `glab mr create` with `--target-branch`, `--title`, `--description`, `--yes`
- `GitHubProvider.createPR()` wraps `gh pr create` with `--base`, `--title`, `--body`
- Both providers parse PR/MR URL from CLI stdout reliably
- `readIntegrationBranch(cwd, milestoneId)` reads `integrationBranch` from `{MID}-META.json`
- `readIntegrationBranch` returns `null` for missing file, missing field, and corrupt JSON
- All new code has mock-based tests exercising success, failure, and edge cases

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run` — all existing 188 tests still pass, plus new tests for `createPR()` on both providers and `readIntegrationBranch()`
- New test coverage: GitHubProvider.createPR (~6 tests), GitLabProvider.createPR (~6 tests), readIntegrationBranch (~5 tests)
- Failure-path diagnostic check: `ProviderError` on PR creation failure carries `provider`, `operation`, `exitCode`, `stderr`, and `command` fields — verified by dedicated tests on both providers

## Observability / Diagnostics

- Runtime signals: `ProviderError` thrown with full CLI command, exit code, and stderr on PR creation failure — same pattern as existing provider methods
- Failure visibility: error messages include the parsed stdout when URL extraction fails, making CLI output format changes immediately diagnosable

## Integration Closure

- Upstream surfaces consumed: `IssueProvider` interface, `ExecFn` type, `ProviderError` class (all from M001/S01)
- New wiring introduced in this slice: none — types and implementations only, no command/tool/hook integration
- What remains before the milestone is truly usable end-to-end: S02 (sync + PR command wiring), S03 (import re-scope)

## Tasks

- [x] **T01: Add createPR() types and implement on both providers** `est:1h`
  - Why: Retires the highest risk — PR/MR CLI output parsing for both `gh pr create` and `glab mr create`
  - Files: `src/providers/types.ts`, `src/providers/github.ts`, `src/providers/gitlab.ts`, `src/providers/__tests__/github.test.ts`, `src/providers/__tests__/gitlab.test.ts`
  - Do: Add `CreatePROpts` and `PRResult` types. Add `createPR()` to `IssueProvider`. Implement on both providers: build CLI args from opts, parse URL from stdout, throw `ProviderError` on failure or unparseable output. `gh pr create` outputs the PR URL on stdout. `glab mr create` outputs the MR URL on stdout. Both use `--yes`/no-editor flags to prevent interactive prompts. Include `Closes #N` in the body if `closesIssueId` is provided.
  - Verify: `npx vitest run src/providers/__tests__/github.test.ts src/providers/__tests__/gitlab.test.ts` — all existing + new tests pass
  - Done when: Both providers' `createPR()` works with mock exec, URL parsing is tested for success and failure cases, TypeScript compiles cleanly

- [x] **T02: Add readIntegrationBranch() to state helpers** `est:30m`
  - Why: Retires the META.json reading risk — S02 needs this to know which branch a PR targets
  - Files: `src/lib/state.ts`, `src/lib/__tests__/state.test.ts`
  - Do: Add `readIntegrationBranch(cwd, milestoneId)` that reads `.gsd/milestones/{MID}/{MID}-META.json`, parses JSON, returns `integrationBranch` string or `null`. Follow GSD core's pattern: validate branch name with `/^[a-zA-Z0-9_\-\/.]+$/`, return `null` for missing file, missing field, empty string, invalid branch name, or corrupt JSON. Use async `readFile` consistent with existing `readGSDState`.
  - Verify: `npx vitest run src/lib/__tests__/state.test.ts` — all existing + new tests pass
  - Done when: `readIntegrationBranch` handles present/missing/corrupt META.json, branch name validation matches GSD core, tests cover all edge cases

## Files Likely Touched

- `src/providers/types.ts`
- `src/providers/github.ts`
- `src/providers/gitlab.ts`
- `src/providers/__tests__/github.test.ts`
- `src/providers/__tests__/gitlab.test.ts`
- `src/lib/state.ts`
- `src/lib/__tests__/state.test.ts`
