---
milestone: M002
status: ready
---

# M002: Milestone-Level Issue Tracking and PR Workflow — Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

Reframe gsd-issues from per-slice issue tracking to per-milestone issue tracking. One issue per milestone, one PR/MR per milestone, issue closes on PR merge. The milestone is the unit of external visibility and review — slices remain GSD's internal implementation detail.

## Why This Milestone

M001 built the provider abstraction, config system, and CLI wrappers, but its sync/close/import orchestration operates at the slice level — creating issues that get immediately auto-closed without review. That's busywork, not a workflow. The real value is: plan work → create a milestone issue → do the work on a branch → PR for review → issue closes on merge. M002 delivers that.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run `/issues sync` after planning a milestone and get one issue created on the tracker for that milestone
- Run GSD (auto or guided) to work through slices on a milestone branch
- On milestone completion, get a PR/MR created from the milestone branch to main with `Closes #N`
- Have the issue close automatically when the PR merges
- Import existing issues, plan milestones from them, and have the extension re-scope the tracker to match

### Entry point / environment

- Entry point: `/issues` slash command, LLM-callable tools, lifecycle hooks
- Environment: local dev (pi coding agent)
- Live dependencies: GitLab API (via `glab` CLI), GitHub API (via `gh` CLI)

## Completion Class

- Contract complete means: milestone-level sync/close/PR creation works with mock providers, ISSUE-MAP tracks milestones
- Integration complete means: real PR/MR created on GitLab/GitHub, real issues created and closed via merge
- Operational complete means: full cycle works in a real GSD project — plan, sync, work, PR, merge, close

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Sync creates one issue per milestone on both GitLab and GitHub
- PR/MR is created on milestone completion targeting main with `Closes #N`
- Issue closes when PR merges (platform-handled, not extension-handled)
- Import fetches issues and the re-scope flow closes originals and creates milestone issues
- ISSUE-MAP tracks milestone→issue mappings
- All commands and tools work with the new milestone-level model

## Risks and Unknowns

- **PR/MR creation via CLI** — `gh pr create` and `glab mr create` have different flag sets and output formats. Need to parse PR/MR URLs reliably.
- **Integration branch detection** — the extension needs to know the milestone branch name to create a PR from it. GSD records this in milestone metadata, but the extension needs to read it.
- **Re-scope flow complexity** — closing original issues and creating new ones involves multiple provider calls in sequence. Partial failure handling matters.
- **Existing M001 test suite** — 188 tests are slice-level. Reworking sync/close/map will break many of them. Need to manage the transition cleanly.

## Existing Codebase / Prior Art

- `src/providers/types.ts` — IssueProvider interface, needs createPR/createMR method
- `src/providers/gitlab.ts` / `src/providers/github.ts` — provider implementations, need PR/MR support
- `src/lib/sync.ts` — slice-level sync, needs milestone-level rewrite
- `src/lib/close.ts` — slice-level close with tool_result hook, needs replacement with PR-based close
- `src/lib/import.ts` — import formatting, needs re-scope additions
- `src/lib/issue-map.ts` — slice→issue mapping, needs milestone→issue mapping
- `src/lib/config.ts` — config types, may need new fields for PR settings
- `src/index.ts` — extension entry point, tool_result hook needs updating
- GSD git-service.ts — records integration branch per milestone, readable via milestone metadata file

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions.

## Relevant Requirements

- R003, R004, R006, R007, R008, R009 — reframed from slice to milestone level, need rework
- R014 — PR/MR creation on milestone completion (new)
- R015 — Milestone-level issue tracking (new)
- R016 — Reverse flow: import and re-scope (new)

## Scope

### In Scope

- Rework sync to create one issue per milestone
- Rework ISSUE-MAP to map milestone→issue
- Add PR/MR creation to providers (createPR method on IssueProvider)
- PR/MR creation on milestone completion with `Closes #N`
- Rework close to rely on PR merge (remove tool_result auto-close hook)
- Rework import to support re-scope flow
- Update config, commands, and tools for milestone-level model
- Update tests for new model

### Out of Scope / Non-Goals

- Sub-issues for slice visibility (R017, deferred)
- GSD core changes (dispatch guard, merge behavior)
- Per-slice PR creation
- Keyboard shortcut (R020, deferred)

## Technical Constraints

- Must use `pi.exec()` for CLI calls
- TypeBox for tool parameter schemas
- Extension entry point: default export function receiving ExtensionAPI
- PR/MR creation requires appropriate CLI auth scopes
- GSD's integration branch is recorded in `.gsd/milestones/M###/M###-META.json` (or similar) — need to verify the exact file

## Integration Points

- **GSD file system** — reads STATE.md for active milestone, reads milestone metadata for integration branch
- **GitLab API** — `glab mr create` for MR creation
- **GitHub API** — `gh pr create` for PR creation
- **pi extension API** — registerTool, registerCommand, pi.exec(), pi.events

## Open Questions

- What's the exact format of GSD's milestone metadata file that records the integration branch?
- Should `/issues close` manual command still exist as a fallback, or is close purely PR-driven?
- Does the re-scope flow in import need user confirmation before closing original issues?
