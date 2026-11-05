/**
 * Opt-in, read-only GitHub adapter.
 * Every request uses HTTP GET. This process never merges, comments, or opens a pull request.
 */

import type { Gate, PipelineEvent, SeatStyle } from "../../core/model";

export interface FetchLike {
  (url: string, init: { method: "GET"; headers: Record<string, string> }): Promise<{
    ok: boolean;
    status: number;
    json: () => Promise<unknown>;
  }>;
}

export function githubEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.ARENA_SOURCE === "github" && Boolean(env.GITHUB_TOKEN);
}

function styleOf(branch: string): SeatStyle | null {
  if (branch.endsWith("/types-first") || branch === "types-first") return "types-first";
  if (branch.endsWith("/model-first") || branch === "model-first") return "model-first";
  if (branch.endsWith("/experience-first") || branch === "experience-first") return "experience-first";
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord).filter((row): row is Record<string, unknown> => row !== null) : [];
}

async function getJson(fetchImpl: FetchLike, url: string, headers: Record<string, string>): Promise<unknown> {
  const response = await fetchImpl(url, { method: "GET", headers });
  if (!response.ok) throw new Error(`GitHub GET failed (${response.status})`);
  return response.json();
}

function slug(title: string, fallback: string): string {
  const cleaned = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 48) || fallback;
}

/**
 * Read arena branches, pull requests, and check runs.
 * `human-ok` is always red here. Only a fixture may turn that gate green.
 */
export async function readGithubArena(options: {
  repo: string;
  token: string;
  fetchImpl?: FetchLike;
  now?: string;
}): Promise<PipelineEvent[]> {
  const fetchImpl = options.fetchImpl ?? ((url, init) => fetch(url, init));
  const headers = {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${options.token}`,
    "User-Agent": "arena-wall",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const base = `https://api.github.com/repos/${options.repo}`;
  const now = options.now ?? new Date().toISOString();
  const branches = asArray(await getJson(fetchImpl, `${base}/branches?per_page=100`, headers));
  const pulls = asArray(await getJson(fetchImpl, `${base}/pulls?state=all&per_page=100`, headers));
  const events: PipelineEvent[] = [];
  const seenIdeas = new Set<string>();

  for (const pull of pulls) {
    const head = asRecord(pull.head);
    const ref = typeof head?.ref === "string" ? head.ref : "";
    if (!ref.startsWith("arena/")) continue;
    const title = typeof pull.title === "string" ? pull.title : ref;
    const number = typeof pull.number === "number" ? pull.number : 0;
    const ideaId = slug(title, `pr-${number}`);
    if (!seenIdeas.has(ideaId)) {
      seenIdeas.add(ideaId);
      events.push({
        t: "idea.added",
        idea: {
          id: ideaId,
          title,
          signals: [{ kind: "bookmark", note: ref, url: `https://example.test/${ideaId}` }],
          lane: "idea",
          createdAt: typeof pull.created_at === "string" ? pull.created_at : now,
        },
      });
    }
    const sha = typeof head?.sha === "string" ? head.sha : "";
    const style = styleOf(ref);
    if (style && sha) {
      const checks = asRecord(await getJson(fetchImpl, `${base}/commits/${sha}/check-runs?per_page=100`, headers));
      const runs = asArray(checks?.check_runs);
      let passed = 0;
      let failed = 0;
      for (const run of runs) {
        if (run.conclusion === "success") passed += 1;
        else if (run.conclusion === "failure") failed += 1;
      }
      events.push({
        t: "seat.updated",
        seat: {
          id: `${ideaId}-${style}`,
          ideaId,
          style,
          branch: ref,
          headSha: sha.slice(0, 7),
          tests: { passed, failed },
          diffLines: 0,
          verdict: failed > 0 ? "fail" : passed > 0 ? "pass" : "pending",
          updatedAt: now,
        },
      });
      const gates: Gate[] = [
        { name: "tests", status: failed > 0 ? "red" : passed > 0 ? "green" : "amber" },
        { name: "lint", status: runs.some((run) => String(run.name ?? "").toLowerCase().includes("lint") && run.conclusion === "success") ? "green" : "amber" },
        { name: "demo-gif", status: "amber" },
        { name: "privacy", status: "amber" },
        { name: "human-ok", status: "red" },
      ];
      events.push({
        t: "verifier.updated",
        v: { ideaId, branch: "arena/winner", gates, verdict: "pending" },
      });
    }
    events.push({
      t: "pr.updated",
      pr: {
        ideaId,
        number,
        url: typeof pull.html_url === "string" ? pull.html_url : `https://example.test/pr/${number}`,
        draft: pull.draft === true,
        merged: pull.merged_at !== null && pull.merged_at !== undefined,
        base: "main",
      },
    });
  }

  for (const branch of branches) {
    const name = typeof branch.name === "string" ? branch.name : "";
    if (!name.startsWith("arena/") || name === "arena/winner") continue;
    if (pulls.some((pull) => asRecord(pull.head)?.ref === name)) continue;
    const style = styleOf(name);
    if (!style) continue;
    const ideaId = slug(name, name);
    if (!seenIdeas.has(ideaId)) {
      seenIdeas.add(ideaId);
      events.push({
        t: "idea.added",
        idea: {
          id: ideaId,
          title: name,
          signals: [{ kind: "manual", note: name }],
          lane: "idea",
          createdAt: now,
        },
      });
    }
  }

  return events;
}
