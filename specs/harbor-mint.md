---
idea: harbor-mint
title: Harbor Mint
---

# Harbor Mint

## Goal
Show three seat faces on one card and which face leads the scoreboard.

## User story
As a reviewer, I open the card and compare the three diffs side by side.

## Architecture
Seat events fold into the card. The score uses tests, diff size, lint, and the demo gate.

## Acceptance tests
1. The spec gate is open.
2. Three seat faces are visible.
3. The experience seat leads the scoreboard.

## Seat briefs
### types-first
Types land before the adapters.
### model-first
The lifecycle table is explicit.
### experience-first
The TV layout is what a reviewer actually watches.
