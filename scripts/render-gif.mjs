import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const logPath = path.join(root, ".arena-wall", "gif-events.jsonl");
fs.rmSync(logPath, { force: true });
fs.mkdirSync(path.dirname(logPath), { recursive: true });
const frames = path.join(root, "shots", "frames");
fs.rmSync(frames, { recursive: true, force: true });
fs.mkdirSync(frames, { recursive: true });

const server = spawn(
  process.execPath,
  ["--import", "tsx", "cli/arena-wall.ts", "serve", "--port", "4391", "--log", logPath],
  { cwd: root, stdio: "inherit" },
);

async function waitForHealth() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:4391/api/health");
      if (response.ok) return;
    } catch {
      // Server is still binding.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("wall did not start");
}

let index = 0;
async function hold(page, count) {
  for (let step = 0; step < count; step += 1) {
    const file = path.join(frames, `f${String(index).padStart(3, "0")}.png`);
    await page.screenshot({ path: file });
    index += 1;
  }
}

try {
  await waitForHealth();
  const browser = await chromium.launch({
    channel: "chrome",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto("http://127.0.0.1:4391/?mode=tv", { waitUntil: "networkidle" });
  await page.waitForSelector("[data-ready='true']");
  await hold(page, 10);
  await page.locator("[data-idea='harbor-mint']").click();
  await page.waitForSelector("#drawer:not([hidden])");
  await hold(page, 12);
  await page.locator("[data-close-drawer]").click();
  await page.locator("[data-idea='north-glass']").click();
  await page.waitForSelector("#drawer:not([hidden])");
  await hold(page, 12);
  await page.locator("[data-close-drawer]").click();
  await page.locator("#replay").evaluate((input) => {
    input.value = "0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await hold(page, 8);
  await page.locator("#live").click();
  await hold(page, 8);
  await browser.close();
} finally {
  server.kill("SIGTERM");
}

const palette = path.join(root, "shots", "palette.png");
const gif = path.join(root, "shots", "demo.gif");
function ffmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`))));
  });
}
await ffmpeg([
  "-y",
  "-framerate",
  "4",
  "-i",
  path.join(frames, "f%03d.png"),
  "-vf",
  "palettegen=stats_mode=diff",
  palette,
]);
await ffmpeg([
  "-y",
  "-framerate",
  "4",
  "-i",
  path.join(frames, "f%03d.png"),
  "-i",
  palette,
  "-lavfi",
  "paletteuse=dither=bayer:bayer_scale=3",
  gif,
]);
const size = fs.statSync(gif).size;
process.stdout.write(`frames ${index} bytes ${size}\n`);
