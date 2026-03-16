---
estimated_steps: 5
estimated_files: 4
---

# T01: Add agent_end hooks for auto-sync and auto-PR

**Slice:** S02 — Multi-milestone sequencing, /issues scope, and README
**Milestone:** M004

## Description

Extend the `agent_end` handler with two filesystem-watching hooks that fire during auto-mode. When GSD auto creates a ROADMAP.md for a milestone, the sync hook calls `syncMilestoneToIssue()` to push it to the tracker. When GSD auto writes a milestone SUMMARY.md (signaling completion), the PR hook calls `createMilestonePR()`. Both hooks are idempotent and non-blocking.

Also adds `auto_pr` config field (D050) — boolean, default true, controls whether the PR hook fires automatically or is skipped.

## Steps

1. **Add `auto_pr` to Config interface and validation.** In `config.ts`, add `auto_pr?: boolean` to the `Config` interface. In `validateConfig()`, add a check: if `auto_pr` is present and not a boolean, push an error. Add tests: valid with `auto_pr: true`, valid with `auto_pr: false`, valid without `auto_pr`, invalid with `auto_pr: "yes"`.

2. **Add hook state management in `commands/issues.ts`.** Add module-level state: `_syncedMilestones: Set<string>` and `_prdMilestones: Set<string>` to track which milestones have been synced/PR'd by hooks (prevents duplicates). Add `_hooksEnabled: boolean` flag, set to true when `/issues auto` triggers auto-mode (in `handleAutoEntry`), cleared on completion or failure. Export getters/clearers for test access: `isSynced(id)`, `isPrd(id)`, `isHooksEnabled()`, `clearHookState()`.

3. **Extend agent_end handler with sync hook.** After the existing scope detection block in `index.ts`, add: if hooks are enabled, scan milestones dir for any milestone that has a ROADMAP.md but is NOT in ISSUE-MAP.json and NOT in the synced set. For each such milestone, load config, construct SyncOptions, call `syncMilestoneToIssue()`, add to synced set, emit `gsd-issues:auto-sync`. Wrap in try/catch — errors logged, never thrown. Guard: no-op if no config file exists.

4. **Extend agent_end handler with PR hook.** After the sync hook block, add: if hooks are enabled, scan for milestones that have a `{MID}-SUMMARY.md` AND are in ISSUE-MAP.json AND are NOT in the PR'd set. For each, check `auto_pr` config (default true) — if false, skip. Call `createMilestonePR()`, add to PR'd set, emit `gsd-issues:auto-pr`. Wrap in try/catch — errors logged, never thrown.

5. **Write hook tests.** In `src/commands/__tests__/issues.test.ts` (or a new test file if cleaner), test: (a) sync hook fires when ROADMAP.md exists and milestone is unmapped, (b) sync hook skips already-synced milestones, (c) PR hook fires when SUMMARY.md exists and milestone is mapped, (d) PR hook skips already-PR'd milestones, (e) PR hook respects `auto_pr: false`, (f) hooks are no-op when `_hooksEnabled` is false, (g) hooks handle missing config gracefully (no-op). Mock all external dependencies (file I/O, `syncMilestoneToIssue`, `createMilestonePR`).

## Must-Haves

- [ ] `auto_pr` boolean field in Config with validation
- [ ] Hook state (synced/PR'd sets, hooks-enabled flag) with getters/clearers
- [ ] Sync hook in agent_end: ROADMAP.md + unmapped → sync
- [ ] PR hook in agent_end: SUMMARY.md + mapped + auto_pr → PR
- [ ] Both hooks idempotent (set-based dedup)
- [ ] Both hooks gated on hooks-enabled flag
- [ ] Both hooks non-blocking (catch errors)
- [ ] Tests for all hook behaviors

## Verification

- `npx vitest run` — all 308 existing tests still pass + new hook/config tests pass
- `npx tsc --noEmit` — clean compilation

## Observability Impact

- Signals added: `gsd-issues:auto-sync` event with `{ milestoneId }`, `gsd-issues:auto-pr` event with `{ milestoneId }`
- How a future agent inspects this: `isSynced(id)`, `isPrd(id)`, `isHooksEnabled()` — module-level state inspection
- Failure state exposed: hook errors caught and logged to console.error with milestone ID context

## Inputs

- `src/index.ts` — existing agent_end handler for scope detection (extend with hooks)
- `src/commands/issues.ts` — module-scoped state pattern (extend with hook state)
- `src/lib/config.ts` — Config interface (extend with auto_pr)
- `src/lib/sync.ts` — `syncMilestoneToIssue()` API shape (SyncOptions)
- `src/lib/pr.ts` — `createMilestonePR()` API shape (PrOptions)
- `src/lib/issue-map.ts` — `loadIssueMap()` for checking mapped milestones
- S01 summary — module-scoped state pattern, auto flag management

## Expected Output

- `src/lib/config.ts` — Config interface with `auto_pr?: boolean`, validateConfig with boolean check
- `src/lib/__tests__/config.test.ts` — 3-4 new auto_pr validation tests
- `src/commands/issues.ts` — hook state management (sets, flag, getters/clearers), _hooksEnabled set in handleAutoEntry
- `src/index.ts` — agent_end handler extended with sync and PR hook blocks
- `src/commands/__tests__/issues.test.ts` — 7+ new hook behavior tests
