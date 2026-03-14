/**
 * gsd-issues extension entry point.
 *
 * Registers the `/issues` command with subcommand routing
 * and the `gsd_issues_sync` LLM-callable tool.
 *
 * Subcommands: setup, sync, import, close, status.
 *
 * Diagnostics:
 * - Tool registration logged at load time
 * - Sync results reported via ctx.ui.notify (command) or ToolResult (tool)
 * - Config/provider errors surface with actionable messages
 */

import type { TSchema } from "@sinclair/typebox";
import { loadConfig, type Config } from "./lib/config.js";
import { readGSDState, findRoadmapPath, parseRoadmapSlices } from "./lib/state.js";
import { syncSlicesToIssues, SyncToolSchema, type SyncToolParams } from "./lib/sync.js";
import { loadIssueMap } from "./lib/issue-map.js";
import { GitLabProvider } from "./providers/gitlab.js";
import { GitHubProvider } from "./providers/github.js";
import type { ExecFn, IssueProvider } from "./providers/types.js";
import { readFile } from "node:fs/promises";
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
  description: string;
  parameters: TSchema;
  execute(params: unknown, ctx: ExtensionCommandContext): Promise<ToolResult>;
}

export interface ExtensionAPI {
  registerCommand(name: string, definition: CommandDefinition): void;
  registerTool(name: string, definition: ToolDefinition): void;
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

const SUBCOMMANDS = ["setup", "sync", "import", "close", "status"] as const;

// ── Extension factory ──

export default function (pi: ExtensionAPI): void {
  // Register the sync tool for LLM callers
  pi.registerTool("gsd_issues_sync", {
    description:
      "Sync GSD roadmap slices to remote issues on GitLab/GitHub. Creates issues for unmapped slices with milestone, assignee, labels, weight, and epic support.",
    parameters: SyncToolSchema,
    async execute(params: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
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

      // Read roadmap
      const roadmapPath = typedParams.roadmap_path ?? findRoadmapPath(cwd, milestoneId);
      const roadmapContent = await readFile(roadmapPath, "utf-8");
      const slices = parseRoadmapSlices(roadmapContent);

      // Resolve map path
      const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");

      // Check for unmapped slices
      const existingMap = await loadIssueMap(mapPath);
      const mappedIds = new Set(existingMap.map((e) => e.localId));
      const unmapped = slices.filter((s) => !mappedIds.has(s.id));

      if (unmapped.length === 0) {
        return {
          content: [{ type: "text", text: "All slices are already mapped to issues. Nothing to sync." }],
        };
      }

      // Run sync — no confirmation in tool mode (LLM-driven)
      const provider = createProvider(config, pi.exec);
      const result = await syncSlicesToIssues({
        provider,
        config: { ...config, milestone: milestoneId },
        slices,
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
          lines.push(`    ${e.sliceId}: ${e.error}`);
        }
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  });

  pi.registerCommand("issues", {
    description:
      "gsd-issues: manage GitHub/GitLab issues — /issues setup|sync|import|close|status",

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
          "Usage: /issues <setup|sync|import|close|status>",
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

        case "import":
        case "close":
        case "status":
          ctx.ui.notify(
            `/issues ${subcommand} is not yet implemented.`,
            "info",
          );
          return;

        default:
          ctx.ui.notify(
            `Unknown subcommand: "${subcommand}". Use: setup, sync, import, close, status.`,
            "warning",
          );
      }
    },
  });
}
