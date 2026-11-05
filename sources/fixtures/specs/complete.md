# SPEC — Lumen Yard

## 1. Goal
One readable wall for a build moving from a sketch to a draft pull request. A keeper opens a single screen, sees which lane each build is in, and can tell a weak spec before any seat spends time on it.

## 2. User story
As a keeper, I open one screen on the office wall. I see each build started this week, which seat is ahead, which verifier gate is red, and which drafts are waiting on a sign-off.

## 6. Acceptance tests
1. The unit suite passes and the reducer is pure.
2. A spec with no goal is refused.
3. A spec with no acceptance tests is refused.
4. A spec with no seat briefs is refused.
5. Illegal lane moves raise a flag and leave the card where it is.
6. Merged stays unreachable until the sign-off gate is green.
7. The wall serves fixture data with no token set.
8. A replay at the start shows only ideas.
9. Phone and wide layouts keep every lane readable.
10. The demo clip shows the seat race and the draft badge.

## 7. Arena seat briefs
### types-first
Start from the types. A winning seat must name its commit. Illegal combinations should not fit in the type.

### model-first
Start from the lifecycle table. The code and the table share one edge list.

### experience-first
Start from the wall. Lanes, seat faces, and gate flips have to read from across the room, then the logic catches up.
