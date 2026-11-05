import { describe, expect, it } from "vitest";

import type { Seat } from "../core/model";
import { fold } from "../core/replay";
import { stateAt } from "../core/replay";
import { leadingSeat, scoreArena, scoreSeat } from "../core/score";
import { WALL_LANES } from "../core/statechart";
import { buildDay } from "../sources/fixtures/day";

describe("synthetic day", () => {
  const day = buildDay();
  const live = fold(day.events);

  it("t0 shows only ideas and the end matches the live fold", () => {
    const opened = stateAt(day.events, day.milestones.opening);
    expect(Object.values(opened.ideas)).toHaveLength(6);
    expect(Object.values(opened.ideas).every((idea) => idea.lane === "idea")).toBe(true);
    expect(Object.keys(opened.seats)).toHaveLength(0);
    expect(Object.keys(opened.verifiers)).toHaveLength(0);
    expect(stateAt(day.events, day.milestones.end)).toEqual(live);
  });

  it("fills every wall lane and keeps eighteen seats", () => {
    for (const lane of WALL_LANES) {
      expect(Object.values(live.ideas).filter((idea) => idea.lane === lane)).toHaveLength(1);
    }
    expect(Object.keys(live.seats)).toHaveLength(18);
    expect(Object.keys(live.verifiers)).toHaveLength(6);
  });

  it("holds the weak spec and the draft badge", () => {
    expect(live.ideas.north?.lane).toBe("spec");
    expect(live.reports.north?.ok).toBe(false);
    expect(live.reports.north?.missing).toEqual(["acceptance tests", "seat briefs"]);
    expect(live.ideas.copper?.lane).toBe("draft_pr");
    expect(live.flags).toContainEqual({ ideaId: "copper", reason: "awaiting-signoff" });
    expect(live.prs.copper?.draft).toBe(true);
    expect(live.prs.copper?.merged).toBe(false);
    expect(live.ideas.quiet?.lane).toBe("merged");
    expect(live.prs.quiet?.merged).toBe(true);
    expect(live.verifiers.quiet?.gates.find((gate) => gate.name === "human-ok")?.status).toBe("green");
  });

  it("lets the experience seat take the lead", () => {
    const before = stateAt(day.events, day.milestones.experienceLead - 1);
    const after = stateAt(day.events, day.milestones.experienceLead);
    const glass = (state: typeof before) => Object.values(state.seats).filter((seat) => seat.ideaId === "glass");
    const lint = (seat: Seat) => Boolean(after.reports[seat.ideaId]?.ok);
    expect(leadingSeat(glass(before), lint)?.style).not.toBe("experience-first");
    expect(leadingSeat(glass(after), lint)?.style).toBe("experience-first");
    const winner = glass(after).find((seat) => seat.style === "experience-first");
    expect(winner?.verdict).toBe("winner");
    if (winner?.verdict === "winner") expect(winner.headSha.length).toBeGreaterThan(0);
    const types = glass(after).find((seat) => seat.style === "types-first");
    expect(winner).toBeDefined();
    expect(types).toBeDefined();
    if (!winner || !types) return;
    expect(scoreSeat(winner, true)).toBeGreaterThan(scoreSeat(types, true));
  });

  it("flips verifier gates one at a time and frames the clip", () => {
    let greens = 0;
    for (const cursor of day.milestones.gateCursors) {
      const count = stateAt(day.events, cursor).verifiers.paper?.gates.filter((gate) => gate.status === "green").length ?? 0;
      expect(count).toBeGreaterThan(greens);
      greens = count;
    }
    const last = day.milestones.gateCursors.at(-1) ?? day.milestones.end;
    const paper = stateAt(day.events, last).verifiers.paper;
    expect(paper?.gates.find((gate) => gate.name === "demo-gif")?.status).toBe("green");
    expect(paper?.gates.find((gate) => gate.name === "human-ok")?.status).not.toBe("green");
    expect(stateAt(day.events, last).ideas.paper?.lane).toBe("verify");
  });

  it("scores an arena entry on the 40/20/25/15 rubric", () => {
    expect(scoreArena({ tests: 40, typesModel: 20, ux: 25, readmeGif: 15 })).toBe(100);
    expect(scoreArena({ tests: 80, typesModel: -4, ux: 10, readmeGif: 15 })).toBe(65);
  });
});
