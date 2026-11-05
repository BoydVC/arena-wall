import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { lintSpec } from "../core/specLint.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const specs = path.join(root, "sources/fixtures/specs");

function read(name: string): string {
  return fs.readFileSync(path.join(specs, name), "utf8");
}

describe("lintSpec", () => {
  it("passes the good spec", () => {
    const report = lintSpec(read("good-spec.md"), "sources/fixtures/specs/good-spec.md");
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.acceptanceCount).toBe(4);
  });

  it("fails a spec with no goal", () => {
    const report = lintSpec(read("no-goal.md"), "no-goal.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["goal"]);
  });

  it("fails a spec with no acceptance tests", () => {
    const report = lintSpec(read("no-acceptance.md"), "no-acceptance.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["acceptance tests"]);
    expect(report.acceptanceCount).toBe(0);
  });

  it("fails a spec with no seat briefs", () => {
    const report = lintSpec(read("no-seat-briefs.md"), "no-seat-briefs.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["seat briefs"]);
  });

  it("names both gaps on the weak lumen note", () => {
    const report = lintSpec(read("lumen-fold.md"), "lumen-fold.md");
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["acceptance tests", "seat briefs"]);
  });

  it("fails seat briefs that do not name the three styles", () => {
    const report = lintSpec(
      ["# Note", "## Goal", "Ship it.", "## Acceptance tests", "1. It loads.", "## Seat briefs", "Only one note."].join("\n"),
    );
    expect(report.missing).toEqual(["seat briefs"]);
  });

  it("reports an empty acceptance section as missing", () => {
    const report = lintSpec(
      [
        "# Note",
        "## Goal",
        "Ship it.",
        "## Acceptance tests",
        "None written.",
        "## Seat briefs",
        "types-first, model-first, and experience-first.",
      ].join("\n"),
    );
    expect(report.missing).toEqual(["acceptance tests"]);
    expect(report.acceptanceCount).toBe(0);
  });
});
