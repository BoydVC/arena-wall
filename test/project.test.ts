import { describe, expect, it } from "vitest";
import { flagLabel, reduce, emptyState, type Idea } from "../core/model.ts";
import { project } from "../core/project.ts";

const NINETY = 90 * 60 * 1000;
const at = "2026-11-04T10:00:00.000Z";

function idea(): Idea {
  return { id: "card", title: "Card", signals: [{ kind: "manual", note: "note" }], lane: "idea", createdAt: at };
}

describe("project(state, now)", () => {
  it("stales a seat only when the given clock is past 90 minutes", () => {
    let state = reduce(emptyState(), { t: "idea.added", idea: idea() });
    state = reduce(state, {
      t: "spec.linted",
      ideaId: "card",
      report: { path: "card.md", ok: true, missing: [], warnings: [], acceptanceCount: 1 },
    });
    state = reduce(state, {
      t: "seat.updated",
      seat: {
        id: "card:model-first",
        ideaId: "card",
        style: "model-first",
        branch: "arena/model-first",
        headSha: "abc1234",
        tests: { passed: 4, failed: 0 },
        diffLines: 12,
        verdict: "pass",
        updatedAt: at,
      },
    });

    const exact = new Date(Date.parse(at) + NINETY).toISOString();
    const over = new Date(Date.parse(at) + NINETY + 1).toISOString();
    expect(project(state, exact).flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
    expect(project(state, over).flags).toContainEqual({ ideaId: "card", reason: "stale-seat" });
    const rewound = project(project(state, over), at);
    expect(rewound.flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
  });

  it("derives awaiting-ok from the draft lane and clears it when human-ok is green", () => {
    let state = reduce(emptyState(), { t: "idea.added", idea: idea() });
    state = reduce(state, {
      t: "spec.linted",
      ideaId: "card",
      report: { path: "card.md", ok: true, missing: [], warnings: [], acceptanceCount: 1 },
    });
    state = reduce(state, {
      t: "seat.updated",
      seat: {
        id: "card:model-first",
        ideaId: "card",
        style: "model-first",
        branch: "arena/model-first",
        headSha: "abc1234",
        tests: { passed: 4, failed: 0 },
        diffLines: 12,
        verdict: "pass",
        updatedAt: at,
      },
    });
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "card",
        branch: "arena/winner",
        verdict: "pending",
        gates: [{ name: "human-ok", status: "red" }],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "card", number: 4, url: "https://example.test/4", draft: true, merged: false, base: "main" },
    });
    expect(state.ideas.card?.lane).toBe("draft_pr");
    expect(state.flags.some((flag) => flag.reason === "awaiting-ok")).toBe(false);

    const waiting = project(state, at);
    expect(waiting.flags).toContainEqual({ ideaId: "card", reason: "awaiting-ok" });
    expect(flagLabel("awaiting-ok")).toBe("Awaiting OK");

    const cleared = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "card",
        branch: "arena/winner",
        verdict: "pass",
        gates: [{ name: "human-ok", status: "green" }],
      },
    });
    expect(project(cleared, at).flags.some((flag) => flag.reason === "awaiting-ok")).toBe(false);
  });
});
