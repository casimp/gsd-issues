import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type {
  ExtensionCommandContext,
  ExtensionAPI,
  ExtensionUI,
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

function makeCtx(uiOverrides: Partial<ExtensionUI> = {}): ExtensionCommandContext {
  return {
    ui: makeUI(uiOverrides),
    hasUI: true,
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

const GITHUB_CONFIG: Config = {
  provider: "github",
  labels: ["gsd"],
  github: { repo: "owner/repo" },
};

// ── Tests ──

describe("issues command handleSmartEntry", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "issues-cmd-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    // Clear module-level state between tests
    const { clearPreScopeMilestones, clearAutoRequested } = await import("../../commands/issues.js");
    clearPreScopeMilestones();
    clearAutoRequested();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("notifies resume info when GSD state has active milestone", async () => {
    // Write STATE.md with active milestone
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "STATE.md"),
      "**Active Milestone:** M001 — Test\n",
    );

    const ctx = makeCtx();
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Active milestone: M001"),
      "info",
    );
    // Should NOT send scope prompt
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("offers to resume existing milestones when found without GSD state", async () => {
    // Create milestone with CONTEXT.md but no STATE.md
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001\n");

    const ctx = makeCtx({
      select: vi.fn(async () => "M001"),
    });
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Should show select with M001 option
    expect(ctx.ui.select).toHaveBeenCalledWith(
      expect.stringContaining("Existing milestones"),
      expect.arrayContaining([
        expect.objectContaining({ value: "M001" }),
      ]),
    );
    // Should notify about selected milestone
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Selected milestone M001"),
      "info",
    );
  });

  it("starts fresh when user chooses 'Start fresh'", async () => {
    // No milestones, no state, no config
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Build a login system"),
    });
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Should ask for description
    expect(ctx.ui.input).toHaveBeenCalledWith(
      expect.stringContaining("Describe the work"),
    );

    // Should send scope prompt via sendMessage
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues:scope-prompt",
        content: expect.stringContaining("Build a login system"),
      }),
      expect.objectContaining({ triggerTurn: true }),
    );
  });

  it("cancels scope when no description provided", async () => {
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => ""),
    });
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No description provided"),
      "info",
    );
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("import path: warns when no config exists", async () => {
    const ctx = makeCtx({
      select: vi.fn(async () => "import"),
    });
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No issues config"),
      "warning",
    );
    expect(pi.sendMessage).not.toHaveBeenCalled();
  });

  it("scope prompt includes sizing constraint from config", async () => {
    // Write config with max_slices_per_milestone
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "issues.json"),
      JSON.stringify({
        provider: "github",
        max_slices_per_milestone: 4,
        github: { repo: "owner/repo" },
      }),
    );

    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Build auth"),
    });
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Scope prompt should include sizing constraint
    const sentContent = (pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.content;
    expect(sentContent).toContain("4 slices or fewer");
  });

  it("records pre-scope milestones for completion detection", async () => {
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Build something"),
    });
    const pi = makePi();

    const { handleSmartEntry, getPreScopeMilestones } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Pre-scope milestones should be recorded (empty since no milestones exist)
    expect(getPreScopeMilestones()).toEqual([]);
  });

  it("existing milestone flow: falls through to new milestone when __new__ selected", async () => {
    // Create milestone with CONTEXT.md
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001\n");

    const ctx = makeCtx({
      // First select: existing milestones → choose new
      // Second select: import or fresh → choose fresh
      select: vi.fn()
        .mockResolvedValueOnce("__new__")
        .mockResolvedValueOnce("fresh"),
      input: vi.fn(async () => "New work"),
    });
    const pi = makePi();

    const { handleSmartEntry } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Should have gone through to scope prompt
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues:scope-prompt",
        content: expect.stringContaining("New work"),
      }),
      expect.objectContaining({ triggerTurn: true }),
    );
  });
});

