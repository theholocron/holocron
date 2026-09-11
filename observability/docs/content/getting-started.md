---
title: Getting Started
description: Wire logging, error tracking, and analytics into an application.
---

## Install

```bash
pnpm add @theholocron/observability
```

Then add the peer dependencies for the subpaths you use:

| Subpath      | Peers                                  |
| ------------ | -------------------------------------- |
| `/core`      | none                                   |
| `/logger`    | `pino`, `pino-pretty`, `@axiomhq/pino` |
| `/errors`    | `@sentry/node`                         |
| `/analytics` | `posthog-node`                         |
| `/testing`   | `vitest`                               |

## Code against the interface

Every module that logs or reports takes a `Logger` / `ErrorSink` /
`AnalyticsSink` from `@theholocron/observability/core` — it never imports a
concrete adapter.

```ts
import type { Logger, ErrorSink } from "@theholocron/observability/core";

export function deploy(deps: { logger: Logger; errors: ErrorSink }) {
  deps.logger.info({ target: "production" }, "deploying");
  try {
    // …
  } catch (err) {
    deps.errors.captureException(err);
    throw err;
  }
}
```

## Wire the adapters at the entry point

Only the process entry point picks concrete implementations, and only it reads
credentials.

```ts
import { createLogger } from "@theholocron/observability/logger";
import { NoopErrorSink } from "@theholocron/observability/core";
import { SentrySink } from "@theholocron/observability/errors";

const { logger, runId } = createLogger({ level: process.env.LOG_LEVEL as never });

const errors = process.env.SENTRY_DSN ? new SentrySink() : new NoopErrorSink();
errors.init({
  dsn: process.env.SENTRY_DSN ?? "",
  release: `my-app@${process.env.APP_VERSION}`,
  environment: process.env.CI ? "ci" : "local",
  tags: { runId },
});

deploy({ logger, errors });
```

## Browser / edge / React Native

`@theholocron/observability/core` runs anywhere — it is interfaces and no-ops
with zero dependencies. For a light logger without Pino, use `ConsoleLogger`
from `/logger`:

```ts
import { ConsoleLogger } from "@theholocron/observability/logger";

const logger = new ConsoleLogger({ level: "info" });
```

Environment-specific error / analytics adapters (`@sentry/nextjs`,
`@sentry/react-native`, `posthog-js`, …) plug into the same interfaces.

## Testing

`deploy` above takes `Logger` / `ErrorSink` as plain dependencies, so tests
pass spy doubles instead of a real logger or Sentry session:

```ts
import { fakeLogger, fakeErrorSink } from "@theholocron/observability/testing";

const logger = fakeLogger();
const errors = fakeErrorSink();
deploy({ logger, errors });

expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ target: "production" }), "deploying");
expect(errors.captureException).not.toHaveBeenCalled();
```

`fakeAnalyticsSink()` mirrors the same shape for `AnalyticsSink`. Every fake's
methods are `vitest` spies; `fakeLogger().child(...)` returns the same fake so
bindings applied via a child logger are still assertable on the parent. For a
non-vitest context that just needs a working `Logger` with no output (an
example, a docs snippet, a non-test opt-out path), use `NoopLogger` from
`/core` instead — it discards everything and needs no `vitest` peer.

## Logging behaviour

`createLogger()` picks its output from the environment:

| Environment                                                                                                       | Output                           |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Local, TTY                                                                                                        | pretty-printed                   |
| CI                                                                                                                | newline-delimited JSON to stdout |
| Axiom credentials present (`HOLOCRON_AXIOM_TOKEN` + `HOLOCRON_AXIOM_DATASET`, or the `AXIOM_`-prefixed fallbacks) | also shipped to Axiom            |

`HOLOCRON_TELEMETRY=false` disables the Axiom transport while leaving local
logging intact. Sensitive fields (`token`, `secret`, `password`, `apiKey`,
`headers.authorization`, …) are redacted before any transport sees a line.
