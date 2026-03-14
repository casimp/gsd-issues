import { describe, it, expect, vi } from "vitest";
import { importIssues } from "../import.js";
import type { Issue } from "../../providers/types.js";

/** Helper: build an Issue with defaults */
function makeIssue(overrides: Partial<Issue> & { id: number; title: string }): Issue {
  return {
    state: "open",
    url: `https://example.com/issues/${overrides.id}`,
    labels: [],
    ...overrides,
  };
}

describe("importIssues", () => {
  describe("formatting", () => {
    it("formats issue with all fields", () => {
      const result = importIssues({
        issues: [
          makeIssue({
            id: 42,
            title: "Fix login bug",
            labels: ["bug", "auth"],
            weight: 5,
            milestone: "v2.0",
            assignee: "alice",
            description: "Users cannot log in when 2FA is enabled.",
          }),
        ],
      });

      expect(result.markdown).toContain("## #42: Fix login bug");
      expect(result.markdown).toContain("**Labels:** bug, auth");
      expect(result.markdown).toContain("**Weight:** 5");
      expect(result.markdown).toContain("**Milestone:** v2.0");
      expect(result.markdown).toContain("**Assignee:** alice");
      expect(result.markdown).toContain("Users cannot log in when 2FA is enabled.");
      expect(result.issueCount).toBe(1);
    });

    it("formats issue with only required fields", () => {
      const result = importIssues({
        issues: [makeIssue({ id: 1, title: "Minimal issue" })],
      });

      expect(result.markdown).toBe("## #1: Minimal issue");
      expect(result.markdown).not.toContain("**Labels:**");
      expect(result.markdown).not.toContain("**Weight:**");
      expect(result.markdown).not.toContain("**Milestone:**");
      expect(result.markdown).not.toContain("**Assignee:**");
      expect(result.issueCount).toBe(1);
    });

    it("formats labels as comma-separated list", () => {
      const result = importIssues({
        issues: [
          makeIssue({ id: 1, title: "Labeled", labels: ["priority::high", "type::bug", "scope::frontend"] }),
        ],
      });

      expect(result.markdown).toContain("**Labels:** priority::high, type::bug, scope::frontend");
    });

    it("separates multiple issues with blank lines", () => {
      const result = importIssues({
        issues: [
          makeIssue({ id: 1, title: "First" }),
          makeIssue({ id: 2, title: "Second" }),
        ],
      });

      expect(result.markdown).toBe("## #1: First\n\n## #2: Second");
    });
  });

  describe("weight-based sorting", () => {
    it("sorts by weight descending (heaviest first)", () => {
      const result = importIssues({
        issues: [
          makeIssue({ id: 1, title: "Low", weight: 1 }),
          makeIssue({ id: 2, title: "High", weight: 5 }),
          makeIssue({ id: 3, title: "Medium", weight: 3 }),
        ],
      });

      const ids = result.markdown.match(/## #(\d+):/g)!.map((m) => m.match(/\d+/)![0]);
      expect(ids).toEqual(["2", "3", "1"]);
    });

    it("places unweighted issues after weighted ones", () => {
      const result = importIssues({
        issues: [
          makeIssue({ id: 1, title: "No weight" }),
          makeIssue({ id: 2, title: "Has weight", weight: 1 }),
          makeIssue({ id: 3, title: "Also no weight" }),
        ],
      });

      const ids = result.markdown.match(/## #(\d+):/g)!.map((m) => m.match(/\d+/)![0]);
      expect(ids).toEqual(["2", "1", "3"]);
    });

    it("preserves order for issues with same weight", () => {
      const result = importIssues({
        issues: [
          makeIssue({ id: 1, title: "First same", weight: 3 }),
          makeIssue({ id: 2, title: "Second same", weight: 3 }),
          makeIssue({ id: 3, title: "Third same", weight: 3 }),
        ],
      });

      const ids = result.markdown.match(/## #(\d+):/g)!.map((m) => m.match(/\d+/)![0]);
      expect(ids).toEqual(["1", "2", "3"]);
    });
  });

  describe("description truncation", () => {
    it("keeps descriptions at or under 500 chars unchanged", () => {
      const desc = "A".repeat(500);
      const result = importIssues({
        issues: [makeIssue({ id: 1, title: "Exact", description: desc })],
      });

      expect(result.markdown).toContain(desc);
      expect(result.markdown).not.toContain("…");
    });

    it("truncates descriptions over 500 chars with ellipsis", () => {
      const desc = "B".repeat(600);
      const result = importIssues({
        issues: [makeIssue({ id: 1, title: "Long", description: desc })],
      });

      expect(result.markdown).toContain("B".repeat(500) + "…");
      expect(result.markdown).not.toContain("B".repeat(501));
    });

    it("handles description exactly 501 chars", () => {
      const desc = "C".repeat(501);
      const result = importIssues({
        issues: [makeIssue({ id: 1, title: "Edge", description: desc })],
      });

      expect(result.markdown).toContain("C".repeat(500) + "…");
    });
  });

  describe("empty list handling", () => {
    it("returns 'No issues found.' for empty array", () => {
      const result = importIssues({ issues: [] });

      expect(result.markdown).toBe("No issues found.");
      expect(result.issueCount).toBe(0);
    });
  });

  describe("event emission", () => {
    it("emits gsd-issues:import-complete with issue count", () => {
      const emit = vi.fn();

      importIssues({
        issues: [
          makeIssue({ id: 1, title: "A" }),
          makeIssue({ id: 2, title: "B" }),
          makeIssue({ id: 3, title: "C" }),
        ],
        emit,
      });

      expect(emit).toHaveBeenCalledOnce();
      expect(emit).toHaveBeenCalledWith("gsd-issues:import-complete", {
        issueCount: 3,
      });
    });

    it("emits event with count 0 for empty list", () => {
      const emit = vi.fn();

      importIssues({ issues: [], emit });

      expect(emit).toHaveBeenCalledWith("gsd-issues:import-complete", {
        issueCount: 0,
      });
    });

    it("works without emit function (optional)", () => {
      // Should not throw
      const result = importIssues({
        issues: [makeIssue({ id: 1, title: "No emit" })],
      });

      expect(result.issueCount).toBe(1);
    });
  });

  describe("issues without optional fields", () => {
    it("handles GitHub-style issues (no weight)", () => {
      const result = importIssues({
        issues: [
          makeIssue({
            id: 10,
            title: "GitHub issue",
            labels: ["enhancement"],
            milestone: "Sprint 1",
            assignee: "dev",
            description: "Add feature X",
          }),
        ],
      });

      expect(result.markdown).toContain("## #10: GitHub issue");
      expect(result.markdown).toContain("**Labels:** enhancement");
      expect(result.markdown).not.toContain("**Weight:**");
      expect(result.markdown).toContain("**Milestone:** Sprint 1");
      expect(result.markdown).toContain("**Assignee:** dev");
      expect(result.markdown).toContain("Add feature X");
    });

    it("handles issues with no labels", () => {
      const result = importIssues({
        issues: [makeIssue({ id: 1, title: "No labels", labels: [] })],
      });

      expect(result.markdown).not.toContain("**Labels:**");
    });

    it("handles mixed weighted and unweighted issues", () => {
      const result = importIssues({
        issues: [
          makeIssue({ id: 1, title: "Weighted", weight: 5, description: "Has weight" }),
          makeIssue({ id: 2, title: "Unweighted", description: "No weight" }),
        ],
      });

      expect(result.issueCount).toBe(2);
      // Weighted should come first
      const weightedPos = result.markdown.indexOf("## #1:");
      const unweightedPos = result.markdown.indexOf("## #2:");
      expect(weightedPos).toBeLessThan(unweightedPos);
    });
  });
});
