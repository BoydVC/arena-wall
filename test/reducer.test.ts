import { describe, expect, it } from "vitest";
import { emptyState, foldEvents, reduce, type Idea, type PipelineEvent, type PipelineState } from "../core/model.ts";
import { humanIsOk } from "../core/statechart.ts";
import { buildFixtureLog } from "../sources/fixtures/build.ts";

const at = "2026-11-04T12:00:00.000Z";

function idea(id = "card", lane: Idea["lane"] = "idea"): Idea {
  return { id, title: id, signals: [{ kind: "manual", note: "note" }], lane, createdAt: at };
}

function passSpec(ideaId = "card") {
  return {
    t: "spec.linted" as const,
    ideaId,
    report: { path: `${ideaId}.md`, ok: true, missing: [], warnings: [], acceptanceCount: 1 },
  };
}

function seat(ideaId = "card", style: "types-first" | "model-first" | "experience-first" = "model-first") {
  return {
    t: "seat.updated" as const,
    seat: {
      id: `${ideaId}:${style}`,
      ideaId,
      style,
      branch: `arena/${style}`,
      headSha: "abc1234",
      tests: { passed: 4, failed: 0 },
      diffLines: 10,
      verdict: "pass" as const,
      updatedAt: at,
    },
  };
}

describe("reducer", () => {
  it("is pure across the fixture log", () => {
    const events = buildFixtureLog().map((entry) => entry.event);
    const start = emptyState();
    const once = foldEvents(events, start);
    expect(start).toEqual(emptyState());
    const twice = events.reduce((state, event) => {
      const before = structuredClone(state);
      const next = reduce(state, event);
      expect(state).toEqual(before);
      return next;
    }, emptyState());
    expect(twice).toEqual(once);
    expect(foldEvents(events)).toEqual(once);
  });

  it("keeps a repeated idea from replacing the first one", () => {
    let state = reduce(emptyState(), { t: "idea.added", idea: idea("card") });
    state = reduce(state, { t: "idea.added", idea: { ...idea("card"), title: "Other" } });
    expect(state.ideas.card?.title).toBe("card");
    expect(state.flags.map((flag) => flag.reason)).toEqual(["illegal-transition"]);
  });

  it("birth is the idea lane even if the payload names another", () => {
    const state = reduce(emptyState(), { t: "idea.added", idea: idea("card", "merged") });
    expect(state.ideas.card?.lane).toBe("idea");
    expect(state.flags.map((flag) => flag.reason)).toContain("illegal-transition");
  });

  it("slides a fixed spec into seats when seat records already exist", () => {
    let state = reduce(emptyState(), { t: "idea.added", idea: idea() });
    state = reduce(state, {
      t: "spec.linted",
      ideaId: "card",
      report: { path: "card.md", ok: false, missing: ["acceptance tests", "seat briefs"], warnings: [], acceptanceCount: 0 },
    });
    expect(state.ideas.card?.lane).toBe("spec");
    state = reduce(state, seat());
    expect(state.ideas.card?.lane).toBe("spec");
    expect(state.flags.some((flag) => flag.reason === "spec-gate")).toBe(true);
    state = reduce(state, passSpec());
    expect(state.ideas.card?.lane).toBe("seats");
    expect(state.flags.some((flag) => flag.reason === "spec-gate")).toBe(false);
  });

  it("does not enter merged without a green human gate", () => {
    let state = reachDraft();
    state = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "card", number: 1, url: "https://example.test/1", draft: false, merged: true, base: "main" },
    });
    expect(state.ideas.card?.lane).not.toBe("merged");
    expect(state.ideas.card?.lane).toBe("draft_pr");
    expect(humanIsOk(state, "card")).toBe(false);
  });

  it("enters merged only after the human gate is green", () => {
    let state = reachDraft();
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "card",
        branch: "arena/winner",
        verdict: "pass",
        gates: [
          { name: "tests", status: "green" },
          { name: "lint", status: "green" },
          { name: "demo-gif", status: "green" },
          { name: "privacy", status: "green" },
          { name: "human-ok", status: "green" },
        ],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "card", number: 1, url: "https://example.test/1", draft: false, merged: true, base: "main" },
    });
    expect(state.ideas.card?.lane).toBe("merged");
  });

  it("parks and reopens only on legal edges", () => {
    let state = reduce(emptyState(), { t: "idea.added", idea: idea() });
    state = reduce(state, { t: "idea.parked", ideaId: "card" });
    expect(state.ideas.card?.lane).toBe("parked");
    state = reduce(state, { t: "idea.reopened", ideaId: "card" });
    expect(state.ideas.card?.lane).toBe("idea");
    state = reduce(state, passSpec());
    state = reduce(state, seat());
    state = reduce(state, { t: "idea.reopened", ideaId: "card" });
    expect(state.ideas.card?.lane).toBe("seats");
    expect(state.flags.at(-1)?.reason).toBe("illegal-transition");
  });

  it("ignores events for an unknown id without inventing a card", () => {
    const state = reduce(emptyState(), seat("missing"));
    expect(state.ideas).toEqual({});
    expect(state.seats).toEqual({});
    expect(state.flags).toEqual([{ ideaId: "missing", reason: "illegal-transition" }]);
  });
});

