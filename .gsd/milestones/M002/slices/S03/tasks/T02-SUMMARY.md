---
id: T02
parent: S03
milestone: M002
provides:
  - "createProvider() in lib/provider-factory.ts — single source of truth for provider instantiation"
  - "Updated JSDoc in types.ts reflecting milestone convention (D029)"
key_files:
  - src/lib/provider-factory.ts
  - src/providers/types.ts
key_decisions:
  - "Used Config type directly (from lib/config.ts) instead of Awaited<ReturnType<typeof loadConfig>> — cleaner, same type at runtime"
patterns_established:
  - "Shared lib/ modules for cross-cutting concerns (provider-factory joins config, state, issue-map, sync, close, pr, import)"
observability_surfaces:
  - "none — pure mechanical refactor, no runtime behavior changes"
duration: 10m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Extract createProvider to shared module and fix stale JSDoc

**Extracted 5 duplicate `createProvider()` functions into single `lib/provider-factory.ts` and fixed stale slice-era JSDoc references.**

## What Happened

Created `src/lib/provider-factory.ts` exporting `createProvider(config: Config, exec: ExecFn): IssueProvider`. Updated all 5 consumers (`src/index.ts`, `src/commands/import.ts`, `src/commands/sync.ts`, `src/commands/close.ts`, `src/commands/pr.ts`) to import from the shared module, removing inline copies and now-unused direct imports of `GitLabProvider`/`GitHubProvider`.

Fixed stale JSDoc in `src/providers/types.ts`:
- Header comment: "S02–S05" → "the sync, close, import, and PR pipelines"
- `IssueMapEntry.localId`: "slice ID like S01" → 'milestone ID (e.g. "M001")'

Scanned for remaining stale references — found only legitimate test fixtures and a regex comment in `state.ts` that correctly describes slice ID capture behavior.

## Verification

- `npx tsc --noEmit` — clean (no errors)
- `npx vitest run` — 242 tests pass across 15 test files (no modifications needed)
- `grep -rn "function createProvider" src/` — exactly 1 result in `lib/provider-factory.ts`
- `grep "S02–S05\|slice ID like" src/providers/types.ts` — 0 matches

### Slice-level verification status

| Check | Status |
|---|---|
| `npx vitest run` — all tests pass | ✅ 242 passed |
| `npx tsc --noEmit` — clean | ✅ |
| `grep -rn "function createProvider" src/` — exactly 1 result | ✅ |
| `grep "S02–S05\|slice ID like" src/providers/types.ts` — 0 matches | ✅ |
| Re-scope tests cover happy path, partial failure, double skip, already-closed | ✅ (from T01) |
| Import command tests cover re-scope confirmation flow | ✅ (from T01) |
| Import tool tests cover re-scope params schema and execution | ✅ (from T01) |

All slice-level verification checks pass. This is the final task of the slice.

## Diagnostics

No runtime signals — pure refactor. To verify the extraction held:
- `grep -rn "function createProvider" src/` should return exactly 1 result in `lib/provider-factory.ts`
- Any provider instantiation failure should be traced to the import path in the consumer (should be `../lib/provider-factory.js` or `./lib/provider-factory.js` for `index.ts`)

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/provider-factory.ts` — new file, single `createProvider()` export
- `src/index.ts` — removed inline `createProvider`, imports from `./lib/provider-factory.js`, removed unused `GitLabProvider`/`GitHubProvider` imports
- `src/commands/import.ts` — removed inline `createProvider`, imports from `../lib/provider-factory.js`, removed unused provider imports
- `src/commands/sync.ts` — removed inline `createProvider`, imports from `../lib/provider-factory.js`, removed unused provider imports
- `src/commands/close.ts` — removed inline `createProvider`, imports from `../lib/provider-factory.js`, removed unused provider imports
- `src/commands/pr.ts` — removed inline `createProvider`, imports from `../lib/provider-factory.js`, removed unused provider imports
- `src/providers/types.ts` — updated header comment and `IssueMapEntry.localId` JSDoc
- `.gsd/milestones/M002/slices/S03/tasks/T02-PLAN.md` — added Observability Impact section
