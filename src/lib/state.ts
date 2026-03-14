/**
 * GSD state helpers — parse roadmap markdown and read active milestone.
 *
 * Pure functions for extracting slice metadata from roadmap files
 * and reading the active milestone from `.gsd/STATE.md`.
 *
 * Diagnostics:
 * - parseRoadmapSlices: silently skips non-matching lines, returns only valid entries
 * - readGSDState: returns null on missing file or missing milestone line
 * - findRoadmapPath: pure path construction, no I/O
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ── Types ──

export interface RoadmapSlice {
  id: string;
  title: string;
  risk: string;
  done: boolean;
  description: string;
}

export interface GSDState {
  milestoneId: string;
}

// ── Roadmap parser ──

/**
 * Regex for a roadmap slice line:
 *   - [ ] **S01: Title** `risk:level` `depends:[...]`
 *   - [x] **S01: Title** `risk:level` `depends:[...]`
 *
 * Captures:
 *   1: checkbox content (" " or "x")
 *   2: slice ID (e.g. "S01")
 *   3: title text
 *   4: risk level
 */
const SLICE_LINE_RE =
  /^-\s+\[([ xX])\]\s+\*\*(\w+):\s+(.+?)\*\*\s+`risk:(\w+)`/;

/**
 * Regex for a description line following a slice:
 *   > After this: description text
 */
const DESCRIPTION_RE = /^\s*>\s*After this:\s*(.+)/;

/**
 * Parse roadmap markdown content and extract slice metadata.
 *
 * Each slice line follows the GSD roadmap format:
 *   `- [ ] **S01: Title** \`risk:level\` \`depends:[]\``
 * with an optional description on the next line:
 *   `> After this: description text`
 *
 * Non-matching lines are silently skipped.
 */
export function parseRoadmapSlices(content: string): RoadmapSlice[] {
  const lines = content.split("\n");
  const slices: RoadmapSlice[] = [];

  for (let i = 0; i < lines.length; i++) {
    const match = SLICE_LINE_RE.exec(lines[i]);
    if (!match) continue;

    const [, checkbox, id, title, risk] = match;
    const done = checkbox.toLowerCase() === "x";

    // Check next line for description
    let description = "";
    if (i + 1 < lines.length) {
      const descMatch = DESCRIPTION_RE.exec(lines[i + 1]);
      if (descMatch) {
        description = descMatch[1].trim();
      }
    }

    slices.push({ id, title, risk, done, description });
  }

  return slices;
}

// ── GSD state reader ──

/**
 * Regex for the active milestone line in STATE.md:
 *   **Active Milestone:** M001 — Title
 *
 * Captures:
 *   1: milestone ID (e.g. "M001")
 */
const MILESTONE_RE = /\*\*Active Milestone:\*\*\s+(\S+)/;

/**
 * Read the active milestone ID from `.gsd/STATE.md`.
 *
 * Returns null if the file is missing or doesn't contain an active milestone line.
 */
export async function readGSDState(
  cwd: string,
): Promise<GSDState | null> {
  const statePath = join(cwd, ".gsd", "STATE.md");

  let content: string;
  try {
    content = await readFile(statePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  const match = MILESTONE_RE.exec(content);
  if (!match) return null;

  return { milestoneId: match[1] };
}

// ── Path helper ──

/**
 * Construct the expected roadmap file path for a milestone.
 */
export function findRoadmapPath(cwd: string, milestoneId: string): string {
  return join(
    cwd,
    ".gsd",
    "milestones",
    milestoneId,
    `${milestoneId}-ROADMAP.md`,
  );
}
