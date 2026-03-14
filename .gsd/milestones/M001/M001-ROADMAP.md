# M001: Issue Tracker Integration

**Vision:** A pi extension that bridges GSD's slice lifecycle with GitLab and GitHub issue trackers — sync roadmap slices to remote issues, auto-close on slice completion, and import existing issues for planning. Installable via npm, configurable per-repo, works on both providers from day one.

## Success Criteria

- User can run `/issues setup` and get a working config for either GitLab or GitHub
- Creating a roadmap surfaces a confirmation prompt and creates real issues on the remote tracker
- Completing a slice (writing summary) auto-closes the mapped remote issue
- User can import existing issues from either provider for planning input
- Extension is installable via `npm install -g gsd-issues` and loads in pi

## Key Risks / Unknowns

- **glab/gh output parsing** — CLI output formats differ and may change between versions. Must extract issue IDs reliably.
- **GitHub feature parity** — GitHub lacks native epics and weight. Mapping to milestones/labels/Projects V2 needs to feel natural, not forced.
- **tool_result hook edge cases** — summary file writes trigger close, but must handle re-writes, non-GSD writes, and partial writes gracefully.

## Proof Strategy

- glab/gh output parsing → retire in S01 by proving both CLIs can create and close issues via pi.exec() with reliable ID extraction
- GitHub feature parity → retire in S03 by proving sync creates issues with milestones and labels on GitHub
- tool_result hook edge cases → retire in S04 by proving close only fires on legitimate slice completions

## Verification Classes

- Contract verification: TypeScript compilation, provider interface conformance, config schema validation
- Integration verification: real glab/gh CLI calls creating and closing issues on actual remotes
- Operational verification: lifecycle hook fires automatically during normal GSD flow
- UAT / human verification: user confirms issues appear on GitLab/GitHub, close happens on slice completion

## Milestone Definition of Done

This milestone is complete only when all are true:

- All three workflows (sync, close, import) work on both GitLab and GitHub
- Lifecycle hook fires automatically on slice completion without manual intervention
- Sync is surfaced as a prompted step after roadmap creation with user confirmation
- Config is provider-agnostic with interactive setup via /issues setup
- Events emitted on pi.events bus for composability
- Extension installs via npm and loads correctly in pi
- Success criteria re-checked against live behavior on real GitLab and GitHub repositories

## Requirement Coverage

- Covers: R001, R002, R003, R004, R005, R006, R007, R008, R009, R010, R011, R012, R013
- Partially covers: none
- Leaves for later: R020
- Orphan risks: none

## Slices

- [x] **S01: Provider abstraction and core types** `risk:medium` `depends:[]`
  > After this: pi.exec("glab"/"gh") calls work through the provider interface, auto-detection picks the right provider from git remote, ISSUE-MAP.json read/write works.

- [x] **S02: Config and setup command** `risk:medium` `depends:[S01]`
  > After this: user runs /issues setup, walks through interactive config, .gsd/issues.json is written and validated. /issues command registered with subcommand routing.

- [x] **S03: Sync workflow** `risk:high` `depends:[S01,S02]`
  > After this: user writes a roadmap, gets prompted "Ready to create issues?", confirms, sees real issues created on GitLab/GitHub with milestone/assignee/labels/weight/epic, mapping persisted to ISSUE-MAP.json.

- [x] **S04: Auto-close on slice completion** `risk:medium` `depends:[S01,S02]`
  > After this: user completes a slice (summary file written), the mapped issue is auto-closed with correct done labels on GitLab and close reason on GitHub. Events emitted on pi.events bus.

- [ ] **S05: Import workflow** `risk:low` `depends:[S01,S02]`
  > After this: user runs /issues import, issues are fetched from GitLab/GitHub filtered by milestone/label, formatted as structured markdown, and handed to the LLM for planning interpretation.

- [ ] **S06: npm packaging and distribution** `risk:low` `depends:[S01,S02,S03,S04,S05]`
  > After this: user can npm install -g gsd-issues, add it to settings.json packages array, and the extension loads in pi with all commands, tools, and hooks working.

## Boundary Map

### S01 → S02, S03, S04, S05

Produces:
- `providers/types.ts` → `IssueProvider` interface (createIssue, closeIssue, listIssues, assignToMilestone), `CreateIssueOpts`, `IssueFilter`, `Issue` types
- `providers/detect.ts` → `detectProvider(cwd)` function returning provider name from git remote
- `providers/gitlab.ts` → `GitLabProvider` implementing IssueProvider via glab CLI
- `providers/github.ts` → `GitHubProvider` implementing IssueProvider via gh CLI
- `lib/issue-map.ts` → `loadIssueMap(path)`, `saveIssueMap(path, entries)`, `IssueMapEntry` type
- `lib/state.ts` → `readGSDState(cwd)`, `parseRoadmapSlices(path)` helpers

Consumes:
- nothing (first slice)

### S02 → S03, S04, S05

Produces:
- `lib/config.ts` → `loadConfig(cwd)`, `validateConfig(config)`, `Config` type with provider-specific sections
- `index.ts` → `/issues` command registered with subcommand routing (setup, sync, import, close)
- `.gsd/issues.json` → config file schema (common fields + gitlab/github sections)

Consumes from S01:
- `providers/detect.ts` → `detectProvider()` for auto-populating provider in config
- `providers/types.ts` → provider type constants

### S03 → S04

Produces:
- `lib/sync.ts` → `syncSlicesToIssues(provider, config, roadmapSlices)` with confirmation flow
- `gsd_issues_sync` tool registered via pi.registerTool()
- ISSUE-MAP.json entries written for each synced slice
- `gsd-issues:sync-complete` event emitted on pi.events

Consumes from S01:
- `IssueProvider.createIssue()`, `IssueProvider.assignToMilestone()`
- `loadIssueMap()`, `saveIssueMap()`
- `parseRoadmapSlices()`

Consumes from S02:
- `loadConfig()`, `Config` type
- `/issues` command routing

### S04 → (terminal)

Produces:
- `lib/close.ts` → `closeSliceIssue(provider, config, sliceId, milestoneId)`
- tool_result lifecycle hook that watches for summary writes and triggers close
- `gsd-issues:close-complete` event emitted on pi.events

Consumes from S01:
- `IssueProvider.closeIssue()`
- `loadIssueMap()`

Consumes from S02:
- `loadConfig()`, `Config` type

### S05 → (terminal)

Produces:
- `lib/import.ts` → `importIssues(provider, config, filter)` returning formatted markdown
- `gsd_issues_import` tool registered via pi.registerTool()
- `gsd-issues:import-complete` event emitted on pi.events

Consumes from S01:
- `IssueProvider.listIssues()`

Consumes from S02:
- `loadConfig()`, `Config` type
- `/issues` command routing

### S06 → (terminal)

Produces:
- `package.json` with pi manifest, npm metadata, proper exports
- `README.md` with installation and usage docs
- `tsconfig.json` and build configuration

Consumes from S01-S05:
- All source files for packaging
