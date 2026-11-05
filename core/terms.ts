/**
 * Deny-list match used by the privacy test and by spec warnings.
 * A term counts when it stands alone. A shorter word does not fire inside a longer one.
 * The list itself lives in a git-ignored file, never in source.
 */

import { existsSync, readFileSync } from "node:fs";

export function termPresent(text: string, term: string): boolean {
  if (typeof text !== "string" || typeof term !== "string") return false;
  const needle = term.trim().toLowerCase();
  if (!needle) return false;
  const hay = text.toLowerCase();
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?<![\\w])${escaped}(?![\\w])`).test(hay)) return true;
  const spaced = new RegExp(`(?<![a-z0-9])(?:[a-z]\\s+){2,}[a-z](?![a-z0-9])`, "g");
  for (const match of hay.matchAll(spaced)) {
    if (match[0]?.replace(/ /g, "").includes(needle)) return true;
  }
  return false;
}

export function loadDenyTerms(path = ".demo-director/deny.txt"): string[] {
  if (!existsSync(path)) return [];
  const found: string[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const term = line.replace(/#.*/, "").trim();
    if (term && !found.includes(term)) found.push(term);
  }
  return found;
}
