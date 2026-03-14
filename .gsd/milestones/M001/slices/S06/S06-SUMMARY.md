---
id: S06
parent: M001
milestone: M001
provides:
  - npm-distributable package with pi manifest (pi.extensions pointing to ./src/index.ts)
  - registerTool calls matching pi's real single-arg ToolDefinition API
  - tsconfig.build.json excluding tests from dist output
  - README.md with installation, setup, and usage documentation
  - prepublishOnly script running typecheck + test + build
requires:
  - slice: S01
    provides: provider abstraction, issue-map, state helpers
  - slice: S02
    provides: config system, /issues command routing
  - slice: S03
    provides: sync workflow and gsd_issues_sync tool
  - slice: S04
    provides: auto-close workflow and gsd_issues_close tool
  - slice: S05
    provides: import workflow and gsd_issues_import tool
affects: []
key_files:
  - src/index.ts
  - package.json
  - tsconfig.build.json
  - README.md
key_decisions:
  - D028: registerTool updated from two-arg to single-arg ToolDefinition with name, label, and 5-arg execute matching pi's real contract
patterns_established:
  - Tool execute signatures use 5-arg pattern (toolCallId, params, signal, onUpdate, ctx) with unused args prefixed _
  - tsconfig.build.json extends base tsconfig and excludes __tests__ for clean dist output
  - package.json files field whitelists src/ and dist/ — test files ship in src but not in dist
observability_surfaces:
  - pi validates tool name/label at registration time — missing fields throw at startup
  - tsc --noEmit catches type mismatches between local ToolDefinition and usage
  - npm pack --dry-run shows exact tarball contents
duration: 15m
verification_result: passed
completed_at: 2026-03-14
---

# S06: npm Packaging and Distribution

**Extension packaged for npm with correct pi manifest, fixed registerTool API, build config, and installation documentation.**

## What Happened

Updated the `registerTool` API to match pi's real contract: single-arg `ToolDefinition` with `name`, `label`, and 5-arg `execute(toolCallId, params, signal, onUpdate, ctx)`. The previous two-arg pattern (`registerTool("name", {...})`) would have crashed at extension load time. All three tool registrations (sync, close, import) updated, along with their test mocks.

Added npm packaging metadata to `package.json`: `pi.extensions` manifest pointing to `./src/index.ts`, `files` whitelist for `src/` and `dist/`, `keywords`, `license`, `author`, `repository`, `engines`, and a `prepublishOnly` script that runs typecheck + test + build.

Created `tsconfig.build.json` extending the base config with `exclude: ["src/**/__tests__"]` so the compiled `dist/` directory contains no test files.

Wrote `README.md` covering installation (npm install -g + settings.json), setup wizard, manual config, command reference (/issues sync/close/import/setup), tool reference for LLM callers, auto-close hook behavior, and events.

## Verification

- `npx tsc --noEmit` — zero type errors ✅
- `npx vitest run` — 188/188 tests pass ✅
- `npx tsc -p tsconfig.build.json` — builds dist without test files ✅
- `ls dist/**/__tests__` — fails as expected (no test dirs in dist) ✅
- `npm pack --dry-run` — tarball includes src/, dist/, README.md (90 files, 77.6kB packed) ✅
- `node -e` pi manifest assertion — `pi.extensions[0] === './src/index.ts'` ✅

## Requirements Advanced

- R013 — npm packaging fully implemented: pi manifest, build config, tarball contents verified, README written

## Requirements Validated

- R013 — contract verified: `npm pack --dry-run` produces correct tarball, pi manifest present, typecheck clean, all 188 tests pass, dist excludes tests. Runtime validation (actual `npm install -g` + pi load) deferred to UAT.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- `npm pack` includes `src/**/__tests__` in the tarball since `files` whitelists the entire `src/` dir. Test files don't affect runtime — pi loads from `./src/index.ts`. The `dist/` output is clean. Excluding tests from npm would require `.npmignore` which conflicts with the `files` field approach.
- Runtime validation (actual npm install + pi extension loading) not yet performed — covered by UAT.

## Follow-ups

- none within this milestone. M001 is complete pending UAT.

## Files Created/Modified

- `src/index.ts` — Updated ToolDefinition interface (name, label, 5-arg execute) and ExtensionAPI.registerTool (single-arg). Updated all three tool registrations.
- `src/commands/__tests__/sync.test.ts` — Updated mocks for single-arg registerTool and 5-arg execute
- `src/commands/__tests__/close.test.ts` — Updated mocks for single-arg registerTool and 5-arg execute
- `src/commands/__tests__/import.test.ts` — Updated mocks for single-arg registerTool and 5-arg execute
- `package.json` — Added pi manifest, files, keywords, license, author, repository, engines, prepublishOnly
- `tsconfig.build.json` — New build config excluding tests from dist
- `README.md` — Installation, setup, command/tool reference, and usage documentation

## Forward Intelligence

### What the next slice should know
- This is the final slice in M001. No downstream slices.

### What's fragile
- The `ToolDefinition` and `ExtensionAPI` types are locally defined — they must stay in sync with pi's actual API. If pi changes its extension contract, these types need updating.

### Authoritative diagnostics
- `npx tsc --noEmit` — catches type drift between local ToolDefinition and actual usage
- `npm pack --dry-run` — shows exact tarball contents for distribution verification
- pi logs each `registerTool` call at load time — missing name/label throws descriptively

### What assumptions changed
- Original plan assumed two-arg `registerTool("name", {...})` — pi actually uses single-arg `registerTool({name, label, ...})`. Fixed in D028.
