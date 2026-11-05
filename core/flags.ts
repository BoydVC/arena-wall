import type { Flag, FlagReason, PipelineState } from "./model.js";

export function sortFlags(flags: readonly Flag[]): readonly Flag[] {
  return [...flags].sort(
    (a, b) => a.ideaId.localeCompare(b.ideaId) || a.reason.localeCompare(b.reason),
  );
}

export function withFlag(state: PipelineState, flag: Flag): PipelineState {
  if (state.flags.some((item) => item.ideaId === flag.ideaId && item.reason === flag.reason)) {
    return state;
  }
  return { ...state, flags: sortFlags([...state.flags, flag]) };
}

export function withoutFlag(state: PipelineState, ideaId: string, reason: FlagReason): PipelineState {
  const flags = state.flags.filter((item) => !(item.ideaId === ideaId && item.reason === reason));
  if (flags.length === state.flags.length) return state;
  return { ...state, flags };
}
