import path from "node:path";

import { readFileSync } from "node:fs";

import { lintSpec } from "../core/specLint";
import { loadDenyTerms } from "../core/terms";
import { githubEnabled } from "../sources/github/read";
import { root } from "../sources/root";
import { startWall } from "../server/host";
import { buildUi } from "./build";

function flag(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function usage(): void {
  console.log(`arena-wall serve [--port N]
arena-wall lint <SPEC.md>
arena-wall snapshot --out wall.png`);
}

async function serve(args: readonly string[]): Promise<void> {
  await buildUi();
  const port = Number(flag(args, "--port") ?? process.env.PORT ?? 4177);
  const home = process.env.ARENA_HOME ?? path.join(root, ".arena-wall");
  const specDir = process.env.ARENA_SPEC_DIR ?? path.join(root, "specs/inbox");
  const useGithub = githubEnabled();
  const wall = await startWall({
    port,
    home,
    specDir,
    source: useGithub ? "github" : "fixtures",
    repo: process.env.ARENA_REPO,
    token: process.env.GITHUB_TOKEN,
  });
  console.log(`arena-wall listening on ${wall.url}`);
  console.log(`source ${useGithub ? "github" : "fixtures"}`);
  const shutdown = () => {
    void wall.close().then(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function lint(args: readonly string[]): Promise<void> {
  const file = args.find((arg) => !arg.startsWith("--"));
  if (!file) {
    usage();
    process.exit(2);
  }
  const report = lintSpec(readFileSync(file, "utf8"), file, loadDenyTerms());
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}

async function snapshot(args: readonly string[]): Promise<void> {
  await buildUi();
  const out = flag(args, "--out") ?? "wall.png";
  const home = path.join(root, "tmp/snapshot-home");
  const specDir = path.join(root, "tmp/snapshot-specs");
  const wall = await startWall({ port: 0, home, specDir });
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${wall.url}/?mode=tv`, { waitUntil: "networkidle" });
    await page.waitForSelector(".card");
    await page.screenshot({ path: out, fullPage: false });
    console.log(out);
  } finally {
    await browser.close();
    await wall.close();
  }
}

const [command, ...args] = process.argv.slice(2);
if (command === "serve") await serve(args);
else if (command === "lint") await lint(args);
else if (command === "snapshot") await snapshot(args);
else {
  usage();
  process.exit(command ? 2 : 0);
}
