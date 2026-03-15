---
id: T02
parent: S02
milestone: M002
provides:
  - createMilestonePR() — pushes branch and creates PR/MR with optional Closes #N
  - handlePr() — interactive command handler with preview, confirmation, error reporting
  - PrToolSchema / PrToolParams — TypeBox schema for tool registration in T03
key_files:
  - src/lib/pr.ts
  - src/lib/__tests__/pr.test.ts
  - src/commands/pr.ts
  - src/commands/__tests__/pr.test.ts
key_decisions:
  - PR title format is "M001: <milestone title>" using same ROADMAP→CONTEXT→milestoneId fallback as sync
  - PR body includes milestone reference, Closes #N when mapped, and gsd metadata tag
  - Target branch priority: explicit param > config branch_pattern > "main"
  - Push failure detected and reported before attempting PR creation (no orphaned PRs)
patterns_established:
  - PR command follows same arg parsing pattern as close command (positional, --milestone, --milestone=, --target)
  - createMilestonePR follows same options-bag pattern as syncMilestoneToIssue with emit/dryRun
  - Test helpers mirror sync test patterns (setupMilestoneFiles with META.json, CONTEXT.md, ROADMAP.md)
observability_surfaces:
  - gsd-issues:pr-complete event payload: { milestoneId, prUrl, prNumber }
  - Push failure includes branch name and git stderr in error message
  - Missing integration branch and same-branch detected pre-flight with milestoneId in message
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Build PR creation pipeline and command

**Created PR creation pipeline (`createMilestonePR`) and interactive command handler (`handlePr`) with branch push, Closes #N injection, pre-flight guards, and dry-run support.**

## What Happened

Built `src/lib/pr.ts` with `createMilestonePR(opts)` implementing the full pipeline: read integration branch from META.json, determine target branch (param > config > "main"), guard against same-branch, load ISSUE-MAP for `closesIssueId`, push branch to remote, call `provider.createPR()` with title and body (including `Closes #N` when mapped), emit `gsd-issues:pr-complete` event. Dry-run returns preview without side effects.

Built `src/commands/pr.ts` with `handlePr(args, ctx, pi)` providing interactive flow: parse milestone from args (positional, `--milestone`, `--milestone=`), fall back to config/GSD state, check integration branch exists, show PR preview (source → target, Closes #N status), confirm with user, create PR, report result or error.

Exported `PrToolSchema` and `PrToolParams` from `pr.ts` for tool registration in T03.

## Verification

- `npx vitest run src/lib/__tests__/pr.test.ts src/commands/__tests__/pr.test.ts` — 25 tests pass
- `npx vitest run` — all 240 tests pass (15 files, 0 failures)
- `npx tsc --noEmit` — clean, no type errors

Slice-level verification status (partial, T02 is not the final task):
- ✅ `npx vitest run` — 240 tests pass (target 212+)
- ✅ `npx tsc --noEmit` — clean
- ✅ New sync tests: milestone-level sync (from T01)
- ✅ New PR tests: push + createPR pipeline, Closes #N in body, missing integration branch error, same-branch error, missing ISSUE-MAP entry (PR without close), push failure handling, dry-run, event emission, target branch resolution, title fallback chain
- ✅ Updated close tests: milestone ID parameter (from T01)
- ✅ Command tests: `/issues sync` milestone preview (T01), `/issues pr` full flow with confirmation/rejection/errors
- ⬜ Index tests: hook removal not yet (T03), new tool registrations not yet (T03)

## Diagnostics

- `gsd-issues:pr-complete` event: `{ milestoneId: "M001", prUrl: "https://...", prNumber: 1 }`
- Missing integration branch error: `"No integration branch configured for milestone M001"`
- Same-branch error: `"Milestone branch is 'main' — cannot create a PR from a branch to itself"`
- Push failure: `"Failed to push branch 'gsd/M001/S01': <git stderr>"` — provider.createPR is NOT called
- PR body contains `[gsd:M001]` metadata tag for future agent discovery

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/pr.ts` — `createMilestonePR()`, `PrToolSchema`, `PrToolParams`, title/body builders
- `src/lib/__tests__/pr.test.ts` — 14 tests covering success, Closes #N, missing branch, same-branch, push failure, dry-run, event emission, target branch resolution, title fallback
- `src/commands/pr.ts` — `handlePr()` command handler with interactive preview and confirmation
- `src/commands/__tests__/pr.test.ts` — 11 tests covering full flow, arg parsing, confirmation rejection, missing config, push error, same-branch error
