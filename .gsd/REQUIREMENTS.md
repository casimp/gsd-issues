# Requirements

This file is the explicit capability and coverage contract for gsd-issues.

## Active

### R001 — Provider abstraction with auto-detection
- Class: core-capability
- Status: active
- Description: Abstract over GitLab and GitHub behind a shared IssueProvider interface, auto-detected from git remote URL
- Why it matters: Both providers used daily — GitLab for work, GitHub for personal. Neither can be a second-class citizen.
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: none
- Validation: contract — IssueProvider interface defined, both providers implement it, detectProvider resolves SSH/HTTPS remotes (mock-tested). Consumed by S03 sync workflow. Runtime validation pending UAT.
- Notes: Auto-detect from git remote (gitlab.com → GitLab, github.com → GitHub)

### R002 — Unified config with interactive setup
- Class: core-capability
- Status: active
- Description: Single .gsd/issues.json config file with provider-agnostic common fields and provider-specific sections, created via interactive /issues setup command
- Why it matters: Config is the single source of truth for all workflows — no hardcoded values
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: none
- Validation: contract — Config type system with structural validation (24 tests), interactive setup with CLI discovery and fallback paths (11 tests). loadConfig/saveConfig round-trip, validateConfig catches missing/invalid fields, setup handles both providers with auth failure and empty milestone fallbacks. Consumed by S03 sync workflow. Runtime validation pending UAT.
- Notes: Setup command discovers repo patterns (milestones, labels, branches) and walks user through config

### R003 — Sync: milestones → remote issues
- Class: primary-user-loop
- Status: active
- Description: Create one remote issue per GSD milestone with title, description, assignee, labels, and provider-specific metadata
- Why it matters: Core workflow — maps GSD planning to issue tracker for visibility and tracking. The milestone is the meaningful external unit.
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: contract — `syncMilestoneToIssue()` creates one issue per milestone with title from ROADMAP.md, description from CONTEXT.md + slice listing. Skips already-mapped milestones, crash-safe persistence, dry-run, epic assignment (20 tests). Commands and tools updated for milestone-level sync. Runtime validation pending UAT.
- Notes: Must support re-running safely (skip already-mapped milestones). M001 implemented per-slice sync — M002 reworked to per-milestone.

### R004 — Close: issue closes on milestone PR merge
- Class: primary-user-loop
- Status: active
- Description: The milestone's remote issue closes when the milestone PR/MR merges, via `Closes #N` in the PR body. Fallback: manual `/issues close` command.
- Why it matters: Close should happen through the natural review/merge flow, not through a lifecycle hook that fires before review
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: contract — Close via PR merge: `createMilestonePR()` includes `Closes #N` in PR body (platform handles auto-close on merge). Manual fallback: `closeMilestoneIssue()` calls provider.closeIssue() by milestoneId lookup. tool_result hook fully removed (D032). 8 close tests, 25 PR tests. Runtime validation pending UAT.
- Notes: M001 implemented auto-close on slice summary write. M002 replaced this with close-on-merge via `Closes #N` in PR body. Manual `/issues close` remains as fallback.

### R005 — Import: fetch issues for LLM planning
- Class: core-capability
- Status: active
- Description: Fetch and format remote issues as structured markdown, hand to LLM for interpretation and planning
- Why it matters: Existing issues inform roadmap decomposition — the extension handles the plumbing, the LLM handles judgment
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: none
- Validation: contract — importIssues() formats issues from both providers with weight sorting, description truncation (500 chars), empty list handling, and gsd-issues:import-complete event. /issues import command with --milestone/--labels flag parsing. gsd_issues_import tool with TypeBox schema. 30 tests (17 import + 13 command). Both providers populate extended Issue fields (weight, milestone, assignee, description).
- Notes: Read-only operation. Extension fetches/formats, LLM interprets.

### R006 — GitLab extras (epics, weight, labels)
- Class: integration
- Status: active
- Description: Support GitLab-specific features: epic assignment via REST API, weight, done labels (T::Done), labels
- Why it matters: These are actively used in the GitLab workflow — not optional metadata
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04
- Validation: contract (M001) — Epic assignment via REST API, weight mapping, labels from config, done label on close. Needs reframing: these features apply to milestone-level issues in M002.
- Notes: Epic assignment requires REST API (not CLI flag). Weight and labels apply to the milestone issue.

### R007 — GitHub support (milestones, labels, projects)
- Class: integration
- Status: active
- Description: Support GitHub-specific features: milestone assignment, label management, optional project assignment
- Why it matters: GitHub is used daily for personal projects — must work from day one
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04
- Validation: contract (M001) — Milestone and label assignment, close reason. Applies to milestone-level issues in M002.
- Notes: No native epics or weight — use milestones, labels, projects

