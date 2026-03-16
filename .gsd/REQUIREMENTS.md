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

### R021 — Auto-flow orchestration
- Class: core-capability
- Status: validated
- Description: `/issues auto` drives the full milestone lifecycle — scope (if needed), then delegates to GSD auto-mode via `/gsd auto` for plan→execute→pr
- Why it matters: One command drives the entire workflow end-to-end without manual intervention
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: M004/S02
- Validation: contract — Smart entry → scope → GSD auto chain (17 S01 tests). agent_end hooks auto-sync on ROADMAP.md and auto-PR on SUMMARY.md (10 S02 tests). Full lifecycle proven: scope → plan → sync → execute → PR. 324 tests total.
- Notes: Re-scoped in M004 — no longer a parallel state machine, now a thin layer over GSD's auto-mode

### R022 — Scope phase
- Class: core-capability
- Status: validated
- Description: When no milestone exists, the extension sends a scope prompt to the LLM instructing it to create right-sized milestones under `.gsd/milestones/` with CONTEXT.md files
- Why it matters: Users start with work, not milestone IDs — the extension creates the structure
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: M004/S02
- Validation: contract — `buildScopePrompt()` constructs structured prompt with optional sizing/import context (21 tests). Completion detection via CONTEXT.md diffing in `agent_end` handler (3 tests). `gsd-issues:scope-complete` event emitted. Runtime prompt quality is UAT.
- Notes: Prompt quality validated by first real `/issues` run, not by contract tests

### R023 — /issues scope command
- Class: core-capability
- Status: validated
- Description: `/issues scope` runs scoping independently of auto-flow
- Why it matters: Users may want to scope without starting auto-mode
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: M004/S02
- Validation: contract — `/issues scope` subcommand routes to `handleSmartEntry()`, appears in argument completions. 2 tests. Scope flow also accessible through bare `/issues` smart entry.
- Notes: Proven by M004/S02

### R024 — Multi-milestone sequencing
- Class: core-capability
- Status: validated
- Description: If scope creates multiple milestones, auto-flow loops through each one (plan→validate-size→sync→execute→pr per milestone)
- Why it matters: Real work often spans multiple milestones — the extension should handle the loop
- Source: user
- Primary owning slice: M004/S02
- Supporting slices: none
- Validation: contract — agent_end hooks auto-sync on ROADMAP.md detection (unmapped milestone → `syncMilestoneToIssue()`) and auto-PR on SUMMARY.md detection (mapped + completed → `createMilestonePR()`). Both idempotent via set-based dedup, gated on hooks-enabled flag, non-blocking. 10 hook tests cover all paths. Combined with S01's scope→auto chain, multi-milestone loop is proven.
- Notes: Proven by M004/S02

### R025 — No milestone ID at entry
- Class: core-capability
- Status: validated
- Description: `/issues` and `/issues auto` work without a pre-existing milestone ID in config or GSD state
- Why it matters: Milestone IDs are internal details — users shouldn't need to know them to start
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: none
- Validation: contract — `config.milestone` optional (D049), smart entry detects state and routes accordingly. 17 tests cover all entry paths (no milestones, existing milestones, active GSD state).
- Notes: Proven by M004/S01

### R026 — Resume still works
- Class: core-capability
- Status: validated
- Description: `/issues auto` with an active milestone in GSD state resumes it without re-scoping
- Why it matters: Existing behavior must not break — users with in-progress milestones should be able to continue
- Source: user
- Primary owning slice: M004/S01
- Supporting slices: none
- Validation: contract — resume via GSD state (active milestone notification) and resume via existing milestones on disk (skip scope, dispatch `/gsd auto` directly). 3 tests cover resume paths.
- Notes: Proven by M004/S01

### R018 — Milestone sizing config
- Class: core-capability
- Status: validated
- Description: `/issues setup` collects `max_slices_per_milestone` and `sizing_mode` (strict/best_try), persists to `.gsd/issues.json`
- Why it matters: Sizing constraints must be configurable per-project — the extension enforces right-sized milestones based on user preference
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: M003/S02
- Validation: contract — Config interface extended with both fields, validateConfig() rejects bad types/values (15 tests), setup wizard collects with defaults (5 / best_try), summary displays fields (13 setup tests). validateMilestoneSize() consumes config fields in orchestration (9 sizing tests). 309 tests total.
- Notes: Fields always written to config (not conditional on empty) since they have defaults (D040)

### R019 — Milestone size validation
- Class: core-capability
- Status: validated
- Description: After planning, extension validates the milestone's slice count against the configured `max_slices_per_milestone` limit
- Why it matters: Prevents milestones from growing unbounded — enables the auto-flow split in S02
- Source: user
- Primary owning slice: M003/S01
- Supporting slices: M003/S02
- Validation: contract — `validateMilestoneSize()` returns typed `SizingResult` with valid/sliceCount/limit/mode/milestoneId. Handles no-limit (skip), under/at/over limit, 0 slices, missing roadmap (throws). 9 tests. Integrated into auto-flow validate-size phase — oversized triggers split in strict, warn in best_try (3 orchestration tests).
- Notes: Integration into orchestration loop completed in S02 (validate-size phase calls validateMilestoneSize)

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

### R016 — Reverse flow: import issues and re-scope into milestones
- Class: core-capability
- Status: validated
- Description: Import existing issues from the tracker, use them as planning input, then close/re-weight the originals and create new milestone-scoped issues reflecting the planned work
- Why it matters: Real workflows start with vague issues on the tracker — the extension should reshape them into right-sized milestones, not just mirror GSD's internal state
- Source: user
- Primary owning slice: M002/S03
- Supporting slices: none
- Validation: contract — `rescopeIssues()` creates milestone issue via `syncMilestoneToIssue()`, closes originals best-effort with per-issue error collection. Double re-scope guard skips if milestone already mapped. Already-closed originals tolerated. Both command (`--rescope`/`--originals` with confirmation) and tool (`rescope_milestone_id`/`original_issue_ids` params) paths tested. 7 re-scope tests. `gsd-issues:rescope-complete` event emitted. Runtime validation pending UAT.
- Notes: Builds on M001's import (fetch + format). Adds the re-scope step: close originals, create new milestone issues.

## Deferred

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
| R016 | core-capability | validated | M002/S03 | none | contract |
| R017 | differentiator | deferred | none | none | unmapped |
| R018 | core-capability | validated | M003/S01 | M003/S02 | contract |
| R019 | core-capability | validated | M003/S01 | M003/S02 | contract |
| R020 | differentiator | deferred | none | none | unmapped |
| R021 | core-capability | validated | M004/S01 | M004/S02 | contract |
| R022 | core-capability | validated | M004/S01 | M004/S02 | contract |
| R023 | core-capability | validated | M004/S01 | M004/S02 | contract |
| R024 | core-capability | validated | M004/S02 | none | contract |
| R025 | core-capability | validated | M004/S01 | none | contract |
| R026 | core-capability | validated | M004/S01 | none | contract |
| R030 | continuity | out-of-scope | none | none | n/a |
| R031 | constraint | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 12
- Mapped to slices: 12
- Validated: 11
- Unmapped active requirements: 0
