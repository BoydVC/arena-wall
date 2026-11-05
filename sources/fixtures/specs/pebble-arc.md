# Pebble Arc

## Goal
A small arc study that already cleared the human gate in the fixture log.

## User story
As an operator, I see one card in the merged lane that a person already accepted.

## Acceptance tests
1. The merged lane is reached only after the human gate is green.
2. The wall does not call a forge write while showing that card.

## Seat briefs
### types-first
Start from the pull request type and the merged flag.
### model-first
Start from the terminal merged state.
### experience-first
Start from the quiet merged card, with no waiting badge.
