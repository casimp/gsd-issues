/**
 * Smart entry command handler — `/issues` with no subcommand.
 *
 * Detects project state and offers context-appropriate choices:
 * - Active GSD milestone → notify resume info
 * - Existing milestones without GSD state → offer to resume one
 * - No milestones → "Import from tracker" or "Start fresh"
 *
 * Mirrors GSD's showSmartEntry() pattern: detect state → offer choices → dispatch.
 *
 * Diagnostics:
 * - Scope prompt content visible via pi.sendMessage — inspectable in tests
 * - Pre-scope milestone snapshot stored for completion detection
 * - gsd-issues:scope-complete event emitted when new CONTEXT.md detected
 */

import type {
  ExtensionCommandContext,
  ExtensionAPI,
} from "../index.js";
import { loadConfig, type Config } from "../lib/config.js";
import { readGSDState } from "../lib/state.js";
import { scanMilestones, buildScopePrompt, detectNewMilestones } from "../lib/smart-entry.js";
import { importIssues } from "../lib/import.js";
import { createProvider } from "../lib/provider-factory.js";

/**
 * Shared state for scope completion detection.
 * The agent_end handler reads preScopeMilestones to compare with post-scope state.
 */
let preScopeMilestones: string[] | null = null;

/** Expose for agent_end handler */
export function getPreScopeMilestones(): string[] | null {
  return preScopeMilestones;
}

/** Clear after detection completes */
export function clearPreScopeMilestones(): void {
  preScopeMilestones = null;
}

/**
 * Auto-mode flag — set when `/issues auto` is used.
 * The agent_end handler checks this to decide whether to chain into `/gsd auto`.
 */
let _autoRequested = false;

// ── Hook state for auto-sync and auto-PR ──
// Tracks which milestones have been synced/PR'd by agent_end hooks to prevent duplicates.
// Cleared between sessions via clearHookState().

const _syncedMilestones = new Set<string>();
const _prdMilestones = new Set<string>();
let _hooksEnabled = false;

/** Check if a milestone has been synced by hooks */
export function isSynced(id: string): boolean {
  return _syncedMilestones.has(id);
}

/** Check if a milestone has been PR'd by hooks */
export function isPrd(id: string): boolean {
  return _prdMilestones.has(id);
}

/** Check if hooks are enabled (auto-mode active) */
export function isHooksEnabled(): boolean {
  return _hooksEnabled;
}

/** Clear all hook state — call between tests and on session end */
export function clearHookState(): void {
  _syncedMilestones.clear();
  _prdMilestones.clear();
  _hooksEnabled = false;
  _promptedFlowEnabled = false;
}

/** Mark a milestone as synced by hooks (also used internally) */
export function markSynced(id: string): void {
  _syncedMilestones.add(id);
}

/** Mark a milestone as PR'd by hooks (also used internally) */
export function markPrd(id: string): void {
  _prdMilestones.add(id);
}

/** Check if auto-mode was requested */
export function isAutoRequested(): boolean {
  return _autoRequested;
}

/** Clear auto flag after GSD auto is dispatched or on cleanup */
export function clearAutoRequested(): void {
  _autoRequested = false;
}

// ── Prompted flow flag ──
// Set when `/issues` (bare) enters the scope flow. Tells agent_end to send
// confirmation prompts instead of auto-firing sync/PR.
let _promptedFlowEnabled = false;

/** Check if prompted flow is active (scope via bare `/issues`) */
export function isPromptedFlowEnabled(): boolean {
  return _promptedFlowEnabled;
}

/** Enable prompted flow — called from handleSmartEntry when not in auto mode */
export function setPromptedFlowEnabled(): void {
  _promptedFlowEnabled = true;
}

/** Disable prompted flow */
export function clearPromptedFlowEnabled(): void {
  _promptedFlowEnabled = false;
}

/**
 * Handle `/issues` with no subcommand — the smart entry flow.
 */
