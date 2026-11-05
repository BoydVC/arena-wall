import { denyTerms } from "./deny.ts";
import type { SpecReport } from "./types.ts";

const MISSING_GOAL = "goal";
const MISSING_ACCEPTANCE = "acceptance tests";
const MISSING_BRIEFS = "seat briefs";

const SEAT_STYLES = ["types-first", "model-first", "experience-first"] as const;

interface Section {
  body: string;
}

/**
 * Structural gate. `ok` is true only when goal, acceptance tests, and seat briefs
 * are all present. Deny-list hits are warnings: policy prose can name the list
 * without failing the structural gate.
 */
export function lintSpec(markdown: string, specPath = "<memory>"): SpecReport {
  const missing: string[] = [];
  const goal = findSection(markdown, /\bgoal\b/i);
  if (!goal) missing.push(MISSING_GOAL);

  const acceptance = findSection(markdown, /\bacceptance tests\b/i);
  const acceptanceCount = acceptance ? countItems(acceptance.body) : 0;
  if (!acceptance || acceptanceCount === 0) missing.push(MISSING_ACCEPTANCE);

  const briefs = findSection(markdown, /\bseat briefs\b/i);
  const stylesPresent =
    briefs !== null && SEAT_STYLES.every((style) => briefs.body.toLowerCase().includes(style));
  if (!briefs || !stylesPresent) missing.push(MISSING_BRIEFS);

  const warnings: string[] = [];
  for (const term of denyTerms()) {
    const pattern = new RegExp(
      `(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`,
      "i",
    );
    if (pattern.test(markdown)) warnings.push(`banned content: ${term}`);
  }

  return {
    path: specPath,
    ok: missing.length === 0,
    missing,
    warnings,
    acceptanceCount,
  };
}

function findSection(markdown: string, headingPattern: RegExp): Section | null {
  const lines = markdown.split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match?.[1] && match[2] && headingPattern.test(match[2])) {
      start = i;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) return null;
  const body: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = /^(#{1,6})\s+/.exec(line);
    if (match?.[1] && match[1].length <= level) break;
    body.push(line);
  }
  return { body: body.join("\n") };
}

function countItems(body: string): number {
  return body
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:\d+\.|[-*+])\s+\S/.test(line)).length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
