# M006: Orphan Milestone Guard — Research

**Date:** 2026-03-14

## Summary

This is a small, well-bounded feature. The codebase already has every primitive needed: `scanMilestones()` returns milestone IDs with CONTEXT.md, `loadIssueMap()` reads ISSUE-MAP.json (returns `[]` on missing), and the SUMMARY.md existence check is a proven pattern in the `agent_end` handler. The new `findOrphanMilestones(cwd)` utility is a composition of these three — scan all milestones, exclude completed ones (SUMMARY.md exists), exclude mapped ones (ISSUE-MAP.json has entries), return the rest.

The guard needs to fire at the very top of both `handleSmartEntry()` and `handleAutoEntry()` in `src/commands/issues.ts`, before any state detection, UI prompts, or `/gsd auto` dispatches. The `handleAutoEntry` resume path is the critical case — it currently sends `/gsd auto` immediately when milestones exist on disk, which means orphans would get swept into auto-mode without any mapping. The guard must block before that point.

The primary recommendation is a single slice: implement the utility, wire the guards, write tests. No external dependencies, no integration points, no risk beyond getting the guard logic right. Prove the guard fires correctly before wiring the entry points — the utility is independently testable and the entry point tests are well-established.

## Recommendation

Single slice, risk-low. Build `findOrphanMilestones()` as a pure utility in `src/lib/smart-entry.ts` (it belongs with `scanMilestones()`), then add guard calls at the top of both entry handlers. Tests follow existing patterns: temp dirs, mock contexts, `clearHookState()` cleanup. Prove the utility first, then prove the entry points block.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Scanning milestone dirs | `scanMilestones(cwd)` in `src/lib/smart-entry.ts` | Already handles ENOENT, filters for CONTEXT.md, returns sorted IDs |
| Loading issue mappings | `loadIssueMap(filePath)` in `src/lib/issue-map.ts` | Returns `[]` on missing file, validates structure, throws on corrupt |
| SUMMARY.md path construction | Pattern in `agent_end` handler: `join(cwd, ".gsd", "milestones", mid, \`${mid}-SUMMARY.md\`)` | Proven convention, used in both hooks and prompted-flow branches |
| ISSUE-MAP.json path construction | `join(dirname(findRoadmapPath(cwd, mid)), "ISSUE-MAP.json")` or equivalent `join(cwd, ".gsd", "milestones", mid, "ISSUE-MAP.json")` | Used in 13+ places across the codebase |
| Test infrastructure | `makeUI()`, `makeCtx()`, `makePi()` in `issues.test.ts` | Consistent mocking pattern for all command handler tests |

## Existing Code and Patterns

- `src/lib/smart-entry.ts` — `scanMilestones()` is the foundation. New `findOrphanMilestones()` should live here alongside it, following the same async/ENOENT handling pattern.
- `src/lib/issue-map.ts` — `loadIssueMap()` returns `IssueMapEntry[]`. An orphan is a milestone where `loadIssueMap()` returns `[]` (no entries with matching `localId`).
- `src/commands/issues.ts` — `handleSmartEntry()` and `handleAutoEntry()` are the two guard points. Both already import from `smart-entry.ts`. The guard must be the first substantive check in each function, before config loading or GSD state checks.
- `src/index.ts` lines 582-589 — The `agent_end` handler's SUMMARY.md existence check pattern: `stat(summaryPath)` catching ENOENT. This exact pattern should be reused for the completed-milestone exclusion.
- `src/commands/__tests__/issues.test.ts` — 1208 lines of existing tests for both handlers. Test patterns: `mkdtemp` + `process.chdir`, mock `ExtensionAPI`/`ExtensionCommandContext`, `clearHookState()` in `afterEach`. New tests follow this exactly.

## Constraints

- `scanMilestones()` only finds milestones with `{MID}-CONTEXT.md` — dirs without CONTEXT.md are invisible. This is correct: a dir without CONTEXT.md isn't a milestone at all.
- ISSUE-MAP.json lives at `.gsd/milestones/{MID}/ISSUE-MAP.json` — must be checked per milestone, not globally.
- SUMMARY.md lives at `.gsd/milestones/{MID}/{MID}-SUMMARY.md` — presence means the milestone is complete (used as completion signal throughout the codebase).
- The `handleAutoEntry` resume path (`existingMilestones.length > 0`) dispatches `/gsd auto` before any mapping check — the guard MUST fire before the `scanMilestones()` call in `handleAutoEntry`, or at least before the resume dispatch.
- `ctx.ui.notify()` is the right output channel for the block message — consistent with all other user-facing messages in both handlers.

## Common Pitfalls

- **Guard placement too late in handleAutoEntry** — If the guard runs after the `existingMilestones.length > 0` check, orphans on the resume path will slip through and get `/gsd auto` dispatched. The guard must be the first thing both functions do.
- **Forgetting to exclude completed milestones** — A milestone with SUMMARY.md is done. It naturally won't have ISSUE-MAP.json if it was created outside `/issues`. Flagging it as an orphan would be incorrect — it's finished work, not unknown state.
- **Checking `localId` match vs any entries** — `loadIssueMap()` returns all entries in the file. The orphan check should verify `entries.some(e => e.localId === mid)`, not just `entries.length > 0`, matching the pattern used in `agent_end`.
- **Not returning early after blocking** — The guard must `return` after displaying the block message. If it falls through, the rest of the handler runs with orphans present.

## Open Risks

- None significant. This is a composition of proven primitives with no external dependencies. The only failure mode is a logic error in the guard conditions, which is fully testable.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extension API | zenobi-us/dotfiles@creating-pi-extensions (27 installs) | available — not needed for this work (existing patterns sufficient) |

No skills are needed for this milestone. The work is entirely within established codebase patterns.

## Sources

- `src/lib/smart-entry.ts` — `scanMilestones()` API and implementation
- `src/lib/issue-map.ts` — `loadIssueMap()` API, structural validation, ENOENT handling
- `src/commands/issues.ts` — `handleSmartEntry()` and `handleAutoEntry()` entry points, module-scoped state management
- `src/index.ts` lines 540-600 — `agent_end` hook patterns for SUMMARY.md check, ISSUE-MAP.json loading, and `localId` matching
- `src/commands/__tests__/issues.test.ts` — test infrastructure (makeUI, makeCtx, makePi), cleanup patterns, temp dir management
- `.gsd/DECISIONS.md` — D047 (smart entry pattern), D051 (module-scoped auto flag), D052 (scope completion via diffing)
