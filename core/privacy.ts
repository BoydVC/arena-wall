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

/** Directories and files the tree walk skips when git is unavailable. */
const WALK_EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".arena-wall",
  "test-results",
  "playwright-report",
  "blob-report",
  ".DS_Store",
]);

export interface PrivacyHit {
  file: string;
  term: string;
}

export function isGitRepo(root: string): boolean {
  try {
    execFileSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Files to scan. Prefers `git ls-files -co --exclude-standard` when inside a
 * git work tree; otherwise walks the tree and skips .gitignore-ish excludes
 * (node_modules, dist, .arena-wall, test reports, .git).
 */
export function listScanFiles(root: string): string[] {
  if (isGitRepo(root)) {
    const listed = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], {
      cwd: root,
      encoding: "utf8",
    });
    return listed
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }
  return walkFiles(root, root);
}

function walkFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const name = entry.name;
    if (WALK_EXCLUDE_DIRS.has(name)) continue;
    if (name.endsWith(".log")) continue;
    const full = path.join(dir, name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(root, full));
      continue;
    }
    if (!entry.isFile()) continue;
    out.push(path.relative(root, full).split(path.sep).join("/"));
  }
  return out;
}

/** Whole-word scan. Short names are tokens, not substrings, so `statechart` is not a hit. */
export function scanWorkingTree(root: string): PrivacyHit[] {
  const terms = denyTerms();
  const hits: PrivacyHit[] = [];
  for (const rel of listScanFiles(root)) {
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
