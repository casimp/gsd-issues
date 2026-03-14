---
id: S05
parent: M001
milestone: M001
provides:
  - Extended Issue type with weight, milestone, assignee, description fields
  - GitLab and GitHub providers populate new fields from CLI output
  - importIssues() formatting function with weight sorting, truncation, event emission
  - "/issues import" command handler with --milestone and --labels flag parsing
  - gsd_issues_import LLM-callable tool with TypeBox schema
  - gsd-issues:import-complete event emitted through both command and tool paths
requires:
  - slice: S01
    provides: IssueProvider.listIssues(), Issue type, provider implementations
  - slice: S02
    provides: loadConfig(), Config type, /issues command routing
affects:
  - S06
key_files:
  - src/providers/types.ts
  - src/providers/gitlab.ts
  - src/providers/github.ts
  - src/lib/import.ts
  - src/commands/import.ts
  - src/index.ts
  - src/lib/__tests__/import.test.ts
  - src/commands/__tests__/import.test.ts
key_decisions:
  - Optional fields on Issue (weight, milestone, assignee, description) — backward-compatible with all existing consumers
  - First assignee only (assignees[0]) — matches the single-assignee config pattern
  - Filter defaults to state:'open' — import is primarily for fetching active work
  - Tool accepts state/assignee params beyond what the command parses — LLM callers get richer filtering
patterns_established:
  - Import module follows sync.ts structure: options interface, result type, core function, TypeBox schema export
  - Command handler follows close.ts pattern: parseFlags → loadConfig → resolve milestone → create provider → try/catch with notify
observability_surfaces:
  - gsd-issues:import-complete event with { issueCount } emitted on every import
  - ImportResult.markdown — full formatted output for inspection
  - ctx.ui.notify delivers formatted markdown (command path)
  - ToolResult.details carries { markdown, issueCount } for structured inspection (tool path)
  - ProviderError with full CLI context on failures (same as sync/close)
drill_down_paths:
  - .gsd/milestones/M001/slices/S05/tasks/T01-SUMMARY.md
  - .gsd/milestones/M001/slices/S05/tasks/T02-SUMMARY.md
duration: 2 tasks
verification_result: passed
completed_at: 2026-03-14
---

# S05: Import Workflow

**Import pipeline fetching issues from GitLab/GitHub, formatting as structured markdown with weight sorting and description truncation, exposed via `/issues import` command and `gsd_issues_import` LLM tool.**

## What Happened

Extended the `Issue` interface with 4 optional fields (`weight?`, `milestone?`, `assignee?`, `description?`), updated both provider implementations to populate them from CLI JSON output. GitLab maps weight, description, milestone.title, and assignees[0]. GitHub maps body (as description), milestone.title, and assignee — it has no weight equivalent, so that field stays undefined.

Built `importIssues()` in `src/lib/import.ts` following the sync.ts module pattern. It sorts issues by weight descending (unweighted last via `?? -1` sentinel), formats each as `## #ID: Title` with metadata lines for labels, weight, milestone, and assignee, truncates descriptions at 500 chars with `…` suffix, and emits `gsd-issues:import-complete`. Empty input returns "No issues found." deterministically.

Wired the command handler `handleImport()` in `src/commands/import.ts` following the close.ts pattern: parses `--milestone` and `--labels` flags (both `--flag value` and `--flag=value` syntax), loads config, resolves milestone, creates provider, calls `importIssues()`, and sends formatted markdown via `ctx.ui.notify`. Registered `gsd_issues_import` tool in index.ts with TypeBox schema accepting milestone, labels, state, and assignee params. Replaced the stub `case "import"` in the switch with a dynamic import of the real handler.

## Verification

- `npx vitest run` — 188 tests pass (13 files), zero regressions from 158 baseline
- `npx tsc --noEmit` — zero type errors
- `npx vitest run src/lib/__tests__/import.test.ts` — 17 import tests pass (formatting, sorting, truncation, empty list, events)
- `npx vitest run src/commands/__tests__/import.test.ts` — 13 command/tool tests pass (handler, tool registration, switch wiring)

## Requirements Advanced

- R005 — Import workflow fully implemented: fetch, format, sort, truncate, emit events via command and tool
- R010 — `gsd-issues:import-complete` event emitted through both command and tool paths
- R011 — `/issues import` command handler wired with flag parsing, import stub replaced
- R012 — `gsd_issues_import` tool registered with TypeBox schema

## Requirements Validated

- R005 — Contract proof complete: importIssues() formats issues from both providers, sorts by weight, truncates descriptions, handles empty lists, emits events. Command and tool paths both tested. 30 new tests.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

- Fixed 3 TypeScript errors in import command tests during slice completion — mock call args needed `as unknown as [string, string[]]` cast due to vitest's tuple typing on `mock.calls`. Tests already passed at runtime; this was a type-level fix only.

## Known Limitations

- Import is read-only and contract-tested only — no real CLI execution tested yet. UAT with real GitLab/GitHub remotes deferred to end-to-end validation.
- GitHub has no weight concept — weight field is always undefined for GitHub issues. Sorting still works (unweighted last).

## Follow-ups

- S06 (npm packaging) is the remaining slice before M001 is complete.

## Files Created/Modified

- `src/providers/types.ts` — Added 4 optional fields to Issue interface
- `src/providers/gitlab.ts` — Extended GlabListItem, updated listIssues mapping for new fields
- `src/providers/github.ts` — Added body to GhListItem and --json field list, updated listIssues mapping
- `src/lib/import.ts` — New: importIssues() function, ImportToolSchema, types
- `src/commands/import.ts` — New: handleImport() command handler with flag parsing
- `src/index.ts` — Registered gsd_issues_import tool, replaced import stub with real handler
- `src/lib/__tests__/import.test.ts` — New: 17 tests for import formatting pipeline
- `src/commands/__tests__/import.test.ts` — New: 13 tests for command handler and tool registration
- `src/providers/__tests__/gitlab.test.ts` — Updated mock data and assertions for new fields
- `src/providers/__tests__/github.test.ts` — Updated mock data and assertions for new fields

## Forward Intelligence

### What the next slice should know
- All 5 functional slices (S01-S05) are complete. S06 is packaging only — no new business logic.
- 188 tests across 13 files. TypeScript compiles clean. All modules are in `src/` with standard structure.
- The extension entry point is `src/index.ts` — it exports a default function receiving `ExtensionAPI`.

### What's fragile
- Provider test mock data must match the exact shape of CLI JSON output — if glab/gh change their JSON format, mock data and assertions need updating together.
- The `as unknown as [string, string[]]` casts in import command tests are a workaround for vitest mock typing — if the mock helper types change, these casts may need updating.

### Authoritative diagnostics
- `npx vitest run` — the single source of truth for all 188 tests across 13 files
- `npx tsc --noEmit` — type-level correctness check, must be zero errors

### What assumptions changed
- No assumptions changed — this was a straightforward low-risk slice that followed established patterns from sync and close.
