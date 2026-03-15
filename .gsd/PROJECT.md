# Project

## What This Is

`gsd-issues` is a pi extension that bridges GSD's slice lifecycle with remote issue trackers (GitHub and GitLab). It replaces four ad-hoc GSD skills (`gitlab-sync`, `gitlab-import`, `gitlab-close`, `gitlab-setup`) with a proper TypeScript extension using pi's extension API for deterministic execution, lifecycle hooks, slash commands, and npm distribution.

Three core workflows: sync (roadmap milestones → remote issues), import (remote issues → LLM planning input with re-scope), close (PR-driven via `Closes #N`, manual fallback), and PR creation.

## Core Value

When a GSD milestone completes, a PR/MR is created with `Closes #N` so the issue auto-closes on merge. When a roadmap is created, the user is prompted to create a matching milestone issue. Import supports re-scoping existing issues into milestone-level issues. The extension handles the plumbing so the agent never needs to interpret bash snippets from skill files.

## Current State

M001 (Issue Tracker Integration) complete — built the foundation: provider abstraction, config system, CLI wrappers, sync/close/import. M002 (Milestone-Level Issue Tracking and PR Workflow) complete — all 3 slices delivered. S01 extended IssueProvider with `createPR()` on both providers, added `readIntegrationBranch()`, established milestone-keyed ISSUE-MAP convention. S02 rewrote sync/close from per-slice to per-milestone, built PR creation pipeline with `Closes #N`, removed tool_result auto-close hook. S03 added re-scope flow (`rescopeIssues()` creates milestone issue and closes originals best-effort), extracted `createProvider()` to shared module, cleaned up stale JSDoc. 242 tests, 15 files.

## Architecture / Key Patterns

- **Extension entry point:** `index.ts` exports a default function receiving `ExtensionAPI`
- **Provider abstraction:** `IssueProvider` interface with GitLab (`glab` CLI) and GitHub (`gh` CLI) implementations, auto-detected from git remote
- **ExecFn injection:** All CLI-calling modules accept an optional exec function — tests supply mocks, runtime passes `pi.exec`
- **Config:** Unified `.gsd/issues.json` with provider-specific sections, interactive setup via `/issues setup`
- **Mapping:** `ISSUE-MAP.json` per milestone in `.gsd/milestones/{MID}/`, crash-safe writes (save after each creation), localId holds milestone ID
- **Close model:** PR-driven via `Closes #N` in PR body (platform auto-close on merge). Manual `/issues close` as fallback. No lifecycle hooks.
- **Event bus:** Emits `gsd-issues:sync-complete`, `gsd-issues:close-complete`, `gsd-issues:pr-complete`, `gsd-issues:import-complete` on `pi.events`
- **Tools:** Four LLM-callable tools registered via `pi.registerTool()` with TypeBox schemas (sync, close, import, pr)
- **Distribution:** npm package with pi manifest, installed via pi's package manager

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Issue tracker integration — Provider abstraction, config, CLI wrappers (foundation)
- [x] M002: Milestone-level issue tracking and PR workflow — One issue per milestone, PR on completion, close on merge
