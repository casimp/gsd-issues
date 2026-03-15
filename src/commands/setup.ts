/**
 * Interactive setup command for gsd-issues.
 *
 * Detects provider from git remote, discovers milestones and user
 * from CLI, walks the user through configuration, and writes
 * `.gsd/issues.json`.
 *
 * Diagnostics:
 * - Auth failures surface as "Run `glab auth login`" / "Run `gh auth login`"
 * - Empty milestone list → manual input prompt
 * - Detection failure → manual provider selection
 * - All CLI errors caught and surfaced via ctx.ui.notify
 */

import type { ExtensionCommandContext } from "../index.js";
import type { ExecFn, ExecResult } from "../providers/types.js";
import { ProviderError } from "../providers/types.js";
import { detectProvider } from "../providers/detect.js";
import {
  saveConfig,
  validateConfig,
  type Config,
  type GitLabConfig,
  type GitHubConfig,
} from "../lib/config.js";
import { execFile } from "node:child_process";

// ── Default exec (production path) ──

async function defaultExec(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: options?.cwd, encoding: "utf-8" },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: error ? (error as Error & { code?: number }).code ?? 1 : 0,
          killed: false,
        });
      },
    );
  });
}

// ── Discovery helpers ──

/**
 * Parse owner/repo from a git remote URL.
 *
 * Handles:
 * - SSH: git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 * - GitLab groups: git@gitlab.com:org/sub/repo.git
 */
function parseRepoPath(url: string): string | null {
  // SSH: git@host:path.git
  const sshMatch = url.match(/^[\w-]+@[^:]+:(.+?)(?:\.git)?$/);
  if (sshMatch) return sshMatch[1];

  // HTTPS: https://host/path.git
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "");
    return path || null;
  } catch {
    return null;
  }
}

async function getRemoteUrl(
  exec: ExecFn,
  cwd: string,
): Promise<string | null> {
  const result = await exec("git", ["remote", "get-url", "origin"], { cwd });
  if (result.code !== 0) return null;
  return result.stdout.trim() || null;
}

interface MilestoneItem {
  title: string;
  id?: number;
}

async function discoverMilestones(
  provider: "github" | "gitlab",
  exec: ExecFn,
  cwd: string,
): Promise<MilestoneItem[]> {
  if (provider === "gitlab") {
    const result = await exec(
      "glab",
      ["milestone", "list", "--output", "json"],
      { cwd },
    );
    if (result.code !== 0) {
      throw new ProviderError(
        `Failed to list milestones: ${result.stderr.trim()}`,
        "gitlab",
        "discoverMilestones",
        result.code,
        result.stderr,
        "glab milestone list --output json",
      );
    }
    const items = JSON.parse(result.stdout);
    if (!Array.isArray(items)) return [];
    return items.map((m: { title: string; id?: number }) => ({
      title: m.title,
      id: m.id,
    }));
  }

  // GitHub
  const result = await exec(
    "gh",
    ["milestone", "list", "--json", "title,number"],
    { cwd },
  );
  if (result.code !== 0) {
    throw new ProviderError(
      `Failed to list milestones: ${result.stderr.trim()}`,
      "github",
      "discoverMilestones",
      result.code,
      result.stderr,
      "gh milestone list --json title,number",
    );
  }
  const items = JSON.parse(result.stdout);
  if (!Array.isArray(items)) return [];
  return items.map((m: { title: string; number?: number }) => ({
    title: m.title,
    id: m.number,
  }));
}

async function discoverCurrentUser(
  provider: "github" | "gitlab",
  exec: ExecFn,
): Promise<string | null> {
  if (provider === "gitlab") {
    const result = await exec("glab", ["auth", "status"]);
    if (result.code !== 0) {
      throw new ProviderError(
        `GitLab auth check failed: ${result.stderr.trim()}`,
        "gitlab",
        "discoverCurrentUser",
        result.code,
        result.stderr,
        "glab auth status",
      );
    }
    // glab auth status output: "Logged in to gitlab.com as USERNAME ..."
    const combined = result.stdout + result.stderr;
    const match = combined.match(/Logged in to \S+ as (\S+)/);
    return match ? match[1] : null;
  }

  // GitHub: gh auth status
  const result = await exec("gh", ["auth", "status"]);
  if (result.code !== 0) {
    throw new ProviderError(
      `GitHub auth check failed: ${result.stderr.trim()}`,
      "github",
      "discoverCurrentUser",
      result.code,
      result.stderr,
      "gh auth status",
    );
  }
  // gh auth status output: "Logged in to github.com account USERNAME ..."
  const combined = result.stdout + result.stderr;
  const match = combined.match(/Logged in to \S+ account (\S+)/i);
  if (match) return match[1];
  // Fallback pattern: "✓ Logged in to github.com as USERNAME"
  const altMatch = combined.match(/Logged in to \S+ as (\S+)/i);
  return altMatch ? altMatch[1] : null;
}

