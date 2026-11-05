import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  STALE_MS,
  emptyState,
  humanOk,
  markStale,
  reduce,
  transition,
  type Idea,
  type PipelineEvent,
  type PipelineState,
  type Seat,
  type SeatStyle,
  type SpecReport,
} from "../core/model";
import { fold, openingCursor, stateAt } from "../core/replay";
import { lintSpec } from "../core/specLint";

const at = "2026-11-04T14:00:00.000Z";

function idea(id = "owl", lane: Idea["lane"] = "idea"): Idea {
  return {
    id,
    title: "Ridge Owl",
    signals: [{ kind: "manual", note: "ridge note" }],
    lane,
    createdAt: at,
  };
}

function withIdea(id = "owl"): PipelineState {
  const base = emptyState();
  return reduce(base, { t: "idea.added", idea: idea(id) });
}

function report(ok: boolean, missing: string[] = []): SpecReport {
  return { path: "SPEC.md", ok, missing, warnings: [], acceptanceCount: ok ? 10 : 0 };
}

function seat(partial: Partial<Seat> & Pick<Seat, "verdict">): Seat {
  const style: SeatStyle = "experience-first";
  const base = {
    id: "owl-experience-first",
    ideaId: "owl",
    style,
    branch: "arena/experience-first",
    tests: { passed: 10, failed: 0 },
    diffLines: 100,
    updatedAt: at,
    headSha: "abc1234",
  };
  if (partial.verdict === "winner") return { ...base, ...partial, verdict: "winner", headSha: partial.headSha ?? "abc1234" };
  return { ...base, ...partial, verdict: partial.verdict };
}

