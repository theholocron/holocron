/**
 * `@theholocron/observability/browser`: error tracking and analytics for a web
 * page or a React app.
 *
 * `SentryBrowserSink` (`@sentry/browser`) implements {@link ErrorSink} and
 * `PostHogBrowserSink` (`posthog-js`) implements {@link AnalyticsSink}, both from
 * `/core`; for logging use `ConsoleLogger` from `/logger`. The SDKs are
 * optional peer dependencies: install the ones you import. The caller resolves
 * the DSN and the project key; this module reads no environment and imports no
 * Node built-in.
 */

export type { PostHogBrowserClient, PostHogBrowserSinkConfig } from "./browser/posthog-browser-sink.js";
export { PostHogBrowserSink } from "./browser/posthog-browser-sink.js";
export { SentryBrowserSink } from "./browser/sentry-browser-sink.js";
export type { AnalyticsSink, ErrorSink } from "./core/sinks.js";
export { NoopAnalyticsSink, NoopErrorSink } from "./core/sinks.js";
export type { SentrySdkLike, SentrySinkOptions } from "./shared/sentry-compatible-sink.js";
export { scrubEvent } from "./shared/sentry-compatible-sink.js";
