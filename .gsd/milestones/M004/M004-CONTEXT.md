# M004: Start From Work, Not Milestones

**Gathered:** 2026-03-14
**Status:** Ready for planning

## The Problem

Every command in gsd-issues requires a milestone ID. Users don't have milestone IDs — they have work to do. The step that turns work into right-sized milestones doesn't exist.

Users start from one of two places:

1. "I have issues on my tracker I want to work on" → **existing work**
2. "I want to build something new" → **greenfield**

In both cases, the extension should create right-sized milestones (bounded by `max_slices_per_milestone`) from the user's work. The user should never need to know what a milestone ID is.

M003 built sizing validation, a phase-based orchestration state machine, split retry, and mutual exclusion — all mechanically correct, all tested (43 orchestration tests, 309 total). But it pointed everything at a pre-existing milestone ID instead of building the entry point that creates milestones from work.

## What's Missing: Scoping

The current flow assumes milestones exist:

`import → plan → validate-size → [split] → sync → execute → pr`

The correct flow creates milestones from work:

`[import] → **SCOPE** → plan → validate-size → sync → execute → pr`

**Scoping** is the missing step:
1. Look at imported tracker issues (if any) or ask the user what they want to build
2. Create one or more right-sized milestone directories with CONTEXT.md files
3. Each milestone bounded to `max_slices_per_milestone`
4. If the work is too big for one milestone, create multiple milestones upfront

After scoping, the existing machinery (plan, validate-size, sync, execute, pr) works on each created milestone. Auto mode runs it all. Manual mode lets the user drive each step.

## What Exists Today

### Works correctly (keep)
- **Sizing validation** (`src/lib/sizing.ts`, 86 lines, 9 tests): `validateMilestoneSize()` correctly identifies oversized milestones
- **Phase state machine** (`src/lib/auto.ts`, 602 lines, 26 tests): `advancePhase()`, phase transitions, `AutoDeps` injection, split retry (strict 3x, best_try warn), mutual exclusion via lock files with PID checks
- **Command wiring** (`src/commands/auto.ts`, 163 lines, 17 tests): `buildAutoDeps()`, stashed context pattern, agent_end handler
- **Config and setup** (`src/lib/config.ts`, `src/commands/setup.ts`): `max_slices_per_milestone`, `sizing_mode`, setup wizard
- **All M001/M002 code**: providers, sync, close, PR, import, issue-map — all work once milestones exist
- Prompt builders for plan, split, sync, execute, pr phases (just need milestone ID to come from scoping output instead of command args)

### Broken (fix)
- **Everything requires a milestone ID upfront.** `startAuto(milestoneId, deps)`, `handleAuto()` errors if no milestone found, all manual commands resolve from config/GSD state. The milestone doesn't exist yet — it needs to be created from the user's work.
- **No scoping step.** There is no code, command, or phase that goes from "here is work" to "here are right-sized milestones."
- **Import prompt is wrong.** Says "assess the scope for this milestone" — should be "fetch issues to inform scoping."
- **No way to run the pipeline across multiple milestones.** If scoping creates 3 milestones, the current state machine can only handle one.

## What Must Change

1. **Add scoping logic** — the core new code. Takes work context (imported issues, user description, or nothing), creates right-sized milestone(s) with CONTEXT.md. Respects `max_slices_per_milestone`. Returns created milestone ID(s). Used by both `/issues auto` and a new `/issues scope` command.

2. **Remove milestone ID as a prerequisite.** `startAuto()` starts with import/scope. `handleAuto()` doesn't error when no milestone is found. Manual commands that need a milestone (`sync`, `pr`, `close`) resolve from GSD state and give clear errors — but scoping happens before any of them.

3. **Add scope phase to the state machine.** `AutoPhase` gets `scope` before `plan`. Scoping output (milestone IDs) feeds into subsequent phases. State machine loops if multiple milestones were created.

4. **Fix import prompt.** It's fetching issues to inform scoping, not assessing an existing milestone.

5. **Add `/issues scope` command.** Manual entry point for scoping — the interactive equivalent of auto's scope phase. Workflow becomes: `import → scope → sync → work → pr`.

6. **Update README.** Both entry points (existing issues, greenfield). Users never specify milestone IDs. Scoping is the entry point, not milestone resolution.

## Codebase Reference

- `src/lib/auto.ts` (602 lines) — Phase state machine. `startAuto()` takes `milestoneId`. All prompts reference it.
- `src/commands/auto.ts` (163 lines) — Command handler. Errors if no milestone ID found.
- `src/lib/sizing.ts` (86 lines) — Sizing validation. Works correctly, no changes needed.
- `src/commands/sync.ts` — Resolves milestone from config/GSD state.
- `src/lib/sync.ts` — `syncMilestoneToIssue()`. Works once milestone exists.
- `src/lib/__tests__/auto.test.ts` (508 lines) — 26 unit tests, all assume milestone ID exists.
- `src/commands/__tests__/auto.test.ts` (513 lines) — 17 integration tests, all assume milestone ID exists.
- GSD reference: `~/.gsd/agent/extensions/gsd/auto.ts` — handles "no milestone" via `showSmartEntry()`.
- GSD reference: `~/.gsd/agent/extensions/gsd/guided-flow.ts` — creates milestones from nothing.

## Decisions Register

Read `.gsd/DECISIONS.md` — all 45 decisions. Key ones to keep:
- D041 — AutoDeps injection pattern
- D042 — Lock file mutual exclusion
- D043 — Stashed cmdCtx pattern
- D044 — Split retry max 3

## Success Criteria

- The extension works from "I have work" to "milestones planned and synced" — no milestone ID ever specified by the user
- Scoping creates right-sized milestones bounded by `max_slices_per_milestone`
- Existing issues entry: user points at tracker issues, extension scopes them into milestones
- Greenfield entry: user describes what to build, extension creates milestones
- If work exceeds one milestone, multiple milestones are created
- After scoping, the existing plan→validate-size→sync→execute→pr pipeline works for each milestone
- All 309 existing tests continue passing (with updates for changed interfaces)
- New tests cover scoping
- README documents both entry points accurately

## Technical Constraints

- Cannot modify GSD core
- Must use pi extension API (sendMessage, newSession, waitForIdle, on)
- Existing provider/sync/close/PR code must not be broken
- Config schema additions from M003/S01 are correct and stay
