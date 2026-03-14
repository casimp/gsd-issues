---
id: S01
parent: M001
milestone: M001
provides:
  - IssueProvider interface with createIssue, closeIssue, listIssues, addLabels
  - Shared types (Issue, CreateIssueOpts, CloseIssueOpts, IssueFilter, IssueMapEntry, ExecFn, ExecResult)
  - ProviderError class with diagnostic fields (provider, operation, exitCode, stderr, command)
  - GitLabProvider wrapping glab CLI via injected ExecFn
  - GitHubProvider wrapping gh CLI via injected ExecFn
  - detectProvider(cwd) auto-detecting provider from git remote URL
  - loadIssueMap/saveIssueMap for ISSUE-MAP.json persistence with structural validation
requires: []
affects:
  - S02
  - S03
  - S04
  - S05
key_files:
  - src/providers/types.ts
  - src/providers/detect.ts
  - src/providers/gitlab.ts
  - src/providers/github.ts
  - src/lib/issue-map.ts
key_decisions:
  - ExecFn injection for testability — providers take exec function parameter, not direct pi.exec() import
  - State normalization — GitLab 'opened' mapped to 'open', GitHub 'OPEN'/'CLOSED' lowercased
  - URL→ID parsing via /\/issues\/(\d+)/ regex shared across both providers — validated as positive integer, throws on malformed
  - GitLab close is two CLI calls (close then update for done label) — glab doesn't support both in one command
  - GitHub --body always passed (empty string default) to prevent interactive editor mode
  - Deferred state helpers (readGSDState, parseRoadmapSlices) to S03 where they have a real consumer
patterns_established:
  - ExecFn injection — all modules that call CLIs accept an optional exec function, tests supply mocks
  - Private run() helper in providers centralizes exec + ProviderError throwing
  - parseHostname handles both SSH (git@host:path) and HTTPS (URL constructor) formats
  - loadIssueMap returns [] for missing file, throws with file path in message for corrupt data
  - Structural validation (check field names and types) over schema-library validation — zero runtime deps
observability_surfaces:
  - ProviderError carries { provider, operation, exitCode, stderr, command } for CLI failure diagnostics
  - Malformed stdout (exit 0 but unparseable) also throws ProviderError — catches CLI output format changes
  - loadIssueMap throws with file path context on corrupt JSON or invalid structure
  - detectProvider returns null (not throw) for unknown hosts — callers distinguish "no provider" from "detection failed"
drill_down_paths:
  - .gsd/milestones/M001/slices/S01/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S01/tasks/T02-SUMMARY.md
duration: 25m
verification_result: passed
completed_at: 2026-03-14
---

# S01: Provider Abstraction and Core Types

**IssueProvider interface with GitLab and GitHub CLI implementations, provider auto-detection from git remote, and ISSUE-MAP.json persistence — 50 tests passing, typecheck clean.**

## What Happened

Scaffolded the greenfield TypeScript project with vitest, strict tsconfig (ES2022/NodeNext), and `@types/node`.

Defined the full type surface in `src/providers/types.ts`: `IssueProvider` interface with `createIssue`, `closeIssue`, `listIssues`, `addLabels`; supporting types `Issue`, `CreateIssueOpts`, `CloseIssueOpts`, `IssueFilter`, `IssueMapEntry`; `ExecFn`/`ExecResult`/`ExecOptions` matching `pi.exec()` signature; and `ProviderError` class carrying `provider`, `operation`, `exitCode`, `stderr`, `command` for diagnostics.

Implemented `detectProvider(cwd, exec?)` — runs `git remote get-url origin`, parses hostname from SSH (`git@host:path`) or HTTPS URLs, maps `github.com` → `'github'`, `gitlab.com` → `'gitlab'`, anything else → `null`.

Implemented `loadIssueMap`/`saveIssueMap` — JSON persistence with structural validation checking field names and types. Missing file returns `[]`, corrupt data throws with file path in the error message. `saveIssueMap` creates parent directories via `mkdir -p`.

Implemented `GitLabProvider` wrapping `glab` CLI — `createIssue` uses `--yes --no-editor` for non-interactive mode, parses IID from stdout URL. `closeIssue` is two calls: `glab issue close` then `glab issue update --label` for done labels. `listIssues` uses `--output json` and normalizes GitLab's `opened` state to `open`. `addLabels` via `glab issue update --label`.

Implemented `GitHubProvider` wrapping `gh` CLI — `createIssue` always passes `--body` (empty string default) to avoid editor mode. `closeIssue` supports `--reason` for completed/not-planned. `listIssues` uses `--json` with field selection and normalizes uppercase states. `addLabels` via `gh issue edit --add-label`.

