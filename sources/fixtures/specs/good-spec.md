# Ridge Desk

## Goal
Show one operator every build that is waiting on a gate, without starting a new one.

## User story
As an operator, I open one screen and see which spec is holding a card back.

## Architecture
Read-only adapters fold into one pipeline state. The wall renders that state.

## Acceptance tests
1. The wall loads a fixture log with no environment variables set.
2. A spec missing its tests is refused at the gate.
3. Replay at the opening prefix shows every card in the idea lane.
4. A draft card stays a draft until the human gate is green.

## Seat briefs
### types-first
Start from the domain types and make a winning seat carry its commit.
### model-first
Start from the lifecycle table and generate the transition tests from it.
### experience-first
Start from the wall, the phone layout, and the replay slider.
