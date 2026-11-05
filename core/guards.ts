import type { PipelineState } from "./model.js";

export function specAccepted(state: PipelineState, ideaId: string): boolean {
  return state.reports[ideaId]?.ok === true;
}

export function humanOk(state: PipelineState, ideaId: string): boolean {
  const gates = state.verifiers[ideaId]?.gates;
  if (!gates) return false;
  return gates.some((gate) => gate.name === "human-ok" && gate.status === "green");
}
