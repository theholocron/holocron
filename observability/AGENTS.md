<!-- editorconfig-checker-disable-file -->

# observability — agent operating contract

`CLAUDE.md` is a symlink to this file. This folder is `@theholocron/observability` (formerly the archived
`theholocron/observability` repo). It releases on its own version line (tags `observability-v*`). Repo-wide rules are
in the root `AGENTS.md`, including the rule that no other package imports a vendor SDK.

## What it is

Logging, error tracking and analytics behind one stable set of interfaces, so application code never imports a vendor
SDK directly and the backend can be swapped in one file.

## Architecture

One published package, `tsdown` multi-entry, subpath exports:

- **`/core`**: `Logger` / `ErrorSink` / `AnalyticsSink` interfaces, their `Noop*` implementations and the redaction
  helpers. **Zero dependencies**, so it is safe in a browser, edge or React Native bundle. Everything else builds on it.
- **`/logger`**: `createLogger()` (Pino) and a zero-dependency `ConsoleLogger`.
- **`/errors`**: `SentrySink`, the only `@sentry/node` call site.
- **`/analytics`**: `PostHogSink`, the only `posthog-node` call site.
- **`/browser`**: `SentryBrowserSink` (`@sentry/browser`) and `PostHogBrowserSink` (`posthog-js`). No Node built-ins.
- **`/edge`**: `SentryEdgeSink` (`@sentry/vercel-edge`, WinterCG runtimes) and `PostHogFetchSink` (PostHog's HTTP capture
  endpoint over `fetch`, no SDK). No Node built-ins. The Sentry sinks share `shared/sentry-compatible-sink.ts`
  (vendor-free, takes the SDK namespace); every vendor call in `/browser` and `/edge` goes through `safely()`, so a throwing
  SDK never reaches the app.
- **`/testing`**: fakes for testing code that takes these interfaces.

Rules:

- Vendor SDKs (`@sentry/node`, `@sentry/browser`, `@sentry/vercel-edge`, `posthog-node`, `posthog-js`, `pino`, `pino-pretty`, `@axiomhq/pino`) are **optional peer
  dependencies**: a consumer installs only those for the subpaths it imports. Do not make one a dependency, and do not
  import one from `/core`.
- Adapters read no environment and ship no credentials. The caller resolves the DSN / key and passes it in.
