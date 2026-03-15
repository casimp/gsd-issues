# README & max_slices_per_milestone — Work Needed

## Problem

The README was rewritten during M002 completion but has two issues:

1. **`max_slices_per_milestone` is not implemented.** This was repeatedly stated as a core constraint — milestones are bounded to N slices to keep them reviewable. The config doesn't have this field, the extension doesn't communicate it to GSD during planning, and nothing enforces it. This is a feature gap, not a docs gap.

2. **The workflow diagram doesn't reflect the sizing constraint.** The diagram currently shows "GSD plans milestones" but doesn't show that the planning is bounded by a max slices config owned by gsd-issues. It also references "right-sized chunks with a bounded number of slices" in the opening paragraph without that being real.

## What needs to happen

### Config & enforcement
- Add `max_slices_per_milestone` field to the config schema in `lib/config.ts`
- Add it to the `/issues setup` wizard
- Determine how gsd-issues communicates this constraint to GSD during planning (likely via the sync tool or an event)
- Determine whether gsd-issues enforces the constraint or just advises GSD

### README
- Update the diagram to show the sizing constraint as intrinsic to the planning step
- The diagram should have two planning entry points (new work, existing issues) converging, then one downstream pipeline (sync → work → PR → merge → close)
- The prose below the diagram should explain both flows clearly
- Don't document anything that isn't implemented

### Current diagram state
The diagram that was last agreed on structurally (two planning lanes in, single pipeline out) is the right shape. It just can't reference `max_slices_per_milestone` until that's built.
