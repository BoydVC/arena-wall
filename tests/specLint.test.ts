import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { MISSING_ACCEPTANCE, MISSING_GOAL, MISSING_SEAT_BRIEFS, lintSpec } from "../core/specLint";
import { root } from "../sources/root";
import { DENY_TERMS } from "./deny-list";

function spec(name: string): string {
  return readFileSync(path.join(root, "sources/fixtures/specs", name), "utf8");
}

describe("lintSpec", () => {
  it("passes a complete spec", () => {
    const report = lintSpec(spec("complete.md"), "complete.md");
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.acceptanceCount).toBe(10);
    expect(report.warnings).toEqual([]);
  });

  it("fails a spec with no goal", () => {
    const report = lintSpec(spec("no-goal.md"), "no-goal.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([MISSING_GOAL]);
  });

  it("fails a spec with no acceptance tests", () => {
    const report = lintSpec(spec("no-acceptance.md"), "no-acceptance.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([MISSING_ACCEPTANCE]);
    expect(report.acceptanceCount).toBe(0);
  });

  it("fails a spec with no seat briefs", () => {
    const report = lintSpec(spec("no-seat-briefs.md"), "no-seat-briefs.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([MISSING_SEAT_BRIEFS]);
  });

  it("names both gaps on the weak ridge lamp", () => {
    const report = lintSpec(spec("north-signal.md"), "north-signal.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([MISSING_ACCEPTANCE, MISSING_SEAT_BRIEFS]);
  });

  it("warns on a denied term without hiding the structural result", () => {
    const term = DENY_TERMS[0] ?? "x";
    const report = lintSpec(`# Note\n\n## 1. Goal\n${term} wants a lamp.\n`, "note.md", [term]);
    expect(report.warnings.some((warning) => warning.includes(term))).toBe(true);
    expect(report.missing).toContain(MISSING_ACCEPTANCE);
  });
});
