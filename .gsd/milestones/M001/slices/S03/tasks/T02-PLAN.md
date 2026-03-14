---
estimated_steps: 6
estimated_files: 3
---

# T02: Sync orchestration module with GitLab epic support

**Slice:** S03 — Sync Workflow
**Milestone:** M001

## Description

The core sync pipeline: takes parsed roadmap slices, creates issues through the provider for any unmapped slices, handles GitLab-specific extras (epic assignment via REST API, weight), persists each mapping to ISSUE-MAP.json immediately after creation (crash-safe), and emits a completion event. Also adds `@sinclair/typebox` and exports the tool's TypeBox parameter schema for T03 to use when registering the tool.

## Steps

1. Add `@sinclair/typebox` to `package.json` dependencies (not devDependencies — needed at runtime for tool schema).
2. Create `src/lib/sync.ts`. Define `SyncOptions` interface: `{ provider: IssueProvider, config: Config, slices: ParsedSlice[], mapPath: string, exec: ExecFn, emit?: (event: string, payload: unknown) => void, dryRun?: boolean }`. Define `SyncResult`: `{ created: IssueMapEntry[], skipped: string[], errors: Array<{ sliceId: string, error: string }> }`.
3. Implement `syncSlicesToIssues(opts: SyncOptions): Promise<SyncResult>`. Load existing map via `loadIssueMap(mapPath)`. For each slice not in the map (match on `localId`): build `CreateIssueOpts` with title (format: `<slice title>`), description (include demo line and `[gsd:M001/S01]` metadata tag), milestone from config, assignee from config, labels from config, weight from config's weight_strategy (hardcoded defaults: fibonacci → risk-based 1/2/3/5/8, linear → 1/2/3; skip if `none`). Call `provider.createIssue()`. On success, build `IssueMapEntry` and append to map, call `saveIssueMap()` immediately. On error, record in `errors` array and continue to next slice (don't abort entire sync).
4. Implement `assignToEpic(exec: ExecFn, projectId: number, issueIid: number, epicConfig: string): Promise<void>`. Parse epic IID from config string (e.g., `"&42"` → `42`). Use `glab api` to discover the group path from the project: `glab api "projects/{projectId}" --jq '.namespace.full_path'`. Then call `glab api -X POST "groups/{groupPath}/epics/{epicIid}/issues/{projectId}" --field issue_id={issueId}`. Called after issue creation for GitLab only when epic is configured. This is a best-effort operation — log warning on failure, don't fail the sync.
5. Export `SyncToolSchema` — a TypeBox object schema with `milestone_id: Type.Optional(Type.String())` and `roadmap_path: Type.Optional(Type.String())` for T03 to use in `registerTool`.
6. Write `src/lib/__tests__/sync.test.ts` covering: creates issues for unmapped slices, skips already-mapped slices, saves map after each creation (not batch), builds correct CreateIssueOpts with config values, handles GitLab epic assignment, handles epic assignment failure gracefully, emits sync-complete event with correct payload, weight mapping for fibonacci/linear/none strategies, error on one slice doesn't abort others, dryRun returns preview without creating.

## Must-Haves

- [ ] Unmapped slices get issues created via provider
- [ ] Already-mapped slices (by localId) are skipped
- [ ] Map is saved after each creation (crash-safe)
- [ ] GitLab epic assignment via glab api when configured
- [ ] Epic failure is warning, not sync failure
- [ ] Weight derived from config strategy with hardcoded defaults
- [ ] Event emitted with summary payload
- [ ] TypeBox schema exported for tool registration
- [ ] Description includes slice demo line and GSD metadata tag

## Verification

- `npx vitest run src/lib/__tests__/sync.test.ts` — all tests pass
- `npx tsc --noEmit` — zero type errors

## Observability Impact

- Signals added: `gsd-issues:sync-complete` event with `{ milestone, created: number, skipped: number, errors: number }` payload
- How a future agent inspects this: check ISSUE-MAP.json for mapping state, listen for sync-complete event
- Failure state exposed: `SyncResult.errors` array contains per-slice error messages; partial map saved on crash

## Inputs

- `src/providers/types.ts` — IssueProvider, CreateIssueOpts, IssueMapEntry, ExecFn
- `src/lib/issue-map.ts` — loadIssueMap, saveIssueMap
- `src/lib/config.ts` — Config, GitLabConfig
- `src/lib/state.ts` (from T01) — ParsedSlice type (the return shape of parseRoadmapSlices)

## Expected Output

- `src/lib/sync.ts` — syncSlicesToIssues, assignToEpic, SyncToolSchema, SyncResult type exported
- `src/lib/__tests__/sync.test.ts` — 15+ tests covering both providers, epic, weight, re-sync safety, event emission
- `package.json` — `@sinclair/typebox` added to dependencies
