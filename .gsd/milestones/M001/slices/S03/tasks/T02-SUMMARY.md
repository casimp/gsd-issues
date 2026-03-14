---
id: T02
parent: S03
milestone: M001
provides:
  - syncSlicesToIssues(opts) — core sync pipeline creating issues for unmapped slices
  - assignToEpic(exec, projectId, issueIid, epicConfig) — GitLab epic assignment via REST
  - SyncToolSchema — TypeBox schema for tool registration in T03
  - SyncResult type — structured result with created/skipped/errors
key_files:
  - src/lib/sync.ts
  - src/lib/__tests__/sync.test.ts
  - package.json
key_decisions:
  - Weight maps risk levels to numbers (fibonacci: low=1, medium=2, high=3, critical=5; linear: low=1, medium=2, high=3) — matches D019
  - Epic group path discovered at sync time via glab api, URL-encoded for nested groups — matches D018
  - dryRun mode returns preview entries with issueId=0 and url="(dry-run)" without touching provider or map
patterns_established:
  - Per-creation map persistence (crash-safe) — saveIssueMap called after each successful createIssue
  - Best-effort enrichment pattern — epic assignment emits warning event on failure, doesn't add to SyncResult.errors
  - Description builder includes slice demo line (if present) + GSD metadata tag `[gsd:M001/S01]`
observability_surfaces:
  - gsd-issues:sync-complete event with { milestone, created, skipped, errors } payload
  - gsd-issues:epic-warning event with { sliceId, issueId, warning } on epic assignment failure
  - SyncResult.errors array for per-slice failure inspection
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Sync orchestration module with GitLab epic support

**Implemented the core sync pipeline — creates remote issues for unmapped roadmap slices with full GitLab/GitHub support, crash-safe map persistence, weight mapping, epic assignment, and TypeBox tool schema.**

## What Happened

Built `src/lib/sync.ts` with three exports:

1. **`syncSlicesToIssues(opts)`** — loads existing map, iterates slices, skips mapped ones, builds `CreateIssueOpts` with title/description/milestone/assignee/labels/weight, calls `provider.createIssue()`, saves map immediately after each creation, and optionally assigns to GitLab epic. Errors on individual slices are captured but don't abort the run. Emits `gsd-issues:sync-complete` event with summary payload. Supports `dryRun` mode for preview.

2. **`assignToEpic(exec, projectId, issueIid, epicConfig)`** — parses epic IID from `"&42"` format, discovers group path via `glab api projects/{id}`, then POSTs to the epic issues endpoint. URL-encodes group paths with slashes for nested groups. Best-effort — caller catches and emits warning.

3. **`SyncToolSchema`** — TypeBox object with optional `milestone_id` and `roadmap_path` string fields, ready for T03 to pass to `registerTool`.

Added `@sinclair/typebox` to runtime dependencies in package.json.

## Verification

- `npx vitest run src/lib/__tests__/sync.test.ts` — **22 tests pass**: creates for unmapped, skips mapped, crash-safe map saves, correct CreateIssueOpts with config values, description includes demo line + metadata tag, GitLab epic assignment, epic failure graceful handling, sync-complete event with correct payload, fibonacci/linear/none weight strategies, error on one slice doesn't abort others, dryRun preview, GitHub provider path, empty slices, description without demo line
- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all 125 tests pass (103 prior + 22 new)

### Slice-level verification status (intermediate task):
- ✅ `npx vitest run src/lib/__tests__/state.test.ts` — 18 pass
- ✅ `npx vitest run src/lib/__tests__/sync.test.ts` — 22 pass
- ⏳ `npx vitest run src/commands/__tests__/sync.test.ts` — T03
- ✅ `npx tsc --noEmit` — zero errors
- ✅ `npx vitest run` — all 125 green

## Diagnostics

- Check `SyncResult.errors` for per-slice failure messages with sliceId
- Listen for `gsd-issues:sync-complete` event for sync summary
- Listen for `gsd-issues:epic-warning` event for non-fatal epic failures
- Inspect ISSUE-MAP.json on disk for current mapping state
- Run `npx vitest run src/lib/__tests__/sync.test.ts` to verify behavior

## Deviations

- Plan step 3 listed fibonacci weights as `1/2/3/5/8` but only four risk levels exist (low/medium/high/critical → 1/2/3/5). The value 8 has no corresponding risk level, which is fine — unmapped risks return `undefined` weight.

## Known Issues

None.

## Files Created/Modified

- `src/lib/sync.ts` — core sync module with syncSlicesToIssues, assignToEpic, SyncToolSchema exports
- `src/lib/__tests__/sync.test.ts` — 22 tests covering full sync pipeline, both providers, epic, weight, dry-run, error resilience
- `package.json` — added `@sinclair/typebox` to runtime dependencies
