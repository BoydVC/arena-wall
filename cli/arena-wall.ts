import fs from "node:fs";
import path from "node:path";
import { lintSpec } from "../core/specLint.js";
import { serve } from "../server/serve.js";

interface Args {
  readonly command: string;
  readonly positionals: readonly string[];
  readonly flags: Readonly<Record<string, string>>;
}

function parseArgs(argv: readonly string[]): Args {
  const positionals: string[] = [];
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    if (token.startsWith("--")) {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) flags[token.slice(2)] = "true";
      else {
        flags[token.slice(2)] = next;
        index += 1;
      }
    } else positionals.push(token);
  }
  return { command: positionals[0] ?? "serve", positionals: positionals.slice(1), flags };
}

function numberFlag(flags: Readonly<Record<string, string>>, name: string, fallback: number): number {
  const raw = flags[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} must be a whole number`);
  return value;
}

async function cmdServe(args: Args): Promise<void> {
  const port = numberFlag(args.flags, "port", 4317);
  const host = args.flags.host ?? "127.0.0.1";
  const logPath = path.resolve(args.flags.log ?? path.join(".arena-wall", "events.jsonl"));
  const specDir = path.resolve(args.flags.spec ?? "specs");
  const running = await serve({ port, host, logPath, specDir });
  process.stdout.write(`arena-wall ${running.url}\n`);
  const stop = async (): Promise<void> => {
    await running.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void stop());
  process.on("SIGTERM", () => void stop());
}

function cmdLint(args: Args): void {
  const file = args.positionals[0] ?? args.flags.file;
  if (!file) throw new Error("usage: arena-wall lint <SPEC.md>");
  const markdown = fs.readFileSync(file, "utf8");
  const report = lintSpec(markdown, { path: file });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ok ? 0 : 1;
}

async function cmdSnapshot(args: Args): Promise<void> {
  const out = args.flags.out;
  if (!out) throw new Error("usage: arena-wall snapshot --out wall.png");
  const mode = args.flags.mode === "phone" ? "phone" : "tv";
  const width = mode === "phone" ? 390 : 1920;
  const height = mode === "phone" ? 844 : 1080;
  let url = args.flags.url;
  let close: (() => Promise<void>) | undefined;
  if (!url) {
    const logPath = path.resolve(".arena-wall", "snapshot-events.jsonl");
    await fs.promises.rm(logPath, { force: true });
    const running = await serve({
      port: 0,
      logPath,
      specDir: path.resolve("specs"),
    });
    url = `${running.url}?mode=${mode}`;
    close = () => running.close();
  } else if (!url.includes("mode=")) {
    url += url.includes("?") ? `&mode=${mode}` : `?mode=${mode}`;
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width, height } });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-ready='true']");
    await fs.promises.mkdir(path.dirname(path.resolve(out)), { recursive: true });
    await page.screenshot({ path: path.resolve(out) });
    process.stdout.write(`${path.resolve(out)}\n`);
  } finally {
    await browser.close();
    if (close) await close();
  }
}

const HELP = `arena-wall serve [--port 4317] [--host 127.0.0.1] [--log .arena-wall/events.jsonl] [--spec specs]
arena-wall lint <SPEC.md>
arena-wall snapshot --out wall.png [--mode tv|phone] [--url http://127.0.0.1:4317/]
`;

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "help" || args.flags.help === "true") {
    process.stdout.write(HELP);
    return;
  }
  if (args.command === "serve") return cmdServe(args);
  if (args.command === "lint") return cmdLint(args);
  if (args.command === "snapshot") return cmdSnapshot(args);
  throw new Error(`unknown command ${args.command}\n${HELP}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "arena-wall failed";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
