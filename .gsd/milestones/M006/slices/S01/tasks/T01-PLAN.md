---
estimated_steps: 5
estimated_files: 2
---

# T01: Implement findOrphanMilestones utility

**Slice:** S01 — Orphan Milestone Guard Utility and Entry Point Wiring
**Milestone:** M006

## Description

Build the `findOrphanMilestones(cwd)` function in `src/lib/smart-entry.ts`. This composes three existing primitives: `scanMilestones()` for discovery, `loadIssueMap()` for mapping check, and `stat()` for SUMMARY.md existence. A milestone is an orphan if it has CONTEXT.md (from scanMilestones) but no SUMMARY.md and no ISSUE-MAP.json entry with matching `localId`.

## Steps

1. Read `src/lib/smart-entry.ts` to understand `scanMilestones()` API and file structure
2. Read `src/lib/issue-map.ts` to understand `loadIssueMap()` return shape and ENOENT handling
3. Implement `findOrphanMilestones(cwd)`: call `scanMilestones`, iterate results, for each: check SUMMARY.md via `stat` (catch ENOENT → not completed), load ISSUE-MAP.json via `loadIssueMap` (returns `[]` on missing → not mapped), check `entries.some(e => e.localId === mid)`. Collect those with neither into orphan list.
4. Export `findOrphanMilestones` from the module
5. Write tests in `src/lib/__tests__/smart-entry.test.ts`: empty dir, all mapped, all completed, one orphan, mixed states

## Must-Haves

- [ ] `findOrphanMilestones` returns empty array when no milestones exist
- [ ] `findOrphanMilestones` excludes milestones with SUMMARY.md
- [ ] `findOrphanMilestones` excludes milestones with ISSUE-MAP.json entry matching localId
- [ ] `findOrphanMilestones` returns IDs of milestones that are neither completed nor mapped
- [ ] All new tests pass

## Verification

- `npx vitest run src/lib/__tests__/smart-entry.test.ts` passes with new tests
- Function is exported and callable

## Inputs

- `src/lib/smart-entry.ts` — `scanMilestones()` implementation and export pattern
- `src/lib/issue-map.ts` — `loadIssueMap()` API, `IssueMapEntry` type with `localId` field
- `src/index.ts` lines 582-589 — SUMMARY.md stat pattern from agent_end handler

## Observability Impact

- **New signal:** `findOrphanMilestones(cwd)` returns `string[]` — empty means all milestones are either completed or mapped; populated means orphans exist. This is the input signal for the T02 guard.
- **Inspection:** A future agent can call `findOrphanMilestones(cwd)` to understand project health without parsing multiple files manually.
- **Failure state:** Non-ENOENT filesystem errors from `stat()` and `loadIssueMap()` propagate with file paths in error messages. Corrupt ISSUE-MAP.json throws with the path and index of the invalid entry.

## Expected Output

- `src/lib/smart-entry.ts` — new exported `findOrphanMilestones(cwd: string): Promise<string[]>` function
- `src/lib/__tests__/smart-entry.test.ts` — new describe block with 5+ test cases