export async function handleSmartEntry(
  _args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  const cwd = process.cwd();

  // Load config — gracefully handle missing config
  let config: Config | null = null;
  try {
    config = await loadConfig(cwd);
  } catch {
    // Config may not exist yet — that's fine for smart entry
  }

  // Check GSD state — if active milestone exists, notify resume info
  const state = await readGSDState(cwd);
  if (state) {
    ctx.ui.notify(
      `Active milestone: ${state.milestoneId}. Use /issues sync, /issues pr, or /issues close to manage it.`,
      "info",
    );
    return;
  }

  // Scan existing milestones
  const existingMilestones = await scanMilestones(cwd);

  // If milestones exist but no GSD state, offer to resume one
  if (existingMilestones.length > 0) {
    const options = existingMilestones.map((id) => ({
      value: id,
      label: id,
    }));
    options.push({ value: "__new__", label: "Start new milestone" });

    const choice = await ctx.ui.select(
      "Existing milestones found. Resume one or start new?",
      options,
    );

    if (choice !== "__new__") {
      ctx.ui.notify(
        `Selected milestone ${choice}. Use /issues sync to push it to the tracker.`,
        "info",
      );
      return;
    }
    // Fall through to new milestone flow
  }

  // No milestones (or user chose "new") — offer import or fresh
  const entryChoice = await ctx.ui.select(
    "How would you like to start?",
    [
      { value: "import", label: "Import from tracker" },
      { value: "fresh", label: "Start fresh" },
    ],
  );

  let scopeDescription: string | undefined;
  let importContext: string | undefined;

  if (entryChoice === "import") {
    // Import from tracker — need config for provider access
    if (!config) {
      ctx.ui.notify(
        "No issues config found. Run /issues setup first to configure your tracker.",
        "warning",
      );
      return;
    }

    try {
      const provider = createProvider(config, pi.exec);
      const issues = await provider.listIssues({ state: "open" });
      const result = importIssues({
        issues,
        emit: pi.events.emit.bind(pi.events),
      });
      importContext = result.markdown;

      if (result.issueCount === 0) {
        ctx.ui.notify("No open issues found in tracker. Switching to fresh start.", "info");
        // Fall through to prompt for description
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(`Failed to import issues: ${msg}. Switching to fresh start.`, "warning");
      // Fall through to prompt for description
    }
  }

  if (entryChoice === "fresh" || !importContext) {
    // Prompt user for work description
    scopeDescription = await ctx.ui.input(
      "Describe the work you want to scope into a milestone:",
    );

    if (!scopeDescription || scopeDescription.trim().length === 0) {
      ctx.ui.notify("No description provided. Scope cancelled.", "info");
      return;
    }
  }

  // Record pre-scope milestone snapshot for completion detection
  // Enable prompted flow so agent_end sends confirmation prompts (not in auto mode)
  if (!_autoRequested) {
    _promptedFlowEnabled = true;
  }
  preScopeMilestones = await scanMilestones(cwd);

  // Build and send scope prompt
  const maxSlices = config?.max_slices_per_milestone;
  const prompt = buildScopePrompt({
    description: scopeDescription,
    importContext,
    maxSlices,
  });

  pi.sendMessage(
    {
      customType: "gsd-issues:scope-prompt",
      content: prompt,
      display: false,
    },
    { triggerTurn: true },
  );

  ctx.ui.notify("Scope prompt sent — the agent will create your milestone.", "info");
}

/**
 * Handle `/issues auto` — smart entry then GSD auto-mode.
 *
 * Sets the auto flag so the agent_end handler knows to chain into `/gsd auto`
 * after scope completion. If a milestone already exists (resume path), skips
 * scope and sends `/gsd auto` directly.
 *
 * Diagnostics:
 * - gsd-issues:auto-start event emitted when /gsd auto is dispatched
 * - isAutoRequested() returns true while auto flow is in progress
 */
export async function handleAutoEntry(
  args: string,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
): Promise<void> {
  // Clear prompted flow — auto mode uses hooks, not prompts
  _promptedFlowEnabled = false;
  const cwd = process.cwd();

  // Check for existing milestones — resume path
  const existingMilestones = await scanMilestones(cwd);

  if (existingMilestones.length > 0) {
    // Resume path: skip scope, start GSD auto directly
    _autoRequested = false; // No need for the flag — dispatching immediately
    _hooksEnabled = true;

    pi.events.emit("gsd-issues:auto-start", {
      milestoneIds: existingMilestones,
      trigger: "resume",
    });

    pi.sendMessage(
      {
        customType: "gsd-issues:auto-dispatch",
        content: "/gsd auto",
        display: false,
      },
      { triggerTurn: true },
    );

    ctx.ui.notify(
      `Existing milestone${existingMilestones.length > 1 ? "s" : ""} found (${existingMilestones.join(", ")}). Starting GSD auto-mode.`,
      "info",
    );
    return;
  }

  // No milestones — run smart entry first, then auto after scope completes
  _autoRequested = true;
  _hooksEnabled = true;
  await handleSmartEntry(args, ctx, pi);
}
