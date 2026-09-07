# ADR-0008 — CLI usage telemetry: PostHog

## Status

Proposed

## Context

`packages/cli/src/telemetry.ts` already opens a Sentry span per command and
captures exceptions (the `errors` capability, ADR-0007). Sentry answers
"this run failed — here is the stack and the slow span". It does not answer
the product-analytics questions:

- which commands are actually used, and how often
- how many distinct machines / orgs run the CLI, and whether adoption is growing
- which commands fail most, and with what error class
- is `sync-github` (the org-wide automation surface) being picked up

Sentry is the wrong tool for that — no retention model for it, no funnels,
no cohorts — and mining spans for usage trends is fragile. There is a
`@theholocron/holocron-plugin-posthog` package, but it implements the
`analytics` capability, which provisions a PostHog project **for a
consuming repo's application** (`holocron setup` pushes
`NEXT_PUBLIC_POSTHOG_KEY` into the app's secrets). That is unrelated to
telemetry about the CLI itself.

Tracked in #452. Spec: `docs/wiki/specifications/tech-cli-usage-telemetry.spec.md`.

## Decision

### PostHog as the third telemetry sink

Add PostHog event capture to `telemetry.ts` alongside the Sentry calls —
one module, three sinks:

| Sink    | Concern                                        | Capability                            |
| ------- | ---------------------------------------------- | ------------------------------------- |
| Sentry  | error tracking + performance                   | `errors`                              |
| Axiom   | structured operational logs                    | `logs`                                |
| PostHog | product analytics (usage, adoption, retention) | — (CLI-internal, like the Sentry DSN) |

The `analytics` capability + `holocron-plugin-posthog` are untouched and
stay app-facing. CLI telemetry uses a separate PostHog project, a separate
key, and never goes through the plugin loader.

### Activation mirrors the Sentry DSN pattern

```
HOLOCRON_POSTHOG_KEY  →  POSTHOG_KEY  →  built-in fallback (Holocron's own project write key)
HOLOCRON_POSTHOG_HOST →  POSTHOG_HOST →  https://us.i.posthog.com
```

The built-in fallback is a **project write key** (`phc_…`) — it can only
ingest events, never read data — so shipping it in the published package
carries the same risk profile as the hard-coded Sentry DSN (ADR-0007,
#533). `HOLOCRON_TELEMETRY=false` (and the legacy `NO_HOLOCRON_TELEMETRY`)
disables **all three** sinks; that is the single kill switch.

### Anonymous, pseudonymous `distinctId`

The `distinctId` is `sha256(os.hostname() + os.userInfo().username)`
truncated. It is a one-way hash — the raw hostname and username are never
transmitted — giving stable per-machine attribution for retention math
without carrying PII. Person properties `$set` are limited to
`{ ci, os, node, org }` (org is a public slug from `holocron.config`).
This satisfies our own "no PII, no tokens, no repo paths" rule from the
spec; a hashed machine fingerprint is not personal data under it.

### SDK and events

`posthog-node` (`PostHog` class — `capture()` / `shutdown()`), added to
`packages/cli` via `catalog:`. Not `@theholocron/posthog-client` — that
wraps the PostHog **management** API, not event ingestion. `shutdown()` is
awaited from the existing `flush()` alongside `Sentry.close()`.

Events, emitted from the command lifecycle hooks (`startCommand` /
`finishCommand`), never per-command except `sync_github_run`:

| Event               | Properties                                                     |
| ------------------- | -------------------------------------------------------------- |
| `command_started`   | `command`, `ci`, `dry_run`                                     |
| `command_completed` | `command`, `duration_ms`, `status`                             |
| `command_failed`    | `command`, `duration_ms`, `error_type` (constructor name only) |
| `sync_github_run`   | `repos_targeted`, `pr_opened`, `branch`                        |

Every event also carries the logger's `runId` (from `getRunId()`) so a
PostHog event can be pivoted to the full Axiom trace for that run. All
`properties` objects run through the existing `TOKEN_RE` scrubber before
`capture()`.

## Consequences

- `telemetry.ts` gains a `posthog-node` dependency and a second client;
  `isEnabled()` is unchanged (the existing opt-out covers PostHog).
- Sentry and PostHog stay independent — no shared abstraction beyond
  `isEnabled()` and the redactor.
- `sync_github_run` needs `runSyncGithub` to call a new `telemetry.event()`
  export — coordinate with #537's structured-logging pass over the same
  function so the call sites are touched once.
- A shipped ingest key means anyone can send events to Holocron's PostHog
  project. Acceptable: write-only, no data exposure, rate-limited by
  PostHog's free tier (1M events/month), same as the Sentry DSN.
- `holocron.config` gains nothing — the CLI's telemetry is not
  user-configurable beyond the kill switch and the env-var overrides.

## References

- Issues: #452 (PostHog telemetry), #454 (logger migration), #537 (orchestrator logging), #533 (errors capability)
- Spec: `docs/wiki/specifications/tech-cli-usage-telemetry.spec.md`
- ADR-0007 — structured logging (the Sentry/Axiom precedent this extends)
- `posthog-node`: https://posthog.com/docs/libraries/node
