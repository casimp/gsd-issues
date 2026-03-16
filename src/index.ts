/**
 * gsd-issues extension entry point.
 *
 * Registers the `/issues` command with subcommand routing and
 * the `gsd_issues_sync`, `gsd_issues_close`, `gsd_issues_pr`, and `gsd_issues_import` LLM-callable tools.
 *
 * Subcommands: setup, sync, import, close, pr, auto, status.
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
import { importIssues, ImportToolSchema, type ImportToolParams, rescopeIssues } from "./lib/import.js";
import { loadIssueMap } from "./lib/issue-map.js";
import { createProvider } from "./lib/provider-factory.js";
import type { ExecFn } from "./providers/types.js";
import { join, dirname } from "node:path";

// ── Minimal pi extension API types ──
// These match the pi extension contract. When pi loads this extension,
// it passes an API object conforming to this shape.

export interface ExtensionUI {
  notify(message: string, level?: "info" | "warning" | "error"): void;
  select(
    prompt: string,
    options: string[],
  ): Promise<string>;
  input(prompt: string, defaultValue?: string): Promise<string>;
  confirm(prompt: string): Promise<boolean>;
}

export interface ExtensionCommandContext {
  ui: ExtensionUI;
  hasUI: boolean;
  /** Wait for the agent to finish streaming. */
  waitForIdle(): Promise<void>;
  /** Start a new session. Returns { cancelled: true } if the user aborted. */
  newSession(options?: {
    parentSession?: string;
    setup?: (sessionManager: unknown) => Promise<void>;
  }): Promise<{ cancelled: boolean }>;
}

/**
 * Minimal context available to lifecycle hooks (e.g. agent_end).
 * Does NOT include session-control methods like newSession/waitForIdle —
 * those live on ExtensionCommandContext only.
 */
export interface ExtensionContext {
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
  /** Send a custom message to the session. */
  sendMessage<T = unknown>(
    message: { customType: string; content: string | string[]; display?: boolean; details?: T },
    options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
  ): void;
  /** Register an event handler. */
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
}

// ── Provider instantiation via shared factory ──

// ── Subcommand list ──

