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

/** Values that indicate no active milestone (case-insensitive) */
const NO_MILESTONE_VALUES = new Set(["none", "—", "-", "n/a"]);

/**
 * Read the active milestone ID from `.gsd/STATE.md`.
 *
 * Returns null if the file is missing, doesn't contain an active milestone line,
 * or the value is a sentinel like "None".
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

  const value = match[1];
  if (NO_MILESTONE_VALUES.has(value.toLowerCase())) return null;

  return { milestoneId: value };
}

// ── Integration branch reader ──

/**
 * Valid branch name pattern — matches GSD core's VALID_BRANCH_NAME.
 * Allows alphanumeric, underscore, hyphen, forward slash, and dot.
 */
export const VALID_BRANCH_NAME = /^[a-zA-Z0-9_\-\/.]+$/;

/**
 * Read the integration branch from a milestone's META.json file.
 *
 * Path: `.gsd/milestones/{MID}/{MID}-META.json`
 *
 * Returns `null` on:
 * - Missing META.json file (ENOENT)
 * - Corrupt/unparseable JSON
 * - Missing `integrationBranch` field
 * - Empty or whitespace-only branch name
 * - Branch name failing VALID_BRANCH_NAME validation
 *
 * Only unexpected I/O errors propagate as thrown exceptions.
 */
export async function readIntegrationBranch(
  cwd: string,
  milestoneId: string,
): Promise<string | null> {
  const metaPath = join(
    cwd,
    ".gsd",
    "milestones",
    milestoneId,
    `${milestoneId}-META.json`,
  );

  let raw: string;
  try {
    raw = await readFile(metaPath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof data !== "object" || data === null) return null;

  const branch = (data as Record<string, unknown>).integrationBranch;
  if (typeof branch !== "string") return null;

  const trimmed = branch.trim();
  if (trimmed.length === 0) return null;
  if (!VALID_BRANCH_NAME.test(trimmed)) return null;

  return trimmed;
}

// ── Milestone context reader ──

export interface MilestoneContext {
  title: string;
  body: string;
}

/**
 * Read a milestone's CONTEXT.md and extract title + body for issue creation.
 *
 * Parses the first `# ` heading as title.
 * Extracts "Project Description" and everything after it as body content.
 * Returns `null` on missing file (ENOENT).
 */
export async function readMilestoneContext(
  cwd: string,
  milestoneId: string,
): Promise<MilestoneContext | null> {
  const contextPath = join(
    cwd,
    ".gsd",
    "milestones",
    milestoneId,
    `${milestoneId}-CONTEXT.md`,
  );

  let content: string;
  try {
    content = await readFile(contextPath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }

  // Extract title from first # heading
  const titleMatch = /^#\s+(.+)$/m.exec(content);
  const title = titleMatch ? titleMatch[1].replace(/\s*—\s*Context$/, "").trim() : milestoneId;

  // Extract body: everything after the frontmatter/title area
  // Use Project Description section onward for the body
  const descIdx = content.indexOf("## Project Description");
  let body: string;
  if (descIdx !== -1) {
    body = content.slice(descIdx).trim();
  } else {
    // Fall back to everything after the first heading
    const headingIdx = content.indexOf(titleMatch?.[0] ?? "");
    body = headingIdx !== -1
      ? content.slice(headingIdx + (titleMatch?.[0]?.length ?? 0)).trim()
      : content.trim();
  }

  return { title, body };
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
