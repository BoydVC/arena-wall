import type { Lane } from "./types.ts";

/** Pick the next occupied lane. Returns null when every lane is empty. */
export function nextOccupiedLane(occupied: readonly Lane[], current: Lane, delta: number): Lane | null {
  if (occupied.length === 0) return null;
  const index = Math.max(0, occupied.indexOf(current));
  const next = occupied[(index + delta + occupied.length) % occupied.length];
  return next ?? null;
}
