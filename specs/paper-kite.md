---
idea: paper-kite
title: Paper Kite
---

# Paper Kite

## Goal
Land a card in the draft PR lane with a gold waiting badge.

## User story
As a reviewer, I see which draft is waiting on a manual OK.

## Architecture
The pull record is an observation. The wall never opens or merges it.

## Acceptance tests
1. A draft PR moves the card out of verify.
2. The waiting badge shows while human-ok is not green.
3. The badge is gold and readable on the TV.

## Seat briefs
### types-first
A merged pull cannot also be a draft.
### model-first
The draft lane is the step before merged.
### experience-first
The badge is the thing the office TV is meant to show.
