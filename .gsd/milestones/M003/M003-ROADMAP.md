# M003: Milestone Sizing and Auto-Flow Orchestration

**Vision:** One command (`/issues auto`) drives the full lifecycle — import, plan, size-check, split, create issues, execute, PR. Milestones are bounded to N slices, enforced by the extension.

## Success Criteria

- `/issues setup` collects `max_slices_per_milestone` and `mode` (strict/best_try), persists to `.gsd/issues.json`
- After planning, gsd-issues validates the milestone's slice count against the configured limit
- When a milestone exceeds the limit, the auto-flow triggers an agent-driven split into right-sized milestones
- `/issues auto` drives a full milestone lifecycle end-to-end using pi.sendMessage and ctx.newSession
- Strict mode blocks until milestones are right-sized; best_try mode warns and proceeds
- README accurately documents the implemented workflow with a mermaid diagram

## Key Risks / Unknowns

- **pi.sendMessage + newSession orchestration** — gsd-issues has never driven sessions. The APIs exist (GSD auto uses them) but the integration is unproven in this context.
- **Agent split quality** — gsd-issues detects oversized milestones but the agent decides where to cut. Prompt engineering matters.
- **Mutual exclusion with /gsd auto** — both use sendMessage/newSession. Running both simultaneously will conflict.

## Proof Strategy

- pi orchestration APIs → retire in S02 by proving `/issues auto` drives planning, validation, and execution through real session control
- Agent split quality → retire in S02 by proving the split prompt produces valid milestone restructuring that the agent can execute
- Mutual exclusion → retire in S02 by implementing detection/blocking when GSD auto is already running

## Verification Classes

- Contract verification: unit tests for config validation, setup wizard, sizing validation, prompt construction, orchestration state machine
- Integration verification: `/issues auto` driving pi sessions end-to-end (requires careful mocking of pi.sendMessage/ctx.newSession)
- Operational verification: none (no daemon, no service)
- UAT / human verification: run `/issues auto` on a real project and verify the full lifecycle

## Milestone Definition of Done

This milestone is complete only when all are true:

- Config schema accepts max_slices_per_milestone and mode, setup wizard collects them
- Sizing validation correctly identifies oversized milestones using parseRoadmapSlices()
- `/issues auto` drives sessions via pi APIs (sendMessage, newSession, waitForIdle)
- Oversized milestones trigger agent-driven splits with appropriate prompts
- Strict/best_try modes behave correctly
- All existing tests continue passing, new tests cover the new functionality
- README documents the full workflow accurately with mermaid diagram
- Success criteria are re-checked against actual behavior

## Requirement Coverage

- Covers: R018, R019, R021
- Partially covers: R002 (extended config schema)
- Leaves for later: R017 (sub-issues), R020 (keyboard shortcut)
- Orphan risks: none

## Slices

- [x] **S01: Config, Setup, and Sizing Validation** `risk:low` `depends:[]`
  > After this: `max_slices_per_milestone` and `mode` are persisted in config, setup wizard collects them, and `validateMilestoneSize()` correctly reports oversized milestones — proven by unit tests
- [ ] **S02: Auto-Flow Orchestration** `risk:high` `depends:[S01]`
  > After this: `/issues auto` drives the full lifecycle — import, plan, size-check, split, issue creation, execution, PR — using pi.sendMessage and ctx.newSession — proven by integration tests with mocked pi APIs
- [ ] **S03: README and Documentation** `risk:low` `depends:[S02]`
  > After this: README accurately documents the full workflow with a mermaid diagram covering both planning entry points, sizing constraint, and the auto-flow — proven by visual inspection

## Boundary Map

### S01 → S02

Produces:
- `Config` interface with `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"` fields
- `validateMilestoneSize(basePath: string, milestoneId: string, config: Config): SizingResult` function
- Setup wizard section that collects max_slices and mode with sensible defaults

Consumes:
- nothing (first slice)

### S02 → S03

Produces:
- `/issues auto` command registered and functional
- Orchestration loop: import → plan → validate size → split → create issues → execute → PR
- Extended `ExtensionAPI` interface with sendMessage, on, newSession
- Split prompt templates
- Mutual exclusion with GSD auto-mode

Consumes:
- S01's config fields and validateMilestoneSize()
