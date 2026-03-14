# S03: Sync Workflow

**Goal:** Sync roadmap slices to remote issues on GitLab/GitHub with milestone, assignee, labels, weight, and epic support — triggered via `/issues sync` command or `gsd_issues_sync` LLM tool with user confirmation before creating issues.
**Demo:** User has a roadmap, runs `/issues sync` (or the LLM calls `gsd_issues_sync`), sees a preview of slices to create, confirms, and real issues appear on the remote tracker with correct metadata. ISSUE-MAP.json is updated. Re-running skips already-mapped slices.

## Must-Haves

- `parseRoadmapSlices(path)` extracts slice ID, title, risk, completion status, and description from roadmap markdown
- `readGSDState(cwd)` finds the active milestone ID from `.gsd/STATE.md`
- `syncSlicesToIssues()` creates one issue per unmapped slice via the provider, skipping already-mapped entries
- GitLab epic assignment via `glab api` REST calls when `config.gitlab.epic` is set
- Weight passed through `CreateIssueOpts.weight` for GitLab when config has a weight strategy (hardcoded S/M/L defaults)
- Issue descriptions include slice demo line and GSD metadata for traceability
- ISSUE-MAP.json updated after each successful issue creation (not batch-at-end — crash-safe)
- `gsd-issues:sync-complete` event emitted on `pi.events` after sync finishes
- `/issues sync` command replaces the stub in index.ts, routes to sync handler
- `gsd_issues_sync` tool registered via `pi.registerTool()` with TypeBox parameter schemas
- ExtensionAPI types extended with `registerTool`, `exec`, `events`
- Confirmation prompt before creating issues (user sees preview, confirms)
- Re-sync is safe — existing mappings are skipped by matching `localId`

## Proof Level

- This slice proves: integration (real provider calls through mock exec, full sync pipeline exercised)
- Real runtime required: no (mock-based; real CLI integration is UAT)
- Human/UAT required: yes (user confirms issues appear on remote tracker — deferred to UAT)

## Verification

- `npx vitest run src/lib/__tests__/state.test.ts` — roadmap parser handles `[ ]`/`[x]`, risk levels, description lines, edge cases
- `npx vitest run src/lib/__tests__/sync.test.ts` — full sync pipeline: creates issues for unmapped slices, skips mapped, handles GitLab epic, emits event, saves map after each creation
- `npx vitest run src/commands/__tests__/sync.test.ts` — command/tool handler: loads config, instantiates provider, calls sync, handles confirmation flow
- `npx tsc --noEmit` — zero type errors
- All prior tests still pass: `npx vitest run` — all tests green

## Observability / Diagnostics

- Runtime signals: `gsd-issues:sync-complete` event with `{ milestone, created, skipped, total }` payload
- Inspection surfaces: ISSUE-MAP.json shows which slices are mapped to which issues
- Failure visibility: `ProviderError` carries CLI context on creation failure; sync aborts on first error with partial map saved (crash-safe writes)
- Redaction constraints: none (no secrets in sync flow)

## Integration Closure

- Upstream surfaces consumed: `IssueProvider` (S01), `loadIssueMap`/`saveIssueMap` (S01), `loadConfig`/`Config` (S02), `/issues` command routing (S02)
- New wiring introduced in this slice: `registerTool` and `exec` on ExtensionAPI, event bus emission, TypeBox dependency
- What remains before the milestone is truly usable end-to-end: auto-close on completion (S04), import workflow (S05), npm packaging (S06)

## Tasks

- [x] **T01: Roadmap parser and GSD state helpers** `est:25m`
  - Why: Sync needs to know which slices exist in the roadmap and which milestone is active. These were deferred from S01 (D011).
  - Files: `src/lib/state.ts`, `src/lib/__tests__/state.test.ts`
  - Do: Implement `parseRoadmapSlices(content: string)` returning `{ id, title, risk, done, description }[]` from roadmap markdown. Implement `readGSDState(cwd: string)` that reads `.gsd/STATE.md` and extracts the active milestone ID. Handle edge cases: missing description line, `[x]` vs `[ ]`, no risk annotation.
  - Verify: `npx vitest run src/lib/__tests__/state.test.ts` and `npx tsc --noEmit`
  - Done when: parser correctly extracts all slice metadata from real roadmap format, state reader finds milestone ID, 10+ tests pass

- [x] **T02: Sync orchestration module with GitLab epic support** `est:40m`
  - Why: Core value loop — takes parsed slices, creates issues through the provider, handles GitLab-specific extras (epic, weight), persists mappings crash-safely, emits completion event.
  - Files: `src/lib/sync.ts`, `src/lib/__tests__/sync.test.ts`, `package.json`
  - Do: Add `@sinclair/typebox` dependency. Implement `syncSlicesToIssues(opts)` accepting provider, config, parsed slices, issue map path, exec function, and event emitter. For each unmapped slice: build `CreateIssueOpts` with title, description (demo line + GSD metadata), milestone, assignee, labels, weight; call `provider.createIssue()`; for GitLab with epic config, call `assignToEpic()` using `glab api` REST (discover project ID from config, parse epic IID from config string like `"&42"`); save map entry immediately after creation. Emit `gsd-issues:sync-complete` with summary payload. Export TypeBox schema for the tool parameters.
  - Verify: `npx vitest run src/lib/__tests__/sync.test.ts` and `npx tsc --noEmit`
  - Done when: sync creates issues for unmapped slices, skips mapped, handles GitLab epic assignment, saves map after each creation, emits event — 15+ tests covering both providers

- [x] **T03: Wire sync command, register tool, extend extension API** `est:30m`
  - Why: Connects the sync module to user-facing surfaces — `/issues sync` command and `gsd_issues_sync` LLM tool — and extends the ExtensionAPI types to support `registerTool`, `exec`, and `events`.
  - Files: `src/commands/sync.ts`, `src/commands/__tests__/sync.test.ts`, `src/index.ts`
  - Do: Extend `ExtensionAPI` in index.ts with `registerTool`, `exec` (matching `ExecFn`), and `events` (with `emit` method). Create `src/commands/sync.ts` with `handleSync(args, ctx, pi)` that loads config, instantiates provider with `pi.exec`, loads roadmap from active milestone, calls `syncSlicesToIssues` with confirmation via `ctx.ui.confirm()`. Register `gsd_issues_sync` tool with TypeBox schema (`milestone_id` and `roadmap_path` params). Replace sync stub in index.ts switch statement.
  - Verify: `npx vitest run src/commands/__tests__/sync.test.ts`, `npx vitest run` (all tests), `npx tsc --noEmit`
  - Done when: `/issues sync` routes to handler, tool is registered with typed schema, confirmation flow works, all tests pass including prior S01/S02 tests

## Files Likely Touched

- `src/lib/state.ts`
- `src/lib/sync.ts`
- `src/commands/sync.ts`
- `src/index.ts`
- `src/lib/__tests__/state.test.ts`
- `src/lib/__tests__/sync.test.ts`
- `src/commands/__tests__/sync.test.ts`
- `package.json`
