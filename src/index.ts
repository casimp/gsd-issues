/**
 * gsd-issues extension entry point.
 *
 * Registers the `/issues` command with subcommand routing,
 * the `gsd_issues_sync` and `gsd_issues_close` LLM-callable tools,
 * and a `tool_result` lifecycle hook that auto-closes issues on slice completion.
 *
 * Subcommands: setup, sync, import, close, status.
 *
 * Diagnostics:
 * - Tool registration logged at load time
 * - Sync results reported via ctx.ui.notify (command) or ToolResult (tool)
 * - Config/provider errors surface with actionable messages
 * - tool_result hook: never throws, catches all errors silently
 * - Close result: gsd-issues:close-complete event emitted on success
 */

import { Type, type Static } from "@sinclair/typebox";
import type { TSchema } from "@sinclair/typebox";
import { loadConfig, type Config } from "./lib/config.js";
import { readGSDState, findRoadmapPath, parseRoadmapSlices } from "./lib/state.js";
import { syncSlicesToIssues, SyncToolSchema, type SyncToolParams } from "./lib/sync.js";
import { closeSliceIssue } from "./lib/close.js";
import { importIssues, ImportToolSchema, type ImportToolParams } from "./lib/import.js";
import { loadIssueMap } from "./lib/issue-map.js";
import { GitLabProvider } from "./providers/gitlab.js";
import { GitHubProvider } from "./providers/github.js";
import type { ExecFn, IssueProvider } from "./providers/types.js";
import { readFile } from "node:fs/promises";
import { join, dirname, resolve, isAbsolute } from "node:path";

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

export interface ToolResultEvent {
  toolName: string;
  input: Record<string, unknown>;
  content: unknown;
  isError: boolean;
}

export interface ExtensionAPI {
  registerCommand(name: string, definition: CommandDefinition): void;
  registerTool(name: string, definition: ToolDefinition): void;
  on(
    event: "tool_result",
    handler: (event: ToolResultEvent, ctx: ExtensionCommandContext) => void | Promise<void>,
  ): void;
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

  // Register the close tool for LLM callers
  const CloseToolSchema = Type.Object({
    slice_id: Type.String(),
    milestone_id: Type.Optional(Type.String()),
  });
  type CloseToolParams = Static<typeof CloseToolSchema>;

  pi.registerTool("gsd_issues_close", {
    description:
      "Close the remote issue mapped to a GSD slice. Applies done label (GitLab) or close reason (GitHub) from config.",
    parameters: CloseToolSchema,
    async execute(params: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
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

      const result = await closeSliceIssue({
        provider,
        config,
        mapPath,
        milestoneId,
        sliceId: typedParams.slice_id,
        emit: pi.events.emit.bind(pi.events),
      });

      if (!result.closed) {
        return {
          content: [{ type: "text", text: `No issue mapping found for slice "${typedParams.slice_id}". Nothing to close.` }],
        };
      }

      return {
        content: [{ type: "text", text: `Closed issue #${result.issueId} (${result.url}) for slice ${typedParams.slice_id}.` }],
        details: result,
      };
    },
  });

  // Register the import tool for LLM callers
  pi.registerTool("gsd_issues_import", {
    description:
      "Import issues from GitLab/GitHub as structured markdown. Fetches open issues filtered by milestone, labels, state, and assignee. Returns formatted markdown with issue IDs, titles, labels, weight, milestone, assignee, and truncated descriptions.",
    parameters: ImportToolSchema,
    async execute(params: unknown, _ctx: ExtensionCommandContext): Promise<ToolResult> {
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

  // ── tool_result lifecycle hook: auto-close on slice summary write ──
  // Write tools that could produce a summary file
  const WRITE_TOOLS = new Set(["write", "Write", "write_file", "create_file", "edit_file"]);
  // Regex: .gsd/milestones/M###/slices/S##/S##-SUMMARY.md
  const SUMMARY_REGEX = /\.gsd\/milestones\/(M\d+[^/]*)\/slices\/(S\d+)\/(S\d+-SUMMARY\.md)$/;

  pi.on("tool_result", async (event: ToolResultEvent) => {
    try {
      // Skip error results
      if (event.isError) return;

      // Skip non-write tools
      if (!WRITE_TOOLS.has(event.toolName)) return;

      // Extract path from input
      const rawPath = event.input?.path;
      if (typeof rawPath !== "string") return;

      // Resolve to absolute
      const absPath = isAbsolute(rawPath) ? rawPath : resolve(process.cwd(), rawPath);

      // Match summary pattern
      const match = absPath.match(SUMMARY_REGEX);
      if (!match) return;

      const milestoneId = match[1];
      const sliceId = match[2];

      // Load config — silently bail if missing
      let config: Config;
      try {
        config = await loadConfig(process.cwd());
      } catch {
        return;
      }

      // Build provider and map path
      const provider = createProvider(config, pi.exec);
      const roadmapPath = findRoadmapPath(process.cwd(), milestoneId);
      const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");

      // Close — fire and forget, never throw
      await closeSliceIssue({
        provider,
        config,
        mapPath,
        milestoneId,
        sliceId,
        emit: pi.events.emit.bind(pi.events),
      });
    } catch {
      // Hook must never throw — all errors caught silently
    }
  });
}
