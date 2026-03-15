---
id: S03
parent: M003
milestone: M003
provides:
  - README.md fully documenting the gsd-issues workflow including auto-flow, sizing config, updated mermaid diagram, and correct tool/command/event counts
requires:
  - slice: S02
    provides: /issues auto command, orchestration loop, extended ExtensionAPI, split prompts, mutual exclusion
affects: []
key_files:
  - README.md
key_decisions: []
patterns_established: []
observability_surfaces:
  - none — documentation-only slice, no runtime code modified
drill_down_paths:
  - tasks/T01-SUMMARY.md
duration: 15m
verification_result: passed
completed_at: 2026-03-14T20:33:00Z
---

# S03: README and Documentation

**README rewritten with auto-flow documentation, updated mermaid diagram showing both manual and auto paths, sizing config examples, and corrected tool/command/event counts.**

## What Happened

Single-task slice: rewrote README.md to document all implemented features through M003. Added a mermaid diagram subgraph for the `/issues auto` phase sequence (import → plan → validate-size → [split loop] → sync → execute → pr → done) alongside the existing manual commands. Added an "Auto Flow" section covering phase lifecycle, `max_slices_per_milestone` (default 5), `sizing_mode` (strict vs best_try), split retry limits, mutual exclusion, and state persistence. Updated config examples with sizing fields, commands table with `/issues auto` and `/issues status` (stubbed caveat), LLM tools count from four to five with `gsd_issues_auto`, and events table with `gsd-issues:auto-phase`. All content cross-checked against source (`auto.ts`, `config.ts`, `index.ts`, DECISIONS.md).

## Verification

- All 7 grep checks pass (gsd_issues_auto, max_slices_per_milestone ×3, sizing_mode ×3, auto-phase, /issues auto ×5, Five tools, status stubbed)
- Mermaid syntax balanced: 3 subgraph / 3 end
- No aspirational language — everything documents implemented behavior
- 309 tests pass, zero regressions

## Requirements Advanced

- R021 — README now documents the `/issues auto` lifecycle, completing documentation coverage for auto-flow orchestration

## Requirements Validated

- none — this slice is documentation-only, does not change validation status of any requirement

## New Requirements Surfaced

- none

## Requirements Invalidated or Re-scoped

- none

## Deviations

None.

## Known Limitations

- `/issues status` is documented with a "stubbed — not yet implemented" caveat — it exists as a routed subcommand but returns no useful output
- Runtime UAT on real remotes remains the validation gap across M001–M003

## Follow-ups

- none

## Files Created/Modified

- `README.md` — fully rewritten with auto-flow documentation, updated diagram, config examples, commands/tools/events tables

## Forward Intelligence

### What the next slice should know
- M003 is complete after this slice. The extension has 309 contract tests but zero runtime UAT against real GitHub/GitLab remotes — that's the primary validation gap for any future work.

### What's fragile
- Mermaid diagram has 3 nested subgraphs — adding more paths may hit rendering limits on some markdown renderers

### Authoritative diagnostics
- Grep checks in the slice plan verification section are the canonical completeness check for README content

### What assumptions changed
- none
