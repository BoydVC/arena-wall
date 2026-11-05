import fs from "node:fs";
import path from "node:path";
import { lintSpec } from "../core/specLint.js";
import {
  GATE_NAMES,
  VERIFIER_BRANCH,
  type Gate,
  type GateName,
  type GateStatus,
  type Idea,
  type LogEntry,
  type PipelineEvent,
  type PullRequest,
  type Seat,
  type SeatStyle,
  type Signal,
  type SpecReport,
  type Verdict,
  type Verifier,
} from "../core/model.js";
import { ROOT } from "./root.js";

export const FIXTURE_ASOF = "2026-11-04T18:00:00.000Z";
const FRESH = "2026-11-04T17:50:00.000Z";
const STALE = "2026-11-04T16:29:00.000Z";

function readSpec(rel: string): SpecReport {
  const text = fs.readFileSync(path.join(ROOT, rel), "utf8");
  return lintSpec(text, { path: rel });
}

function requireOk(rel: string): SpecReport {
  const report = readSpec(rel);
  if (!report.ok) {
    throw new Error(`fixture spec is not open: ${rel} (${report.missing.join(", ")})`);
  }
  return report;
}

function requireWeak(rel: string): SpecReport {
  const report = readSpec(rel);
  if (report.ok) throw new Error(`fixture spec should fail: ${rel}`);
  return report;
}

function signal(kind: Signal["kind"], note: string, url?: string): Signal {
  return url === undefined ? { kind, note } : { kind, note, url };
}

function idea(id: string, title: string, createdAt: string, signals: readonly Signal[], specPath?: string): Idea {
  const base: Idea = { id, title, signals, lane: "idea", createdAt };
  return specPath === undefined ? base : { ...base, specPath };
}

function seat(input: {
  ideaId: string;
  style: SeatStyle;
  passed: number;
  failed: number;
  diff: number;
  verdict: Verdict;
  sha?: string;
  at: string;
}): Seat {
  const base = {
    id: `${input.ideaId}:${input.style}`,
    ideaId: input.ideaId,
    style: input.style,
    branch: `arena/${input.style}`,
    tests: { passed: input.passed, failed: input.failed },
    diffLines: input.diff,
    updatedAt: input.at,
  };
  if (input.verdict === "winner") {
    if (!input.sha) throw new Error("winner seat requires a commit");
    return { ...base, verdict: "winner", headSha: input.sha };
  }
  return input.sha === undefined
    ? { ...base, verdict: input.verdict }
    : { ...base, verdict: input.verdict, headSha: input.sha };
}

function gates(partial: Partial<Record<GateName, GateStatus>>): Gate[] {
  return GATE_NAMES.map((name) => ({ name, status: partial[name] ?? "amber" }));
}

function verifier(ideaId: string, verdict: Verdict, partial: Partial<Record<GateName, GateStatus>>): Verifier {
  return { ideaId, branch: VERIFIER_BRANCH, verdict, gates: gates(partial) };
}

function draftPr(ideaId: string, number: number): PullRequest {
  return {
    ideaId,
    number,
    url: `https://example.com/arena/pull/${number}`,
    base: "main",
    draft: true,
    merged: false,
  };
}

function mergedPr(ideaId: string, number: number): PullRequest {
  return {
    ideaId,
    number,
    url: `https://example.com/arena/pull/${number}`,
    base: "main",
    draft: false,
    merged: true,
  };
}

function sha(seed: string): string {
  let hash = 0;
  for (const unit of seed) hash = (Math.imul(hash, 33) + unit.charCodeAt(0)) >>> 0;
  return hash.toString(16).padStart(7, "0").slice(0, 7);
}

