---
status: archived
issue: theholocron/holocron#452
blocked-by: []
related:
  - theholocron/holocron#454
  - theholocron/holocron#537
  - theholocron/holocron/docs/wiki/decisions/0007-structured-logging-pino-axiom.md
  - theholocron/holocron/docs/wiki/decisions/0008-cli-usage-telemetry-posthog.md
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
HOLOCRON_POSTHOG_PROJECT_TOKEN  →  POSTHOG_PROJECT_TOKEN  →  built-in fallback (Holocron's own project write key)
HOLOCRON_POSTHOG_HOST →  POSTHOG_HOST           →  https://us.i.posthog.com
```

- `resolvePostHogKey()` / `resolvePostHogHost()` helpers, matching
  `resolveDsn()`. `POSTHOG_PROJECT_TOKEN` is the vendor-native name (a
  plain variable — the `phc_…` key is publishable); CI reads it from the
  `POSTHOG_PROJECT_TOKEN` variable, forwarded by the `sync` /
  `sync-github` reusable workflows.
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

**Decided (ADR-0008): option 2** — `sha256(hostname + username)` truncated,
with `$set` person properties `{ ci, os, node, org }`. A one-way
fingerprint transmits no raw hostname/username and is not personal data
under this spec's rule.

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

Captured in **ADR-0008 — CLI usage telemetry: PostHog**
(`docs/wiki/decisions/0008-cli-usage-telemetry-posthog.md`, status
`accepted`): PostHog as a third sink vs. extending Sentry, the shipped
ingest-key risk model, the hashed-machine-id choice (resolving this
spec's open question — a one-way fingerprint is not PII under our rule),
and the single `HOLOCRON_TELEMETRY` kill switch across all three sinks.

## Test plan

- `telemetry.test.ts` — new block: PostHog `capture` called with the
  right event/properties for a stubbed `PostHog` client;
  `HOLOCRON_TELEMETRY=false` suppresses both sinks; no key + no DSN →
  nothing initialised; `properties` run through the redactor.
- Stub `posthog-node` the same way `@sentry/node` is stubbed.
- `flush()` awaits `shutdown()`.

## Rollout

1. ~~ADR-0008.~~ — merged (#562).
2. ~~`telemetry.ts` + `posthog-node` dep + tests.~~ — done (#452 PR). PostHog
   added as a third sink alongside Sentry: `resolvePostHogKey()` /
   `resolvePostHogHost()`, `machineId()` hashed fingerprint, `event()` export,
   `identify()` on init, `shutdown()` in `flush()`. `command_started` /
   `command_completed` / `command_failed` fire from `startCommand`'s lifecycle
   hook. Shipped `FALLBACK_POSTHOG_PROJECT_TOKEN` is Holocron's real ingest-only `phc_…`
   project key (US cloud) — usage telemetry is on by default.
3. ~~`sync_github_run` wiring in `runSyncGithub`.~~ — done, emitted from the
   `done()` single-exit helper in `sync-github.ts` (one event per invocation,
   carries `repo` / `branch` / `status` / `repos_targeted` / `files_changed` /
   `pr_opened` / `runId`).
4. ~~Docs.~~ — done: new `docs/src/content/docs/telemetry.mdx` (canonical
   three-sink page + kill switch), cross-links from `logging.mdx`, a Telemetry
   subsection in `packages/cli/README.md`.
5. ~~CI: `sync` / `sync-github` templates forward the `POSTHOG_PROJECT_TOKEN`
   variable~~ — done (the downstream-override path). Holocron itself sets no
   variable — CI uses the shipped `FALLBACK_POSTHOG_PROJECT_TOKEN`, same as local.

All shipped in #452 PR. Decision: DSN + PostHog key live in `telemetry.ts`
as constants (not GitHub vars) — they are publishable ingest-only keys and a
distributed CLI has no deploy-time config-injection point; env overrides
(`HOLOCRON_*` / vendor-native) still take precedence.

## Follow-ups (post-#452)

- **#574** — put Sentry + PostHog behind `ErrorSink` / `AnalyticsSink` adapter
  interfaces (all third-party observability SDKs isolated to one module each).
- **#575** — small `telemetry` config block (`enabled`, `analytics` selector).
  See the ADR-0008 amendment (2026-09-07); overrides env only as an extra
  layer, never carries credentials.
