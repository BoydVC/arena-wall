import type { GateStatus, PipelineEvent, Seat, SeatStyle } from "../../core/types.ts";

const STYLES: readonly SeatStyle[] = ["types-first", "model-first", "experience-first"];

export interface GithubBranch {
  name: string;
  commit: { sha: string };
}

export interface GithubPull {
  number: number;
  html_url: string;
  draft: boolean;
  merged_at: string | null;
  base: { ref: string };
  head: { ref: string; sha: string };
}

export interface GithubCheck {
  name: string;
  conclusion: string | null;
  status: string;
}

export interface GithubSnapshot {
  branches: GithubBranch[];
  pulls: GithubPull[];
  checks: Record<string, GithubCheck[]>;
}

/**
 * Read-only forge adapter. Every request uses GET. Callers opt in with
 * ARENA_SOURCE=github plus a token. The default server path never constructs this.
 */
export async function fetchGithubSnapshot(opts: {
  repo: string;
  token: string;
  get?: (url: string, token: string) => Promise<unknown>;
}): Promise<GithubSnapshot> {
  if (!opts.token) throw new Error("github adapter requires a token");
  const get = opts.get ?? getJson;
  const repo = encodeRepo(opts.repo);
  const branches = (await get(`https://api.github.com/repos/${repo}/branches?per_page=100`, opts.token)) as GithubBranch[];
  const pulls = (await get(`https://api.github.com/repos/${repo}/pulls?state=all&per_page=100`, opts.token)) as GithubPull[];
  const checks: Record<string, GithubCheck[]> = {};
  for (const branch of branches) {
    if (!branch.name.startsWith("arena/")) continue;
    const sha = branch.commit.sha;
    const payload = (await get(
      `https://api.github.com/repos/${repo}/commits/${sha}/check-runs`,
      opts.token,
    )) as { check_runs?: GithubCheck[] };
    checks[sha] = payload.check_runs ?? [];
  }
  return { branches, pulls, checks };
}

export async function loadGithubEvents(opts: {
  repo: string;
  token: string;
  now?: string;
  get?: (url: string, token: string) => Promise<unknown>;
}): Promise<PipelineEvent[]> {
  const snapshot = await fetchGithubSnapshot(opts);
  return eventsFromGithub(snapshot, opts.now ?? new Date().toISOString());
}

export function eventsFromGithub(snapshot: GithubSnapshot, nowIso: string): PipelineEvent[] {
  const events: PipelineEvent[] = [];
  const seenIdeas = new Set<string>();

  for (const branch of snapshot.branches) {
    const parsed = parseArenaBranch(branch.name);
    if (!parsed) continue;
    if (!seenIdeas.has(parsed.ideaId)) {
      seenIdeas.add(parsed.ideaId);
      events.push({
        t: "idea.added",
        idea: {
          id: parsed.ideaId,
          title: titleFromId(parsed.ideaId),
          signals: [{ kind: "manual", note: "Imported from a read-only branch list." }],
          lane: "idea",
          createdAt: nowIso,
        },
      });
    }
    if (parsed.style) {
      const seat: Seat = {
        id: `${parsed.ideaId}:${parsed.style}`,
        ideaId: parsed.ideaId,
        style: parsed.style,
        branch: branch.name,
        headSha: branch.commit.sha,
        tests: testsFromChecks(snapshot.checks[branch.commit.sha] ?? []),
        diffLines: 0,
        verdict: "pending",
        updatedAt: nowIso,
      };
      events.push({ t: "seat.updated", seat });
    }
  }

  for (const pull of snapshot.pulls) {
    const parsed = parseArenaBranch(pull.head.ref);
    if (!parsed) continue;
    events.push({
      t: "pr.updated",
      pr: {
        ideaId: parsed.ideaId,
        number: pull.number,
        url: pull.html_url,
        draft: pull.draft,
        merged: Boolean(pull.merged_at),
        base: pull.base.ref,
      },
    });
  }

  return events;
}

export async function getJson(url: string, token: string): Promise<unknown> {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!response.ok) {
    throw new Error(`github GET failed (${response.status})`);
  }
  return response.json() as Promise<unknown>;
}

function encodeRepo(repo: string): string {
  const [owner, name] = repo.split("/");
  if (!owner || !name || repo.split("/").length !== 2) {
    throw new Error("repo must look like owner/name");
  }
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function parseArenaBranch(name: string): { ideaId: string; style: SeatStyle | null } | null {
  if (!name.startsWith("arena/")) return null;
  const parts = name.split("/");
  if (parts.length === 3 && parts[1] && isStyle(parts[2] ?? "")) {
    return { ideaId: parts[1], style: parts[2] as SeatStyle };
  }
  if (parts.length === 2 && parts[1] && isStyle(parts[1])) {
    return { ideaId: "imported", style: parts[1] as SeatStyle };
  }
  return null;
}

function isStyle(value: string): value is SeatStyle {
  return (STYLES as readonly string[]).includes(value);
}

function titleFromId(id: string): string {
  return id
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function testsFromChecks(checks: GithubCheck[]): { passed: number; failed: number } {
  let passed = 0;
  let failed = 0;
  for (const check of checks) {
    if (check.status !== "completed") continue;
    if (check.conclusion === "success") passed += 1;
    else if (check.conclusion === "failure") failed += 1;
  }
  return { passed, failed };
}

export function gateFromConclusion(conclusion: string | null): GateStatus {
  if (conclusion === "success") return "green";
  if (conclusion === "neutral" || conclusion === "skipped") return "amber";
  return "red";
}
