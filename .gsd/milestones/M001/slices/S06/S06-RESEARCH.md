# S06: npm Packaging and Distribution — Research

**Date:** 2026-03-14

## Summary

S06 is packaging-only — no new business logic. The codebase is complete (188 tests, 13 files, typecheck clean) and needs to be wrapped for npm distribution so users can install via `npm install -g gsd-issues` and add it to their pi `settings.json` packages array.

Pi's package manager supports three source types: npm packages (`npm:gsd-issues`), git repos, and local paths. For npm packages, pi resolves the installed directory, reads `package.json` for a `pi` manifest field, and discovers extension entry points from `pi.extensions` paths. Pi uses `jiti` to transpile TypeScript at load time, so extensions can ship `.ts` source — but npm convention is compiled JS with declarations.

**Critical finding:** our `registerTool` calls use a two-arg `(name, {description, parameters, execute})` pattern with `execute(params, ctx)` signature. Pi's real API expects a single `ToolDefinition` object with `{name, label, description, parameters, execute(toolCallId, params, signal, onUpdate, ctx)}`. Our local `ExtensionAPI` interface must be updated to match the real pi contract before packaging. The `registerCommand` and `on()` signatures already match.

## Recommendation

1. **Fix `registerTool` calls** to match pi's real API: single arg with `name`, `label`, `description`, `parameters`, and `execute(toolCallId, params, signal, onUpdate, ctx)`.
2. **Update `ExtensionAPI` and `ToolDefinition`** types in `src/index.ts` to match the real pi contract.
3. **Ship TypeScript source** via `pi.extensions: ["./src/index.ts"]` in `package.json`. Pi uses `jiti` to transpile `.ts` at load time. Also build `dist/` for consumers who want compiled JS, but the pi manifest points to source. This avoids needing a `prepublish` build step and matches how the GSD extension works (loads `.ts` directly).
4. **Exclude test files** from the npm package via `files` field in `package.json`.
5. **Add README.md** with installation, setup, and usage documentation.
6. **Add npm metadata** (author, license, repository, keywords, engines).

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| TypeScript transpilation at load time | `jiti` (bundled in pi) | Pi already handles TS→JS for extensions. No need to require `dist/` for pi loading |
| Tool parameter schemas | `@sinclair/typebox` (bundled in pi) | Already used in S03-S05. Pi virtualModules makes it available to extensions |
| CLI execution | `pi.exec()` | Already used via ExecFn injection throughout |

## Existing Code and Patterns

- `~/.gsd/agent/extensions/gsd/package.json` — Reference pi extension manifest: `{ "pi": { "extensions": ["./index.ts"] } }`. Points to TypeScript source, not compiled JS.
- `pi/src/core/extensions/loader.ts` — `resolveExtensionEntries()` reads `pi.extensions` from package.json, falls back to `index.ts`/`index.js`. `loadExtensionModule()` uses `jiti.import()` for TS transpilation.
- `pi/src/core/package-manager.ts` — `installNpm()` runs `npm install -g` for user-scope packages. `collectPackageResources()` reads `pi` manifest from package.json. `getNpmInstallPath()` resolves to `<npm-global-root>/gsd-issues`.
- `pi/src/core/settings-manager.ts` — `settings.packages` array accepts `PackageSource` (string like `"npm:gsd-issues"` or object with filter). `settings.extensions` array accepts local paths.
- `pi/src/core/extensions/types.ts` — Real `ToolDefinition` interface: `{ name, label, description, parameters, execute(toolCallId, params, signal, onUpdate, ctx) }`. Real `ExtensionAPI.registerTool(tool: ToolDefinition)` takes a single argument.
- `src/index.ts` — Current extension entry point. Local `ExtensionAPI` types must be updated to match real pi contract.

## Constraints

- **`registerTool` API mismatch** — Our code calls `pi.registerTool("name", {...})` (two args). Pi's real API is `pi.registerTool({name, label, description, parameters, execute})` (single `ToolDefinition` arg). The `execute` signature also differs: ours is `(params, ctx)`, pi's is `(toolCallId, params, signal, onUpdate, ctx)`. Must fix all three tool registrations (sync, close, import).
- **`ToolDefinition` requires `label` field** — Pi's real `ToolDefinition` has a required `label: string` for UI display. Our tools don't set this. Must add labels to all three tools.
- **`@sinclair/typebox` is a virtual module in pi** — Pi bundles typebox and provides it via `virtualModules`/`alias`. Since we also declare it as a dependency in our `package.json`, npm will install it, and jiti should resolve our local copy. No conflict expected.
- **Test files in dist/** — Current `tsconfig.json` compiles tests into `dist/`. Need `exclude: ["src/**/__tests__"]` in tsconfig or a separate `tsconfig.build.json` to keep tests out of the npm package.
- **`node:fs/promises` and `node:path` imports** — Used directly throughout. Fine for Node.js, and pi runs on Node.js.
- **`pi.extensions` path format** — Must be relative to `package.json` location. Use `"./src/index.ts"` for source loading.

## Common Pitfalls

- **Shipping test files in npm package** — Tests are 50%+ of the file count. Use `"files"` field in `package.json` to whitelist only `src/` and `dist/`, or add `.npmignore` to exclude `__tests__` dirs. The `files` field is cleaner.
- **Missing `type: "module"` in package.json** — Already set. Required for ESM (`import`/`export`) to work. Good.
- **Forgetting `prepublishOnly` script** — Add `"prepublishOnly": "npm run typecheck && npm run test && npm run build"` to ensure CI/publish doesn't ship broken code.
- **`dist/` excluded by .gitignore** — Currently `.gitignore` has `dist/`. This is correct for git but means `npm publish` from git checkout won't include `dist/`. Using `"files"` field overrides `.gitignore` for npm publish, so this is fine IF we list `dist/` in `files`.
- **registerTool signature not updated** — This is the biggest risk. If we package without fixing the API, the extension will fail at load time in pi with a type error or `tool.name` being undefined.

## Open Risks

- **Tool registration API drift** — Our local `ExtensionAPI` types are hand-written to match the pi contract. If pi changes the API shape, our types won't catch it until runtime. This is a known limitation (D015) accepted in S02.
- **`@sinclair/typebox` version mismatch** — Pi bundles typebox. If our `package.json` pins a different version, there could be schema validation mismatches. Currently both are `^0.34.x` so this should be fine, but worth verifying at UAT time.
- **npm package name availability** — `gsd-issues` may already be taken on npm. Need to check registry before publishing. Fallback: `@gsd/issues` or `pi-ext-gsd-issues`.
- **No end-to-end UAT yet** — All 188 tests are mock-based. Real CLI integration testing against actual remotes is deferred to post-packaging. The packaging slice should not be blocked on this.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| npm packaging | (core Node.js/npm) | No skill needed — standard npm workflow |
| pi extensions | (pi internal) | No external skill — research from source code |

## Sources

- Pi extension loader: `jiti`-based TS transpilation, `pi.extensions` manifest in `package.json` (source: pi-coding-agent/src/core/extensions/loader.ts)
- Pi package manager: npm install flow, `settings.packages` array with `"npm:name"` format (source: pi-coding-agent/src/core/package-manager.ts)
- Pi settings manager: `PackageSource` type, `Settings.packages` field definition (source: pi-coding-agent/src/core/settings-manager.ts)
- Pi extension types: Real `ToolDefinition`, `ExtensionAPI`, `RegisteredCommand` interfaces (source: pi-coding-agent/src/core/extensions/types.ts)
- GSD extension: Reference manifest and tool registration pattern (source: ~/.gsd/agent/extensions/gsd/)
