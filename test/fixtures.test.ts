import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fold, present, t0Index } from "../core/replay.ts";
import { project } from "../core/project.ts";
import { leadSeat } from "../core/score.ts";
import { admittedSeatIds, buildFixtureLog } from "../sources/fixtures/build.ts";
import { roster } from "../sources/fixtures/catalog.ts";

const log = buildFixtureLog();
const live = present(log);

describe("fixture world", () => {
  it("catalogs 6 ideas, 18 seats, and 6 verifiers", () => {
    expect(roster.ideas).toHaveLength(6);
    expect(roster.seats).toHaveLength(18);
    expect(roster.verifiers).toHaveLength(6);
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const onDisk = JSON.parse(fs.readFileSync(path.join(root, "sources/fixtures/roster.json"), "utf8"));
    expect(onDisk).toEqual(roster);
  });

  it("keeps the log in time order", () => {
    const times = log.map((entry) => Date.parse(entry.at));
    const sorted = [...times].sort((a, b) => a - b);
    expect(times).toEqual(sorted);
  });

  it("shows only ideas at t0 and the live wall at the end", () => {
    const t0 = t0Index(log);
    expect(t0).toBe(6);
    const opening = fold(log, t0);
    expect(Object.keys(opening.ideas)).toHaveLength(6);
    expect(Object.values(opening.ideas).every((idea) => idea.lane === "idea")).toBe(true);
    expect(opening.seats).toEqual({});
    expect(opening.verifiers).toEqual({});
    expect(fold(log)).toEqual(live.state);
    expect(present(log, log.length).state).toEqual(fold(log, log.length));
  });

  it("lands each card in the lane the story describes", () => {
    const lane = (id: string) => live.state.ideas[id]?.lane;
    expect(lane("nimbus-quill")).toBe("idea");
    expect(lane("lumen-fold")).toBe("spec");
    expect(lane("comet-lab")).toBe("seats");
    expect(lane("harbor-mint")).toBe("verify");
    expect(lane("ridge-owl")).toBe("draft_pr");
    expect(lane("pebble-arc")).toBe("merged");
  });

  it("holds the weak spec in spec with the two missing sections", () => {
    const report = live.state.specs["lumen-fold"];
    expect(report?.ok).toBe(false);
    expect(report?.missing).toEqual(["acceptance tests", "seat briefs"]);
    expect(live.state.flags.some((flag) => flag.ideaId === "lumen-fold" && flag.reason === "spec-gate")).toBe(true);
  });

  it("admits 15 seats and leaves the idea-lane trio waiting", () => {
    expect(Object.keys(live.state.seats).sort()).toEqual(admittedSeatIds().sort());
    expect(live.state.seats["nimbus-quill:model-first"]).toBeUndefined();
  });

  it("gives the waiting badge only to the draft that is not cleared", () => {
    const waiting = live.state.flags.filter((flag) => flag.reason === "awaiting-ok").map((flag) => flag.ideaId);
    expect(waiting).toEqual(["ridge-owl"]);
    const gate = live.state.verifiers["ridge-owl"]?.gates.find((item) => item.name === "human-ok");
    expect(gate?.status).toBe("red");
    const demo = live.state.verifiers["ridge-owl"]?.gates.find((item) => item.name === "demo-gif");
    expect(demo?.status).toBe("green");
    expect(live.state.verifiers["pebble-arc"]?.gates.find((item) => item.name === "human-ok")?.status).toBe("green");
  });

  it("marks only the untouched comet seat as stale", () => {
    const stale = live.state.flags.filter((flag) => flag.reason === "stale-seat").map((flag) => flag.ideaId);
    expect(stale).toEqual(["comet-lab"]);
    const fresh = project(live.state, "2026-11-04T11:30:00.000Z");
    expect(fresh.flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
  });

  it("lets experience-first take the lead on comet and ridge", () => {
    for (const id of ["comet-lab", "ridge-owl"]) {
      const seats = Object.values(live.state.seats).filter((seat) => seat.ideaId === id);
      expect(leadSeat(seats, live.state.verifiers[id])?.style).toBe("experience-first");
      expect(live.leads[id]).toBe(`${id}:experience-first`);
    }
  });

  it("does not record an illegal transition on the happy log", () => {
    expect(live.state.flags.some((flag) => flag.reason === "illegal-transition")).toBe(false);
  });
});
