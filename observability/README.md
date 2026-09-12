# `@theholocron/observability`

<!-- holocron:description -->

Logging, error tracking, and analytics — one interface, swappable backends.

<!-- /holocron:description -->

<!-- holocron:installation -->

## Installation

```bash
pnpm install @theholocron/observability
```

## Usage

See the [documentation](https://docs.theholocron.dev/observability/) for the API.

<!-- /holocron:installation -->

## Installation

```bash
pnpm add @theholocron/observability
```

Then add the peer dependencies for the subpaths you use — they are all
optional:

| Subpath                                | Peers                                  |
| -------------------------------------- | -------------------------------------- |
| `@theholocron/observability/core`      | none                                   |
| `@theholocron/observability/logger`    | `pino`, `pino-pretty`, `@axiomhq/pino` |
| `@theholocron/observability/errors`    | `@sentry/node`                         |
| `@theholocron/observability/analytics` | `posthog-node`                         |
| `@theholocron/observability/testing`   | `vitest`                               |

## Usage

Application modules depend on the interfaces from `/core`, never a concrete
adapter:

```typescript
import type { Logger, ErrorSink } from "@theholocron/observability/core";

export function deploy(deps: { logger: Logger; errors: ErrorSink }) {
  deps.logger.info({ target: "production" }, "deploying");
}
```

The process entry point wires the adapters and is the only place that reads
credentials:

```typescript
import { createLogger } from "@theholocron/observability/logger";
import { NoopErrorSink } from "@theholocron/observability/core";
import { SentrySink } from "@theholocron/observability/errors";

const { logger, runId } = createLogger({ level: "info" });

const errors = process.env.SENTRY_DSN ? new SentrySink() : new NoopErrorSink();
errors.init({
  dsn: process.env.SENTRY_DSN ?? "",
  release: "my-app@1.0.0",
  environment: process.env.CI ? "ci" : "local",
  tags: { runId },
});

deploy({ logger, errors });
```

For the browser, an edge runtime, or React Native, import
`@theholocron/observability/core` (zero dependencies) and use `ConsoleLogger`
from `/logger` in place of Pino.

Testing code that depends on `Logger` / `ErrorSink` / `AnalyticsSink`? Use the
spy doubles from `/testing` instead of hand-rolling one per repo:

```typescript
import { fakeLogger, fakeErrorSink } from "@theholocron/observability/testing";

const log = fakeLogger();
const errors = fakeErrorSink();
await deploy({ logger: log, errors, target: "production" });
expect(log.info).toHaveBeenCalledWith(expect.objectContaining({ target: "production" }), "deploying");
expect(errors.captureException).not.toHaveBeenCalled();
```

For a non-vitest context that just needs a `Logger` with no output (an
example, a non-test opt-out path), use `NoopLogger` from `/core` — it
discards everything, `child()` returns itself.

See the [documentation](https://docs.theholocron.dev/observability/) for the
full API.

## Development

<!-- holocron:development -->

| Script               | Command                  |
| -------------------- | ------------------------ |
| `pnpm build`         | `tsdown`                 |
| `pnpm lint`          | `holocron run lint`      |
| `pnpm test`          | `holocron run test`      |
| `pnpm test:coverage` | `vitest run --coverage`  |
| `pnpm typecheck`     | `holocron run typecheck` |
| `pnpm audit`         | `knip`                   |

<!-- /holocron:development -->

## Releases

<!-- holocron:releases -->

Automated via [semantic-release](https://semantic-release.gitbook.io/semantic-release/).
See the [releases page](https://docs.theholocron.dev/observability/releases) and [CHANGELOG.md](./CHANGELOG.md).

<!-- /holocron:releases -->
