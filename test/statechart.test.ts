import fs from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canMove,
  loadTlaAllowed,
  loadTransitionTable,
  tryMove,
} from "../core/statechart.ts";
import { emptyState, LANES, type Lane, type PipelineState } from "../core/model.ts";

const table = loadTransitionTable();

function seed(lane: Lane, opts?: { specOk?: boolean; humanOk?: boolean }): PipelineState {
  const specOk = opts?.specOk ?? true;
  const humanOk = opts?.humanOk ?? true;
  return {
    ...emptyState(),
    ideas: {
      card: {
        id: "card",
        title: "Card",
        signals: [],
        lane,
        createdAt: "2026-11-04T09:00:00.000Z",
      },
    },
    specs: {
      card: {
        path: "card.md",
        ok: specOk,
        missing: specOk ? [] : ["goal"],
        warnings: [],
        acceptanceCount: specOk ? 1 : 0,
      },
    },
    verifiers: {
      card: {
        ideaId: "card",
        branch: "arena/winner",
        verdict: "pass",
        gates: [
          { name: "tests", status: "green" },
          { name: "lint", status: "green" },
          { name: "demo-gif", status: "green" },
          { name: "privacy", status: "green" },
          { name: "human-ok", status: humanOk ? "green" : "red" },
        ],
      },
    },
  };
}

describe("transition table is the model", () => {
  it("covers every lane pair once", () => {
    expect(table).toHaveLength(LANES.length * LANES.length);
    const keys = table.map((row) => `${row.from}->${row.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("loads the same pairs the TLA Allowed set names", () => {
    const fromDoc = table
      .filter((row) => row.allowed)
      .map((row) => `${row.from}->${row.to}`)
      .sort();
    const fromTla = loadTlaAllowed()
      .map((pair) => `${pair.from}->${pair.to}`)
      .sort();
    expect(fromTla).toEqual(fromDoc);
  });

  it("does not keep a second copy of the edges in the loader", () => {
    const source = fs.readFileSync(new URL("../core/statechart.ts", import.meta.url), "utf8");
    expect(source).toContain("transition-table");
    expect(source).not.toContain("draft_pr");
    expect(source).not.toContain("idea->seats");
  });

  it("guards only the spec admission and the human gate", () => {
    const guarded = table.filter((row) => row.guard !== "none");
    expect(guarded).toEqual([
      expect.objectContaining({ from: "spec", to: "seats", guard: "spec-ok", allowed: true }),
      expect.objectContaining({ from: "draft_pr", to: "merged", guard: "human-ok", allowed: true }),
    ]);
  });
});

describe("generated transition cases", () => {
  for (const row of table) {
    it(`${row.from} -> ${row.to} allowed=${row.allowed} guard=${row.guard}`, () => {
      expect(canMove(row.from, row.to)).toBe(row.allowed);
      const before = seed(row.from);
      const after = tryMove(before, "card", row.to);

      if (row.from === row.to) {
        expect(after).toEqual(before);
        return;
      }

      if (!row.allowed) {
        expect(after.ideas.card?.lane).toBe(row.from);
        expect(after.flags).toEqual([{ ideaId: "card", reason: "illegal-transition" }]);
        const { flags: _afterFlags, ...afterRest } = after;
        const { flags: _beforeFlags, ...beforeRest } = before;
        expect(afterRest).toEqual(beforeRest);
        return;
      }

      expect(after.ideas.card?.lane).toBe(row.to);
      expect(after.flags).toEqual([]);
    });
  }
});

describe("guards block without an illegal-transition flag", () => {
  it("refuses seats when the spec is not ok", () => {
    const before = seed("spec", { specOk: false });
    const after = tryMove(before, "card", "seats");
    expect(after.ideas.card?.lane).toBe("spec");
    expect(after.flags.map((flag) => flag.reason)).toEqual(["spec-gate"]);
  });

  it("refuses merged when human-ok is not green", () => {
    const before = seed("draft_pr", { humanOk: false });
    const after = tryMove(before, "card", "merged");
    expect(after.ideas.card?.lane).toBe("draft_pr");
    expect(after.flags).toEqual([]);
    expect(after.ideas).toEqual(before.ideas);
  });
});
