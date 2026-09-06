---
status: proposed
issue: theholocron/holocron#522
blocked-by: []
related:
  - theholocron/holocron#454
  - theholocron/holocron#452
  - theholocron/holocron#521
  - theholocron/holocron/docs/wiki/decisions/0007-structured-logging-pino-axiom.md
---

# `@theholocron/logger` — structured logging package

New `packages/logger` package that provides a `Logger` adapter interface
backed by Pino, with transports for local dev (pino-pretty), CI (plain JSON),
and Axiom log aggregation. All CLI commands and plugins import `Logger` —
never Pino directly.

---

## Motivation

CLI output is currently raw `console.log` with no levels, no structured context,
and no external routing. Debugging a `sync-github` failure means opening a CI run
and scanning unstructured text. There is no way to search, correlate, or alert on
command output across repos.

The codebase already has two distinct output concerns that must remain separate:

- **`print`** — user-facing UX output: formatted results, success lines, the lines
  a user is meant to see. Already abstracted via the `print` dependency injection
  pattern. **Unchanged by this work.**
- **`logger`** — operational output: internal state, debug traces, errors, structured
  context that routes to Axiom. **This package implements logger.**

`print` and `logger` are parallel channels, not a hierarchy. `logger` does not wrap
or replace `print`.

---

## Goals

- Ship `packages/logger` as `@theholocron/logger`, importable by the CLI and any plugin
- Expose a `Logger` interface so call sites never depend on Pino directly
- Pino as the implementation, hidden behind the interface
- `pino-pretty` locally; plain JSON in CI; `@axiomhq/pino` transport for Axiom
- Child loggers carry per-module context on every line automatically
- A correlation `runId` per command invocation ties all log lines from one run together
- Log level configurable via CLI flag → env var → config → default
- Sensitive fields redacted before any transport sees them
- Opt-out via `HOLOCRON_TELEMETRY=false` disables the Axiom transport only

## Non-goals

- Replacing `print` — the UX output surface is unchanged
- Logging to Discord — that is tracked separately in #521 and attaches to this
  package's output stream once it exists
