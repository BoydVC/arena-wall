/**
 * Spec gate. Required pieces: a goal, at least one acceptance test, and seat
 * briefs that name the three arena styles. Banned terms are warnings so a
 * structurally complete document still reports `ok`. The wall shows them.
 */

import type { SpecReport } from "./model";

export const MISSING_GOAL = "goal";
export const MISSING_ACCEPTANCE = "acceptance tests";
export const MISSING_SEAT_BRIEFS = "seat briefs";

const SEAT_STYLES = ["types-first", "model-first", "experience-first"] as const;

interface Section {
  heading: string;
  body: string;
}

/** A section runs until the next heading of the same or higher level, so nested briefs stay inside it. */
function findSection(markdown: string, pattern: RegExp): Section | undefined {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  let level = 0;
  let heading = "";
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lines[index] ?? "");
    if (!match?.[1] || !match[2]) continue;
    const headingLevel = match[1].length;
    if (start < 0) {
      if (pattern.test(match[2])) {
        start = index;
        level = headingLevel;
        heading = match[2];
      }
      continue;
    }
    if (headingLevel <= level) {
      return { heading, body: lines.slice(start + 1, index).join("\n") };
    }
  }
  if (start < 0) return undefined;
  return { heading, body: lines.slice(start + 1).join("\n") };
}

function acceptanceItems(section: Section | undefined): number {
  if (!section) return 0;
  return section.body.split(/\r?\n/).filter((line) => /^\s*(?:\d+[.)]|[-*+])\s+\S/.test(line)).length;
}

function termPresent(text: string, term: string): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\w])${escaped}(?![\\w])`, "i").test(text.toLowerCase());
}

export function lintSpec(markdown: string, path = "SPEC.md", deny: readonly string[] = []): SpecReport {
  const goal = findSection(markdown, /\bgoal\b/i);
  const acceptance = findSection(markdown, /\bacceptance\b/i);
  const briefs = findSection(markdown, /seat\s+briefs/i);
  const acceptanceCount = acceptanceItems(acceptance);
  const missing: string[] = [];
  if (!goal || goal.body.trim().length === 0) missing.push(MISSING_GOAL);
  if (!acceptance || acceptanceCount === 0) missing.push(MISSING_ACCEPTANCE);
  const briefText = briefs ? `${briefs.heading}\n${briefs.body}` : "";
  const briefsOk = Boolean(briefs) && SEAT_STYLES.every((style) => termPresent(briefText, style));
  if (!briefsOk) missing.push(MISSING_SEAT_BRIEFS);

  const warnings: string[] = [];
  if (acceptanceCount > 0 && acceptanceCount < 5) warnings.push("acceptance tests are thin");
  for (const term of deny) {
    if (termPresent(markdown, term)) warnings.push(`banned: ${term}`);
  }

  return {
    path,
    ok: missing.length === 0,
    missing,
    warnings,
    acceptanceCount,
  };
}
