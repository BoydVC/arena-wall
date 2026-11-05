import type { GateStatus, Seat } from "./model.js";

/** Verifier rubric: tests 40, types/model 20, UX screenshots 25, README and GIF 15. */
export const RUBRIC = {
  tests: 40,
  typesModel: 20,
  ux: 25,
  readmeGif: 15,
} as const;

export interface SeatScore {
  readonly seatId: string;
  readonly total: number;
  readonly tests: number;
  readonly typesModel: number;
  readonly ux: number;
  readonly readmeGif: number;
}

export interface ScoreInput {
  readonly lintOk: boolean;
  readonly demoGif: GateStatus | "missing";
}

const DIFF_STEP = 80;

function uxPoints(seat: Seat): number {
  const strong = seat.verdict === "winner" || seat.verdict === "pass";
  if (seat.style === "experience-first" && strong) return RUBRIC.ux;
  if (seat.verdict === "winner") return RUBRIC.ux;
  if (seat.verdict === "pass") return 15;
  if (seat.verdict === "pending") return 8;
  return 0;
}

function gifPoints(status: GateStatus | "missing"): number {
  if (status === "green") return RUBRIC.readmeGif;
  if (status === "amber") return 8;
  return 0;
}

export function scoreSeat(seat: Seat, input: ScoreInput): SeatScore {
  const ran = seat.tests.passed + seat.tests.failed;
  const tests = ran === 0 ? 0 : Math.round((RUBRIC.tests * seat.tests.passed) / ran);
  const penalty = Math.min(RUBRIC.typesModel, Math.floor(seat.diffLines / DIFF_STEP));
  const typesModel = input.lintOk ? RUBRIC.typesModel - penalty : 0;
  const ux = uxPoints(seat);
  const readmeGif = gifPoints(input.demoGif);
  return {
    seatId: seat.id,
    tests,
    typesModel,
    ux,
    readmeGif,
    total: tests + typesModel + ux + readmeGif,
  };
}

export function leadSeat(scores: readonly SeatScore[]): SeatScore | undefined {
  const ranked = [...scores].sort((a, b) => b.total - a.total || a.seatId.localeCompare(b.seatId));
  return ranked[0];
}

function commitOf(seat: Seat): string {
  if (seat.verdict === "winner") return seat.headSha;
  return seat.headSha ?? "pending";
}

export function seatDigest(seat: Seat): readonly string[] {
  const sha = commitOf(seat);
  return [
    `diff --git a/${seat.branch} b/${seat.branch}`,
    `index 0000000..${sha}`,
    `--- a/${seat.branch}`,
    `+++ b/${seat.branch}`,
    "@@ synthetic stat @@",
    `+ tests ${seat.tests.passed} passed, ${seat.tests.failed} failed`,
    `+ diff lines ${seat.diffLines}`,
    `+ verdict ${seat.verdict}`,
  ];
}

export function demoGifStatus(gates: readonly { name: string; status: GateStatus }[] | undefined): GateStatus | "missing" {
  const gate = gates?.find((item) => item.name === "demo-gif");
  return gate ? gate.status : "missing";
}
