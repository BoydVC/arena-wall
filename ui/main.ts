import type { Lane, PipelineEvent, PipelineState } from "../core/model";
import { markStale } from "../core/model";
import { stateAt } from "../core/replay";
import { WALL_LANES } from "../core/statechart";
import type { Milestones } from "../sources/fixtures/day";
import type { StoryCard } from "../sources/fixtures/story";
import { runDemo } from "./demo";
import { renderWall, type WallModel } from "./view";

interface Boot {
  events: PipelineEvent[];
  opening: number;
  milestones: Milestones;
  story: Record<string, StoryCard>;
  now: string;
}

declare global {
  interface Window {
    __BOOT__?: Boot;
  }
}

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) throw new Error("missing app root");
const app: HTMLElement = appRoot;

const params = new URLSearchParams(location.search);
const forced = params.get("mode");
const mode: "tv" | "phone" = forced === "phone" || forced === "tv"
  ? forced
  : window.matchMedia("(max-width: 800px)").matches
    ? "phone"
    : "tv";
const pace = params.get("pace") === "fast" ? 0.08 : 1;

let events: PipelineEvent[] = window.__BOOT__?.events ?? [];
let opening = window.__BOOT__?.opening ?? 0;
let milestones: Milestones = window.__BOOT__?.milestones ?? {
  opening,
  weakSpec: opening,
  seatsSlide: opening,
  experienceLead: opening,
  gateCursors: [],
  draftPr: opening,
  end: events.length,
};
let story: Record<string, StoryCard> = window.__BOOT__?.story ?? {};
let nowIso = window.__BOOT__?.now ?? new Date().toISOString();
let cursor = events.length;
let phoneLane: Lane = "spec";
let selectedId = mode === "phone" ? "north" : "glass";
let drawer = false;
let help = false;
let caption = "";
let spotlight: string | null = null;
let playing = false;
let demoAbort: AbortController | null = null;
let lastRects = new Map<string, DOMRect>();

function folded(): PipelineState {
  return markStale(stateAt(events, cursor), nowIso);
}

function model(): WallModel {
  const state = folded();
  if (!state.ideas[selectedId]) {
    const first = Object.values(state.ideas).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (first) selectedId = first.id;
  }
  return {
    state,
    cursor,
    opening,
    max: events.length,
    selectedId,
    drawer,
    help,
    caption,
    spotlightId: spotlight,
    mode,
    phoneLane,
    story,
  };
}

function capture(): Map<string, DOMRect> {
  const rects = new Map<string, DOMRect>();
  document.querySelectorAll<HTMLElement>("[data-idea]").forEach((node) => {
    const id = node.dataset.idea;
    if (id) rects.set(id, node.getBoundingClientRect());
  });
  return rects;
}

function flip(prev: Map<string, DOMRect>): void {
  document.querySelectorAll<HTMLElement>("[data-idea]").forEach((node) => {
    const id = node.dataset.idea;
    const before = id ? prev.get(id) : undefined;
    if (!before) return;
    const after = node.getBoundingClientRect();
    const dx = before.left - after.left;
    const dy = before.top - after.top;
    if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
    node.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }],
      { duration: Math.round(720 * Math.min(1, pace * 8 || 1)), easing: "cubic-bezier(.2,.7,.2,1)" },
    );
  });
}

