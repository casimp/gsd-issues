# S03 — Research

**Date:** 2026-03-14

## Summary

S03 has two distinct workstreams: (1) adding a re-scope flow to import, and (2) cleaning up stale references and extracting duplicated code left from the M001→M002 transition.

The re-scope flow is the only new functionality. It closes original imported issues on the tracker and creates a new milestone-level issue — bridging the gap between "I have vague issues on the tracker" and "I've planned a milestone from them." The building blocks all exist: `provider.closeIssue()`, `provider.createIssue()`, `loadIssueMap()`/`saveIssueMap()`, and the `syncMilestoneToIssue()` pattern to follow. The flow is multi-step (close originals + create new), so partial failure handling matters.

The cleanup workstream is mechanical: extract `createProvider()` (duplicated 5 times), fix stale JSDoc comments from the slice era, and verify all commands/tools consistently use milestone-level semantics.

## Recommendation

Split into two tasks:

**T01: Re-scope flow.** Add `rescopeIssues()` to `lib/import.ts` with options-bag pattern matching sync/close/PR. It takes a list of original issue IDs to close, a milestone ID, and creates the milestone issue via `syncMilestoneToIssue()` (reuse, not duplicate). Close originals via `provider.closeIssue()`. Persist to ISSUE-MAP immediately after creation. Add the re-scope subflow to both the `/issues import` command (interactive confirmation before closing originals) and the `gsd_issues_import` tool (richer params). Emit a new `gsd-issues:rescope-complete` event.

**T02: Extract createProvider + JSDoc cleanup.** Extract `createProvider()` to `lib/provider-factory.ts`, update all 5 consumers. Fix `IssueMapEntry.localId` JSDoc, `types.ts` header comment, and any other stale slice-era references. This is purely mechanical with no behavioral changes — tests should pass without modification.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Issue creation with description/labels/weight | `syncMilestoneToIssue()` from S02 | Already builds description from CONTEXT.md + ROADMAP.md, handles epic assignment, crash-safe map writes |
| Issue closing with done label/reason | `closeMilestoneIssue()` from S02 | Already handles map lookup, done label, close reason, already-closed tolerance |
| Individual issue close | `provider.closeIssue()` | Direct provider call with doneLabel/reason support |
| Map persistence | `loadIssueMap()`/`saveIssueMap()` | Crash-safe writes, structural validation |
| Provider instantiation | The 5 existing `createProvider()` copies | Same logic everywhere — extract, don't reinvent |

## Existing Code and Patterns

- `src/lib/import.ts` — Current import is formatting-only: `importIssues()` takes `Issue[]`, sorts by weight, formats markdown. Re-scope logic goes here as a new function alongside existing formatting.
- `src/lib/sync.ts` — `syncMilestoneToIssue()` is the pattern to follow for creating milestone issues. Consider whether re-scope should call it directly or duplicate the create logic. Direct call is cleaner if the options line up.
- `src/lib/close.ts` — `closeMilestoneIssue()` closes by milestone map lookup. Re-scope needs to close by issue ID directly (the originals aren't in the map). Use `provider.closeIssue()` directly.
- `src/commands/import.ts` — `handleImport()` fetches and formats. Re-scope subflow needs user confirmation ("Close N original issues and create milestone issue?") before acting. Only available in command mode (not tool mode — tool caller decides).
- `src/index.ts` — `gsd_issues_import` tool registration. May need new params for re-scope (original issue IDs, milestone ID).
- `src/providers/types.ts` — `IssueMapEntry.localId` JSDoc says "slice ID like S01" but convention is now milestone ID (D029). Fix it.

## Constraints

- Re-scope flow involves outward-facing actions (closing issues, creating issues) — command mode must confirm before executing.
- Tool mode skips confirmation per D022 — the LLM is acting on user intent.
- Original issues to close are identified by their tracker IDs (numbers), not by ISSUE-MAP entries — these are pre-existing issues being replaced, not GSD-created ones.
- `syncMilestoneToIssue()` requires a milestone dir to exist with CONTEXT.md and ROADMAP.md for description building. Re-scope should only be called after the user has planned the milestone.
- `createProvider()` extraction must not change behavior — the 5 copies are identical in logic (branch on `config.provider`), just differ in TypeScript typing of the config parameter.

## Common Pitfalls

- **Partial failure in re-scope** — If issue creation succeeds but closing originals fails (or vice versa), the tracker is inconsistent. Create the milestone issue first (since that's the important outcome), persist to ISSUE-MAP, then close originals best-effort with per-issue error collection. Don't fail the whole operation if one original can't be closed.
- **Re-closing already-closed originals** — Some originals may already be closed. `provider.closeIssue()` should handle this gracefully (GitLab returns success, GitHub may error). Follow the already-closed tolerance pattern from `closeMilestoneIssue()`.
- **Double re-scope** — User might run re-scope twice. Check ISSUE-MAP for existing milestone mapping before creating a duplicate issue. Reuse `syncMilestoneToIssue()`'s skip-if-mapped check.
- **createProvider extraction breaking imports** — When moving to a shared module, ensure all 5 consumers import from the new location. TypeScript will catch missing updates at compile time.

## Open Risks

- **Re-scope UX in command mode** — The interactive flow needs to show which issues will be closed and what milestone issue will be created. The exact UX (list issues, confirm, show result) needs to be designed during planning. Not technically risky, but needs thought.
- **Import tool schema expansion** — Adding re-scope params to `ImportToolSchema` may be a breaking change if existing callers pass unexpected fields. TypeBox schemas are additive (new optional fields), so this should be safe.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| n/a | n/a | No external technologies involved — this is internal extension plumbing |

## Sources

- S01 summary — provider patterns, createPR/createIssue consistency
- S02 summary — milestone-level sync/close patterns, options-bag convention, event payloads
- D023 — createProvider extraction trigger (extract when 4th consumer appears — we now have 5)
- D029 — IssueMapEntry.localId holds milestone ID convention
- D032 — tool_result hook removed, close is explicit
- R016 — Re-scope requirement definition
