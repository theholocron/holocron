# `@theholocron/logger`

Structured logging for the Holocron CLI and its plugins. A `Logger` adapter interface backed by [Pino](https://getpino.io), with `pino-pretty` for local dev, plain JSON for CI, and an [Axiom](https://axiom.co) transport for log aggregation.

Call sites depend on the `Logger` interface — never on Pino directly. Swapping the logging library is a one-file change.

> `logger` is the operational-output channel (internal state, debug traces, errors, structured context). It is **not** `print` — the user-facing UX output surface — and does not wrap or replace it. The two are parallel concerns.

## Installation

```sh
pnpm add @theholocron/logger
```

## Usage

```ts
import { createLogger } from "@theholocron/logger";

const { logger, runId } = createLogger({
  level: "info",
  axiom: process.env.HOLOCRON_AXIOM_TOKEN
    ? {
        dataset: process.env.HOLOCRON_AXIOM_DATASET!,
        token: process.env.HOLOCRON_AXIOM_TOKEN,
      }
    : undefined,
});

const log = logger.child({ command: "sync-github", repo: "theholocron/configs" });
log.info({ branch: "main" }, "opening PR");
// → { level, time, runId, env, command, repo, branch, msg: "opening PR" }
```

Pass child loggers down into modules so every line carries its context automatically:

```ts
export async function runSyncGithub(input: { logger: Logger }) {
  const log = input.logger.child({ module: "sync-github" });
  log.debug("resolving remote");
}
```

## `Logger` interface

```ts
interface Logger {
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

The overloads mirror Pino: object-first for structured lines, bare string for simple ones.

## `createLogger(config?)`

Returns `{ logger, runId }`. `runId` is a UUID bound to every line the logger and its children emit — surface it via `print` when `--debug` or `--verbose` is set so a whole run can be pulled back out of Axiom.

| `config` field  | Type                                | Notes                                                        |
| --------------- | ----------------------------------- | ----------------------------------------------------------- |
| `level`         | `"debug" \| "info" \| "warn" \| "error"` | Highest-priority level source. Optional.               |
| `axiom.dataset` | `string`                            | Axiom dataset name. Supply from env vars only.               |
| `axiom.token`   | `string`                            | Axiom API token. Supply from env vars only — never config.   |

### Level resolution

1. `config.level` — the resolved `--verbose` (`debug`) / `--quiet` (`error`) CLI flag, or `holocron.config` `log.level`, passed by the command layer
2. `HOLOCRON_LOG_LEVEL` env var
3. `"info"` (default)

An unrecognised value at any tier is ignored and resolution falls through. The resolved level applies to **every** transport — there is no separate Axiom gate.

## Transports

| Environment                    | Output                                          |
| ------------------------------ | ----------------------------------------------- |
| Local, TTY                     | `pino-pretty` — colourised, human-readable      |
| CI (`CI` truthy)               | Newline-delimited JSON to stdout                |
| `config.axiom` supplied        | Axiom, in a Pino worker thread (non-blocking)   |

The Axiom transport is added only when `config.axiom` is supplied **and** `HOLOCRON_TELEMETRY` is not `"false"`. When Axiom is the only non-console transport, console JSON is kept alongside it so CI logs stay readable.

### Axiom datasets

Selected by `HOLOCRON_AXIOM_DATASET` — one env var, one value per environment:

| Value            | When              |
| ---------------- | ----------------- |
| `holocron-ci`    | CI (org secret)   |
| `holocron-local` | local (optional)  |

If `HOLOCRON_AXIOM_DATASET` is unset locally, local runs write only to `pino-pretty` — no Axiom connection is attempted.

## Redaction

Sensitive field paths are stripped in Pino's serialisation layer, before any transport — pino-pretty, CI stdout, and Axiom alike. Redacted values become `[Redacted]`.

`token`, `secret`, `password`, `apiKey`, `secrets[*].value`, `headers.authorization`, `headers["x-api-key"]`, and the same keys one level down (`*.token`, `*.secret`, …). The full list is exported as `REDACTED_PATHS`.

## Development

| Script                | Description              |
| --------------------- | ------------------------ |
| `pnpm build`          | Bundle with tsdown       |
| `pnpm test`           | Run the vitest suite     |
| `pnpm test:coverage`  | Run tests with coverage  |
| `pnpm typecheck`      | `tsc --noEmit`           |
| `pnpm lint`           | ESLint                   |

## Releases

Automated via semantic-release. See [CHANGELOG.md](../../CHANGELOG.md).

## Documentation

<https://theholocron.github.io/holocron/logging/>
