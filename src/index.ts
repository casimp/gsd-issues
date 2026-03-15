/**
 * gsd-issues extension entry point.
 *
 * Registers the `/issues` command with subcommand routing and
 * the `gsd_issues_sync`, `gsd_issues_close`, and `gsd_issues_pr` LLM-callable tools.
 *
 * Subcommands: setup, sync, import, close, pr, status.
 *
 * Diagnostics:
 * - Tool registration logged at load time
 * - Sync results reported via ctx.ui.notify (command) or ToolResult (tool)
 * - Config/provider errors surface with actionable messages
 * - Close result: gsd-issues:close-complete event emitted on success
 * - PR result: gsd-issues:pr-complete event emitted on success
 */

import { Type, type Static } from "@sinclair/typebox";
import type { TSchema } from "@sinclair/typebox";
import { loadConfig, type Config } from "./lib/config.js";
import { readGSDState, findRoadmapPath } from "./lib/state.js";
import { syncMilestoneToIssue, SyncToolSchema, type SyncToolParams } from "./lib/sync.js";
import { closeMilestoneIssue } from "./lib/close.js";
import { createMilestonePR, PrToolSchema, type PrToolParams } from "./lib/pr.js";
import { importIssues, ImportToolSchema, type ImportToolParams } from "./lib/import.js";
import { loadIssueMap } from "./lib/issue-map.js";
import { GitLabProvider } from "./providers/gitlab.js";
import { GitHubProvider } from "./providers/github.js";
import type { ExecFn, IssueProvider } from "./providers/types.js";
import { join, dirname } from "node:path";

// ── Minimal pi extension API types ──
// These match the pi extension contract. When pi loads this extension,
// it passes an API object conforming to this shape.

export interface ExtensionUI {
  notify(message: string, level?: "info" | "warning" | "error"): void;
  select(
    prompt: string,
    options: Array<{ value: string; label: string }>,
  ): Promise<string>;
  input(prompt: string, defaultValue?: string): Promise<string>;
  confirm(prompt: string): Promise<boolean>;
}

export interface ExtensionCommandContext {
  ui: ExtensionUI;
  hasUI: boolean;
}

export interface CommandDefinition {
  description: string;
  getArgumentCompletions?: (
    prefix: string,
  ) => Array<{ value: string; label: string }>;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
}

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
}

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  execute(
    toolCallId: string,
    params: unknown,
    signal: AbortSignal,
    onUpdate: unknown,
    ctx: ExtensionCommandContext,
  ): Promise<ToolResult>;
}

export interface ExtensionAPI {
  registerCommand(name: string, definition: CommandDefinition): void;
  registerTool(tool: ToolDefinition): void;
  exec: ExecFn;
  events: {
    emit(event: string, payload: unknown): void;
  };
}

// ── Provider instantiation ──

function createProvider(config: Config, exec: ExecFn): IssueProvider {
  if (config.provider === "gitlab") {
    return new GitLabProvider(exec, config.gitlab?.project_path);
  }
  return new GitHubProvider(exec, config.github?.repo);
}

// ── Subcommand list ──

const SUBCOMMANDS = ["setup", "sync", "import", "close", "pr", "status"] as const;

// ── Extension factory ──

