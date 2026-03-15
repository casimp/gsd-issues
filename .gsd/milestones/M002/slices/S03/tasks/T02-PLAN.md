---
estimated_steps: 4
estimated_files: 7
---

# T02: Extract createProvider to shared module and fix stale JSDoc

**Slice:** S03 — Import re-scope and cleanup
**Milestone:** M002

## Description

Extract the `createProvider()` factory — duplicated identically across 5 files — into a single `lib/provider-factory.ts` module. Update all consumers to import from the new location. Fix stale slice-era JSDoc comments that reference the old per-slice model (D029 established milestone convention). Purely mechanical — no behavioral changes, existing tests should pass without modification.

## Steps

1. Create `src/lib/provider-factory.ts` exporting `createProvider(config: Config, exec: ExecFn): IssueProvider`. Import `Config` from `./config.js`, `ExecFn`/`IssueProvider` from `../providers/types.js`, and both provider classes. Branch on `config.provider === "gitlab"`.
2. Update all 5 consumers (`src/index.ts`, `src/commands/import.ts`, `src/commands/sync.ts`, `src/commands/close.ts`, `src/commands/pr.ts`): remove inline `createProvider` function, add import from `../lib/provider-factory.js` (or `./lib/provider-factory.js` for index.ts). Remove now-unused direct imports of `GitLabProvider`/`GitHubProvider` from those files.
3. Fix stale JSDoc: in `src/providers/types.ts`, change `IssueMapEntry.localId` comment from "slice ID like S01" to "milestone ID (e.g. M001)". Change header comment from "S02–S05" to accurate scope description. Scan for any other stale slice-era references with `grep -rn "slice ID\|S02.S05\|S01.*S02\|per.slice" src/ --include="*.ts"` and fix as needed.
4. Verify: run `npx tsc --noEmit`, `npx vitest run`, and `grep -rn "function createProvider" src/` (expect exactly 1 result).

## Must-Haves

- [ ] Single `createProvider()` in `lib/provider-factory.ts`
- [ ] All 5 consumers import from shared module, no inline copies remain
- [ ] `IssueMapEntry.localId` JSDoc reflects milestone convention
- [ ] `types.ts` header comment is accurate
- [ ] All 235+ tests pass without modification
- [ ] TypeScript compilation clean

## Verification

- `npx vitest run` — all tests pass (no behavioral changes)
- `npx tsc --noEmit` — clean
- `grep -rn "function createProvider" src/` — exactly 1 result in `lib/provider-factory.ts`
- `grep "S02–S05\|slice ID like" src/providers/types.ts` — 0 matches

## Inputs

- `src/index.ts` — current createProvider inline copy
- `src/commands/import.ts` — current createProvider inline copy
- `src/commands/sync.ts` — current createProvider inline copy
- `src/commands/close.ts` — current createProvider inline copy
- `src/commands/pr.ts` — current createProvider inline copy
- `src/providers/types.ts` — stale JSDoc to fix
- D023 — extract trigger decision
- D029 — milestone ID convention

## Expected Output

- `src/lib/provider-factory.ts` — new file with single `createProvider()` export
- `src/index.ts` — imports from provider-factory, inline copy removed
- `src/commands/import.ts` — imports from provider-factory, inline copy removed
- `src/commands/sync.ts` — imports from provider-factory, inline copy removed
- `src/commands/close.ts` — imports from provider-factory, inline copy removed
- `src/commands/pr.ts` — imports from provider-factory, inline copy removed
- `src/providers/types.ts` — JSDoc updated to reflect milestone model

## Observability Impact

This task is a pure mechanical refactor with no runtime behavior changes. No new events, logs, or diagnostic surfaces are added or removed. The existing `createProvider` logic is unchanged — it moves to a single location. A future agent can verify the extraction by running `grep -rn "function createProvider" src/` (expect exactly 1 result in `lib/provider-factory.ts`). If provider instantiation fails after this change, inspect the import path in the consumer file — it should be `../lib/provider-factory.js` (or `./lib/provider-factory.js` for `index.ts`).
