# S03: README and Documentation — Research

**Date:** 2026-03-14

## Summary

S03 is a documentation-only slice: update the README to accurately reflect everything implemented in M003 (S01 config/sizing + S02 auto-flow). The current README covers M001/M002 features but has zero mention of `/issues auto`, `max_slices_per_milestone`, `sizing_mode`, or the auto-flow lifecycle. The mermaid diagram shows the manual workflow but not the automated path.

The work is surgical: update the mermaid diagram to show both entry points (manual commands vs `/issues auto`), add the auto-flow section, update the config examples with sizing fields, update the commands table, update the tools table, and add the `gsd-issues:auto-phase` event. No new code, no tests — verification is visual inspection of README accuracy against implemented behavior.

## Recommendation

Single task. Read the existing README, then rewrite it with:
1. Updated mermaid diagram showing both manual and auto-flow paths, including the sizing constraint and split loop
2. New "Auto Flow" section explaining `/issues auto` lifecycle, `max_slices_per_milestone`, strict vs best_try
3. Updated config examples with the two new fields
4. Updated Commands table (add `/issues auto`)
5. Updated Tools table (add `gsd_issues_auto`, now 5 tools not 4)
6. Updated Events table (add `gsd-issues:auto-phase`)

The diagram is the hardest part — needs to clearly show two entry points converging on the same planning + sizing + execution loop without becoming unreadable.

## Don't Hand-Roll

| Problem | Existing Solution | Why Use It |
|---------|------------------|------------|
| Phase transitions for the diagram | `PHASE_ORDER` in `src/lib/auto.ts` line 277 | Authoritative source of the phase sequence: import → plan → validate-size → sync → execute → pr → done |
| Config field names and defaults | `src/lib/config.ts` lines 44-45 and D039/D040 | `max_slices_per_milestone` defaults to 5, `sizing_mode` defaults to `best_try` |
| Tool parameters | `src/index.ts` lines 392-416 | `gsd_issues_auto` tool schema with `milestone_id` optional param |

## Existing Code and Patterns

- `README.md` — current README with mermaid diagram covering manual workflow only. Structure: How It Works → Providers → Installation → Setup → Commands → LLM Tools → Events → Requirements → License. Well-organized, concise.
- `src/lib/auto.ts` — phase-based state machine. Phase order: import → plan → validate-size → [split loop if oversized] → sync → execute → pr → done. Split retries max 3 in strict mode (D044). The `validate-size` phase runs internally (no LLM turn). Split loops back to validate-size.
- `src/commands/auto.ts` — command handler resolves milestone from args → config → GSD state. Stashes context for `agent_end`.
- `src/lib/sizing.ts` — `validateMilestoneSize()` reads roadmap, counts slices, compares to limit. Returns typed `SizingResult`.
- `src/lib/config.ts` — Config interface with `max_slices_per_milestone?: number` and `sizing_mode?: "strict" | "best_try"`. Both always written to config with defaults (5 / best_try per D040).

## Constraints

- README must be accurate against the implemented behavior — no aspirational features
- The mermaid diagram needs to render correctly on GitHub/npm (standard mermaid flowchart syntax)
- Config examples must include the new sizing fields since they're always written to config (D040)
- `/issues status` is still stubbed — must not list it as functional in the commands table (currently listed without caveat)
- 5 tools now (sync, close, import, pr, auto), not 4 — the "Four tools" text is stale

## Common Pitfalls

- **Diagram complexity** — the auto-flow has a split/retry loop that could make the diagram unreadable. Use a subgraph for the sizing check + split loop rather than showing every transition.
- **Confusing auto vs manual** — the README should clearly distinguish: manual commands are still available, auto orchestrates them all. Don't make it sound like auto replaced the manual commands.
- **Stale counts/numbers** — "Four tools" in the LLM Tools section needs updating to five. Events table needs the new event. Commands table needs auto added.

## Open Risks

- Mermaid rendering differences between GitHub and npm/other viewers — keep the diagram simple and test that the syntax is valid standard flowchart notation.

## Skills Discovered

No specialized skills needed — this is a markdown documentation update.

| Technology | Skill | Status |
|------------|-------|--------|
| mermaid | n/a | none needed — standard flowchart syntax |

## Sources

- `src/lib/auto.ts` — phase order, prompt builders, split retry logic (lines 277-285, 178-273, 308)
- `src/commands/auto.ts` — command handler, milestone resolution (lines 59-78, 109-163)
- `src/lib/sizing.ts` — SizingResult type, validation logic (lines 21-27, 42-85)
- `src/lib/config.ts` — Config interface fields (lines 38-45)
- `src/index.ts` — tool registration, subcommand list, agent_end handler (lines 115, 392-432)
- `.gsd/DECISIONS.md` — D039 (sizing_mode defaults to best_try), D040 (fields always written), D041-D045 (auto-flow architecture)
