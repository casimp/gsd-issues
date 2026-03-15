/**
 * Auto command handler — `/issues auto`.
 *
 * Starts the auto-flow orchestration for a milestone.
 * Validates config, resolves the milestone, stashes the command context
 * for reuse in `agent_end`, and calls `startAuto()`.
 *
 * Diagnostics:
 * - Config/milestone errors surface via ctx.ui.notify
 * - Startup blocked by mutual exclusion → notify with specific reason
 * - Stashed context available via getStashedContext() for agent_end handler
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig, type Config } from "../lib/config.js";
import { readGSDState } from "../lib/state.js";
import { validateMilestoneSize } from "../lib/sizing.js";
import {
  startAuto,
  type AutoDeps,
} from "../lib/auto.js";
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";

// ── Stashed context for agent_end reuse ──

interface StashedContext {
  ctx: ExtensionCommandContext;
  pi: ExtensionAPI;
}

let _stashedContext: StashedContext | null = null;

/**
 * Get the stashed command context. Returns null when auto hasn't been started
 * or after it has been cleared.
 */
export function getStashedContext(): StashedContext | null {
  return _stashedContext;
}

/**
 * Clear the stashed context. Called when auto-flow completes or is stopped.
 */
export function clearStashedContext(): void {
  _stashedContext = null;
}

// Exported for testing
export function _setStashedContext(ctx: StashedContext | null): void {
  _stashedContext = ctx;
}

// ── Milestone resolution ──

/**
 * Parse milestone ID from args string.
 * Supports: "auto M001", "auto --milestone M001", "auto --milestone=M001"
 */
function parseMilestoneId(args: string): string | undefined {
  const parts = args.trim().split(/\s+/);
  const rest = parts.slice(1); // skip "auto"

  for (let i = 0; i < rest.length; i++) {
    const part = rest[i];
    if (part === "--milestone" && i + 1 < rest.length) {
      return rest[i + 1];
    }
    if (part.startsWith("--milestone=")) {
      return part.slice("--milestone=".length);
    }
    // First positional arg that isn't a flag
    if (!part.startsWith("--")) {
      return part;
    }
  }

  return undefined;
}

// ── AutoDeps construction ──

/**
 * Build a real AutoDeps from pi APIs and command context.
 */
export function buildAutoDeps(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): AutoDeps {
  return {
    sendMessage: pi.sendMessage.bind(pi),
    newSession: () => ctx.newSession(),
    waitForIdle: () => ctx.waitForIdle(),
    validateMilestoneSize,
    loadConfig,
    emit: pi.events.emit.bind(pi.events),
    readFile: readFileSync,
    writeFile: writeFileSync,
    existsSync,
    unlinkSync,
    cwd: process.cwd(),
  };
}

// ── Command handler ──

/**
 * Handle `/issues auto` — start auto-flow orchestration for a milestone.
 */
export async function handleAuto(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  // Guard: requires UI
  if (!ctx.hasUI) {
    ctx.ui.notify("Auto-flow requires an interactive session.", "error");
    return;
  }

  const cwd = process.cwd();

  // Load config
  let config: Config;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(msg, "error");
    return;
  }

  // Resolve milestone: from args, config, or GSD state
  let milestoneId = parseMilestoneId(args);
  if (!milestoneId) {
    milestoneId = config.milestone;
  }
  if (!milestoneId) {
    const state = await readGSDState(cwd);
    if (!state) {
      ctx.ui.notify(
        "Cannot determine milestone — provide milestone ID, set it in config, or have an active GSD state.",
        "error",
      );
      return;
    }
    milestoneId = state.milestoneId;
  }

  // Stash context for agent_end handler reuse
  _stashedContext = { ctx, pi };

  // Build deps and start
  const deps = buildAutoDeps(ctx, pi);

  const error = await startAuto(milestoneId, deps);
  if (error) {
    _stashedContext = null;
    ctx.ui.notify(error, "error");
    return;
  }

  ctx.ui.notify(`Auto-flow started for milestone ${milestoneId}.`, "info");
}
