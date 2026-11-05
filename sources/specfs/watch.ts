/**
 * Turn a dropped SPEC.md into pipeline events. Read-only on the file, append-only on the local log.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Idea, PipelineEvent } from "../../core/model";
import { lintSpec } from "../../core/specLint";
import { loadDenyTerms } from "../../core/terms";

export function ideaIdFromSpec(filePath: string): string {
  const base = path.basename(filePath).replace(/\.md$/i, "");
  const cleaned = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned || "dropped-spec";
}

export function titleFromSpec(markdown: string, fallback: string): string {
  for (const line of markdown.split(/\r?\n/)) {
    const match = /^#\s+(.+)/.exec(line);
    if (match?.[1]) return match[1].trim().slice(0, 80);
  }
  return fallback;
}

export function eventsForSpec(filePath: string, now: string, deny: readonly string[] = loadDenyTerms()): PipelineEvent[] {
  const markdown = readFileSync(filePath, "utf8");
  const ideaId = ideaIdFromSpec(filePath);
  const title = titleFromSpec(markdown, ideaId);
  const idea: Idea = {
    id: ideaId,
    title,
    signals: [{ kind: "manual", note: "Dropped into the spec folder" }],
    lane: "idea",
    specPath: filePath,
    createdAt: now,
  };
  return [
    { t: "idea.added", idea },
    { t: "spec.linted", ideaId, report: lintSpec(markdown, filePath, deny) },
  ];
}
