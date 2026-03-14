# S06: npm Packaging and Distribution

**Goal:** Extension is packaged for npm with correct pi manifest, fixed tool registration API, and installation documentation.
**Demo:** `npm pack` produces a clean tarball; `npx tsc --noEmit` passes; all 188 tests pass; package.json has `pi.extensions` pointing to `./src/index.ts`; `registerTool` calls match pi's real single-arg API.

## Must-Haves

- `registerTool` calls updated to single-arg `ToolDefinition` with `name`, `label`, and `execute(toolCallId, params, signal, onUpdate, ctx)` signature
- `ExtensionAPI` and `ToolDefinition` types updated to match pi's real contract
- `package.json` has `pi` manifest field with `extensions: ["./src/index.ts"]`
- `package.json` has `files` field whitelisting `src/` and `dist/` (excludes tests from npm tarball via separate tsconfig)
- `tsconfig.build.json` excludes `__tests__` dirs from compiled output
- `package.json` has npm metadata (author, license, repository, keywords, engines)
- `package.json` has `prepublishOnly` script running typecheck + test + build
- `README.md` with installation, setup, and usage documentation
- All 188+ existing tests still pass (no regressions)

## Verification

- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all tests pass (188+ baseline, no regressions)
- `npx tsc -p tsconfig.build.json` — builds `dist/` without test files
- `npm pack --dry-run` — verify tarball contents include `src/`, `dist/`, `README.md`, exclude `__tests__`
- `node -e "const p = require('./package.json'); console.assert(p.pi?.extensions?.[0] === './src/index.ts')"` — pi manifest present

## Tasks

- [x] **T01: Fix registerTool API, add npm packaging metadata, and write README** `est:45m`
  - Why: The entire slice — fix the API mismatch that would crash at load time, add packaging metadata for npm distribution, and write installation docs
  - Files: `src/index.ts`, `package.json`, `tsconfig.json`, `tsconfig.build.json`, `README.md`, `src/commands/__tests__/sync.test.ts`, `src/commands/__tests__/close.test.ts`, `src/commands/__tests__/import.test.ts`
  - Do: (1) Update `ToolDefinition` and `ExtensionAPI` types to match pi's real contract — single-arg registerTool, `label` field, 5-arg execute. (2) Update all three `registerTool` calls (sync, close, import) to use new signature. (3) Update test mocks for registerTool to accept single arg. (4) Add `pi` manifest, `files`, npm metadata, `prepublishOnly` script to package.json. (5) Create `tsconfig.build.json` extending base with test exclusion. (6) Write README.md with install, config, usage, and command reference.
  - Verify: `npx tsc --noEmit && npx vitest run && npx tsc -p tsconfig.build.json && npm pack --dry-run`
  - Done when: All tests pass, typecheck clean, `npm pack --dry-run` shows correct file list, README exists with installation instructions

## Observability / Diagnostics

- **Tool registration logged at load time** — pi logs each `registerTool` call. If `name` or `label` is missing, pi throws at load time with a descriptive error. Verify by checking pi's extension load output for the three tool names.
- **`npm pack --dry-run` output** — shows exact tarball contents. Verify no `__tests__` dirs, presence of `src/`, `dist/`, `README.md`.
- **`npx tsc --noEmit` exit code** — zero means type definitions match usage. Non-zero means a mismatch between our local types and how we call `registerTool`.
- **`npx vitest run` output** — 188+ tests verify that mocks match the new API shape. Any broken mock means a registration pattern was missed.
- **`node -e` pi manifest assertion** — verifies `package.json` has `pi.extensions` pointing to the right file. Failure means pi won't discover the extension.
- **Secrets/redaction** — No secrets involved in this slice. Config files may contain project paths but no tokens.

## Files Likely Touched

- `src/index.ts`
- `package.json`
- `tsconfig.json`
- `tsconfig.build.json`
- `README.md`
- `src/commands/__tests__/sync.test.ts`
- `src/commands/__tests__/close.test.ts`
- `src/commands/__tests__/import.test.ts`
