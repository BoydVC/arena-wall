import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintSpec } from "../core/specLint.js";
import { ROOT } from "../sources/root.js";

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("lintSpec", () => {
  it("passes the synthetic wall spec", () => {
    const report = lintSpec(read("fixtures/specs/valid-wall.md"), { path: "fixtures/specs/valid-wall.md" });
    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
    expect(report.warnings).toEqual([]);
    expect(report.acceptanceCount).toBe(4);
  });

  it("fails a spec with no goal", () => {
    const report = lintSpec(read("fixtures/specs/no-goal.md"), { path: "fixtures/specs/no-goal.md" });
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["goal"]);
  });

  it("fails a spec with no acceptance tests", () => {
    const report = lintSpec(read("fixtures/specs/no-acceptance.md"), { path: "fixtures/specs/no-acceptance.md" });
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["acceptance tests"]);
    expect(report.acceptanceCount).toBe(0);
  });

  it("fails a spec with no seat briefs", () => {
    const report = lintSpec(read("fixtures/specs/no-briefs.md"), { path: "fixtures/specs/no-briefs.md" });
    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["seat briefs"]);
  });

  it("fails when the seat brief section omits a style", () => {
    const markdown = read("fixtures/specs/valid-wall.md").replace("experience-first", "visual-first");
    const report = lintSpec(markdown, { path: "memory.md", deny: [] });
    expect(report.missing).toEqual(["seat briefs"]);
  });

  it("flags an email address as banned content", () => {
    const report = lintSpec(`${read("fixtures/specs/valid-wall.md")}\n\nreach me at person@domain.test\n`, {
      deny: [],
    });
    expect(report.ok).toBe(false);
    expect(report.warnings).toContain("banned content: email");
  });

  it("flags a phone number as banned content", () => {
    const report = lintSpec(`${read("fixtures/specs/valid-wall.md")}\n\ncall (555) 010-0199 now\n`, { deny: [] });
    expect(report.ok).toBe(false);
    expect(report.warnings).toContain("banned content: phone");
  });

  const upstream = "/home/ubuntu/.cursor/projects/workspace/uploads/arena-wall-SPEC_ee8e.md";
  it.skipIf(!fs.existsSync(upstream))("passes the upstream brief when the name list is empty", () => {
    const report = lintSpec(fs.readFileSync(upstream, "utf8"), { path: upstream, deny: [] });
    expect(report.missing).toEqual([]);
    expect(report.acceptanceCount).toBe(10);
    expect(report.ok).toBe(true);
  });
});
