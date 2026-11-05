/**
 * Card lifecycle. `canMove` is this table and nothing else.
 * Same-lane refreshes are allowed. Every other pair is illegal unless listed.
 *
 *   idea     → spec | parked
 *   spec     → idea | seats | parked
 *   seats    → spec | verify | parked
 *   verify   → seats | draft_pr | parked
 *   draft_pr → verify | merged | parked
 *   merged   → (terminal)
 *   parked   → idea
 *
 * Entering seats also needs a passing spec report. Entering merged also needs
 * the human-ok gate green. Those guards live in the reducer, not in this table,
 * so the chart itself stays a pure edge list.
 */

import type { Lane } from "./model";

export const LANES = ["idea", "spec", "seats", "verify", "draft_pr", "merged", "parked"] as const satisfies readonly Lane[];

export const LANE_LABEL: Record<Lane, string> = {
  idea: "Idea",
  spec: "Spec",
  seats: "Seats",
  verify: "Verify",
  draft_pr: "Draft PR",
  merged: "Merged",
  parked: "Parked",
};

/** Visible wall columns. Parked appears only when a card is actually there. */
export const WALL_LANES: readonly Lane[] = ["idea", "spec", "seats", "verify", "draft_pr", "merged"];

export const EDGES: readonly (readonly [Lane, Lane])[] = [
  ["idea", "spec"],
  ["idea", "parked"],
  ["spec", "idea"],
  ["spec", "seats"],
  ["spec", "parked"],
  ["seats", "spec"],
  ["seats", "verify"],
  ["seats", "parked"],
  ["verify", "seats"],
  ["verify", "draft_pr"],
  ["verify", "parked"],
  ["draft_pr", "verify"],
  ["draft_pr", "merged"],
  ["draft_pr", "parked"],
  ["parked", "idea"],
];

export function canMove(from: Lane, to: Lane): boolean {
  if (from === to) return true;
  return EDGES.some(([start, end]) => start === from && end === to);
}

export function isLane(value: string): value is Lane {
  return (LANES as readonly string[]).includes(value);
}
