/**
 * Close command handler — `/issues close`.
 *
 * Parses slice ID from positional arg or --slice flag,
 * resolves milestone from config or GSD state,
 * calls closeSliceIssue(), reports result via ctx.ui.notify.
 *
 * Diagnostics:
 * - Missing slice arg → notify("error") with usage hint
 * - Close result reported via notify (info/error)
 * - Config/provider errors surface with actionable messages
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig } from "../lib/config.js";
import { readGSDState, findRoadmapPath } from "../lib/state.js";
import { closeSliceIssue } from "../lib/close.js";
import { GitLabProvider } from "../providers/gitlab.js";
import { GitHubProvider } from "../providers/github.js";
import type { IssueProvider } from "../providers/types.js";
import { join, dirname } from "node:path";

function createProvider(config: Awaited<ReturnType<typeof loadConfig>>, exec: ExtensionAPI["exec"]): IssueProvider {
  if (config.provider === "gitlab") {
    return new GitLabProvider(exec, config.gitlab?.project_path);
  }
  return new GitHubProvider(exec, config.github?.repo);
}

/**
 * Parse slice ID from args string.
 * Supports: "close S01", "close --slice S01", "close --slice=S01"
 */
function parseSliceId(args: string): string | undefined {
  const parts = args.trim().split(/\s+/);
  // Skip the subcommand itself ("close")
  const rest = parts.slice(1);

  for (let i = 0; i < rest.length; i++) {
    const part = rest[i];
    if (part === "--slice" && i + 1 < rest.length) {
      return rest[i + 1];
    }
    if (part.startsWith("--slice=")) {
      return part.slice("--slice=".length);
    }
    // First positional arg that isn't a flag
    if (!part.startsWith("--")) {
      return part;
    }
  }

  return undefined;
}

/**
 * Handle `/issues close` — close a mapped issue by slice ID.
 */
export async function handleClose(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const sliceId = parseSliceId(args);
  if (!sliceId) {
    ctx.ui.notify(
      "Usage: /issues close <slice_id> — e.g. /issues close S01",
      "error",
    );
    return;
  }

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

  // Resolve milestone
  let milestoneId = config.milestone;
  if (!milestoneId) {
    const state = await readGSDState(cwd);
    if (!state) {
      ctx.ui.notify(
        "Cannot determine milestone — no milestone in config or GSD state.",
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
    const result = await closeSliceIssue({
      provider,
      config,
      mapPath,
      milestoneId,
      sliceId,
      emit: pi.events.emit.bind(pi.events),
    });

    if (!result.closed) {
      ctx.ui.notify(
        `No issue mapping found for slice "${sliceId}". Nothing to close.`,
        "info",
      );
      return;
    }

    ctx.ui.notify(
      `Closed issue #${result.issueId} (${result.url}) for slice ${sliceId}.`,
      "info",
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ctx.ui.notify(`Failed to close issue for ${sliceId}: ${msg}`, "error");
  }
}
