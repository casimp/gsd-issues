import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  validateConfig,
  loadConfig,
  saveConfig,
  type Config,
} from "../config.js";

describe("validateConfig", () => {
  it("accepts a valid GitLab config", () => {
    const result = validateConfig({
      provider: "gitlab",
      milestone: "v1.0",
      assignee: "alice",
      done_label: "done",
      branch_pattern: "feature/{id}-{title}",
      labels: ["bug", "priority::high"],
      gitlab: {
        project_path: "group/project",
        project_id: 42,
        weight_strategy: "fibonacci",
        reorganisation: true,
      },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts a valid GitHub config", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "Sprint 3",
      github: {
        repo: "owner/repo",
        project: "My Board",
        close_reason: "completed",
      },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects non-object input", () => {
    expect(validateConfig(null).errors).toContain(
      "Config must be a JSON object",
    );
    expect(validateConfig("string").errors).toContain(
      "Config must be a JSON object",
    );
    expect(validateConfig([]).errors).toContain(
      "Config must be a JSON object",
    );
    expect(validateConfig(42).errors).toContain(
      "Config must be a JSON object",
    );
  });

  it("reports missing provider", () => {
    const result = validateConfig({ milestone: "v1.0" });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: "provider"');
  });

  it("reports invalid provider value", () => {
    const result = validateConfig({
      provider: "bitbucket",
      milestone: "v1.0",
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("bitbucket");
    expect(result.errors[0]).toContain('must be "github" or "gitlab"');
  });

  it("reports missing milestone", () => {
    const result = validateConfig({ provider: "github", github: { repo: "o/r" } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing required field: "milestone"');
  });

  it("reports wrong type for milestone", () => {
    const result = validateConfig({
      provider: "github",
      milestone: 123,
      github: { repo: "o/r" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('"milestone"');
    expect(result.errors[0]).toContain("expected string");
  });

  it("reports wrong types for optional string fields", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "v1",
      assignee: 42,
      done_label: true,
      branch_pattern: [],
      github: { repo: "o/r" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);
    expect(result.errors.some((e) => e.includes('"assignee"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"done_label"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"branch_pattern"'))).toBe(
      true,
    );
  });

  it("reports invalid labels type", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "v1",
      labels: "not-an-array",
      github: { repo: "o/r" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"labels"'))).toBe(true);
  });

  it("reports non-string label entries", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "v1",
      labels: ["ok", 42, true],
      github: { repo: "o/r" },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("labels[1]"))).toBe(true);
    expect(result.errors.some((e) => e.includes("labels[2]"))).toBe(true);
  });

  it("requires gitlab section when provider is gitlab", () => {
    const result = validateConfig({
      provider: "gitlab",
      milestone: "v1",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('missing required "gitlab"')),
    ).toBe(true);
  });

  it("requires github section when provider is github", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "v1",
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('missing required "github"')),
    ).toBe(true);
  });

  it("validates gitlab section fields", () => {
    const result = validateConfig({
      provider: "gitlab",
      milestone: "v1",
      gitlab: {
        // missing project_path, project_id
        weight_strategy: "invalid",
        reorganisation: "not-bool",
      },
    });
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('"project_path"')),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.includes('"project_id"')),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.includes('"weight_strategy"')),
    ).toBe(true);
    expect(
      result.errors.some((e) => e.includes('"reorganisation"')),
    ).toBe(true);
  });

  it("validates github section fields", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "v1",
      github: {
        // missing repo
        project: 42,
        close_reason: "invalid",
      },
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('"repo"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"project"'))).toBe(true);
    expect(result.errors.some((e) => e.includes('"close_reason"'))).toBe(true);
  });

  it("collects ALL errors, not just the first", () => {
    const result = validateConfig({});
    expect(result.valid).toBe(false);
    // Should have at least provider and milestone errors
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("allows extra fields to pass through", () => {
    const result = validateConfig({
      provider: "github",
      milestone: "v1",
      github: { repo: "o/r" },
      custom_field: "hello",
      another: 42,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("produces human-readable error messages", () => {
    const result = validateConfig({
      provider: "bitbucket",
      milestone: 42,
      labels: "wrong",
    });
    for (const err of result.errors) {
      // No raw type tokens like "[object Object]"
      expect(err).not.toContain("[object Object]");
      // Errors should be full sentences or phrases
      expect(err.length).toBeGreaterThan(10);
    }
  });
});

describe("loadConfig / saveConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "gsd-issues-test-"));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("round-trips a valid config", async () => {
    const config: Config = {
      provider: "github",
      milestone: "Sprint 1",
      assignee: "bob",
      done_label: "done",
      branch_pattern: "issue/{id}",
      labels: ["area/backend"],
      github: {
        repo: "owner/repo",
        close_reason: "completed",
      },
    };

    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);

    expect(loaded.provider).toBe("github");
    expect(loaded.milestone).toBe("Sprint 1");
    expect(loaded.assignee).toBe("bob");
    expect(loaded.github?.repo).toBe("owner/repo");
  });

  it("creates .gsd/ directory on save", async () => {
    const config: Config = {
      provider: "gitlab",
      milestone: "v2",
      gitlab: {
        project_path: "g/p",
        project_id: 1,
      },
    };

    await saveConfig(tmpDir, config);

    const raw = await readFile(join(tmpDir, ".gsd", "issues.json"), "utf-8");
    expect(raw).toContain('"provider"');
    // Verify 2-space indentation
    expect(raw).toContain('  "provider"');
  });

  it("throws on missing file with setup guidance", async () => {
    await expect(loadConfig(tmpDir)).rejects.toThrow(
      /Run \/issues setup/,
    );
  });

  it("throws on corrupt JSON", async () => {
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "issues.json"),
      "{ not valid json }}}",
      "utf-8",
    );

    await expect(loadConfig(tmpDir)).rejects.toThrow(/invalid JSON/);
  });

  it("throws on invalid config with validation errors", async () => {
    await mkdir(join(tmpDir, ".gsd"), { recursive: true });
    await writeFile(
      join(tmpDir, ".gsd", "issues.json"),
      JSON.stringify({ milestone: 123 }),
      "utf-8",
    );

    await expect(loadConfig(tmpDir)).rejects.toThrow(/Invalid issues config/);
    try {
      await loadConfig(tmpDir);
    } catch (err: unknown) {
      const msg = (err as Error).message;
      expect(msg).toContain('"provider"');
      expect(msg).toContain('"milestone"');
    }
  });

  it("preserves extra fields through round-trip", async () => {
    const config = {
      provider: "github" as const,
      milestone: "v1",
      github: { repo: "o/r" },
      custom_extension: { nested: true },
    } as Config;

    await saveConfig(tmpDir, config);
    const loaded = await loadConfig(tmpDir);

    expect((loaded as Record<string, unknown>).custom_extension).toEqual({
      nested: true,
    });
  });

  it("writes JSON with trailing newline", async () => {
    const config: Config = {
      provider: "github",
      milestone: "v1",
      github: { repo: "o/r" },
    };

    await saveConfig(tmpDir, config);
    const raw = await readFile(join(tmpDir, ".gsd", "issues.json"), "utf-8");
    expect(raw.endsWith("\n")).toBe(true);
  });
});
