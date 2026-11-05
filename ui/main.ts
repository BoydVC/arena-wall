import {
  LANES,
  SEAT_STYLES,
  assertNever,
  flagLabel,
  laneLabel,
  styleLabel,
  type FlagReason,
  type GateStatus,
  type Idea,
  type LogEntry,
  type PipelineState,
  type Seat,
  type SeatStyle,
} from "../core/model.js";
import { parseLogEntry } from "../core/parse.js";
import { ageLabel, project } from "../core/project.js";
import { eventsOf, replay, replayOrigin } from "../core/replay.js";
import { demoGifStatus, scoreSeat, seatDigest, type SeatScore } from "../core/score.js";

function must<T extends Element>(selector: string, kind: new () => T): T {
  const node = document.querySelector(selector);
  if (!(node instanceof kind)) throw new Error(`missing ${selector}`);
  return node;
}

const stage = must("#stage", HTMLElement);
const stats = must("#stats", HTMLElement);
const slider = must("#replay", HTMLInputElement);
const sliderLabel = must("#replay-label", HTMLElement);
const liveButton = must("#live", HTMLButtonElement);
const drawer = must("#drawer", HTMLElement);

const params = new URLSearchParams(location.search);
const forced = params.get("mode");
const narrow = window.matchMedia("(max-width: 700px)").matches;
document.body.dataset.mode = forced === "phone" || (forced !== "tv" && narrow) ? "phone" : "tv";

let entries: LogEntry[] = [];
let nowIso = new Date().toISOString();
let origin = 0;
let follow = true;
let openId: string | undefined;
let drawToken = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Readonly<Record<string, string>> = {},
  ...children: readonly (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
}

function styleShort(style: SeatStyle): string {
  switch (style) {
    case "types-first":
      return "T";
    case "model-first":
      return "M";
    case "experience-first":
      return "E";
    default:
      return assertNever(style);
  }
}

function span(): number {
  return Math.max(0, entries.length - origin);
}

function cursor(): number {
  return origin + Number(slider.value);
}

function currentState(): PipelineState {
  return project(replay(eventsOf(entries), cursor()), nowIso);
}

function strictLeadId(scores: readonly SeatScore[]): string | undefined {
  const ranked = [...scores].sort((a, b) => b.total - a.total || a.seatId.localeCompare(b.seatId));
  const first = ranked[0];
  const second = ranked[1];
  if (!first) return undefined;
  if (second && second.total === first.total) return undefined;
  return first.seatId;
}

function seatsFor(state: PipelineState, ideaId: string): Seat[] {
  const rank = new Map<SeatStyle, number>(SEAT_STYLES.map((style, index) => [style, index]));
  return Object.values(state.seats)
    .filter((seat) => seat.ideaId === ideaId)
    .sort((a, b) => (rank.get(a.style) ?? 0) - (rank.get(b.style) ?? 0));
}

function scoresFor(state: PipelineState, ideaId: string): SeatScore[] {
  const report = state.reports[ideaId];
  const gif = demoGifStatus(state.verifiers[ideaId]?.gates);
  return seatsFor(state, ideaId).map((seat) => scoreSeat(seat, { lintOk: report?.ok === true, demoGif: gif }));
}

function chip(text: string, kind: string): HTMLElement {
  return el("span", { class: `badge ${kind}` }, text);
}

function seatFace(seat: Seat, score: SeatScore | undefined, leadId: string | undefined): HTMLElement {
  const fresh = Date.parse(nowIso) - Date.parse(seat.updatedAt) < 30 * 60 * 1000;
  const attrs: Record<string, string> = { class: fresh ? "seat fresh" : "seat", "data-style": seat.style };
  if (leadId === seat.id) attrs["data-lead"] = "true";
  const raw = seat.verdict === "winner" ? seat.headSha : (seat.headSha ?? "");
  const sha = raw ? raw.slice(0, 7) : "—";
  return el(
    "div",
    attrs,
    el("p", { class: "who" }, el("span", { class: "style-short" }, styleShort(seat.style)), el("span", { class: "style-name" }, styleLabel(seat.style))),
    el("p", { class: "sha" }, sha.slice(0, 7)),
    el("p", { class: "meta" }, `${seat.tests.passed}/${seat.tests.failed} · ${seat.diffLines}`),
    el("p", {}, seat.verdict === "winner" ? "winner" : seat.verdict, score ? ` ${score.total}` : ""),
    leadId === seat.id ? el("p", { class: "lead" }, "Lead") : "",
  );
}

