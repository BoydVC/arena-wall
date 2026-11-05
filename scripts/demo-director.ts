import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { scanWorkingTree } from "../core/privacy.ts";
import { startServer } from "../server/main.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const shotDir = path.join(root, "screenshots");
const gif = path.join(root, "demo.gif");
const failures: string[] = [];

fs.mkdirSync(shotDir, { recursive: true });

const handle = await startServer({
  port: 0,
  reset: true,
  specDir: path.join(os.tmpdir(), "arena-wall-director-specs"),
});

const browser = await chromium.launch();
try {
  const aspects: Array<{ file: string; width: number; height: number; mode: "tv" | "phone" }> = [
    { file: "wall-1920x1080.png", width: 1920, height: 1080, mode: "tv" },
    { file: "wall-1080x1080.png", width: 1080, height: 1080, mode: "tv" },
    { file: "wall-1080x1920.png", width: 1080, height: 1920, mode: "tv" },
    { file: "wall-390x844.png", width: 390, height: 844, mode: "phone" },
  ];

  for (const aspect of aspects) {
    const page = await browser.newPage({ viewport: { width: aspect.width, height: aspect.height } });
    const problems: string[] = [];
    page.on("pageerror", (error) => problems.push(String(error)));
    await page.goto(`${handle.url}/?mode=${aspect.mode}`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-idea='ridge-owl']");
    await page.locator("[data-lane-column]:not(.hidden) [data-face]").first().waitFor();
    const file = path.join(shotDir, aspect.file);
    await page.screenshot({ path: file });
    const box = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      clientHeight: document.documentElement.clientHeight,
      faces: document.querySelectorAll("[data-face]").length,
      lanes: document.querySelectorAll("[data-lane-column] h2").length,
    }));
    if (box.faces < 18) failures.push(`${aspect.file} rendered ${box.faces} faces`);
    if (box.lanes < 7) failures.push(`${aspect.file} rendered ${box.lanes} lanes`);
    if (box.scrollWidth > box.clientWidth + 1 || box.scrollHeight > box.clientHeight + 1) {
      failures.push(`${aspect.file} overflow ${box.scrollWidth}x${box.scrollHeight}`);
    }
    if (problems.length > 0) failures.push(`${aspect.file} ${problems.join("; ")}`);
    await page.close();
  }

  const videoDir = path.join(os.tmpdir(), "arena-wall-video");
  fs.rmSync(videoDir, { recursive: true, force: true });
  fs.mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();
  await page.goto(`${handle.url}/?mode=tv&pace=0.55`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-lane-column]:not(.hidden) [data-face]").first().waitFor();
  await page.keyboard.press(" ");
  await page.waitForSelector("body[data-playing='true']", { timeout: 10000 });
  await page.waitForSelector("body[data-playing='false'][data-played='true']", { timeout: 60000 });
  await page.waitForTimeout(400);
  const video = page.video();
  await context.close();
  const webm = video ? await video.path() : "";
  if (!webm) failures.push("demo video missing");
  else {
    const palette = path.join(videoDir, "palette.png");
    const filter = "fps=8,scale=960:-1:flags=lanczos";
    const gen = execFileSync(
      "ffmpeg",
      ["-y", "-i", webm, "-vf", `${filter},palettegen=stats_mode=diff`, palette],
      { stdio: "pipe" },
    );
    void gen;
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-i",
        webm,
        "-i",
        palette,
        "-lavfi",
        `${filter}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
        gif,
      ],
      { stdio: "pipe" },
    );
  }
} finally {
  await browser.close();
  await handle.close();
}

if (!fs.existsSync(gif) || fs.statSync(gif).size < 20_000) failures.push("demo gif missing or blank");
else {
  const probe = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", gif],
    { encoding: "utf8" },
  ).trim();
  const duration = Number(probe);
  if (!Number.isFinite(duration) || duration < 2) failures.push(`demo gif duration ${probe}`);
}

for (const name of ["wall-1920x1080.png", "wall-1080x1080.png", "wall-1080x1920.png", "wall-390x844.png"]) {
  const shot = path.join(shotDir, name);
  if (!fs.existsSync(shot) || fs.statSync(shot).size < 10_000) failures.push(`screenshot missing or blank: ${name}`);
}

const hits = scanWorkingTree(root);
if (hits.length > 0) failures.push(`name-blocked: ${hits.map((hit) => `${hit.file}:${hit.term}`).join(", ")}`);

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("demo-director ok\n");
