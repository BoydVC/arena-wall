import { emptyState, reduce } from "./model.ts";
import { project } from "./project.ts";
import { leadSeat, scoreSeat } from "./score.ts";
import type { LogEntry, PipelineState, Seat } from "./types.ts";

export interface Presented {
  now: string;
  t0: number;
  length: number;
  index: number;
  at: string;
  state: PipelineState;
  scores: Record<string, number>;
  leads: Record<string, string | null>;
}

export function t0Index(entries: readonly LogEntry[]): number {
  let index = 0;
  while (index < entries.length && entries[index]?.event.t === "idea.added") index += 1;
  return index;
}

export function fold(entries: readonly LogEntry[], index = entries.length): PipelineState {
  const slice = entries.slice(0, clamp(index, 0, entries.length));
  const reduced = slice.reduce((state, entry) => reduce(state, entry.event), emptyState());
  const now = slice.at(-1)?.at ?? entries[0]?.at ?? "1970-01-01T00:00:00.000Z";
  return project(reduced, now);
}

export function present(entries: readonly LogEntry[], index = entries.length): Presented {
  const length = entries.length;
  const clamped = clamp(index, 0, length);
  const slice = entries.slice(0, clamped);
  const state = fold(entries, clamped);
  const scores: Record<string, number> = {};
  const byIdea = new Map<string, Seat[]>();
  for (const seat of Object.values(state.seats)) {
    const verifier = state.verifiers[seat.ideaId];
    scores[seat.id] = scoreSeat(seat, verifier).total;
    const list = byIdea.get(seat.ideaId) ?? [];
    list.push(seat);
    byIdea.set(seat.ideaId, list);
  }
  const leads: Record<string, string | null> = {};
  for (const idea of Object.values(state.ideas)) {
    const seats = byIdea.get(idea.id) ?? [];
    const lead = leadSeat(seats, state.verifiers[idea.id]);
    leads[idea.id] = lead?.id ?? null;
  }
  return {
    now: slice.at(-1)?.at ?? entries.at(-1)?.at ?? "1970-01-01T00:00:00.000Z",
    t0: t0Index(entries),
    length,
    index: clamped,
    at: slice.at(-1)?.at ?? "",
    state,
    scores,
    leads,
  };
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return max;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
