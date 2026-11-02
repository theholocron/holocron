---
id: ADR-0013
title: "Checkly uptime monitoring — holocron plugin over monitoring-as-code CLI"
status: accepted
date: 2026-10-12
owners: []
specs:
  - docs/wiki/specifications/tool-checkly-sourcery-adoption.spec.md
discussion:
  url: https://discord.com/channels/1303969001822486568/1566618658535374918
  github: https://github.com/theholocron/holocron/pull/997
supersedes: []
superseded-by: []
tags: [monitoring, checkly, plugin, sentinel]
---

# ADR-0013 — Checkly uptime monitoring: holocron plugin over monitoring-as-code CLI

## Status

Accepted

## Context

Nothing watches whether Sentinel's deployed webhook function
(`sentinel.theholocron.dev/api/webhook`) is actually reachable —
Sentry/Axiom are both reactive (error-on-occurrence, log aggregation),
not proactive. Checkly (free Hobby tier) was chosen to close that gap
with one API check: GET the endpoint, assert a `405` (confirmed live
that `handleWebhookRequest` declines non-POST before touching any
webhook-specific logic, so a clean 405 proves the function is deployed
and routing correctly).

The first implementation (#997, superseded by this ADR) was
deliberately **not** a holocron plugin: `checkly.config.ts` +
`__checks__/*.check.ts`, deployed via Checkly's own CLI
(`checkly deploy`) from a hand-maintained `.github/workflows/checkly.yml`.
The reasoning at the time — Checkly's monitoring-as-code model doesn't
fit the capability/provider pattern, which exists to solve multi-repo
provisioning, and this is one check for one endpoint in one repo — held
up on its own terms, but missed that the capability/provider pattern
buys more than multi-repo provisioning: the same `HOLOCRON_` token
precedence, OS keyring, `holocron doctor` smoke checks, and
`holocron repo setup` idempotent provisioning every other vendor
integration in this org gets for free. The file-based path bypassed
all of it — raw `CHECKLY_API_KEY` repo secret, `CHECKLY_ACCOUNT_ID`
repo variable, a one-off workflow outside the task-manifest/thin-caller
system the rest of CI uses.

## Decision Drivers

- **Operator-experience consistency.** Every other vendor integration
  in this org is a plugin — carving out an exception for Checkly means
  a different auth story, no `holocron doctor` check, no
  `holocron repo setup` provisioning, for no reason tied to Checkly
  specifically.
- **Extensibility.** A vendor-neutral `monitoring` capability
  (lowercase, generic assertion/comparison enums) lets a future
  provider — Datadog, Pingdom, UptimeRobot — implement the same shape
  without redesigning anything.
- **Secret handling parity.** Doppler + `HOLOCRON_` prefix + keyring is
  the established pattern (ADR-0001, ADR-0003) for every secret in this
  org; a file-based deploy tied to raw GitHub Actions secrets sidesteps
  that pathway entirely.
- **Ship now, don't block on cross-repo sequencing.** A typed
  `@theholocron/checkly-client` package was still unpublished at
  implementation time (`theholocron/clients#393`/`#394`) — the plugin
  ships with an inline `createRestClient` wrapper today and migrates
  once the client publishes, per the documented two-phase plugin
  pattern, rather than blocking the whole feature on a cross-repo
  publish.

## Considered Options

- File-based monitoring-as-code (`checkly.config.ts` + Checkly CLI
  deploy) — the original #997 implementation.
- Holocron plugin: new vendor-neutral `monitoring` capability,
  implemented by `@theholocron/holocron-plugin-checkly`.
- Do nothing — no automated proactive check at all.

## Decision Outcome

Chosen option: **holocron plugin**, because the capability/provider
pattern's value isn't limited to multi-repo provisioning — the
consistent operator experience (auth, doctor, setup) it buys for every
other vendor was being denied to Checkly for a reason (one check, one
repo) that doesn't actually conflict with being a plugin.

New `monitoring` capability
(`packages/cli/src/plugin/capabilities.ts`): vendor-neutral
`MonitoringAssertionSource`/`MonitoringAssertionComparison` enums,
`checks: readonly MonitoringCheckInput[]` populated from the provider
config tuple (the same place `Deployment.domain` comes from), a
required `ensureCheck(input)`, and an optional `whoami()` for
`holocron doctor`. Wired into `doctor` and `run-setup`'s existing
generic capability loops — no new orchestration machinery needed.

`holocron-plugin-checkly` implements it against Checkly's real REST
API (verified live via the OpenAPI spec): find-by-exact-name (Checkly's
own `search` query param is a partial match, filtered client-side) then
create-or-update; `verifyToken` hits `GET /accounts`, the one endpoint
that doesn't require the `x-checkly-account` header every other
endpoint needs.

### Related sub-decisions

- **Secret storage: Doppler.** Same `sentinel`/`prd` Doppler project
  every other Sentinel secret already lives in (ADR-0001) — fanned out
  to `HOLOCRON_CHECKLY_TOKEN` by `holocron secrets sync`, not a new
  vault.
- **Token type: regular User API key, not Service API key.** Checkly's
  account-scoped Service API keys survive personnel changes and carry
  granular roles, but require the Starter tier or above — not available
  on the free Hobby tier this account is on today. Revisit if/when the
  account upgrades.
- **Env var naming: `HOLOCRON_CHECKLY_TOKEN` / `CHECKLY_API_KEY`.**
  Matches the existing `HOLOCRON_<VENDOR>_TOKEN` convention (e.g.
  `HOLOCRON_VERCEL_TOKEN`) for the Holocron-side name, and Checkly's own
  native env var name (used by Checkly's own CLI) for the vendor-side
  fallback — not `_API_TOKEN`, which would match neither convention.

### Positive Consequences

- Consistent auth story: `--token` → `HOLOCRON_CHECKLY_TOKEN` →
  `CHECKLY_API_KEY` → OS keyring, identical precedence to every other
  plugin.
- `holocron doctor` can smoke-check Checkly auth; `holocron repo setup`
  idempotently provisions the configured check(s).
- A future second monitoring vendor is a new plugin implementing the
  same `Monitoring` interface, not a new one-off pattern.

### Negative Consequences

- More code and tests to maintain (REST wrapper, capability class,
  28 tests) than Checkly's own zero-config CLI would have needed.
- Checkly's own project-level concepts (`projectName`, `logicalId`,
  default `tags`) aren't modeled 1:1 — only what one API check needs
  today. `locations` and `shouldFail` _are_ modeled, both required (not
  optional) for this specific check: `locations` because Checkly
  rejects a check with neither `locations` nor `privateLocations` set
  (confirmed live via a 400 on the first real `holocron repo setup`
  run against a trial account with no account-level default);
  `shouldFail` because Checkly classifies any response >= 400 as a
  platform-level failure before assertions are evaluated at all
  (confirmed live: the check reported `hasFailures: true` with the
  status-code assertion matching exactly — `actual: 405` ===
  `target: "405"`, no assertion-level error). `body` is also now
  modeled (optional) — lets a check send a request body, e.g.
  simulating a webhook delivery with no valid signature to verify
  auth/signature checking end-to-end rather than only that the
  endpoint is reachable. Revisit the rest if
  browser checks, heartbeats, or per-tag defaults become necessary.
- The inline REST wrapper (`src/rest.ts`) duplicated
  `@theholocron/checkly-client`'s shape until that package published —
  resolved as of `@theholocron/checkly-client@1.40.0`; `rest.ts` now
  re-exports from it directly.

## Trade-offs of the Options

### File-based monitoring-as-code

- Good, because it's Checkly's own idiomatic path — zero plugin code,
  fastest to ship.
- Bad, because it bypasses the org's established secret-handling
  pattern (`HOLOCRON_` prefix, keyring, Doppler), has no
  `holocron doctor`/`repo setup` integration, and lives in a
  hand-maintained workflow outside the task-manifest/thin-caller system
  the rest of CI uses.

### Holocron plugin

- Good, because it gets the same auth/doctor/setup experience every
  other vendor integration gets, and opens the door to future
  monitoring vendors via one shared capability shape.
- Bad, because it's more code than the vendor's own CLI needed, and
  (at implementation time) shipped with a temporary inline REST
  wrapper pending the typed client's publish.

### Do nothing

- Good, because it's zero effort.
- Bad, because it doesn't solve the actual problem — Sentinel can go
  fully unreachable with no alert from anything in this org's
  monitoring stack.

## References

- Issue: #996 (tracks the remaining human step — Checkly account
  creation, `accountId` fill-in)
- PR: #997 (original file-based implementation, then evolved into this
  plugin on the same branch)
- `theholocron/clients#393`/`#394` — `@theholocron/checkly-client`,
  published as `1.40.0`; the plugin now consumes it directly
- `theholocron/clients#395` — added `shouldFail` to `ApiCheckInput`,
  published as `1.41.0`
- `theholocron/clients#396` — added `body` to `ApiCheckRequest`,
  published as `1.42.0`; Sentinel's second check (signature
  verification) is the first real consumer
