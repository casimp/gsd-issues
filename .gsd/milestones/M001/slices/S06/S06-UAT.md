# S06: npm Packaging and Distribution — UAT

**Milestone:** M001
**Written:** 2026-03-14

## UAT Type

- UAT mode: mixed (artifact-driven + live-runtime)
- Why this mode is sufficient: Packaging is verified by inspecting artifacts (tarball, manifest, compiled output) and by runtime loading in pi. No UI or user-facing behavior beyond extension load.

## Preconditions

- Node.js >= 18 installed
- npm available
- pi installed and working (`pi --version`)
- A git repository with a GitHub or GitLab remote (for end-to-end verification of loaded extension)
- glab or gh CLI installed and authenticated (for post-load workflow verification)

## Smoke Test

1. Run `npm pack --dry-run` in the gsd-issues directory
2. **Expected:** Output shows `gsd-issues-0.1.0.tgz` with `src/`, `dist/`, `README.md` included. No errors.

## Test Cases

### 1. pi manifest is correct

1. Run `node -e "const p = require('./package.json'); console.log(JSON.stringify(p.pi, null, 2))"`
2. **Expected:** Output shows `{ "extensions": ["./src/index.ts"] }`

### 2. npm metadata is complete

1. Run `node -e "const p = require('./package.json'); console.log(p.name, p.version, p.license, p.engines?.node)"`
2. **Expected:** Output shows `gsd-issues 0.1.0 MIT >=18` (or appropriate values)

### 3. Build produces clean dist without tests

1. Run `npx tsc -p tsconfig.build.json`
2. Run `find dist -name '__tests__' -type d`
3. **Expected:** tsc exits 0. find returns no results (no test directories in dist).

### 4. Tarball includes correct files

1. Run `npm pack --dry-run`
2. Scan the "Tarball Contents" section
3. **Expected:** Contains `README.md`, `package.json`, all `src/**/*.ts` files, all `dist/**/*.js` and `dist/**/*.d.ts` files. Does NOT contain `node_modules/`, `.gsd/`, `vitest.config.*`, or `tsconfig.build.json`.

### 5. All tests pass

1. Run `npx vitest run`
2. **Expected:** 188 tests pass across 13 test files. Zero failures.

### 6. Typecheck passes

1. Run `npx tsc --noEmit`
2. **Expected:** Exit code 0, no output (zero type errors).

### 7. Extension loads in pi

1. Run `npm install -g gsd-issues` (or `npm link` from the project directory)
2. Add `"gsd-issues"` to pi's `settings.json` packages array
3. Start pi
4. **Expected:** pi loads without errors. Extension registration log shows three tools registered: `gsd_issues_sync`, `gsd_issues_close`, `gsd_issues_import`. The `/issues` command is available.

### 8. Commands are accessible after load

1. After extension loads in pi (test case 7), type `/issues`
2. **Expected:** Shows subcommand help or routes to default behavior. Subcommands `setup`, `sync`, `close`, `import` are available.

### 9. Tools are callable after load

1. After extension loads in pi (test case 7), ask the LLM to call `gsd_issues_sync` with no arguments
2. **Expected:** Tool executes (may fail due to missing config, but the tool is found and invoked — not "unknown tool").

### 10. prepublishOnly runs full verification

1. Run `npm run prepublishOnly` (or trigger via `npm publish --dry-run`)
2. **Expected:** Runs typecheck, then tests, then build. All three succeed. If any step fails, the publish is blocked.

### 11. README is useful

1. Open `README.md`
2. **Expected:** Contains: installation instructions (npm install -g + settings.json), setup wizard documentation, command reference for /issues sync/close/import/setup, tool reference for LLM callers, auto-close hook explanation, events list.

## Edge Cases

### npm link for local development

1. Run `npm link` in the gsd-issues directory
2. Add `"gsd-issues"` to pi's settings.json packages array
3. Start pi
4. **Expected:** Extension loads from the linked local directory. Changes to source files are picked up on pi restart.

### Missing pi in settings.json

1. Install the package globally but do NOT add it to settings.json packages array
2. Start pi
3. **Expected:** Extension does not load. No error — pi simply doesn't discover it.

### Corrupt package.json pi manifest

1. Temporarily change `pi.extensions` in package.json to `["./nonexistent.ts"]`
2. Attempt to load in pi
3. **Expected:** pi reports a clear error about the missing extension entry point. Does not silently fail.

## Failure Signals

- `npm pack --dry-run` shows missing `src/` or `dist/` directories
- `npx tsc --noEmit` produces type errors (ToolDefinition mismatch)
- `npx vitest run` shows test failures (mock/API shape mismatch)
- pi startup shows "unknown tool" or "registerTool" errors
- `/issues` command not found after extension load
- `dist/` contains `__tests__` directories

## Requirements Proved By This UAT

- R013 — npm packaging and distribution: package installs, pi manifest discovered, extension loads, commands and tools accessible

## Not Proven By This UAT

- R001–R012 are proven by their respective slice UATs (S01–S05). This UAT only covers the packaging and distribution layer.
- Actual npm registry publishing (npm publish) — verified only via dry-run.
- Cross-platform behavior (Windows, Linux) — tested only on the development platform.

## Notes for Tester

- Test cases 1–6 are artifact-driven and can be run without pi. They verify the package structure is correct.
- Test cases 7–10 require pi to be installed and running. These verify the extension actually loads and registers.
- The `npm pack` tarball includes test files in `src/` — this is expected and documented in the known limitations. The `dist/` output is clean.
- If `prepublishOnly` feels slow, it's running tsc + vitest + tsc-build sequentially. That's intentional — all three must pass before publish.
