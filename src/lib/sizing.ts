/**
 * Milestone sizing validation — checks whether a milestone's slice count
 * exceeds the configured limit.
 *
 * Composes `findRoadmapPath()` and `parseRoadmapSlices()` from state.ts
 * with `Config.max_slices_per_milestone` to produce a typed `SizingResult`.
 *
 * Diagnostics:
 * - Missing roadmap → throws with milestone ID and expected path
 * - No limit configured → returns valid with limit: undefined
 * - 0 slices → returns valid (planning hasn't happened yet)
 * - Result always includes mode, milestoneId, sliceCount for caller inspection
 */

import { readFile } from "node:fs/promises";
import type { Config } from "./config.js";
import { findRoadmapPath, parseRoadmapSlices } from "./state.js";

// ── Types ──

export interface SizingResult {
  valid: boolean;
  sliceCount: number;
  limit: number | undefined;
  mode: "strict" | "best_try";
  milestoneId: string;
}

// ── Sizing validation ──

/**
 * Validate whether a milestone's slice count is within the configured limit.
 *
 * Reads the milestone's roadmap file, parses slices, and compares against
 * `config.max_slices_per_milestone`.
 *
 * - If `config.max_slices_per_milestone` is undefined, returns valid with no limit.
 * - If the roadmap has 0 slices, returns valid (planning hasn't started).
 * - At-limit is valid; over-limit is invalid.
 * - Throws if the roadmap file is missing (includes milestone ID in message).
 */
export async function validateMilestoneSize(
  cwd: string,
  milestoneId: string,
  config: Config,
): Promise<SizingResult> {
  const mode: "strict" | "best_try" = config.sizing_mode ?? "best_try";
  const limit = config.max_slices_per_milestone;

  // No limit configured — skip validation entirely
  if (limit === undefined) {
    return {
      valid: true,
      sliceCount: 0,
      limit: undefined,
      mode,
      milestoneId,
    };
  }

  const roadmapPath = findRoadmapPath(cwd, milestoneId);

  let content: string;
  try {
    content = await readFile(roadmapPath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `Roadmap not found for milestone ${milestoneId}: expected at ${roadmapPath}`,
      );
    }
    throw err;
  }

  const slices = parseRoadmapSlices(content);
  const sliceCount = slices.length;

  return {
    valid: sliceCount <= limit,
    sliceCount,
    limit,
    mode,
    milestoneId,
  };
}
