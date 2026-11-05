# Harbor Mint

## Goal
Publish a release checklist the verifier can walk without a person in the loop until the last gate.

## User story
As an operator, I see which verifier gates are still red.

## Acceptance tests
1. Each gate renders red, amber, or green.
2. A missing demo still leaves the card in verify.

## Seat briefs
### types-first
Start from gate enums and exhaustive status checks.
### model-first
Start from the verify lane and the transitions into it.
### experience-first
Start from the gate row and the thumbnail slot.
