import { describe, expect, it } from "vitest";
import { emptyState, type PipelineState } from "../core/model.js";
import { STALE_MS, project } from "../core/project.js";
import { eventsOf, fold, replay, replayOrigin } from "../core/replay.js";
import { RUBRIC, leadSeat, scoreSeat, seatDigest } from "../core/score.js";
import { demoGifStatus } from "../core/score.js";
import { FIXTURE_ASOF, fixtureLog, shiftLog } from "../sources/fixtures.js";
import { makeIdea, makeSeat, NOW } from "./helpers.js";

describe("score and replay", () => {
  it("weights the rubric to 100", () => {
    expect(RUBRIC.tests + RUBRIC.typesModel + RUBRIC.ux + RUBRIC.readmeGif).toBe(100);
  });

  it("lets the experience seat lead the harbor scoreboard", () => {
    const state = project(fold(eventsOf(fixtureLog())), FIXTURE_ASOF);
    const seats = Object.values(state.seats).filter((seat) => seat.ideaId === "harbor-mint");
    const scores = seats.map((seat) =>
      scoreSeat(seat, { lintOk: true, demoGif: demoGifStatus(state.verifiers["harbor-mint"]?.gates) }),
    );
    expect(leadSeat(scores)?.seatId).toBe("harbor-mint:experience-first");
    const lead = scores.find((score) => score.seatId === "harbor-mint:experience-first");
    const types = scores.find((score) => score.seatId === "harbor-mint:types-first");
    expect(lead && types && lead.total > types.total).toBe(true);
  });

  it("writes a synthetic diff stat for a seat", () => {
    const lines = seatDigest(makeSeat("experience-first", "winner"));
    expect(lines[0]).toContain("arena/experience-first");
    expect(lines.join("\n")).toContain("verdict winner");
  });

  it("builds six ideas, eighteen seats, and six verifiers", () => {
    const state = project(fold(eventsOf(fixtureLog())), FIXTURE_ASOF);
    expect(Object.keys(state.ideas)).toHaveLength(6);
    expect(Object.keys(state.seats)).toHaveLength(18);
    expect(Object.keys(state.verifiers)).toHaveLength(6);
    expect(state.ideas["ridge-owl"]?.lane).toBe("idea");
    expect(state.ideas["comet-lab"]?.lane).toBe("spec");
    expect(state.ideas["harbor-mint"]?.lane).toBe("seats");
    expect(state.ideas["north-glass"]?.lane).toBe("verify");
    expect(state.ideas["paper-kite"]?.lane).toBe("draft_pr");
    expect(state.ideas["lumen-dock"]?.lane).toBe("merged");
    expect(state.reports["comet-lab"]?.missing).toEqual(["acceptance tests", "seat briefs"]);
    expect(state.flags).toContainEqual({ ideaId: "comet-lab", reason: "spec-gate" });
    expect(state.flags).toContainEqual({ ideaId: "paper-kite", reason: "awaiting-ok" });
    expect(state.flags).toContainEqual({ ideaId: "north-glass", reason: "stale-seat" });
    expect(state.flags.some((flag) => flag.ideaId === "lumen-dock" && flag.reason === "awaiting-ok")).toBe(false);
    expect(state.prs["lumen-dock"]?.merged).toBe(true);
    expect(state.prs["paper-kite"]?.draft).toBe(true);
  });

  it("shows only ideas at t0 and matches the live fold at the end", () => {
    const events = eventsOf(fixtureLog());
    const origin = replayOrigin(events);
    expect(origin).toBe(6);
    const at0 = replay(events, origin);
    expect(Object.keys(at0.ideas)).toHaveLength(6);
    expect(Object.keys(at0.seats)).toHaveLength(0);
    expect(Object.keys(at0.verifiers)).toHaveLength(0);
    expect(Object.keys(at0.prs)).toHaveLength(0);
    expect(Object.values(at0.ideas).every((idea) => idea.lane === "idea")).toBe(true);
    expect(project(replay(events, events.length), FIXTURE_ASOF)).toEqual(project(fold(events), FIXTURE_ASOF));
  });

  it("keeps relative freshness when the day is shifted", () => {
    const shifted = shiftLog(fixtureLog(), new Date(Date.parse(FIXTURE_ASOF)));
    expect(shifted).toEqual([...fixtureLog()]);
    const later = new Date("2026-11-05T12:00:00.000Z");
    const moved = shiftLog(fixtureLog(), later);
    const state = project(fold(eventsOf(moved)), later.toISOString());
    expect(state.flags).toContainEqual({ ideaId: "north-glass", reason: "stale-seat" });
    expect(state.flags.some((flag) => flag.ideaId === "harbor-mint" && flag.reason === "stale-seat")).toBe(false);
  });

  it("marks a seat stale at 90 minutes and not a millisecond sooner", () => {
    const seat = { ...makeSeat(), updatedAt: new Date(Date.parse(NOW) - STALE_MS).toISOString() };
    const state: PipelineState = {
      ...emptyState(),
      ideas: { "ridge-owl": makeIdea() },
      seats: { [seat.id]: seat },
    };
    expect(project(state, NOW).flags).toContainEqual({ ideaId: "ridge-owl", reason: "stale-seat" });
    const almost = {
      ...state,
      seats: { [seat.id]: { ...seat, updatedAt: new Date(Date.parse(NOW) - STALE_MS + 1).toISOString() } },
    };
    expect(project(almost, NOW).flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
    const cleared = {
      ...state,
      seats: { [seat.id]: { ...seat, updatedAt: NOW } },
    };
    expect(project(cleared, NOW).flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
  });
});
