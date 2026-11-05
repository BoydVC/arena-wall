import { describe, expect, it } from "vitest";
import { LANES } from "../core/model.js";
import { attemptLaneMove, canMove } from "../core/statechart.js";
import { readyState } from "./helpers.js";

const pairs = LANES.flatMap((from) =>
  LANES.filter((to) => to !== from).map((to) => [from, to, canMove(from, to)] as const),
);

describe("statechart", () => {
  it.each(pairs)("%s -> %s", (from, to, legal) => {
    const start = readyState(from);
    const next = attemptLaneMove(start, "ridge-owl", to);
    if (legal) {
      expect(next.ideas["ridge-owl"]?.lane).toBe(to);
      expect(next.flags.some((flag) => flag.reason === "illegal-transition")).toBe(false);
      expect(next.seats).toEqual(start.seats);
      expect(next.reports).toEqual(start.reports);
      return;
    }
    expect(next.ideas["ridge-owl"]?.lane).toBe(from);
    expect(next.seats).toEqual(start.seats);
    expect(next.verifiers).toEqual(start.verifiers);
    expect(next.prs).toEqual(start.prs);
    expect(next.reports).toEqual(start.reports);
    expect(next.flags).toContainEqual({ ideaId: "ridge-owl", reason: "illegal-transition" });
    expect(attemptLaneMove(next, "ridge-owl", to)).toEqual(next);
  });

  it("refuses seats when the spec gate is closed", () => {
    const start = readyState("spec");
    const closed = {
      ...start,
      reports: {
        "ridge-owl": { path: "specs/comet-lab.md", ok: false, missing: ["acceptance tests"], warnings: [], acceptanceCount: 0 },
      },
    };
    const next = attemptLaneMove(closed, "ridge-owl", "seats");
    expect(next.ideas["ridge-owl"]?.lane).toBe("spec");
    expect(next.flags).toContainEqual({ ideaId: "ridge-owl", reason: "spec-gate" });
    expect(next.seats).toEqual(closed.seats);
  });

  it("refuses merged when human-ok is not green", () => {
    const start = readyState("draft_pr");
    const blocked = {
      ...start,
      verifiers: {
        "ridge-owl": {
          ideaId: "ridge-owl",
          branch: "arena/winner" as const,
          verdict: "pass" as const,
          gates: [{ name: "human-ok" as const, status: "amber" as const }],
        },
      },
    };
    const next = attemptLaneMove(blocked, "ridge-owl", "merged");
    expect(next.ideas["ridge-owl"]?.lane).toBe("draft_pr");
    expect(next.flags).toContainEqual({ ideaId: "ridge-owl", reason: "illegal-transition" });
    expect(next.prs).toEqual(blocked.prs);
  });
});
