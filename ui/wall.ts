import { diffText } from "../core/score.ts";
import type { Gate, Idea, Seat, SeatStyle, SpecReport, Verifier } from "../core/types.ts";

interface Payload {
  now: string;
  t0: number;
  length: number;
  index: number;
  at: string;
  source: string;
  lanes: string[];
  labels: Record<string, string>;
  styles: SeatStyle[];
  scores: Record<string, number>;
  leads: Record<string, string | null>;
  state: {
    ideas: Record<string, Idea>;
    seats: Record<string, Seat>;
    verifiers: Record<string, Verifier>;
    specs: Record<string, SpecReport>;
    flags: Array<{ ideaId: string; reason: string }>;
  };
}

const STYLE_SHORT: Record<string, string> = {
  "types-first": "Type",
  "model-first": "Model",
  "experience-first": "Exp",
};

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`wall markup is missing ${selector}`);
  return node;
}

const board = required<HTMLElement>("#board");
const slider = required<HTMLInputElement>("#replay");
const readout = required<HTMLElement>("#replay-readout");
const clock = required<HTMLTimeElement>("#clock");
const sourceEl = required<HTMLElement>("#source");
const liveDot = required<HTMLElement>("#live-dot");
const liveBtn = required<HTMLButtonElement>("#live-btn");
const drawer = required<HTMLElement>("#drawer");
const drawerTitle = required<HTMLElement>("#drawer-title");
const drawerBody = required<HTMLElement>("#drawer-body");
const drawerClose = required<HTMLButtonElement>("#drawer-close");

let following = true;
let current: Payload | null = null;
let openId: string | null = null;

liveBtn.addEventListener("click", () => {
  following = true;
  slider.value = slider.max;
  void loadIndex(Number(slider.max));
});

slider.addEventListener("input", () => {
  const index = Number(slider.value);
  following = index >= Number(slider.max);
  void loadIndex(index);
});

drawerClose.addEventListener("click", closeDrawer);
drawer.addEventListener("click", (event) => {
  if (event.target === drawer) closeDrawer();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeDrawer();
});

const stream = new EventSource("/events");
stream.addEventListener("pipeline", (event) => {
  const payload = JSON.parse((event as MessageEvent<string>).data) as Payload;
  if (!following) {
    noteLength(payload);
    return;
  }
  apply(payload, true);
});

void fetch("/api/state")
  .then((response) => response.json())
  .then((payload: Payload) => apply(payload, true));

async function loadIndex(index: number): Promise<void> {
  const response = await fetch(`/api/replay?index=${index}`);
  const payload = (await response.json()) as Payload;
  apply(payload, false);
}

function noteLength(payload: Payload): void {
  slider.max = String(payload.length);
  slider.min = String(payload.t0);
}

function apply(payload: Payload, fromLive: boolean): void {
  current = payload;
  sourceEl.textContent = payload.source;
  clock.textContent = formatClock(payload.now);
  clock.dateTime = payload.now;
  slider.min = String(payload.t0);
  slider.max = String(Math.max(payload.length, payload.t0));
  if (fromLive && following) slider.value = String(payload.index);
  readout.textContent = `${payload.index}/${payload.length}`;
  liveDot.textContent = following ? "Live" : "Scrub";
  liveDot.classList.toggle("is-scrub", !following);
  renderBoard(payload);
  if (openId) void renderDrawer(openId);
}

function renderBoard(payload: Payload): void {
  board.replaceChildren();
  const ideas = Object.values(payload.state.ideas);
  for (const lane of payload.lanes) {
    const column = el("section", "lane");
    column.dataset.laneColumn = lane;
    const header = el("header");
    header.append(el("h2", undefined, payload.labels[lane] ?? lane));
    const inLane = ideas.filter((idea) => idea.lane === lane);
    const count = el("span", "count", String(inLane.length));
    count.dataset.count = lane;
    header.append(count);
    const cards = el("div", "cards");
    cards.dataset.cards = lane;
    if (inLane.length === 0) cards.append(el("p", "empty", "None"));
    for (const idea of inLane) cards.append(renderCard(payload, idea));
    column.append(header, cards);
    board.append(column);
  }
}

function renderCard(payload: Payload, idea: Idea): HTMLButtonElement {
  const flags = payload.state.flags.filter((flag) => flag.ideaId === idea.id);
  const report = payload.state.specs[idea.id];
  const button = document.createElement("button");
  button.className = "card";
  button.dataset.idea = idea.id;
  button.dataset.lane = idea.lane;
  if (flags.some((flag) => flag.reason === "spec-gate") || (report && !report.ok)) button.classList.add("is-gate");
  if (flags.some((flag) => flag.reason === "awaiting-ok")) button.classList.add("is-wait");
  if (idea.lane === "merged") button.classList.add("is-merged");
  button.append(el("h3", "card-title", idea.title));
  const signal = idea.signals[0];
  if (signal) button.append(el("p", "signal", signal.note));
  if (report && !report.ok) button.append(el("p", "banner", `missing: ${report.missing.join(", ")}`));
  if (flags.some((flag) => flag.reason === "awaiting-ok")) button.append(el("span", "badge", "awaiting review"));
  if (flags.some((flag) => flag.reason === "stale-seat")) button.append(el("p", "meta", "stale seat"));

  const faces = el("div", "faces");
  for (const style of payload.styles) {
    const seat = Object.values(payload.state.seats).find((item) => item.ideaId === idea.id && item.style === style);
    faces.append(renderFace(payload, idea, style, seat));
  }
  button.append(faces);

  const verifier = payload.state.verifiers[idea.id];
  if (verifier) button.append(renderDots(verifier));
  if (verifier?.gates.some((gate) => gate.name === "demo-gif" && gate.status === "green")) {
    const img = document.createElement("img");
    img.className = "thumb";
    img.src = "/media/demo-frame.gif";
    img.alt = "Demo thumbnail";
    button.append(img);
  }

  button.addEventListener("click", () => {
    openId = idea.id;
    void renderDrawer(idea.id);
  });
  return button;
}

