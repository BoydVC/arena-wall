/**
 * Domain types and the pure pipeline reducer.
 * Events fold into state. Nothing here reads the clock or the network.
 */

import { canMove } from "./statechart";

export type Lane = "idea" | "spec" | "seats" | "verify" | "draft_pr" | "merged" | "parked";

export type SeatStyle = "types-first" | "model-first" | "experience-first";

export type Verdict = "pending" | "pass" | "fail" | "winner" | "lost";

export type GateName = "tests" | "lint" | "demo-gif" | "privacy" | "human-ok";

export type GateStatus = "red" | "amber" | "green";

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

/** A winning seat always names the commit it won with. */
export type Seat =
  | (SeatBase & { verdict: "pending" | "pass" | "fail" | "lost"; headSha?: string })
  | (SeatBase & { verdict: "winner"; headSha: string });

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

export interface PullRequest {
  ideaId: string;
  number: number;
  url: string;
  draft: boolean;
  merged: boolean;
  base: string;
}

/**
 * Sign-off is still open. The sketch named this flag after a person; that
 * token is on the deny list, so the shipped reason is `awaiting-signoff`.
 */
export type FlagReason = "illegal-transition" | "spec-gate" | "stale-seat" | "awaiting-signoff";

export interface Flag {
  ideaId: string;
  reason: FlagReason;
}

export type PipelineEvent =
  | { t: "idea.added"; idea: Idea }
  | { t: "spec.linted"; ideaId: string; report: SpecReport }
  | { t: "seat.updated"; seat: Seat }
  | { t: "verifier.updated"; v: Verifier }
  | { t: "pr.updated"; pr: PullRequest };

/**
 * `reports` is not in the sketch. The seats gate needs the last spec report,
 * and a pure fold has nowhere else to keep it.
 */
export interface PipelineState {
  ideas: Record<string, Idea>;
  seats: Record<string, Seat>;
  verifiers: Record<string, Verifier>;
  prs: Record<string, PullRequest>;
  reports: Record<string, SpecReport>;
  flags: Flag[];
}

export const STALE_MS = 90 * 60 * 1000;

export function emptyState(): PipelineState {
  return { ideas: {}, seats: {}, verifiers: {}, prs: {}, reports: {}, flags: [] };
}

export function humanOk(state: PipelineState, ideaId: string): boolean {
  const verifier = state.verifiers[ideaId];
  if (!verifier) return false;
  return verifier.gates.some((gate) => gate.name === "human-ok" && gate.status === "green");
}

export function specOk(state: PipelineState, ideaId: string): boolean {
  return state.reports[ideaId]?.ok === true;
}

function addFlag(state: PipelineState, ideaId: string, reason: FlagReason): PipelineState {
  if (state.flags.some((flag) => flag.ideaId === ideaId && flag.reason === reason)) return state;
  return { ...state, flags: [...state.flags, { ideaId, reason }] };
}

function removeFlag(state: PipelineState, ideaId: string, reason: FlagReason): PipelineState {
  const flags = state.flags.filter((flag) => !(flag.ideaId === ideaId && flag.reason === reason));
  if (flags.length === state.flags.length) return state;
  return { ...state, flags };
}

function setLane(state: PipelineState, ideaId: string, lane: Lane): PipelineState {
  const idea = state.ideas[ideaId];
  if (!idea || idea.lane === lane) return state;
  return { ...state, ideas: { ...state.ideas, [ideaId]: { ...idea, lane } } };
}

/**
 * Move one card. Illegal chart edges add `illegal-transition` and leave the
 * lane alone. The seats gate and the sign-off gate do the same when their
 * extra rule fails.
 */
export function transition(state: PipelineState, ideaId: string, to: Lane): PipelineState {
  const idea = state.ideas[ideaId];
  if (!idea || idea.lane === to) return state;
  if (!canMove(idea.lane, to)) return addFlag(state, ideaId, "illegal-transition");
  if (to === "seats" && !specOk(state, ideaId)) return addFlag(state, ideaId, "spec-gate");
  if (to === "merged" && !humanOk(state, ideaId)) return addFlag(state, ideaId, "illegal-transition");
  let next = setLane(state, ideaId, to);
  if (to === "seats") next = removeFlag(next, ideaId, "spec-gate");
  if (to === "merged") next = removeFlag(next, ideaId, "awaiting-signoff");
  return next;
}

const LATER: readonly Lane[] = ["seats", "verify", "draft_pr", "merged"];

