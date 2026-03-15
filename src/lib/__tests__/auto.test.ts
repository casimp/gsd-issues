import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync, existsSync, readFileSync, unlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  writeAutoLock,
  readAutoLock,
  clearAutoLock,
  isGSDAutoActive,
  writeAutoState,
  readAutoState,
  startAuto,
  advancePhase,
  stopAuto,
  isAutoActive,
  _prompts,
  _getHandlingAdvance,
  _resetHandlingAdvance,
  type AutoDeps,
  type AutoState,
  type AutoPhase,
} from "../auto.js";

// ── Test helpers ──

function makeTmpDir(): string {
  const dir = join(tmpdir(), `auto-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, ".gsd"), { recursive: true });
  return dir;
}

function createMockDeps(cwd: string, overrides?: Partial<AutoDeps>): AutoDeps {
  return {
    sendMessage: vi.fn(),
    newSession: vi.fn().mockResolvedValue({ cancelled: false }),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    validateMilestoneSize: vi.fn().mockResolvedValue({
      valid: true,
      sliceCount: 3,
      limit: 5,
      mode: "best_try" as const,
      milestoneId: "M001",
    }),
    loadConfig: vi.fn().mockResolvedValue({
      provider: "github",
      milestone: "M001",
      max_slices_per_milestone: 5,
      sizing_mode: "best_try",
    }),
    emit: vi.fn(),
    readFile: vi.fn().mockReturnValue(""),
    writeFile: vi.fn(),
    existsSync: vi.fn().mockReturnValue(false),
    unlinkSync: vi.fn(),
    cwd,
    ...overrides,
  };
}

// ── Tests ──

describe("auto orchestration", () => {
  let cwd: string;

  beforeEach(() => {
    cwd = makeTmpDir();
    _resetHandlingAdvance();
  });

  afterEach(() => {
    try {
      rmSync(cwd, { recursive: true, force: true });
    } catch { /* best effort */ }
  });

  // (a) Lock file write/read/clear round-trip
  it("lock file write/read/clear round-trip", () => {
    writeAutoLock(cwd, "import", "M001");
    const lock = readAutoLock(cwd);
    expect(lock).not.toBeNull();
    expect(lock!.phase).toBe("import");
    expect(lock!.milestoneId).toBe("M001");
    expect(lock!.pid).toBe(process.pid);
    expect(lock!.timestamp).toBeTruthy();

    clearAutoLock(cwd);
    expect(readAutoLock(cwd)).toBeNull();
  });

  // (b) State persistence round-trip
  it("state persistence round-trip", () => {
    const state: AutoState = {
      phase: "plan",
      milestoneId: "M002",
      splitAttempts: 1,
      startedAt: "2026-01-01T00:00:00.000Z",
    };
    writeAutoState(cwd, state);
    const read = readAutoState(cwd);
    expect(read).toEqual(state);
  });

  // (c) readAutoState returns null for missing file
  it("readAutoState returns null for missing file", () => {
    expect(readAutoState(cwd)).toBeNull();
  });

  // (d) readAutoLock returns null for missing file
  it("readAutoLock returns null for missing file", () => {
    expect(readAutoLock(cwd)).toBeNull();
  });

  // (e) isGSDAutoActive returns false when no lock exists
  it("isGSDAutoActive returns false when no lock exists", () => {
    expect(isGSDAutoActive(cwd)).toBe(false);
  });

  // (f) isGSDAutoActive returns false for stale lock (dead PID)
  it("isGSDAutoActive returns false for stale GSD lock (dead PID)", () => {
    const lockPath = join(cwd, ".gsd", "auto.lock");
    // Use a PID that almost certainly doesn't exist
    writeFileSync(lockPath, JSON.stringify({ pid: 999999999 }), "utf-8");
    expect(isGSDAutoActive(cwd)).toBe(false);
  });

  // (g) isGSDAutoActive returns false when PID is our own
  it("isGSDAutoActive returns false when PID matches current process", () => {
    const lockPath = join(cwd, ".gsd", "auto.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: process.pid }), "utf-8");
    expect(isGSDAutoActive(cwd)).toBe(false);
  });

  // (h) startAuto blocks when GSD auto.lock has live PID
  it("startAuto blocks when GSD auto.lock has live PID", async () => {
    // Write a GSD lock with PID 1 (init, always alive on Linux)
    const lockPath = join(cwd, ".gsd", "auto.lock");
    writeFileSync(lockPath, JSON.stringify({ pid: 1 }), "utf-8");

    const deps = createMockDeps(cwd);
    const result = await startAuto("M001", deps);
    expect(result).toContain("already running");
    expect(deps.newSession).not.toHaveBeenCalled();
  });

  // (i) startAuto allows when own stale lock (dead PID)
  it("startAuto allows when own stale lock has dead PID", async () => {
    writeAutoLock(cwd, "import", "M001");
    // Overwrite with a dead PID
    const lockPath = join(cwd, ".gsd", "issues-auto.lock");
    const data = JSON.parse(readFileSync(lockPath, "utf-8"));
    data.pid = 999999999;
    writeFileSync(lockPath, JSON.stringify(data), "utf-8");

    const deps = createMockDeps(cwd);
    const result = await startAuto("M001", deps);
    expect(result).toBeNull();
    expect(deps.newSession).toHaveBeenCalled();
  });

  // (j) startAuto writes lock and state, sends import prompt
  it("startAuto writes lock, state, emits event, and sends import prompt", async () => {
    const deps = createMockDeps(cwd);
    const result = await startAuto("M001", deps);

    expect(result).toBeNull();

    // Lock written
    const lock = readAutoLock(cwd);
    expect(lock).not.toBeNull();
    expect(lock!.phase).toBe("import");
    expect(lock!.milestoneId).toBe("M001");

    // State written
    const state = readAutoState(cwd);
    expect(state).not.toBeNull();
    expect(state!.phase).toBe("import");
    expect(state!.milestoneId).toBe("M001");
    expect(state!.splitAttempts).toBe(0);

    // Event emitted
    expect(deps.emit).toHaveBeenCalledWith("gsd-issues:auto-phase", {
      phase: "import",
      milestoneId: "M001",
    });

    // newSession called
    expect(deps.newSession).toHaveBeenCalled();

    // sendMessage called with import prompt
    expect(deps.sendMessage).toHaveBeenCalledTimes(1);
    const msg = (deps.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(msg.content).toContain("IMPORT");
    expect(msg.content).toContain("M001");
  });

  // (k) newSession cancellation stops auto
  it("startAuto handles newSession cancellation", async () => {
    const deps = createMockDeps(cwd, {
      newSession: vi.fn().mockResolvedValue({ cancelled: true }),
    });
    const result = await startAuto("M001", deps);
    expect(result).toContain("cancelled");
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });

  // (l) advancePhase transitions import → plan
  it("advancePhase transitions import → plan", async () => {
    writeAutoState(cwd, {
      phase: "import",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd);
    await advancePhase(deps);

    const state = readAutoState(cwd);
    expect(state!.phase).toBe("plan");

    expect(deps.emit).toHaveBeenCalledWith("gsd-issues:auto-phase", {
      phase: "plan",
      milestoneId: "M001",
    });

    expect(deps.sendMessage).toHaveBeenCalledTimes(1);
    const msg = (deps.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(msg.content).toContain("PLAN");
  });

  // (m) advancePhase: plan → validate-size → sync (happy path, valid size)
  it("advancePhase handles validate-size with valid milestone", async () => {
    writeAutoState(cwd, {
      phase: "plan",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd, {
      validateMilestoneSize: vi.fn().mockResolvedValue({
        valid: true,
        sliceCount: 3,
        limit: 5,
        mode: "best_try",
        milestoneId: "M001",
      }),
    });

    await advancePhase(deps);

    const state = readAutoState(cwd);
    expect(state!.phase).toBe("sync");

    const msg = (deps.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(msg.content).toContain("SYNC");
  });

  // (n) validate-size with oversized milestone triggers split in strict mode
  it("validate-size with oversized milestone triggers split in strict mode", async () => {
    writeAutoState(cwd, {
      phase: "plan",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd, {
      validateMilestoneSize: vi.fn().mockResolvedValue({
        valid: false,
        sliceCount: 8,
        limit: 5,
        mode: "strict",
        milestoneId: "M001",
      }),
    });

    await advancePhase(deps);

    const state = readAutoState(cwd);
    expect(state!.phase).toBe("split");
    expect(state!.splitAttempts).toBe(1);

    const msg = (deps.sendMessage as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(msg.content).toContain("SPLIT");
    expect(msg.content).toContain("5"); // limit
  });

  // (o) strict mode retries split up to 3 times then errors
  it("strict mode errors after max split attempts", async () => {
    writeAutoState(cwd, {
      phase: "plan",
      milestoneId: "M001",
      splitAttempts: 2, // already at 2, next attempt would be 3 (= MAX)
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd, {
      validateMilestoneSize: vi.fn().mockResolvedValue({
        valid: false,
        sliceCount: 8,
        limit: 5,
        mode: "strict",
        milestoneId: "M001",
      }),
    });

    await expect(advancePhase(deps)).rejects.toThrow("split attempts");
  });

  // (p) best_try mode warns and proceeds on oversized
  it("best_try mode warns and proceeds to sync on oversized", async () => {
    writeAutoState(cwd, {
      phase: "plan",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd, {
      validateMilestoneSize: vi.fn().mockResolvedValue({
        valid: false,
        sliceCount: 8,
        limit: 5,
        mode: "best_try",
        milestoneId: "M001",
      }),
    });

    await advancePhase(deps);

    const state = readAutoState(cwd);
    expect(state!.phase).toBe("sync");

    // Warning emitted in the event
    const emitCalls = (deps.emit as ReturnType<typeof vi.fn>).mock.calls;
    const phaseEvent = emitCalls.find(
      (c: unknown[]) => c[0] === "gsd-issues:auto-phase" && (c[1] as { warning?: string }).warning,
    );
    expect(phaseEvent).toBeTruthy();
  });

  // (q) phase transitions through happy path
  it("transitions through happy path: import→plan→validate-size→sync→execute→pr→done", async () => {
    const phases: AutoPhase[] = [];
    const deps = createMockDeps(cwd, {
      emit: vi.fn((event: string, payload: { phase: AutoPhase }) => {
        if (event === "gsd-issues:auto-phase") phases.push(payload.phase);
      }),
    });

    // Start at import
    await startAuto("M001", deps);
    expect(phases).toContain("import");

    // import → plan
    await advancePhase(deps);
    expect(readAutoState(cwd)!.phase).toBe("plan");

    // plan → validate-size → sync (auto-handled internally)
    await advancePhase(deps);
    expect(readAutoState(cwd)!.phase).toBe("sync");

    // sync → execute
    await advancePhase(deps);
    expect(readAutoState(cwd)!.phase).toBe("execute");

    // execute → pr
    await advancePhase(deps);
    expect(readAutoState(cwd)!.phase).toBe("pr");

    // pr → done (clears state)
    await advancePhase(deps);
    expect(readAutoState(cwd)).toBeNull();
  });

  // (r) prompt construction includes milestone ID
  it("prompt construction includes milestone ID", () => {
    expect(_prompts.import("M042")).toContain("M042");
    expect(_prompts.plan("M042")).toContain("M042");
    expect(_prompts.sync("M042")).toContain("M042");
    expect(_prompts.execute("M042")).toContain("M042");
    expect(_prompts.pr("M042")).toContain("M042");
    expect(_prompts.done("M042")).toContain("M042");
  });

  // (s) split prompt includes roadmap content
  it("split prompt includes roadmap content", () => {
    const roadmap = "- [ ] **S01: First slice**\n- [ ] **S02: Second slice**";
    const prompt = _prompts.split("M001", roadmap, 3);
    expect(prompt).toContain(roadmap);
    expect(prompt).toContain("3");
    expect(prompt).toContain("SPLIT");
  });

  // (t) 500ms settle delay is called
  it("advancePhase includes settle delay", async () => {
    writeAutoState(cwd, {
      phase: "import",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const deps = createMockDeps(cwd);
    await advancePhase(deps);

    // Should have at least one setTimeout(_, 500) call
    const delayCall = setTimeoutSpy.mock.calls.find(
      (c: unknown[]) => c[1] === 500,
    );
    expect(delayCall).toBeTruthy();
    setTimeoutSpy.mockRestore();
  });

  // (u) concurrent advancePhase calls are guarded
  it("concurrent advancePhase calls are guarded", async () => {
    writeAutoState(cwd, {
      phase: "import",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd, {
      newSession: vi.fn().mockImplementation(async () => {
        // Simulate slow newSession
        await new Promise((r) => setTimeout(r, 100));
        return { cancelled: false };
      }),
    });

    // Launch two concurrent calls
    const p1 = advancePhase(deps);
    const p2 = advancePhase(deps);

    await Promise.all([p1, p2]);

    // newSession should only be called once (second call was guarded)
    expect(deps.newSession).toHaveBeenCalledTimes(1);
  });

  // (v) done phase clears lock and state
  it("done phase clears lock and state", async () => {
    writeAutoState(cwd, {
      phase: "pr",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });
    writeAutoLock(cwd, "pr", "M001");

    const deps = createMockDeps(cwd);
    await advancePhase(deps);

    // Lock and state should be cleared
    expect(readAutoLock(cwd)).toBeNull();
    expect(readAutoState(cwd)).toBeNull();
  });

  // (w) stopAuto cleans up lock and state
  it("stopAuto cleans up lock and state", async () => {
    writeAutoLock(cwd, "execute", "M001");
    writeAutoState(cwd, {
      phase: "execute",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });

    const deps = createMockDeps(cwd);
    await stopAuto(deps);

    expect(readAutoLock(cwd)).toBeNull();
    expect(readAutoState(cwd)).toBeNull();
  });

  // (x) isAutoActive reports correctly
  it("isAutoActive returns true for own PID lock", () => {
    writeAutoLock(cwd, "execute", "M001");
    expect(isAutoActive(cwd)).toBe(true);
  });

  it("isAutoActive returns false when no lock", () => {
    expect(isAutoActive(cwd)).toBe(false);
  });

  // (y) newSession cancellation during advancePhase stops auto
  it("advancePhase handles newSession cancellation", async () => {
    writeAutoState(cwd, {
      phase: "import",
      milestoneId: "M001",
      splitAttempts: 0,
      startedAt: new Date().toISOString(),
    });
    writeAutoLock(cwd, "import", "M001");

    const deps = createMockDeps(cwd, {
      newSession: vi.fn().mockResolvedValue({ cancelled: true }),
    });
    await advancePhase(deps);

    // Lock should be cleared (stopAuto was called)
    expect(readAutoLock(cwd)).toBeNull();
    expect(deps.sendMessage).not.toHaveBeenCalled();
  });
});
