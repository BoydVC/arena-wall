import { describe, expect, it } from "vitest";

import { emptyState, transition, type Lane, type PipelineState } from "../core/model";
import { EDGES, LANES, canMove } from "../core/statechart";

function placed(lane: Lane): PipelineState {
  return {
    ...emptyState(),
    ideas: {
      owl: {
        id: "owl",
        title: "Ridge Owl",
        signals: [{ kind: "manual", note: "ridge note" }],
        lane,
        createdAt: "2026-11-04T14:00:00.000Z",
      },
    },
  };
}

const pairs = LANES.flatMap((from) => LANES.map((to) => [from, to] as const));
const illegal = pairs.filter(([from, to]) => !canMove(from, to));
const legal = pairs.filter(([from, to]) => canMove(from, to));

describe("statechart", () => {
  it("reads the same edge table the code ships", () => {
    expect(EDGES).toHaveLength(15);
    for (const [from, to] of EDGES) expect(canMove(from, to)).toBe(true);
    expect(illegal.length).toBeGreaterThan(0);
  });

  it.each(illegal)("%s -> %s flags illegal-transition and does not move", (from, to) => {
    const before = placed(from);
    const after = transition(before, "owl", to);
    expect(after.ideas.owl?.lane).toBe(from);
    expect(after.ideas).toEqual(before.ideas);
    expect(after.seats).toEqual(before.seats);
    expect(after.verifiers).toEqual(before.verifiers);
    expect(after.prs).toEqual(before.prs);
    expect(after.reports).toEqual(before.reports);
    expect(after.flags).toContainEqual({ ideaId: "owl", reason: "illegal-transition" });
  });

  it.each(legal)("%s -> %s is allowed by the chart", (from, to) => {
    expect(canMove(from, to)).toBe(true);
  });

  it.each(LANES)("staying in %s is a no-op", (lane) => {
    const before = placed(lane);
    expect(transition(before, "owl", lane)).toEqual(before);
  });

  it("does not stack the same illegal flag twice", () => {
    const once = transition(placed("merged"), "owl", "idea");
    const twice = transition(once, "owl", "idea");
    expect(twice.flags).toEqual(once.flags);
  });
});
