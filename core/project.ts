import type { PipelineState } from "./types.ts";
import { clearFlag, setFlag } from "./statechart.ts";

const NINETY_MINUTES_MS = 90 * 60 * 1000;

/**
 * Derived flags. The reducer stores admission flags only. Stale seats and the
 * draft-PR waiting badge depend on the log clock, so they are applied here and
 * replay stays exact.
 */
export function project(state: PipelineState, nowIso: string): PipelineState {
  let next = state;
  for (const flag of state.flags) {
    if (flag.reason === "stale-seat" || flag.reason === "awaiting-ok") {
      next = clearFlag(next, flag.ideaId, flag.reason);
    }
  }

  const now = Date.parse(nowIso);
  const staleIdeas = new Set<string>();
  if (Number.isFinite(now)) {
    for (const seat of Object.values(next.seats)) {
      const updated = Date.parse(seat.updatedAt);
      if (Number.isFinite(updated) && now - updated > NINETY_MINUTES_MS) {
        staleIdeas.add(seat.ideaId);
      }
    }
  }
  for (const ideaId of staleIdeas) next = setFlag(next, ideaId, "stale-seat");

  for (const idea of Object.values(next.ideas)) {
    if (idea.lane !== "draft_pr") continue;
    const verifier = next.verifiers[idea.id];
    const gate = verifier?.gates.find((item) => item.name === "human-ok");
    if (!gate || gate.status !== "green") next = setFlag(next, idea.id, "awaiting-ok");
  }

  return next;
}
