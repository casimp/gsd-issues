/**
 * Config types, file I/O, and structural validation for gsd-issues.
 *
 * Config is stored at `.gsd/issues.json` in the project root.
 * `loadConfig` throws with setup guidance on missing file.
 * `validateConfig` returns all errors (not just first).
 *
 * Diagnostics:
 * - Missing file → "No issues config found. Run /issues setup to create one."
 * - Invalid JSON → "issues.json contains invalid JSON"
 * - Validation errors → all listed in thrown message
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ── GitLab-specific config fields ──

export interface GitLabConfig {
  project_path: string;
  project_id: number;
  epic?: string;
  weight_strategy?: "none" | "fibonacci" | "linear";
  reorganisation?: boolean;
}

// ── GitHub-specific config fields ──

export interface GitHubConfig {
  repo: string;
  project?: string;
  close_reason?: "completed" | "not planned";
}

// ── Top-level Config ──

export interface Config {
  provider: "github" | "gitlab";
  milestone?: string;
  assignee?: string;
  done_label?: string;
  branch_pattern?: string;
  labels?: string[];
  max_slices_per_milestone?: number;
  sizing_mode?: "strict" | "best_try";
  gitlab?: GitLabConfig;
  github?: GitHubConfig;
  /** Allow extra fields to pass through without breaking validation */
  [key: string]: unknown;
}

// ── Validation ──

/**
 * Structural validation of a config object.
 * Returns all errors found, not just the first.
 * Does not use any schema library — hand-rolled structural checks.
 */
export function validateConfig(config: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    return { valid: false, errors: ["Config must be a JSON object"] };
  }

  const c = config as Record<string, unknown>;

  // Required: provider
  if (!("provider" in c)) {
    errors.push('Missing required field: "provider"');
  } else if (c.provider !== "github" && c.provider !== "gitlab") {
    errors.push(
      `Invalid provider: "${String(c.provider)}" — must be "github" or "gitlab"`,
    );
  }

  // Optional: milestone (string when present)
  if ("milestone" in c && typeof c.milestone !== "string") {
    errors.push(
      `Invalid type for "milestone": expected string, got ${typeof c.milestone}`,
    );
  }

  // Optional string fields
  const optionalStrings = [
    "assignee",
    "done_label",
    "branch_pattern",
  ] as const;
  for (const field of optionalStrings) {
    if (field in c && typeof c[field] !== "string") {
      errors.push(
        `Invalid type for "${field}": expected string, got ${typeof c[field]}`,
      );
    }
  }

  // Optional: labels (string array)
  if ("labels" in c) {
    if (!Array.isArray(c.labels)) {
      errors.push(
        `Invalid type for "labels": expected string array, got ${typeof c.labels}`,
      );
    } else {
      for (let i = 0; i < c.labels.length; i++) {
        if (typeof c.labels[i] !== "string") {
          errors.push(
            `Invalid type for "labels[${i}]": expected string, got ${typeof c.labels[i]}`,
          );
        }
      }
    }
  }

  // Optional: max_slices_per_milestone (positive integer when present)
  if ("max_slices_per_milestone" in c) {
    if (typeof c.max_slices_per_milestone !== "number") {
      errors.push(
        `Invalid type for "max_slices_per_milestone": expected number, got ${typeof c.max_slices_per_milestone}`,
      );
    } else if (
      !Number.isInteger(c.max_slices_per_milestone) ||
      c.max_slices_per_milestone < 1
    ) {
      errors.push(
        `Invalid value for "max_slices_per_milestone": must be a positive integer (≥1), got ${c.max_slices_per_milestone}`,
      );
    }
  }

  // Optional: sizing_mode (enum when present)
  if ("sizing_mode" in c) {
    if (c.sizing_mode !== "strict" && c.sizing_mode !== "best_try") {
      errors.push(
        `Invalid sizing_mode: "${String(c.sizing_mode)}" — must be "strict" or "best_try"`,
      );
    }
  }

  // Provider-specific section enforcement
  const provider = c.provider;
  if (provider === "gitlab") {
    if (!("gitlab" in c) || typeof c.gitlab !== "object" || c.gitlab === null) {
      errors.push(
        'Provider is "gitlab" but missing required "gitlab" configuration section',
      );
    } else {
      validateGitLabSection(c.gitlab as Record<string, unknown>, errors);
    }
  }

  if (provider === "github") {
    if (!("github" in c) || typeof c.github !== "object" || c.github === null) {
      errors.push(
        'Provider is "github" but missing required "github" configuration section',
      );
    } else {
      validateGitHubSection(c.github as Record<string, unknown>, errors);
    }
  }

  return { valid: errors.length === 0, errors };
}

function validateGitLabSection(
  gl: Record<string, unknown>,
  errors: string[],
): void {
  if (!("project_path" in gl) || typeof gl.project_path !== "string") {
    errors.push(
      'GitLab config missing or invalid "project_path": expected string',
    );
  }
  if (!("project_id" in gl) || typeof gl.project_id !== "number") {
    errors.push(
      'GitLab config missing or invalid "project_id": expected number',
    );
  }
  if (
    "weight_strategy" in gl &&
    gl.weight_strategy !== "none" &&
    gl.weight_strategy !== "fibonacci" &&
    gl.weight_strategy !== "linear"
  ) {
    errors.push(
      `Invalid GitLab "weight_strategy": "${String(gl.weight_strategy)}" — must be "none", "fibonacci", or "linear"`,
    );
  }
  if ("reorganisation" in gl && typeof gl.reorganisation !== "boolean") {
    errors.push(
      `Invalid type for GitLab "reorganisation": expected boolean, got ${typeof gl.reorganisation}`,
    );
  }
}

function validateGitHubSection(
  gh: Record<string, unknown>,
  errors: string[],
): void {
  if (!("repo" in gh) || typeof gh.repo !== "string") {
    errors.push('GitHub config missing or invalid "repo": expected string');
  }
  if ("project" in gh && typeof gh.project !== "string") {
    errors.push(
      `Invalid type for GitHub "project": expected string, got ${typeof gh.project}`,
    );
  }
  if (
    "close_reason" in gh &&
    gh.close_reason !== "completed" &&
    gh.close_reason !== "not planned"
  ) {
    errors.push(
      `Invalid GitHub "close_reason": "${String(gh.close_reason)}" — must be "completed" or "not planned"`,
    );
  }
}

// ── File I/O ──

const CONFIG_FILE = "issues.json";
const CONFIG_DIR = ".gsd";

function configPath(cwd: string): string {
  return join(cwd, CONFIG_DIR, CONFIG_FILE);
}

/**
 * Load config from `.gsd/issues.json`.
 *
 * Throws on:
 * - Missing file: message includes "Run /issues setup" guidance
 * - Invalid JSON: message includes file path
 * - Validation errors: message lists all errors
 */
export async function loadConfig(cwd: string): Promise<Config> {
  const filePath = configPath(cwd);

  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No issues config found at ${filePath}. Run /issues setup to create one.`,
      );
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`issues.json at ${filePath} contains invalid JSON`);
  }

  const result = validateConfig(parsed);
  if (!result.valid) {
    throw new Error(
      `Invalid issues config at ${filePath}:\n${result.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return parsed as Config;
}

/**
 * Save config to `.gsd/issues.json`.
 * Creates the `.gsd/` directory if it doesn't exist.
 * Writes with 2-space indent for readability.
 */
export async function saveConfig(cwd: string, config: Config): Promise<void> {
  const dir = join(cwd, CONFIG_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = configPath(cwd);
  await writeFile(filePath, JSON.stringify(config, null, 2) + "\n", "utf-8");
}
