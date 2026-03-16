# M004: User-Facing Workflow — Start From Work, Not Milestones

**Gathered:** 2026-03-14
**Status:** Ready for planning

## The Problem

M003 built a phase-based orchestration state machine, sizing validation, and split retry — but it got the fundamental abstraction wrong. The entire auto-flow (`/issues auto`) and all manual commands (`/issues sync`, `/issues pr`) require a **milestone ID** as input. They assume milestones already exist.

**Users don't think in milestones. Milestones are an internal GSD artifact.** Users think in terms of:

1. "I have issues on my tracker I want to work on" → **existing work**
2. "I want to build something new" → **greenfield work**

In both cases, the extension should handle everything: figure out the scope, create right-sized milestones (respecting `max_slices_per_milestone`), sync them to the tracker, execute, and PR. The user should never need to know or specify a milestone ID.

This is not a minor gap. The user who planned M003 spent 2-3 hours across multiple sessions designing this flow, and the artifacts produced during those sessions failed to capture the core value proposition: **start from work, not from milestones**. The result was hours of correctly-implemented wrong thing — a state machine that orchestrates within pre-existing milestones instead of creating them from the user's actual work.

## What Exists Today (What's Wrong)

### Auto mode (`/issues auto`)
- **Requires a milestone ID** (from args, config, or GSD state)
- Errors with "Cannot determine milestone" if none is found
- The phase sequence (`import → plan → validate-size → [split] → sync → execute → pr → done`) operates on a single pre-existing milestone
- The `import` phase fetches tracker issues but dumps them as context for an already-existing milestone — it doesn't create milestones from them
- The `plan` phase says "plan the milestone roadmap" — it assumes the milestone directory and context already exist

### Manual mode (`/issues sync`, `/issues pr`, etc.)
- All resolve milestone from `config.milestone` or GSD state
- All assume milestones exist with roadmaps, context files, etc.
- There is no `/issues` command that goes from "here is work" to "milestones planned and synced"

### What works fine
- **Config and setup** (M003/S01): `max_slices_per_milestone`, `sizing_mode`, setup wizard — all correct
- **Sizing validation** (M003/S01): `validateMilestoneSize()` correctly identifies oversized milestones — correct
- **Orchestration machinery** (M003/S02): Phase state machine, mutual exclusion, lock files, agent_end handler, split retry — all mechanically correct, just pointed at the wrong starting point
- **Provider abstraction, sync, close, PR, import** (M001, M002): All work fine once milestones exist

## What Should Exist

### Two entry points, two modes, one outcome

| | Manual (`/issues`) | Auto (`/issues auto`) |
|---|---|---|
| **Existing tracker issues** | `/issues import` pulls issues → agent scopes into right-sized milestones → `/issues sync` creates tracker issues → user works → `/issues pr` | `/issues auto` does all of this end-to-end |
| **Greenfield (new work)** | Agent creates milestone from user description → `/issues sync` → user works → `/issues pr` | `/issues auto` — agent asks what to build, creates milestones, executes everything |

In **both cases**:
- The extension creates milestones — the user never specifies a milestone ID
- Milestones are right-sized (≤ `max_slices_per_milestone`) at creation time
- If the work is too large, multiple milestones are created
- Milestones are synced to the tracker as issues

### The key missing piece: SCOPING

The current flow is: `import → plan → validate-size → sync → execute → pr`

The correct flow is: `[import] → SCOPE → plan → validate-size → sync → execute → pr`

**Scoping** is the phase where:
1. The agent looks at imported issues (if any) or asks the user what they want to build
2. Creates one or more right-sized milestone directories with CONTEXT.md files
3. Each milestone is bounded to `max_slices_per_milestone`
4. If the work is too big for one milestone, multiple milestones are created upfront

After scoping, the existing machinery (plan, validate-size, sync, execute, pr) works on each created milestone.

### What this means for existing code

The orchestration state machine in `src/lib/auto.ts` is mostly correct mechanically — it just needs:
1. A `scope` phase at the front that creates milestones from work (not from an existing milestone ID)
2. The ability to operate without a pre-existing milestone ID
3. Loop over multiple milestones if scoping creates more than one