function paint(): void {
  const prev = lastRects;
  app.innerHTML = renderWall(model());
  document.body.dataset.mode = mode;
  document.body.dataset.playing = playing ? "true" : "false";
  const clock = document.querySelector<HTMLElement>("#clock");
  if (clock) {
    clock.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  flip(prev);
  lastRects = capture();
  const selected = document.querySelector<HTMLElement>(`[data-idea="${CSS.escape(selectedId)}"]`);
  if (selected && document.activeElement === document.body) selected.focus({ preventScroll: true });
}

function seek(next: number, nextCaption = "", nextSpot: string | null = null): void {
  cursor = Math.max(opening, Math.min(events.length, next));
  caption = nextCaption;
  spotlight = nextSpot;
  if (nextSpot) {
    selectedId = nextSpot;
    const lane = folded().ideas[nextSpot]?.lane;
    if (lane && lane !== "parked") phoneLane = lane;
  }
  paint();
}

function stopDemo(): void {
  demoAbort?.abort();
  demoAbort = null;
  playing = false;
}

async function play(): Promise<void> {
  stopDemo();
  playing = true;
  demoAbort = new AbortController();
  paint();
  try {
    await runDemo(
      {
        opening: milestones.opening,
        end: events.length,
        weakSpec: milestones.weakSpec,
        seatsSlide: milestones.seatsSlide,
        experienceLead: milestones.experienceLead,
        gateCursors: milestones.gateCursors,
        draftPr: milestones.draftPr,
      },
      {
        seek: (next, text, spot) => seek(next, text, spot),
        pace,
        signal: demoAbort.signal,
      },
    );
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  } finally {
    playing = false;
    caption = "";
    spotlight = null;
    paint();
  }
}

function ideasInLane(lane: Lane): string[] {
  return Object.values(folded().ideas)
    .filter((idea) => idea.lane === lane)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((idea) => idea.id);
}

function moveLane(delta: number): void {
  const lanes = WALL_LANES.filter((lane) => ideasInLane(lane).length > 0);
  const current = folded().ideas[selectedId]?.lane ?? lanes[0] ?? "idea";
  const index = Math.max(0, lanes.indexOf(current as Lane));
  const next = lanes[(index + delta + lanes.length) % lanes.length] ?? current;
  const id = ideasInLane(next)[0];
  if (!id) return;
  selectedId = id;
  if (next !== "parked") phoneLane = next;
  drawer = false;
  paint();
  document.querySelector<HTMLElement>(`[data-idea="${CSS.escape(id)}"]`)?.focus();
}

function jumpLane(lane: Lane): void {
  phoneLane = lane;
  const id = ideasInLane(lane)[0];
  if (id) selectedId = id;
  drawer = false;
  paint();
}

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#play-demo")) {
    void play();
    return;
  }
  if (target.closest("#live")) {
    stopDemo();
    seek(events.length);
    return;
  }
  if (target.closest("#keys")) {
    help = true;
    paint();
    return;
  }
  if (target.closest("#close-help") || target.closest("[data-close='help']")) {
    help = false;
    paint();
    return;
  }
  if (target.closest("#close-drawer") || target.closest("[data-close='drawer']")) {
    drawer = false;
    paint();
    return;
  }
  const chip = target.closest<HTMLElement>("[data-lane-jump]");
  if (chip?.dataset.laneJump) {
    jumpLane(chip.dataset.laneJump as Lane);
    return;
  }
  const card = target.closest<HTMLElement>("[data-idea]");
  if (card?.dataset.idea && !target.closest(".drawer")) {
    selectedId = card.dataset.idea;
    drawer = true;
    const lane = folded().ideas[selectedId]?.lane;
    if (lane && lane !== "parked") phoneLane = lane;
    paint();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== "replay") return;
  stopDemo();
  seek(Number(target.value));
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.key === "Escape") {
    if (playing) stopDemo();
    drawer = false;
    help = false;
    caption = "";
    spotlight = null;
    paint();
    return;
  }
  if (typing) return;
  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveLane(1);
  } else if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveLane(-1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    drawer = true;
    paint();
  } else if (event.key === " ") {
    event.preventDefault();
    void play();
  } else if (event.key === "[") {
    stopDemo();
    seek(cursor - 1);
  } else if (event.key === "]") {
    stopDemo();
    seek(cursor + 1);
  } else if (event.key === "Home") {
    stopDemo();
    seek(opening);
  } else if (event.key === "End") {
    stopDemo();
    seek(events.length);
  } else if (event.key === "?") {
    help = !help;
    paint();
  } else if (/^[1-6]$/.test(event.key)) {
    const lane = WALL_LANES[Number(event.key) - 1];
    if (lane) jumpLane(lane);
  }
});

const stream = new EventSource("/events");
stream.onmessage = (message) => {
  const payload = JSON.parse(message.data) as { events?: PipelineEvent[] };
  if (!payload.events) return;
  const atLive = cursor === events.length;
  events = payload.events;
  milestones = { ...milestones, end: events.length };
  if (atLive && !playing) cursor = events.length;
  if (cursor > events.length) cursor = events.length;
  paint();
};

if (!window.__BOOT__) {
  void fetch("/api/bootstrap")
    .then((response) => response.json())
    .then((boot: Boot) => {
      events = boot.events;
      opening = boot.opening;
      milestones = boot.milestones;
      story = boot.story;
      nowIso = boot.now;
      cursor = events.length;
      paint();
    });
}

paint();
