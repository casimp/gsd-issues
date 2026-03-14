---
id: T01
parent: S06
milestone: M001
provides:
  - registerTool API matching pi's real single-arg ToolDefinition contract
  - npm packaging metadata with pi manifest
  - tsconfig.build.json excluding tests from dist
  - README.md with installation, setup, and usage documentation
key_files:
  - src/index.ts
  - package.json
  - tsconfig.build.json
  - README.md
key_decisions:
  - D028: registerTool updated to single-arg ToolDefinition with name, label, and 5-arg execute matching pi's real contract
patterns_established:
  - Tool execute signatures use 5-arg pattern (toolCallId, params, signal, onUpdate, ctx) with unused args prefixed _
  - tsconfig.build.json extends base tsconfig and excludes __tests__ for clean dist
observability_surfaces:
  - pi validates tool name/label at registration time — missing fields throw at startup
  - tsc --noEmit catches type mismatches between local ToolDefinition and usage
  - npm pack --dry-run shows exact tarball contents
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Fix registerTool API, add npm packaging metadata, and write README

**Updated registerTool to pi's real single-arg ToolDefinition API, added npm packaging metadata with pi manifest, and wrote installation/usage README.**

## What Happened

1. Updated `ToolDefinition` interface: added `name: string` and `label: string` fields, changed `execute` to 5-arg signature `(toolCallId, params, signal, onUpdate, ctx)`. Changed `ExtensionAPI.registerTool` from two-arg `(name, definition)` to single-arg `(tool: ToolDefinition)`.

2. Updated all three `registerTool` calls (sync, close, import) to single-arg format with `name` and `label` fields. Execute functions now accept 5 args with unused ones prefixed `_`.

3. Updated test mocks in sync.test.ts, close.test.ts, and import.test.ts: tool lookup changed from `call[0] === "name"` to `call[0].name === "name"`, definition access from `call[1]` to `call[0]`, and execute calls now pass 5 args.

4. Added to package.json: `pi.extensions: ["./src/index.ts"]`, `files: ["src", "dist", "README.md"]`, `keywords`, `license`, `author`, `repository`, `engines`, and `prepublishOnly` script.

5. Created `tsconfig.build.json` extending base with `exclude: ["src/**/__tests__"]`.

6. Wrote README.md covering installation, setup wizard, manual config, command reference, tool reference for LLM callers, auto-close hook, events, and requirements.

## Verification

- `npx tsc --noEmit` — zero type errors ✅
- `npx vitest run` — 188/188 tests pass ✅
- `npx tsc -p tsconfig.build.json` — builds dist without test files ✅
- `ls dist/**/__tests__` — fails as expected (no test dirs in dist) ✅
- `npm pack --dry-run` — tarball includes src/, dist/, README.md ✅
- `node -e "const p = require('./package.json'); console.assert(p.pi?.extensions?.[0] === './src/index.ts')"` — pi manifest present ✅

## Diagnostics

- Run `npx tsc --noEmit` to verify type alignment between local ToolDefinition and usage
- Run `npx vitest run` to verify mock fidelity with the registration API
- Run `npm pack --dry-run` to inspect tarball contents
- pi logs each registerTool call at load time; missing name/label throws descriptively

## Deviations

None.

## Known Issues

- `npm pack --dry-run` includes `src/**/__tests__` in the tarball since `files` whitelists the entire `src/` dir. This is acceptable — test files don't affect runtime and pi loads from `./src/index.ts`. To exclude them from npm would require `.npmignore` which conflicts with the `files` field approach. The `dist/` output is clean.

## Files Created/Modified

- `src/index.ts` — Updated ToolDefinition interface (name, label, 5-arg execute) and ExtensionAPI.registerTool (single-arg). Updated all three tool registrations.
- `src/commands/__tests__/sync.test.ts` — Updated mocks for single-arg registerTool and 5-arg execute
- `src/commands/__tests__/close.test.ts` — Updated mocks for single-arg registerTool and 5-arg execute
- `src/commands/__tests__/import.test.ts` — Updated mocks for single-arg registerTool and 5-arg execute
- `package.json` — Added pi manifest, files, keywords, license, author, repository, engines, prepublishOnly
- `tsconfig.build.json` — New build config excluding tests from dist
- `README.md` — Installation, setup, command/tool reference, and usage documentation
