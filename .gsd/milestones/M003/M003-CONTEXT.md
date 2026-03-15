# M003: Milestone Sizing and Auto-Flow Orchestration — Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

gsd-issues is a pi extension that bridges GSD's file-based planning with remote issue trackers (GitHub/GitLab). M001 built the foundation (providers, config, sync, close, import). M002 reframed around milestones as the unit of external tracking (one issue, one PR, one review per milestone). M003 adds the core tenet: milestones must be right-sized, and gsd-issues should drive the full lifecycle as a single command.

## Why This Milestone

Without a sizing constraint, milestones can balloon to 10+ slices — too large for meaningful review. The user considers this feature the project's reason to exist. Without it, the project is "worthless."

Additionally, the current workflow requires running `/issues` commands *and* `/gsd auto` separately. `/issues auto` should be a single command that orchestrates everything — from issue import through planning, sizing, execution, and PR creation.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run `/issues auto` and walk away — the extension fetches issues, plans with a sizing constraint, splits oversized milestones, creates tracker issues, executes work, and creates PRs on completion
- Configure `max_slices_per_milestone` with a mode (`strict` or `best_try`) during `/issues setup`
- See milestones that exceed the limit get split by the agent into right-sized milestones before work begins

### Entry point / environment

- Entry point: `/issues auto` command (and `/issues setup` for config)
- Environment: local dev, pi interactive mode
- Live dependencies involved: GitHub/GitLab API (for issue creation/import), pi's extension API (sendMessage, newSession, lifecycle hooks)

## Completion Class

- Contract complete means: config schema validates max_slices fields, setup collects them, auto-flow drives sessions with sendMessage/newSession, sizing validation detects oversized milestones and triggers agent-driven splits
- Integration complete means: `/issues auto` actually drives GSD planning and execution end-to-end using pi's extension API
- Operational complete means: the auto-flow handles the full lifecycle — import → plan → validate size → split → create issues → execute → PR

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `/issues setup` collects max_slices_per_milestone and mode, persists to config
- `/issues auto` drives a full milestone lifecycle using pi.sendMessage and ctx.newSession
- When a milestone exceeds max_slices, the auto-flow triggers an agent-driven split into right-sized milestones
- Strict mode blocks until milestones are right-sized; best_try mode warns and proceeds
- README accurately documents the implemented workflow with a mermaid diagram

## Risks and Unknowns

- **pi.sendMessage + newSession orchestration is uncharted territory for gsd-issues** — GSD auto uses these internally but gsd-issues has never driven sessions directly. The extension API types are available but untested in this context.
- **Split logic depends on agent judgment** — gsd-issues detects the problem (too many slices) but the agent decides where to cut. Prompt quality matters.
- **Conflict with GSD auto-mode** — if both `/issues auto` and `/gsd auto` run, session control will conflict. They must be mutually exclusive.
- **Testing orchestration is hard** — sendMessage/newSession are runtime behaviors. Unit tests can verify config, prompts, and validation logic. The orchestration loop needs integration testing or careful mocking.

## Existing Codebase / Prior Art

- `src/lib/config.ts` — Config interface with `[key: string]: unknown` passthrough, hand-rolled validation
- `src/commands/setup.ts` — Interactive setup wizard (435 lines), provider-specific flows
- `src/lib/sync.ts` — `syncMilestoneToIssue()`, `parseRoadmapSlices()` already counts slices (line 112/248)
- `src/lib/state.ts` — `parseRoadmapSlices()` extracts slice count from roadmap files
- `src/index.ts` — Extension factory, `ExtensionAPI` interface (currently missing sendMessage/on/newSession)
- `~/.gsd/agent/extensions/gsd/auto.ts` — GSD auto-mode reference: `startAuto()`, `dispatchNextUnit()`, session management patterns
- `~/.gsd/agent/extensions/gsd/prompts/plan-milestone.md` — GSD's milestone planning prompt (where sizing constraint needs to appear)

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R018 — Milestone sizing constraint (new, this milestone)
- R019 — Auto-flow orchestration (new, this milestone)
- R021 — README with accurate workflow documentation (new, this milestone)
- R002 — Unified config with interactive setup (extended: new fields for max_slices)

## Scope

### In Scope

- `max_slices_per_milestone` config field with `mode` (strict/best_try)
- Setup wizard additions for the new fields
- `/issues auto` command that drives the full lifecycle
- Sizing validation after planning (using existing `parseRoadmapSlices()`)
- Agent-driven milestone splitting via sendMessage prompts
- Issue creation for split milestones
- Execution orchestration (using sendMessage + newSession like GSD auto)
- PR creation on milestone completion
- README update with accurate mermaid diagram

### Out of Scope / Non-Goals

- Modifying GSD core source code
- Algorithmic splitting (the agent decides where to cut, not gsd-issues)
- Running `/issues auto` and `/gsd auto` simultaneously
- Sub-issues for slice visibility (R017, deferred)

## Technical Constraints

- Cannot modify GSD core — it's a separate project
- ExtensionAPI interface in gsd-issues needs expanding (sendMessage, on, newSession are available in pi's real API but not in gsd-issues' local type declarations)
- Must use pi's extension API: `pi.sendMessage()`, `pi.on()`, `ctx.newSession()`, `ctx.waitForIdle()`
- Config schema uses hand-rolled validation (no schema library)
- 242 existing tests must continue passing

## Integration Points

- **pi extension API** — sendMessage, on, newSession, waitForIdle for session orchestration
- **GSD auto-mode** — mutually exclusive with `/issues auto`; same primitives, different orchestrator
- **GitHub/GitLab API** — issue creation for split milestones, PR creation
- **GSD file system** — ROADMAP.md for slice counting, CONTEXT.md for milestone metadata, ISSUE-MAP.json for mapping

## Open Questions

- **How does `/issues auto` signal GSD auto to not start?** — Possibly via a flag or shared state. Needs investigation during planning.
- **What happens if the agent fails to split satisfactorily?** — Strict mode should retry or pause. Best_try should warn and continue.
- **Should the split prompt include the full roadmap or just the slice listing?** — Full roadmap gives better context for deciding where to cut.
