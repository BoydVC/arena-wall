import { diffText } from "../core/score.ts";
import { flagLabel } from "../core/types.ts";
import type { Idea, Lane, LogEntry, Seat, SeatStyle, SpecReport, Verifier } from "../core/types.ts";
import { buildDemoSteps, runDemo } from "./demo.ts";

interface Payload {
  now: string;
  t0: number;
  length: number;
  index: number;
  source: string;
  lanes: Lane[];
  labels: Record<string, string>;
  styles: SeatStyle[];
  scores: Record<string, number>;
  leads: Record<string, string | null>;
  entries: LogEntry[];
  state: {
    ideas: Record<string, Idea>;
    seats: Record<string, Seat>;
    verifiers: Record<string, Verifier>;
    specs: Record<string, SpecReport>;
    flags: Array<{ ideaId: string; reason: string }>;
  };
}

const STYLE_LABEL: Record<SeatStyle, string> = {
  "types-first": "Types",
  "model-first": "Model",
  "experience-first": "Experience",
};

const app = document.querySelector<HTMLElement>("#app");
if (!app) throw new Error("missing app root");

const params = new URLSearchParams(location.search);
const forced = params.get("mode");
const mode: "tv" | "phone" =
  forced === "phone" || forced === "tv" ? forced : window.matchMedia("(max-width: 800px)").matches ? "phone" : "tv";
const paceRaw = params.get("pace");
const pace = paceRaw === "fast" ? 0.08 : paceRaw ? Number(paceRaw) || 1 : 1;

let current: Payload | null = null;
let following = true;
let phoneLane: Lane = "draft_pr";
let selectedId = "ridge-owl";
let drawerOpen = false;
let helpOpen = false;
let caption = "";
let lastCaption = "";
let spotlightId: string | null = null;
let playing = false;
let played = false;
let demoAbort: AbortController | null = null;
let demoGeneration = 0;

function ideasIn(lane: Lane): Idea[] {
  if (!current) return [];
  return Object.values(current.state.ideas)
    .filter((idea) => idea.lane === lane)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
}

function seatsFor(ideaId: string): Seat[] {
  if (!current) return [];
  return Object.values(current.state.seats)
    .filter((seat) => seat.ideaId === ideaId)
    .sort((a, b) => (current?.scores[b.id] ?? 0) - (current?.scores[a.id] ?? 0));
}

function paint(): void {
  if (!current || !app) return;
  document.body.dataset.mode = mode;
  document.documentElement.dataset.mode = mode;
  document.body.dataset.playing = playing ? "true" : "false";
  document.body.dataset.played = played ? "true" : "false";
  if (lastCaption) document.body.dataset.lastCaption = lastCaption;
  app.replaceChildren(renderTop(current), renderBoard(current), renderFoot(current));
  document.querySelectorAll("[data-overlay]").forEach((node) => node.remove());
  if (caption) {
    const node = el("p", "caption", caption);
    node.dataset.overlay = "true";
    document.body.append(node);
  }
  if (drawerOpen) document.body.append(renderDrawer(current));
  if (helpOpen) document.body.append(renderHelp());
  if (drawerOpen) void fillSpec(selectedId);
}

function renderTop(payload: Payload): HTMLElement {
  const header = el("header", "top");
  const brand = el("div", "brand");
  brand.append(el("span", "mark"));
  const titles = el("div");
  titles.append(el("h1", undefined, "Arena Wall"));
  titles.append(el("p", "hint", "arrows move · enter opens · space plays"));
  brand.append(titles);

  const actions = el("div", "actions");
  const live = el("span", "live");
  live.append(el("i"), document.createTextNode(following && !playing ? "Live" : "Scrub"));
  actions.append(live);
  const clock = el("time");
  clock.id = "clock";
  clock.dateTime = payload.now;
  clock.textContent = formatClock(payload.now);
  actions.append(clock, button("play-demo", "Play demo"), button("live", "Now"), button("keys", "Keys"));

  const switcher = el("nav", "switcher");
  switcher.setAttribute("aria-label", "Lanes");
  const chipLabel: Record<string, string> = {
    idea: "Idea",
    spec: "Spec",
    seats: "Seats",
    verify: "Verify",
    draft_pr: "Draft",
    merged: "Merged",
    parked: "Park",
  };
  for (const lane of payload.lanes) {
    const count = ideasIn(lane).length;
    const chip = button("", `${chipLabel[lane] ?? lane} ${count}`);
    chip.classList.add("chip");
    chip.dataset.laneJump = lane;
    const currentLane = mode === "phone" && lane === phoneLane;
    if (currentLane) chip.classList.add("on");
    chip.setAttribute("aria-pressed", currentLane ? "true" : "false");
    switcher.append(chip);
  }

  header.append(brand, actions, switcher);
  return header;
}

