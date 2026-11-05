---
idea: comet-lab
title: Comet Lab
---

# Comet Lab

## Goal
Turn the thin note into a spec the seats lane will accept.

## User story
As a reviewer, I fix the note and watch the card slide into seats.

## Architecture
The folder watcher emits a lint event. A passing report is the only way into seats.

## Acceptance tests
1. The missing sections are gone.
2. The card leaves the spec lane.
3. Seat faces stay on the card.

## Seat briefs
### types-first
The report type keeps missing and warnings apart.
### model-first
Spec to seats is the only hop that checks the report.
### experience-first
The card turns green and slides.
