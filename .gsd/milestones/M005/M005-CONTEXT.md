# M005: Continuous Prompted Flow

**Gathered:** 2026-03-14
**Status:** Ready for planning

## The Problem

`/issues` smart entry walks you through scoping and then stops. After that, you need to know to run `/issues sync`, then later `/issues pr`. This defeats the purpose of M004 — we removed the milestone ID prerequisite but left a command-sequence prerequisite.

The auto flow (`/issues auto`) gets this right: hooks detect ROADMAP.md and SUMMARY.md and fire sync/PR automatically. But the manual flow has no equivalent — it just abandons you after scoping.

There shouldn't be two distinct modes. `/issues` should walk you through the full lifecycle with confirmation prompts at each step. `/issues auto` should do the same thing but skip the confirmations. The individual commands (`/issues sync`, `/issues pr`, etc.) are escape hatches for one-off actions, not the primary path.

## What Should Happen

`/issues` becomes a single continuous flow:

1. Smart entry (already works) — detect state, offer import or fresh start
2. Scope (already works) — LLM creates milestone directories
3. **Prompted sync** — "Milestone planned. Sync to tracker?" → yes → create issue
4. GSD plans and executes slices (user drives this via `/gsd` or `/gsd auto`)
5. **Prompted PR** — "Milestone complete. Create PR?" → yes → create PR
6. Review & merge — issue auto-closes

Steps 3 and 5 are the missing pieces. The `agent_end` handler already detects the filesystem artifacts (ROADMAP.md, SUMMARY.md). It just needs a second mode: instead of auto-firing (hooks), prompt the user and fire on confirmation.

## What Exists Today

- `agent_end` handler in `index.ts` detects ROADMAP.md → auto-sync, SUMMARY.md → auto-PR
- Both gated on `_hooksEnabled` flag (set only by `/issues auto`)
- `handleSmartEntry()` sets `_preScopeMilestones` for scope detection but no flow continuation flag
- `syncMilestoneToIssue()` and `createMilestonePR()` work correctly as standalone functions
- `/issues sync` and `/issues pr` commands have their own interactive confirmation flows

## What Must Change

1. **New flag: `_promptedFlowEnabled`** — set by `handleSmartEntry()` (and cleared on completion/error). Parallel to `_hooksEnabled` but for the prompted path.

2. **agent_end handler gets a prompted branch** — when `_promptedFlowEnabled` is true and hooks are not enabled:
   - ROADMAP.md detected → send a message asking "Milestone X planned. Want to sync it to the tracker?" (or use `ctx.ui.confirm`)
   - SUMMARY.md detected → send a message asking "Milestone X complete. Create a PR?"
   - On confirmation → call sync/PR functions

3. **`/issues auto` is just `/issues` with auto-confirm** — conceptually, auto mode is the prompted flow with all confirmations auto-accepted. The hooks pattern already does this. No code change needed here, just mental model alignment.

4. **README updated** — one primary flow (`/issues`), auto variant (`/issues auto`), individual commands as escape hatches.

## Design Questions

- Should the confirmation be via `ctx.ui.confirm()` (native UI prompt) or via `sendMessage()` (LLM-mediated)? The `agent_end` handler receives `ExtensionContext`, not `ExtensionCommandContext` — it may not have `ui.confirm()`. If not, the prompt goes through `sendMessage` and the LLM interprets the user's response. This is how GSD's own prompted flows work.
- Should `/issues` also chain into `/gsd auto` after sync (with a prompt), or leave the user to drive execution separately? Full lifecycle = yes, but that might be too opinionated.

## Scope

Small — one new flag, one new branch in the existing `agent_end` handler, README update. The sync/PR functions and filesystem detection already work. This is wiring, not new capability.

## Success Criteria

- `/issues` with no milestones → scope → plan → prompted sync → work → prompted PR. One continuous flow.
- `/issues auto` behavior unchanged (hooks fire automatically, no prompts)
- Individual commands (`/issues sync`, `/issues pr`) still work standalone
- All existing tests pass, new tests cover prompted flow
