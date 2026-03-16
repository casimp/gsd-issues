# S02 — Research

**Date:** 2026-03-14

## Summary

S02 delivers three things: multi-milestone auto-flow, `/issues scope` subcommand, and README rewrite. The key insight from research is that GSD auto-mode already handles multi-milestone looping internally — `deriveState()` discovers pending milestones and processes them sequentially. gsd-issues doesn't need its own milestone loop. It needs per-milestone **hooks** that fire during GSD's loop: auto-sync when a ROADMAP.md appears, auto-PR when a milestone SUMMARY.md appears.

The `agent_end` handler is the integration surface. Both GSD's and gsd-issues' handlers fire on every `agent_end` event (they're separate extension registrations). gsd-issues' handler already does scope completion detection (S01). S02 extends it with two filesystem-watching hooks: (1) detect new ROADMAP.md → trigger sync, (2) detect new milestone SUMMARY.md → trigger PR. These hooks implement D048 ("hooks not orchestration").

The `/issues scope` subcommand is trivial — it reuses `handleSmartEntry()` from S01 without setting the auto flag. The README rewrite replaces the current milestone-ID-centric documentation with the three entry points: existing issues, greenfield, and resume.

## Recommendation

Extend the `agent_end` handler with filesystem-watching hooks for auto-sync and auto-PR. Don't build a milestone loop — delegate to GSD auto-mode via `/gsd auto` (already done in S01) and let GSD handle sequencing. The hooks fire on every `agent_end` and check:

1. **ROADMAP.md appeared for an unmapped milestone** → call `syncMilestoneToIssue()` automatically
2. **Milestone SUMMARY.md appeared for a mapped, unclosed milestone** → call `createMilestonePR()` automatically

Add `auto_pr` config field (D050, default true) to control whether PR creation is automatic or prompted. Add `/issues scope` as a thin wrapper over `handleSmartEntry()`. Rewrite README to document the user-facing flow without milestone IDs.

Track hook state with module-level sets (synced milestones, PR'd milestones) that persist for the extension's lifetime, preventing duplicate sync/PR on repeated `agent_end` fires.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Milestone loop | GSD auto-mode's `deriveState()` + `dispatchNextUnit()` in `auto.ts` | GSD already loops through pending milestones. `/gsd auto` handles it after gsd-issues dispatches it. |
| Sync pipeline | `syncMilestoneToIssue()` in `lib/sync.ts` (20 tests) | Proven, crash-safe, handles skip-if-mapped. Hook just calls it. |
| PR pipeline | `createMilestonePR()` in `lib/pr.ts` (14 tests) | Proven, handles push + PR + Closes #N. Hook just calls it. |
| Sizing validation | `validateMilestoneSize()` in `lib/sizing.ts` (9 tests) | Works correctly, used after plan phase. Can be called in the ROADMAP.md hook. |
| Milestone scanning | `scanMilestones()` in `lib/smart-entry.ts` | Already reads `.gsd/milestones/` for directories with CONTEXT.md. |
| Scope entry | `handleSmartEntry()` in `commands/issues.ts` | `/issues scope` is just this function without the auto flag. |
| ROADMAP detection | `findRoadmapPath()` + `readFile()` | Existing path builder + filesystem check. |

## Existing Code and Patterns

- `src/index.ts` (515 lines) — Extension entry. Has one `agent_end` handler for scope completion. Must be extended with sync/PR hooks. All tool handlers (sync, close, PR, import) are here — they resolve milestoneId from params/config/state, which the hooks can bypass since they know the milestone.
- `src/commands/issues.ts` (239 lines) — Smart entry + auto entry. `handleSmartEntry()` is the scope flow. `/issues scope` reuses it directly. Module-scoped state: `preScopeMilestones`, `_autoRequested`, with getters/clearers.
- `src/lib/smart-entry.ts` (142 lines) — `scanMilestones()`, `buildScopePrompt()`, `detectNewMilestones()`. All pure or filesystem-only. `scanMilestones()` returns milestones with CONTEXT.md; for ROADMAP/SUMMARY detection, need analogous checks.
- `src/lib/sync.ts` — `syncMilestoneToIssue(options)` takes a `SyncOptions` bag. The hook needs to construct this bag from config + pi.exec + cwd.
- `src/lib/pr.ts` — `createMilestonePR(options)` takes a `PrOptions` bag. Same pattern.
- `src/lib/sizing.ts` (86 lines) — `validateMilestoneSize(cwd, milestoneId, config)`. Could be called before sync in the ROADMAP hook to warn about oversized milestones.
- `src/lib/config.ts` — `Config` interface needs `auto_pr?: boolean` field. `validateConfig()` needs the boolean check.
- `src/lib/state.ts` — `readGSDState()`, `findRoadmapPath()`, `readMilestoneContext()`. All needed for hook detection logic.
- `src/lib/issue-map.ts` — `loadIssueMap(mapPath)` for checking if a milestone is already mapped.
- `README.md` — Currently documents M003's state machine (now deleted) and requires milestone IDs. Needs full rewrite of How It Works, Auto Flow, and Commands sections.

## Constraints

- **`agent_end` fires after every LLM turn** — hooks must be idempotent. Use ISSUE-MAP.json as ground truth for "already synced" and track PR'd milestones in module state. `syncMilestoneToIssue` already skips mapped milestones.
- **Cannot modify GSD core** — all integration via `pi.on("agent_end", ...)` and `pi.sendMessage()`. No direct imports from GSD.
- **`agent_end` receives `ExtensionContext`, not `ExtensionCommandContext`** — no `newSession()` or `waitForIdle()`. Hooks can only call library functions and `pi.sendMessage()` / `pi.events.emit()`.
- **Config may not exist** — hooks must handle missing config gracefully (no-op if no `.gsd/issues.json`).
- **GSD auto-mode has its own `agent_end` handler** — both fire independently. gsd-issues' hooks must not interfere with GSD's dispatch flow. Keep hooks fast and non-blocking relative to the LLM turn.
- **308 existing tests must pass** — hook additions and config changes must not break existing test expectations.
- **`pi.exec` available on `ExtensionAPI`** — the hooks have access to `pi.exec` for provider calls, even though `agent_end` doesn't get `ExtensionCommandContext`.

## Common Pitfalls

- **Duplicate sync/PR on repeated `agent_end`** — `syncMilestoneToIssue` already checks ISSUE-MAP and skips mapped milestones, so duplicate sync is safe. PR creation is NOT idempotent — creating the same PR twice would fail or create a duplicate. Must track PR'd milestones in module state or check provider before creating.
- **Hook fires before GSD finishes writing files** — GSD auto's `agent_end` handler has a 500ms delay to let files settle. gsd-issues' handler should also tolerate partial writes. Check file existence with `stat()`, don't assume content is complete.
- **Hook triggers sync/PR while GSD is mid-task** — ROADMAP.md is written during planning, which is a multi-turn LLM interaction. The hook should only fire when the ROADMAP is complete (all slices present). Use the `_autoRequested` or a separate `_hooksEnabled` flag to gate hooks to the auto-flow context only.
- **README documents deleted features** — Current README references `gsd_issues_auto` tool, auto-phase events, issues-auto.json state, mutual exclusion locks — all deleted in S01. Must remove all references.
- **`auto_pr` validation breaks existing configs** — Field must be optional with `true` default. Existing configs without it must pass validation unchanged.

## Open Risks

- **Hook timing vs. GSD auto dispatch** — Both extensions' `agent_end` handlers fire concurrently. If gsd-issues' sync hook takes too long (network call to create issue), it might still be running when GSD dispatches the next task. Mitigate by making hooks fire-and-forget (no `await` on the sync/PR call in the handler) or by accepting that the sync happens in the background.
- **PR hook detecting the right moment** — A milestone SUMMARY.md signals completion. But GSD may still be on a slice branch when the summary is written. The PR hook needs the integration branch to exist (captured by GSD auto). If the branch hasn't been merged/pushed yet, PR creation will fail. May need to defer PR until the next `agent_end` when GSD has merged slices.
- **Scope creating multiple milestones is rare** — The LLM usually creates one milestone per scope prompt. Multi-milestone is mainly for very large work items. GSD auto handles the loop, but the sync/PR hooks need to handle any milestone, not just the first one.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extensions | `zenobi-us/dotfiles@creating-pi-extensions` (26 installs) | available — low relevance, generic extension authoring |

No skills warrant installation. The work is `agent_end` hook extension, config field addition, and README rewrite within an existing pi extension codebase.

## Sources

- GSD `auto.ts` — multi-milestone loop via `deriveState()`, `pendingCount` tracking, milestone transition detection (source: `~/.gsd/agent/extensions/gsd/auto.ts`, lines 593-660, 1196-1260)
- GSD `state.ts` — `deriveState()` builds milestone registry with active/pending/complete status, uses ROADMAP.md and SUMMARY.md presence as signals (source: `~/.gsd/agent/extensions/gsd/state.ts`, lines 61-200)
- GSD `auto.ts` agent_end handler — 500ms delay for file settling, guard against concurrent execution (source: `~/.gsd/agent/extensions/gsd/auto.ts`, lines 697-720)
- S01 `agent_end` handler in `index.ts` — scope completion detection via CONTEXT.md diffing, auto flag chaining (source: `src/index.ts`, lines 470-514)
- S01 `commands/issues.ts` — module-scoped state pattern with getters/clearers (source: `src/commands/issues.ts`, lines 31-57)
- D048 decision — hooks not orchestration for post-milestone actions (source: `.gsd/DECISIONS.md`)
- D050 decision — `auto_pr` config field defaults to true (source: `.gsd/DECISIONS.md`)
