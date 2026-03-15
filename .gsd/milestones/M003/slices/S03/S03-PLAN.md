# S03: README and Documentation

**Goal:** README accurately documents the full gsd-issues workflow including auto-flow orchestration, sizing constraints, and all M003 features.
**Demo:** README contains an updated mermaid diagram with both manual and auto-flow paths, correct tool/command/event counts, config examples with sizing fields, and a clear auto-flow section.

## Must-Haves

- Mermaid diagram shows both entry points (manual commands and `/issues auto`) converging on the planning+sizing+execution loop, with the split/retry path visible
- New "Auto Flow" section explains `/issues auto` lifecycle, `max_slices_per_milestone`, strict vs best_try modes, and the phase sequence
- Config examples include `max_slices_per_milestone` and `sizing_mode` fields
- Commands table includes `/issues auto`
- LLM Tools section says "Five tools" (not "Four") and includes `gsd_issues_auto`
- Events table includes `gsd-issues:auto-phase`
- No aspirational features documented — everything reflects implemented behavior
- `/issues status` listed with a "stubbed" caveat (it exists as a subcommand but is not functional)

## Verification

- `grep -c 'gsd_issues_auto' README.md` returns ≥ 1
- `grep -c 'max_slices_per_milestone' README.md` returns ≥ 1
- `grep -c 'sizing_mode' README.md` returns ≥ 1
- `grep -c 'auto-phase' README.md` returns ≥ 1
- `grep -c '/issues auto' README.md` returns ≥ 1
- `grep 'Five tools' README.md` matches (or equivalent updated count)
- `grep 'status' README.md` has a stubbed/not-yet-implemented caveat
- Mermaid syntax valid: no unclosed subgraphs, matching brackets
- `npx vitest run` — 309 tests still pass (README change shouldn't break anything, but verify no accidental file edits)

## Tasks

- [x] **T01: Rewrite README with auto-flow documentation and updated diagram** `est:30m`
  - Why: The current README covers M001/M002 features but has zero mention of auto-flow, sizing, or the new tool/command/event. This is the only task needed — the slice is a single-file documentation update.
  - Files: `README.md`
  - Do: Update the mermaid diagram with a subgraph for the auto-flow path including sizing check and split loop. Add an "Auto Flow" section. Update config examples with `max_slices_per_milestone` and `sizing_mode`. Update Commands table (add `/issues auto`, add stubbed caveat for `/issues status`). Update LLM Tools table (add `gsd_issues_auto`, fix count). Update Events table (add `gsd-issues:auto-phase`). Cross-check every section against implemented source code.
  - Verify: Run the grep checks from Verification above, visually inspect mermaid syntax, run `npx vitest run` to confirm no regressions
  - Done when: All grep checks pass, mermaid diagram has both manual and auto paths, all counts/tables are accurate against source

## Observability / Diagnostics

- **Runtime signals:** None — this slice is documentation-only. No runtime code is modified.
- **Inspection surfaces:** `README.md` is the sole output. Grep checks in Verification section serve as the inspection surface for completeness.
- **Failure visibility:** Mermaid syntax errors would be visible as broken diagrams when rendered on GitHub/GitLab. Grep-based verification catches missing sections.
- **Redaction constraints:** None — no secrets or credentials in README content.

## Files Likely Touched

- `README.md`
