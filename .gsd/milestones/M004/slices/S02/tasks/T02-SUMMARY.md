---
id: T02
parent: S02
milestone: M004
provides:
  - /issues scope subcommand routing to handleSmartEntry()
  - README rewritten for current architecture (zero M003 stale references)
key_files:
  - src/index.ts
  - src/commands/__tests__/issues.test.ts
  - README.md
key_decisions: []
patterns_established: []
observability_surfaces:
  - "Unknown subcommand error message includes 'scope' in valid list — grep-friendly"
  - "README stale reference grep returns 0 — verifiable artifact"
duration: ~15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T02: Add /issues scope subcommand and rewrite README

**Added `scope` subcommand and rewrote README to reflect post-M003 architecture with hooks, three entry points, and zero stale references.**

## What Happened

1. **`/issues scope` subcommand:** Added `"scope"` to SUBCOMMANDS array, added `case "scope"` in the switch routing to `handleSmartEntry(args, ctx, pi)`. Updated description string and default-case error message to include `scope`.

2. **Scope tests:** Two new tests — (a) `/issues scope` routes through to `handleSmartEntry()` (verified by scope-prompt sendMessage), (b) `"scope"` appears in argument completions.

3. **README rewrite:** Complete replacement. Key changes:
   - Three entry points: start fresh, start from existing issues, resume
   - Auto workflow describes scope→`/gsd auto`→hooks chain (no state machine)
   - Commands table includes `/issues scope`, bare `/issues`, updated `/issues auto` (no milestone ID arg)
   - Events table adds `scope-complete`, `auto-start`, `auto-sync`, `auto-pr`; removes `auto-phase`
   - LLM tools table: 4 tools (removed `gsd_issues_auto`)
   - Config examples include `auto_pr` field, `milestone` removed from examples (documented as optional in config table)
   - Config table added with all fields, required/optional, defaults
   - Removed: Auto Flow Details section (sizing constraints, mutual exclusion), all Mermaid diagrams, `issues-auto.json` references

## Verification

- `npx tsc --noEmit` — clean compilation
- `npx vitest run` — 324 tests pass (18 test files)
- `npx vitest run -t "issues scope"` — 2 scope tests pass
- `npx vitest run -t "agent_end hooks"` — 10 hook tests pass
- `npx vitest run -t "gracefully"` — 3 error/failure-path tests pass
- `grep -c "issues-auto.json\|issues-auto.lock\|auto.lock\|gsd_issues_auto\|AutoPhase\|auto-phase" README.md` — returns 0
- `grep -in "state machine\|mutual exclusion" README.md` — no matches

All slice-level verification checks pass (this is the final task of the slice).

## Diagnostics

No new runtime signals. `/issues scope` reuses `handleSmartEntry()` which emits the same `gsd-issues:scope-prompt` sendMessage and `gsd-issues:scope-complete` event as bare `/issues`. The README is the primary artifact — verify accuracy by grepping for stale references.

## Deviations

- Slice plan's vitest grep commands use `--grep` which is not supported in vitest v3. Actual verification used `-t` flag instead. No impact on coverage.

## Known Issues

None.

## Files Created/Modified

- `src/index.ts` — added `"scope"` to SUBCOMMANDS, added `case "scope"` routing, updated description and error message
- `src/commands/__tests__/issues.test.ts` — added `describe("issues scope subcommand")` with 2 tests
- `README.md` — complete rewrite: current architecture, three entry points, hooks-based auto flow, config table, zero stale M003 references
- `.gsd/milestones/M004/slices/S02/tasks/T02-PLAN.md` — added Observability Impact section (pre-flight fix)
