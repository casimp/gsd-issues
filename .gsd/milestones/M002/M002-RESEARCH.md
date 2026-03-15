# M002 — Research

**Date:** 2026-03-14

## Summary

M002 reframes gsd-issues from per-slice to per-milestone issue tracking. The core changes are: sync creates one issue per milestone, ISSUE-MAP maps milestones not slices, close happens via PR merge (`Closes #N`) instead of a tool_result hook, and a new `createPR`/`createMR` method is added to the provider interface.

The M001 foundation (provider abstraction, config system, CLI wrappers, detect, issue-map I/O) is solid and carries forward. The sync/close orchestration and the tool_result hook need replacement. Import needs the re-scope addition.

GSD records the integration branch per milestone in `.gsd/milestones/M###/M###-META.json` as `{ integrationBranch: "branch-name" }`. The extension can read this to know what branch to create a PR from.

## Recommendation

Rework in three phases: (1) add PR/MR creation to providers and rework ISSUE-MAP for milestone-level mapping, (2) rebuild sync/close around milestones and PRs, (3) extend import with re-scope flow. Keep the provider abstraction and config system largely intact — they're level-agnostic.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| CLI output parsing | ProviderError class from M001 | Already handles exit codes, stderr, malformed stdout |
| Config I/O | loadConfig/saveConfig from M001 | Structural validation, error messages, round-trip tested |
| Issue map persistence | loadIssueMap/saveIssueMap from M001 | Validation, missing file handling, crash-safe writes |

## Existing Code and Patterns

- `src/providers/types.ts` — IssueProvider interface needs `createPR(opts)` method added. IssueMapEntry.localId changes from slice ID to milestone ID.
- `src/providers/gitlab.ts` — Add `createPR()` wrapping `glab mr create`. Existing `createIssue`/`closeIssue`/`listIssues`/`addLabels` unchanged.
- `src/providers/github.ts` — Add `createPR()` wrapping `gh pr create`. Same pattern as GitLab.
- `src/lib/sync.ts` — Complete rewrite. New function creates one issue per milestone from milestone context (title, vision, success criteria) instead of iterating roadmap slices.
- `src/lib/close.ts` — Simplify. Remove tool_result hook logic. Keep `closeSliceIssue` renamed to `closeMilestoneIssue` as a manual fallback. Primary close is via `Closes #N` on PR merge (platform-handled).
- `src/lib/import.ts` — Add re-scope capability: close originals, create new milestone issues from planning output.
- `src/lib/state.ts` — `readGSDState()` already reads active milestone. Add `readIntegrationBranch()` to read from META.json.
- `src/index.ts` — Remove or rework tool_result hook. Update tool registrations.
- `src/lib/config.ts` — May need `target_branch` field for PR target (defaults to `main`).

## Constraints

- Must read GSD's `.gsd/milestones/M###/M###-META.json` for integration branch — file format is `{ integrationBranch: "branch-name" }`.
- `glab mr create` requires `--source-branch` and `--target-branch` flags.
- `gh pr create` requires `--base` and `--head` flags.
- PR/MR creation requires the branch to be pushed to the remote first.
- `Closes #N` syntax works in both GitLab MR descriptions and GitHub PR bodies for auto-close on merge.

## Common Pitfalls

- **Branch not pushed** — PR/MR creation will fail if the source branch hasn't been pushed. The extension needs to push the branch before creating the PR, or check and guide the user.
- **Integration branch is main** — If GSD was started from main (no milestone branch), there's no branch to PR from. The extension should detect this and warn.
- **Re-scope partial failure** — Closing original issues and creating new ones is multi-step. If creation succeeds but close fails (or vice versa), the tracker is inconsistent. Need idempotent operations.

## Open Risks

- `glab mr create` and `gh pr create` output format differences — need to verify URL parsing works for both.
- Branch push permissions — the user may not have push access to the remote for the milestone branch.
- GSD may not always record an integration branch (e.g. older milestones, manual setup). Fallback behavior needed.

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| n/a | n/a | n/a |

## Sources

- GSD git-service.ts (`~/.gsd/agent/extensions/gsd/git-service.ts`) — integration branch recording, merge mechanics
- GSD auto.ts (`~/.gsd/agent/extensions/gsd/auto.ts`) — merge guard, dispatch flow
- GSD dispatch-guard.ts (`~/.gsd/agent/extensions/gsd/dispatch-guard.ts`) — slice ordering logic
