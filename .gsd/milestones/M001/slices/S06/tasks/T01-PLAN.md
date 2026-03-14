---
estimated_steps: 6
estimated_files: 8
---

# T01: Fix registerTool API, add npm packaging metadata, and write README

**Slice:** S06 — npm packaging and distribution
**Milestone:** M001

## Description

Single task covering the entire S06 scope: fix the `registerTool` API mismatch that would cause a runtime crash in pi, add npm packaging metadata so the extension is distributable, and write installation documentation.

The API fix is the critical path — research identified that our `registerTool("name", {...})` two-arg pattern doesn't match pi's real `registerTool({name, label, ...})` single-arg API. The `execute` signature also differs: ours is `(params, ctx)`, pi's is `(toolCallId, params, signal, onUpdate, ctx)`. All three tool registrations (sync, close, import) need updating, plus the local type definitions and test mocks.

## Steps

1. Update `ToolDefinition` interface in `src/index.ts`: add `name: string` and `label: string` fields, change `execute` signature to `(toolCallId: string, params: unknown, signal: AbortSignal, onUpdate: unknown, ctx: ExtensionCommandContext) => Promise<ToolResult>`. Update `ExtensionAPI.registerTool` to take a single `ToolDefinition` arg.

2. Update all three `registerTool` calls in the extension factory to use the new single-arg format. Add `name` and `label` to each tool definition. Update execute functions to accept the 5-arg signature (destructure `toolCallId`, `params`, `signal`, `onUpdate`, `ctx` — only `params` is used by our logic).

3. Update test mocks in `sync.test.ts`, `close.test.ts`, and `import.test.ts` — `registerTool` mock now receives a single `ToolDefinition` object. Update assertions that inspect registered tools to read `tool.name` and `tool.execute(...)` with 5 args.

4. Add to `package.json`: `pi` manifest with `extensions: ["./src/index.ts"]`, `files: ["src", "dist", "README.md"]`, `keywords`, `license: "MIT"`, `engines: { "node": ">=18" }`, `repository`, `author`, `prepublishOnly` script.

5. Create `tsconfig.build.json` extending `tsconfig.json` with `exclude: ["src/**/__tests__"]` so `dist/` doesn't contain test files.

6. Write `README.md` covering: what the extension does, installation (`npm install -g gsd-issues` + settings.json config), `/issues setup` walkthrough, command reference (`sync`, `import`, `close`, `status`), tool reference for LLM callers, and configuration format.

## Must-Haves

- [ ] `ToolDefinition` has `name`, `label`, and 5-arg `execute` matching pi's real contract
- [ ] `ExtensionAPI.registerTool` takes single `ToolDefinition` arg (not two args)
- [ ] All three tool registrations (sync, close, import) use new API shape
- [ ] All existing tests pass — mock adjustments for new registerTool signature
- [ ] `package.json` has `pi.extensions: ["./src/index.ts"]`
- [ ] `package.json` has `files` field (src, dist, README.md)
- [ ] `package.json` has `prepublishOnly` script
- [ ] `tsconfig.build.json` excludes tests from dist
- [ ] `README.md` exists with installation and usage docs

## Verification

- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all 188+ tests pass
- `npx tsc -p tsconfig.build.json` — builds dist without test files
- `ls dist/**/__tests__` should fail (no test dirs in dist)
- `npm pack --dry-run` — tarball includes src/, dist/, README.md, excludes __tests__
- `node -e "const p = require('./package.json'); console.assert(p.pi?.extensions?.[0] === './src/index.ts')"` — pi manifest present

## Observability Impact

- **Tool registration shape** — pi validates `ToolDefinition.name` and `ToolDefinition.label` at registration time. After this task, a missing field will throw at extension load, visible in pi's startup log. Before this task, the two-arg pattern would silently produce a tool with `undefined` name in pi's registry.
- **Execute signature** — pi passes 5 args to `execute`. Before this task, the 2-arg signature would receive `toolCallId` as `params` and `params` as `ctx`, producing runtime type errors on first tool invocation. After this task, args are correctly destructured.
- **Future agent inspection** — run `npx tsc --noEmit` to verify type alignment, `npx vitest run` to verify mock fidelity, `npm pack --dry-run` to verify package contents.
- **Failure state visibility** — type errors surface at compile time via `tsc`. Registration errors surface at pi startup. Execute signature mismatches surface on first tool call with a descriptive error from the params destructuring.

## Inputs

- `src/index.ts` — current extension entry point with wrong registerTool API
- `src/commands/__tests__/sync.test.ts` — mocks registerTool with two-arg pattern
- `src/commands/__tests__/close.test.ts` — mocks registerTool with two-arg pattern
- `src/commands/__tests__/import.test.ts` — mocks registerTool with two-arg pattern
- `package.json` — current minimal config without pi manifest or npm metadata
- S06-RESEARCH.md findings on pi's real ToolDefinition interface

## Expected Output

- `src/index.ts` — updated types and registerTool calls matching pi's real API
- `src/commands/__tests__/sync.test.ts` — mock updated for single-arg registerTool
- `src/commands/__tests__/close.test.ts` — mock updated for single-arg registerTool
- `src/commands/__tests__/import.test.ts` — mock updated for single-arg registerTool
- `package.json` — complete npm metadata with pi manifest
- `tsconfig.build.json` — build config excluding tests
- `README.md` — installation and usage documentation
