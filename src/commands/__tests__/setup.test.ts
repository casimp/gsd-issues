/**
 * Tests for the interactive setup command.
 *
 * Mocks: ctx.ui (select/input/confirm/notify), exec (CLI calls).
 * Covers: GitHub happy path, GitLab happy path with epic, detection
 * failure + manual selection, auth failure fallback, empty milestone
 * list, non-interactive mode guard.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { handleSetup } from "../setup.js";
import type { ExtensionCommandContext, ExtensionUI } from "../../index.js";
import type { ExecFn, ExecResult } from "../../providers/types.js";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";

// ── Helpers ──

function ok(stdout = "", stderr = ""): ExecResult {
  return { stdout, stderr, code: 0, killed: false };
}

function fail(stderr = "", code = 1): ExecResult {
  return { stdout: "", stderr, code, killed: false };
}

function makeUI(): ExtensionUI & {
  select: Mock;
  input: Mock;
  confirm: Mock;
  notify: Mock;
} {
  return {
    notify: vi.fn(),
    select: vi.fn(),
    input: vi.fn(),
    confirm: vi.fn(),
  };
}

function makeCtx(
  ui: ExtensionUI,
  hasUI = true,
): ExtensionCommandContext {
  return {
    ui,
    hasUI,
    waitForIdle: vi.fn(async () => {}),
    newSession: vi.fn(async () => ({ cancelled: false })),
  };
}

async function readConfig(cwd: string) {
  const raw = await readFile(join(cwd, ".gsd", "issues.json"), "utf-8");
  return JSON.parse(raw);
}

// ── Exec router ──

type ExecRoute = {
  match: (cmd: string, args: string[]) => boolean;
  result: ExecResult;
};

function routedExec(routes: ExecRoute[]): ExecFn {
  return async (command: string, args: string[]) => {
    for (const route of routes) {
      if (route.match(command, args)) return route.result;
    }
    return fail(`No route for: ${command} ${args.join(" ")}`);
  };
}

// ── Common routes ──

function gitRemoteRoute(url: string): ExecRoute {
  return {
    match: (cmd, args) =>
      cmd === "git" && args[0] === "remote" && args[1] === "get-url",
    result: ok(url + "\n"),
  };
}

function ghMilestoneRoute(milestones: Array<{ title: string; number: number }>): ExecRoute {
  return {
    match: (cmd, args) =>
      cmd === "gh" && args[0] === "milestone" && args[1] === "list",
    result: ok(JSON.stringify(milestones)),
  };
}

function glabMilestoneRoute(milestones: Array<{ title: string; id: number }>): ExecRoute {
  return {
    match: (cmd, args) =>
      cmd === "glab" && args[0] === "milestone" && args[1] === "list",
    result: ok(JSON.stringify(milestones)),
  };
}

function ghAuthRoute(username: string): ExecRoute {
  return {
    match: (cmd, args) =>
      cmd === "gh" && args[0] === "auth" && args[1] === "status",
    result: ok(`Logged in to github.com account ${username} (keyring)\n`),
  };
}

function glabAuthRoute(username: string): ExecRoute {
  return {
    match: (cmd, args) =>
      cmd === "glab" && args[0] === "auth" && args[1] === "status",
    result: ok(`Logged in to gitlab.com as ${username}\n`),
  };
}

function glabProjectIdRoute(id: number): ExecRoute {
  return {
    match: (cmd, args) =>
      cmd === "glab" && args[0] === "api" && args[1] === "projects/:id",
    result: ok(JSON.stringify({ id })),
  };
}

// ── Tests ──

describe("handleSetup", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "gsd-issues-setup-"));
    // Mock process.cwd to return tempDir
    vi.spyOn(process, "cwd").mockReturnValue(tempDir);
  });

  it("returns early with notification in non-interactive mode", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui, false);

    await handleSetup("setup", ctx);

    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("interactive mode"),
      "warning",
    );
    expect(ui.select).not.toHaveBeenCalled();
    expect(ui.input).not.toHaveBeenCalled();
  });

  it("GitHub happy path: detect → discover → collect → write → validate", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("git@github.com:owner/my-repo.git"),
      ghMilestoneRoute([
        { title: "v1.0", number: 1 },
        { title: "v2.0", number: 2 },
      ]),
      ghAuthRoute("octocat"),
    ]);

    // Select milestone "v1.0"
    ui.select.mockResolvedValueOnce("v1.0");
    // Assignee input (default "octocat") → accept default
    ui.input.mockResolvedValueOnce("octocat");
    // Done label (default "" for GitHub)
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("gsd,auto");
    // Max slices per milestone (default "5")
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode select
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.provider).toBe("github");
    expect(config.milestone).toBe("v1.0");
    expect(config.assignee).toBe("octocat");
    expect(config.branch_pattern).toBe("{issue_id}-gsd/{milestone}/{slice}");
    expect(config.labels).toEqual(["gsd", "auto"]);
    expect(config.max_slices_per_milestone).toBe(5);
    expect(config.sizing_mode).toBe("best_try");
    expect(config.github).toEqual({
      repo: "owner/my-repo",
      close_reason: "completed",
    });

    // Summary notification
    const summaryCall = ui.notify.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("✓ Config saved"),
    );
    expect(summaryCall).toBeDefined();
  });

  it("GitLab happy path with project path and epic", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("git@gitlab.com:org/sub/my-project.git"),
      glabMilestoneRoute([{ title: "Sprint 1", id: 10 }]),
      glabAuthRoute("jdoe"),
      glabProjectIdRoute(42),
    ]);

    // Select milestone
    ui.select.mockResolvedValueOnce("Sprint 1");
    // Assignee (default "jdoe")
    ui.input.mockResolvedValueOnce("jdoe");
    // Done label (default "T::Done")
    ui.input.mockResolvedValueOnce("T::Done");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project path (from remote)
    // Project ID (default from discovery: 42)
    ui.input.mockResolvedValueOnce("42");
    // Epic? Yes
    ui.confirm.mockResolvedValueOnce(true);
    // Epic reference
    ui.input.mockResolvedValueOnce("&7");

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.provider).toBe("gitlab");
    expect(config.milestone).toBe("Sprint 1");
    expect(config.assignee).toBe("jdoe");
    expect(config.done_label).toBe("T::Done");
    expect(config.gitlab).toEqual({
      project_path: "org/sub/my-project",
      project_id: 42,
      epic: "&7",
    });
  });

  it("detection failure → manual provider selection", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      // git remote fails → no detection
      {
        match: (cmd, args) =>
          cmd === "git" && args[0] === "remote",
        result: fail("fatal: not a git repository"),
      },
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    // Manual provider selection
    ui.select.mockResolvedValueOnce("GitHub");
    // Select milestone
    ui.select.mockResolvedValueOnce("v1.0");
    // Assignee
    ui.input.mockResolvedValueOnce("octocat");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Repo (manual, no remote)
    ui.input.mockResolvedValueOnce("owner/repo");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.provider).toBe("github");
    expect(config.github?.repo).toBe("owner/repo");

    // Should have notified about detection failure
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("Could not detect provider"),
      "info",
    );
  });

  it("auth failure fallback to manual input for user", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      // Auth fails
      {
        match: (cmd, args) =>
          cmd === "gh" && args[0] === "auth",
        result: fail("not logged in"),
      },
    ]);

    // Select milestone
    ui.select.mockResolvedValueOnce("v1.0");
    // Assignee (manual, no default — auth failed)
    ui.input.mockResolvedValueOnce("manual-user");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.assignee).toBe("manual-user");

    // Should warn about auth
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("gh auth login"),
      "warning",
    );
  });

  it("empty milestone list → manual input", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      // Empty milestones
      ghMilestoneRoute([]),
      ghAuthRoute("octocat"),
    ]);

    // No select for milestones — goes to manual input
    // Milestone manual
    ui.input.mockResolvedValueOnce("v3.0");
    // Assignee
    ui.input.mockResolvedValueOnce("octocat");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.milestone).toBe("v3.0");

    // Should notify about no milestones
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("No milestones found"),
      "info",
    );
  });

  it("milestone discovery failure → manual input with auth guidance", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      // Milestones fail
      {
        match: (cmd, args) =>
          cmd === "gh" && args[0] === "milestone",
        result: fail("authentication required"),
      },
      ghAuthRoute("octocat"),
    ]);

    // Milestone manual (discovery failed)
    ui.input.mockResolvedValueOnce("v1.0");
    // Assignee
    ui.input.mockResolvedValueOnce("octocat");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.milestone).toBe("v1.0");

    // Should warn about auth for milestones
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining("gh auth login"),
      "warning",
    );
  });

  it("omits optional fields when left empty", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    // Select milestone
    ui.select.mockResolvedValueOnce("v1.0");
    // Assignee — empty
    ui.input.mockResolvedValueOnce("");
    // Done label — empty
    ui.input.mockResolvedValueOnce("");
    // Branch pattern — empty
    ui.input.mockResolvedValueOnce("");
    // Labels — empty
    ui.input.mockResolvedValueOnce("");
    // Max slices (default "5")
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.assignee).toBeUndefined();
    expect(config.done_label).toBeUndefined();
    expect(config.labels).toBeUndefined();
    // branch_pattern is included even if empty? Let's check the spread
    // Actually, empty string is falsy so it won't be included
    expect(config.branch_pattern).toBeUndefined();
  });

  it("GitLab without epic", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("git@gitlab.com:myorg/myrepo.git"),
      glabMilestoneRoute([{ title: "Q1", id: 5 }]),
      glabAuthRoute("admin"),
      glabProjectIdRoute(99),
    ]);

    // Select milestone
    ui.select.mockResolvedValueOnce("Q1");
    // Assignee
    ui.input.mockResolvedValueOnce("admin");
    // Done label
    ui.input.mockResolvedValueOnce("T::Done");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("workflow");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project ID (default 99)
    ui.input.mockResolvedValueOnce("99");
    // Epic? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.gitlab).toEqual({
      project_path: "myorg/myrepo",
      project_id: 99,
    });
    expect(config.gitlab?.epic).toBeUndefined();
  });

  it("GitHub with project number", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    // Select milestone
    ui.select.mockResolvedValueOnce("v1.0");
    // Assignee
    ui.input.mockResolvedValueOnce("octocat");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? Yes
    ui.confirm.mockResolvedValueOnce(true);
    // Project number
    ui.input.mockResolvedValueOnce("5");

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.github?.project).toBe("5");
  });

  it("validates the written config passes validation", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    ui.select.mockResolvedValueOnce("v1.0");
    ui.input.mockResolvedValueOnce("octocat");
    ui.input.mockResolvedValueOnce("");
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    // No error notification should have been emitted
    const errorCalls = ui.notify.mock.calls.filter(
      (c) => c[1] === "error",
    );
    expect(errorCalls).toHaveLength(0);

    // Summary should appear
    const summaryCalls = ui.notify.mock.calls.filter(
      (c) => typeof c[0] === "string" && c[0].includes("✓ Config saved"),
    );
    expect(summaryCalls).toHaveLength(1);
  });

  it("collects max_slices_per_milestone and sizing_mode with custom values", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    ui.select.mockResolvedValueOnce("v1.0");
    ui.input.mockResolvedValueOnce("octocat");
    ui.input.mockResolvedValueOnce("");
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    ui.input.mockResolvedValueOnce("");
    // Max slices = 10
    ui.input.mockResolvedValueOnce("10");
    // Sizing mode = strict
    ui.select.mockResolvedValueOnce("Strict (block until right-sized)");
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.max_slices_per_milestone).toBe(10);
    expect(config.sizing_mode).toBe("strict");
  });

  it("summary includes max_slices_per_milestone and sizing_mode", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    ui.select.mockResolvedValueOnce("v1.0");
    ui.input.mockResolvedValueOnce("octocat");
    ui.input.mockResolvedValueOnce("");
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    ui.input.mockResolvedValueOnce("");
    ui.input.mockResolvedValueOnce("3");
    ui.select.mockResolvedValueOnce("Strict (block until right-sized)");
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const summaryCall = ui.notify.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("✓ Config saved"),
    );
    expect(summaryCall).toBeDefined();
    const summaryText = summaryCall![0] as string;
    expect(summaryText).toContain("max_slices_per_milestone: 3");
    expect(summaryText).toContain("sizing_mode: strict");
  });

  it("skipping milestone produces config without milestone field", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([{ title: "v1.0", number: 1 }]),
      ghAuthRoute("octocat"),
    ]);

    // Select milestone → skip
    ui.select.mockResolvedValueOnce("(skip — no milestone)");
    // Assignee
    ui.input.mockResolvedValueOnce("octocat");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.provider).toBe("github");
    expect(config.milestone).toBeUndefined();
    expect(config.assignee).toBe("octocat");

    // Summary should show "(not set)" for milestone
    const summaryCall = ui.notify.mock.calls.find(
      (c) => typeof c[0] === "string" && c[0].includes("✓ Config saved"),
    );
    expect(summaryCall).toBeDefined();
    expect(summaryCall![0] as string).toContain("(not set)");
  });

  it("empty milestone list with empty input skips milestone", async () => {
    const ui = makeUI();
    const ctx = makeCtx(ui);

    const exec = routedExec([
      gitRemoteRoute("https://github.com/owner/repo.git"),
      ghMilestoneRoute([]),
      ghAuthRoute("octocat"),
    ]);

    // Milestone manual — empty to skip
    ui.input.mockResolvedValueOnce("");
    // Assignee
    ui.input.mockResolvedValueOnce("octocat");
    // Done label
    ui.input.mockResolvedValueOnce("");
    // Branch pattern
    ui.input.mockResolvedValueOnce("{issue_id}-gsd/{milestone}/{slice}");
    // Labels
    ui.input.mockResolvedValueOnce("");
    // Max slices
    ui.input.mockResolvedValueOnce("5");
    // Sizing mode
    ui.select.mockResolvedValueOnce("Best try (warn and proceed)");
    // Project? No
    ui.confirm.mockResolvedValueOnce(false);

    await handleSetup("setup", ctx, exec);

    const config = await readConfig(tempDir);
    expect(config.milestone).toBeUndefined();
  });
});