### R008 — ISSUE-MAP.json mapping persistence
- Class: continuity
- Status: active
- Description: Persist milestone-to-issue mapping in provider-agnostic ISSUE-MAP.json
- Why it matters: Mapping enables close workflow, PR creation, and prevents duplicate issue creation on re-sync
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S03, M001/S04
- Validation: contract (M001) — loadIssueMap/saveIssueMap round-trip tested, structural validation, corrupt file handling. M002 reworks the mapping unit from slice to milestone.
- Notes: Clean break from predecessor GITLAB-MAP.json — new format only

### R009 — Sync surfaced as prompted step in GSD flow
- Class: primary-user-loop
- Status: active
- Description: When a milestone is planned, surface a confirmation prompt ("Create an issue for this milestone?") before creating the remote issue
- Why it matters: Creating remote issues is an outward-facing action that should be deliberate, but integrated into the natural flow
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: contract — Confirmation flow implemented for milestone-level sync. `/issues sync` shows milestone preview and confirms before creating. Tool mode (gsd_issues_sync) skips confirmation per D022.
- Notes: Not manual-only, not auto — prompted step in the workflow

### R010 — Event bus emissions for composability
- Class: integration
- Status: active
- Description: Emit events on pi.events bus (gsd-issues:sync-complete, gsd-issues:close-complete, etc.) for other extensions to consume
- Why it matters: Makes the extension composable — other extensions can react to sync/close events
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: M001/S03, M001/S05
- Validation: contract — gsd-issues:sync-complete event emitted with { milestone, created, skipped, errors } payload, tested in sync suite. gsd-issues:close-complete event emitted with { milestone, issueId, url } payload (no sliceId), tested in close suite. gsd-issues:pr-complete event emitted with { milestoneId, prUrl, prNumber } payload, tested in PR suite. gsd-issues:import-complete event emitted with { issueCount } payload, tested in import suite. All four workflow events wired.
- Notes: Cheap to add, enables future extension interop

### R011 — Slash commands (/issues sync, import, close, setup)
- Class: core-capability
- Status: active
- Description: Register slash commands for all workflows plus setup, accessible via /issues subcommand
- Why it matters: User-facing entry points for all extension functionality
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S03, M001/S04, M001/S05
- Validation: contract — /issues command registered with getArgumentCompletions, subcommand routing via switch/case. `setup` fully implemented, `sync` rewritten for milestone-level with preview/confirm flow, `close` rewritten for milestone ID arg parsing and provider delegation, `import` fully implemented with --milestone/--labels flag parsing, `pr` fully implemented with branch preview and confirmation. `status` stubbed. Runtime validation pending UAT.
- Notes: Single /issues command with subcommand routing

### R012 — LLM-callable tools with typed params
- Class: core-capability
- Status: active
- Description: Register tools (gsd_issues_sync, gsd_issues_import, etc.) that the LLM can call with typed parameters via TypeBox schemas
- Why it matters: Enables the LLM to trigger workflows programmatically, not just through slash commands
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04, M001/S05
- Validation: contract — gsd_issues_sync tool registered with milestone_id param. gsd_issues_close tool registered with milestone_id param (slice_id removed). gsd_issues_import tool registered with optional milestone, labels, state, assignee params. gsd_issues_pr tool registered with milestone_id, target_branch, dry_run params. All four workflow tools return structured ToolResult.
- Notes: Tools registered via pi.registerTool() with TypeBox parameter schemas

### R016 — Reverse flow: import issues and re-scope into milestones
- Class: core-capability
- Status: active
- Description: Import existing issues from the tracker, use them as planning input, then close/re-weight the originals and create new milestone-scoped issues reflecting the planned work
- Why it matters: Real workflows start with vague issues on the tracker — the extension should reshape them into right-sized milestones, not just mirror GSD's internal state
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Builds on M001's import (fetch + format). Adds the re-scope step: close originals, create new milestone issues.

### R017 — Sub-issues for slice visibility (optional)
- Class: differentiator
- Status: deferred
- Description: Optionally create sub-issues (GitLab) or task-list items (GitHub) under the milestone issue for each slice, giving visibility into what GSD did internally
- Why it matters: Nice-to-have for teams that want to see the breakdown without making slices the primary tracking unit
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: GitLab has native sub-issues. GitHub has task lists that can link to issues. Not a core requirement for now.

### R013 — npm packaging and distribution
- Class: launchability
- Status: active
- Description: Distributable as an npm package, installable via pi's package manager (settings.json packages array or npm install -g)
- Why it matters: Must be installable and updatable across projects and machines
- Source: user
- Primary owning slice: M001/S06
- Supporting slices: none
- Validation: contract — pi manifest present (pi.extensions: ["./src/index.ts"]), npm pack produces clean tarball (90 files, 77.6kB), tsconfig.build.json excludes tests from dist, registerTool uses single-arg ToolDefinition matching pi's real API (D028), prepublishOnly runs typecheck+test+build, README with installation/setup/usage docs. 188 tests pass. Runtime load validation pending UAT.
- Notes: package.json with pi manifest, proper exports, README

