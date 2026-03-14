---
estimated_steps: 5
estimated_files: 8
---

# T01: Project Scaffolding, Types, Detection, and Issue-Map Persistence

**Slice:** S01 — Provider abstraction and core types
**Milestone:** M001

## Description

Bootstrap the greenfield project: package.json, TypeScript config, Vitest test framework, and the foundational modules that don't involve CLI wrapping. This delivers the `IssueProvider` interface and all shared types (the contract that S02–S05 consume), `detectProvider()` for git remote auto-detection, and `loadIssueMap`/`saveIssueMap` for ISSUE-MAP.json persistence. Also defines `ProviderError` as the typed error class for all provider failures.

## Steps

1. Create `package.json` with `name: gsd-issues`, `vitest` and `typescript` as dev dependencies. Create `tsconfig.json` targeting ES2022/NodeNext. Create `vitest.config.ts`.
2. Define types in `src/providers/types.ts`: `IssueProvider` interface (`createIssue`, `closeIssue`, `listIssues`, `addLabels`), `Issue`, `CreateIssueOpts`, `CloseIssueOpts`, `IssueFilter`, `IssueMapEntry` types. Define `ExecFn` type matching `pi.exec()` signature. Define `ProviderError` class with `provider`, `operation`, `exitCode`, `stderr`, `command` fields.
3. Implement `detectProvider(cwd)` in `src/providers/detect.ts`: run `git remote get-url origin`, parse hostname from SSH (`git@host:`) and HTTPS (`https://host/`) URLs, return `'gitlab'` for `gitlab.com`, `'github'` for `github.com`, `null` for unknown. Takes an optional exec function for testability.
4. Implement `loadIssueMap(path)` and `saveIssueMap(path, entries)` in `src/lib/issue-map.ts`: read/write JSON array of `IssueMapEntry`, handle missing file (return empty array), validate structure on load, throw on corrupt JSON.
5. Write tests: `src/providers/__tests__/detect.test.ts` covering SSH github, HTTPS github, SSH gitlab, HTTPS gitlab, unknown host, malformed URL. `src/lib/__tests__/issue-map.test.ts` covering round-trip, empty file, missing file, corrupt JSON.

## Must-Haves

- [ ] `IssueProvider` interface with all four methods typed
- [ ] All shared types exported from `src/providers/types.ts`
- [ ] `ProviderError` class with diagnostic fields
- [ ] `detectProvider()` handles SSH and HTTPS for github.com and gitlab.com
- [ ] `loadIssueMap`/`saveIssueMap` round-trip correctly
- [ ] Vitest configured and detection + issue-map tests pass
- [ ] `npx tsc --noEmit` clean

## Verification

- `npx vitest run` — detection and issue-map tests all pass
- `npx tsc --noEmit` — no type errors

## Inputs

- S01-RESEARCH.md — CLI output formats, `pi.exec()` signature (`ExecResult { stdout, stderr, code, killed }`), constraint that `shell: false`
- Boundary map — exact method signatures downstream slices expect

## Expected Output

- `package.json` — project initialized with dev dependencies
- `tsconfig.json`, `vitest.config.ts` — build and test config
- `src/providers/types.ts` — all shared types and `ProviderError`
- `src/providers/detect.ts` — provider auto-detection from git remote
- `src/lib/issue-map.ts` — ISSUE-MAP.json persistence
- `src/providers/__tests__/detect.test.ts` — detection tests passing
- `src/lib/__tests__/issue-map.test.ts` — issue-map tests passing

## Observability Impact

- **`ProviderError` class** — all provider failures surface with `{ provider, operation, exitCode, stderr, command }`. A future agent can catch `ProviderError` and inspect exactly which CLI call failed, at what exit code, and what stderr said — no silent swallowing.
- **`detectProvider()` returns `null` for unknown** — callers can distinguish "no provider detected" from "detection failed" (the latter throws). This is a diagnostic seam for setup troubleshooting.
- **`loadIssueMap()` validation** — corrupt JSON throws with a clear message including the file path, making stale/broken ISSUE-MAP.json files immediately diagnosable rather than producing downstream type errors.
- **Test suite** — `npx vitest run` covers detection and persistence edge cases. A future agent running tests gets immediate signal on whether the foundational layer is intact.
