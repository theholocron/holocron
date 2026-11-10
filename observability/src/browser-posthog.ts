/**
 * `@theholocron/observability/browser/posthog`: the `AnalyticsSink` for a web
 * page or a React app, over `posthog-js`.
 *
 * Importing this entry loads `posthog-js` and nothing else; the Sentry adapter
 * is its own entry (`/browser/sentry`). `posthog-js` is an optional peer
 * dependency. The caller resolves the project key; this module reads no
 * environment and imports no Node built-in.
 */

export type { PostHogBrowserClient, PostHogBrowserSinkConfig } from "./browser/posthog-browser-sink.js";
export { PostHogBrowserSink } from "./browser/posthog-browser-sink.js";
export type { OnError } from "./shared/safe.js";
