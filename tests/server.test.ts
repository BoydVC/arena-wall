import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { serve } from "../server/serve.js";
import { eventsForSpec, parseSpecFile, resolveSpecPath } from "../sources/specfs.js";
import { ROOT } from "../sources/root.js";

const WEAK = `---
idea: ink-well
title: Ink Well
---

# Ink Well

## Goal
A note that is not ready.

## User story
As a reviewer, I want the gap listed on the card.

## Architecture
The folder watcher emits a lint event.
`;

const FIXED = fs.readFileSync(path.join(ROOT, "demos", "comet-lab-fixed.md"), "utf8").replaceAll("comet-lab", "ink-well").replaceAll("Comet Lab", "Ink Well");

function sseReader(response: Response): { until(needle: string, budgetMs: number): Promise<void> } {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("missing body");
  const decoder = new TextDecoder();
  let buffer = "";
  return {
    async until(needle: string, budgetMs: number): Promise<void> {
      const deadline = Date.now() + budgetMs;
      while (!buffer.includes(needle)) {
        if (Date.now() >= deadline) throw new Error(`missing ${needle}`);
        const remaining = Math.max(1, deadline - Date.now());
        const next = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("timeout")), remaining);
          reader.read().then(
            (value) => {
              clearTimeout(timer);
              resolve(value);
            },
            (error: unknown) => {
              clearTimeout(timer);
              reject(error instanceof Error ? error : new Error("read failed"));
            },
          );
        });
        if (next.done) throw new Error(`closed before ${needle}`);
        buffer += decoder.decode(next.value, { stream: true });
      }
    },
  };
}

describe("server", () => {
  it("starts on fixtures with no opt-in env and answers GET only", async () => {
    delete process.env.ARENA_WALL_GITHUB;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-wall-"));
    const running = await serve({
      port: 0,
      logPath: path.join(dir, "events.jsonl"),
      specDir: path.join(dir, "specs"),
      now: () => new Date("2026-11-04T18:00:00.000Z"),
    });
    try {
      const health = await fetch(`${running.url}api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ ok: true, source: "fixtures" });
      const state = await fetch(`${running.url}api/state`);
      const body = (await state.json()) as { state: { ideas: Record<string, { lane: string }>; seats: object } };
      expect(Object.keys(body.state.ideas)).toHaveLength(6);
      expect(Object.keys(body.state.seats)).toHaveLength(18);
      expect(body.state.ideas["paper-kite"]?.lane).toBe("draft_pr");
      const denied = await fetch(`${running.url}api/state`, { method: "POST" });
      expect(denied.status).toBe(405);
    } finally {
      await running.close();
    }
  });

  it("pushes an SSE update within 1s of an appended event", async () => {
    delete process.env.ARENA_WALL_GITHUB;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-wall-"));
    const logPath = path.join(dir, "events.jsonl");
    const running = await serve({
      port: 0,
      logPath,
      specDir: path.join(dir, "empty-specs"),
      now: () => new Date("2026-11-04T18:00:00.000Z"),
    });
    const controller = new AbortController();
    try {
      const response = await fetch(`${running.url}events`, { signal: controller.signal });
      const stream = sseReader(response);
      await stream.until("ridge-owl", 2000);
      const started = Date.now();
      fs.appendFileSync(
        logPath,
        `${JSON.stringify({
          at: "2026-11-04T18:01:00.000Z",
          event: {
            t: "idea.added",
            idea: {
              id: "ink-well",
              title: "Ink Well",
              signals: [{ kind: "manual", note: "appended" }],
              lane: "idea",
              createdAt: "2026-11-04T18:01:00.000Z",
            },
          },
        })}\n`,
      );
      await stream.until("ink-well", 1000);
      expect(Date.now() - started).toBeLessThan(1000);
    } finally {
      controller.abort();
      await running.close();
    }
  });

  it("turns a dropped spec red, then green into seats", async () => {
    delete process.env.ARENA_WALL_GITHUB;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "arena-wall-"));
    const specDir = path.join(dir, "specs");
    fs.mkdirSync(specDir);
    const running = await serve({
      port: 0,
      logPath: path.join(dir, "events.jsonl"),
      specDir,
      now: () => new Date("2026-11-04T18:00:00.000Z"),
    });
    try {
      fs.writeFileSync(path.join(specDir, "ink-well.md"), WEAK);
      const red = await waitFor(async () => {
        const body = (await (await fetch(`${running.url}api/state`)).json()) as {
          state: { ideas: Record<string, { lane: string }>; reports: Record<string, { missing: string[] }> };
        };
        const idea = body.state.ideas["ink-well"];
        if (!idea || idea.lane !== "spec") return false;
        expect(body.state.reports["ink-well"]?.missing).toEqual(["acceptance tests", "seat briefs"]);
        return true;
      });
      expect(red).toBe(true);
      fs.writeFileSync(path.join(specDir, "ink-well.md"), FIXED);
      const green = await waitFor(async () => {
        const body = (await (await fetch(`${running.url}api/state`)).json()) as {
          state: { ideas: Record<string, { lane: string }>; reports: Record<string, { ok: boolean }> };
        };
        return body.state.ideas["ink-well"]?.lane === "seats" && body.state.reports["ink-well"]?.ok === true;
      });
      expect(green).toBe(true);
    } finally {
      await running.close();
    }
  });

  it("resolves spec paths inside the spec folders only", () => {
    expect(resolveSpecPath(ROOT, "specs/comet-lab.md")).toBe(path.join(ROOT, "specs", "comet-lab.md"));
    expect(resolveSpecPath(ROOT, "specs/../package.json")).toBeNull();
    expect(resolveSpecPath(ROOT, "/etc/passwd")).toBeNull();
    const parsed = parseSpecFile(WEAK, "ink-well.md");
    const events = eventsForSpec(parsed, "ink-well.md", "2026-11-04T18:00:00.000Z", false);
    expect(events.map((event) => event.t)).toEqual(["idea.added", "spec.linted"]);
  });
});

async function waitFor(probe: () => Promise<boolean>): Promise<boolean> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (await probe()) return true;
    await new Promise((resolve) => setTimeout(resolve, 40));
  }
  return false;
}