- PostHog telemetry (#452) — shares the opt-out gate but is a separate concern
- Replacing `ora` spinners — they are UX, not logging; `withSpinner()` already
  skips in CI via `process.stdout.isTTY`

---

## Package structure

```
packages/logger/
  src/
    index.ts          ← public exports: Logger, createLogger, LoggerConfig
    interface.ts      ← Logger interface definition
    pino.ts           ← PinoLogger implements Logger
    transports.ts     ← pino-pretty and @axiomhq/pino wiring
    context.ts        ← runId generation, env detection, CI check
    redact.ts         ← sensitive field path list
  package.json
  tsconfig.json
```

---

## `Logger` interface

Every call site imports `Logger` from `@theholocron/logger`. No call site imports Pino.

```ts
export interface Logger {
  debug(obj: Record<string, unknown>, msg?: string): void;
  debug(msg: string): void;
  info(obj: Record<string, unknown>, msg?: string): void;
  info(msg: string): void;
  warn(obj: Record<string, unknown>, msg?: string): void;
  warn(msg: string): void;
  error(obj: Record<string, unknown>, msg?: string): void;
  error(msg: string): void;
  child(bindings: Record<string, unknown>): Logger;
}
```

The overloads allow both structured (`logger.info({ repo }, 'sync complete')`)
and simple string (`logger.info('sync complete')`) calls — matching Pino's
native API so the implementation is a thin wrapper.

---

## `createLogger` factory

The single public entry point for constructing a logger. Returns a `Logger`.
Callers never instantiate `PinoLogger` directly.

```ts
export interface LoggerConfig {
  level?: "debug" | "info" | "warn" | "error";
  axiom?: {
    dataset: string;
    token: string;
  };
}

export function createLogger(config?: LoggerConfig): Logger;
```

### Level resolution (inside `createLogger`)

```
1. config.level (explicit — from resolved CLI flag or holocron.config)
2. HOLOCRON_LOG_LEVEL env var
3. 'info' (default)
```

The CLI flag resolution (`--verbose` → `debug`, `--quiet` → `error`) happens
in the command layer before calling `createLogger`, and is passed as `config.level`.

### Axiom opt-out

If `HOLOCRON_TELEMETRY=false`, the Axiom transport is not added regardless of
whether `config.axiom` is provided. The logger still works — it just writes
locally only.

---

## Transport configuration

### Local dev

`pino-pretty` is added when `process.env.CI` is absent or falsy and
`process.stdout.isTTY` is true.

Output format:

```
[10:42:01] INFO (sync-github): sync complete
    repo: "theholocron/configs"
    runId: "a1b2c3d4"
```

### CI

When `process.env.CI === 'true'`, pino-pretty is skipped. Output is plain
newline-delimited JSON to stdout — readable in GitHub Actions log viewer
without colour noise.

### Axiom

Added when `config.axiom` is provided and `HOLOCRON_TELEMETRY !== 'false'`.
Only `info` and above is sent — `debug` stays local.

```ts
import { axiom } from "@axiomhq/pino";

transport = axiom({
  dataset: config.axiom.dataset,
  token: config.axiom.token,
});
```

The transport runs in a Pino worker thread — Axiom writes are non-blocking
and never slow the CLI.

---

## Child loggers and per-module context

Each command creates a root logger at startup and passes child loggers to modules:

```ts
// In the command handler
const logger = createLogger({ level: resolvedLevel, axiom: resolvedAxiomConfig })
const log = logger.child({ command: 'sync-github', repo, runId })

// In a module
export async function runSyncGithub(input: { logger: Logger, ... }) {
  const log = input.logger.child({ module: 'sync-github' })
  log.info({ branch }, 'opening PR')
}
```

Child loggers inherit all parent bindings and add their own. Every log line
from `runSyncGithub` automatically carries `command`, `repo`, `runId`, and
`module` without any extra wiring.

---

## Standard context fields

These fields appear on every log line. Some are set on the root logger at
startup; others are added by child loggers.

| Field     | Set by                | Value                                     |
| --------- | --------------------- | ----------------------------------------- |
| `runId`   | Root logger (startup) | UUID v4, unique per command invocation    |
| `env`     | Root logger (startup) | `"ci"` when `CI=true`, else `"local"`     |
| `command` | Command child logger  | Active holocron command name              |
| `module`  | Module child logger   | e.g. `"sync-github"`, `"setup-workflows"` |
| `repo`    | Command child logger  | `"owner/name"` when available             |
| `level`   | Pino                  | Level name string                         |
| `time`    | Pino                  | ISO 8601 timestamp                        |

---

## Sensitive field redaction

Defined in `src/redact.ts`, passed to Pino's `redact` option at construction time.
Redaction happens in the serialisation layer before any transport — Axiom never
sees raw values.

```ts
export const REDACTED_PATHS = [
  "token",
  "secret",
  "password",
  "apiKey",
  "secrets[*].value",
  "headers.authorization",
  'headers["x-api-key"]',
];
```

Redacted values are replaced with `[Redacted]` in output.

---

## Capability model

`errors` and `logs` are split from the former `observability` bucket into two
dedicated single-cardinality capabilities:

| Capability | Provider | Cardinality | Purpose         |
| ---------- | -------- | ----------- | --------------- |
| `errors`   | `sentry` | single      | Error tracking  |
| `logs`     | `axiom`  | single      | Log aggregation |

### Self-contained activation

Both capabilities are **env-var-activated** — the runtime does not require a
provider entry in `holocron.config` to function. Activation is automatic when
the relevant env vars are present:

| Capability        | Env vars required               |
| ----------------- | ------------------------------- |
| `errors` (Sentry) | `SENTRY_DSN`                    |
| `logs` (Axiom)    | `AXIOM_TOKEN` + `AXIOM_DATASET` |

This makes them cross-cutting infrastructure rather than opt-in features. Error
tracking and log aggregation activate wherever the env vars are set — including
in the config-loading phase, before providers are resolved.

The provider entry in `holocron.config` serves a separate purpose:

```ts
providers: {
  errors: "sentry",   // tells `holocron setup` to provision the Sentry project
  logs: "axiom",      // tells `holocron setup` to provision the Axiom dataset
}
```

- `holocron setup` uses the entry to provision the dataset/project
- `holocron doctor` uses it to run connectivity checks
- Neither entry is required for runtime activation

### `holocron.config` log level

Add a top-level `log` key (not under `providers`) for level configuration:

```ts
export interface HolocronConfig {
  // ... existing fields
  log?: {
    level?: "debug" | "info" | "warn" | "error";
  };
}
```

`createLogger` reads `config.log.level` as the lowest-priority level source.
Axiom credentials come only from env vars — secrets do not belong in config.

---

## CLI flag integration

Add `--verbose` and `--quiet` to the global yargs option definitions in `cli.ts`:

```ts
.option('verbose', {
  boolean: true,
  description: 'Set log level to debug',
  default: false,
})
.option('quiet', {
  boolean: true,
  description: 'Set log level to error (suppress info and warn)',
  default: false,
})
```

Level resolution in the command layer:

```ts
const level = argv.verbose
  ? "debug"
  : argv.quiet
    ? "error"
    : ((process.env.HOLOCRON_LOG_LEVEL as LogLevel | undefined) ?? config.log?.level ?? "info");
```

---

## Migration path (tracked in #454)

The audit of existing call sites (39 direct + 19 injectable defaults) shows:

1. **Injectable `print` defaults (19 files)** — `print` stays; `logger` is passed
   as a separate argument alongside it. No `print` call sites change.
2. **Direct `console.error` in `cli.ts` (9 calls)** — replace with `logger.error`
3. **`console.warn` in `setup-workflows` (1 call)** — replace with `logger.warn`
4. **Dry-run `console.log` in `skills.ts` (2 calls)** — replace with `logger.info`
5. **`validate-script.ts` template (12 calls)** — leave unchanged; it is
   scaffolded output code, not production logging

Total migration: ~32 substitutions, all mechanical once `@theholocron/logger` exists.

---

## Testing

- Unit tests for `createLogger` — verify level resolution priority order
- Unit tests for `PinoLogger` — verify child logger bindings are inherited
- Unit tests for `redact.ts` — verify sensitive paths are stripped
- Integration test: construct a logger with a mock Axiom transport, fire log lines
  at each level, assert only `info`+ reach the transport
- No test changes needed in command files — the injectable `print` pattern is
  already tested via dependency injection; `logger` follows the same pattern

---

## Open questions

1. **`runId` exposure** — should `runId` be returned from `createLogger` so the
   command can include it in `print` output (e.g. "Run ID: abc123 — use this to
   find logs in Axiom")? Useful for debugging but adds noise to normal output.
2. **Axiom dataset per environment** — single dataset with an `env` field to
   filter, or separate `holocron-local` and `holocron-ci` datasets?
   Single dataset is simpler; separate datasets allow different retention policies.
3. **Log sampling** — should `debug` lines ever reach Axiom (e.g. when explicitly
   set via `HOLOCRON_LOG_LEVEL=debug` in CI)? Currently the spec says `info`+
   always; if a user is debugging in CI they may want `debug` in Axiom too.
