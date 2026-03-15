/**
 * Close command handler — `/issues close`.
 *
 * Parses milestone ID from positional arg or --milestone flag,
 * resolves milestone from config or GSD state if not provided,
 * calls closeMilestoneIssue(), reports result via ctx.ui.notify.
 *
 * Diagnostics:
 * - Missing milestone arg → uses config/state milestone
 * - Close result reported via notify (info/error)
 * - Config/provider errors surface with actionable messages
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig } from "../lib/config.js";
import { readGSDState, findRoadmapPath } from "../lib/state.js";
import { closeMilestoneIssue } from "../lib/close.js";
import { createProvider } from "../lib/provider-factory.js";
import { join, dirname } from "node:path";

/**
 * Parse milestone ID from args string.
 * Supports: "close M001", "close --milestone M001", "close --milestone=M001"
 */
function parseMilestoneId(args: string): string | undefined {
  const parts = args.trim().split(/\s+/);
  // Skip the subcommand itself ("close")
  const rest = parts.slice(1);

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

/**
 * Handle `/issues close` — close a mapped issue by milestone ID.
 */
export async function handleClose(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = process.cwd();

  // Load config
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(cwd);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(msg, "error");
    return;
  }

  // Resolve milestone: from arg, config, or GSD state
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

  // Build paths and provider
  const roadmapPath = findRoadmapPath(cwd, milestoneId);
  const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
  const provider = createProvider(config, pi.exec);

  try {
    const result = await closeMilestoneIssue({
      provider,
      config,
      mapPath,
      milestoneId,
      emit: pi.events.emit.bind(pi.events),
    });

    if (!result.closed) {
      ctx.ui.notify(
        `No issue mapping found for milestone "${milestoneId}". Nothing to close.`,
        "info",
      );
      return;
    }

    ctx.ui.notify(
      `Closed issue #${result.issueId} (${result.url}) for milestone ${milestoneId}.`,
      "info",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to close issue for ${milestoneId}: ${msg}`, "error");
  }
}
