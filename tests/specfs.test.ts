import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { fold } from "../core/replay";
import { eventsForSpec } from "../sources/specfs/watch";

describe("spec folder", () => {
  it("turns a weak drop into a red spec card", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "arena-spec-"));
    const file = path.join(dir, "weak-lamp.md");
    writeFileSync(
      file,
      "# Weak Lamp\n\n## 1. Goal\nA lamp by the door, readable from the hall.\n\n## 2. User story\nAs a keeper, I want one color.\n",
    );
    const state = fold(eventsForSpec(file, "2026-11-04T16:00:00.000Z", []));
    expect(state.ideas["weak-lamp"]?.lane).toBe("spec");
    expect(state.reports["weak-lamp"]?.ok).toBe(false);
    expect(state.reports["weak-lamp"]?.missing).toEqual(["acceptance tests", "seat briefs"]);
    expect(state.flags).toContainEqual({ ideaId: "weak-lamp", reason: "spec-gate" });
  });
});
