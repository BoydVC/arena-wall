import { asPull, assertNever, emptyState } from "./types.ts";
import type { Idea, PipelineEvent, PipelineState, PullRequest, Seat, SpecReport, Verifier } from "./types.ts";
import { addFlag, clearFlag, setFlag, specIsOk, tryMove } from "./statechart.ts";

export type {
  Flag,
  FlagReason,
  Gate,
  GateName,
  GateStatus,
  Idea,
  Lane,
  LogEntry,
  PipelineEvent,
  PipelineState,
  PullRequest,
  Seat,
  SeatStyle,
  Signal,
  SpecReport,
  TransitionRow,
  Verdict,
  Verifier,
} from "./types.ts";

export {
  FLAG_REASONS,
  GATE_NAMES,
  GATE_STATUSES,
  LANE_LABELS,
  LANES,
  SEAT_STYLES,
  VERDICTS,
  asPull,
  assertNever,
  emptyState,
  flagLabel,
  isLane,
  isSeatStyle,
} from "./types.ts";

export function reduce(state: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.t) {
    case "idea.added":
      return onIdeaAdded(state, event.idea);
    case "spec.linted":
      return onSpecLinted(state, event.ideaId, event.report);
    case "seat.updated":
      return onSeatUpdated(state, event.seat);
    case "verifier.updated":
      return onVerifierUpdated(state, event.v);
    case "pr.updated":
      return onPrUpdated(state, event.pr);
    case "idea.parked": {
      if (!state.ideas[event.ideaId]) return addFlag(state, event.ideaId, "illegal-transition");
      return tryMove(state, event.ideaId, "parked");
    }
    case "idea.reopened": {
      if (!state.ideas[event.ideaId]) return addFlag(state, event.ideaId, "illegal-transition");
      return tryMove(state, event.ideaId, "idea");
    }
    default:
      return assertNever(event);
  }
}

function onIdeaAdded(state: PipelineState, idea: Idea): PipelineState {
  if (state.ideas[idea.id]) return addFlag(state, idea.id, "illegal-transition");
  const born: Idea = { ...idea, lane: "idea" };
  let next: PipelineState = { ...state, ideas: { ...state.ideas, [born.id]: born } };
  if (idea.lane !== "idea") next = addFlag(next, idea.id, "illegal-transition");
  return next;
}

function onSpecLinted(state: PipelineState, ideaId: string, report: SpecReport): PipelineState {
  const current = state.ideas[ideaId];
  if (!current) return addFlag(state, ideaId, "illegal-transition");

  let next: PipelineState = {
    ...state,
    specs: { ...state.specs, [ideaId]: report },
    ideas: {
      ...state.ideas,
      [ideaId]: { ...current, specPath: report.path },
    },
  };

  if (!report.ok) {
    next = setFlag(next, ideaId, "spec-gate");
    const lane = next.ideas[ideaId]?.lane;
    if (lane === "idea" || lane === "seats") next = tryMove(next, ideaId, "spec");
    return next;
  }

  next = clearFlag(next, ideaId, "spec-gate");
  if (next.ideas[ideaId]?.lane === "idea") next = tryMove(next, ideaId, "spec");
  if (next.ideas[ideaId]?.lane === "spec" && hasSeats(next, ideaId) && specIsOk(next, ideaId)) {
    next = tryMove(next, ideaId, "seats");
  }
  return next;
}

function onSeatUpdated(state: PipelineState, seat: Seat): PipelineState {
  if (!state.ideas[seat.ideaId]) return addFlag(state, seat.ideaId, "illegal-transition");
  if (seat.verdict === "winner" && seat.headSha.length === 0) {
    return addFlag(state, seat.ideaId, "illegal-transition");
  }

  const next: PipelineState = {
    ...state,
    seats: { ...state.seats, [seat.id]: seat },
  };
  const lane = next.ideas[seat.ideaId]?.lane;
  if (lane === "spec") return tryMove(next, seat.ideaId, "seats");
  if (lane === "idea" || lane === "parked") return setFlag(next, seat.ideaId, "spec-gate");
  return next;
}

function onVerifierUpdated(state: PipelineState, verifier: Verifier): PipelineState {
  if (!state.ideas[verifier.ideaId]) return addFlag(state, verifier.ideaId, "illegal-transition");
  if (verifier.branch !== "arena/winner") return addFlag(state, verifier.ideaId, "illegal-transition");

  const next: PipelineState = {
    ...state,
    verifiers: { ...state.verifiers, [verifier.ideaId]: verifier },
  };
  if (next.ideas[verifier.ideaId]?.lane === "seats") return tryMove(next, verifier.ideaId, "verify");
  return next;
}

function onPrUpdated(state: PipelineState, raw: PullRequest): PipelineState {
  if (!state.ideas[raw.ideaId]) return addFlag(state, raw.ideaId, "illegal-transition");
  const pr = asPull(raw);
  if (!pr) return addFlag(state, raw.ideaId, "illegal-transition");

  let next: PipelineState = {
    ...state,
    prs: { ...state.prs, [pr.ideaId]: pr },
  };
  const lane = next.ideas[pr.ideaId]?.lane;

  if (pr.merged) {
    if (lane === "verify") next = tryMove(next, pr.ideaId, "draft_pr");
    if (next.ideas[pr.ideaId]?.lane === "draft_pr") next = tryMove(next, pr.ideaId, "merged");
    else if (lane !== "draft_pr" && lane !== "merged" && lane !== "verify") {
      next = tryMove(next, pr.ideaId, "merged");
    }
    return next;
  }

  if (lane === "verify") return tryMove(next, pr.ideaId, "draft_pr");
  if (lane !== "draft_pr" && lane !== "merged") return tryMove(next, pr.ideaId, "draft_pr");
  return next;
}

function hasSeats(state: PipelineState, ideaId: string): boolean {
  return Object.values(state.seats).some((seat) => seat.ideaId === ideaId);
}

export function foldEvents(events: readonly PipelineEvent[], state: PipelineState = emptyState()): PipelineState {
  return events.reduce(reduce, state);
}
