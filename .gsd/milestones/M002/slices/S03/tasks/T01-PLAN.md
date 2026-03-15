---
estimated_steps: 6
estimated_files: 5
---

# T01: Add rescopeIssues() and wire into command and tool

**Slice:** S03 — Import re-scope and cleanup
**Milestone:** M002

## Description

Implement the re-scope flow that bridges imported tracker issues to GSD milestones. `rescopeIssues()` closes the original tracker issues and creates a single milestone-level issue, following the established options-bag pattern. The command path gets interactive confirmation before closing originals. The tool path gets new schema params for LLM callers. This delivers R016.

## Steps

1. Add `RescopeOptions` and `RescopeResult` types to `lib/import.ts`. Options: provider, config, milestoneId, originalIssueIds (number[]), cwd, mapPath, exec, emit, dryRun. Result: created (IssueMapEntry or null), closedOriginals (number[]), closeErrors ({issueId, error}[]), skipped (boolean).
2. Implement `rescopeIssues()`: check ISSUE-MAP for existing milestone mapping → skip if present. Call `syncMilestoneToIssue()` to create the milestone issue. Then iterate `originalIssueIds`, calling `provider.closeIssue()` on each with config's done_label. Collect per-issue errors (catch ProviderError, log ID + message). Emit `gsd-issues:rescope-complete` event with `{ milestoneId, createdIssueId, closedOriginals, closeErrors }`.
3. Expand `ImportToolSchema` with optional `rescope_milestone_id: Type.Optional(Type.String())` and `original_issue_ids: Type.Optional(Type.Array(Type.Number()))`. In the tool's execute handler in `index.ts`, when both are present, call `rescopeIssues()` instead of plain import. Return structured result.
4. In `commands/import.ts`, add `--rescope <milestoneId>` and `--originals <id1,id2,...>` flag parsing. When both flags present: show confirmation ("Close N original issues and create milestone issue for <milestoneId>?"), on confirm call `rescopeIssues()`, report result.
5. Write tests in `lib/__tests__/import.test.ts`: happy path (create + close all), partial failure (one original fails to close — others still closed, result has closeErrors), double re-scope (milestone already mapped — skip, no provider calls), already-closed original tolerance.
6. Write tests in `commands/__tests__/import.test.ts`: re-scope flag parsing, confirmation flow (confirm=true → executes, confirm=false → aborts), result notification.

## Must-Haves

- [ ] `rescopeIssues()` exported from `lib/import.ts` with options-bag pattern matching sync/close/PR
- [ ] Creates milestone issue via `syncMilestoneToIssue()` (reuse, not duplicate)
- [ ] Closes originals best-effort with per-issue error collection
- [ ] Persists to ISSUE-MAP immediately via sync's crash-safe writes
- [ ] Double re-scope guard: skip if milestone already mapped
- [ ] `gsd-issues:rescope-complete` event emitted
- [ ] Tool schema expanded with rescope params, tool handler routes to rescopeIssues when present
- [ ] Command handler has interactive confirmation before closing originals
- [ ] Tests cover happy path, partial failure, double skip, and already-closed tolerance

## Verification

- `npx vitest run` — all 235 baseline tests pass + new re-scope tests pass
- `npx tsc --noEmit` — clean compilation
- Re-scope lib tests: at least 4 new tests (happy, partial fail, double skip, already-closed)
- Re-scope command tests: at least 3 new tests (confirm+execute, confirm+abort, flag parsing)

## Observability Impact

- Signals added: `gsd-issues:rescope-complete` event with `{ milestoneId, createdIssueId, closedOriginals, closeErrors }`
- How a future agent inspects this: check ISSUE-MAP.json for milestone entry after re-scope, check event payload for closeErrors
- Failure state exposed: `closeErrors` array in RescopeResult, each entry has `{ issueId: number, error: string }`

## Inputs

- `src/lib/sync.ts` — `syncMilestoneToIssue()` options-bag pattern and SyncOptions interface
- `src/lib/close.ts` — `closeMilestoneIssue()` for already-closed tolerance pattern
- `src/providers/types.ts` — `IssueProvider.closeIssue()` signature, `IssueMapEntry` type
- `src/lib/import.ts` — existing `importIssues()` and `ImportToolSchema`
- `src/commands/import.ts` — existing `handleImport()` and flag parsing pattern
- `src/index.ts` — existing `gsd_issues_import` tool registration
- S02 summary — options-bag convention, event payload patterns

## Expected Output

- `src/lib/import.ts` — `rescopeIssues()` function, `RescopeOptions`/`RescopeResult` types, expanded `ImportToolSchema`
- `src/commands/import.ts` — re-scope flag parsing, confirmation flow, result reporting
- `src/index.ts` — updated `gsd_issues_import` execute handler with re-scope routing
- `src/lib/__tests__/import.test.ts` — re-scope test suite (4+ tests)
- `src/commands/__tests__/import.test.ts` — re-scope command tests (3+ tests)
