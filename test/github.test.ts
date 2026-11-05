import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { eventsFromGithub, gateFromConclusion, loadGithubEvents } from "../sources/github/adapter.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("github adapter", () => {
  it("uses GET only", () => {
    const file = fs.readFileSync(path.join(root, "sources/github/adapter.ts"), "utf8");
    expect(file).toContain('method: "GET"');
    expect(file).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    expect(file).not.toMatch(/\.merge\s*\(/);
    expect(file).not.toMatch(/pulls\.create|git\.createRef|octokit/i);

    const tree = walk(root).filter((filePath) => /\.(ts|js|mjs)$/.test(filePath) && !filePath.includes(`${path.sep}test${path.sep}`));
    for (const filePath of tree) {
      const text = fs.readFileSync(filePath, "utf8");
      if (!text.includes("api.github.com")) continue;
      expect(path.relative(root, filePath)).toBe("sources/github/adapter.ts");
      expect(text).not.toMatch(/\b(POST|PUT|PATCH|DELETE)\b/);
    }
  });

  it("maps arena branches and pulls into events without a network call", async () => {
    const seen: string[] = [];
    const events = await loadGithubEvents({
      repo: "example/arena-wall",
      token: "test-token",
      now: "2026-11-04T12:00:00.000Z",
      get: async (url) => {
        seen.push(url);
        expect(url.startsWith("https://api.github.com/")).toBe(true);
        if (url.includes("/branches")) {
          return [{ name: "arena/comet-lab/model-first", commit: { sha: "abc1234" } }];
        }
        if (url.includes("/pulls")) {
          return [
            {
              number: 3,
              html_url: "https://example.test/3",
              draft: true,
              merged_at: null,
              base: { ref: "main" },
              head: { ref: "arena/comet-lab/model-first", sha: "abc1234" },
            },
          ];
        }
        return { check_runs: [{ name: "test", conclusion: "success", status: "completed" }] };
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(events.map((event) => event.t)).toEqual(["idea.added", "seat.updated", "pr.updated"]);
    expect(gateFromConclusion("success")).toBe("green");
    expect(gateFromConclusion("failure")).toBe("red");
  });

  it("ignores branches outside the arena prefix", () => {
    const events = eventsFromGithub(
      {
        branches: [{ name: "main", commit: { sha: "fff" } }],
        pulls: [],
        checks: {},
      },
      "2026-11-04T12:00:00.000Z",
    );
    expect(events).toEqual([]);
  });
});

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}
