/**
 * Auto-flow orchestration state machine for `/issues auto`.
 *
 * Drives the full milestone lifecycle — import, plan, size-check, split,
 * sync, execute, PR — using pi.sendMessage and ctx.newSession, with
 * mutual exclusion against GSD auto-mode.
 *
 * Diagnostics:
 * - `gsd-issues:auto-phase` event emitted on each phase transition
 * - `.gsd/issues-auto.json` tracks current phase, milestone, timestamp
 * - `.gsd/issues-auto.lock` tracks PID and phase for crash detection
 * - Split retry count tracked in state for caller inspection
 */

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "./config.js";
import type { SizingResult } from "./sizing.js";

// ── Types ──

export type AutoPhase =
  | "import"
  | "plan"
  | "validate-size"
  | "split"
  | "sync"
  | "execute"
  | "pr"
  | "done";

export interface AutoState {
  phase: AutoPhase;
  milestoneId: string;
  splitAttempts: number;
  startedAt: string;
}

/**
 * Injected dependencies for the orchestration state machine.
 * All external I/O is injected so the module is fully testable with mocks.
 */
export interface AutoDeps {
  /** Send a custom message to the pi session. */
  sendMessage(
    message: { customType: string; content: string | string[]; display?: boolean },
    options?: { triggerTurn?: boolean },
  ): void;
  /** Start a fresh pi session. Returns { cancelled: true } if the user aborted. */
  newSession(): Promise<{ cancelled: boolean }>;
  /** Wait for the agent to finish streaming. */
  waitForIdle(): Promise<void>;
  /** Validate whether a milestone's slice count is within limits. */
  validateMilestoneSize(cwd: string, milestoneId: string, config: Config): Promise<SizingResult>;
  /** Load the issues config from disk. */
  loadConfig(cwd: string): Promise<Config>;
  /** Emit an event (e.g. gsd-issues:auto-phase). */
  emit(event: string, payload: unknown): void;
  /** File I/O — read file contents. */
  readFile(path: string, encoding: "utf-8"): string;
  /** File I/O — write file contents. */
  writeFile(path: string, data: string, encoding: "utf-8"): void;
  /** File I/O — check if a file exists. */
  existsSync(path: string): boolean;
  /** File I/O — delete a file. */
  unlinkSync(path: string): void;
  /** Current working directory. */
  cwd: string;
}

// ── Lock file paths ──

const OWN_LOCK_FILE = "issues-auto.lock";
const GSD_LOCK_FILE = "auto.lock";
const STATE_FILE = "issues-auto.json";

interface LockData {
  pid: number;
  phase: AutoPhase;
  milestoneId: string;
  timestamp: string;
}

// ── Lock file helpers ──

/**
 * Write the issues-auto lock file with PID, phase, milestoneId, and timestamp.
 */
