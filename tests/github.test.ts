import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { fold } from "../core/replay";
import { githubEnabled, readGithubArena, type FetchLike } from "../sources/github/read";
import { root } from "../sources/root";

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesUnder(full);
    return full;
  });
}

describe("github adapter", () => {
  it("stays off unless the source is opted in", () => {
    expect(githubEnabled({})).toBe(false);
    expect(githubEnabled({ GITHUB_TOKEN: "secret" })).toBe(false);
    expect(githubEnabled({ ARENA_SOURCE: "github", GITHUB_TOKEN: "secret" })).toBe(true);
  });

  it("issues GET requests only and never greens the sign-off gate", async () => {
    const calls: { url: string; method: string }[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, method: init.method });
      const json = (value: unknown) => Promise.resolve({ ok: true, status: 200, json: async () => value });
      if (url.endsWith("/branches?per_page=100")) {
        return json([{ name: "arena/experience-first" }, { name: "main" }]);
      }
      if (url.includes("/pulls?")) {
        return json([
          {
            number: 7,
            title: "Ridge Owl",
            draft: true,
            merged_at: null,
            html_url: "https://example.test/pr/7",
            created_at: "2026-11-04T14:00:00.000Z",
            head: { ref: "arena/experience-first", sha: "abc1234def5678" },
          },
        ]);
      }
      if (url.includes("/check-runs")) {
        return json({
          check_runs: [
            { name: "test", conclusion: "success" },
            { name: "lint", conclusion: "success" },
          ],
        });
      }
      return json({});
    };

    const events = await readGithubArena({
      repo: "example/wall",
      token: "test-token",
      fetchImpl,
      now: "2026-11-04T15:00:00.000Z",
    });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.every((call) => call.url.startsWith("https://api.github.com/repos/example/wall/"))).toBe(true);
    const verifier = events.find((event) => event.t === "verifier.updated");
    expect(verifier && verifier.t === "verifier.updated" && verifier.v.gates.find((gate) => gate.name === "human-ok")?.status).toBe("red");
    expect(Object.values(fold(events).ideas).every((idea) => idea.lane !== "merged")).toBe(true);
  });

  it("has no write verbs next to the GitHub host", () => {
    const roots = ["core", "sources", "server", "cli", "ui"].map((name) => path.join(root, name));
    const offenders: string[] = [];
    for (const file of roots.flatMap(filesUnder)) {
      if (!/\.(ts|css|html|svg)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      if (!text.includes("api.github.com")) continue;
      if (/\b(POST|PUT|PATCH|DELETE)\b/.test(text)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
    expect(readFileSync(path.join(root, "sources/github/read.ts"), "utf8")).toContain('method: "GET"');
  });
});
