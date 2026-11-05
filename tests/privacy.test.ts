import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { termPresent } from "../core/terms";
import { root } from "../sources/root";
import { DENY_TERMS } from "./deny-list";

const BINARY = new Set([".png", ".gif", ".woff", ".woff2", ".ico", ".jpg", ".jpeg", ".webp", ".mp4", ".webm"]);

describe("privacy", () => {
  it("keeps the deny file git-ignored and out of every tracked path", () => {
    const denyDir = path.join(root, ".demo-director");
    mkdirSync(denyDir, { recursive: true });
    const denyFile = path.join(denyDir, "deny.txt");
    writeFileSync(denyFile, `${DENY_TERMS.join("\n")}\n`);
    const ignored = execFileSync("git", ["check-ignore", ".demo-director/deny.txt"], { cwd: root, encoding: "utf8" });
    expect(ignored.trim()).toBe(".demo-director/deny.txt");

    const listed = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
      cwd: root,
      encoding: "buffer",
    });
    const hits: string[] = [];
    for (const name of listed.toString("utf8").split("\0")) {
      if (!name) continue;
      if (name === ".demo-director/deny.txt" || name.startsWith(".demo-director/")) continue;
      const ext = path.extname(name).toLowerCase();
      if (BINARY.has(ext)) continue;
      let text = "";
      try {
        text = readFileSync(path.join(root, name), "utf8");
      } catch {
        continue;
      }
      if (text.includes("\0")) continue;
      for (const term of DENY_TERMS) {
        if (termPresent(text, term)) hits.push(`${name} :: ${term}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
