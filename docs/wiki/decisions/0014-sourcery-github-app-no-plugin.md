---
id: ADR-0014
title: "Sourcery AI PR review — GitHub App install, not a holocron plugin"
status: accepted
date: 2026-10-12
owners: []
specs:
  - docs/wiki/specifications/tool-checkly-sourcery-adoption.spec.md
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618660154642603
  github: https://github.com/theholocron/holocron/issues/998
supersedes: []
superseded-by: []
tags: [sourcery, code-review, github-app]
---

# ADR-0014 — Sourcery AI PR review: GitHub App install, not a holocron plugin

## Status

Accepted

## Context

Manual review of every PR with Claude works, but doing it on every PR
in this org would exhaust Claude usage for review passes that don't
need a general-purpose agent — a cheaper, automated first pass is a
better fit. Several AI PR-review tools were evaluated (Devin, CodeRabbit,
Sourcery); Sourcery was chosen primarily on pricing and directness of
the GitHub integration.

Unlike Checkly (ADR-0013), Sourcery's entire integration surface with
a repo **is** the GitHub App install — there's no separate project,
environment, dashboard resource, or API credential to provision. The
app is granted repo access through GitHub's own OAuth consent flow,
and from then on it reviews PRs directly; nothing in that flow is a
REST call a capability method could wrap on the operator's behalf.

## Decision Drivers

- **No automatable surface.** `holocron-plugin-*` capabilities wrap a
  vendor's REST (or CLI) API using a credential the operator already
  holds. Sourcery exposes no such API for the install step — the
  install itself is the org/repo-level admin-consent screen, a platform
  action GitHub reserves for a human clicking "Install," not something
  any GitHub App or script can grant on another identity's behalf.
- **Automate first, document as fallback** — but only when there's
  something to automate. Here there genuinely isn't: the vendor
  doesn't expose project creation via API because there is no project.
- **Minimize maintenance surface for zero benefit.** A plugin with no
  real capability method to call (no `ensureProject`, no idempotent
  provisioning step) would be ceremony around a one-time manual
  click.

## Considered Options

- Build a `holocron-plugin-sourcery` capability.
- Manual, one-time GitHub App install — documented, no plugin.
- Skip AI PR review entirely.

## Decision Outcome

Chosen option: **manual GitHub App install**, because there is no
provisioning step to wrap — a plugin would add code with nothing for
that code to automate, and the existing GitHub App install flow
(<https://github.com/apps/sourcery-ai>) already is the entire setup
surface.

### Positive Consequences

- Zero holocron code, zero tests, zero CI surface to maintain for this
  integration.
- Correct abstraction: the capability/provider pattern isn't stretched
  to cover something structurally outside its model (an OAuth consent
  grant, not an API resource).

### Negative Consequences

- Sourcery doesn't show up in `holocron doctor` or capability-compliance
  checks — there's no token to verify, no `whoami()` to call.
- If this org ever adopts another GitHub-App-only vendor, there's no
  shared pattern beyond "install the app, document it" — acceptable,
  since the alternative (a capability-shaped wrapper around nothing) is
  worse, but worth re-checking if a vendor in this category ever _does_
  expose a real provisioning API alongside the app install.

## Trade-offs of the Options

### `holocron-plugin-sourcery`

- Good, because it would match the pattern every other vendor
  integration in this org follows.
- Bad, because there's no real capability method to implement — the
  entire interaction is the GitHub App's own review-comment flow, not
  an API a plugin would call on the operator's behalf.

### Manual GitHub App install

- Good, because it matches exactly what the vendor actually offers —
  no invented abstraction layer.
- Bad, because it's invisible to `holocron doctor`/capability-compliance
  tooling.

### Skip entirely

- Good, because it's zero effort.
- Bad, because it doesn't solve the original problem: manual review on
  every PR risks exhausting Claude usage for no real benefit over an
  automated first pass.

## References

- Issue: #998 (tracks confirming the install is live across the
  intended repos)
