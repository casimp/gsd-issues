---
id: T04
parent: S01
milestone: M005
provides:
  - README documents /issues as continuous prompted flow (scope → prompted sync → work → prompted PR)
  - /issues auto described as auto-confirmed variant of the same lifecycle
  - Individual commands (/issues sync, /issues pr, etc.) framed as standalone escape hatches
key_files:
  - README.md
key_decisions:
  - Renamed "Manual workflow" to "Prompted workflow (default)" and "Auto workflow" stays; added "Standalone commands" section for escape hatches
  - Updated mermaid diagram for prompted flow to show prompt nodes at ROADMAP.md and SUMMARY.md creation points
patterns_established:
  - README workflow sections mirror the two runtime paths: prompted (default) and auto (hooks)
observability_surfaces:
  - none — documentation-only task
duration: 8m
verification_result: passed
completed_at: 2026-03-14
blocker_discovered: false
---

# T04: Update README for continuous flow

**Updated README to document `/issues` as a continuous prompted flow, `/issues auto` as the auto-confirmed variant, and individual commands as standalone escape hatches.**

## What Happened

Rewrote the "How It Works" section of README.md to reflect the prompted flow added in T01–T03:

1. **Intro** — Three entry points now: "Start fresh" (with prompted lifecycle), "Start from existing issues", and "Full auto" (no prompts). Removed "Resume" as a separate entry point since `/issues auto` now covers it.
2. **Prompted workflow (default)** — Replaced "Manual workflow" with a continuous flow description: `/issues` → scope → prompted sync → work → prompted PR. Added note about once-per-milestone dedup. Updated mermaid diagram to show prompt nodes.
3. **Auto workflow** — Repositioned as "same lifecycle with auto-confirmations — no prompts, no pauses". Content unchanged since it was already accurate.
4. **Standalone commands** — New section listing `/issues sync`, `/issues pr`, `/issues close`, `/issues import` as escape hatches for one-off use.
5. **Commands table** — Updated `/issues` description to "continuous flow: scope → prompted sync → work → prompted PR" and `/issues auto` to "Same lifecycle as `/issues` but with auto-confirmations". Added "(standalone)" markers to sync/pr entries.

## Verification

- `npx vitest run` — all 330 tests pass
- `npx tsc --noEmit` — no type errors
- Visual inspection: README accurately describes the prompted flow, auto flow, and standalone commands
- `grep "continuous" README.md` — present in commands table and standalone section
- No stale references to `/issues` stopping after scoping

### Slice-level verification (final task — all must pass)
- ✅ `npx vitest run src/commands/__tests__/issues.test.ts` — 35 tests pass (includes 6 prompted-flow tests)
- ✅ `npx vitest run` — all 330 tests pass
- ✅ `npx tsc --noEmit` — no type errors

## Diagnostics

None — documentation-only task.

## Deviations

None.

## Known Issues

None.

## Files Created/Modified

- `README.md` — Rewrote workflow sections for continuous prompted flow, updated commands table
- `.gsd/milestones/M005/slices/S01/tasks/T04-PLAN.md` — Added missing Observability Impact section (pre-flight fix)
