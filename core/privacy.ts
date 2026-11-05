import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { denyTerms } from "./deny.ts";

const TEXT_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".md",
  ".json",
  ".css",
  ".html",
  ".svg",
  ".tla",
  ".yml",
  ".yaml",
  ".txt",
]);

export interface PrivacyHit {
  file: string;
  term: string;
}

/** Whole-word scan. Short names are tokens, not substrings, so `statechart` is not a hit. */
export function scanWorkingTree(root: string): PrivacyHit[] {
  const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
    cwd: root,
    encoding: "utf8",
  });
  const terms = denyTerms();
  const hits: PrivacyHit[] = [];
  for (const rel of listed.split("\n")) {
    if (!rel.trim()) continue;
    const ext = path.extname(rel);
    if (!TEXT_EXT.has(ext) && path.basename(rel) !== ".gitignore") continue;
    const full = path.join(root, rel);
    if (!fs.existsSync(full)) continue;
    const stat = fs.statSync(full);
    if (!stat.isFile()) continue;
    const text = fs.readFileSync(full, "utf8");
    if (text.includes("\u0000")) continue;
    for (const term of terms) {
      const pattern = new RegExp(`(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`, "i");
      if (pattern.test(text)) hits.push({ file: rel, term });
    }
  }
  return hits;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
