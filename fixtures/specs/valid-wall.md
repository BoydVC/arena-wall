# Wall piece

## Goal
One screen shows each build as a card moving through idea, spec, seats, verify, draft PR, and merged.

## User story
As a reviewer, I open one URL and see which seat is ahead, which gate is red, and which draft is waiting on a manual OK.

## Architecture
Fixtures, a spec folder, and an opt-in read-only GitHub adapter emit events. A pure reducer folds them. A tiny server sends the log to a single page.

## Acceptance tests
1. The reducer is pure.
2. A weak spec stays out of the seats lane.
3. Replay at the start shows ideas only.
4. The TV page renders every lane with a card.

## Seat briefs
### types-first
Domain types and signatures come before adapters and the page.
### model-first
Allowed hops live in one table the tests read.
### experience-first
The TV wall and the phone layout are usable before the fold is finished.
