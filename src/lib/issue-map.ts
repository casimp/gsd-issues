import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { IssueMapEntry } from "../providers/types.js";

/**
 * Validate that a parsed value is a valid IssueMapEntry array.
 * Throws on structural violations so corrupt files fail loudly
 * with a clear message including the file path.
 */
function validateEntries(data: unknown, filePath: string): IssueMapEntry[] {
  if (!Array.isArray(data)) {
    throw new Error(
      `ISSUE-MAP.json at ${filePath} is not an array — got ${typeof data}`,
    );
  }

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.localId !== "string" ||
      typeof entry.issueId !== "number" ||
      typeof entry.provider !== "string" ||
      typeof entry.url !== "string" ||
      typeof entry.createdAt !== "string"
    ) {
      throw new Error(
        `ISSUE-MAP.json at ${filePath}: invalid entry at index ${i}`,
      );
    }
  }

  return data as IssueMapEntry[];
}

/**
 * Load issue map entries from a JSON file.
 *
 * Returns an empty array if the file doesn't exist.
 * Throws on corrupt JSON or invalid structure (with file path in message).
 */
export async function loadIssueMap(filePath: string): Promise<IssueMapEntry[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `ISSUE-MAP.json at ${filePath} contains invalid JSON`,
    );
  }

  return validateEntries(parsed, filePath);
}

/**
 * Save issue map entries to a JSON file.
 *
 * Creates parent directories if they don't exist.
 * Writes with 2-space indentation for readability.
 */
export async function saveIssueMap(
  filePath: string,
  entries: IssueMapEntry[],
): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(entries, null, 2) + "\n", "utf-8");
}
