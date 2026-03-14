import { describe, it, expect } from "vitest";
import { detectProvider } from "../detect.js";
import type { ExecFn, ExecResult } from "../types.js";

/** Helper: create a mock exec that returns a fixed stdout for `git remote get-url origin` */
function mockExec(stdout: string, code = 0): ExecFn {
  return async (
    _command: string,
    _args: string[],
    _options?: { cwd?: string },
  ): Promise<ExecResult> => ({
    stdout,
    stderr: "",
    code,
    killed: false,
  });
}

describe("detectProvider", () => {
  it("detects github from SSH remote", async () => {
    const exec = mockExec("git@github.com:owner/repo.git\n");
    expect(await detectProvider("/tmp", exec)).toBe("github");
  });

  it("detects github from HTTPS remote", async () => {
    const exec = mockExec("https://github.com/owner/repo.git\n");
    expect(await detectProvider("/tmp", exec)).toBe("github");
  });

  it("detects gitlab from SSH remote", async () => {
    const exec = mockExec("git@gitlab.com:group/subgroup/repo.git\n");
    expect(await detectProvider("/tmp", exec)).toBe("gitlab");
  });

  it("detects gitlab from HTTPS remote", async () => {
    const exec = mockExec("https://gitlab.com/group/subgroup/repo.git\n");
    expect(await detectProvider("/tmp", exec)).toBe("gitlab");
  });

  it("returns null for unknown host", async () => {
    const exec = mockExec("git@bitbucket.org:owner/repo.git\n");
    expect(await detectProvider("/tmp", exec)).toBeNull();
  });

  it("returns null for malformed URL", async () => {
    const exec = mockExec("not-a-url\n");
    expect(await detectProvider("/tmp", exec)).toBeNull();
  });

  it("returns null when git command fails", async () => {
    const exec = mockExec("", 128);
    expect(await detectProvider("/tmp", exec)).toBeNull();
  });

  it("returns null for empty stdout", async () => {
    const exec = mockExec("");
    expect(await detectProvider("/tmp", exec)).toBeNull();
  });
});
