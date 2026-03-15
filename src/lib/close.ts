/**
 * Close orchestration — close the remote issue mapped to a GSD milestone.
 *
 * Core flow:
 * 1. Load ISSUE-MAP.json to find the mapping for the given milestoneId
 * 2. Call provider.closeIssue() with config-driven doneLabel and reason
 * 3. Emit gsd-issues:close-complete event on success
 *
 * Diagnostics:
 * - CloseResult.closed: false + reason when no mapping found
 * - ProviderError fields available on failure (provider, operation, exitCode, stderr)
 * - Already-closed issues treated as success (ProviderError with "already closed" caught)
 * - gsd-issues:close-complete event: { milestone, issueId, url }
 */

import type { IssueProvider } from "../providers/types.js";
import { ProviderError } from "../providers/types.js";
import { loadIssueMap } from "./issue-map.js";
import type { Config } from "./config.js";

// ── Types ──

export interface CloseOptions {
  provider: IssueProvider;
  config: Config;
  mapPath: string;
  milestoneId: string;
  emit?: (event: string, payload: unknown) => void;
}

export type CloseResult =
  | { closed: true; issueId: number; url: string }
  | { closed: false; reason: "no-mapping" };

// ── Core close function ──

/**
 * Close the remote issue mapped to a milestone.
 *
 * Returns `{ closed: false, reason: "no-mapping" }` if no map entry exists.
 * Catches ProviderError where stderr/message suggests already-closed and treats as success.
 * Emits `gsd-issues:close-complete` on successful close.
 */
export async function closeMilestoneIssue(
  opts: CloseOptions,
): Promise<CloseResult> {
  const { provider, config, mapPath, milestoneId, emit } = opts;

  // Load map and find entry by milestoneId
  const entries = await loadIssueMap(mapPath);
  const entry = entries.find((e) => e.localId === milestoneId);

  if (!entry) {
    return { closed: false, reason: "no-mapping" };
  }

  // Build close options from config
  const doneLabel = config.done_label;
  const reason = config.github?.close_reason;

  try {
    await provider.closeIssue({
      issueId: entry.issueId,
      doneLabel,
      reason,
    });
  } catch (err) {
    // Treat already-closed as success
    if (err instanceof ProviderError) {
      const msg = (err.stderr + " " + err.message).toLowerCase();
      if (msg.includes("already closed") || msg.includes("already been closed")) {
        // Fall through to success path
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  const result: CloseResult = {
    closed: true,
    issueId: entry.issueId,
    url: entry.url,
  };

  // Emit completion event
  emit?.("gsd-issues:close-complete", {
    milestone: milestoneId,
    issueId: entry.issueId,
    url: entry.url,
  });

  return result;
}
