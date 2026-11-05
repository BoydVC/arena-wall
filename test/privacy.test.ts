import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { denyTerms } from "../core/deny.ts";
import { isGitRepo, listScanFiles, scanWorkingTree } from "../core/privacy.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("privacy deny list", () => {
  it("keeps the terms in the gitignored deny file and nowhere else", () => {
    const denyPath = path.join(root, ".arena-wall", "deny.txt");
    fs.mkdirSync(path.dirname(denyPath), { recursive: true });
    fs.writeFileSync(denyPath, `${denyTerms().join("\n")}\n`);
    const hits = scanWorkingTree(root);
    expect(hits).toEqual([]);
  });

  it("matches a short token on a boundary and ignores a longer word", () => {
    const source = fs.readFileSync(path.join(root, "docs/lifecycle.md"), "utf8");
    expect(source.toLowerCase()).toContain("statechart");
    expect(scanWorkingTree(root)).toEqual([]);
  });

  it("does not commit a deny file", () => {
    const denyPath = path.join(root, ".arena-wall", "deny.txt");
    fs.mkdirSync(path.dirname(denyPath), { recursive: true });
    fs.writeFileSync(denyPath, `${denyTerms().join("\n")}\n`);
    const gi = fs.readFileSync(path.join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/\.arena-wall\//);
    const scanned = listScanFiles(root);
    expect(scanned.some((file) => file === ".arena-wall/deny.txt" || file.endsWith("/deny.txt"))).toBe(false);
    if (isGitRepo(root)) {
      const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" });
      const denyFiles = tracked.split("\n").filter((line) => line.endsWith("deny.txt") || line.endsWith("deny.md"));
      expect(denyFiles).toEqual([]);
      const ignored = execFileSync("git", ["check-ignore", denyPath], { cwd: root, encoding: "utf8" }).trim();
      expect(ignored).toBe(denyPath);
    }
  });

  it("falls back to a tree walk when not inside a git repo", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "arena-privacy-"));
    const leak = denyTerms()[2] ?? "denied-term";
    try {
      fs.mkdirSync(path.join(tmp, "src"));
      fs.mkdirSync(path.join(tmp, "node_modules", "pkg"), { recursive: true });
      fs.mkdirSync(path.join(tmp, ".arena-wall"));
      fs.writeFileSync(path.join(tmp, "src", "ok.ts"), "export const title = 'Ridge Owl';\n");
      fs.writeFileSync(path.join(tmp, "node_modules", "pkg", "leak.ts"), `${leak}\n`);
      fs.writeFileSync(path.join(tmp, ".arena-wall", "deny.txt"), `${denyTerms().join("\n")}\n`);
      fs.writeFileSync(path.join(tmp, ".gitignore"), "node_modules/\n.arena-wall/\n");
      expect(isGitRepo(tmp)).toBe(false);
      const files = listScanFiles(tmp);
      expect(files).toContain("src/ok.ts");
      expect(files).toContain(".gitignore");
      expect(files.some((file) => file.includes("node_modules"))).toBe(false);
      expect(files.some((file) => file.includes(".arena-wall"))).toBe(false);
      expect(scanWorkingTree(tmp)).toEqual([]);

      fs.writeFileSync(path.join(tmp, "src", "bad.ts"), `export const x = '${leak}';\n`);
      expect(scanWorkingTree(tmp)).toEqual([{ file: "src/bad.ts", term: leak }]);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
