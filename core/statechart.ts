import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FlagReason, Lane, PipelineState, TransitionRow } from "./types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export function lifecycleDocPath(): string {
  return path.resolve(here, "../docs/lifecycle.md");
}

export function lifecycleTlaPath(): string {
  return path.resolve(here, "../docs/Lifecycle.tla");
}

let cached: { path: string; rows: TransitionRow[] } | null = null;

export function loadTransitionTable(docPath = lifecycleDocPath()): TransitionRow[] {
  if (cached && cached.path === docPath) return cached.rows;
  const text = fs.readFileSync(docPath, "utf8");
  const match = text.match(/```transition-table\n([\s\S]*?)\n```/);
  if (!match?.[1]) {
    throw new Error(`missing transition-table block in ${docPath}`);
  }
  const parsed: unknown = JSON.parse(match[1]);
  if (!Array.isArray(parsed)) {
    throw new Error("transition table is not an array");
  }
  const rows = parsed.map(parseRow);
  if (docPath === lifecycleDocPath()) cached = { path: docPath, rows };
  return rows;
}

function parseRow(value: unknown): TransitionRow {
  if (!value || typeof value !== "object") throw new Error("transition row is not an object");
  const row = value as Record<string, unknown>;
  const from = row.from;
  const to = row.to;
  const allowed = row.allowed;
  const guard = row.guard;
  if (typeof from !== "string" || typeof to !== "string" || typeof allowed !== "boolean") {
    throw new Error("transition row is missing from/to/allowed");
  }
  if (guard !== "none" && guard !== "spec-ok" && guard !== "human-ok") {
    throw new Error(`unknown guard on ${from} -> ${to}`);
  }
  return { from: from as Lane, to: to as Lane, allowed, guard };
}

export function canMove(from: Lane, to: Lane, table = loadTransitionTable()): boolean {
  const row = table.find((item) => item.from === from && item.to === to);
  return row?.allowed ?? false;
}

export function transitionRow(
  from: Lane,
  to: Lane,
  table = loadTransitionTable(),
): TransitionRow | undefined {
  return table.find((item) => item.from === from && item.to === to);
}

export function addFlag(state: PipelineState, ideaId: string, reason: FlagReason): PipelineState {
  return { ...state, flags: [...state.flags, { ideaId, reason }] };
}

export function clearFlag(state: PipelineState, ideaId: string, reason: FlagReason): PipelineState {
  return {
    ...state,
    flags: state.flags.filter((flag) => !(flag.ideaId === ideaId && flag.reason === reason)),
  };
}

export function setFlag(state: PipelineState, ideaId: string, reason: FlagReason): PipelineState {
  return addFlag(clearFlag(state, ideaId, reason), ideaId, reason);
}

export function specIsOk(state: PipelineState, ideaId: string): boolean {
  return state.specs[ideaId]?.ok === true;
}

export function humanIsOk(state: PipelineState, ideaId: string): boolean {
  const verifier = state.verifiers[ideaId];
  if (!verifier) return false;
  return verifier.gates.some((gate) => gate.name === "human-ok" && gate.status === "green");
}

/**
 * Apply one lane change. Illegal pairs add `illegal-transition` and leave every
 * record untouched. A failed guard leaves the lane untouched. A passing guard
 * changes the lane and nothing else.
 */
export function tryMove(state: PipelineState, ideaId: string, to: Lane): PipelineState {
  const idea = state.ideas[ideaId];
  if (!idea) return addFlag(state, ideaId, "illegal-transition");
  if (idea.lane === to) return state;

  const row = transitionRow(idea.lane, to);
  if (!row?.allowed) return addFlag(state, ideaId, "illegal-transition");

  if (row.guard === "spec-ok" && !specIsOk(state, ideaId)) {
    return setFlag(state, ideaId, "spec-gate");
  }
  if (row.guard === "human-ok" && !humanIsOk(state, ideaId)) {
    return state;
  }

  return {
    ...state,
    ideas: {
      ...state.ideas,
      [ideaId]: { ...idea, lane: to },
    },
  };
}

/** Allowed pairs in the TLA `Allowed` set. Used to prove the doc and the spec match. */
export function loadTlaAllowed(tlaPath = lifecycleTlaPath()): Array<{ from: string; to: string }> {
  const text = fs.readFileSync(tlaPath, "utf8");
  const body = text.match(/Allowed\s*==\s*\{([\s\S]*?)\}/);
  if (!body?.[1]) throw new Error("TLA module is missing Allowed");
  const pairs: Array<{ from: string; to: string }> = [];
  const re = /<<"([a-z_]+)",\s*"([a-z_]+)">>/g;
  for (const match of body[1].matchAll(re)) {
    const from = match[1];
    const to = match[2];
    if (from && to) pairs.push({ from, to });
  }
  return pairs;
}
