---
estimated_steps: 4
estimated_files: 1
---

# T04: Update README for continuous flow

**Slice:** S01 — Prompted flow in agent_end with confirmation messages
**Milestone:** M005

## Description

Update the README to document `/issues` as a continuous prompted flow rather than just a scoping entry point. Position `/issues auto` as the auto-confirmed variant. Position individual commands as escape hatches.

## Steps

1. Read the current README to find the workflow/usage section
2. Update the description of `/issues` to explain the continuous flow: scope → prompted sync → work → prompted PR
3. Update `/issues auto` description to clarify it's the same flow with auto-confirmations (no prompts)
4. Ensure `/issues sync`, `/issues pr`, etc. are described as standalone commands for one-off use

## Must-Haves

- [ ] README describes the continuous prompted flow as the primary path for `/issues`
- [ ] `/issues auto` described as auto-confirmed variant
- [ ] Individual commands described as escape hatches
- [ ] No stale references to `/issues` stopping after scoping

## Verification

- Visual inspection of README
- `npx vitest run` — sanity check that nothing broke

## Inputs

- `README.md` — current content

## Observability Impact

- No runtime signals change — this is a documentation-only task
- Future agents inspect the README to understand `/issues` vs `/issues auto` flow differences
- If the README is stale (e.g., describes `/issues` as scope-only), agents may skip prompted-flow features or misadvise users

## Expected Output

- `README.md` — updated workflow section describing continuous flow
