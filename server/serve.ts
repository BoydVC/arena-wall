import { createHash } from "node:crypto";
import * as esbuild from "esbuild";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { type LogEntry } from "../core/model.js";
import { parseLogEntry } from "../core/parse.js";
import { eventsOf, fold, replay, replayOrigin } from "../core/replay.js";
import { project } from "../core/project.js";
import { fixtureLog, shiftLog } from "../sources/fixtures.js";
import { githubEnabled, loadGitHubEvents } from "../sources/github.js";
import { ROOT } from "../sources/root.js";
import { eventsForSpec, listSpecFiles, parseSpecFile, resolveSpecPath } from "../sources/specfs.js";

export interface ServeOptions {
  readonly port: number;
  readonly host?: string;
  readonly logPath: string;
  readonly specDir?: string;
  readonly now?: () => Date;
  readonly seedFixtures?: boolean;
}

export interface RunningServer {
  readonly port: number;
  readonly url: string;
  close(): Promise<void>;
}

interface Hub {
  entries: LogEntry[];
  offset: number;
  partial: string;
  clients: Set<http.ServerResponse>;
  specHash: Map<string, string>;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function ensureLog(logPath: string, now: Date, seedFixtures: boolean): Promise<void> {
  await fs.promises.mkdir(path.dirname(logPath), { recursive: true });
  const existing = await fs.promises.readFile(logPath, "utf8").catch(() => "");
  if (existing.trim().length > 0 || !seedFixtures) {
    if (existing.length === 0) await fs.promises.writeFile(logPath, "");
    return;
  }
  const lines = shiftLog(fixtureLog(), now).map((entry) => JSON.stringify(entry));
  await fs.promises.writeFile(logPath, `${lines.join("\n")}\n`);
}

function loadEntries(raw: string): { entries: LogEntry[]; partial: string } {
  const lines = raw.split("\n");
  const partial = lines.pop() ?? "";
  const entries: LogEntry[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = parseLogEntry(JSON.parse(line) as unknown);
      if (parsed) entries.push(parsed);
    } catch {
      // Skip a corrupt line. The next poll continues after it.
    }
  }
  return { entries, partial };
}

let bundle: string | undefined;

