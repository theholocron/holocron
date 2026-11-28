/**
 * `@theholocron/observability/analytics` — product analytics (usage, adoption,
 * retention).
 *
 * `PostHogSink` is the Node adapter for the {@link AnalyticsSink} interface
 * (from `/core`). `posthog-node` is an optional peer dependency; install it
 * alongside this subpath. The caller resolves the project key + host and
 * passes them to the constructor — this module reads no environment.
 */

export { PostHogSink } from "./analytics/posthog-sink.js";
export type { AnalyticsSink } from "./core/sinks.js";
export { NoopAnalyticsSink } from "./core/sinks.js";
