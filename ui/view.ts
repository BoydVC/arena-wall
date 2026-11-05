import type { Idea, Lane, PipelineState, Seat, SeatStyle } from "../core/model";
import { leadingSeat, rankSeats, scoreSeat } from "../core/score";
import { LANE_LABEL, WALL_LANES } from "../core/statechart";
import type { StoryCard } from "../sources/fixtures/story";

export interface WallModel {
  state: PipelineState;
  cursor: number;
  opening: number;
  max: number;
  selectedId: string;
  drawer: boolean;
  help: boolean;
  caption: string;
  spotlightId: string | null;
  mode: "tv" | "phone";
  phoneLane: Lane;
  story: Record<string, StoryCard>;
}

const STYLE_LABEL: Record<SeatStyle, string> = {
  "types-first": "Types",
  "model-first": "Model",
  "experience-first": "Experience",
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (glyph) => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[glyph] ?? glyph;
  });
}

function lintOk(state: PipelineState, ideaId: string): boolean {
  return state.reports[ideaId]?.ok === true;
}

function seatsFor(state: PipelineState, ideaId: string): Seat[] {
  return rankSeats(
    Object.values(state.seats).filter((seat) => seat.ideaId === ideaId),
    (seat) => lintOk(state, seat.ideaId),
  );
}

function faceHtml(seat: Seat, state: PipelineState, leaderId: string | undefined): string {
  const score = Math.round(scoreSeat(seat, lintOk(state, seat.ideaId)));
  const lead = seat.id === leaderId;
  const sha = seat.headSha ? seat.headSha.slice(0, 7) : "------";
  return `<article class="face${lead ? " lead" : ""}" data-seat="${esc(seat.id)}">
    <div class="score-num">${score}</div>
    <div class="face-copy">
      <div class="face-top"><strong>${esc(STYLE_LABEL[seat.style])}</strong>${lead ? `<span class="lead-tag">Lead</span>` : ""}</div>
      <div class="branch" title="${esc(seat.branch)}">arena/${esc(seat.style)}</div>
      <div class="meta">${seat.tests.passed} pass · ${seat.tests.failed} fail · ${esc(sha)}</div>
    </div>
  </article>`;
}

function gatesHtml(state: PipelineState, ideaId: string): string {
  const verifier = state.verifiers[ideaId];
  if (!verifier) return "";
  const gates = verifier.gates
    .map((gate) => `<span class="gate ${gate.status}" data-gate="${esc(gate.name)}"><i></i>${esc(gate.name)}</span>`)
    .join("");
  const thumb = verifier.gates.some((gate) => gate.name === "demo-gif" && gate.status === "green")
    ? `<img class="thumb" alt="Demo clip thumbnail" src="/media/thumb.svg" />`
    : "";
  return `<div class="gates">${gates}</div>${thumb}`;
}

function cardHtml(idea: Idea, model: WallModel, leaderId: string | undefined): string {
  const report = model.state.reports[idea.id];
  const blocked = report ? !report.ok : false;
  const flags = model.state.flags.filter((flag) => flag.ideaId === idea.id);
  const waiting = flags.some((flag) => flag.reason === "awaiting-signoff");
  const stale = flags.some((flag) => flag.reason === "stale-seat");
  const selected = idea.id === model.selectedId;
  const spot = idea.id === model.spotlightId;
  const faces = seatsFor(model.state, idea.id).map((seat) => faceHtml(seat, model.state, leaderId)).join("");
  const showGates = idea.lane === "verify" || idea.lane === "draft_pr" || idea.lane === "merged";
  const note = idea.signals[0]?.note ?? "";
  const missing = blocked ? `<p class="missing">missing: ${esc(report!.missing.join(", "))}</p>` : "";
  const badge = waiting ? `<p class="badge">awaiting sign-off</p>` : "";
  const quiet = stale ? `<p class="stale">seat went quiet</p>` : "";
  return `<article class="card${blocked ? " blocked" : ""}${spot ? " spotlight" : ""}" data-idea="${esc(idea.id)}" data-selected="${selected ? "true" : "false"}" tabindex="0">
    <h3>${esc(idea.title)}</h3>
    <p class="note">${esc(note)}</p>
    ${badge}
    ${missing}
    ${quiet}
    <div class="faces">${faces}</div>
    ${showGates ? gatesHtml(model.state, idea.id) : ""}
  </article>`;
}

function laneHtml(lane: Lane, model: WallModel, leaderId: string | undefined): string {
  const ideas = Object.values(model.state.ideas)
    .filter((idea) => idea.lane === lane)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title));
  const hidden = model.mode === "phone" && lane !== model.phoneLane ? " hidden" : "";
  const body = ideas.length
    ? ideas.map((idea) => cardHtml(idea, model, leaderId)).join("")
    : `<p class="empty">Open</p>`;
  return `<section class="lane${hidden}" data-lane="${lane}" data-count="${ideas.length}">
    <header class="lane-head"><h2>${esc(LANE_LABEL[lane])}</h2><span>${ideas.length}</span></header>
    ${body}
  </section>`;
}

function diffHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => {
      const kind = line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : "ctx";
      return `<div class="${kind}">${esc(line || " ")}</div>`;
    })
    .join("");
}

