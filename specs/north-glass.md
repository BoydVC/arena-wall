---
idea: north-glass
title: North Glass
---

# North Glass

## Goal
Show verifier gates flipping, including a demo reel thumbnail.

## User story
As a reviewer, I see which gate is still amber before a draft PR exists.

## Architecture
The verifier record is read-only. A green human-ok gate is the only way into merged.

## Acceptance tests
1. Tests, lint, demo reel, and privacy can go green independently.
2. The demo reel draws a thumbnail when its gate is green.
3. Merged stays closed while human-ok is amber.

## Seat briefs
### types-first
Gate names are a closed union.
### model-first
Verify is the only hop into a draft PR.
### experience-first
Gate dots and the thumbnail read at a glance.
