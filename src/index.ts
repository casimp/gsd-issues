/**
 * gsd-issues extension entry point.
 *
 * Registers the `/issues` command with subcommand routing.
 * Subcommands: setup, sync, import, close, status.
 *
 * `setup` routes to the setup handler (src/commands/setup.ts).
 * Other subcommands are stubbed with "not yet implemented" notifications.
 */

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

export interface ExtensionAPI {
  registerCommand(name: string, definition: CommandDefinition): void;
}

// ── Subcommand list ──

const SUBCOMMANDS = ["setup", "sync", "import", "close", "status"] as const;

// ── Extension factory ──

export default function (pi: ExtensionAPI): void {
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

        case "sync":
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
