import { emptyState, reduce, type LogEntry, type PipelineEvent, type PipelineState } from "./model.js";

export function fold(events: readonly PipelineEvent[], state: PipelineState = emptyState()): PipelineState {
  return events.reduce(reduce, state);
}

export function replay(events: readonly PipelineEvent[], cursor: number): PipelineState {
  const end = Math.max(0, Math.min(cursor, events.length));
  return fold(events.slice(0, end));
}

/** Index after the opening run of idea events. Slider t0 folds exactly this prefix. */
export function replayOrigin(events: readonly PipelineEvent[]): number {
  let index = 0;
  while (index < events.length && events[index]?.t === "idea.added") index += 1;
  return index;
}

export function eventsOf(entries: readonly LogEntry[]): readonly PipelineEvent[] {
  return entries.map((entry) => entry.event);
}
