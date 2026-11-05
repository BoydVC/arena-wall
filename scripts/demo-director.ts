import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scanWorkingTree } from "../core/privacy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gif = path.join(root, "docs", "demo.gif");
const shots = [
  path.join(root, "docs", "screenshots", "wall-1920x1080.png"),
  path.join(root, "docs", "screenshots", "wall-390x844.png"),
];

const failures: string[] = [];

if (!fs.existsSync(gif) || fs.statSync(gif).size < 20_000) {
  failures.push("demo gif missing or blank");
} else {
  const probe = execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", gif],
    { encoding: "utf8" },
  ).trim();
  const duration = Number(probe);
  if (!Number.isFinite(duration) || duration < 2) failures.push(`demo gif duration ${probe}`);
}

for (const shot of shots) {
  if (!fs.existsSync(shot) || fs.statSync(shot).size < 10_000) failures.push(`screenshot missing or blank: ${shot}`);
}

const hits = scanWorkingTree(root);
if (hits.length > 0) {
  failures.push(`name-blocked: ${hits.map((hit) => `${hit.file}:${hit.term}`).join(", ")}`);
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exit(1);
}

process.stdout.write("demo-director ok\n");
