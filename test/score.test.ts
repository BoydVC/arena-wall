import { describe, expect, it } from "vitest";
import { diffText, leadSeat, scoreSeat } from "../core/score.ts";
import { roster } from "../sources/fixtures/catalog.ts";

describe("scoreboard", () => {
  it("puts experience-first ahead on the comet race", () => {
    const seats = roster.seats.filter((seat) => seat.ideaId === "comet-lab");
    const lead = leadSeat(seats);
    expect(lead?.style).toBe("experience-first");
    const totals = Object.fromEntries(seats.map((seat) => [seat.style, scoreSeat(seat).total]));
    expect(totals["experience-first"]).toBeGreaterThan(totals["model-first"] ?? 0);
    expect(totals["model-first"]).toBeGreaterThan(totals["types-first"] ?? 0);
  });

  it("keeps the ridge winner ahead once the verifier lint gate is green", () => {
    const seats = roster.seats.filter((seat) => seat.ideaId === "ridge-owl");
    const verifier = roster.verifiers.find((item) => item.ideaId === "ridge-owl");
    expect(leadSeat(seats, verifier)?.verdict).toBe("winner");
    const winner = seats.find((seat) => seat.verdict === "winner");
    expect(winner?.headSha).toBeTruthy();
    expect(diffText(winner!).length).toBeGreaterThan(0);
  });

  it("gives a clean small diff a higher focus score than a wide one", () => {
    const [small, wide] = roster.seats.filter((seat) => seat.ideaId === "pebble-arc" && seat.style !== "model-first");
    expect(small && wide).toBeTruthy();
    const smallScore = scoreSeat(small!).focus;
    const wideScore = scoreSeat(wide!).focus;
    if (small!.diffLines < wide!.diffLines) expect(smallScore).toBeGreaterThan(wideScore);
    else expect(wideScore).toBeGreaterThan(smallScore);
  });

  it("scores a winner above a pass with the same tests and diff", () => {
    const base = roster.seats.find((seat) => seat.id === "pebble-arc:types-first");
    expect(base).toBeTruthy();
    const pass = scoreSeat(base!).verdict;
    const winner = scoreSeat({ ...base!, verdict: "winner", headSha: base!.headSha ?? "abc1234" }).verdict;
    expect(winner).toBeGreaterThan(pass);
  });
});