describe("property: fold is deterministic and merged stays gated", () => {
  const seeds = Array.from({ length: 40 }, (_, index) => index + 1);

  for (const seed of seeds) {
    it(`seed ${seed} without a green human gate never merges`, () => {
      const events = randomEvents(seed, false);
      const first = foldEvents(events);
      const second = foldEvents(events);
      expect(second).toEqual(first);
      for (const card of Object.values(first.ideas)) {
        expect(card.lane).not.toBe("merged");
      }
    });
  }

  it("a random log that does go green can merge, and only while the gate is green", () => {
    const events = randomEvents(7, true);
    let state = emptyState();
    for (const event of events) {
      state = reduce(state, event);
      for (const card of Object.values(state.ideas)) {
        if (card.lane === "merged") expect(humanIsOk(state, card.id)).toBe(true);
      }
    }
  });
});

function reachDraft(): PipelineState {
  let state = reduce(emptyState(), { t: "idea.added", idea: idea() });
  state = reduce(state, passSpec());
  state = reduce(state, seat());
  state = reduce(state, {
    t: "verifier.updated",
    v: {
      ideaId: "card",
      branch: "arena/winner",
      verdict: "pending",
      gates: [
        { name: "tests", status: "green" },
        { name: "lint", status: "green" },
        { name: "demo-gif", status: "red" },
        { name: "privacy", status: "green" },
        { name: "human-ok", status: "red" },
      ],
    },
  });
  state = reduce(state, {
    t: "pr.updated",
    pr: { ideaId: "card", number: 4, url: "https://example.test/4", draft: true, merged: false, base: "main" },
  });
  expect(state.ideas.card?.lane).toBe("draft_pr");
  return state;
}

function randomEvents(seed: number, allowHuman: boolean): PipelineEvent[] {
  const rand = mulberry32(seed);
  const ids = ["alpha", "beta", "gamma"].slice(0, 1 + Math.floor(rand() * 3));
  const events: PipelineEvent[] = ids.map((id) => ({ t: "idea.added", idea: idea(id) }));
  const steps = 12 + Math.floor(rand() * 10);
  for (let i = 0; i < steps; i += 1) {
    const id = ids[Math.floor(rand() * ids.length)] ?? "alpha";
    const roll = rand();
    if (roll < 0.25) {
      const ok = rand() > 0.4;
      events.push({
        t: "spec.linted",
        ideaId: id,
        report: {
          path: `${id}.md`,
          ok,
          missing: ok ? [] : ["goal"],
          warnings: [],
          acceptanceCount: ok ? 1 : 0,
        },
      });
    } else if (roll < 0.5) {
      events.push(seat(id, rand() > 0.5 ? "experience-first" : "model-first"));
    } else if (roll < 0.75) {
      const human = allowHuman && rand() > 0.45 ? "green" : "red";
      events.push({
        t: "verifier.updated",
        v: {
          ideaId: id,
          branch: "arena/winner",
          verdict: "pending",
          gates: [
            { name: "tests", status: "green" },
            { name: "lint", status: "amber" },
            { name: "demo-gif", status: "red" },
            { name: "privacy", status: "green" },
            { name: "human-ok", status: human },
          ],
        },
      });
    } else if (roll < 0.9) {
      events.push({
        t: "pr.updated",
        pr: {
          ideaId: id,
          number: 8,
          url: "https://example.test/8",
          draft: true,
          merged: rand() > 0.5,
          base: "main",
        },
      });
    } else if (rand() > 0.5) {
      events.push({ t: "idea.parked", ideaId: id });
    } else {
      events.push({ t: "idea.reopened", ideaId: id });
    }
  }
  return events;
}

function mulberry32(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}
