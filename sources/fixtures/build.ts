import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lintSpec } from "../../core/specLint.ts";
import type { LogEntry, Seat, SeatStyle } from "../../core/types.ts";
import { IDEA_ORDER, roster, type Roster } from "./catalog.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Seat ids that stay in the catalog until a spec exists. Emitting them would not admit the card. */
const HELD_BACK = new Set(["nimbus-quill"]);

export function loadRoster(): Roster {
  return roster;
}

export function rosterPath(): string {
  return path.join(here, "roster.json");
}

export function buildFixtureLog(): LogEntry[] {
  const entries: LogEntry[] = [];
  const push = (at: string, event: LogEntry["event"]): void => {
    entries.push({ at, event });
  };

  for (const id of IDEA_ORDER) {
    const idea = mustIdea(id);
    push(idea.createdAt, { t: "idea.added", idea: { ...idea, lane: "idea" } });
  }

  push("2026-11-04T09:10:00.000Z", {
    t: "spec.linted",
    ideaId: "lumen-fold",
    report: lintFile("lumen-fold.md"),
  });
  push("2026-11-04T09:20:00.000Z", {
    t: "spec.linted",
    ideaId: "comet-lab",
    report: lintFile("comet-lab.md"),
  });
  push("2026-11-04T09:21:00.000Z", {
    t: "spec.linted",
    ideaId: "harbor-mint",
    report: lintFile("harbor-mint.md"),
  });
  push("2026-11-04T09:22:00.000Z", {
    t: "spec.linted",
    ideaId: "ridge-owl",
    report: lintFile("ridge-owl.md"),
  });
  push("2026-11-04T09:23:00.000Z", {
    t: "spec.linted",
    ideaId: "pebble-arc",
    report: lintFile("pebble-arc.md"),
  });

  push("2026-11-04T09:40:00.000Z", {
    t: "seat.updated",
    seat: early("comet-lab", "types-first", "2026-11-04T09:40:00.000Z", { passed: 22, failed: 2 }, 400, "pass", "a11c0de"),
  });
  push("2026-11-04T09:41:00.000Z", {
    t: "seat.updated",
    seat: early("comet-lab", "model-first", "2026-11-04T09:41:00.000Z", { passed: 24, failed: 0 }, 300, "pass", "b22d1ef"),
  });
  push("2026-11-04T09:42:00.000Z", {
    t: "seat.updated",
    seat: early("comet-lab", "experience-first", "2026-11-04T09:42:00.000Z", { passed: 10, failed: 3 }, 800, "pending", "c33e2ab"),
  });

  for (const style of ["types-first", "model-first", "experience-first"] as const) {
    const found = mustSeat("harbor-mint", style);
    push(found.updatedAt, { t: "seat.updated", seat: found });
  }

  push("2026-11-04T10:00:00.000Z", {
    t: "seat.updated",
    seat: early("ridge-owl", "types-first", "2026-11-04T10:00:00.000Z", { passed: 30, failed: 4 }, 900, "pending", "r111aaa"),
  });
  push("2026-11-04T10:01:00.000Z", {
    t: "seat.updated",
    seat: early("ridge-owl", "model-first", "2026-11-04T10:01:00.000Z", { passed: 36, failed: 0 }, 520, "pass", "r222bbb"),
  });
  push("2026-11-04T10:02:00.000Z", {
    t: "seat.updated",
    seat: early("ridge-owl", "experience-first", "2026-11-04T10:02:00.000Z", { passed: 28, failed: 1 }, 240, "pass", "r333ccc"),
  });

  for (const style of ["types-first", "model-first", "experience-first"] as const) {
    const found = mustSeat("pebble-arc", style);
    push(found.updatedAt, { t: "seat.updated", seat: found });
  }

  for (const style of ["types-first", "model-first", "experience-first"] as const) {
    const found = mustSeat("lumen-fold", style);
    push(found.updatedAt, { t: "seat.updated", seat: found });
  }

  push("2026-11-04T10:30:00.000Z", {
    t: "verifier.updated",
    v: mustVerifier("pebble-arc"),
  });
  push("2026-11-04T10:40:00.000Z", {
    t: "pr.updated",
    pr: { ...mustPull("pebble-arc"), draft: true, merged: false },
  });

  push("2026-11-04T11:00:00.000Z", {
    t: "verifier.updated",
    v: mustVerifier("harbor-mint"),
  });

  push("2026-11-04T11:30:00.000Z", { t: "seat.updated", seat: mustSeat("comet-lab", "types-first") });

  const ridge = mustVerifier("ridge-owl");
  push("2026-11-04T12:00:00.000Z", {
    t: "verifier.updated",
    v: { ...ridge, gates: gateStep(ridge, ["tests"]) },
  });
  push("2026-11-04T12:20:00.000Z", {
    t: "verifier.updated",
    v: { ...ridge, gates: gateStep(ridge, ["tests", "lint"]) },
  });
  push("2026-11-04T12:40:00.000Z", {
    t: "verifier.updated",
    v: { ...ridge, gates: gateStep(ridge, ["tests", "lint", "demo-gif"]) },
  });
  push("2026-11-04T13:00:00.000Z", {
    t: "verifier.updated",
    v: ridge,
  });

  push("2026-11-04T13:10:00.000Z", { t: "seat.updated", seat: mustSeat("ridge-owl", "types-first") });
  push("2026-11-04T13:11:00.000Z", { t: "seat.updated", seat: mustSeat("ridge-owl", "model-first") });
  push("2026-11-04T13:12:00.000Z", { t: "seat.updated", seat: mustSeat("ridge-owl", "experience-first") });
  push("2026-11-04T13:20:00.000Z", { t: "pr.updated", pr: mustPull("ridge-owl") });

  push("2026-11-04T13:30:00.000Z", { t: "seat.updated", seat: mustSeat("comet-lab", "model-first") });
  push("2026-11-04T13:40:00.000Z", { t: "seat.updated", seat: mustSeat("comet-lab", "experience-first") });

  push("2026-11-04T14:50:00.000Z", { t: "pr.updated", pr: mustPull("pebble-arc") });

  // Heartbeats keep admitted seats inside the 90-minute window of the log head.
  // The types-first comet seat is left at 11:30 so the wall can show stale-seat.
  const beat = "2026-11-04T14:55:00.000Z";
  for (const item of roster.seats) {
    if (HELD_BACK.has(item.ideaId)) continue;
    if (item.id === "comet-lab:types-first") continue;
    push(beat, { t: "seat.updated", seat: { ...item, updatedAt: beat } });
  }

  return entries;
}