Both providers use a private `run()` method centralizing exec invocation and `ProviderError` throwing on non-zero exit codes. All provider methods are tested via mock exec functions — real CLI integration deferred to S03.

## Verification

- `npx vitest run` — 50 tests pass across 4 test files
  - `detect.test.ts` — 8 tests: SSH/HTTPS for github/gitlab, unknown host, malformed URL, git failure, empty stdout
  - `issue-map.test.ts` — 8 tests: round-trip, missing file, empty array, corrupt JSON, non-array, invalid entry, multiple entries, nested directory creation
  - `gitlab.test.ts` — 15 tests: create parses URL→IID, close calls correct args + done label, list parses JSON with state normalization, addLabels, projectPath, error on non-zero exit
  - `github.test.ts` — 19 tests: create parses URL→number, close passes `--reason`, list parses `--json` output with state normalization, addLabels, projectPath, error on non-zero exit, malformed stdout error
- `npx tsc --noEmit` — clean, zero errors

## Requirements Advanced

- R001 — Provider abstraction with auto-detection: IssueProvider interface defined, both providers implemented, detectProvider resolves git remotes
- R008 — ISSUE-MAP.json mapping persistence: loadIssueMap/saveIssueMap implemented with structural validation, round-trip tested

## Requirements Validated

None — contract-level proof only (mock-based tests). Real CLI integration validates in S03.

## New Requirements Surfaced

None.

## Requirements Invalidated or Re-scoped

None.

## Deviations

- Added `@types/node` as dev dependency — required for `node:` module type declarations under strict TypeScript, not in original plan
- Used `encoding: 'utf-8'` in `execFile` options to resolve TypeScript overload ambiguity — functionally identical

## Known Limitations

- Providers are tested with mocks only — real CLI integration deferred to S03
- `detectProvider` only handles `github.com` and `gitlab.com` — self-hosted instances return `null` (acceptable for now, noted as revisable in D002)
- State helpers `readGSDState()` and `parseRoadmapSlices()` deferred to S03 (decision D011)

## Follow-ups

None — all planned work complete. S02 consumes this slice's types and detection module.

## Files Created/Modified

- `package.json` — project init with vitest, typescript, @types/node
- `tsconfig.json` — ES2022/NodeNext, strict, declaration maps
- `vitest.config.ts` — node environment, test glob pattern
- `src/providers/types.ts` — IssueProvider interface, all shared types, ProviderError class
- `src/providers/detect.ts` — detectProvider() with SSH/HTTPS hostname parsing
- `src/providers/gitlab.ts` — GitLabProvider implementing IssueProvider via glab CLI
- `src/providers/github.ts` — GitHubProvider implementing IssueProvider via gh CLI
- `src/lib/issue-map.ts` — loadIssueMap/saveIssueMap with validation
- `src/providers/__tests__/detect.test.ts` — 8 detection tests
- `src/providers/__tests__/gitlab.test.ts` — 15 GitLab provider tests
- `src/providers/__tests__/github.test.ts` — 19 GitHub provider tests
- `src/lib/__tests__/issue-map.test.ts` — 8 issue-map tests

## Forward Intelligence

### What the next slice should know
- All types are in `src/providers/types.ts` — import `IssueProvider`, `CreateIssueOpts`, `CloseIssueOpts`, `IssueFilter`, `Issue`, `IssueMapEntry`, `ExecFn`, `ProviderError` from there
- Provider constructors take `(exec: ExecFn, projectPath?: string)` — in the extension, pass `pi.exec` as the exec function
- `detectProvider(cwd, exec?)` returns `'github' | 'gitlab' | null` — use this in S02 setup to auto-populate config
- `loadIssueMap` returns `IssueMapEntry[]` (empty array if file missing) — `saveIssueMap` creates parent dirs

### What's fragile
- URL→IID parsing depends on CLI stdout containing `/issues/\d+` — if glab or gh change their output format, `ProviderError` will be thrown with exit code 0 and the stdout in the error message
- GitLab state normalization (`opened` → `open`) is hardcoded — if GitLab adds new states, they'll pass through unnormalized

### Authoritative diagnostics
- `npx vitest run` — all 50 tests in under 2 seconds, covers every provider method and error path
- `npx tsc --noEmit` — full type safety verification
- `ProviderError` fields (`provider`, `operation`, `exitCode`, `stderr`, `command`) — first thing to inspect on CLI failures

### What assumptions changed
- None — slice executed as planned with only minor additions (@types/node dep, encoding option)