export function writeAutoLock(cwd: string, phase: AutoPhase, milestoneId: string): void {
  const data: LockData = {
    pid: process.pid,
    phase,
    milestoneId,
    timestamp: new Date().toISOString(),
  };
  const lockPath = join(cwd, ".gsd", OWN_LOCK_FILE);
  writeFileSync(lockPath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Read the issues-auto lock file. Returns null if it doesn't exist or is corrupt.
 */
export function readAutoLock(cwd: string): LockData | null {
  const lockPath = join(cwd, ".gsd", OWN_LOCK_FILE);
  try {
    if (!existsSync(lockPath)) return null;
    const raw = readFileSync(lockPath, "utf-8");
    return JSON.parse(raw) as LockData;
  } catch {
    return null;
  }
}

/**
 * Remove the issues-auto lock file.
 */
export function clearAutoLock(cwd: string): void {
  const lockPath = join(cwd, ".gsd", OWN_LOCK_FILE);
  try {
    if (existsSync(lockPath)) unlinkSync(lockPath);
  } catch { /* non-fatal */ }
}

/**
 * Check whether GSD auto-mode is active by reading `.gsd/auto.lock`
 * and verifying the PID is alive. Uses the same `process.kill(pid, 0)`
 * pattern from crash-recovery.ts.
 */
export function isGSDAutoActive(cwd: string): boolean {
  const lockPath = join(cwd, ".gsd", GSD_LOCK_FILE);
  try {
    if (!existsSync(lockPath)) return false;
    const raw = readFileSync(lockPath, "utf-8");
    const data = JSON.parse(raw) as { pid: number };
    const pid = data.pid;
    if (!Number.isInteger(pid) || pid <= 0) return false;
    if (pid === process.pid) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (err) {
      // EPERM = process exists but no permission → alive
      // ESRCH = process does not exist → dead (stale lock)
      if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
      return false;
    }
  } catch {
    return false;
  }
}

// ── State persistence ──

/**
 * Write the auto state to `.gsd/issues-auto.json`.
 */
export function writeAutoState(cwd: string, state: AutoState): void {
  const statePath = join(cwd, ".gsd", STATE_FILE);
  writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
}

/**
 * Read auto state from `.gsd/issues-auto.json`. Returns null if missing or corrupt.
 */
export function readAutoState(cwd: string): AutoState | null {
  const statePath = join(cwd, ".gsd", STATE_FILE);
  try {
    if (!existsSync(statePath)) return null;
    const raw = readFileSync(statePath, "utf-8");
    return JSON.parse(raw) as AutoState;
  } catch {
    return null;
  }
}

// ── Phase prompt builders ──

function buildImportPrompt(milestoneId: string): string {
  return [
    `You are running the auto-flow for milestone ${milestoneId}.`,
    "",
    "**Phase: IMPORT**",
    "",
    "Import issues from the remote provider and assess the scope for this milestone.",
    "Use the gsd_issues_import tool to fetch open issues.",
    "Summarize what you find — issue count, key themes, and scope assessment.",
  ].join("\n");
}

function buildPlanPrompt(milestoneId: string, maxSlices?: number): string {
  const sliceConstraint = maxSlices !== undefined
    ? `Keep the plan to at most ${maxSlices} slices.`
    : "Break the milestone into demoable vertical slices.";
  return [
    `You are running the auto-flow for milestone ${milestoneId}.`,
    "",
    "**Phase: PLAN**",
    "",
    `Plan the milestone roadmap. ${sliceConstraint}`,
    "Each slice should be a demoable vertical increment ordered by risk.",
    "Write the roadmap to the milestone's ROADMAP.md file.",
  ].join("\n");
}

function buildSplitPrompt(milestoneId: string, roadmapContent: string, maxSlices: number): string {
  return [
    `You are running the auto-flow for milestone ${milestoneId}.`,
    "",
    "**Phase: SPLIT**",
    "",
    `The milestone has too many slices. The limit is ${maxSlices}.`,
    "Restructure the roadmap to consolidate slices while preserving all essential work.",
    "",
    "Current roadmap:",
    "```",
    roadmapContent,
    "```",
    "",
    `Rewrite the roadmap with at most ${maxSlices} slices.`,
  ].join("\n");
}

function buildSyncPrompt(milestoneId: string): string {
  return [
    `You are running the auto-flow for milestone ${milestoneId}.`,
    "",
    "**Phase: SYNC**",
    "",
    "Sync the milestone to a remote issue.",
    "Use the gsd_issues_sync tool to create or update the remote issue.",
  ].join("\n");
}

function buildExecutePrompt(milestoneId: string): string {
  return [
    `You are running the auto-flow for milestone ${milestoneId}.`,
    "",
    "**Phase: EXECUTE**",
    "",
    "Execute the next pending task in the current slice.",
    "Follow the task plan, implement the changes, run tests, and write the task summary.",
  ].join("\n");
}

function buildPrPrompt(milestoneId: string): string {
  return [
    `You are running the auto-flow for milestone ${milestoneId}.`,
    "",
    "**Phase: PR**",
    "",
    "Create a pull request for the completed milestone.",
    "Use the gsd_issues_pr tool to push the branch and create the PR.",
  ].join("\n");
}

function buildDonePrompt(milestoneId: string): string {
  return [
    `Auto-flow for milestone ${milestoneId} is complete.`,
    "",
    "All phases have finished successfully.",
  ].join("\n");
}

// Exported for testing
export const _prompts = {
  import: buildImportPrompt,
  plan: buildPlanPrompt,
  split: buildSplitPrompt,
  sync: buildSyncPrompt,
  execute: buildExecutePrompt,
  pr: buildPrPrompt,
  done: buildDonePrompt,
};

// ── Phase ordering ──

const PHASE_ORDER: AutoPhase[] = [
  "import",
  "plan",
  "validate-size",
  "sync",
  "execute",
  "pr",
  "done",
];

function nextPhase(current: AutoPhase): AutoPhase {
  const idx = PHASE_ORDER.indexOf(current);
  if (idx === -1 || idx >= PHASE_ORDER.length - 1) return "done";
  return PHASE_ORDER[idx + 1];
}

// ── Concurrent dispatch guard ──

let _handlingAdvance = false;

// Exported for testing
export function _getHandlingAdvance(): boolean {
  return _handlingAdvance;
}

export function _resetHandlingAdvance(): void {
  _handlingAdvance = false;
}

// ── Core orchestration ──

const MAX_SPLIT_ATTEMPTS = 3;

/**
 * Start the auto-flow for a milestone.
 *
 * Checks mutual exclusion (GSD auto.lock + own lock), writes the lock file,
 * initializes state at "import" phase, creates a new session, and sends the
 * first phase prompt.
 *
 * Returns an error message string if startup is blocked, or null on success.
 */
export async function startAuto(
  milestoneId: string,
  deps: AutoDeps,
): Promise<string | null> {
  const cwd = deps.cwd;

  // Mutual exclusion: GSD auto-mode running?
  if (isGSDAutoActive(cwd)) {
    return "Another auto-mode session (GSD) is already running. Stop it before starting issues auto.";
  }

  // Mutual exclusion: own lock exists with live PID?
  const existingLock = readAutoLock(cwd);
  if (existingLock) {
    const pid = existingLock.pid;
    if (pid !== process.pid && Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        return `Issues auto-flow is already running (PID ${pid}). Stop it before starting a new session.`;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "EPERM") {
          return `Issues auto-flow is already running (PID ${pid}). Stop it before starting a new session.`;
        }
        // Dead process — stale lock, clear and proceed
        clearAutoLock(cwd);
      }
    } else {
      // Own PID or invalid — stale lock, clear
      clearAutoLock(cwd);
    }
  }

  // Write lock and initial state
  const phase: AutoPhase = "import";
  writeAutoLock(cwd, phase, milestoneId);

  const state: AutoState = {
    phase,
    milestoneId,
    splitAttempts: 0,
    startedAt: new Date().toISOString(),
  };
  writeAutoState(cwd, state);

  // Emit phase event
  deps.emit("gsd-issues:auto-phase", { phase, milestoneId });

  // Create a new session
  const result = await deps.newSession();
  if (result.cancelled) {
    clearAutoLock(cwd);
    writeAutoState(cwd, { ...state, phase: "done" });
    return "Auto-flow cancelled by user.";
  }

  // Send import phase prompt
  deps.sendMessage(
    { customType: "gsd-issues-auto", content: buildImportPrompt(milestoneId) },
    { triggerTurn: true },
  );

  return null;
}