function renderFace(payload: Payload, idea: Idea, style: SeatStyle, seat: Seat | undefined): HTMLElement {
  const face = el("div", "face");
  face.dataset.face = `${idea.id}:${style}`;
  if (!seat) {
    face.classList.add("waiting");
    face.dataset.seatState = "waiting";
    face.append(el("span", "style", STYLE_SHORT[style] ?? style));
    const branch = el("span", "branch", `arena/${style}`);
    const stat = el("span", "stat", "not checked in");
    const wrap = el("span");
    wrap.append(branch, document.createElement("br"), stat);
    face.append(wrap);
    return face;
  }
  face.classList.add("live");
  face.dataset.seatState = "live";
  if (payload.leads[idea.id] === seat.id) {
    face.classList.add("lead");
    face.dataset.lead = "true";
  }
  const age = Date.parse(payload.now) - Date.parse(seat.updatedAt);
  if (age > 90 * 60 * 1000) face.classList.add("stale");
  if (idea.lane === "idea" || idea.lane === "spec" || idea.lane === "parked") face.classList.add("held");
  face.append(el("span", "style", STYLE_SHORT[style] ?? style));
  const wrap = el("span");
  wrap.append(
    el("span", "branch", seat.branch),
    document.createElement("br"),
    el("span", "sha", seat.headSha ?? "no commit"),
    document.createElement("br"),
    el("span", "stat", `${seat.tests.passed}/${seat.tests.failed} · ${payload.scores[seat.id] ?? "–"} · ${seat.verdict}`),
  );
  face.append(wrap);
  return face;
}

function renderDots(verifier: Verifier): HTMLElement {
  const row = el("div", "gates");
  for (const gate of verifier.gates) {
    const dot = el("span", `dot ${gate.status}`);
    dot.title = `${gate.name} ${gate.status}`;
    dot.dataset.gate = gate.name;
    row.append(dot);
  }
  return row;
}

async function renderDrawer(id: string): Promise<void> {
  if (!current) return;
  const idea = current.state.ideas[id];
  if (!idea) return;
  drawer.hidden = false;
  drawerTitle.textContent = idea.title;
  drawerBody.replaceChildren();
  const report = current.state.specs[id];
  if (report && !report.ok) drawerBody.append(el("p", "banner", `missing: ${report.missing.join(", ")}`));
  const response = await fetch(`/api/spec?id=${encodeURIComponent(id)}`);
  const spec = (await response.json()) as { markdown: string; report: SpecReport | null };
  const specHost = el("div", "spec");
  renderMarkdown(specHost, spec.markdown || "No spec file yet.");
  drawerBody.append(specHost);

  const cols = el("div", "cols");
  for (const style of current.styles) {
    const seat = Object.values(current.state.seats).find((item) => item.ideaId === id && item.style === style);
    const col = el("section", "col");
    col.append(el("h3", "md-h", style));
    const pre = el("pre", "diff");
    pre.textContent = seat ? diffText(seat) : "Seat has not checked in.";
    col.append(pre);
    cols.append(col);
  }
  drawerBody.append(cols);

  const verifier = current.state.verifiers[id];
  if (verifier) {
    drawerBody.append(el("h3", "md-h", "Verifier"));
    for (const gate of verifier.gates) {
      const row = el("div", "gate-row");
      row.append(el("span", undefined, gate.name), el("span", undefined, gate.status));
      drawerBody.append(row);
    }
    if (verifier.gates.some((gate: Gate) => gate.name === "demo-gif" && gate.status === "green")) {
      const img = document.createElement("img");
      img.className = "thumb";
      img.src = "/media/demo-frame.gif";
      img.alt = "Demo thumbnail";
      drawerBody.append(img);
    }
  }
}

function renderMarkdown(host: HTMLElement, markdown: string): void {
  host.replaceChildren();
  let list: HTMLUListElement | null = null;
  for (const raw of markdown.split(/\n/)) {
    const line = raw.trimEnd();
    if (line.includes("<!--")) continue;
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading?.[2]) {
      list = null;
      host.append(el("h3", "md-h", heading[2]));
      continue;
    }
    const item = /^\s*(?:\d+\.|[-*])\s+(.*)$/.exec(line);
    if (item?.[1]) {
      if (!list) {
        list = document.createElement("ul");
        host.append(list);
      }
      const li = document.createElement("li");
      li.textContent = item[1];
      list.append(li);
      continue;
    }
    if (!line.trim()) {
      list = null;
      continue;
    }
    list = null;
    host.append(el("p", "md-p", line));
  }
}

function closeDrawer(): void {
  drawer.hidden = true;
  openId = null;
}

function formatClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${dd} ${months[date.getUTCMonth()] ?? ""} ${hh}:${mm} UTC`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
