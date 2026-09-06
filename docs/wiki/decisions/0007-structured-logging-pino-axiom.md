# ADR-0007 — Structured logging: Pino + Axiom

## Status

Accepted

## Context

CLI output is currently raw `console.log` scattered across every command and plugin.
This creates several problems:

- No log levels — debug noise and user-facing output use the same channel
- No structured context — errors are plain strings; correlating a failure to a specific
  command invocation or repo requires reading raw CI output line by line
- No external routing — there is no way to search, alert on, or retain logs beyond
  what GitHub Actions keeps (90 days, no search)
- CI and local output are identical — chalk and spinner noise in CI logs; no colour
  locally unless you squint at raw `console.log`

The codebase already has two distinct output concerns:

- **`print`** — user-facing UX output: formatted results, success messages, the lines
  a user is _meant_ to see. Already abstracted via a `print` dependency injection
  pattern across 19 command files.
- **`logger`** — operational/observability output: what the system is doing internally,
  debug traces, errors, structured context that routes to external services. Currently
  missing entirely.

These are parallel concerns, not a hierarchy. `logger` does not replace `print` —
it provides a separate channel for observability.

The goal for the logger is:

1. Emit leveled, structured output (`debug`, `info`, `warn`, `error`)
2. Pretty-print for local dev, emit plain structured JSON in CI
3. Ship `info`+ log lines to an external aggregation service
4. Carry per-invocation and per-module context on every line
5. Redact sensitive fields before any transport sees them
6. Be swappable — the implementation library must be hidden behind an interface

## Decision

### Adapter / strategy pattern over the logging library

`@theholocron/logger` exposes a `Logger` interface. All code in the CLI and plugins
imports and uses `Logger` — never Pino directly. Pino is the current implementation
class behind that interface.

```ts
// The interface everything depends on
interface Logger {
  debug(obj: Record<string, unknown>, msg?: string): void
  info(obj: Record<string, unknown>, msg?: string): void
  warn(obj: Record<string, unknown>, msg?: string): void
  error(obj: Record<string, unknown>, msg?: string): void
  child(bindings: Record<string, unknown>): Logger
}

// The concrete implementation — hidden inside @theholocron/logger
class PinoLogger implements Logger { ... }

// The public factory — callers never touch Pino
export function createLogger(config: LoggerConfig): Logger
```

This is the same pattern used across the codebase for third-party integrations (env
vars, providers, etc.). If Pino is ever replaced, only the implementation class changes.

### Logging library: Pino

**Chosen.** Reasons:

- Structured JSON output natively — Axiom and any replacement sink can index every field
- Child loggers (`logger.child({ module, repo, command })`) provide per-module context
  without threading a logger instance through every call site
- Built-in `redact` option strips sensitive paths before any transport sees them
- `pino-pretty` provides chalk-based pretty printing locally; skipped when `CI=true`
- Worker-thread transports are non-blocking — external writes never slow the CLI
- Official `@axiomhq/pino` transport is one config line
- Lightweight: no heavy peer dependencies

**Alternatives considered:**

| Library                       | Verdict    | Reason rejected                                                                                          |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| **Winston**                   | Rejected   | Heavier, slower serialisation, no official Axiom transport, more boilerplate for child loggers           |
| **consola**                   | Rejected   | Good DX but no structured redaction, no worker-thread transports, less suited to machine-readable output |
| **Bunyan**                    | Rejected   | Unmaintained, Pino was forked from it and is its successor                                               |
| **pino-logger (hand-rolled)** | Not needed | Pino itself is already minimal; building on top adds nothing                                             |

### Log aggregation service: Axiom

**Chosen.** Reasons:

