# S01: Orphan Milestone Guard Utility and Entry Point Wiring

**Goal:** Block `/issues` and `/issues auto` when unmapped in-progress milestones exist on disk.
**Demo:** Tests prove both entry points show orphan list and return early; completed and mapped milestones pass through.

## Must-Haves

- `findOrphanMilestones(cwd)` utility in `src/lib/smart-entry.ts`
- Guard call at top of `handleSmartEntry()` — before config loading or state detection
- Guard call at top of `handleAutoEntry()` — before `scanMilestones()` or resume dispatch
- Completed milestones (SUMMARY.md exists) excluded from orphan set
- Mapped milestones (ISSUE-MAP.json has entry with matching localId) excluded from orphan set
- Block message via `ctx.ui.notify()` listing orphan IDs
- Early return after block — no fall-through

## Verification

- `npx vitest run src/lib/__tests__/smart-entry.test.ts` — new tests for `findOrphanMilestones()`
- `npx vitest run src/commands/__tests__/issues.test.ts` — new tests for guard in both handlers
- `npx vitest run` — full suite passes (330+ existing + new tests)
- `npx tsc --noEmit` — zero type errors

## Tasks

- [x] **T01: Implement findOrphanMilestones utility** `est:20m`
  - Why: Core logic that identifies orphan milestones — foundation for the guard checks
  - Files: `src/lib/smart-entry.ts`, `src/lib/__tests__/smart-entry.test.ts`
  - Do: Add `findOrphanMilestones(cwd)` to `smart-entry.ts`. For each milestone from `scanMilestones(cwd)`: check if `{MID}-SUMMARY.md` exists (skip if yes), check if `ISSUE-MAP.json` has an entry with `localId === mid` (skip if yes), collect remaining as orphans. Follow the async/ENOENT pattern from `scanMilestones`. Export the function. Add tests: no milestones → empty, all mapped → empty, all completed → empty, one orphan → returns it, mixed → returns only orphans.
  - Verify: `npx vitest run src/lib/__tests__/smart-entry.test.ts`
  - Done when: `findOrphanMilestones` correctly identifies orphans, excludes completed and mapped milestones, and all new tests pass

- [x] **T02: Wire guard into handleSmartEntry and handleAutoEntry** `est:25m`
  - Why: The utility is useless without the actual guard at both entry points
  - Files: `src/commands/issues.ts`, `src/commands/__tests__/issues.test.ts`
  - Do: At the top of both `handleSmartEntry()` and `handleAutoEntry()` (before any existing logic), call `findOrphanMilestones(cwd)`. If non-empty, call `ctx.ui.notify()` with a message listing the orphan IDs and instructing the user to resolve via `/issues sync` or by removing/archiving them. Return early — do not fall through to existing logic. Add tests in `issues.test.ts`: orphan present → blocks with notify message for both handlers; no orphans → proceeds normally for both handlers; completed milestone → not blocked; mapped milestone → not blocked.
  - Verify: `npx vitest run src/commands/__tests__/issues.test.ts` and `npx vitest run` for full suite
  - Done when: Both entry points block on orphans, pass on clean state, all new tests pass alongside existing 330+ tests, `npx tsc --noEmit` clean

## Observability / Diagnostics

- **Runtime signals:** `findOrphanMilestones` returns an empty array (clean) vs populated array (orphans detected). The guard in entry points emits a `ctx.ui.notify()` message listing orphan IDs — this is the primary user-facing diagnostic.
- **Inspection surface:** Call `findOrphanMilestones(cwd)` directly to inspect which milestones lack both SUMMARY.md and ISSUE-MAP.json mapping. The result is a plain `string[]` of milestone IDs.
- **Failure visibility:** `scanMilestones` and `loadIssueMap` propagate non-ENOENT errors (permission issues, corrupt JSON). These surface as uncaught exceptions with file paths in the error messages.
- **Redaction constraints:** No secrets involved. Milestone IDs and file paths are safe to log.

## Files Likely Touched

- `src/lib/smart-entry.ts`
- `src/lib/__tests__/smart-entry.test.ts`
- `src/commands/issues.ts`
- `src/commands/__tests__/issues.test.ts`
