import { sortFlags } from "./flags.js";
import type { PipelineState } from "./model.js";

/** A seat with no update for this long draws a stale-seat flag. */
export const STALE_MS = 90 * 60 * 1000;

export function project(state: PipelineState, nowIso: string): PipelineState {
  const now = Date.parse(nowIso);
  const stale = new Set<string>();
  if (!Number.isNaN(now)) {
    for (const seat of Object.values(state.seats)) {
      const at = Date.parse(seat.updatedAt);
      if (Number.isNaN(at)) continue;
      if (now - at >= STALE_MS) stale.add(seat.ideaId);
    }
  }
  const flags = state.flags.filter((flag) => flag.reason !== "stale-seat");
  for (const ideaId of stale) flags.push({ ideaId, reason: "stale-seat" });
  return { ...state, flags: sortFlags(flags) };
}

export function ageLabel(fromIso: string, nowIso: string): string {
  const delta = Date.parse(nowIso) - Date.parse(fromIso);
  if (Number.isNaN(delta)) return "unknown time";
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
