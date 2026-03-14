# M001: Issue Tracker Integration — Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

A pi extension (`gsd-issues`) that bridges GSD's slice lifecycle with remote issue trackers. Replaces four predecessor skills (`gitlab-sync`, `gitlab-import`, `gitlab-close`, `gitlab-setup`) from `di-core` with deterministic TypeScript using pi's extension API. Three core workflows: sync, close, import. Two providers: GitLab and GitHub — both used daily.

## Why This Milestone

The predecessor skills were fragile markdown instructions interpreted by the LLM — 200-line procedures prone to misinterpretation. No lifecycle hooks meant the agent had to remember to close issues. Not distributable across repos. An extension gives deterministic execution, automatic lifecycle hooks, slash commands, typed tools, and npm distribution.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run `/issues setup` in any git repo and get a working config for GitLab or GitHub
- Have issues auto-created (with confirmation) when a roadmap is written
- Have issues auto-closed when slices complete
- Run `/issues import` to pull existing issues into planning
- Install and update the extension via npm

### Entry point / environment

- Entry point: `/issues` slash command, LLM-callable tools, lifecycle hooks
- Environment: local dev (pi coding agent)
- Live dependencies involved: GitLab API (via `glab` CLI), GitHub API (via `gh` CLI)

## Completion Class

- Contract complete means: provider interface works, config validates, mapping persists, tools registered
- Integration complete means: real issues created/closed on GitLab and GitHub via CLI calls
- Operational complete means: lifecycle hook fires on slice completion without manual intervention

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- Sync creates real issues on a GitLab project and a GitHub project from a GSD roadmap
- Completing a slice (writing summary) auto-closes the mapped issue on both providers
- Import fetches real issues and formats them for LLM planning
- The extension installs via npm and loads in pi

## Risks and Unknowns

- **GitHub equivalents for GitLab extras** — GitHub lacks native epics and weight. Need to map to milestones, labels, and Projects V2 appropriately.
- **glab/gh CLI output parsing** — both CLIs return different formats. Need reliable IID/number extraction from create output.
- **tool_result hook reliability** — watching for summary file writes to trigger close. Must handle edge cases (re-writes, partial writes, non-GSD writes).

## Existing Codebase / Prior Art

- `RESEARCH.md` — Architecture decisions, pi extension API analysis, proposed file structure
- `/home/casimp/software/di-core/.gsd/skills/gitlab-sync/SKILL.md` — Working glab commands for issue creation, epic assignment, weight handling, reorganisation
- `/home/casimp/software/di-core/.gsd/skills/gitlab-close/SKILL.md` — Close workflow with MR-aware behavior and done label handling
- `/home/casimp/software/di-core/.gsd/skills/gitlab-import/SKILL.md` — Import workflow with milestone/label/epic filtering
- `/home/casimp/software/di-core/.gsd/skills/gitlab-setup/SKILL.md` — Interactive config setup with repo pattern discovery
- `~/.gsd/agent/extensions/gsd/index.ts` — Reference extension showing pi extension patterns (hooks, commands, tool registration)
- `/home/casimp/.nvm/versions/node/v20.20.0/lib/node_modules/gsd-pi/packages/pi-coding-agent/src/core/extensions/types.ts` — Full ExtensionAPI type definitions

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R001-R013 — All active requirements are owned by this milestone
- R013 — npm packaging is core, not deferred

## Scope

### In Scope

- Provider abstraction (GitLab + GitHub) with auto-detection
- Unified config with interactive setup command
- Sync workflow with user confirmation prompt
- Auto-close via tool_result lifecycle hook
- Import workflow (fetch + format, LLM interprets)
- GitLab extras: epics, weight, labels, reorganisation
- GitHub support: milestones, labels, projects
- ISSUE-MAP.json mapping persistence
- Slash commands and LLM-callable tools
- Event bus emissions
- npm packaging and distribution

### Out of Scope / Non-Goals

- Backward compatibility with GITLAB-MAP.json
- Separate gitlab-setup skill migration (absorbed into /issues setup)
- Keyboard shortcut (deferred)

## Technical Constraints

- Must use `pi.exec()` for CLI calls (not child_process directly)
- TypeBox for tool parameter schemas (pi convention)
- Extension entry point must be default export function receiving ExtensionAPI
- `glab` requires `PATH` to include `$HOME/.local/bin`
- Epic assignment on GitLab requires REST API via `glab api`, not CLI flag
- Import from `@gsd/pi-coding-agent` for types (ExtensionAPI, ExtensionContext, etc.)

## Integration Points

- **pi extension API** — registerTool, registerCommand, pi.on("tool_result"), pi.exec(), pi.events, ctx.ui.*
- **GitLab API** — via `glab` CLI and `glab api` for REST endpoints (epics, project info)
- **GitHub API** — via `gh` CLI and `gh api` for REST endpoints
- **GSD file system** — reads STATE.md, roadmap.md, writes ISSUE-MAP.json
- **GSD lifecycle** — watches for summary file writes to trigger close

## Open Questions

- **GitHub Projects V2 integration depth** — should sync add issues to a GitHub Project, or just use milestones/labels? The `gh issue create --project` flag exists but requires `project` scope auth. Start with milestones + labels, add Projects V2 as optional.
- **MR-aware close on GitHub** — GitLab predecessor skips manual close when an MR will auto-close via `Closes #N`. GitHub has the same pattern with PRs. Need to detect and handle.
