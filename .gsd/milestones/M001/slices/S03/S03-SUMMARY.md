---
id: S03
parent: M001
milestone: M001
provides:
  - "syncSlicesToIssues(opts) — core sync pipeline creating issues for unmapped slices with crash-safe persistence"
  - "assignToEpic(exec, projectId, issueIid, epicConfig) — GitLab epic assignment via REST"
  - "handleSync(args, ctx, pi) — interactive /issues sync command with preview + confirmation"
  - "gsd_issues_sync tool — LLM-callable sync with structured ToolResult"
  - "parseRoadmapSlices(content) — extracts slice metadata from roadmap markdown"
  - "readGSDState(cwd) — reads active milestone ID from .gsd/STATE.md"
  - "findRoadmapPath(cwd, milestoneId) — constructs expected roadmap file path"
  - "createProvider(config, exec) — factory for GitLab/GitHub provider instantiation"
  - "SyncToolSchema — TypeBox schema for tool registration"
  - "Extended ExtensionAPI with registerTool, exec, events"
requires:
  - slice: S01
    provides: "IssueProvider interface, createIssue/closeIssue, loadIssueMap/saveIssueMap, detectProvider"
  - slice: S02
    provides: "loadConfig/Config type, /issues command routing with subcommand switch"
affects:
  - S04
  - S05
key_files:
  - src/lib/state.ts
  - src/lib/sync.ts
  - src/commands/sync.ts
  - src/index.ts
  - src/lib/__tests__/state.test.ts
  - src/lib/__tests__/sync.test.ts
  - src/commands/__tests__/sync.test.ts
key_decisions:
  - "D018: Epic group path discovered at sync time via glab api — avoids extending config schema"
  - "D019: Weight defaults hardcoded (fibonacci: 1/2/3/5, linear: 1/2/3) — risk-to-weight mapping without config bloat"
  - "D020: Crash-safe map writes — ISSUE-MAP.json saved after each creation, not batch-at-end"
  - "D021: Epic assignment best-effort — failure logs warning, doesn't abort sync"
  - "D022: Tool mode skips confirmation — LLM acts on user intent"
  - "D023: Provider created from config at call site — simple branching, not extracted"
patterns_established:
  - "Per-creation map persistence for crash safety"
  - "Best-effort enrichment pattern — epic warning event on failure, no abort"
  - "Description builder includes demo line + GSD metadata tag [gsd:M001/S01]"
  - "Tool registration at extension load time via pi.registerTool() with TypeBox schema"
  - "Command handler receives pi API as third argument for exec/events access"
  - "ToolResult structure: { content: [{type:'text', text}], details?: SyncResult }"
  - "Regex-based roadmap parsing matching codebase patterns (no markdown AST library)"
  - "Null-return pattern for missing state (readGSDState returns null, not throws)"
observability_surfaces:
  - "gsd-issues:sync-complete event with { milestone, created, skipped, errors } payload"
  - "gsd-issues:epic-warning event with { sliceId, issueId, warning } on epic assignment failure"
  - "SyncResult.errors array for per-slice failure inspection"
  - "ToolResult.content[0].text — sync summary for LLM consumption"
  - "ctx.ui.notify — sync results in command mode (info or warning level based on errors)"
drill_down_paths:
  - .gsd/milestones/M001/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T02-SUMMARY.md
  - .gsd/milestones/M001/slices/S03/tasks/T03-SUMMARY.md
duration: 45m
verification_result: passed
completed_at: 2026-03-14
---

# S03: Sync Workflow

**Full sync pipeline from roadmap slices to remote issues on GitLab/GitHub — with crash-safe mapping, GitLab epic/weight support, interactive confirmation, and LLM-callable tool.**

## What Happened

Built the sync workflow across three tasks:

**T01 — State helpers.** Pure parsing functions: `parseRoadmapSlices(content)` extracts `{ id, title, risk, done, description }` from roadmap markdown using regex (handles `[x]`/`[X]`/`[ ]`, optional risk annotations, `> After this:` descriptions). `readGSDState(cwd)` reads `.gsd/STATE.md` for the active milestone ID, returns null on missing file. `findRoadmapPath()` constructs the expected roadmap path.

**T02 — Sync orchestration.** `syncSlicesToIssues(opts)` iterates parsed slices, skips already-mapped entries by `localId`, builds `CreateIssueOpts` with title/description/milestone/assignee/labels/weight from config, calls `provider.createIssue()`, and saves the map entry immediately after each creation (crash-safe). For GitLab with epic config, discovers group path via `glab api projects/{id}` and POSTs to the epic issues endpoint — best-effort, failure emits warning event. Weight mapped from risk level using fibonacci (1/2/3/5) or linear (1/2/3) strategies. `dryRun` mode returns preview without touching provider or map. Emits `gsd-issues:sync-complete` event. Added `@sinclair/typebox` dependency. Exported `SyncToolSchema` for tool registration.

