---
id: T01
parent: S03
milestone: M002
provides:
  - rescopeIssues() — creates milestone issue via syncMilestoneToIssue() then closes originals best-effort
  - RescopeOptions/RescopeResult types following options-bag pattern
  - ImportToolSchema expanded with rescope_milestone_id and original_issue_ids params
  - handleImport --rescope/--originals flags with interactive confirmation
  - gsd_issues_import tool routes to rescopeIssues when both rescope params present
key_files:
  - src/lib/import.ts
  - src/commands/import.ts
  - src/index.ts
  - src/lib/__tests__/import.test.ts
  - src/commands/__tests__/import.test.ts
key_decisions:
  - rescopeIssues() reuses syncMilestoneToIssue() for issue creation rather than calling provider.createIssue() directly — single code path for milestone issue creation
  - Already-closed originals treated as success using same ProviderError pattern from closeMilestoneIssue()
  - Command requires interactive confirmation before closing originals; tool path has no confirmation (LLM-driven)
patterns_established:
  - Re-scope follows same options-bag pattern as sync/close/PR with emit and dryRun
  - Per-item error collection pattern (closeErrors array) for best-effort batch operations
observability_surfaces:
  - gsd-issues:rescope-complete event with { milestoneId, createdIssueId, closedOriginals, closeErrors }
  - RescopeResult.closeErrors array exposes per-issue failures
  - ISSUE-MAP.json milestone entry persisted via syncMilestoneToIssue's crash-safe write
duration: ~15min
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Add rescopeIssues() and wire into command and tool

**Implemented rescopeIssues() with double-scope guard, best-effort original closing, and wired it into both the import tool schema and command handler with interactive confirmation.**

## What Happened

Added `RescopeOptions`, `RescopeResult` types and `rescopeIssues()` to `lib/import.ts`. The function checks ISSUE-MAP for existing milestone mapping (skip guard), delegates milestone issue creation to `syncMilestoneToIssue()`, then iterates originalIssueIds calling `provider.closeIssue()` with per-issue error collection. Already-closed originals are caught via ProviderError pattern matching (same as `closeMilestoneIssue()`).

Expanded `ImportToolSchema` with `rescope_milestone_id` and `original_issue_ids` optional params. Updated the `gsd_issues_import` tool handler in `index.ts` to route to `rescopeIssues()` when both params are present, returning structured result text.

Added `--rescope <milestoneId>` and `--originals <id1,id2,...>` flag parsing to `commands/import.ts`. When both flags present, handler shows confirmation prompt before executing. Abort path returns early with info notification.

Wrote 4 lib tests (happy path, partial failure, double re-scope skip, already-closed tolerance) and 3 command tests (confirm+execute, confirm+abort, equals-syntax flag parsing).

## Verification

- `npx vitest run` — 242 tests pass (235 baseline + 4 lib re-scope + 3 command re-scope)
- `npx tsc --noEmit` — clean compilation
- Re-scope lib tests: happy path (create + close all), partial failure (one fails, others succeed, closeErrors populated), double skip (already mapped, no provider calls), already-closed tolerance (ProviderError caught, counted as success)
- Re-scope command tests: confirmation accepted → executes and reports, confirmation declined → aborts, equals-syntax flag parsing
- Slice-level checks passing for this task: vitest, tsc, re-scope test coverage
- Slice-level checks deferred to T02/T03: createProvider extraction (5 copies remain), JSDoc cleanup (S02–S05 references remain)

## Diagnostics

- `gsd-issues:rescope-complete` event emitted with `{ milestoneId, createdIssueId, closedOriginals, closeErrors }` — check event payload for operation summary
- ISSUE-MAP.json gains milestone entry after successful re-scope — inspect file for mapping
- `RescopeResult.closeErrors` array: each entry has `{ issueId: number, error: string }` for failed original closes
- Double re-scope guard: if milestone already in ISSUE-MAP, result.skipped=true and no provider calls made

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/import.ts` — added RescopeOptions, RescopeResult types, rescopeIssues() function, expanded ImportToolSchema with rescope params
- `src/commands/import.ts` — added --rescope/--originals flag parsing, confirmation flow, re-scope result reporting, imported findRoadmapPath/join/dirname
- `src/index.ts` — imported rescopeIssues, added re-scope routing in gsd_issues_import execute handler
- `src/lib/__tests__/import.test.ts` — added 4 re-scope tests (happy, partial fail, double skip, already-closed)
- `src/commands/__tests__/import.test.ts` — added 3 re-scope command tests (confirm+execute, abort, flag parsing)
