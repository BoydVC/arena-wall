import { lintSpec } from "../core/specLint.js";
import {
  GATE_NAMES,
  VERIFIER_BRANCH,
  type Gate,
  type GateName,
  type GateStatus,
  type Idea,
  type PipelineEvent,
  type PullRequest,
  type Seat,
  type SeatStyle,
  type SpecReport,
  type Verifier,
} from "../core/model.js";

/**
 * Read-only GitHub adapter.
 * Every request uses HTTP GET. Opt in with ARENA_WALL_GITHUB=1 plus
 * GITHUB_TOKEN and ARENA_WALL_REPO. This module never merges and never
 * sends a request body.
 */
export const GITHUB_METHOD = "GET" as const;

export function githubEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARENA_WALL_GITHUB === "1" && Boolean(env.GITHUB_TOKEN) && Boolean(env.ARENA_WALL_REPO);
}

export interface NormalizedBranch {
  readonly name: string;
  readonly sha: string;
}

export interface NormalizedPull {
  readonly number: number;
  readonly title: string;
  readonly url: string;
  readonly draft: boolean;
  readonly merged: boolean;
  readonly base: string;
}

export interface NormalizedCheck {
  readonly name: string;
  readonly conclusion: string | null;
}

export interface NormalizedGitHub {
  readonly repo: string;
  readonly specMarkdown?: string;
  readonly branches: readonly NormalizedBranch[];
  readonly pulls: readonly NormalizedPull[];
  readonly checks: readonly NormalizedCheck[];
}

export async function githubGet(
  pathname: string,
  token: string,
  fetcher: typeof fetch = fetch,
): Promise<unknown> {
  const response = await fetcher(`https://api.github.com${pathname}`, {
    method: GITHUB_METHOD,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "arena-wall",
    },
  });
  if (!response.ok) throw new Error(`GitHub GET failed (${response.status}) for ${pathname}`);
  return response.json() as Promise<unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeGitHub(repo: string, raw: {
  branches: unknown;
  pulls: unknown;
  checks: unknown;
  spec?: unknown;
}): NormalizedGitHub {
  const branches: NormalizedBranch[] = [];
  for (const item of asArray(raw.branches)) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const commit = isRecord(item.commit) ? item.commit : undefined;
    const sha = typeof commit?.sha === "string" ? commit.sha : "";
    if (!sha) continue;
    branches.push({ name: item.name, sha });
  }
  const pulls: NormalizedPull[] = [];
  for (const item of asArray(raw.pulls)) {
    if (!isRecord(item) || typeof item.number !== "number" || typeof item.title !== "string") continue;
    const base = isRecord(item.base) && typeof item.base.ref === "string" ? item.base.ref : "main";
    const url = typeof item.html_url === "string" ? item.html_url : `https://example.com/arena/pull/${item.number}`;
    pulls.push({
      number: item.number,
      title: item.title,
      url,
      draft: item.draft === true,
      merged: item.merged_at != null && item.merged_at !== false,
      base,
    });
  }
  const checks: NormalizedCheck[] = [];
  const checkBag = isRecord(raw.checks) ? raw.checks.check_runs : raw.checks;
  for (const item of asArray(checkBag)) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    const conclusion = typeof item.conclusion === "string" ? item.conclusion : null;
    checks.push({ name: item.name, conclusion });
  }
  let specMarkdown: string | undefined;
  if (isRecord(raw.spec) && raw.spec.encoding === "base64" && typeof raw.spec.content === "string") {
    specMarkdown = Buffer.from(raw.spec.content, "base64").toString("utf8");
  }
  return specMarkdown === undefined
    ? { repo, branches, pulls, checks }
    : { repo, branches, pulls, checks, specMarkdown };
}

function repoIdeaId(repo: string): string {
  const name = repo.split("/").pop() ?? repo;
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "repo";
}

function styleOf(branch: string): SeatStyle | undefined {
  if (branch === "arena/types-first") return "types-first";
  if (branch === "arena/model-first") return "model-first";
  if (branch === "arena/experience-first") return "experience-first";
  return undefined;
}

function gateNameOf(check: string): GateName | undefined {
  const name = check.toLowerCase();
  if (name.includes("human")) return "human-ok";
  if (name.includes("privacy") || name.includes("deny")) return "privacy";
  if (name.includes("gif") || name.includes("demo")) return "demo-gif";
  if (name.includes("lint")) return "lint";
  if (name.includes("test")) return "tests";
  return undefined;
}

function statusOf(conclusion: string | null): GateStatus {
  if (conclusion === "success") return "green";
  if (conclusion === "failure" || conclusion === "cancelled" || conclusion === "timed_out") return "red";
  return "amber";
}

