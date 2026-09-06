---
id: ADR-0005
title: "npm publishing strategy — OIDC Trusted Publishers over staged publishing"
status: accepted
date: 2026-09-05
owners: []
specs: []
discussion:
  github:
supersedes: []
superseded-by: []
tags: [release, npm, ci, oidc, security]
---

# npm publishing strategy — OIDC Trusted Publishers over staged publishing

- Status: accepted
- Date: 2026-09-05

## Context and Problem Statement

npm introduced staged publishing in May 2026, which holds a package in a
queue until a maintainer approves it with 2FA before it goes live. This was
evaluated as a potential replacement for or complement to the current OIDC
Trusted Publishers approach used in the release workflow. A decision was needed
on whether to adopt staged publishing now or continue with the existing approach.

## Decision Drivers

- Release workflow must be fully automated — "merge to main = shipped" is a
  core invariant; breaking that loop adds friction to a personal OSS project
- The OIDC setup has known failure modes documented in AGENTS.md (pnpm
  `ENEEDAUTH`, `registry-url` poisoning `~/.npmrc`, npm prefix writing)
- Staged publishing requires npm CLI ≥ 11.15.0 and Node ≥ 22.14.0 — currently
  within range but an additional constraint to track
- semantic-release drives all releases; its publish step calls `npm publish`
  directly — switching to `npm stage publish` would require a custom plugin or
  wrapper

## Considered Options

- **Keep OIDC Trusted Publishers (status quo)** — CI authenticates via GitHub
  OIDC token exchange; `semantic-release` publishes directly on merge to main
- **Switch to staged publishing + OIDC** — CI stages the release; a maintainer
  approves with 2FA before it goes live; removes the "merge = live" invariant
- **Switch to staged publishing + automation token** — replaces OIDC entirely;
  CI uses a narrow "stage-only" token; avoids the pnpm/OIDC auth issues
  documented in AGENTS.md

## Decision Outcome

Chosen option: **Keep OIDC Trusted Publishers (status quo)**, because the
existing workflow is working, the known OIDC failure modes have documented
workarounds in AGENTS.md, and staged publishing would break the automated
release loop that semantic-release depends on.

Monitor for regressions: if pnpm OIDC auth failures recur (ENEEDAUTH, stale
`~/.npmrc` cache, token exchange failures), re-evaluate staged publishing +
automation token as a drop-in fix that avoids OIDC entirely.

### Positive Consequences

- No changes to the release workflow or semantic-release config
- Fully automated releases remain intact
- No new npm CLI version constraint to manage

### Negative Consequences

- OIDC auth failure modes remain latent — they are worked around, not removed
- No human approval gate before packages go live (acceptable for a personal
  OSS project; less acceptable if the project grows)

## Pros and Cons of the Options

### Keep OIDC Trusted Publishers (status quo)

- Good, because fully automated — semantic-release publishes on merge with no
  manual step
- Good, because no changes to tooling or workflow required
- Bad, because OIDC + pnpm has known failure modes: `npm config set prefix`
  writes to `~/.npmrc` and breaks pnpm's OIDC token exchange; `registry-url`
  in `setup-node` causes `ENEEDAUTH`; caching `~/.npm-global` restores stale
  auth — all documented in AGENTS.md
- Bad, because a misconfigured workflow could publish a bad release without a
  human gate

### Switch to staged publishing + OIDC

- Good, because adds a 2FA approval gate before packages go live
- Good, because CI token only needs "stage" permission, not "publish"
- Bad, because breaks the "merge = shipped" release loop — a maintainer must
  manually approve every release
- Bad, because requires semantic-release to call `npm stage publish` instead
  of `npm publish`, which needs a custom plugin or wrapper
- Bad, because adds npm CLI ≥ 11.15.0 and Node ≥ 22.14.0 as hard requirements

### Switch to staged publishing + automation token

- Good, because removes OIDC entirely — sidesteps all pnpm/OIDC auth failure
  modes documented in AGENTS.md
- Good, because automation token is simpler to configure than OIDC in pnpm
  workspaces
- Bad, because introduces a long-lived token that must be rotated and stored
  (vs. OIDC's ephemeral tokens)
- Bad, because still breaks the "merge = shipped" loop unless the automation
  token is granted full publish permission (defeating the staged-publishing
  security benefit)
