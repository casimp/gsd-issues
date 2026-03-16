# M004 — Research

**Date:** 2026-03-14

## Summary

gsd-issues is an orchestration layer on top of GSD. It doesn't plan, scope, or execute — it sends prompts to the LLM, and the LLM uses GSD's own mechanisms to do the work. The auto-flow sends "Plan milestone M001" and the LLM writes a roadmap using GSD. It sends "Execute the next task" and the LLM does GSD execution. gsd-issues adds the tracker integration: import issues, sync milestones to remote issues, create PRs with `Closes #N`.

The problem is that every code path requires a milestone ID before GSD has had a chance to create one. When a user runs `/issues auto` with no existing milestone, the command errors instead of kicking off the flow that would create milestones. The fix is: when no milestone exists, send a prompt that tells the LLM to create milestones (using GSD's normal mechanisms), optionally seeded with imported tracker issues. Then detect the created milestones on disk and feed them into the existing plan→validate-size→sync→execute→pr pipeline.

This is architecturally identical to what GSD core does in `guided-flow.ts` — when no milestone exists, it dispatches a discuss prompt, the LLM writes CONTEXT.md, and auto-mode picks up from there. gsd-issues should do the same thing: send a scope prompt, wait for milestones to appear on disk, then proceed. No parallel planning system. The LLM and GSD do the actual work.

## Recommendation

Add a `scope` phase to the auto state machine that fires when no milestone exists. The scope phase: (1) optionally imports tracker issues as context, (2) sends a prompt telling the LLM to create GSD milestones from the work, (3) detects created milestones on disk after the LLM finishes. The existing plan→validate-size→sync→execute→pr pipeline then runs for each created milestone. The manual equivalent is `/issues scope` which runs just the scope prompt and reports what was created.

Prove first: `/issues auto` works end-to-end when no milestone exists (single milestone case). Then add multi-milestone sequencing. Single-milestone is the common case and validates the scope→plan→sync→execute→pr pipeline without the loop complexity.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Milestone creation | GSD's own planning flows — the LLM writes CONTEXT.md, ROADMAP.md via GSD | gsd-issues is orchestration, not planning. Send a prompt, let the LLM + GSD handle it. |
| Phase state machine | Existing `auto.ts` with `AutoDeps` injection (D041) | Extend with `scope` phase. Don't rewrite. |
| Sizing validation | `validateMilestoneSize()` in `sizing.ts` (86 lines, 9 tests) | Works correctly. Scope prompt includes `max_slices_per_milestone` so the LLM targets the right size. |
| Issue import formatting | `importIssues()` in `import.ts` | Already formats provider issues as markdown for LLM consumption. Scope prompt includes this output as context. |
| Milestone detection on disk | `readGSDState()` + filesystem checks in `state.ts` | Read STATE.md for active milestone after LLM finishes scoping. Or scan `.gsd/milestones/` for new directories. |
| Scope completion detection | GSD's `checkAutoStartAfterDiscuss()` pattern — check for CONTEXT.md existence in `agent_end` | Same signal: milestone dir + CONTEXT.md means scoping is done. |

## Existing Code and Patterns

- `src/lib/auto.ts` (602 lines) — State machine. `AutoPhase` union needs `"scope"` added. `PHASE_ORDER` needs it before `"import"`. `startAuto()` currently takes `milestoneId` — needs to accept `undefined` for the scope-first path. `AutoState.milestoneId` needs to accommodate "not yet known" (empty string or optional). After scope completes, milestoneId gets populated from disk.
- `src/commands/auto.ts` (163 lines) — Command handler. Lines 137-147 error when no milestone found. This becomes: no milestone → start with scope phase instead of erroring. The `parseMilestoneId()` / `readGSDState()` / `config.milestone` chain stays for the resume case.
- `src/lib/import.ts` (261 lines) — `importIssues()` returns `{ markdown, issueCount }`. The scope prompt can include this markdown as context: "Here are the existing tracker issues. Create GSD milestones from this work."
- `src/lib/sizing.ts` (86 lines) — No changes. Used after plan phase as today.
- `src/lib/state.ts` (259 lines) — `readGSDState()` reads active milestone from STATE.md. After scope completes, GSD will have set the active milestone. Also has `readMilestoneContext()` for verifying CONTEXT.md exists.
- `src/index.ts` (515 lines) — Needs `/issues scope` subcommand added to routing. Auto tool's `milestone_id` param is already optional.
- `~/.gsd/agent/extensions/gsd/guided-flow.ts` — **Reference pattern.** `showSmartEntry()` dispatches a discuss prompt when no milestone exists. `checkAutoStartAfterDiscuss()` detects when CONTEXT.md appears and triggers auto. gsd-issues should follow this exact pattern: dispatch scope prompt → detect CONTEXT.md in `agent_end` → advance to plan phase.
- `~/.gsd/agent/extensions/gsd/auto.ts` — **Reference pattern.** After each unit completes, calls `deriveState()` to find next work. Multi-milestone: counts pending milestones and loops. gsd-issues' equivalent: after `pr` phase, check if more milestones from scope remain.

## Constraints

- **Cannot modify GSD core** — pi extension API only (`sendMessage`, `newSession`, `waitForIdle`, `on`)
- **gsd-issues auto and GSD auto are mutually exclusive** — `isGSDAutoActive()` check. gsd-issues IS the orchestrator when running; it sends prompts that make the LLM invoke GSD's planning/execution
- **The LLM is the bridge** — gsd-issues sends prompts, the LLM interprets them and uses GSD's mechanisms. gsd-issues doesn't call GSD APIs directly.
- **`AutoState` serializes to JSON** — shape changes must handle old state files without `milestoneIds`
- **`agent_end` fires after every LLM turn** — scope phase needs to distinguish "LLM is mid-conversation" from "LLM finished creating milestones." Check for CONTEXT.md on disk.
- **309 existing tests must pass** — `startAuto()` signature change and `AutoPhase` extension require test updates
- **Prompt is the interface** — the scope prompt must be precise enough that the LLM creates milestone directories and writes CONTEXT.md. If it's too vague, the LLM will discuss without producing artifacts.

## Common Pitfalls

- **Building a parallel planning system instead of orchestrating GSD** — gsd-issues is not a planner. It tells the LLM what to do, the LLM uses GSD. The scope prompt says "create GSD milestones" not "here's how to decompose work."
- **Scope prompt too vague → LLM doesn't produce artifacts** — Must include explicit instructions: milestone directory paths, CONTEXT.md format expectations, `max_slices_per_milestone` constraint. GSD's discuss prompt includes explicit path references for this reason.
- **Removing milestone ID requirement breaks resume** — Active milestone in GSD state must still work. Scope is a fallback when no milestone is found, not a replacement for milestone resolution.
- **Import prompt semantics change** — Currently says "assess the scope for this milestone." In the scope-first flow, import happens before milestones exist. The prompt should say "fetch issues from the tracker to inform milestone creation." Same `importIssues()` function, different prompt framing.
- **`agent_end` re-fires scope prompt repeatedly** — Without completion detection, scope prompt fires on every turn. Must check CONTEXT.md exists (or active milestone in GSD state) before advancing. Mirror GSD's `pendingAutoStart` + `checkAutoStartAfterDiscuss()` pattern.
- **Multi-milestone loop after `pr` phase** — The state machine goes `pr → done`. If scope created multiple milestones, need `pr → check for next milestone → plan` loop. Don't restructure `PHASE_ORDER` — add a post-`pr` check that reads remaining milestones from `AutoState`.

## Open Risks

- **Scope prompt quality** — the LLM must reliably create milestone directories and write CONTEXT.md from a prompt. If it doesn't, the flow stalls. Mitigate with explicit filesystem instructions in the prompt and validation after the LLM finishes.
- **Greenfield with no context** — user runs `/issues auto` with no imported issues and no description. The scope prompt has nothing to seed. Need the LLM to ask the user what they want to build — which is exactly what GSD's discuss prompt does.
- **Detecting scope completion reliably** — `agent_end` fires after every turn. Checking for CONTEXT.md is the signal, but the LLM might write it mid-conversation and keep going. GSD handles this by checking for a specific file and trusting it as the completion signal.
- **Multi-milestone sequencing may be rare** — most workflows create one milestone at a time. Consider deferring multi-milestone loop to a follow-up slice, proving single-milestone scope first.

## Candidate Requirements

Findings that suggest additions to the requirements contract. Advisory, not auto-binding.

| ID | Candidate | Class | Rationale |
|----|-----------|-------|-----------|
| R022 | Scope phase in auto-flow: when no milestone exists, prompt LLM to create GSD milestones from imported issues or user description | core-capability | Core M004 deliverable. |
| R023 | `/issues scope` manual command: run scope prompt independently of auto-flow | core-capability | Matches pattern of every other workflow having command + tool forms. |
| R024 | Multi-milestone sequencing: auto-flow loops through milestones when scope creates multiple | core-capability | Required for large work items. May defer to later slice. |
| R025 | No milestone ID required at entry: `/issues auto` works without a milestone argument | primary-user-loop | The whole point of M004. |
| R026 | Resume still works: active milestone detected from GSD state without re-scoping | continuity | Must not break existing behavior. |

## Skills Discovered

| Technology | Skill | Status |
|------------|-------|--------|
| pi extensions | `zenobi-us/dotfiles@creating-pi-extensions` (26 installs) | available — low relevance, generic extension authoring |

No skills warrant installation. The work is state machine extension and prompt construction within an existing pi extension codebase.

## Sources

- GSD `guided-flow.ts` — smart entry wizard, `showSmartEntry()` dispatches discuss prompt when no milestone exists, `checkAutoStartAfterDiscuss()` detects CONTEXT.md and triggers auto (source: `~/.gsd/agent/extensions/gsd/guided-flow.ts`, 982 lines)
- GSD `auto.ts` — orchestration loop, `deriveState()` after each unit, multi-milestone via pending count (source: `~/.gsd/agent/extensions/gsd/auto.ts`, 3400+ lines)
- GSD `discuss` prompt — LLM-driven milestone creation with explicit path instructions and reflection-first pattern (source: `~/.gsd/agent/extensions/gsd/prompts/discuss.md`)
- Existing test suite — 309 tests, 18 files, all passing (source: `npx vitest run`)
