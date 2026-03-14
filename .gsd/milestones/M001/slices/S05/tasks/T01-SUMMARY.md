---
id: T01
parent: S05
milestone: M001
provides:
  - Extended Issue type with weight, milestone, assignee, description fields
  - GitLab and GitHub providers populate new fields from CLI output
  - importIssues() formatting function with weight sorting, truncation, event emission
  - ImportToolSchema TypeBox schema for T02 tool registration
key_files:
  - src/providers/types.ts
  - src/providers/gitlab.ts
  - src/providers/github.ts
  - src/lib/import.ts
  - src/lib/__tests__/import.test.ts
  - src/providers/__tests__/gitlab.test.ts
  - src/providers/__tests__/github.test.ts
key_decisions:
  - Optional fields on Issue (not required) — backward-compatible with all existing consumers
  - First assignee only (assignees[0]) — import shows one assignee, matches the single-assignee config field
patterns_established:
  - Import module follows sync.ts structure: options interface, result type, core function, TypeBox schema export
  - Emit pattern: emit?.("gsd-issues:import-complete", { issueCount }) — consistent with sync/close events
observability_surfaces:
  - gsd-issues:import-complete event with { issueCount }
  - ImportResult.markdown for formatted output inspection
  - ImportResult.issueCount for quick numeric check
duration: 12m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Extend Issue type, update providers, and build import module

**Extended the Issue type with 4 optional fields, updated both providers to populate them from CLI JSON, and built the importIssues() formatting pipeline with weight sorting and description truncation.**

## What Happened

Added `weight?`, `milestone?`, `assignee?`, `description?` to the `Issue` interface. Updated `GlabListItem` in gitlab.ts to include `weight`, `description`, `milestone` (object), and `assignees` (array), then mapped them in `listIssues`. Updated `GhListItem` in github.ts to add `body`, appended it to the `--json` field list, and mapped `milestone`, `assignee`, `description` in `listIssues`. GitHub has no weight equivalent — field stays undefined.

Built `importIssues()` in `src/lib/import.ts` following the sync.ts module pattern. It sorts issues by weight descending (unweighted last via `?? -1` sentinel), formats each as `## #ID: Title` with metadata lines for labels, weight, milestone, and assignee, truncates descriptions at 500 chars with `…` suffix, and emits `gsd-issues:import-complete`. Empty input returns "No issues found." deterministically. Exported `ImportToolSchema` TypeBox definition for T02.

Updated both provider test files: enriched mock data with the new fields, updated `toEqual` assertions to match the expanded Issue shape. The previously-unasserted second issue in both tests now has full `toEqual` coverage.

## Verification

- `npx vitest run src/lib/__tests__/import.test.ts` — 17 tests pass (formatting, sorting, truncation, empty list, event emission, optional fields)
- `npx vitest run src/providers/__tests__/gitlab.test.ts src/providers/__tests__/github.test.ts` — 34 tests pass, zero regressions
- `npx vitest run` — 175 tests pass (all 12 test files), zero regressions from baseline 158
- `npx tsc --noEmit` — zero type errors

Slice-level checks:
- ✅ `npx vitest run` — all tests pass, zero regressions
- ✅ `npx tsc --noEmit` — zero type errors
- ✅ `npx vitest run src/lib/__tests__/import.test.ts` — import tests pass
- ⏳ `npx vitest run src/commands/__tests__/import.test.ts` — T02 (command/tool tests don't exist yet)

## Diagnostics

- `ImportResult.issueCount` gives a quick numeric check that import ran
- `ImportResult.markdown` is the full formatted output — grep for `## #` headers to count issues
- `gsd-issues:import-complete` event emitted with `{ issueCount }` — watch in pi event bus
- Provider errors during `listIssues` surface as `ProviderError` with full CLI context (same as sync/close)

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/providers/types.ts` — Added 4 optional fields to `Issue` interface
- `src/providers/gitlab.ts` — Extended `GlabListItem` with weight/description/milestone/assignees, updated `listIssues` mapping
- `src/providers/github.ts` — Added `body` to `GhListItem` and `--json` field list, updated `listIssues` mapping
- `src/lib/import.ts` — New: `importIssues()` function, `ImportToolSchema`, types
- `src/lib/__tests__/import.test.ts` — New: 17 tests covering formatting, sorting, truncation, empty list, events
- `src/providers/__tests__/gitlab.test.ts` — Updated mock data and assertions for new fields
- `src/providers/__tests__/github.test.ts` — Updated mock data and assertions for new fields
- `.gsd/milestones/M001/slices/S05/S05-PLAN.md` — Added Observability / Diagnostics section
- `.gsd/milestones/M001/slices/S05/tasks/T01-PLAN.md` — Added Observability Impact section
