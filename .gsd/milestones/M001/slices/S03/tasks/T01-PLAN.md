---
estimated_steps: 4
estimated_files: 2
---

# T01: Roadmap parser and GSD state helpers

**Slice:** S03 — Sync Workflow
**Milestone:** M001

## Description

Implement the deferred D011 helpers: `parseRoadmapSlices()` to extract slice metadata from roadmap markdown, and `readGSDState()` to find the active milestone ID from `.gsd/STATE.md`. These are pure functions with no external dependencies — the foundation sync needs to know what to create issues for.

## Steps

1. Create `src/lib/state.ts` with `parseRoadmapSlices(content: string)` that parses roadmap markdown. Each slice line follows `- [ ] **S01: Title** \`risk:level\` \`depends:[]\`` with an optional `> After this: ...` description on the next line. Return `{ id: string, title: string, risk: string, done: boolean, description: string }[]`. Handle `[x]` for completed slices.
2. Add `readGSDState(cwd: string)` to the same file. Reads `.gsd/STATE.md`, extracts the active milestone ID from the `**Active Milestone:**` line using regex. Returns `{ milestoneId: string } | null` if the line isn't found or file is missing.
3. Add `findRoadmapPath(cwd: string, milestoneId: string)` convenience that returns the expected roadmap file path: `{cwd}/.gsd/milestones/{milestoneId}/{milestoneId}-ROADMAP.md`.
4. Write `src/lib/__tests__/state.test.ts` covering: multiple slices with mixed done/undone, risk levels, description extraction, missing description, `[x]` handling, empty roadmap, malformed lines skipped, `readGSDState` with valid STATE.md, missing file returns null, missing milestone line returns null.

## Must-Haves

- [ ] `parseRoadmapSlices` extracts id, title, risk, done, description from roadmap format
- [ ] `readGSDState` reads milestone ID from STATE.md or returns null
- [ ] Handles both `[ ]` and `[x]` checkboxes
- [ ] Malformed/non-matching lines are silently skipped (not thrown)
- [ ] Description from `> After this: ...` line is captured when present

## Verification

- `npx vitest run src/lib/__tests__/state.test.ts` — all tests pass
- `npx tsc --noEmit` — zero type errors

## Inputs

- Roadmap format from ROADMAP.md: `- [ ] **S01: Title** \`risk:level\` \`depends:[]\`` with optional `> After this: ...`
- STATE.md format: `**Active Milestone:** M001 — Issue Tracker Integration`
- D011 decision: these helpers deferred from S01 to be built with their consumer

## Observability Impact

- **No runtime signals** — these are pure parsing functions with no side effects or event emission.
- **Inspection:** A future agent verifies correctness by running `npx vitest run src/lib/__tests__/state.test.ts`. The test file exercises all edge cases.
- **Failure visibility:** `readGSDState` returns `null` on missing file or missing milestone line — callers can distinguish "no state" from "state found". `parseRoadmapSlices` silently skips malformed lines, returning only valid entries — callers see an empty array for empty/invalid input.
- **Debugging:** Both functions are deterministic pure functions (parseRoadmapSlices takes a string, readGSDState reads a single file). Failures reproduce trivially with the same input.

## Expected Output

- `src/lib/state.ts` — parseRoadmapSlices, readGSDState, findRoadmapPath exported
- `src/lib/__tests__/state.test.ts` — 10+ tests covering parser edge cases and state reading
