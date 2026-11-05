import { defaultDenyTerms, findDeniedTerms } from "./denyTerms.js";
import type { SpecReport } from "./model.js";

export const REQUIRED_SECTIONS = [
  "goal",
  "user story",
  "architecture",
  "acceptance tests",
  "seat briefs",
] as const;

export const SEAT_BRIEF_STYLES = ["types-first", "model-first", "experience-first"] as const;

const EMAIL = /(?<![\w.+-])[\w.+-]+@[\w-]+(?:\.[\w-]+)+/u;
const PHONE = /(?<!\d)(?:\+\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/u;

export interface LintOptions {
  readonly path?: string;
  readonly deny?: readonly string[];
}

interface Block {
  readonly name: string;
  readonly body: string;
}

function normalizeHeading(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^\d+[.)]\s+/, "")
    .replace(/\s+/g, " ");
}

function headingOf(line: string): { level: number; name: string } | undefined {
  const match = /^(#{1,6})\s+(.+?)\s*#*$/.exec(line.trim());
  if (!match?.[1] || !match[2]) return undefined;
  return { level: match[1].length, name: normalizeHeading(match[2]) };
}

function blocks(markdown: string): readonly Block[] {
  const lines = markdown.split(/\r?\n/);
  const out: Block[] = [];
  let current: { name: string; body: string } | undefined;
  let fence = false;
  for (const line of lines) {
    if (/^```/.test(line.trim())) {
      fence = !fence;
      if (current && fence) current.body += `${line}\n`;
      continue;
    }
    if (fence) {
      if (current) current.body += `${line}\n`;
      continue;
    }
    const heading = headingOf(line);
    if (heading && heading.level <= 2) {
      current = { name: heading.name, body: "" };
      out.push(current);
      continue;
    }
    if (current) current.body += `${line}\n`;
  }
  return out;
}

function sectionMatches(name: string, key: string): boolean {
  return name === key || name.endsWith(` ${key}`);
}

function acceptanceCount(body: string): number {
  return body.split(/\r?\n/).filter((line) => /^\s*\d+\.\s+\S/.test(line)).length;
}

function briefsPresent(body: string): boolean {
  const folded = body.toLowerCase();
  return SEAT_BRIEF_STYLES.every((style) => folded.includes(style));
}

export function lintSpec(markdown: string, options: LintOptions = {}): SpecReport {
  const found = blocks(markdown);
  const missing: string[] = [];
  let counted = 0;
  for (const key of REQUIRED_SECTIONS) {
    const block = found.find((item) => sectionMatches(item.name, key));
    if (key === "acceptance tests") {
      counted = block ? acceptanceCount(block.body) : 0;
      if (!block || counted === 0) missing.push(key);
      continue;
    }
    if (key === "seat briefs") {
      if (!block || !briefsPresent(block.body)) missing.push(key);
      continue;
    }
    if (!block || block.body.trim().length === 0) missing.push(key);
  }
  const deny = options.deny ?? defaultDenyTerms();
  const warnings: string[] = [];
  for (const term of findDeniedTerms(markdown, deny)) warnings.push(`banned content: ${term}`);
  if (EMAIL.test(markdown)) warnings.push("banned content: email");
  if (PHONE.test(markdown)) warnings.push("banned content: phone");
  return {
    path: options.path ?? "",
    ok: missing.length === 0 && warnings.length === 0,
    missing,
    warnings,
    acceptanceCount: counted,
  };
}
