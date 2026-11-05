import { withFlag, withoutFlag } from "./flags.js";
import { humanOk } from "./guards.js";
import { attemptLaneMove } from "./statechart.js";

export const LANES = ["idea", "spec", "seats", "verify", "draft_pr", "merged", "parked"] as const;
export type Lane = (typeof LANES)[number];

export const SEAT_STYLES = ["types-first", "model-first", "experience-first"] as const;
export type SeatStyle = (typeof SEAT_STYLES)[number];

export const OPEN_VERDICTS = ["pending", "pass", "fail", "lost"] as const;
export type OpenVerdict = (typeof OPEN_VERDICTS)[number];
export type Verdict = OpenVerdict | "winner";

export const SIGNAL_KINDS = ["bookmark", "memory", "manual"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const GATE_NAMES = ["tests", "lint", "demo-gif", "privacy", "human-ok"] as const;
export type GateName = (typeof GATE_NAMES)[number];

export const GATE_STATUSES = ["red", "amber", "green"] as const;
export type GateStatus = (typeof GATE_STATUSES)[number];

export const FLAG_REASONS = ["illegal-transition", "spec-gate", "stale-seat", "awaiting-ok"] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

export const VERIFIER_BRANCH = "arena/winner" as const;

export interface Signal {
  readonly kind: SignalKind;
  readonly note: string;
  readonly url?: string;
}

export interface Idea {
  readonly id: string;
  readonly title: string;
  readonly signals: readonly Signal[];
  readonly lane: Lane;
  readonly createdAt: string;
  readonly specPath?: string;
}

export interface SpecReport {
  readonly path: string;
  readonly ok: boolean;
  readonly missing: readonly string[];
  readonly warnings: readonly string[];
  readonly acceptanceCount: number;
}

export interface TestTally {
  readonly passed: number;
  readonly failed: number;
}

interface SeatBase {
  readonly id: string;
  readonly ideaId: string;
  readonly style: SeatStyle;
  readonly branch: string;
  readonly tests: TestTally;
  readonly diffLines: number;
  readonly updatedAt: string;
}

/** A winner seat always carries the commit it won with. Other verdicts may omit it. */
export type Seat =
  | (SeatBase & { readonly verdict: OpenVerdict; readonly headSha?: string })
  | (SeatBase & { readonly verdict: "winner"; readonly headSha: string });

export interface Gate {
  readonly name: GateName;
  readonly status: GateStatus;
}

export interface Verifier {
  readonly ideaId: string;
  readonly branch: typeof VERIFIER_BRANCH;
  readonly gates: readonly Gate[];
  readonly verdict: Verdict;
}

interface PullBase {
  readonly ideaId: string;
  readonly number: number;
  readonly url: string;
  readonly base: string;
}

/** A merged pull is never still a draft. The wall does not create either shape. */
export type PullRequest =
  | (PullBase & { readonly draft: true; readonly merged: false })
  | (PullBase & { readonly draft: false; readonly merged: false })
  | (PullBase & { readonly draft: false; readonly merged: true });

export interface Flag {
  readonly ideaId: string;
  readonly reason: FlagReason;
}

export type PipelineEvent =
  | { readonly t: "idea.added"; readonly idea: Idea }
  | { readonly t: "spec.linted"; readonly ideaId: string; readonly report: SpecReport }
  | { readonly t: "seat.updated"; readonly seat: Seat }
  | { readonly t: "verifier.updated"; readonly v: Verifier }
  | { readonly t: "pr.updated"; readonly pr: PullRequest };

/**
 * `reports` holds the latest spec gate result. The sketch omitted it, and the
 * seats rule cannot be applied without it.
 */
export interface PipelineState {
  readonly ideas: Readonly<Record<string, Idea>>;
  readonly seats: Readonly<Record<string, Seat>>;
  readonly verifiers: Readonly<Record<string, Verifier>>;
  readonly prs: Readonly<Record<string, PullRequest>>;
  readonly reports: Readonly<Record<string, SpecReport>>;
  readonly flags: readonly Flag[];
}

export interface LogEntry {
  readonly at: string;
  readonly event: PipelineEvent;
}

export function emptyState(): PipelineState {
  return { ideas: {}, seats: {}, verifiers: {}, prs: {}, reports: {}, flags: [] };
}

export function assertNever(value: never, message = "unhandled variant"): never {
  throw new Error(`${message}: ${JSON.stringify(value)}`);
}

export function laneLabel(lane: Lane): string {
  switch (lane) {
    case "idea":
      return "Idea";
    case "spec":
      return "Spec";
    case "seats":
      return "Seats";
    case "verify":
      return "Verify";
    case "draft_pr":
      return "Draft PR";
    case "merged":
      return "Merged";
    case "parked":
      return "Parked";
    default:
      return assertNever(lane);
  }
}

export function styleLabel(style: SeatStyle): string {
  switch (style) {
    case "types-first":
      return "Types";
    case "model-first":
      return "Model";
    case "experience-first":
      return "Experience";
    default:
      return assertNever(style);
  }
}

export function flagLabel(reason: FlagReason): string {
  switch (reason) {
    case "illegal-transition":
      return "Illegal move";
    case "spec-gate":
      return "Spec gate";
    case "stale-seat":
      return "Stale";
    case "awaiting-ok":
      return "Awaiting OK";
    default:
      return assertNever(reason);
  }
}

export function isWinner(seat: Seat): seat is SeatBase & { verdict: "winner"; headSha: string } {
  return seat.verdict === "winner";
}

function cloneSignal(signal: Signal): Signal {
  return signal.url === undefined
    ? { kind: signal.kind, note: signal.note }
    : { kind: signal.kind, note: signal.note, url: signal.url };
}

function cloneIdea(idea: Idea): Idea {
  const copy: Idea = {
    id: idea.id,
    title: idea.title,
    signals: idea.signals.map(cloneSignal),
    lane: idea.lane,
    createdAt: idea.createdAt,
  };
  return idea.specPath === undefined ? copy : { ...copy, specPath: idea.specPath };
}

function cloneSeat(seat: Seat): Seat {
  const base: SeatBase = {
    id: seat.id,
    ideaId: seat.ideaId,
    style: seat.style,
    branch: seat.branch,
    tests: { passed: seat.tests.passed, failed: seat.tests.failed },
    diffLines: seat.diffLines,
    updatedAt: seat.updatedAt,
  };
  if (seat.verdict === "winner") return { ...base, verdict: "winner", headSha: seat.headSha };
  return seat.headSha === undefined
    ? { ...base, verdict: seat.verdict }
    : { ...base, verdict: seat.verdict, headSha: seat.headSha };
}

function cloneReport(report: SpecReport): SpecReport {
  return {
    path: report.path,
    ok: report.ok,
    missing: [...report.missing],
    warnings: [...report.warnings],
    acceptanceCount: report.acceptanceCount,
  };
}

function cloneVerifier(verifier: Verifier): Verifier {
  return {
    ideaId: verifier.ideaId,
    branch: verifier.branch,
    verdict: verifier.verdict,
    gates: verifier.gates.map((gate) => ({ name: gate.name, status: gate.status })),
  };
}

function clonePull(pr: PullRequest): PullRequest {
  const base = { ideaId: pr.ideaId, number: pr.number, url: pr.url, base: pr.base };
  if (pr.merged) return { ...base, draft: false, merged: true };
  if (pr.draft) return { ...base, draft: true, merged: false };
  return { ...base, draft: false, merged: false };
}

function onIdea(state: PipelineState, event: Extract<PipelineEvent, { t: "idea.added" }>): PipelineState {
  const idea = event.idea;
  if (state.ideas[idea.id] || idea.lane !== "idea") {
    return withFlag(state, { ideaId: idea.id, reason: "illegal-transition" });
  }
  return { ...state, ideas: { ...state.ideas, [idea.id]: cloneIdea(idea) } };
}

function onSpec(state: PipelineState, event: Extract<PipelineEvent, { t: "spec.linted" }>): PipelineState {
  const current = state.ideas[event.ideaId];
  if (!current) return withFlag(state, { ideaId: event.ideaId, reason: "illegal-transition" });
  const report = cloneReport(event.report);
  const withPath: Idea = { ...current, specPath: report.path };
  let next: PipelineState = {
    ...state,
    ideas: { ...state.ideas, [event.ideaId]: withPath },
    reports: { ...state.reports, [event.ideaId]: report },
  };
  if (!report.ok) {
    next = withFlag(next, { ideaId: event.ideaId, reason: "spec-gate" });
    if (next.ideas[event.ideaId]?.lane === "idea") next = attemptLaneMove(next, event.ideaId, "spec");
    return next;
  }
  next = withoutFlag(next, event.ideaId, "spec-gate");
  if (next.ideas[event.ideaId]?.lane === "idea") next = attemptLaneMove(next, event.ideaId, "spec");
  if (next.ideas[event.ideaId]?.lane === "spec") next = attemptLaneMove(next, event.ideaId, "seats");
  return next;
}

function onSeat(state: PipelineState, event: Extract<PipelineEvent, { t: "seat.updated" }>): PipelineState {
  const seat = cloneSeat(event.seat);
  if (!state.ideas[seat.ideaId]) return withFlag(state, { ideaId: seat.ideaId, reason: "illegal-transition" });
  return { ...state, seats: { ...state.seats, [seat.id]: seat } };
}

function onVerifier(
  state: PipelineState,
  event: Extract<PipelineEvent, { t: "verifier.updated" }>,
): PipelineState {
  const verifier = cloneVerifier(event.v);
  if (verifier.branch !== VERIFIER_BRANCH || !state.ideas[verifier.ideaId]) {
    return withFlag(state, { ideaId: verifier.ideaId, reason: "illegal-transition" });
  }
  let next: PipelineState = {
    ...state,
    verifiers: { ...state.verifiers, [verifier.ideaId]: verifier },
  };
  if (verifier.verdict !== "pending" && next.ideas[verifier.ideaId]?.lane === "seats") {
    next = attemptLaneMove(next, verifier.ideaId, "verify");
  }
  if (humanOk(next, verifier.ideaId)) next = withoutFlag(next, verifier.ideaId, "awaiting-ok");
  return next;
}

function onPull(state: PipelineState, event: Extract<PipelineEvent, { t: "pr.updated" }>): PipelineState {
  const pr = clonePull(event.pr);
  const idea = state.ideas[pr.ideaId];
  if (!idea) return withFlag(state, { ideaId: pr.ideaId, reason: "illegal-transition" });
  if (pr.merged) {
    if (idea.lane !== "draft_pr") return withFlag(state, { ideaId: pr.ideaId, reason: "illegal-transition" });
    const moved = attemptLaneMove(state, pr.ideaId, "merged");
    if (moved.ideas[pr.ideaId]?.lane !== "merged") return moved;
    return withoutFlag(
      { ...moved, prs: { ...moved.prs, [pr.ideaId]: pr } },
      pr.ideaId,
      "awaiting-ok",
    );
  }
  let next: PipelineState = { ...state, prs: { ...state.prs, [pr.ideaId]: pr } };
  if (next.ideas[pr.ideaId]?.lane === "verify") next = attemptLaneMove(next, pr.ideaId, "draft_pr");
  if (next.ideas[pr.ideaId]?.lane === "draft_pr" && !humanOk(next, pr.ideaId)) {
    next = withFlag(next, { ideaId: pr.ideaId, reason: "awaiting-ok" });
  } else {
    next = withoutFlag(next, pr.ideaId, "awaiting-ok");
  }
  return next;
}

/** Pure fold of one event. Does not read the clock and does not mutate its inputs. */
export function reduce(state: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.t) {
    case "idea.added":
      return onIdea(state, event);
    case "spec.linted":
      return onSpec(state, event);
    case "seat.updated":
      return onSeat(state, event);
    case "verifier.updated":
      return onVerifier(state, event);
    case "pr.updated":
      return onPull(state, event);
    default:
      return assertNever(event);
  }
}
