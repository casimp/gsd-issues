---
id: M001
provides:
  - gsd-issues pi extension with three core workflows (sync, close, import)
  - IssueProvider abstraction with GitLab (glab) and GitHub (gh) implementations
  - Auto-detection of provider from git remote URL
  - Unified .gsd/issues.json config with interactive /issues setup command
  - ISSUE-MAP.json crash-safe mapping persistence per milestone
  - tool_result lifecycle hook for auto-close on slice completion
  - Three LLM-callable tools (gsd_issues_sync, gsd_issues_close, gsd_issues_import)
  - Slash commands (/issues setup, sync, close, import)
  - Event bus emissions (gsd-issues:sync-complete, close-complete, import-complete)
  - npm-distributable package with pi manifest and README
key_decisions:
  - D001: IssueProvider interface with GitLab/GitHub implementations — both providers first-class
  - D012: ExecFn injection for testability — providers take exec parameter, not direct pi.exec() import
  - D006: Sync is a prompted step (confirmation before creating remote issues), not auto or manual-only
  - D007: Lifecycle hook watches tool_result for S##-SUMMARY.md writes to trigger auto-close
  - D020: Crash-safe map writes — ISSUE-MAP.json saved after each issue creation
  - D028: registerTool uses single-arg ToolDefinition matching pi's real API contract
  - D015: Extension API types defined locally — no @gsd/pi-coding-agent dependency
patterns_established:
  - ExecFn injection — all CLI-calling modules accept optional exec function, tests supply mocks
  - Private run() helper in providers centralizes exec + ProviderError throwing
  - Config/IssueMap I/O — readFile/writeFile with mkdir, JSON.parse + structural validation, clear error messages
  - Interactive command pattern — guard ctx.hasUI → detect → discover → collect → assemble → save → validate → summarize
  - Per-creation map persistence for crash safety
  - Tool registration at extension load time via pi.registerTool() with TypeBox schema
  - Best-effort enrichment — epic/weight failures warn, don't abort
  - Null-return pattern for missing state (readGSDState returns null, detectProvider returns null for unknown hosts)
observability_surfaces:
  - ProviderError carries { provider, operation, exitCode, stderr, command } for CLI failure diagnostics
  - loadConfig throws with "Run /issues setup" on missing config — greppable diagnostic
  - validateConfig returns structured {valid, errors[]} for programmatic inspection
  - gsd-issues:sync-complete event with { milestone, created, skipped, errors }
  - gsd-issues:close-complete event with { milestone, sliceId, issueId, url }
  - gsd-issues:import-complete event with { issueCount }
  - CloseResult distinguishes { closed: true, issueId, url } from { closed: false, reason }
  - SyncResult.errors array for per-slice failure inspection
requirement_outcomes: []
duration: ~2h
verification_result: passed
completed_at: 2026-03-14
---

# M001: Issue Tracker Integration

**Full pi extension delivering sync, close, and import workflows for GitLab and GitHub issue trackers — 188 contract tests passing, npm-distributable, lifecycle hook wired for auto-close on slice completion.**

## What Happened

Built `gsd-issues` from scratch across six slices in a single session.

**S01** laid the foundation: `IssueProvider` interface with `createIssue`, `closeIssue`, `listIssues`, `addLabels`, implemented by `GitLabProvider` (wrapping `glab` CLI) and `GitHubProvider` (wrapping `gh` CLI). Provider auto-detection parses git remote URLs. `ISSUE-MAP.json` persistence with structural validation. All modules use ExecFn injection — providers take an exec function parameter rather than importing pi.exec() directly, enabling full mock-based testing without real CLIs. 50 tests.

**S02** added the config layer: `Config` type system with provider-specific sections (`GitLabConfig`, `GitHubConfig`), structural validation, and file I/O. The `/issues` command registered with subcommand routing. Interactive `/issues setup` flow discovers milestones and users via CLI, falls back gracefully on auth failures or empty lists. 35 new tests.

**S03** was the highest-risk slice — the sync pipeline. `parseRoadmapSlices()` extracts slice metadata from roadmap markdown via regex. `syncSlicesToIssues()` creates one issue per unmapped slice with crash-safe map persistence (save after each creation, not batch-at-end). GitLab epic assignment via REST API is best-effort — failure warns, doesn't abort. Weight mapped from risk level using fibonacci or linear strategies. Interactive command shows preview and requires confirmation; LLM tool skips confirmation (D022). 51 new tests.

