/**
 * One synthetic day. Six ideas, eighteen seats, six verifiers.
 * The opening cursor is t0: ideas only. The last cursor is the live wall.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import type { Gate, GateName, GateStatus, Idea, PipelineEvent, Seat, SeatStyle, Signal, Verdict } from "../../core/model";
import { lintSpec } from "../../core/specLint";
import { root } from "../root";

const START = Date.parse("2026-11-04T14:00:00.000Z");

export interface Milestones {
  opening: number;
  weakSpec: number;
  seatsSlide: number;
  experienceLead: number;
  gateCursors: number[];
  draftPr: number;
  end: number;
}

export interface DayLog {
  events: PipelineEvent[];
  milestones: Milestones;
  now: string;
}

function at(minutes: number): string {
  return new Date(START + minutes * 60_000).toISOString();
}

function signal(kind: Signal["kind"], note: string, url: string): Signal {
  return { kind, note, url };
}

function makeIdea(id: string, title: string, note: string, kind: Signal["kind"], minute: number, specPath?: string): Idea {
  const idea: Idea = {
    id,
    title,
    signals: [signal(kind, note, `https://example.test/${id}`)],
    lane: "idea",
    createdAt: at(minute),
  };
  return specPath ? { ...idea, specPath } : idea;
}

const GATE_NAMES: readonly GateName[] = ["tests", "lint", "demo-gif", "privacy", "human-ok"];

function gates(status: Partial<Record<GateName, GateStatus>>): Gate[] {
  return GATE_NAMES.map((name) => ({ name, status: status[name] ?? "red" }));
}

function makeSeat(
  ideaId: string,
  style: SeatStyle,
  minute: number,
  tests: { passed: number; failed: number },
  diffLines: number,
  verdict: Verdict,
  sha: string,
): Seat {
  const base = {
    id: `${ideaId}-${style}`,
    ideaId,
    style,
    branch: `arena/${style}`,
    tests,
    diffLines,
    updatedAt: at(minute),
    headSha: sha,
  };
  if (verdict === "winner") return { ...base, verdict: "winner" };
  return { ...base, verdict };
}

function readSpec(name: string): string {
  return readFileSync(path.join(root, "sources/fixtures/specs", name), "utf8");
}

export function buildDay(): DayLog {
  const weak = lintSpec(readSpec("north-signal.md"), "sources/fixtures/specs/north-signal.md");
  const fullText = readSpec("complete.md");
  const pass = (file: string) => lintSpec(fullText, file);

  const events: PipelineEvent[] = [];
  const push = (event: PipelineEvent): number => {
    events.push(event);
    return events.length;
  };

  push({
    t: "idea.added",
    idea: makeIdea("harbor", "Harbor Kite", "Night market sketch on the ridge", "bookmark", 0),
  });
  push({
    t: "idea.added",
    idea: makeIdea("north", "North Signal", "Lamp for the ridge path", "manual", 1, "sources/fixtures/specs/north-signal.md"),
  });
  push({
    t: "idea.added",
    idea: makeIdea("glass", "Glass Orchard", "Orchard map from last fall", "memory", 2, "sources/fixtures/specs/complete.md"),
  });
  push({
    t: "idea.added",
    idea: makeIdea("paper", "Paper Lantern", "Lantern route for the lab open house", "bookmark", 3, "sources/fixtures/specs/complete.md"),
  });
  push({
    t: "idea.added",
    idea: makeIdea("copper", "Copper Finch", "Finch counter for the draft gate", "manual", 4, "sources/fixtures/specs/complete.md"),
  });
  const opening = push({
    t: "idea.added",
    idea: makeIdea("quiet", "Quiet Meridian", "Meridian log, ready to close", "memory", 5, "sources/fixtures/specs/complete.md"),
  });

  const weakSpec = push({ t: "spec.linted", ideaId: "north", report: weak });
  push({
    t: "verifier.updated",
    v: { ideaId: "glass", branch: "arena/winner", verdict: "pending", gates: gates({ tests: "amber", lint: "amber" }) },
  });
  const seatsSlide = push({ t: "spec.linted", ideaId: "glass", report: pass("glass.md") });

  push({ t: "seat.updated", seat: makeSeat("glass", "types-first", 13, { passed: 40, failed: 2 }, 1800, "pass", "a11c0de") });
  push({ t: "seat.updated", seat: makeSeat("glass", "model-first", 14, { passed: 44, failed: 1 }, 2200, "pass", "b22d1ef") });
  push({ t: "seat.updated", seat: makeSeat("glass", "experience-first", 16, { passed: 12, failed: 6 }, 900, "pending", "c33e2a0") });
  const experienceLead = push({
    t: "seat.updated",
    seat: makeSeat("glass", "experience-first", 20, { passed: 52, failed: 0 }, 640, "winner", "d44f3b1"),
  });

  push({ t: "spec.linted", ideaId: "paper", report: pass("paper.md") });
  push({ t: "seat.updated", seat: makeSeat("paper", "types-first", 23, { passed: 30, failed: 1 }, 1500, "pass", "e55a401") });
  push({ t: "seat.updated", seat: makeSeat("paper", "model-first", 23, { passed: 33, failed: 0 }, 1400, "pass", "f66b512") });
  push({ t: "seat.updated", seat: makeSeat("paper", "experience-first", 24, { passed: 36, failed: 0 }, 1100, "pass", "a77c623") });

  const gateCursors = [
    push({
      t: "verifier.updated",
      v: { ideaId: "paper", branch: "arena/winner", verdict: "pending", gates: gates({ tests: "green" }) },
    }),
    push({
      t: "verifier.updated",
      v: { ideaId: "paper", branch: "arena/winner", verdict: "pending", gates: gates({ tests: "green", lint: "green" }) },
    }),
    push({
      t: "verifier.updated",
      v: {
        ideaId: "paper",
        branch: "arena/winner",
        verdict: "pending",
        gates: gates({ tests: "green", lint: "green", "demo-gif": "green" }),
      },
    }),
    push({
      t: "verifier.updated",
      v: {
        ideaId: "paper",
        branch: "arena/winner",
        verdict: "pass",
        gates: gates({ tests: "green", lint: "green", "demo-gif": "green", privacy: "green" }),
      },
    }),
  ];

  push({ t: "spec.linted", ideaId: "copper", report: pass("copper.md") });
  push({ t: "seat.updated", seat: makeSeat("copper", "types-first", 35, { passed: 38, failed: 0 }, 1200, "pass", "b88d734") });
  push({ t: "seat.updated", seat: makeSeat("copper", "model-first", 35, { passed: 41, failed: 1 }, 1600, "pass", "c99e845") });
  push({ t: "seat.updated", seat: makeSeat("copper", "experience-first", 36, { passed: 48, failed: 0 }, 900, "pass", "daaf956") });
  push({
    t: "verifier.updated",
    v: {
      ideaId: "copper",
      branch: "arena/winner",
      verdict: "pass",
      gates: gates({ tests: "green", lint: "green", "demo-gif": "green", privacy: "green", "human-ok": "red" }),
    },
  });
  const draftPr = push({
    t: "pr.updated",
    pr: {
      ideaId: "copper",
      number: 418,
      url: "https://example.test/pr/418",
      draft: true,
      merged: false,
      base: "main",
    },
  });

  push({ t: "spec.linted", ideaId: "quiet", report: pass("quiet.md") });
  push({ t: "seat.updated", seat: makeSeat("quiet", "types-first", 45, { passed: 42, failed: 0 }, 1000, "pass", "ebb0a67") });
  push({ t: "seat.updated", seat: makeSeat("quiet", "model-first", 45, { passed: 40, failed: 0 }, 1300, "pass", "fcc1b78") });
  push({ t: "seat.updated", seat: makeSeat("quiet", "experience-first", 46, { passed: 44, failed: 0 }, 1000, "pass", "add2c89") });
  push({
    t: "verifier.updated",
    v: {
      ideaId: "quiet",
      branch: "arena/winner",
      verdict: "winner",
      gates: gates({ tests: "green", lint: "green", "demo-gif": "green", privacy: "green", "human-ok": "green" }),
    },
  });
  push({
    t: "pr.updated",
    pr: { ideaId: "quiet", number: 422, url: "https://example.test/pr/422", draft: true, merged: false, base: "main" },
  });
  push({
    t: "pr.updated",
    pr: { ideaId: "quiet", number: 422, url: "https://example.test/pr/422", draft: false, merged: true, base: "main" },
  });

  for (const style of ["types-first", "model-first", "experience-first"] as const) {
    const n = style === "types-first" ? 0 : style === "model-first" ? 1 : 2;
    push({
      t: "seat.updated",
      seat: makeSeat("harbor", style, 56, { passed: 4 + n, failed: 3 }, 2400, "pending", `e110d${n}a`),
    });
    push({
      t: "seat.updated",
      seat: makeSeat("north", style, 58, { passed: 6 + n, failed: 4 }, 2600, "pending", `f221e${n}b`),
    });
  }

  push({
    t: "verifier.updated",
    v: { ideaId: "harbor", branch: "arena/winner", verdict: "pending", gates: gates({}) },
  });
  push({
    t: "verifier.updated",
    v: { ideaId: "north", branch: "arena/winner", verdict: "fail", gates: gates({ lint: "red" }) },
  });

  return { events, milestones: { opening, weakSpec, seatsSlide, experienceLead, gateCursors, draftPr, end: events.length }, now: at(58) };
}
