import fs from "node:fs";
import path from "node:path";
import { lintSpec } from "../core/specLint.ts";
import { startServer } from "../server/main.ts";

const [command = "serve", ...rest] = process.argv.slice(2);

if (command === "serve") {
  const port = Number(flag(rest, "--port") ?? process.env.PORT ?? 4173);
  const handle = await startServer({ port, reset: process.env.ARENA_RESET === "1" });
  process.stdout.write(`arena-wall ${handle.url}\n`);
} else if (command === "lint") {
  const file = rest.find((arg) => !arg.startsWith("--"));
  if (!file) {
    process.stderr.write("usage: arena-wall lint <SPEC.md>\n");
    process.exit(2);
  }
  const markdown = fs.readFileSync(file, "utf8");
  const report = lintSpec(markdown, file);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.ok ? 0 : 1);
} else if (command === "snapshot") {
  const out = flag(rest, "--out") ?? "wall.png";
  await snapshot(out);
} else {
  process.stderr.write("usage: arena-wall serve | lint <SPEC.md> | snapshot --out wall.png\n");
  process.exit(2);
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

async function snapshot(out: string): Promise<void> {
  const handle = await startServer({ port: 0, reset: true });
  try {
    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${handle.url}/`);
    await page.waitForSelector("[data-lane-column='merged']");
    fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
    await page.screenshot({ path: out });
    await browser.close();
    process.stdout.write(`${path.resolve(out)}\n`);
  } finally {
    await handle.close();
  }
}