export function admittedSeatIds(): string[] {
  return roster.seats.filter((item) => !HELD_BACK.has(item.ideaId)).map((item) => item.id);
}

function lintFile(name: string): ReturnType<typeof lintSpec> {
  const specPath = path.join(here, "specs", name);
  const markdown = fs.readFileSync(specPath, "utf8");
  return lintSpec(markdown, path.posix.join("sources/fixtures/specs", name));
}

function mustIdea(id: string): Roster["ideas"][number] {
  const found = roster.ideas.find((idea) => idea.id === id);
  if (!found) throw new Error(`missing idea ${id}`);
  return found;
}

function mustSeat(ideaId: string, style: SeatStyle): Seat {
  const found = roster.seats.find((item) => item.ideaId === ideaId && item.style === style);
  if (!found) throw new Error(`missing seat ${ideaId}:${style}`);
  return found;
}

function mustVerifier(ideaId: string): Roster["verifiers"][number] {
  const found = roster.verifiers.find((item) => item.ideaId === ideaId);
  if (!found) throw new Error(`missing verifier ${ideaId}`);
  return found;
}

function mustPull(ideaId: string): Roster["pulls"][number] {
  const found = roster.pulls.find((item) => item.ideaId === ideaId);
  if (!found) throw new Error(`missing pull ${ideaId}`);
  return found;
}

function early(
  ideaId: string,
  style: SeatStyle,
  at: string,
  tests: { passed: number; failed: number },
  diffLines: number,
  verdict: "pending" | "pass",
  headSha: string,
): Seat {
  return {
    id: `${ideaId}:${style}`,
    ideaId,
    style,
    branch: `arena/${style}`,
    tests,
    diffLines,
    verdict,
    headSha,
    updatedAt: at,
  };
}

function gateStep(
  verifier: Roster["verifiers"][number],
  green: string[],
): Roster["verifiers"][number]["gates"] {
  return verifier.gates.map((gate) =>
    green.includes(gate.name) ? { ...gate, status: "green" as const } : { ...gate, status: "red" as const },
  );
}