async function discoverProjectId(
  exec: ExecFn,
  cwd: string,
): Promise<number | null> {
  // Try glab api to get project ID
  const result = await exec(
    "glab",
    ["api", "projects/:id", "--method", "GET"],
    { cwd },
  );
  if (result.code !== 0) return null;
  try {
    const data = JSON.parse(result.stdout);
    return typeof data.id === "number" ? data.id : null;
  } catch {
    return null;
  }
}

// ── Main handler ──

export async function handleSetup(
  _args: string,
  ctx: ExtensionCommandContext,
  exec?: ExecFn,
): Promise<void> {
  // Guard: require interactive mode
  if (!ctx.hasUI) {
    ctx.ui.notify(
      "Setup requires interactive mode. Run this command in the pi TUI.",
      "warning",
    );
    return;
  }

  const run = exec ?? defaultExec;
  const cwd = process.cwd();

  // ── Step 1: Detect provider ──

  let provider: "github" | "gitlab";

  const detected = await detectProvider(cwd, run);
  if (detected) {
    provider = detected;
    ctx.ui.notify(`Detected provider: ${provider}`, "info");
  } else {
    ctx.ui.notify(
      "Could not detect provider from git remote. Please select manually.",
      "info",
    );
    const choice = await ctx.ui.select("Select your issue provider:", [
      { value: "github", label: "GitHub" },
      { value: "gitlab", label: "GitLab" },
    ]);
    provider = choice as "github" | "gitlab";
  }

  // ── Step 2: Discover repo/project path ──

  const remoteUrl = await getRemoteUrl(run, cwd);
  const repoPath = remoteUrl ? parseRepoPath(remoteUrl) : null;

  // ── Step 3: Discover milestones ──

  let milestones: MilestoneItem[] = [];
  try {
    milestones = await discoverMilestones(provider, run, cwd);
  } catch (err) {
    const loginCmd =
      provider === "gitlab" ? "glab auth login" : "gh auth login";
    ctx.ui.notify(
      `Could not fetch milestones. Run \`${loginCmd}\` first if not authenticated.`,
      "warning",
    );
  }

  let milestone: string;
  if (milestones.length > 0) {
    milestone = await ctx.ui.select(
      "Select a milestone:",
      milestones.map((m) => ({ value: m.title, label: m.title })),
    );
  } else {
    ctx.ui.notify(
      "No milestones found. Enter the milestone name manually.",
      "info",
    );
    milestone = await ctx.ui.input("Milestone name:");
  }

  // ── Step 4: Discover current user ──

  let assignee: string | undefined;
  try {
    const user = await discoverCurrentUser(provider, run);
    if (user) {
      assignee = await ctx.ui.input("Assignee:", user);
    } else {
      assignee = await ctx.ui.input("Assignee (leave empty to skip):");
    }
  } catch {
    const loginCmd =
      provider === "gitlab" ? "glab auth login" : "gh auth login";
    ctx.ui.notify(
      `Could not detect current user. Run \`${loginCmd}\` if not authenticated.`,
      "warning",
    );
    assignee = await ctx.ui.input("Assignee (leave empty to skip):");
  }
  if (assignee === "") assignee = undefined;

  // ── Step 5: Collect remaining fields ──

  const defaultDoneLabel = provider === "gitlab" ? "T::Done" : "";
  const doneLabel = await ctx.ui.input("Done label:", defaultDoneLabel);

  const defaultBranch = "{issue_id}-gsd/{milestone}/{slice}";
  const branchPattern = await ctx.ui.input("Branch pattern:", defaultBranch);

  const labelsInput = await ctx.ui.input(
    "Labels (comma-separated, or leave empty):",
  );
  const labels = labelsInput
    ? labelsInput
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean)
    : [];

  const maxSlicesInput = await ctx.ui.input(
    "Max slices per milestone:",
    "5",
  );
  const maxSlicesPerMilestone = parseInt(maxSlicesInput, 10);

  const sizingMode = await ctx.ui.select("Sizing mode:", [
    { value: "best_try", label: "Best try (warn and proceed)" },
    { value: "strict", label: "Strict (block until right-sized)" },
  ]) as "strict" | "best_try";

  // ── Step 6: Provider-specific config ──

  let gitlabConfig: GitLabConfig | undefined;
  let githubConfig: GitHubConfig | undefined;

  if (provider === "gitlab") {
    const projectPath =
      repoPath ?? (await ctx.ui.input("GitLab project path (e.g. org/repo):"));

    let projectId: number | null = null;
    try {
      projectId = await discoverProjectId(run, cwd);
    } catch {
      // Discovery failed — will ask manually
    }

    let projectIdFinal: number;
    if (projectId !== null) {
      const idInput = await ctx.ui.input("Project ID:", String(projectId));
      projectIdFinal = parseInt(idInput, 10);
    } else {
      const idInput = await ctx.ui.input("GitLab project ID (numeric):");
      projectIdFinal = parseInt(idInput, 10);
    }

    gitlabConfig = {
      project_path: projectPath,
      project_id: projectIdFinal,
    };

    const wantEpic = await ctx.ui.confirm("Associate with an epic?");
    if (wantEpic) {
      const epic = await ctx.ui.input("Epic reference (e.g. &42):");
      if (epic) gitlabConfig.epic = epic;
    }
  }

  if (provider === "github") {
    const repo =
      repoPath ?? (await ctx.ui.input("GitHub repo (e.g. owner/repo):"));

    githubConfig = {
      repo,
      close_reason: "completed",
    };

    const wantProject = await ctx.ui.confirm(
      "Associate with a GitHub project?",
    );
    if (wantProject) {
      const project = await ctx.ui.input("Project number:");
      if (project) githubConfig.project = project;
    }
  }

  // ── Step 7: Assemble and save ──

  const config: Config = {
    provider,
    milestone,
    ...(assignee && { assignee }),
    ...(doneLabel && { done_label: doneLabel }),
    ...(branchPattern && { branch_pattern: branchPattern }),
    ...(labels.length > 0 && { labels }),
    max_slices_per_milestone: maxSlicesPerMilestone,
    sizing_mode: sizingMode,
    ...(gitlabConfig && { gitlab: gitlabConfig }),
    ...(githubConfig && { github: githubConfig }),
  };

  await saveConfig(cwd, config);

  // Double-check validation
  const validation = validateConfig(config);
  if (!validation.valid) {
    ctx.ui.notify(
      `Config saved but has validation issues:\n${validation.errors.map((e) => `  - ${e}`).join("\n")}`,
      "error",
    );
    return;
  }

  // ── Step 8: Summary ──

  const summary = [
    `✓ Config saved to .gsd/issues.json`,
    ``,
    `  provider: ${config.provider}`,
    `  milestone: ${config.milestone}`,
    ...(config.assignee ? [`  assignee: ${config.assignee}`] : []),
    ...(config.done_label ? [`  done_label: ${config.done_label}`] : []),
    ...(config.branch_pattern
      ? [`  branch_pattern: ${config.branch_pattern}`]
      : []),
    ...(config.labels && config.labels.length > 0
      ? [`  labels: ${config.labels.join(", ")}`]
      : []),
    `  max_slices_per_milestone: ${config.max_slices_per_milestone}`,
    `  sizing_mode: ${config.sizing_mode}`,
    ...(config.gitlab
      ? [
          `  gitlab.project_path: ${config.gitlab.project_path}`,
          `  gitlab.project_id: ${config.gitlab.project_id}`,
          ...(config.gitlab.epic
            ? [`  gitlab.epic: ${config.gitlab.epic}`]
            : []),
        ]
      : []),
    ...(config.github
      ? [
          `  github.repo: ${config.github.repo}`,
          ...(config.github.project
            ? [`  github.project: ${config.github.project}`]
            : []),
          ...(config.github.close_reason
            ? [`  github.close_reason: ${config.github.close_reason}`]
            : []),
        ]
      : []),
  ].join("\n");

  ctx.ui.notify(summary, "info");
}
