# Arena Wall

One read-only wall for the idea → spec → arena → verified draft pipeline. Every idea is a card. Every seat is a face. A spec gate holds a card out of the seats lane until the spec is whole.

The wall reads. It does not launch agents, and it does not merge.

![Arena Wall replay](demo.gif)

## Two-minute quickstart

From a clean checkout. No token and no environment variables.

**0:00 — install and start**

```bash
npm install
npm start
```

Open [http://127.0.0.1:4173](http://127.0.0.1:4173). The server seeds a synthetic log (6 ideas, 18 catalog seats, 6 catalog verifiers) and serves it on the TV layout.

**0:30 — read the wall**

Six lanes across a dark grey screen, magenta and gold. Nimbus Quill is still an idea. Lumen Fold is red: `missing: acceptance tests, seat briefs`. Comet Lab is in Seats, with experience-first in the lead and one stale seat. Harbor Mint is in Verify. Ridge Owl is in Draft PR with a gold **Awaiting OK** badge. Pebble Arc is Merged.

**1:00 — press Space**

Space plays the day: ideas only, the weak spec, the slide into Seats, experience-first taking the lead, verifier gates flipping, the gold badge, then the replay scrubbing back. `Play demo` does the same. Drag the replay slider to the left for the opening ideas (`t0`) and back to the right for the live fold.

**1:20 — phone**

Open [http://127.0.0.1:4173/?mode=phone](http://127.0.0.1:4173/?mode=phone). One lane at a time, with a switcher along the top. The same cards, faces, and badge.

**1:40 — open a card**

Click Ridge Owl, or press `3` then Enter. The drawer shows the spec, three seat diffs side by side, the verifier gates, and the demo frame. Escape closes it. Arrow keys move between lanes.

**2:00 — you are looking at the live wall**

To reset the local log: `rm -rf .arena-wall` and start again. `ARENA_RESET=1 npm start` reseeds on boot.

Drop a markdown file in `specs/` named after an idea id (`lumen-fold.md` is already the weak note). On save, the wall re-lints it. A whole spec with seat records already on the card slides into Seats.

![Wall at 1920×1080](screenshots/wall-1920x1080.png)

![Wall at 390×844](screenshots/wall-390x844.png)

Square and portrait frames from the same render live next to those: `screenshots/wall-1080x1080.png` and `screenshots/wall-1080x1920.png`.

## Architecture

```mermaid
flowchart LR
  fixtures[fixtures JSON]
  specfs[specs folder]
  github[github GET opt-in]
  log[JSONL event log]
  fold[pure fold]
  wall[wall UI]

  fixtures --> log
  specfs --> log
  github --> log
  log --> fold --> wall
```

```
sources/     read-only adapters: fixtures, specfs, github GET
core/        types, reducer, statechart, spec lint, score, replay
server/      Node HTTP + SSE, no framework
ui/          one page, TV and phone, Space plays the day
cli/         arena-wall serve | lint | snapshot
docs/        lifecycle model
```

Events append to `.arena-wall/events.jsonl`. State is `fold(events)`, then `project(state, now)` for the stale seat and the waiting badge. The same function serves the live wall and the replay slider, so a scrub cannot drift from the model.

The lifecycle is not copied into the code. `core/statechart.ts` loads the transition table in [docs/lifecycle.md](docs/lifecycle.md). [docs/Lifecycle.tla](docs/Lifecycle.tla) lists the same allowed pairs. `npm test` fails if those three disagree.

## Commands

```bash
npm test                 # unit, property, privacy, SSE
npm run typecheck        # tsc --noEmit
npm run test:e2e         # 1920×1080 and 390×844, replay, drawer, Space
npm run demo-director    # 16:9, 1:1, and 9:16 stills, demo.gif, deny scan
npm run check            # unit, e2e, and demo director

npx arena-wall lint sources/fixtures/specs/good-spec.md
npx arena-wall snapshot --out wall.png
```

GitHub is opt-in and GET-only:

```bash
ARENA_SOURCE=github GITHUB_TOKEN=... ARENA_REPO=owner/name npm start
```

If the token or repo is missing, the server stays on fixtures. There is no write route.

## Model notes

These are the places the implementation is more specific than the sketch, or had to step around a conflict:

- The waiting flag is `awaiting-ok`, and the gold badge reads "Awaiting OK". The sketch's flag string contains a deny-listed given name, so that literal is not in the tree.
- A winning seat carries `headSha`. A pull is draft, open, or merged. It cannot be both draft and merged.
- `PipelineState` keeps the latest spec report. The sketch left it only on the event, and the gate has to survive a fold.
- Parked had no event. The model adds `idea.parked` and `idea.reopened`. They are local log events. The fixture week does not use them.
- `lintSpec` `ok` is structural: a goal heading, at least one acceptance item, and seat briefs that name `types-first`, `model-first`, and `experience-first`. Deny-list hits are warnings. The canonical spec passes structurally (10 acceptance tests) and warns, because its policy section names the deny list. That file is not in the repo; committing it would fail the privacy scan.
- Deny tokens are whole words. A substring search would flag the `statechart` module and ordinary words such as "service". The plaintext list is not committed.
- The catalog JSON has 18 seats and 6 verifiers. The legal log admits 15 seats and 3 verifiers. Nimbus Quill has not reached a spec, so its three faces stay "not checked in".
- Stale means `updatedAt` is more than 90 minutes behind the log clock passed to `project(state, now)`, not the laptop clock. Replay stays exact.
- A pull-request payload may say merged. The lane enters `merged` only when the `human-ok` gate is green. The process never sends a forge write.
- Seat rows can be stored while a card is still in Spec. Storage is not admission. Only `tryMove` changes a lane.
- Demo Director v1.1 is not a published package in this environment. `npm run demo-director` renders the wall at 16:9, 1:1, and 9:16, writes `demo.gif`, and fails if the gif is blank or the deny scan hits.
