import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { chromium } from "playwright";

import { buildUi } from "../cli/build";
import { root } from "../sources/root";
import { startWall } from "../server/host";

const videoDir = path.join(root, "tmp/video");
mkdirSync(videoDir, { recursive: true });
mkdirSync(path.join(root, "docs"), { recursive: true });

await buildUi();
const wall = await startWall({
  port: 4188,
  home: path.join(root, "tmp/demo-home"),
  specDir: path.join(root, "tmp/demo-specs"),
});

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 810 },
  recordVideo: { dir: videoDir, size: { width: 1440, height: 810 } },
});
const page = await context.newPage();
await page.goto(`${wall.url}/?mode=tv`, { waitUntil: "networkidle" });
await page.waitForSelector(".face");
await page.waitForTimeout(600);
await page.click("#play-demo");
await page.waitForSelector("body[data-playing='true']");
await page.waitForSelector("body:not([data-playing='true'])", { timeout: 30_000 });
await page.waitForTimeout(500);
const video = page.video();
await context.close();
await browser.close();
await wall.close();
const webm = video ? await video.path() : "";
if (!webm) throw new Error("no video");

const gif = path.join(root, "docs/demo.gif");
const palette = path.join(root, "tmp/palette.png");
const filter = "fps=6,scale=800:-1:flags=lanczos";
const gen = spawnSync("ffmpeg", ["-y", "-i", webm, "-vf", `${filter},palettegen=stats_mode=diff`, palette], { stdio: "inherit" });
if (gen.status !== 0) process.exit(gen.status ?? 1);
const use = spawnSync(
  "ffmpeg",
  ["-y", "-i", webm, "-i", palette, "-lavfi", `${filter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`, gif],
  { stdio: "inherit" },
);
if (use.status !== 0) process.exit(use.status ?? 1);
console.log(gif);
