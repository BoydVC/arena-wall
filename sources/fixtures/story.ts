import type { SeatStyle } from "../../core/model";

export interface StoryCard {
  excerpt: string;
  diffs: Record<SeatStyle, string>;
  log: string[];
}

const glassDiff: Record<SeatStyle, string> = {
  "types-first": [
    "--- a/core/model.ts",
    "+++ b/core/model.ts",
    "@@ verdict",
    "- verdict: string",
    "+ verdict: winner requires headSha",
    "+ never: exhaustive switch",
  ].join("\n"),
  "model-first": [
    "--- a/core/statechart.ts",
    "+++ b/core/statechart.ts",
    "@@ edges",
    "- seats -> merged",
    "+ seats -> verify",
    "+ draft_pr -> merged",
  ].join("\n"),
  "experience-first": [
    "--- a/ui/wall.css",
    "+++ b/ui/wall.css",
    "@@ seat face",
    "- font-size: 11px",
    "+ font-size: 20px",
    "+ pulse: 2.6s",
    "+ lead: gold",
  ].join("\n"),
};

function quietDiff(style: SeatStyle): string {
  return [`--- a/seats/${style}`, `+++ b/seats/${style}`, "@@ closeout", "+ gates green", "+ sign-off recorded in the fixture"].join("\n");
}

export const story: Record<string, StoryCard> = {
  harbor: {
    excerpt: "A kite over the harbor that sketches a night market. Still a note. No spec yet.",
    diffs: {
      "types-first": "--- a/kite.ts\n+++ b/kite.ts\n@@\n+ type Wind = rising | calm",
      "model-first": "--- a/kite.md\n+++ b/kite.md\n@@\n+ calm -> rising",
      "experience-first": "--- a/kite.css\n+++ b/kite.css\n@@\n+ color: magenta",
    },
    log: ["14:00 note landed in Idea", "Seat faces are still warming up"],
  },
  north: {
    excerpt: "A ridge lamp. The spec names the goal and stops there. The gate is holding the card.",
    diffs: {
      "types-first": "--- a/lamp.ts\n+++ b/lamp.ts\n@@\n+ type Glow = dim | lit",
      "model-first": "--- a/lamp.md\n+++ b/lamp.md\n@@\n+ dim -> lit",
      "experience-first": "--- a/lamp.css\n+++ b/lamp.css\n@@\n+ size: doorway",
    },
    log: ["14:08 spec dropped", "Gate: acceptance tests, seat briefs"],
  },
  glass: {
    excerpt: "An orchard map. The spec passed, three seats raced, and the experience seat took the board.",
    diffs: glassDiff,
    log: ["14:12 spec passed", "14:16 experience seat behind", "14:20 experience seat leads"],
  },
  paper: {
    excerpt: "Lanterns for an open house. The verifier walks the gates one at a time and keeps the clip.",
    diffs: {
      "types-first": "--- a/lantern.ts\n+++ b/lantern.ts\n@@\n+ type Route = string",
      "model-first": "--- a/lantern.md\n+++ b/lantern.md\n@@\n+ hang -> light",
      "experience-first": "--- a/lantern.css\n+++ b/lantern.css\n@@\n+ glow: gold",
    },
    log: ["14:26 tests green", "14:28 lint green", "14:30 demo clip framed", "14:32 privacy green", "Sign-off still open"],
  },
  copper: {
    excerpt: "A finch counter sitting in Draft. The gates are green except the human sign-off.",
    diffs: {
      "types-first": "--- a/finch.ts\n+++ b/finch.ts\n@@\n+ type Count = number",
      "model-first": "--- a/finch.md\n+++ b/finch.md\n@@\n+ draft -> wait",
      "experience-first": "--- a/finch.css\n+++ b/finch.css\n@@\n+ badge: gold",
    },
    log: ["14:38 verifier passed the machine gates", "14:42 draft opened", "Waiting on a sign-off"],
  },
  quiet: {
    excerpt: "The meridian log. Sign-off was set by hand in the fixture, then the card rested in Merged.",
    diffs: {
      "types-first": quietDiff("types-first"),
      "model-first": quietDiff("model-first"),
      "experience-first": quietDiff("experience-first"),
    },
    log: ["14:48 every gate green", "14:50 draft opened", "14:54 fixture recorded the merge"],
  },
};
