---
id: ADR-0001
title: "Vault provider — Doppler and Infisical over 1Password"
status: accepted
date: 2026-08-12
owners: []
specs:
  - .notes/archive/tech-vault-choice.spec.md
discussion:
  github:
supersedes: []
superseded-by: []
tags: [vault, plugins, secrets]
---

# Vault provider — Doppler and Infisical over 1Password

- Status: accepted
- Date: 2026-08-12

## Context and Problem Statement

The `vault` capability is the only required capability in `holocron`, touched
by every downstream flow (`setup`, `secrets sync`, `secret set`, `doctor`).
The existing `holocron-plugin-1password` shells out to the `op` CLI with
`stdio: inherit`, requiring a desktop app and biometric prompts — incompatible
with CI environments. A REST-first replacement was needed.

## Decision Drivers

- Must work identically on a laptop and in CI without a desktop-app dependency
- Secret grouping by project/env for batch pulls in `secrets sync`
- Free personal tier — this is a personal OSS project
- Machine tokens with narrow scope for CI use
- Validate the `holocron plugin create` scaffolding command via real usage

## Considered Options

- **Doppler** — REST API, free Developer tier, project/config model
- **Infisical cloud** — REST API, open-source, free hosted tier, machine identities
- **1Password** (status quo) — CLI-transport only, biometric TTY, no REST path

## Decision Outcome

Chosen option: **Doppler first, Infisical second (both cloud)**, because both
are REST-first and free for personal use, and building both gives operators a
real swap-in choice via a single `holocron.config.json` change. The 1Password
plugin is retained but no longer the default.

### Positive Consequences

- All plugins are now REST-first — simplifies `holocron plugin create` templates
- Real-world usage of `holocron plugin create` for the Infisical plugin validates the scaffolding command
- Operators can switch vault providers by changing one config line

### Negative Consequences

- Two plugin packages to maintain instead of one
- SaaS dependency on both Doppler and Infisical cloud for the free tiers

## Pros and Cons of the Options

### Doppler

- Good, because REST API is well-documented with a project/config model that maps cleanly to `secrets sync`
- Good, because free Developer tier covers personal use (5 users, unlimited projects/secrets)
- Bad, because SaaS-only — no self-host path; acquisition risk on personal-tier features

### Infisical cloud

- Good, because open-source with a generous free hosted tier
- Good, because machine identities with granular scopes work well in CI
- Good, because the same plugin binary can target cloud or (future) self-host via configurable base URL
- Bad, because adds a second plugin to maintain

### 1Password (status quo)

- Good, because already implemented
- Bad, because `op` CLI dependency — biometric TTY blocks CI use
- Bad, because no REST path — contradicts the REST-first plugin template goal
