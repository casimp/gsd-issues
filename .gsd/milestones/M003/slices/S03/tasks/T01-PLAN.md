---
estimated_steps: 6
estimated_files: 1
---

# T01: Rewrite README with auto-flow documentation and updated diagram

**Slice:** S03 — README and Documentation
**Milestone:** M003

## Description

The current README covers M001/M002 features but has no mention of `/issues auto`, `max_slices_per_milestone`, `sizing_mode`, or the auto-flow lifecycle. The mermaid diagram shows the manual workflow only. This task rewrites the README to accurately reflect all implemented features including M003's auto-flow orchestration.

## Steps

1. Update the mermaid diagram: add a parallel entry point for `/issues auto` that flows through the phase sequence (import → plan → validate-size → [split loop] → sync → execute → pr → done). Use a subgraph for the sizing check + split path to keep it readable. Keep the existing manual command paths visible.
2. Add an "Auto Flow" section after "How It Works" explaining: the `/issues auto` command, the phase-based lifecycle, `max_slices_per_milestone` (default 5), `sizing_mode` (strict blocks until right-sized with 3 retries; best_try warns and proceeds), and the split behavior.
3. Update config examples in both GitLab and GitHub `<details>` blocks to include `max_slices_per_milestone: 5` and `sizing_mode: "best_try"`.
4. Update the Commands table: add `/issues auto` row, add "(stubbed)" caveat to `/issues status` if listed.
5. Update the LLM Tools section: change "Four tools" to "Five tools", add `gsd_issues_auto` row with `milestone_id?` parameter.
6. Update the Events table: add `gsd-issues:auto-phase` with `{ phase, milestoneId }` payload.

## Must-Haves

- [ ] Mermaid diagram includes both manual commands and `/issues auto` entry point
- [ ] Sizing check and split loop visible in diagram
- [ ] "Auto Flow" section with phase sequence, sizing config, strict/best_try explanation
- [ ] Config examples include `max_slices_per_milestone` and `sizing_mode`
- [ ] Commands table includes `/issues auto`
- [ ] LLM Tools count and table updated to 5 tools including `gsd_issues_auto`
- [ ] Events table includes `gsd-issues:auto-phase`
- [ ] No aspirational features — every documented feature is implemented

## Verification

- `grep -c 'gsd_issues_auto' README.md` returns ≥ 1
- `grep -c 'max_slices_per_milestone' README.md` returns ≥ 1
- `grep -c 'sizing_mode' README.md` returns ≥ 1
- `grep -c 'auto-phase' README.md` returns ≥ 1
- `grep -c '/issues auto' README.md` returns ≥ 1
- Mermaid syntax is valid (matching subgraph/end pairs, no stray brackets)
- `npx vitest run` — 309 tests still pass

## Inputs

- `README.md` — current README to update
- `src/lib/auto.ts` lines 277-285 — authoritative phase order (PHASE_ORDER)
- `src/lib/config.ts` lines 44-45 — config field definitions and defaults
- `src/index.ts` lines 392-416 — `gsd_issues_auto` tool schema
- S02 summary — auto-flow architecture, events, lock files
- `.gsd/DECISIONS.md` — D039 (best_try default), D040 (fields always written), D044 (3 retries)

## Observability Impact

- **Signals changed:** None — documentation-only task, no runtime code modified.
- **Future agent inspection:** Grep checks in Verification section are the primary diagnostic. A future agent can run those greps to confirm README completeness.
- **Failure state visibility:** Missing documentation sections will cause grep check failures. Malformed mermaid will render as broken diagrams on GitHub/GitLab.

## Expected Output

- `README.md` — fully updated with accurate documentation of all implemented features including auto-flow, sizing, and updated counts/tables
