---
estimated_steps: 3
estimated_files: 3
---

# T02: Add /issues scope subcommand and rewrite README

**Slice:** S02 — Multi-milestone sequencing, /issues scope, and README
**Milestone:** M004

## Description

Wire `/issues scope` as a standalone subcommand that calls `handleSmartEntry()` without the auto flag. Then rewrite the README to reflect the current architecture: three entry points (existing issues, greenfield, resume), scope→GSD auto chain for auto-flow, no M003 state machine references.

## Steps

1. **Add `/issues scope` subcommand.** In `index.ts`: add `"scope"` to the `SUBCOMMANDS` array. Add a `case "scope"` in the switch that calls `handleSmartEntry(args, ctx, pi)`. In the issues test file, add tests: (a) `/issues scope` calls handleSmartEntry, (b) `"scope"` appears in argument completions.

2. **Rewrite README.** Replace the entire README content. Key changes:
   - **How It Works**: Three entry points — "Start fresh" (no tracker), "Start from existing issues" (`/issues` with import), "Resume" (`/issues auto` with existing milestones). No milestone ID mentioned as user input.
   - **Auto flow**: `/issues auto` → scope (if no milestones) → `/gsd auto` → GSD handles planning/execution → hooks auto-sync on ROADMAP.md, auto-PR on SUMMARY.md. No state machine diagram. No issues-auto.json. No mutual exclusion section.
   - **Commands table**: Add `/issues scope`. Update `/issues auto` to show it works without milestone ID. Remove `status` stub reference if appropriate.
   - **Events table**: Add `gsd-issues:scope-complete`, `gsd-issues:auto-sync`, `gsd-issues:auto-pr`. Remove `gsd-issues:auto-phase`.
   - **LLM tools table**: Remove `gsd_issues_auto`. Keep sync, close, pr, import.
   - **Config examples**: Show `auto_pr` field. Make `milestone` clearly optional (remove from examples or mark as optional).
   - **Setup section**: Keep as-is but remove milestone as a required config field in the example.
   - Remove the "Auto Flow Details" section entirely (sizing constraints / mutual exclusion — these are GSD's concern now).
   - Verify no references to: `issues-auto.json`, `issues-auto.lock`, `auto.lock`, `gsd_issues_auto`, `AutoPhase`, `auto-phase`.

3. **Run verification.** Compile, run full test suite, grep README for stale references.

## Must-Haves

- [ ] `/issues scope` routes to `handleSmartEntry()`
- [ ] `"scope"` in SUBCOMMANDS and argument completions
- [ ] Tests for scope subcommand routing
- [ ] README documents three entry points without milestone IDs
- [ ] README has zero references to M003 artifacts (state machine, issues-auto.json, locks, gsd_issues_auto, auto-phase)
- [ ] README includes `auto_pr` in config examples
- [ ] README events table includes new hook events

## Verification

- `npx vitest run` — all tests pass
- `npx tsc --noEmit` — clean
- `grep -c "issues-auto\|auto.lock\|gsd_issues_auto\|AutoPhase\|auto-phase" README.md` returns 0

## Inputs

- `src/index.ts` — SUBCOMMANDS array and switch statement (extend)
- `src/commands/issues.ts` — `handleSmartEntry()` (reuse, no changes)
- `README.md` — current content with stale M003 references
- T01 output — `auto_pr` config field, hook events (`auto-sync`, `auto-pr`)

## Expected Output

- `src/index.ts` — `"scope"` added to SUBCOMMANDS, case added to switch
- `src/commands/__tests__/issues.test.ts` — 2+ new scope subcommand tests
- `README.md` — fully rewritten, current architecture, zero stale references

## Observability Impact

- **No new runtime signals.** This task adds a command route (`/issues scope`) that reuses existing `handleSmartEntry()` — all runtime events (scope-complete, auto-sync, auto-pr) are unchanged.
- **Inspection:** `/issues scope` routes to the same `handleSmartEntry()` as bare `/issues` — same scope-prompt sendMessage, same pre-scope snapshot. No new state to inspect.
- **Failure visibility:** If `"scope"` is missing from SUBCOMMANDS, the default case logs `Unknown subcommand: "scope"` — grep-friendly in test output.
- **README as diagnostic artifact:** The README itself is the observable output — stale reference grep returns 0 when correct.
