# S02: Multi-milestone sequencing, /issues scope, and README

**Goal:** When scope creates multiple milestones, GSD auto-mode processes each one and gsd-issues automatically syncs/PRs at the right moments. `/issues scope` runs independently. README reflects the current architecture.
**Demo:** Tests prove agent_end hooks fire sync on ROADMAP.md creation and PR on SUMMARY.md creation (idempotently), `/issues scope` dispatches the scope prompt, and README contains no stale references.

## Must-Haves

- agent_end hook detects new ROADMAP.md and calls `syncMilestoneToIssue()` automatically
- agent_end hook detects new milestone SUMMARY.md and calls `createMilestonePR()` automatically
- Hooks are idempotent — ISSUE-MAP.json prevents duplicate sync, module-level set prevents duplicate PR
- Hooks only fire when auto-mode is active (gated by `_autoRequested` or equivalent flag)
- `auto_pr` config field (boolean, default true) controls PR hook behavior
- `/issues scope` subcommand runs `handleSmartEntry()` independently
- README documents three entry points (existing issues, greenfield, resume) without milestone IDs as user input
- README removes all M003 stale references (state machine, issues-auto.json, mutual exclusion, `gsd_issues_auto` tool, auto-phase events)
- All 308 existing tests pass, new tests cover hooks and `/issues scope`

## Proof Level

- This slice proves: contract
- Real runtime required: no
- Human/UAT required: no

## Verification

- `npx vitest run` — all tests pass (existing 308 + new hook/scope tests)
- `npx tsc --noEmit` — clean compilation
- `grep -c "issues-auto.json\|issues-auto.lock\|auto.lock\|gsd_issues_auto\|AutoPhase\|auto-phase" README.md` returns 0
- `npx vitest run -- --grep "agent_end hooks"` — hook tests pass
- `npx vitest run -- --grep "issues scope"` — scope subcommand tests pass
- `npx vitest run -- --grep "hook.*error\|error.*hook\|gracefully"` — hook error/failure-path tests pass

## Observability / Diagnostics

- Runtime signals: `gsd-issues:auto-sync` event on hook-triggered sync, `gsd-issues:auto-pr` event on hook-triggered PR
- Inspection surfaces: `getSyncedMilestones()` / `getPrdMilestones()` for module-level hook state
- Failure visibility: sync/PR errors logged via `console.error` in hook (non-blocking), events carry error payloads
- Redaction constraints: none

## Integration Closure

- Upstream surfaces consumed: `syncMilestoneToIssue()`, `createMilestonePR()`, `loadIssueMap()`, `validateMilestoneSize()`, `scanMilestones()`, `findRoadmapPath()`, `loadConfig()`
- New wiring introduced in this slice: agent_end hooks in `index.ts` for auto-sync and auto-PR
- What remains before the milestone is truly usable end-to-end: nothing — README documents the final architecture, all requirements mapped

## Tasks

- [x] **T01: Add agent_end hooks for auto-sync and auto-PR** `est:45m`
  - Why: Core R024 delivery — hooks react to GSD's filesystem artifacts during auto-mode, triggering sync when ROADMAP.md appears and PR when SUMMARY.md appears. Also adds `auto_pr` config field (D050).
  - Files: `src/index.ts`, `src/lib/config.ts`, `src/lib/__tests__/config.test.ts`, `src/commands/__tests__/issues.test.ts`
  - Do: (1) Add `auto_pr` boolean to Config interface and validateConfig. (2) Add module-level hook state in `commands/issues.ts` — sets tracking synced/PR'd milestones, `_hooksEnabled` flag set when auto-mode is active, getters/clearers for test access. (3) Extend agent_end handler in `index.ts` with two additional checks after scope detection: scan for milestones with ROADMAP.md but no ISSUE-MAP entry → call `syncMilestoneToIssue()`; scan for milestones with SUMMARY.md and mapped issue but not yet PR'd → call `createMilestonePR()`. Both non-blocking (catch errors, log, continue). Both gated on hooks-enabled flag. (4) Write tests: config validation for auto_pr, hook fires sync on ROADMAP.md detection, hook fires PR on SUMMARY.md detection, hooks are idempotent, hooks are no-op when not in auto-mode, hooks handle missing config gracefully.
  - Verify: `npx vitest run` — all tests pass including new hook/config tests
  - Done when: agent_end hooks proven by contract tests to auto-sync on ROADMAP.md and auto-PR on SUMMARY.md, idempotently and only during auto-mode

- [x] **T02: Add /issues scope subcommand and rewrite README** `est:30m`
  - Why: R023 delivery (standalone scope command) and README accuracy — current README references deleted M003 artifacts and missing entry points.
  - Files: `src/index.ts`, `src/commands/__tests__/issues.test.ts`, `README.md`
  - Do: (1) Add `"scope"` to SUBCOMMANDS array and add case in switch to call `handleSmartEntry()`. (2) Add tests: `/issues scope` routes to smart entry flow, `/issues scope` appears in argument completions. (3) Rewrite README: remove all M003 references (state machine, issues-auto.json, mutual exclusion locks, `gsd_issues_auto` tool, auto-phase events). Update How It Works with three entry points (existing issues, greenfield, resume). Update auto flow to describe scope→GSD auto chain (no state machine). Update commands table (add `/issues scope`, remove `/issues auto <milestone_id>` syntax, update `/issues auto` description). Update events table (add scope-complete, auto-sync, auto-pr; remove auto-phase). Update LLM tools table (remove `gsd_issues_auto`). Remove Auto Flow Details section (sizing/mutual exclusion — no longer applies). Update config examples to show `auto_pr` field and make `milestone` clearly optional.
  - Verify: `npx vitest run` — all tests pass; `grep -c "issues-auto\|auto.lock\|gsd_issues_auto\|AutoPhase\|auto-phase" README.md` returns 0
  - Done when: `/issues scope` test passes, README has zero stale M003 references, README documents current architecture accurately

## Files Likely Touched

- `src/index.ts`
- `src/lib/config.ts`
- `src/lib/__tests__/config.test.ts`
- `src/commands/issues.ts`
- `src/commands/__tests__/issues.test.ts`
- `README.md`
