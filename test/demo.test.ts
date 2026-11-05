import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { flagLabel, FLAG_REASONS } from "../core/model.ts";
import { buildFixtureLog } from "../sources/fixtures/build.ts";
import { buildDemoSteps } from "../ui/demo.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

describe("space-to-play beats", () => {
  const steps = buildDemoSteps(buildFixtureLog());

  it("opens on the live wall, shows the weak spec, and lands on Awaiting OK", () => {
    expect(steps[0]?.caption).toBe("Six builds on one wall.");
    expect(steps.map((step) => step.caption)).toContain("Missing: acceptance tests, seat briefs.");
    expect(steps.map((step) => step.caption)).toContain("Experience-first takes the lead.");
    expect(steps.map((step) => step.caption)).toContain("Draft PR. Awaiting OK.");
    expect(steps.at(-1)?.caption).toBe("Scrub the day back.");
    const morning = steps.find((step) => step.caption.startsWith("Morning"));
    expect(morning?.index).toBe(6);
    const seats = steps.find((step) => step.caption.includes("slides into Seats"));
    const lead = steps.find((step) => step.caption.includes("takes the lead"));
    expect(seats).toBeTruthy();
    expect(lead).toBeTruthy();
    expect(lead?.index ?? 0).toBeGreaterThan(seats?.index ?? 0);
  });

  it("keeps a single waiting-flag name", () => {
    expect(FLAG_REASONS).toEqual(["illegal-transition", "spec-gate", "stale-seat", "awaiting-ok"]);
    expect(flagLabel("awaiting-ok")).toBe("Awaiting OK");
    const ui = fs.readFileSync(path.join(root, "ui/wall.ts"), "utf8");
    const css = fs.readFileSync(path.join(root, "ui/wall.css"), "utf8");
    expect(ui).toContain('flagLabel("awaiting-ok")');
    expect(ui).not.toContain("awaiting-signoff");
    expect(ui).not.toContain("awaiting review");
    expect(css).toContain("--magenta");
    expect(css).toContain("--gold");
    expect(ui).toContain('event.key === " "');
    expect(ui).toContain('=== "phone"');
    const html = fs.readFileSync(path.join(root, "ui/index.html"), "utf8");
    expect(html).toContain('=== "phone"');
  });
});
