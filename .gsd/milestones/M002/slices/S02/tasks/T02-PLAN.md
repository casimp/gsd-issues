---
estimated_steps: 4
estimated_files: 4
---

# T02: Build PR creation pipeline and command

**Slice:** S02 — Milestone-level sync and PR creation
**Milestone:** M002

## Description

Create the PR creation module (`lib/pr.ts`) and its command handler (`commands/pr.ts`). The PR pipeline reads the integration branch from META.json, pushes the branch to remote, and calls `provider.createPR()` with `Closes #N` from the ISSUE-MAP entry. The command provides an interactive flow with milestone resolution, confirmation, and error reporting.

## Steps

1. Create `src/lib/pr.ts` with `createMilestonePR(opts)`:
   - Options: `{ provider, config, exec, cwd, milestoneId, mapPath, emit?, dryRun?, targetBranch? }`
   - Read integration branch via `readIntegrationBranch(cwd, milestoneId)` — error if null ("No integration branch configured for milestone {MID}")
   - Determine target branch: `targetBranch` param > config field > `"main"`
   - Guard: source branch === target branch → error ("Milestone branch is '{branch}' — cannot create a PR from a branch to itself")
   - Load ISSUE-MAP to find `closesIssueId` — if no entry, `closesIssueId` is undefined (PR still created, just without `Closes #N`)
   - Push branch: `exec("git", ["push", "-u", "origin", sourceBranch], { cwd })`  — propagate push failure with clear message
   - Call `provider.createPR({ title, body, headBranch, baseBranch, closesIssueId })` — title from milestone ID + ROADMAP.md title, body includes summary text
   - Emit `gsd-issues:pr-complete` event with `{ milestoneId, prUrl, prNumber }`
   - Return `PRResult`
   - Export `PrToolSchema` (TypeBox) and `PrToolParams` type
2. Create `src/commands/pr.ts` with `handlePr(args, ctx, pi)`:
   - Parse milestone ID from args (positional or `--milestone` flag), fall back to config/GSD state
   - Load config, resolve mapPath
   - Check integration branch exists — error message if not
   - Show PR preview (source → target, closes #N if mapped)
   - Confirm with user
   - Call `createMilestonePR()`, report result via `ctx.ui.notify`
3. Write `src/lib/__tests__/pr.test.ts`: mock exec for git push and mock provider for createPR. Cover: success path, Closes #N injection, missing integration branch, same-branch error, push failure, missing ISSUE-MAP entry (PR without close), dry-run, event emission.
4. Write `src/commands/__tests__/pr.test.ts`: mock pi.exec, provider, filesystem. Cover: full interactive flow, milestone resolution from args/config/state, confirmation rejection, missing config, push error surfaced to user.

## Must-Haves

- [ ] `createMilestonePR()` pushes branch before creating PR
- [ ] `createMilestonePR()` includes `Closes #N` when ISSUE-MAP entry exists
- [ ] `createMilestonePR()` works without ISSUE-MAP entry (PR without close link)
- [ ] `createMilestonePR()` errors on missing integration branch with clear message
- [ ] `createMilestonePR()` errors on source === target branch
- [ ] `createMilestonePR()` propagates push failure before attempting PR
- [ ] `handlePr` command provides interactive flow with confirmation
- [ ] `PrToolSchema` exported for tool registration in T03

## Verification

- `npx vitest run src/lib/__tests__/pr.test.ts src/commands/__tests__/pr.test.ts` — all pass
- `npx tsc --noEmit` — clean

## Observability Impact

- Signals added/changed: new `gsd-issues:pr-complete` event with `{ milestoneId, prUrl, prNumber }`
- How a future agent inspects this: PR creation error includes which step failed (push vs createPR) and carries ProviderError diagnostics for CLI failures
- Failure state exposed: push failure reported with git stderr; missing integration branch and same-branch detected pre-flight with actionable error messages

## Inputs

- `src/providers/types.ts` — `IssueProvider.createPR()`, `CreatePROpts`, `PRResult` (from S01)
- `src/lib/state.ts` — `readIntegrationBranch()` (from S01)
- `src/lib/issue-map.ts` — `loadIssueMap()` for finding closesIssueId
- `src/lib/sync.ts` — T01's `syncMilestoneToIssue()` creates the ISSUE-MAP entries this consumes
- S01 forward intelligence: `closesIssueId` is a number (the issue ID), not a URL

## Expected Output

- `src/lib/pr.ts` — `createMilestonePR()`, `PrToolSchema`, `PrToolParams`
- `src/lib/__tests__/pr.test.ts` — comprehensive PR pipeline tests
- `src/commands/pr.ts` — `handlePr()` command handler
- `src/commands/__tests__/pr.test.ts` — command handler tests
