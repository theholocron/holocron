/**
 * `@theholocron/observability/errors` — error tracking + performance spans.
 *
 * `SentrySink` is the Node adapter for the {@link ErrorSink} interface (from
 * `/core`). `@sentry/node` is an optional peer dependency; install it
 * alongside this subpath. The caller resolves the DSN and passes it to
 * `init()` — this module reads no environment.
 */

export type { CommandSpan, ErrorSink } from "./core/sinks.js";
export { NoopErrorSink } from "./core/sinks.js";
export { scrubError, SentrySink } from "./errors/sentry-sink.js";
