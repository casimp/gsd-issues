# M004: Start From Work, Not Milestones

**Vision:** Users run `/issues auto` with no milestone ID. The extension scopes their work into right-sized milestones, then drives the existing plan→validate-size→sync→execute→pr pipeline for each one. The milestone ID is an internal detail, never a user-facing prerequisite.

## Success Criteria

- User runs `/issues auto` with no milestone, no config milestone, no GSD state — extension starts scoping instead of erroring
- User runs `/issues auto` with an active milestone in GSD state — extension resumes it (existing behavior, not broken)
- After scoping, the extension detects the created milestone on disk and transitions to the plan phase
- Scope prompt includes imported tracker issues (if any) and `max_slices_per_milestone` constraint
- `/issues scope` manual command runs scoping independently of auto-flow
- If scope creates multiple milestones, auto-flow processes each one through plan→validate-size→sync→execute→pr
- All existing tests pass (updated for interface changes), new tests cover scope phase and multi-milestone loop
- README documents all three entry points (existing issues, greenfield, resume) without mentioning milestone IDs as user input

## Key Risks / Unknowns

- Scope prompt reliability — the LLM must create milestone directories and write CONTEXT.md from the prompt. If the prompt is too vague, the LLM discusses without producing artifacts. Mitigated by explicit filesystem instructions (paths, format expectations) in the prompt, following GSD's discuss prompt pattern.
- Scope completion detection — `agent_end` fires after every LLM turn. Must distinguish "LLM is mid-conversation" from "LLM finished creating milestones." CONTEXT.md on disk is the signal, but the LLM might take multiple turns. Mitigated by checking for new milestone directories in `.gsd/milestones/` after each `agent_end`.
- Multi-milestone state shape — `AutoState.milestoneId` is a string. Multi-milestone needs `milestoneIds: string[]` and a current index. Old state files without this field must deserialize without breaking.

## Proof Strategy

- Scope prompt reliability → retire in S01 by building the real scope phase with explicit prompt, completion detection, and full contract test coverage of the state machine path. Runtime prompt quality can only be validated by real use.
- Multi-milestone state shape → retire in S02 by extending `AutoState`, handling backward compat, and testing the loop.

## Verification Classes

- Contract verification: vitest unit and integration tests — state machine transitions, prompt construction, completion detection, command handler paths, multi-milestone loop
- Integration verification: none — gsd-issues is an orchestration layer; the LLM and GSD core do the actual work. Real integration requires running against a live pi session, which is runtime UAT.
- Operational verification: none
- UAT / human verification: first real `/issues auto` run with no milestone will validate prompt quality and completion detection timing

## Milestone Definition of Done

This milestone is complete only when all are true:

- `/issues auto` with no milestone starts scope phase and transitions to plan after LLM creates a milestone
- `/issues auto` with an active GSD milestone resumes it without re-scoping
- `/issues scope` runs scoping independently and reports created milestones
- Multi-milestone: if scope creates N milestones, auto-flow loops through all N
- Import prompt says "fetch issues to inform scoping" not "assess scope for this milestone"
- All tests pass (existing updated + new scope/multi-milestone tests)
- README documents the three entry points accurately

## Requirement Coverage

- Covers: R022 (scope phase), R023 (/issues scope command), R024 (multi-milestone sequencing), R025 (no milestone ID at entry), R026 (resume still works)
- Partially covers: R021 (auto-flow orchestration — extended with scope phase and multi-milestone loop)
- Leaves for later: none
- Orphan risks: none — all candidate requirements from research are mapped

## Slices

- [x] **S01: Scope phase and milestone-free entry** `risk:high` `depends:[]`
  > After this: `/issues auto` with no milestone starts scoping, detects the created milestone on disk, and transitions to plan. `/issues scope` runs independently. Import prompt updated. Resume path preserved. Proven by contract tests with mocked pi APIs.
- [ ] **S02: Multi-milestone sequencing and README** `risk:medium` `depends:[S01]`
  > After this: when scope creates multiple milestones, auto-flow loops through each one (plan→validate-size→sync→execute→pr per milestone). README documents all three entry points. Proven by contract tests.

## Boundary Map

### S01 → S02

Produces:
- `AutoPhase` extended with `"scope"` — all phase transition logic works for single-milestone scope
- `AutoState` with optional `milestoneId` (empty string when scope hasn't completed)
- `buildScopePrompt()` — prompt builder for the scope phase
- `detectScopedMilestones(cwd, deps)` — scans `.gsd/milestones/` for new CONTEXT.md files after scope completes
- Scope completion detection in `advancePhase()` — checks for milestone on disk after scope `agent_end`
- `/issues scope` command and updated `/issues auto` entry point (no milestone required)
- Updated import prompt (framed for scoping, not milestone assessment)
- Updated `startAuto()` signature accepting optional `milestoneId`

Consumes:
- nothing (first slice)

### S02 consumes from S01

Consumes:
- `AutoState` shape (extends with `milestoneIds: string[]` and `currentMilestoneIndex: number`)
- `detectScopedMilestones()` returning multiple milestone IDs
- Single-milestone scope→plan transition (extends to loop)
