import { execFile } from "node:child_process";
import type { ExecFn, ExecResult } from "./types.js";

/**
 * Default exec function using child_process.execFile (shell: false).
 * Used when no exec function is injected (production path).
 */
async function defaultExec(
  command: string,
  args: string[],
  options?: { cwd?: string },
): Promise<ExecResult> {
  return new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: options?.cwd, encoding: "utf-8" },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout ?? "",
          stderr: stderr ?? "",
          code: error ? (error as Error & { code?: number }).code ?? 1 : 0,
          killed: false,
        });
      },
    );
  });
}

/** Known provider hostnames */
const KNOWN_HOSTS: Record<string, "github" | "gitlab"> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
};

/**
 * Parse hostname from a git remote URL.
 *
 * Handles:
 * - SSH:   git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 */
function parseHostname(url: string): string | null {
  // SSH format: git@host:path
  const sshMatch = url.match(/^[\w-]+@([^:]+):/);
  if (sshMatch) {
    return sshMatch[1];
  }

  // HTTPS format: https://host/path
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Detect the issue provider by inspecting the git remote origin URL.
 *
 * @param cwd - Working directory to run git in (defaults to process.cwd())
 * @param exec - Optional exec function for testability (defaults to child_process.execFile)
 * @returns 'github' | 'gitlab' | null for unknown hosts
 */
export async function detectProvider(
  cwd?: string,
  exec?: ExecFn,
): Promise<"github" | "gitlab" | null> {
  const run = exec ?? defaultExec;
  const result = await run("git", ["remote", "get-url", "origin"], { cwd });

  if (result.code !== 0) {
    return null;
  }

  const remoteUrl = result.stdout.trim();
  if (!remoteUrl) {
    return null;
  }

  const hostname = parseHostname(remoteUrl);
  if (!hostname) {
    return null;
  }

  return KNOWN_HOSTS[hostname] ?? null;
}
