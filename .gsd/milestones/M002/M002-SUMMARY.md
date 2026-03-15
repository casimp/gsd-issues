---
id: M002
provides:
  - "Milestone-level sync: one issue per milestone with CONTEXT.md + ROADMAP.md description"
  - "PR/MR creation pipeline: push branch, create PR with Closes #N, both providers"
  - "Close-on-merge model: tool_result hook removed, close is PR-driven with manual fallback"
  - "Import re-scope: close originals best-effort, create milestone issue via sync reuse"
  - "readIntegrationBranch() and readMilestoneContext() state readers"
  - "createProvider() shared factory in lib/provider-factory.ts"
  - "gsd_issues_pr tool and /issues pr command"
  - "gsd-issues:pr-complete and gsd-issues:rescope-complete events"
key_decisions:
  - "D029: IssueMapEntry.localId holds milestone ID (convention shift, no schema change)"
  - "D030: createPR body includes Closes #N for platform-native close-on-merge"
  - "D031: PR target branch: explicit param > readIntegrationBranch() > main"
  - "D032: tool_result hook fully removed — close is PR-driven. Supersedes D007"
  - "D033: Milestone issue weight from highest-risk slice in ROADMAP.md"
  - "D034: Milestone issue description from CONTEXT.md body + ROADMAP.md slice listing"
  - "D035: ExtensionAPI.on() removed from interface — clean break"
  - "D036: rescopeIssues calls syncMilestoneToIssue directly — no duplication"
  - "D037: createProvider extracted to lib/provider-factory.ts from 5 copies. Supersedes D023"
patterns_established:
  - "Options-bag pattern with emit/dryRun for all orchestration functions (sync, close, pr, rescope)"
  - "ENOENT-to-null pattern for optional GSD file reads (readIntegrationBranch, readMilestoneContext)"
  - "Per-item error collection for best-effort batch operations (rescope closeErrors)"
  - "Separate URL regexes per entity type (PR_URL_RE, MR_URL_RE, ISSUE_URL_RE)"
  - "Shared lib/ modules for cross-cutting concerns (provider-factory)"
observability_surfaces:
  - "gsd-issues:sync-complete event: { milestone, created, skipped, errors }"
  - "gsd-issues:close-complete event: { milestone, issueId, url }"
  - "gsd-issues:pr-complete event: { milestoneId, prUrl, prNumber }"
  - "gsd-issues:rescope-complete event: { milestoneId, createdIssueId, closedOriginals, closeErrors }"
  - "ProviderError on createPR carries provider, operation, exitCode, stderr, command"
  - "RescopeResult.closeErrors array exposes per-issue failures"
  - "ISSUE-MAP.json milestone entries with crash-safe writes"
requirement_outcomes:
  - id: R014
    from_status: active
    to_status: validated
    proof: "createPR() on both providers with mock-exec tests (S01, 15 tests). createMilestonePR() pipeline: push branch, create PR with Closes #N, handle missing branch/same-branch/push failure (S02, 14 lib + 11 command tests). gsd_issues_pr tool registered."
  - id: R015
    from_status: active
    to_status: validated
    proof: "syncMilestoneToIssue() creates one issue per milestone with CONTEXT.md + ROADMAP.md description (20 tests). closeMilestoneIssue() uses milestoneId for map lookup (8 tests). ISSUE-MAP keyed by milestone ID (D029). All commands and tools operate at milestone level. 242 tests total."
  - id: R016
    from_status: active
    to_status: validated
    proof: "rescopeIssues() creates milestone issue via syncMilestoneToIssue(), closes originals best-effort with per-issue error collection. Double re-scope guard, already-closed tolerance. Both command (--rescope/--originals with confirmation) and tool (rescope_milestone_id/original_issue_ids) paths tested. 7 re-scope tests."
duration: ~110min
verification_result: passed
completed_at: 2026-03-14
---

# M002: Milestone-Level Issue Tracking and PR Workflow

**Rewrote gsd-issues from per-slice to per-milestone issue tracking with PR-driven close-on-merge, re-scope import flow, and four LLM-callable tools.**

## What Happened

Three slices shifted the entire extension from slice-level operations to milestone-level operations, added PR creation, and cleaned up the model.