function moveAfterLint(state: PipelineState, ideaId: string, ok: boolean): PipelineState {
  const idea = state.ideas[ideaId];
  if (!idea) return state;
  if (!ok) {
    let next = addFlag(state, ideaId, "spec-gate");
    if (idea.lane !== "spec" && canMove(idea.lane, "spec")) next = transition(next, ideaId, "spec");
    return next;
  }
  let next = removeFlag(state, ideaId, "spec-gate");
  if (LATER.includes(idea.lane)) return next;
  if (canMove(idea.lane, "seats")) return transition(next, ideaId, "seats");
  // idea → spec → seats, both edges legal, taken together so a passing spec slides once.
  if (canMove(idea.lane, "spec") && canMove("spec", "seats")) {
    const mid = transition(next, ideaId, "spec");
    return transition(mid, ideaId, "seats");
  }
  if (canMove(idea.lane, "spec")) return transition(next, ideaId, "spec");
  return addFlag(next, ideaId, "illegal-transition");
}

function seatUsable(seat: Seat): boolean {
  if (seat.verdict !== "winner") return true;
  return typeof seat.headSha === "string" && seat.headSha.trim().length > 0;
}

export function reduce(state: PipelineState, event: PipelineEvent): PipelineState {
  switch (event.t) {
    case "idea.added": {
      if (state.ideas[event.idea.id]) return state;
      const idea: Idea = { ...event.idea, signals: event.idea.signals.map((signal) => ({ ...signal })), lane: "idea" };
      let next: PipelineState = { ...state, ideas: { ...state.ideas, [idea.id]: idea } };
      if (event.idea.lane !== "idea") next = addFlag(next, idea.id, "illegal-transition");
      return next;
    }
    case "spec.linted": {
      if (!state.ideas[event.ideaId]) return state;
      const withReport: PipelineState = {
        ...state,
        reports: { ...state.reports, [event.ideaId]: event.report },
      };
      return moveAfterLint(withReport, event.ideaId, event.report.ok);
    }
    case "seat.updated": {
      if (!state.ideas[event.seat.ideaId] || !seatUsable(event.seat)) return state;
      return { ...state, seats: { ...state.seats, [event.seat.id]: event.seat } };
    }
    case "verifier.updated": {
      if (!state.ideas[event.v.ideaId]) return state;
      const next: PipelineState = { ...state, verifiers: { ...state.verifiers, [event.v.ideaId]: event.v } };
      if (next.ideas[event.v.ideaId]?.lane === "seats") return transition(next, event.v.ideaId, "verify");
      return next;
    }
    case "pr.updated": {
      if (!state.ideas[event.pr.ideaId]) return state;
      if (event.pr.merged) {
        if (canMove(state.ideas[event.pr.ideaId]!.lane, "merged") && humanOk(state, event.pr.ideaId)) {
          const stored: PipelineState = { ...state, prs: { ...state.prs, [event.pr.ideaId]: event.pr } };
          return transition(stored, event.pr.ideaId, "merged");
        }
        if (state.ideas[event.pr.ideaId]!.lane === "merged" && humanOk(state, event.pr.ideaId)) {
          return { ...state, prs: { ...state.prs, [event.pr.ideaId]: event.pr } };
        }
        const refused: PullRequest = { ...event.pr, merged: false };
        return addFlag(
          { ...state, prs: { ...state.prs, [event.pr.ideaId]: refused } },
          event.pr.ideaId,
          "illegal-transition",
        );
      }
      let next: PipelineState = { ...state, prs: { ...state.prs, [event.pr.ideaId]: event.pr } };
      const lane = next.ideas[event.pr.ideaId]!.lane;
      if (event.pr.draft && canMove(lane, "draft_pr") && lane !== "draft_pr") {
        next = transition(next, event.pr.ideaId, "draft_pr");
      }
      if (event.pr.draft) next = addFlag(next, event.pr.ideaId, "awaiting-signoff");
      return next;
    }
    default: {
      const neverEvent: never = event;
      return neverEvent;
    }
  }
}

/** Seats with no update for 90 minutes raise `stale-seat`. Pure: pass `now`. */
export function markStale(state: PipelineState, nowIso: string): PipelineState {
  const now = Date.parse(nowIso);
  const stale = new Set<string>();
  if (Number.isFinite(now)) {
    for (const seat of Object.values(state.seats)) {
      const updated = Date.parse(seat.updatedAt);
      if (Number.isFinite(updated) && now - updated >= STALE_MS) stale.add(seat.ideaId);
    }
  }
  const flags = state.flags.filter((flag) => flag.reason !== "stale-seat");
  for (const ideaId of stale) {
    if (!flags.some((flag) => flag.ideaId === ideaId && flag.reason === "stale-seat")) {
      flags.push({ ideaId, reason: "stale-seat" });
    }
  }
  return { ...state, flags };
}
