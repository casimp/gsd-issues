# S01: Provider Abstraction and Core Types

**Goal:** Deliver the `IssueProvider` interface, GitLab and GitHub implementations (via CLI), provider auto-detection from git remote, and ISSUE-MAP.json persistence — all as library modules consumed by S02–S05.
**Demo:** Unit tests pass proving: both providers parse CLI output into typed results, `detectProvider()` resolves git remotes to the correct provider, and `loadIssueMap`/`saveIssueMap` round-trip correctly.

## Must-Haves

- `IssueProvider` interface with `createIssue`, `closeIssue`, `listIssues`, `addLabels` methods
- `CreateIssueOpts`, `CloseIssueOpts`, `IssueFilter`, `Issue`, `IssueMapEntry` types
- `GitLabProvider` implementing `IssueProvider` via `glab` CLI through an injected exec function
- `GitHubProvider` implementing `IssueProvider` via `gh` CLI through an injected exec function
- `detectProvider(cwd)` returning provider name from git remote URL (supports SSH and HTTPS, `github.com` and `gitlab.com`)
- `loadIssueMap(path)` and `saveIssueMap(path, entries)` for ISSUE-MAP.json persistence
- URL-to-IID parsing with validation (positive integer, loud failure on malformed output)
- Error handling: non-zero exit codes surface as typed errors, not silent failures

## Proof Level

- This slice proves: contract
- Real runtime required: no (mock-based tests — real CLI integration deferred to S03)
- Human/UAT required: no

## Verification

- `npx vitest run` — all tests pass
- `src/providers/__tests__/gitlab.test.ts` — GitLab provider: create parses URL→IID, close calls correct args, list parses JSON, error on non-zero exit
- `src/providers/__tests__/github.test.ts` — GitHub provider: create parses URL→number, close passes `--reason`, list parses `--json` output, error on non-zero exit
- `src/providers/__tests__/detect.test.ts` — detection: SSH/HTTPS for both gitlab.com and github.com, unknown host returns null
- `src/lib/__tests__/issue-map.test.ts` — round-trip write/read, empty file handling, corrupt file error
- `npx tsc --noEmit` — type-checks cleanly

## Observability / Diagnostics

- Runtime signals: provider methods throw typed `ProviderError` with command, exit code, stderr, and provider name — future agents can inspect exactly which CLI call failed and why
- Inspection surfaces: test output shows per-provider per-operation results
- Failure visibility: `ProviderError` carries `{ provider, operation, exitCode, stderr, command }` for diagnostics
- Redaction constraints: none (no secrets flow through provider layer — auth is handled by CLI config)

## Integration Closure

- Upstream surfaces consumed: none (first slice)
- New wiring introduced in this slice: none (library modules only — no extension registration)
- What remains before the milestone is truly usable end-to-end: config/setup (S02), sync workflow (S03), close hook (S04), import (S05), packaging (S06)

## Tasks

- [x] **T01: Project scaffolding, types, detection, and issue-map persistence** `est:45m`
  - Why: Establishes the project structure, test framework, shared types, provider detection, and issue-map module — everything except the CLI-wrapping provider implementations
  - Files: `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/providers/types.ts`, `src/providers/detect.ts`, `src/lib/issue-map.ts`, `src/providers/__tests__/detect.test.ts`, `src/lib/__tests__/issue-map.test.ts`
  - Do: Init package.json with vitest dev dep and TypeScript. Define `IssueProvider` interface, all shared types (`Issue`, `CreateIssueOpts`, `CloseIssueOpts`, `IssueFilter`, `IssueMapEntry`), and `ProviderError` class. Implement `detectProvider()` parsing git remote URLs (SSH and HTTPS) for github.com and gitlab.com — return `null` for unknown hosts. Implement `loadIssueMap`/`saveIssueMap` with JSON file I/O and validation. Write tests for detection and issue-map.
  - Verify: `npx vitest run` passes detection and issue-map tests; `npx tsc --noEmit` clean
  - Done when: types compile, detection resolves 4 URL variants correctly, issue-map round-trips, all tests green

- [x] **T02: GitLab and GitHub provider implementations with tests** `est:1h`
  - Why: Delivers the two provider implementations that wrap CLI calls through an injected exec function, completing the IssueProvider contract
  - Files: `src/providers/gitlab.ts`, `src/providers/github.ts`, `src/providers/__tests__/gitlab.test.ts`, `src/providers/__tests__/github.test.ts`
  - Do: Implement `GitLabProvider` — constructor takes exec function and project path. `createIssue` calls `glab issue create` with `--title`, `--description`, `--milestone`, `--assignee`, `--weight`, `--label`, `--yes`, `--no-editor`, parses IID from stdout URL. `closeIssue` calls `glab issue close` + `glab issue update` for done label. `listIssues` calls `glab issue list --output json`. `addLabels` calls `glab issue update --label`. Implement `GitHubProvider` similarly — `createIssue` via `gh issue create --title --body --milestone --assignee --label`, `closeIssue` via `gh issue close --reason`, `listIssues` via `gh issue list --json`, `addLabels` via `gh issue edit --add-label`. Both throw `ProviderError` on non-zero exit. Tests mock the exec function and verify argument construction, output parsing, and error handling.
  - Verify: `npx vitest run` — all provider tests pass; `npx tsc --noEmit` clean
  - Done when: Both providers conform to `IssueProvider`, URL→ID parsing validated for both, error paths tested, full test suite green

## Files Likely Touched

- `package.json`
- `tsconfig.json`
- `vitest.config.ts`
- `src/providers/types.ts`
- `src/providers/detect.ts`
- `src/providers/gitlab.ts`
- `src/providers/github.ts`
- `src/lib/issue-map.ts`
- `src/providers/__tests__/detect.test.ts`
- `src/providers/__tests__/gitlab.test.ts`
- `src/providers/__tests__/github.test.ts`
- `src/lib/__tests__/issue-map.test.ts`
