/**
 * `@theholocron/observability/edge/sentry`: the `ErrorSink` for an edge or
 * worker runtime (Cloudflare Workers, Vercel Edge, Deno), over
 * `@sentry/vercel-edge`.
 *
 * Importing this entry loads `@sentry/vercel-edge` and nothing else.
 * `@sentry/vercel-edge` is an optional peer dependency. The caller resolves the
 * DSN; this module reads no environment and imports no Node built-in.
 */

export { SentryEdgeSink } from "./edge/sentry-edge-sink.js";
export type { OnError } from "./shared/safe.js";
export type { SentrySdkLike, SentrySinkOptions } from "./shared/sentry-compatible-sink.js";
export { scrubEvent } from "./shared/sentry-compatible-sink.js";
