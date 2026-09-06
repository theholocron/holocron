---
status: draft
issue: theholocron/holocron#452
blocked-by: []
related:
  - theholocron/holocron#454
  - theholocron/holocron#537
  - theholocron/holocron/docs/wiki/decisions/0007-structured-logging-pino-axiom.md
---

# CLI usage telemetry — PostHog

Route Holocron CLI command usage to a Holocron-owned PostHog project so
command frequency, adoption, duration, and failure rates are visible on a
shared dashboard. This is the third and last telemetry sink in the
observability arc (Sentry for errors, Axiom for logs, PostHog for
product analytics).

## Scope

**In scope:** the CLI's own usage analytics — anonymous events emitted by
`telemetry.ts` to a project Holocron owns, activated the same way Sentry
is (env var → built-in fallback key), opt-out via `HOLOCRON_TELEMETRY=false`.

**Out of scope:** the `analytics` capability + `@theholocron/holocron-plugin-posthog`.
That provisions a PostHog project **for a consuming repo's application**
(`holocron setup` → `ensureProject` → pushes `NEXT_PUBLIC_POSTHOG_KEY` to
the app's secrets). It has nothing to do with CLI telemetry and is already
shipped. The two must not be conflated: different project, different key,
different audience.

## Why PostHog when Sentry already tracks commands

`telemetry.ts` already opens a Sentry span per command (`startCommand` →
`startInactiveSpan`) and captures exceptions. That covers **error
debugging and performance** — "this run failed, here is the stack and the
slow span".

PostHog answers a different question — **product analytics**: which
commands are actually used, how often, by how many distinct
machines/orgs, which ones fail most, is `sync-github` adoption growing.
Sentry is not built for that (retention, aggregation, funnels, cohorts),
and mining Sentry spans for usage trends is the wrong tool.

The two sinks stay independent. No shared abstraction beyond the
`isEnabled()` gate and the token redactor.

## Design

### Module

Extend `packages/cli/src/telemetry.ts` rather than adding a parallel
module — the command lifecycle hooks (`init`, `startCommand`,
`endSession`, `flush`) are already there and already wired into `cli.ts`.
Add PostHog capture alongside the Sentry calls inside those same
functions.

### Activation (mirror the Sentry DSN pattern from #533)

```
HOLOCRON_POSTHOG_KEY  →  POSTHOG_KEY  →  built-in fallback (Holocron's own project write key)
HOLOCRON_POSTHOG_HOST →  POSTHOG_HOST →  https://us.i.posthog.com
```

- `resolvePostHogKey()` / `resolvePostHogHost()` helpers, matching
  `resolveDsn()`.
- The built-in fallback key is a **project write key** (`phc_…`), not a
  personal API key — it can only ingest events, never read data, so it is
  safe to ship in the published package (same risk profile as the
  hard-coded Sentry DSN).
- `isEnabled()` gains no new logic — the existing
  `HOLOCRON_TELEMETRY=false` / `NO_HOLOCRON_TELEMETRY` opt-out covers
  PostHog too. A run with neither a DSN nor a PostHog key still returns
  `false` and initialises nothing.

### SDK

`posthog-node` (`PostHog` class — `capture()`, `shutdown()`). Add to
`packages/cli` deps via `catalog:`. Do **not** reuse
`@theholocron/posthog-client` — that is a REST wrapper for the PostHog
**management** API (projects, users), not the event-ingestion endpoint.

Flush model: `posthog-node` batches; call `posthog.shutdown()` from the
existing `flush()` alongside `Sentry.close()`.

### distinctId — anonymous

No PII, no tokens, no repo paths. Candidates:

1. **`ci` / `local` + org** — coarse; every CI runner in an org collapses
   to one id. Good enough for "is the org using it" but loses
   per-developer adoption.
2. **Hashed stable machine id** — `sha256(os.hostname() + os.userInfo().username)`
   truncated. Per-machine granularity, still anonymous. Preferred.
3. Random per-run id — no cross-run correlation, useless for retention.

Proposal: option 2, with `$set` person properties `{ ci, os, node, org }`.
Open question for the ADR: is a hashed hostname acceptable under our own
"no PII" rule, or is option 1 the safe floor?

### Events

Per #452, emitted from the lifecycle hooks (no per-command wiring except
`sync_github_run`):

| Event               | When                       | Properties                               |
| ------------------- | -------------------------- | ---------------------------------------- |
| `command_started`   | `startCommand(name)`       | `command`, `ci`, `dry_run`               |
| `command_completed` | lifecycle-hook return, ok  | `command`, `duration_ms`, `status: "ok"` |
| `command_failed`    | lifecycle-hook return, !ok | `command`, `duration_ms`, `error_type`   |
| `sync_github_run`   | `runSyncGithub` (explicit) | `repos_targeted`, `pr_opened`, `branch`  |

`error_type` is the error constructor name only (`AuthError`,
`ProviderApiError`, …) — never the message. `branch` is the ref name, not
a URL. `sync_github_run` needs `runSyncGithub` to call a new
`telemetry.event()` export — coordinate with #537 (structured logging for
the same orchestrator) so the call sites are touched once.

### Redaction

Reuse the existing `TOKEN_RE` scrubber. Run every event `properties`
object through it before `capture()`, same as `scrubError` does for
Sentry. Property values are controlled (enums, counts, names) so this is
defence-in-depth.

### Correlation with logs

Include the logger's `runId` (from `getRunId()`) as an event property so a
PostHog event can be pivoted to the full Axiom trace for that run.

## ADR

This introduces a new external data sink and a shipped ingestion key —
an architectural decision ADR-0007 does not cover. Needs **ADR-0008 —
CLI usage telemetry (PostHog)** capturing: PostHog vs. extending Sentry,
the shipped-key risk model, the anonymous-id choice, and the single
`HOLOCRON_TELEMETRY` kill switch across all three sinks.

## Test plan

- `telemetry.test.ts` — new block: PostHog `capture` called with the
  right event/properties for a stubbed `PostHog` client;
  `HOLOCRON_TELEMETRY=false` suppresses both sinks; no key + no DSN →
  nothing initialised; `properties` run through the redactor.
- Stub `posthog-node` the same way `@sentry/node` is stubbed.
- `flush()` awaits `shutdown()`.

## Rollout

1. ADR-0008.
2. `telemetry.ts` + `posthog-node` dep + tests.
3. `sync_github_run` wiring in `runSyncGithub` (with or after #537).
4. Docs: `docs/telemetry` (or a section in `docs/logging`), a note in
   `packages/cli/README.md`, and the `HOLOCRON_TELEMETRY` kill switch
   documented as covering all three sinks.
