---
id: T01
parent: S01
milestone: M001
provides:
  - IssueProvider interface and all shared types (Issue, CreateIssueOpts, CloseIssueOpts, IssueFilter, IssueMapEntry, ExecFn)
  - ProviderError class with diagnostic fields
  - detectProvider() for git remote auto-detection
  - loadIssueMap/saveIssueMap for ISSUE-MAP.json persistence
  - Vitest + TypeScript project scaffolding
key_files:
  - src/providers/types.ts
  - src/providers/detect.ts
  - src/lib/issue-map.ts
  - src/providers/__tests__/detect.test.ts
  - src/lib/__tests__/issue-map.test.ts
key_decisions:
  - Used child_process.execFile with encoding:'utf-8' for defaultExec to satisfy TypeScript's strict overload resolution
  - IssueMapEntry validation is structural (checks field names and types), not schema-library based — keeps zero runtime deps
patterns_established:
  - ExecFn injection for testability — all modules that call CLIs accept an optional exec function, tests supply mocks
  - parseHostname handles both SSH (git@host:path) and HTTPS (URL constructor) formats
  - loadIssueMap returns [] for missing file, throws with file path in message for corrupt data
observability_surfaces:
  - ProviderError carries { provider, operation, exitCode, stderr, command } for CLI failure diagnostics
  - loadIssueMap throws with file path context on corrupt JSON or invalid structure
  - detectProvider returns null (not throw) for unknown hosts — callers distinguish "no provider" from "detection failed"
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Project Scaffolding, Types, Detection, and Issue-Map Persistence

**Bootstrapped greenfield project with all shared types, provider detection, and issue-map persistence — 16 tests passing, typecheck clean.**

## What Happened

Created `package.json` with vitest/typescript/`@types/node` dev deps, `tsconfig.json` targeting ES2022/NodeNext with strict mode, and `vitest.config.ts`.

Defined the full type surface in `src/providers/types.ts`: `IssueProvider` interface with `createIssue`, `closeIssue`, `listIssues`, `addLabels`; supporting types `Issue`, `CreateIssueOpts`, `CloseIssueOpts`, `IssueFilter`, `IssueMapEntry`; `ExecFn`/`ExecResult`/`ExecOptions` matching `pi.exec()` signature; and `ProviderError` class with `provider`, `operation`, `exitCode`, `stderr`, `command` fields.

Implemented `detectProvider(cwd, exec?)` in `src/providers/detect.ts` — runs `git remote get-url origin`, parses hostname from SSH or HTTPS URLs, maps `github.com` → `'github'`, `gitlab.com` → `'gitlab'`, anything else → `null`. Includes a `defaultExec` using `child_process.execFile` (shell: false) for production use; tests inject mock exec functions.

Implemented `loadIssueMap`/`saveIssueMap` in `src/lib/issue-map.ts` — JSON persistence with structural validation. Missing file returns `[]`. Corrupt JSON or invalid structure throws with the file path in the error message. `saveIssueMap` creates parent directories.

## Verification

- `npx vitest run` — 16 tests pass (8 detect, 8 issue-map)
- `npx tsc --noEmit` — clean, zero errors

Slice-level verification (partial — T02 adds provider tests):
- ✅ `src/providers/__tests__/detect.test.ts` — SSH/HTTPS for github/gitlab, unknown host, malformed URL, git failure, empty stdout
- ✅ `src/lib/__tests__/issue-map.test.ts` — round-trip, missing file, empty array file, corrupt JSON, non-array JSON, invalid entry, multiple entries, nested directory creation
- ⬜ `src/providers/__tests__/gitlab.test.ts` — T02
- ⬜ `src/providers/__tests__/github.test.ts` — T02

## Diagnostics

- Run `npx vitest run` to verify the foundational layer is intact
- `ProviderError` is the typed error class — catch and inspect `.provider`, `.operation`, `.exitCode`, `.stderr`, `.command`
- `loadIssueMap` errors include file path — grep for "ISSUE-MAP.json at" in error messages

## Deviations

- Added `@types/node` as a dev dependency — not in the original plan but required for `node:` module type declarations under strict TypeScript
- Used `encoding: 'utf-8'` in `execFile` options to resolve TypeScript overload ambiguity — functionally identical, avoids Buffer→string conversion

## Known Issues

None.

## Files Created/Modified

- `package.json` — project init with vitest, typescript, @types/node
- `tsconfig.json` — ES2022/NodeNext, strict, declaration maps
- `vitest.config.ts` — node environment, test glob pattern
- `src/providers/types.ts` — IssueProvider interface, all shared types, ProviderError class
- `src/providers/detect.ts` — detectProvider() with SSH/HTTPS hostname parsing
- `src/lib/issue-map.ts` — loadIssueMap/saveIssueMap with validation
- `src/providers/__tests__/detect.test.ts` — 8 detection tests
- `src/lib/__tests__/issue-map.test.ts` — 8 issue-map tests
