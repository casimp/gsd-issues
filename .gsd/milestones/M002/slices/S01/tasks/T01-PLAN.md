---
estimated_steps: 5
estimated_files: 5
---

# T01: Add createPR() types and implement on both providers

**Slice:** S01 — PR/MR provider support and milestone-level mapping
**Milestone:** M002

## Description

Add `CreatePROpts` and `PRResult` types to the provider type system, add `createPR()` to the `IssueProvider` interface, and implement it on both `GitLabProvider` and `GitHubProvider`. This is the highest-risk work in S01 — the CLI output formats for `gh pr create` and `glab mr create` must be parsed reliably to extract PR/MR URLs.

## Steps

1. Add types to `src/providers/types.ts`:
   - `CreatePROpts`: `{ title: string, body: string, headBranch: string, baseBranch: string, closesIssueId?: number, draft?: boolean }`
   - `PRResult`: `{ url: string, number: number }` (number is the PR/MR IID)
   - Add `createPR(opts: CreatePROpts): Promise<PRResult>` to `IssueProvider` interface

2. Implement `GitHubProvider.createPR()`:
   - Build args: `["pr", "create", "--title", title, "--body", body, "--base", baseBranch, "--head", headBranch]`
   - Add `--draft` flag if `opts.draft` is true
   - If `closesIssueId` is set, append `\n\nCloses #N` to the body
   - Parse URL from stdout (gh outputs the PR URL on success): extract PR number with `/\/pull\/(\d+)/`
   - Throw `ProviderError` on non-zero exit or unparseable output

3. Implement `GitLabProvider.createPR()`:
   - Build args: `["mr", "create", "--title", title, "--description", body, "--target-branch", baseBranch, "--source-branch", headBranch, "--yes", "--no-editor"]`
   - Add `--draft` flag if `opts.draft` is true
   - If `closesIssueId` is set, append `\n\nCloses #N` to the description
   - Parse URL from stdout (glab outputs the MR URL on success): extract MR number with `/\/merge_requests\/(\d+)/`
   - Throw `ProviderError` on non-zero exit or unparseable output

4. Add tests to `src/providers/__tests__/github.test.ts`:
   - Creates PR with all fields, parses URL and number from stdout
   - Appends `Closes #N` when `closesIssueId` is provided
   - Passes `--draft` flag when draft is true
   - Throws `ProviderError` on non-zero exit code
   - Throws `ProviderError` when URL cannot be parsed from stdout
   - Passes `cwd` through when `projectPath` is set

5. Add tests to `src/providers/__tests__/gitlab.test.ts`:
   - Same test structure as GitHub but with `glab mr create` args and MR URL format
   - Verifies `--yes` and `--no-editor` flags are always included
   - Verifies `--source-branch` and `--target-branch` are used (not `--head`/`--base`)

## Must-Haves

- [ ] `CreatePROpts` and `PRResult` types exported from `providers/types.ts`
- [ ] `createPR()` on `IssueProvider` interface
- [ ] `GitHubProvider.createPR()` parses PR URL from `gh pr create` stdout
- [ ] `GitLabProvider.createPR()` parses MR URL from `glab mr create` stdout
- [ ] `Closes #N` appended to body when `closesIssueId` is set
- [ ] `ProviderError` thrown with diagnostic context on failure or unparseable output
- [ ] TypeScript compiles with no errors (`npx tsc --noEmit`)

## Verification

- `npx vitest run src/providers/__tests__/github.test.ts` — all existing + new createPR tests pass
- `npx vitest run src/providers/__tests__/gitlab.test.ts` — all existing + new createPR tests pass
- `npx tsc --noEmit` — no type errors

## Observability Impact

- **New error surface:** `ProviderError` thrown by `createPR()` on both providers carries `provider`, `operation` ("createPR"), `exitCode`, `stderr`, and `command` (the full CLI invocation). A future agent diagnosing a PR creation failure can inspect these fields directly.
- **Stdout included in parse failures:** When URL extraction fails on a successful CLI exit (code 0), the error message includes the raw stdout, making CLI output format changes immediately visible.
- **How to inspect:** Tests verify `ProviderError` fields on both exit-code failures and parse failures. At runtime, any `catch (err) { if (err instanceof ProviderError) ... }` path has full diagnostic context.

## Inputs

- `src/providers/types.ts` — existing type system with `IssueProvider`, `ExecFn`, `ProviderError`
- `src/providers/github.ts` — existing `GitHubProvider` with `run()` helper pattern
- `src/providers/gitlab.ts` — existing `GitLabProvider` with `run()` helper pattern
- `gh pr create --help` output — confirms PR URL printed on success, `--base`/`--head`/`--title`/`--body` flags
- `glab mr create --help` output — confirms MR URL printed on success, `--target-branch`/`--source-branch`/`--title`/`--description`/`--yes` flags

## Expected Output

- `src/providers/types.ts` — updated with `CreatePROpts`, `PRResult`, `createPR()` on interface
- `src/providers/github.ts` — `createPR()` implemented
- `src/providers/gitlab.ts` — `createPR()` implemented
- `src/providers/__tests__/github.test.ts` — ~6 new tests in a `createPR` describe block
- `src/providers/__tests__/gitlab.test.ts` — ~6 new tests in a `createPR` describe block