function renderBoard(payload: Payload): HTMLElement {
  const board = el("main", "board");
  board.setAttribute("aria-label", "Pipeline lanes");
  for (const lane of payload.lanes) {
    const hidden = mode === "phone" && lane !== phoneLane;
    const column = el("section", hidden ? "lane hidden" : "lane");
    column.dataset.lane = lane;
    column.dataset.laneColumn = lane;
    const ideas = ideasIn(lane);
    const head = el("header", "lane-head");
    head.append(el("h2", undefined, payload.labels[lane] ?? lane));
    const count = el("span", undefined, String(ideas.length));
    count.dataset.count = lane;
    head.append(count);
    const cards = el("div", "cards");
    cards.dataset.cards = lane;
    if (ideas.length === 0) cards.append(el("p", "empty", "Open"));
    for (const idea of ideas) cards.append(renderCard(payload, idea));
    column.append(head, cards);
    board.append(column);
  }
  return board;
}

function renderCard(payload: Payload, idea: Idea): HTMLElement {
  const report = payload.state.specs[idea.id];
  const flags = payload.state.flags.filter((flag) => flag.ideaId === idea.id);
  const blocked = Boolean(report && !report.ok);
  const waiting = flags.some((flag) => flag.reason === "awaiting-ok");
  const stale = flags.some((flag) => flag.reason === "stale-seat");
  const card = el("article", `card${blocked ? " blocked" : ""}${idea.id === spotlightId ? " spotlight" : ""}`);
  card.dataset.idea = idea.id;
  card.dataset.lane = idea.lane;
  card.dataset.selected = idea.id === selectedId ? "true" : "false";
  card.tabIndex = 0;
  card.append(el("h3", undefined, idea.title));
  const note = idea.signals[0]?.note;
  if (note) card.append(el("p", "note", note));
  if (waiting) card.append(el("p", "badge", flagLabel("awaiting-ok")));
  if (blocked && report) card.append(el("p", "missing", `missing: ${report.missing.join(", ")}`));
  if (stale) card.append(el("p", "stale", "stale seat"));

  const faces = el("div", "faces");
  const ranked = seatsFor(idea.id);
  for (const style of payload.styles) {
    const seat = ranked.find((item) => item.style === style) ?? Object.values(payload.state.seats).find((item) => item.ideaId === idea.id && item.style === style);
    faces.append(renderFace(payload, idea, style, seat));
  }
  card.append(faces);

  const verifier = payload.state.verifiers[idea.id];
  const showGates = idea.lane === "verify" || idea.lane === "draft_pr" || idea.lane === "merged";
  if (verifier && showGates) card.append(renderGates(verifier));
  if (verifier?.gates.some((gate) => gate.name === "demo-gif" && gate.status === "green") && showGates) {
    card.append(thumb());
  }
  return card;
}

function renderFace(payload: Payload, idea: Idea, style: SeatStyle, seat: Seat | undefined): HTMLElement {
  const face = el("article", "face");
  face.dataset.face = `${idea.id}:${style}`;
  if (!seat) {
    face.classList.add("waiting");
    face.append(el("div", "score-num", "–"));
    const copy = el("div", "face-copy");
    const top = el("div", "face-top");
    top.append(el("strong", undefined, STYLE_LABEL[style]));
    copy.append(top, el("div", "branch", `arena/${style}`), el("div", "meta", "not checked in"));
    face.append(copy);
    return face;
  }
  const lead = payload.leads[idea.id] === seat.id;
  if (lead) {
    face.classList.add("lead");
    face.dataset.lead = "true";
  }
  const score = Math.round(payload.scores[seat.id] ?? 0);
  face.append(el("div", "score-num", String(score)));
  const copy = el("div", "face-copy");
  const top = el("div", "face-top");
  top.append(el("strong", undefined, STYLE_LABEL[style]));
  if (lead) top.append(el("span", "lead-tag", "Lead"));
  const sha = seat.headSha ? seat.headSha.slice(0, 7) : "------";
  copy.append(
    top,
    el("div", "branch", seat.branch),
    el("div", "meta", `${seat.tests.passed} pass · ${seat.tests.failed} fail · ${sha}`),
  );
  face.append(copy);
  return face;
}

