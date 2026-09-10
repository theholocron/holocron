---
title: Observability
description: Logging, error tracking, and analytics — one interface, swappable backends.
sidebar:
  hidden: true
---

`@theholocron/observability` puts logging, error tracking, and product analytics
behind one stable set of interfaces. Application code depends on the interface,
never a vendor SDK — so the backend can be swapped, stubbed for tests, or turned
off in a single file.

## Subpaths

| Import                                 | What it gives you                                                                                                                                                                       | Peer dependency                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `@theholocron/observability/core`      | `Logger` / `ErrorSink` / `AnalyticsSink` interfaces, their `Noop*` implementations, and the redaction helpers. **Zero dependencies** — safe in a browser, edge, or React Native bundle. | none                                   |
| `@theholocron/observability/logger`    | `createLogger()` — a structured logger (pretty locally, NDJSON in CI, Axiom when credentials resolve) — plus a zero-dependency `ConsoleLogger`.                                         | `pino`, `pino-pretty`, `@axiomhq/pino` |
| `@theholocron/observability/errors`    | `SentrySink` — error tracking and per-operation performance spans.                                                                                                                      | `@sentry/node`                         |
| `@theholocron/observability/analytics` | `PostHogSink` — usage and adoption events.                                                                                                                                              | `posthog-node`                         |

The vendor SDKs are **optional peer dependencies**: install only the ones for
the subpaths you use. Adapters read no environment and hold no credentials —
the caller resolves the DSN / key and passes it in.

## Installation

```bash
pnpm add @theholocron/observability
# then the peers for the subpaths you use, e.g.
pnpm add pino pino-pretty @sentry/node
```

## Usage

```ts
import { createLogger } from "@theholocron/observability/logger";
import { NoopErrorSink } from "@theholocron/observability/core";
import { SentrySink } from "@theholocron/observability/errors";

const { logger, runId } = createLogger({ level: "info" });
const log = logger.child({ command: "deploy" });
log.info({ target: "production" }, "starting");

const errors = process.env.SENTRY_DSN ? new SentrySink() : new NoopErrorSink();
errors.init({
  dsn: process.env.SENTRY_DSN ?? "",
  release: "my-app@1.0.0",
  environment: "local",
  tags: { runId },
});
```

Code against `@theholocron/observability/core` everywhere; only the process
entry point imports a concrete adapter subpath.