describe("reducer", () => {
  it("folds the same events to the same state", () => {
    const events: PipelineEvent[] = [
      { t: "idea.added", idea: idea() },
      { t: "spec.linted", ideaId: "owl", report: report(false, ["acceptance tests", "seat briefs"]) },
      { t: "spec.linted", ideaId: "owl", report: report(true) },
    ];
    expect(fold(events)).toEqual(fold(events));
    expect(fold(events)).toEqual(events.reduce(reduce, emptyState()));
  });

  it("does not mutate the previous state or the event", () => {
    const state = emptyState();
    const event: PipelineEvent = { t: "idea.added", idea: idea() };
    const beforeState = structuredClone(state);
    const beforeEvent = structuredClone(event);
    reduce(state, event);
    expect(state).toEqual(beforeState);
    expect(event).toEqual(beforeEvent);
  });

  it("property: a fold splits cleanly at any cursor", () => {
    const styles = ["types-first", "model-first", "experience-first"] as const;
    const eventArb = fc.oneof(
      fc.constantFrom("owl", "kite", "lamp").map((id): PipelineEvent => ({ t: "idea.added", idea: idea(id) })),
      fc.record({ id: fc.constantFrom("owl", "kite", "lamp"), ok: fc.boolean() }).map(
        ({ id, ok }): PipelineEvent => ({
          t: "spec.linted",
          ideaId: id,
          report: report(ok, ok ? [] : ["goal"]),
        }),
      ),
      fc.record({
        id: fc.constantFrom("owl", "kite", "lamp"),
        style: fc.constantFrom(...styles),
        passed: fc.integer({ min: 0, max: 40 }),
        failed: fc.integer({ min: 0, max: 5 }),
      }).map(({ id, style, passed, failed }): PipelineEvent => ({
        t: "seat.updated",
        seat: {
          id: `${id}-${style}`,
          ideaId: id,
          style,
          branch: `arena/${style}`,
          tests: { passed, failed },
          diffLines: 200,
          verdict: "pass",
          headSha: "abc1234",
          updatedAt: at,
        },
      })),
    );
    fc.assert(
      fc.property(fc.array(eventArb, { maxLength: 24 }), fc.nat(), (events, cut) => {
        const point = events.length === 0 ? 0 : cut % (events.length + 1);
        const left = fold(events.slice(0, point));
        const right = events.slice(point).reduce(reduce, left);
        expect(right).toEqual(fold(events));
        const frozen = structuredClone(events);
        fold(events);
        expect(events).toEqual(frozen);
      }),
      { numRuns: 40, seed: 20261104 },
    );
  });

  it("clamps a new card to the idea lane", () => {
    const next = reduce(emptyState(), { t: "idea.added", idea: idea("owl", "merged") });
    expect(next.ideas.owl?.lane).toBe("idea");
    expect(next.flags).toContainEqual({ ideaId: "owl", reason: "illegal-transition" });
  });

  it("ignores a duplicate idea", () => {
    const once = withIdea();
    expect(reduce(once, { t: "idea.added", idea: { ...idea(), title: "Other" } })).toEqual(once);
  });

  it("holds a weak spec in the spec lane", () => {
    const next = reduce(withIdea(), {
      t: "spec.linted",
      ideaId: "owl",
      report: report(false, ["acceptance tests", "seat briefs"]),
    });
    expect(next.ideas.owl?.lane).toBe("spec");
    expect(next.reports.owl?.missing).toEqual(["acceptance tests", "seat briefs"]);
    expect(next.flags).toContainEqual({ ideaId: "owl", reason: "spec-gate" });
  });

  it("slides a passing spec from idea into seats", () => {
    const next = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(true) });
    expect(next.ideas.owl?.lane).toBe("seats");
    expect(next.flags.some((flag) => flag.reason === "spec-gate")).toBe(false);
  });

  it("refuses seats when the last report failed", () => {
    const held = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(false, ["goal"]) });
    const blocked = transition(held, "owl", "seats");
    expect(blocked.ideas.owl?.lane).toBe("spec");
    expect(blocked.flags).toContainEqual({ ideaId: "owl", reason: "spec-gate" });
  });

  it("stores a seat and ignores a winner with no commit", () => {
    const ready = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(true) });
    const saved = reduce(ready, { t: "seat.updated", seat: seat({ verdict: "pass" }) });
    expect(saved.seats["owl-experience-first"]?.verdict).toBe("pass");
    const bad = JSON.parse(
      JSON.stringify({
        t: "seat.updated",
        seat: { ...seat({ verdict: "pass" }), verdict: "winner", headSha: "  " },
      }),
    ) as PipelineEvent;
    expect(reduce(saved, bad).seats["owl-experience-first"]?.verdict).toBe("pass");
  });

  it("moves to verify only from seats", () => {
    let state = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(true) });
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "owl",
        branch: "arena/winner",
        verdict: "pending",
        gates: [
          { name: "tests", status: "green" },
          { name: "lint", status: "red" },
          { name: "demo-gif", status: "red" },
          { name: "privacy", status: "red" },
          { name: "human-ok", status: "red" },
        ],
      },
    });
    expect(state.ideas.owl?.lane).toBe("verify");
  });

  it("parks a draft behind the sign-off badge", () => {
    let state = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(true) });
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "owl",
        branch: "arena/winner",
        verdict: "pass",
        gates: [
          { name: "tests", status: "green" },
          { name: "lint", status: "green" },
          { name: "demo-gif", status: "green" },
          { name: "privacy", status: "green" },
          { name: "human-ok", status: "red" },
        ],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "owl", number: 9, url: "https://example.test/pr/9", draft: true, merged: false, base: "main" },
    });
    expect(state.ideas.owl?.lane).toBe("draft_pr");
    expect(state.flags).toContainEqual({ ideaId: "owl", reason: "awaiting-signoff" });
  });

  it("keeps merged unreachable until human-ok is green", () => {
    let state = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(true) });
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "owl",
        branch: "arena/winner",
        verdict: "pass",
        gates: [
          { name: "tests", status: "green" },
          { name: "lint", status: "green" },
          { name: "demo-gif", status: "green" },
          { name: "privacy", status: "green" },
          { name: "human-ok", status: "red" },
        ],
      },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "owl", number: 9, url: "https://example.test/pr/9", draft: true, merged: false, base: "main" },
    });
    const beforeLane = state.ideas.owl?.lane;
    const denied = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "owl", number: 9, url: "https://example.test/pr/9", draft: false, merged: true, base: "main" },
    });
    expect(humanOk(denied, "owl")).toBe(false);
    expect(denied.ideas.owl?.lane).toBe(beforeLane);
    expect(denied.ideas.owl?.lane).not.toBe("merged");
    expect(denied.prs.owl?.merged).toBe(false);
    expect(denied.flags).toContainEqual({ ideaId: "owl", reason: "illegal-transition" });
  });

  it("enters merged when the fixture turns human-ok green", () => {
    let state = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: report(true) });
    state = reduce(state, {
      t: "verifier.updated",
      v: {
        ideaId: "owl",
        branch: "arena/winner",
        verdict: "winner",
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
      pr: { ideaId: "owl", number: 9, url: "https://example.test/pr/9", draft: true, merged: false, base: "main" },
    });
    state = reduce(state, {
      t: "pr.updated",
      pr: { ideaId: "owl", number: 9, url: "https://example.test/pr/9", draft: false, merged: true, base: "main" },
    });
    expect(state.ideas.owl?.lane).toBe("merged");
    expect(state.prs.owl?.merged).toBe(true);
    expect(state.flags.some((flag) => flag.reason === "awaiting-signoff")).toBe(false);
  });

  it("flags a seat that has been quiet for 90 minutes", () => {
    const state = reduce(withIdea(), { t: "seat.updated", seat: seat({ verdict: "pending", updatedAt: at }) });
    const almost = new Date(Date.parse(at) + STALE_MS - 1).toISOString();
    const exact = new Date(Date.parse(at) + STALE_MS).toISOString();
    expect(markStale(state, almost).flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
    const stale = markStale(state, exact);
    expect(stale.flags).toContainEqual({ ideaId: "owl", reason: "stale-seat" });
    const fresh = markStale(
      reduce(stale, { t: "seat.updated", seat: seat({ verdict: "pending", updatedAt: exact }) }),
      exact,
    );
    expect(fresh.flags.some((flag) => flag.reason === "stale-seat")).toBe(false);
  });

  it("ignores events for an unknown idea", () => {
    const state = emptyState();
    expect(reduce(state, { t: "spec.linted", ideaId: "missing", report: report(true) })).toEqual(state);
    expect(reduce(state, { t: "seat.updated", seat: seat({ verdict: "pass" }) })).toEqual(state);
  });

  it("opening cursor stops at the first non-idea", () => {
    const events: PipelineEvent[] = [
      { t: "idea.added", idea: idea("owl") },
      { t: "idea.added", idea: idea("kite") },
      { t: "spec.linted", ideaId: "owl", report: report(false, ["goal"]) },
    ];
    expect(openingCursor(events)).toBe(2);
    const opened = stateAt(events, openingCursor(events));
    expect(Object.values(opened.ideas).every((item) => item.lane === "idea")).toBe(true);
    expect(Object.keys(opened.seats)).toHaveLength(0);
  });

  it("lint of a passing body round-trips through the reducer", () => {
    const body = "# T\n\n## 1. Goal\nA full enough goal for the gate to read.\n\n## 6. Acceptance tests\n1. One\n2. Two\n3. Three\n4. Four\n5. Five\n\n## 7. Arena seat briefs\ntypes-first names the types.\nmodel-first names the edges.\nexperience-first names the wall.\n";
    const next = reduce(withIdea(), { t: "spec.linted", ideaId: "owl", report: lintSpec(body) });
    expect(next.reports.owl?.ok).toBe(true);
    expect(next.ideas.owl?.lane).toBe("seats");
  });
});