**S01** (high risk, retired first) extended the provider layer. Added `createPR()` to the `IssueProvider` interface with implementations on both providers — GitHubProvider wraps `gh pr create`, GitLabProvider wraps `glab mr create --yes --no-editor`. Both parse PR/MR URLs from CLI stdout with dedicated regexes, support `--draft`, and append `Closes #N` when `closesIssueId` is set. Added `readIntegrationBranch()` to read META.json for the milestone's target branch, with full ENOENT/corrupt/invalid resilience. Established the convention that `IssueMapEntry.localId` holds a milestone ID (D029). 24 new tests.

**S02** (medium risk) rebuilt the core orchestration. `syncSlicesToIssues` became `syncMilestoneToIssue` — creates exactly one issue per milestone call with description composed from CONTEXT.md body and ROADMAP.md slice listing. `closeSliceIssue` became `closeMilestoneIssue` using milestoneId for map lookup. Built `createMilestonePR()` — reads integration branch from META.json, validates source ≠ target, pushes branch, calls `provider.createPR()` with `Closes #N`. Removed the entire `tool_result` lifecycle hook (~50 lines) and the `ExtensionAPI.on()` interface method — close is now purely PR-driven with manual `/issues close` as fallback. Registered `gsd_issues_pr` tool and wired `/issues pr` command. 23 new tests, several existing tests rewritten.

**S03** (low risk, terminal) added the re-scope flow. `rescopeIssues()` delegates issue creation to `syncMilestoneToIssue()` then iterates originals calling `closeIssue()` best-effort with per-item error collection. Already-closed originals tolerated via ProviderError pattern matching. Both command (`--rescope`/`--originals` with confirmation) and tool surfaces wired. Extracted `createProvider()` from 5 inline copies to `lib/provider-factory.ts`. Fixed stale JSDoc. 7 new tests.

## Cross-Slice Verification

**"Sync creates one issue per milestone with title, description, labels, and provider-specific metadata"**
— Verified: `syncMilestoneToIssue()` tested with 20 tests covering single-issue creation, description from CONTEXT.md + ROADMAP.md, labels from config, epic assignment via REST API, weight from highest-risk slice. Both providers tested.

**"On milestone completion, a PR/MR is created from the milestone branch to the target branch with `Closes #N`"**
— Verified: `createMilestonePR()` tested with 14 lib tests + 11 command tests. Push + createPR pipeline, `Closes #N` body injection, missing integration branch fallback to `main`, same-branch rejection, push failure handling, dry-run, event emission.

**"The issue closes automatically when the PR merges (platform-handled)"**
— Verified by design: `Closes #N` syntax in PR body (D030). `grep "tool_result" src/index.ts` returns 0 matches confirming hook removal.

**"ISSUE-MAP tracks milestone→issue mappings"**
— Verified: D029 establishes convention. All sync/close/PR tests use milestone IDs as localId. JSDoc updated in S03.

**"Import can fetch existing issues and the user can re-scope them into milestone-level issues"**
— Verified: `rescopeIssues()` tested with 4 lib tests (happy path, partial close failure, double re-scope skip, already-closed tolerance) + 3 command tests (confirmation flow, flag parsing).

**"Manual `/issues close` works as a fallback"**
— Verified: `closeMilestoneIssue()` tested with 8 tests. Command handler parses milestone ID argument.

**Aggregate verification:** 242 tests pass across 15 test files in ~2.4s. `npx tsc --noEmit` clean. 4 tools registered (sync, close, import, pr). 6 subcommands routed (setup, sync, import, close, pr, status).

## Requirement Changes

- R014: active → validated — `createPR()` on both providers (15 mock-exec tests), `createMilestonePR()` full pipeline (25 tests), `gsd_issues_pr` tool registered. Contract-proven.
- R015: active → validated — `syncMilestoneToIssue()` creates one issue per milestone (20 tests), `closeMilestoneIssue()` by milestoneId (8 tests), ISSUE-MAP keyed by milestone ID. 242 tests total across milestone model. Contract-proven.
- R016: active → validated — `rescopeIssues()` with sync reuse, best-effort close, error collection, double re-scope guard. Both command and tool paths tested (7 tests). Contract-proven.
- R004: re-scoped — Close mechanism changed from tool_result auto-close hook (D007) to PR-driven close-on-merge (D032). Manual `/issues close` remains as fallback.

## Forward Intelligence