**T03 — Command + tool wiring.** Extended `ExtensionAPI` with `registerTool`, `exec`, and `events`. Created `handleSync` command handler — loads config, resolves milestone from config or GSD state, reads roadmap, parses slices, shows preview with slice IDs/titles, asks `ctx.ui.confirm()`, runs sync, reports results via `ctx.ui.notify`. Registered `gsd_issues_sync` tool at extension load time with TypeBox schema — runs full sync pipeline without confirmation, returns structured `ToolResult`. Replaced sync stub in index.ts switch statement.

## Verification

- `npx vitest run src/lib/__tests__/state.test.ts` — 18 tests pass (parser edge cases, state reading, path construction)
- `npx vitest run src/lib/__tests__/sync.test.ts` — 22 tests pass (create/skip, crash-safe saves, GitLab epic, weight strategies, dry-run, error resilience, event emission, both providers)
- `npx vitest run src/commands/__tests__/sync.test.ts` — 11 tests pass (happy path, decline, nothing-to-do, config error, provider instantiation, preview content, error reporting, tool registration, tool execute)
- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all 136 tests pass across 9 test files (no regressions from S01/S02)

## Requirements Advanced

- R003 — Sync pipeline implemented: roadmap slices → remote issues with milestone/assignee/labels/weight. Re-sync safe (skips mapped slices). Contract-verified via 33 sync-related tests.
- R006 — GitLab extras: epic assignment via REST API, weight mapping (fibonacci/linear from risk level), labels from config. Contract-verified.
- R007 — GitHub support: milestone assignment, label management passed through CreateIssueOpts. Contract-verified.
- R008 — ISSUE-MAP.json crash-safe writes during sync — saved after each creation, not batch-at-end.
- R009 — Prompted confirmation step: preview shows slices to create, user confirms before issue creation.
- R010 — Event bus: `gsd-issues:sync-complete` event emitted with `{ milestone, created, skipped, errors }` payload.
- R011 — `/issues sync` command wired up, replacing stub.
- R012 — `gsd_issues_sync` tool registered with TypeBox schema, LLM-callable.

## Requirements Validated

- None — all require UAT with real GitLab/GitHub remotes to move from contract-verified to validated.

## New Requirements Surfaced

- None

## Requirements Invalidated or Re-scoped

- None

## Deviations

- T02: Plan listed fibonacci weights as 1/2/3/5/8 but only four risk levels exist (low/medium/high/critical → 1/2/3/5). Value 8 has no corresponding risk level — harmless, unmapped risks get `undefined` weight.

## Known Limitations

- `createProvider()` is duplicated in `src/index.ts` and `src/commands/sync.ts` (D023) — trivial factory, not worth extracting until a third consumer.
- Sync aborts on first provider error for a slice but preserves partial map (crash-safe). No retry logic.
- Epic assignment requires network access to discover group path — no offline fallback.
- All verification is mock-based. Real CLI integration requires UAT with actual remotes.

## Follow-ups

- None — downstream slices (S04, S05) consume from S03 as designed.

## Files Created/Modified

- `src/lib/state.ts` — parseRoadmapSlices, readGSDState, findRoadmapPath exports
- `src/lib/__tests__/state.test.ts` — 18 tests for state helpers
- `src/lib/sync.ts` — syncSlicesToIssues, assignToEpic, SyncToolSchema exports
- `src/lib/__tests__/sync.test.ts` — 22 tests for sync pipeline
- `src/commands/sync.ts` — handleSync command handler
- `src/commands/__tests__/sync.test.ts` — 11 tests for command and tool paths
- `src/index.ts` — Extended ExtensionAPI, tool registration, replaced sync stub
- `package.json` — added @sinclair/typebox dependency

## Forward Intelligence

### What the next slice should know
- ExtensionAPI now has `registerTool`, `exec`, and `events` — S04/S05 can use these directly without extending further.
- `createProvider(config, exec)` exists in both index.ts and commands/sync.ts — if S04 needs it, consider extracting to a shared module.
- `loadIssueMap`/`saveIssueMap` from S01 are proven crash-safe in the sync flow — S04 (close) should use the same pattern.

### What's fragile
- Roadmap parser relies on exact markdown format: `- [ ] **S01: Title** \`risk:level\`\n  > After this: description` — any format changes in GSD's roadmap template would break parsing.
- Epic assignment depends on `glab api` returning JSON with `namespace.full_path` — GitLab API changes could break this silently (best-effort, so wouldn't crash sync).

### Authoritative diagnostics
- `npx vitest run` — 136 tests across 9 files, the definitive health check for the full codebase.
- ISSUE-MAP.json on disk — inspect to see current mapping state after any sync operation.
- `SyncResult.errors` array — first place to look if sync reports partial failures.

### What assumptions changed
- Plan assumed fibonacci weights would map 5 risk levels to 1/2/3/5/8 — only 4 risk levels exist (low/medium/high/critical), so the mapping is 1/2/3/5.
