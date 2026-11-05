import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";
import { LANE_LABELS, LANES, SEAT_STYLES } from "../core/model.ts";
import { present, type Presented } from "../core/replay.ts";
import type { LogEntry } from "../core/types.ts";
import { loadFixtureLog } from "../sources/fixtures/adapter.ts";
import { loadGithubEvents } from "../sources/github/adapter.ts";
import { watchSpecs } from "../sources/specfs/watch.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..");

export interface ServerHandle {
  port: number;
  url: string;
  logPath: string;
  close: () => Promise<void>;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  root?: string;
  logPath?: string;
  specDir?: string;
  reset?: boolean;
  source?: "fixtures" | "github";
}

interface Payload extends Presented {
  source: "fixtures" | "github";
  lanes: typeof LANES;
  labels: typeof LANE_LABELS;
  styles: typeof SEAT_STYLES;
}

export async function startServer(options: ServerOptions = {}): Promise<ServerHandle> {
  const root = options.root ?? repoRoot;
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4173;
  const logPath = options.logPath ?? path.join(root, ".arena-wall", "events.jsonl");
  const specDir = options.specDir ?? path.join(root, "specs");
  const reset = options.reset ?? process.env.ARENA_RESET === "1";
  const requested = options.source ?? (process.env.ARENA_SOURCE === "github" ? "github" : "fixtures");

  await bundleUi(root);
  const source = await ensureLog(logPath, reset, requested);

  const entries: LogEntry[] = [];
  let remainder = "";
  let offset = 0;
  const clients = new Set<http.ServerResponse>();

  const readNew = (): boolean => {
    if (!fs.existsSync(logPath)) return false;
    const stat = fs.statSync(logPath);
    if (stat.size < offset) {
      entries.length = 0;
      remainder = "";
      offset = 0;
    }
    if (stat.size === offset) return false;
    const fd = fs.openSync(logPath, "r");
    const buf = Buffer.alloc(stat.size - offset);
    fs.readSync(fd, buf, 0, buf.length, offset);
    fs.closeSync(fd);
    offset = stat.size;
    remainder += buf.toString("utf8");
    const lines = remainder.split("\n");
    remainder = lines.pop() ?? "";
    let changed = false;
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line) as LogEntry);
        changed = true;
      } catch {
        // A partial or foreign line must not take the wall down.
      }
    }
    return changed;
  };

  readNew();

  const payload = (index?: number): Payload => ({
    ...present(entries, index ?? entries.length),
    source,
    lanes: LANES,
    labels: LANE_LABELS,
    styles: SEAT_STYLES,
  });

  const broadcast = (): void => {
    const body = `event: pipeline\ndata: ${JSON.stringify(payload())}\n\n`;
    for (const client of clients) client.write(body);
  };

  const poll = setInterval(() => {
    if (readNew()) broadcast();
  }, 200);

  const stopSpecs = watchSpecs(specDir, (entry) => {
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`);
  });

  const uiDir = path.join(root, "ui");
  const distJs = path.join(root, "dist", "ui", "wall.js");

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}`);
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("read only");
      return;
    }

    if (url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`event: pipeline\ndata: ${JSON.stringify(payload())}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    if (url.pathname === "/api/state") {
      sendJson(res, payload());
      return;
    }

    if (url.pathname === "/api/replay") {
      const raw = url.searchParams.get("index");
      const index = raw === "t0" ? payload().t0 : Number(raw ?? payload().length);
      sendJson(res, payload(index));
      return;
    }

    if (url.pathname === "/api/spec") {
      const id = url.searchParams.get("id") ?? "";
      const idea = payload().state.ideas[id];
      const markdown = idea?.specPath ? readSafe(root, idea.specPath) : "";
      sendJson(res, { id, markdown, report: idea ? payload().state.specs[id] ?? null : null });
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      sendFile(res, path.join(uiDir, "index.html"), "text/html; charset=utf-8");
      return;
    }
    if (url.pathname === "/wall.css") {
      sendFile(res, path.join(uiDir, "wall.css"), "text/css; charset=utf-8");
      return;
    }
    if (url.pathname === "/wall.js") {
      sendFile(res, distJs, "text/javascript; charset=utf-8");
      return;
    }
    if (url.pathname === "/media/demo-frame.gif") {
      sendFile(res, path.join(uiDir, "media", "demo-frame.gif"), "image/gif");
      return;
    }
    if (url.pathname === "/favicon.svg") {
      sendFile(res, path.join(uiDir, "favicon.svg"), "image/svg+xml");
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  });

  await new Promise<void>((resolve) => {
    server.listen(port, host, () => resolve());
  });
  const address = server.address();
  const bound = typeof address === "object" && address ? address.port : port;

  return {
    port: bound,
    url: `http://${host}:${bound}`,
    logPath,
    close: () =>
      new Promise((resolve, reject) => {
        clearInterval(poll);
        stopSpecs();
        for (const client of clients) client.end();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

async function ensureLog(
  logPath: string,
  reset: boolean,
  source: "fixtures" | "github",
): Promise<"fixtures" | "github"> {
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  if (!reset && fs.existsSync(logPath)) return source === "github" ? "github" : "fixtures";
  if (source === "github") {
    const loaded = await loadOptionalGithub();
    if (loaded && loaded.length > 0) {
      fs.writeFileSync(logPath, `${loaded.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
      return "github";
    }
    process.stderr.write("github source unavailable, serving fixtures\n");
  }
  const lines = loadFixtureLog().map((entry) => JSON.stringify(entry)).join("\n");
  fs.writeFileSync(logPath, `${lines}\n`);
  return "fixtures";
}

async function bundleUi(root: string): Promise<void> {
  const outfile = path.join(root, "dist", "ui", "wall.js");
  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  await esbuild.build({
    entryPoints: [path.join(root, "ui", "wall.ts")],
    bundle: true,
    outfile,
    format: "iife",
    platform: "browser",
    target: "es2022",
    sourcemap: false,
    logLevel: "silent",
  });
}

function sendJson(res: http.ServerResponse, body: unknown): void {
  const raw = JSON.stringify(body);
  res.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(raw);
}

function sendFile(res: http.ServerResponse, file: string, type: string): void {
  if (!fs.existsSync(file)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
  res.end(fs.readFileSync(file));
}

function readSafe(root: string, specPath: string): string {
  const full = path.resolve(root, specPath);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (full !== root && !full.startsWith(rootWithSep)) return "";
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return "";
  return fs.readFileSync(full, "utf8");
}

export async function loadOptionalGithub(now = new Date().toISOString()): Promise<LogEntry[] | null> {
  if (process.env.ARENA_SOURCE !== "github") return null;
  const token = process.env.GITHUB_TOKEN ?? "";
  const repo = process.env.ARENA_REPO ?? "";
  if (!token || !repo) return null;
  const events = await loadGithubEvents({ repo, token, now });
  return events.map((event) => ({ at: now, event }));
}
