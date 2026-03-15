---
id: T01
parent: S03
milestone: M003
provides:
  - README.md fully rewritten with auto-flow documentation, updated mermaid diagram, sizing config, and correct tool/command/event counts
key_files:
  - README.md
key_decisions: []
patterns_established: []
observability_surfaces:
  - none — documentation-only task, no runtime code modified
duration: 15m
verification_result: passed
completed_at: 2026-03-14T20:33:00Z
blocker_discovered: false
---

# T01: Rewrite README with auto-flow documentation and updated diagram

**Rewrote README with mermaid diagram showing both manual and auto-flow paths, new Auto Flow section, updated config/commands/tools/events for M003.**

## What Happened

Rewrote `README.md` to document all implemented features through M003. Key changes:

1. **Mermaid diagram** — added an `auto` subgraph showing the `/issues auto` phase sequence (import → plan → validate-size → [split loop] → sync → execute → pr → done) alongside the existing manual command subgraph. Sizing check + split retry visible as a nested subgraph.
2. **Auto Flow section** — new section after "How It Works" covering the phase-based lifecycle, `max_slices_per_milestone` (default 5), `sizing_mode` (strict vs best_try), split retry (3 attempts max in strict), mutual exclusion via lock files, and state persistence to `.gsd/issues-auto.json`.
3. **Config examples** — both GitLab and GitHub `<details>` blocks now include `max_slices_per_milestone: 5` and `sizing_mode: "best_try"`.
4. **Commands table** — added `/issues auto` row, added `/issues status` with "(stubbed — not yet implemented)" caveat.
5. **LLM Tools** — changed "Four tools" to "Five tools", added `gsd_issues_auto` with `milestone_id?` parameter.
6. **Events table** — added `gsd-issues:auto-phase` with `{ phase, milestoneId }` payload.

All content cross-checked against authoritative sources: `src/lib/auto.ts` (PHASE_ORDER), `src/lib/config.ts` (config fields), `src/index.ts` (tool schema, status stub), and DECISIONS.md (D039, D040, D044).

## Verification

- `grep -c 'gsd_issues_auto' README.md` → 1 ✓
- `grep -c 'max_slices_per_milestone' README.md` → 3 ✓
- `grep -c 'sizing_mode' README.md` → 3 ✓
- `grep -c 'auto-phase' README.md` → 1 ✓
- `grep -c '/issues auto' README.md` → 5 ✓
- `grep 'Five tools' README.md` → matches ✓
- `grep 'status' README.md` includes stubbed caveat ✓
- Mermaid syntax: 3 subgraph / 3 end — balanced ✓
- No aspirational language found ✓
- `npx vitest run` — 309 tests pass, zero regressions ✓

All slice-level verification checks pass. This is the only task in S03.

## Diagnostics

None — documentation-only task. Grep checks in Verification serve as the diagnostic surface for completeness.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `README.md` — fully rewritten with auto-flow documentation, updated diagram, config examples, commands/tools/events tables
- `.gsd/milestones/M003/slices/S03/S03-PLAN.md` — added Observability / Diagnostics section (pre-flight fix)
- `.gsd/milestones/M003/slices/S03/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
