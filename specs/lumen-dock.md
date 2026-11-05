---
idea: lumen-dock
title: Lumen Dock
---

# Lumen Dock

## Goal
Show one card that reached merged after a green human-ok gate.

## User story
As a reviewer, I can tell a finished card from one that is still waiting.

## Architecture
Merged is a lane. The fixture sets the gate. The process never calls a write API.

## Acceptance tests
1. Human-ok green is required.
2. The card passes through the draft lane first.
3. The waiting badge clears once the card is merged.

## Seat briefs
### types-first
The winner seat type requires a commit id.
### model-first
Illegal hops raise a flag and do not move the card.
### experience-first
The merged lane stays quiet and green.
