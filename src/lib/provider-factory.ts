/**
 * Shared provider factory — single source of truth for creating
 * the appropriate IssueProvider from config.
 *
 * Branches on `config.provider === "gitlab"` to instantiate
 * GitLabProvider or GitHubProvider.
 *
 * Diagnostics:
 * - No runtime signals — pure factory, no side effects.
 * - If the wrong provider is returned, check `config.provider` value
 *   in `.gsd/issues.json`.
 */

import type { Config } from "./config.js";
import type { ExecFn, IssueProvider } from "../providers/types.js";
import { GitLabProvider } from "../providers/gitlab.js";
import { GitHubProvider } from "../providers/github.js";

export function createProvider(config: Config, exec: ExecFn): IssueProvider {
  if (config.provider === "gitlab") {
    return new GitLabProvider(exec, config.gitlab?.project_path);
  }
  return new GitHubProvider(exec, config.github?.repo);
}
