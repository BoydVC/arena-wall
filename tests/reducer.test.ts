import { describe, expect, it } from "vitest";
import { emptyState, reduce, type PipelineEvent, type Seat } from "../core/model.js";
import { fold } from "../core/replay.js";
import { makeIdea, makeSeat, NOW } from "./helpers.js";

function lint(ok: boolean): PipelineEvent {
  return {
    t: "spec.linted",
    ideaId: "ridge-owl",
    report: {
      path: "specs/harbor-mint.md",
      ok,
      missing: ok ? [] : ["acceptance tests", "seat briefs"],
      warnings: [],
      acceptanceCount: ok ? 3 : 0,
    },
  };
}

describe("reducer", () => {
  it("rejects an idea that does not enter at the idea lane", () => {
    const event: PipelineEvent = { t: "idea.added", idea: makeIdea("ridge-owl", "seats") };
    const next = reduce(emptyState(), event);
    expect(next.ideas).toEqual({});
    expect(next.flags).toEqual([{ ideaId: "ridge-owl", reason: "illegal-transition" }]);
  });

  it("rejects a second add for the same idea", () => {
    const first = reduce(emptyState(), { t: "idea.added", idea: makeIdea() });
    const next = reduce(first, { t: "idea.added", idea: makeIdea() });
    expect(next.ideas["ridge-owl"]?.title).toBe("Ridge Owl");
    expect(next.flags).toContainEqual({ ideaId: "ridge-owl", reason: "illegal-transition" });
  });

  it("moves a failing spec into the spec lane and names the gap", () => {
    const next = fold([{ t: "idea.added", idea: makeIdea() }, lint(false)]);
    expect(next.ideas["ridge-owl"]?.lane).toBe("spec");
    expect(next.reports["ridge-owl"]?.missing).toEqual(["acceptance tests", "seat briefs"]);
    expect(next.flags).toContainEqual({ ideaId: "ridge-owl", reason: "spec-gate" });
  });

  it("slides a passing spec into seats", () => {
    const next = fold([{ t: "idea.added", idea: makeIdea() }, lint(true)]);
    expect(next.ideas["ridge-owl"]?.lane).toBe("seats");
    expect(next.flags.some((flag) => flag.reason === "spec-gate")).toBe(false);
  });

  it("records a seat without pulling an idea card forward", () => {
    const seated = fold([
      { t: "idea.added", idea: makeIdea() },
      { t: "seat.updated", seat: makeSeat() },
    ]);
    expect(seated.ideas["ridge-owl"]?.lane).toBe("idea");
    expect(seated.seats["ridge-owl:types-first"]?.verdict).toBe("pending");
  });

  it("moves to verify only from seats when the verifier is no longer pending", () => {
    const base = fold([{ t: "idea.added", idea: makeIdea() }, lint(true)]);
    const pending = reduce(base, {
      t: "verifier.updated",
      v: { ideaId: "ridge-owl", branch: "arena/winner", verdict: "pending", gates: [] },
    });
    expect(pending.ideas["ridge-owl"]?.lane).toBe("seats");
    const passed = reduce(base, {
      t: "verifier.updated",
      v: {
        ideaId: "ridge-owl",
        branch: "arena/winner",
        verdict: "pass",
        gates: [{ name: "human-ok", status: "amber" }],
      },
    });
    expect(passed.ideas["ridge-owl"]?.lane).toBe("verify");
  });

  it("parks a draft behind the waiting badge when human-ok is amber", () => {
    let state = fold([{ t: "idea.added", idea: makeIdea() }, lint(true)]);
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "ridge-owl",
        branch: "arena/winner",
        verdict: "pass",
        gates: [{ name: "human-ok", status: "amber" }],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: {
        ideaId: "ridge-owl",
        number: 7,
        url: "https://example.com/arena/pull/7",
        base: "main",
        draft: true,
        merged: false,
      },
    });
    expect(state.ideas["ridge-owl"]?.lane).toBe("draft_pr");
    expect(state.flags).toContainEqual({ ideaId: "ridge-owl", reason: "awaiting-ok" });
  });

  it("does not store a merged pull or change lanes without a green human-ok gate", () => {
    let state = fold([{ t: "idea.added", idea: makeIdea() }, lint(true)]);
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "ridge-owl",
        branch: "arena/winner",
        verdict: "pass",
        gates: [{ name: "tests", status: "green" }, { name: "human-ok", status: "red" }],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: {
        ideaId: "ridge-owl",
        number: 8,
        url: "https://example.com/arena/pull/8",
        base: "main",
        draft: true,
        merged: false,
      },
    });
    const blocked = reduce(state, {
      t: "pr.updated",
      pr: {
        ideaId: "ridge-owl",
        number: 8,
        url: "https://example.com/arena/pull/8",
        base: "main",
        draft: false,
        merged: true,
      },
    });
    expect(blocked.ideas["ridge-owl"]?.lane).toBe("draft_pr");
    expect(blocked.prs["ridge-owl"]?.merged).toBe(false);
    expect(blocked.flags).toContainEqual({ ideaId: "ridge-owl", reason: "illegal-transition" });
  });

  it("reaches merged only after human-ok is green", () => {
    let state = fold([{ t: "idea.added", idea: makeIdea() }, lint(true)]);
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "ridge-owl",
        branch: "arena/winner",
        verdict: "pass",
        gates: [{ name: "human-ok", status: "green" }],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: {
        ideaId: "ridge-owl",
        number: 9,
        url: "https://example.com/arena/pull/9",
        base: "main",
        draft: true,
        merged: false,
      },
    });
    expect(state.flags.some((flag) => flag.reason === "awaiting-ok")).toBe(false);
    state = reduce(state, {
      t: "pr.updated",
      pr: {
        ideaId: "ridge-owl",
        number: 9,
        url: "https://example.com/arena/pull/9",
        base: "main",
        draft: false,
        merged: true,
      },
    });
    expect(state.ideas["ridge-owl"]?.lane).toBe("merged");
    expect(state.prs["ridge-owl"]?.merged).toBe(true);
  });

  it("does not mutate the previous state or the event", () => {
    const start = emptyState();
    const event: PipelineEvent = { t: "idea.added", idea: makeIdea() };
    const frozenStart = structuredClone(start);
    const frozenEvent = structuredClone(event);
    Object.freeze(event.idea);
    Object.freeze(event);
    const next = reduce(start, event);
    expect(start).toEqual(frozenStart);
    expect(event).toEqual(frozenEvent);
    expect(next).not.toBe(start);
    next.ideas["ridge-owl"]?.signals[0]?.note && expect(event.idea.signals[0]?.note).toBe("Hand typed note");
  });

  it("keeps a winner seat's commit when the seat is stored", () => {
    const winner: Seat = makeSeat("experience-first", "winner");
    const next = fold([
      { t: "idea.added", idea: makeIdea() },
      { t: "seat.updated", seat: winner },
    ]);
    const stored = next.seats[winner.id];
    expect(stored?.verdict).toBe("winner");
    if (stored?.verdict === "winner") expect(stored.headSha).toBe("abc1234");
  });

  it("ignores a seat for an unknown idea", () => {
    const next = reduce(emptyState(), { t: "seat.updated", seat: makeSeat() });
    expect(next.seats).toEqual({});
    expect(next.flags).toEqual([{ ideaId: "ridge-owl", reason: "illegal-transition" }]);
  });

  it("property: the same events always fold to the same state", () => {
    const titles = ["Ridge Owl", "Comet Lab", "Harbor Mint", "North Glass"];
    for (let seed = 1; seed <= 25; seed += 1) {
      let value = seed >>> 0;
      const nextRand = (): number => {
        value = (Math.imul(1664525, value) + 1013904223) >>> 0;
        return value / 4294967296;
      };
      const events: PipelineEvent[] = [];
      const count = 4 + Math.floor(nextRand() * 6);
      for (let index = 0; index < count; index += 1) {
        const id = `idea-${index}`;
        const title = titles[Math.floor(nextRand() * titles.length)] ?? "Ridge Owl";
        events.push({
          t: "idea.added",
          idea: { id, title, signals: [], lane: "idea", createdAt: NOW },
        });
        if (nextRand() > 0.4) {
          events.push({
            t: "spec.linted",
            ideaId: id,
            report: {
              path: "specs/harbor-mint.md",
              ok: nextRand() > 0.3,
              missing: [],
              warnings: [],
              acceptanceCount: 3,
            },
          });
        }
      }
      const once = fold(events);
      const twice = fold(events.map((event) => structuredClone(event)));
      expect(twice).toEqual(once);
      const mid = Math.floor(events.length / 2);
      expect(fold(events.slice(mid), fold(events.slice(0, mid)))).toEqual(once);
    }
  });
});
