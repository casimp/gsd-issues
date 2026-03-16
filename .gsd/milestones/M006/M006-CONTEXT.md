# M006: Orphan Milestone Guard — Context

**Gathered:** 2026-03-14
**Status:** Ready for planning

## Project Description

Add a guard at the entry points of `/issues` and `/issues auto` that blocks the continuous flow when in-progress milestones exist on disk that weren't created through the `/issues` flow. These "orphan" milestones have no ISSUE-MAP.json entry and are in an unknown state — the extension can't safely adopt them. The user must tidy up before the flow proceeds.

## Why This Milestone

The continuous prompted flow (M005) and auto-mode hooks (M004) assume all milestones on disk are either tracked by the extension (mapped in ISSUE-MAP) or completed. But milestones can be created outside `/issues` — via `/gsd` directly, manually, or from sessions before gsd-issues was installed. Silently sweeping these into the flow means the extension doesn't know their state: mid-plan, mid-slice, wrong size, unknown branch. The guard ensures `/issues`-managed milestones went through the full lifecycle from the start.

## User-Visible Outcome

### When this milestone is complete, the user can:

- Run `/issues` or `/issues auto` and see a clear block message listing orphan milestones if any exist
- Resolve orphans via `/issues sync` (conscious linking) or by removing/archiving them, then re-enter the flow

### Entry point / environment

- Entry point: `/issues` and `/issues auto` slash commands
- Environment: local dev (pi extension)
- Live dependencies involved: none — filesystem-only check

## Completion Class

- Contract complete means: tests prove the guard fires when orphans exist, doesn't fire when all milestones are mapped or completed, and both entry points are gated
- Integration complete means: none — no real subsystem interaction needed
- Operational complete means: none

## Final Integrated Acceptance

To call this milestone complete, we must prove:

- `handleSmartEntry()` blocks and lists orphans when unmapped in-progress milestones exist
- `handleAutoEntry()` blocks and lists orphans when unmapped in-progress milestones exist
- Completed milestones (SUMMARY.md exists) are excluded from the orphan check
- Fully mapped milestones pass the guard
- All existing tests still pass (330+)

## Risks and Unknowns

- None significant — this is a guard check using existing utilities. The scanning and map-loading code is proven.

## Existing Codebase / Prior Art

- `src/commands/issues.ts` — `handleSmartEntry()` and `handleAutoEntry()` are the two entry points to guard
- `src/lib/smart-entry.ts` — `scanMilestones()` scans `.gsd/milestones/` for dirs with CONTEXT.md
- `src/lib/issue-map.ts` — `loadIssueMap()` reads a milestone's ISSUE-MAP.json
- `src/index.ts` — `agent_end` handler already checks for SUMMARY.md and ISSUE-MAP per milestone

> See `.gsd/DECISIONS.md` for all architectural and pattern decisions — it is an append-only register; read it during planning, append to it during execution.

## Relevant Requirements

- R027 — Orphan milestone guard at flow entry (new, primary)

## Scope

### In Scope

- `findOrphanMilestones(cwd)` utility function
- Guard check at top of `handleSmartEntry()`
- Guard check at top of `handleAutoEntry()`
- Tests for utility and both entry points
- Skip completed milestones (SUMMARY.md exists)

### Out of Scope / Non-Goals

- Interactive per-orphan "sync/ignore/remove" flow — user resolves manually
- Marking milestones as "intentionally untracked" — possible future work
- Changing behavior of `/issues sync`, `/issues pr`, or other standalone commands

## Technical Constraints

- `scanMilestones()` currently only returns milestones with CONTEXT.md — the orphan check builds on this
- ISSUE-MAP.json lives at `.gsd/milestones/{MID}/ISSUE-MAP.json` — must be checked per milestone
- SUMMARY.md lives at `.gsd/milestones/{MID}/{MID}-SUMMARY.md` — presence means completed

## Integration Points

- None — pure filesystem check, no external services

## Open Questions

- None remaining after discussion
