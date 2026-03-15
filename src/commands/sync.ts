/**
 * Sync command handler — `/issues sync`.
 *
 * Loads config, reads milestone context and roadmap,
 * previews the milestone issue to be created,
 * asks for confirmation, then creates the remote issue via the sync pipeline.
 *
 * Diagnostics:
 * - Preview shows milestone title before confirmation
 * - Results reported via ctx.ui.notify with created/skipped/error counts
 * - Config and roadmap errors surface as ui.notify("error")
 */

import type { ExtensionCommandContext, ExtensionAPI } from "../index.js";
import { loadConfig } from "../lib/config.js";
import { readGSDState, findRoadmapPath } from "../lib/state.js";
import { syncMilestoneToIssue } from "../lib/sync.js";
import { loadIssueMap } from "../lib/issue-map.js";
import { createProvider } from "../lib/provider-factory.js";
import { join, dirname } from "node:path";

/**
 * Handle `/issues sync` — interactive sync with confirmation.
 */
export async function handleSync(
  _args: string,
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

  // Resolve milestone from config or GSD state
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

  // Check if already mapped
  const roadmapPath = findRoadmapPath(cwd, milestoneId);
  const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
  const existingMap = await loadIssueMap(mapPath);
  const alreadyMapped = existingMap.some((e) => e.localId === milestoneId);

  if (alreadyMapped) {
    ctx.ui.notify(`Milestone ${milestoneId} is already mapped to an issue. Nothing to sync.`, "info");
    return;
  }

  // Show preview
  ctx.ui.notify(`Will create issue for milestone: ${milestoneId}`, "info");

  // Confirm
  const confirmed = await ctx.ui.confirm("Create milestone issue?");
  if (!confirmed) {
    ctx.ui.notify("Sync cancelled.", "info");
    return;
  }

  // Run sync
  const provider = createProvider(config, pi.exec);
  const result = await syncMilestoneToIssue({
    provider,
    config: { ...config, milestone: milestoneId },
    milestoneId,
    cwd,
    mapPath,
    exec: pi.exec,
    emit: pi.events.emit.bind(pi.events),
  });

  // Report results
  const lines: string[] = [];
  lines.push(`Sync complete: ${result.created.length} created, ${result.skipped.length} skipped.`);
  if (result.errors.length > 0) {
    lines.push(`${result.errors.length} error(s):`);
    for (const e of result.errors) {
      lines.push(`  ${e.milestoneId}: ${e.error}`);
    }
  }
  ctx.ui.notify(lines.join("\n"), result.errors.length > 0 ? "warning" : "info");
}
