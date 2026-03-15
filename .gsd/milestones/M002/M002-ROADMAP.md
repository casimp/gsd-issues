# M002: Milestone-Level Issue Tracking and PR Workflow

**Vision:** Reframe gsd-issues so the milestone — not the slice — is the unit of external work. One issue per milestone, one PR/MR per milestone, close on merge. The extension bridges GSD's planning to the tracker and review flow, making issues meaningful rather than ceremonial.

## Success Criteria

- Sync creates one issue per milestone on GitLab or GitHub with title, description, labels, and provider-specific metadata
- On milestone completion, a PR/MR is created from the milestone branch to the target branch with `Closes #N` in the body
- The issue closes automatically when the PR merges (platform-handled)
- ISSUE-MAP tracks milestone→issue mappings (not slice→issue)
- Import can fetch existing issues and the user can re-scope them into milestone-level issues
- Manual `/issues close` works as a fallback for closing milestone issues without a PR

## Key Risks / Unknowns

- **PR/MR CLI output parsing** — `glab mr create` and `gh pr create` have different output formats. Must extract PR/MR URLs reliably.
- **Branch push before PR** — the milestone branch must be pushed to the remote before creating a PR. If auto_push is off, this is an extra step.
- **Integration branch missing** — GSD may not always record an integration branch in META.json. Need graceful fallback.

## Proof Strategy

- PR/MR CLI parsing → retire in S01 by proving both CLIs can create PRs and return parseable URLs via mock exec
- Integration branch reading → retire in S01 by proving META.json reading works for present, missing, and corrupt files
- Branch push + PR flow → retire in S02 by proving the full PR creation pipeline works end-to-end with mocks

## Verification Classes

- Contract verification: TypeScript compilation, provider interface conformance, milestone-level sync/close/PR tests
- Integration verification: real glab/gh CLI calls creating issues and PRs on actual remotes
- Operational verification: full cycle in a real GSD project — plan, sync, work, PR, merge, close
- UAT / human verification: user confirms issues and PRs appear correctly on GitLab/GitHub

## Milestone Definition of Done

This milestone is complete only when all are true:

- Sync creates milestone-level issues on both providers
- PR/MR creation works on both providers with `Closes #N`
- ISSUE-MAP stores milestone→issue mappings
- Import re-scope flow works (close originals, create milestone issues)
- tool_result auto-close hook removed or disabled (close is PR-driven)
- All commands and tools updated for milestone-level model
- Manual `/issues close` works as fallback
- Success criteria re-checked against contract tests

## Requirement Coverage

- Covers: R003, R004, R006, R007, R008, R009, R014, R015, R016
- Partially covers: R010 (events updated for milestone model), R011 (commands updated), R012 (tools updated)
- Leaves for later: R017 (sub-issues), R020 (keyboard shortcut)
- Orphan risks: none

## Slices

- [ ] **S01: PR/MR provider support and milestone-level mapping** `risk:high` `depends:[]`
  > After this: IssueProvider has createPR() method, both providers can create PRs via CLI, ISSUE-MAP stores milestone→issue entries, readIntegrationBranch() reads META.json.

- [ ] **S02: Milestone-level sync and PR creation** `risk:medium` `depends:[S01]`
  > After this: `/issues sync` creates one issue per milestone, `/issues pr` creates a PR/MR from milestone branch to target with `Closes #N`, tool_result auto-close hook replaced with PR-driven close.

- [ ] **S03: Import re-scope and cleanup** `risk:low` `depends:[S01,S02]`
  > After this: `/issues import` fetches issues, user can re-scope into milestone issues (close originals, create new), all commands/tools updated, tests migrated to milestone model.

## Boundary Map

### S01 → S02, S03

Produces:
- `providers/types.ts` → `createPR(opts: CreatePROpts): Promise<PRResult>` on IssueProvider, `CreatePROpts`, `PRResult` types, `IssueMapEntry.localId` now holds milestone ID
- `providers/gitlab.ts` → GitLabProvider.createPR() wrapping `glab mr create`
- `providers/github.ts` → GitHubProvider.createPR() wrapping `gh pr create`
- `lib/state.ts` → `readIntegrationBranch(cwd, milestoneId)` reading META.json
- `lib/issue-map.ts` → unchanged API, but entries now keyed by milestone ID

Consumes:
- nothing new (builds on M001 foundation)

### S02 → S03

Produces:
- `lib/sync.ts` → `syncMilestoneToIssue(opts)` creating one issue per milestone
- `lib/pr.ts` → `createMilestonePR(opts)` creating PR from milestone branch with `Closes #N`
- `commands/sync.ts` → updated handler for milestone-level sync
- `commands/pr.ts` → new handler for `/issues pr`
- `index.ts` → tool_result hook removed/updated, `gsd_issues_pr` tool registered

Consumes from S01:
- `IssueProvider.createPR()`, `CreatePROpts`, `PRResult`
- `readIntegrationBranch()`
- Milestone-level `IssueMapEntry`

### S03 → (terminal)

Produces:
- `lib/import.ts` → `rescopeIssues(opts)` closing originals and creating milestone issues
- `commands/import.ts` → updated handler with re-scope subflow
- Updated tests across the board

Consumes from S01:
- `IssueProvider.createIssue()`, `IssueProvider.closeIssue()`
- Milestone-level `IssueMapEntry`

Consumes from S02:
- `syncMilestoneToIssue()` pattern for creating milestone issues
