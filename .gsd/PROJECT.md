# Project

## What This Is

`gsd-issues` is a pi extension that bridges GSD's milestone lifecycle with remote issue trackers (GitHub and GitLab). It replaces four ad-hoc GSD skills (`gitlab-sync`, `gitlab-import`, `gitlab-close`, `gitlab-setup`) with a proper TypeScript extension using pi's extension API for deterministic execution, slash commands, LLM-callable tools, and npm distribution.

Four core workflows: sync (milestones → remote issues), import (remote issues → LLM planning input with re-scope), PR creation (milestone branch → target with `Closes #N`), and close (PR-driven on merge, manual fallback).

## Core Value

When a GSD milestone is planned, the user is prompted to create a matching issue on the tracker. When the milestone completes, a PR/MR is created with `Closes #N` so the issue auto-closes on merge. Import supports re-scoping existing issues into milestone-level issues. The extension handles the plumbing so the agent never needs to interpret bash snippets from skill files.

## Current State

M001 (Issue Tracker Integration), M002 (Milestone-Level Issue Tracking and PR Workflow), M003 (Milestone Sizing), M004 (Start From Work, Not Milestones), and M005 (Continuous Prompted Flow) are code-complete. The extension now supports the full lifecycle: `/issues` runs a continuous prompted flow — scope → prompted sync → work → prompted PR — with `pi.sendMessage()` confirmation prompts at each outward-facing action. `/issues auto` runs the same lifecycle with auto-confirmations (no prompts). Individual commands (`/issues sync`, `/issues pr`, etc.) work as standalone escape hatches. 330 tests pass across 18 test files. README documents the prompted flow as the primary path.

## Architecture / Key Patterns

- **Extension entry point:** `index.ts` exports a default function receiving `ExtensionAPI`
- **Provider abstraction:** `IssueProvider` interface with GitLab (`glab` CLI) and GitHub (`gh` CLI) implementations, auto-detected from git remote
- **Provider factory:** `createProvider()` in `lib/provider-factory.ts` — single source of truth for provider instantiation
- **ExecFn injection:** All CLI-calling modules accept an optional exec function — tests supply mocks, runtime passes `pi.exec`
- **Config:** Unified `.gsd/issues.json` with provider-specific sections, interactive setup via `/issues setup`
- **Mapping:** `ISSUE-MAP.json` per milestone in `.gsd/milestones/{MID}/`, crash-safe writes (save after each creation), localId holds milestone ID
- **Close model:** PR-driven via `Closes #N` in PR body (platform auto-close on merge). Manual `/issues close` as fallback. No lifecycle hooks.
- **Event bus:** Emits `gsd-issues:sync-complete`, `gsd-issues:close-complete`, `gsd-issues:pr-complete`, `gsd-issues:rescope-complete`, `gsd-issues:import-complete`, `gsd-issues:scope-complete`, `gsd-issues:auto-sync`, `gsd-issues:auto-pr` on `pi.events`
- **Tools:** Four LLM-callable tools registered via `pi.registerTool()` with TypeBox schemas (sync, close, import, pr)
- **Commands:** `/issues` with subcommands: setup, sync, import, close, pr, auto, scope, status (status stubbed). No-subcommand runs smart entry.
- **Smart entry:** `/issues` detects project state (active milestone → resume, existing milestones → offer resume or new, no milestones → scope). `/issues auto` chains scope → GSD auto-mode via `pi.sendMessage`.
- **Scope flow:** `buildScopePrompt()` constructs LLM instructions; `agent_end` handler detects new CONTEXT.md files via diffing; `gsd-issues:scope-complete` event emitted on completion.
- **Distribution:** npm package with pi manifest, installed via pi's package manager

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Issue tracker integration — Provider abstraction, config, CLI wrappers (foundation)
- [x] M002: Milestone-level issue tracking and PR workflow — One issue per milestone, PR on completion, close on merge, import re-scope
- [x] M003: Milestone sizing and auto-flow orchestration — Sizing config, validation, orchestration state machine (superseded by M004's hooks approach)
- [x] M004: Start from work, not milestones — Smart entry, scope phase, agent_end hooks for auto-sync/PR, no milestone ID requirement
- [x] M005: Continuous prompted flow — `/issues` walks through scope → prompted sync → work → prompted PR with confirmation at each step
