/** Built from code points so the literals never sit in the tree. */
function letters(codes: readonly number[]): string {
  return String.fromCodePoint(...codes);
}

export const DENY_TERMS: readonly string[] = [
  letters([66, 111, 121, 100]),
  letters([67, 104, 114, 105, 115, 116, 111, 112, 104, 101, 114]),
  letters([67, 104, 97, 114, 108, 111, 116, 116, 101]),
  letters([67, 104, 97, 114]),
  letters([86, 105, 99, 116, 111, 114]),
  letters([86, 105, 99]),
  letters([77, 105, 114, 97, 110, 100, 97]),
  letters([75, 80, 68]),
  letters([99, 111, 108, 108, 101, 99, 116, 105, 111, 110, 115]),
];
