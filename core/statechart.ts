import { sortFlags, withFlag } from "./flags.js";
import { humanOk, specAccepted } from "./guards.js";
import type { Lane, PipelineState } from "./model.js";

/**
 * Main path: idea → spec → seats → verify → draft_pr → merged.
 * Parked is a side door from every open lane, and the only return is parked → idea.
 * `merged` is an edge here; the human-ok gate is a separate guard in `attemptLaneMove`.
 */
export const ALLOWED_MOVES: readonly (readonly [Lane, Lane])[] = [
  ["idea", "spec"],
  ["idea", "parked"],
  ["spec", "seats"],
  ["spec", "parked"],
  ["seats", "verify"],
  ["seats", "parked"],
  ["verify", "draft_pr"],
  ["verify", "parked"],
  ["draft_pr", "merged"],
  ["draft_pr", "parked"],
  ["parked", "idea"],
];

export function canMove(from: Lane, to: Lane): boolean {
  return ALLOWED_MOVES.some(([start, end]) => start === from && end === to);
}

/**
 * Apply one hop. An illegal hop adds `illegal-transition` and leaves every
 * record as it was. A seats hop without an accepted spec adds `spec-gate`
 * instead of moving. A merged hop without a green human-ok gate is illegal.
 */
export function attemptLaneMove(state: PipelineState, ideaId: string, to: Lane): PipelineState {
  const idea = state.ideas[ideaId];
  if (!idea) return withFlag(state, { ideaId, reason: "illegal-transition" });
  if (idea.lane === to) return state;
  const blockedMerge = to === "merged" && !humanOk(state, ideaId);
  if (!canMove(idea.lane, to) || blockedMerge) {
    return withFlag(state, { ideaId, reason: "illegal-transition" });
  }
  if (to === "seats" && !specAccepted(state, ideaId)) {
    return withFlag(state, { ideaId, reason: "spec-gate" });
  }
  const flags = sortFlags(
    state.flags.filter((flag) => {
      if (flag.ideaId !== ideaId) return true;
      if (flag.reason === "illegal-transition") return false;
      if (to === "seats" && flag.reason === "spec-gate") return false;
      return true;
    }),
  );
  return {
    ...state,
    ideas: { ...state.ideas, [ideaId]: { ...idea, lane: to } },
    flags,
  };
}
