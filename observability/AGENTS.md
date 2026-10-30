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
- **`/testing`**: fakes for testing code that takes these interfaces.

Rules:

- Vendor SDKs (`@sentry/node`, `posthog-node`, `pino`, `pino-pretty`, `@axiomhq/pino`) are **optional peer
  dependencies**: a consumer installs only those for the subpaths it imports. Do not make one a dependency, and do not
  import one from `/core`.
- Adapters read no environment and ship no credentials. The caller resolves the DSN / key and passes it in.
