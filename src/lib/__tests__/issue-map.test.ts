import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadIssueMap, saveIssueMap } from "../issue-map.js";
import type { IssueMapEntry } from "../../providers/types.js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("issue-map", () => {
  let tempDir: string;
  let mapPath: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "issue-map-test-"));
    mapPath = join(tempDir, "ISSUE-MAP.json");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const sampleEntry: IssueMapEntry = {
    localId: "S01",
    issueId: 42,
    provider: "gitlab",
    url: "https://gitlab.com/group/repo/-/issues/42",
    createdAt: "2026-03-14T20:00:00Z",
  };

  it("round-trips entries through save and load", async () => {
    const entries = [sampleEntry];
    await saveIssueMap(mapPath, entries);
    const loaded = await loadIssueMap(mapPath);
    expect(loaded).toEqual(entries);
  });

  it("returns empty array for missing file", async () => {
    const result = await loadIssueMap(join(tempDir, "nonexistent.json"));
    expect(result).toEqual([]);
  });

  it("returns empty array for empty JSON array file", async () => {
    await writeFile(mapPath, "[]", "utf-8");
    const result = await loadIssueMap(mapPath);
    expect(result).toEqual([]);
  });

  it("throws on corrupt JSON", async () => {
    await writeFile(mapPath, "{ broken json", "utf-8");
    await expect(loadIssueMap(mapPath)).rejects.toThrow("invalid JSON");
  });

  it("throws on non-array JSON", async () => {
    await writeFile(mapPath, '{"not": "array"}', "utf-8");
    await expect(loadIssueMap(mapPath)).rejects.toThrow("is not an array");
  });

  it("throws on invalid entry structure", async () => {
    await writeFile(
      mapPath,
      JSON.stringify([{ localId: "S01" }]),
      "utf-8",
    );
    await expect(loadIssueMap(mapPath)).rejects.toThrow("invalid entry at index 0");
  });

  it("saves multiple entries and loads them back", async () => {
    const entries: IssueMapEntry[] = [
      sampleEntry,
      {
        localId: "S02",
        issueId: 99,
        provider: "github",
        url: "https://github.com/owner/repo/issues/99",
        createdAt: "2026-03-14T21:00:00Z",
      },
    ];
    await saveIssueMap(mapPath, entries);
    const loaded = await loadIssueMap(mapPath);
    expect(loaded).toEqual(entries);
    expect(loaded).toHaveLength(2);
  });

  it("creates parent directories when saving", async () => {
    const nestedPath = join(tempDir, "nested", "dir", "ISSUE-MAP.json");
    await saveIssueMap(nestedPath, [sampleEntry]);
    const loaded = await loadIssueMap(nestedPath);
    expect(loaded).toEqual([sampleEntry]);
  });
});
