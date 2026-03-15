---
id: S03
parent: M002
milestone: M002
provides:
  - "rescopeIssues() — creates milestone issue via syncMilestoneToIssue() then closes originals best-effort"
  - "RescopeOptions/RescopeResult types following options-bag pattern"
  - "ImportToolSchema expanded with rescope_milestone_id and original_issue_ids params"
  - "handleImport --rescope/--originals flags with interactive confirmation"
  - "gsd_issues_import tool routes to rescopeIssues when both rescope params present"
  - "gsd-issues:rescope-complete event with { milestoneId, createdIssueId, closedOriginals, closeErrors }"
  - "createProvider() in lib/provider-factory.ts — single source of truth for provider instantiation"
  - "Updated JSDoc in types.ts reflecting milestone convention (D029)"
requires:
  - slice: S01
    provides: "IssueProvider.createIssue(), IssueProvider.closeIssue(), milestone-level IssueMapEntry"
  - slice: S02
    provides: "syncMilestoneToIssue() pattern for creating milestone issues"
affects: []
key_files:
  - src/lib/import.ts
  - src/lib/__tests__/import.test.ts
  - src/commands/import.ts
  - src/commands/__tests__/import.test.ts
  - src/index.ts
  - src/lib/provider-factory.ts
  - src/providers/types.ts
  - src/commands/sync.ts
  - src/commands/close.ts
  - src/commands/pr.ts
key_decisions:
  - "D036: rescopeIssues calls syncMilestoneToIssue directly rather than duplicating create logic"
  - "D037: createProvider extracted to lib/provider-factory.ts from 5 inline copies (supersedes D023)"
patterns_established:
  - "Per-item error collection pattern (closeErrors array) for best-effort batch operations"
  - "Shared lib/ modules for cross-cutting concerns (provider-factory joins config, state, issue-map, sync, close, pr, import)"
observability_surfaces:
  - "gsd-issues:rescope-complete event with { milestoneId, createdIssueId, closedOriginals, closeErrors }"
  - "ISSUE-MAP.json milestone entry persisted via syncMilestoneToIssue's crash-safe write"
  - "RescopeResult.closeErrors array exposes per-issue failures"
drill_down_paths:
  - .gsd/milestones/M002/slices/S03/tasks/T01-SUMMARY.md
  - .gsd/milestones/M002/slices/S03/tasks/T02-SUMMARY.md
duration: ~25m
verification_result: passed
completed_at: 2026-03-14
---

# S03: Import re-scope and cleanup

**Re-scope flow for converting imported issues into milestone-level issues, plus provider-factory extraction and stale JSDoc cleanup.**

## What Happened

**T01** added `rescopeIssues()` to `lib/import.ts` with `RescopeOptions`/`RescopeResult` types. The function checks ISSUE-MAP for an existing milestone mapping (double re-scope guard), delegates issue creation to `syncMilestoneToIssue()`, then iterates original issue IDs calling `provider.closeIssue()` best-effort with per-issue error collection. Already-closed originals are treated as success via ProviderError pattern matching. Wired into both surfaces: `ImportToolSchema` expanded with `rescope_milestone_id` and `original_issue_ids` params (tool routes to rescopeIssues when both present), and `handleImport` gained `--rescope`/`--originals` flag parsing with interactive confirmation before closing originals. Emits `gsd-issues:rescope-complete` event.

**T02** extracted the `createProvider()` factory from 5 inline copies (`index.ts`, `commands/import.ts`, `commands/sync.ts`, `commands/close.ts`, `commands/pr.ts`) into a single `lib/provider-factory.ts` module. All consumers updated to import from the shared location. Fixed stale JSDoc in `types.ts`: header comment from "S02–S05" to current scope, `IssueMapEntry.localId` from "slice ID like S01" to "milestone ID". Scanned for remaining stale references — none found outside legitimate test fixtures.

## Verification

- `npx vitest run` — 242 tests pass across 15 test files
- `npx tsc --noEmit` — clean compilation
- `grep -rn "function createProvider" src/` — exactly 1 result in `lib/provider-factory.ts`
- `grep "S02–S05\|slice ID like" src/providers/types.ts` — 0 matches
- Re-scope lib tests: happy path, partial close failure, double re-scope skip, already-closed tolerance
- Re-scope command tests: confirmation accepted, confirmation declined, equals-syntax flag parsing
- Import tool tests: rescope params schema and execution routing

## Requirements Advanced

- R016 — `rescopeIssues()` implements the full re-scope flow: import existing issues, close originals best-effort, create milestone-level issue via sync reuse. Both command and tool surfaces wired.
- R005 — Import tool and command now support re-scope as an extension of the import workflow
- R010 — `gsd-issues:rescope-complete` event added with structured payload
- R011 — `/issues import` command gains `--rescope`/`--originals` flags
- R012 — `gsd_issues_import` tool gains `rescope_milestone_id`/`original_issue_ids` params

## Requirements Validated

- R016 — Contract-proven: happy path creates milestone issue and closes originals, partial failure collects per-issue errors, double re-scope skips, already-closed originals tolerated. Both command (with confirmation) and tool (direct execution) paths tested.

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- Re-scope requires originals to be identified by numeric issue ID — no label/milestone-based batch re-scope
- No undo for re-scope (closed originals stay closed)
- Runtime validation on real GitLab/GitHub remotes still pending UAT (outside this milestone's contract scope)

## Follow-ups

- none — this is the terminal slice of M002

## Files Created/Modified

- `src/lib/import.ts` — added RescopeOptions, RescopeResult types, rescopeIssues() function, expanded ImportToolSchema
- `src/lib/__tests__/import.test.ts` — added 4 re-scope tests
- `src/commands/import.ts` — added --rescope/--originals flag parsing, confirmation flow, re-scope result reporting
- `src/commands/__tests__/import.test.ts` — added 3 re-scope command tests
- `src/index.ts` — imported rescopeIssues, added re-scope routing in gsd_issues_import handler, imports from provider-factory
- `src/lib/provider-factory.ts` — new file, single createProvider() export
- `src/providers/types.ts` — updated header comment and IssueMapEntry.localId JSDoc
- `src/commands/sync.ts` — imports createProvider from provider-factory
- `src/commands/close.ts` — imports createProvider from provider-factory
- `src/commands/pr.ts` — imports createProvider from provider-factory

## Forward Intelligence

### What the next slice should know
- M002 is complete — all three slices delivered. The extension now operates at milestone level for sync, close, PR, and re-scope.
- 242 contract tests cover the full surface. Runtime UAT on real remotes is the remaining validation gap.

### What's fragile
- `syncMilestoneToIssue()` is now called from both sync and re-scope paths — changes to its signature or behavior affect two workflows
- Provider CLI output parsing relies on specific `glab`/`gh` output formats — CLI version upgrades could break parsing

### Authoritative diagnostics
- `npx vitest run` — single command validates the entire contract surface (242 tests, ~3s)
- `grep -rn "function createProvider" src/` — confirms no inline copies have crept back

### What assumptions changed
- D023 assumed createProvider wouldn't need extraction until a third consumer appeared — we hit 5 consumers, extraction was overdue
