# Project

## What This Is

`gsd-issues` is a pi extension that bridges GSD's slice lifecycle with remote issue trackers (GitHub and GitLab). It replaces four ad-hoc GSD skills (`gitlab-sync`, `gitlab-import`, `gitlab-close`, `gitlab-setup`) with a proper TypeScript extension using pi's extension API for deterministic execution, lifecycle hooks, slash commands, and npm distribution.

Three core workflows: sync (roadmap slices → remote issues), import (remote issues → LLM planning input), and close (auto-close on slice completion).

## Core Value

When a GSD slice completes, the corresponding remote issue is automatically closed. When a roadmap is created, the user is prompted to create matching issues. The extension handles the plumbing so the agent never needs to interpret bash snippets from skill files.

## Current State

M001 (Issue Tracker Integration) is complete — all six slices delivered, 188 contract tests passing, typecheck clean. The extension is fully implemented with three core workflows (sync, close, import) working on both GitLab and GitHub through provider abstraction. Lifecycle hook auto-closes issues on slice completion. Slash commands, LLM-callable tools, and event bus emissions all wired. Package is npm-distributable with pi manifest and README.

All verification is contract-level (mock-based). UAT against real GitLab and GitHub repositories has not been performed.

## Architecture / Key Patterns

- **Extension entry point:** `index.ts` exports a default function receiving `ExtensionAPI`
- **Provider abstraction:** `IssueProvider` interface with GitLab (`glab` CLI) and GitHub (`gh` CLI) implementations, auto-detected from git remote
- **ExecFn injection:** All CLI-calling modules accept an optional exec function — tests supply mocks, runtime passes `pi.exec`
- **Config:** Unified `.gsd/issues.json` with provider-specific sections, interactive setup via `/issues setup`
- **Mapping:** `ISSUE-MAP.json` per milestone in `.gsd/milestones/{MID}/`, crash-safe writes (save after each creation)
- **Lifecycle hooks:** `pi.on("tool_result", ...)` watching for S##-SUMMARY.md writes to trigger auto-close
- **Event bus:** Emits `gsd-issues:sync-complete`, `gsd-issues:close-complete`, `gsd-issues:import-complete` on `pi.events`
- **Tools:** Three LLM-callable tools registered via `pi.registerTool()` with TypeBox schemas
- **Distribution:** npm package with pi manifest, installed via pi's package manager

## Capability Contract

See `.gsd/REQUIREMENTS.md` for the explicit capability contract, requirement status, and coverage mapping.

## Milestone Sequence

- [x] M001: Issue tracker integration — Sync, close, and import workflows for GitLab and GitHub with npm distribution
