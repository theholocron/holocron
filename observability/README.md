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

See the [documentation](https://docs.theholocron.dev/holocron/observability/) for the API.

<!-- /holocron:installation -->

## Peer dependencies

Add the peers for the subpaths you use — they are all optional:

| Subpath                                      | Peers                                                                |
| -------------------------------------------- | -------------------------------------------------------------------- |
| `@theholocron/observability/core`            | none                                                                 |
| `@theholocron/observability/logger`          | `pino`, `pino-pretty`, `@axiomhq/pino`                               |
| `@theholocron/observability/errors`          | `@sentry/node`                                                       |
| `@theholocron/observability/analytics`       | `posthog-node`                                                       |
| `@theholocron/observability/browser/sentry`  | `@sentry/browser`                                                    |
| `@theholocron/observability/browser/posthog` | `posthog-js`                                                         |
| `@theholocron/observability/edge/sentry`     | `@sentry/vercel-edge`                                                |
| `@theholocron/observability/edge/posthog`    | none (`fetch`)                                                       |
| `@theholocron/observability/react-native`    | `@sentry/react-native`, `posthog-react-native` (injected by the app) |
| `@theholocron/observability/testing`         | `vitest`                                                             |

## Examples

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

### In a browser, edge or React Native app

Import `@theholocron/observability/core` (zero dependencies) and use
`ConsoleLogger` from `/logger` in place of Pino. Then pick the adapters for the
runtime. None of these entry points imports a Node built-in.

```typescript
// Browser or React app
import { PostHogBrowserSink } from "@theholocron/observability/browser/posthog";
import { SentryBrowserSink } from "@theholocron/observability/browser/sentry";

const errors = new SentryBrowserSink();
errors.init({ dsn, release: "web@1.0.0", environment: "production", tags: {} });
const analytics = new PostHogBrowserSink({ key, host: "https://us.i.posthog.com" });

// Edge runtime or worker: Sentry's edge SDK, and PostHog over fetch (no SDK)
import { PostHogFetchSink } from "@theholocron/observability/edge/posthog";
import { SentryEdgeSink } from "@theholocron/observability/edge/sentry";

const edgeAnalytics = new PostHogFetchSink({ key, host, waitUntil: (p) => ctx.waitUntil(p) });

// React Native: the app imports the SDKs (they need the react-native runtime) and passes them in
import * as Sentry from "@sentry/react-native";
import PostHog from "posthog-react-native";
import { PostHogReactNativeSink, SentryReactNativeSink } from "@theholocron/observability/react-native";

const rnErrors = new SentryReactNativeSink({ sdk: Sentry });
const rnAnalytics = new PostHogReactNativeSink({ client: new PostHog(key, { host }) });
```

Each adapter is its own subpath, so importing one never resolves another's SDK.
Every adapter takes its SDK, client or `fetch` as an option, so tests pass a
fake, scrubs token-shaped strings from what it sends, and never throws into the
app when the SDK does (pass `onError` to see those errors). The browser PostHog
sink captures nothing by itself (autocapture and pageviews are off) and
identifies the person you name before it records for them. An empty DSN or key
is the caller's signal to install `NoopErrorSink` / `NoopAnalyticsSink`
instead. See the docs site for the full rules.

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

For a non-vitest context that needs a `Logger` with no output (an
example, a non-test opt-out path), use `NoopLogger` from `/core` — it
discards everything, `child()` returns itself.

See the [documentation](https://docs.theholocron.dev/holocron/observability/) for the
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
See [CHANGELOG.md](./CHANGELOG.md).

<!-- /holocron:releases -->