/**
 * Advance to the next phase. Called from the agent_end handler.
 *
 * Includes a concurrent-dispatch guard and a 500ms settle delay.
 * For validate-size: runs validation directly (no LLM turn).
 * For split: retries up to MAX_SPLIT_ATTEMPTS in strict mode, then errors.
 * On "done": clears lock and state files.
 */
export async function advancePhase(deps: AutoDeps): Promise<void> {
  // Concurrent dispatch guard
  if (_handlingAdvance) return;
  _handlingAdvance = true;

  try {
    // 500ms settle delay
    await new Promise<void>((r) => setTimeout(r, 500));

    // Read current state
    const state = readAutoState(deps.cwd);
    if (!state) {
      return;
    }

    const next = nextPhase(state.phase);

    // Handle validate-size internally (no LLM turn)
    if (next === "validate-size") {
      const config = await deps.loadConfig(deps.cwd);
      let sizingResult: SizingResult;
      try {
        sizingResult = await deps.validateMilestoneSize(deps.cwd, state.milestoneId, config);
      } catch {
        // Can't validate (e.g. no roadmap yet) — proceed to sync
        const updatedState: AutoState = { ...state, phase: "sync" };
        writeAutoState(deps.cwd, updatedState);
        writeAutoLock(deps.cwd, "sync", state.milestoneId);
        deps.emit("gsd-issues:auto-phase", { phase: "sync", milestoneId: state.milestoneId });

        const sessionResult = await deps.newSession();
        if (sessionResult.cancelled) {
          await stopAuto(deps);
          return;
        }
        deps.sendMessage(
          { customType: "gsd-issues-auto", content: buildSyncPrompt(state.milestoneId) },
          { triggerTurn: true },
        );
        return;
      }

      if (sizingResult.valid) {
        // Size is OK — advance to sync
        const updatedState: AutoState = { ...state, phase: "sync" };
        writeAutoState(deps.cwd, updatedState);
        writeAutoLock(deps.cwd, "sync", state.milestoneId);
        deps.emit("gsd-issues:auto-phase", { phase: "sync", milestoneId: state.milestoneId });

        const sessionResult = await deps.newSession();
        if (sessionResult.cancelled) {
          await stopAuto(deps);
          return;
        }
        deps.sendMessage(
          { customType: "gsd-issues-auto", content: buildSyncPrompt(state.milestoneId) },
          { triggerTurn: true },
        );
      } else {
        // Oversized
        if (sizingResult.mode === "strict") {
          const attempts = state.splitAttempts + 1;
          if (attempts >= MAX_SPLIT_ATTEMPTS) {
            deps.emit("gsd-issues:auto-phase", { phase: "done", milestoneId: state.milestoneId, error: "max split attempts exceeded" });
            await stopAuto(deps);
            throw new Error(
              `Milestone ${state.milestoneId} exceeds ${sizingResult.limit} slices after ${MAX_SPLIT_ATTEMPTS} split attempts. Auto-flow stopped.`,
            );
          }
          // Go to split phase
          const updatedState: AutoState = { ...state, phase: "split", splitAttempts: attempts };
          writeAutoState(deps.cwd, updatedState);
          writeAutoLock(deps.cwd, "split", state.milestoneId);
          deps.emit("gsd-issues:auto-phase", { phase: "split", milestoneId: state.milestoneId });

          const sessionResult = await deps.newSession();
          if (sessionResult.cancelled) {
            await stopAuto(deps);
            return;
          }

          // Read roadmap for split prompt
          let roadmapContent = "";
          try {
            const roadmapPath = join(deps.cwd, ".gsd", "milestones", state.milestoneId, `${state.milestoneId}-ROADMAP.md`);
            roadmapContent = deps.readFile(roadmapPath, "utf-8");
          } catch { /* use empty */ }

          deps.sendMessage(
            { customType: "gsd-issues-auto", content: buildSplitPrompt(state.milestoneId, roadmapContent, sizingResult.limit!) },
            { triggerTurn: true },
          );
        } else {
          // best_try mode — warn and proceed to sync
          deps.emit("gsd-issues:auto-phase", {
            phase: "sync",
            milestoneId: state.milestoneId,
            warning: `Milestone has ${sizingResult.sliceCount} slices (limit: ${sizingResult.limit}), proceeding in best_try mode.`,
          });

          const updatedState: AutoState = { ...state, phase: "sync" };
          writeAutoState(deps.cwd, updatedState);
          writeAutoLock(deps.cwd, "sync", state.milestoneId);

          const sessionResult = await deps.newSession();
          if (sessionResult.cancelled) {
            await stopAuto(deps);
            return;
          }
          deps.sendMessage(
            { customType: "gsd-issues-auto", content: buildSyncPrompt(state.milestoneId) },
            { triggerTurn: true },
          );
        }
      }
      return;
    }

    // Handle split → validate-size loop (split phase just finished, re-validate)
    if (state.phase === "split") {
      // After split, go back to validate-size
      const updatedState: AutoState = { ...state, phase: "plan" };
      writeAutoState(deps.cwd, updatedState);
      writeAutoLock(deps.cwd, "plan", state.milestoneId);
      deps.emit("gsd-issues:auto-phase", { phase: "validate-size", milestoneId: state.milestoneId });
      // Re-enter advancePhase to handle validate-size
      _handlingAdvance = false;
      await advancePhase(deps);
      return;
    }

    // Handle done phase
    if (next === "done") {
      deps.emit("gsd-issues:auto-phase", { phase: "done", milestoneId: state.milestoneId });
      await stopAuto(deps);
      return;
    }

    // All other LLM phases
    const updatedState: AutoState = { ...state, phase: next };
    writeAutoState(deps.cwd, updatedState);
    writeAutoLock(deps.cwd, next, state.milestoneId);
    deps.emit("gsd-issues:auto-phase", { phase: next, milestoneId: state.milestoneId });

    const sessionResult = await deps.newSession();
    if (sessionResult.cancelled) {
      await stopAuto(deps);
      return;
    }

    // Build and send prompt for the phase
    let prompt: string;
    switch (next) {
      case "plan": {
        const config = await deps.loadConfig(deps.cwd);
        prompt = buildPlanPrompt(state.milestoneId, config.max_slices_per_milestone);
        break;
      }
      case "sync":
        prompt = buildSyncPrompt(state.milestoneId);
        break;
      case "execute":
        prompt = buildExecutePrompt(state.milestoneId);
        break;
      case "pr":
        prompt = buildPrPrompt(state.milestoneId);
        break;
      default:
        prompt = buildDonePrompt(state.milestoneId);
        break;
    }

    deps.sendMessage(
      { customType: "gsd-issues-auto", content: prompt },
      { triggerTurn: true },
    );
  } finally {
    _handlingAdvance = false;
  }
}

/**
 * Stop the auto-flow. Clears lock file, state file, and resets the
 * concurrent-dispatch guard.
 */
export async function stopAuto(deps: AutoDeps): Promise<void> {
  clearAutoLock(deps.cwd);
  const statePath = join(deps.cwd, ".gsd", STATE_FILE);
  try {
    if (existsSync(statePath)) unlinkSync(statePath);
  } catch { /* non-fatal */ }
  _handlingAdvance = false;
}

/**
 * Check whether issues auto-flow is active by reading the lock file
 * and verifying the PID.
 */
export function isAutoActive(cwd: string): boolean {
  const lock = readAutoLock(cwd);
  if (!lock) return false;
  const pid = lock.pid;
  if (pid === process.pid) return true;
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EPERM") return true;
    return false;
  }
}
