import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { startServer } from "../server/main.ts";

describe("arena-wall serve", () => {
  it("starts on fixtures with no env and pushes an SSE update after an append", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-wall-"));
    const logPath = path.join(dir, "events.jsonl");
    const previous = {
      source: process.env.ARENA_SOURCE,
      token: process.env.GITHUB_TOKEN,
      repo: process.env.ARENA_REPO,
    };
    delete process.env.ARENA_SOURCE;
    delete process.env.GITHUB_TOKEN;
    delete process.env.ARENA_REPO;
    const handle = await startServer({
      port: 0,
      logPath,
      specDir: path.join(dir, "empty-specs"),
      reset: true,
    });
    try {
      const state = (await (await fetch(`${handle.url}/api/state`)).json()) as {
        source: string;
        state: { ideas: Record<string, { title: string }> };
      };
      expect(state.source).toBe("fixtures");
      expect(Object.values(state.state.ideas).map((idea) => idea.title)).toContain("Ridge Owl");

      const response = await fetch(`${handle.url}/events`);
      const reader = response.body?.getReader();
      expect(reader).toBeTruthy();
      const decoder = new TextDecoder();
      let buffer = "";
      const first = await reader!.read();
      buffer += decoder.decode(first.value, { stream: true });
      expect(buffer).toContain("event: pipeline");

      const appended = {
        at: "2026-11-04T16:00:00.000Z",
        event: {
          t: "idea.added",
          idea: {
            id: "late-kite",
            title: "Late Kite",
            signals: [{ kind: "manual", note: "Appended while the wall was open." }],
            lane: "idea",
            createdAt: "2026-11-04T16:00:00.000Z",
          },
        },
      };
      const started = Date.now();
      fs.appendFileSync(logPath, `${JSON.stringify(appended)}\n`);
      let saw = false;
      while (Date.now() - started < 1000) {
        const chunk = await reader!.read();
        buffer += decoder.decode(chunk.value, { stream: true });
        if (buffer.includes("late-kite")) {
          saw = true;
          break;
        }
      }
      expect(saw).toBe(true);
      expect(Date.now() - started).toBeLessThan(1000);
      await reader!.cancel();
    } finally {
      await handle.close();
      if (previous.source === undefined) delete process.env.ARENA_SOURCE;
      else process.env.ARENA_SOURCE = previous.source;
      if (previous.token === undefined) delete process.env.GITHUB_TOKEN;
      else process.env.GITHUB_TOKEN = previous.token;
      if (previous.repo === undefined) delete process.env.ARENA_REPO;
      else process.env.ARENA_REPO = previous.repo;
    }
  });

  it("slides a card into seats when a watched spec becomes whole", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-wall-specs-"));
    const specDir = path.join(dir, "specs");
    fs.mkdirSync(specDir);
    const weak = fs.readFileSync(path.join(process.cwd(), "sources/fixtures/specs/lumen-fold.md"), "utf8");
    const good = fs.readFileSync(path.join(process.cwd(), "sources/fixtures/specs/comet-lab.md"), "utf8");
    fs.writeFileSync(path.join(specDir, "lumen-fold.md"), `${weak}\n<!-- idea: lumen-fold -->\n`);
    const handle = await startServer({
      port: 0,
      logPath: path.join(dir, "events.jsonl"),
      specDir,
      reset: true,
    });
    try {
      fs.writeFileSync(path.join(specDir, "lumen-fold.md"), `${good}\n<!-- idea: lumen-fold -->\n`);
      const started = Date.now();
      let lane = "";
      while (Date.now() - started < 2000) {
        const body = (await (await fetch(`${handle.url}/api/state`)).json()) as {
          state: { ideas: Record<string, { lane: string }>; specs: Record<string, { ok: boolean }> };
        };
        lane = body.state.ideas["lumen-fold"]?.lane ?? "";
        if (lane === "seats" && body.state.specs["lumen-fold"]?.ok) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(lane).toBe("seats");
    } finally {
      await handle.close();
    }
  });
});
