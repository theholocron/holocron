---
id: ADR-0015
title: "Tooling capability — Postman over Bruno, Insomnia, and Stoplight Elements"
status: accepted
date: 2026-10-13
owners: []
specs: []
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618661484105969
  github: https://github.com/theholocron/holocron/pull/83
supersedes: []
superseded-by: []
tags: [tooling, postman, api-client, retroactive]
---

# ADR-0015 — Tooling capability: Postman over Bruno, Insomnia, and Stoplight Elements

## Status

Accepted

## Context

`holocron-plugin-postman` was scaffolded in #83 (2026-06-30) as part of the
initial v2 capability-based plugin architecture rollout — before this org
started writing an ADR for every vendor choice (the practice itself starts at
ADR-0001, also written after the fact for decisions already in place). No
record exists of why Postman specifically was picked for the `tooling`
capability over any other API-client/workspace tool, or whether alternatives
were even considered. This ADR fills that gap retroactively, prompted by a
direct question about why Bruno, Insomnia, and Stoplight don't appear in any
ADR or spec.

`tooling` as implemented is narrower than "API client": it's **spec/collection/
environment sync into a shared, hosted team workspace**, driven entirely by a
vendor REST API, the same way every other capability in this org works —
`sync()` upserts an OpenAPI spec, re-imports the collection generated from it,
and find-or-creates each configured environment; `doctor()` is a REST auth
probe. It does not run requests (that's Newman/Inso's job, out of scope) and
it does not model local, offline collection files.

## Decision Drivers

- **Automatable surface, same requirement as every other plugin.** The
  capability/provider pattern wraps a vendor's REST API using a credential
  the operator already holds (same reasoning ADR-0014 used to rule Sourcery
  _out_ of this pattern) — a candidate with no comparable hosted-workspace
  management API doesn't fit the model, independent of how good the tool is
  for its own primary use case.
- **Team-shared, hosted workspace.** The actual goal is one canonical spec +
  collection + environment set every engineer and CI job sees the same way,
  provisioned idempotently by `holocron repo setup` — not a personal local
  API-testing tool.
- **Minimize maintenance surface.** One REST wrapper per vendor; the fewer
  vendor-specific quirks to encode, the better.

## Considered Options

- `holocron-plugin-postman` (chosen, already implemented).
- Bruno — git-native, local `.bru` files.
- Insomnia (Kong) — desktop API client, Local Vault / Git Sync / Cloud Sync.
- Stoplight Elements ("Spotlight") — embeddable OpenAPI doc renderer.
- Do nothing — no spec/collection/environment sync at all.

## Decision Outcome

Chosen option: **Postman**, because it's the only candidate whose primary
product _is_ a REST-managed, hosted team workspace (Spec Hub + Collections +
Environments) — exactly the shape `tooling` needs to sync into. None of the
other three options expose a comparable programmatic surface for that job;
two of them aren't solving that problem at all.

### Positive Consequences

- Comprehensive, well-documented REST Management API covers every piece
  `tooling` needs (spec upsert, collection import, environment CRUD) with no
  workarounds.
- Free tier is enough for this org's current single-workspace use — no paid
  gate blocking the capability from working at all (unlike Insomnia's cloud
  sync).
- Consistent operator experience: same `HOLOCRON_`-prefixed token precedence,
  keyring fallback, and `holocron doctor`/`repo setup` integration every
  other plugin gets.

### Negative Consequences

- Postman's own request-running/testing workflow (Newman-equivalent) is out
  of scope for this plugin — `tooling` only manages the shared artifacts, so
  anyone wanting to actually _run_ requests still uses Postman's own app/CLI
  directly, outside holocron.
- Ties this org's canonical spec/collection/environment home to one vendor's
  proprietary hosted format — `specFile` (OpenAPI) is portable, but the
  imported collection and environments are not.

## Trade-offs of the Options

### Postman

- Good, because its REST Management API is a 1:1 match for exactly what
  `tooling` needs to automate — no gap, no workaround.
- Bad, because the canonical collection/environment artifacts it manages are
  locked into a proprietary hosted format once imported.

### Bruno

- Good, because it's fully open-source, free, and the most git-native of any
  option — `.bru` files reviewed in PRs like any other source file.
- Bad, because "no cloud, no account, local files only" is the whole design
  premise — there's no hosted workspace and no REST management API to
  provision at all. This is a structural mismatch with `tooling`'s actual
  job (sync into a _shared_ workspace), the same category of mismatch
  ADR-0013 reasoned through for Checkly's original file-based
  monitoring-as-code approach: a model that doesn't expose a provisionable
  API surface doesn't fit the plugin pattern, independent of the tool's own
  merits for its intended (local, individual) workflow.

### Insomnia

- Good, because the open-source core is free and it covers more protocols
  (GraphQL, gRPC, WebSockets, SSE) than Postman's REST focus.
- Bad, because team collaboration (the part `tooling` actually needs) is a
  paid Cloud Sync / Kong Konnect feature with no comparable public REST
  management API for spec/collection/environment provisioning — Git Sync
  avoids the paywall but shifts the model to "files in a repo," the same
  structural mismatch as Bruno.

### Stoplight Elements ("Spotlight")

- Good, because it produces genuinely excellent interactive API reference
  docs from an OpenAPI spec with zero backend.
- Bad, because it's not a competing option at all — it's a documentation
  _renderer_, not a workspace/collection/environment manager. It solves a
  different problem (presenting a spec beautifully) than the one `tooling`
  exists for (keeping a shared spec/collection/environment set in sync). A
  future `wiki`/`docs` capability is a more natural home for it than
  `tooling`, if this org ever wants it.

### Do nothing

- Good, because it's zero effort.
- Bad, because engineers and CI would fall back to manually keeping a
  Postman (or any) workspace in sync by hand, the exact drift this
  capability exists to prevent.

## References

- PR: #83 (original implementation — predates the ADR practice)
- `plugins/holocron-plugin-postman/README.md` — current capability
  surface and config shape
- ADR-0013 — same "does the vendor expose a provisionable API surface at
  all" reasoning, applied to Checkly's monitoring-as-code vs. plugin choice
- ADR-0014 — same "automatable surface" decision driver, applied to
  Sourcery's GitHub-App-only integration
