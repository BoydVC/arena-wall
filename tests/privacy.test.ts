import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { defaultDenyTerms, termPresent } from "../core/denyTerms.js";
import { ROOT } from "../sources/root.js";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".arena-wall",
  ".demo-director",
  "playwright-report",
  "test-results",
  "shots",
]);

const TEXT = new Set([".ts", ".js", ".mjs", ".cjs", ".md", ".css", ".html", ".json", ".txt", ".svg", ".yml"]);

function walk(dir: string, out: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (TEXT.has(path.extname(entry.name))) out.push(full);
  }
}

describe("privacy", () => {
  it("keeps deny-list terms out of the repo except the gitignored deny file", () => {
    const denyDir = path.join(ROOT, ".demo-director");
    fs.mkdirSync(denyDir, { recursive: true });
    const denyFile = path.join(denyDir, "deny.txt");
    const terms = defaultDenyTerms();
    fs.writeFileSync(denyFile, `${terms.join("\n")}\n`);
    const ignored = execSync(`git check-ignore ${JSON.stringify(denyFile)}`, { cwd: ROOT, encoding: "utf8" }).trim();
    expect(ignored).toBe(denyFile);
    const tracked = execSync("git ls-files", { cwd: ROOT, encoding: "utf8" });
    expect(tracked.includes(".demo-director/deny.txt")).toBe(false);

    const files: string[] = [];
    walk(ROOT, files);
    const hits: string[] = [];
    files.forEach((file, fileIndex) => {
      const text = fs.readFileSync(file, "utf8");
      terms.forEach((term, termIndex) => {
        if (termPresent(text, term)) hits.push(`${path.relative(ROOT, file)} term#${termIndex} file#${fileIndex}`);
      });
    });
    expect(hits).toEqual([]);
  });
});
