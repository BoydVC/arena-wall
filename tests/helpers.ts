import {
  emptyState,
  VERIFIER_BRANCH,
  type Idea,
  type Lane,
  type PipelineState,
  type Seat,
  type SeatStyle,
} from "../core/model.js";

export const NOW = "2026-11-04T18:00:00.000Z";

export function makeIdea(id = "ridge-owl", lane: Lane = "idea"): Idea {
  return {
    id,
    title: "Ridge Owl",
    signals: [{ kind: "manual", note: "Hand typed note" }],
    lane,
    createdAt: NOW,
  };
}

export function readyState(lane: Lane): PipelineState {
  return {
    ...emptyState(),
    ideas: { "ridge-owl": makeIdea("ridge-owl", lane) },
    reports: {
      "ridge-owl": { path: "specs/harbor-mint.md", ok: true, missing: [], warnings: [], acceptanceCount: 3 },
    },
    verifiers: {
      "ridge-owl": {
        ideaId: "ridge-owl",
        branch: VERIFIER_BRANCH,
        verdict: "pass",
        gates: [{ name: "human-ok", status: "green" }],
      },
    },
  };
}

export function makeSeat(style: SeatStyle = "types-first", verdict: Seat["verdict"] = "pending"): Seat {
  const base = {
    id: `ridge-owl:${style}`,
    ideaId: "ridge-owl",
    style,
    branch: `arena/${style}`,
    tests: { passed: 4, failed: 0 },
    diffLines: 10,
    updatedAt: NOW,
  };
  if (verdict === "winner") return { ...base, verdict, headSha: "abc1234" };
  return { ...base, verdict };
}
