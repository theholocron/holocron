# `@theholocron/observability`

<!-- holocron:description -->

Logging, error tracking, and analytics — one interface, swappable backends.

<!-- /holocron:description -->

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

See the [documentation](https://docs.theholocron.dev/observability/) for the
full API.

## Development

<!-- holocron:development -->

```bash
pnpm install       # install deps
pnpm build         # tsdown → dist/
pnpm test          # vitest
pnpm typecheck     # tsc --noEmit
pnpm lint          # eslint
```

<!-- /holocron:development -->

## Releases

<!-- holocron:releases -->

Releases are automated via [semantic-release](https://semantic-release.gitbook.io) on push to `main`. See [CHANGELOG.md](CHANGELOG.md) for the release history.

<!-- /holocron:releases -->
