# S03: Import re-scope and cleanup

**Goal:** `/issues import` supports re-scoping: close original tracker issues and create a milestone-level issue. All stale slice-era references cleaned up, `createProvider()` extracted to shared module.
**Demo:** Run re-scope flow via tool or command — originals closed, milestone issue created, ISSUE-MAP persisted. `createProvider` has one source of truth. JSDoc references reflect milestone model.

## Must-Haves

- `rescopeIssues()` in `lib/import.ts` closes originals and creates milestone issue via `syncMilestoneToIssue()` reuse
- Partial failure handling: create milestone issue first, persist to ISSUE-MAP, then close originals best-effort
- Double re-scope guard: skip if milestone already mapped (reuse sync's skip-if-mapped check)
- `/issues import` command gains re-scope subflow with interactive confirmation before closing originals
- `gsd_issues_import` tool gains re-scope params (original_issue_ids, milestone_id for re-scope)
- `gsd-issues:rescope-complete` event emitted with { milestoneId, createdIssueId, closedOriginals, closeErrors }
- `createProvider()` extracted to `lib/provider-factory.ts`, all 5 consumers updated
- Stale JSDoc fixed: `IssueMapEntry.localId` comment, `types.ts` header comment

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run` — all tests pass (235 baseline + new re-scope tests + provider-factory tests)
- `npx tsc --noEmit` — clean
- `grep -rn "function createProvider" src/` — returns exactly 1 result (in `lib/provider-factory.ts`)
- `grep "S02–S05\|slice ID like" src/providers/types.ts` — returns 0 matches
- Re-scope tests cover: happy path, partial failure (original close fails), double re-scope skip, already-closed originals tolerance
- Import command tests cover: re-scope confirmation flow
- Import tool tests cover: re-scope params schema and execution

## Observability / Diagnostics

- Runtime signals: `gsd-issues:rescope-complete` event with `{ milestoneId, createdIssueId, closedOriginals, closeErrors }`
- Inspection surfaces: ISSUE-MAP.json shows the new milestone mapping after re-scope
- Failure visibility: `closeErrors` array in rescope result captures per-original-issue failures with issue ID and error message
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `syncMilestoneToIssue()` from `lib/sync.ts`, `provider.closeIssue()` from provider interface, `loadIssueMap()`/`saveIssueMap()` from `lib/issue-map.ts`
- New wiring introduced in this slice: re-scope params on `gsd_issues_import` tool, re-scope subcommand flow in `/issues import`
- What remains before the milestone is truly usable end-to-end: UAT on real GitLab/GitHub remotes (outside this milestone's contract scope)

## Tasks

- [x] **T01: Add rescopeIssues() and wire into command and tool** `est:45m`
  - Why: Delivers R016 — the core new functionality of this slice. Users need to be able to import existing issues, plan a milestone from them, then close the originals and create a milestone-level issue.
  - Files: `src/lib/import.ts`, `src/commands/import.ts`, `src/index.ts`, `src/lib/__tests__/import.test.ts`, `src/commands/__tests__/import.test.ts`
  - Do: Add `RescopeOptions` interface (provider, config, milestoneId, originalIssueIds, cwd, mapPath, exec, emit, dryRun) and `rescopeIssues()` to `lib/import.ts`. Flow: check ISSUE-MAP for existing milestone mapping (skip if present), call `syncMilestoneToIssue()` to create the milestone issue, then iterate originals calling `provider.closeIssue()` best-effort with per-issue error collection. Emit `gsd-issues:rescope-complete`. In `commands/import.ts`, add a re-scope subflow triggered by `--rescope M001 --originals 42,57` flags — show confirmation before closing originals. In `index.ts`, expand `ImportToolSchema` with optional `rescope_milestone_id` and `original_issue_ids` params; when present, call `rescopeIssues()` instead of plain import. Add tests for: happy path, partial close failure, double re-scope skip, already-closed originals.
  - Verify: `npx vitest run` passes with new re-scope tests, `npx tsc --noEmit` clean
  - Done when: `rescopeIssues()` creates milestone issue, closes originals best-effort, persists to ISSUE-MAP, and both command and tool paths exercise it with tests

- [x] **T02: Extract createProvider to shared module and fix stale JSDoc** `est:20m`
  - Why: Addresses D023 trigger (5 consumers) — extract to single source of truth. Fixes stale slice-era references that are now misleading (D029 established milestone convention).
  - Files: `src/lib/provider-factory.ts`, `src/index.ts`, `src/commands/import.ts`, `src/commands/sync.ts`, `src/commands/close.ts`, `src/commands/pr.ts`, `src/providers/types.ts`
  - Do: Create `lib/provider-factory.ts` exporting `createProvider(config, exec)`. Update all 5 consumers to import from new location, delete inline copies. Fix `IssueMapEntry.localId` JSDoc from "slice ID like S01" to "milestone ID like M001". Fix `types.ts` header from "S02–S05" to reflect current scope. Verify no other stale slice-era comments remain across src/.
  - Verify: `npx vitest run` — all existing tests pass unchanged, `npx tsc --noEmit` clean, `grep -rn "function createProvider" src/` returns exactly 1 result
  - Done when: One `createProvider` definition, all consumers import it, stale JSDoc updated, all tests pass

## Files Likely Touched

- `src/lib/import.ts`
- `src/lib/__tests__/import.test.ts`
- `src/commands/import.ts`
- `src/commands/__tests__/import.test.ts`
- `src/index.ts`
- `src/lib/provider-factory.ts`
- `src/commands/sync.ts`
- `src/commands/close.ts`
- `src/commands/pr.ts`
- `src/providers/types.ts`
