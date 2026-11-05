import { emptyState, reduce, type PipelineEvent, type PipelineState } from "./model";

export function fold(events: readonly PipelineEvent[]): PipelineState {
  return events.reduce(reduce, emptyState());
}

/** Cursor just after the opening run of idea events. That frame is t0. */
export function openingCursor(events: readonly PipelineEvent[]): number {
  let index = 0;
  while (index < events.length && events[index]?.t === "idea.added") index += 1;
  return index;
}

export function stateAt(events: readonly PipelineEvent[], cursor: number): PipelineState {
  const end = Math.max(0, Math.min(events.length, Math.floor(cursor)));
  return fold(events.slice(0, end));
}
