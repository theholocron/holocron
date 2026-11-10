/**
 * `@theholocron/observability/edge`: error tracking and analytics for an edge or
 * worker runtime (Cloudflare Workers, Vercel Edge, Deno).
 *
 * `SentryEdgeSink` (`@sentry/vercel-edge`) implements {@link ErrorSink};
 * `PostHogFetchSink` implements {@link AnalyticsSink} with `fetch` alone, so
 * analytics needs no SDK. Only `@sentry/vercel-edge` is an optional peer
 * dependency. The caller resolves the DSN and the project key; this module
 * reads no environment and imports no Node built-in.
 */

export type { AnalyticsSink, ErrorSink } from "./core/sinks.js";
export { NoopAnalyticsSink, NoopErrorSink } from "./core/sinks.js";
export type { FetchLike, PostHogFetchSinkConfig } from "./edge/posthog-fetch-sink.js";
export { PostHogFetchSink } from "./edge/posthog-fetch-sink.js";
export { SentryEdgeSink } from "./edge/sentry-edge-sink.js";
export type { SentrySdkLike, SentrySinkOptions } from "./shared/sentry-compatible-sink.js";
export { scrubEvent } from "./shared/sentry-compatible-sink.js";