describe("issues command scope completion detection", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "issues-scope-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    const { clearPreScopeMilestones, clearAutoRequested } = await import("../../commands/issues.js");
    clearPreScopeMilestones();
    clearAutoRequested();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("agent_end handler detects new milestones and emits scope-complete", async () => {
    const pi = makePi();

    // Register the extension to get the agent_end handler wired
    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    // Extract the agent_end handler from pi.on calls
    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls;
    const agentEndCall = onCalls.find(([event]) => event === "agent_end");
    expect(agentEndCall).toBeDefined();
    const agentEndHandler = agentEndCall![1] as () => Promise<void>;

    // Simulate: set pre-scope state (no milestones before)
    const { clearPreScopeMilestones } = await import("../../commands/issues.js");

    // We need to set preScopeMilestones directly — trigger via handleSmartEntry
    // Instead, let's use the module-level setter through the flow
    // Import and manually set pre-scope milestones via a scope prompt flow
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Test work"),
    });

    const { handleSmartEntry, getPreScopeMilestones } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Verify pre-scope state was set
    expect(getPreScopeMilestones()).toEqual([]);

    // Simulate: agent creates a milestone
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001 — Context\n");

    // Run the agent_end handler
    await agentEndHandler();

    // Should have emitted scope-complete
    expect(pi.events.emit).toHaveBeenCalledWith(
      "gsd-issues:scope-complete",
      { milestoneIds: ["M001"], count: 1 },
    );

    // Pre-scope state should be cleared
    expect(getPreScopeMilestones()).toBeNull();
  });

  it("agent_end handler does nothing when no scope in progress", async () => {
    const pi = makePi();

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls;
    const agentEndCall = onCalls.find(([event]) => event === "agent_end");
    const agentEndHandler = agentEndCall![1] as () => Promise<void>;

    // No pre-scope state set — should be a no-op
    await agentEndHandler();

    // events.emit should not have been called with scope-complete
    const emitCalls = (pi.events.emit as ReturnType<typeof vi.fn>).mock.calls;
    const scopeCalls = emitCalls.filter(([e]) => e === "gsd-issues:scope-complete");
    expect(scopeCalls).toHaveLength(0);
  });

  it("agent_end handler clears pre-scope state even when no new milestones", async () => {
    const pi = makePi();

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls;
    const agentEndCall = onCalls.find(([event]) => event === "agent_end");
    const agentEndHandler = agentEndCall![1] as () => Promise<void>;

    // Trigger scope flow to set pre-scope state
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Some work"),
    });
    const { handleSmartEntry, getPreScopeMilestones } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    expect(getPreScopeMilestones()).toEqual([]);

    // Agent_end without creating any milestone
    await agentEndHandler();

    // Pre-scope state should be cleared
    expect(getPreScopeMilestones()).toBeNull();

    // scope-complete should NOT be emitted
    const emitCalls = (pi.events.emit as ReturnType<typeof vi.fn>).mock.calls;
    const scopeCalls = emitCalls.filter(([e]) => e === "gsd-issues:scope-complete");
    expect(scopeCalls).toHaveLength(0);
  });
});

