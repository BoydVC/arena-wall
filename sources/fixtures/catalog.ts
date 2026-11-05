import type { Gate, GateName, GateStatus, Idea, PullRequest, Seat, SeatStyle, Verifier } from "../../core/types.ts";

export interface Roster {
  ideas: Idea[];
  seats: Seat[];
  verifiers: Verifier[];
  pulls: PullRequest[];
}

const GATE_NAMES: GateName[] = ["tests", "lint", "demo-gif", "privacy", "human-ok"];

function gates(partial: Partial<Record<GateName, GateStatus>>): Gate[] {
  return GATE_NAMES.map((name) => ({ name, status: partial[name] ?? "red" }));
}

function seat(
  ideaId: string,
  style: SeatStyle,
  fields: {
    tests: { passed: number; failed: number };
    diffLines: number;
    updatedAt: string;
    headSha?: string;
  } & ({ verdict: "winner"; headSha: string } | { verdict: "pending" | "pass" | "fail" | "lost" }),
): Seat {
  const base = {
    id: `${ideaId}:${style}`,
    ideaId,
    style,
    branch: `arena/${style}`,
    tests: fields.tests,
    diffLines: fields.diffLines,
    updatedAt: fields.updatedAt,
  };
  if (fields.verdict === "winner") {
    return { ...base, verdict: "winner", headSha: fields.headSha };
  }
  return fields.headSha
    ? { ...base, verdict: fields.verdict, headSha: fields.headSha }
    : { ...base, verdict: fields.verdict };
}

function verifier(
  ideaId: string,
  verdict: Verifier["verdict"],
  partial: Partial<Record<GateName, GateStatus>>,
): Verifier {
  return { ideaId, branch: "arena/winner", verdict, gates: gates(partial) };
}

