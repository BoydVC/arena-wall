import type { LogEntry } from "../core/types.ts";

export interface DemoStep {
  index: number;
  caption: string;
  ideaId: string | null;
}

export interface DemoHooks {
  seek: (index: number, caption: string, ideaId: string | null) => Promise<void>;
  pace: number;
  signal: AbortSignal;
}

function leadingIdeas(entries: readonly LogEntry[]): number {
  let index = 0;
  while (index < entries.length && entries[index]?.event.t === "idea.added") index += 1;
  return index;
}

function indexAfter(
  entries: readonly LogEntry[],
  match: (entry: LogEntry) => boolean,
  nth = 1,
): number | undefined {
  let seen = 0;
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || !match(entry)) continue;
    seen += 1;
    if (seen === nth) return index + 1;
  }
  return undefined;
}

/** Beats for Space: the synthetic day, then a scrub back to the opening ideas. */
export function buildDemoSteps(entries: readonly LogEntry[]): DemoStep[] {
  const opening = leadingIdeas(entries);
  const end = entries.length;
  const weak =
    indexAfter(entries, (entry) => entry.event.t === "spec.linted" && entry.event.report.ok === false) ?? opening;
  const seats =
    indexAfter(entries, (entry) => entry.event.t === "seat.updated" && entry.event.seat.ideaId === "comet-lab") ??
    opening;
  const lead =
    indexAfter(
      entries,
      (entry) => entry.event.t === "seat.updated" && entry.event.seat.id === "comet-lab:experience-first",
      2,
    ) ??
    indexAfter(
      entries,
      (entry) => entry.event.t === "seat.updated" && entry.event.seat.id === "comet-lab:experience-first",
    ) ??
    seats;
  const gates: number[] = [];
  entries.forEach((entry, index) => {
    if (entry.event.t === "verifier.updated" && entry.event.v.ideaId === "ridge-owl") gates.push(index + 1);
  });
  const draft =
    indexAfter(entries, (entry) => entry.event.t === "pr.updated" && entry.event.pr.ideaId === "ridge-owl") ?? end;

  const steps: DemoStep[] = [
    { index: end, caption: "Six builds on one wall.", ideaId: null },
    { index: opening, caption: "Morning. Ideas only.", ideaId: null },
    { index: weak, caption: "Missing: acceptance tests, seat briefs.", ideaId: "lumen-fold" },
    { index: seats, caption: "The spec passes and slides into Seats.", ideaId: "comet-lab" },
    { index: lead, caption: "Experience-first takes the lead.", ideaId: "comet-lab" },
  ];
  for (const index of gates) steps.push({ index, caption: "Verifier gates, one by one.", ideaId: "ridge-owl" });
  steps.push({ index: draft, caption: "Draft PR. Awaiting OK.", ideaId: "ridge-owl" });

  const frames = 10;
  for (let step = 1; step <= frames; step += 1) {
    const index = Math.round(end - ((end - opening) * step) / frames);
    steps.push({ index, caption: "Scrub the day back.", ideaId: null });
  }
  return steps;
}

function holdFor(caption: string): number {
  if (caption.startsWith("Scrub")) return 140;
  if (caption.includes("gates")) return 640;
  if (caption.startsWith("Six")) return 1800;
  if (caption.startsWith("Morning")) return 1200;
  if (caption.startsWith("Missing")) return 2000;
  if (caption.startsWith("The spec")) return 1400;
  if (caption.startsWith("Experience")) return 1600;
  if (caption.startsWith("Draft")) return 1800;
  return 900;
}

function sleep(ms: number, pace: number, signal: AbortSignal): Promise<void> {
  const scaled = ms * pace;
  const delay = pace < 0.5 ? Math.max(280, scaled) : scaled;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delay);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runDemo(steps: readonly DemoStep[], hooks: DemoHooks): Promise<void> {
  for (const step of steps) {
    if (hooks.signal.aborted) throw new DOMException("aborted", "AbortError");
    await hooks.seek(step.index, step.caption, step.ideaId);
    await sleep(holdFor(step.caption), hooks.pace, hooks.signal);
  }
}
