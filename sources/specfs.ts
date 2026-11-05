import fs from "node:fs";
import path from "node:path";
import { lintSpec } from "../core/specLint.js";
import type { Idea, PipelineEvent, Signal } from "../core/model.js";

export interface ParsedSpecFile {
  readonly ideaId: string;
  readonly title: string;
  readonly body: string;
}

function ideaIdFromName(fileName: string): string {
  return path
    .basename(fileName, ".md")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function firstHeading(markdown: string): string | undefined {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line.trim());
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

export function parseSpecFile(markdown: string, fileName: string): ParsedSpecFile {
  const fenced = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(markdown);
  const meta = new Map<string, string>();
  let body = markdown;
  if (fenced?.[1] !== undefined) {
    body = markdown.slice(fenced[0].length);
    for (const line of fenced[1].split(/\r?\n/)) {
      const split = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line.trim());
      if (split?.[1] && split[2]) meta.set(split[1].toLowerCase(), split[2].trim());
    }
  }
  const ideaId = meta.get("idea") || ideaIdFromName(fileName);
  const title = meta.get("title") || firstHeading(body) || ideaId;
  return { ideaId, title, body: markdown };
}

export function eventsForSpec(file: ParsedSpecFile, relPath: string, nowIso: string, known: boolean): PipelineEvent[] {
  const report = lintSpec(file.body, { path: relPath });
  const events: PipelineEvent[] = [];
  if (!known) {
    const note: Signal = { kind: "manual", note: "Dropped into the spec folder" };
    const idea: Idea = {
      id: file.ideaId,
      title: file.title,
      signals: [note],
      lane: "idea",
      specPath: relPath,
      createdAt: nowIso,
    };
    events.push({ t: "idea.added", idea });
  }
  events.push({ t: "spec.linted", ideaId: file.ideaId, report });
  return events;
}

const SPEC_ROOTS = ["specs", path.join("fixtures", "specs")] as const;

/** Allow only markdown under the spec folders. Reject absolute paths and `..`. */
export function resolveSpecPath(root: string, rel: string): string | null {
  if (!rel || rel.includes("\0") || path.isAbsolute(rel)) return null;
  if (rel.split(/[\\/]/).includes("..")) return null;
  if (!rel.endsWith(".md")) return null;
  const full = path.resolve(root, rel);
  const allowed = SPEC_ROOTS.map((folder) => path.resolve(root, folder));
  if (!allowed.some((dir) => full === dir || full.startsWith(dir + path.sep))) return null;
  return full;
}

export function listSpecFiles(dir: string): readonly string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".md") && !name.startsWith("."))
    .sort()
    .map((name) => path.join(dir, name));
}
