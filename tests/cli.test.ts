import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../sources/root.js";

describe("cli", () => {
  it("lints a passing spec with exit 0 and a failing spec with exit 1", () => {
    const bin = path.join(ROOT, "cli", "arena-wall.ts");
    const ok = execFileSync(process.execPath, ["--import", "tsx", bin, "lint", "fixtures/specs/valid-wall.md"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(JSON.parse(ok).ok).toBe(true);
    let failed = false;
    try {
      execFileSync(process.execPath, ["--import", "tsx", bin, "lint", "fixtures/specs/no-goal.md"], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } catch (error) {
      failed = true;
      const err = error as { status?: number; stdout?: string };
      expect(err.status).toBe(1);
      expect(JSON.parse(err.stdout ?? "{}").missing).toEqual(["goal"]);
    }
    expect(failed).toBe(true);
  });
});