function drawerHtml(model: WallModel): string {
  if (!model.drawer) return "";
  const idea = model.state.ideas[model.selectedId];
  if (!idea) return "";
  const card = model.story[idea.id];
  const report = model.state.reports[idea.id];
  const styles: SeatStyle[] = ["types-first", "model-first", "experience-first"];
  const diffs = styles
    .map((style) => {
      const text = card?.diffs[style] ?? "No diff captured.";
      return `<section class="diff-col"><h4>${esc(STYLE_LABEL[style])}</h4><pre class="diff">${diffHtml(text)}</pre></section>`;
    })
    .join("");
  const lint = report
    ? `<p class="${report.ok ? "ok-line" : "missing"}">${report.ok ? "Spec passed the gate." : `missing: ${esc(report.missing.join(", "))}`}</p>`
    : `<p class="note">No spec report yet.</p>`;
  const warnings = report?.warnings.length ? `<ul class="warn">${report.warnings.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>` : "";
  const log = (card?.log ?? ["No log yet."]).map((line) => `<li>${esc(line)}</li>`).join("");
  const verifier = model.state.verifiers[idea.id];
  const gates = verifier ? gatesHtml(model.state, idea.id) : `<p class="note">Verifier has not spoken.</p>`;
  return `<div class="backdrop" data-close="drawer"></div>
    <aside class="drawer" id="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <header class="drawer-head">
        <div>
          <p class="kicker">${esc(LANE_LABEL[idea.lane])}</p>
          <h3 id="drawer-title">${esc(idea.title)}</h3>
        </div>
        <button type="button" id="close-drawer">Close</button>
      </header>
      <section class="drawer-spec">
        <h4>Spec</h4>
        <p>${esc(card?.excerpt ?? idea.signals[0]?.note ?? "")}</p>
        ${lint}
        ${warnings}
      </section>
      <section class="drawer-diffs"><h4>Seat diffs</h4><div class="diff-grid">${diffs}</div></section>
      <section class="drawer-verify"><h4>Verifier</h4>${gates}<ol class="log">${log}</ol></section>
    </aside>`;
}

function helpHtml(open: boolean): string {
  if (!open) return "";
  return `<div class="backdrop" data-close="help"></div>
    <aside class="help" id="help" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <h3 id="help-title">Keys</h3>
      <ul>
        <li><kbd>←</kbd><kbd>→</kbd> change lane</li>
        <li><kbd>Enter</kbd> open the build</li>
        <li><kbd>Esc</kbd> close</li>
        <li><kbd>Space</kbd> play the day</li>
        <li><kbd>[</kbd><kbd>]</kbd> scrub</li>
        <li><kbd>1</kbd>–<kbd>6</kbd> jump to a lane</li>
      </ul>
      <button type="button" id="close-help">Close</button>
    </aside>`;
}

function scoreboard(model: WallModel): string {
  const idea = model.state.ideas[model.spotlightId ?? model.selectedId];
  if (!idea) return `<div id="result" class="scoreboard"><p>Seat race</p></div>`;
  const ranked = seatsFor(model.state, idea.id);
  if (ranked.length === 0) {
    return `<div id="result" class="scoreboard"><p class="kicker">${esc(idea.title)}</p><p>Seats appear once the day moves.</p></div>`;
  }
  const rows = ranked
    .map((seat, index) => {
      const score = Math.round(scoreSeat(seat, lintOk(model.state, seat.ideaId)));
      return `<li class="${index === 0 ? "top" : ""}"><span>${index + 1}</span><strong>${esc(STYLE_LABEL[seat.style])}</strong><em>${score}</em></li>`;
    })
    .join("");
  return `<div id="result" class="scoreboard"><p class="kicker">${esc(idea.title)} · seat race</p><ol>${rows}</ol></div>`;
}

export function renderWall(model: WallModel): string {
  const leader = leadingSeat(Object.values(model.state.seats), (seat) => lintOk(model.state, seat.ideaId));
  const lanes = WALL_LANES.map((lane) => laneHtml(lane, model, leader?.id)).join("");
  const parked = Object.values(model.state.ideas).filter((idea) => idea.lane === "parked");
  const parkedHtml =
    parked.length > 0 ? laneHtml("parked", model, leader?.id) : "";
  const chipLabel: Record<Lane, string> = {
    idea: "Idea",
    spec: "Spec",
    seats: "Seats",
    verify: "Verify",
    draft_pr: "Draft",
    merged: "Merged",
    parked: "Parked",
  };
  const chips = WALL_LANES.map((lane) => {
    const count = Object.values(model.state.ideas).filter((idea) => idea.lane === lane).length;
    const current = model.mode === "phone" && lane === model.phoneLane;
    return `<button type="button" class="chip${current ? " on" : ""}" data-lane-jump="${lane}" aria-pressed="${current ? "true" : "false"}">${esc(chipLabel[lane])} ${count}</button>`;
  }).join("");
  const replayLabel = model.cursor <= model.opening ? "t0" : model.cursor >= model.max ? "now" : "replay";
  const caption = model.caption ? `<p class="caption" role="status">${esc(model.caption)}</p>` : "";
  return `<header class="top">
      <div class="brand">
        <span class="mark" aria-hidden="true"></span>
        <div>
          <h1>Arena Wall</h1>
          <p class="hint">arrows move · enter opens · space plays</p>
        </div>
      </div>
      <div class="actions">
        <span class="live"><i></i> Live</span>
        <time id="clock"></time>
        <button type="button" id="play-demo">Play demo</button>
        <button type="button" id="live">Now</button>
        <button type="button" id="keys">Keys</button>
      </div>
    </header>
    <nav class="switcher" aria-label="Lanes">${chips}</nav>
    <main class="board">${lanes}${parkedHtml}</main>
    <footer class="foot">
      <div class="replay-row">
        <span id="replay-label">${replayLabel}</span>
        <input id="replay" type="range" min="${model.opening}" max="${model.max}" value="${model.cursor}" aria-label="Replay the day" />
        <span>live</span>
      </div>
      ${scoreboard(model)}
    </footer>
    ${caption}
    ${drawerHtml(model)}
    ${helpHtml(model.help)}`;
}
