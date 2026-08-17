---
title: holocron-skill-config
description: Scaffold a new shareable config package in theholocron/configs.
---

Scaffolds a new `@theholocron/<tool>-config` package in `theholocron/configs`.

**Invoke as:** `/holocron-skill-config`

**Trigger:** user asks to add a new shareable config package to the configs monorepo.

## What it produces

A new `packages/<tool>-config/` directory with all the standard config package boilerplate, pre-wired with catalog dependencies and the shared tsdown/tsconfig setup.

## Key conventions

- Follow the existing lockstep versioning — set `version` to match current release
- Add the package to `.releaserc.json` `prepareCmd` in alphabetical order
- Add a codecov component entry
