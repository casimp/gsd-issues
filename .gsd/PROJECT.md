# Project

## What This Is

`gsd-issues` is a pi extension that bridges GSD's milestone lifecycle with remote issue trackers (GitHub and GitLab). It replaces four ad-hoc GSD skills (`gitlab-sync`, `gitlab-import`, `gitlab-close`, `gitlab-setup`) with a proper TypeScript extension using pi's extension API for deterministic execution, slash commands, LLM-callable tools, and npm distribution.

Four core workflows: sync (milestones → remote issues), import (remote issues → LLM planning input with re-scope), PR creation (milestone branch → target with `Closes #N`), and close (PR-driven on merge, manual fallback).

## Core Value

When a GSD milestone is planned, the user is prompted to create a matching issue on the tracker. When the milestone completes, a PR/MR is created with `Closes #N` so the issue auto-closes on merge. Import supports re-scoping existing issues into milestone-level issues. The extension handles the plumbing so the agent never needs to interpret bash snippets from skill files.

## Current State

M001 (Issue Tracker Integration), M002 (Milestone-Level Issue Tracking and PR Workflow), and M003 (Milestone Sizing and Auto-Flow Orchestration) are code-complete with 309 tests. However, M003 has a critical design gap: the entire auto-flow and all manual commands require a pre-existing milestone ID. Users don't think in milestones — they have work to do (existing tracker issues or greenfield). The extension should create right-sized milestones from the user's work, not require them as input. M004 fixes this.

## Architecture / Key Patterns

- **Extension entry point:** `index.ts` exports a default function receiving `ExtensionAPI`
- **Provider abstraction:** `IssueProvider` interface with GitLab (`glab` CLI) and GitHub (`gh` CLI) implementations, auto-detected from git remote
- **Provider factory:** `createProvider()` in `lib/provider-factory.ts` — single source of truth for provider instantiation
- **ExecFn injection:** All CLI-calling modules accept an optional exec function — tests supply mocks, runtime passes `pi.exec`
- **Config:** Unified `.gsd/issues.json` with provider-specific sections, interactive setup via `/issues setup`
- **Mapping:** `ISSUE-MAP.json` per milestone in `.gsd/milestones/{MID}/`, crash-safe writes (save after each creation), localId holds milestone ID
- **Close model:** PR-driven via `Closes #N` in PR body (platform auto-close on merge). Manual `/issues close` as fallback. No lifecycle hooks.
- **Event bus:** Emits `gsd-issues:sync-complete`, `gsd-issues:close-complete`, `gsd-issues:pr-complete`, `gsd-issues:rescope-complete`, `gsd-issues:import-complete` on `pi.events`
- **Tools:** Five LLM-callable tools registered via `pi.registerTool()` with TypeBox schemas (sync, close, import, pr, auto)
- **Commands:** `/issues` with subcommands: setup, sync, import, close, pr, auto, status (status stubbed)
- **Auto-flow:** Phase-based state machine (`import → plan → validate-size → [split] → sync → execute → pr → done`) with injected deps, mutual exclusion via lock files, crash recovery via PID checks
- **Distribution:** npm package with pi manifest, installed via pi's package manager

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Issue tracker integration — Provider abstraction, config, CLI wrappers (foundation)
- [x] M002: Milestone-level issue tracking and PR workflow — One issue per milestone, PR on completion, close on merge, import re-scope
- [x] M003: Milestone sizing and auto-flow orchestration — Sizing config, validation, orchestration state machine (has design gap: requires pre-existing milestone IDs)
- [ ] M004: User-facing workflow — Start from work, not milestones. Add scoping phase, remove milestone ID requirement.
