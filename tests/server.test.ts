import { spawn } from "node:child_process";
import { appendFileSync, mkdtempSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { root } from "../sources/root";
import { logPath, startWall } from "../server/host";

function openEvents(url: string): { buffer: () => string; close: () => void } {
  let text = "";
  const req = http.get(url, (res) => {
    res.on("data", (chunk: Buffer) => {
      text += chunk.toString("utf8");
    });
  });
  return {
    buffer: () => text,
    close: () => {
      req.destroy();
    },
  };
}

async function waitFor(read: () => string, needle: string, timeoutMs: number): Promise<string> {
  const started = Date.now();
  while (!read().includes(needle)) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${needle}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return read();
}

describe("server", () => {
  it("pushes an SSE update within a second of an appended event", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "arena-home-"));
    const specDir = mkdtempSync(path.join(tmpdir(), "arena-specs-"));
    const wall = await startWall({ port: 0, home, specDir });
    try {
      const health = await fetch(`${wall.url}/api/health`);
      expect(health.status).toBe(200);
      const body = (await health.json()) as { source: string };
      expect(body.source).toBe("fixtures");
      const denied = await fetch(`${wall.url}/api/health`, { method: "POST" });
      expect(denied.status).toBe(405);

      const opened = openEvents(`${wall.url}/events`);
      try {
        await waitFor(opened.buffer, '"t":"idea.added"', 1000);
        const ideaId = "drop-lamp";
        const started = Date.now();
        appendFileSync(
          logPath(home),
          `${JSON.stringify({
            t: "idea.added",
            idea: {
              id: ideaId,
              title: "Drop Lamp",
              signals: [{ kind: "manual", note: "dropped" }],
              lane: "idea",
              createdAt: "2026-11-04T16:10:00.000Z",
            },
          })}\n`,
        );
        const payload = await waitFor(opened.buffer, ideaId, 1000);
        expect(Date.now() - started).toBeLessThan(1000);
        expect(payload).toContain(ideaId);

        const dropStarted = Date.now();
        writeFileSync(
          path.join(specDir, "weak-lamp.md"),
          "# Weak Lamp\n\n## 1. Goal\nA lamp by the door, readable from the hall.\n",
        );
        expect(await waitFor(opened.buffer, "weak-lamp", 1000)).toContain("weak-lamp");
        expect(Date.now() - dropStarted).toBeLessThan(1000);
      } finally {
        opened.close();
      }
    } finally {
      await wall.close();
    }
  });

  it("serves fixtures when arena-wall serve has no env", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "arena-cli-"));
    const specDir = mkdtempSync(path.join(tmpdir(), "arena-cli-specs-"));
    const child = spawn("node", ["--import", "tsx", "cli/arena-wall.ts", "serve", "--port", "0"], {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        ARENA_HOME: home,
        ARENA_SPEC_DIR: specDir,
      },
    });
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    try {
      const url = await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(output || "server did not start")), 20_000);
        child.stdout.on("data", () => {
          const match = /listening on (http:\/\/\S+)/.exec(output);
          if (match?.[1]) {
            clearTimeout(timer);
            resolve(match[1]);
          }
        });
      });
      const ready = Date.now() + 2000;
      while (!output.includes("source fixtures") && Date.now() < ready) {
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(output).toContain("source fixtures");
      const health = await fetch(`${url}/api/health`);
      expect((await health.json()) as { source: string }).toMatchObject({ source: "fixtures" });
    } finally {
      child.kill("SIGTERM");
    }
  });
});