const SUBCOMMANDS = ["setup", "sync", "import", "close", "pr", "status", "auto", "scope"] as const;

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

      // Re-scope mode: when both rescope params are present
      if (typedParams.rescope_milestone_id && typedParams.original_issue_ids) {
        const milestoneId = typedParams.rescope_milestone_id;
        const roadmapPath = findRoadmapPath(cwd, milestoneId);
        const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
        const provider = createProvider(config, pi.exec);

        const result = await rescopeIssues({
          provider,
          config,
          milestoneId,
          originalIssueIds: typedParams.original_issue_ids,
          cwd,
          mapPath,
          exec: pi.exec,
          emit: pi.events.emit.bind(pi.events),
        });

        if (result.skipped) {
          return {
            content: [{ type: "text", text: `Milestone ${milestoneId} is already mapped. Re-scope skipped.` }],
            details: result,
          };
        }

        const lines: string[] = [];
        lines.push(`Re-scope complete for ${milestoneId}:`);
        if (result.created) {
          lines.push(`  Created issue #${result.created.issueId} (${result.created.url})`);
        }
        lines.push(`  Closed originals: ${result.closedOriginals.length}`);
        if (result.closeErrors.length > 0) {
          lines.push(`  Close errors: ${result.closeErrors.length}`);
          for (const e of result.closeErrors) {
            lines.push(`    #${e.issueId}: ${e.error}`);
          }
        }

        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: result,
        };
      }

      // Standard import mode
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
      "gsd-issues: manage GitHub/GitLab issues — /issues setup|sync|import|close|pr|auto|scope|status",

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
        const { handleSmartEntry } = await import("./commands/issues.js");
        await handleSmartEntry(args, ctx, pi);
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

        case "auto": {
          const { handleAutoEntry } = await import("./commands/issues.js");
          await handleAutoEntry(args, ctx, pi);
          return;
        }

        case "scope": {
          const { handleSmartEntry } = await import("./commands/issues.js");
          await handleSmartEntry(args, ctx, pi);
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
            `Unknown subcommand: "${subcommand}". Use: setup, sync, import, close, pr, auto, scope, status.`,
            "warning",
          );
      }
    },
  });

  // ── Scope completion detection and auto-mode hooks via agent_end ──
  pi.on("agent_end", async () => {
    const {
      getPreScopeMilestones, clearPreScopeMilestones,
      isAutoRequested, clearAutoRequested,
      isHooksEnabled, isSynced, markSynced, isPrd, markPrd,
      isPromptedFlowEnabled,
    } = await import("./commands/issues.js");
    const { scanMilestones, detectNewMilestones } = await import("./lib/smart-entry.js");

    const cwd = process.cwd();

    // ── Scope completion detection ──
    const before = getPreScopeMilestones();
    if (before !== null) {
      const after = await scanMilestones(cwd);
      const newMilestones = detectNewMilestones(before, after);

      // Always clear the snapshot — scope detection is one-shot
      clearPreScopeMilestones();

      if (newMilestones.length > 0) {
        pi.events.emit("gsd-issues:scope-complete", {
          milestoneIds: newMilestones,
          count: newMilestones.length,
        });

        // Chain into GSD auto-mode when auto was requested
        if (isAutoRequested()) {
          clearAutoRequested();

          pi.events.emit("gsd-issues:auto-start", {
            milestoneIds: newMilestones,
            trigger: "scope-complete",
          });

          pi.sendMessage(
            {
              customType: "gsd-issues:auto-dispatch",
              content: "/gsd auto",
              display: false,
            },
            { triggerTurn: true },
          );
        }
      } else {
        // Scope didn't produce milestones — clear auto flag to prevent stuck state
        if (isAutoRequested()) {
          clearAutoRequested();
        }
      }
    }

    // ── Auto-sync hook: ROADMAP.md exists + unmapped → sync ──
    if (isHooksEnabled()) {
      let config: Config | null = null;
      try {
        config = await loadConfig(cwd);
      } catch {
        // No config — hooks are no-op without config
      }

      if (config) {
        const { loadIssueMap: loadMap } = await import("./lib/issue-map.js");
        const { scanMilestones: scan } = await import("./lib/smart-entry.js");
        const { readFile } = await import("node:fs/promises");

        const allMilestones = await scan(cwd);

        for (const mid of allMilestones) {
          // Check if ROADMAP.md exists
          const roadmapPath = findRoadmapPath(cwd, mid);
          try {
            await readFile(roadmapPath, "utf-8");
          } catch {
            continue; // No ROADMAP.md — skip
          }

          // Check if already synced by hooks
          if (isSynced(mid)) continue;

          // Check if already mapped in ISSUE-MAP.json
          const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
          const existingMap = await loadMap(mapPath);
          if (existingMap.some((e) => e.localId === mid)) continue;

          // Sync this milestone
          try {
            const { syncMilestoneToIssue: syncFn } = await import("./lib/sync.js");
            const { createProvider: createProv } = await import("./lib/provider-factory.js");
            const provider = createProv(config, pi.exec);
            await syncFn({
              provider,
              config: { ...config, milestone: mid },
              milestoneId: mid,
              cwd,
              mapPath,
              exec: pi.exec,
              emit: pi.events.emit.bind(pi.events),
            });
            markSynced(mid);
            pi.events.emit("gsd-issues:auto-sync", { milestoneId: mid });
          } catch (err) {
            console.error(`[gsd-issues] auto-sync hook failed for ${mid}:`, err instanceof Error ? err.message : err);
          }
        }

        // ── Auto-PR hook: SUMMARY.md exists + mapped + auto_pr → PR ──
        for (const mid of allMilestones) {
          // Check if SUMMARY.md exists
          const summaryPath = join(cwd, ".gsd", "milestones", mid, `${mid}-SUMMARY.md`);
          try {
            await readFile(summaryPath, "utf-8");
          } catch {
            continue; // No SUMMARY.md — skip
          }

          // Check if already PR'd by hooks
          if (isPrd(mid)) continue;

          // Check if mapped in ISSUE-MAP.json (must be mapped to create PR)
          const roadmapPath = findRoadmapPath(cwd, mid);
          const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
          const { loadIssueMap: loadMap2 } = await import("./lib/issue-map.js");
          const existingMap = await loadMap2(mapPath);
          if (!existingMap.some((e) => e.localId === mid)) continue;

          // Check auto_pr config (default true)
          if (config.auto_pr === false) continue;

          // Create PR for this milestone
          try {
            const { createMilestonePR: prFn } = await import("./lib/pr.js");
            const { createProvider: createProv } = await import("./lib/provider-factory.js");
            const provider = createProv(config, pi.exec);
            await prFn({
              provider,
              config,
              exec: pi.exec,
              cwd,
              milestoneId: mid,
              mapPath,
              emit: pi.events.emit.bind(pi.events),
            });
            markPrd(mid);
            pi.events.emit("gsd-issues:auto-pr", { milestoneId: mid });
          } catch (err) {
            console.error(`[gsd-issues] auto-pr hook failed for ${mid}:`, err instanceof Error ? err.message : err);
          }
        }
      }
    }

    // ── Prompted flow: confirmation prompts for sync and PR ──
    // Fires when bare `/issues` scope flow was used (not auto-mode).
    // Instead of auto-executing sync/PR, sends messages that let the LLM
    // confirm with the user before running the commands.
    if (isPromptedFlowEnabled() && !isHooksEnabled()) {
      let promptConfig: Config | null = null;
      try {
        promptConfig = await loadConfig(cwd);
      } catch {
        // No config — prompted flow is no-op without config
      }

      if (promptConfig) {
        const { loadIssueMap: loadPromptMap } = await import("./lib/issue-map.js");
        const { scanMilestones: scanPrompt } = await import("./lib/smart-entry.js");
        const { readFile: readPromptFile } = await import("node:fs/promises");

        const promptMilestones = await scanPrompt(cwd);

        // ── Sync prompts: ROADMAP.md exists + unmapped → prompt to sync ──
        for (const mid of promptMilestones) {
          const roadmapPath = findRoadmapPath(cwd, mid);
          try {
            await readPromptFile(roadmapPath, "utf-8");
          } catch {
            continue; // No ROADMAP.md — skip
          }

          if (isSynced(mid)) continue;

          const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
          const existingMap = await loadPromptMap(mapPath);
          if (existingMap.some((e) => e.localId === mid)) continue;

          // Mark BEFORE sending to prevent re-prompting on next agent_end
          markSynced(mid);

          pi.sendMessage(
            {
              customType: "gsd-issues:prompted-sync",
              content: `Milestone ${mid} has been planned (ROADMAP.md created). To create a GitHub tracker issue, run: \`/issues sync ${mid}\`. You can skip this if you don't need issue tracking yet.`,
              display: false,
            },
            { triggerTurn: true },
          );
        }

        // ── PR prompts: SUMMARY.md exists + mapped → prompt to create PR ──
        for (const mid of promptMilestones) {
          const summaryPath = join(cwd, ".gsd", "milestones", mid, `${mid}-SUMMARY.md`);
          try {
            await readPromptFile(summaryPath, "utf-8");
          } catch {
            continue; // No SUMMARY.md — skip
          }

          if (isPrd(mid)) continue;

          const roadmapPath = findRoadmapPath(cwd, mid);
          const mapPath = join(dirname(roadmapPath), "ISSUE-MAP.json");
          const { loadIssueMap: loadPrMap } = await import("./lib/issue-map.js");
          const existingMap = await loadPrMap(mapPath);
          if (!existingMap.some((e) => e.localId === mid)) continue;

          // Mark BEFORE sending to prevent re-prompting on next agent_end
          markPrd(mid);

          pi.sendMessage(
            {
              customType: "gsd-issues:prompted-pr",
              content: `Milestone ${mid} is complete (SUMMARY.md created) and has a tracked issue. To create a completion PR, run: \`/issues pr ${mid}\`. You can skip this if a PR isn't needed.`,
              display: false,
            },
            { triggerTurn: true },
          );
        }
      }
    }
  });
}