**S04** wired the auto-close lifecycle. `closeSliceIssue()` resolves slice→issue from ISSUE-MAP.json, calls `provider.closeIssue()` with config-driven done label (GitLab) or close reason (GitHub). The `tool_result` hook matches write tools against `S##-SUMMARY.md` path patterns — fire-and-forget, all errors caught silently. Already-closed issues treated as success. Manual `/issues close` command and `gsd_issues_close` tool both delegate to the same function. 22 new tests.

**S05** completed the import workflow. Extended `Issue` type with optional `weight`, `milestone`, `assignee`, `description` fields (backward-compatible). `importIssues()` sorts by weight descending, truncates descriptions at 500 chars, formats as structured markdown. Command parses `--milestone` and `--labels` flags; tool exposes richer filtering (state, assignee). 30 new tests.

**S06** fixed a critical API mismatch — `registerTool` needed single-arg `ToolDefinition` with 5-arg `execute`, not the two-arg pattern used in S03–S05. Added npm packaging metadata (pi manifest, files whitelist, engines, prepublishOnly script), build config excluding tests from dist, and README with full installation and usage documentation.

## Cross-Slice Verification

**All verification is contract-level (mock-based). No UAT against real GitLab or GitHub remotes was performed.** This is a deliberate scope boundary — the codebase is code-complete and contract-proven; runtime validation against real remotes is the natural next step.

| Success Criterion | Status | Evidence |
|---|---|---|
| `/issues setup` → working config for GitLab or GitHub | ✅ contract-verified | S02: 11 setup tests covering both providers, CLI discovery, auth failure fallback, empty milestone fallback |
| Roadmap → confirmation prompt → real issues created | ✅ contract-verified | S03: handleSync preview + confirm flow (11 command tests), gsd_issues_sync tool (tool registration + execute tests) |
| Slice completion → auto-close mapped issue | ✅ contract-verified | S04: tool_result hook matches write tools + S##-SUMMARY.md pattern (14 hook/command tests), closeSliceIssue with done label/close reason (8 close tests) |
| Import existing issues for planning | ✅ contract-verified | S05: importIssues formatting with weight sort + truncation (17 tests), command + tool paths (13 tests) |
| `npm install -g gsd-issues` loads in pi | ✅ contract-verified | S06: pi manifest present, npm pack produces clean tarball (90 files, 77.6kB), registerTool matches pi's real API |

**Definition of Done checklist:**

- ✅ All three workflows (sync, close, import) work on both GitLab and GitHub — both providers implemented with full test coverage
- ✅ Lifecycle hook fires automatically on slice completion — tool_result hook wired for S##-SUMMARY.md pattern
- ✅ Sync surfaced as prompted step with user confirmation — handleSync preview + confirm, tool mode skips confirm
- ✅ Config is provider-agnostic with interactive setup — unified Config type, /issues setup with CLI discovery
- ✅ Events emitted on pi.events bus — sync-complete, close-complete, import-complete all wired
- ✅ Extension installs via npm and loads in pi — pi manifest, pack verified, registerTool API corrected
- ⚠️ Success criteria re-checked against live behavior — **not performed** (all contract-verified, UAT deferred)

**Aggregate verification:** `npx tsc --noEmit` clean, `npx vitest run` — 188/188 tests pass across 13 files in 1.6s.

## Requirement Changes

No requirement status transitions during this milestone. All 13 active requirements (R001–R013) remain `active` with contract-level proof. Moving to `validated` requires UAT on real remotes — none was performed. This is honest: contract tests prove the code does what it says; runtime tests prove it works in the real world.

## Forward Intelligence

### What the next milestone should know
- The extension is fully implemented but untested against real CLIs. The first priority for any follow-up work is UAT: run `/issues setup` on a real repo, sync a roadmap, complete a slice, verify close fires, run import.
- ExtensionAPI types are locally defined in `src/index.ts` — they match pi's contract as of March 2026 but will drift if pi's API changes. A future `@gsd/pi-types` package would eliminate this.
- `createProvider(config, exec)` factory is duplicated in `index.ts` and `commands/sync.ts` — extract to shared module if a third consumer appears.
- The `status` subcommand is still stubbed with "not yet implemented" — it wasn't in scope for M001 but the routing is already wired.

