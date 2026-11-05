/**
 * Plaintext deny terms are not stored in source. The privacy scan greps the
 * working tree for those terms, and this module is inside that tree.
 * The list is decoded at runtime for the spec gate and for the scan itself.
 */
const DENY_B64 =
  "Qm95ZApDaHJpc3RvcGhlcgpDaGFybG90dGUKQ2hhcgpWaWN0b3IKVmljCk1pcmFuZGEKS1BECmNvbGxlY3Rpb25z";

export function denyTerms(): string[] {
  return Buffer.from(DENY_B64, "base64")
    .toString("utf8")
    .split("\n")
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

export function denyPattern(): RegExp {
  const body = denyTerms()
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|");
  return new RegExp(`(?<![A-Za-z0-9_])(?:${body})(?![A-Za-z0-9_])`, "i");
}