## Validated

### R014 — PR/MR creation on milestone completion
- Class: primary-user-loop
- Status: validated
- Description: Create a PR/MR from the milestone branch to main when a milestone completes, with `Closes #N` linking to the milestone's issue so close happens on merge
- Why it matters: Review is a fundamental part of team workflows — the milestone is the reviewable unit, one PR per milestone
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: M002/S01
- Validation: contract — `createPR()` on both providers (S01, mock-exec). `createMilestonePR()` pipeline: pushes branch, calls provider.createPR() with `Closes #N` from ISSUE-MAP, handles missing integration branch/same-branch/push failure (S02, 14 lib + 11 command tests). `handlePr()` command with interactive preview and confirmation. `gsd_issues_pr` tool registered. Runtime validation pending UAT.
- Notes: Uses `gh pr create` / `glab mr create`. GSD already supports integration branches — if started from a milestone branch, slices merge into it, not main. PR targets main.

### R015 — Milestone-level issue tracking
- Class: core-capability
- Status: validated
- Description: Sync creates one issue per milestone (not per slice). ISSUE-MAP maps milestone → issue. Close fires on milestone completion, not slice completion.
- Why it matters: The milestone is the meaningful external unit — it has a clear outcome, maps to one branch and one PR. Slices are internal implementation detail.
- Source: user
- Primary owning slice: M002/S02
- Supporting slices: M002/S01
- Validation: contract — `syncMilestoneToIssue()` creates one issue per milestone with CONTEXT.md + ROADMAP.md description, milestoneId as localId, crash-safe persistence, dry-run, epic assignment (20 sync tests). `closeMilestoneIssue()` uses milestoneId for map lookup (8 close tests). ISSUE-MAP entries keyed by milestone ID (D029). Commands and tools operate at milestone level. 235 tests total. Runtime validation pending UAT.
- Notes: Replaces M001's per-slice sync model. The underlying provider abstraction and CLI wrappers remain valid. Sync/close orchestration rebuilt around milestones.

## Deferred

### R020 — Keyboard shortcut (Ctrl+Alt+I)
- Class: differentiator
- Status: deferred
- Description: Quick-access keyboard shortcut for issue status or sync
- Why it matters: Convenience, not core workflow
- Source: research
- Primary owning slice: none
- Supporting slices: none
- Validation: unmapped
- Notes: Low priority — slash commands and tools cover the access patterns

## Out of Scope

### R030 — Backward compat with GITLAB-MAP.json
- Class: continuity
- Status: out-of-scope
- Description: Supporting the predecessor GITLAB-MAP.json format
- Why it matters: Prevents scope creep from migration concerns — clean break
- Source: user
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: User confirmed new format only

### R031 — GitLab setup skill migration
- Class: constraint
- Status: out-of-scope
- Description: Migrating the gitlab-setup skill as a separate entity
- Why it matters: Setup is absorbed into the extension's /issues setup command — no separate skill needed
- Source: inferred
- Primary owning slice: none
- Supporting slices: none
- Validation: n/a
- Notes: Setup functionality lives in S02

## Traceability

| ID | Class | Status | Primary owner | Supporting | Proof |
|---|---|---|---|---|---|
| R001 | core-capability | active | M001/S01 | none | contract |
| R002 | core-capability | active | M001/S02 | none | unmapped |
| R003 | primary-user-loop | active | M001/S03 | none | contract (milestone-level) |
| R004 | primary-user-loop | active | M001/S04 | none | contract (milestone-level, PR-driven) |
| R005 | core-capability | active | M001/S05 | none | unmapped |
| R006 | integration | active | M001/S03 | M001/S04 | contract (milestone-level) |
| R007 | integration | active | M001/S03 | M001/S04 | contract (milestone-level) |
| R008 | continuity | active | M001/S01 | M001/S03, M001/S04 | contract (milestone-level) |
| R009 | primary-user-loop | active | M001/S03 | none | contract (milestone-level) |
| R010 | integration | active | M001/S04 | M001/S03, M001/S05 | contract |
| R011 | core-capability | active | M001/S02 | M001/S03, M001/S04, M001/S05 | contract |
| R012 | core-capability | active | M001/S03 | M001/S04, M001/S05 | contract |
| R013 | launchability | active | M001/S06 | none | contract |
| R014 | primary-user-loop | validated | M002/S02 | M002/S01 | contract |
| R015 | core-capability | validated | M002/S02 | M002/S01 | contract |
| R016 | core-capability | active | none | none | unmapped |
| R017 | differentiator | deferred | none | none | unmapped |
| R020 | differentiator | deferred | none | none | unmapped |
| R030 | continuity | out-of-scope | none | none | n/a |
| R031 | constraint | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 14
- Mapped to slices: 13
- Validated: 2
- Unmapped active requirements: 1