The command handler in `src/commands/auto.ts` needs:
1. To work without a milestone ID — that's no longer an error, it's the expected starting state
2. Milestone resolution happens AFTER scoping, not before

The manual commands need:
1. A way to trigger scoping — probably through `/issues import --scope` or just making `/issues import` + agent interaction create milestones directly
2. Or: the existing import already works (it gives issues to the agent) — the gap is that there's no command that then creates milestones from that context

## Codebase Reference

- `src/lib/auto.ts` (602 lines) — Phase state machine. `startAuto()` takes `milestoneId`. `advancePhase()` transitions. All prompt builders reference `milestoneId`. The `import` phase prompt says "assess the scope for this milestone" — wrong framing.
- `src/commands/auto.ts` (163 lines) — Command handler. `handleAuto()` resolves milestone from args/config/state and errors if none found. `buildAutoDeps()` constructs injected deps.
- `src/lib/sizing.ts` (86 lines) — `validateMilestoneSize()` — works correctly, no changes needed.
- `src/commands/sync.ts` — Resolves milestone from config/GSD state. Works once milestone exists.
- `src/lib/sync.ts` — `syncMilestoneToIssue()` — works correctly for syncing a milestone to tracker.
- `src/lib/__tests__/auto.test.ts` (508 lines) — 26 unit tests, all assume milestone ID exists.
- `src/commands/__tests__/auto.test.ts` (513 lines) — 17 integration tests, all assume milestone ID exists.
- GSD reference: `~/.gsd/agent/extensions/gsd/auto.ts` — GSD's own auto-mode handles "no milestone" via `showSmartEntry()` which creates milestones through guided discussion. This is the pattern to follow.
- GSD reference: `~/.gsd/agent/extensions/gsd/guided-flow.ts` — `showSmartEntry()` and `buildDiscussPrompt()` show how GSD creates milestones from nothing.

## Decisions Register

Read `.gsd/DECISIONS.md` — all 45 decisions from M001-M003 are relevant context. Key ones:
- D041 — AutoDeps injection pattern (keep this)
- D042 — Lock file mutual exclusion (keep this)
- D043 — Stashed cmdCtx pattern (keep this)
- D044 — Split retry max 3 (keep this)

## What Must Change vs What's Salvageable

### Salvageable (don't rewrite)
- Phase state machine pattern (AutoDeps injection, lock files, state persistence, agent_end handler)
- Sizing validation (`validateMilestoneSize()`)
- Config and setup (max_slices, sizing_mode)
- All provider/sync/close/PR/import library code
- Mutual exclusion

### Must change
- `AutoPhase` type needs a `scope` phase before `plan`
- `startAuto()` must not require a milestone ID — it should accept optional context (imported issues, user description)  
- `handleAuto()` must not error when no milestone ID is found — that's the normal case
- Import prompt must not reference a milestone — it's fetching issues to inform scoping, not to assess an existing milestone
- Plan prompt must reference the milestone created by scoping
- State machine needs to handle the scope→plan transition (scoping creates milestoneId, subsequent phases use it)
- Auto-flow needs to loop if scoping creates multiple milestones
- Tests need updating to cover the "start from nothing" path

### README
- Must accurately describe both entry points (existing issues, greenfield)
- Must show that users never specify milestone IDs
- Mermaid diagram must show scoping as the entry point

## Success Criteria

- `/issues auto` works with no arguments — the agent asks what to build or imports from tracker
- `/issues auto` works with `--issues 10,11,12` — scopes those tracker issues into right-sized milestones  
- Scoping creates milestones bounded by `max_slices_per_milestone`
- After scoping, the existing plan→validate-size→sync→execute→pr flow runs for each milestone
- Manual workflow supports the same two entry points without requiring milestone IDs
- Users never need to know what a milestone ID is
- All existing tests continue passing (with updates for changed interfaces)
- README documents the actual user-facing workflow
- 309 existing tests updated/preserved, new tests cover scoping

## Technical Constraints

- Cannot modify GSD core
- Must use pi extension API (sendMessage, newSession, waitForIdle, on)
- Existing provider/sync/close/PR code must not be broken
- Config schema additions from M003/S01 are correct and stay