### What's fragile
- **CLI output parsing** — URL→IID/number extraction depends on `glab`/`gh` stdout containing `/issues/\d+`. If CLI output format changes, `ProviderError` fires with exit code 0. The error message includes stdout for diagnostics.
- **WRITE_TOOLS set** — hardcoded tool names (`write`, `Write`, `write_file`, `create_file`, `edit_file`) for the auto-close hook. If pi adds new write tools, the hook won't match them.
- **Roadmap parser** — regex-based, expects exact format `- [ ] **S01: Title** \`risk:level\`\n  > After this: description`. Format changes in GSD's roadmap template would break parsing silently.
- **Already-closed detection** — string matching on stderr for "already closed" / "already been closed". CLI wording changes could cause false ProviderErrors.

### Authoritative diagnostics
- `npx vitest run` — 188 tests across 13 files, the single source of truth for contract health
- `npx tsc --noEmit` — type-level correctness, must be zero errors
- `npm pack --dry-run` — exact tarball contents for distribution verification
- `ProviderError` fields (`provider`, `operation`, `exitCode`, `stderr`, `command`) — first thing to inspect on any CLI failure
- ISSUE-MAP.json on disk — inspect to see current mapping state after sync

### What assumptions changed
- `registerTool` was initially two-arg `("name", {...})` — pi actually uses single-arg `({name, label, ...})` with 5-arg execute. Caught and fixed in S06 (D028). Would have been a runtime crash.
- Fibonacci weight mapping assumed 5 risk levels (1/2/3/5/8) — only 4 exist (low/medium/high/critical → 1/2/3/5). Value 8 is unmapped; harmless.
- `readGSDState()` and `parseRoadmapSlices()` were originally scoped for S01 — deferred to S03 where they had a real consumer (D011). Correct call.

## Files Created/Modified

- `package.json` — project metadata, dependencies, pi manifest, npm distribution config
- `tsconfig.json` — strict TypeScript config (ES2022/NodeNext)
- `tsconfig.build.json` — build config excluding tests from dist
- `vitest.config.ts` — test runner config
- `README.md` — installation, setup, command/tool reference, usage documentation
- `src/index.ts` — extension entry point, command registration, tool registration, lifecycle hook
- `src/providers/types.ts` — IssueProvider interface, all shared types, ProviderError class
- `src/providers/detect.ts` — provider auto-detection from git remote
- `src/providers/gitlab.ts` — GitLab provider wrapping glab CLI
- `src/providers/github.ts` — GitHub provider wrapping gh CLI
- `src/lib/issue-map.ts` — ISSUE-MAP.json persistence with structural validation
- `src/lib/config.ts` — Config types, validation, file I/O
- `src/lib/state.ts` — GSD state reading and roadmap parsing helpers
- `src/lib/sync.ts` — sync pipeline with crash-safe mapping
- `src/lib/close.ts` — close orchestration with config-driven provider options
- `src/lib/import.ts` — import formatting with weight sorting and truncation
- `src/commands/setup.ts` — interactive setup command handler
- `src/commands/sync.ts` — sync command handler with preview/confirm
- `src/commands/close.ts` — close command handler with arg parsing
- `src/commands/import.ts` — import command handler with flag parsing
- `src/providers/__tests__/detect.test.ts` — 8 detection tests
- `src/providers/__tests__/gitlab.test.ts` — 15 GitLab provider tests
- `src/providers/__tests__/github.test.ts` — 19 GitHub provider tests
- `src/lib/__tests__/issue-map.test.ts` — 8 issue-map tests
- `src/lib/__tests__/config.test.ts` — 24 config tests
- `src/lib/__tests__/state.test.ts` — 18 state helper tests
- `src/lib/__tests__/sync.test.ts` — 22 sync pipeline tests
- `src/lib/__tests__/close.test.ts` — 8 close orchestration tests
- `src/lib/__tests__/import.test.ts` — 17 import formatting tests
- `src/commands/__tests__/setup.test.ts` — 11 setup command tests
- `src/commands/__tests__/sync.test.ts` — 11 sync command/tool tests
- `src/commands/__tests__/close.test.ts` — 14 close command/hook tests
- `src/commands/__tests__/import.test.ts` — 13 import command/tool tests
