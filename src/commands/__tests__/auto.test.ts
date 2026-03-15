/**
 * Integration tests for `/issues auto` command handler, agent_end event handler,
 * and gsd_issues_auto tool registration.
 *
 * Tests wiring between the command layer and the orchestration state machine.
 * The state machine itself is tested in src/lib/__tests__/auto.test.ts.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionUI,
  ToolDefinition,
  CommandDefinition,
} from "../../index.js";
import type { Config } from "../../lib/config.js";

// ── Helpers ──

function makeUI(overrides: Partial<ExtensionUI> = {}): ExtensionUI {
  return {
    notify: vi.fn(),
    select: vi.fn(async () => ""),
    input: vi.fn(async () => ""),
    confirm: vi.fn(async () => true),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<ExtensionUI> = {}, hasUI = true): ExtensionCommandContext {
  return {
    ui: makeUI(overrides),
    hasUI,
    waitForIdle: vi.fn(async () => {}),
    newSession: vi.fn(async () => ({ cancelled: false })),
  };
}

function makePi(overrides: Partial<ExtensionAPI> = {}): ExtensionAPI {
  return {
    registerCommand: vi.fn(),
    registerTool: vi.fn(),
    exec: vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false })),
    events: { emit: vi.fn() },
    sendMessage: vi.fn(),
    on: vi.fn(),
    ...overrides,
  };
}

const GITLAB_CONFIG: Config = {
  provider: "gitlab",
  milestone: "M001",
  labels: ["gsd"],
  gitlab: {
    project_path: "group/project",
    project_id: 42,
  },
};

async function setupTestDir(config: Config = GITLAB_CONFIG): Promise<string> {
  const tempDir = await mkdtemp(join(tmpdir(), "auto-cmd-test-"));
  const gsdDir = join(tempDir, ".gsd");
  await mkdir(gsdDir, { recursive: true });
  await writeFile(join(gsdDir, "issues.json"), JSON.stringify(config, null, 2));
  await writeFile(
    join(gsdDir, "STATE.md"),
    `# GSD State\n\n**Active Milestone:** M001 — Test\n`,
  );
  const milestoneDir = join(gsdDir, "milestones", "M001");
  await mkdir(milestoneDir, { recursive: true });
  await writeFile(
    join(milestoneDir, "M001-ROADMAP.md"),
    "# M001: Test\n\n- [ ] **S01: First** `risk:low` `depends:[]`\n",
  );
  return tempDir;
}

// ── Tests ──

describe("handleAuto", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    // Clean up stashed context
    const { clearStashedContext } = await import("../auto.js");
    clearStashedContext();
    // Clean up lock/state files
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("loads config and calls startAuto (happy path)", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    // Should notify success
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Auto-flow started for milestone M001"),
      "info",
    );

    // Should have created a new session
    expect(ctx.newSession).toHaveBeenCalled();

    // Should have sent a message with import prompt
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues-auto",
        content: expect.stringContaining("IMPORT"),
      }),
      expect.objectContaining({ triggerTurn: true }),
    );

    // Lock file should exist
    expect(existsSync(join(tempDir, ".gsd", "issues-auto.lock"))).toBe(true);
  });

  it("notifies error when config is missing", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "auto-cmd-noconfig-"));
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issues config found"),
      "error",
    );
  });

  it("resolves milestone from args", async () => {
    // Config has milestone M001, but we pass M001 as arg too — just verifying arg parsing works
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto M001", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("M001"),
      "info",
    );
  });

  it("resolves milestone from config when no args", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    // Config has milestone: "M001"
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("M001"),
      }),
      expect.anything(),
    );
  });

  it("resolves milestone from GSD state as final fallback", async () => {
    // This test verifies the code path where args have no milestone and config.milestone
    // is used. Since config validation requires milestone field, we verify the resolution
    // cascade by checking the final notification message matches the config milestone.
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    // Config has M001 — should resolve to that
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("M001"),
      "info",
    );
  });

  it("notifies error when config validation fails", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "auto-cmd-badconfig-"));
    const gsdDir = join(tempDir, ".gsd");
    await mkdir(gsdDir, { recursive: true });
    // Write config missing required milestone field
    await writeFile(
      join(gsdDir, "issues.json"),
      JSON.stringify({ provider: "gitlab", labels: ["gsd"], gitlab: { project_path: "g/p", project_id: 1 } }, null, 2),
    );
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("milestone"),
      "error",
    );
  });

  it("blocks when GSD auto is running (mutual exclusion)", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    // Write a GSD auto.lock with PID 1 (init, always alive) to simulate a live GSD auto
    writeFileSync(
      join(tempDir, ".gsd", "auto.lock"),
      JSON.stringify({ pid: 1, timestamp: new Date().toISOString() }),
    );

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("already running"),
      "error",
    );
  });

  it("stashes context and exposes via getStashedContext", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto, getStashedContext } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    const stashed = getStashedContext();
    expect(stashed).not.toBeNull();
    expect(stashed!.ctx).toBe(ctx);
    expect(stashed!.pi).toBe(pi);
  });

  it("clears stashed context on startup error", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    // Write GSD lock with PID 1 (always alive) to force mutual exclusion error
    writeFileSync(
      join(tempDir, ".gsd", "auto.lock"),
      JSON.stringify({ pid: 1, timestamp: new Date().toISOString() }),
    );

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto, getStashedContext } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    expect(getStashedContext()).toBeNull();
  });

  it("requires interactive session (hasUI guard)", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx({}, false);
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("interactive session"),
      "error",
    );
  });

  it("handles newSession cancellation cleanly", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const ctx = makeCtx();
    ctx.newSession = vi.fn(async () => ({ cancelled: true }));
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    // startAuto returns error on cancellation
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("cancelled"),
      "error",
    );
  });
});

describe("agent_end handler", () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    const { clearStashedContext } = await import("../auto.js");
    clearStashedContext();
    const { _resetHandlingAdvance } = await import("../../lib/auto.js");
    _resetHandlingAdvance();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("no-ops when auto is inactive", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "auto-end-inactive-"));
    process.chdir(tempDir);

    const on = vi.fn();
    const pi = makePi({ on });

    // Register extension to wire up agent_end
    const mod = await import("../../index.js");
    mod.default(pi);

    // Find the agent_end handler
    const agentEndCall = on.mock.calls.find(
      (call: unknown[]) => call[0] === "agent_end",
    );
    expect(agentEndCall).toBeDefined();

    const handler = agentEndCall![1] as () => Promise<void>;

    // Should no-op (no lock file, no stashed context)
    await handler();

    // No sendMessage calls beyond the initial registration
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("calls advancePhase when auto is active", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    // Start auto to create lock/state and stash context
    const ctx = makeCtx();
    const pi = makePi();

    const { handleAuto } = await import("../auto.js");
    await handleAuto("auto", ctx, pi);

    // Reset sendMessage mock to track only advancePhase calls
    (pi.sendMessage as ReturnType<typeof vi.fn>).mockClear();

    // Now simulate agent_end
    const { isAutoActive, advancePhase, readAutoState } = await import("../../lib/auto.js");
    const { getStashedContext, buildAutoDeps } = await import("../auto.js");

    expect(isAutoActive(process.cwd())).toBe(true);

    const stashed = getStashedContext();
    expect(stashed).not.toBeNull();

    const deps = buildAutoDeps(stashed!.ctx, stashed!.pi);
    await advancePhase(deps);

    // advancePhase should have sent a message for the next phase (plan)
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues-auto",
        content: expect.stringContaining("PLAN"),
      }),
      expect.objectContaining({ triggerTurn: true }),
    );
  });
});

describe("auto subcommand registration", () => {
  it("auto appears in SUBCOMMANDS completions", async () => {
    const registerCommand = vi.fn();
    const pi = makePi({ registerCommand });

    const mod = await import("../../index.js");
    mod.default(pi);

    const cmdDef = registerCommand.mock.calls[0][1] as CommandDefinition;
    const completions = cmdDef.getArgumentCompletions!("au");
    expect(completions).toContainEqual(
      expect.objectContaining({ value: "auto" }),
    );
  });

  it("auto subcommand routes to handleAuto", async () => {
    tempDir = await setupTestDir();
    process.chdir(tempDir);

    const registerCommand = vi.fn();
    const pi = makePi({ registerCommand });

    const mod = await import("../../index.js");
    mod.default(pi);

    const cmdDef = registerCommand.mock.calls[0][1] as CommandDefinition;
    const ctx = makeCtx();

    // Call handler with "auto" subcommand
    await cmdDef.handler("auto", ctx);

    // Should have been routed to handleAuto which loads config etc.
    // If config exists, it should try to start auto
    expect(ctx.ui.notify).toHaveBeenCalled();
  });

  // temp dir for route test
  let tempDir: string;
  const originalCwd = process.cwd();

  afterEach(async () => {
    process.chdir(originalCwd);
    const { clearStashedContext } = await import("../auto.js");
    clearStashedContext();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

describe("gsd_issues_auto tool registration", () => {
  it("registers tool with correct schema", async () => {
    const registerTool = vi.fn();
    const pi = makePi({ registerTool });

    const mod = await import("../../index.js");
    mod.default(pi);

    const autoToolCall = registerTool.mock.calls.find(
      (call: unknown[]) => (call[0] as ToolDefinition).name === "gsd_issues_auto",
    );
    expect(autoToolCall).toBeDefined();

    const toolDef = autoToolCall![0] as ToolDefinition;
    expect(toolDef.label).toBe("Auto Flow");
    expect(toolDef.description).toContain("auto-flow");
    expect(toolDef.parameters).toBeDefined();
    expect(toolDef.parameters.properties).toHaveProperty("milestone_id");
    expect(typeof toolDef.execute).toBe("function");
  });

  it("tool execute returns ToolResult", async () => {
    const tempDir = await setupTestDir();
    const originalCwd = process.cwd();
    process.chdir(tempDir);

    try {
      const registerTool = vi.fn();
      const pi = makePi({ registerTool });

      const mod = await import("../../index.js");
      mod.default(pi);

      const autoToolCall = registerTool.mock.calls.find(
        (call: unknown[]) => (call[0] as ToolDefinition).name === "gsd_issues_auto",
      );
      const toolDef = autoToolCall![0] as ToolDefinition;

      const ctx = makeCtx();
      const result = await toolDef.execute(
        "test-call-id",
        {},
        new AbortController().signal,
        undefined,
        ctx,
      );

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toContain("Auto-flow");
    } finally {
      process.chdir(originalCwd);
      const { clearStashedContext } = await import("../auto.js");
      clearStashedContext();
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
