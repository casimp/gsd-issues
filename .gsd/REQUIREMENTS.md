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

### R003 — Sync: roadmap slices → remote issues
- Class: primary-user-loop
- Status: active
- Description: Create one remote issue per roadmap slice with milestone, assignee, labels, and provider-specific metadata
- Why it matters: Core workflow — maps GSD planning to issue tracker for visibility and tracking
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: contract — Full sync pipeline tested: creates issues for unmapped slices, skips mapped, crash-safe map persistence, dry-run preview. 33 sync-related tests. UAT pending with real remotes.
- Notes: Must support re-running safely (skip already-mapped slices)

### R004 — Close: auto-close on slice completion
- Class: primary-user-loop
- Status: active
- Description: Automatically close the mapped remote issue when a slice's summary file is written, via tool_result lifecycle hook
- Why it matters: Eliminates the manual step of closing issues — the extension handles it deterministically
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: none
- Validation: unmapped
- Notes: Hook watches for S##-SUMMARY.md writes

### R005 — Import: fetch issues for LLM planning
- Class: core-capability
- Status: active
- Description: Fetch and format remote issues as structured markdown, hand to LLM for interpretation and planning
- Why it matters: Existing issues inform roadmap decomposition — the extension handles the plumbing, the LLM handles judgment
- Source: user
- Primary owning slice: M001/S05
- Supporting slices: none
- Validation: unmapped
- Notes: Read-only operation. Extension fetches/formats, LLM interprets.

### R006 — GitLab extras (epics, weight, labels, reorg)
- Class: integration
- Status: active
- Description: Support GitLab-specific features: epic assignment via REST API, weight in hours (S/M/L size-based), done labels (T::Done), absorbed ticket reorganisation with close/comment/weight reconciliation
- Why it matters: These are actively used in the GitLab workflow — not optional metadata
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04
- Validation: contract — Epic assignment via REST API (glab api), weight mapping (fibonacci/linear from risk level), labels from config. 22 sync tests cover GitLab-specific paths. UAT pending.
- Notes: Epic assignment requires REST API (not CLI flag). Weight strategy and reorganisation config from predecessor skills.

### R007 — GitHub support (milestones, labels, projects)
- Class: integration
- Status: active
- Description: Support GitHub-specific features: milestone assignment, label management, optional project assignment
- Why it matters: GitHub is used daily for personal projects — must work from day one
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04
- Validation: contract — Milestone and label assignment passed through CreateIssueOpts, GitHub provider path tested in sync. UAT pending.
- Notes: No native epics or weight — use milestones, labels, projects

### R008 — ISSUE-MAP.json mapping persistence
- Class: continuity
- Status: active
- Description: Persist slice-to-issue mapping in provider-agnostic ISSUE-MAP.json per milestone
- Why it matters: Mapping enables close workflow and prevents duplicate issue creation on re-sync
- Source: user
- Primary owning slice: M001/S01
- Supporting slices: M001/S03, M001/S04
- Validation: contract — loadIssueMap/saveIssueMap round-trip tested, structural validation, corrupt file handling, missing file returns []. Crash-safe persistence during sync (save after each creation). Runtime validation pending UAT.
- Notes: Clean break from predecessor GITLAB-MAP.json — new format only

### R009 — Sync surfaced as prompted step in GSD flow
- Class: primary-user-loop
- Status: active
- Description: When a roadmap is written, surface a confirmation prompt ("Ready to create issues for these slices?") before creating remote issues
- Why it matters: Creating remote issues is an outward-facing action that should be deliberate, but integrated into the natural flow
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: none
- Validation: contract — Confirmation flow implemented in handleSync: preview shows slices, ctx.ui.confirm() gates issue creation. Tool mode skips confirmation (D022). 11 command tests cover confirm/decline flows. UAT pending.
- Notes: Not manual-only, not auto — prompted step in the workflow

### R010 — Event bus emissions for composability
- Class: integration
- Status: active
- Description: Emit events on pi.events bus (gsd-issues:sync-complete, gsd-issues:close-complete, etc.) for other extensions to consume
- Why it matters: Makes the extension composable — other extensions can react to sync/close events
- Source: user
- Primary owning slice: M001/S04
- Supporting slices: M001/S03, M001/S05
- Validation: contract — gsd-issues:sync-complete event emitted with { milestone, created, skipped, errors } payload, tested in sync suite. Close/import events pending S04/S05.
- Notes: Cheap to add, enables future extension interop

### R011 — Slash commands (/issues sync, import, close, setup)
- Class: core-capability
- Status: active
- Description: Register slash commands for all workflows plus setup, accessible via /issues subcommand
- Why it matters: User-facing entry points for all extension functionality
- Source: user
- Primary owning slice: M001/S02
- Supporting slices: M001/S03, M001/S04, M001/S05
- Validation: contract — /issues command registered with getArgumentCompletions, subcommand routing via switch/case. `setup` fully implemented, `sync` fully implemented with preview/confirm flow. `import`/`close`/`status` stubbed. Runtime validation pending S04–S05.
- Notes: Single /issues command with subcommand routing

### R012 — LLM-callable tools with typed params
- Class: core-capability
- Status: active
- Description: Register tools (gsd_issues_sync, gsd_issues_import, etc.) that the LLM can call with typed parameters via TypeBox schemas
- Why it matters: Enables the LLM to trigger workflows programmatically, not just through slash commands
- Source: user
- Primary owning slice: M001/S03
- Supporting slices: M001/S04, M001/S05
- Validation: contract — gsd_issues_sync tool registered via pi.registerTool() with TypeBox schema (optional milestone_id, roadmap_path params). Returns structured ToolResult. 2 tool-specific tests. Import/close tools pending S04/S05.
- Notes: Tools registered via pi.registerTool() with TypeBox parameter schemas

### R013 — npm packaging and distribution
- Class: launchability
- Status: active
- Description: Distributable as an npm package, installable via pi's package manager (settings.json packages array or npm install -g)
- Why it matters: Must be installable and updatable across projects and machines
- Source: user
- Primary owning slice: M001/S06
- Supporting slices: none
- Validation: unmapped
- Notes: package.json with pi manifest, proper exports, README

## Validated

(none yet)

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
| R003 | primary-user-loop | active | M001/S03 | none | unmapped |
| R004 | primary-user-loop | active | M001/S04 | none | unmapped |
| R005 | core-capability | active | M001/S05 | none | unmapped |
| R006 | integration | active | M001/S03 | M001/S04 | unmapped |
| R007 | integration | active | M001/S03 | M001/S04 | unmapped |
| R008 | continuity | active | M001/S01 | M001/S03, M001/S04 | contract |
| R009 | primary-user-loop | active | M001/S03 | none | unmapped |
| R010 | integration | active | M001/S04 | M001/S03, M001/S05 | unmapped |
| R011 | core-capability | active | M001/S02 | M001/S03, M001/S04, M001/S05 | unmapped |
| R012 | core-capability | active | M001/S03 | M001/S04, M001/S05 | unmapped |
| R013 | launchability | active | M001/S06 | none | unmapped |
| R020 | differentiator | deferred | none | none | unmapped |
| R030 | continuity | out-of-scope | none | none | n/a |
| R031 | constraint | out-of-scope | none | none | n/a |

## Coverage Summary

- Active requirements: 13
- Mapped to slices: 13
- Validated: 0
- Unmapped active requirements: 0