function rank(status: GateStatus): number {
  if (status === "red") return 2;
  if (status === "amber") return 1;
  return 0;
}

function gatesFrom(checks: readonly NormalizedCheck[]): Gate[] {
  const picked = new Map<GateName, GateStatus>();
  for (const check of checks) {
    const name = gateNameOf(check.name);
    if (!name) continue;
    const status = statusOf(check.conclusion);
    const prev = picked.get(name);
    if (!prev || rank(status) > rank(prev)) picked.set(name, status);
  }
  return GATE_NAMES.map((name) => ({ name, status: picked.get(name) ?? "amber" }));
}

function toPull(ideaId: string, pull: NormalizedPull, merged: boolean): PullRequest | undefined {
  if (!pull.url.startsWith("https://")) return undefined;
  if (merged) {
    return { ideaId, number: pull.number, url: pull.url, base: pull.base, draft: false, merged: true };
  }
  if (pull.draft) {
    return { ideaId, number: pull.number, url: pull.url, base: pull.base, draft: true, merged: false };
  }
  return { ideaId, number: pull.number, url: pull.url, base: pull.base, draft: false, merged: false };
}

export function eventsFromGitHub(snapshot: NormalizedGitHub, nowIso: string): PipelineEvent[] {
  const ideaId = repoIdeaId(snapshot.repo);
  const title = snapshot.pulls[0]?.title || snapshot.repo;
  const events: PipelineEvent[] = [];
  const idea: Idea = {
    id: ideaId,
    title,
    signals: [{ kind: "manual", note: "Observed from a read-only repository listing" }],
    lane: "idea",
    createdAt: nowIso,
  };
  events.push({ t: "idea.added", idea });

  let report: SpecReport | undefined;
  if (snapshot.specMarkdown !== undefined) {
    report = lintSpec(snapshot.specMarkdown, { path: "SPEC.md" });
    events.push({ t: "spec.linted", ideaId, report });
  }

  for (const branch of snapshot.branches) {
    const style = styleOf(branch.name);
    if (!style) continue;
    const seat: Seat = {
      id: `${ideaId}:${style}`,
      ideaId,
      style,
      branch: branch.name,
      headSha: branch.sha,
      tests: { passed: 0, failed: 0 },
      diffLines: 0,
      verdict: "pending",
      updatedAt: nowIso,
    };
    events.push({ t: "seat.updated", seat });
  }

  const gateList = gatesFrom(snapshot.checks);
  const tests = gateList.find((gate) => gate.name === "tests");
  const lint = gateList.find((gate) => gate.name === "lint");
  const verdict = tests?.status === "red" || lint?.status === "red" ? "fail" : tests?.status === "green" ? "pass" : "pending";
  const verifier: Verifier = { ideaId, branch: VERIFIER_BRANCH, gates: gateList, verdict };
  events.push({ t: "verifier.updated", v: verifier });

  const pull = snapshot.pulls[0];
  if (pull) {
    const open = toPull(ideaId, pull, false);
    if (open) events.push({ t: "pr.updated", pr: open });
    const human = gateList.find((gate) => gate.name === "human-ok")?.status === "green";
    if (pull.merged && human && report?.ok) {
      const closed = toPull(ideaId, pull, true);
      if (closed) events.push({ t: "pr.updated", pr: closed });
    }
  }
  return events;
}

export async function loadGitHubEvents(
  repo: string,
  token: string,
  nowIso: string,
  fetcher: typeof fetch = fetch,
): Promise<PipelineEvent[]> {
  const [branches, pulls, spec] = await Promise.all([
    githubGet(`/repos/${repo}/branches?per_page=100`, token, fetcher),
    githubGet(`/repos/${repo}/pulls?state=all&per_page=30`, token, fetcher),
    githubGet(`/repos/${repo}/contents/SPEC.md`, token, fetcher).catch(() => undefined),
  ]);
  const branchList = asArray(branches);
  const shas = branchList
    .map((item) => (isRecord(item) && isRecord(item.commit) && typeof item.commit.sha === "string" ? item.commit.sha : ""))
    .filter((sha) => sha.length > 0)
    .slice(0, 12);
  const checkBags = await Promise.all(
    shas.map((sha) => githubGet(`/repos/${repo}/commits/${sha}/check-runs`, token, fetcher).catch(() => ({ check_runs: [] }))),
  );
  const checks = checkBags.flatMap((bag) => (isRecord(bag) ? asArray(bag.check_runs) : []));
  return eventsFromGitHub(normalizeGitHub(repo, { branches, pulls, checks, spec }), nowIso);
}
