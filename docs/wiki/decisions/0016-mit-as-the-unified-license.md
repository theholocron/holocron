---
id: ADR-0016
title: "License — MIT for the whole monorepo"
status: accepted
date: 2026-10-29
owners: []
specs:
  - .notes/tech-monorepo-consolidation.spec.md
discussion:
  github: https://github.com/theholocron/holocron/issues/1206
supersedes: []
superseded-by: []
tags: [license, monorepo, consolidation]
---

# ADR-0016 — License: MIT for the whole monorepo

- Status: accepted
- Date: 2026-10-29

## Context and Problem Statement

The org's repos are licensed differently. `holocron`, `observability` and
`skills` are MIT;
`clients`, `configs`, `utils` and the docs themes are GPL-3.0. The monorepo
consolidation
(#1200) folds them into one repository with one root `LICENSE`, so one license
has to be
chosen before the GPL-licensed groups are imported.

The mix is already a problem: MIT packages (`cli`, `astromech`, `datapad`,
`sentinel`, the
plugins) depend at runtime on GPL-3.0 libraries (`env-utils`, `fs-utils`,
`github-client`,
`http-client`, ...).

## Decision Drivers

- One repo should have one license, stated once at the root.
- The libraries are meant to be consumed by other projects; a copyleft license
  on a library
  extends to everything that links it.
- The maintainer holds every human commit, so relicensing needs no one else's
  consent.
- Published versions have already shipped under their original licenses and
  cannot change.

## Considered Options

- MIT everywhere
- GPL-3.0 everywhere
- Keep each folder's current license (MIT and GPL-3.0 side by side)

## Decision Outcome

Chosen option: **MIT everywhere**, with the copyright line `Copyright (c) 2026
Newton
Koumantzelis`, because it is permissive enough for the libraries to be consumed
freely and it
makes the existing MIT-on-GPL dependencies consistent.

Checked before deciding: `iamnewton` holds all human commits (bots hold the
rest), no
third-party code was found in the repos, and no third-party GPL or AGPL runtime
dependency
constrains the choice.

### Positive Consequences

- One `LICENSE` at the root; no per-folder license files to maintain.
- Consumers of `clients`, `configs` and `utils` are no longer bound by copyleft.
- The runtime dependency of MIT packages on GPL libraries is gone.

### Negative Consequences

- Published GPL-3.0 versions stay GPL-3.0 on npm; only new releases are MIT.
- MIT does not protect against closed-source forks the way GPL-3.0 would.

## Trade-offs of the Options

### MIT everywhere

- Good, because the libraries are consumable by any project and the license is
  simple.
- Bad, because it gives up copyleft protection.

### GPL-3.0 everywhere

- Good, because it keeps derivative work open.
- Bad, because it would encumber everything that depends on the libraries,
  including the
  org's own MIT packages and their users.

### Keep each folder's license

- Good, because no relicensing work is needed.
- Bad, because one repo then carries two licenses, the root `LICENSE` cannot
  describe it, and
  the MIT-on-GPL runtime dependencies stay.

## Implementation

- The `license` field of each package changes to MIT **at import time**, so the
  monorepo never
  publishes a GPL-labelled release (#1209, #1210, #1211, #1212).
- The final cleanup removes leftover per-folder `LICENSE` files and confirms no
  package still
  says GPL-3.0 (#1214).
- The repos that stay separate (templates, `.github`, `.github-private`,
  `theholocron.github.io`,
  `components`, `themes`) are relicensed in one pass (#1230).
