/**
 * `@theholocron/observability/browser/sentry`: the `ErrorSink` for a web page
 * or a React app, over `@sentry/browser`.
 *
 * Importing this entry loads `@sentry/browser` and nothing else; the PostHog
 * adapter is its own entry (`/browser/posthog`), so an app that uses only one
 * SDK never has to install the other. `@sentry/browser` is an optional peer
 * dependency. The caller resolves the DSN; this module reads no environment and
 * imports no Node built-in.
 */

export { SentryBrowserSink } from "./browser/sentry-browser-sink.js";
export type { OnError } from "./shared/safe.js";
export type { SentrySdkLike, SentrySinkOptions } from "./shared/sentry-compatible-sink.js";
export { scrubEvent } from "./shared/sentry-compatible-sink.js";