function dots(gates: readonly { status: GateStatus }[] | undefined): HTMLElement {
  const row = el("div", { class: "dots" });
  for (const gate of gates ?? []) {
    row.append(el("i", { class: `dot ${gate.status}`, title: gate.status }));
  }
  return row;
}

function card(state: PipelineState, idea: Idea): HTMLButtonElement {
  const report = state.reports[idea.id];
  const flags = state.flags.filter((flag) => flag.ideaId === idea.id);
  const waiting = flags.some((flag) => flag.reason === "awaiting-ok");
  const blocked = report !== undefined && !report.ok;
  const classes = ["card"];
  if (blocked) classes.push("blocked");
  if (waiting) classes.push("waiting");
  const button = el("button", { class: classes.join(" "), type: "button", "data-idea": idea.id });
  button.append(el("h3", {}, idea.title));
  const notes = idea.signals.map((item) => item.note).join(" · ");
  if (notes) button.append(el("p", { class: "signals" }, notes));
  if (blocked && report) button.append(el("p", { class: "missing" }, `missing: ${report.missing.join(", ")}`));
  const chips = el("div", { class: "chips" });
  if (idea.lane === "merged") chips.append(chip("Merged", "moss"));
  for (const flag of flags) {
    if (flag.reason === "spec-gate" && blocked) continue;
    chips.append(chip(flagLabel(flag.reason), badgeKind(flag.reason)));
  }
  if (chips.childNodes.length > 0) button.append(chips);
  const faces = el("div", { class: "seats" });
  const scores = scoresFor(state, idea.id);
  const lead = strictLeadId(scores);
  for (const seat of seatsFor(state, idea.id)) {
    faces.append(seatFace(seat, scores.find((item) => item.seatId === seat.id), lead));
  }
  if (faces.childNodes.length > 0) button.append(faces);
  button.append(dots(state.verifiers[idea.id]?.gates));
  button.addEventListener("click", () => {
    openId = openId === idea.id ? undefined : idea.id;
    paint();
  });
  return button;
}

function badgeKind(reason: FlagReason): string {
  switch (reason) {
    case "awaiting-ok":
      return "gold";
    case "stale-seat":
      return "amber";
    case "spec-gate":
      return "brick";
    case "illegal-transition":
      return "brick";
    default:
      return assertNever(reason);
  }
}

function renderBoard(state: PipelineState): void {
  const lanes = LANES.filter((lane) => lane !== "parked" || Object.values(state.ideas).some((idea) => idea.lane === lane));
  stage.replaceChildren();
  for (const lane of lanes) {
    const ideas = Object.values(state.ideas)
      .filter((idea) => idea.lane === lane)
      .sort((a, b) => a.title.localeCompare(b.title));
    const column = el("section", { class: "lane", "data-lane": lane });
    column.append(
      el("div", { class: "lane-head" }, el("h2", {}, laneLabel(lane)), el("span", {}, String(ideas.length))),
    );
    for (const idea of ideas) column.append(card(state, idea));
    stage.append(column);
  }
  const ideaCount = Object.keys(state.ideas).length;
  const seatCount = Object.keys(state.seats).length;
  stats.textContent = `${clockLabel(nowIso)} · ${ideaCount} ideas · ${seatCount} seats · ${Object.keys(state.verifiers).length} verifiers`;
}

function clockLabel(iso: string): string {
  const date = new Date(iso);
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

function svgThumb(title: string, dim: boolean): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 320 180");
  svg.setAttribute("class", dim ? "thumb dim" : "thumb");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", dim ? "Demo reel gate is not green" : `Demo reel for ${title}`);
  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  rect.setAttribute("width", "320");
  rect.setAttribute("height", "180");
  rect.setAttribute("fill", "#241f1a");
  const band = document.createElementNS("http://www.w3.org/2000/svg", "rect");
  band.setAttribute("x", "24");
  band.setAttribute("y", "36");
  band.setAttribute("width", "272");
  band.setAttribute("height", "108");
  band.setAttribute("rx", "12");
  band.setAttribute("fill", dim ? "#3c342c" : "#e6b34d");
  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", "40");
  label.setAttribute("y", "92");
  label.setAttribute("fill", dim ? "#f3ecdf" : "#2b2108");
  label.setAttribute("font-size", "28");
  label.setAttribute("font-family", "Inter, sans-serif");
  label.textContent = dim ? "Reel closed" : "Demo reel";
  const sub = document.createElementNS("http://www.w3.org/2000/svg", "text");
  sub.setAttribute("x", "40");
  sub.setAttribute("y", "122");
  sub.setAttribute("fill", dim ? "#b7ab9c" : "#2b2108");
  sub.setAttribute("font-size", "16");
  sub.setAttribute("font-family", "Inter, sans-serif");
  sub.textContent = title;
  svg.append(rect, band, label, sub);
  return svg;
}

