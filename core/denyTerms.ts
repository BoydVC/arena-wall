/**
 * Operator deny list, stored as code points so the terms themselves are not
 * committed. Demo Director v1.1 matches a term only as its own word.
 */
const CODE_POINTS: readonly (readonly number[])[] = [
  [66, 111, 121, 100],
  [67, 104, 114, 105, 115, 116, 111, 112, 104, 101, 114],
  [67, 104, 97, 114, 108, 111, 116, 116, 101],
  [67, 104, 97, 114],
  [86, 105, 99, 116, 111, 114],
  [86, 105, 99],
  [77, 105, 114, 97, 110, 100, 97],
  [75, 80, 68],
  [99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 115],
];

export function defaultDenyTerms(): readonly string[] {
  return CODE_POINTS.map((codes) => String.fromCharCode(...codes));
}

export function normalizeText(text: string): string {
  return text.normalize("NFKC").replaceAll("’", "'").replaceAll("‘", "'").toLowerCase();
}

/** True when `term` is its own word, matching Demo Director v1.1 word boundaries. */
export function termPresent(text: string, term: string): boolean {
  const needle = normalizeText(term).trim();
  const hay = normalizeText(text);
  if (!needle || !hay) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "u").test(hay);
}

export function findDeniedTerms(text: string, terms: readonly string[]): readonly string[] {
  const found: string[] = [];
  for (const term of terms) {
    if (termPresent(text, term) && !found.includes(term)) found.push(term);
  }
  return found;
}
