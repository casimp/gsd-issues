# M006: Orphan Milestone Guard

**Vision:** `/issues` and `/issues auto` block with a clear message when in-progress milestones exist on disk that aren't tracked in ISSUE-MAP.json — preventing unknown-state milestones from being swept into the flow.

## Success Criteria

- Running `/issues` with an orphan milestone on disk shows a block message listing the orphan IDs
- Running `/issues auto` with an orphan milestone on disk shows a block message listing the orphan IDs
- Completed milestones (SUMMARY.md exists) are not flagged as orphans
- Fully mapped milestones (ISSUE-MAP.json has entries with matching localId) pass the guard
- All existing tests (330+) continue to pass

## Key Risks / Unknowns

- None. This is a composition of proven primitives with established test patterns.

## Verification Classes

- Contract verification: unit tests for `findOrphanMilestones()` utility, integration tests for both entry point guards using temp dirs and mock contexts
- Integration verification: none — pure filesystem check
- Operational verification: none
- UAT / human verification: none — guard behavior is fully deterministic

## Milestone Definition of Done

This milestone is complete only when all are true:

- `findOrphanMilestones(cwd)` correctly identifies unmapped, in-progress milestones
- `handleSmartEntry()` calls the guard and blocks with orphan list before any other logic
- `handleAutoEntry()` calls the guard and blocks with orphan list before any other logic
- Completed milestones are excluded from orphan detection
- All new tests pass alongside existing 330+ test suite
- `npx tsc --noEmit` reports zero type errors

## Requirement Coverage

- Covers: R027 (orphan milestone guard at flow entry)
- Partially covers: none
- Leaves for later: none
- Orphan risks: none — R027 is the only requirement scoped to this milestone

## Slices

- [ ] **S01: Orphan milestone guard utility and entry point wiring** `risk:low` `depends:[]`
  > After this: both `/issues` and `/issues auto` block with a list of orphan milestone IDs when unmapped in-progress milestones exist on disk (proven by contract tests)

## Boundary Map

### S01 (single slice)

Produces:
- `findOrphanMilestones(cwd): Promise<string[]>` — exported from `src/lib/smart-entry.ts`, returns milestone IDs that have CONTEXT.md but no ISSUE-MAP.json entry with matching localId and no SUMMARY.md
- Guard calls at top of `handleSmartEntry()` and `handleAutoEntry()` that block and return early when orphans are found

Consumes:
- `scanMilestones(cwd)` from `src/lib/smart-entry.ts`
- `loadIssueMap(filePath)` from `src/lib/issue-map.ts`
- SUMMARY.md existence check pattern from `src/index.ts` agent_end handler
