import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEvent, parseSeatRecord } from "../core/parse.js";
import { fold } from "../core/replay.js";
import { eventsFromGitHub, githubEnabled, githubGet, loadGitHubEvents, normalizeGitHub } from "../sources/github.js";
import { ROOT } from "../sources/root.js";

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("parse and github", () => {
  it("rejects a winner seat with no commit", () => {
    expect(
      parseSeatRecord({
        id: "harbor-mint:experience-first",
        ideaId: "harbor-mint",
        style: "experience-first",
        branch: "arena/experience-first",
        tests: { passed: 1, failed: 0 },
        diffLines: 3,
        verdict: "winner",
        updatedAt: "2026-11-04T18:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("rejects a pull that is both draft and merged", () => {
    expect(
      parseEvent({
        t: "pr.updated",
        pr: {
          ideaId: "paper-kite",
          number: 1,
          url: "https://example.com/arena/pull/1",
          base: "main",
          draft: true,
          merged: true,
        },
      }),
    ).toBeNull();
  });

  it("round-trips a stored seat event", () => {
    const event = parseEvent({
      t: "seat.updated",
      seat: {
        id: "harbor-mint:experience-first",
        ideaId: "harbor-mint",
        style: "experience-first",
        branch: "arena/experience-first",
        headSha: "abc1234",
        tests: { passed: 52, failed: 0 },
        diffLines: 180,
        verdict: "winner",
        updatedAt: "2026-11-04T17:50:00.000Z",
      },
    });
    expect(event?.t).toBe("seat.updated");
  });

  it("uses GET for every GitHub request", async () => {
    const calls: { url: string; method: string | undefined }[] = [];
    const spec = fs.readFileSync(path.join(ROOT, "specs", "harbor-mint.md"), "utf8");
    const fetcher = (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method });
      if (String(url).includes("/branches?")) {
        return json([{ name: "arena/types-first", commit: { sha: "abc1234abc1234abc1234abc1234abc1234abc" } }]);
      }
      if (String(url).includes("/pulls?")) {
        return json([
          {
            number: 7,
            title: "Harbor Mint",
            html_url: "https://example.com/arena/pull/7",
            draft: true,
            merged_at: null,
            base: { ref: "main" },
          },
        ]);
      }
      if (String(url).includes("/contents/SPEC.md")) {
        return json({ encoding: "base64", content: Buffer.from(spec, "utf8").toString("base64") });
      }
      if (String(url).includes("/check-runs")) {
        return json({
          check_runs: [
            { name: "unit tests", conclusion: "success" },
            { name: "lint", conclusion: "success" },
            { name: "human-ok", conclusion: null },
          ],
        });
      }
      return json({});
    }) as typeof fetch;
    const events = await loadGitHubEvents("example/harbor", "token-not-printed", "2026-11-04T18:00:00.000Z", fetcher);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.every((call) => call.url.startsWith("https://api.github.com/"))).toBe(true);
    const state = fold(events);
    expect(state.ideas.harbor?.lane).toBe("draft_pr");
    expect(state.prs.harbor?.draft).toBe(true);
    expect(state.prs.harbor?.merged).toBe(false);
  });

  it("does not emit a merged pull when human-ok is red", () => {
    const events = eventsFromGitHub(
      normalizeGitHub("example/harbor", {
        branches: [{ name: "arena/experience-first", commit: { sha: "abc1234" } }],
        pulls: [
          {
            number: 3,
            title: "Harbor Mint",
            html_url: "https://example.com/arena/pull/3",
            draft: false,
            merged_at: "2026-11-04T18:00:00.000Z",
            base: { ref: "main" },
          },
        ],
        checks: [{ name: "tests", conclusion: "success" }, { name: "human-ok", conclusion: "failure" }],
        spec: {
          encoding: "base64",
          content: Buffer.from(fs.readFileSync(path.join(ROOT, "specs", "harbor-mint.md"), "utf8"), "utf8").toString("base64"),
        },
      }),
      "2026-11-04T18:00:00.000Z",
    );
    expect(events.some((event) => event.t === "pr.updated" && event.pr.merged)).toBe(false);
  });

  it("stays on fixtures unless the opt-in flag is set", () => {
    expect(githubEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(githubEnabled({ GITHUB_TOKEN: "x", ARENA_WALL_REPO: "example/harbor" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      githubEnabled({
        GITHUB_TOKEN: "x",
        ARENA_WALL_REPO: "example/harbor",
        ARENA_WALL_GITHUB: "1",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("exposes githubGet as GET", async () => {
    let method = "";
    await githubGet("/repos/example/harbor", "token", (async (_url: string, init?: RequestInit) => {
      method = init?.method ?? "";
      return json({ ok: true });
    }) as typeof fetch);
    expect(method).toBe("GET");
  });

  it("has no write method in the adapter or the server", () => {
    const files = ["sources/github.ts", "server/serve.ts", "core/model.ts", "cli/arena-wall.ts"];
    const pattern = /method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/;
    for (const file of files) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      expect(text, file).not.toMatch(pattern);
    }
    const adapter = fs.readFileSync(path.join(ROOT, "sources/github.ts"), "utf8");
    expect(adapter).toContain('GITHUB_METHOD = "GET"');
    expect(adapter).not.toMatch(/\bchild_process\b/);
    expect(adapter).not.toMatch(/\bbody\s*:/);
  });
});