- Official `@axiomhq/pino` transport — one config line, no custom adapter needed
- 500 GB/month ingest on free tier — far more than this use case generates
- Purpose-built for automation and CI log volumes
- SQL-like APL query language makes ad-hoc debugging fast
- Complements PostHog (#452): Axiom answers "what exactly happened in run X at 14:32",
  PostHog answers "how often does command Y fail across all repos"

**Alternatives considered:**

| Service                          | Verdict      | Reason rejected                                                                                                              |
| -------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Logtail / Better Stack**       | Close second | Comparable DX and free tier, slightly less native Pino integration. Would be the next choice if Axiom is unsuitable.         |
| **Grafana Loki / Grafana Cloud** | Rejected     | Powerful but adds infrastructure overhead; Grafana Cloud free tier is limited; no official Pino transport                    |
| **Datadog**                      | Rejected     | Industry standard but expensive at scale; overkill for current log volumes                                                   |
| **AWS CloudWatch**               | Rejected     | AWS lock-in, poor DX for a tool-agnostic CLI, no native Pino transport                                                       |
| **Splunk**                       | Rejected     | Enterprise pricing, far more complexity than needed                                                                          |
| **Sentry (Logs feature)**        | Rejected     | Sentry is already integrated for error tracking; its log product is newer and not its strength — keep Sentry for errors only |

### `print` vs `logger`

These are two parallel concerns and must not be collapsed:

| Concern  | Purpose                                                                                  | Audience                  | Destination                  |
| -------- | ---------------------------------------------------------------------------------------- | ------------------------- | ---------------------------- |
| `print`  | User-facing UX output — formatted results, success lines, what a user is _meant_ to read | The human running the CLI | stdout, formatted with chalk |
| `logger` | Operational output — internal state, debug traces, errors, structured context            | Observability tooling     | Axiom, stderr, CI log        |

`logger` does not wrap or replace `print`. Each command keeps its `print` surface for
user output and gains a `logger` surface for operational output.

### Log level resolution (priority order)

1. `--verbose` / `--quiet` CLI flag (per invocation)
2. `HOLOCRON_LOG_LEVEL` env var (`debug` | `info` | `warn` | `error`)
3. `log.level` in `holocron.config`
4. Auto-detected default: `info`; if `CI=true` stays `info` (no extra noise)

### Transport matrix

| Environment    | Transport               | Format                                  |
| -------------- | ----------------------- | --------------------------------------- |
| Local dev      | `pino-pretty`           | Chalk-colored, human-readable           |
| CI (`CI=true`) | stdout only             | Plain JSON, no colour                   |
| All            | Axiom (`@axiomhq/pino`) | Structured JSON — `info` and above only |

### Standard context fields on every log line

| Field     | Source                                                                       |
| --------- | ---------------------------------------------------------------------------- |
| `runId`   | UUID generated at command startup — correlates all lines from one invocation |
| `env`     | `"ci"` when `CI=true`, otherwise `"local"`                                   |
| `command` | Active holocron command name                                                 |
| `module`  | Set per child logger: `logger.child({ module: 'sync-github' })`              |
| `repo`    | Active repo coordinate when available                                        |
| `level`   | Pino level name                                                              |
| `time`    | ISO timestamp                                                                |

### Sensitive field redaction

Pino's `redact` config strips the following paths before any transport sees them:

```ts
redact: ["token", "secret", "password", "secrets[*].value", "headers.authorization"];
```

### Capability model — `errors` and `logs`

The former `observability` capability (many cardinality) is replaced by two
dedicated single-cardinality capabilities:

| Capability | Provider | Activation |
|---|---|---|
| `errors` | `sentry` | `SENTRY_DSN` env var |
| `logs` | `axiom` | `AXIOM_TOKEN` + `AXIOM_DATASET` env vars |

Both are **env-var-activated** — the runtime does not require a provider entry
in `holocron.config` to function. They activate wherever their env vars are
present, including before config is fully resolved. The config entry
(`errors: "sentry"`, `logs: "axiom"`) exists solely for `holocron setup`
provisioning and `holocron doctor` connectivity checks.

This makes `errors` and `logs` self-contained cross-cutting infrastructure
rather than opt-in feature providers — consistent with how `SENTRY_DSN` already
drives Sentry initialisation today.

### Package location

`packages/logger` in the `theholocron/holocron` monorepo, published as
`@theholocron/logger`. Other repos that need structured logging import the `Logger`
interface and `createLogger` factory — never Pino directly.

## Consequences

- All operational `console.log` / `console.error` call sites in the CLI and plugins must
  be replaced with the shared `logger` — tracked in #454. The existing `print` injection
  pattern is untouched; it serves a different purpose.
- The `observability` capability (many cardinality) is removed; Sentry migrates to `errors`
- Axiom dataset and API key stored as org secrets (`AXIOM_DATASET`, `AXIOM_TOKEN`);
  never in `holocron.config`
- `HOLOCRON_TELEMETRY=false` disables Axiom transport; `errors` and `logs` are
  independently opt-outable via their respective env vars being absent
- PostHog (#452) and Axiom serve complementary purposes; neither is required for the CLI to function
- Discord thread logging (#521) attaches to the `Logger` interface output stream once this is in place
- Swapping Pino for another library in the future requires only changing the `PinoLogger`
  implementation class — no call sites change

## References

- Issues: #522 (logger package), #454 (migration), #452 (PostHog telemetry), #521 (Discord)
- `@axiomhq/pino`: https://github.com/axiomhq/axiom-node
- Pino docs: https://getpino.io