function renderGates(verifier: Verifier): HTMLElement {
  const row = el("div", "gates");
  for (const gate of verifier.gates) {
    const item = el("span", `gate ${gate.status}`);
    item.dataset.gate = gate.name;
    item.append(el("i"), document.createTextNode(gate.name));
    row.append(item);
  }
  return row;
}

function renderFoot(payload: Payload): HTMLElement {
  const foot = el("footer", "foot");
  const row = el("div", "replay-row");
  const label = payload.index <= payload.t0 ? "t0" : payload.index >= payload.length ? "now" : "replay";
  const name = el("span");
  name.id = "replay-label";
  name.textContent = label;
  const slider = document.createElement("input");
  slider.id = "replay";
  slider.type = "range";
  slider.min = String(payload.t0);
  slider.max = String(Math.max(payload.length, payload.t0));
  slider.value = String(payload.index);
  slider.dataset.testid = "replay";
  slider.setAttribute("aria-label", "Replay the day");
  const end = el("span", undefined, "live");
  row.append(name, slider, end);
  foot.append(row, renderScoreboard(payload));
  return foot;
}

function renderScoreboard(payload: Payload): HTMLElement {
  const box = el("div", "scoreboard");
  box.id = "result";
  const focus = spotlightId ?? selectedId;
  const idea = payload.state.ideas[focus];
  if (!idea) {
    box.append(el("p", "kicker", "Seat race"));
    return box;
  }
  const ranked = seatsFor(idea.id);
  box.append(el("p", "kicker", `${idea.title} · seat race`));
  if (ranked.length === 0) {
    box.append(el("p", "note", "Seats appear once the day moves."));
    return box;
  }
  const list = document.createElement("ol");
  ranked.forEach((seat, index) => {
    const item = document.createElement("li");
    if (index === 0) item.className = "top";
    item.append(el("span", undefined, String(index + 1)));
    item.append(el("strong", undefined, STYLE_LABEL[seat.style]));
    item.append(el("em", undefined, String(Math.round(payload.scores[seat.id] ?? 0))));
    list.append(item);
  });
  box.append(list);
  return box;
}

function renderDrawer(payload: Payload): HTMLElement {
  const holder = el("div");
  holder.dataset.overlay = "true";
  const backdrop = el("div", "backdrop");
  backdrop.dataset.close = "drawer";
  const drawer = el("aside", "drawer");
  drawer.id = "drawer";
  drawer.setAttribute("role", "dialog");
  drawer.setAttribute("aria-modal", "true");
  const idea = payload.state.ideas[selectedId];
  const head = el("header", "drawer-head");
  const titleBlock = el("div");
  if (idea) titleBlock.append(el("p", "kicker", payload.labels[idea.lane] ?? idea.lane));
  const title = el("h3");
  title.id = "drawer-title";
  title.textContent = idea?.title ?? "Detail";
  titleBlock.append(title);
  head.append(titleBlock, button("close-drawer", "Close"));

  const spec = el("section", "drawer-spec");
  spec.append(el("h4", undefined, "Spec"));
  const report = idea ? payload.state.specs[idea.id] : undefined;
  spec.append(el("p", undefined, idea?.signals[0]?.note ?? "No note yet."));
  if (report) {
    spec.append(
      el(
        "p",
        report.ok ? "ok-line" : "missing",
        report.ok ? "Spec passed the gate." : `missing: ${report.missing.join(", ")}`,
      ),
    );
  } else spec.append(el("p", "note", "No spec report yet."));
  const specHost = el("div", "spec");
  specHost.id = "drawer-spec";
  spec.append(specHost);

  const diffs = el("section", "drawer-diffs");
  diffs.append(el("h4", undefined, "Seat diffs"));
  const grid = el("div", "diff-grid");
  for (const style of payload.styles) {
    const seat = idea
      ? Object.values(payload.state.seats).find((item) => item.ideaId === idea.id && item.style === style)
      : undefined;
    const col = el("section", "diff-col");
    col.append(el("h4", undefined, STYLE_LABEL[style]));
    const pre = el("pre", "diff");
    pre.textContent = seat ? diffText(seat) : "Seat has not checked in.";
    col.append(pre);
    grid.append(col);
  }
  diffs.append(grid);

  const verify = el("section", "drawer-verify");
  verify.append(el("h4", undefined, "Verifier"));
  const verifier = idea ? payload.state.verifiers[idea.id] : undefined;
  if (verifier) {
    verify.append(renderGates(verifier));
    if (verifier.gates.some((gate) => gate.name === "demo-gif" && gate.status === "green")) verify.append(thumb());
    const log = document.createElement("ol");
    log.className = "log";
    for (const gate of verifier.gates) {
      const item = document.createElement("li");
      item.textContent = `${gate.name} ${gate.status}`;
      log.append(item);
    }
    verify.append(log);
  } else verify.append(el("p", "note", "Verifier has not spoken."));

  drawer.append(head, spec, diffs, verify);
  holder.append(backdrop, drawer);
  return holder;
}

