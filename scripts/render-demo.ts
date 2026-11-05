import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { buildFixtureLog } from "../sources/fixtures/build.ts";
import { startServer } from "../server/main.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const frames = path.join(os.tmpdir(), "arena-wall-frames");
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });

const log = buildFixtureLog();

function after(match: (entry: (typeof log)[number]) => boolean, nth = 1): number {
  let seen = 0;
  for (let index = 0; index < log.length; index += 1) {
    const entry = log[index];
    if (!entry) continue;
    if (!match(entry)) continue;
    seen += 1;
    if (seen === nth) return index + 1;
  }
  throw new Error(`missing mark ${nth}`);
}

const marks = [
  6,
  after((entry) => entry.event.t === "spec.linted"),
  after((entry) => entry.event.t === "seat.updated" && entry.event.seat.id === "comet-lab:experience-first"),
  after((entry) => entry.event.t === "seat.updated" && entry.event.seat.id === "comet-lab:experience-first", 2),
  after((entry) => entry.event.t === "verifier.updated" && entry.event.v.ideaId === "ridge-owl", 3),
  after((entry) => entry.event.t === "pr.updated" && entry.event.pr.ideaId === "ridge-owl"),
  log.length,
];

const handle = await startServer({ port: 0, reset: true, specDir: path.join(os.tmpdir(), "arena-wall-no-specs") });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${handle.url}/`);
await page.waitForSelector("[data-idea='ridge-owl']");

let frame = 1;
for (const index of marks) {
  await page.locator("[data-testid='replay']").evaluate((input: HTMLInputElement, value: number) => {
    input.value = String(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }, index);
  await page.waitForTimeout(200);
  const file = path.join(frames, `frame-${String(frame).padStart(2, "0")}.png`);
  await page.screenshot({ path: file });
  frame += 1;
}

await page.locator("[data-idea='ridge-owl']").click();
await page.waitForSelector("#drawer:not([hidden])");
await page.screenshot({ path: path.join(frames, `frame-${String(frame).padStart(2, "0")}.png`) });

await browser.close();
await handle.close();
process.stdout.write(`${frames}\n`);
