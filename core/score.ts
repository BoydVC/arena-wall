/**
 * Seat scoreboard. Tests, diff size, spec lint, and verdict.
 * The arena rubric (40 / 20 / 25 / 15) scores a finished entry, separate from a live seat.
 */

import type { Seat, Verdict } from "./model";

const VERDICT_POINTS: Record<Verdict, number> = {
  winner: 20,
  pass: 15,
  pending: 6,
  lost: 4,
  fail: 0,
};

export function scoreSeat(seat: Pick<Seat, "tests" | "diffLines" | "verdict">, lintOk: boolean): number {
  const total = seat.tests.passed + seat.tests.failed;
  const testPart = total === 0 ? 0 : (40 * seat.tests.passed) / total;
  const diffPart = 20 * Math.max(0, 1 - seat.diffLines / 4000);
  const lintPart = lintOk ? 20 : 0;
  const verdictPart = VERDICT_POINTS[seat.verdict];
  return Math.round((testPart + diffPart + lintPart + verdictPart) * 10) / 10;
}

export function compareSeats(a: Seat, b: Seat, lintFor: (seat: Seat) => boolean): number {
  const delta = scoreSeat(b, lintFor(b)) - scoreSeat(a, lintFor(a));
  if (Math.abs(delta) > 0.05) return delta;
  if (a.style === "experience-first") return -1;
  if (b.style === "experience-first") return 1;
  return a.style.localeCompare(b.style);
}

export function rankSeats(seats: readonly Seat[], lintFor: (seat: Seat) => boolean): Seat[] {
  return [...seats].sort((a, b) => compareSeats(a, b, lintFor));
}

export function leadingSeat(seats: readonly Seat[], lintFor: (seat: Seat) => boolean): Seat | undefined {
  return rankSeats(seats, lintFor)[0];
}

export interface ArenaRubric {
  tests: number;
  typesModel: number;
  ux: number;
  readmeGif: number;
}

/** Verifier rubric: tests 40, types/model 20, screenshots 25, readme and gif 15. */
export function scoreArena(rubric: ArenaRubric): number {
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  return (
    clamp(rubric.tests, 40) +
    clamp(rubric.typesModel, 20) +
    clamp(rubric.ux, 25) +
    clamp(rubric.readmeGif, 15)
  );
}