export const roster: Roster = {
  ideas: [
    {
      id: "nimbus-quill",
      title: "Nimbus Quill",
      lane: "idea",
      createdAt: "2026-11-04T09:00:00.000Z",
      signals: [{ kind: "manual", note: "Opened from a notebook margin during planning." }],
    },
    {
      id: "lumen-fold",
      title: "Lumen Fold",
      lane: "idea",
      createdAt: "2026-11-04T09:00:10.000Z",
      specPath: "sources/fixtures/specs/lumen-fold.md",
      signals: [{ kind: "bookmark", url: "https://example.test/lumen", note: "A folding guide worth a spec." }],
    },
    {
      id: "comet-lab",
      title: "Comet Lab",
      lane: "idea",
      createdAt: "2026-11-04T09:00:20.000Z",
      specPath: "sources/fixtures/specs/comet-lab.md",
      signals: [{ kind: "memory", note: "Bench sketch for a faster lab timer." }],
    },
    {
      id: "harbor-mint",
      title: "Harbor Mint",
      lane: "idea",
      createdAt: "2026-11-04T09:00:30.000Z",
      specPath: "sources/fixtures/specs/harbor-mint.md",
      signals: [{ kind: "manual", note: "Quiet release checklist for the harbor build." }],
    },
    {
      id: "ridge-owl",
      title: "Ridge Owl",
      lane: "idea",
      createdAt: "2026-11-04T09:00:40.000Z",
      specPath: "sources/fixtures/specs/ridge-owl.md",
      signals: [{ kind: "bookmark", url: "https://example.test/ridge", note: "Night survey tool for the ridge." }],
    },
    {
      id: "pebble-arc",
      title: "Pebble Arc",
      lane: "idea",
      createdAt: "2026-11-04T09:00:50.000Z",
      specPath: "sources/fixtures/specs/pebble-arc.md",
      signals: [{ kind: "memory", note: "Small arc study that already cleared review." }],
    },
  ],
  seats: [
    seat("nimbus-quill", "types-first", { verdict: "pending", tests: { passed: 0, failed: 0 }, diffLines: 0, updatedAt: "2026-11-04T09:00:00.000Z" }),
    seat("nimbus-quill", "model-first", { verdict: "pending", tests: { passed: 0, failed: 0 }, diffLines: 0, updatedAt: "2026-11-04T09:00:00.000Z" }),
    seat("nimbus-quill", "experience-first", { verdict: "pending", tests: { passed: 0, failed: 0 }, diffLines: 0, updatedAt: "2026-11-04T09:00:00.000Z" }),

    seat("lumen-fold", "types-first", { verdict: "pending", tests: { passed: 3, failed: 2 }, diffLines: 640, updatedAt: "2026-11-04T10:20:00.000Z", headSha: "1a1b1c1" }),
    seat("lumen-fold", "model-first", { verdict: "pending", tests: { passed: 5, failed: 1 }, diffLines: 510, updatedAt: "2026-11-04T10:21:00.000Z", headSha: "2b2c2d2" }),
    seat("lumen-fold", "experience-first", { verdict: "pass", tests: { passed: 9, failed: 0 }, diffLines: 240, updatedAt: "2026-11-04T10:22:00.000Z", headSha: "3c3d3e3" }),

    seat("comet-lab", "types-first", { verdict: "pass", tests: { passed: 20, failed: 4 }, diffLines: 1100, updatedAt: "2026-11-04T11:30:00.000Z", headSha: "a11c0de" }),
    seat("comet-lab", "model-first", { verdict: "pass", tests: { passed: 28, failed: 1 }, diffLines: 640, updatedAt: "2026-11-04T13:30:00.000Z", headSha: "b22d1ef" }),
    seat("comet-lab", "experience-first", { verdict: "pass", tests: { passed: 30, failed: 0 }, diffLines: 220, updatedAt: "2026-11-04T13:40:00.000Z", headSha: "c33e2ab" }),

    seat("harbor-mint", "types-first", { verdict: "pass", tests: { passed: 18, failed: 1 }, diffLines: 700, updatedAt: "2026-11-04T09:50:00.000Z", headSha: "h111aaa" }),
    seat("harbor-mint", "model-first", { verdict: "pass", tests: { passed: 22, failed: 0 }, diffLines: 500, updatedAt: "2026-11-04T09:51:00.000Z", headSha: "h222bbb" }),
    seat("harbor-mint", "experience-first", { verdict: "pass", tests: { passed: 24, failed: 0 }, diffLines: 260, updatedAt: "2026-11-04T09:52:00.000Z", headSha: "h333ccc" }),

    seat("ridge-owl", "types-first", { verdict: "pass", tests: { passed: 47, failed: 2 }, diffLines: 860, updatedAt: "2026-11-04T13:10:00.000Z", headSha: "r111aaa" }),
    seat("ridge-owl", "model-first", { verdict: "pass", tests: { passed: 50, failed: 0 }, diffLines: 480, updatedAt: "2026-11-04T13:11:00.000Z", headSha: "r222bbb" }),
    seat("ridge-owl", "experience-first", { verdict: "winner", tests: { passed: 52, failed: 0 }, diffLines: 160, updatedAt: "2026-11-04T13:12:00.000Z", headSha: "r333ccc" }),

    seat("pebble-arc", "types-first", { verdict: "pass", tests: { passed: 40, failed: 0 }, diffLines: 300, updatedAt: "2026-11-04T10:10:00.000Z", headSha: "p111aaa" }),
    seat("pebble-arc", "model-first", { verdict: "pass", tests: { passed: 41, failed: 0 }, diffLines: 280, updatedAt: "2026-11-04T10:11:00.000Z", headSha: "p222bbb" }),
    seat("pebble-arc", "experience-first", { verdict: "winner", tests: { passed: 44, failed: 0 }, diffLines: 190, updatedAt: "2026-11-04T10:12:00.000Z", headSha: "p333ccc" }),
  ],
  verifiers: [
    verifier("nimbus-quill", "pending", {}),
    verifier("lumen-fold", "pending", {}),
    verifier("comet-lab", "pending", {}),
    verifier("harbor-mint", "pending", { tests: "green", lint: "amber", "demo-gif": "red", privacy: "green", "human-ok": "red" }),
    verifier("ridge-owl", "pass", { tests: "green", lint: "green", "demo-gif": "green", privacy: "green", "human-ok": "red" }),
    verifier("pebble-arc", "pass", { tests: "green", lint: "green", "demo-gif": "green", privacy: "green", "human-ok": "green" }),
  ],
  pulls: [
    { ideaId: "ridge-owl", number: 18, url: "https://example.test/ridge-owl/pull/18", draft: true, merged: false, base: "main" },
    { ideaId: "pebble-arc", number: 11, url: "https://example.test/pebble-arc/pull/11", draft: false, merged: true, base: "main" },
  ],
};

export const IDEA_ORDER = [
  "nimbus-quill",
  "lumen-fold",
  "comet-lab",
  "harbor-mint",
  "ridge-owl",
  "pebble-arc",
] as const;