function renderHelp(): HTMLElement {
  const holder = el("div");
  holder.dataset.overlay = "true";
  const backdrop = el("div", "backdrop");
  backdrop.dataset.close = "help";
  const help = el("aside", "help");
  help.id = "help";
  help.setAttribute("role", "dialog");
  const title = el("h3", undefined, "Keys");
  title.id = "help-title";
  const list = document.createElement("ul");
  for (const line of ["← → change lane", "Enter open the build", "Esc close", "Space play the day", "[ ] scrub", "1–6 jump to a lane"]) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }
  help.append(title, list, button("close-help", "Close"));
  holder.append(backdrop, help);
  return holder;
}

function thumb(): HTMLImageElement {
  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = "Demo clip thumbnail";
  img.src = "/media/demo-frame.gif";
  return img;
}

async function loadIndex(index: number): Promise<void> {
  const response = await fetch(`/api/replay?index=${index}`);
  if (!response.ok) return;
  apply((await response.json()) as Payload, false);
}

function apply(payload: Payload, fromLive: boolean): void {
  current = payload;
  if (!payload.state.ideas[selectedId]) {
    const first = Object.values(payload.state.ideas).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (first) selectedId = first.id;
  }
  if (fromLive && following) {
    /* slider follows the log head via payload.index */
  }
  if (mode === "phone" && !payload.lanes.includes(phoneLane)) phoneLane = payload.lanes[0] ?? "idea";
  paint();
  if (drawerOpen) void fillSpec(selectedId);
}

async function fillSpec(id: string): Promise<void> {
  const host = document.querySelector("#drawer-spec");
  if (!host) return;
  const response = await fetch(`/api/spec?id=${encodeURIComponent(id)}`);
  if (!response.ok) return;
  const spec = (await response.json()) as { markdown: string };
  host.replaceChildren();
  const text = (spec.markdown || "").replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!text) return;
  const preview = text.split("\n").filter((line) => line.trim() && !line.startsWith("#")).slice(0, 4).join(" ");
  if (preview) host.append(el("p", "note", preview.slice(0, 280)));
}

function stopDemo(): void {
  demoGeneration += 1;
  demoAbort?.abort();
  demoAbort = null;
  playing = false;
}

async function play(): Promise<void> {
  if (!current?.entries?.length) return;
  stopDemo();
  const generation = demoGeneration;
  const controller = new AbortController();
  demoAbort = controller;
  playing = true;
  paint();
  try {
    await runDemo(buildDemoSteps(current.entries), {
      pace,
      signal: controller.signal,
      seek: async (index, text, ideaId) => {
        if (generation !== demoGeneration) return;
        caption = text;
        lastCaption = text;
        spotlightId = ideaId;
        if (ideaId) selectedId = ideaId;
        following = false;
        await loadIndex(index);
        if (generation !== demoGeneration) return;
        const lane = ideaId ? current?.state.ideas[ideaId]?.lane : undefined;
        if (lane && lane !== "parked") phoneLane = lane;
        paint();
      },
    });
    if (generation !== demoGeneration) return;
    caption = "";
    spotlightId = null;
    following = true;
    await loadIndex(current?.length ?? 0);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) throw error;
  } finally {
    if (generation === demoGeneration) {
      playing = false;
      played = true;
      caption = "";
      spotlightId = null;
      paint();
    }
  }
}