export default function (pi: ExtensionAPI): void {
  // Register the sync tool for LLM callers
  pi.registerTool({
    name: "gsd_issues_sync",
    label: "Sync Issues",
    description:
      "Sync a GSD milestone to a remote issue on GitLab/GitHub. Creates one issue per milestone with title, description, labels, and provider-specific metadata.",
    parameters: SyncToolSchema,
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal, _onUpdate: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
      const typedParams = params as SyncToolParams;
      const cwd = process.cwd();

      const config = await loadConfig(cwd);

      // Resolve milestone: from params, config, or GSD state
      let milestoneId = typedParams.milestone_id ?? config.milestone;
      if (!milestoneId) {
        const state = await readGSDState(cwd);
        if (!state) {
          return {
            content: [{ type: "text", text: "Cannot determine milestone — no milestone in config or GSD state." }],
          };
        }
        milestoneId = state.milestoneId;
      }

      // Resolve map path
      const roadmapPath = findRoadmapPath(cwd, milestoneId);
      const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");

      // Check if already mapped
      const existingMap = await loadIssueMap(mapPath);
      const alreadyMapped = existingMap.some((e) => e.localId === milestoneId);

      if (alreadyMapped) {
        return {
          content: [{ type: "text", text: `Milestone ${milestoneId} is already mapped to an issue. Nothing to sync.` }],
        };
      }

      // Run sync — no confirmation in tool mode (LLM-driven)
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

      // Build summary text
      const lines: string[] = [];
      lines.push(`Sync complete for ${milestoneId}:`);
      lines.push(`  Created: ${result.created.length}`);
      lines.push(`  Skipped: ${result.skipped.length}`);
      if (result.errors.length > 0) {
        lines.push(`  Errors: ${result.errors.length}`);
        for (const e of result.errors) {
          lines.push(`    ${e.milestoneId}: ${e.error}`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  });

  // Register the close tool for LLM callers
  const CloseToolSchema = Type.Object({
    milestone_id: Type.Optional(Type.String()),
  });
  type CloseToolParams = Static<typeof CloseToolSchema>;

  pi.registerTool({
    name: "gsd_issues_close",
    label: "Close Issue",
    description:
      "Close the remote issue mapped to a GSD milestone. Applies done label (GitLab) or close reason (GitHub) from config.",
    parameters: CloseToolSchema,
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal, _onUpdate: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
      const typedParams = params as CloseToolParams;
      const cwd = process.cwd();

      const config = await loadConfig(cwd);

      // Resolve milestone
      let milestoneId = typedParams.milestone_id ?? config.milestone;
      if (!milestoneId) {
        const state = await readGSDState(cwd);
        if (!state) {
          return {
            content: [{ type: "text", text: "Cannot determine milestone — no milestone in config or GSD state." }],
          };
        }
        milestoneId = state.milestoneId;
      }

      const roadmapPath = findRoadmapPath(cwd, milestoneId);
      const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
      const provider = createProvider(config, pi.exec);

      const result = await closeMilestoneIssue({
        provider,
        config,
        mapPath,
        milestoneId,
        emit: pi.events.emit.bind(pi.events),
      });

      if (!result.closed) {
        return {
          content: [{ type: "text", text: `No issue mapping found for milestone "${milestoneId}". Nothing to close.` }],
        };
      }

      return {
        content: [{ type: "text", text: `Closed issue #${result.issueId} (${result.url}) for milestone ${milestoneId}.` }],
        details: result,
      };
    },
  });

  // Register the import tool for LLM callers
  pi.registerTool({
    name: "gsd_issues_import",
    label: "Import Issues",
    description:
      "Import issues from GitLab/GitHub as structured markdown. Fetches open issues filtered by milestone, labels, state, and assignee. Returns formatted markdown with issue IDs, titles, labels, weight, milestone, assignee, and truncated descriptions.",
    parameters: ImportToolSchema,
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal, _onUpdate: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
      const typedParams = params as ImportToolParams;
      const cwd = process.cwd();

      const config = await loadConfig(cwd);

      // Resolve milestone: from params, config, or GSD state
      let milestoneId = typedParams.milestone ?? config.milestone;
      if (!milestoneId) {
        const state = await readGSDState(cwd);
        if (state) {
          milestoneId = state.milestoneId;
        }
      }

      // Build filter
      const filter: { state?: "open" | "closed" | "all"; milestone?: string; labels?: string[]; assignee?: string } = {
        state: typedParams.state ?? "open",
      };
      if (milestoneId) {
        filter.milestone = milestoneId;
      }
      if (typedParams.labels && typedParams.labels.length > 0) {
        filter.labels = typedParams.labels;
      }
      if (typedParams.assignee) {
        filter.assignee = typedParams.assignee;
      }

      // Fetch issues and format
      const provider = createProvider(config, pi.exec);
      const issues = await provider.listIssues(filter);
      const result = importIssues({
        issues,
        emit: pi.events.emit.bind(pi.events),
      });

      return {
        content: [{ type: "text", text: result.markdown }],
        details: result,
      };
    },
  });

  // Register the PR tool for LLM callers
  pi.registerTool({
    name: "gsd_issues_pr",
    label: "Create PR",
    description:
      "Create a pull request for a GSD milestone. Pushes the integration branch and creates a PR/MR on GitLab/GitHub with optional Closes #N from the issue map.",
    parameters: PrToolSchema,
    async execute(_toolCallId: string, params: unknown, _signal: AbortSignal, _onUpdate: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
      const typedParams = params as PrToolParams;
      const cwd = process.cwd();

      const config = await loadConfig(cwd);

      // Resolve milestone
      let milestoneId = typedParams.milestone_id ?? config.milestone;
      if (!milestoneId) {
        const state = await readGSDState(cwd);
        if (!state) {
          return {
            content: [{ type: "text", text: "Cannot determine milestone — no milestone in config or GSD state." }],
          };
        }
        milestoneId = state.milestoneId;
      }

      // Resolve map path
      const roadmapPath = findRoadmapPath(cwd, milestoneId);
      const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");

      // Run PR pipeline — no confirmation in tool mode (LLM-driven)
      const provider = createProvider(config, pi.exec);
      const result = await createMilestonePR({
        provider,
        config,
        exec: pi.exec,
        cwd,
        milestoneId,
        mapPath,
        emit: pi.events.emit.bind(pi.events),
        targetBranch: typedParams.target_branch,
        dryRun: typedParams.dry_run,
      });

      return {
        content: [{ type: "text", text: `PR created: ${result.url} (#${result.number}) — ${result.sourceBranch} → ${result.targetBranch}` }],
        details: result,
      };
    },
  });

  pi.registerCommand("issues", {
    description:
      "gsd-issues: manage GitHub/GitLab issues — /issues setup|sync|import|close|pr|status",

    getArgumentCompletions(prefix: string) {
      const trimmed = prefix.trim();
      return SUBCOMMANDS.filter((cmd) => cmd.startsWith(trimmed)).map(
        (cmd) => ({
          value: cmd,
          label: cmd,
        }),
      );
    },

    async handler(args: string, ctx: ExtensionCommandContext) {
      const subcommand = (typeof args === "string" ? args : "")
        .trim()
        .split(/\s+/)[0]
        ?.toLowerCase();

      if (!subcommand) {
        ctx.ui.notify(
          "Usage: /issues <setup|sync|import|close|pr|status>",
          "info",
        );
        return;
      }

      switch (subcommand) {
        case "setup": {
          // Dynamic import to avoid circular deps and keep the setup module lazy
          const { handleSetup } = await import("./commands/setup.js");
          await handleSetup(args, ctx);
          return;
        }

        case "sync": {
          const { handleSync } = await import("./commands/sync.js");
          await handleSync(args, ctx, pi);
          return;
        }

        case "close": {
          const { handleClose } = await import("./commands/close.js");
          await handleClose(args, ctx, pi);
          return;
        }

        case "import": {
          const { handleImport } = await import("./commands/import.js");
          await handleImport(args, ctx, pi);
          return;
        }

        case "pr": {
          const { handlePr } = await import("./commands/pr.js");
          await handlePr(args, ctx, pi);
          return;
        }

        case "status":
          ctx.ui.notify(
            `/issues ${subcommand} is not yet implemented.`,
            "info",
          );
          return;

        default:
          ctx.ui.notify(
            `Unknown subcommand: "${subcommand}". Use: setup, sync, import, close, pr, status.`,
            "warning",
          );
      }
    },
  });
}