/** Synthetic day: 6 ideas, 18 seats, 6 verifiers. Times are relative to FIXTURE_ASOF. */
export function fixtureLog(): readonly LogEntry[] {
  const comet = requireWeak("specs/comet-lab.md");
  const harbor = requireOk("specs/harbor-mint.md");
  const north = requireOk("specs/north-glass.md");
  const paper = requireOk("specs/paper-kite.md");
  const lumen = requireOk("specs/lumen-dock.md");

  let tick = Date.parse("2026-11-04T15:00:00.000Z");
  const entries: LogEntry[] = [];
  const push = (event: PipelineEvent): void => {
    entries.push({ at: new Date(tick).toISOString(), event });
    tick += 60_000;
  };

  const ideas: Idea[] = [
    idea(
      "ridge-owl",
      "Ridge Owl",
      new Date(tick).toISOString(),
      [
        signal("bookmark", "Night sketch pinned from the lab board", "https://example.com/notes/ridge-owl"),
        signal("manual", "Typed in by hand before any spec existed"),
      ],
    ),
    idea("comet-lab", "Comet Lab", new Date(tick + 60_000).toISOString(), [
      signal("memory", "Remember to keep this note thin until the spec is real"),
    ]),
    idea("harbor-mint", "Harbor Mint", new Date(tick + 120_000).toISOString(), [
      signal("manual", "Race the three seats and watch the scoreboard"),
    ]),
    idea(
      "north-glass",
      "North Glass",
      new Date(tick + 180_000).toISOString(),
      [signal("bookmark", "Verifier gates for the glass build", "https://example.com/notes/north-glass")],
    ),
    idea("paper-kite", "Paper Kite", new Date(tick + 240_000).toISOString(), [
      signal("manual", "Draft is up and waiting on a manual OK"),
    ]),
    idea("lumen-dock", "Lumen Dock", new Date(tick + 300_000).toISOString(), [
      signal("memory", "Finished piece with a green manual gate"),
      signal("manual", "Kept as the merged example"),
    ]),
  ];
  for (const item of ideas) push({ t: "idea.added", idea: item });

  push({ t: "spec.linted", ideaId: "comet-lab", report: comet });
  push({ t: "spec.linted", ideaId: "harbor-mint", report: harbor });
  push({ t: "spec.linted", ideaId: "north-glass", report: north });
  push({ t: "spec.linted", ideaId: "paper-kite", report: paper });
  push({ t: "spec.linted", ideaId: "lumen-dock", report: lumen });

  const styles: readonly SeatStyle[] = ["types-first", "model-first", "experience-first"];
  const rows: readonly { ideaId: string; passed: number; failed: number; diff: number; verdict: Verdict; sha?: string; at: string }[][] =
    [
      styles.map(() => ({
        ideaId: "ridge-owl",
        passed: 0,
        failed: 0,
        diff: 0,
        verdict: "pending" as const,
        at: FRESH,
      })),
      [
        { ideaId: "comet-lab", passed: 10, failed: 4, diff: 80, verdict: "pending", at: FRESH },
        { ideaId: "comet-lab", passed: 8, failed: 6, diff: 140, verdict: "fail", sha: sha("comet-model"), at: FRESH },
        { ideaId: "comet-lab", passed: 12, failed: 3, diff: 90, verdict: "pending", at: FRESH },
      ],
      [
        { ideaId: "harbor-mint", passed: 48, failed: 0, diff: 260, verdict: "pass", sha: sha("harbor-types"), at: FRESH },
        { ideaId: "harbor-mint", passed: 44, failed: 2, diff: 420, verdict: "pass", sha: sha("harbor-model"), at: FRESH },
        {
          ideaId: "harbor-mint",
          passed: 52,
          failed: 0,
          diff: 180,
          verdict: "winner",
          sha: sha("harbor-experience"),
          at: FRESH,
        },
      ],
      [
        { ideaId: "north-glass", passed: 40, failed: 1, diff: 300, verdict: "pass", sha: sha("north-types"), at: STALE },
        { ideaId: "north-glass", passed: 41, failed: 0, diff: 240, verdict: "pass", sha: sha("north-model"), at: FRESH },
        { ideaId: "north-glass", passed: 46, failed: 0, diff: 200, verdict: "pass", sha: sha("north-experience"), at: FRESH },
      ],
      [
        { ideaId: "paper-kite", passed: 38, failed: 0, diff: 220, verdict: "pass", sha: sha("paper-types"), at: FRESH },
        { ideaId: "paper-kite", passed: 39, failed: 1, diff: 260, verdict: "pass", sha: sha("paper-model"), at: FRESH },
        { ideaId: "paper-kite", passed: 47, failed: 0, diff: 190, verdict: "pass", sha: sha("paper-experience"), at: FRESH },
      ],
      [
        { ideaId: "lumen-dock", passed: 42, failed: 0, diff: 210, verdict: "pass", sha: sha("lumen-types"), at: FRESH },
        { ideaId: "lumen-dock", passed: 40, failed: 0, diff: 250, verdict: "pass", sha: sha("lumen-model"), at: FRESH },
        { ideaId: "lumen-dock", passed: 45, failed: 0, diff: 170, verdict: "pass", sha: sha("lumen-experience"), at: FRESH },
      ],
    ];

  for (const group of rows) {
    group.forEach((row, styleIndex) => {
      const style = styles[styleIndex];
      if (!style) return;
      push({
        t: "seat.updated",
        seat: seat({
          ideaId: row.ideaId,
          style,
          passed: row.passed,
          failed: row.failed,
          diff: row.diff,
          verdict: row.verdict,
          at: row.at,
          ...(row.sha ? { sha: row.sha } : {}),
        }),
      });
    });
  }

  push({ t: "verifier.updated", v: verifier("ridge-owl", "pending", {}) });
  push({ t: "verifier.updated", v: verifier("comet-lab", "pending", { tests: "red", lint: "red" }) });
  push({ t: "verifier.updated", v: verifier("harbor-mint", "pending", { "demo-gif": "amber" }) });
  push({
    t: "verifier.updated",
    v: verifier("north-glass", "pass", {
      tests: "green",
      lint: "green",
      "demo-gif": "green",
      privacy: "green",
      "human-ok": "amber",
    }),
  });
  push({
    t: "verifier.updated",
    v: verifier("paper-kite", "pass", {
      tests: "green",
      lint: "green",
      "demo-gif": "green",
      privacy: "green",
      "human-ok": "amber",
    }),
  });
  push({
    t: "verifier.updated",
    v: verifier("lumen-dock", "pass", {
      tests: "green",
      lint: "green",
      "demo-gif": "green",
      privacy: "green",
      "human-ok": "green",
    }),
  });

  push({ t: "pr.updated", pr: draftPr("paper-kite", 418) });
  push({ t: "pr.updated", pr: draftPr("lumen-dock", 419) });
  push({ t: "pr.updated", pr: mergedPr("lumen-dock", 419) });

  return entries;
}

function shiftIso(iso: string, delta: number): string {
  return new Date(Date.parse(iso) + delta).toISOString();
}

function shiftEvent(event: PipelineEvent, delta: number): PipelineEvent {
  switch (event.t) {
    case "idea.added":
      return { t: "idea.added", idea: { ...event.idea, createdAt: shiftIso(event.idea.createdAt, delta) } };
    case "seat.updated":
      return { t: "seat.updated", seat: { ...event.seat, updatedAt: shiftIso(event.seat.updatedAt, delta) } };
    case "spec.linted":
    case "verifier.updated":
    case "pr.updated":
      return event;
    default:
      return event;
  }
}

/** Slide the synthetic day so FIXTURE_ASOF lands on `to`. Fresh seats stay inside 90 minutes. */
export function shiftLog(entries: readonly LogEntry[], to: Date): readonly LogEntry[] {
  const delta = to.getTime() - Date.parse(FIXTURE_ASOF);
  return entries.map((entry) => ({
    at: shiftIso(entry.at, delta),
    event: shiftEvent(entry.event, delta),
  }));
}