function jumpLane(lane: Lane): void {
  phoneLane = lane;
  const first = ideasIn(lane)[0];
  if (first) selectedId = first.id;
  drawerOpen = false;
  paint();
}

function moveLane(delta: number): void {
  if (!current) return;
  const lanes = current.lanes.filter((lane) => ideasIn(lane).length > 0);
  const currentLane = current.state.ideas[selectedId]?.lane ?? lanes[0] ?? "idea";
  const index = Math.max(0, lanes.indexOf(currentLane));
  const next = lanes[(index + delta + lanes.length) % lanes.length] ?? currentLane;
  jumpLane(next);
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
    caption = "";
    spotlightId = null;
    following = true;
    void loadIndex(current?.length ?? 0);
    return;
  }
  if (target.closest("#keys")) {
    helpOpen = true;
    paint();
    return;
  }
  if (target.closest("#close-help") || target.closest("[data-close='help']")) {
    helpOpen = false;
    paint();
    return;
  }
  if (target.closest("#close-drawer") || target.closest("[data-close='drawer']")) {
    drawerOpen = false;
    paint();
    return;
  }
  const chip = target.closest<HTMLElement>("[data-lane-jump]");
  if (chip?.dataset.laneJump) {
    jumpLane(chip.dataset.laneJump as Lane);
    return;
  }
  const card = target.closest<HTMLElement>("[data-idea]");
  if (card?.dataset.idea && !target.closest("#drawer")) {
    selectedId = card.dataset.idea;
    drawerOpen = true;
    const lane = current?.state.ideas[selectedId]?.lane;
    if (lane && lane !== "parked") phoneLane = lane;
    paint();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.id !== "replay") return;
  stopDemo();
  caption = "";
  spotlightId = null;
  following = Number(target.value) >= Number(target.max);
  void loadIndex(Number(target.value));
});

document.addEventListener("keydown", (event) => {
  const target = event.target;
  const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
  if (event.key === "Escape") {
    stopDemo();
    drawerOpen = false;
    helpOpen = false;
    caption = "";
    spotlightId = null;
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
    drawerOpen = true;
    paint();
  } else if (event.key === " ") {
    event.preventDefault();
    void play();
  } else if (event.key === "[") {
    stopDemo();
    following = false;
    void loadIndex((current?.index ?? 1) - 1);
  } else if (event.key === "]") {
    stopDemo();
    following = false;
    void loadIndex((current?.index ?? 0) + 1);
  } else if (event.key === "Home") {
    stopDemo();
    following = false;
    void loadIndex(current?.t0 ?? 0);
  } else if (event.key === "End") {
    stopDemo();
    following = true;
    void loadIndex(current?.length ?? 0);
  } else if (event.key === "?") {
    helpOpen = !helpOpen;
    paint();
  } else if (/^[1-6]$/.test(event.key) && current) {
    const lane = current.lanes.filter((item) => item !== "parked")[Number(event.key) - 1];
    if (lane) jumpLane(lane);
  }
});

const stream = new EventSource("/events");
stream.addEventListener("pipeline", (event) => {
  const payload = JSON.parse((event as MessageEvent<string>).data) as Payload;
  if (!following || playing) return;
  apply(payload, true);
});

void fetch("/api/state")
  .then((response) => response.json())
  .then((payload: Payload) => {
    const waiting = Object.values(payload.state.ideas).find((idea) =>
      payload.state.flags.some((flag) => flag.ideaId === idea.id && flag.reason === "awaiting-ok"),
    );
    if (waiting && waiting.lane !== "parked") phoneLane = waiting.lane;
    apply(payload, true);
  });

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${months[date.getUTCMonth()] ?? ""} ${hh}:${mm} UTC`;
}

function button(id: string, text: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  if (id) node.id = id;
  node.textContent = text;
  return node;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
