export const LANES = [
  "idea",
  "spec",
  "seats",
  "verify",
  "draft_pr",
  "merged",
  "parked",
] as const;

export type Lane = (typeof LANES)[number];

export const SEAT_STYLES = ["types-first", "model-first", "experience-first"] as const;
export type SeatStyle = (typeof SEAT_STYLES)[number];

export const VERDICTS = ["pending", "pass", "fail", "winner", "lost"] as const;
export type Verdict = (typeof VERDICTS)[number];

export const GATE_NAMES = ["tests", "lint", "demo-gif", "privacy", "human-ok"] as const;
export type GateName = (typeof GATE_NAMES)[number];

export const GATE_STATUSES = ["red", "amber", "green"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export const FLAG_REASONS = [
  "illegal-transition",
  "spec-gate",
  "stale-seat",
  "awaiting-ok",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const LANE_LABELS: Record<Lane, string> = {
  idea: "Idea",
  spec: "Spec",
  seats: "Seats",
  verify: "Verify",
  draft_pr: "Draft PR",
  merged: "Merged",
  parked: "Parked",
};

export interface Signal {
  kind: "bookmark" | "memory" | "manual";
  url?: string;
  note: string;
}

export interface Idea {
  id: string;
  title: string;
  signals: Signal[];
  lane: Lane;
  specPath?: string;
  createdAt: string;
}

export interface SpecReport {
  path: string;
  ok: boolean;
  missing: string[];
  warnings: string[];
  acceptanceCount: number;
}

interface SeatBase {
  id: string;
  ideaId: string;
  style: SeatStyle;
  branch: string;
  tests: { passed: number; failed: number };
  diffLines: number;
  updatedAt: string;
}

/** A winning seat must name the commit it won with. Other verdicts may omit it. */
export type Seat =
  | (SeatBase & { verdict: "winner"; headSha: string })
  | (SeatBase & { verdict: "pending" | "pass" | "fail" | "lost"; headSha?: string });

export interface Gate {
  name: GateName;
  status: GateStatus;
}

export interface Verifier {
  ideaId: string;
  branch: "arena/winner";
  gates: Gate[];
  verdict: Verdict;
}

interface PullBase {
  ideaId: string;
  number: number;
  url: string;
  base: string;
}

/**
 * A pull is one of three shapes. Draft and merged cannot both be true:
 * that pair is not a member of the union, so it cannot be stored.
 */
export type PullRequest =
  | (PullBase & { draft: true; merged: false })
  | (PullBase & { draft: false; merged: false })
  | (PullBase & { draft: false; merged: true });

type ImpossiblePull = Extract<PullRequest, { draft: true; merged: true }>;
type WinnerSeat = Extract<Seat, { verdict: "winner" }>;
type _ClosedPull = ImpossiblePull extends never ? true : never;
type _WinnerNamesCommit = WinnerSeat extends { headSha: string } ? true : never;
const _closedPull: _ClosedPull = true;
const _winnerNamesCommit: _WinnerNamesCommit = true;
void _closedPull;
void _winnerNamesCommit;

/** Drop a payload that claims to be both a draft and merged. */
export function asPull(value: {
  ideaId: string;
  number: number;
  url: string;
  base: string;
  draft: boolean;
  merged: boolean;
}): PullRequest | undefined {
  const base = { ideaId: value.ideaId, number: value.number, url: value.url, base: value.base };
  if (value.draft && value.merged) return undefined;
  if (value.merged) return { ...base, draft: false, merged: true };
  if (value.draft) return { ...base, draft: true, merged: false };
  return { ...base, draft: false, merged: false };
}

/**
 * Park and reopen are extensions. The lane exists in the sketch, and no sketched
 * event reaches it. They stay local to the event log. Nothing here writes to a forge.
 */
export type PipelineEvent =
  | { t: "idea.added"; idea: Idea }
  | { t: "spec.linted"; ideaId: string; report: SpecReport }
  | { t: "seat.updated"; seat: Seat }
  | { t: "verifier.updated"; v: Verifier }
  | { t: "pr.updated"; pr: PullRequest }
  | { t: "idea.parked"; ideaId: string }
  | { t: "idea.reopened"; ideaId: string };

export interface Flag {
  ideaId: string;
  reason: FlagReason;
}

/**
 * `specs` is retained so a fold can re-check the gate. The sketch left the
 * report only on the event.
 */
export interface PipelineState {
  ideas: Record<string, Idea>;
  seats: Record<string, Seat>;
  verifiers: Record<string, Verifier>;
  prs: Record<string, PullRequest>;
  specs: Record<string, SpecReport>;
  flags: Flag[];
}

export interface TransitionRow {
  from: Lane;
  to: Lane;
  allowed: boolean;
  guard: "none" | "spec-ok" | "human-ok";
}

export interface LogEntry {
  at: string;
  event: PipelineEvent;
}

export function emptyState(): PipelineState {
  return { ideas: {}, seats: {}, verifiers: {}, prs: {}, specs: {}, flags: [] };
}

export function assertNever(value: never, message = "unreachable variant"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function isLane(value: string): value is Lane {
  return (LANES as readonly string[]).includes(value);
}

export function isSeatStyle(value: string): value is SeatStyle {
  return (SEAT_STYLES as readonly string[]).includes(value);
}

/** The waiting flag has one spelling. The gold badge reads this label. */
export function flagLabel(reason: FlagReason): string {
  switch (reason) {
    case "illegal-transition":
      return "Illegal move";
    case "spec-gate":
      return "Spec gate";
    case "stale-seat":
      return "Stale seat";
    case "awaiting-ok":
      return "Awaiting OK";
    default:
      return assertNever(reason);
  }
}
