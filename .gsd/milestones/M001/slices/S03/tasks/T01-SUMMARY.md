---
id: T01
parent: S03
milestone: M001
provides:
  - parseRoadmapSlices(content) — extracts slice metadata from roadmap markdown
  - readGSDState(cwd) — reads active milestone ID from .gsd/STATE.md
  - findRoadmapPath(cwd, milestoneId) — constructs expected roadmap file path
key_files:
  - src/lib/state.ts
  - src/lib/__tests__/state.test.ts
key_decisions:
  - parseRoadmapSlices takes string content (not file path) — keeps it pure, caller handles I/O
  - Regex-based parsing matches existing codebase patterns (no markdown AST library)
patterns_established:
  - Description line detection via `> After this:` prefix — same convention as ROADMAP.md
  - Null-return pattern for missing state (matches loadIssueMap's empty-array-on-ENOENT)
observability_surfaces:
  - none (pure functions — diagnosed via test suite)
duration: 15m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T01: Roadmap parser and GSD state helpers

**Implemented pure parsing functions for roadmap slice extraction and GSD state reading — 18 tests covering all edge cases.**

## What Happened

Created `src/lib/state.ts` with three exports:

- `parseRoadmapSlices(content: string)` — regex-based parser that extracts `{ id, title, risk, done, description }` from roadmap markdown. Handles `[x]`/`[X]`/`[ ]` checkboxes, captures `> After this:` descriptions, silently skips malformed lines.
- `readGSDState(cwd: string)` — reads `.gsd/STATE.md` and extracts the active milestone ID from the `**Active Milestone:**` line. Returns null on missing file or missing line.
- `findRoadmapPath(cwd, milestoneId)` — pure path construction for `{cwd}/.gsd/milestones/{id}/{id}-ROADMAP.md`.

The parser was validated against the actual roadmap content in this project's `M001-ROADMAP.md` to confirm format compatibility.

## Verification

- `npx vitest run src/lib/__tests__/state.test.ts` — 18 tests pass
- `npx tsc --noEmit` — zero type errors
- `npx vitest run` — all 103 tests pass (7 test files, no regressions)

Slice-level verification (partial — T01 is first of 3 tasks):
- ✅ `npx vitest run src/lib/__tests__/state.test.ts` — passes
- ⬜ `npx vitest run src/lib/__tests__/sync.test.ts` — not yet created (T02)
- ⬜ `npx vitest run src/commands/__tests__/sync.test.ts` — not yet created (T03)
- ✅ `npx tsc --noEmit` — passes
- ✅ `npx vitest run` — all tests green

## Diagnostics

Pure functions with no runtime side effects. Test suite is the diagnostic surface — run `npx vitest run src/lib/__tests__/state.test.ts` to verify behavior. readGSDState returns null (not throws) on missing/incomplete state, so callers always get a clean signal.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `src/lib/state.ts` — parseRoadmapSlices, readGSDState, findRoadmapPath exports
- `src/lib/__tests__/state.test.ts` — 18 tests covering parser edge cases and state reading
- `.gsd/milestones/M001/slices/S03/tasks/T01-PLAN.md` — added Observability Impact section (pre-flight fix)
