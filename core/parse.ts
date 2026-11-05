import {
  GATE_NAMES,
  GATE_STATUSES,
  LANES,
  OPEN_VERDICTS,
  SEAT_STYLES,
  SIGNAL_KINDS,
  VERIFIER_BRANCH,
  type Gate,
  type GateName,
  type GateStatus,
  type Idea,
  type Lane,
  type LogEntry,
  type OpenVerdict,
  type PipelineEvent,
  type PullRequest,
  type Seat,
  type SeatStyle,
  type Signal,
  type SignalKind,
  type SpecReport,
  type Verdict,
  type Verifier,
} from "./model.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function whole(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function parseSignal(value: unknown): Signal | undefined {
  if (!isRecord(value) || !isString(value.note)) return undefined;
  const kind = oneOf<SignalKind>(value.kind, SIGNAL_KINDS);
  if (!kind) return undefined;
  if (value.url === undefined) return { kind, note: value.note };
  if (!isString(value.url)) return undefined;
  return { kind, note: value.note, url: value.url };
}

function parseIdea(value: unknown): Idea | undefined {
  if (!isRecord(value) || !isString(value.id) || !isString(value.title) || !isString(value.createdAt)) {
    return undefined;
  }
  const lane = oneOf<Lane>(value.lane, LANES);
  if (!lane || !Array.isArray(value.signals)) return undefined;
  const signals: Signal[] = [];
  for (const item of value.signals) {
    const signal = parseSignal(item);
    if (!signal) return undefined;
    signals.push(signal);
  }
  const idea: Idea = { id: value.id, title: value.title, signals, lane, createdAt: value.createdAt };
  if (value.specPath === undefined) return idea;
  if (!isString(value.specPath)) return undefined;
  return { ...idea, specPath: value.specPath };
}

function parseReport(value: unknown): SpecReport | undefined {
  if (!isRecord(value) || typeof value.path !== "string" || typeof value.ok !== "boolean") return undefined;
  if (!Array.isArray(value.missing) || !Array.isArray(value.warnings)) return undefined;
  if (!value.missing.every((item) => typeof item === "string")) return undefined;
  if (!value.warnings.every((item) => typeof item === "string")) return undefined;
  const acceptanceCount = whole(value.acceptanceCount);
  if (acceptanceCount === undefined) return undefined;
  return {
    path: value.path,
    ok: value.ok,
    missing: value.missing,
    warnings: value.warnings,
    acceptanceCount,
  };
}

function parseSeat(value: unknown): Seat | undefined {
  if (!isRecord(value)) return undefined;
  const id = value.id;
  const ideaId = value.ideaId;
  const branch = value.branch;
  const updatedAt = value.updatedAt;
  const style = oneOf<SeatStyle>(value.style, SEAT_STYLES);
  const diffLines = whole(value.diffLines);
  if (!isString(id) || !isString(ideaId) || !isString(branch) || !isString(updatedAt)) return undefined;
  if (!style || diffLines === undefined || !isRecord(value.tests)) return undefined;
  const passed = whole(value.tests.passed);
  const failed = whole(value.tests.failed);
  if (passed === undefined || failed === undefined) return undefined;
  const tests = { passed, failed };
  const base = { id, ideaId, style, branch, tests, diffLines, updatedAt };
  const head = value.headSha;
  if (value.verdict === "winner") {
    if (!isString(head)) return undefined;
    return { ...base, verdict: "winner", headSha: head };
  }
  const verdict = oneOf<OpenVerdict>(value.verdict, OPEN_VERDICTS);
  if (!verdict) return undefined;
  if (head === undefined) return { ...base, verdict };
  if (!isString(head)) return undefined;
  return { ...base, verdict, headSha: head };
}

function parseGate(value: unknown): Gate | undefined {
  if (!isRecord(value)) return undefined;
  const name = oneOf<GateName>(value.name, GATE_NAMES);
  const status = oneOf<GateStatus>(value.status, GATE_STATUSES);
  if (!name || !status) return undefined;
  return { name, status };
}

function parseVerdict(value: unknown): Verdict | undefined {
  if (value === "winner") return "winner";
  return oneOf<OpenVerdict>(value, OPEN_VERDICTS);
}

function parseVerifier(value: unknown): Verifier | undefined {
  if (!isRecord(value) || !isString(value.ideaId) || value.branch !== VERIFIER_BRANCH) return undefined;
  const verdict = parseVerdict(value.verdict);
  if (!verdict || !Array.isArray(value.gates)) return undefined;
  const gates: Gate[] = [];
  for (const item of value.gates) {
    const gate = parseGate(item);
    if (!gate) return undefined;
    gates.push(gate);
  }
  return { ideaId: value.ideaId, branch: VERIFIER_BRANCH, gates, verdict };
}

function parsePull(value: unknown): PullRequest | undefined {
  if (!isRecord(value)) return undefined;
  const number = whole(value.number);
  if (!isString(value.ideaId) || number === undefined || number < 1) return undefined;
  if (!isString(value.url) || !isString(value.base)) return undefined;
  if (typeof value.draft !== "boolean" || typeof value.merged !== "boolean") return undefined;
  const base = { ideaId: value.ideaId, number, url: value.url, base: value.base };
  if (value.merged && value.draft) return undefined;
  if (value.merged) return { ...base, draft: false, merged: true };
  if (value.draft) return { ...base, draft: true, merged: false };
  return { ...base, draft: false, merged: false };
}

export function parseEvent(value: unknown): PipelineEvent | null {
  if (!isRecord(value) || typeof value.t !== "string") return null;
  switch (value.t) {
    case "idea.added": {
      const idea = parseIdea(value.idea);
      return idea ? { t: "idea.added", idea } : null;
    }
    case "spec.linted": {
      const report = parseReport(value.report);
      if (!isString(value.ideaId) || !report) return null;
      return { t: "spec.linted", ideaId: value.ideaId, report };
    }
    case "seat.updated": {
      const seat = parseSeat(value.seat);
      return seat ? { t: "seat.updated", seat } : null;
    }
    case "verifier.updated": {
      const verifier = parseVerifier(value.v);
      return verifier ? { t: "verifier.updated", v: verifier } : null;
    }
    case "pr.updated": {
      const pr = parsePull(value.pr);
      return pr ? { t: "pr.updated", pr } : null;
    }
    default:
      return null;
  }
}

export function parseLogEntry(value: unknown): LogEntry | null {
  if (!isRecord(value) || !isString(value.at)) return null;
  const event = parseEvent(value.event);
  if (!event) return null;
  return { at: value.at, event };
}

export function parseSeatRecord(value: unknown): Seat | null {
  return parseSeat(value) ?? null;
}
