import type { Seat, SeatStyle, Verifier } from "./types.ts";

export interface ScoreParts {
  tests: number;
  focus: number;
  lint: number;
  verdict: number;
  total: number;
}

const VERDICT_POINTS = {
  winner: 15,
  pass: 10,
  pending: 4,
  fail: 0,
  lost: 0,
} as const;

const STYLE_RANK: Record<SeatStyle, number> = {
  "experience-first": 0,
  "model-first": 1,
  "types-first": 2,
};

/**
 * Rubric out of 100, aligned with the verifier weights:
 * tests 40, focused diff 20, lint 25, verdict 15.
 * A smaller diff scores higher on the focus term. Lint prefers the verifier
 * gate when one has been admitted, otherwise a clean test run.
 */
export function scoreSeat(seat: Seat, verifier?: Verifier): ScoreParts {
  const attempts = seat.tests.passed + seat.tests.failed;
  const tests = attempts === 0 ? 0 : (40 * seat.tests.passed) / attempts;
  const focus = 20 * Math.max(0, 1 - Math.min(seat.diffLines, 1500) / 1500);
  const lintGate = verifier?.gates.find((gate) => gate.name === "lint");
  let lint = 0;
  if (lintGate?.status === "green") lint = 25;
  else if (lintGate?.status === "amber") lint = 12;
  else if (!lintGate && seat.tests.failed === 0 && attempts > 0) lint = 25;
  const verdict = VERDICT_POINTS[seat.verdict];
  const total = round1(tests + focus + lint + verdict);
  return {
    tests: round1(tests),
    focus: round1(focus),
    lint,
    verdict,
    total,
  };
}

export function rankSeats(seats: Seat[], verifier?: Verifier): Seat[] {
  return [...seats].sort((a, b) => {
    const delta = scoreSeat(b, verifier).total - scoreSeat(a, verifier).total;
    if (Math.abs(delta) > 0.001) return delta;
    return STYLE_RANK[a.style] - STYLE_RANK[b.style];
  });
}

export function leadSeat(seats: Seat[], verifier?: Verifier): Seat | undefined {
  return rankSeats(seats, verifier)[0];
}

/** Fixture-sized unified diff so the drawer can show three seats side by side. */
export function diffText(seat: Seat): string {
  const added = Math.max(1, Math.round(seat.diffLines * 0.7));
  const removed = Math.max(0, seat.diffLines - added);
  const sha = seat.headSha ?? "0000000";
  return [
    `diff --git a/seat/${seat.style} b/seat/${seat.style}`,
    `index 0000000..${sha}`,
    "--- a/seat/README.md",
    "+++ b/seat/README.md",
    `@@ fixture stat ${seat.diffLines} lines @@`,
    `+${seat.style}  tests ${seat.tests.passed}/${seat.tests.passed + seat.tests.failed}`,
    `+verdict ${seat.verdict}`,
    `+${added} / -${removed}`,
  ].join("\n");
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
