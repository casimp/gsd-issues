# Queued Milestones

<!-- Append-only. Each entry is a milestone idea captured for future planning. -->

## M002 — Milestone-Level Issue Tracking and PR Workflow

**Queued:** 2026-03-14
**Source:** user discussion after M001 completion
**Requirements:** R014, R015, R016

**Vision:** Reframe the extension around milestones as the unit of external work, not slices. One issue per milestone, one PR per milestone, one review per milestone. Slices remain GSD's internal implementation detail.

**Forward flow (GSD → tracker):**
1. Plan a milestone in GSD (2-3 slices, right-sized for review)
2. Extension creates one issue on the tracker for the milestone
3. GSD works through slices on a milestone branch (auto or guided)
4. Milestone completes → extension creates PR from milestone branch → main with `Closes #N`
5. Review, merge, issue closes

**Reverse flow (tracker → GSD):**
1. Existing issues on the tracker (potentially vague/large)
2. Import into GSD for planning input
3. GSD plans — breaks down into right-sized milestones
4. Extension closes/re-weights original issues, creates new milestone-scoped issues
5. Back to forward flow

**Key design decisions from discussion:**
- Milestone is the reviewable unit — maps to one issue, one branch, one PR
- Slices are internal to GSD — the tracker doesn't need to know about them
- GSD's integration branch support means slices merge into the milestone branch, not main
- Auto-mode works naturally — it ploughs through slices on the milestone branch
- Sub-issues for slice visibility deferred (R017) — nice-to-have, not core
- M001's provider abstraction, config system, CLI wrappers remain valid foundation
- M001's per-slice sync/close orchestration needs to be rebuilt around milestones

**What carries forward from M001:**
- IssueProvider interface and both provider implementations
- Config system and /issues setup
- CLI exec wrappers (glab/gh)
- Event bus pattern
- npm packaging
- 188 tests for the foundation layer

**What changes:**
- Sync: one issue per milestone, not per slice
- ISSUE-MAP: milestone → issue mapping, not slice → issue
- Close: fires on milestone completion, not slice completion (via PR merge, not summary write)
- Import: adds re-scoping step (close originals, create milestone issues)
- New: PR/MR creation on milestone completion

## M006 — Orphan Milestone Guard

**Queued:** 2026-03-14
**Source:** user discussion after M005 completion
**Requirements:** none (new requirement needed)

**Vision:** `/issues` and `/issues auto` should refuse to proceed when milestones exist on disk that weren't created through the `/issues` flow (no ISSUE-MAP entry, never went through scope). The user must tidy up before the continuous flow takes over — either by explicitly syncing orphans via `/issues sync` or removing them.

**The problem:** If milestones were created outside `/issues` (via `/gsd` directly, manually, etc.), the extension doesn't know their state — mid-slice, mid-plan, already completed, wrong size, unknown branch state. Silently adopting them into the prompted or auto flow breaks the invariant that `/issues`-managed milestones went through the full lifecycle from the start.

**What should happen:**
1. At smart entry (`handleSmartEntry` / `handleAutoEntry`), scan for milestones on disk
2. Check each against ISSUE-MAP — any milestone without a mapping is an orphan
3. If orphans exist, surface them by ID and block entry into the flow
4. User resolves by either: `/issues sync` on each orphan (conscious linking), or removing/archiving them
5. Once all milestones are linked (or none exist), the flow proceeds normally

**Scope:** Small — a guard check at the top of smart entry and auto entry. The scanning and map-loading utilities already exist.

**Design questions:**
- Should completed milestones (SUMMARY.md exists) be treated differently? They might be done but never tracked — blocking on those feels heavy.
- Should there be a "skip these milestones" option that marks them as intentionally untracked, rather than requiring sync or deletion?