describe("issues command handleAutoEntry", () => {
  let tmpDir: string;
  let origCwd: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "issues-auto-"));
    origCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(async () => {
    process.chdir(origCwd);
    const { clearPreScopeMilestones, clearAutoRequested } = await import("../../commands/issues.js");
    clearPreScopeMilestones();
    clearAutoRequested();
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("auto entry with no milestones: sets auto flag and runs smart entry", async () => {
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Build a dashboard"),
    });
    const pi = makePi();

    const { handleAutoEntry, isAutoRequested, getPreScopeMilestones } = await import("../../commands/issues.js");
    await handleAutoEntry("", ctx, pi);

    // Auto flag should be set
    expect(isAutoRequested()).toBe(true);

    // Pre-scope milestones recorded (smart entry ran)
    expect(getPreScopeMilestones()).toEqual([]);

    // Scope prompt should have been sent
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues:scope-prompt",
        content: expect.stringContaining("Build a dashboard"),
      }),
      expect.objectContaining({ triggerTurn: true }),
    );
  });

  it("auto entry with existing milestone: skips scope and sends /gsd auto directly", async () => {
    // Create existing milestone
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001\n");

    const ctx = makeCtx();
    const pi = makePi();

    const { handleAutoEntry, isAutoRequested } = await import("../../commands/issues.js");
    await handleAutoEntry("", ctx, pi);

    // Auto flag should NOT be set (dispatched immediately)
    expect(isAutoRequested()).toBe(false);

    // Should send /gsd auto directly
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues:auto-dispatch",
        content: "/gsd auto",
      }),
      expect.objectContaining({ triggerTurn: true }),
    );

    // Should emit auto-start with resume trigger
    expect(pi.events.emit).toHaveBeenCalledWith(
      "gsd-issues:auto-start",
      expect.objectContaining({ trigger: "resume", milestoneIds: ["M001"] }),
    );

    // Should notify about existing milestone
    expect(ctx.ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Starting GSD auto-mode"),
      "info",
    );
  });

  it("auto flag is cleared after agent_end detects scope completion", async () => {
    const pi = makePi();

    // Wire up the extension to get agent_end handler
    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls;
    const agentEndCall = onCalls.find(([event]) => event === "agent_end");
    expect(agentEndCall).toBeDefined();
    const agentEndHandler = agentEndCall![1] as () => Promise<void>;

    // Run auto entry (no milestones → smart entry path)
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Build tests"),
    });

    const { handleAutoEntry, isAutoRequested, getPreScopeMilestones } = await import("../../commands/issues.js");
    await handleAutoEntry("", ctx, pi);

    expect(isAutoRequested()).toBe(true);
    expect(getPreScopeMilestones()).toEqual([]);

    // Simulate: agent creates a milestone
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001 — Context\n");

    // Run agent_end handler
    await agentEndHandler();

    // Auto flag should be cleared
    expect(isAutoRequested()).toBe(false);

    // Should have emitted scope-complete
    expect(pi.events.emit).toHaveBeenCalledWith(
      "gsd-issues:scope-complete",
      { milestoneIds: ["M001"], count: 1 },
    );

    // Should have emitted auto-start
    expect(pi.events.emit).toHaveBeenCalledWith(
      "gsd-issues:auto-start",
      expect.objectContaining({ trigger: "scope-complete", milestoneIds: ["M001"] }),
    );

    // Should have sent /gsd auto
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues:auto-dispatch",
        content: "/gsd auto",
      }),
      expect.objectContaining({ triggerTurn: true }),
    );
  });

  it("non-auto path does not trigger GSD auto on scope completion", async () => {
    const pi = makePi();

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls;
    const agentEndCall = onCalls.find(([event]) => event === "agent_end");
    const agentEndHandler = agentEndCall![1] as () => Promise<void>;

    // Run REGULAR smart entry (not auto)
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Non-auto work"),
    });

    const { handleSmartEntry, isAutoRequested } = await import("../../commands/issues.js");
    await handleSmartEntry("", ctx, pi);

    // Auto flag should NOT be set
    expect(isAutoRequested()).toBe(false);

    // Simulate: agent creates a milestone
    const mDir = join(tmpDir, ".gsd", "milestones", "M002");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M002-CONTEXT.md"), "# M002 — Context\n");

    // Run agent_end handler
    await agentEndHandler();

    // Should emit scope-complete but NOT auto-start
    expect(pi.events.emit).toHaveBeenCalledWith(
      "gsd-issues:scope-complete",
      { milestoneIds: ["M002"], count: 1 },
    );

    // Should NOT have sent /gsd auto
    const sendCalls = (pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    const autoDispatches = sendCalls.filter(
      ([msg]) => msg?.customType === "gsd-issues:auto-dispatch",
    );
    expect(autoDispatches).toHaveLength(0);
  });

  it("auto flag cleared when scope completes with no new milestones", async () => {
    const pi = makePi();

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    const onCalls = (pi.on as ReturnType<typeof vi.fn>).mock.calls;
    const agentEndCall = onCalls.find(([event]) => event === "agent_end");
    const agentEndHandler = agentEndCall![1] as () => Promise<void>;

    // Run auto entry
    const ctx = makeCtx({
      select: vi.fn(async () => "fresh"),
      input: vi.fn(async () => "Work that fails to produce milestones"),
    });

    const { handleAutoEntry, isAutoRequested } = await import("../../commands/issues.js");
    await handleAutoEntry("", ctx, pi);

    expect(isAutoRequested()).toBe(true);

    // Agent_end fires but no milestones created
    await agentEndHandler();

    // Auto flag should be cleared to prevent stuck state
    expect(isAutoRequested()).toBe(false);

    // Should NOT have dispatched /gsd auto
    const sendCalls = (pi.sendMessage as ReturnType<typeof vi.fn>).mock.calls;
    const autoDispatches = sendCalls.filter(
      ([msg]) => msg?.customType === "gsd-issues:auto-dispatch",
    );
    expect(autoDispatches).toHaveLength(0);
  });

  it("/issues auto routes to handleAutoEntry via index.ts command handler", async () => {
    const pi = makePi();

    const extensionFactory = (await import("../../index.js")).default;
    extensionFactory(pi);

    // Get the registered command handler
    const registerCalls = (pi.registerCommand as ReturnType<typeof vi.fn>).mock.calls;
    const issuesCall = registerCalls.find(([name]) => name === "issues");
    expect(issuesCall).toBeDefined();
    const handler = issuesCall![1].handler as (args: string, ctx: ExtensionCommandContext) => Promise<void>;

    // Create a milestone so we hit the resume path (simplest to verify routing)
    const mDir = join(tmpDir, ".gsd", "milestones", "M001");
    await mkdir(mDir, { recursive: true });
    await writeFile(join(mDir, "M001-CONTEXT.md"), "# M001\n");

    const ctx = makeCtx();
    await handler("auto", ctx);

    // Should have sent /gsd auto (resume path)
    expect(pi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        customType: "gsd-issues:auto-dispatch",
        content: "/gsd auto",
      }),
      expect.objectContaining({ triggerTurn: true }),
    );
  });
});