async function wallScript(): Promise<string> {
  if (bundle) return bundle;
  const result = await esbuild.build({
    absWorkingDir: ROOT,
    entryPoints: ["ui/main.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "silent",
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error("UI bundle was empty");
  bundle = file.text;
  return bundle;
}

function send(res: http.ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function serve(options: ServeOptions): Promise<RunningServer> {
  const now = options.now ?? (() => new Date());
  const host = options.host ?? "127.0.0.1";
  const specDir = options.specDir ?? path.join(ROOT, "specs");
  const seedFixtures = options.seedFixtures !== false && !githubEnabled();
  await ensureLog(options.logPath, now(), seedFixtures);

  if (githubEnabled()) {
    const token = process.env.GITHUB_TOKEN ?? "";
    const repo = process.env.ARENA_WALL_REPO ?? "";
    try {
      const events = await loadGitHubEvents(repo, token, now().toISOString());
      const lines = events.map((event, index) =>
        JSON.stringify({ at: new Date(now().getTime() + index).toISOString(), event }),
      );
      await fs.promises.appendFile(options.logPath, `${lines.join("\n")}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "GitHub read failed";
      process.stderr.write(`GitHub adapter skipped: ${message}\n`);
      if (!seedFixtures) {
        const lines = shiftLog(fixtureLog(), now()).map((entry) => JSON.stringify(entry));
        await fs.promises.appendFile(options.logPath, `${lines.join("\n")}\n`);
      }
    }
  }

  const raw = await fs.promises.readFile(options.logPath, "utf8");
  const loaded = loadEntries(raw);
  const hub: Hub = {
    entries: loaded.entries,
    offset: Buffer.byteLength(raw),
    partial: loaded.partial,
    clients: new Set(),
    specHash: new Map(),
  };
  for (const file of listSpecFiles(specDir)) {
    hub.specHash.set(file, hashText(fs.readFileSync(file, "utf8")));
  }

  let queue: Promise<void> = Promise.resolve();
  const enqueue = (work: () => Promise<void>): Promise<void> => {
    queue = queue.then(work, work);
    return queue;
  };

  const knownIds = (): Set<string> => {
    const ids = new Set<string>();
    for (const entry of hub.entries) {
      if (entry.event.t === "idea.added") ids.add(entry.event.idea.id);
    }
    return ids;
  };

  const broadcast = (event: string, data: unknown): void => {
    for (const client of hub.clients) {
      try {
        send(client, event, data);
      } catch {
        hub.clients.delete(client);
      }
    }
  };

  const pollLog = async (): Promise<void> => {
    const stat = await fs.promises.stat(options.logPath).catch(() => null);
    if (!stat) return;
    if (stat.size < hub.offset) {
      const text = await fs.promises.readFile(options.logPath, "utf8");
      const next = loadEntries(text);
      hub.entries = next.entries;
      hub.partial = next.partial;
      hub.offset = Buffer.byteLength(text);
      broadcast("reset", { now: now().toISOString(), entries: hub.entries });
      return;
    }
    if (stat.size === hub.offset) return;
    const handle = await fs.promises.open(options.logPath, "r");
    const length = stat.size - hub.offset;
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, hub.offset);
    await handle.close();
    hub.offset = stat.size;
    const text = hub.partial + buf.toString("utf8");
    const lines = text.split("\n");
    hub.partial = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const parsed = parseLogEntry(JSON.parse(line) as unknown);
        if (!parsed) continue;
        hub.entries.push(parsed);
        broadcast("append", { now: now().toISOString(), entry: parsed });
      } catch {
        // Ignore a partial or foreign line.
      }
    }
  };

  const pollSpecs = async (): Promise<void> => {
    const files = listSpecFiles(specDir);
    const seen = new Set(files);
    for (const file of hub.specHash.keys()) {
      if (!seen.has(file)) hub.specHash.delete(file);
    }
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      const digest = hashText(text);
      if (hub.specHash.get(file) === digest) continue;
      hub.specHash.set(file, digest);
      const rel = path.relative(ROOT, file).split(path.sep).join("/");
      const stored = rel.startsWith("..") ? path.basename(file) : rel;
      const parsed = parseSpecFile(text, file);
      const stamp = now().toISOString();
      const events = eventsForSpec(parsed, stored, stamp, knownIds().has(parsed.ideaId));
      await enqueue(async () => {
        const lines = events.map((event, index) =>
          JSON.stringify({ at: new Date(now().getTime() + index).toISOString(), event }),
        );
        await fs.promises.appendFile(options.logPath, `${lines.join("\n")}\n`);
      });
    }
  };

  const liveState = () => {
    const events = eventsOf(hub.entries);
    return project(replay(events, events.length), now().toISOString());
  };

  const server = http.createServer(async (req, res) => {
    const method = req.method ?? "GET";
    if (method !== "GET" && method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
      res.end("read only");
      return;
    }
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/events") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        send(res, "hello", { now: now().toISOString(), origin: replayOrigin(eventsOf(hub.entries)), entries: hub.entries });
        hub.clients.add(res);
        req.on("close", () => hub.clients.delete(res));
        return;
      }
      if (url.pathname === "/api/health") {
        const body = JSON.stringify({ ok: true, source: githubEnabled() ? "github" : "fixtures" });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (url.pathname === "/api/state") {
        const body = JSON.stringify({ now: now().toISOString(), state: liveState() });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (url.pathname === "/api/log") {
        const events = eventsOf(hub.entries);
        const body = JSON.stringify({
          now: now().toISOString(),
          origin: replayOrigin(events),
          entries: hub.entries,
          state: project(fold(events), now().toISOString()),
        });
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (url.pathname === "/api/spec") {
        const rel = url.searchParams.get("path") ?? "";
        const full = resolveSpecPath(ROOT, rel);
        if (!full || !fs.existsSync(full)) {
          res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
          res.end("not found");
          return;
        }
        const body = await fs.promises.readFile(full);
        res.writeHead(200, { "Content-Type": "text/markdown; charset=utf-8", "Cache-Control": "no-store" });
        res.end(method === "HEAD" ? undefined : body);
        return;
      }
      if (url.pathname === "/wall.js") {
        const script = await wallScript();
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-store" });
        res.end(method === "HEAD" ? undefined : script);
        return;
      }
      if (url.pathname === "/styles.css") {
        const css = await fs.promises.readFile(path.join(ROOT, "ui", "styles.css"));
        res.writeHead(200, { "Content-Type": "text/css; charset=utf-8" });
        res.end(method === "HEAD" ? undefined : css);
        return;
      }
      if (url.pathname === "/" || url.pathname === "/index.html") {
        const html = await fs.promises.readFile(path.join(ROOT, "ui", "index.html"));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(method === "HEAD" ? undefined : html);
        return;
      }
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("not found");
    } catch (error) {
      const message = error instanceof Error ? error.message : "request failed";
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(message);
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port, host, () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("server did not bind");
  const timer = setInterval(() => {
    void pollLog().catch(() => undefined);
    void pollSpecs().catch(() => undefined);
  }, 40);

  return {
    port: address.port,
    url: `http://${host}:${address.port}/`,
    async close() {
      clearInterval(timer);
      for (const client of hub.clients) client.end();
      hub.clients.clear();
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    },
  };
}