### What the next milestone should know
- The extension now has 4 complete workflows: sync, close, PR, import (with re-scope). All operate at milestone level. 242 contract tests run in ~2.4s.
- `syncMilestoneToIssue()` is called from both sync and re-scope paths — changes to its signature affect two workflows.
- `createProvider()` lives in `lib/provider-factory.ts` (D037) — the single source of truth for provider instantiation.
- `/issues status` is still stubbed — the subcommand routes but has no implementation.
- Runtime UAT on real GitLab/GitHub remotes is the remaining validation gap for all requirements.

### What's fragile
- CLI output parsing (`PR_URL_RE`, `MR_URL_RE`, `ISSUE_URL_RE`) depends on `gh`/`glab` stdout format — if CLI versions change output, parsing breaks. Error messages include raw stdout for diagnosis.
- `readMilestoneContext()` parses CONTEXT.md by looking for "## Project Description" or taking body after first heading — if the template format changes, description extraction breaks.
- PR title and sync title use the same ROADMAP→CONTEXT→milestoneId fallback chain but are independent implementations — changes need updating in both places.

### Authoritative diagnostics
- `npx vitest run` — 242 tests in ~2.4s validates the entire contract surface
- `npx tsc --noEmit` — type system catches interface/import mismatches
- `grep 'name: "gsd_issues_' src/index.ts` — confirms 4 registered tools
- `grep "tool_result" src/index.ts` — confirms hook removal (0 matches)
- `grep -rn "function createProvider" src/` — confirms single copy in provider-factory.ts

### What assumptions changed
- D007 (tool_result hook for close) was superseded by D032 (PR-driven close). The hook mechanism was entirely removed, not just updated.
- D023 (defer createProvider extraction) was superseded by D037 after reaching 5 inline copies.
- T01 of S02 had to update command handlers and index.ts wiring that was planned for T03 — renamed functions wouldn't compile without updating consumers.

## Files Created/Modified

- `src/providers/types.ts` — added `CreatePROpts`, `PRResult` types, `createPR()` on IssueProvider, updated JSDoc
- `src/providers/github.ts` — added `createPR()` with `PR_URL_RE`
- `src/providers/gitlab.ts` — added `createPR()` with `MR_URL_RE`
- `src/lib/state.ts` — added `readIntegrationBranch()`, `readMilestoneContext()`, `VALID_BRANCH_NAME`
- `src/lib/sync.ts` — rewrote from slice-level to milestone-level sync
- `src/lib/close.ts` — rewrote to `closeMilestoneIssue()` with milestone ID parameter
- `src/lib/pr.ts` — new: `createMilestonePR()`, `PrToolSchema`, `PrToolParams`
- `src/lib/import.ts` — added `rescopeIssues()`, `RescopeOptions`, `RescopeResult`, expanded `ImportToolSchema`
- `src/lib/provider-factory.ts` — new: shared `createProvider()` factory
- `src/commands/sync.ts` — milestone-level preview and sync, imports from provider-factory
- `src/commands/close.ts` — milestone ID arg parsing, imports from provider-factory
- `src/commands/pr.ts` — new: `handlePr()` interactive command
- `src/commands/import.ts` — `--rescope`/`--originals` flag parsing, confirmation flow
- `src/index.ts` — hook removed, `gsd_issues_pr` registered, pr subcommand routed, ExtensionAPI simplified
- `src/providers/__tests__/github.test.ts` — 7 createPR tests
- `src/providers/__tests__/gitlab.test.ts` — 8 createPR tests
- `src/lib/__tests__/state.test.ts` — 9 readIntegrationBranch + readMilestoneContext tests
- `src/lib/__tests__/sync.test.ts` — rewritten for milestone model (20 tests)
- `src/lib/__tests__/close.test.ts` — updated for milestone parameter (8 tests)
- `src/lib/__tests__/pr.test.ts` — new: 14 tests
- `src/lib/__tests__/import.test.ts` — 4 re-scope tests added
- `src/commands/__tests__/sync.test.ts` — updated for milestone sync (11 tests)
- `src/commands/__tests__/close.test.ts` — updated, hook tests removed (8 tests)
- `src/commands/__tests__/pr.test.ts` — new: 11 tests
- `src/commands/__tests__/import.test.ts` — 3 re-scope command tests added
