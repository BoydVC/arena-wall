/**
 * Tiny static host. GET and SSE only. The event log is a JSONL file under the home directory.
 */

import { createServer, type ServerResponse } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { PipelineEvent } from "../core/model";
import { buildDay } from "../sources/fixtures/day";
import { story } from "../sources/fixtures/story";
import { readGithubArena } from "../sources/github/read";
import { eventsForSpec } from "../sources/specfs/watch";

const here = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(here, "../ui");

const MIME: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
  ".png": "image/png",
  ".html": "text/html; charset=utf-8",
  ".map": "application/json",
};

export interface WallServer {
  port: number;
  url: string;
  close: () => Promise<void>;
}

export interface StartOptions {
  port: number;
  home: string;
  specDir: string;
  host?: string;
  source?: "fixtures" | "github";
  repo?: string;
  token?: string;
}

function parseLog(file: string): PipelineEvent[] {
  if (!existsSync(file)) return [];
  const events: PipelineEvent[] = [];
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const value = JSON.parse(line) as PipelineEvent;
      if (value && typeof value === "object" && "t" in value) events.push(value);
    } catch {
      // Skip a torn line while a writer is still appending.
    }
  }
  return events;
}

export async function startWall(options: StartOptions): Promise<WallServer> {
  const home = path.resolve(options.home);
  const specDir = path.resolve(options.specDir);
  mkdirSync(home, { recursive: true });
  mkdirSync(specDir, { recursive: true });
  const logFile = path.join(home, "events.jsonl");
  const day = buildDay();
  const sourceName = options.source === "github" ? "github" : "fixtures";
  if (!existsSync(logFile)) {
    if (sourceName === "github") {
      if (!options.repo || !options.token) throw new Error("ARENA_REPO is required for the github source");
      const remote = await readGithubArena({ repo: options.repo, token: options.token, now: day.now });
      writeFileSync(logFile, remote.map((event) => JSON.stringify(event)).join("\n") + (remote.length ? "\n" : ""));
    } else {
      writeFileSync(logFile, day.events.map((event) => JSON.stringify(event)).join("\n") + "\n");
    }
  }

  let events = parseLog(logFile);
  const clients = new Set<ServerResponse>();
  const seenSpec = new Map<string, number>();

  const broadcast = () => {
    const payload = `data: ${JSON.stringify({ events })}\n\n`;
    for (const client of clients) client.write(payload);
  };

  let lastSize = existsSync(logFile) ? statSync(logFile).size : 0;
  const reload = () => {
    events = parseLog(logFile);
    lastSize = existsSync(logFile) ? statSync(logFile).size : 0;
    broadcast();
  };

  const append = (fresh: PipelineEvent[]) => {
    if (fresh.length === 0) return;
    appendFileSync(logFile, fresh.map((event) => JSON.stringify(event)).join("\n") + "\n");
    reload();
  };

  const listSpecs = (): string[] => {
    if (!existsSync(specDir)) return [];
    return readdirSync(specDir)
      .filter((name) => name.endsWith(".md"))
      .map((name) => path.join(specDir, name));
  };

  for (const file of listSpecs()) seenSpec.set(file, statSync(file).mtimeMs);

  const scanSpecs = () => {
    for (const file of listSpecs()) {
      const mtime = statSync(file).mtimeMs;
      if (seenSpec.get(file) === mtime) continue;
      seenSpec.set(file, mtime);
      try {
        append(eventsForSpec(file, new Date().toISOString()));
      } catch {
        // A half-written drop is picked up on the next poll.
      }
    }
  };

  const timer = setInterval(() => {
    scanSpecs();
    const size = existsSync(logFile) ? statSync(logFile).size : 0;
    if (size !== lastSize) reload();
  }, 150);
  timer.unref?.();

  const indexHtml = () => {
    const template = readFileSync(path.join(uiDir, "index.html"), "utf8");
    const boot = {
      events,
      opening: day.milestones.opening,
      milestones: day.milestones,
      story,
      now: day.now,
    };
    const json = JSON.stringify(boot).replace(/</g, "\\u003c");
    return template.replace("<!--BOOT-->", `<script>window.__BOOT__=${json}</script>`);
  };

  const server = createServer((req, res) => {
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("read only");
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/api/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, source: sourceName, ideas: events.filter((event) => event.t === "idea.added").length }));
      return;
    }
    if (url.pathname === "/api/bootstrap") {
      const boot = { events, opening: day.milestones.opening, milestones: day.milestones, story, now: day.now };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(boot));
      return;
    }
    if (url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.flushHeaders();
      res.write(`data: ${JSON.stringify({ events })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }
    if (url.pathname === "/favicon.svg") {
      const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#171a1e"/><rect x="6" y="6" width="8" height="20" rx="2" fill="#ff3d8a"/><rect x="18" y="12" width="8" height="14" rx="2" fill="#f0c36a"/></svg>`;
      res.writeHead(200, { "Content-Type": "image/svg+xml" });
      res.end(icon);
      return;
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (method === "HEAD") res.end();
      else res.end(indexHtml());
      return;
    }
    const relative = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
    const file = path.join(uiDir, relative);
    if (!file.startsWith(uiDir) || !existsSync(file) || statSync(file).isDirectory()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    const ext = path.extname(file);
    res.writeHead(200, { "Content-Type": MIME[ext] ?? "application/octet-stream" });
    if (method === "HEAD") res.end();
    else res.end(readFileSync(file));
  });

  const host = options.host ?? "127.0.0.1";
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : options.port;
      resolve({
        port,
        url: `http://${host}:${port}`,
        close: () =>
          new Promise((done) => {
            clearInterval(timer);
            for (const client of clients) client.end();
            server.close(() => done());
          }),
      });
    });
  });
}

export function logPath(home: string): string {
  return path.join(path.resolve(home), "events.jsonl");
}
