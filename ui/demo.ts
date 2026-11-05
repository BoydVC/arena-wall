export interface DemoTargets {
  opening: number;
  end: number;
  weakSpec: number;
  seatsSlide: number;
  experienceLead: number;
  gateCursors: number[];
  draftPr: number;
}

export interface DemoHooks {
  seek: (cursor: number, caption: string, spotlight: string | null) => void;
  pace: number;
  signal: AbortSignal;
}

function sleep(ms: number, pace: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, Math.max(0, ms * pace));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("aborted", "AbortError"));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runDemo(targets: DemoTargets, hooks: DemoHooks): Promise<void> {
  const { seek, pace, signal } = hooks;
  const hold = (ms: number) => sleep(ms, pace, signal);

  seek(targets.end, "Six builds on one wall.", null);
  await hold(2600);

  seek(targets.opening, "Morning. Ideas only.", null);
  await hold(1400);

  seek(targets.weakSpec, "Missing: acceptance tests, seat briefs.", "north");
  await hold(2400);

  seek(targets.seatsSlide, "The spec passes and slides into Seats.", "glass");
  await hold(900);
  for (let cursor = targets.seatsSlide + 1; cursor <= targets.experienceLead; cursor += 1) {
    const last = cursor === targets.experienceLead;
    seek(cursor, last ? "Experience-first takes the lead." : "Seat events stream in.", "glass");
    await hold(last ? 1600 : 520);
  }

  seek(targets.gateCursors[0] ?? targets.experienceLead, "Verifier gates, one by one.", "paper");
  await hold(500);
  for (const cursor of targets.gateCursors) {
    seek(cursor, "Verifier gates, one by one.", "paper");
    await hold(700);
  }

  seek(targets.draftPr, "Draft PR. Awaiting sign-off.", "copper");
  await hold(2000);

  const frames = 14;
  for (let step = 1; step <= frames; step += 1) {
    const cursor = Math.round(targets.end - ((targets.end - targets.opening) * step) / frames);
    seek(cursor, "Scrub the day back.", null);
    await hold(140);
  }
}