async function fillDrawer(state: PipelineState, ideaId: string): Promise<void> {
  const idea = state.ideas[ideaId];
  if (!idea) {
    drawer.hidden = true;
    drawer.replaceChildren();
    return;
  }
  const token = ++drawToken;
  drawer.hidden = false;
  const report = state.reports[ideaId];
  const seats = seatsFor(state, ideaId);
  const scores = scoresFor(state, ideaId);
  const lead = strictLeadId(scores);
  const top = el("div", { class: "drawer-top" });
  top.append(el("h2", {}, idea.title));
  const close = el("button", { class: "close", type: "button", "data-close-drawer": "true" }, "Close");
  close.addEventListener("click", () => {
    openId = undefined;
    paint();
  });
  top.append(close);
  const spec = el("pre", { class: "spec-copy" }, report ? `${report.path}\n` : "Spec file is not linked.");
  const columns = el("div", { class: "diffs" });
  for (const seat of seats) {
    const score = scores.find((item) => item.seatId === seat.id);
    const column = el("section", {});
    if (lead === seat.id) column.setAttribute("data-lead", "true");
    column.append(el("h3", {}, `${styleLabel(seat.style)}${lead === seat.id ? " · Lead" : ""}`));
    column.append(el("p", {}, score ? `score ${score.total}` : "unscored"));
    column.append(el("p", {}, `${ageLabel(seat.updatedAt, nowIso)} · ${seat.verdict}`));
    column.append(el("pre", { class: "digest" }, seatDigest(seat).join("\n")));
    columns.append(column);
  }
  const gateList = el("ul", { class: "gates" });
  for (const gate of state.verifiers[ideaId]?.gates ?? []) {
    gateList.append(el("li", {}, `${gate.name} ${gate.status}`));
  }
  const gif = demoGifStatus(state.verifiers[ideaId]?.gates);
  drawer.replaceChildren(
    top,
    el("h3", {}, "Spec"),
    spec,
    el("h3", {}, "Seat diffs"),
    columns,
    el("h3", {}, "Verifier"),
    gateList,
    el("h3", {}, "Demo reel"),
    svgThumb(idea.title, gif !== "green"),
  );
  if (!idea.specPath) return;
  try {
    const response = await fetch(`/api/spec?path=${encodeURIComponent(idea.specPath)}`);
    if (!response.ok || token !== drawToken) return;
    const text = await response.text();
    if (token !== drawToken) return;
    spec.textContent = text.slice(0, 4000);
  } catch {
    // The report above the fold is enough when the file is unreachable.
  }
}

function paint(): void {
  const max = span();
  slider.max = String(max);
  if (follow) slider.value = String(max);
  if (Number(slider.value) > max) slider.value = String(max);
  const atLive = Number(slider.value) >= max;
  sliderLabel.textContent = atLive ? "live" : Number(slider.value) === 0 ? "t0 · ideas only" : `t${slider.value}`;
  const state = currentState();
  renderBoard(state);
  if (openId) void fillDrawer(state, openId);
  else {
    drawer.hidden = true;
    drawer.replaceChildren();
  }
  document.body.dataset.ready = "true";
}

function syncSpan(nextFollow: boolean): void {
  follow = nextFollow;
  paint();
}

slider.addEventListener("input", () => {
  follow = Number(slider.value) >= span();
  paint();
});

liveButton.addEventListener("click", () => syncSpan(true));

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && openId) {
    openId = undefined;
    paint();
  }
});

function remember(list: readonly unknown[]): void {
  const next: LogEntry[] = [];
  for (const item of list) {
    const parsed = parseLogEntry(item);
    if (parsed) next.push(parsed);
  }
  entries = next;
  origin = replayOrigin(eventsOf(entries));
}

function connect(): void {
  const source = new EventSource("/events");
  source.addEventListener("hello", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { now?: string; entries?: unknown[] };
    if (typeof data.now === "string") nowIso = data.now;
    remember(data.entries ?? []);
    follow = true;
    paint();
  });
  source.addEventListener("append", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { now?: string; entry?: unknown };
    const parsed = parseLogEntry(data.entry);
    if (!parsed) return;
    if (typeof data.now === "string") nowIso = data.now;
    entries.push(parsed);
    if (follow) slider.value = String(span());
    paint();
  });
  source.addEventListener("reset", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as { now?: string; entries?: unknown[] };
    if (typeof data.now === "string") nowIso = data.now;
    remember(data.entries ?? []);
    paint();
  });
}

connect();
